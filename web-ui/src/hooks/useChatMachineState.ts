import { useMachine } from '@xstate/react';
import { useCallback } from 'react';
import { chatMachine } from '../machines/chatMachine';
import type { DdoSettings, DdoParameters, OllamaModelInfo, PsModelInfo, ChatSession, QueueJob } from '../types';

export function useChatMachineState() {
  const [state, send] = useMachine(chatMachine);

  const setIsSidebarOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { isSidebarOpen: val } });
  }, [send]);

  const setIsParamsOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { isParamsOpen: val } });
  }, [send]);

  const setPresetName = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { presetName: val } });
  }, [send]);

  const setInputText = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { inputText: val } });
  }, [send]);

  const setShowSettingsModal = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { showSettingsModal: val } });
  }, [send]);

  const setNumPredictEnabled = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { numPredictEnabled: val } });
  }, [send]);

  const setIsModelLoading = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { isModelLoading: val } });
  }, [send]);

  const setModelLoadError = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { modelLoadError: val } });
  }, [send]);

  const setCollapseThinking = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { collapseThinking: val } });
  }, [send]);

  const setActiveModel = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { activeModel: val } });
  }, [send]);

  const setSystemPrompt = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { systemPrompt: val } });
  }, [send]);

  const setParameters = useCallback((val: DdoParameters | ((prev: DdoParameters) => DdoParameters)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { parameters: val } });
  }, [send]);

  const setThinkMode = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { thinkMode: val } });
  }, [send]);

  const setSyncRequestPending = useCallback((val: any | ((prev: any) => any)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { syncRequestPending: val } });
  }, [send]);

  const setIsRemoteGenerating = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { isRemoteGenerating: val } });
  }, [send]);

  const setRemoteGeneratingText = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { remoteGeneratingText: val } });
  }, [send]);

  const setPsInfo = useCallback((val: PsModelInfo | null | ((prev: PsModelInfo | null) => PsModelInfo | null)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { psInfo: val } });
  }, [send]);

  const setIsGenerating = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { isGenerating: val } });
  }, [send]);

  const setSendOnEnter = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { sendOnEnter: val } });
  }, [send]);

  const setContextUsed = useCallback((val: number | ((prev: number) => number)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { contextUsed: val } });
  }, [send]);

  const setLastModelChangeTime = useCallback((val: number | ((prev: number) => number)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { lastModelChangeTime: val } });
  }, [send]);

  const setLastModelSender = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { lastModelSender: val } });
  }, [send]);

  const setJobQueue = useCallback((val: QueueJob[] | ((prev: QueueJob[]) => QueueJob[])) => {
    send({ type: 'UPDATE_CONTEXT', payload: { jobQueue: val } });
  }, [send]);

  const setMyJobId = useCallback((val: string | null | ((prev: string | null) => string | null)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { myJobId: val } });
  }, [send]);

  const setPendingMessage = useCallback((val: string | ((prev: string) => string)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { pendingMessage: val } });
  }, [send]);

  const setActiveUserCount = useCallback((val: number | ((prev: number) => number)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { activeUserCount: val } });
  }, [send]);

  const setChats = useCallback((val: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])) => {
    send({ type: 'UPDATE_CONTEXT', payload: { chats: val } });
  }, [send]);

  const setActiveChatId = useCallback((val: string | null | ((prev: string | null) => string | null)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { activeChatId: val } });
  }, [send]);

  const setSettings = useCallback((val: DdoSettings | ((prev: DdoSettings) => DdoSettings)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { settings: val } });
  }, [send]);

  const setModels = useCallback((val: OllamaModelInfo[] | ((prev: OllamaModelInfo[]) => OllamaModelInfo[])) => {
    send({ type: 'UPDATE_CONTEXT', payload: { models: val } });
  }, [send]);

  const setExpandedThinking = useCallback((val: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
    send({ type: 'UPDATE_CONTEXT', payload: { expandedThinking: val } });
  }, [send]);

  const startGenerate = useCallback(() => {
    send({ type: 'START_GENERATE' });
  }, [send]);

  const completeGenerate = useCallback(() => {
    send({ type: 'GENERATE_COMPLETE' });
  }, [send]);

  const abortGenerate = useCallback(() => {
    send({ type: 'GENERATE_ABORT' });
  }, [send]);

  const peerStartGenerate = useCallback(() => {
    send({ type: 'PEER_START_GENERATE' });
  }, [send]);

  const peerCompleteGenerate = useCallback(() => {
    send({ type: 'PEER_COMPLETE_GENERATE' });
  }, [send]);

  return {
    state,
    send,
    adapters: {
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
      setIsGenerating,
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
    }
  };
}
