import { useEffect, useCallback, useRef } from 'react';
import type { DdoSettings, OllamaModelInfo, PsModelInfo, ChatSession } from '../types';
import { fetchModels, fetchPs } from '../api/ollama';
import { pollModel, broadcastModel } from '../api/broadcast';
import { formatTimestamp } from '../utils/format';

interface UseModelSyncProps {
  isInitialized: boolean;
  settings: DdoSettings;
  activeModel: string;
  isModelLoading: boolean;
  isModelUnloading: boolean;
  lastModelChangeTime: number;
  lastModelSender: string;
  isGeneratingRef: React.RefObject<boolean>;
  isRemoteGeneratingRef: React.RefObject<boolean>;
  remoteGeneratingText: string;
  activeChatId: string | null;
  fallbackTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setModels: React.Dispatch<React.SetStateAction<OllamaModelInfo[]>>;
  setPsInfo: React.Dispatch<React.SetStateAction<PsModelInfo | null>>;
  setActiveModel: (model: string) => void;
  setLastModelSender: (sender: string) => void;
  setLastModelChangeTime: (time: number) => void;
  setIsRemoteGenerating: (val: boolean) => void;
  setRemoteGeneratingText: (text: string) => void;
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  peerStartGenerate: () => void;
  peerCompleteGenerate: () => void;
  handleActiveCount: (count: number) => void;
}

export function useModelSync({
  isInitialized,
  settings,
  activeModel,
  isModelLoading,
  isModelUnloading,
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
}: UseModelSyncProps) {
  
  // Keep values current in refs for the async polling closures to prevent stale state issues
  const activeModelRef = useRef(activeModel);
  const isModelLoadingRef = useRef(isModelLoading);
  const isModelUnloadingRef = useRef(isModelUnloading);
  const lastModelChangeTimeRef = useRef(lastModelChangeTime);
  const lastModelSenderRef = useRef(lastModelSender);
  const activeChatIdRef = useRef(activeChatId);
  const remoteGeneratingTextRef = useRef(remoteGeneratingText);
  // Counter for consecutive null psInfo responses to avoid false-positive model clear
  const consecutiveNullPsRef = useRef(0);

  useEffect(() => {
    activeModelRef.current = activeModel;
    isModelLoadingRef.current = isModelLoading;
    isModelUnloadingRef.current = isModelUnloading;
    lastModelChangeTimeRef.current = lastModelChangeTime;
    lastModelSenderRef.current = lastModelSender;
    activeChatIdRef.current = activeChatId;
    remoteGeneratingTextRef.current = remoteGeneratingText;
  }, [activeModel, isModelLoading, isModelUnloading, lastModelChangeTime, lastModelSender, activeChatId, remoteGeneratingText]);

  // Ollama tags and ps info fetch logic
  const fetchModelsAndPs = useCallback(async () => {
    try {
      const fetchedModels = await fetchModels(settings.connectionUrl, settings.accessToken);
      setModels(prev => {
        if (JSON.stringify(prev) === JSON.stringify(fetchedModels)) return prev;
        return fetchedModels;
      });

      const fetchedPs = await fetchPs(settings.connectionUrl, settings.accessToken);
      setPsInfo(fetchedPs);

      if (fetchedPs) {
        // psInfo is valid: reset the consecutive null counter
        consecutiveNullPsRef.current = 0;
        // Auto-recover activeModel from psInfo when activeModel is empty but model is actually loaded
        // This fixes the desync where UI shows blank model name but Ollama still has a model in VRAM
        // Skip auto-recovery during unloading to prevent race conditions with pending Ollama state updates
        if (!activeModelRef.current && !isModelLoadingRef.current && !isModelUnloadingRef.current && fetchedPs.name) {
          setActiveModel(fetchedPs.name);
          setLastModelSender(settings.username);
          const now = Date.now();
          setLastModelChangeTime(now);
        }
      } else {
        consecutiveNullPsRef.current++;
      }

      const isGracePeriodOver = (Date.now() - lastModelChangeTimeRef.current) > 15000;
      // Only clear activeModel if psInfo has been null for 2+ consecutive polls (approx 10+ seconds)
      // This prevents a transient Ollama hiccup from wiping the displayed model name
      const isPersistentlyNull = consecutiveNullPsRef.current >= 2;

      const currentSender = lastModelSenderRef.current?.trim().toLowerCase();
      const myUsername = settings.username.trim().toLowerCase();
      const canClearModel = currentSender && currentSender === myUsername;

      if (canClearModel && !fetchedPs && isPersistentlyNull && activeModelRef.current && !isModelLoadingRef.current && isGracePeriodOver && !isGeneratingRef.current && !isRemoteGeneratingRef.current) {
        consecutiveNullPsRef.current = 0;
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
  }, [settings.connectionUrl, settings.accessToken, settings.username, settings.isSharedMode, setModels, setPsInfo, setActiveModel, setLastModelSender, setLastModelChangeTime, isGeneratingRef, isRemoteGeneratingRef]);

  // Model and PS polling loop
  useEffect(() => {
    if (!isInitialized || !settings.accessToken) return;
    
    // Initial immediate fetch
    void fetchModelsAndPs();

    const interval = setInterval(() => {
      void fetchModelsAndPs();
    }, 3000); // Bug#4修正: 5000ms→3000msに短縮して同期の遅さを改善

    return () => {
      clearInterval(interval);
    };
  }, [fetchModelsAndPs, isInitialized, settings.accessToken]);

  // Peer model selection and status polling loop
  useEffect(() => {
    if (!isInitialized || !settings.accessToken || !settings.isSharedMode) return;
    
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

        // 1. Update remote generating state
        if (data.isGenerating !== undefined) {
          if (isFromMe) {
            // If the active generation was initiated by myself, it shouldn't lock my screen as "remote".
            // If I am NOT currently local-generating but my screen is locked as remote, reset it.
            if (!isGeneratingRef.current && wasRemoteGenerating) {
              isRemoteGeneratingRef.current = false;
              setIsRemoteGenerating(false);
              setRemoteGeneratingText('');
              peerCompleteGenerate();
            }
          } else {
            if (!wasRemoteGenerating && isNowGenerating) {
              // Manually update ref BEFORE calling XState event to prevent stale value in next poll loop
              isRemoteGeneratingRef.current = true;
              peerStartGenerate();
            } else if (wasRemoteGenerating && !isNowGenerating) {
              // Manually update ref BEFORE calling XState event to prevent stale value in next poll loop
              isRemoteGeneratingRef.current = false;
              peerCompleteGenerate();
            }
            setIsRemoteGenerating(data.isGenerating);
            if (data.generatingText !== undefined) {
              setRemoteGeneratingText(data.generatingText || '');
            }
          }

          // Safety guard: If no one is generating globally according to data, but my local state is still locked as remote, reset it.
          if (!data.isGenerating && !isGeneratingRef.current) {
            isRemoteGeneratingRef.current = false;
            setIsRemoteGenerating(false);
            setRemoteGeneratingText('');
            peerCompleteGenerate();
          }
        }

        // 2. Handle remote model changes (only when from a peer user)
        if (data.sender && data.sender !== settings.username) {
          if (data.model !== undefined && data.model !== activeModelRef.current) {
            setActiveModel(data.model);
            setLastModelSender(data.sender);
            setLastModelChangeTime(Date.now());
            // Pre-load logic is kept in App.tsx or useChatActions, 
            // so we delegate the trigger by updating state, 
            // but loadModelOnSelection should be triggered in App.tsx's useEffect when activeModel changes.
          }
        }

        // 3. Commit final text when remote generation ends (with fallback delay)
        if (wasRemoteGenerating && !isNowGenerating) {
          const textToCommit = data.generatingText || remoteGeneratingTextRef.current;
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
          }
          if (textToCommit && activeChatIdRef.current) {
            fallbackTimerRef.current = setTimeout(() => {
              if (!active) return;
              setChats(prev => prev.map(c => {
                if (c.id === activeChatIdRef.current) {
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
                      sender: data.model || activeModelRef.current || 'AI',
                      timestamp: formatTimestamp(new Date())
                    }]
                  };
                }
                return c;
              }));
              setRemoteGeneratingText('');
            }, 8000); // Bug#5修正: 5000ms→8000msに延長しbroadcast pollが先に届く時間を確保
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
          if (activeModelRef.current !== '') {
            setActiveModel('');
          }
        }
      } catch (e) {
        console.error("Model poll failed", e);
      }
      if (active) {
        timerId = setTimeout(startModelPolling, 1000); // Bug#4修正: 1500ms→1000msに短縮
      }
    };

    void startModelPolling();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [
    isInitialized, 
    settings.connectionUrl, 
    settings.accessToken, 
    settings.username, 
    settings.isSharedMode, 
    handleActiveCount, 
    isRemoteGeneratingRef, 
    peerStartGenerate, 
    peerCompleteGenerate, 
    setIsRemoteGenerating, 
    setRemoteGeneratingText, 
    setActiveModel, 
    setLastModelSender, 
    setLastModelChangeTime, 
    fallbackTimerRef, 
    setChats,
    setRemoteGeneratingText
  ]);

  return {
    fetchModelsAndPs
  };
}
