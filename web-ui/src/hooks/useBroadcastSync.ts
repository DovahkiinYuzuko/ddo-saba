import { useEffect, useCallback, useRef } from 'react';
import type { DdoSettings, ChatSession } from '../types';
import { pollMessage } from '../api/broadcast';
import { formatTimestamp } from '../utils/format';

interface UseBroadcastSyncProps {
  isInitialized: boolean;
  settings: DdoSettings;
  activeChatId: string | null;
  lastPolledMsgId: string;
  updateLastPolledMsgId: (id: string) => void;
  fallbackTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setRemoteGeneratingText: (text: string) => void;
  setSyncRequestPending: (payload: any) => void;
  addNewTab: (isRemote?: boolean, remoteId?: string, remoteTitle?: string) => void;
  deleteTab: (id: string, e?: React.MouseEvent, isRemote?: boolean) => void;
  setActiveChatId: (id: string | null) => void;
  handleActiveCount: (count: number) => void;
}

export function useBroadcastSync({
  isInitialized,
  settings,
  activeChatId,
  lastPolledMsgId,
  updateLastPolledMsgId,
  fallbackTimerRef,
  setChats,
  setRemoteGeneratingText,
  setSyncRequestPending,
  addNewTab,
  deleteTab,
  setActiveChatId,
  handleActiveCount
}: UseBroadcastSyncProps) {
  
  const lastPolledMsgIdRef = useRef(lastPolledMsgId);
  const activeChatIdRef = useRef(activeChatId);

  useEffect(() => {
    lastPolledMsgIdRef.current = lastPolledMsgId;
  }, [lastPolledMsgId]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const startBroadcastPolling = useCallback(async () => {
    try {
      const messages = (await pollMessage(
        settings.connectionUrl,
        settings.accessToken,
        lastPolledMsgIdRef.current,
        settings.username,
        handleActiveCount
      )) as Array<{
        id?: string;
        sender?: string;
        broadcaster?: string;
        role?: 'user' | 'assistant' | 'system';
        content?: string;
        timestamp?: string;
      }>;

      if (!Array.isArray(messages) || messages.length === 0) return;

      for (const data of messages) {
        const isMyMessage = data.sender === settings.username || data.broadcaster === settings.username;
        if (data.id && data.id !== lastPolledMsgIdRef.current) {
          lastPolledMsgIdRef.current = data.id;
          updateLastPolledMsgId(data.id);
          
          if (!isMyMessage) {
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
                continue;
              } else if (data.content.startsWith('tab_create:')) {
                const parts = data.content.split(':');
                const tabId = parts[1];
                const tabTitle = parts.slice(2).join(':');
                if (tabId) {
                  addNewTab(true, tabId, tabTitle);
                }
                continue;
              } else if (data.content.startsWith('tab_delete:')) {
                const tabId = data.content.substring('tab_delete:'.length);
                if (tabId) {
                  deleteTab(tabId, undefined, true);
                }
                continue;
              } else if (data.content.startsWith('tab_switch:')) {
                const tabId = data.content.substring('tab_switch:'.length);
                if (tabId) {
                  setActiveChatId(tabId);
                }
                continue;
              }
            }

            // Append shared message to currently active chat session
            if (activeChatIdRef.current) {
              setChats(prev => prev.map(c => {
                if (c.id === activeChatIdRef.current) {
                  if (data.id && c.messages.some(m => m.id === data.id)) {
                    return c;
                  }
                  if (data.role === 'assistant' && fallbackTimerRef.current) {
                    clearTimeout(fallbackTimerRef.current);
                    fallbackTimerRef.current = null;
                    setRemoteGeneratingText('');
                  }
                  return {
                    ...c,
                    messages: [...c.messages, {
                      id: data.id,
                      role: data.role || 'user',
                      content: data.content || '',
                      sender: data.sender,
                      broadcaster: data.broadcaster,
                      timestamp: data.timestamp ? formatTimestamp(data.timestamp) : undefined
                    }]
                  };
                }
                return c;
              }));
            }
          }
        }
      }
    } catch (e) {
      console.error("Broadcasting poll failed", e);
    }
  }, [settings.connectionUrl, settings.accessToken, settings.username, addNewTab, deleteTab, handleActiveCount, updateLastPolledMsgId, setChats, fallbackTimerRef, setRemoteGeneratingText, setSyncRequestPending, setActiveChatId]);

  useEffect(() => {
    if (!isInitialized || !settings.accessToken || !settings.isSharedMode) return;
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (!active) return;
      await startBroadcastPolling();
      if (active) {
        timerId = setTimeout(poll, 1500);
      }
    };

    void poll();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isInitialized, settings.accessToken, settings.isSharedMode, startBroadcastPolling]);
}
