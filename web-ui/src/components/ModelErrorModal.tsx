import { AlertTriangle } from 'lucide-react';

export interface ModelErrorModalProps {
  modelLoadError: string;
  onClose: () => void;
  lang: 'en' | 'ja';
}

export default function ModelErrorModal({
  modelLoadError,
  onClose,
  lang
}: ModelErrorModalProps) {
  if (!modelLoadError) return null;

  return (
    <div className="modal-backdrop" style={{ zIndex: 200 }}>
      <div className="settings-modal" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--danger))' }}>
            <AlertTriangle size={20} />
            {lang === 'ja' ? 'モデル読み込みエラー' : 'Model Load Error'}
          </h3>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '16px', fontSize: '0.9rem', lineHeight: '1.5' }}>
            {modelLoadError}
          </p>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>
            {lang === 'ja' ? '閉じる' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
