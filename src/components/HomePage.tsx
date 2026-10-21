'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useAppNavigation } from '@/lib/navigation';
import {
  Bell,
  ChevronRight,
  Play,
  X,
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
  Snowflake,
  Footprints,
  MessageCircleHeart,
  TrendingUp,
  Leaf,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/use-today';
import { useTranslation } from '@/lib/i18n';

import { getLevel, getLevelName, progressToNext, summarizeXpInRange } from '@/lib/xp-system';
import { buildActiveDays, calculateStreak } from '@/lib/streak-freeze';
import { calculateReadiness } from '@/lib/coach-engine';
import { buildHealthSignals } from '@/lib/health-connect';
import { buildPercentSuggestions } from '@/lib/percent-1rm';
import { useCoachDigest } from '@/lib/use-coach-digest';
import {
  monthlyChallenges,
  evaluateChallenge,
  evaluateChallengeReward,
  shouldShowChallengeCard,
  challengeInstanceKey,
  challengeXpEventId,
  getChallengeMonth,
} from '@/lib/challenges';
import ReadinessSheet from '@/components/ReadinessSheet';
import LevelSheet from '@/components/LevelSheet';
import ChallengesSheet from '@/components/ChallengesSheet';
import WeeklyHabitMatrix from '@/components/WeeklyHabitMatrix';

const READINESS_LABEL: Record<string, string> = {
  primed: 'Primed',
  ready: 'Ready',
  caution: 'Easy day',
  rest: 'Rest',
};

const SuggestedWorkoutModal = dynamic(() => import('@/components/SuggestedWorkoutModal'), { ssr: false });
const LogPastWorkoutModal = dynamic(() => import('@/components/LogPastWorkoutModal'), { ssr: false });
const ScanMealModal = dynamic(() => import('@/components/ScanMealModal'), { ssr: false });
const PostWorkoutTakeModal = dynamic(() => import('@/components/PostWorkoutTakeModal'), { ssr: false });
const BarcodeScannerModal = dynamic(() => import('@/components/BarcodeScannerModal'), { ssr: false });
const BodyMetricsModal = dynamic(() => import('@/components/BodyMetricsModal'), { ssr: false });

import ThemeToggle from '@/components/ui/ThemeToggle';
import { calculateMealMacros, scaleMacroGoalsToCalories } from '@/lib/macros';
import { toLocalDateString, calculateHydrationTarget } from '@/lib/habits';
import { getTimeGreeting, getWeekRange } from '@/lib/formatters';
import { useToast } from '@/components/ui/Toast';
import { CollapsibleDetails } from '@/components/ui/CollapsibleDetails';
import { PlannedWorkout, PlannedExercise, DayOfWeek, FoodItem, MealEntry } from '@/lib/types';
import { CalorieAdjustmentRecord } from '@/lib/coach-engine';
import { getDailyQuote } from '@/lib/quotes';
import { getProteinGapSuggestion, isHintDismissed } from '@/lib/nutrition-coach';
import { getTodaySessionState, createWorkoutDraftFromPlan, estimateSessionMinutes } from '@/lib/workout-engine';
import { getScheduledWorkoutForDay, getTodayDayOfWeek, getWorkoutBodyParts } from '@/lib/workout-schedule';
import ReminderCenterModal from '@/components/ReminderCenterModal';

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
    bodyMetrics,
    creatineLogs,
    creatineConfig,
    dailyCheckins,
    setDailyCheckin,
    xp,
    streak,
    challenges: challengesState,
    optInChallenge,
    dismissChallenge,
    grantChallengeReward,
    awardXpEvents,
    uiPreferences,
  } = useStore();

  const toast = useToast();
  const { t, language } = useTranslation();
  // Live today: rolls over at midnight / on resume instead of freezing
  // at mount (an app left open overnight kept showing yesterday).
  const todayStr = useToday();
  const today = useMemo(() => new Date(), [todayStr]);
  const todayDayOfWeek = useMemo(() => getTodayDayOfWeek(todayStr), [todayStr]);

  // Sentence-case personalized greeting matching Screen 8 & 9.
  // Hindi greetings follow the same hour buckets as getTimeGreeting.
  const greeting = useMemo(() => {
    if (language === 'hi') {
      const h = today.getHours();
      if (h >= 5 && h < 12) return t('home.greetingMorning');
      if (h >= 12 && h < 17) return t('home.greetingAfternoon');
      if (h >= 17 && h < 22) return t('home.greetingEvening');
      return t('home.greetingNight');
    }
    return getTimeGreeting(today);
  }, [today, language, t]);

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

  // Forgiving streak (streak-freeze system): active days = real workouts or
  // 3+ logged meals; one missed day auto-consumes a freeze, silently.
  const normalizedWorkouts = useMemo(
    () => workouts.map((w) => ({ ...w, date: w.date.split('T')[0] })),
    [workouts]
  );
  const streakInfo = useMemo(() => {
    const activeDays = buildActiveDays(normalizedWorkouts, meals);
    return calculateStreak({
      dailyActivity: activeDays,
      freezesAvailable: streak.freezesAvailable,
      todayStr,
    });
  }, [normalizedWorkouts, meals, streak.freezesAvailable, todayStr]);

  // Readiness, computed on render from the coach engine — including
  // today's feel check-in when the user has given one, plus Health
  // Connect device signals when the user has connected them.
  const healthSummary = useStore((state) => state.healthSummary);
  const todayCheckin = dailyCheckins?.[todayStr];
  const readiness = useMemo(
    () =>
      calculateReadiness(
        normalizedWorkouts,
        bodyMetrics || [],
        todayCheckin,
        buildHealthSignals(healthSummary)
      ),
    [normalizedWorkouts, bodyMetrics, todayCheckin, healthSummary]
  );

  // Coach digest: missed-session check-in + weight-trend nutrition advice.
  const coachDigest = useCoachDigest();
  const dismissCheckIn = useStore((state) => state.dismissCheckIn);
  const recordCalorieAdjustment = useStore((state) => state.recordCalorieAdjustment);
  const setMacroGoals = useStore((state) => state.setMacroGoals);
  const nutritionSuggestion = coachDigest.nutrition.suggestion;
  const checkIn = coachDigest.checkIn;

  // XP / level.
  const levelInfo = useMemo(() => {
    const total = xp?.totalXp || 0;
    const level = getLevel(total);
    return { total, level, name: getLevelName(level), progress: progressToNext(total) };
  }, [xp]);

  // XP attributable to this week's (Mon–Sun) logged activity — shown in the
  // Level sheet. Derived from the ledger's own award rules, not a fake feed.
  const weekXp = useMemo(() => {
    const { start, end } = getWeekRange(today);
    return summarizeXpInRange(
      { workouts: normalizedWorkouts, meals, prs: prs || [], waterLogs: waterLogs || {} },
      start,
      end,
    );
  }, [today, normalizedWorkouts, meals, prs, waterLogs]);

  // Monthly challenge: first challenge of the month that is opted-in or
  // still showable (not dismissed). Logic lives in lib/challenges.
  const homeChallenge = useMemo(() => {
    const month = getChallengeMonth(todayStr);
    const defs = monthlyChallenges(month);
    const data = {
      workouts: normalizedWorkouts,
      meals,
      prs: (prs || []).map((p) => ({ date: (p.date || '').split('T')[0] })),
      currentStreak: streakInfo.currentStreak,
      waterDays: Object.keys(waterLogs || {}).filter((d) => (waterLogs?.[d] || 0) > 0),
    };
    for (const def of defs) {
      const key = challengeInstanceKey(def);
      const inst = challengesState?.instances?.[key];
      if (inst?.optedIn) {
        return { def, key, optedIn: true, evaluation: evaluateChallenge(def, data) };
      }
    }
    for (const def of defs) {
      if (shouldShowChallengeCard(challengesState, def)) {
        return { def, key: challengeInstanceKey(def), optedIn: false, evaluation: evaluateChallenge(def, data) };
      }
    }
    return null;
  }, [todayStr, normalizedWorkouts, meals, prs, streakInfo.currentStreak, waterLogs, challengesState]);

  // Challenge completion payout. The XP ledger + grant action existed but
  // nothing ever called them, while the card claimed "200 XP earned" — this
  // effect closes that loop. Idempotent twice over: the ledger dedupes by
  // event id, and rewardGranted stops re-evaluation.
  useEffect(() => {
    if (!challengesState) return;
    const month = getChallengeMonth(todayStr);
    const data = {
      workouts: normalizedWorkouts,
      meals,
      prs: (prs || []).map((p) => ({ date: (p.date || '').split('T')[0] })),
      currentStreak: streakInfo.currentStreak,
      waterDays: Object.keys(waterLogs || {}).filter((d) => (waterLogs?.[d] || 0) > 0),
    };
    for (const def of monthlyChallenges(month)) {
      const { rewardDue } = evaluateChallengeReward(def, data, challengesState);
      if (rewardDue) {
        awardXpEvents([{ id: challengeXpEventId(def), type: 'challenge' }]);
        grantChallengeReward(challengeInstanceKey(def));
        toast.success(`${def.title} complete — 200 XP earned.`, 'Challenge Complete');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengesState, normalizedWorkouts, meals, prs, streakInfo.currentStreak, waterLogs, todayStr]);

  // Rotating motivational quote, personalized by gender when known.
  // Rendered at the very bottom of the page.
  const dailyQuote = useMemo(() => getDailyQuote(profile?.gender ?? null), [profile?.gender]);

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
  const [isReminderCenterOpen, setIsReminderCenterOpen] = useState(false);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);
  const [isLogPastModalOpen, setIsLogPastModalOpen] = useState(false);
  const [isScanMealModalOpen, setIsScanMealModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isChangeWorkoutOpen, setIsChangeWorkoutOpen] = useState(false);
  const [isCompletedWorkoutModalOpen, setIsCompletedWorkoutModalOpen] = useState(false);
  const [isReadinessSheetOpen, setIsReadinessSheetOpen] = useState(false);
  const [isLevelSheetOpen, setIsLevelSheetOpen] = useState(false);
  const [isChallengesSheetOpen, setIsChallengesSheetOpen] = useState(false);

  const { registerBackHandler } = useAppNavigation();

  // Register Modal Back Handlers (Interconnected Navigation)
  useEffect(() => {
    if (isNotificationsOpen) {
      return registerBackHandler(() => { setIsNotificationsOpen(false); return true; }, 100);
    }
  }, [isNotificationsOpen, registerBackHandler]);

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

  useEffect(() => {
    if (isReadinessSheetOpen) {
      return registerBackHandler(() => { setIsReadinessSheetOpen(false); return true; }, 100);
    }
  }, [isReadinessSheetOpen, registerBackHandler]);

  useEffect(() => {
    if (isLevelSheetOpen) {
      return registerBackHandler(() => { setIsLevelSheetOpen(false); return true; }, 100);
    }
  }, [isLevelSheetOpen, registerBackHandler]);

  useEffect(() => {
    if (isChallengesSheetOpen) {
      return registerBackHandler(() => { setIsChallengesSheetOpen(false); return true; }, 100);
    }
  }, [isChallengesSheetOpen, registerBackHandler]);

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
      // %1RM mode (opt-in per plan): suggested loads for main compounds.
      const percentWeightsByIndex: Record<number, number[]> = {};
      if (planToStart.intensityMode === 'percent') {
        const suggestions = buildPercentSuggestions(planToStart, prs, workouts, userUnit);
        for (const [idx, s] of Object.entries(suggestions)) {
          percentWeightsByIndex[Number(idx)] = s.weights;
        }
      }
      const draft = createWorkoutDraftFromPlan(planToStart, {
        userUnit,
        userPrs: prs,
        applications,
        date: todayStr,
        percentWeightsByIndex,
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
    if (scheduledPlan) return estimateSessionMinutes(scheduledPlan);
    return Math.max(35, Math.min(65, exerciseCount * 8 || 45));
  }, [sessionInfo.durationMin, exerciseCount, scheduledPlan]);

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

  // Quiet protein-coach line for veg/eggitarian users tracking low —
  // one line under the nutrition cards, dismissible from the Meals tab.
  const homeProteinHint =
    uiPreferences.coachEnabled && !isHintDismissed(todayStr, 'protein')
      ? getProteinGapSuggestion({
          diet: profile?.dietPreference || 'non_vegetarian',
          proteinLoggedG: fuelStats.protein,
          proteinTargetG: fuelStats.targetProtein,
          hour: new Date().getHours(),
        })
      : null;

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
            title={t('home.notifications')}
            aria-label={t('home.notifications')}
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
          <span className="font-medium text-text-muted">{t('home.todaysWorkout')}</span>
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
          {/^rest day/i.test(routineDisplayName)
            ? 'Recovery is training too — sleep well, eat well, come back stronger tomorrow.'
            : `${durationMinutes} min • ${exerciseCount} exercises`}
        </p>

        <button
          type="button"
          onClick={() => {
            if (activeWorkoutDraft) {
              onNavigate('workout');
            } else if (sessionInfo.status === 'completed') {
              if (completedWorkoutForToday && uiPreferences.coachEnabled) {
                setIsCompletedWorkoutModalOpen(true);
              } else {
                // Coach off: the Take modal is a coach surface — go to
                // the training history instead of a dead tap.
                onNavigate('workout');
              }
            } else {
              handleStartWorkoutFromHome();
            }
          }}
          className="w-full mt-5 py-3.5 px-4 rounded-xl bg-accent hover:brightness-105 active:scale-[0.99] text-white font-bold text-sm tracking-wide shadow-sm shadow-accent/25 transition-all cursor-pointer text-center"
        >
          {activeWorkoutDraft
            ? t('home.resumeWorkout')
            : sessionInfo.status === 'completed'
            ? t('home.viewCompletedWorkout')
            : t('train.startWorkout')}
        </button>
        {/* Quick Log — one tap to log a session that already happened. */}
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => setIsLogPastModalOpen(true)}
            className="text-xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            Already trained? Quick log a past session
          </button>
        </div>
      </div>

      {/* ── 3. NUTRITION SUMMARY (Screen 8 & Screen 9: 2-Column Grid) ──────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Nutrition (Calories) Card */}
        <div
          onClick={() => onNavigate('meals')}
          className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between cursor-pointer hover:border-accent/40 transition-colors pressable"
          role="button"
          tabIndex={0}
          aria-label="View Nutrition Details"
        >
          <span className="text-xs font-medium text-text-muted">{t('home.nutrition')}</span>
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
          className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between cursor-pointer hover:border-accent/40 transition-colors pressable"
          role="button"
          tabIndex={0}
          aria-label="View Protein Details"
        >
          <span className="text-xs font-medium text-text-muted">{t('home.protein')}</span>
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

      {homeProteinHint && (
        <button
          type="button"
          onClick={() => onNavigate('meals')}
          className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-bg-card border border-border/60 text-left cursor-pointer hover:border-accent/40 transition-colors pressable"
        >
          <Leaf className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
          <span className="text-xs text-text-secondary leading-relaxed">
            {homeProteinHint.message}
          </span>
        </button>
      )}

      {/* ── 4. READINESS + LEVEL (each hideable in Settings) ────────────── */}
      {(uiPreferences.coachEnabled || uiPreferences.gamificationEnabled) && (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 items-start">
        {/* Readiness Card (coach engine) — compact; the whole card opens
            the Readiness sheet (factors + optional feel check-in live there).
            Readiness is computed internally; the card shows the score only. */}
        {uiPreferences.coachEnabled && (
        <button
          type="button"
          onClick={() => setIsReadinessSheetOpen(true)}
          aria-label="View readiness details"
          className={`bg-bg-card border border-border/80 rounded-2xl p-3.5 shadow-xs text-left cursor-pointer hover:border-accent/40 transition-colors pressable ${uiPreferences.gamificationEnabled ? '' : 'col-span-2'}`}
        >
          <span className="text-xs font-medium text-text-muted">{t('home.readiness')}</span>
          <span className="mt-1.5 block">
            <span className="text-xl sm:text-2xl font-bold text-text-primary tabular-nums leading-tight">
              {readiness.score} <span className="text-sm font-semibold text-text-muted">{READINESS_LABEL[readiness.band] || 'Ready'}</span>
            </span>
            <span className="flex items-center gap-0.5 text-3xs font-semibold text-text-muted mt-1">
              Details
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </span>
        </button>
        )}

        {/* Level Card (XP system) — compact; the whole card opens the Level
            sheet (how XP is earned, this week, the level ladder). */}
        {uiPreferences.gamificationEnabled && (
        <button
          type="button"
          onClick={() => setIsLevelSheetOpen(true)}
          aria-label="View level details"
          className={`bg-bg-card border border-border/80 rounded-2xl p-3.5 shadow-xs text-left cursor-pointer hover:border-accent/40 transition-colors pressable ${uiPreferences.coachEnabled ? '' : 'col-span-2'}`}
        >
          <span className="text-xs font-medium text-text-muted">{t('home.level')} {levelInfo.level} · {levelInfo.name}</span>
          <span className="mt-1.5 block">
            <span className="text-xl sm:text-2xl font-bold text-text-primary tabular-nums leading-tight">
              {levelInfo.total.toLocaleString()} XP
            </span>
            <span className="w-full h-1.5 rounded-full bg-border/60 overflow-hidden mt-2 block">
              <span
                className="h-full rounded-full bg-accent transition-all duration-500 block"
                style={{ width: `${levelInfo.progress.pct}%` }}
              />
            </span>
            <span className="text-xs text-text-muted tabular-nums block mt-1">
              {(levelInfo.progress.needed - levelInfo.progress.current).toLocaleString()} to Level {levelInfo.level + 1}
            </span>
          </span>
        </button>
        )}
      </div>
      )}

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
          <span className="text-3xs font-semibold text-text-secondary">{t('home.mealScan')}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsBarcodeModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Barcode className="w-4 h-4" />
          </span>
          <span className="text-3xs font-semibold text-text-secondary">{t('home.scan')}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsWeightModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Scale className="w-4 h-4" />
          </span>
          <span className="text-3xs font-semibold text-text-secondary">{t('home.weight')}</span>
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
              <p className="text-xs font-bold text-text-primary">{t('home.hydration')}</p>
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

      {/* ── 7a. COACH CHECK-IN (missed sessions) — hideable in Settings ──── */}
      {uiPreferences.coachEnabled && checkIn && (
        <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                <MessageCircleHeart className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary leading-relaxed">
                  {checkIn.sessions.length === 1
                    ? `${checkIn.sessions[0].name} didn't get logged this week`
                    : `${checkIn.sessions.length} planned sessions didn't get logged this week`}
                </p>
                <CollapsibleDetails label="Details">
                  <p className="whitespace-pre-line">{checkIn.message}</p>
                </CollapsibleDetails>
                {(() => {
                  // "Do it today": actually start the most recent missed
                  // session's plan — the check-in copy promises a moved
                  // session, so the button has to exist and work.
                  const latest = checkIn.sessions[checkIn.sessions.length - 1];
                  const plan =
                    (latest.planId && plannedWorkouts.find((p) => p.id === latest.planId)) ||
                    plannedWorkouts.find(
                      (p) => p.name.trim().toLowerCase() === latest.name.trim().toLowerCase()
                    );
                  if (!plan) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        for (const s of checkIn.sessions) dismissCheckIn(`missed:${s.date}:${s.name}`);
                        handleStartWorkoutFromHome(plan);
                      }}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-accent text-white text-2xs font-bold hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      Do it today — start {plan.name}
                    </button>
                  );
                })()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                for (const s of checkIn.sessions) dismissCheckIn(`missed:${s.date}:${s.name}`);
                toast.info("Check-in snoozed — it won't repeat this week.", 'Snoozed');
              }}
              className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
              aria-label="Dismiss check-in"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── 7b. COACH NUTRITION SUGGESTION (weight trend → calorie target) ──── */}
      {uiPreferences.coachEnabled && nutritionSuggestion && nutritionSuggestion.action !== 'hold' && (
        <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary leading-relaxed">
                  Coach suggests {nutritionSuggestion.deltaKcal > 0 ? '+' : ''}{nutritionSuggestion.deltaKcal} kcal → {nutritionSuggestion.newCalories.toLocaleString()} kcal/day
                </p>
                <CollapsibleDetails label="Why?">
                  <p>{nutritionSuggestion.reason}</p>
                  <p className="mt-1">General training guidance, not medical advice. If you have a medical condition (e.g. diabetes), check with your doctor before changing calorie targets.</p>
                </CollapsibleDetails>
                <button
                  type="button"
                  onClick={() => {
                    const current = useStore.getState().macroGoals;
                    const record: CalorieAdjustmentRecord = {
                      appliedAt: todayStr,
                      appliedTargetKcal: nutritionSuggestion.newCalories,
                      basedOnWeightLogCount: coachDigest.nutrition.weightLogCount,
                      basedOnLatestWeightDate: coachDigest.nutrition.latestWeightDate,
                    };
                    // Rescale the WHOLE goal set — calories only left protein/
                    // carbs/fat, maintenance and the delta stale, breaking the
                    // zero-Atwater-drift guarantee the Meals page relies on.
                    if (current) {
                      setMacroGoals(scaleMacroGoalsToCalories(current, nutritionSuggestion.newCalories));
                    }
                    recordCalorieAdjustment(record);
                    toast.success(`Target updated to ${nutritionSuggestion.newCalories.toLocaleString()} kcal/day.`, 'Calories Adjusted');
                  }}
                  className="mt-2 py-2 px-4 rounded-xl bg-accent text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
                >
                  Apply {nutritionSuggestion.newCalories.toLocaleString()} kcal/day
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const current = useStore.getState().macroGoals;
                recordCalorieAdjustment({
                  appliedAt: todayStr,
                  appliedTargetKcal: Math.round(current?.calories ?? 0),
                  basedOnWeightLogCount: coachDigest.nutrition.weightLogCount,
                  basedOnLatestWeightDate: coachDigest.nutrition.latestWeightDate,
                  dismissed: true,
                });
                toast.info("Suggestion dismissed — I'll reassess in two weeks.", 'Dismissed');
              }}
              className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
              aria-label="Dismiss calorie suggestion"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── 7c. NEXT-SESSION ADJUSTMENTS (auto-regulation) ───────────────── */}
      {uiPreferences.coachEnabled && coachDigest.nextAdjustments.length > 0 && (
        <div className="bg-bg-card border border-border/80 rounded-2xl p-3.5 shadow-xs">
          <span className="text-xs font-medium text-text-muted">Next session — coach&apos;s calls</span>
          <div className="mt-2 space-y-2">
            {coachDigest.nextAdjustments.map((adj) => (
              <div key={adj.exercise}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold text-text-primary truncate">{adj.exercise}</p>
                  <span className="text-xs font-bold text-text-primary tabular-nums shrink-0">
                    {adj.oldTarget.weight} → {adj.newTarget.weight}
                    {adj.newTarget.unit}
                  </span>
                </div>
                {/* The reasoning is one tap away, never auto-shown. */}
                <CollapsibleDetails label="Why?">
                  <p>{adj.reason}</p>
                </CollapsibleDetails>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 8. STREAK (hidden when gamification is off; the quote now lives at the page bottom) ─ */}
      {uiPreferences.gamificationEnabled && (
      <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Flame className="w-4 h-4" />
          </span>
          <p className="text-xs font-bold text-text-primary">
            {streakInfo.currentStreak > 0
              ? `${streakInfo.currentStreak} day${streakInfo.currentStreak === 1 ? '' : 's'} streak — keep it burning`
              : 'Start your streak with today\'s workout'}
          </p>
          {streakInfo.currentStreak > 0 && streak.freezesAvailable > 0 && (
            <span className="inline-flex items-center gap-1 text-3xs font-semibold text-text-muted ml-auto shrink-0">
              <Snowflake className="w-3.5 h-3.5" aria-hidden="true" />
              {streak.freezesAvailable} freeze{streak.freezesAvailable === 1 ? '' : 's'} ready
            </span>
          )}
        </div>
        {streakInfo.freezeConsumed && (
          <p className="text-3xs text-text-muted mt-1.5">
            A streak freeze covered a missed day this run — no harm done.
          </p>
        )}
      </div>
      )}

      {/* ── 8a2. STEPS (Health Connect, only when synced data exists) ──── */}
      {healthSummary && healthSummary.date === todayStr && healthSummary.stepsToday > 0 && (
        <div className="bg-bg-card border border-border/80 rounded-2xl px-4 py-3 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Footprints className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-text-primary block">
              {t('health.stepsToday')}
            </span>
            <span className="text-3xs text-text-muted block">Health Connect</span>
          </div>
          <span className="ml-auto text-sm font-black font-mono text-text-primary tabular-nums">
            {healthSummary.stepsToday.toLocaleString()}
          </span>
        </div>
      )}

      {/* ── 8b. HABIT MATRIX (one week: Gym / Water / Creatine / Protein) ──── */}
      {uiPreferences.showHabitMatrix && (
      <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-text-primary">{t('home.habitsThisWeek')}</span>
          <span className="text-3xs font-mono text-text-muted">MON — SUN</span>
        </div>
        <WeeklyHabitMatrix
          compact
          workouts={workouts}
          waterLogs={waterLogs}
          creatineLogs={creatineLogs}
          showCreatine={
            creatineConfig?.enabled !== false &&
            !(typeof profile?.age === 'number' && profile.age < 18)
          }
          meals={meals}
          waterTargetMl={calculateHydrationTarget({
            bodyweightKg: profile?.bodyweightKg || 75,
            customTargetMl: hydrationConfig?.dailyTargetMl,
            isCustomTarget: hydrationConfig?.isCustomTarget,
          })}
          proteinTargetG={macroGoals?.proteinG || (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140)}
          weekStart={(() => {
            const d = new Date(today);
            d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            d.setHours(0, 0, 0, 0);
            return d;
          })()}
        />
      </div>
      )}

      {/* ── 8c. MONTHLY CHALLENGE (opt-in, dismissible) ────────────────────── */}
      {uiPreferences.gamificationEnabled && homeChallenge && (
        <div
          className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs cursor-pointer hover:border-amber-500/40 transition-colors pressable"
          onClick={() => setIsChallengesSheetOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="View all challenges"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsChallengesSheetOpen(true);
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-text-primary">{homeChallenge.def.title}</p>
                <p className="text-3xs text-text-muted mt-0.5 leading-relaxed">{homeChallenge.def.description}</p>
              </div>
            </div>
            {!homeChallenge.optedIn && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissChallenge(homeChallenge.key);
                }}
                className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
                aria-label="Dismiss challenge"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {homeChallenge.optedIn ? (
            <div className="mt-3">
              <div className="w-full h-2 rounded-full bg-border/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${homeChallenge.evaluation.pct}%` }}
                />
              </div>
              <p className="text-3xs text-text-muted tabular-nums mt-1.5">
                {homeChallenge.evaluation.progress} of {homeChallenge.evaluation.target} · {homeChallenge.evaluation.pct}%
                {homeChallenge.evaluation.completed ? ' · Complete — 200 XP earned' : ''}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                optInChallenge(homeChallenge.key);
                toast.success('Challenge joined. Good luck!', 'Challenge Accepted');
              }}
              className="mt-3 py-2 px-4 rounded-xl bg-accent text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
            >
              Join challenge
            </button>
          )}
        </div>
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
                <h3 className="text-base font-bold text-text-primary">{t('home.notifications')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(false)}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
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
                <p className="font-semibold text-text-primary">{t('home.weeklyTarget')}</p>
                <p className="text-text-muted mt-0.5">
                  {uiPreferences.weeklyTargetDays === 0
                    ? `${weeklyStats.completedCount} workouts completed this week.`
                    : `${weeklyStats.completedCount} of ${uiPreferences.weeklyTargetDays ?? weeklyStats.targetDays} workouts completed this week.`}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsNotificationsOpen(false);
                  setIsReminderCenterOpen(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-xs font-semibold text-text-primary transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-4 h-4 text-text-muted" />
                <span>{t('home.notificationSettings')}</span>
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
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
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
                              <span>{t('home.start')}</span>
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

      {/* ── NOTIFICATION SETTINGS (Reminder Center) ────────────────────────── */}
      <ReminderCenterModal
        isOpen={isReminderCenterOpen}
        onClose={() => setIsReminderCenterOpen(false)}
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

      {/* ── COMPLETED WORKOUT DETAIL MODAL (Coach's Take surface) ────────── */}
      {uiPreferences.coachEnabled && isCompletedWorkoutModalOpen && completedWorkoutForToday && (
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

      {/* ── READINESS DETAIL SHEET ─────────────────────────────────────────── */}
      <ReadinessSheet
        isOpen={isReadinessSheetOpen}
        onClose={() => setIsReadinessSheetOpen(false)}
        readiness={readiness}
        todayCheckin={todayCheckin}
        todayStr={todayStr}
        onCheckin={setDailyCheckin}
      />

      {/* ── LEVEL DETAIL SHEET ─────────────────────────────────────────────── */}
      <LevelSheet
        isOpen={isLevelSheetOpen}
        onClose={() => setIsLevelSheetOpen(false)}
        total={levelInfo.total}
        level={levelInfo.level}
        name={levelInfo.name}
        progress={levelInfo.progress}
        weekXp={weekXp}
      />

      {/* ── CHALLENGES SHEET ───────────────────────────────────────────────── */}
      <ChallengesSheet
        isOpen={isChallengesSheetOpen}
        onClose={() => setIsChallengesSheetOpen(false)}
      />

      {/* ── DAILY QUOTE — always the last element on the page ──────────────── */}
      <div className="text-center pt-1 pb-2">
        <p className="text-xs text-text-muted italic leading-relaxed">&ldquo;{dailyQuote.text}&rdquo;</p>
        <p className="text-3xs text-text-muted mt-1 font-mono">— {dailyQuote.author}</p>
      </div>
    </div>
  );
}
