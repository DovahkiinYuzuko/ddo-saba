import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatSession } from './types';
import { useChatMachineState } from './hooks/useChatMachineState';
import { 
  loadModelOnSelection as apiLoadModelOnSelection, 
  keepAliveModel, 
  unloadModel as apiUnloadModel 
} from './api/ollama';
import { 
  broadcastMessage,
  fetchHistory,
  broadcastModel
} from './api/broadcast';
import { useInitializeSettings } from './hooks/useInitializeSettings';
import { useModelSync } from './hooks/useModelSync';
import { useQueueSync } from './hooks/useQueueSync';
import { useBroadcastSync } from './hooks/useBroadcastSync';
import { useTabManagement } from './hooks/useTabManagement';
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
  const [lang, setLang] = useState<'en' | 'ja'>(
    navigator.language.startsWith('ja') ? 'ja' : 'en'
  );
  const t = locales[lang];


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

  const isInitialized = useInitializeSettings(setSettings);

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
  const triggeredJobIdRef = useRef<string | null>(null);

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
    if (firstJob.id === myJobId && firstJob.status === 'running') {
      if (!isGeneratingRef.current && triggeredJobIdRef.current !== myJobId) {
        triggeredJobIdRef.current = myJobId;
        void runInferenceStream(myJobId);
      }
    }
  }, [jobQueue, myJobId, pendingMessage, settings.isSharedMode]);

  // Reset triggered job lock when myJobId changes or becomes null
  useEffect(() => {
    if (!myJobId) {
      triggeredJobIdRef.current = null;
    }
  }, [myJobId]);

  // Separate model fallback logic
  useEffect(() => {
    if (isModelLoading || models.length === 0) return; // Guard loading and empty list
    if (activeModel && models.length > 0) {
      const modelNames = models.map(m => m.name);
      if (!modelNames.includes(activeModel)) {
        setTimeout(() => {
          setActiveModel(models[0].name);
          setLastModelChangeTime(Date.now());
        }, 0);
      }
    }
  }, [models, activeModel, isModelLoading]);


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
        headers['X-DDO-Username'] = encodeURIComponent(settings.username);
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
  const isAutoScrollRef = useRef<boolean>(true);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Handle scroll to detect if user has scrolled up
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) return;
    
    // Throttled scroll checks via requestAnimationFrame
    scrollTimeoutRef.current = window.requestAnimationFrame(() => {
      scrollTimeoutRef.current = null;
      const el = messagesContainerRef.current;
      if (!el) return;
      
      // Handle zoom fractional pixel rounding with Math.ceil
      const isAtBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 30;
      isAutoScrollRef.current = isAtBottom;
    });
  }, []);

  // Sync scroll on new messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el && isAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chats, activeChatId]);

  // Force auto scroll on when generation starts (either local or remote)
  useEffect(() => {
    if (isGenerating || isRemoteGenerating) {
      isAutoScrollRef.current = true;
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [isGenerating, isRemoteGenerating]);

  const { addNewTab, deleteTab } = useTabManagement({
    chats,
    activeChatId,
    settings,
    t,
    setChats,
    setActiveChatId,
    updateLastPolledMsgId: (id) => send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: id } })
  });

  // Create default tab if none exists (Private Mode only)
  useEffect(() => {
    if (isInitialized && !settings.isSharedMode && chats.length === 0) {
      const timer = setTimeout(() => {
        addNewTab(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, chats.length, addNewTab, settings.isSharedMode]);



  // Initial tags/ps fetch and interval polling
  const { fetchModelsAndPs } = useModelSync({
    isInitialized,
    settings,
    activeModel,
    isModelLoading,
    lastModelChangeTime,
    lastModelSender,
    isGeneratingRef,
    isRemoteGeneratingRef,
    remoteGeneratingText,
    activeChatId,
    fallbackTimerRef,
    setModels,
    setPsInfo,
    setActiveModel,
    setLastModelSender,
    setLastModelChangeTime,
    setIsRemoteGenerating,
    setRemoteGeneratingText,
    setChats,
    peerStartGenerate,
    peerCompleteGenerate,
    handleActiveCount
  });

  // Trigger model pre-loading when activeModel changes and it's not matching VRAM
  // Skip if model was changed by a peer (lastModelSender !== username): peer-initiated changes
  // should NOT trigger a local load request. The UI update is enough; psInfo polling will reflect VRAM state.
  useEffect(() => {
    if (!isInitialized || !activeModel || isModelLoading) return;
    const isLoadedByPeer = lastModelSender !== '' && lastModelSender !== settings.username;
    if (isLoadedByPeer) return; // Do not send load request for peer-triggered model changes
    const isLoaded = psInfo && psInfo.name === activeModel;
    if (!isLoaded && !isGeneratingRef.current && !isRemoteGeneratingRef.current) {
      void loadModelOnSelection(activeModel);
    }
  }, [activeModel, isInitialized, psInfo, isModelLoading, loadModelOnSelection, lastModelSender, settings.username]);

  useQueueSync({
    isInitialized,
    settings,
    setJobQueue,
    handleActiveCount
  });

  useBroadcastSync({
    isInitialized,
    settings,
    chats,
    activeChatId,
    lastPolledMsgId: state.context.lastPolledMsgId,
    updateLastPolledMsgId: (id) => send({ type: 'UPDATE_CONTEXT', payload: { lastPolledMsgId: id } }),
    fallbackTimerRef,
    setChats,
    setRemoteGeneratingText,
    setSyncRequestPending,
    addNewTab,
    deleteTab,
    setActiveChatId,
    handleActiveCount
  });

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



  // Unload model from VRAM by calling API with keep_alive: 0
  const handleUnloadModel = async () => {
    if (!psInfo) return;
    try {
      await apiUnloadModel(psInfo.name, settings.connectionUrl, settings.accessToken);
    } catch (e) {
      console.error("Failed to unload model", e);
      // Bug#6修正: エラーをサイレントに吸収せずユーザーに表示する
      setModelLoadError(e instanceof Error ? e.message : "Failed to unload model");
    } finally {
      setPsInfo(null);
      setActiveModel('');
      // Use '' as lastModelSender to signal all clients (including self) to reset activeModel
      setLastModelSender('');
      const now = Date.now();
      setLastModelChangeTime(now);
      if (settings.isSharedMode) {
        // Explicitly broadcast isGenerating: false so peers can correctly update their state
        void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, '', now, false, '');
      }
      fetchModelsAndPs();
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
          key={activeChatId || 'empty'}
          ref={messagesContainerRef}
          messages={displayMessages}
          onImportCassette={importCassette}
          expandedThinking={expandedThinking}
          onToggleThinking={handleThinkingToggle}
          collapseThinking={collapseThinking}
          t={t}
          onScroll={handleScroll}
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
        lang={lang}
        onChangeLang={setLang}
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
