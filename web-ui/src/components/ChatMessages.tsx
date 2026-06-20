import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  FolderOpen, 
  Upload, 
  Loader2, 
  Check, 
  Copy 
} from 'lucide-react';
import type { Message, LocaleStrings } from '../types';
import './ChatMessages.css';

interface ChatMessagesProps {
  messages: Message[];
  onImportCassette: (e: React.ChangeEvent<HTMLInputElement>) => void;
  expandedThinking: Record<string, boolean>;
  onToggleThinking: (msgKey: string, isOpen: boolean) => void;
  collapseThinking: boolean;
  t: LocaleStrings;
}

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

export default React.forwardRef<HTMLDivElement, ChatMessagesProps>(function ChatMessages({
  messages,
  onImportCassette,
  expandedThinking,
  onToggleThinking,
  collapseThinking,
  t
}: ChatMessagesProps, ref) {

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
            code({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <SyntaxHighlighter
                  {...props}
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
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
      const isThinkingExpanded = expandedThinking[msgKey] ?? !collapseThinking;
      if (thinkEnd !== -1) {
        const thinking = content.slice(thinkStart + 7, thinkEnd).trim();
        const answer = content.slice(thinkEnd + 8).trim();
        return (
          <div className="message-cot-container">
            <details 
              className="cot-details" 
              open={isThinkingExpanded}
              onToggle={(e) => onToggleThinking(msgKey, e.currentTarget.open)}
            >
              <summary className="cot-summary">{t.thinking}</summary>
              {isThinkingExpanded && <div className="cot-content">{renderMarkdownContent(thinking)}</div>}
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
              onToggle={(e) => onToggleThinking(msgKey, e.currentTarget.open)}
            >
              <summary className="cot-summary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 className="animate-spin" size={14} />
                <span>{t.thinking}...</span>
              </summary>
              {isThinkingExpanded && <div className="cot-content">{renderMarkdownContent(thinking)}</div>}
            </details>
          </div>
        );
      }
    }
    return <div className="raw-content">{renderMarkdownContent(content)}</div>;
  };

  return (
    <div className="chat-messages-scroll" ref={ref}>
      {messages.length === 0 && (
        <div className="empty-state">
          <FolderOpen size={48} className="empty-icon" />
          <p>{t.noChats}</p>
          <div className="import-box">
            <label className="btn-secondary clickable">
              <Upload size={16} />
              <span>{t.import}</span>
              <input type="file" accept=".json" onChange={onImportCassette} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      )}

      {messages.map((m, idx) => (
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
            {m.role === 'assistant' && m.metrics && (
              <div className="message-metrics">
                {m.metrics.thinkDurationSec && m.metrics.thinkDurationSec > 0 ? `Think: ${m.metrics.thinkDurationSec}s | ` : ''}
                {`Time: ${m.metrics.totalDurationSec}s | Speed: ${m.metrics.tokensPerSec} tok/s | Tokens: ${m.metrics.evalTokens} (gen) / ${m.metrics.promptTokens} (prompt)`}
              </div>
            )}
          </div>
          {m.content && <CopyButton text={m.content} />}
        </div>
      ))}
    </div>
  );
});
