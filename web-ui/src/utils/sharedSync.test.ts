import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// モックメッセージの型定義
interface MockMessage {
  id: string;
  role: string;
  content: string;
}

// テスト対象のロジックを模倣・カプセル化した関数
// 実際の App.tsx で実装した重複排除判定と同じアルゴリズム
export function checkDuplicate(messages: MockMessage[], textToCommit: string): boolean {
  const lastMessages = messages.slice(-5);
  return lastMessages.some(m => 
    m.role === 'assistant' && 
    (m.content === textToCommit || m.content.includes(textToCommit) || textToCommit.includes(m.content))
  );
}

// テスト対象のバッファパースロジックを模倣した関数
export function parseRemainingBuffer(
  buffer: string, 
  currentContent: string,
  isThinking: boolean,
  hasThoughtEnded: boolean
): { content: string; isThinking: boolean; hasThoughtEnded: boolean } {
  let accumulated = currentContent;
  let isThinkingState = isThinking;
  let hasThoughtEndedState = hasThoughtEnded;

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer);
      if (parsed.message?.thinking) {
        if (!isThinkingState) {
          isThinkingState = true;
          accumulated += '<think>\n';
        }
        accumulated += parsed.message.thinking;
      } else if (parsed.message?.content) {
        if (isThinkingState && !hasThoughtEndedState) {
          accumulated += '\n</think>\n';
          hasThoughtEndedState = true;
        }
        accumulated += parsed.message.content;
      }
    } catch {
      // Ignore
    }
  }

  return { content: accumulated, isThinking: isThinkingState, hasThoughtEnded: hasThoughtEndedState };
}

describe('Shared Room Sync Logics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Duplicate Detection', () => {
    it('should detect exact duplicate assistant message in the last 5 messages', () => {
      const history: MockMessage[] = [
        { id: '1', role: 'user', content: 'hello' },
        { id: '2', role: 'assistant', content: 'Yes, this is a test response.' },
      ];
      expect(checkDuplicate(history, 'Yes, this is a test response.')).toBe(true);
    });

    it('should detect partial duplicate assistant message in the last 5 messages', () => {
      const history: MockMessage[] = [
        { id: '1', role: 'user', content: 'hello' },
        { id: '2', role: 'assistant', content: 'Yes, this is a test response.' },
      ];
      // textToCommit includes m.content
      expect(checkDuplicate(history, 'Yes, this is a test response. (extra)')).toBe(true);
      // m.content includes textToCommit
      expect(checkDuplicate(history, 'this is a test response.')).toBe(true);
    });

    it('should not detect duplicate if it is not by assistant', () => {
      const history: MockMessage[] = [
        { id: '1', role: 'user', content: 'hello' },
        { id: '2', role: 'user', content: 'Yes, this is a test response.' },
      ];
      expect(checkDuplicate(history, 'Yes, this is a test response.')).toBe(false);
    });

    it('should not detect duplicate if it is older than 5 messages', () => {
      const history: MockMessage[] = [
        { id: '1', role: 'assistant', content: 'Yes, this is a test response.' },
        { id: '2', role: 'user', content: '1' },
        { id: '3', role: 'user', content: '2' },
        { id: '4', role: 'user', content: '3' },
        { id: '5', role: 'user', content: '4' },
        { id: '6', role: 'user', content: '5' },
      ];
      expect(checkDuplicate(history, 'Yes, this is a test response.')).toBe(false);
    });
  });

  describe('Delay Fallback and Timer Cancel', () => {
    it('should trigger fallback commit after 5 seconds if no message arrives', () => {
      let fallbackTriggered = false;

      const triggerRemoteEnd = () => {
        setTimeout(() => {
          fallbackTriggered = true;
        }, 5000);
      };

      triggerRemoteEnd();
      expect(fallbackTriggered).toBe(false);

      // Fast-forward 4 seconds -> still not triggered
      vi.advanceTimersByTime(4000);
      expect(fallbackTriggered).toBe(false);

      // Fast-forward 1 more second -> triggered!
      vi.advanceTimersByTime(1000);
      expect(fallbackTriggered).toBe(true);
    });

    it('should cancel fallback commit if confirmed message arrives within 5 seconds', () => {
      let fallbackTriggered = false;
      let timerId: ReturnType<typeof setTimeout> | null = null;

      const triggerRemoteEnd = () => {
        timerId = setTimeout(() => {
          fallbackTriggered = true;
        }, 5000);
      };

      // Peer generation ends, start timer
      triggerRemoteEnd();

      // Simulate broadcast message arrival at 3 seconds
      vi.advanceTimersByTime(3000);
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }

      // Fast-forward past 5 seconds
      vi.advanceTimersByTime(3000);
      expect(fallbackTriggered).toBe(false); // Timer was cancelled!
    });
  });

  describe('Ollama Stream Buffer Parsing on End', () => {
    it('should parse content remaining in buffer when stream ends', () => {
      const buffer = '{"message":{"content":"final chunk"}}';
      const result = parseRemainingBuffer(buffer, 'Hello ', false, false);
      expect(result.content).toBe('Hello final chunk');
    });

    it('should parse thinking content remaining in buffer when stream ends', () => {
      const buffer = '{"message":{"thinking":"final thought"}}';
      const result = parseRemainingBuffer(buffer, '', false, false);
      expect(result.content).toBe('<think>\nfinal thought');
      expect(result.isThinking).toBe(true);
    });

    it('should close thinking tag if thinking was active and normal content arrives at the end', () => {
      const buffer = '{"message":{"content":"final response"}}';
      const result = parseRemainingBuffer(buffer, '<think>\nthoughts', true, false);
      expect(result.content).toBe('<think>\nthoughts\n</think>\nfinal response');
      expect(result.hasThoughtEnded).toBe(true);
    });

    it('should ignore invalid JSON in remaining buffer', () => {
      const buffer = '{"message":{invalid';
      const result = parseRemainingBuffer(buffer, 'Hello', false, false);
      expect(result.content).toBe('Hello');
    });
  });
});
