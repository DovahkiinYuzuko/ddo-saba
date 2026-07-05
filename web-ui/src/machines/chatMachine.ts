import { createMachine, assign } from 'xstate';
import type { ChatSession, QueueJob, Message } from '../types';

import type { DdoSettings, DdoParameters, OllamaModelInfo, PsModelInfo } from '../types';

export interface ChatMachineContext {
  activeModel: string;
  jobQueue: QueueJob[];
  myJobId: string | null;
  chats: ChatSession[];
  activeChatId: string | null;
  activeUserCount: number;
  syncRequestPending: any | null;
  
  settings: DdoSettings;
  models: OllamaModelInfo[];
  expandedThinking: Record<string, boolean>;
  presetName: string;
  numPredictEnabled: boolean;
  isModelLoading: boolean;
  modelLoadError: string;
  collapseThinking: boolean;
  systemPrompt: string;
  parameters: DdoParameters;
  thinkMode: boolean;
  isRemoteGenerating: boolean;
  remoteGeneratingText: string;
  psInfo: PsModelInfo | null;
  isGenerating: boolean;
  sendOnEnter: boolean;
  contextUsed: number;
  lastModelChangeTime: number;
  lastModelSender: string;
  pendingMessage: string;
  inputText: string;
  showSettingsModal: boolean;
  isSidebarOpen: boolean;
  isParamsOpen: boolean;
  lastPolledMsgId: string;
}

export type FunctionalUpdate<T> = {
  [K in keyof T]?: T[K] | ((prev: T[K]) => T[K]);
};

export type ChatMachineEvent =
  | { type: 'SELECT_MODEL'; modelName: string }
  | { type: 'START_GENERATE' }
  | { type: 'GENERATE_COMPLETE' }
  | { type: 'GENERATE_ABORT' }
  | { type: 'LOAD_SUCCESS' }
  | { type: 'LOAD_FAILURE' }
  | { type: 'UNLOAD_MODEL' }
  | { type: 'UNLOAD_SUCCESS' }
  | { type: 'UNLOAD_FAILURE' }
  | { type: 'SET_ACTIVE_MODEL'; modelName: string }
  | { type: 'START_POLLING' }
  | { type: 'STOP_POLLING' }
  | { type: 'PEER_START_GENERATE' }
  | { type: 'PEER_COMPLETE_GENERATE' }
  | { type: 'SUBMIT_MESSAGE'; content: string }
  | { type: 'PROMOTE_QUEUE'; userMsg: Message }
  | { type: 'CANCEL_QUEUE' }
  | { type: 'UPDATE_CONTEXT'; payload: FunctionalUpdate<ChatMachineContext> };

export const chatMachine = createMachine(
  {
    id: 'chatMachine',
    types: {} as {
      context: ChatMachineContext;
      events: ChatMachineEvent;
    },
    type: 'parallel',
    context: {
      activeModel: '',
      jobQueue: [],
      myJobId: null,
      chats: [],
      activeChatId: null,
      activeUserCount: 1,
      syncRequestPending: null,
      settings: {
        connectionUrl: 'http://localhost:8088',
        accessToken: '',
        isSharedMode: false,
        username: 'Guest_000'
      },
      models: [],
      expandedThinking: {},
      presetName: "My Preset",
      numPredictEnabled: true,
      isModelLoading: false,
      modelLoadError: '',
      collapseThinking: true,
      systemPrompt: 'You are a helpful assistant.',
      parameters: {
        temperature: 0.7,
        num_ctx: 2048,
        min_p: 0.05,
        top_p: 0.9,
        top_k: 40,
        num_predict: 1024,
        repeat_penalty: 1.1
      },
      thinkMode: true,
      isRemoteGenerating: false,
      remoteGeneratingText: '',
      psInfo: null,
      isGenerating: false,
      sendOnEnter: true,
      contextUsed: 0,
      lastModelChangeTime: 0,
      lastModelSender: '',
      pendingMessage: '',
      inputText: '',
      showSettingsModal: false,
      isSidebarOpen: false,
      isParamsOpen: false,
      lastPolledMsgId: ''
    },
    states: {
      local: {
        initial: 'idle',
        states: {
          idle: {
            on: {
              SELECT_MODEL: 'loadingModel',
              START_GENERATE: {
                target: 'generating',
                actions: assign({ isGenerating: true })
              },
              UNLOAD_MODEL: 'unloadingModel',
              SET_ACTIVE_MODEL: {
                actions: assign({
                  activeModel: ({ event }) => (event as any).modelName
                })
              }
            }
          },
          loadingModel: {
            on: {
              LOAD_SUCCESS: 'idle',
              LOAD_FAILURE: 'idle'
            }
          },
          generating: {
            on: {
              GENERATE_COMPLETE: {
                target: 'idle',
                actions: assign({ isGenerating: false })
              },
              GENERATE_ABORT: {
                target: 'idle',
                actions: assign({ isGenerating: false })
              }
            }
          },
          unloadingModel: {
            on: {
              UNLOAD_SUCCESS: {
                target: 'idle',
                actions: assign({ activeModel: '' })
              },
              UNLOAD_FAILURE: 'idle'
            }
          }
        }
      },
      sync: {
        initial: 'idle',
        states: {
          idle: {
            on: {
              START_POLLING: 'polling'
            }
          },
          polling: {
            on: {
              PEER_START_GENERATE: {
                target: 'remoteGenerating',
                guard: ({ context }) => !context.isGenerating,
                actions: assign({ isRemoteGenerating: true })
              },
              PEER_COMPLETE_GENERATE: {
                actions: assign({ isRemoteGenerating: false, remoteGeneratingText: '' })
              },
              STOP_POLLING: 'idle'
            }
          },
          remoteGenerating: {
            on: {
              PEER_COMPLETE_GENERATE: {
                target: 'polling',
                actions: assign({ isRemoteGenerating: false, remoteGeneratingText: '' })
              },
              PEER_START_GENERATE: {
                // Peer re-started generation while already in remoteGenerating (e.g., re-trigger)
                actions: assign({ isRemoteGenerating: true })
              },
              START_GENERATE: {
                target: 'polling',
                actions: assign({ isRemoteGenerating: false, remoteGeneratingText: '' })
              }
            }
          }
        }
      },
      queue: {
        initial: 'idle',
        states: {
          idle: {
            on: {
              SUBMIT_MESSAGE: [
                {
                  target: 'waiting',
                  guard: ({ context }) => context.settings.isSharedMode,
                  actions: assign(({ event }) => ({
                    pendingMessage: (event as any).content,
                    inputText: ''
                  }))
                },
                {
                  target: 'running',
                  actions: assign(({ event }) => ({
                    pendingMessage: (event as any).content,
                    inputText: ''
                  }))
                }
              ]
            }
          },
          waiting: {
            on: {
              PROMOTE_QUEUE: {
                target: 'running',
                actions: assign(({ context, event }) => {
                  const userMsg = (event as any).userMsg;
                  return {
                    chats: context.chats.map(c => {
                      if (c.id === context.activeChatId) {
                        return { ...c, messages: [...c.messages, userMsg] };
                      }
                      return c;
                    })
                  };
                })
              },
              CANCEL_QUEUE: {
                target: 'idle',
                actions: assign(({ context }) => ({
                  inputText: context.pendingMessage,
                  pendingMessage: '',
                  myJobId: null
                }))
              }
            }
          },
          running: {
            on: {
              GENERATE_COMPLETE: {
                target: 'idle',
                actions: assign({ pendingMessage: '' })
              },
              GENERATE_ABORT: {
                target: 'idle',
                actions: assign({ pendingMessage: '' })
              }
            }
          }
        }
      }
    },
    on: {
      UPDATE_CONTEXT: {
        actions: assign(({ context, event }) => {
          if (event.type === 'UPDATE_CONTEXT') {
            const nextContext = { ...context };
            const payload = event.payload as FunctionalUpdate<ChatMachineContext>;
            for (const key in payload) {
              const val = (payload as any)[key];
              if (typeof val === 'function') {
                (nextContext as any)[key] = val((context as any)[key]);
              } else {
                (nextContext as any)[key] = val;
              }
            }
            return nextContext;
          }
          return context;
        })
      }
    }
  }
);
