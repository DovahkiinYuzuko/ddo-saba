import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Send, 
  Square, 
  Settings, 
  Plus, 
  Trash2, 
  Globe, 
  Lock, 
  Download, 
  Upload, 
  Cpu, 
  Sliders, 
  MessageSquare,
  AlertTriangle,
  FolderOpen,
  Copy,
  Check,
  Loader2,
  LogOut
} from 'lucide-react';

// Multi-language locale dictionary (defaults to English, supports Japanese)
interface LocaleStrings {
  title: string;
  chats: string;
  newChat: string;
  noChats: string;
  temporaryWarning: string;
  settings: string;
  modelParameters: string;
  preset: string;
  systemPrompt: string;
  temperature: string;
  minP: string;
  topP: string;
  topK: string;
  maxTokens: string;
  repeatPenalty: string;
  reasoningMode: string;
  loadedModel: string;
  noLoadedModel: string;
  connectionUrl: string;
  accessToken: string;
  username: string;
  sharedRoomMode: string;
  privateMode: string;
  export: string;
  import: string;
  placeholder: string;
  send: string;
  stop: string;
  vram: string;
  device: string;
  until: string;
  thinking: string;
  close: string;
  sendOnEnter: string;
  contextLimit: string;
  selectModel: string;
  collapseThinking: string;
}

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

interface MessageMetrics {
  totalDurationSec?: number;
  promptTokens?: number;
  evalTokens?: number;
  tokensPerSec?: number;
  thinkDurationSec?: number;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sender?: string;
  metrics?: MessageMetrics; /* ponytail: store inference performance stats */
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

interface PsModelInfo {
  name: string;
  size: number;
  processor: string;
  until: string;
}

function formatBytes(bytes?: number) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ponytail: Helper component to copy raw markdown text to clipboard with feedback
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy raw markdown text">
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

export default function App() {
  const [lang, setLang] = useState<'en' | 'ja'>(
    navigator.language.startsWith('ja') ? 'ja' : 'en'
  );
  const t = locales[lang];

  // State Definitions matching the variable specification document
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  const [settings, setSettings] = useState({
    connectionUrl: window.location.origin.includes('localhost:3000') 
      ? 'http://localhost:8088' 
      : window.location.origin,
    accessToken: '',
    isSharedMode: false,
    username: 'Guest_' + Math.floor(Math.random() * 1000)
  });

  const [models, setModels] = useState<{ name: string; size?: number }[]>([]);
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
  const [parameters, setParameters] = useState({
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sendOnEnter, setSendOnEnter] = useState<boolean>(true); /* ponytail: toggle send action shortcut */
  const [contextUsed, setContextUsed] = useState<number>(0); /* ponytail: track active context token usage */
  // ponytail: Separate model fallback logic to avoid timing/closure issues
  useEffect(() => {
    if (activeModel) {
      const modelNames = models.map(m => m.name);
      if (models.length > 0 && !modelNames.includes(activeModel)) {
        setActiveModel(models[0].name);
      } else if (models.length === 0) {
        setActiveModel('');
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
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (settings.accessToken) {
        headers['X-DDO-Token'] = settings.accessToken;
      }
      const res = await fetch(`${settings.connectionUrl}/api/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          keep_alive: 300
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (e: any) {
      console.error("Failed to pre-load model into VRAM", e);
      setModelLoadError(e.message || "Failed to load model");
      setActiveModel('');
    } finally {
      setIsModelLoading(false);
    }
  };

  // ponytail: Active session background keep-alive refresh
  useEffect(() => {
    if (!activeModel || activeModel === "" || isGenerating) return;
    const interval = setInterval(async () => {
      try {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (settings.accessToken) {
          headers['X-DDO-Token'] = settings.accessToken;
        }
        await fetch(`${settings.connectionUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: activeModel,
            messages: [],
            keep_alive: 300
          })
        });
      } catch (e) {
        console.error("Keep alive refresh failed", e);
      }
    }, 240000); // 4 minutes
    return () => clearInterval(interval);
  }, [activeModel, settings.connectionUrl, settings.accessToken, isGenerating]);
  const [lastPolledMsgId, setLastPolledMsgId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Sync scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId]);

  // Initial tags/ps fetch and interval polling
  useEffect(() => {
    fetchModelsAndPs();
    const interval = setInterval(fetchModelsAndPs, 5000);
    return () => clearInterval(interval);
  }, [settings.connectionUrl, settings.accessToken]);

  // Polling for shared room mode
  useEffect(() => {
    if (!settings.isSharedMode) return;
    const interval = setInterval(startBroadcastPolling, 1500);
    return () => clearInterval(interval);
  }, [settings.isSharedMode, chats, activeChatId, lastPolledMsgId]);

  // ponytail: Unload model from VRAM by calling API with keep_alive: 0
  const unloadModel = async () => {
    if (!psInfo) return;
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (settings.accessToken) {
        headers['X-DDO-Token'] = settings.accessToken;
      }
      
      await fetch(`${settings.connectionUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: psInfo.name,
          messages: [],
          keep_alive: 0
        })
      });
      
      setPsInfo(null);
      fetchModelsAndPs();
    } catch (e) {
      console.error("Failed to unload model", e);
    }
  };

  // Create default tab if none exists
  useEffect(() => {
    if (chats.length === 0) {
      addNewTab();
    }
  }, [chats]);

  const fetchModelsAndPs = async () => {
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (settings.accessToken) {
        headers['X-DDO-Token'] = settings.accessToken;
      }

      // Fetch Local Models
      const tagsRes = await fetch(`${settings.connectionUrl}/api/tags`, { headers });
      if (tagsRes.ok) {
        const data = await tagsRes.json();
        const modelObjects = data.models?.map((m: any) => ({
          name: m.name,
          size: m.size
        })) || [];
        
        // Prevent state update if the model list hasn't changed
        setModels(prev => {
          if (JSON.stringify(prev) === JSON.stringify(modelObjects)) return prev;
          return modelObjects;
        });

        // ponytail: Fallback logic is handled by a dedicated useEffect above
      }

      // Fetch Running Models status
      const psRes = await fetch(`${settings.connectionUrl}/api/ps`, { headers });
      if (psRes.ok) {
        const data = await psRes.json();
        if (data.models && data.models.length > 0) {
          const m = data.models[0];
          setPsInfo({
            name: m.name,
            size: m.size,
            processor: m.size_vram > 0 ? 'GPU' : 'CPU',
            until: m.expires_at || ''
          });
        } else {
          setPsInfo(null);
        }
      }
    } catch (e) {
      console.error("Failed to connect to Ollama Server status endpoints.", e);
    }
  };

  const startBroadcastPolling = async () => {
    try {
      const res = await fetch(`${settings.connectionUrl}/api/poll`);
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.id && data.id !== lastPolledMsgId && data.sender !== settings.username) {
        setLastPolledMsgId(data.id);
        
        // Append shared message to currently active chat session
        if (activeChatId) {
          setChats(prev => prev.map(c => {
            if (c.id === activeChatId) {
              return {
                ...c,
                messages: [...c.messages, {
                  role: data.role,
                  content: data.content,
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
  };

  const addNewTab = () => {
    const newId = Date.now().toString();
    const newChat: ChatSession = {
      id: newId,
      title: `${t.newChat} ${chats.length + 1}`,
      messages: []
    };
    setChats(prev => [...prev, newChat]);
    setActiveChatId(newId);
  };

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

    let targetChat = chats.find(c => c.id === activeChatId);
    if (!targetChat) return;

    // Append user message locally
    const updatedMessages = [...targetChat.messages, userMsg];
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return { ...c, messages: updatedMessages };
      }
      return c;
    }));

    // Broadcast user message if Shared Room mode is active
    if (settings.isSharedMode) {
      try {
        await fetch(`${settings.connectionUrl}/api/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: settings.username,
            role: 'user',
            content: userMessageContent
          })
        });
      } catch (e) {
        console.error("Failed to broadcast user message", e);
      }
    }

    // Prepare inference API request payload
    // Map system prompt and options settings
    const requestMessages = [];
    if (systemPrompt) {
      requestMessages.push({ role: 'system', content: systemPrompt });
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
      const optionsPayload: Record<string, any> = { ...parameters };
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
            // ponytail: Use the selected activeModel name as the sender signature
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
              
              // ponytail: Record timestamps for CoT (think) duration
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
                // Update assistant message state incrementally (streaming UI typewriter effect)
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

              // ponytail: Capture inference metrics at the end of the stream
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

                // Update total context token usage stats
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
            } catch (err) {
              // Ignore partial JSON line parse errors during chunk cuts
            }
          }
        }
      }

      // After streaming is complete, broadcast assistant message if Shared Room mode is active
      if (settings.isSharedMode && accumulatedContent) {
        try {
          await fetch(`${settings.connectionUrl}/api/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: activeModel,
              role: 'assistant',
              content: accumulatedContent
            })
          });
        } catch (e) {
          console.error("Failed to broadcast assistant message", e);
        }
      }

    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log("Inference stream aborted.");
      } else {
        console.error("Inference request failed.", e);
        // Display error message inside chat log
        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            return {
              ...c,
              messages: [...c.messages, { role: 'system', content: `Error: ${e.message}` }]
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
      } catch (err) {
        alert("Failed to parse cassette JSON file. Make sure it conforms to DDO Saba specifications.");
      }
    };
    reader.readAsText(file);
  };

  function exportPreset() {
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
  }

  function importPreset(e: React.ChangeEvent<HTMLInputElement>) {
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
      } catch (err) {
        alert("Failed to parse preset JSON file.");
      }
    };
    reader.readAsText(file);
  };

  // Helper parser to extract <think> blocks and render Markdown / LaTeX with Syntax Highlighting
  const parseMessageContent = (content: string, msgKey: string) => {
    const thinkStart = content.indexOf('<think>');
    const thinkEnd = content.indexOf('</think>');

    const renderMarkdownContent = (txt: string) => {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <SyntaxHighlighter
                  {...props}
                  children={String(children).replace(/\n$/, '')}
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                />
              ) : (
                <code {...props} className={className}>
                  {children}
                </code>
              );
            }
          }}
        >
          {txt}
        </ReactMarkdown>
      );
    };

    if (thinkStart !== -1) {
      const isThinkingExpanded = expandedThinking[msgKey] ?? (thinkEnd === -1 ? true : !collapseThinking);
      if (thinkEnd !== -1) {
        const thinking = content.slice(thinkStart + 7, thinkEnd).trim();
        const answer = content.slice(thinkEnd + 8).trim();
        return (
          <div className="message-cot-container">
            <details 
              className="cot-details" 
              open={isThinkingExpanded}
              onToggle={(e) => handleThinkingToggle(msgKey, e.currentTarget.open)}
            >
              <summary className="cot-summary">{t.thinking}</summary>
              <div className="cot-content">{renderMarkdownContent(thinking)}</div>
            </details>
            <div className="cot-answer">{renderMarkdownContent(answer)}</div>
          </div>
        );
      } else {
        const thinking = content.slice(thinkStart + 7).trim();
        return (
          <div className="message-cot-container">
            <details 
              className="cot-details" 
              open={isThinkingExpanded}
              onToggle={(e) => handleThinkingToggle(msgKey, e.currentTarget.open)}
            >
              <summary className="cot-summary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 className="animate-spin" size={14} />
                <span>{t.thinking}...</span>
              </summary>
              <div className="cot-content">{renderMarkdownContent(thinking)}</div>
            </details>
          </div>
        );
      }
    }
    return <div className="raw-content">{renderMarkdownContent(content)}</div>;
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
        } catch (err) {
          alert("Malformed cassette JSON.");
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="app-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      
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
              onClick={() => setActiveChatId(c.id)}
            >
              <MessageSquare size={16} className="tab-icon" />
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
          <div className="model-selector-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
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
                <option value="">{models.length === 0 ? "No models detected" : (t.selectModel || "Select a model...")}</option>
                {models.map(m => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.size ? `(${formatBytes(m.size)})` : ''}
                  </option>
                ))}
              </select>
              {psInfo && (
                <button 
                  onClick={unloadModel} 
                  className="btn-secondary" 
                  title={lang === 'ja' ? 'VRAMからアンロード' : 'Unload from VRAM'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    cursor: 'pointer',
                    height: '38px',
                    width: '38px',
                    backgroundColor: 'hsl(var(--danger-muted, var(--bg-input)))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius-md)',
                    color: 'hsl(var(--danger, #ef4444))'
                  }}
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>
            {isModelLoading && (
              <div className="model-loading-indicator" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'hsl(var(--accent))', fontSize: '0.8em', fontWeight: 500 }}>
                <Loader2 className="animate-spin" size={14} />
                <span>Loading Model...</span>
              </div>
            )}
            {modelLoadError && (
              <div className="model-load-error" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'hsl(var(--danger))', fontSize: '0.8em', fontWeight: 500 }}>
                <AlertTriangle size={14} />
                <span>{modelLoadError}</span>
              </div>
            )}
          </div>

          <div className="header-actions">
            <button className="lang-toggle" onClick={() => setLang(l => l === 'en' ? 'ja' : 'en')}>
              {lang === 'en' ? 'JP' : 'EN'}
            </button>
            <button className="icon-btn" onClick={() => setShowSettingsModal(true)}>
              <Settings size={20} />
            </button>
          </div>
        </header>

        <div className="chat-messages-scroll">
          {activeChatId && chats.find(c => c.id === activeChatId)?.messages.length === 0 && (
            <div className="empty-state">
              <FolderOpen size={48} className="empty-icon" />
              <p>{t.noChats}</p>
              <div className="import-box">
                <label className="btn-secondary clickable">
                  <Upload size={16} />
                  <span>{t.import}</span>
                  <input type="file" accept=".json" onChange={importCassette} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          )}

          {activeChatId && chats.find(c => c.id === activeChatId)?.messages.map((m, idx) => (
            <div key={idx} className={`message-row ${m.role}`}>
              <div className="message-avatar">
                {m.role === 'user' 
                  ? (m.sender?.slice(0, 2).toUpperCase() || 'US') 
                  : (m.sender?.slice(0, 2).toUpperCase() || 'AI')}
              </div>
              <div className="message-bubble">
                {m.sender && <div className="message-sender">{m.sender}</div>}
                <div className="message-text">
                  {m.content ? parseMessageContent(m.content, m.id || `msg_${idx}`) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--text-muted))' }}>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  )}
                </div>
                {/* ponytail: Display assistant performance metrics below the bubble */}
                {m.role === 'assistant' && m.metrics && (
                  <div className="message-metrics">
                    {m.metrics.thinkDurationSec && m.metrics.thinkDurationSec > 0 ? `Think: ${m.metrics.thinkDurationSec}s | ` : ''}
                    {`Time: ${m.metrics.totalDurationSec}s | Speed: ${m.metrics.tokensPerSec} tok/s | Tokens: ${m.metrics.evalTokens} (gen) / ${m.metrics.promptTokens} (prompt)`}
                  </div>
                )}
              </div>
              {/* ponytail: Hover Copy button (copies Raw Markdown source) */}
              {m.content && <CopyButton text={m.content} />}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <footer className="chat-input-bar">
          <div className="input-wrap">
            <textarea 
              value={inputText}
              disabled={isGenerating || isModelLoading}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                // ponytail: dynamically evaluate keyboard send shortcuts based on configuration toggle
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

      {/* 3. Right Column: Parameters and System Config */}
      <aside className="parameters-column">
        <div className="column-section">
          <h3><Sliders size={16} /> {t.modelParameters}</h3>
          
          <div className="preset-name-input-group" style={{ margin: '8px 0' }}>
            <input
              type="text"
              className="preset-name-input"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={lang === 'ja' ? 'プリセット名' : 'Preset Name'}
              style={{
                width: '100%',
                padding: '6px 10px',
                backgroundColor: 'hsl(var(--bg-input))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-md)',
                color: 'hsl(var(--text-primary))',
                fontSize: '0.9em'
              }}
            />
          </div>

          <div className="input-group">
            <label>{t.reasoningMode}</label>
            <div className="toggle-switch">
              <input 
                type="checkbox" 
                id="think-toggle" 
                checked={thinkMode} 
                onChange={(e) => setThinkMode(e.target.checked)} 
              />
              <label htmlFor="think-toggle"></label>
            </div>
          </div>

          <div className="input-group">
            <label>{t.collapseThinking}</label>
            <div className="toggle-switch">
              <input 
                type="checkbox" 
                id="collapse-think-toggle" 
                checked={collapseThinking} 
                onChange={(e) => setCollapseThinking(e.target.checked)} 
              />
              <label htmlFor="collapse-think-toggle"></label>
            </div>
          </div>

          <div className="input-group font-japanese">
            <label>{t.systemPrompt}</label>
            <textarea 
              value={systemPrompt} 
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="system-prompt-textarea"
              rows={4}
            />
          </div>

          {/* Temperature Slider */}
          <div className="slider-group">
            <div className="slider-header">
              <label>{t.temperature}</label>
              <span>{parameters.temperature}</span>
            </div>
            <input 
              type="range" min="0.0" max="2.0" step="0.1" 
              value={parameters.temperature} 
              onChange={(e) => setParameters(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
            />
          </div>

          {/* Min P Slider */}
          <div className="slider-group">
            <div className="slider-header">
              <label>{t.minP}</label>
              <span>{parameters.min_p}</span>
            </div>
            <input 
              type="range" min="0.0" max="1.0" step="0.01" 
              value={parameters.min_p} 
              onChange={(e) => setParameters(prev => ({ ...prev, min_p: parseFloat(e.target.value) }))}
            />
          </div>

          {/* Top P Slider */}
          <div className="slider-group">
            <div className="slider-header">
              <label>{t.topP}</label>
              <span>{parameters.top_p}</span>
            </div>
            <input 
              type="range" min="0.0" max="1.0" step="0.01" 
              value={parameters.top_p} 
              onChange={(e) => setParameters(prev => ({ ...prev, top_p: parseFloat(e.target.value) }))}
            />
          </div>

          {/* Top K Slider */}
          <div className="slider-group">
            <div className="slider-header">
              <label>{t.topK}</label>
              <span>{parameters.top_k}</span>
            </div>
            <input 
              type="range" min="0" max="100" step="1" 
              value={parameters.top_k} 
              onChange={(e) => setParameters(prev => ({ ...prev, top_k: parseInt(e.target.value) }))}
            />
          </div>

          {/* Max Output Tokens Slider with Toggle */}
          <div className="slider-group">
            <div className="slider-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={numPredictEnabled} 
                  onChange={(e) => setNumPredictEnabled(e.target.checked)} 
                />
                {t.maxTokens}
              </label>
              <span>{numPredictEnabled ? parameters.num_predict : (lang === 'ja' ? '無制限' : 'Unlimited')}</span>
            </div>
            <input 
              type="range" min="128" max="16384" step="128" 
              value={parameters.num_predict} 
              disabled={!numPredictEnabled}
              onChange={(e) => setParameters(prev => ({ ...prev, num_predict: parseInt(e.target.value) }))}
            />
          </div>

          {/* ponytail: Context Limit Slider */}
          <div className="slider-group">
            <div className="slider-header">
              <label>{t.contextLimit || "Context Limit (num_ctx)"}</label>
              <span>{parameters.num_ctx}</span>
            </div>
            <input 
              type="range" min="1024" max="32768" step="1024" 
              value={parameters.num_ctx} 
              onChange={(e) => setParameters(prev => ({ ...prev, num_ctx: parseInt(e.target.value) }))}
            />
          </div>

          {/* Repeat Penalty Slider */}
          <div className="slider-group">
            <div className="slider-header">
              <label>{t.repeatPenalty}</label>
              <span>{parameters.repeat_penalty}</span>
            </div>
            <input 
              type="range" min="0.5" max="2.0" step="0.05" 
              value={parameters.repeat_penalty} 
              onChange={(e) => setParameters(prev => ({ ...prev, repeat_penalty: parseFloat(e.target.value) }))}
            />
          </div>

          {/* Preset Export / Import Actions */}
          <div className="preset-actions-group" style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn-secondary" onClick={exportPreset} style={{ flex: 1, fontSize: '0.85em', padding: '6px' }}>
              {lang === 'ja' ? '設定書き出し' : 'Export Preset'}
            </button>
            <label className="btn-secondary" style={{ flex: 1, fontSize: '0.85em', padding: '6px', textAlign: 'center', cursor: 'pointer', display: 'inline-block' }}>
              {lang === 'ja' ? '設定読み込み' : 'Import Preset'}
              <input type="file" accept=".json" onChange={importPreset} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Dynamic VRAM state status (Ollama ps) */}
        <div className="column-section status-section">
          <h3><Cpu size={16} /> {t.loadedModel}</h3>
          {psInfo ? (
            <div className="status-card">
              <div className="status-row">
                <span className="label">Model:</span>
                <span className="val font-semibold flex items-center gap-2">
                  {psInfo.name}
                </span>
              </div>
              <div className="status-row">
                <span className="label">{t.vram}:</span>
                <span className="val">{(psInfo.size / (1024*1024*1024)).toFixed(2)} GB</span>
              </div>
              <div className="status-row">
                <span className="label">{t.device}:</span>
                <span className="val badge">{psInfo.processor}</span>
              </div>
              <div className="status-row">
                <span className="label">{t.until}:</span>
                <span className="val text-amber-400">{psInfo.until}</span>
              </div>
            </div>
          ) : (
            <p className="no-status-text">{t.noLoadedModel}</p>
          )}
        </div>

        {/* ponytail: Context usage progress and details */}
        <div className="column-section status-section">
          <h3><Sliders size={16} /> Context Memory</h3>
          <div className="status-card">
            <div className="status-row">
              <span className="label">Used / Limit:</span>
              <span className="val">{contextUsed} / {parameters.num_ctx} Tokens</span>
            </div>
            <div style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'hsl(var(--border))',
              borderRadius: '3px',
              marginTop: '8px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${parameters.num_ctx > 0 ? Math.min(100, (contextUsed / parameters.num_ctx) * 100) : 0}%`,
                height: '100%',
                backgroundColor: (contextUsed / parameters.num_ctx) > 0.8 ? 'hsl(var(--danger))' : 'hsl(var(--accent))',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div className="status-row" style={{ marginTop: '4px', fontSize: '0.75rem', justifyContent: 'flex-end' }}>
              <span className="val text-muted">
                {parameters.num_ctx > 0 ? `${Math.min(100, Math.round((contextUsed / parameters.num_ctx) * 100))}%` : '0%'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* 4. Settings Popup / Modal */}
      {showSettingsModal && (
        <div className="modal-backdrop">
          <div className="settings-modal">
            <div className="modal-header">
              <h3>{t.settings}</h3>
              <button className="close-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{t.connectionUrl}</label>
                <input 
                  type="text" 
                  value={settings.connectionUrl} 
                  onChange={(e) => setSettings(prev => ({ ...prev, connectionUrl: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>{t.accessToken}</label>
                <input 
                  type="password" 
                  value={settings.accessToken} 
                  onChange={(e) => setSettings(prev => ({ ...prev, accessToken: e.target.value }))}
                  placeholder="Enter X-DDO-Token"
                />
              </div>

              <div className="form-group">
                <label>{t.username}</label>
                <input 
                  type="text" 
                  value={settings.username} 
                  onChange={(e) => setSettings(prev => ({ ...prev, username: e.target.value }))}
                />
              </div>

              <div className="form-group inline-group">
                <label>{t.sharedRoomMode}</label>
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    id="shared-toggle" 
                    checked={settings.isSharedMode} 
                    onChange={(e) => setSettings(prev => ({ ...prev, isSharedMode: e.target.checked }))} 
                  />
                  <label htmlFor="shared-toggle"></label>
                </div>
              </div>

              <div className="form-group inline-group">
                <label>{t.sendOnEnter}</label>
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    id="send-toggle" 
                    checked={sendOnEnter} 
                    onChange={(e) => setSendOnEnter(e.target.checked)} 
                  />
                  <label htmlFor="send-toggle"></label>
                </div>
              </div>

              <div className="modal-divider"></div>

              <div className="form-actions-cassette">
                <h4>Cassette (JSON Data)</h4>
                <div className="action-row">
                  <button className="btn-secondary" onClick={exportCassette}>
                    <Download size={16} />
                    <span>{t.export}</span>
                  </button>
                  <label className="btn-secondary clickable">
                    <Upload size={16} />
                    <span>{t.import}</span>
                    <input type="file" accept=".json" onChange={importCassette} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-accent" onClick={() => setShowSettingsModal(false)}>{t.close}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
