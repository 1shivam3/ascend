'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { getTelemetryConsent, setTelemetryConsent, hasConfiguredTelemetry, TELEMETRY_CONSENT_EVENT } from '@/lib/telemetry';

export default function TelemetryConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if telemetry providers are configured and user has not made a choice yet
    if (typeof window === 'undefined') return;
    if (!hasConfiguredTelemetry()) return;

    const current = getTelemetryConsent();
    if (current === null) {
      // Small timeout so it doesn't flash during initial hydration
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }

    const handler = () => {
      setVisible(getTelemetryConsent() === null);
    };
    window.addEventListener(TELEMETRY_CONSENT_EVENT, handler);
    return () => window.removeEventListener(TELEMETRY_CONSENT_EVENT, handler);
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    setTelemetryConsent('accepted');
    setVisible(false);
  };

  const handleDecline = () => {
    setTelemetryConsent('declined');
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Privacy & Analytics Preferences"
      className="fixed bottom-16 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-50 animate-slide-up"
    >
      <div className="bg-bg-secondary/95 backdrop-blur-md border border-border/90 rounded-2xl p-4 shadow-2xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-accent">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span className="font-bold text-xs tracking-wide uppercase font-mono">
              Privacy &amp; Performance
            </span>
          </div>
          <button
            type="button"
            onClick={handleDecline}
            aria-label="Close and decline analytics"
            className="text-text-muted hover:text-text-primary p-1 -mr-1 -mt-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-700 dark:text-text-secondary leading-relaxed">
          ASCEND uses anonymous telemetry to detect crashes and optimize loading speeds. In accordance with our offline-first architecture, your workout logs, PRs, body measurements, and meals are <strong className="text-text-primary">never</strong> tracked.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleDecline}
            className="flex-1 py-2 px-3 rounded-xl border border-border bg-bg-elevated hover:bg-bg-secondary text-text-secondary hover:text-text-primary text-xs font-semibold transition-all cursor-pointer text-center"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 py-2 px-3 rounded-xl bg-accent text-stone-950 font-black hover:bg-accent/90 text-xs transition-all shadow-xs cursor-pointer text-center"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
