import { useMachine } from '@xstate/react';
import { useCallback } from 'react';
import { chatMachine } from '../machines/chatMachine';
import type { DdoSettings, DdoParameters, OllamaModelInfo, PsModelInfo, ChatSession, QueueJob } from '../types';

export function useChatMachineState() {
  const [state, send] = useMachine(chatMachine);

  const setIsSidebarOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.isSidebarOpen) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { isSidebarOpen: newVal } });
  }, [send, state.context.isSidebarOpen]);

  const setIsParamsOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.isParamsOpen) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { isParamsOpen: newVal } });
  }, [send, state.context.isParamsOpen]);

  const setPresetName = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.presetName) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { presetName: newVal } });
  }, [send, state.context.presetName]);

  const setInputText = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.inputText) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { inputText: newVal } });
  }, [send, state.context.inputText]);

  const setShowSettingsModal = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.showSettingsModal) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { showSettingsModal: newVal } });
  }, [send, state.context.showSettingsModal]);

  const setNumPredictEnabled = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.numPredictEnabled) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { numPredictEnabled: newVal } });
  }, [send, state.context.numPredictEnabled]);

  const setIsModelLoading = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.isModelLoading) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { isModelLoading: newVal } });
  }, [send, state.context.isModelLoading]);

  const setModelLoadError = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.modelLoadError) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { modelLoadError: newVal } });
  }, [send, state.context.modelLoadError]);

  const setCollapseThinking = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.collapseThinking) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { collapseThinking: newVal } });
  }, [send, state.context.collapseThinking]);

  const setActiveModel = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.activeModel) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { activeModel: newVal } });
  }, [send, state.context.activeModel]);

  const setSystemPrompt = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.systemPrompt) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { systemPrompt: newVal } });
  }, [send, state.context.systemPrompt]);

  const setParameters = useCallback((val: DdoParameters | ((prev: DdoParameters) => DdoParameters)) => {
    const newVal = typeof val === 'function' ? val(state.context.parameters) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { parameters: newVal } });
  }, [send, state.context.parameters]);

  const setThinkMode = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.thinkMode) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { thinkMode: newVal } });
  }, [send, state.context.thinkMode]);

  const setSyncRequestPending = useCallback((val: any | ((prev: any) => any)) => {
    const newVal = typeof val === 'function' ? val(state.context.syncRequestPending) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { syncRequestPending: newVal } });
  }, [send, state.context.syncRequestPending]);

  const setIsRemoteGenerating = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.isRemoteGenerating) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { isRemoteGenerating: newVal } });
  }, [send, state.context.isRemoteGenerating]);

  const setRemoteGeneratingText = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.remoteGeneratingText) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { remoteGeneratingText: newVal } });
  }, [send, state.context.remoteGeneratingText]);

  const setPsInfo = useCallback((val: PsModelInfo | null | ((prev: PsModelInfo | null) => PsModelInfo | null)) => {
    const newVal = typeof val === 'function' ? val(state.context.psInfo) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { psInfo: newVal } });
  }, [send, state.context.psInfo]);

  const setIsGenerating = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.isGenerating) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { isGenerating: newVal } });
  }, [send, state.context.isGenerating]);

  const setSendOnEnter = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(state.context.sendOnEnter) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { sendOnEnter: newVal } });
  }, [send, state.context.sendOnEnter]);

  const setContextUsed = useCallback((val: number | ((prev: number) => number)) => {
    const newVal = typeof val === 'function' ? val(state.context.contextUsed) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { contextUsed: newVal } });
  }, [send, state.context.contextUsed]);

  const setLastModelChangeTime = useCallback((val: number | ((prev: number) => number)) => {
    const newVal = typeof val === 'function' ? val(state.context.lastModelChangeTime) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { lastModelChangeTime: newVal } });
  }, [send, state.context.lastModelChangeTime]);

  const setLastModelSender = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.lastModelSender) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { lastModelSender: newVal } });
  }, [send, state.context.lastModelSender]);

  const setJobQueue = useCallback((val: QueueJob[] | ((prev: QueueJob[]) => QueueJob[])) => {
    const newVal = typeof val === 'function' ? val(state.context.jobQueue) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { jobQueue: newVal } });
  }, [send, state.context.jobQueue]);

  const setMyJobId = useCallback((val: string | null | ((prev: string | null) => string | null)) => {
    const newVal = typeof val === 'function' ? val(state.context.myJobId) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { myJobId: newVal } });
  }, [send, state.context.myJobId]);

  const setPendingMessage = useCallback((val: string | ((prev: string) => string)) => {
    const newVal = typeof val === 'function' ? val(state.context.pendingMessage) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { pendingMessage: newVal } });
  }, [send, state.context.pendingMessage]);

  const setActiveUserCount = useCallback((val: number | ((prev: number) => number)) => {
    const newVal = typeof val === 'function' ? val(state.context.activeUserCount) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { activeUserCount: newVal } });
  }, [send, state.context.activeUserCount]);

  const setChats = useCallback((val: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])) => {
    const newVal = typeof val === 'function' ? val(state.context.chats) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { chats: newVal } });
  }, [send, state.context.chats]);

  const setActiveChatId = useCallback((val: string | null | ((prev: string | null) => string | null)) => {
    const newVal = typeof val === 'function' ? val(state.context.activeChatId) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { activeChatId: newVal } });
  }, [send, state.context.activeChatId]);

  const setSettings = useCallback((val: DdoSettings | ((prev: DdoSettings) => DdoSettings)) => {
    const newVal = typeof val === 'function' ? val(state.context.settings) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { settings: newVal } });
  }, [send, state.context.settings]);

  const setModels = useCallback((val: OllamaModelInfo[] | ((prev: OllamaModelInfo[]) => OllamaModelInfo[])) => {
    const newVal = typeof val === 'function' ? val(state.context.models) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { models: newVal } });
  }, [send, state.context.models]);

  const setExpandedThinking = useCallback((val: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
    const newVal = typeof val === 'function' ? val(state.context.expandedThinking) : val;
    send({ type: 'UPDATE_CONTEXT', payload: { expandedThinking: newVal } });
  }, [send, state.context.expandedThinking]);

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
      setExpandedThinking
    }
  };
}
