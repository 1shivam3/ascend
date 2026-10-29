'use client';

import React, { useState } from 'react';
import { AlertTriangle, RotateCcw, Home, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { redactSecrets } from '@/lib/server-security';
import { useTranslation } from '@/lib/i18n';

export interface ErrorStateProps {
  error?: (Error & { digest?: string }) | string | null;
  reset?: () => void;
  onHome?: () => void;
  title?: string;
  message?: string;
  fullScreen?: boolean;
}

/**
 * Screen 25 — Error State
 * Minimal, focused error presentation adhering to the locked design system.
 * Palette: Graphite (#171916), Chalk (#F3F0E7), Vermilion (#E44427), Sage (#858076).
 */
export default function ErrorState({
  error,
  reset,
  onHome,
  title,
  message,
  fullScreen = true,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const rawErrorMessage = typeof error === 'string' ? error : error?.message;
  const digest = typeof error === 'object' && error !== null ? error.digest : undefined;
  const sanitizedError = redactSecrets(rawErrorMessage || t('state.noDiagnostics'));

  const handleReturnHome = () => {
    if (onHome) {
      onHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const handleEmergencyReset = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ascend_active_draft');
        localStorage.removeItem('ascend_emergency_snapshot');
        window.location.href = '/';
      } catch {
        window.location.reload();
      }
    }
  };

  const content = (
    <div className="w-full max-w-sm mx-auto p-6 sm:p-7 space-y-6 rounded-2xl bg-bg-card border border-border shadow-2xl animate-fade-in text-center select-none">
      {/* ── Screen 25: Vermilion Alert Icon Badge ───────────────────────── */}
      <div className="mx-auto w-16 h-16 rounded-full bg-accent/15 border-2 border-accent/40 flex items-center justify-center text-accent shadow-xs">
        <AlertTriangle className="w-8 h-8 stroke-[2.2]" />
      </div>

      {/* ── Heading & Context ───────────────────────────────────────────── */}
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold font-sans text-text-primary tracking-tight">
          {title ?? t('state.errorTitle')}
        </h1>
        <p className="text-xs text-text-secondary leading-relaxed px-2 font-sans">
          {message ?? t('state.errorMessage')}
        </p>
      </div>

      {/* ── Optional Collapsible Diagnostics ────────────────────────────── */}
      <div className="pt-1 text-left">
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="w-full py-1.5 px-3 rounded-lg bg-bg-secondary/70 hover:bg-bg-secondary border border-border/60 text-[0.6875rem] font-mono text-text-secondary flex items-center justify-between transition-colors cursor-pointer"
          aria-expanded={showDetails}
        >
          <span className="flex items-center gap-1.5 uppercase tracking-wider font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-accent" />
            {t('state.diagnostics')}
          </span>
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showDetails && (
          <div className="mt-2 p-3 rounded-xl bg-bg-secondary border border-border/80 text-left space-y-1 animate-fade-in">
            <p className="text-[0.6875rem] font-mono text-text-secondary break-words leading-relaxed">
              {sanitizedError}
            </p>
            {digest && (
              <p className="text-[0.6875rem] font-mono text-text-secondary pt-0.5">
                {t('state.digest')} {digest}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Recovery Action Buttons ─────────────────────────────────────── */}
      <div className="space-y-2.5 pt-1">
        {reset && (
          <button
            type="button"
            onClick={() => reset()}
            className="w-full min-h-[46px] py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-accent hover:bg-accent-dim text-accent-on flex items-center justify-center gap-2 shadow-sm shadow-accent/20 transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('state.retry')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleReturnHome}
          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border/80 text-xs font-bold text-text-primary flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Home className="w-4 h-4 text-text-muted" />
          <span>{t('state.returnHome')}</span>
        </button>

        <button
          type="button"
          onClick={handleEmergencyReset}
          className="text-2xs font-mono text-text-muted hover:text-accent-text hover:underline transition-colors pt-1 block mx-auto cursor-pointer"
        >
          {t('state.emergencyReset')}
        </button>
      </div>
    </div>
  );

  if (!fullScreen) {
    return content;
  }

  return (
    <div className="min-h-[100dvh] w-full bg-bg-primary text-text-primary flex items-center justify-center p-4 sm:p-6">
      {content}
    </div>
  );
}
