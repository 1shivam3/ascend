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
  Flame,
  Zap,
  Trophy,
  Dumbbell,
  Calendar,
  ArrowRight,
  Target,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { isMainCompoundLift, suggestLoad } from '@/lib/strength-standards';
import { getDailyQuote } from '@/lib/quotes';
import SettingsModal from '@/components/SettingsModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import LogPastWorkoutModal from '@/components/LogPastWorkoutModal';
import InstallAppBanner from '@/components/InstallAppBanner';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { calculateMealMacros } from '@/lib/macros';
import { toLocalDateString } from '@/lib/habits';
import { useToast } from '@/components/ui/Toast';
import { PlannedWorkout, PlannedExercise, WorkoutExercise, ATHLETE_GOAL_CONFIGS, DayOfWeek } from '@/lib/types';
import { getTodaySessionState, getLastExercisePerformance } from '@/lib/workout-engine';
import { getScheduledWorkoutForDay, DAY_DISPLAY_INFO } from '@/lib/workout-schedule';
import { plural } from '@/lib/formatters';

interface HomePageProps {
  onNavigate: (tab: 'home' | 'prs' | 'workout' | 'meals' | 'progress') => void;
}

function CircularRing({
  size = 54,
  strokeWidth = 5,
  progress = 0,
  strokeColor = '#e5c07b',
  trackColor = '#27272a',
  children,
}: {
  size?: number;
  strokeWidth?: number;
  progress: number;
  strokeColor?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
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
    saveWorkoutDraft,
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

  // Daily Mindset Quote
  const dailyQuote = useMemo(() => getDailyQuote(), []);

  // Today's workout session state (single source of truth)
  const sessionInfo = useMemo(() => {
    const raw = getTodaySessionState(
      todayStr,
      workouts,
      plannedWorkouts,
      activeWorkoutDraft,
      userUnit,
      weeklySchedule
    );
    // If the athlete has 0 workouts logged ever, override rest day so they start Day 1 immediately!
    if (workouts.length === 0 && !activeWorkoutDraft && raw.status !== 'completed') {
      return {
        ...raw,
        isRestDay: false,
        title: raw.isRestDay ? 'Day 1 — Foundation Workout' : raw.title,
        status: 'not_started' as const,
        exercises: (raw.exercises && raw.exercises.length > 0)
          ? raw.exercises
          : ['Bench Press', 'Barbell Squat', 'Lat Pulldown', 'Overhead Press'],
      };
    }
    return raw;
  }, [todayStr, workouts, plannedWorkouts, activeWorkoutDraft, userUnit, weeklySchedule]);

  // Next scheduled workout session anchor (motivating commitment for tomorrow / next training day)
  const nextScheduledSession = useMemo(() => {
    const daysOrder: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const now = new Date();
    const currentDayIdx = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun

    for (let offset = 1; offset <= 7; offset++) {
      const targetIdx = (currentDayIdx + offset) % 7;
      const targetDay = daysOrder[targetIdx];
      const sched = getScheduledWorkoutForDay(weeklySchedule, targetDay, plannedWorkouts);
      if (!sched.isRest) {
        const dayLabel = offset === 1 ? 'Tomorrow' : (DAY_DISPLAY_INFO[targetDay]?.label || targetDay);
        const routineName = sched.plan?.name.replace('Builtin ', '') || sched.title;
        const bodyParts = sched.bodyParts && sched.bodyParts.length > 0 ? sched.bodyParts.join(' • ') : '';
        return {
          dayLabel,
          routineName,
          bodyParts,
        };
      }
    }
    return null;
  }, [weeklySchedule, plannedWorkouts]);

  // Top focus lift for today
  const topFocus = useMemo(() => {
    const exercises = sessionInfo.exercises || [];
    const compoundName = exercises.find((name) => isMainCompoundLift(name)) || exercises[0] || 'Bench Press';
    const lastPerf = getLastExercisePerformance(compoundName, workouts);
    const baselinePR = prs.find((p) => p.exercise.toLowerCase() === compoundName.toLowerCase());

    const targetReps = primaryGoal === 'get_stronger' ? 4 : 8;
    const targetRPE = 8;
    let targetLoadStr = '';

    if (lastPerf?.bestWeight && lastPerf.bestWeight > 0) {
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
  const [isLogPastModalOpen, setIsLogPastModalOpen] = useState(false);

  // Missed workout catch-up state & detection
  const [dismissedMissedWorkout, setDismissedMissedWorkout] = useState(false);

  const missedWorkoutCatchUp = useMemo(() => {
    if (dismissedMissedWorkout || activeWorkoutDraft || workouts.length === 0 || sessionInfo.status === 'completed') {
      return null;
    }

    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStr = toLocalDateString(yesterdayDate);
    const loggedYesterday = workouts.some((w) => w.date.split('T')[0] === yesterdayStr);
    if (loggedYesterday) return null;

    const daysOrder: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const now = new Date();
    const yesterdayDayIdx = (now.getDay() + 5) % 7;
    const yesterdayDay = daysOrder[yesterdayDayIdx];

    const yesterdaySched = getScheduledWorkoutForDay(weeklySchedule, yesterdayDay, plannedWorkouts);
    if (yesterdaySched.isRest) return null;

    const routineName = yesterdaySched.plan?.name.replace('Builtin ', '') || yesterdaySched.title;
    const todayRoutineName = sessionInfo.title;

    return {
      yesterdaySched,
      routineName,
      todayRoutineName,
    };
  }, [dismissedMissedWorkout, activeWorkoutDraft, workouts, sessionInfo.status, sessionInfo.title, weeklySchedule, plannedWorkouts]);

  const handleMakeUpMissedWorkout = () => {
    if (!missedWorkoutCatchUp) return;
    const { yesterdaySched, routineName } = missedWorkoutCatchUp;
    let exercisesToDraft: WorkoutExercise[] = [];

    if (yesterdaySched.plan?.exercises && yesterdaySched.plan.exercises.length > 0) {
      exercisesToDraft = yesterdaySched.plan.exercises.map((pe) => {
        const pr = prs.find((p) => p.exercise.toLowerCase() === pe.name.toLowerCase());
        let assignedWeight: number = pe.targetWeight ?? 0;
        if (!assignedWeight || assignedWeight === 0) {
          if (pr && pr.oneRepMax > 0) {
            assignedWeight = suggestLoad(pr.oneRepMax, pe.targetReps, 8, userUnit);
          }
        }
        return {
          name: pe.name,
          sets: Array.from({ length: Math.max(1, pe.targetSets) }, () => ({
            weight: assignedWeight > 0 ? assignedWeight : (userUnit === 'lbs' ? 135 : 60),
            reps: pe.targetReps,
            unit: pe.targetUnit ?? userUnit,
            rpe: 8,
          })),
        };
      });
    } else {
      exercisesToDraft = [
        {
          name: 'Bench Press',
          sets: [
            { weight: userUnit === 'lbs' ? 135 : 60, reps: 8, unit: userUnit, rpe: 8 },
            { weight: userUnit === 'lbs' ? 135 : 60, reps: 8, unit: userUnit, rpe: 8 },
            { weight: userUnit === 'lbs' ? 135 : 60, reps: 8, unit: userUnit, rpe: 8 },
          ],
        },
      ];
    }

    saveWorkoutDraft({
      date: todayStr,
      exercises: exercisesToDraft,
      startedFromPlan: routineName,
      sessionStartTime: Date.now(),
      savedAt: new Date().toISOString(),
    });

    toast.info(`Loaded yesterday's ${routineName} for today. Let's get it!`, 'Missed Session Loaded');
    onNavigate('workout');
  };

  const handleStickToSchedule = () => {
    setDismissedMissedWorkout(true);
    toast.info(`Sticking to today's schedule: ${sessionInfo.title}.`, 'On Schedule');
  };

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
    <div className="page animate-fade-in space-y-5 pb-24 max-w-md mx-auto px-4">
      <InstallAppBanner />

      {/* ── 1. HEADER (Greeting, Goal & Controls) ─────────────────────────── */}
      <header className="pt-2">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-1.5 text-3xs font-mono font-bold uppercase tracking-wider text-text-muted">
              <span>ASCEND ATHLETE</span>
              <span>•</span>
              <span className="text-accent">{goalLabel.toUpperCase()}</span>
            </div>
            <h1 className="text-2xl font-black text-text-primary tracking-tight font-sans mt-0.5">
              {greeting}, {profile?.name ? profile.name.split(' ')[0] : 'ATHLETE'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="w-9 h-9 rounded-xl bg-bg-secondary/80 border border-border/80 flex items-center justify-center text-text-muted hover:text-text-primary active:scale-95 transition-all shadow-xs"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Active Workout Draft Alert */}
      {activeWorkoutDraft && (
        <div className="p-3.5 rounded-2xl bg-accent/15 border border-accent/40 flex items-center justify-between text-xs shadow-md animate-scale-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-bold text-accent">Active session in progress</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                clearWorkoutDraft();
                toast.info('Session draft discarded.');
              }}
              className="text-text-muted hover:text-danger text-2xs px-2 py-1"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => onNavigate('workout')}
              className="px-3 py-1 rounded-xl bg-accent text-white font-bold text-xs shadow-xs"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* ── QUICK ACTIONS STRIP ────────────────────────────────────────────── */}
      <section className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onNavigate('workout')}
          className="p-3 rounded-2xl bg-bg-card border border-border/80 hover:border-accent/50 text-left transition-all active:scale-[0.98] shadow-xs group"
        >
          <div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
            <Play className="w-3.5 h-3.5 fill-accent" />
          </div>
          <span className="font-black text-xs text-text-primary block font-sans">
            Train
          </span>
          <span className="text-3xs text-text-muted font-mono truncate block">
            {activeWorkoutDraft ? 'Resume Draft' : 'Log / Plans'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('meals')}
          className="p-3 rounded-2xl bg-bg-card border border-border/80 hover:border-accent/50 text-left transition-all active:scale-[0.98] shadow-xs group"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
            <UtensilsCrossed className="w-3.5 h-3.5" />
          </div>
          <span className="font-black text-xs text-text-primary block font-sans">
            Fuel
          </span>
          <span className="text-3xs text-text-muted font-mono truncate block">
            {fuelStats.calories} / {fuelStats.targetCalories} kcal
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('prs')}
          className="p-3 rounded-2xl bg-bg-card border border-border/80 hover:border-accent/50 text-left transition-all active:scale-[0.98] shadow-xs group"
        >
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
            <Trophy className="w-3.5 h-3.5" />
          </div>
          <span className="font-black text-xs text-text-primary block font-sans">
            Records
          </span>
          <span className="text-3xs text-text-muted font-mono truncate block">
            {prs.length} PRs Logged
          </span>
        </button>
      </section>

      {/* Empathetic Missed Workout Catch-Up Prompt */}
      {missedWorkoutCatchUp && (
        <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-xs shadow-md animate-scale-in space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
              <Flame className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-3xs font-mono font-bold uppercase tracking-wider text-amber-500">
                <span>SCHEDULE RECOVERY</span>
              </div>
              <p className="font-semibold text-text-primary mt-0.5 text-xs leading-relaxed">
                You missed yesterday&apos;s <span className="text-amber-400 font-bold">{missedWorkoutCatchUp.routineName}</span> — would you like to make it up today, or stick with <span className="text-text-primary font-bold">{missedWorkoutCatchUp.todayRoutineName}</span>?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleMakeUpMissedWorkout}
              className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5"
            >
              <span>Make Up Missed Session</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleStickToSchedule}
              className="py-2 px-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 active:scale-95 text-text-secondary hover:text-text-primary text-xs font-semibold border border-border/60 transition-all"
            >
              Stick to Schedule
            </button>
          </div>
        </div>
      )}

      {/* ── 2. TODAY'S TRAINING HERO CARD (Visual Centerpiece) ─────────────── */}
      <section className="card p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/10 border border-accent/30 shadow-lg rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                sessionInfo.status === 'completed'
                  ? 'bg-emerald-500'
                  : sessionInfo.status === 'in_progress'
                  ? 'bg-accent animate-pulse'
                  : 'bg-accent'
              }`}
            />
            <span className="text-2xs font-mono font-bold tracking-wider uppercase text-text-muted">
              {sessionInfo.status === 'completed'
                ? 'TODAY COMPLETED'
                : sessionInfo.status === 'in_progress'
                ? 'IN PROGRESS'
                : workouts.length === 0
                ? 'DAY 1 STARTS TODAY'
                : `TODAY'S MISSION`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className="text-2xs font-semibold text-accent hover:underline flex items-center gap-1 transition-colors"
          >
            <span>Change Today&apos;s Session</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-black text-text-primary tracking-tight font-sans">
              {sessionInfo.title}
            </h2>
            {sessionInfo.bodyParts && sessionInfo.bodyParts.length > 0 && !sessionInfo.isRestDay && (
              <span className="text-3xs font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent">
                {sessionInfo.bodyParts.join(' • ')}
              </span>
            )}
          </div>

          {sessionInfo.isRestDay ? (
            <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
              Scheduled rest day. Hydrate, hit your protein target, and let muscle tissue adapt.
            </p>
          ) : sessionInfo.exercises && sessionInfo.exercises.length > 0 ? (
            <div className="mt-2.5 space-y-1.5">
              {sessionInfo.exercises.slice(0, 4).map((ex, idx) => (
                <div key={idx} className="text-xs text-text-secondary flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
                  <span className="font-medium text-text-primary">{ex}</span>
                </div>
              ))}
              {sessionInfo.exercises.length > 4 && (
                <span className="text-3xs text-text-muted font-mono pl-3.5 block">
                  +{sessionInfo.exercises.length - 4} more exercises planned
                </span>
              )}
            </div>
          ) : null}

          {/* Next Scheduled Session Anchor */}
          {(sessionInfo.status === 'completed' || sessionInfo.isRestDay) && nextScheduledSession && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-bg-secondary/70 border border-border/60 flex items-center justify-between text-2xs animate-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                <div className="truncate">
                  <span className="text-text-muted">Next Up: </span>
                  <span className="font-bold text-text-primary">{nextScheduledSession.dayLabel}</span>
                  <span className="text-text-secondary font-medium"> — {nextScheduledSession.routineName}</span>
                </div>
              </div>
              {nextScheduledSession.bodyParts && (
                <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 shrink-0 ml-2">
                  {nextScheduledSession.bodyParts}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons: Primary Start + Secondary Log Past */}
        <div className="pt-1 space-y-2">
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className={`w-full py-3.5 rounded-xl font-black tracking-wide text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer ${
              sessionInfo.isRestDay || sessionInfo.status === 'completed'
                ? 'bg-bg-secondary text-text-primary hover:bg-bg-secondary/80 border border-border/70'
                : 'btn-primary shadow-lg shadow-accent/25'
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
                ? 'RESUME ACTIVE WORKOUT'
                : sessionInfo.status === 'completed'
                ? 'VIEW TODAY\'S LOG'
                : workouts.length === 0
                ? 'START DAY 1 WORKOUT'
                : sessionInfo.isRestDay
                ? 'TRAIN ANYWAY'
                : 'START WORKOUT'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsLogPastModalOpen(true)}
            className="w-full py-2.5 rounded-xl bg-bg-secondary/70 hover:bg-bg-secondary border border-border/60 hover:border-accent/40 text-text-secondary hover:text-text-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
          >
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <span>Log Past / Finished Workout</span>
          </button>
        </div>
      </section>

      {/* ── 3. DUAL FUEL HUD: ENERGY RINGS ─────────────────────────────────── */}
      <section
        onClick={() => onNavigate('meals')}
        className="card p-4 sm:p-5 bg-bg-card border border-border/80 rounded-3xl space-y-3 cursor-pointer group hover:border-accent/40 transition-all shadow-xs"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-accent" />
            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
              TODAY&apos;S NUTRITION FUEL
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-text-muted group-hover:text-accent transition-colors">
            <span>Log Food</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Calorie Ring */}
          <div className="p-3 rounded-2xl bg-bg-secondary/60 border border-border/50 flex items-center gap-3">
            <CircularRing progress={fuelStats.calPct} strokeColor="#e5c07b" trackColor="#27272a" size={54}>
              <span className="text-[11px] font-black font-mono text-accent">
                {fuelStats.calPct}%
              </span>
            </CircularRing>
            <div className="min-w-0">
              <span className="text-3xs uppercase font-mono text-text-muted block">ENERGY</span>
              <span className="text-sm font-black font-mono text-text-primary block leading-tight">
                {fuelStats.calories.toLocaleString()}
              </span>
              <span className="text-3xs text-text-muted font-mono">
                of {fuelStats.targetCalories.toLocaleString()} kcal
              </span>
            </div>
          </div>

          {/* Protein Ring */}
          <div className="p-3 rounded-2xl bg-bg-secondary/60 border border-border/50 flex items-center gap-3">
            <CircularRing progress={fuelStats.protPct} strokeColor="#10b981" trackColor="#27272a" size={54}>
              <span className="text-[11px] font-black font-mono text-emerald-400">
                {fuelStats.protPct}%
              </span>
            </CircularRing>
            <div className="min-w-0">
              <span className="text-3xs uppercase font-mono text-text-muted block">PROTEIN</span>
              <span className="text-sm font-black font-mono text-text-primary block leading-tight">
                {fuelStats.protein}g
              </span>
              <span className="text-3xs text-text-muted font-mono">
                of {fuelStats.targetProtein}g target
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. STRENGTH OVERLOAD FOCUS ────────────────────────────────────── */}
      <section className="card p-4 sm:p-5 bg-bg-card border border-border/80 rounded-3xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-accent" />
            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
              {sessionInfo.isRestDay ? 'UPCOMING FOCUS' : 'KEY LIFT TODAY'}
            </span>
          </div>
          <span className="text-3xs font-mono text-text-muted">
            {topFocus.lastDisplay}
          </span>
        </div>

        <div className="flex items-baseline justify-between pt-0.5">
          <h3 className="text-base font-bold text-text-primary font-sans">
            {topFocus.name}
          </h3>
          <span className="text-sm sm:text-base font-black text-accent font-mono tracking-tight">
            {topFocus.targetLoadStr}
          </span>
        </div>
        {(!prs || prs.length === 0) && workouts.length === 0 && (
          <button
            type="button"
            onClick={() => onNavigate('prs')}
            className="pt-1 text-2xs font-semibold text-accent hover:underline flex items-center gap-1 transition-colors"
          >
            <span>Calibrate Your Baseline Lifts</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </section>

      {/* ── 5. THIS WEEK CONSISTENCY ──────────────────────────────────────── */}
      <section className="card p-4 bg-bg-card border border-border/80 rounded-3xl space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
            WEEKLY CONSISTENCY
          </span>
          <span className="text-xs font-semibold font-mono text-text-primary">
            {weeklyStats.completedCount} of {weeklyStats.targetDays} completed this week
          </span>
        </div>

        {/* 7-day strip */}
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {weeklyStats.days.map((day, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <span className="text-2xs font-semibold text-text-muted font-mono">
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

      {/* ── 6. DAILY MINDSET CATALYST ──────────────────────────────────────── */}
      {dailyQuote && (
        <div className="p-4 rounded-2xl bg-bg-secondary/40 border-l-2 border-accent space-y-1">
          <p className="text-xs text-text-secondary italic leading-relaxed">
            &ldquo;{dailyQuote.text}&rdquo;
          </p>
          <span className="text-3xs text-text-muted font-mono block text-right">
            — {dailyQuote.author}
          </span>
        </div>
      )}

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

      <LogPastWorkoutModal
        isOpen={isLogPastModalOpen}
        onClose={() => setIsLogPastModalOpen(false)}
        onSaved={() => toast.success('Past workout logged and synced!', 'Workout Saved')}
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
