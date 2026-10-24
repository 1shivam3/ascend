'use client';

import React, { useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from '@/lib/i18n';

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
  const { t } = useTranslation();
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
          toast.success(t('offline.toastOnlineMsg'), t('offline.toastOnlineTitle'));
          if (onContinueOffline) onContinueOffline();
        } else {
          toast.info(t('offline.toastOfflineMsg'), t('offline.toastOfflineTitle'));
        }
      }
    } catch {
      toast.error(t('offline.toastFailMsg'), t('offline.toastFailTitle'));
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
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-mono font-bold uppercase tracking-wider bg-bg-secondary text-text-secondary border border-border">
          <span className="w-2 h-2 rounded-full bg-sage" />
          {t('offline.badge')}
        </span>
      </div>

      {/* ── Heading & Context ───────────────────────────────────────────── */}
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold font-sans text-text-primary tracking-tight">
          {t('offline.title')}
        </h1>
        <p className="text-xs text-text-secondary leading-relaxed px-2 font-sans">
          {t('offline.desc')}
        </p>
      </div>

      {/* ── Offline Guarantee Checklist ─────────────────────────────────── */}
      <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 text-left space-y-2">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-sage shrink-0 mt-0.5" />
          <p className="text-2xs text-text-secondary leading-snug">
            <strong className="text-text-primary font-semibold block">{t('offline.localTitle')}</strong>
            {t('offline.localDesc')}
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-sage shrink-0 mt-0.5" />
          <p className="text-2xs text-text-secondary leading-snug">
            <strong className="text-text-primary font-semibold block">{t('offline.engineTitle')}</strong>
            {t('offline.engineDesc')}
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-sage shrink-0 mt-0.5" />
          <p className="text-2xs text-text-secondary leading-snug">
            <strong className="text-text-primary font-semibold block">{t('offline.syncTitle')}</strong>
            {t('offline.syncDesc')}
          </p>
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="space-y-2.5 pt-1">
        <button
          type="button"
          onClick={handleCheckConnection}
          disabled={isChecking}
          className="w-full min-h-[46px] py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-accent hover:bg-accent-dim text-accent-on flex items-center justify-center gap-2 shadow-sm shadow-accent/20 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{isChecking ? t('offline.checking') : t('offline.check')}</span>
        </button>

        {onContinueOffline && (
          <button
            type="button"
            onClick={onContinueOffline}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border/80 text-xs font-bold text-text-primary flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>{t('offline.continue')}</span>
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
