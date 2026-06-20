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
  broadcastMessage 
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
    return {
      connectionUrl: window.location.origin.includes('localhost:3000')
        ? 'http://localhost:8088'
        : window.location.origin,
      accessToken: tokenFromUrl,
      isSharedMode: false,
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
  const [psInfo, setPsInfo] = useState<PsModelInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const isGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sendOnEnter, setSendOnEnter] = useState<boolean>(true);
  const [contextUsed, setContextUsed] = useState<number>(0);

  // Separate model fallback logic
  useEffect(() => {
    if (activeModel) {
      const modelNames = models.map(m => m.name);
      if (models.length > 0 && !modelNames.includes(activeModel)) {
        setTimeout(() => setActiveModel(models[0].name), 0);
      } else if (models.length === 0) {
        setTimeout(() => setActiveModel(''), 0);
      }
    }
  }, [models, activeModel]);

  const [inputText, setInputText] = useState<string>('');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

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
      try {
        await keepAliveModel(activeModel, settings.connectionUrl, settings.accessToken);
      } catch (e) {
        console.error("Keep alive refresh failed", e);
      }
    }, 240000); // 4 minutes
    return () => clearInterval(interval);
  }, [activeModel, settings.connectionUrl, settings.accessToken]);

  const [lastPolledMsgId, setLastPolledMsgId] = useState<string>('');
  const lastPolledMsgIdRef = useRef(lastPolledMsgId);
  useEffect(() => {
    lastPolledMsgIdRef.current = lastPolledMsgId;
  }, [lastPolledMsgId]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Sync scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId]);

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
    } catch (e) {
      console.error("Failed to connect to Ollama Server status endpoints.", e);
    }
  }, [settings.connectionUrl, settings.accessToken]);

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
      };
      if (data.id && data.id !== lastPolledMsgIdRef.current && data.sender !== settings.username) {
        setLastPolledMsgId(data.id);
        
        // Append shared message to currently active chat session
        if (activeChatId) {
          setChats(prev => prev.map(c => {
            if (c.id === activeChatId) {
              return {
                ...c,
                messages: [...c.messages, {
                  role: data.role || 'user',
                  content: data.content || '',
                  sender: data.sender
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
  }, [settings.connectionUrl, settings.accessToken, settings.username, activeChatId]);

  useEffect(() => {
    if (!settings.isSharedMode) return;
    const interval = setInterval(startBroadcastPolling, 1500);
    return () => clearInterval(interval);
  }, [settings.isSharedMode, startBroadcastPolling]);

  // Unload model from VRAM by calling API with keep_alive: 0
  const handleUnloadModel = async () => {
    if (!psInfo) return;
    try {
      await apiUnloadModel(psInfo.name, settings.connectionUrl, settings.accessToken);
      setPsInfo(null);
      fetchModelsAndPs();
    } catch (e) {
      console.error("Failed to unload model", e);
    }
  };

  const addNewTab = useCallback(() => {
    const newId = Date.now().toString();
    const newChat: ChatSession = {
      id: newId,
      title: `${t.newChat} ${chats.length + 1}`,
      messages: []
    };
    setChats(prev => [...prev, newChat]);
    setActiveChatId(newId);
  }, [t.newChat, chats.length]);

  // Create default tab if none exists
  useEffect(() => {
    if (chats.length === 0) {
      setTimeout(() => {
        addNewTab();
      }, 0);
    }
  }, [chats.length, addNewTab]);

  const deleteTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = chats.filter(c => c.id !== id);
    setChats(filtered);
    if (activeChatId === id) {
      setActiveChatId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeChatId || !activeModel || isGenerating) return;

    const userMessageContent = inputText;
    setInputText('');
    setIsGenerating(true);

    const userMsg: Message = {
      role: 'user',
      content: userMessageContent,
      sender: settings.username
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
            messages: [...c.messages, { id: assistantMsgId, role: 'assistant', content: '', sender: activeModel }]
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
          await broadcastMessage(
            settings.connectionUrl,
            settings.accessToken,
            activeModel,
            'assistant',
            accumulatedContent
          );
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
              messages: [...c.messages, { role: 'system', content: `Error: ${err.message}` }]
            };
          }
          return c;
        }));
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
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
          <button className="icon-btn-accent" onClick={addNewTab} title={t.newChat}>
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
              }}
            >
              <Trash2 size={16} className="tab-icon" />
              <span className="tab-title">{c.title}</span>
              <button className="tab-close-btn" onClick={(e) => deleteTab(c.id, e)}>
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
                loadModelOnSelection(selected);
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
          messages={activeChat?.messages || []}
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
              disabled={isGenerating || isModelLoading}
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
              placeholder={t.placeholder}
              rows={2}
              className="input-textarea"
            />
            {isGenerating ? (
              <button className="action-btn stop-btn" onClick={stopGeneration}>
                <Square size={16} />
              </button>
            ) : (
              <button className="action-btn send-btn" onClick={sendMessage} disabled={!inputText.trim() || isModelLoading}>
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

      <div ref={messagesEndRef} />
    </div>
  );
}
