import React from 'react';
import { Send, Square, Globe, Lock } from 'lucide-react';
import type { LocaleStrings } from '../types';

export interface ChatInputAreaProps {
  inputText: string;
  isGenerating: boolean;
  isRemoteGenerating: boolean;
  isModelLoading: boolean;
  sendOnEnter: boolean;
  activeChatId: string | null;
  myJobId: string | null;
  jobQueueLength: number;
  isSharedMode: boolean;
  onChangeInput: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  onCancelQueue: () => void;
  t: LocaleStrings;
  lang: 'en' | 'ja';
}

export default function ChatInputArea({
  inputText,
  isGenerating,
  isRemoteGenerating,
  isModelLoading,
  sendOnEnter,
  activeChatId,
  myJobId,
  jobQueueLength,
  isSharedMode,
  onChangeInput,
  onSend,
  onStop,
  onCancelQueue,
  t,
  lang
}: ChatInputAreaProps) {
  const getQueuePosition = () => {
    // We would ideally need to find the queue position.
    // For this simple extract, we'll just show that it's waiting if position is not easily available here.
    return lang === 'ja' ? `順番待ちしています...` : `Waiting in queue...`;
  };

  const placeholderText = !activeChatId
    ? (lang === 'ja' ? '左側の「＋」から新しいチャットを作成してください' : 'Please create a new chat using the "+" button on the left.')
    : myJobId !== null
      ? getQueuePosition()
      : isRemoteGenerating
        ? (lang === 'ja' ? '他のユーザーが推論中です...' : 'Another user is thinking...')
        : t.placeholder;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (sendOnEnter && !e.shiftKey) {
        e.preventDefault();
        onSend();
      } else if (!sendOnEnter && e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    }
  };

  return (
    <footer className="chat-input-bar">
      <div className="input-wrap">
        <textarea 
          value={inputText}
          disabled={isGenerating || isModelLoading || (!isSharedMode && isRemoteGenerating) || !activeChatId || myJobId !== null}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          rows={2}
          className="input-textarea"
        />
        {isGenerating ? (
          <button className="action-btn stop-btn" onClick={onStop}>
            <Square size={16} />
          </button>
        ) : myJobId !== null ? (
          <button 
            className="action-btn stop-btn" 
            onClick={onCancelQueue}
            title={lang === 'ja' ? 'キューから取り下げる' : 'Withdraw from queue'}
            style={{ width: 'auto', padding: '0 12px', fontSize: '0.8rem' }}
          >
            {lang === 'ja' ? '取り下げる' : 'Cancel'}
          </button>
        ) : (
          <button 
            className="action-btn send-btn" 
            onClick={onSend} 
            disabled={!inputText.trim() || isModelLoading || (!isSharedMode && isRemoteGenerating) || !activeChatId}
          >
            <Send size={16} />
          </button>
        )}
      </div>
      <div className="input-footer-settings">
        <span>{isSharedMode ? <Globe size={14} className="shared-indicator" /> : <Lock size={14} />}</span>
        <span className="mode-text">{isSharedMode ? t.sharedRoomMode : t.privateMode}</span>
        {isSharedMode && jobQueueLength > 0 && (
          <span className="queue-status-indicator" style={{ marginLeft: '12px', color: 'hsl(var(--warning))', fontSize: '0.75rem', fontWeight: 600 }}>
            {lang === 'ja' ? `待ち行列: ${jobQueueLength}人` : `Queue: ${jobQueueLength} waiting`}
          </span>
        )}
      </div>
    </footer>
  );
}
