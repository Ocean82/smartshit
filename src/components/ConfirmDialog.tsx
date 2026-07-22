import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { AlertTriangle } from 'lucide-react';
import './ConfirmDialog.css';

export function ConfirmDialog() {
  const { confirmDialog, dismissConfirm } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Open/close the native dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (confirmDialog) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialog.showModal();
      // Focus the cancel button by default (safer choice)
      cancelBtnRef.current?.focus();
    } else {
      dialog.close();
      // Return focus to the element that triggered the dialog
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [confirmDialog]);

  const handleConfirm = useCallback(() => {
    if (confirmDialog?.onConfirm) {
      confirmDialog.onConfirm();
    }
    dismissConfirm();
  }, [confirmDialog, dismissConfirm]);

  const handleCancel = useCallback(() => {
    if (confirmDialog?.onCancel) {
      confirmDialog.onCancel();
    }
    dismissConfirm();
  }, [confirmDialog, dismissConfirm]);

  // Handle ESC natively (dialog element handles it, but we need cleanup)
  const handleDialogCancel = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    handleCancel();
  }, [handleCancel]);

  // Trap keyboard focus inside the dialog
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusableElements = [cancelBtnRef.current, confirmBtnRef.current].filter(Boolean) as HTMLElement[];
      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  }, []);

  if (!confirmDialog) return null;

  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger' } = confirmDialog;

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onCancel={handleDialogCancel}
      onKeyDown={handleKeyDown}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      <div className="confirm-content">
        {variant === 'danger' && (
          <div className="confirm-icon confirm-icon-danger">
            <AlertTriangle size={20} />
          </div>
        )}
        <div className="confirm-body">
          <h2 id="confirm-title" className="confirm-title">{title}</h2>
          <p id="confirm-message" className="confirm-message">{message}</p>
        </div>
      </div>
      <div className="confirm-actions">
        <button
          ref={cancelBtnRef}
          type="button"
          className="confirm-btn confirm-btn-cancel"
          onClick={handleCancel}
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmBtnRef}
          type="button"
          className={`confirm-btn confirm-btn-${variant}`}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
