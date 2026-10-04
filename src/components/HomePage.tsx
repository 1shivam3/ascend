'use client';

import React, { useMemo, useState } from 'react';
import {
  Trophy,
  Dumbbell,
  UtensilsCrossed,
  ChevronRight,
  Info,
  Scale,
  X,
  Play,
  Flame,
  Plus,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Droplet,
  Award,
  FastForward,
  Settings,
  Calendar,
  Check,
  Target,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { getLiftLevel, getOverallLevel, isMainCompoundLift } from '@/lib/strength-standards';
import { generateTrainingDecision } from '@/lib/lifter-twin';
import TrainingDecisionCard from '@/components/TrainingDecisionCard';
import ThemeToggle from '@/components/ui/ThemeToggle';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import SettingsModal from '@/components/SettingsModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import InstallAppBanner from '@/components/InstallAppBanner';
import { getBigThreeStats, calculateDOTS, getDOTSClassification } from '@/lib/dots';
import ActivityRingsCard from '@/components/ActivityRingsCard';
import AICoachCard from '@/components/AICoachCard';
import HydrationModal from '@/components/HydrationModal';
import CreatineModal from '@/components/CreatineModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import HomeActivityHeatmap from '@/components/HomeActivityHeatmap';
import { calculateHydrationTarget, formatWaterLiters, toLocalDateString } from '@/lib/habits';
import { useToast } from '@/components/ui/Toast';
import { PlannedWorkout, PlannedExercise, AthleteGoal, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import { plural } from '@/lib/formatters';
import { getTodaySessionState } from '@/lib/workout-engine';

interface HomePageProps {
  onNavigate: (tab: 'home' | 'prs' | 'workout' | 'meals' | 'progress') => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const {
    profile,
    prs,
    workouts,
    plannedWorkouts,
    addPlannedWorkout,
    activeWorkoutDraft,
    clearWorkoutDraft,
    gymLogs,
    toggleGymToday,
    goals,
  } = useStore();

  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalDateString(today), [today]);

  const greeting = useMemo(() => {
    const h = today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, [today]);

  const formattedDate = useMemo(() => {
    return today.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
  }, [today]);

  const userUnit = profile?.unit || 'kg';

  // Dynamic synergy / goals label
  const goalSynergyLabel = useMemo(() => {
    const activeGoals = goals || ['get_stronger', 'build_muscle'];
    if (activeGoals.length === 0) return 'Set Goals';
    const isPowerbuilding = activeGoals.includes('get_stronger') && activeGoals.includes('build_muscle');
    const isRecomp = activeGoals.includes('lose_fat') && activeGoals.includes('build_muscle');
    const isAthletic = activeGoals.includes('stamina') && activeGoals.includes('get_stronger');

    if (isPowerbuilding) return '⚡ Powerbuilding';
    if (isRecomp) return '🔥 Recomp';
    if (isAthletic) return '🏃 Hybrid';
    if (activeGoals.length === 1) return ATHLETE_GOAL_CONFIGS[activeGoals[0]]?.label || 'Goal Set';
    return activeGoals.map((g) => ATHLETE_GOAL_CONFIGS[g]?.label || g).join(' + ');
  }, [goals]);

  // Single source of truth for today's workout state
  const sessionInfo = useMemo(() => {
    return getTodaySessionState(
      todayStr,
      workouts,
      plannedWorkouts,
      activeWorkoutDraft,
      userUnit
    );
  }, [todayStr, workouts, plannedWorkouts, activeWorkoutDraft, userUnit]);

  const hasTrainedToday = sessionInfo.isDone;

  // ── Training Decision Ledger (Auditable prescription) ──────────────────────
  const targetExerciseForDecision = useMemo(() => {
    if (sessionInfo.exercises && sessionInfo.exercises.length > 0) {
      const compound = sessionInfo.exercises.find((name) => isMainCompoundLift(name));
      if (compound) return compound;
      return sessionInfo.exercises[0];
    }
    if (workouts.length > 0 && workouts[0].exercises.length > 0) {
      const compound = workouts[0].exercises.find((e) => isMainCompoundLift(e.name));
      if (compound) return compound.name;
      return workouts[0].exercises[0].name;
    }
    return null;
  }, [sessionInfo, workouts]);

  const activeTrainingDecision = useMemo(() => {
    if (!targetExerciseForDecision || workouts.length === 0) return null;
    return generateTrainingDecision(targetExerciseForDecision, workouts, userUnit, 8.0, goals);
  }, [targetExerciseForDecision, workouts, userUnit, goals]);

  // Lifts and Overall Level Calculation
  const { topLifts, overallLevel } = useMemo(() => {
    if (!profile?.bodyweightKg || !profile?.gender || !prs?.length) {
      return { topLifts: [], overallLevel: null };
    }

    const prsByExercise = new Map();
    for (const pr of prs) {
      const existing = prsByExercise.get(pr.exercise);
      if (!existing || pr.oneRepMax > existing.oneRepMax) {
        prsByExercise.set(pr.exercise, pr);
      }
    }

    const lifts = Array.from(prsByExercise.values()).map((pr) => {
      const levelInfo = getLiftLevel(
        pr.exercise,
        pr.oneRepMax,
        profile.bodyweightKg,
        profile.gender
      );
      return {
        ...pr,
        levelInfo,
      };
    });

    lifts.sort((a, b) => (b.levelInfo?.level || 0) - (a.levelInfo?.level || 0));
    return { topLifts: lifts.slice(0, 3), overallLevel: getOverallLevel(lifts.map((l) => l.levelInfo)) };
  }, [prs, profile]);

  // Powerlifting Big 3 Stats & DOTS
  const bigThreeStats = useMemo(() => getBigThreeStats(prs || []), [prs]);
  const dotsScore = useMemo(() => {
    if (!profile || !profile.bodyweightKg || bigThreeStats.totalKg === 0) return 0;
    return calculateDOTS(profile.bodyweightKg, bigThreeStats.totalKg, profile.gender);
  }, [profile, bigThreeStats.totalKg]);
  const dotsClassification = useMemo(() => getDOTSClassification(dotsScore), [dotsScore]);

  // Display weight helper
  const displayWeight = (weightKg: number) => {
    if (profile?.unit === 'lbs') {
      return `${Math.round(weightKg * 2.20462)} lbs`;
    }
    return `${Math.round(weightKg)} kg`;
  };

  const primaryGoal: AthleteGoal = goals?.[0] || 'build_muscle';

  const strengthSectionConfig = useMemo(() => {
    switch (primaryGoal) {
      case 'get_stronger':
        return {
          title: 'Strength Snapshot & DOTS Score',
          pill: dotsScore > 0 ? `${Math.round(dotsScore)} DOTS • ${bigThreeStats.totalKg} kg` : 'Powerlifting Baseline',
        };
      case 'build_muscle':
        return {
          title: 'Hypertrophy Benchmarks & Top Lifts',
          pill: workouts.length > 0 ? `${workouts.length} Sessions Logged` : (topLifts.length > 0 ? `${topLifts.length} Compound Lifts` : 'Top Lifts'),
        };
      case 'lose_fat':
        return {
          title: 'Lean Mass & Strength Retention',
          pill: workouts.length > 0 ? `${workouts.length} Sessions Logged` : 'Preservation Baseline',
        };
      case 'stamina':
        return {
          title: 'Work Capacity & Strength Standards',
          pill: workouts.length > 0 ? `${workouts.length} Sessions Logged` : 'Work Capacity',
        };
      case 'general_fitness':
      default:
        return {
          title: 'Strength & Fitness Standards',
          pill: workouts.length > 0 ? `${workouts.length} Sessions Logged` : 'Fitness Baseline',
        };
    }
  }, [primaryGoal, dotsScore, bigThreeStats.totalKg, workouts.length, topLifts.length]);

  // Modals state
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [isBodyMetricsModalOpen, setIsBodyMetricsModalOpen] = useState(false);
  const [isHydrationModalOpen, setIsHydrationModalOpen] = useState(false);
  const [isCreatineModalOpen, setIsCreatineModalOpen] = useState(false);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);
  const [showDOTSModal, setShowDOTSModal] = useState(false);

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
    <div className="page animate-fade-in space-y-3.5 pb-24">
      <InstallAppBanner />

      {/* ── 1. IDENTITY TOP BAR (Inspired by Prototype) ───────────────────── */}
      <header className="flex justify-between items-center pt-1 pb-1">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-wider font-sans leading-none">
            ASCEND
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-text-muted font-medium">
              {greeting} • {formattedDate}
            </span>
            <button
              type="button"
              onClick={() => setIsGoalSelectorOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25 hover:border-accent/50 text-accent text-3xs font-semibold tracking-wide transition-all active:scale-95 cursor-pointer"
              title="Click to customize active goals"
            >
              <Target className="w-2.5 h-2.5" />
              <span>{goalSynergyLabel}</span>
              <ChevronRight className="w-2.5 h-2.5 opacity-60" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Bodyweight Chip */}
          <button
            type="button"
            onClick={() => setIsBodyMetricsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-card border border-border text-xs font-semibold text-text-primary hover:border-accent/40 active:scale-95 transition-all shadow-xs whitespace-nowrap shrink-0"
            title="Update Bodyweight"
          >
            <Scale className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="whitespace-nowrap">
              {profile?.unit === 'lbs'
                ? `${Math.round((profile?.bodyweightKg || 72) * 2.20462)} lbs`
                : `${Math.round(profile?.bodyweightKg || 72)} kg`}
            </span>
          </button>

          {/* Barbell Plate Calculator */}
          <button
            type="button"
            onClick={() => setIsPlateModalOpen(true)}
            className="w-8 h-8 rounded-full bg-bg-card border border-border flex items-center justify-center text-accent hover:border-accent/40 active:scale-95 transition-all"
            title="Plate Calculator"
          >
            <Dumbbell className="w-4 h-4" />
          </button>

          <ThemeToggle />

          {/* Settings */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="w-8 h-8 rounded-full bg-bg-card border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-accent/40 active:scale-95 transition-all"
            title="Settings & Data Vault"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── ACTIVE WORKOUT DRAFT BANNER (If in progress) ── */}
      {activeWorkoutDraft && (
        <div className="card p-3 bg-gradient-to-r from-accent/20 via-bg-card to-accent/10 border border-accent/40 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shrink-0">
              <FastForward className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-text-primary block font-sans">
                WORKOUT IN PROGRESS
              </span>
              <span className="text-2xs text-text-secondary">
                {activeWorkoutDraft.startedFromPlan ? `${activeWorkoutDraft.startedFromPlan} • ` : ''}
                {activeWorkoutDraft.exercises.filter((e) => e.name.trim()).length} exercises saved
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                clearWorkoutDraft();
                toast.info('Workout draft discarded.', 'Draft Cleared');
              }}
              className="text-xs text-text-muted hover:text-danger px-2 py-1"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => onNavigate('workout')}
              className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Resume</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 2. TODAY'S SESSION HERO CARD (Single Source of Truth) ───────────── */}
      <section className="card p-4 sm:p-5 bg-radial-at-tr from-accent/20 via-bg-card to-bg-card border border-accent/35 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                sessionInfo.status === 'completed'
                  ? 'bg-emerald-500'
                  : sessionInfo.status === 'in_progress'
                  ? 'bg-accent animate-pulse'
                  : sessionInfo.status === 'planned'
                  ? 'bg-accent'
                  : 'bg-text-muted'
              }`}
            />
            <span className="text-label font-medium text-text-muted">
              {sessionInfo.status === 'completed'
                ? 'Today completed'
                : sessionInfo.status === 'in_progress'
                ? 'Workout in progress'
                : sessionInfo.status === 'planned'
                ? "Today's planned routine"
                : "Today's session"}
            </span>
          </div>
          <span className="text-label text-text-muted">
            {sessionInfo.status === 'completed' && sessionInfo.totalSets
              ? plural(sessionInfo.totalSets, 'set')
              : sessionInfo.status === 'planned'
              ? `${plural(sessionInfo.exercises.length, 'exercise')} ready`
              : sessionInfo.status === 'in_progress'
              ? 'Draft active'
              : 'Main strength'}
          </span>
        </div>

        <div>
          <h2 className="text-title sm:text-display font-black text-text-primary tracking-tight font-sans">
            {sessionInfo.title}
          </h2>
          <p className="text-body text-text-secondary mt-0.5 line-clamp-2">
            {sessionInfo.subtitle}
          </p>
        </div>

        {/* If completed today, show verified summary metrics: volume, duration/sets */}
        {sessionInfo.status === 'completed' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-label tabular-nums">
            {sessionInfo.volumeKg && sessionInfo.volumeKg > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-primary font-semibold">
                {sessionInfo.volumeKg.toLocaleString()} kg volume
              </span>
            ) : null}
            {sessionInfo.durationMin && sessionInfo.durationMin > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-muted">
                {sessionInfo.durationMin} min
              </span>
            ) : sessionInfo.totalSets && sessionInfo.totalSets > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-muted">
                {plural(sessionInfo.totalSets, 'set')}
              </span>
            ) : null}
          </div>
        )}

        {/* Load hint for planned workout if available */}
        {sessionInfo.status === 'planned' && sessionInfo.firstExerciseLoadHint && (
          <div className="pt-0.5">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-2xs font-mono text-text-secondary">
              {sessionInfo.firstExerciseLoadHint}
            </span>
          </div>
        )}

        {/* Action Row */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className={`w-full py-3 text-body font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
              sessionInfo.status === 'completed'
                ? 'btn-secondary text-text-primary hover:border-accent/40'
                : 'btn-primary shadow-md shadow-accent/25 hover:brightness-105'
            }`}
          >
            <Play
              className={`w-4 h-4 ${
                sessionInfo.status === 'completed'
                  ? 'fill-text-primary stroke-text-primary'
                  : 'fill-white stroke-white'
              }`}
            />
            <span>{sessionInfo.primaryActionLabel}</span>
          </button>
        </div>

        {/* Suggest / Split Entry point */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50 text-label">
          <span className="text-text-muted">Want to target multiple body parts or switch split?</span>
          <button
            type="button"
            onClick={() => setIsSuggestedModalOpen(true)}
            className="font-bold text-accent hover:underline flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate Plan</span>
          </button>
        </div>
      </section>

      {/* ── TODAY'S TRAINING DECISION (Auditable Prescription) ─────────────── */}
      {activeTrainingDecision && activeTrainingDecision.evidenceCount >= 1 && (
        <section className="space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-3xs font-mono uppercase font-bold tracking-wider text-accent">
                Today&apos;s Training Decision
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('progress')}
              className="text-3xs font-mono text-text-muted hover:text-accent flex items-center gap-1 transition-colors"
            >
              <span>Audit Ledger &rarr;</span>
            </button>
          </div>

          <TrainingDecisionCard
            decision={activeTrainingDecision}
            userUnit={userUnit}
          />
        </section>
      )}

      {/* ── 3. THREE HABIT RINGS (Training, Protein, Water) ────────────────── */}
      <ActivityRingsCard
        onNavigateWorkout={() => onNavigate('workout')}
        onNavigateMeals={() => onNavigate('meals')}
        onOpenHydrationModal={() => setIsHydrationModalOpen(true)}
        onOpenCreatineModal={() => setIsCreatineModalOpen(true)}
      />

      {/* ── 4. COACH INSIGHT (Compact 2-Line Summary with Expand) ──────────── */}
      <AICoachCard
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigateWorkout={() => onNavigate('workout')}
      />

      {/* ── 6. ACTIVITY 7-DAY STRIP ──────────── */}
      <HomeActivityHeatmap onNavigateProgress={() => onNavigate('progress')} />

      {/* ── 7. ORGANIZED DISCLOSURE: GOAL-ADAPTIVE STRENGTH & BENCHMARKS SNAPSHOT ──────── */}
      <details className="card p-3.5 sm:p-4 bg-bg-card border border-border group transition-all">
        <summary className="cursor-pointer list-none flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            <h3 className="text-label font-bold text-text-primary">
              {strengthSectionConfig.title}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted text-label font-medium tabular-nums">
            <span>{strengthSectionConfig.pill}</span>
            <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          </div>
        </summary>

        <div className="pt-3 space-y-3.5 border-t border-border mt-3 text-label">
          {/* Top Lifts (If available) */}
          {topLifts.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-3xs font-mono uppercase tracking-wider text-text-muted font-bold block">
                Top Strength &amp; Rank Tiers
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {topLifts.map((lift) => (
                  <div
                    key={lift.exercise}
                    className="p-2.5 rounded-xl bg-bg-secondary border border-border/80 flex items-center justify-between sm:flex-col sm:items-start gap-1"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-text-primary block truncate max-w-[150px]">
                        {lift.exercise}
                      </span>
                      <span className="text-3xs font-mono text-accent">
                        Lvl {lift.levelInfo?.level || 1} • {lift.levelInfo?.category || 'Initiate'}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-text-primary shrink-0">
                      {displayWeight(lift.oneRepMax)} 1RM
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Powerlifting Big 3 & DOTS */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between">
              <span className="text-3xs font-mono uppercase tracking-wider text-text-muted font-bold block">
                Powerlifting Big 3 &amp; DOTS Score
              </span>
              {dotsScore > 0 && (
                <span className="text-3xs font-mono text-text-muted">
                  DOTS: <strong className="text-accent">{Math.round(dotsScore)}</strong> ({dotsClassification.tier})
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-bg-secondary text-center font-sans">
              <div>
                <span className="text-label text-text-muted block">Bench</span>
                <span className="font-bold text-text-primary text-body mt-0.5 block tabular-nums">
                  {bigThreeStats.benchMax > 0 ? displayWeight(bigThreeStats.benchMax) : '—'}
                </span>
              </div>
              <div className="border-l border-border">
                <span className="text-label text-text-muted block">Squat</span>
                <span className="font-bold text-text-primary text-body mt-0.5 block tabular-nums">
                  {bigThreeStats.squatMax > 0 ? displayWeight(bigThreeStats.squatMax) : '—'}
                </span>
              </div>
              <div className="border-l border-border">
                <span className="text-label text-text-muted block">Deadlift</span>
                <span className="font-bold text-text-primary text-body mt-0.5 block tabular-nums">
                  {bigThreeStats.deadliftMax > 0 ? displayWeight(bigThreeStats.deadliftMax) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Summary Footer */}
          <div className="flex items-center justify-between text-label text-text-secondary pt-1">
            <span>
              Total: <strong className="text-text-primary">{bigThreeStats.totalKg > 0 ? displayWeight(bigThreeStats.totalKg) : '—'}</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('progress')}
              className="text-text-muted hover:text-accent font-semibold hover:underline"
            >
              Full Progress Charts &rarr;
            </button>
          </div>
        </div>
      </details>

      {/* ── MODALS ── */}
      <GoalSelectorModal
        isOpen={isGoalSelectorOpen}
        onClose={() => setIsGoalSelectorOpen(false)}
      />

      <PlateCalculatorModal
        isOpen={isPlateModalOpen}
        onClose={() => setIsPlateModalOpen(false)}
        initialUnit={profile?.unit || 'kg'}
      />

      <BodyMetricsModal
        isOpen={isBodyMetricsModalOpen}
        onClose={() => setIsBodyMetricsModalOpen(false)}
      />

      <HydrationModal
        isOpen={isHydrationModalOpen}
        onClose={() => setIsHydrationModalOpen(false)}
      />

      <CreatineModal
        isOpen={isCreatineModalOpen}
        onClose={() => setIsCreatineModalOpen(false)}
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
