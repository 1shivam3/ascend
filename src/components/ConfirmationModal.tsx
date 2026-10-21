'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { AlertTriangle, Trash2, LogOut, X, Loader2 } from 'lucide-react';
import { useAppNavigation } from '@/lib/navigation';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  icon?: 'trash' | 'alert' | 'logout';
  requireTypedConfirmation?: string; // e.g. "DELETE"
  isLoading?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  icon = 'alert',
  requireTypedConfirmation,
  isLoading = false,
}: ConfirmationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const [typedValue, setTypedValue] = useState('');
  const { registerBackHandler } = useAppNavigation();

  // Register Android / browser back handler to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 150); // Higher priority than page/tab handlers
  }, [isOpen, onClose, registerBackHandler]);

  // Reset typed input on open
  useEffect(() => {
    if (isOpen) {
      setTypedValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmDisabled =
    isLoading ||
    (Boolean(requireTypedConfirmation) &&
      typedValue.trim().toUpperCase() !== requireTypedConfirmation?.toUpperCase());

  return (
    <div ref={modalRef} {...dialogProps}
      className="modal-overlay z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="modal-content max-w-sm w-full p-6 space-y-5 rounded-2xl bg-bg-card border border-border shadow-2xl animate-fade-in text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning Icon Badge */}
        <div className="mx-auto w-14 h-14 rounded-full bg-accent/10 border border-accent/25 flex items-center justify-center text-accent">
          {icon === 'trash' && <Trash2 className="w-6 h-6 stroke-[2.2]" />}
          {icon === 'logout' && <LogOut className="w-6 h-6 stroke-[2.2]" />}
          {icon === 'alert' && <AlertTriangle className="w-6 h-6 stroke-[2.2]" />}
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <h3
            id="confirm-modal-title"
            className="text-xl font-bold font-sans text-text-primary tracking-tight"
          >
            {title}
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed px-1">
            {message}
          </p>
        </div>

        {/* Typed confirmation input if required */}
        {requireTypedConfirmation && (
          <div className="space-y-1.5 text-left pt-1">
            <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
              Type <span className="text-accent">{requireTypedConfirmation}</span> to confirm:
            </label>
            <input
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={requireTypedConfirmation}
              autoFocus
              className="w-full px-3 py-2 rounded-xl bg-bg-secondary border border-border focus:border-accent text-sm text-text-primary outline-none font-mono text-center uppercase tracking-widest transition-colors"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border/80 text-xs font-bold text-text-primary transition-all cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className={`flex-1 min-h-[44px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              variant === 'danger'
                ? 'bg-accent hover:bg-accent-dim text-white shadow-sm shadow-accent/20'
                : 'bg-text-primary text-bg-primary hover:opacity-90'
            }`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
