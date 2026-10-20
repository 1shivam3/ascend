'use client';

import { useMemo } from 'react';
import { useStore } from './store';
import {
  calculateReadiness,
  detectStalls,
  detectMissedSessions,
  detectPatterns,
  generateCheckIn,
  analyzeWeightTrend,
  suggestCalorieAdjustment,
  getWeightLogStats,
  isCalorieSuggestionSuppressed,
  adjustNextTargets,
  type PlannedTarget,
} from './coach-engine';
import type { Unit } from './types';
import { getWeekRange, getLocalTodayStr } from './formatters';
import { resolvePrimaryGoal } from './types';
import { calculateStreak, buildActiveDays } from './streak-freeze';
import { getLevel, progressToNext, getLevelName } from './xp-system';

/**
 * useCoachDigest — single hook that computes everything the UI needs
 * from the coach engine, XP system, and streak system.
 *
 * Computed on render (pure functions, cheap). The redesign uses this
 * for home, workout screens, and check-ins.
 */
export function useCoachDigest() {
  const workouts = useStore((s) => s.workouts);
  const meals = useStore((s) => s.meals);
  const bodyMetrics = useStore((s) => s.bodyMetrics);
  const macroGoals = useStore((s) => s.macroGoals);
  const goals = useStore((s) => s.goals);
  const profile = useStore((s) => s.profile);
  const xp = useStore((s) => s.xp);
  const streakState = useStore((s) => s.streak);
  const coach = useStore((s) => s.coach);
  const weeklySchedule = useStore((s) => s.weeklySchedule);
  const plannedWorkouts = useStore((s) => s.plannedWorkouts);
  const dailyCheckins = useStore((s) => s.dailyCheckins);

  const readiness = useMemo(
    () => calculateReadiness(workouts, bodyMetrics, dailyCheckins?.[getLocalTodayStr()]),
    [workouts, bodyMetrics, dailyCheckins]
  );

  const stalls = useMemo(
    () => detectStalls(workouts).filter(
      (s) => !coach.stallFlags[s.exercise.toLowerCase()]?.acknowledged
    ),
    [workouts, coach.stallFlags]
  );

  const streak = useMemo(() => {
    const activeDays = buildActiveDays(workouts, meals);
    return calculateStreak({
      dailyActivity: activeDays,
      freezesAvailable: streakState.freezesAvailable,
    });
  }, [workouts, meals, streakState.freezesAvailable]);

  const levelInfo = useMemo(() => {
    const prog = progressToNext(xp.totalXp);
    return { ...prog, name: getLevelName(prog.level) };
  }, [xp.totalXp]);

  const checkIn = useMemo(() => {
    const week = getWeekRange(new Date());
    // Convert WeeklySchedule (Record<DayOfWeek, config>) to PlannedSession[]
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const planned: { weekday: number; name: string; planId?: string }[] = [];
    dayOrder.forEach((day, idx) => {
      const cfg = (weeklySchedule as any)?.[day];
      if (cfg && cfg.workoutPlanId && cfg.workoutPlanId !== 'rest') {
        planned.push({
          weekday: idx,
          name: cfg.customTitle || `Workout`,
          planId: cfg.workoutPlanId,
        });
      }
    });
    const missed = detectMissedSessions(planned, workouts, week);
    const active = missed.filter(
      (m) => !coach.dismissedCheckIns.includes(`missed:${m.date}:${m.name}`)
    );
    if (active.length === 0) return null;
    return { message: generateCheckIn(active), sessions: active };
  }, [weeklySchedule, workouts, coach.dismissedCheckIns]);

  const patterns = useMemo(
    () => detectPatterns(workouts),
    [workouts]
  );

  const nutrition = useMemo(() => {
    const trend = analyzeWeightTrend(bodyMetrics);
    const stats = getWeightLogStats(bodyMetrics);
    const rawSuggestion = macroGoals
      ? suggestCalorieAdjustment(
          trend,
          // The PRIMARY goal decides — goals[0] is tap order, so a
          // fat-loss user who also tapped "Build Muscle" could be advised
          // +100 kcal against their deficit.
          resolvePrimaryGoal(goals),
          macroGoals,
          // Gender drives the safe floor; omitting it silently defaulted
          // everyone to the male floor.
          profile?.gender ?? 'male'
        )
      : null;
    // After an apply/dismiss, never immediately re-offer a change: stay
    // quiet until 3 fresh weigh-ins or the two-week reassessment window.
    const suppressed = isCalorieSuggestionSuppressed(
      coach.lastCalorieAdjustment,
      bodyMetrics,
      getLocalTodayStr()
    );
    return {
      trend,
      suggestion: suppressed ? null : rawSuggestion,
      suppressed,
      weightLogCount: stats.count,
      latestWeightDate: stats.latestDate,
    };
  }, [bodyMetrics, macroGoals, goals, profile?.gender, coach.lastCalorieAdjustment]);

  // Auto-regulation, wired at last: adjustNextTargets (RPE + reps +
  // pain, %-based) existed fully tested but had ZERO production callers —
  // the shipped surfaces used the cruder fixed-step logic instead. The
  // digest now computes adjustments for the plan the last workout came
  // from, and Home renders them as the coach's next-session calls.
  const nextAdjustments = useMemo(() => {
    if (!workouts || workouts.length === 0 || !plannedWorkouts || plannedWorkouts.length === 0) {
      return [];
    }
    const last = [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
    const plan =
      plannedWorkouts.find((p) => last.planId && p.id === last.planId) ||
      plannedWorkouts.find(
        (p) => last.name && p.name.trim().toLowerCase() === (last.name || '').trim().toLowerCase()
      );
    if (!plan) return [];
    const targets: PlannedTarget[] = (plan.exercises || [])
      .filter((e) => typeof e.targetWeight === 'number' && e.targetWeight > 0)
      .map((e) => ({
        exercise: e.name,
        weight: e.targetWeight as number,
        reps: e.targetReps,
        sets: e.targetSets,
        unit: (e.targetUnit as Unit) || profile?.unit || 'kg',
      }));
    if (targets.length === 0) return [];
    return adjustNextTargets(last, targets).slice(0, 3);
  }, [workouts, plannedWorkouts, profile?.unit]);

  return {
    readiness,
    nextAdjustments,
    stalls,
    streak: {
      ...streak,
      longest: streakState.longestStreak,
      freezesAvailable: streakState.freezesAvailable,
    },
    level: levelInfo,
    checkIn,
    patterns,
    nutrition,
  };
}
