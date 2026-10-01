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
  Check
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { getLiftLevel, getOverallLevel } from '@/lib/strength-standards';
import ThemeToggle from '@/components/ui/ThemeToggle';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import SettingsModal from '@/components/SettingsModal';
import InstallAppBanner from '@/components/InstallAppBanner';
import { getBigThreeStats, calculateDOTS, getDOTSClassification } from '@/lib/dots';
import ActivityRingsCard from '@/components/ActivityRingsCard';
import QuickLogBar from '@/components/QuickLogBar';
import AICoachCard from '@/components/AICoachCard';
import HydrationModal from '@/components/HydrationModal';
import CreatineModal from '@/components/CreatineModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import HomeActivityHeatmap from '@/components/HomeActivityHeatmap';
import { calculateHydrationTarget, formatWaterLiters, toLocalDateString } from '@/lib/habits';
import { useToast } from '@/components/ui/Toast';
import { PlannedWorkout, PlannedExercise } from '@/lib/types';
import { plural } from '@/lib/formatters';

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

  // Today's workout state
  const todayWorkouts = useMemo(() => {
    return workouts.filter((w) => w.date && w.date.startsWith(todayStr));
  }, [workouts, todayStr]);

  const hasManualGym = !!gymLogs?.[todayStr];
  const hasTrainedToday = hasManualGym || todayWorkouts.length > 0;
  const activePlan = plannedWorkouts?.[0] || null;

  // Actual exercises, volume, and PR summary for today
  const todaySummary = useMemo(() => {
    if (todayWorkouts.length === 0) return null;
    const workout = todayWorkouts[0];
    let volumeKg = 0;
    let totalSets = 0;
    let prCount = 0;
    let durationMin = workout.durationMinutes || 0;

    for (const w of todayWorkouts) {
      if (w.durationMinutes && !durationMin) durationMin = w.durationMinutes;
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (s.reps && s.weight) {
            const wKg = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
            volumeKg += wKg * s.reps;
            totalSets += 1;
          }
          if (s.isPR) prCount++;
        }
      }
    }

    const exercisesList = workout.exercises
      .map((e) => {
        const validSets = e.sets.filter((s) => s.reps > 0);
        if (validSets.length > 0) {
          const bestSet = validSets.reduce((best, cur) => (cur.weight > best.weight ? cur : best), validSets[0]);
          return `${e.name} ${bestSet.weight}${bestSet.unit || 'kg'} × ${bestSet.reps}`;
        }
        return e.name;
      })
      .join(', ');

    return {
      name: workout.name || 'Gym Session Done',
      exercisesList: exercisesList || 'Exercises recorded',
      volumeKg: Math.round(volumeKg),
      totalSets,
      prCount,
      durationMin,
    };
  }, [todayWorkouts]);

  const handleToggleGym = () => {
    const isNowDone = toggleGymToday(todayStr);
    if (isNowDone) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 80]);
      }
      toast.success('Gym session recorded for today! Keep up the momentum.', 'Gym Logged');
    } else {
      toast.info('Gym session un-marked for today.', 'Gym Status Updated');
    }
  };

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

  // Modals state
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
          <p className="text-xs text-text-muted mt-1 font-medium">
            {greeting} • {formattedDate}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Bodyweight Chip */}
          <button
            type="button"
            onClick={() => setIsBodyMetricsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-card border border-border text-xs font-semibold text-text-primary hover:border-accent/40 active:scale-95 transition-all shadow-xs"
            title="Update Bodyweight"
          >
            <Scale className="w-3.5 h-3.5 text-accent" />
            <span>
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

      {/* ── 2. TODAY'S SESSION HERO CARD (Gradient Accent Hero) ───────────── */}
      <section className="card p-4 sm:p-5 bg-radial-at-tr from-accent/20 via-bg-card to-bg-card border border-accent/35 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hasTrainedToday ? 'bg-emerald-500' : 'bg-accent animate-pulse'}`} />
            <span className="text-label font-medium text-text-muted">
              {hasTrainedToday ? 'Today completed' : "Today's session"}
            </span>
          </div>
          <span className="text-label text-text-muted">
            {hasTrainedToday && todaySummary ? `${todaySummary.totalSets} sets` : activePlan ? 'Planned routine' : 'Main strength'}
          </span>
        </div>

        <div>
          <h2 className="text-title sm:text-display font-black text-text-primary tracking-tight font-sans">
            {hasTrainedToday && todaySummary
              ? todaySummary.name
              : hasTrainedToday
              ? 'Gym Session Done'
              : activePlan
              ? activePlan.name
              : 'Upper A'}
          </h2>
          <p className="text-body text-text-secondary mt-0.5 line-clamp-2">
            {hasTrainedToday && todaySummary
              ? todaySummary.exercisesList
              : activePlan
              ? activePlan.exercises.map((e) => e.name).slice(0, 4).join(', ')
              : 'Bench Press, Barbell Row, Overhead Press, Pull-ups'}
          </p>
        </div>

        {/* If trained today with summary stats, show summary pills: volume, duration/sets, PRs */}
        {hasTrainedToday && todaySummary && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-label tabular-nums">
            {todaySummary.volumeKg > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-primary font-semibold">
                {todaySummary.volumeKg.toLocaleString()} kg volume
              </span>
            )}
            {todaySummary.durationMin > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-muted">
                {todaySummary.durationMin} min
              </span>
            ) : todaySummary.totalSets > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-muted">
                {plural(todaySummary.totalSets, 'set')}
              </span>
            ) : null}
            {todaySummary.prCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/40 text-accent font-bold">
                {plural(todaySummary.prCount, 'PR')}
              </span>
            )}
          </div>
        )}

        {/* Action Row: Start Workout + "I Hit Gym Today" 1-Tap Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {/* Main CTA */}
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className={`sm:col-span-2 py-3 text-body font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
              hasTrainedToday
                ? 'btn-secondary text-text-primary'
                : 'btn-primary shadow-md shadow-accent/25 hover:brightness-105'
            }`}
          >
            <Play className={`w-4 h-4 ${hasTrainedToday ? 'fill-text-primary stroke-text-primary' : 'fill-white stroke-white'}`} />
            <span>{activeWorkoutDraft ? 'Continue Workout' : hasTrainedToday ? 'Log another workout' : 'Start Workout'}</span>
          </button>

          {/* 1-Tap "I Hit Gym Today" Quick Toggle */}
          <button
            type="button"
            onClick={handleToggleGym}
            className={`py-3 px-3 rounded-xl border text-label font-bold flex items-center justify-center gap-1.5 transition-all select-none active:scale-95 ${
              hasTrainedToday
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-xs'
               : 'bg-bg-secondary border-border/80 text-text-secondary hover:border-accent hover:text-text-primary'
            }`}
            title="Mark gym session done for today"
          >
            <CheckCircle2 className={`w-4 h-4 ${hasTrainedToday ? 'text-emerald-400' : 'text-text-muted'}`} />
            <span>{hasTrainedToday ? 'Gym Done ✓' : 'I Hit Gym Today'}</span>
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

      {/* ── 3. THREE HABIT RINGS (Training, Protein, Water) ────────────────── */}
      <ActivityRingsCard
        onNavigateWorkout={() => onNavigate('workout')}
        onNavigateMeals={() => onNavigate('meals')}
        onOpenHydrationModal={() => setIsHydrationModalOpen(true)}
        onOpenCreatineModal={() => setIsCreatineModalOpen(true)}
      />

      {/* ── 4. QUICK 1-TAP LOG ROW (High Reachability) ─────────────────────── */}
      <QuickLogBar
        onOpenWeightModal={() => setIsBodyMetricsModalOpen(true)}
        onOpenHydrationModal={() => setIsHydrationModalOpen(true)}
        onOpenCreatineModal={() => setIsCreatineModalOpen(true)}
      />

      {/* ── 5. COACH INSIGHT (Compact 2-Line Summary with Expand) ──────────── */}
      <AICoachCard
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigateWorkout={() => onNavigate('workout')}
      />

      {/* ── 6. ACTIVITY 7-DAY STRIP ──────────── */}
      <HomeActivityHeatmap onNavigateProgress={() => onNavigate('progress')} />

      {/* ── 7. ORGANIZED DISCLOSURE: POWERLIFTING & STRENGTH SNAPSHOT ──────── */}
      <details className="card p-3.5 sm:p-4 bg-bg-card border border-border group transition-all">
        <summary className="cursor-pointer list-none flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            <h3 className="text-label font-bold text-text-primary">
              Strength Snapshot &amp; DOTS Score
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted text-label font-medium tabular-nums">
            {dotsScore > 0 ? (
              <span>{Math.round(dotsScore)} DOTS • {bigThreeStats.totalKg} kg</span>
            ) : (
              <span>View Big 3</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          </div>
        </summary>

        <div className="pt-3 space-y-3 border-t border-border mt-3 text-label">
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

          <div className="flex items-center justify-between text-label text-text-secondary pt-1">
            <span>Official DOTS Classification: <strong className="text-text-primary">{dotsClassification.tier}</strong></span>
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
