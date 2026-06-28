import { useCallback } from 'react';
import type { ChatSession, DdoSettings, LocaleStrings } from '../types';
import { broadcastMessage } from '../api/broadcast';

interface UseTabManagementProps {
  chats: ChatSession[];
  activeChatId: string | null;
  settings: DdoSettings;
  t: LocaleStrings;
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setActiveChatId: (id: string | null) => void;
  updateLastPolledMsgId: (id: string) => void;
}

export function useTabManagement({
  chats,
  activeChatId,
  settings,
  t,
  setChats,
  setActiveChatId,
  updateLastPolledMsgId
}: UseTabManagementProps) {
  
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
        settings.username,
        'system',
        `tab_create:${newId}:${title}`
      ).then(result => {
        if (result && result.id) {
          updateLastPolledMsgId(result.id);
        }
      }).catch(e => console.error("Failed to broadcast tab_create", e));
    }
  }, [t.newChat, chats.length, settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username, setChats, setActiveChatId, updateLastPolledMsgId]);

  const deleteTab = useCallback((id: string, e?: React.MouseEvent, isRemote = false) => {
    if (e) e.stopPropagation();
    
    let nextActiveId: string | null = activeChatId;
    if (activeChatId === id) {
      const remaining = chats.filter(c => c.id !== id);
      nextActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      setActiveChatId(nextActiveId);

      if (settings.isSharedMode && !isRemote && nextActiveId) {
        void broadcastMessage(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          settings.username,
          'system',
          `tab_switch:${nextActiveId}`
        ).then(result => {
          if (result && result.id) {
            updateLastPolledMsgId(result.id);
          }
        }).catch(e => console.error("Failed to broadcast tab_switch", e));
      }
    }

    setChats(prev => prev.filter(c => c.id !== id));

    if (settings.isSharedMode && !isRemote) {
      void broadcastMessage(
        settings.connectionUrl,
        settings.accessToken,
        settings.username,
        settings.username,
        'system',
        `tab_delete:${id}`
      ).then(result => {
        if (result && result.id) {
          updateLastPolledMsgId(result.id);
        }
      }).catch(e => console.error("Failed to broadcast tab_delete", e));
    }
  }, [chats, activeChatId, settings.isSharedMode, settings.connectionUrl, settings.accessToken, settings.username, setChats, setActiveChatId, updateLastPolledMsgId]);

  return {
    addNewTab,
    deleteTab
  };
}
