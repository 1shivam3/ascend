'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useAppNavigation } from '@/lib/navigation';
import {
  Bell,
  ChevronRight,
  Play,
  X,
  Check,
  Calendar,
  Dumbbell,
  Settings,
  Sparkles,
  Camera,
  Barcode,
  Scale,
  Trophy,
  Flame,
  Droplets,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';

const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });
const SuggestedWorkoutModal = dynamic(() => import('@/components/SuggestedWorkoutModal'), { ssr: false });
const LogPastWorkoutModal = dynamic(() => import('@/components/LogPastWorkoutModal'), { ssr: false });
const ScanMealModal = dynamic(() => import('@/components/ScanMealModal'), { ssr: false });
const PostWorkoutTakeModal = dynamic(() => import('@/components/PostWorkoutTakeModal'), { ssr: false });
const BarcodeScannerModal = dynamic(() => import('@/components/BarcodeScannerModal'), { ssr: false });
const BodyMetricsModal = dynamic(() => import('@/components/BodyMetricsModal'), { ssr: false });

import ThemeToggle from '@/components/ui/ThemeToggle';
import { calculateMealMacros } from '@/lib/macros';
import { toLocalDateString } from '@/lib/habits';
import { getTimeGreeting, getWeekDateStrings } from '@/lib/formatters';
import { useToast } from '@/components/ui/Toast';
import { PlannedWorkout, PlannedExercise, DayOfWeek, FoodItem, MealEntry } from '@/lib/types';
import { getDailyQuote } from '@/lib/quotes';
import { getTodaySessionState, createWorkoutDraftFromPlan } from '@/lib/workout-engine';
import { getScheduledWorkoutForDay, getTodayDayOfWeek, getWorkoutBodyParts } from '@/lib/workout-schedule';

interface HomePageProps {
  onNavigate: (tab: 'home' | 'prs' | 'workout' | 'meals' | 'progress' | 'profile' | 'settings') => void;
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
    weeklySchedule,
    setDaySchedule,
    theme,
    waterLogs,
    hydrationConfig,
    logWater,
    addMeal,
  } = useStore();

  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalDateString(today), [today]);
  const todayDayOfWeek = useMemo(() => getTodayDayOfWeek(todayStr), [todayStr]);

  // Sentence-case personalized greeting matching Screen 8 & 9
  const greeting = useMemo(() => getTimeGreeting(today), [today]);

  const athleteDisplayName = useMemo(() => {
    if (!profile?.name || !profile.name.trim()) return 'Alex';
    const first = profile.name.trim().split(' ')[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }, [profile?.name]);

  const userUnit = profile?.unit || 'kg';

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

  // Latest completed workout for today (if any)
  const completedWorkoutForToday = useMemo(() => {
    const todayWks = workouts.filter((w) => w.date.split('T')[0] === todayStr);
    return todayWks[todayWks.length - 1] || null;
  }, [workouts, todayStr]);

  // Consecutive-day workout streak (counts back from today, or yesterday if
  // today has no workout yet) — same logic as Progress consistency view.
  const streakDays = useMemo(() => {
    const workoutDays = new Set(workouts.map((w) => w.date.split('T')[0]));
    let days = 0;
    const d = new Date(today);
    if (!workoutDays.has(toLocalDateString(d))) d.setDate(d.getDate() - 1);
    while (days < 365) {
      if (workoutDays.has(toLocalDateString(d))) {
        days++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return days;
  }, [workouts, today]);

  // Current-week consistency dots (Monday–Sunday) — compact glanceable version
  // of the Progress > Consistency view, reusing the same workout-days logic.
  const last7Days = useMemo(() => {
    const workoutDays = new Set(workouts.map((w) => w.date.split('T')[0]));
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return getWeekDateStrings(today).map((dStr, i) => ({
      label: labels[i],
      dateStr: dStr,
      isToday: dStr === todayStr,
      completed: workoutDays.has(dStr),
    }));
  }, [workouts, today, todayStr]);
  const weekCompletedCount = last7Days.filter((d) => d.completed).length;

  // Rotating motivational quote, personalized by gender when known.
  const dailyQuote = useMemo(() => getDailyQuote(profile?.gender ?? null), [profile?.gender]);

  // Most recent personal record (hidden when the athlete has none).
  const latestPr = useMemo(() => {
    if (!prs || prs.length === 0) return null;
    return [...prs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }, [prs]);
  const latestPrWeight = latestPr
    ? userUnit === 'kg'
      ? `${latestPr.weightKg} kg`
      : `${latestPr.weightLbs} lbs`
    : '';

  // Hydration quick-add state for today.
  const todayWaterMl = waterLogs?.[todayStr] || 0;
  const hydrationTargetMl = hydrationConfig?.dailyTargetMl || 2700;
  const hydrationPct = Math.min(100, Math.round((todayWaterMl / hydrationTargetMl) * 100));

  // Scanned barcode food → logged straight to today's meals.
  const handleAddScannedFoodFromHome = (scannedItem: FoodItem) => {
    const newMeal: MealEntry = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
      date: todayStr,
      name: scannedItem.name,
      foods: [scannedItem],
    };
    addMeal(newMeal);
    toast.success(`Logged ${scannedItem.name} (${scannedItem.calories} kcal)!`, 'Scanned Food Logged');
  };

  // Modal triggers
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);
  const [isLogPastModalOpen, setIsLogPastModalOpen] = useState(false);
  const [isScanMealModalOpen, setIsScanMealModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isChangeWorkoutOpen, setIsChangeWorkoutOpen] = useState(false);
  const [isCompletedWorkoutModalOpen, setIsCompletedWorkoutModalOpen] = useState(false);

  const { registerBackHandler } = useAppNavigation();

  // Register Modal Back Handlers (Interconnected Navigation)
  useEffect(() => {
    if (isNotificationsOpen) {
      return registerBackHandler(() => { setIsNotificationsOpen(false); return true; }, 100);
    }
  }, [isNotificationsOpen, registerBackHandler]);

  useEffect(() => {
    if (isSettingsOpen) {
      return registerBackHandler(() => { setIsSettingsOpen(false); return true; }, 100);
    }
  }, [isSettingsOpen, registerBackHandler]);

  useEffect(() => {
    if (isChangeWorkoutOpen) {
      return registerBackHandler(() => { setIsChangeWorkoutOpen(false); return true; }, 100);
    }
  }, [isChangeWorkoutOpen, registerBackHandler]);

  useEffect(() => {
    if (isSuggestedModalOpen) {
      return registerBackHandler(() => { setIsSuggestedModalOpen(false); return true; }, 100);
    }
  }, [isSuggestedModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isCompletedWorkoutModalOpen) {
      return registerBackHandler(() => { setIsCompletedWorkoutModalOpen(false); return true; }, 100);
    }
  }, [isCompletedWorkoutModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isBarcodeModalOpen) {
      return registerBackHandler(() => { setIsBarcodeModalOpen(false); return true; }, 100);
    }
  }, [isBarcodeModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isWeightModalOpen) {
      return registerBackHandler(() => { setIsWeightModalOpen(false); return true; }, 100);
    }
  }, [isWeightModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isScanMealModalOpen) {
      return registerBackHandler(() => { setIsScanMealModalOpen(false); return true; }, 100);
    }
  }, [isScanMealModalOpen, registerBackHandler]);

  // Routine selection handler (satisfies plan-sync test contract)
  const handleSelectWorkoutForToday = (plan: PlannedWorkout) => {
    setDaySchedule(todayDayOfWeek, {
      workoutPlanId: plan.id,
      customTitle: plan.name,
      bodyParts: getWorkoutBodyParts(plan.exercises),
    });
    setIsChangeWorkoutOpen(false);
    toast.success(`Set "${plan.name}" as today's workout!`, 'Routine Updated');
  };

  // Launch or resume workout session
  const handleStartWorkoutFromHome = (targetPlan?: PlannedWorkout | null) => {
    if (sessionInfo.status === 'completed' && !targetPlan) {
      onNavigate('workout');
      return;
    }

    const planToStart = targetPlan || (sessionInfo.plannedWorkoutId
      ? plannedWorkouts.find((p) => p.id === sessionInfo.plannedWorkoutId)
      : null) || plannedWorkouts[0];

    if (planToStart && planToStart.exercises && planToStart.exercises.length > 0) {
      const applications = useStore.getState().policyDecisionApplications || [];
      const draft = createWorkoutDraftFromPlan(planToStart, {
        userUnit,
        userPrs: prs,
        applications,
        date: todayStr,
      });

      saveWorkoutDraft(draft);
      toast.success(`Loaded "${planToStart.name}". Let's lift!`, 'Session Started');
    }
    onNavigate('workout');
  };

  const handleStartSuggestedWorkout = (workoutName: string, exercises: PlannedExercise[]) => {
    const newPlanId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan_${Date.now()}`;
    const plannedWorkout: PlannedWorkout = {
      id: newPlanId,
      name: workoutName,
      createdAt: new Date().toISOString(),
      exercises,
    };
    // Intentionally NOT saved to plannedWorkouts: starting a suggested workout
    // no longer silently piles up saved plans. The user explicitly saves via
    // the modal's "Save Plan" action if they want to keep it.
    handleStartWorkoutFromHome(plannedWorkout);
  };

  // Display routine name and stats
  const routineRawName = activeWorkoutDraft?.startedFromPlan || activeWorkoutDraft?.name || sessionInfo.title || 'Upper Body Strength';
  const routineDisplayName = routineRawName.replace(/^Builtin\s+/i, '');

  const scheduledPlan = useMemo(() => {
    if (sessionInfo.plannedWorkoutId) {
      return plannedWorkouts.find((p) => p.id === sessionInfo.plannedWorkoutId);
    }
    return plannedWorkouts.find((p) => p.name.toLowerCase() === routineRawName.toLowerCase()) || plannedWorkouts[0];
  }, [sessionInfo.plannedWorkoutId, plannedWorkouts, routineRawName]);

  const exerciseCount = useMemo(() => {
    if (activeWorkoutDraft?.exercises && activeWorkoutDraft.exercises.length > 0) {
      return activeWorkoutDraft.exercises.length;
    }
    if (scheduledPlan?.exercises && scheduledPlan.exercises.length > 0) {
      return scheduledPlan.exercises.length;
    }
    if (sessionInfo.exercises && sessionInfo.exercises.length > 0) {
      return sessionInfo.exercises.length;
    }
    return 6;
  }, [activeWorkoutDraft, scheduledPlan, sessionInfo.exercises]);

  const durationMinutes = useMemo(() => {
    if (sessionInfo.durationMin && sessionInfo.durationMin > 0) {
      return sessionInfo.durationMin;
    }
    return Math.max(35, Math.min(65, exerciseCount * 8 || 45));
  }, [sessionInfo.durationMin, exerciseCount]);

  // Weekly consistency: accurately calculated from logged sessions in current week
  const weeklyStats = useMemo(() => {
    const scheduledDaysCount = weeklySchedule
      ? Object.values(weeklySchedule).filter((d) => d && d.workoutPlanId !== 'rest').length
      : 0;
    const targetDays = scheduledDaysCount > 0 ? scheduledDaysCount : (trainingProfile?.daysPerWeek || 5);

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

    return {
      completedCount: uniqueTrainedDates.size,
      targetDays,
    };
  }, [workouts, weeklySchedule, trainingProfile?.daysPerWeek]);

  const weeklyProgressPct = useMemo(() => {
    return Math.min(100, Math.round((weeklyStats.completedCount / Math.max(1, weeklyStats.targetDays)) * 100));
  }, [weeklyStats]);

  // Today's Fuel summary: real calories and protein vs target
  const fuelStats = useMemo(() => {
    const todayMeals = meals.filter((m) => m.date === todayStr);
    const macros = calculateMealMacros(todayMeals.flatMap((m) => m.foods));

    const bwKg = profile?.bodyweightKg || 72;
    const calTarget = macroGoals?.calories || 2400;
    const protTarget = macroGoals?.proteinG || Math.round(bwKg * 2.0);

    return {
      calories: Math.round(macros.calories),
      targetCalories: calTarget,
      protein: Math.round(macros.proteinG),
      targetProtein: protTarget,
    };
  }, [meals, profile?.bodyweightKg, macroGoals, todayStr]);

  return (
    <div className="page animate-fade-in space-y-6 pb-24 max-w-md mx-auto px-5 pt-3">
      {/* ── 1. HEADER (Screen 8 & Screen 9) ─────────────────────────────────── */}
      <header className="flex items-center justify-between pt-1">
        <div>
          <p className="text-sm font-medium text-text-muted">
            {greeting}
          </p>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight mt-0.5">
            {athleteDisplayName}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary/60 transition-colors cursor-pointer select-none"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center font-bold text-accent text-sm font-mono hover:bg-accent/25 active:scale-95 transition-all cursor-pointer select-none shadow-2xs overflow-hidden"
            title="Athlete Profile"
            aria-label="Athlete Profile"
          >
            {profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              athleteDisplayName.charAt(0).toUpperCase()
            )}
          </button>
        </div>
      </header>

      {/* ── 2. TODAY'S WORKOUT CARD (Screen 8 & Screen 9) ──────────────────── */}
      <div className="bg-bg-card border border-border/80 rounded-2xl p-5 shadow-xs transition-all">
        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
          <span className="font-medium text-text-muted">Today&apos;s Workout</span>
          <button
            type="button"
            onClick={() => setIsChangeWorkoutOpen(true)}
            className="text-2xs font-semibold text-text-muted hover:text-text-primary flex items-center gap-0.5 transition-colors cursor-pointer"
            title="Change Today's Workout"
          >
            <span>Adaptive Split</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <h2 className="text-xl font-bold text-text-primary leading-tight">
          {routineDisplayName}
        </h2>

        <p className="text-xs sm:text-sm text-text-muted mt-1 font-normal">
          {durationMinutes} min • {exerciseCount} exercises
        </p>

        <button
          type="button"
          onClick={() => {
            if (activeWorkoutDraft) {
              onNavigate('workout');
            } else if (sessionInfo.status === 'completed') {
              if (completedWorkoutForToday) {
                setIsCompletedWorkoutModalOpen(true);
              } else {
                onNavigate('workout');
              }
            } else {
              handleStartWorkoutFromHome();
            }
          }}
          className="w-full mt-5 py-3.5 px-4 rounded-xl bg-accent hover:brightness-105 active:scale-[0.99] text-white font-bold text-sm tracking-wide shadow-sm shadow-accent/25 transition-all cursor-pointer text-center"
        >
          {activeWorkoutDraft
            ? 'Resume Workout'
            : sessionInfo.status === 'completed'
            ? 'View Completed Workout'
            : 'Start Workout'}
        </button>
      </div>

      {/* ── 3. THIS WEEK SECTION (Screen 8 & Screen 9) ─────────────────────── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">
            This Week
          </h3>
          <span className="text-xs sm:text-sm font-medium text-text-muted tabular-nums">
            {weeklyStats.completedCount}/{weeklyStats.targetDays} workouts
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-border/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${weeklyProgressPct}%` }}
          />
        </div>
      </div>

      {/* ── 4. NUTRITION SUMMARY (Screen 8 & Screen 9: 2-Column Grid) ──────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Nutrition (Calories) Card */}
        <div
          onClick={() => onNavigate('meals')}
          className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between cursor-pointer hover:border-accent/40 transition-colors"
          role="button"
          tabIndex={0}
          aria-label="View Nutrition Details"
        >
          <span className="text-xs font-medium text-text-muted">Nutrition</span>
          <div className="mt-3">
            <span className="text-xl sm:text-2xl font-bold text-text-primary tabular-nums block leading-tight">
              {fuelStats.calories.toLocaleString()} cal
            </span>
            <span className="text-xs text-text-muted tabular-nums block mt-1">
              / {fuelStats.targetCalories.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Protein Card */}
        <div
          onClick={() => onNavigate('meals')}
          className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between cursor-pointer hover:border-accent/40 transition-colors"
          role="button"
          tabIndex={0}
          aria-label="View Protein Details"
        >
          <span className="text-xs font-medium text-text-muted">Protein</span>
          <div className="mt-3">
            <span className="text-xl sm:text-2xl font-bold text-text-primary tabular-nums block leading-tight">
              {fuelStats.protein} g
            </span>
            <span className="text-xs text-text-muted tabular-nums block mt-1">
              / {fuelStats.targetProtein} g
            </span>
          </div>
        </div>
      </div>

      {/* ── 5. QUICK ACTIONS ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => setIsScanMealModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Camera className="w-4 h-4" />
          </span>
          <span className="text-3xs font-semibold text-text-secondary">Meal Scan</span>
        </button>
        <button
          type="button"
          onClick={() => setIsBarcodeModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Barcode className="w-4 h-4" />
          </span>
          <span className="text-3xs font-semibold text-text-secondary">Scan</span>
        </button>
        <button
          type="button"
          onClick={() => setIsWeightModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Scale className="w-4 h-4" />
          </span>
          <span className="text-3xs font-semibold text-text-secondary">Weight</span>
        </button>
      </div>

      {/* ── 6. HYDRATION QUICK-ADD ───────────────────────────────────────── */}
      <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
              <Droplets className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-text-primary">Hydration</p>
              <p className="text-3xs text-text-muted tabular-nums">
                {(todayWaterMl / 1000).toFixed(1)} / {(hydrationTargetMl / 1000).toFixed(1)} L today
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                logWater(250);
                toast.success('+250 ml logged', 'Hydration Updated');
              }}
              className="px-3 py-1.5 rounded-xl bg-bg-secondary border border-border text-xs font-mono font-bold text-text-primary active:scale-95 transition-all cursor-pointer"
            >
              +250
            </button>
            <button
              type="button"
              onClick={() => {
                logWater(500);
                toast.success('+500 ml logged', 'Hydration Updated');
              }}
              className="px-3 py-1.5 rounded-xl bg-bg-secondary border border-border text-xs font-mono font-bold text-text-primary active:scale-95 transition-all cursor-pointer"
            >
              +500
            </button>
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-border/60 overflow-hidden mt-3">
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-500"
            style={{ width: `${hydrationPct}%` }}
          />
        </div>
      </div>

      {/* ── 7. STREAK + QUOTE ────────────────────────────────────────────── */}
      <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Flame className="w-4 h-4" />
          </span>
          <p className="text-xs font-bold text-text-primary">
            {streakDays > 0
              ? `${streakDays} day${streakDays === 1 ? '' : 's'} streak — keep it burning`
              : 'Start your streak with today\'s workout'}
          </p>
        </div>
        <p className="text-xs text-text-muted italic mt-2 leading-relaxed">&ldquo;{dailyQuote.text}&rdquo;</p>
        <p className="text-3xs text-text-muted mt-1 font-mono">— {dailyQuote.author}</p>
      </div>

      {/* ── 7b. CONSISTENCY STRIP (compact Progress > Consistency glance) ───── */}
      <button
        type="button"
        onClick={() => onNavigate('progress')}
        className="w-full bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs text-left active:scale-[0.99] transition-all cursor-pointer"
        aria-label="View consistency details"
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-text-primary">Consistency</span>
          <span className="text-3xs font-mono text-text-muted tabular-nums">
            {weekCompletedCount}/7 this week
          </span>
        </div>
        <div className="flex items-center justify-between px-1">
          {last7Days.map((d) => (
            <div key={d.dateStr} className="flex flex-col items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  d.completed
                    ? 'bg-accent text-white'
                    : d.isToday
                    ? 'border-2 border-accent/60'
                    : 'bg-border/50'
                }`}
              >
                {d.completed && <Check className="w-3.5 h-3.5" />}
              </span>
              <span
                className={`text-3xs font-mono ${
                  d.isToday ? 'text-accent font-bold' : 'text-text-muted'
                }`}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </button>

      {/* ── 8. LATEST PR (hidden when none) ─────────────────────────────── */}
      {latestPr && (
        <button
          type="button"
          onClick={() => onNavigate('progress')}
          className="w-full bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex items-center gap-3 text-left active:scale-[0.99] transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-3xs font-mono text-text-muted uppercase tracking-wider">Latest PR</p>
            <p className="text-xs font-bold text-text-primary truncate">
              {latestPr.exercise} · {latestPrWeight} × {latestPr.reps}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
        </button>
      )}

      {/* ── NOTIFICATIONS & QUICK SETTINGS MODAL ────────────────────────────── */}
      {isNotificationsOpen && (
        <div className="modal-overlay" onClick={() => setIsNotificationsOpen(false)}>
          <div
            className="modal-content max-w-sm w-full p-5 space-y-4 rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-accent" />
                <h3 className="text-base font-bold text-text-primary">Notifications</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/60">
                <p className="font-semibold text-text-primary">Today&apos;s Training</p>
                <p className="text-text-muted mt-0.5">
                  {routineDisplayName} is scheduled for today ({durationMinutes} min).
                </p>
              </div>

              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/60">
                <p className="font-semibold text-text-primary">Weekly Target</p>
                <p className="text-text-muted mt-0.5">
                  {weeklyStats.completedCount} of {weeklyStats.targetDays} workouts completed this week.
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsNotificationsOpen(false);
                  setIsSettingsOpen(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-xs font-semibold text-text-primary transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-text-muted" />
                <span>Open Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHANGE TODAY'S WORKOUT MODAL (Plan Sync Contract) ─────────────── */}
      {isChangeWorkoutOpen && (
        <div className="modal-overlay" onClick={() => setIsChangeWorkoutOpen(false)}>
          <div
            className="modal-content max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0 bg-bg-card">
              <div>
                <h2 className="text-base font-bold text-text-primary">Change Today&apos;s Workout</h2>
                <p className="text-2xs text-text-muted">Choose which plan to display and train today</p>
              </div>
              <button
                type="button"
                onClick={() => setIsChangeWorkoutOpen(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Available Routines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-mono font-bold uppercase tracking-wider text-accent">
                    AVAILABLE ROUTINES
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangeWorkoutOpen(false);
                      onNavigate('workout');
                    }}
                    className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Manage Plans</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {plannedWorkouts.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {plannedWorkouts.map((plan) => {
                      const isSelected = sessionInfo.plannedWorkoutId === plan.id || sessionInfo.title === plan.name;
                      const bodyParts = getWorkoutBodyParts(plan.exercises);

                      return (
                        <div
                          key={plan.id}
                          className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-2 ${
                            isSelected
                              ? 'bg-accent/10 border-accent shadow-xs'
                              : 'bg-bg-secondary border-border/80 hover:border-accent/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-text-primary">
                                  {plan.name}
                                </span>
                                {isSelected && (
                                  <span className="px-1.5 py-0.5 rounded bg-accent text-white text-3xs font-mono font-bold">
                                    TODAY&apos;S PLAN
                                  </span>
                                )}
                              </div>
                              {bodyParts.length > 0 && (
                                <span className="text-3xs text-accent font-medium block mt-0.5">
                                  {bodyParts.join(' • ')}
                                </span>
                              )}
                              <span className="text-xs text-text-muted line-clamp-1 mt-0.5">
                                {plan.exercises.map((e) => e.name).join(', ')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleSelectWorkoutForToday(plan)}
                              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex-1 text-center cursor-pointer ${
                                isSelected
                                  ? 'bg-accent/20 text-accent border border-accent/40'
                                  : 'bg-bg-elevated hover:bg-bg-secondary text-text-primary border border-border'
                              }`}
                            >
                              {isSelected ? 'Selected for Today' : "Set as Today's Workout"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsChangeWorkoutOpen(false);
                                handleStartWorkoutFromHome(plan);
                              }}
                              className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span>Start</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted italic py-1">No workout plans available.</p>
                )}
              </div>

              {/* Rest Day Option */}
              <button
                type="button"
                onClick={() => {
                  setDaySchedule(todayDayOfWeek, {
                    workoutPlanId: 'rest',
                    customTitle: 'Rest & Recovery',
                    bodyParts: [],
                  });
                  setIsChangeWorkoutOpen(false);
                  toast.info("Set today as Rest & Recovery.", "Rest Day Set");
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary/60 border border-border/80 hover:border-accent/40 flex items-center justify-between text-left text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <span>Set today as Rest Day (Recovery)</span>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS MODAL ─────────────────────────────────────────────────── */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* ── SUGGESTED WORKOUT MODAL ────────────────────────────────────────── */}
      <SuggestedWorkoutModal
        isOpen={isSuggestedModalOpen}
        onClose={() => setIsSuggestedModalOpen(false)}
        userUnit={userUnit}
        onStartWorkout={handleStartSuggestedWorkout}
        onSavePlan={(plan) => {
          const newPlan: PlannedWorkout = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan_${Date.now()}`,
            name: plan.name,
            createdAt: new Date().toISOString(),
            exercises: plan.exercises,
          };
          addPlannedWorkout(newPlan);
          toast.success(`Plan "${plan.name}" saved!`, 'Plan Saved');
        }}
      />

      {/* ── LOG PAST WORKOUT MODAL ─────────────────────────────────────────── */}
      <LogPastWorkoutModal
        isOpen={isLogPastModalOpen}
        onClose={() => setIsLogPastModalOpen(false)}
      />

      {/* ── SCAN MEAL MODAL ────────────────────────────────────────────────── */}
      <ScanMealModal
        isOpen={isScanMealModalOpen}
        onClose={() => setIsScanMealModalOpen(false)}
      />

      {/* ── BARCODE SCANNER MODAL (Quick Action) ───────────────────────────── */}
      {isBarcodeModalOpen && (
        <BarcodeScannerModal
          isOpen={isBarcodeModalOpen}
          onClose={() => setIsBarcodeModalOpen(false)}
          onAddFood={handleAddScannedFoodFromHome}
        />
      )}

      {/* ── LOG WEIGHT MODAL (Quick Action) ────────────────────────────────── */}
      <BodyMetricsModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
      />

      {/* ── COMPLETED WORKOUT DETAIL MODAL ─────────────────────────────────── */}
      {isCompletedWorkoutModalOpen && completedWorkoutForToday && (
        <PostWorkoutTakeModal
          isOpen={isCompletedWorkoutModalOpen}
          onClose={() => setIsCompletedWorkoutModalOpen(false)}
          completedWorkout={{
            name: completedWorkoutForToday.name || routineDisplayName || 'Completed Session',
            durationMinutes: completedWorkoutForToday.durationMinutes ?? 0,
            durationSeconds: completedWorkoutForToday.durationSeconds,
            exercises: completedWorkoutForToday.exercises,
          }}
        />
      )}
    </div>
  );
}
