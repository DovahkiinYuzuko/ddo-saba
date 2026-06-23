import React from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { ChatSession, LocaleStrings } from '../types';

export interface SidebarProps {
  chats: ChatSession[];
  activeChatId: string | null;
  isSidebarOpen: boolean;
  onAddTab: (isRemote?: boolean) => void;
  onSwitchTab: (id: string) => void;
  onDeleteTab: (id: string, e?: React.MouseEvent, isRemote?: boolean) => void;
  t: LocaleStrings;
}

export default function Sidebar({
  chats,
  activeChatId,
  isSidebarOpen,
  onAddTab,
  onSwitchTab,
  onDeleteTab,
  t
}: SidebarProps) {
  return (
    <aside className={`sidebar-column ${isSidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h2>{t.chats}</h2>
        <button className="icon-btn-accent" onClick={() => onAddTab(false)} title={t.newChat}>
          <Plus size={18} />
        </button>
      </div>
      
      <div className="tab-list">
        {chats.map(c => (
          <div 
            key={c.id} 
            className={`tab-item ${activeChatId === c.id ? 'active' : ''}`}
            onClick={() => onSwitchTab(c.id)}
          >
            <Trash2 size={16} className="tab-icon" />
            <span className="tab-title">{c.title}</span>
            <button className="tab-close-btn" onClick={(e) => onDeleteTab(c.id, e, false)}>
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
  );
}
