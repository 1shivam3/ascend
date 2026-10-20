'use client';

import React, { useMemo } from 'react';
import { X, Trophy } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/use-today';
import {
  monthlyChallenges,
  evaluateChallenge,
  challengeInstanceKey,
  getChallengeMonth,
  type ChallengeMetric,
} from '@/lib/challenges';
import { XP_CHALLENGE_COMPLETE } from '@/lib/xp-system';
import { buildActiveDays, calculateStreak } from '@/lib/streak-freeze';
import { useEscapeToClose } from '@/lib/use-escape-to-close';
import { useToast } from '@/components/ui/Toast';
import FriendChallengesSection from '@/components/FriendChallengesSection';

interface ChallengesSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

function goalText(target: number, metric: ChallengeMetric): string {
  switch (metric) {
    case 'workouts':
      return `Goal: ${target} workouts this month`;
    case 'breakfasts':
      return `Goal: log breakfast on ${target} days`;
    case 'streak_days':
      return `Goal: reach a ${target}-day streak`;
    case 'prs':
      return `Goal: ${target} personal records this month`;
    case 'meals':
      return `Goal: ${target} meals this month`;
    case 'water_days':
      return `Goal: log water on ${target} days`;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * ChallengesSheet — browse this month's opt-in challenges. Quiet by design:
 * joining is a choice, leaving costs nothing, and progress counts only what
 * the user already logs. No badges, no reminders, no pressure copy.
 */
export default function ChallengesSheet({ isOpen, onClose }: ChallengesSheetProps) {
  useEscapeToClose(isOpen, onClose);
  const toast = useToast();
  const {
    workouts,
    meals,
    prs,
    waterLogs,
    streak,
    challenges: challengesState,
    optInChallenge,
    optOutChallenge,
  } = useStore();
  const todayStr = useToday();

  const month = getChallengeMonth(todayStr);
  const monthLabel = useMemo(
    () =>
      new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [month],
  );

  const daysLeftInMonth = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return Math.max(0, lastDay - d);
  }, [todayStr]);

  const items = useMemo(() => {
    if (!isOpen) return [];
    const normalizedWorkouts = workouts.map((w) => ({ ...w, date: w.date.split('T')[0] }));
    const activeDays = buildActiveDays(normalizedWorkouts, meals);
    const streakInfo = calculateStreak({
      dailyActivity: activeDays,
      freezesAvailable: streak.freezesAvailable,
      todayStr,
    });
    const data = {
      workouts: normalizedWorkouts,
      meals,
      prs: (prs || []).map((p) => ({ date: (p.date || '').split('T')[0] })),
      currentStreak: streakInfo.currentStreak,
      waterDays: Object.keys(waterLogs || {}).filter((d) => (waterLogs?.[d] || 0) > 0),
    };
    return monthlyChallenges(month).map((def) => {
      const key = challengeInstanceKey(def);
      const inst = challengesState?.instances?.[key];
      return {
        def,
        key,
        optedIn: Boolean(inst?.optedIn),
        evaluation: evaluateChallenge(def, data),
      };
    });
  }, [isOpen, month, workouts, meals, prs, waterLogs, streak.freezesAvailable, challengesState, todayStr]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Monthly challenges"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-base font-bold text-text-primary">Challenges</h3>
              <p className="text-2xs text-text-muted">{monthLabel} · optional side quests</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label="Close challenges"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {items.map(({ def, key, optedIn, evaluation }) => (
            <div key={key} className="p-3.5 rounded-2xl bg-bg-secondary border border-border/60 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-primary">{def.title}</p>
                  <p className="text-3xs text-text-muted mt-0.5 leading-relaxed">{def.description}</p>
                </div>
                <span className="text-3xs font-bold text-amber-500 tabular-nums shrink-0 pt-0.5">
                  +{XP_CHALLENGE_COMPLETE} XP
                </span>
              </div>
              <p className="text-3xs font-semibold text-text-secondary">{goalText(def.target, def.metric)}</p>

              {optedIn && evaluation.completed ? (
                <p className="text-xs font-bold text-emerald-500">
                  Complete — {XP_CHALLENGE_COMPLETE} XP earned
                  {evaluation.completedDate ? ` · finished ${formatDate(evaluation.completedDate)}` : ''}
                </p>
              ) : optedIn ? (
                <>
                  <div className="w-full h-2 rounded-full bg-border/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${evaluation.pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-3xs text-text-muted tabular-nums">
                      {evaluation.progress} of {evaluation.target} · {evaluation.pct}% · {daysLeftInMonth} day{daysLeftInMonth === 1 ? '' : 's'} left this month
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        optOutChallenge(key);
                        toast.info('Challenge left. No hard feelings — it will be here next month too.', 'Challenge Left');
                      }}
                      className="text-3xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
                    >
                      Leave
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    optInChallenge(key);
                    toast.success('Challenge joined. Progress counts what you already log.', 'Challenge Accepted');
                  }}
                  className="py-2 px-4 rounded-xl bg-accent text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
                >
                  Join challenge
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="text-3xs text-text-muted leading-relaxed">
          Challenges never add new chores — progress comes only from workouts, meals, and PRs you log anyway. Join or leave anytime.
        </p>

        <div className="border-t border-border/60 pt-4">
          <FriendChallengesSection active={isOpen} />
        </div>
      </div>
    </div>
  );
}
