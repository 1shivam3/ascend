'use client';

/**
 * Muscle Volume + Recovery — Progress tab section.
 *
 * Weekly working sets per muscle (Mon–Sun, previous week alongside for
 * comparison) plus a recovery map (days since last trained + a
 * fresh/recent/fatigued label). The label is a transparent heuristic,
 * not a measurement — the exact rules sit in the Why dropdown.
 * Toggleable from Settings (uiPreferences.showMuscleVolume).
 */
import React, { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { CollapsibleDetails } from '@/components/ui/CollapsibleDetails';
import {
  computeMuscleVolume,
  computeMuscleRecovery,
  type RecoveryStatus,
} from '@/lib/muscle-volume';
import { getLocalTodayStr } from '@/lib/formatters';
import type { WorkoutEntry } from '@/lib/types';

const STATUS_STYLES: Record<RecoveryStatus, string> = {
  fresh: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  recent: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  fatigued: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  never: 'bg-bg-secondary text-text-muted border-border',
};

export default function MuscleVolumeSection({ workouts }: { workouts: WorkoutEntry[] }) {
  const show = useStore((s) => s.uiPreferences?.showMuscleVolume !== false);
  const { t } = useTranslation();

  const today = getLocalTodayStr();
  const volume = useMemo(() => computeMuscleVolume(workouts, today), [workouts, today]);
  const recovery = useMemo(() => computeMuscleRecovery(workouts, today), [workouts, today]);
  const maxSets = Math.max(1, ...volume.rows.map((r) => Math.max(r.sets, r.prevSets)));

  if (!show) return null;

  const statusLabel = (status: RecoveryStatus): string =>
    status === 'fresh'
      ? t('progress.recoveryFresh')
      : status === 'recent'
        ? t('progress.recoveryRecent')
        : status === 'fatigued'
          ? t('progress.recoveryFatigued')
          : t('progress.recoveryNever');

  return (
    <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-text-primary font-sans">
          {t('progress.muscleVolume')}
        </h3>
        <span className="text-xs font-mono font-bold text-text-secondary">
          {volume.totalSets} {t('progress.setsThisWeek')}
        </span>
      </div>

      {/* Weekly sets per muscle, with previous week ghost bar */}
      <div className="space-y-2.5">
        {volume.rows.map((row) => (
          <div key={row.muscle} className="space-y-1">
            <div className="flex justify-between text-2xs">
              <span className="text-text-secondary font-semibold">{row.muscle}</span>
              <span className="text-text-primary font-bold font-mono">
                {row.sets}
                <span className="text-text-muted font-medium">
                  {' '}
                  vs {row.prevSets}
                  {row.delta !== 0 && (
                    <span className={row.delta > 0 ? ' text-emerald-400' : ' text-amber-400'}>
                      {' '}
                      ({row.delta > 0 ? '+' : ''}
                      {row.delta})
                    </span>
                  )}
                </span>
              </span>
            </div>
            <div className="relative h-2 w-full bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-border/70 rounded-full"
                style={{ width: `${(row.prevSets / maxSets) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-accent rounded-full"
                style={{ width: `${(row.sets / maxSets) * 100}%` }}
              />
            </div>
          </div>
        ))}
        <p className="text-2xs text-text-muted">
          Orange = this week · grey = last week
        </p>
      </div>

      {/* Recovery map */}
      <div className="pt-3 border-t border-border/60 space-y-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider font-mono">
          {t('progress.recoveryMap')}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {recovery.map((row) => (
            <div
              key={row.muscle}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-bg-secondary/60 border border-border/60"
            >
              <div className="min-w-0">
                <span className="text-xs font-bold text-text-primary block">{row.muscle}</span>
                <span className="text-2xs text-text-muted block">
                  {row.daysSince === null
                    ? t('progress.recoveryNever')
                    : row.daysSince === 0
                      ? t('common.today')
                      : t('progress.daysAgo', { days: row.daysSince })}
                </span>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full border text-2xs font-bold ${STATUS_STYLES[row.status]}`}
              >
                {statusLabel(row.status)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <CollapsibleDetails label={t('progress.volumeWhyLabel')}>
        <p className="text-2xs text-text-secondary leading-relaxed">
          Volume counts completed working sets (warm-ups excluded) for each exercise&rsquo;s
          main muscle, Monday to Sunday. Recovery is a simple guide, not a measurement:
          a muscle is <strong>Fatigued</strong> after 8+ working sets in the last 48 hours,{' '}
          <strong>Recent</strong> when trained within the last 4 days, and <strong>Fresh</strong>{' '}
          after 5+ days of rest. Your actual readiness also depends on sleep, soreness and
          life — when in doubt, trust how the warm-up sets feel.
        </p>
      </CollapsibleDetails>
    </div>
  );
}
