import type { MutableRefObject } from 'react';
import type { Message, ChatSession, DdoSettings, DdoParameters, MessageMetrics, QueueJob, LocaleStrings } from '../types';
import { broadcastMessage, broadcastModel } from '../api/broadcast';
import { fetchQueue, joinQueue, cancelQueue, completeQueue } from '../api/queue';
import { formatTimestamp } from '../utils/format';

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
  setIsGenerating: (isGen: boolean) => void;
  setModelLoadError: (err: string) => void;
  setPendingMessage: (msg: string) => void;
  setMyJobId: (id: string | null) => void;
  setJobQueue: (q: QueueJob[]) => void;
  setInputText: (text: string) => void;
  setContextUsed: (used: number) => void;
  updateLastPolledMsgId: (id: string) => void;
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
  setIsGenerating,
  setModelLoadError,
  setPendingMessage,
  setMyJobId,
  setJobQueue,
  setInputText,
  setContextUsed,
  updateLastPolledMsgId
}: UseChatActionsProps) {

  const runInferenceStream = async (jobIdToComplete?: string) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setModelLoadError('');

    if (settings.isSharedMode) {
      void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, activeModel, Date.now(), true, '');
    }

    const targetChat = chats.find(c => c.id === activeChatId);
    if (!targetChat) {
      setIsGenerating(false);
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
        await broadcastMessage(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          settings.username,
          'user',
          pendingMessage
        );
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

    try {
      const optionsPayload: Record<string, unknown> = { ...parameters };
      if (!numPredictEnabled) {
        delete optionsPayload.num_predict;
      }

      let res: Response | undefined = undefined;
      let retries = 3;
      let delay = 1000;

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

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

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
              } else if (parsed.message?.content) {
                if (isThinkingState && !hasThoughtEndedState) {
                  accumulatedContent += '\n</think>\n';
                  hasThoughtEndedState = true;
                  thinkEndTime = performance.now();
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
              }
            } catch {
              // Ignore partial JSON line parse errors
            }
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
            accumulatedContent
          );
          if (result && result.id) {
            updateLastPolledMsgId(result.id);
          }
        } catch (e) {
          console.error("Failed to broadcast assistant message", e);
        }
      }

    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') {
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
      setIsGenerating(false);
      isGeneratingRef.current = false;
      abortControllerRef.current = null;
      if (settings.isSharedMode) {
        void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, activeModel, Date.now(), false, '');
        if (jobIdToComplete) {
          try {
            await completeQueue(settings.connectionUrl, settings.accessToken, jobIdToComplete);
            setMyJobId(null);
            setPendingMessage('');
            const q = await fetchQueue(settings.connectionUrl, settings.accessToken);
            setJobQueue(q);
          } catch (err) {
            console.error("Failed to complete queue job", err);
          }
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
    if (myJobId && settings.isSharedMode) {
      const targetJobId = myJobId;
      setMyJobId(null);
      setPendingMessage('');
      try {
        await cancelQueue(settings.connectionUrl, settings.accessToken, targetJobId);
        const q = await fetchQueue(settings.connectionUrl, settings.accessToken);
        setJobQueue(q);
      } catch (err) {
        console.error("Failed to cancel running job on stop", err);
      }
    }
  };

  return {
    runInferenceStream,
    sendMessage,
    handleCancelQueue,
    stopGeneration
  };
}
