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

/**
 * Coalescing (phone-polish, 2026-11-06): rapid repeat taps used to
 * stack identical toasts — two "+500 ml logged" hydration taps showed
 * two indistinguishable "Hydration Updated" cards at once. A new
 * PLAIN toast whose type + title + message exactly match a visible
 * plain toast replaces it in place (fresh id, so its lifetime and
 * fade restart) instead of stacking a duplicate. Action toasts are
 * never coalesced in either direction: an Undo carries unique state
 * and must not be silently replaced, and a new action toast must not
 * hide behind an identical-looking plain one. Distinct notifications
 * (any field differs) always stack normally.
 */
export function upsertToast(prev: ToastMessage[], next: ToastMessage): ToastMessage[] {
  if (!next.action) {
    const idx = prev.findIndex(
      (t) => !t.action && t.type === next.type && t.title === next.title && t.message === next.message
    );
    if (idx >= 0) {
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    }
  }
  return [...prev, next];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // Pending auto-dismiss timers by toast id, so a coalesced toast's
  // stale timer can be cancelled instead of firing into a no-op.
  const timersRef = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const handle = timersRef.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const removeToast = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, durationMs?: number, action?: ToastAction) => {
      const id = safeRandomId('toast');
      // Action toasts (e.g. Undo) live longer by default so the action
      // is reachable; an explicit durationMs always wins.
      const effectiveDuration = durationMs ?? (action ? 6000 : 3500);
      const next: ToastMessage = { id, type, title, message, durationMs: effectiveDuration, action };
      setToasts((prev) => {
        const merged = upsertToast(prev, next);
        // A replaced toast's pending dismissal is stale — cancel it.
        const kept = new Set(merged.map((toast) => toast.id));
        for (const toast of prev) {
          if (!kept.has(toast.id)) clearTimer(toast.id);
        }
        return merged;
      });

      timersRef.current.set(
        id,
        setTimeout(() => {
          removeToast(id);
        }, effectiveDuration)
      );
    },
    [removeToast, clearTimer]
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
          (and the sticky You bar). Bottom placement clears the mobile
          bottom nav (fixed bottom-0, ~64px) and keeps headings uncovered.
          Phase 4 (Task 4.1): the offset is 6rem PLUS the device safe-area
          inset, so on gesture-nav phones the stack also clears the
          safe area — it never covers the tab bar or a bottom CTA. */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-sm flex flex-col gap-2 pointer-events-none transition-all"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
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
 *
 * Phase 3 (Task 3.2): the card BODY is click-through
 * (pointer-events-none) — it is display-only, and at bottom-24 it can
 * sit exactly over a screen's bottom CTA for its 3.5s life; the
 * first-run drive watched the goals-skip toast swallow the details
 * screen's Continue tap twice. Only the card's two real buttons
 * (action, close) opt back into pointer events.
 */
export function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Phase 4 (Task 4.1) — ONE toast style: the app sans typeface (the
  // old card set its text in the monospace stack), the theme's
  // elevated surface + primary text tokens, and a severity icon in a
  // token-tinted chip. Variants differ ONLY in the icon chip —
  // success = success token, error = danger token, info = accent
  // tint — so an informational toast (e.g. "Press back again to
  // exit", sent via toast.info) can never read as an error block in
  // either theme. No hard-coded emerald/rose/zinc blocks.
  const iconChip =
    toast.type === 'success'
      ? 'bg-success/15 text-success'
      : toast.type === 'error'
        ? 'bg-danger/10 text-danger'
        : 'bg-accent-subtle text-accent-text';
  return (
    <div className="pointer-events-none flex items-start gap-2.5 p-3.5 rounded-xl border border-border bg-bg-elevated/95 text-text-primary shadow-xl backdrop-blur-md animate-fade-in transition-all">
      <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${iconChip}`}>
        {toast.type === 'success' ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : toast.type === 'error' ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          <Info className="w-4 h-4" />
        )}
      </span>

      <div className="flex-1 min-w-0">
        {toast.title && (
          <h5 className="text-xs font-bold font-sans tracking-tight leading-none mb-1">
            {toast.title}
          </h5>
        )}
        <p className="text-xs font-sans leading-relaxed opacity-90 break-words">
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
            className="pointer-events-auto mt-1.5 text-xs font-sans font-bold underline underline-offset-2 decoration-current/60 hover:decoration-current cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="pointer-events-auto text-text-muted hover:text-text-primary p-2 -m-1 rounded transition-colors flex-shrink-0"
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
