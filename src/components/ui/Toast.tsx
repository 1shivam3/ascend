'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { safeRandomId } from '@/lib/formatters';
import { useTranslation } from '@/lib/i18n';

export type ToastType = 'success' | 'error' | 'info';

/**
 * Optional inline action for a toast (QA4-014) — e.g. Undo after a
 * delete. Clicking the action runs `onAction` and dismisses the toast.
 * Action toasts get a longer default lifetime (6s vs 3.5s) so the user
 * actually has time to use it.
 */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  durationMs?: number;
  action?: ToastAction;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, title?: string, durationMs?: number, action?: ToastAction) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, durationMs?: number, action?: ToastAction) => {
      const id = safeRandomId('toast');
      // Action toasts (e.g. Undo) live longer by default so the action
      // is reachable; an explicit durationMs always wins.
      const effectiveDuration = durationMs ?? (action ? 6000 : 3500);
      setToasts((prev) => [...prev, { id, type, title, message, durationMs: effectiveDuration, action }]);

      setTimeout(() => {
        removeToast(id);
      }, effectiveDuration);
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title?: string) => showToast('success', message, title ?? t('ui.toastSuccess')),
    [showToast, t]
  );

  const error = useCallback(
    (message: string, title?: string) => showToast('error', message, title ?? t('ui.toastError'), 4500),
    [showToast, t]
  );

  const info = useCallback(
    (message: string, title?: string) => showToast('info', message, title ?? t('ui.toastNotice')),
    [showToast, t]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      {/* Toast Notification Container (Mobile Optimized, Fixed Bottom).
          Live-fix L9: toasts used to sit top-3, overlapping page headings
          (and the sticky You bar). Bottom-24 clears the mobile bottom nav
          (fixed bottom-0, ~64px) and keeps headings uncovered. */}
      <div
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-sm flex flex-col gap-2 pointer-events-none transition-all"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Presentational toast card (exported for tests). Clicking the action
 * runs it and dismisses the toast via onClose.
 */
export function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl border shadow-xl backdrop-blur-md animate-fade-in transition-all ${
        toast.type === 'success'
          ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
          : toast.type === 'error'
          ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
          : 'bg-zinc-900/90 border-accent/40 text-accent'
      }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : toast.type === 'error' ? (
        <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
      ) : (
        <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
      )}

      <div className="flex-1 min-w-0">
        {toast.title && (
          <h5 className="text-xs font-bold font-mono tracking-tight leading-none mb-1">
            {toast.title}
          </h5>
        )}
        <p className="text-2xs font-mono leading-relaxed opacity-90 break-words">
          {toast.message}
        </p>
        {toast.action && (
          <button
            type="button"
            data-toast-action={toast.action.label}
            onClick={() => {
              toast.action?.onAction();
              onClose();
            }}
            className="mt-1.5 text-2xs font-mono font-bold underline underline-offset-2 decoration-current/60 hover:decoration-current cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="text-white/60 hover:text-white p-0.5 rounded transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return context;
}
