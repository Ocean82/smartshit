import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from 'lucide-react';
import type { Toast as ToastType } from '@/types';
import './Toast.css';

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);

  return (
    <div
      className="toast-container"
      aria-live="polite"
      aria-relevant="additions removals"
      role="status"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastType }) {
  const dismissToast = useStore((s) => s.dismissToast);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => dismissToast(toast.id), 200);
  };

  useEffect(() => {
    if (toast.duration !== Infinity) {
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, toast.duration || 4000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const icons = {
    success: <CheckCircle2 size={16} />,
    error: <AlertCircle size={16} />,
    info: <Info size={16} />,
  };

  return (
    <div
      className={`toast-item toast-${toast.type} ${exiting ? 'toast-exit' : ''}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
    >
      <div className="toast-icon">
        {icons[toast.type]}
      </div>
      <p className="toast-message">{toast.message}</p>
      {toast.undoAction && (
        <button
          type="button"
          className="toast-undo"
          onClick={() => {
            toast.undoAction!();
            handleDismiss();
          }}
        >
          <Undo2 size={13} />
          <span>Undo</span>
        </button>
      )}
      <button
        type="button"
        className="toast-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
