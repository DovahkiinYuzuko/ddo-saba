import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, 
  Square, 
  Settings, 
  Plus, 
  Trash2, 
  Globe, 
  Lock, 
  Loader2, 
  LogOut,
  AlertTriangle,
  Menu,
  SlidersHorizontal
} from 'lucide-react';
import type { 
  Message, 
  ChatSession, 
  OllamaModelInfo, 
  PsModelInfo, 
  DdoSettings, 
  DdoParameters,
  LocaleStrings,
  MessageMetrics
} from './types';
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
import SettingsModal from './components/SettingsModal';
import ParameterPanel from './components/ParameterPanel';
import ChatMessages from './components/ChatMessages';

const locales: Record<'en' | 'ja', LocaleStrings> = {
  en: {
    title: "DDO Saba Control Panel",
    chats: "Chats",
    newChat: "New Chat",
    noChats: "No active chats. Click New Chat to start.",
    temporaryWarning: "Warning: Chat history is temporary. Export cassette before reloading or closing.",
    settings: "Settings",
    modelParameters: "Model Parameters",
    preset: "Preset",
    systemPrompt: "System Prompt",
    temperature: "Temperature",
    minP: "Min P",
    topP: "Top P",
    topK: "Top K",
    maxTokens: "Max Tokens",
    repeatPenalty: "Repeat Penalty",
    reasoningMode: "Reasoning Mode",
    loadedModel: "Loaded Model Status",
    noLoadedModel: "No model loaded in VRAM",
    connectionUrl: "Connection URL",
    accessToken: "Access Token (X-DDO-Token)",
    username: "Username (for room chat)",
    sharedRoomMode: "Shared Room Mode",
    privateMode: "Private Mode",
    export: "Export Cassette (JSON)",
    import: "Import Cassette (JSON)",
    placeholder: "Type a message...",
    send: "Send",
    stop: "Stop",
    vram: "VRAM",
    device: "Device",
    until: "Unload In",
    thinking: "Thinking Process",
    close: "Close",
    sendOnEnter: "Press Enter to send (Shift+Enter for newline)",
    contextLimit: "Context Limit (num_ctx)",
    selectModel: "Select a model...",
    collapseThinking: "Collapse Thinking Process"
  },
  ja: {
    title: "DDO Saba コントロールパネル",
    chats: "チャット一覧",
    newChat: "新規チャット",
    noChats: "チャットがありません。新規チャットを作成してください。",
    temporaryWarning: "注意: チャット履歴は一時的です。リロードや終了前にカセットをエクスポートしてください。",
    settings: "設定",
    modelParameters: "モデルパラメータ",
    preset: "プリセット",
    systemPrompt: "システムプロンプト",
    temperature: "温度 (Temperature)",
    minP: "最小確率 (Min P)",
    topP: "上位確率 (Top P)",
    topK: "上位トークン数 (Top K)",
    maxTokens: "最大出力トークン数",
    repeatPenalty: "繰り返しペナルティ",
    reasoningMode: "思考モード (Reasoning)",
    loadedModel: "稼働中のモデル状況 (Ollama ps)",
    noLoadedModel: "VRAMにロードされているモデルはありません",
    connectionUrl: "接続先URL",
    accessToken: "アクセストークン (X-DDO-Token)",
    username: "ユーザー名 (共有チャット用)",
    sharedRoomMode: "共有ルームモード (全員と同期)",
    privateMode: "お一人様モード (プライベート)",
    export: "カセットのエクスポート (JSON)",
    import: "カセットのインポート (JSON)",
    placeholder: "メッセージを入力してください...",
    send: "送信",
    stop: "停止",
    vram: "VRAM使用量",
    device: "デバイス",
    until: "アンロードまで",
    thinking: "思考プロセス",
    close: "閉じる",
    sendOnEnter: "Enterキーで送信する (Shift+Enterで改行)",
    contextLimit: "コンテキスト制限 (num_ctx)",
    selectModel: "モデルを選択してください",
    collapseThinking: "思考プロセスを折りたたむ"
  }
};

const formatTimestamp = (dateInput?: string | Date): string => {
  if (!dateInput) return '';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}/${MM}/${dd}-${HH}:${mm}`;
  } catch {
    return '';
  }
};

export default function App() {
  const [lang, setLang] = useState<'en' | 'ja'>(
    navigator.language.startsWith('ja') ? 'ja' : 'en'
  );
  const t = locales[lang];

  // State Definitions matching the variable specification document
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isParamsOpen, setIsParamsOpen] = useState<boolean>(false);
  
  const [settings, setSettings] = useState<DdoSettings>(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token') || params.get('accessToken') || '';
    const isSharedModeFromUrl = params.get('sharedMode') === 'true' || params.get('isSharedMode') === 'true';
    return {
      connectionUrl: window.location.origin.includes('localhost:3000')
        ? 'http://localhost:8088'
        : window.location.origin,
      accessToken: tokenFromUrl,
      isSharedMode: isSharedModeFromUrl,
      username: 'Guest_' + Math.floor(Math.random() * 1000)
    };
  });

  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});

  const handleThinkingToggle = (msgKey: string, isOpen: boolean) => {
    setExpandedThinking(prev => {
      if (prev[msgKey] === isOpen) return prev;
      return { ...prev, [msgKey]: isOpen };
    });
  };
  const [presetName, setPresetName] = useState<string>("My Preset");
  const [numPredictEnabled, setNumPredictEnabled] = useState<boolean>(true);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [modelLoadError, setModelLoadError] = useState<string>('');
  const [collapseThinking, setCollapseThinking] = useState<boolean>(true);
  const [activeModel, setActiveModel] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('You are a helpful assistant.');
  const [parameters, setParameters] = useState<DdoParameters>({
    temperature: 0.7,
    num_ctx: 2048,
    min_p: 0.05,
    top_p: 0.9,
    top_k: 40,
    num_predict: 1024,
    repeat_penalty: 1.1
  });
  const [thinkMode, setThinkMode] = useState<boolean>(true);
  const [syncRequestPending, setSyncRequestPending] = useState<{
    activeModel?: string;
    systemPrompt?: string;
    parameters?: DdoParameters;
    thinkMode?: boolean;
    sender: string;
  } | null>(null);
  const [isRemoteGenerating, setIsRemoteGenerating] = useState<boolean>(false);
  const [remoteGeneratingText, setRemoteGeneratingText] = useState<string>('');
  const [psInfo, setPsInfo] = useState<PsModelInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const isGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sendOnEnter, setSendOnEnter] = useState<boolean>(true);
  const [contextUsed, setContextUsed] = useState<number>(0);
  const [lastModelChangeTime, setLastModelChangeTime] = useState<number>(0);
  const [isHistorySynced, setIsHistorySynced] = useState<boolean>(false);

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

  const [inputText, setInputText] = useState<string>('');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const broadcastSettings = async () => {
    if (!settings.isSharedMode) return;
    try {
      const syncPayload = {
        activeModel,
        systemPrompt,
        parameters,
        thinkMode
      };
      await broadcastMessage(
        settings.connectionUrl,
        settings.accessToken,
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
    const { activeModel: remoteModel, systemPrompt: remotePrompt, parameters: remoteParams, thinkMode: remoteThink } = syncRequestPending;
    
    if (remoteModel !== undefined) {
      setActiveModel(remoteModel);
      if (remoteModel && remoteModel !== activeModel) {
        void loadModelOnSelection(remoteModel);
      }
    }
    if (remotePrompt !== undefined) setSystemPrompt(remotePrompt);
    if (remoteParams !== undefined) setParameters(prev => ({ ...prev, ...remoteParams }));
    if (remoteThink !== undefined) setThinkMode(remoteThink);
    
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

  const [lastPolledMsgId, setLastPolledMsgId] = useState<string>('');
  const lastPolledMsgIdRef = useRef(lastPolledMsgId);
  useEffect(() => {
    lastPolledMsgIdRef.current = lastPolledMsgId;
  }, [lastPolledMsgId]);
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
        'system',
        `tab_create:${newId}:${title}`
      );
    }
  }, [t.newChat, chats.length, settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username]);

  // Create default tab if none exists
  useEffect(() => {
    if (chats.length === 0 && (!settings.isSharedMode || isHistorySynced)) {
      setTimeout(() => {
        addNewTab(false);
      }, 0);
    }
  }, [chats.length, addNewTab, settings.isSharedMode, isHistorySynced]);

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
            'system',
            `tab_switch:${nextActiveId}`
          );
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
        'system',
        `tab_delete:${id}`
      );
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
      // and we are not currently loading a model.
      if (!fetchedPs && activeModel && !isModelLoading) {
        setActiveModel('');
        setLastModelChangeTime(Date.now());
      }
    } catch (e) {
      console.error("Failed to connect to Ollama Server status endpoints.", e);
    }
  }, [settings.connectionUrl, settings.accessToken, activeModel, isModelLoading]);

  useEffect(() => {
    setTimeout(() => {
      void fetchModelsAndPs();
    }, 0);
    const interval = setInterval(() => {
      void fetchModelsAndPs();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchModelsAndPs]);

  // Polling for shared room mode
  const startBroadcastPolling = useCallback(async () => {
    try {
      const data = (await pollMessage(settings.connectionUrl, settings.accessToken)) as {
        id?: string;
        sender?: string;
        role?: 'user' | 'assistant' | 'system';
        content?: string;
        timestamp?: string;
      };
      if (data.id && data.id !== lastPolledMsgIdRef.current && data.sender !== settings.username) {
        setLastPolledMsgId(data.id);
        
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
            return;
          } else if (data.content.startsWith('tab_create:')) {
            const parts = data.content.split(':');
            const tabId = parts[1];
            const tabTitle = parts.slice(2).join(':');
            if (tabId) {
              addNewTab(true, tabId, tabTitle);
            }
            return;
          } else if (data.content.startsWith('tab_delete:')) {
            const tabId = data.content.substring('tab_delete:'.length);
            if (tabId) {
              deleteTab(tabId, undefined, true);
            }
            return;
          } else if (data.content.startsWith('tab_switch:')) {
            const tabId = data.content.substring('tab_switch:'.length);
            if (tabId) {
              setActiveChatId(tabId);
            }
            return;
          }
        }

        // Append shared message to currently active chat session
        if (activeChatId) {
          setChats(prev => prev.map(c => {
            if (c.id === activeChatId) {
              return {
                ...c,
                messages: [...c.messages, {
                  role: data.role || 'user',
                  content: data.content || '',
                  sender: data.sender,
                  timestamp: data.timestamp ? formatTimestamp(data.timestamp) : undefined
                }]
              };
            }
            return c;
          }));
        }
      }
    } catch (e) {
      console.error("Broadcasting poll failed", e);
    }
  }, [settings.connectionUrl, settings.accessToken, settings.username, activeChatId, addNewTab, deleteTab]);

  useEffect(() => {
    if (!settings.isSharedMode) return;
    const interval = setInterval(startBroadcastPolling, 1500);
    return () => clearInterval(interval);
  }, [settings.isSharedMode, startBroadcastPolling]);

  // Fetch initial history when Shared Room mode is enabled
  useEffect(() => {
    if (!settings.isSharedMode) return;
    
    const syncHistory = async () => {
      try {
        const historyData = await fetchHistory(settings.connectionUrl, settings.accessToken) as {
          id?: string;
          sender?: string;
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
                          role: 'system',
                          content: h.content || '',
                          sender: h.sender,
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
            setLastPolledMsgId(lastMsg.id);
          }
        }
      } catch (e) {
        console.error("Failed to sync shared room history", e);
      } finally {
        setIsHistorySynced(true);
      }
    };
    
    void syncHistory();
  }, [settings.isSharedMode, settings.connectionUrl, settings.accessToken]);

  // Polling for shared model selection and generation status
  useEffect(() => {
    if (!settings.isSharedMode) return;
    
    const startModelPolling = async () => {
      try {
        const data = await pollModel(settings.connectionUrl, settings.accessToken) as {
          model?: string;
          sender?: string;
          timestamp?: number;
          isGenerating?: boolean;
          generatingText?: string;
        };
        if (data.sender && data.sender !== settings.username) {
          if (data.model !== undefined && data.model !== activeModel) {
            setActiveModel(data.model);
          }
          if (data.isGenerating !== undefined) {
            setIsRemoteGenerating(data.isGenerating);
            setRemoteGeneratingText(data.generatingText || '');
          }
        } else if (!data.sender) {
          setIsRemoteGenerating(false);
          setRemoteGeneratingText('');
        }
      } catch (e) {
        console.error("Model poll failed", e);
      }
    };
    
    const interval = setInterval(startModelPolling, 1500);
    return () => clearInterval(interval);
  }, [settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username, activeModel, lastModelChangeTime]);

  // Unload model from VRAM by calling API with keep_alive: 0
  const handleUnloadModel = async () => {
    if (!psInfo) return;
    try {
      await apiUnloadModel(psInfo.name, settings.connectionUrl, settings.accessToken);
      setPsInfo(null);
      setActiveModel('');
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

  const sendMessage = async () => {
    if (!inputText.trim() || !activeChatId || !activeModel || isGenerating) return;

    const userMessageContent = inputText;
    setInputText('');
    setIsGenerating(true);

    if (settings.isSharedMode) {
      void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, activeModel, Date.now(), true, '');
    }

    const nowStr = formatTimestamp(new Date());

    const userMsg: Message = {
      role: 'user',
      content: userMessageContent,
      sender: settings.username,
      timestamp: nowStr
    };

    const targetChat = chats.find(c => c.id === activeChatId);
    if (!targetChat) return;

    // Append user message locally
    const updatedMessages = [...targetChat.messages, userMsg];
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return { ...c, messages: updatedMessages };
      }
      return c;
    }));

    // Broadcast user message if Shared Room mode is active (includes access token)
    if (settings.isSharedMode) {
      try {
        await broadcastMessage(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          'user',
          userMessageContent
        );
      } catch (e) {
        console.error("Failed to broadcast user message", e);
      }
    }

    // Prepare inference API request payload
    const requestMessages = [];
    if (systemPrompt) {
      requestMessages.push({ role: 'system' as const, content: systemPrompt });
    }
    updatedMessages.forEach(m => {
      requestMessages.push({ role: m.role, content: m.content });
    });

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

      const res = await fetch(`${settings.connectionUrl}/api/chat`, {
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

      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }

      // Initialize assistant answer slot
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

              // Throttled real-time streaming text broadcast (every 600ms)
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

      // After streaming is complete, broadcast assistant message (includes access token)
      if (settings.isSharedMode && accumulatedContent) {
        try {
          const result = await broadcastMessage(
            settings.connectionUrl,
            settings.accessToken,
            activeModel,
            'assistant',
            accumulatedContent
          );
          if (result && result.id) {
            setLastPolledMsgId(result.id);
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
        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            return {
              ...c,
              messages: [...c.messages, { 
                role: 'system', 
                content: `Error: ${err.message}`,
                timestamp: formatTimestamp(new Date())
              }]
            };
          }
          return c;
        }));
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      if (settings.isSharedMode) {
        void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, activeModel, Date.now(), false, '');
      }
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const exportCassette = () => {
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    const cassetteData = {
      version: "1.0",
      system_prompt: systemPrompt,
      options: parameters,
      think: thinkMode,
      messages: activeChat.messages.map(m => ({ role: m.role, content: m.content }))
    };

    const blob = new Blob([JSON.stringify(cassetteData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ddo-saba-cassette-${activeChat.title.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importCassette = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.messages) {
          const newId = Date.now().toString();
          const importedChat: ChatSession = {
            id: newId,
            title: `Cassette: ${file.name.replace('.json', '')}`,
            messages: data.messages
          };
          setChats(prev => [...prev, importedChat]);
          setActiveChatId(newId);

          if (data.system_prompt) setSystemPrompt(data.system_prompt);
          if (data.options) setParameters(prev => ({ ...prev, ...data.options }));
          if (data.think !== undefined) setThinkMode(data.think);
        }
      } catch {
        alert("Failed to parse cassette JSON file. Make sure it conforms to DDO Saba specifications.");
      }
    };
    reader.readAsText(file);
  };

  const exportPreset = () => {
    const presetData = {
      version: "1.0-preset",
      presetName,
      systemPrompt,
      parameters,
      thinkMode,
      sendOnEnter,
      numPredictEnabled,
      collapseThinking
    };

    const blob = new Blob([JSON.stringify(presetData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitizedPresetName = presetName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    a.download = `preset-${sanitizedPresetName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importPreset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.version === "1.0-preset") {
          if (data.presetName) setPresetName(data.presetName);
          if (data.systemPrompt) setSystemPrompt(data.systemPrompt);
          if (data.options) {
            setParameters(prev => ({ ...prev, ...data.options }));
          } else if (data.parameters) {
            setParameters(prev => ({ ...prev, ...data.parameters }));
          }
          if (data.thinkMode !== undefined) setThinkMode(data.thinkMode);
          if (data.sendOnEnter !== undefined) setSendOnEnter(data.sendOnEnter);
          if (data.numPredictEnabled !== undefined) setNumPredictEnabled(data.numPredictEnabled);
          if (data.collapseThinking !== undefined) setCollapseThinking(data.collapseThinking);
        } else {
          alert("Invalid preset file format. Make sure version matches.");
        }
      } catch {
        alert("Failed to parse preset JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.messages) {
            const newId = Date.now().toString();
            const importedChat: ChatSession = {
              id: newId,
              title: `Cassette: ${file.name.replace('.json', '')}`,
              messages: data.messages
            };
            setChats(prev => [...prev, importedChat]);
            setActiveChatId(newId);

            if (data.system_prompt) setSystemPrompt(data.system_prompt);
            if (data.options) setParameters(prev => ({ ...prev, ...data.options }));
            if (data.think !== undefined) setThinkMode(data.think);
          }
        } catch {
          alert("Malformed cassette JSON.");
        }
      };
      reader.readAsText(file);
    }
  };

  const activeChat = chats.find(c => c.id === activeChatId);

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
      <aside className="sidebar-column">
        <div className="sidebar-header">
          <h2>{t.chats}</h2>
          <button className="icon-btn-accent" onClick={() => addNewTab(false)} title={t.newChat}>
            <Plus size={18} />
          </button>
        </div>
        
        <div className="tab-list">
          {chats.map(c => (
            <div 
              key={c.id} 
              className={`tab-item ${activeChatId === c.id ? 'active' : ''}`}
              onClick={() => {
                setActiveChatId(c.id);
                setIsSidebarOpen(false);
                if (settings.isSharedMode) {
                  void broadcastMessage(
                    settings.connectionUrl,
                    settings.accessToken,
                    settings.username,
                    'system',
                    `tab_switch:${c.id}`
                  );
                }
              }}
            >
              <Trash2 size={16} className="tab-icon" />
              <span className="tab-title">{c.title}</span>
              <button className="tab-close-btn" onClick={(e) => deleteTab(c.id, e, false)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="alert-card">
            <AlertTriangle size={16} className="alert-icon" />
            <p>{t.temporaryWarning}</p>
          </div>
        </div>
      </aside>

      {/* 2. Middle Column: Main Chat Room */}
      <main className="chat-column">
        <header className="chat-header">
          <button
            className="mobile-toggle-btn"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            title={lang === 'ja' ? 'メニューをトグル' : 'Toggle menu'}
          >
            <Menu size={20} />
          </button>

          <div className="model-selector-wrap">
            {isModelLoading && <Loader2 className="animate-spin" size={16} style={{ color: 'hsl(var(--accent))', flexShrink: 0 }} />}
            <select 
              value={activeModel} 
              onChange={(e) => {
                const selected = e.target.value;
                setActiveModel(selected);
                const now = Date.now();
                setLastModelChangeTime(now);
                loadModelOnSelection(selected);
                if (settings.isSharedMode) {
                  void broadcastModel(settings.connectionUrl, settings.accessToken, settings.username, selected, now);
                }
              }}
              disabled={isModelLoading}
              className="model-select"
              style={{ flex: 1 }}
            >
              <option value="">{isModelLoading ? (lang === 'ja' ? 'モデルをロード中...' : 'Loading Model...') : (models.length === 0 ? "No models detected" : t.selectModel)}</option>
              {models.map(m => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
            {psInfo && (
              <button 
                onClick={handleUnloadModel} 
                className="unload-btn" 
                title={lang === 'ja' ? 'VRAMからアンロード' : 'Unload from VRAM'}
              >
                <LogOut size={16} />
              </button>
            )}
            {modelLoadError && (
              <div style={{ color: 'hsl(var(--danger))', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                <AlertTriangle size={14} />
                <span>{modelLoadError}</span>
              </div>
            )}
          </div>

          <div className="header-actions">
            <button className="lang-toggle" onClick={() => setLang(l => l === 'en' ? 'ja' : 'en')}>
              {lang === 'en' ? 'JP' : 'EN'}
            </button>
            <button
              className="mobile-toggle-btn"
              onClick={() => setIsParamsOpen(prev => !prev)}
              title={lang === 'ja' ? 'パラメータをトグル' : 'Toggle parameters'}
            >
              <SlidersHorizontal size={20} />
            </button>
            <button className="icon-btn" onClick={() => setShowSettingsModal(true)}>
              <Settings size={20} />
            </button>
          </div>
        </header>

        <ChatMessages 
          ref={messagesContainerRef}
          messages={displayMessages}
          onImportCassette={importCassette}
          expandedThinking={expandedThinking}
          onToggleThinking={handleThinkingToggle}
          collapseThinking={collapseThinking}
          t={t}
        />

        <footer className="chat-input-bar">
          <div className="input-wrap">
            <textarea 
              value={inputText}
              disabled={isGenerating || isModelLoading || isRemoteGenerating}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (sendOnEnter && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  } else if (!sendOnEnter && e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }
              }}
              placeholder={isRemoteGenerating ? (lang === 'ja' ? '他のユーザーが推論中です...' : 'Another user is thinking...') : t.placeholder}
              rows={2}
              className="input-textarea"
            />
            {isGenerating ? (
              <button className="action-btn stop-btn" onClick={stopGeneration}>
                <Square size={16} />
              </button>
            ) : (
              <button className="action-btn send-btn" onClick={sendMessage} disabled={!inputText.trim() || isModelLoading || isRemoteGenerating}>
                <Send size={16} />
              </button>
            )}
          </div>
          <div className="input-footer-settings">
            <span>{settings.isSharedMode ? <Globe size={14} className="shared-indicator" /> : <Lock size={14} />}</span>
            <span className="mode-text">{settings.isSharedMode ? t.sharedRoomMode : t.privateMode}</span>
          </div>
        </footer>
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
      {syncRequestPending && (
        <div className="modal-backdrop" style={{ zIndex: 200 }}>
          <div className="settings-modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>{lang === 'ja' ? '設定同期のリクエスト' : 'Settings Sync Request'}</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '16px', fontSize: '0.9rem', lineHeight: '1.5' }}>
                {lang === 'ja'
                  ? `ユーザー「${syncRequestPending.sender}」から設定の同期がリクエストされました。モデルとパラメータを同期しますか？`
                  : `User "${syncRequestPending.sender}" has requested to sync settings. Do you want to sync your model and parameters?`}
              </p>
              <div style={{ backgroundColor: 'hsl(var(--bg-input))', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '20px' }}>
                <div>Model: {syncRequestPending.activeModel || 'None'}</div>
                <div>Temp: {syncRequestPending.parameters?.temperature ?? 'N/A'}</div>
                <div>Context: {syncRequestPending.parameters?.num_ctx ?? 'N/A'}</div>
                <div>Reasoning: {syncRequestPending.thinkMode ? 'ON' : 'OFF'}</div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setSyncRequestPending(null)}>
                {lang === 'ja' ? '拒否' : 'Deny'}
              </button>
              <button className="btn-accent" onClick={handleAcceptSyncRequest}>
                {lang === 'ja' ? '承認' : 'Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
