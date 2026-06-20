import React from 'react';
import { Download, Upload } from 'lucide-react';
import type { DdoSettings, LocaleStrings } from '../types';

interface SettingsModalProps {
  show: boolean;
  settings: DdoSettings;
  onChangeSettings: (settings: DdoSettings) => void;
  sendOnEnter: boolean;
  onChangeSendOnEnter: (val: boolean) => void;
  onClose: () => void;
  onExportCassette: () => void;
  onImportCassette: (e: React.ChangeEvent<HTMLInputElement>) => void;
  t: LocaleStrings;
}

export default function SettingsModal({
  show,
  settings,
  onChangeSettings,
  sendOnEnter,
  onChangeSendOnEnter,
  onClose,
  onExportCassette,
  onImportCassette,
  t
}: SettingsModalProps) {
  if (!show) return null;

  const handleFieldChange = (key: keyof DdoSettings, value: string | boolean) => {
    onChangeSettings({
      ...settings,
      [key]: value
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="settings-modal">
        <div className="modal-header">
          <h3>{t.settings}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>{t.connectionUrl}</label>
            <input 
              type="text" 
              value={settings.connectionUrl} 
              onChange={(e) => handleFieldChange('connectionUrl', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>{t.accessToken}</label>
            <input 
              type="password" 
              value={settings.accessToken} 
              onChange={(e) => handleFieldChange('accessToken', e.target.value)}
              placeholder="Enter X-DDO-Token"
            />
          </div>

          <div className="form-group">
            <label>{t.username}</label>
            <input 
              type="text" 
              value={settings.username} 
              onChange={(e) => handleFieldChange('username', e.target.value)}
            />
          </div>

          <div className="form-group inline-group">
            <label>{t.sharedRoomMode}</label>
            <div className="toggle-switch">
              <input 
                type="checkbox" 
                id="shared-toggle" 
                checked={settings.isSharedMode} 
                onChange={(e) => handleFieldChange('isSharedMode', e.target.checked)} 
              />
              <label htmlFor="shared-toggle"></label>
            </div>
          </div>

          <div className="form-group inline-group">
            <label>{t.sendOnEnter}</label>
            <div className="toggle-switch">
              <input 
                type="checkbox" 
                id="send-toggle" 
                checked={sendOnEnter} 
                onChange={(e) => onChangeSendOnEnter(e.target.checked)} 
              />
              <label htmlFor="send-toggle"></label>
            </div>
          </div>

          <div className="modal-divider"></div>

          <div className="form-actions-cassette">
            <h4>Cassette (JSON Data)</h4>
            <div className="action-row">
              <button className="btn-secondary" onClick={onExportCassette}>
                <Download size={16} />
                <span>{t.export}</span>
              </button>
              <label className="btn-secondary clickable">
                <Upload size={16} />
                <span>{t.import}</span>
                <input type="file" accept=".json" onChange={onImportCassette} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-accent" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
