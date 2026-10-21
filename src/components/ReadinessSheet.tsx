'use client';

import React from 'react';
import { X, Activity } from 'lucide-react';
import type { ReadinessResult, ManualCheckin } from '@/lib/coach-engine';
import { useEscapeToClose } from '@/lib/use-escape-to-close';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';

interface ReadinessSheetProps {
  isOpen: boolean;
  onClose: () => void;
  readiness: ReadinessResult;
  /** Today's feel check-in, if the user has given one. */
  todayCheckin?: ManualCheckin;
  todayStr: string;
  onCheckin: (date: string, checkin: ManualCheckin) => void;
}

const BAND_LABEL: Record<ReadinessResult['band'], StringKey> = {
  primed: 'ready.bandPrimed',
  ready: 'ready.bandReady',
  caution: 'ready.bandCaution',
  rest: 'ready.bandRest',
};

/** One line on what each band means — presentation copy for the score bands
 *  the engine returns; the numbers themselves are computed internally. */
const BAND_MEANING: Record<ReadinessResult['band'], StringKey> = {
  primed: 'ready.meaningPrimed',
  ready: 'ready.meaningReady',
  caution: 'ready.meaningCaution',
  rest: 'ready.meaningRest',
};

/**
 * ReadinessSheet — everything behind the compact Readiness card: the score,
 * what the band means, the engine's factors, and the optional feel check-in.
 * Readiness is computed internally from training data; the check-in only
 * fine-tunes it and lives here, on demand — never on the card itself.
 */
export default function ReadinessSheet({
  isOpen,
  onClose,
  readiness,
  todayCheckin,
  todayStr,
  onCheckin,
}: ReadinessSheetProps) {
  const { t } = useTranslation();
  useEscapeToClose(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('ready.aria')}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-text-primary">{t('ready.title')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label={t('ready.closeAria')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Score + band meaning */}
        <div>
          <span className="text-4xl font-bold text-text-primary tabular-nums leading-none">
            {readiness.score}
            <span className="text-base font-semibold text-text-muted ml-2">
              {t(BAND_LABEL[readiness.band] ?? 'ready.bandReady')}
            </span>
          </span>
          <p className="text-xs text-text-muted leading-relaxed mt-2">
            {t(BAND_MEANING[readiness.band])}
          </p>
        </div>

        {/* Why — the engine's factors behind the score */}
        {readiness.factors && readiness.factors.length > 0 && (
          <div className="space-y-2">
            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
              {t('ready.why')}
            </span>
            <ul className="space-y-1.5">
              {readiness.factors.map((factor, i) => (
                <li
                  key={i}
                  className="text-xs text-text-secondary leading-relaxed p-2.5 rounded-xl bg-bg-secondary border border-border/60"
                >
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Optional feel check-in — fine-tunes the internal score */}
        <div className="space-y-1.5 pt-1">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
            {t('ready.finetune')}
          </span>
          {(
            [
              ['sleep', t('ready.sleep')],
              ['soreness', t('ready.soreness')],
              ['energy', t('ready.energy')],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-secondary">{label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((v) => {
                  const current = todayCheckin?.[key] ?? 0;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-label={t('ready.factorAria', { label, value: v })}
                      onClick={() => {
                        const next: ManualCheckin = {
                          sleep: todayCheckin?.sleep ?? 3,
                          soreness: todayCheckin?.soreness ?? 3,
                          energy: todayCheckin?.energy,
                        };
                        if (key === 'sleep') next.sleep = v;
                        else if (key === 'soreness') next.soreness = v;
                        else next.energy = v;
                        onCheckin(todayStr, next);
                      }}
                      className={`w-8 h-8 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        current === v
                          ? 'bg-accent text-white'
                          : 'bg-bg-secondary text-text-muted hover:text-text-primary border border-border/60'
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-3xs text-text-muted pt-0.5">
            {todayCheckin
              ? t('ready.checkedIn')
              : t('ready.howFeel')}}
          </p>
        </div>
      </div>
    </div>
  );
}
