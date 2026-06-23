export interface MessageMetrics {
  totalDurationSec?: number;
  promptTokens?: number;
  evalTokens?: number;
  tokensPerSec?: number;
  thinkDurationSec?: number;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sender?: string;
  broadcaster?: string;
  metrics?: MessageMetrics;
  timestamp?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

export interface PsModelInfo {
  name: string;
  size: number;
  processor: string;
  until: string;
}

export interface OllamaModelInfo {
  name: string;
  size?: number;
}

export interface DdoSettings {
  connectionUrl: string;
  accessToken: string;
  isSharedMode: boolean;
  username: string;
}

export interface DdoParameters {
  temperature: number;
  num_ctx: number;
  min_p: number;
  top_p: number;
  top_k: number;
  num_predict: number;
  repeat_penalty: number;
}

export interface LocaleStrings {
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
  error400: string;
  error403: string;
  error404: string;
  error503: string;
  errorGeneric: string;
}

export interface QueueJob {
  id: string;
  username: string;
  timestamp: number;
  status: 'waiting' | 'running';
}
