'use client';

import { useTranslation } from '@/lib/i18n';
import type { RetainedHistoryCounts } from '@/lib/history-fork';

/**
 * FND-06 — the explicit fork shown on first load when retained local
 * history exists but no profile does (e.g. after a logout that kept
 * local data). ONE screen, both options equally visible: two
 * same-sized buttons, neither pre-selected, neither styled as the
 * "recommended" path.
 *
 * Deviation from the brief's wording, by necessity: there is no name
 * to show as "Continue as [name]" — logout wipes the profile and the
 * ascend_profile key, so no name survives. The screen identifies the
 * history by its counts instead, which is what actually survives.
 */
export interface HistoryForkScreenProps {
  counts: RetainedHistoryCounts;
  onContinue: () => void;
  onStartFresh: () => void;
}

export default function HistoryForkScreen({ counts, onContinue, onStartFresh }: HistoryForkScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-5 bg-bg-primary">
      <div className="card p-6 bg-bg-card border border-border rounded-2xl shadow-xs space-y-5 max-w-md w-full animate-fade-in">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-extrabold text-text-primary">{t('historyFork.title')}</h1>
          <p className="text-xs text-text-secondary leading-relaxed">{t('historyFork.subtitle')}</p>
          <p className="text-xs font-mono font-bold text-accent">
            {t('historyFork.counts', {
              sessions: counts.sessions,
              meals: counts.meals,
              plans: counts.plans,
              targets: counts.targets,
            })}
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onContinue}
            className="btn-secondary w-full py-3 px-4 text-left space-y-0.5 cursor-pointer"
          >
            <span className="block text-sm font-bold text-text-primary">{t('historyFork.continue')}</span>
            <span className="block text-2xs text-text-muted">
              {t('historyFork.continueHint', {
                sessions: counts.sessions,
                meals: counts.meals,
                plans: counts.plans,
              })}
            </span>
          </button>

          <button
            type="button"
            onClick={onStartFresh}
            className="btn-secondary w-full py-3 px-4 text-left space-y-0.5 cursor-pointer"
          >
            <span className="block text-sm font-bold text-text-primary">{t('historyFork.startFresh')}</span>
            <span className="block text-2xs text-text-muted">{t('historyFork.startFreshHint')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
