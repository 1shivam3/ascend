'use client';

import React, { useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export interface OfflineStateProps {
  onRetry?: () => void | Promise<void>;
  onContinueOffline?: () => void;
  fullScreen?: boolean;
}

/**
 * Screen 27 — Offline State
 * Minimal, resilient offline presentation adhering to the locked design system.
 * Palette: Graphite (#171916), Chalk (#F3F0E7), Vermilion (#E44427), Sage (#858076).
 */
export default function OfflineState({
  onRetry,
  onContinueOffline,
  fullScreen = true,
}: OfflineStateProps) {
  const [isChecking, setIsChecking] = useState(false);
  const toast = useToast();

  const handleCheckConnection = async () => {
    setIsChecking(true);
    try {
      if (onRetry) {
        await onRetry();
      } else if (typeof window !== 'undefined') {
        const online = window.navigator.onLine;
        if (online) {
          toast.success('Connection restored! Cloud sync resumed.', 'Back Online');
          if (onContinueOffline) onContinueOffline();
        } else {
          toast.info('Still offline. Local gym mode remains fully operational.', 'Offline Mode');
        }
      }
    } catch {
      toast.error('Network check failed. You can keep training offline.', 'Offline');
    } finally {
      setIsChecking(false);
    }
  };

  const content = (
    <div className="w-full max-w-sm mx-auto p-6 sm:p-7 space-y-6 rounded-2xl bg-bg-card border border-border shadow-2xl animate-fade-in text-center select-none">
      {/* ── Screen 27: Slashed Offline Icon Badge ───────────────────────── */}
      <div className="mx-auto w-16 h-16 rounded-full bg-accent/15 border-2 border-accent/40 flex items-center justify-center text-accent shadow-xs">
        <WifiOff className="w-8 h-8 stroke-[2.2]" />
      </div>

      {/* ── Status Badge ────────────────────────────────────────────────── */}
      <div className="flex justify-center -mt-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-3xs font-mono font-bold uppercase tracking-wider bg-bg-secondary text-text-secondary border border-border">
          <span className="w-2 h-2 rounded-full bg-sage animate-pulse" />
          Offline Gym Mode Active
        </span>
      </div>

      {/* ── Heading & Context ───────────────────────────────────────────── */}
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold font-sans text-text-primary tracking-tight">
          You&apos;re Offline
        </h1>
        <p className="text-xs text-text-secondary leading-relaxed px-2 font-sans">
          No internet connection detected. Offline Gym Mode is active — you can continue logging workouts, PRs, and meals locally without interruption.
        </p>
      </div>

      {/* ── Offline Guarantee Checklist ─────────────────────────────────── */}
      <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 text-left space-y-2">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-sage shrink-0 mt-0.5" />
          <p className="text-3xs text-text-secondary leading-snug">
            <strong className="text-text-primary font-semibold block">Local Logging Active</strong>
            All workouts, sets, and meals save safely to device storage.
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-sage shrink-0 mt-0.5" />
          <p className="text-3xs text-text-secondary leading-snug">
            <strong className="text-text-primary font-semibold block">Full Gym Engine</strong>
            Rest timers, 1RM calculators, and routines work 100% offline.
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-sage shrink-0 mt-0.5" />
          <p className="text-3xs text-text-secondary leading-snug">
            <strong className="text-text-primary font-semibold block">Automatic Cloud Sync</strong>
            Queued changes automatically upload once connectivity returns.
          </p>
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="space-y-2.5 pt-1">
        <button
          type="button"
          onClick={handleCheckConnection}
          disabled={isChecking}
          className="w-full min-h-[46px] py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-accent hover:bg-accent-dim text-white flex items-center justify-center gap-2 shadow-sm shadow-accent/20 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{isChecking ? 'Checking Network...' : 'Check Connection'}</span>
        </button>

        {onContinueOffline && (
          <button
            type="button"
            onClick={onContinueOffline}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border/80 text-xs font-bold text-text-primary flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>Continue in Gym Mode</span>
            <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
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
