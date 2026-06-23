import { Menu, Loader2, LogOut, SlidersHorizontal, Settings } from 'lucide-react';
import type { OllamaModelInfo, PsModelInfo, LocaleStrings } from '../types';

export interface ChatHeaderProps {
  activeModel: string;
  models: OllamaModelInfo[];
  psInfo: PsModelInfo | null;
  isEffectivelyLoading: boolean;
  onSelectModel: (modelName: string) => void;
  onUnloadModel: () => void;
  lang: 'en' | 'ja';
  onToggleLang: () => void;
  onToggleParams: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  t: LocaleStrings;
}

export default function ChatHeader({
  activeModel,
  models,
  psInfo,
  isEffectivelyLoading,
  onSelectModel,
  onUnloadModel,
  lang,
  onToggleLang,
  onToggleParams,
  onOpenSettings,
  onToggleSidebar,
  t
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <button
        className="mobile-toggle-btn"
        onClick={onToggleSidebar}
        title={lang === 'ja' ? 'メニューをトグル' : 'Toggle menu'}
      >
        <Menu size={20} />
      </button>

      <div className="model-selector-wrap">
        {isEffectivelyLoading && <Loader2 className="animate-spin" size={16} style={{ color: 'hsl(var(--accent))', flexShrink: 0 }} />}
        <select 
          value={activeModel} 
          onChange={(e) => onSelectModel(e.target.value)}
          disabled={isEffectivelyLoading}
          className="model-select"
          style={{ 
            flex: 1,
            opacity: isEffectivelyLoading ? 0.6 : 1,
            color: isEffectivelyLoading ? 'hsl(var(--text-muted))' : 'inherit'
          }}
        >
          <option value="">{isEffectivelyLoading ? (lang === 'ja' ? 'モデルをロード中...' : 'Loading Model...') : (models.length === 0 ? "No models detected" : t.selectModel)}</option>
          {models.map(m => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        {psInfo && (
          <button 
            onClick={onUnloadModel} 
            className="unload-btn" 
            title={lang === 'ja' ? 'VRAMからアンロード' : 'Unload from VRAM'}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>

      <div className="header-actions">
        <button className="lang-toggle" onClick={onToggleLang}>
          {lang === 'en' ? 'JP' : 'EN'}
        </button>
        <button
          className="mobile-toggle-btn"
          onClick={onToggleParams}
          title={lang === 'ja' ? 'パラメータをトグル' : 'Toggle parameters'}
        >
          <SlidersHorizontal size={20} />
        </button>
        <button className="icon-btn" onClick={onOpenSettings}>
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
