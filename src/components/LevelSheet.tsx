'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { X, Trophy, Dumbbell, Utensils, Zap, Droplets, Target, Check } from 'lucide-react';
import {
  xpForLevel,
  getLevelNameKey,
  XP_WORKOUT,
  XP_MEAL,
  XP_PR,
  XP_WATER,
  XP_CHALLENGE_COMPLETE,
  type LevelProgress,
  type XpActivitySummary,
} from '@/lib/xp-system';
import { useTranslation } from '@/lib/i18n';

interface LevelSheetProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  level: number;
  name: string;
  progress: LevelProgress;
  /** XP attributable to this week's logged activity, per source. */
  weekXp: XpActivitySummary;
}

/** Named tiers on the level curve (levels where getLevelName changes). */
const TIER_LEVELS = [0, 1, 5, 10, 15, 20, 25, 30];

/** How XP is earned — values read straight from the XP ledger constants so
 *  this list can never drift from what the app actually awards. */
type EarnRow = { icon: typeof Dumbbell; labelKey: Parameters<ReturnType<typeof useTranslation>['t']>[0]; detailKey: Parameters<ReturnType<typeof useTranslation>['t']>[0]; xp: number };
const EARN_ROWS: EarnRow[] = [
  { icon: Dumbbell, labelKey: 'level.earnWorkout', detailKey: 'level.earnWorkoutDetail', xp: XP_WORKOUT },
  { icon: Utensils, labelKey: 'level.earnMeal', detailKey: 'level.earnMealDetail', xp: XP_MEAL },
  { icon: Zap, labelKey: 'level.earnPr', detailKey: 'level.earnPrDetail', xp: XP_PR },
  { icon: Droplets, labelKey: 'level.earnWater', detailKey: 'level.earnWaterDetail', xp: XP_WATER },
  { icon: Target, labelKey: 'level.earnChallenge', detailKey: 'level.earnChallengeDetail', xp: XP_CHALLENGE_COMPLETE },
];

/**
 * LevelSheet — everything behind the compact Level card: progress to the
 * next level, how XP is earned, this week's XP from logged activity, and
 * the level ladder. Informational only — XP is a record of what already
 * happened, never a quota to hit.
 */
export default function LevelSheet({
  isOpen,
  onClose,
  total,
  level,
  name,
  progress,
  weekXp,
}: LevelSheetProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t } = useTranslation();
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 60);
    return () => clearTimeout(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const remaining = progress.needed - progress.current;
  const ladderLevels = Array.from(new Set([...TIER_LEVELS, level])).sort((a, b) => a - b);
  const weekRows = [
    { label: t('level.rowWorkouts'), xp: weekXp.workoutXp },
    { label: t('level.rowMeals'), xp: weekXp.mealXp },
    { label: t('level.rowPrs'), xp: weekXp.prXp },
    { label: t('level.rowWater'), xp: weekXp.waterXp },
  ].filter((r) => r.xp > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} {...dialogProps}
        className="modal-content max-w-md w-full p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('level.aria')}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-text-primary">{t('level.yourLevel')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label={t('level.closeAria')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current level + progress */}
        <div>
          <span className="text-4xl font-bold text-text-primary tabular-nums leading-none">
            {t('level.levelWord', { level })}
            <span className="text-base font-semibold text-text-muted ml-2">{name}</span>
          </span>
          <p className="text-xs text-text-muted tabular-nums mt-2">
            {t('level.summary', { total: total.toLocaleString(), remaining: remaining.toLocaleString(), next: level + 1 })}
          </p>
          <div className="w-full h-2 rounded-full bg-border/60 overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-accent transition-all duration-700"
              style={{ width: animated ? `${progress.pct}%` : '0%' }}
            />
          </div>
          <p className="text-2xs text-text-muted tabular-nums mt-1.5">
            {t('level.inLevel', { current: progress.current.toLocaleString(), needed: progress.needed.toLocaleString() })}
          </p>
        </div>

        {/* How to earn XP */}
        <div className="space-y-2">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
            {t('level.howEarned')}
          </span>
          <div className="space-y-1.5">
            {EARN_ROWS.map((row) => (
              <div
                key={row.labelKey}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-bg-secondary border border-border/60"
              >
                <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                  <row.icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-text-primary">{t(row.labelKey)}</p>
                  <p className="text-2xs text-text-muted">{t(row.detailKey)}</p>
                </div>
                <span className="text-xs font-bold text-accent-text tabular-nums shrink-0">+{row.xp} XP</span>
              </div>
            ))}
          </div>
          <p className="text-2xs text-text-muted leading-relaxed">
            {t('level.neverExpires')}
          </p>
        </div>

        {/* This week's XP from logged activity */}
        <div className="space-y-2">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
            {t('level.thisWeek')}
          </span>
          {weekXp.total > 0 ? (
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/60 space-y-1">
              {weekRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{r.label}</span>
                  <span className="font-bold text-text-primary tabular-nums">+{r.xp.toLocaleString()} XP</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                <span className="font-bold text-text-primary">{t('level.totalWeek')}</span>
                <span className="font-bold text-accent tabular-nums">+{weekXp.total.toLocaleString()} XP</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-muted leading-relaxed">
              {t('level.nothingWeek')}
            </p>
          )}
        </div>

        {/* Level ladder */}
        <div className="space-y-2">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
            {t('level.ladder')}
          </span>
          <div className="space-y-1.5">
            {ladderLevels.map((lvl) => {
              const isCurrent = lvl === level;
              const reached = lvl < level;
              return (
                <div
                  key={lvl}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                    isCurrent
                      ? 'bg-accent/10 border-accent/40'
                      : reached
                        ? 'bg-bg-secondary border-border/60'
                        : 'bg-bg-secondary/50 border-border/40 opacity-60'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-2xs font-bold ${
                      reached || isCurrent ? 'bg-accent text-accent-on' : 'bg-bg-card text-text-muted border border-border/60'
                    }`}
                  >
                    {reached ? <Check className="w-3.5 h-3.5" /> : lvl}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-text-primary">
                      {t('level.levelWord', { level: lvl })} · {t(getLevelNameKey(lvl))}
                      {isCurrent && <span className="text-accent font-semibold"> {t('level.youAreHere')}</span>}
                    </p>
                  </div>
                  <span className="text-2xs text-text-muted tabular-nums shrink-0">
                    {xpForLevel(lvl).toLocaleString()} XP
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
