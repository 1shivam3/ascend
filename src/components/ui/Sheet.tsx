'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useAppNavigation } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';

/**
 * UX redesign — unified modal/drawer wrapper (design-system §6).
 * Enforces the shared sheet chrome + stack semantics: bottom sheet on
 * mobile / centered on desktop (existing .modal-content behavior, 520px
 * cap), Escape + focus trap via useModalA11y, backdrop-tap dismiss,
 * Android-back dismiss via the navigation back-handler stack, and
 * INSTANT close (no exit animation — animation-spec §3.2).
 *
 * New surfaces should use Sheet. Existing modals keep their proven
 * chrome until migrated one by one with visual verification; Sheet
 * must render inside NavigationProvider (true for all app screens).
 */
export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  centered?: boolean;
  ariaLabel?: string;
}

export default function Sheet({ isOpen, onClose, title, children, footer, centered, ariaLabel }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(ref, isOpen, onClose);
  const { registerBackHandler } = useAppNavigation();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 100);
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen) return null;
  return (
    <div
      ref={ref}
      {...dialogProps}
      aria-label={ariaLabel ?? title}
      className={centered ? 'modal-overlay-centered' : 'modal-overlay'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <h2 className="section-heading">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="btn-circle shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="border-t border-border/60 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
