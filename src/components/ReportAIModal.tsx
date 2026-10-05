'use client';

import React, { useState } from 'react';
import { X, Flag, AlertTriangle, ShieldCheck, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface ReportAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiContentSnippet?: string;
  sourceFeature?: string;
  onReported?: () => void;
}

const REPORT_REASONS = [
  { id: 'unsafe_exercise', label: 'Unsafe or dangerous exercise advice' },
  { id: 'medical_claim', label: 'Inappropriate medical diagnosis or health claim' },
  { id: 'offensive_content', label: 'Offensive, harmful, or inappropriate content' },
  { id: 'inaccurate_data', label: 'Hallucinated or completely inaccurate figures' },
  { id: 'other', label: 'Other policy or safety violation' },
];

export default function ReportAIModal({
  isOpen,
  onClose,
  aiContentSnippet = '',
  sourceFeature = 'AI Coach',
  onReported,
}: ReportAIModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('unsafe_exercise');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
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
    toast.success('Thank you for helping keep ASCEND safe. This response has been flagged.', 'Report Received');

    setTimeout(() => {
      setSubmitted(false);
      setAdditionalDetails('');
      if (onReported) onReported();
      onClose();
    }, 1200);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
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
                Report AI Content
              </h3>
              <p className="text-3xs text-text-muted font-mono">
                Google Play AI Safety &amp; Content Review
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h4 className="text-sm font-bold text-text-primary">Report Submitted</h4>
            <p className="text-2xs text-text-secondary max-w-xs mx-auto">
              This AI response has been flagged and suppressed. Thank you for maintaining safety standards.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border text-2xs space-y-1">
              <span className="text-3xs font-mono font-bold uppercase text-text-muted block">
                Flagged Source: {sourceFeature}
              </span>
              {aiContentSnippet && (
                <p className="text-text-secondary italic line-clamp-2">
                  &ldquo;{aiContentSnippet}&rdquo;
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-2xs font-semibold text-text-primary block">
                Why are you reporting this AI response?
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
                    <span className="text-2xs">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-2xs font-semibold text-text-primary block">
                Additional context (optional)
              </label>
              <textarea
                value={additionalDetails}
                onChange={(e) => setAdditionalDetails(e.target.value)}
                placeholder="Explain why this response was problematic or inaccurate..."
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
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 bg-danger hover:bg-danger/90 border-transparent text-white"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Submit Report</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
