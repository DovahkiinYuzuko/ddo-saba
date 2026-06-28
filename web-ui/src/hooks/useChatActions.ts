import type { MutableRefObject } from 'react';
import type { Message, ChatSession, DdoSettings, DdoParameters, MessageMetrics, QueueJob, LocaleStrings } from '../types';
import { broadcastMessage, broadcastModel } from '../api/broadcast';
import { fetchQueue, joinQueue, cancelQueue, completeQueue } from '../api/queue';
import { formatTimestamp } from '../utils/format';
import { logUsage } from '../api/usage';

export interface UseChatActionsProps {
  chats: ChatSession[];
  activeChatId: string | null;
  settings: DdoSettings;
  activeModel: string;
  systemPrompt: string;
  pendingMessage: string;
  parameters: DdoParameters;
  thinkMode: boolean;
  numPredictEnabled: boolean;
  myJobId: string | null;
  inputText: string;
  isGeneratingRef: MutableRefObject<boolean>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  t: LocaleStrings;

  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setModelLoadError: (err: string) => void;
  setPendingMessage: (msg: string) => void;
  setMyJobId: (id: string | null) => void;
  setJobQueue: (q: QueueJob[]) => void;
  setInputText: (text: string) => void;
  setContextUsed: (used: number) => void;
  updateLastPolledMsgId: (id: string) => void;
  startGenerate: () => void;
  completeGenerate: () => void;
  abortGenerate: () => void;
}

export function useChatActions({
  chats,
  activeChatId,
  settings,
  activeModel,
  systemPrompt,
  pendingMessage,
  parameters,
  thinkMode,
  numPredictEnabled,
  myJobId,
  inputText,
  isGeneratingRef,
  abortControllerRef,
  t,

  setChats,
  setModelLoadError,
  setPendingMessage,
  setMyJobId,
  setJobQueue,
  setInputText,
  setContextUsed,
  updateLastPolledMsgId,
  startGenerate,
  completeGenerate,
  abortGenerate
}: UseChatActionsProps) {

  const runInferenceStream = async (jobIdToComplete?: string) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    startGenerate();
    setModelLoadError('');
    let isAborted = false;

    if (settings.isSharedMode) {
      void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, activeModel, Date.now(), true, '');
    }

    const targetChat = chats.find(c => c.id === activeChatId);
    if (!targetChat) {
      completeGenerate();
      isGeneratingRef.current = false;
      return;
    }

    const requestMessages = [];
    if (systemPrompt) {
      requestMessages.push({ role: 'system' as const, content: systemPrompt });
    }

    if (settings.isSharedMode && pendingMessage) {
      const nowStr = formatTimestamp(new Date());
      const userMsgId = Date.now().toString() + "_user";
      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content: pendingMessage,
        sender: settings.username,
        timestamp: nowStr
      };

      const mergedMessages = [...targetChat.messages, userMsg];
      mergedMessages.forEach(m => {
        requestMessages.push({ role: m.role, content: m.content });
      });

      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return { ...c, messages: [...c.messages, userMsg] };
        }
        return c;
      }));

      try {
        const result = await broadcastMessage(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          settings.username,
          'user',
          pendingMessage,
          userMsgId
        );
        if (result && result.id) {
          updateLastPolledMsgId(result.id);
        }
      } catch (e) {
        console.error("Failed to broadcast user message on start", e);
      }
    } else {
      targetChat.messages.forEach(m => {
        requestMessages.push({ role: m.role, content: m.content });
      });
    }

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (settings.accessToken) {
      headers['X-DDO-Token'] = settings.accessToken;
    }

    abortControllerRef.current = new AbortController();

    const startTime = performance.now();
    let tokenCount = 0;

    try {
      const optionsPayload: Record<string, unknown> = { ...parameters };
      if (!numPredictEnabled) {
        delete optionsPayload.num_predict;
      }

      let res: Response | undefined = undefined;
      const retries = 3;
      const delay = 1000;

      for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
          const fetchRes = await fetch(`${settings.connectionUrl}/api/chat`, {
            method: 'POST',
            headers,
            signal: abortControllerRef.current.signal,
            body: JSON.stringify({
              model: activeModel,
              messages: requestMessages,
              options: optionsPayload,
              think: thinkMode,
              stream: true
            })
          });

          res = fetchRes;

          if (fetchRes.status === 503 && attempt <= retries) {
            console.log(`Received 503 Service Unavailable, retrying in ${delay}ms... (Attempt ${attempt}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          break;
        } catch (err) {
          if (attempt <= retries) {
            console.log(`Fetch failed, retrying in ${delay}ms... (Attempt ${attempt}/${retries})`, err);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }
      }

      if (!res) {
        throw new Error("Failed to fetch response from Ollama server.");
      }

      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }

      const assistantMsgId = Date.now().toString() + "_ai";
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return {
            ...c,
            messages: [...c.messages, { 
              id: assistantMsgId, 
              role: 'assistant', 
              content: '', 
              sender: activeModel,
              timestamp: formatTimestamp(new Date())
            }]
          };
        }
        return c;
      }));

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let thinkStartTime = 0;
      let thinkEndTime = 0;
      let isThinkingState = false;
      let hasThoughtEndedState = false;

      let lastBroadcastTime = Date.now();

      let streamBuffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamBuffer += chunk;
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              
              if (!thinkStartTime) {
                thinkStartTime = performance.now();
              }

              if (parsed.message?.thinking) {
                if (!isThinkingState) {
                  isThinkingState = true;
                  accumulatedContent += '<think>\n';
                }
                accumulatedContent += parsed.message.thinking;
                tokenCount++;
              } else if (parsed.message?.content) {
                if (isThinkingState && !hasThoughtEndedState) {
                  accumulatedContent += '\n</think>\n';
                  hasThoughtEndedState = true;
                  thinkEndTime = performance.now();
                }
                accumulatedContent += parsed.message.content;
                tokenCount++;
              }

              if (accumulatedContent) {
                setChats(prev => prev.map(c => {
                  if (c.id === activeChatId) {
                    return {
                      ...c,
                      messages: c.messages.map(m => {
                        if (m.id === assistantMsgId) {
                          return { ...m, content: accumulatedContent };
                        }
                        return m;
                      })
                    };
                  }
                  return c;
                }));
              }

              const nowMillis = Date.now();
              if (settings.isSharedMode && accumulatedContent && nowMillis - lastBroadcastTime > 600) {
                lastBroadcastTime = nowMillis;
                void broadcastModel(
                  settings.connectionUrl,
                  settings.accessToken,
                  settings.username,
                  activeModel,
                  nowMillis,
                  true,
                  accumulatedContent
                );
              }

              if (parsed.done) {
                if (isThinkingState && !hasThoughtEndedState) {
                  accumulatedContent += '\n</think>\n';
                  hasThoughtEndedState = true;
                  thinkEndTime = performance.now();
                }
                const totalDurationSec = parsed.total_duration ? (parsed.total_duration / 1e9) : 0;
                const evalDurationSec = parsed.eval_duration ? (parsed.eval_duration / 1e9) : 0;
                const tokensPerSec = (parsed.eval_count && evalDurationSec > 0) ? (parsed.eval_count / evalDurationSec) : 0;
                const thinkDurationSec = (thinkStartTime > 0 && thinkEndTime > 0) ? ((thinkEndTime - thinkStartTime) / 1000) : 0;

                const metrics: MessageMetrics = {
                  totalDurationSec: parseFloat(totalDurationSec.toFixed(2)),
                  promptTokens: parsed.prompt_eval_count || 0,
                  evalTokens: parsed.eval_count || 0,
                  tokensPerSec: parseFloat(tokensPerSec.toFixed(1)),
                  thinkDurationSec: parseFloat(thinkDurationSec.toFixed(2))
                };

                setContextUsed((parsed.prompt_eval_count || 0) + (parsed.eval_count || 0));

                setChats(prev => prev.map(c => {
                  if (c.id === activeChatId) {
                    return {
                      ...c,
                      messages: c.messages.map(m => {
                        if (m.id === assistantMsgId) {
                          return { ...m, metrics, content: accumulatedContent };
                        }
                        return m;
                      })
                    };
                  }
                  return c;
                }));

                void logUsage(settings.connectionUrl, settings.accessToken, {
                  model: activeModel,
                  promptTokens: parsed.prompt_eval_count || 0,
                  completionTokens: parsed.eval_count || 0,
                  totalDurationSec: parseFloat(totalDurationSec.toFixed(2)),
                  loadDurationSec: parsed.load_duration ? parseFloat((parsed.load_duration / 1e9).toFixed(2)) : 0,
                  evalDurationSec: parseFloat(evalDurationSec.toFixed(2)),
                  status: 'success'
                });
              }
            } catch {
              // Ignore partial JSON line parse errors
            }
          }
        }

        // Parse any remaining data in streamBuffer on stream end
        if (streamBuffer.trim()) {
          try {
            const parsed = JSON.parse(streamBuffer);
            if (parsed.message?.thinking) {
              if (!isThinkingState) {
                isThinkingState = true;
                accumulatedContent += '<think>\n';
              }
              accumulatedContent += parsed.message.thinking;
            } else if (parsed.message?.content) {
              if (isThinkingState && !hasThoughtEndedState) {
                accumulatedContent += '\n</think>\n';
                hasThoughtEndedState = true;
              }
              accumulatedContent += parsed.message.content;
            }

            if (accumulatedContent) {
              setChats(prev => prev.map(c => {
                if (c.id === activeChatId) {
                  return {
                    ...c,
                    messages: c.messages.map(m => {
                      if (m.id === assistantMsgId) {
                        return { ...m, content: accumulatedContent };
                      }
                      return m;
                    })
                  };
                }
                return c;
              }));
            }
          } catch {
            // Ignore
          }
        }
      }

      if (settings.isSharedMode && accumulatedContent) {
        try {
          const result = await broadcastMessage(
            settings.connectionUrl,
            settings.accessToken,
            activeModel,
            settings.username,
            'assistant',
            accumulatedContent,
            assistantMsgId
          );
          if (result && result.id) {
            updateLastPolledMsgId(result.id);
          }
        } catch (e) {
          console.error("Failed to broadcast assistant message", e);
        }
      }

    } catch (e) {
      abortGenerate();
      const err = e as Error;
      const elapsedSec = parseFloat(((performance.now() - startTime) / 1000).toFixed(2));
      const isAbort = err.name === 'AbortError';
      if (isAbort) {
        isAborted = true;
      }

      void logUsage(settings.connectionUrl, settings.accessToken, {
        model: activeModel,
        promptTokens: 0,
        completionTokens: tokenCount,
        totalDurationSec: elapsedSec,
        loadDurationSec: 0,
        evalDurationSec: elapsedSec,
        status: isAbort ? 'cancelled' : 'error'
      });

      if (isAbort) {
        console.log("Inference stream aborted.");
      } else {
        console.error("Inference request failed.", e);
        let displayError = err.message;
        if (err.message.includes('status: 400')) {
          displayError = t.error400;
        } else if (err.message.includes('status: 403')) {
          displayError = t.error403;
        } else if (err.message.includes('status: 404')) {
          displayError = t.error404;
        } else if (err.message.includes('status: 503')) {
          displayError = t.error503;
        } else {
          displayError = `${t.errorGeneric}${err.message}`;
        }

        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            return {
              ...c,
              messages: [...c.messages, { 
                role: 'system', 
                content: displayError,
                timestamp: formatTimestamp(new Date())
              }]
            };
          }
          return c;
        }));
      }
    } finally {
      if (settings.isSharedMode) {
        void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, activeModel, Date.now(), false, '');
      }

      // Clear the local job ID immediately to prevent re-triggering inference
      const jobId = jobIdToComplete;
      if (settings.isSharedMode && jobId) {
        setMyJobId(null);
        setPendingMessage('');
      }

      completeGenerate();
      isGeneratingRef.current = false;
      abortControllerRef.current = null;

      if (settings.isSharedMode && jobId) {
        try {
          if (isAborted) {
            await cancelQueue(settings.connectionUrl, settings.accessToken, jobId);
          } else {
            await completeQueue(settings.connectionUrl, settings.accessToken, jobId);
          }
          const q = await fetchQueue(settings.connectionUrl, settings.accessToken);
          setJobQueue(q);
        } catch (err) {
          console.error("Failed to update queue job in finally block", err);
        }
      }
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeChatId || !activeModel || isGeneratingRef.current || myJobId) return;

    const userMessageContent = inputText;

    if (settings.isSharedMode) {
      const jobId = "job_" + Date.now().toString() + "_" + Math.floor(Math.random() * 1000);

      try {
        await joinQueue(settings.connectionUrl, settings.accessToken, jobId, settings.username);

        setInputText('');
        setPendingMessage(userMessageContent);
        setMyJobId(jobId);

        const q = await fetchQueue(settings.connectionUrl, settings.accessToken);
        setJobQueue(q);
      } catch (err) {
        console.error("Failed to join queue", err);
      }
    } else {
      setInputText('');

      const nowStr = formatTimestamp(new Date());
      const userMsgId = Date.now().toString() + "_user";

      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content: userMessageContent,
        sender: settings.username,
        timestamp: nowStr
      };

      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return { ...c, messages: [...c.messages, userMsg] };
        }
        return c;
      }));

      void runInferenceStream();
    }
  };

  const handleCancelQueue = async () => {
    if (!myJobId || !settings.isSharedMode) return;
    const targetJobId = myJobId;
    setMyJobId(null);
    setPendingMessage('');
    
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        const lastMsg = c.messages[c.messages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && lastMsg.sender === settings.username) {
          return {
            ...c,
            messages: c.messages.slice(0, -1)
          };
        }
      }
      return c;
    }));

    try {
      await cancelQueue(settings.connectionUrl, settings.accessToken, targetJobId);
      const q = await fetchQueue(settings.connectionUrl, settings.accessToken);
      setJobQueue(q);
    } catch (err) {
      console.error("Failed to cancel queue job", err);
    }
  };

  const stopGeneration = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return {
    runInferenceStream,
    sendMessage,
    handleCancelQueue,
    stopGeneration
  };
}
