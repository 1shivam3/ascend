'use client';

import React, { useState, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { X, Flag, AlertTriangle, ShieldCheck, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';

interface ReportAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiContentSnippet?: string;
  sourceFeature?: string;
  onReported?: () => void;
  /**
   * QA4A-008: set true ONLY when the hosting surface genuinely hides /
   * suppresses the reported output (e.g. via its onReported handler).
   * The default success copy says "flagged for review" — which is all
   * that actually happens when a report is only logged locally.
   */
  suppressesOutput?: boolean;
}

const REPORT_REASONS: { id: string; labelKey: StringKey }[] = [
  { id: 'unsafe_exercise', labelKey: 'report.reasonUnsafe' },
  { id: 'medical_claim', labelKey: 'report.reasonMedical' },
  { id: 'offensive_content', labelKey: 'report.reasonOffensive' },
  { id: 'inaccurate_data', labelKey: 'report.reasonInaccurate' },
  { id: 'other', labelKey: 'report.reasonOther' },
];

export default function ReportAIModal({
  isOpen,
  onClose,
  aiContentSnippet = '',
  sourceFeature = 'AI Coach',
  onReported,
  suppressesOutput = false,
}: ReportAIModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const [selectedReason, setSelectedReason] = useState<string>('unsafe_exercise');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { t } = useTranslation();
  const toast = useToast();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Store report locally for audit trail and compliance proof
    try {
      const existingReports = JSON.parse(localStorage.getItem('ascend_ai_reports') || '[]');
      const newReport = {
        id: `rep_${Date.now()}`,
        timestamp: new Date().toISOString(),
        sourceFeature,
        snippet: aiContentSnippet.slice(0, 300),
        reason: selectedReason,
        details: additionalDetails.trim(),
      };
      existingReports.push(newReport);
      localStorage.setItem('ascend_ai_reports', JSON.stringify(existingReports));
    } catch {
      // Ignore localStorage errors
    }

    setSubmitted(true);
    toast.success(t('report.thanksMsg'), t('report.receivedTitle'));

    setTimeout(() => {
      setSubmitted(false);
      setAdditionalDetails('');
      if (onReported) onReported();
      onClose();
    }, 1200);
  };

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-4 max-w-md w-full animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-danger/15 flex items-center justify-center text-danger">
              <Flag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text-primary">
                {t('report.title')}
              </h3>
              <p className="text-2xs text-text-muted font-mono">
                {t('report.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
            aria-label="Close report form"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h4 className="text-sm font-bold text-text-primary">{t('report.submitted')}</h4>
            <p className="text-2xs text-text-secondary max-w-xs mx-auto">
              {suppressesOutput
                ? 'This AI response has been flagged and suppressed. Thank you for maintaining safety standards.'
                : 'This AI response has been flagged for review. Thank you for helping keep ASCEND safe.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border text-2xs space-y-1">
              <span className="text-2xs font-mono font-bold uppercase text-text-muted block">
                {t('report.flaggedSource', { source: sourceFeature })}
              </span>
              {aiContentSnippet && (
                <p className="text-text-secondary italic line-clamp-2">
                  &ldquo;{aiContentSnippet}&rdquo;
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-2xs font-semibold text-text-primary block">
                {t('report.why')}
              </label>
              <div className="space-y-1.5">
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                      selectedReason === r.id
                        ? 'bg-accent/10 border-accent/60 text-text-primary font-medium'
                        : 'bg-bg-secondary/40 border-border text-text-secondary hover:bg-bg-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={r.id}
                      checked={selectedReason === r.id}
                      onChange={() => setSelectedReason(r.id)}
                      className="text-accent focus:ring-accent"
                    />
                    <span className="text-2xs">{t(r.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-2xs font-semibold text-text-primary block">
                {t('report.context')}
              </label>
              <textarea
                value={additionalDetails}
                onChange={(e) => setAdditionalDetails(e.target.value)}
                placeholder={t('report.contextPlaceholder')}
                rows={2}
                className="w-full bg-bg-secondary border border-border rounded-lg p-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary py-2 px-3 text-xs"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 bg-danger hover:bg-danger/90 border-transparent text-white"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{t('report.submit')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
