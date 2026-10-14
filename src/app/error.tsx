'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home, ShieldAlert } from 'lucide-react';
import { redactSecrets } from '@/lib/server-security';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log redacted error safely to console without leaking user credentials or tokens
    const safeMsg = redactSecrets(error?.message || 'Unknown runtime error');
    console.error('[ASCEND Production Recovery]', safeMsg, error?.digest ? `(digest: ${error.digest})` : '');
  }, [error]);

  const handleReturnHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const handleEmergencySafeMode = () => {
    if (typeof window !== 'undefined') {
      try {
        // Clear active workout draft or corrupted transient state to restore operational health
        localStorage.removeItem('ascend_active_draft');
        localStorage.removeItem('ascend_emergency_snapshot');
        window.location.href = '/';
      } catch {
        window.location.reload();
      }
    }
  };

  const displayMessage = redactSecrets(error?.message || 'An unexpected client runtime exception occurred.');

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      <div className="w-full max-w-md bg-bg-card border border-border/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl text-center animate-fade-in">
        {/* Athletic Warning Icon */}
        <div className="w-14 h-14 mx-auto rounded-2xl bg-danger/10 border border-danger/25 flex items-center justify-center text-danger">
          <AlertTriangle className="w-7 h-7" />
        </div>

        {/* Heading & Context */}
        <div className="space-y-2">
          <span className="text-2xs font-mono font-bold tracking-widest text-danger uppercase block">
            SESSION INTERRUPTION
          </span>
          <h1 className="text-lg sm:text-xl font-bold font-mono tracking-tight text-text-primary">
            Application Recovery Mode
          </h1>
          <p className="text-xs text-text-secondary leading-relaxed font-sans">
            ASCEND encountered an unexpected interface fault. Your logged PRs and synchronized workout history remain safely protected.
          </p>
        </div>

        {/* Technical Diagnostics (Redacted) */}
        <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/60 text-left space-y-1.5">
          <div className="flex items-center gap-1.5 text-3xs font-mono text-text-muted uppercase tracking-wider">
            <ShieldAlert className="w-3.5 h-3.5 text-accent" />
            <span>Diagnostics Notice</span>
          </div>
          <p className="text-2xs font-mono text-text-muted break-words leading-relaxed">
            {displayMessage}
          </p>
          {error?.digest && (
            <p className="text-3xs font-mono text-text-muted/60">
              Error Digest: {error.digest}
            </p>
          )}
        </div>

        {/* Recovery Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            onClick={() => reset()}
            className="btn-primary w-full py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Retry Current View</span>
          </button>

          <button
            onClick={handleReturnHome}
            className="btn-secondary w-full py-2.5 text-xs font-medium flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4 text-text-muted" />
            <span>Return to Dashboard</span>
          </button>

          <button
            onClick={handleEmergencySafeMode}
            className="text-3xs font-mono text-text-muted hover:text-danger hover:underline transition-colors pt-2 block mx-auto"
          >
            Clear active workout draft &amp; force restart
          </button>
        </div>
      </div>
    </div>
  );
}
