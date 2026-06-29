import React, { useState, useEffect } from 'react';
import { Sliders, Cpu } from 'lucide-react';
import type { DdoParameters, PsModelInfo, LocaleStrings } from '../types';
import './ParameterPanel.css';

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
  isSharedMode: boolean;
  onBroadcastSettings: () => Promise<void>;
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
  lang,
  isSharedMode,
  onBroadcastSettings
}: ParameterPanelProps) {

  const PARAMETER_SPECS = {
    temperature: { min: 0.0, max: 2.0, step: 0.1 },
    min_p: { min: 0.0, max: 1.0, step: 0.01 },
    top_p: { min: 0.0, max: 1.0, step: 0.01 },
    top_k: { min: 0, max: 100, step: 1 },
    num_predict: { min: 128, max: 16384, step: 128 },
    num_ctx: { min: 1024, max: 32768, step: 1024 },
    repeat_penalty: { min: 0.5, max: 2.0, step: 0.05 }
  };

  const [tempValues, setTempValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextTemp: Record<string, string> = {};
    Object.keys(parameters).forEach((key) => {
      const k = key as keyof DdoParameters;
      const activeEl = document.activeElement;
      const isCurrentFocus = activeEl && activeEl.id === `param-input-${k}`;
      if (!isCurrentFocus) {
        nextTemp[k] = parameters[k].toString();
      } else {
        nextTemp[k] = tempValues[k] ?? parameters[k].toString();
      }
    });
    setTempValues(nextTemp);
  }, [parameters]);

  const handleSliderChange = (key: keyof DdoParameters, value: number) => {
    onChangeParameters({
      ...parameters,
      [key]: value
    });
    setTempValues(prev => ({
      ...prev,
      [key]: value.toString()
    }));
  };

  const handleInputChange = (key: keyof DdoParameters, valStr: string) => {
    setTempValues(prev => ({
      ...prev,
      [key]: valStr
    }));
  };

  const handleInputConfirm = (key: keyof DdoParameters) => {
    const spec = PARAMETER_SPECS[key];
    const rawVal = tempValues[key];
    let val = parseFloat(rawVal);
    
    if (isNaN(val)) {
      val = parameters[key];
    } else {
      val = Math.min(spec.max, Math.max(spec.min, val));
    }

    if (key === 'top_k' || key === 'num_predict' || key === 'num_ctx') {
      val = Math.round(val);
    }

    const nextParams = {
      ...parameters,
      [key]: val
    };
    onChangeParameters(nextParams);
    setTempValues(prev => ({
      ...prev,
      [key]: val.toString()
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, key: keyof DdoParameters) => {
    if (e.key === 'Enter') {
      handleInputConfirm(key);
      (e.target as HTMLInputElement).blur();
    }
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
            <label htmlFor="param-input-temperature">{t.temperature}</label>
            <input
              type="number"
              id="param-input-temperature"
              className="param-number-input"
              min="0.0"
              max="2.0"
              step="0.1"
              value={tempValues.temperature ?? ''}
              onChange={(e) => handleInputChange('temperature', e.target.value)}
              onBlur={() => handleInputConfirm('temperature')}
              onKeyDown={(e) => handleKeyDown(e, 'temperature')}
            />
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
            <input
              type="number"
              id="param-input-min_p"
              className="param-number-input"
              min="0.0"
              max="1.0"
              step="0.01"
              value={tempValues.min_p ?? ''}
              onChange={(e) => handleInputChange('min_p', e.target.value)}
              onBlur={() => handleInputConfirm('min_p')}
              onKeyDown={(e) => handleKeyDown(e, 'min_p')}
            />
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
            <input
              type="number"
              id="param-input-top_p"
              className="param-number-input"
              min="0.0"
              max="1.0"
              step="0.01"
              value={tempValues.top_p ?? ''}
              onChange={(e) => handleInputChange('top_p', e.target.value)}
              onBlur={() => handleInputConfirm('top_p')}
              onKeyDown={(e) => handleKeyDown(e, 'top_p')}
            />
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
            <input
              type="number"
              id="param-input-top_k"
              className="param-number-input"
              min="0"
              max="100"
              step="1"
              value={tempValues.top_k ?? ''}
              onChange={(e) => handleInputChange('top_k', e.target.value)}
              onBlur={() => handleInputConfirm('top_k')}
              onKeyDown={(e) => handleKeyDown(e, 'top_k')}
            />
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
            {numPredictEnabled ? (
              <input
                type="number"
                id="param-input-num_predict"
                className="param-number-input"
                min="128"
                max="16384"
                step="128"
                value={tempValues.num_predict ?? ''}
                onChange={(e) => handleInputChange('num_predict', e.target.value)}
                onBlur={() => handleInputConfirm('num_predict')}
                onKeyDown={(e) => handleKeyDown(e, 'num_predict')}
              />
            ) : (
              <span className="unlimited-label">{lang === 'ja' ? '無制限' : 'Unlimited'}</span>
            )}
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
            <input
              type="number"
              id="param-input-num_ctx"
              className="param-number-input"
              min="1024"
              max="32768"
              step="1024"
              value={tempValues.num_ctx ?? ''}
              onChange={(e) => handleInputChange('num_ctx', e.target.value)}
              onBlur={() => handleInputConfirm('num_ctx')}
              onKeyDown={(e) => handleKeyDown(e, 'num_ctx')}
            />
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
            <input
              type="number"
              id="param-input-repeat_penalty"
              className="param-number-input"
              min="0.5"
              max="2.0"
              step="0.05"
              value={tempValues.repeat_penalty ?? ''}
              onChange={(e) => handleInputChange('repeat_penalty', e.target.value)}
              onBlur={() => handleInputConfirm('repeat_penalty')}
              onKeyDown={(e) => handleKeyDown(e, 'repeat_penalty')}
            />
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

        {/* Sync Settings to All Clients Button */}
        {isSharedMode && (
          <div style={{ marginTop: '12px', width: '100%' }}>
            <button 
              className="btn-accent" 
              onClick={onBroadcastSettings}
              style={{ width: '100%', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Cpu size={16} />
              <span>{lang === 'ja' ? '現在の設定を全員に同期' : 'Sync Settings to Room'}</span>
            </button>
          </div>
        )}
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
