'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useAppNavigation } from '@/lib/navigation';
import {
  Bell,
  ChevronRight,
  Play,
  X,
  Calendar,
  Dumbbell,
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

import { getLevel, getLevelName, getLevelNameKey, progressToNext, summarizeXpInRange, XP_CHALLENGE_COMPLETE } from '@/lib/xp-system';
import { getExerciseHindiName } from '@/lib/exercise-library';
import { renderLocalizedSentence, formatCheckInList } from '@/lib/coach-i18n';
import type { StringKey } from '@/lib/i18n/en';
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
import AthleteModelCard from '@/components/AthleteModelCard';
import CoachWeeklyReviewCard from '@/components/CoachWeeklyReviewCard';
import CoachNotesSection from '@/components/CoachNotesSection';
import LevelSheet from '@/components/LevelSheet';
import ChallengesSheet from '@/components/ChallengesSheet';
import WeeklyHabitMatrix from '@/components/WeeklyHabitMatrix';
import CustomizeSheet from '@/components/CustomizeSheet';
import { resolveTodayLayout, sanitizeTodayLayout, DEFAULT_TODAY_LAYOUT } from '@/lib/today-layout';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';

const READINESS_LABEL_KEY: Record<string, StringKey> = {
  primed: 'home.readinessPrimed',
  ready: 'home.readinessReady',
  caution: 'home.readinessEasy',
  rest: 'home.readinessRest',
};

// LIVE-P1-03: getWorkoutBodyParts values → i18n keys (unknown values fall back to themselves).
const BODY_PART_KEY: Record<string, StringKey> = {
  Chest: 'home.bodyPartChest',
  Back: 'home.bodyPartBack',
  Legs: 'home.bodyPartLegs',
  Shoulders: 'home.bodyPartShoulders',
  Arms: 'home.bodyPartArms',
  Core: 'home.bodyPartCore',
  'Full Body': 'home.bodyPartFullBody',
  Conditioning: 'home.bodyPartConditioning',
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
    setUiPreferences,
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

  // FND-02: recompute the coach model on Today mount, so Coach notes
  // and completed counts reflect the latest saves without a reload.
  // The store subscription already refreshes on save; this covers a
  // mount after an overnight/day-boundary gap. Zustand actions are
  // stable, so this runs once in practice, and the model slice is
  // excluded from the refresh signature, so it cannot loop.
  const refreshAthleteModel = useStore((state) => state.refreshAthleteModel);
  useEffect(() => {
    refreshAthleteModel();
  }, [refreshAthleteModel]);

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
    return { total, level, name: getLevelName(level), nameKey: getLevelNameKey(level), progress: progressToNext(total) };
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
        toast.success(t('toast.challengeComplete', { title: def.title }), t('toast.titleChallengeComplete'));
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
    toast.success(t('toast.scannedLoggedShort', { name: scannedItem.name, kcal: scannedItem.calories }), t('toast.titleScannedLogged'));
  };

  // Modal triggers
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null); const { dialogProps: notificationsDialogProps } = useModalA11y(notificationsRef, isNotificationsOpen, () => setIsNotificationsOpen(false));
  const [isReminderCenterOpen, setIsReminderCenterOpen] = useState(false);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);
  const [isLogPastModalOpen, setIsLogPastModalOpen] = useState(false);
  const [isScanMealModalOpen, setIsScanMealModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isChangeWorkoutOpen, setIsChangeWorkoutOpen] = useState(false);
  const changeWorkoutRef = useRef<HTMLDivElement>(null); const { dialogProps: changeWorkoutDialogProps } = useModalA11y(changeWorkoutRef, isChangeWorkoutOpen, () => setIsChangeWorkoutOpen(false));
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
    toast.success(t('toast.todayWorkoutSet', { name: plan.name }), t('toast.titleRoutineUpdated'));
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
      toast.success(t('toast.sessionStarted', { name: planToStart.name }), t('toast.titleSessionStarted'));
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
      carbs: Math.round(macros.carbsG),
      fat: Math.round(macros.fatG),
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

  // ── UX redesign Stage 3 — density + Today layout ─────────────────────
  const density = uiPreferences.density === 'detailed' ? 'detailed' : 'simple';
  const resolvedToday = useMemo(
    () => resolveTodayLayout(uiPreferences.todayLayout, density),
    [uiPreferences.todayLayout, density],
  );
  const rawTodayLayout = useMemo(
    () => sanitizeTodayLayout(uiPreferences.todayLayout),
    [uiPreferences.todayLayout],
  );
  // Visual order: header 0 (DOM first), workout card 1 (pinned),
  // sections 10 + 10 * position-in-user-order, Customize button 1000.
  const orderOf = (id: string) => 10 + Math.max(0, resolvedToday.findIndex((s) => s.id === id)) * 10;
  const shown = (id: string) => resolvedToday.find((s) => s.id === id)?.shown ?? true;
  const stepsVisible = !!(healthSummary && healthSummary.date === todayStr && healthSummary.stepsToday > 0);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  const handleToggleSection = (id: string, next: boolean) => {
    setUiPreferences({
      todayLayout: { ...rawTodayLayout, visible: { ...rawTodayLayout.visible, [id]: next } },
    });
  };
  const handleMoveSection = (id: string, dir: -1 | 1) => {
    // Move in RESOLVED order (what the sheet displays), not raw stored
    // order: for a never-reordered layout the resolved order is the
    // density default, which differs from the stored canonical order.
    // Moving in raw order would first "un-pristine" the layout and jump
    // the whole list to the stored order. Materializing the resolved
    // order on first move keeps the displayed list stable.
    // Typed string[] to match TodayLayout.order (raw stored order is string[]).
    const order: string[] = resolvedToday.map((s) => s.id);
    const idx = order.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    setUiPreferences({ todayLayout: { ...rawTodayLayout, order } });
  };
  const handleRestoreLayout = () => {
    setUiPreferences({ todayLayout: { ...DEFAULT_TODAY_LAYOUT, order: [...DEFAULT_TODAY_LAYOUT.order] } });
    toast.success(t('customize.layoutRestored'));
  };

  // Sheet labels must match the visible section titles exactly.
  const sectionTitles: Record<string, string> = {
    'nutrition-strip': t('home.nutrition'),
    coach: t('home.coachSection'),
    'habit-matrix': t('home.habitsThisWeek'),
    'quick-actions': t('home.quickActions'),
    hydration: t('home.hydration'),
    readiness: t('home.readiness'),
    level: t('home.level'),
    steps: t('health.stepsToday'),
    challenge: t('home.monthlyChallenge'),
    'weekly-review-detail': t('weeklyReview.cardTitle'),
    quote: t('home.quote'),
  };

  // Sync caption: honest status for cloud-synced data only. The new
  // personalization keys are local-only and are never described as synced.
  const { status: syncStatus } = useSupabaseSync();
  const syncText =
    syncStatus === 'syncing' ? t('home.syncSyncing')
    : syncStatus === 'synced' ? t('home.syncSynced')
    : syncStatus === 'error' ? t('home.syncFailed')
    : t('home.syncLocalOnly');

  // Welcome-back: returning after >= 2 days away, no guilt copy. A user
  // with no workouts ever gets the new-user state, not this line.
  const lastWorkout = useMemo(() => {
    if (!workouts || workouts.length === 0) return null;
    const sorted = [...workouts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return sorted[0] || null;
  }, [workouts]);
  const welcomeBack = useMemo(() => {
    if (!lastWorkout?.date) return null;
    const lastDate = lastWorkout.date.split('T')[0];
    const diffDays = Math.floor(
      (new Date(`${todayStr}T00:00:00`).getTime() - new Date(`${lastDate}T00:00:00`).getTime()) / 86400000,
    );
    if (diffDays < 2) return null;
    const dateLabel = new Date(`${lastDate}T00:00:00`).toLocaleDateString(
      language === 'hi' ? 'hi-IN' : 'en-US',
      { month: 'short', day: 'numeric' },
    );
    return lastWorkout.name
      ? t('home.welcomeBackPlan', { date: dateLabel, plan: lastWorkout.name })
      : t('home.welcomeBack', { date: dateLabel });
  }, [lastWorkout, todayStr, language, t]);

  return (
    <div className="page animate-fade-in flex flex-col gap-6 page-bottom-safe max-w-md mx-auto px-5 pt-3">
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
            className="w-11 h-11 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary/60 transition-colors cursor-pointer select-none"
            title={t('home.notifications')}
            aria-label={t('home.notifications')}
          >
            <Bell className="w-5 h-5" />
          </button>
        </div>
      </header>
      {welcomeBack && (
        <p className="-mt-4 text-sm text-text-secondary">{welcomeBack}</p>
      )}
      <p className="-mt-4 text-right text-2xs text-text-muted">{syncText}</p>

      {/* ── 2. TODAY'S WORKOUT CARD (Screen 8 & Screen 9) ──────────────────── */}
      <div style={{ order: 1 }}>
      <div className="bg-bg-card border border-border/80 rounded-2xl p-5 shadow-xs transition-all">
        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
          <span className="font-medium text-text-muted">{t('home.todaysWorkout')}</span>
          <button
            type="button"
            onClick={() => setIsChangeWorkoutOpen(true)}
            className="text-2xs font-semibold text-text-muted hover:text-text-primary flex items-center gap-0.5 transition-colors cursor-pointer"
            title={t('home.changeWorkoutTitle')}
          >
            <span>{t('home.adaptiveSplit')}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <h2 className="text-xl font-bold text-text-primary leading-tight">
          {routineDisplayName}
        </h2>

        <p className="text-xs sm:text-sm text-text-muted mt-1 font-normal">
          {/^rest day/i.test(routineDisplayName)
            ? t('home.restDayLine')
            : t('home.durationExercises', { min: durationMinutes, count: exerciseCount })}
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
          className="w-full mt-5 py-3.5 px-4 rounded-xl bg-accent hover:brightness-105 active:scale-[0.99] text-accent-on font-bold text-sm tracking-wide shadow-sm shadow-accent/25 transition-all cursor-pointer text-center"
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
            {t('home.quickLogPast')}
          </button>
        </div>
      </div>

      </div>

      {/* ── 3. NUTRITION SUMMARY (Screen 8 & Screen 9: 2-Column Grid) ──────── */}
      <div style={{ order: orderOf('nutrition-strip') }} className={shown('nutrition-strip') ? undefined : 'hidden'}>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Nutrition (Calories) Card */}
        <div
          onClick={() => onNavigate('meals')}
          className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between cursor-pointer hover:border-accent/40 transition-colors pressable"
          role="button"
          tabIndex={0}
          aria-label={t('home.viewNutritionDetails')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate('meals');
            }
          }}
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
          aria-label={t('home.viewProteinDetails')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate('meals');
            }
          }}
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
            {renderLocalizedSentence(t, language, homeProteinHint.messageI18n, homeProteinHint.message)}
          </span>
        </button>
      )}

        {density === 'detailed' && (
          <button
            type="button"
            onClick={() => onNavigate('meals')}
            className="text-2xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            {t('home.carbsFat', { carbs: fuelStats.carbs, fat: fuelStats.fat })}
          </button>
        )}
      </div>

      {/* ── 4. READINESS + LEVEL (each hideable in Settings) ────────────── */}
      <div style={{ order: orderOf('readiness') }} className={uiPreferences.coachEnabled && shown('readiness') ? undefined : 'hidden'}>
        {uiPreferences.coachEnabled && (
        <button
          type="button"
          onClick={() => setIsReadinessSheetOpen(true)}
          aria-label={t('home.viewReadinessDetails')}
          className={`bg-bg-card border border-border/80 rounded-2xl p-3.5 shadow-xs text-left cursor-pointer hover:border-accent/40 transition-colors pressable`}
        >
          <span className="text-xs font-medium text-text-muted">{t('home.readiness')}</span>
          <span className="mt-1.5 block">
            <span className="text-xl sm:text-2xl font-bold text-text-primary tabular-nums leading-tight">
              {readiness.score} <span className="text-sm font-semibold text-text-muted">{t(READINESS_LABEL_KEY[readiness.band] ?? 'home.readinessReady')}</span>
            </span>
            <span className="flex items-center gap-0.5 text-2xs font-semibold text-text-muted mt-1">
              {t('home.details')}
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </span>
        </button>
        )}
      </div>

      <div style={{ order: orderOf('level') }} className={uiPreferences.gamificationEnabled && shown('level') ? undefined : 'hidden'}>
        {uiPreferences.gamificationEnabled && (
        <button
          type="button"
          onClick={() => setIsLevelSheetOpen(true)}
          aria-label={t('home.viewLevelDetails')}
          className={`bg-bg-card border border-border/80 rounded-2xl p-3.5 shadow-xs text-left cursor-pointer hover:border-accent/40 transition-colors pressable`}
        >
          <span className="text-xs font-medium text-text-muted">{t('home.level')} {levelInfo.level} · {t(levelInfo.nameKey)}</span>
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
              {(levelInfo.progress.needed - levelInfo.progress.current).toLocaleString()} {t('home.toLevel', { level: levelInfo.level + 1 })}
            </span>
          </span>
        </button>
        )}
      </div>

      {/* ── COACH — one section: today's note + athlete facts (UX redesign Stage 3) ── */}
      {uiPreferences.coachEnabled && shown('coach') && (
      <div style={{ order: orderOf('coach') }} className="space-y-4">
        <h2 className="section-heading px-1">{t('home.coachSection')}</h2>
<CoachNotesSection
        checkIn={uiPreferences.coachEnabled && checkIn && (
        <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                <MessageCircleHeart className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary leading-relaxed">
                  {checkIn.sessions.length === 1
                    ? t('home.missedOne', { name: checkIn.sessions[0].name })
                    : t('home.missedMany', { count: checkIn.sessions.length })}
                </p>
                <CollapsibleDetails label={t('home.details')}>
                  <p className="whitespace-pre-line">{checkIn.details ? t(checkIn.details.key, { list: formatCheckInList(checkIn.details.sessions, language) }) : checkIn.message}</p>
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
                      className="mt-2 px-3 py-1.5 rounded-lg bg-accent text-accent-on text-2xs font-bold hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      {t('home.doItToday', { name: plan.name })}
                    </button>
                  );
                })()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                for (const s of checkIn.sessions) dismissCheckIn(`missed:${s.date}:${s.name}`);
                toast.info(t('toast.checkinSnoozed'), t('toast.titleSnoozed'));
              }}
              className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
              aria-label={t('home.dismissCheckin')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
        nutrition={uiPreferences.coachEnabled && nutritionSuggestion && nutritionSuggestion.action !== 'hold' && (
        <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary leading-relaxed">
                  {t('home.coachSuggestsKcal', {
                    delta: `${nutritionSuggestion.deltaKcal > 0 ? '+' : ''}${nutritionSuggestion.deltaKcal}`,
                    new: nutritionSuggestion.newCalories.toLocaleString(),
                  })}
                </p>
                <CollapsibleDetails label={t('home.why')}>
                  <p>{renderLocalizedSentence(t, language, nutritionSuggestion.reasonI18n, nutritionSuggestion.reason)}</p>
                  <p className="mt-1">{t('home.medicalDisclaimer')}</p>
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
                    toast.success(t('toast.targetUpdated', { kcal: nutritionSuggestion.newCalories.toLocaleString() }), t('toast.titleCaloriesAdjusted'));
                  }}
                  className="mt-2 py-2 px-4 rounded-xl bg-accent text-accent-on text-xs font-bold active:scale-95 transition-all cursor-pointer"
                >
                  {t('home.applyKcal', { kcal: nutritionSuggestion.newCalories.toLocaleString() })}
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
                toast.info(t('toast.suggestionDismissed'), t('toast.titleDismissed'));
              }}
              className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
              aria-label={t('home.dismissSuggestion')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
        adjustments={uiPreferences.coachEnabled && coachDigest.nextAdjustments.length > 0 && (
        <div className="bg-bg-card border border-border/80 rounded-2xl p-3.5 shadow-xs">
          <span className="text-xs font-medium text-text-muted">{t('home.nextSessionCalls')}</span>
          <div className="mt-2 space-y-2">
            {coachDigest.nextAdjustments.map((adj) => (
              <div key={adj.exercise}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold text-text-primary truncate">{language === 'hi' ? (getExerciseHindiName(adj.exercise) ?? adj.exercise) : adj.exercise}</p>
                  <span className="text-xs font-bold text-text-primary tabular-nums shrink-0">
                    {adj.oldTarget.weight} → {adj.newTarget.weight}
                    {adj.newTarget.unit}
                  </span>
                </div>
                {/* The reasoning is one tap away, never auto-shown. */}
                <CollapsibleDetails label={t('home.why')}>
                  <p>{renderLocalizedSentence(t, language, adj.reasonI18n, adj.reason)}</p>
                </CollapsibleDetails>
              </div>
            ))}
          </div>
        </div>
      )}
      />
        {density === 'detailed' ? (
          <AthleteModelCard />
        ) : (
          <CollapsibleDetails label={t('customize.athleteFacts')}>
            <AthleteModelCard />
          </CollapsibleDetails>
        )}
      </div>
      )}

      {/* ── QUOTE — its own section, last in the Simple default order ── */}
      <div style={{ order: orderOf('quote') }} className={shown('quote') ? undefined : 'hidden'}>
      <div className="text-center pt-1 pb-2">
        <p className="text-xs text-text-muted italic leading-relaxed">&ldquo;{dailyQuote.text}&rdquo;</p>
        <p className="text-2xs text-text-muted mt-1 font-mono">— {dailyQuote.author}</p>
      </div>
      </div>

      {/* ── 4c. WEEKLY REVIEW (PR-C) ─────────────────────────────────────── */}
      <div style={{ order: orderOf('weekly-review-detail') }} className={uiPreferences.coachEnabled && shown('weekly-review-detail') ? undefined : 'hidden'}>
      {uiPreferences.coachEnabled && <CoachWeeklyReviewCard />}

      </div>

      {/* ── 5. QUICK ACTIONS ─────────────────────────────────────────────── */}
      <div style={{ order: orderOf('quick-actions') }} className={shown('quick-actions') ? 'space-y-3' : 'hidden'}>
        <h2 className="section-heading px-1">{t('home.quickActions')}</h2>
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => setIsScanMealModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Camera className="w-4 h-4" />
          </span>
          <span className="text-2xs font-semibold text-text-secondary">{t('home.mealScan')}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsBarcodeModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Barcode className="w-4 h-4" />
          </span>
          <span className="text-2xs font-semibold text-text-secondary">{t('home.scan')}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsWeightModalOpen(true)}
          className="bg-bg-card border border-border/80 rounded-2xl p-3 shadow-xs flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Scale className="w-4 h-4" />
          </span>
          <span className="text-2xs font-semibold text-text-secondary">{t('home.weight')}</span>
        </button>
      </div>

      </div>

      {/* ── 6. HYDRATION QUICK-ADD ───────────────────────────────────────── */}
      <div style={{ order: orderOf('hydration') }} className={shown('hydration') ? undefined : 'hidden'}>
      <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
              <Droplets className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-text-primary">{t('home.hydration')}</p>
              <p className="text-2xs text-text-muted tabular-nums">
                {t('home.hydrationToday', { drank: (todayWaterMl / 1000).toFixed(1), target: (hydrationTargetMl / 1000).toFixed(1) })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                logWater(250);
                toast.success(t('toast.water250'), t('toast.titleHydration'));
              }}
              className="px-3 py-1.5 min-h-[44px] rounded-xl bg-bg-secondary border border-border text-xs font-mono font-bold text-text-primary active:scale-95 transition-all cursor-pointer"
            >
              +250
            </button>
            <button
              type="button"
              onClick={() => {
                logWater(500);
                toast.success(t('toast.water500'), t('toast.titleHydration'));
              }}
              className="px-3 py-1.5 min-h-[44px] rounded-xl bg-bg-secondary border border-border text-xs font-mono font-bold text-text-primary active:scale-95 transition-all cursor-pointer"
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

      </div>


      {/* Streak now lives in the habit-matrix header below (or the slim
          fallback after it when the matrix is hidden) — no standalone
          streak section anymore. */}

      {/* ── 8a2. STEPS (Health Connect, only when synced data exists) ──── */}
      <div style={{ order: orderOf('steps') }} className={stepsVisible && shown('steps') ? undefined : 'hidden'}>
      {healthSummary && healthSummary.date === todayStr && healthSummary.stepsToday > 0 && (
        <div className="bg-bg-card border border-border/80 rounded-2xl px-4 py-3 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Footprints className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-text-primary block">
              {t('health.stepsToday')}
            </span>
            <span className="text-2xs text-text-muted block">Health Connect</span>
          </div>
          <span className="ml-auto text-sm font-black font-mono text-text-primary tabular-nums">
            {healthSummary.stepsToday.toLocaleString()}
          </span>
        </div>
      )}

      </div>

      {/* ── 8b. HABIT MATRIX (one week: Gym / Water / Creatine / Protein) ──── */}
      <div style={{ order: orderOf('habit-matrix') }} className={(uiPreferences.showHabitMatrix || uiPreferences.gamificationEnabled) && shown('habit-matrix') ? undefined : 'hidden'}>
      {uiPreferences.showHabitMatrix && (
      <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-text-primary">{density === 'simple' ? t('home.habitsToday') : t('home.habitsThisWeek')}</span>
          {/* Live-fix L2: Simple shows only today's column (todayOnly),
              so the week-range label would lie — show today's date instead.
              No new i18n string: the date is computed, like the matrix's
              own day header. */}
          <span className="text-2xs font-mono text-text-muted">{density === 'simple' ? new Date().toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', { weekday: 'short', day: 'numeric' }) : t('home.monSun')}</span>
        </div>
        {uiPreferences.gamificationEnabled && (
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <p className="text-xs font-bold text-text-primary">
              {streakInfo.currentStreak > 0
                ? t(streakInfo.currentStreak === 1 ? 'home.streakOne' : 'home.streakMany', { count: streakInfo.currentStreak })
                : t('home.streakStart')}
            </p>
            {streakInfo.currentStreak > 0 && streak.freezesAvailable > 0 && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold text-text-muted ml-auto shrink-0">
                <Snowflake className="w-3.5 h-3.5" aria-hidden="true" />
                {t(streak.freezesAvailable === 1 ? 'home.freezesOne' : 'home.freezesMany', { count: streak.freezesAvailable })}
              </span>
            )}
          </div>
        )}
        {uiPreferences.gamificationEnabled && streakInfo.freezeConsumed && (
          <p className="text-2xs text-text-muted -mt-1 mb-3">
            {t('home.freezeCovered')}
          </p>
        )}
        <WeeklyHabitMatrix
          compact
          todayOnly={density === 'simple'}
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

      {/* Streak fallback: when the habit matrix is hidden, the streak
          still gets its slim one-line row instead of vanishing. */}
      {!uiPreferences.showHabitMatrix && uiPreferences.gamificationEnabled && (
      <div className="bg-bg-card border border-border/80 rounded-2xl px-4 py-3 shadow-xs flex items-center gap-2.5">
        <Flame className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        <p className="text-xs font-bold text-text-primary">
          {streakInfo.currentStreak > 0
            ? t(streakInfo.currentStreak === 1 ? 'home.streakOne' : 'home.streakMany', { count: streakInfo.currentStreak })
            : t('home.streakStart')}
        </p>
        {streakInfo.currentStreak > 0 && streak.freezesAvailable > 0 && (
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-text-muted ml-auto shrink-0">
            <Snowflake className="w-3.5 h-3.5" aria-hidden="true" />
            {t(streak.freezesAvailable === 1 ? 'home.freezesOne' : 'home.freezesMany', { count: streak.freezesAvailable })}
          </span>
        )}
      </div>
      )}

      </div>

      {/* ── 8c. MONTHLY CHALLENGE (opt-in, dismissible) ────────────────────── */}
      <div style={{ order: orderOf('challenge') }} className={uiPreferences.gamificationEnabled && homeChallenge && shown('challenge') ? undefined : 'hidden'}>
      {uiPreferences.gamificationEnabled && homeChallenge && (
        <div
          className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs cursor-pointer hover:border-amber-500/40 transition-colors pressable"
          onClick={() => setIsChallengesSheetOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={t('home.viewChallenges')}
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
                <p className="text-xs font-bold text-text-primary">{homeChallenge.def.titleKey ? t(homeChallenge.def.titleKey) : homeChallenge.def.title}</p>
                <p className="text-2xs text-text-muted mt-0.5 leading-relaxed">{homeChallenge.def.descriptionKey ? t(homeChallenge.def.descriptionKey) : homeChallenge.def.description}</p>
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
                aria-label={t('home.dismissChallenge')}
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
              <p className="text-2xs text-text-muted tabular-nums mt-1.5">
                {homeChallenge.evaluation.progress} of {homeChallenge.evaluation.target} · {homeChallenge.evaluation.pct}%
                {homeChallenge.evaluation.completed ? ` · ${t('chal.complete', { xp: XP_CHALLENGE_COMPLETE })}` : ''}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                optInChallenge(homeChallenge.key);
                toast.success(t('toast.challengeJoined'), t('toast.titleChallengeAccepted'));
              }}
              className="mt-3 py-2 px-4 rounded-xl bg-accent text-accent-on text-xs font-bold active:scale-95 transition-all cursor-pointer"
            >
              {t('home.joinChallenge')}
            </button>
          )}
        </div>
      )}

      </div>

      {/* ── CUSTOMIZE TODAY (UX redesign Stage 3) ── */}
      <div style={{ order: 1000 }}>
        <button
          type="button"
          onClick={() => setIsCustomizeOpen(true)}
          className="btn-secondary w-full"
        >
          {t('customize.today')}
        </button>
      </div>
      <CustomizeSheet
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        sections={[
          { id: 'workout-card', title: t('home.todaysWorkout'), locked: true },
          ...resolvedToday.map((s) => ({ id: s.id, title: sectionTitles[s.id] ?? s.id })),
        ]}
        shown={{ 'workout-card': true, ...Object.fromEntries(resolvedToday.map((s) => [s.id, s.shown])) }}
        onToggle={handleToggleSection}
        onMove={handleMoveSection}
        onRestore={handleRestoreLayout}
      />

      {/* ── NOTIFICATIONS & QUICK SETTINGS MODAL ────────────────────────────── */}
      {isNotificationsOpen && (
        <div ref={notificationsRef} {...notificationsDialogProps} className="modal-overlay" onClick={() => setIsNotificationsOpen(false)}>
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
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/60">
                <p className="font-semibold text-text-primary">{t('home.todaysTraining')}</p>
                <p className="text-text-muted mt-0.5">
                  {t('home.scheduledToday', { name: routineDisplayName, min: durationMinutes })}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/60">
                <p className="font-semibold text-text-primary">{t('home.weeklyTarget')}</p>
                <p className="text-text-muted mt-0.5">
                  {uiPreferences.weeklyTargetDays === 0
                    ? t('home.workoutsWeek', { count: weeklyStats.completedCount })
                    : t('home.workoutsWeekOf', { count: weeklyStats.completedCount, target: uiPreferences.weeklyTargetDays ?? weeklyStats.targetDays })}
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
        <div ref={changeWorkoutRef} {...changeWorkoutDialogProps} className="modal-overlay" onClick={() => setIsChangeWorkoutOpen(false)}>
          <div
            className="modal-content max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0 bg-bg-card">
              <div>
                <h2 className="text-base font-bold text-text-primary">{t('home.changeWorkoutTitle')}</h2>
                <p className="text-2xs text-text-muted">{t('home.changeWorkoutHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsChangeWorkoutOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
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
                    {t('home.availableRoutines')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangeWorkoutOpen(false);
                      onNavigate('workout');
                    }}
                    className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{t('home.managePlans')}</span>
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
                                  <span className="px-1.5 py-0.5 rounded bg-accent text-accent-on text-2xs font-mono font-bold">
                                    {t('home.todaysPlan')}
                                  </span>
                                )}
                              </div>
                              {bodyParts.length > 0 && (
                                <span className="text-2xs text-accent font-medium block mt-0.5">
                                  {bodyParts.map((b) => (BODY_PART_KEY[b] ? t(BODY_PART_KEY[b]) : b)).join(' • ')}
                                </span>
                              )}
                              <span className="text-xs text-text-muted line-clamp-1 mt-0.5">
                                {plan.exercises.map((e) => (language === 'hi' ? (getExerciseHindiName(e.name) ?? e.name) : e.name)).join(', ')}
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
                              {isSelected ? t('home.selectedForToday') : t('home.setAsToday')}
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
                  <p className="text-xs text-text-muted italic py-1">{t('home.noPlans')}</p>
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
                  toast.info(t('toast.restDaySet'), t('toast.titleRestDay'));
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary/60 border border-border/80 hover:border-accent/40 flex items-center justify-between text-left text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <span>{t('home.setRestDay')}</span>
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
          toast.success(t('toast.planSaved', { name: plan.name }), t('toast.titlePlanSaved'));
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
        name={t(levelInfo.nameKey)}
        progress={levelInfo.progress}
        weekXp={weekXp}
      />

      {/* ── CHALLENGES SHEET ───────────────────────────────────────────────── */}
      <ChallengesSheet
        isOpen={isChallengesSheetOpen}
        onClose={() => setIsChallengesSheetOpen(false)}
      />

    </div>
  );
}
