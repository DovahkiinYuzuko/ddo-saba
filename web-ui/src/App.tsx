import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatSession } from './types';
import { useChatMachineState } from './hooks/useChatMachineState';
import { 
  loadModelOnSelection as apiLoadModelOnSelection, 
  fetchModels, 
  fetchPs, 
  keepAliveModel, 
  unloadModel as apiUnloadModel 
} from './api/ollama';
import { 
  pollMessage, 
  broadcastMessage,
  fetchHistory,
  broadcastModel,
  pollModel
} from './api/broadcast';
import { fetchQueue } from './api/queue';
import SettingsModal from './components/SettingsModal';
import ParameterPanel from './components/ParameterPanel';
import ChatMessages from './components/ChatMessages';
import { useChatActions } from './hooks/useChatActions';
import { useFileIO } from './hooks/useFileIO';
import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import ChatInputArea from './components/ChatInputArea';
import SyncModal from './components/SyncModal';
import ModelErrorModal from './components/ModelErrorModal';
import { formatTimestamp } from './utils/format';
import { locales } from './i18n';





export default function App() {
  const [lang] = useState<'en' | 'ja'>(
    navigator.language.startsWith('ja') ? 'ja' : 'en'
  );
  const t = locales[lang];
  const [isInitialized, setIsInitialized] = useState(false);

  // --- XState Machine Integration ---
  const { state, send, adapters } = useChatMachineState();

  const {
    setIsSidebarOpen,
    setIsParamsOpen,
    setPresetName,
    setInputText,
    setShowSettingsModal,
    setNumPredictEnabled,
    setIsModelLoading,
    setModelLoadError,
    setCollapseThinking,
    setActiveModel,
    setSystemPrompt,
    setParameters,
    setThinkMode,
    setSyncRequestPending,
    setIsRemoteGenerating,
    setRemoteGeneratingText,
    setPsInfo,
    setSendOnEnter,
    setContextUsed,
    setLastModelChangeTime,
    setLastModelSender,
    setJobQueue,
    setMyJobId,
    setPendingMessage,
    setActiveUserCount,
    setChats,
    setActiveChatId,
    setSettings,
    setModels,
    setExpandedThinking,
    startGenerate,
    completeGenerate,
    abortGenerate,
    peerStartGenerate,
    peerCompleteGenerate
  } = adapters;

  const { 
    isSidebarOpen, 
    isParamsOpen, 
    presetName, 
    inputText, 
    showSettingsModal,
    numPredictEnabled,
    isModelLoading,
    modelLoadError,
    collapseThinking,
    activeModel,
    systemPrompt,
    parameters,
    thinkMode,
    syncRequestPending,
    isRemoteGenerating,
    remoteGeneratingText,
    psInfo,
    isGenerating,
    sendOnEnter,
    contextUsed,
    lastModelChangeTime,
    lastModelSender,
    jobQueue,
    myJobId,
    pendingMessage,
    activeUserCount,
    chats,
    activeChatId,
    settings,
    models,
    expandedThinking
  } = state.context;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token') || params.get('accessToken') || '';
    const isSharedModeFromUrl = params.get('sharedMode') === 'true' || params.get('isSharedMode') === 'true';
    
    setSettings(prev => ({
      ...prev,
      connectionUrl: window.location.origin.includes('localhost:3000')
        ? 'http://localhost:8088'
        : window.location.origin,
      accessToken: tokenFromUrl || prev.accessToken,
      isSharedMode: isSharedModeFromUrl || prev.isSharedMode,
      username: 'Guest_' + Math.floor(Math.random() * 1000)
    }));
    setIsInitialized(true);
  }, []); // Run once on mount

  const handleThinkingToggle = (msgKey: string, isOpen: boolean) => {

    setExpandedThinking(prev => {
      if (prev[msgKey] === isOpen) return prev;
      return { ...prev, [msgKey]: isOpen };
    });
  };

  const isRemoteGeneratingRef = useRef(isRemoteGenerating);
  useEffect(() => {
    isRemoteGeneratingRef.current = isRemoteGenerating;
  }, [isRemoteGenerating]);

  const isGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIsSharedModeRef = useRef<boolean>(settings.isSharedMode);

  const handleActiveCount = useCallback((count: number) => {
    setActiveUserCount(count);
  }, []);

  // Upload all local chats when entering Shared Room Mode
  useEffect(() => {
    const wasShared = prevIsSharedModeRef.current;
    prevIsSharedModeRef.current = settings.isSharedMode;

    if (!wasShared && settings.isSharedMode && chats.length > 0) {
      const uploadLocalChats = async () => {
        for (const chat of chats) {
          try {
            // 1. Broadcast tab creation
            await broadcastMessage(
              settings.connectionUrl,
              settings.accessToken,
              settings.username,
              settings.username,
              'system',
              `tab_create:${chat.id}:${chat.title}`
            );

            // 2. Broadcast messages within the tab sequentially
            for (const msg of chat.messages) {
              await broadcastMessage(
                settings.connectionUrl,
                settings.accessToken,
                msg.sender || settings.username,
                settings.username,
                msg.role,
                msg.content
              );
            }
          } catch (e) {
            console.error("Failed to upload local chat during share activation", e);
          }
        }
      };
      void uploadLocalChats();
    }
  }, [settings.isSharedMode, chats, settings.connectionUrl, settings.accessToken, settings.username]);

  // Trigger inference when it is our turn in the queue
  useEffect(() => {
    if (!settings.isSharedMode || !myJobId || jobQueue.length === 0) return;
    
    const firstJob = jobQueue[0];
    if (firstJob.id === myJobId && firstJob.status === 'running' && !isGeneratingRef.current) {
      // It is our turn! Run the inference.
      void runInferenceStream(myJobId);
    }
  }, [jobQueue, myJobId, pendingMessage, settings.isSharedMode]);

  // Separate model fallback logic
  useEffect(() => {
    if (activeModel && models.length > 0) {
      const modelNames = models.map(m => m.name);
      if (!modelNames.includes(activeModel)) {
        setTimeout(() => {
          setActiveModel(models[0].name);
          setLastModelChangeTime(Date.now());
        }, 0);
      }
    }
  }, [models, activeModel]);


  const broadcastSettings = async () => {
    if (!settings.isSharedMode) return;
    try {
      const syncPayload = {
        activeModel,
        systemPrompt,
        parameters,
        thinkMode,
        numPredictEnabled
      };
      await broadcastMessage(
        settings.connectionUrl,
        settings.accessToken,
        settings.username,
        settings.username,
        'system',
        `sync_request:${settings.username}:${JSON.stringify(syncPayload)}`
      );
    } catch (e) {
      console.error("Failed to broadcast settings sync request", e);
    }
  };

  const handleAcceptSyncRequest = () => {
    if (!syncRequestPending) return;
    const { 
      activeModel: remoteModel, 
      systemPrompt: remotePrompt, 
      parameters: remoteParams, 
      thinkMode: remoteThink,
      numPredictEnabled: remoteNumPredict
    } = syncRequestPending;
    
    if (remoteModel !== undefined) {
      setActiveModel(remoteModel);
      if (remoteModel && remoteModel !== activeModel) {
        void loadModelOnSelection(remoteModel);
      }
    }
    if (remotePrompt !== undefined) setSystemPrompt(remotePrompt);
    if (remoteParams !== undefined) setParameters(prev => ({ ...prev, ...remoteParams }));
    if (remoteThink !== undefined) setThinkMode(remoteThink);
    if (remoteNumPredict !== undefined) setNumPredictEnabled(remoteNumPredict);
    
    setSyncRequestPending(null);
  };

  const loadModelOnSelection = async (modelName: string) => {
    if (!modelName) {
      setModelLoadError('');
      return;
    }
    setIsModelLoading(true);
    setModelLoadError('');
    try {
      await apiLoadModelOnSelection(modelName, settings, parameters, numPredictEnabled);
    } catch (e) {
      console.error("Failed to pre-load model into VRAM", e);
      setModelLoadError(e instanceof Error ? e.message : "Failed to load model");
      setActiveModel('');
    } finally {
      setIsModelLoading(false);
    }
  };

  // Active session background keep-alive refresh
  useEffect(() => {
    if (!activeModel || activeModel === "") return;
    const interval = setInterval(async () => {
      if (isGeneratingRef.current) return;
      // Only keep alive if the activeModel matches the model currently running in VRAM (psInfo).
      // This prevents unselected/cleared models from being automatically reloaded on other clients.
      if (!psInfo || psInfo.name !== activeModel) return;
      try {
        await keepAliveModel(activeModel, settings.connectionUrl, settings.accessToken);
      } catch (e) {
        console.error("Keep alive refresh failed", e);
      }
    }, 240000); // 4 minutes
    return () => clearInterval(interval);
  }, [activeModel, settings.connectionUrl, settings.accessToken, psInfo]);

  // Automatically unload model when the web UI tab is closed or reloaded
  useEffect(() => {
    const handleTabClose = () => {
      const isLastUser = !settings.isSharedMode || activeUserCount <= 1;
      if (!isLastUser || !activeModel || activeModel === "") return;
      
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (settings.accessToken) {
        headers['X-DDO-Token'] = settings.accessToken;
      }
      if (settings.username) {
        headers['X-DDO-Username'] = settings.username;
      }
      
      // Use fetch with keepalive: true to ensure the request completes after tab close
      void fetch(`${settings.connectionUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: activeModel,
          messages: [],
          keep_alive: '0s'
        }),
        keepalive: true
      });
    };

    window.addEventListener('beforeunload', handleTabClose);
    return () => {
      window.removeEventListener('beforeunload', handleTabClose);
    };
  }, [activeModel, settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username, activeUserCount]);


  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync scroll on new messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chats, activeChatId]);

  const addNewTab = useCallback((isRemote = false, remoteId?: string, remoteTitle?: string) => {
    const newId = remoteId || Date.now().toString();
    const title = remoteTitle || `${t.newChat} ${chats.length + 1}`;
    const newChat: ChatSession = {
      id: newId,
      title: title,
      messages: []
    };
    setChats(prev => {
      if (prev.some(c => c.id === newId)) return prev;
      return [...prev, newChat];
    });
    setActiveChatId(newId);

    if (settings.isSharedMode && !isRemote) {
      void broadcastMessage(
        settings.connectionUrl,
        settings.accessToken,
        settings.username,
        settings.username,
        'system',
        `tab_create:${newId}:${title}`
      ).then(result => {
        if (result && result.id) {
          send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: result.id } });
        }
      }).catch(e => console.error("Failed to broadcast tab_create", e));
    }
  }, [t.newChat, chats.length, settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username]);

  // Create default tab if none exists (Private Mode only)
  useEffect(() => {
    if (isInitialized && !settings.isSharedMode && chats.length === 0) {
      const timer = setTimeout(() => {
        addNewTab(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, chats.length, addNewTab, settings.isSharedMode]);

  const deleteTab = useCallback((id: string, e?: React.MouseEvent, isRemote = false) => {
    if (e) e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    setActiveChatId(prevActiveId => {
      if (prevActiveId === id) {
        const remaining = chats.filter(c => c.id !== id);
        const nextActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        if (settings.isSharedMode && !isRemote && nextActiveId) {
          void broadcastMessage(
            settings.connectionUrl,
            settings.accessToken,
            settings.username,
            settings.username,
            'system',
            `tab_switch:${nextActiveId}`
          ).then(result => {
            if (result && result.id) {
              send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: result.id } });
            }
          }).catch(e => console.error("Failed to broadcast tab_switch", e));
        }
        return nextActiveId;
      }
      return prevActiveId;
    });

    if (settings.isSharedMode && !isRemote) {
      void broadcastMessage(
        settings.connectionUrl,
        settings.accessToken,
        settings.username,
        settings.username,
        'system',
        `tab_delete:${id}`
      ).then(result => {
        if (result && result.id) {
          send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: result.id } });
        }
      }).catch(e => console.error("Failed to broadcast tab_delete", e));
    }
  }, [chats, settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username]);

  // Initial tags/ps fetch and interval polling
  const fetchModelsAndPs = useCallback(async () => {
    try {
      const fetchedModels = await fetchModels(settings.connectionUrl, settings.accessToken);
      setModels(prev => {
        if (JSON.stringify(prev) === JSON.stringify(fetchedModels)) return prev;
        return fetchedModels;
      });

      const fetchedPs = await fetchPs(settings.connectionUrl, settings.accessToken);
      setPsInfo(fetchedPs);

      // Automatically clear active model selection if it was unloaded from VRAM (psInfo is null)
      // Bypassed if local or remote generation is active to prevent VRAM load fluctuation resets.
      // Implement 15 seconds grace period from lastModelChangeTime to prevent clearing right after load.
      const isGracePeriodOver = (Date.now() - lastModelChangeTime) > 15000;
      if (!fetchedPs && activeModel && !isModelLoading && isGracePeriodOver && !isGeneratingRef.current && !isRemoteGeneratingRef.current) {
        setActiveModel('');
        setLastModelSender(settings.username);
        const now = Date.now();
        setLastModelChangeTime(now);
        if (settings.isSharedMode) {
          void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, '', now);
        }
      }
    } catch (e) {
      console.error("Failed to connect to Ollama Server status endpoints.", e);
    }
  }, [settings.connectionUrl, settings.accessToken, activeModel, isModelLoading, lastModelSender, settings.username, lastModelChangeTime]);

  useEffect(() => {
    if (!isInitialized || !settings.accessToken) return;
    const timer = setTimeout(() => {
      void fetchModelsAndPs();
    }, 0);
    const interval = setInterval(() => {
      void fetchModelsAndPs();
    }, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchModelsAndPs, isInitialized, settings.accessToken]);

  const lastPolledMsgIdRef = useRef(state.context.lastPolledMsgId);
  useEffect(() => {
    lastPolledMsgIdRef.current = state.context.lastPolledMsgId;
  }, [state.context.lastPolledMsgId]);

  // Polling for shared room mode
  const startBroadcastPolling = useCallback(async () => {
    try {
      const messages = (await pollMessage(
        settings.connectionUrl,
        settings.accessToken,
        lastPolledMsgIdRef.current,
        settings.username,
        handleActiveCount
      )) as Array<{
        id?: string;
        sender?: string;
        broadcaster?: string;
        role?: 'user' | 'assistant' | 'system';
        content?: string;
        timestamp?: string;
      }>;

      if (!Array.isArray(messages) || messages.length === 0) return;

      for (const data of messages) {
        const isMyMessage = data.sender === settings.username || data.broadcaster === settings.username;
        if (data.id && data.id !== lastPolledMsgIdRef.current) {
          // Update cursor immediately to prevent duplicate processing in the same loop
          lastPolledMsgIdRef.current = data.id;
          send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: data.id } });
          
          if (!isMyMessage) {
            // Handle system sync events
            if (data.role === 'system' && data.content) {
              if (data.content.startsWith('sync_request:')) {
                const parts = data.content.split(':');
                const sender = parts[1];
                const payloadStr = parts.slice(2).join(':');
                if (sender !== settings.username && payloadStr) {
                  try {
                    const payload = JSON.parse(payloadStr);
                    setSyncRequestPending({
                      ...payload,
                      sender
                    });
                  } catch (e) {
                    console.error("Failed to parse settings sync payload", e);
                  }
                }
                continue;
              } else if (data.content.startsWith('tab_create:')) {
                const parts = data.content.split(':');
                const tabId = parts[1];
                const tabTitle = parts.slice(2).join(':');
                if (tabId) {
                  addNewTab(true, tabId, tabTitle);
                }
                continue;
              } else if (data.content.startsWith('tab_delete:')) {
                const tabId = data.content.substring('tab_delete:'.length);
                if (tabId) {
                  deleteTab(tabId, undefined, true);
                }
                continue;
              } else if (data.content.startsWith('tab_switch:')) {
                const tabId = data.content.substring('tab_switch:'.length);
                if (tabId) {
                  setActiveChatId(tabId);
                }
                continue;
              }
            }

            // Append shared message to currently active chat session
            if (activeChatId) {
              setChats(prev => prev.map(c => {
                if (c.id === activeChatId) {
                  if (data.id && c.messages.some(m => m.id === data.id)) {
                    return c;
                  }
                  if (data.role === 'assistant' && fallbackTimerRef.current) {
                    clearTimeout(fallbackTimerRef.current);
                    fallbackTimerRef.current = null;
                    setRemoteGeneratingText('');
                  }
                  return {
                    ...c,
                    messages: [...c.messages, {
                      id: data.id,
                      role: data.role || 'user',
                      content: data.content || '',
                      sender: data.sender,
                      broadcaster: data.broadcaster,
                      timestamp: data.timestamp ? formatTimestamp(data.timestamp) : undefined
                    }]
                  };
                }
                return c;
              }));
            }
          }
        }
      }
    } catch (e) {
      console.error("Broadcasting poll failed", e);
    }
  }, [settings.connectionUrl, settings.accessToken, settings.username, activeChatId, addNewTab, deleteTab, handleActiveCount, send]);

  useEffect(() => {
    if (!isInitialized || !settings.accessToken || !settings.isSharedMode) return;
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (!active) return;
      await startBroadcastPolling();
      if (active) {
        timerId = setTimeout(poll, 1500);
      }
    };

    poll();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isInitialized, settings.accessToken, settings.isSharedMode, startBroadcastPolling]);

  // Polling for queue status in shared room mode
  useEffect(() => {
    if (!isInitialized || !settings.accessToken || !settings.isSharedMode) return;
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const pollQueue = async () => {
      if (!active) return;
      try {
        const q = await fetchQueue(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          handleActiveCount
        );
        if (active) setJobQueue(q);
      } catch (e) {
        console.error("Queue poll failed", e);
      }
      if (active) {
        timerId = setTimeout(pollQueue, 1500);
      }
    };

    pollQueue();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isInitialized, settings.accessToken, settings.isSharedMode, settings.connectionUrl, settings.username, handleActiveCount]);

  // Fetch initial history when Shared Room mode is enabled
  useEffect(() => {
    if (!settings.isSharedMode) return;
    
    const syncHistory = async () => {
      try {
        const historyData = await fetchHistory(settings.connectionUrl, settings.accessToken) as {
          id?: string;
          sender?: string;
          broadcaster?: string;
          role?: 'user' | 'assistant' | 'system';
          content?: string;
          timestamp?: string;
        }[];
        
        if (historyData && historyData.length > 0) {
          let currentChats: ChatSession[] = [];
          let currentActiveChatId: string | null = null;

          historyData.forEach(h => {
            if (h.role === 'system' && h.content) {
              if (h.content.startsWith('tab_create:')) {
                const parts = h.content.split(':');
                const tabId = parts[1];
                const tabTitle = parts.slice(2).join(':');
                if (tabId && !currentChats.some(c => c.id === tabId)) {
                  currentChats.push({
                    id: tabId,
                    title: tabTitle || `Chat`,
                    messages: []
                  });
                }
                currentActiveChatId = tabId;
              } else if (h.content.startsWith('tab_delete:')) {
                const tabId = h.content.substring('tab_delete:'.length);
                currentChats = currentChats.filter(c => c.id !== tabId);
                if (currentActiveChatId === tabId) {
                  currentActiveChatId = currentChats.length > 0 ? currentChats[currentChats.length - 1].id : null;
                }
              } else if (h.content.startsWith('tab_switch:')) {
                const tabId = h.content.substring('tab_switch:'.length);
                if (tabId && currentChats.some(c => c.id === tabId)) {
                  currentActiveChatId = tabId;
                }
              } else {
                if (currentActiveChatId) {
                  currentChats = currentChats.map(c => {
                    if (c.id === currentActiveChatId) {
                      return {
                        ...c,
                        messages: [...c.messages, {
                          id: h.id,
                          role: 'system',
                          content: h.content || '',
                          sender: h.sender,
                          broadcaster: h.broadcaster,
                          timestamp: h.timestamp ? formatTimestamp(h.timestamp) : undefined
                        }]
                      };
                    }
                    return c;
                  });
                }
              }
            } else {
              if (currentActiveChatId) {
                currentChats = currentChats.map(c => {
                  if (c.id === currentActiveChatId) {
                    return {
                      ...c,
                      messages: [...c.messages, {
                        role: h.role || 'user',
                        content: h.content || '',
                        sender: h.sender,
                        broadcaster: h.broadcaster,
                        timestamp: h.timestamp ? formatTimestamp(h.timestamp) : undefined
                      }]
                    };
                  }
                  return c;
                });
              }
            }
          });

          if (currentChats.length > 0) {
            setChats(currentChats);
            if (currentActiveChatId) {
              setActiveChatId(currentActiveChatId);
            }
          }

          // Update last polled message ID to the last one in history to avoid duplicate polling
          const lastMsg = historyData[historyData.length - 1];
          if (lastMsg.id) {
            send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: lastMsg.id } });
          }
        }
      } catch (e) {
        console.error("Failed to sync shared room history", e);
      }
    };
    
    void syncHistory();
  }, [settings.isSharedMode, settings.connectionUrl, settings.accessToken]);

  // Polling for shared model selection and generation status
  useEffect(() => {
    if (!settings.isSharedMode) return;
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    
    const startModelPolling = async () => {
      if (!active) return;
      try {
        const data = await pollModel(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          handleActiveCount
        ) as {
          model?: string;
          sender?: string;
          timestamp?: number;
          isGenerating?: boolean;
          generatingText?: string;
        };

        if (!active) return;

        const wasRemoteGenerating = isRemoteGeneratingRef.current;
        const isNowGenerating = data.isGenerating === true;
        const isFromMe = data.sender === settings.username;

        // 1. Update remote generating state only when NOT from myself
        if (data.isGenerating !== undefined && !isFromMe) {
          if (!wasRemoteGenerating && isNowGenerating) {
            peerStartGenerate();
          } else if (wasRemoteGenerating && !isNowGenerating) {
            peerCompleteGenerate();
          }
          setIsRemoteGenerating(data.isGenerating);
          if (data.generatingText !== undefined) {
            setRemoteGeneratingText(data.generatingText || '');
          }
        }

        // 2. Handle remote model changes (only when from a peer user)
        if (data.sender && data.sender !== settings.username) {
          if (data.model !== undefined && data.model !== activeModel) {
            setActiveModel(data.model);
            setLastModelSender(data.sender);
            setLastModelChangeTime(Date.now());
            if (data.model) {
              void loadModelOnSelection(data.model);
            }
          }
        }

        // 3. Commit final text when remote generation ends (with fallback delay)
        if (wasRemoteGenerating && !isNowGenerating) {
          const textToCommit = data.generatingText || remoteGeneratingText;
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
          }
          if (textToCommit && activeChatId) {
            fallbackTimerRef.current = setTimeout(() => {
              if (!active) return;
              setChats(prev => prev.map(c => {
                if (c.id === activeChatId) {
                  // Avoid duplication (check last 5 messages)
                  const lastMessages = c.messages.slice(-5);
                  const hasDuplicate = lastMessages.some(m => 
                    m.role === 'assistant' && 
                    (m.content === textToCommit || m.content.includes(textToCommit) || textToCommit.includes(m.content))
                  );
                  if (hasDuplicate) return c;
                  return {
                    ...c,
                    messages: [...c.messages, {
                      id: Date.now().toString() + "_remote_ai_fallback",
                      role: 'assistant',
                      content: textToCommit,
                      sender: data.model || activeModel || 'AI',
                      timestamp: formatTimestamp(new Date())
                    }]
                  };
                }
                return c;
              }));
              setRemoteGeneratingText('');
            }, 5000);
          } else {
            setRemoteGeneratingText('');
          }
        }

        // 4. If there is no sender and model status is empty, clear local activeModel
        if (!data.sender && (data.model === undefined || data.model === '')) {
          if (wasRemoteGenerating) {
            setIsRemoteGenerating(false);
            setRemoteGeneratingText('');
          }
          if (activeModel !== '') {
            setActiveModel('');
          }
        }
      } catch (e) {
        console.error("Model poll failed", e);
      }
      if (active) {
        timerId = setTimeout(startModelPolling, 1500);
      }
    };
    
    startModelPolling();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username, activeModel, lastModelChangeTime, handleActiveCount, activeChatId, remoteGeneratingText, peerStartGenerate, peerCompleteGenerate]);

  // Unload model from VRAM by calling API with keep_alive: 0
  const handleUnloadModel = async () => {
    if (!psInfo) return;
    try {
      await apiUnloadModel(psInfo.name, settings.connectionUrl, settings.accessToken);
      setPsInfo(null);
      setActiveModel('');
      setLastModelSender(settings.username);
      const now = Date.now();
      setLastModelChangeTime(now);
      if (settings.isSharedMode) {
        void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, '', now);
      }
      fetchModelsAndPs();
    } catch (e) {
      console.error("Failed to unload model", e);
    }
  };

  // (definitions moved above startBroadcastPolling)

  const {
    runInferenceStream,
    sendMessage,
    handleCancelQueue,
    stopGeneration
  } = useChatActions({
    chats, activeChatId, settings, activeModel, systemPrompt, pendingMessage, parameters, thinkMode, numPredictEnabled, myJobId, inputText, isGeneratingRef, abortControllerRef, t,
    setChats, setModelLoadError, setPendingMessage, setMyJobId, setJobQueue, setInputText, setContextUsed,
    updateLastPolledMsgId: (id) => send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: id } }),
    startGenerate, completeGenerate, abortGenerate
  });

  const {
    exportCassette,
    importCassette,
    exportPreset,
    importPreset,
    handleDragOver,
    handleDropCassette: handleDrop
  } = useFileIO({
    chats, activeChatId, systemPrompt, parameters, thinkMode, presetName, sendOnEnter, numPredictEnabled, collapseThinking,
    setChats, setActiveChatId, setSystemPrompt, setParameters, setThinkMode, setPresetName, setSendOnEnter, setNumPredictEnabled, setCollapseThinking
  });

  const activeChat = chats.find(c => c.id === activeChatId);

  const isEffectivelyLoading = isModelLoading || (activeModel !== '' && (!psInfo || psInfo.name !== activeModel));

  const displayMessages = activeChat ? [...activeChat.messages] : [];
  if (isRemoteGenerating && remoteGeneratingText && activeChat) {
    displayMessages.push({
      id: 'remote_generating_temp',
      role: 'assistant',
      content: remoteGeneratingText,
      sender: activeModel || 'AI',
      timestamp: lang === 'ja' ? '同期中...' : 'Streaming...'
    });
  }

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : ''} ${isParamsOpen ? 'params-open' : ''}`} onDragOver={handleDragOver} onDrop={handleDrop}>
      
      {/* Mobile Overlay to tap-close side drawers */}
      {(isSidebarOpen || isParamsOpen) && (
        <div
          className="mobile-overlay"
          onClick={() => {
            setIsSidebarOpen(false);
            setIsParamsOpen(false);
          }}
        />
      )}

      {/* 1. Left Column: Chat Tab Manager */}
      <Sidebar 
        chats={chats}
        activeChatId={activeChatId}
        isSidebarOpen={isSidebarOpen}
        onAddTab={addNewTab}
        onSwitchTab={setActiveChatId}
        onDeleteTab={deleteTab}
        t={t}
      />

      {/* 2. Middle Column: Main Chat Room */}
      <main className="chat-column">
        <ChatHeader
          activeModel={activeModel}
          models={models}
          psInfo={psInfo}
          isEffectivelyLoading={isEffectivelyLoading}
          onSelectModel={(selected) => {
            setActiveModel(selected);
            setLastModelSender(settings.username);
            const now = Date.now();
            setLastModelChangeTime(now);
            loadModelOnSelection(selected);
            if (settings.isSharedMode) {
              void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, selected, now);
            }
          }}
          onUnloadModel={handleUnloadModel}
          onToggleParams={() => setIsParamsOpen(prev => !prev)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          t={t}
        />

        <ChatMessages 
          ref={messagesContainerRef}
          messages={displayMessages}
          onImportCassette={importCassette}
          expandedThinking={expandedThinking}
          onToggleThinking={handleThinkingToggle}
          collapseThinking={collapseThinking}
          t={t}
        />

        <ChatInputArea 
          inputText={inputText}
          isGenerating={isGenerating}
          isRemoteGenerating={isRemoteGenerating}
          isModelLoading={isModelLoading}
          sendOnEnter={sendOnEnter}
          activeChatId={activeChatId}
          myJobId={myJobId}
          jobQueueLength={jobQueue.length}
          isSharedMode={settings.isSharedMode}
          onChangeInput={setInputText}
          onSend={sendMessage}
          onStop={stopGeneration}
          onCancelQueue={handleCancelQueue}
          t={t}
          lang={lang}
        />
      </main>

      {/* 3. Right Column: Parameters Panel */}
      <ParameterPanel 
        parameters={parameters}
        onChangeParameters={setParameters}
        presetName={presetName}
        onChangePresetName={setPresetName}
        systemPrompt={systemPrompt}
        onChangeSystemPrompt={setSystemPrompt}
        thinkMode={thinkMode}
        onChangeThinkMode={setThinkMode}
        collapseThinking={collapseThinking}
        onChangeCollapseThinking={setCollapseThinking}
        numPredictEnabled={numPredictEnabled}
        onChangeNumPredictEnabled={setNumPredictEnabled}
        psInfo={psInfo}
        contextUsed={contextUsed}
        onExportPreset={exportPreset}
        onImportPreset={importPreset}
        t={t}
        lang={lang}
        isSharedMode={settings.isSharedMode}
        onBroadcastSettings={broadcastSettings}
      />

      {/* 4. Settings Popup / Modal */}
      <SettingsModal 
        show={showSettingsModal}
        settings={settings}
        onChangeSettings={setSettings}
        sendOnEnter={sendOnEnter}
        onChangeSendOnEnter={setSendOnEnter}
        onClose={() => setShowSettingsModal(false)}
        onExportCassette={exportCassette}
        onImportCassette={importCassette}
        t={t}
      />

      {/* 5. Synchronize Request Modal */}
      <SyncModal
        syncRequestPending={syncRequestPending}
        onAccept={handleAcceptSyncRequest}
        onReject={() => setSyncRequestPending(null)}
        lang={lang}
      />

      {/* 6. Model Error Modal */}
      <ModelErrorModal
        modelLoadError={modelLoadError}
        onClose={() => setModelLoadError('')}
        lang={lang}
      />

    </div>
  );
}
