export interface SyncModalProps {
  syncRequestPending: any | null;
  onAccept: () => void;
  onReject: () => void;
  lang: 'en' | 'ja';
}

export default function SyncModal({
  syncRequestPending,
  onAccept,
  onReject,
  lang
}: SyncModalProps) {
  if (!syncRequestPending) return null;

  return (
    <div className="modal-backdrop" style={{ zIndex: 200 }}>
      <div className="settings-modal" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>{lang === 'ja' ? '設定同期のリクエスト' : 'Settings Sync Request'}</h3>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '16px', fontSize: '0.9rem', lineHeight: '1.5' }}>
            {lang === 'ja'
              ? `ユーザー「${syncRequestPending.sender}」から設定の同期がリクエストされました。モデルとパラメータを同期しますか？`
              : `User "${syncRequestPending.sender}" has requested to sync settings. Do you want to sync your model and parameters?`}
          </p>
          <div style={{ backgroundColor: 'hsl(var(--bg-input))', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '20px' }}>
            <div>Model: {syncRequestPending.activeModel || 'None'}</div>
            <div>Temp: {syncRequestPending.parameters?.temperature ?? 'N/A'}</div>
            <div>Context: {syncRequestPending.parameters?.num_ctx ?? 'N/A'}</div>
            <div>Reasoning: {syncRequestPending.thinkMode ? 'ON' : 'OFF'}</div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onReject}>
            {lang === 'ja' ? '拒否' : 'Deny'}
          </button>
          <button className="btn-accent" onClick={onAccept}>
            {lang === 'ja' ? '承認' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
