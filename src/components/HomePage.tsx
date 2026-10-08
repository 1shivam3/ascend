'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useAppNavigation } from '@/lib/navigation';
import {
  Play,
  Settings,
  ChevronRight,
  Flame,
  Calendar,
  ArrowRight,
  Target,
  Clock,
  UtensilsCrossed,
  Check,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { suggestLoad, calculateOneRepMax } from '@/lib/strength-standards';
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
import { getTodaySessionState, getExercisePrescription } from '@/lib/workout-engine';
import { getScheduledWorkoutForDay, DAY_DISPLAY_INFO } from '@/lib/workout-schedule';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface HomePageProps {
  onNavigate: (tab: 'home' | 'prs' | 'workout' | 'meals' | 'progress') => void;
}

function CircularRing({
  size = 52,
  strokeWidth = 4.5,
  progress = 0,
  strokeColor = '#f97316',
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
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, [today]);

  const userUnit = profile?.unit || 'kg';

  // Athlete Primary Goal
  const primaryGoal = (goals && goals.length > 0) ? goals[0] : (profile?.goals?.[0] || 'build_muscle');
  const goalLabel = ATHLETE_GOAL_CONFIGS[primaryGoal]?.label || 'Build Muscle';

  // Today's workout session state (single source of truth matching weekly schedule)
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

  // Next scheduled workout session anchor
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

  // Key lift / Next exercise spotlight driven by deterministic prescription engine
  const keyLiftSpotlight = useMemo(() => {
    if (sessionInfo.isRestDay || !sessionInfo.exercises || sessionInfo.exercises.length === 0) {
      return null;
    }
    const mainExName = sessionInfo.exercises[0];
    const bestPr = prs.find((p) => p.exercise.toLowerCase() === mainExName.toLowerCase());

    const presc = getExercisePrescription(
      mainExName,
      workouts,
      prs,
      userUnit,
      primaryGoal
    );

    const lastPerformance = presc.lastPerformance
      ? `${presc.lastPerformance.weight} ${userUnit} × ${presc.lastPerformance.reps} reps`
      : (bestPr ? `PR: ${userUnit === 'lbs' ? (bestPr.weightLbs || Math.round(bestPr.weightKg * 2.20462)) : bestPr.weightKg} ${userUnit} × ${bestPr.reps}` : 'First exposure');

    return {
      name: mainExName,
      target: `Target ~${presc.targetWeight} ${userUnit} × ${presc.targetReps} reps`,
      whyThisWeight: presc.whyThisWeight,
      nextSessionRule: presc.nextSessionRule,
      lastPerformance,
    };
  }, [sessionInfo, prs, workouts, userUnit, primaryGoal]);

  // Weekly consistency: accurately synchronized with scheduled training days
  const weeklyStats = useMemo(() => {
    const scheduledDaysCount = weeklySchedule
      ? Object.values(weeklySchedule).filter((d) => d && d.workoutPlanId !== 'rest').length
      : 0;
    const targetDays = scheduledDaysCount > 0 ? scheduledDaysCount : (trainingProfile?.daysPerWeek || 4);

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
  }, [workouts, weeklySchedule, trainingProfile?.daysPerWeek, todayStr]);

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

  const { registerBackHandler } = useAppNavigation();

  // Register Modal Back Handlers (Interconnected Navigation)
  useEffect(() => {
    if (isGoalSelectorOpen) {
      return registerBackHandler(() => { setIsGoalSelectorOpen(false); return true; }, 100);
    }
  }, [isGoalSelectorOpen, registerBackHandler]);

  useEffect(() => {
    if (isSettingsOpen) {
      return registerBackHandler(() => { setIsSettingsOpen(false); return true; }, 100);
    }
  }, [isSettingsOpen, registerBackHandler]);

  useEffect(() => {
    if (isBodyMetricsModalOpen) {
      return registerBackHandler(() => { setIsBodyMetricsModalOpen(false); return true; }, 100);
    }
  }, [isBodyMetricsModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isSuggestedModalOpen) {
      return registerBackHandler(() => { setIsSuggestedModalOpen(false); return true; }, 100);
    }
  }, [isSuggestedModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isLogPastModalOpen) {
      return registerBackHandler(() => { setIsLogPastModalOpen(false); return true; }, 100);
    }
  }, [isLogPastModalOpen, registerBackHandler]);

  // Missed workout catch-up
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
    <div className="page animate-fade-in space-y-4 pb-24 max-w-md mx-auto px-4">
      <InstallAppBanner />

      {/* ── 1. CLEAN HEADER (Warm & Direct) ──────────────────────────────── */}
      <header className="pt-2 flex justify-between items-center">
        <div>
          <span className="text-2xs text-text-muted font-medium block">
            {today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
          <h1 className="text-xl font-bold text-text-primary tracking-tight font-sans mt-0.5">
            {greeting}, {profile?.name ? profile.name.split(' ')[0] : 'Athlete'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="w-9 h-9 rounded-xl bg-bg-card border border-border/80 flex items-center justify-center text-text-muted hover:text-text-primary active:scale-95 transition-all shadow-xs cursor-pointer"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Empathetic Missed Workout Catch-Up Prompt */}
      {missedWorkoutCatchUp && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs shadow-xs animate-scale-in space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
              <Flame className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-3xs font-mono font-bold uppercase tracking-wider text-amber-500 block">
                Schedule Catch-Up
              </span>
              <p className="font-semibold text-text-primary text-xs mt-0.5 leading-snug">
                Missed yesterday&apos;s <span className="text-amber-400 font-bold">{missedWorkoutCatchUp.routineName}</span>. Make it up today, or stick to <span className="text-text-primary font-bold">{missedWorkoutCatchUp.todayRoutineName}</span>?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Button
              variant="primary"
              size="sm"
              onClick={handleMakeUpMissedWorkout}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              className="bg-amber-500 text-black hover:bg-amber-400 flex-1"
            >
              Make Up Yesterday
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStickToSchedule}
            >
              Stick to Plan
            </Button>
          </div>
        </div>
      )}

      {/* ── 2. TODAY'S TRAINING HERO CARD (Single Source of Reality) ───────── */}
      <Card
        variant="elevated"
        padding="lg"
        className="border-accent/40 bg-gradient-to-br from-bg-card via-bg-card to-accent/5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                activeWorkoutDraft
                  ? 'bg-accent animate-pulse'
                  : sessionInfo.status === 'completed'
                  ? 'bg-emerald-500'
                  : sessionInfo.isRestDay
                  ? 'bg-text-muted'
                  : 'bg-accent'
              }`}
            />
            <span className="text-xs font-semibold text-text-secondary">
              {activeWorkoutDraft
                ? 'Session in Progress'
                : sessionInfo.status === 'completed'
                ? 'Completed Today'
                : sessionInfo.isRestDay
                ? 'Rest & Recovery'
                : "Today's Workout"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5 transition-colors cursor-pointer"
          >
            <span>Change</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h2 className="text-lg sm:text-xl font-bold text-text-primary tracking-tight font-sans">
              {activeWorkoutDraft?.startedFromPlan || activeWorkoutDraft?.name || sessionInfo.title}
            </h2>
            <div className="flex items-center gap-1 text-2xs text-text-muted">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span>~45 min</span>
            </div>
          </div>

          {sessionInfo.isRestDay && !activeWorkoutDraft ? (
            <p className="mt-2 text-xs text-text-secondary leading-relaxed">
              Scheduled rest day. Hit your protein target, stay hydrated, and let your muscles recover.
            </p>
          ) : sessionInfo.exercises && sessionInfo.exercises.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sessionInfo.exercises.map((ex, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border/70 text-xs text-text-secondary font-medium"
                >
                  {ex}
                </span>
              ))}
            </div>
          ) : null}

          {/* Next Scheduled Session Anchor for Rest Days / Completed Sessions */}
          {(sessionInfo.status === 'completed' || sessionInfo.isRestDay) && !activeWorkoutDraft && nextScheduledSession && (
            <div className="mt-3 p-2.5 rounded-xl bg-bg-secondary/70 border border-border/70 flex items-center justify-between text-2xs animate-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                <div className="truncate">
                  <span className="text-text-muted">Next up: </span>
                  <span className="font-bold text-text-primary">{nextScheduledSession.dayLabel}</span>
                  <span className="text-text-secondary"> — {nextScheduledSession.routineName}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button */}
        <div className="pt-1 space-y-2">
          {activeWorkoutDraft ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearWorkoutDraft();
                  toast.info('Session draft discarded.');
                }}
                className="px-3 py-3 rounded-xl border border-border/80 text-text-muted hover:text-danger text-xs font-semibold cursor-pointer"
              >
                Discard
              </button>
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => onNavigate('workout')}
                leftIcon={<Play className="w-4 h-4 fill-white stroke-white" />}
              >
                Resume Workout
              </Button>
            </div>
          ) : (
            <Button
              variant={sessionInfo.isRestDay || sessionInfo.status === 'completed' ? 'secondary' : 'primary'}
              size="lg"
              fullWidth
              onClick={() => onNavigate('workout')}
              leftIcon={
                <Play
                  className={`w-4 h-4 ${
                    sessionInfo.isRestDay || sessionInfo.status === 'completed'
                      ? 'fill-text-primary stroke-text-primary'
                      : 'fill-white stroke-white'
                  }`}
                />
              }
            >
              {sessionInfo.status === 'completed'
                ? "View Today's Log"
                : workouts.length === 0
                ? 'Start Day 1 Workout'
                : sessionInfo.isRestDay
                ? 'Train Anyway'
                : 'Start Workout'}
            </Button>
          )}

          <button
            type="button"
            onClick={() => setIsLogPastModalOpen(true)}
            className="w-full py-1.5 text-2xs text-text-muted hover:text-text-primary flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Calendar className="w-3 h-3 text-accent" />
            <span>Log past workout manually</span>
          </button>
        </div>
      </Card>

      {/* ── 3. THIS WEEK CONSISTENCY (7-Day Strip) ─────────────────────────── */}
      <Card variant="default" padding="md" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-text-primary">
            This Week
          </span>
          <span className="text-xs font-semibold text-text-muted">
            {weeklyStats.completedCount} of {weeklyStats.targetDays} sessions
          </span>
        </div>

        {/* 7-day consistency strip */}
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {weeklyStats.days.map((day, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-text-muted font-medium">
                {day.letter}
              </span>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  day.isCompleted
                    ? 'bg-accent text-white shadow-xs'
                    : day.isToday
                    ? 'border-2 border-accent text-accent'
                    : 'bg-bg-secondary text-text-muted border border-border/60'
                }`}
              >
                {day.isCompleted ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <span className="text-[10px] font-normal">
                    {day.dateStr.slice(8)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 4. DAILY FUEL NUTRITION (Streamlined Progress) ─────────────────── */}
      <Card
        variant="interactive"
        padding="md"
        onClick={() => onNavigate('meals')}
        className="space-y-3 cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-text-primary">
              Daily Nutrition
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-text-muted group-hover:text-accent transition-colors">
            <span>Log Food</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-0.5">
          {/* Calories Bar */}
          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/50 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-text-muted uppercase font-semibold">Calories</span>
              <span className="text-xs font-bold text-text-primary">
                {fuelStats.calories.toLocaleString()} <span className="text-text-muted text-[10px] font-normal">/ {fuelStats.targetCalories.toLocaleString()}</span>
              </span>
            </div>
            <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${fuelStats.calPct}%` }}
              />
            </div>
          </div>

          {/* Protein Bar */}
          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/50 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-text-muted uppercase font-semibold">Protein</span>
              <span className="text-xs font-bold text-text-primary">
                {fuelStats.protein}g <span className="text-text-muted text-[10px] font-normal">/ {fuelStats.targetProtein}g</span>
              </span>
            </div>
            <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${fuelStats.protPct}%` }}
              />
            </div>
          </div>
        </div>
      </Card>


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
