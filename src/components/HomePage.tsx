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
import { isMainCompoundLift, suggestLoad, getLiftLevel, getOverallLevel } from '@/lib/strength-standards';
import { getDailyQuote } from '@/lib/quotes';
import SettingsModal from '@/components/SettingsModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import LogPastWorkoutModal from '@/components/LogPastWorkoutModal';
import InstallAppBanner from '@/components/InstallAppBanner';
import { calculateMealMacros } from '@/lib/macros';
import { toLocalDateString } from '@/lib/habits';
import { useToast } from '@/components/ui/Toast';
import { PlannedWorkout, PlannedExercise, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import { getTodaySessionState, getLastExercisePerformance } from '@/lib/workout-engine';
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

  // Overall Strength Level from PRs
  const overallLevel = useMemo(() => {
    if (!prs || prs.length === 0) return null;
    const liftLevels = prs.map((p) =>
      getLiftLevel(p.exercise, p.oneRepMax, profile?.bodyweightKg || 72, profile?.gender || 'male')
    );
    return getOverallLevel(liftLevels);
  }, [prs, profile?.bodyweightKg, profile?.gender]);

  // Daily Mindset Quote
  const dailyQuote = useMemo(() => getDailyQuote(), []);

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

      {/* ── 1. KINETIC ATHLETE MOMENTUM HEADER ─────────────────────────────── */}
      <header className="pt-2 space-y-2">
        <div className="flex justify-between items-start">
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

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="w-9 h-9 rounded-2xl bg-bg-secondary/80 border border-border/80 flex items-center justify-center text-text-muted hover:text-text-primary active:scale-95 transition-all shadow-xs"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Athletic Momentum Bar: Strength Rank & Streak */}
        <div className="flex items-center gap-2 pt-0.5">
          {overallLevel ? (
            <button
              type="button"
              onClick={() => onNavigate('prs')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent text-xs font-bold font-mono active:scale-95 transition-all shadow-xs"
              title="View Strength Level & Standards"
            >
              <Zap className="w-3.5 h-3.5 fill-accent stroke-accent" />
              <span>LEVEL {overallLevel.level} • {overallLevel.title.toUpperCase()}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('prs')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-secondary border border-border/70 text-text-secondary text-xs font-medium hover:text-accent hover:border-accent/40 active:scale-95 transition-all"
            >
              <Trophy className="w-3.5 h-3.5 text-accent" />
              <span>Calibrate Level</span>
            </button>
          )}

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-secondary border border-border/70 text-xs font-mono text-text-secondary">
            <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400/20" />
            <span>{weeklyStats.completedCount}/{weeklyStats.targetDays} SESSIONS</span>
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
                : `TODAY'S MISSION`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className="text-2xs font-semibold text-accent hover:underline flex items-center gap-1 transition-colors"
          >
            <span>Change</span>
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
      </section>

      {/* ── 5. THIS WEEK CONSISTENCY ──────────────────────────────────────── */}
      <section className="card p-4 bg-bg-card border border-border/80 rounded-3xl space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
            WEEKLY CONSISTENCY
          </span>
          <span className="text-xs font-semibold font-mono text-text-primary">
            {weeklyStats.completedCount} / {weeklyStats.targetDays} completed
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
