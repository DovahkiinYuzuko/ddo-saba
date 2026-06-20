import React from 'react';
import { Sliders, Cpu } from 'lucide-react';
import type { DdoParameters, PsModelInfo, LocaleStrings } from '../types';

interface ParameterPanelProps {
  parameters: DdoParameters;
  onChangeParameters: (params: DdoParameters) => void;
  presetName: string;
  onChangePresetName: (name: string) => void;
  systemPrompt: string;
  onChangeSystemPrompt: (prompt: string) => void;
  thinkMode: boolean;
  onChangeThinkMode: (val: boolean) => void;
  collapseThinking: boolean;
  onChangeCollapseThinking: (val: boolean) => void;
  numPredictEnabled: boolean;
  onChangeNumPredictEnabled: (val: boolean) => void;
  psInfo: PsModelInfo | null;
  contextUsed: number;
  onExportPreset: () => void;
  onImportPreset: (e: React.ChangeEvent<HTMLInputElement>) => void;
  t: LocaleStrings;
  lang: 'en' | 'ja';
}

export default function ParameterPanel({
  parameters,
  onChangeParameters,
  presetName,
  onChangePresetName,
  systemPrompt,
  onChangeSystemPrompt,
  thinkMode,
  onChangeThinkMode,
  collapseThinking,
  onChangeCollapseThinking,
  numPredictEnabled,
  onChangeNumPredictEnabled,
  psInfo,
  contextUsed,
  onExportPreset,
  onImportPreset,
  t,
  lang
}: ParameterPanelProps) {

  const handleSliderChange = (key: keyof DdoParameters, value: number) => {
    onChangeParameters({
      ...parameters,
      [key]: value
    });
  };

  return (
    <aside className="parameters-column">
      <div className="column-section">
        <h3><Sliders size={16} /> {t.modelParameters}</h3>
        
        <div className="input-group">
          <label>{lang === 'ja' ? 'プリセット名' : 'Preset Name'}</label>
          <input
            type="text"
            className="preset-name-input"
            value={presetName}
            onChange={(e) => onChangePresetName(e.target.value)}
            placeholder={lang === 'ja' ? 'プリセット名を入力...' : 'Enter preset name...'}
          />
        </div>

        <div className="input-group">
          <label>{t.reasoningMode}</label>
          <div className="toggle-switch">
            <input 
              type="checkbox" 
              id="think-toggle" 
              checked={thinkMode} 
              onChange={(e) => onChangeThinkMode(e.target.checked)} 
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
              onChange={(e) => onChangeCollapseThinking(e.target.checked)} 
            />
            <label htmlFor="collapse-think-toggle"></label>
          </div>
        </div>

        <div className="input-group font-japanese">
          <label>{t.systemPrompt}</label>
          <textarea 
            value={systemPrompt} 
            onChange={(e) => onChangeSystemPrompt(e.target.value)}
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
            onChange={(e) => handleSliderChange('temperature', parseFloat(e.target.value))}
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
            onChange={(e) => handleSliderChange('min_p', parseFloat(e.target.value))}
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
            onChange={(e) => handleSliderChange('top_p', parseFloat(e.target.value))}
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
            onChange={(e) => handleSliderChange('top_k', parseInt(e.target.value))}
          />
        </div>

        {/* Max Output Tokens Slider with Toggle */}
        <div className="slider-group">
          <div className="slider-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={numPredictEnabled} 
                onChange={(e) => onChangeNumPredictEnabled(e.target.checked)} 
              />
              {t.maxTokens}
            </label>
            <span>{numPredictEnabled ? parameters.num_predict : (lang === 'ja' ? '無制限' : 'Unlimited')}</span>
          </div>
          <input 
            type="range" min="128" max="16384" step="128" 
            value={parameters.num_predict} 
            disabled={!numPredictEnabled}
            onChange={(e) => handleSliderChange('num_predict', parseInt(e.target.value))}
          />
        </div>

        {/* Context Limit Slider */}
        <div className="slider-group">
          <div className="slider-header">
            <label>{t.contextLimit || "Context Limit (num_ctx)"}</label>
            <span>{parameters.num_ctx}</span>
          </div>
          <input 
            type="range" min="1024" max="32768" step="1024" 
            value={parameters.num_ctx} 
            onChange={(e) => handleSliderChange('num_ctx', parseInt(e.target.value))}
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
            onChange={(e) => handleSliderChange('repeat_penalty', parseFloat(e.target.value))}
          />
        </div>

        {/* Preset Export / Import Actions */}
        <div className="preset-actions-group">
          <button className="btn-secondary" onClick={onExportPreset}>
            Export
          </button>
          <label className="btn-secondary clickable">
            Import
            <input type="file" accept=".json" onChange={onImportPreset} style={{ display: 'none' }} />
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

      {/* Context usage progress and details */}
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
  );
}
