import { useUi, useController } from '../hooks';
import { Icon } from './Icon';

export function Toasts() {
  const ui = useUi();
  const controller = useController();
  if (!ui.toasts.length) return null;
  return (
    <div className="toasts">
      {ui.toasts.slice(-4).map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`} onClick={() => controller.dismissToast(toast.id)} role="status">
          <div className="toast-title" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon
              name={toast.kind === 'error' ? 'warn' : toast.kind === 'success' ? 'check' : toast.kind === 'warn' ? 'warn' : 'info'}
              size={13}
            />
            <span>{toast.message}</span>
          </div>
          {toast.detail ? <div className="toast-detail">{toast.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}
