import React from 'react';
import { Download, Upload } from 'lucide-react';
import type { DdoSettings, LocaleStrings } from '../types';
import './SettingsModal.css';

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

          <div className="qr-code-section-wrap">
            {(() => {
              const isJa = t.close === '閉じる';
              const isPublicOrIp = settings.connectionUrl &&
                !settings.connectionUrl.includes('localhost') &&
                !settings.connectionUrl.includes('127.0.0.1');

              if (isPublicOrIp) {
                const shareUrl = `${settings.connectionUrl}?token=${settings.accessToken}&sharedMode=${settings.isSharedMode}`;
                const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`;
                return (
                  <div className="qr-code-section">
                    <label className="qr-label">{isJa ? 'スマホ接続用QRコード' : 'Mobile Access QR Code'}</label>
                    <div className="qr-container">
                      <img src={qrCodeUrl} alt="QR Code for Mobile Access" className="qr-image" />
                      <p className="qr-help-text">
                        {isJa
                          ? 'このQRコードを他の端末のカメラでスキャンするだけで、トークンが自動認証された状態でアクセスできます。'
                          : 'Scan this QR code with another device\'s camera to open DDO Saba with automatic token authentication.'}
                      </p>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="qr-code-section disabled">
                    <label className="qr-label">{isJa ? 'スマホ接続用QRコード' : 'Mobile Access QR Code'}</label>
                    <div className="qr-container">
                      <p className="qr-help-text text-muted">
                        {isJa
                          ? '公開用のトンネルURL（trycloudflare.comなど）が接続先URLに設定されている場合、ここにスマホ接続用のQRコードが表示されます。'
                          : 'A QR code for mobile connection will appear here when a public tunnel URL (e.g. trycloudflare.com) is configured.'}
                      </p>
                    </div>
                  </div>
                );
              }
            })()}
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
