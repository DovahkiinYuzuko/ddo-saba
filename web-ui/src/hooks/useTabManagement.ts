import { useCallback } from 'react';
import type { ChatSession, LocaleStrings } from '../types';

interface UseTabManagementProps {
  chats: ChatSession[];
  activeChatId: string | null;
  t: LocaleStrings;
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setActiveChatId: (id: string | null) => void;
}

export function useTabManagement({
  chats,
  activeChatId,
  t,
  setChats,
  setActiveChatId
}: UseTabManagementProps) {
  
  const addNewTab = useCallback(() => {
    const newId = Date.now().toString();
    const title = `${t.newChat} ${chats.length + 1}`;
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

  }, [t.newChat, chats.length, setChats, setActiveChatId]);

  const deleteTab = useCallback((id: string) => {
    
    let nextActiveId: string | null = activeChatId;
    if (activeChatId === id) {
      const remaining = chats.filter(c => c.id !== id);
      nextActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      setActiveChatId(nextActiveId);

    }

    setChats(prev => prev.filter(c => c.id !== id));

  }, [chats, activeChatId, setChats, setActiveChatId]);

  return {
    addNewTab,
    deleteTab
  };
}
