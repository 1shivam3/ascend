'use client';

import React, { useMemo, useState } from 'react';
import {
  Play,
  Settings,
  ChevronRight,
  Sparkles,
  Scale,
  UtensilsCrossed,
  Check,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { isMainCompoundLift, suggestLoad } from '@/lib/strength-standards';
import SettingsModal from '@/components/SettingsModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import InstallAppBanner from '@/components/InstallAppBanner';
import { calculateMealMacros } from '@/lib/macros';
import { toLocalDateString } from '@/lib/habits';
import { useToast } from '@/components/ui/Toast';
import { PlannedWorkout, PlannedExercise, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import { getTodaySessionState, getLastExercisePerformance } from '@/lib/workout-engine';

interface HomePageProps {
  onNavigate: (tab: 'home' | 'prs' | 'workout' | 'meals' | 'progress') => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const {
    profile,
    prs,
    workouts,
    meals,
    macroGoals,
    trainingProfile,
    plannedWorkouts,
    addPlannedWorkout,
    activeWorkoutDraft,
    clearWorkoutDraft,
    goals,
    weeklySchedule,
  } = useStore();

  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalDateString(today), [today]);

  const greeting = useMemo(() => {
    const h = today.getHours();
    if (h < 12) return 'GOOD MORNING';
    if (h < 17) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  }, [today]);

  const userUnit = profile?.unit || 'kg';

  // Athlete Primary Goal
  const primaryGoal = (goals && goals.length > 0) ? goals[0] : (profile?.goals?.[0] || 'build_muscle');
  const goalLabel = ATHLETE_GOAL_CONFIGS[primaryGoal]?.label || 'Build Muscle';

  // Bodyweight display
  const bodyweightDisplay = useMemo(() => {
    const bwKg = profile?.bodyweightKg || 72;
    if (userUnit === 'lbs') {
      return `${Math.round(bwKg * 2.20462)} lbs`;
    }
    return `${Math.round(bwKg)} kg`;
  }, [profile?.bodyweightKg, userUnit]);

  // Today's workout session state (single source of truth)
  const sessionInfo = useMemo(() => {
    return getTodaySessionState(
      todayStr,
      workouts,
      plannedWorkouts,
      activeWorkoutDraft,
      userUnit,
      weeklySchedule
    );
  }, [todayStr, workouts, plannedWorkouts, activeWorkoutDraft, userUnit, weeklySchedule]);

  // Top focus lift for today
  const topFocus = useMemo(() => {
    // 1. Identify primary compound lift
    const exercises = sessionInfo.exercises || [];
    const compoundName = exercises.find((name) => isMainCompoundLift(name)) || exercises[0] || 'Bench Press';

    // 2. Check previous session performance
    const lastPerf = getLastExercisePerformance(compoundName, workouts);

    // 3. Check baseline PR if no workouts logged
    const baselinePR = prs.find((p) => p.exercise.toLowerCase() === compoundName.toLowerCase());

    // 4. Determine target prescription
    const targetReps = primaryGoal === 'get_stronger' ? 4 : 8;
    const targetRPE = 8;
    let targetLoadStr = '';

    if (lastPerf?.bestWeight && lastPerf.bestWeight > 0) {
      // Small progressive overload step
      const step = userUnit === 'lbs' ? 5 : 2.5;
      const targetWeight = lastPerf.bestWeight + step;
      targetLoadStr = `${targetWeight} ${userUnit} × ${targetReps} @${targetRPE}`;
    } else if (baselinePR && baselinePR.oneRepMax > 0) {
      const suggested = suggestLoad(baselinePR.oneRepMax, targetReps, targetRPE, userUnit);
      targetLoadStr = `${suggested} ${userUnit} × ${targetReps} @${targetRPE}`;
    } else {
      const defaultLoad = userUnit === 'lbs' ? 135 : 60;
      targetLoadStr = `${defaultLoad} ${userUnit} × ${targetReps} @${targetRPE}`;
    }

    let lastDisplay = 'Last: —';
    if (lastPerf) {
      lastDisplay = `Last: ${lastPerf.summary}`;
    } else if (baselinePR && workouts.length === 0) {
      const w = userUnit === 'lbs' ? baselinePR.weightLbs : baselinePR.weightKg;
      lastDisplay = `Base: ${w} × ${baselinePR.reps}`;
    }

    return {
      name: compoundName,
      targetLoadStr,
      lastDisplay,
    };
  }, [sessionInfo.exercises, workouts, prs, primaryGoal, userUnit]);

  // Weekly consistency: M T W T F S S
  const weeklyStats = useMemo(() => {
    const targetDays = trainingProfile?.daysPerWeek || 4;
    const now = new Date();
    // Monday of current week
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const weekWorkouts = workouts.filter((w) => {
      const d = new Date(w.date);
      return d >= startOfWeek;
    });

    const uniqueTrainedDates = new Set(
      weekWorkouts.map((w) => w.date.split('T')[0])
    );

    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const days = dayLabels.map((letter, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dStr = toLocalDateString(d);
      const isPastOrToday = d <= now;
      const isToday = dStr === todayStr;
      const isCompleted = uniqueTrainedDates.has(dStr);
      return {
        letter,
        dateStr: dStr,
        isCompleted,
        isToday,
        isPastOrToday,
      };
    });

    return {
      completedCount: uniqueTrainedDates.size,
      targetDays,
      days,
    };
  }, [workouts, trainingProfile?.daysPerWeek, todayStr]);

  // Today's Fuel summary
  const fuelStats = useMemo(() => {
    const todayDate = new Date().toISOString().split('T')[0];
    const todayMeals = meals.filter((m) => m.date === todayDate);
    const macros = calculateMealMacros(todayMeals.flatMap((m) => m.foods));

    const bwKg = profile?.bodyweightKg || 72;
    const calTarget = macroGoals?.calories || 2400;
    const protTarget = macroGoals?.proteinG || Math.round(bwKg * 2.0);

    return {
      calories: Math.round(macros.calories),
      targetCalories: calTarget,
      protein: Math.round(macros.proteinG),
      targetProtein: protTarget,
      calPct: Math.min(100, Math.round((macros.calories / Math.max(1, calTarget)) * 100)),
      protPct: Math.min(100, Math.round((macros.proteinG / Math.max(1, protTarget)) * 100)),
    };
  }, [meals, profile?.bodyweightKg, macroGoals]);

  // Modal triggers
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBodyMetricsModalOpen, setIsBodyMetricsModalOpen] = useState(false);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);

  const handleStartSuggestedWorkout = (workoutName: string, exercises: PlannedExercise[]) => {
    const newPlanId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan_${Date.now()}`;
    const plannedWorkout: PlannedWorkout = {
      id: newPlanId,
      name: workoutName,
      createdAt: new Date().toISOString(),
      exercises,
    };
    addPlannedWorkout(plannedWorkout);
    toast.success(`Loaded "${workoutName}" into Workout Plans`, 'Workout Ready');
    onNavigate('workout');
  };

  return (
    <div className="page animate-fade-in space-y-6 pb-24 max-w-md mx-auto px-4">
      <InstallAppBanner />

      {/* ── 1. GREETING & ATHLETE PROFILE ───────────────────────────────────── */}
      <header className="flex justify-between items-start pt-2">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight font-sans">
            {greeting}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => setIsGoalSelectorOpen(true)}
              className="text-sm font-semibold text-text-secondary hover:text-accent transition-colors cursor-pointer"
            >
              {goalLabel}
            </button>
            <span className="text-xs text-text-muted">•</span>
            <button
              type="button"
              onClick={() => setIsBodyMetricsModalOpen(true)}
              className="text-sm font-semibold text-text-secondary hover:text-accent transition-colors cursor-pointer"
            >
              {bodyweightDisplay}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="w-9 h-9 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted hover:text-text-primary active:scale-95 transition-all"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* Active Workout Draft Alert */}
      {activeWorkoutDraft && (
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-between text-xs">
          <span className="font-semibold text-accent">Active session in progress</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                clearWorkoutDraft();
                toast.info('Session draft discarded.');
              }}
              className="text-text-muted hover:text-danger"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => onNavigate('workout')}
              className="px-2.5 py-1 rounded-lg bg-accent text-white font-bold"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* ── 2. TODAY'S WORKOUT ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
            TODAY
          </span>
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className="text-2xs font-medium text-text-muted hover:text-accent flex items-center gap-1 transition-colors"
          >
            <span>Change Plan</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-text-primary tracking-tight font-sans">
              {sessionInfo.title}
            </h2>
            {sessionInfo.bodyParts && sessionInfo.bodyParts.length > 0 && !sessionInfo.isRestDay && (
              <span className="text-3xs font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">
                {sessionInfo.bodyParts.join(' • ')}
              </span>
            )}
          </div>

          {sessionInfo.isRestDay ? (
            <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">
              Scheduled rest day. Hydrate, hit your protein goals, and let your body recover.
            </p>
          ) : sessionInfo.exercises && sessionInfo.exercises.length > 0 ? (
            <div className="mt-2 space-y-1">
              {sessionInfo.exercises.slice(0, 5).map((ex, idx) => (
                <div key={idx} className="text-sm text-text-secondary flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0" />
                  <span>{ex}</span>
                </div>
              ))}
              {sessionInfo.exercises.length > 5 && (
                <span className="text-xs text-text-muted pl-3.5 block">
                  +{sessionInfo.exercises.length - 5} more
                </span>
              )}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onNavigate('workout')}
          className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer ${
            sessionInfo.isRestDay || sessionInfo.status === 'completed'
              ? 'bg-bg-secondary text-text-primary hover:bg-bg-secondary/80 border border-border/50'
              : 'btn-primary shadow-lg shadow-accent/20'
          }`}
        >
          <Play
            className={`w-4 h-4 ${
              sessionInfo.isRestDay || sessionInfo.status === 'completed'
                ? 'fill-text-primary stroke-text-primary'
                : 'fill-white stroke-white'
            }`}
          />
          <span>
            {activeWorkoutDraft
              ? 'RESUME WORKOUT'
              : sessionInfo.status === 'completed'
              ? 'VIEW WORKOUT LOG'
              : sessionInfo.isRestDay
              ? 'START A WORKOUT ANYWAY'
              : 'START WORKOUT'}
          </span>
        </button>
      </section>

      {/* ── DIVIDER ───────────────────────────────────────────────────────── */}
      <div className="divider" />

      {/* ── 3. TOP FOCUS ──────────────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
          {sessionInfo.isRestDay ? 'UPCOMING FOCUS' : 'TOP FOCUS'}
        </span>
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-bold text-text-primary font-sans">
            {topFocus.name}
          </h3>
          <span className="text-xs font-mono text-text-muted">
            {topFocus.lastDisplay}
          </span>
        </div>
        <div className="text-lg font-bold text-accent font-mono tracking-tight">
          {topFocus.targetLoadStr}
        </div>
      </section>

      {/* ── DIVIDER ───────────────────────────────────────────────────────── */}
      <div className="divider" />

      {/* ── 4. THIS WEEK CONSISTENCY ──────────────────────────────────────── */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
            THIS WEEK
          </span>
          <span className="text-xs font-semibold text-text-primary">
            {weeklyStats.completedCount} / {weeklyStats.targetDays} sessions
          </span>
        </div>

        {/* 7-day strip */}
        <div className="grid grid-cols-7 gap-2 pt-1">
          {weeklyStats.days.map((day, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <span className="text-2xs font-medium text-text-muted">
                {day.letter}
              </span>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  day.isCompleted
                    ? 'bg-accent text-white shadow-xs'
                    : day.isToday
                    ? 'border-2 border-accent text-accent'
                    : 'bg-bg-secondary text-text-muted border border-border/40'
                }`}
              >
                {day.isCompleted ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <span className="text-3xs font-mono font-normal">
                    {day.dateStr.slice(8)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── DIVIDER ───────────────────────────────────────────────────────── */}
      <div className="divider" />

      {/* ── 5. TODAY'S FUEL ───────────────────────────────────────────────── */}
      <section
        onClick={() => onNavigate('meals')}
        className="space-y-2 cursor-pointer group"
      >
        <div className="flex items-center justify-between">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
            TODAY&apos;S FUEL
          </span>
          <div className="flex items-center gap-1 text-xs font-medium text-text-muted group-hover:text-accent transition-colors">
            <span>Log Meal</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="flex items-baseline justify-between text-xs">
          <div>
            <span className="text-sm font-bold text-text-primary font-mono">
              {fuelStats.calories.toLocaleString()}
            </span>
            <span className="text-text-muted"> / {fuelStats.targetCalories.toLocaleString()} kcal</span>
          </div>
          <div>
            <span className="text-sm font-bold text-text-primary font-mono">
              {fuelStats.protein}g
            </span>
            <span className="text-text-muted"> / {fuelStats.targetProtein}g protein</span>
          </div>
        </div>

        {/* Minimal macro bar */}
        <div className="h-1.5 w-full bg-bg-secondary rounded-full overflow-hidden flex gap-1">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${fuelStats.calPct}%` }}
          />
        </div>
      </section>

      {/* ── MODALS ── */}
      <GoalSelectorModal
        isOpen={isGoalSelectorOpen}
        onClose={() => setIsGoalSelectorOpen(false)}
      />

      <BodyMetricsModal
        isOpen={isBodyMetricsModalOpen}
        onClose={() => setIsBodyMetricsModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <SuggestedWorkoutModal
        isOpen={isSuggestedModalOpen}
        onClose={() => setIsSuggestedModalOpen(false)}
        userUnit={profile?.unit || 'kg'}
        defaultIntensity={primaryGoal === 'get_stronger' ? 'high' : 'medium'}
        onStartWorkout={handleStartSuggestedWorkout}
        onSavePlan={(plan) => {
          const newPlan: PlannedWorkout = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan_${Date.now()}`,
            name: plan.name,
            createdAt: new Date().toISOString(),
            exercises: plan.exercises,
          };
          addPlannedWorkout(newPlan);
          toast.success(`Saved "${plan.name}" to Workout Plans`, 'Plan Created');
        }}
      />
    </div>
  );
}
