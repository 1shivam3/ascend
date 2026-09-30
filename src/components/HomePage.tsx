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
            <span className="text-2xs font-mono uppercase font-bold text-text-muted tracking-wider">
              {hasTrainedToday ? 'TODAY COMPLETED' : "TODAY'S SESSION"}
            </span>
          </div>
          <span className="text-2xs font-mono text-accent font-semibold">
            {activePlan ? 'PLANNED ROUTINE' : 'MAIN STRENGTH'}
          </span>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight font-sans">
            {activePlan ? activePlan.name : workouts.length === 0 ? 'Upper A' : hasTrainedToday ? 'Gym Session Done' : 'Upper A'}
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {activePlan
              ? activePlan.exercises.map((e) => e.name).slice(0, 4).join(', ')
              : 'Bench Press, Barbell Row, Overhead Press, Pull-ups'}
          </p>
        </div>

        {/* Action Row: Start Workout + "I Hit Gym Today" 1-Tap Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {/* Main CTA */}
          <button
            type="button"
            onClick={() => onNavigate('workout')}
            className="btn-primary sm:col-span-2 py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all"
          >
            <Play className="w-4 h-4 fill-white stroke-white" />
            <span>{activeWorkoutDraft ? 'CONTINUE WORKOUT' : hasTrainedToday ? 'LOG ANOTHER WORKOUT' : 'START WORKOUT'}</span>
          </button>

          {/* 1-Tap "I Hit Gym Today" Quick Toggle */}
          <button
            type="button"
            onClick={handleToggleGym}
            className={`py-3 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all select-none active:scale-95 ${
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
        <div className="flex items-center justify-between pt-1 border-t border-border/50 text-2xs">
          <span className="text-text-muted">Want to target multiple body parts or switch split?</span>
          <button
            type="button"
            onClick={() => setIsSuggestedModalOpen(true)}
            className="font-bold text-accent hover:underline flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            <span>⚡ Generate Plan</span>
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

      {/* ── 5. ACTIVITY HEATMAP CALENDAR (Visual Monthly Heatmap) ──────────── */}
      <HomeActivityHeatmap />

      {/* ── 6. COACH INSIGHT (Compact 2-Line Summary with Expand) ──────────── */}
      <AICoachCard
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigateWorkout={() => onNavigate('workout')}
      />

      {/* ── 7. ORGANIZED DISCLOSURE: POWERLIFTING & STRENGTH SNAPSHOT ──────── */}
      <details className="card p-3.5 sm:p-4 bg-bg-card border border-border group transition-all">
        <summary className="cursor-pointer list-none flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">
              Strength Snapshot &amp; DOTS Score
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-accent text-xs font-bold">
            {dotsScore > 0 ? (
              <span>{Math.round(dotsScore)} DOTS • {bigThreeStats.totalKg} kg</span>
            ) : (
              <span>View Big 3</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          </div>
        </summary>

        <div className="pt-3 space-y-3 border-t border-border mt-3 text-xs">
          <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-bg-secondary text-center font-sans">
            <div>
              <span className="text-[10px] text-text-muted uppercase font-bold block">Bench</span>
              <span className="font-bold text-text-primary text-sm mt-0.5 block font-mono">
                {bigThreeStats.benchMax > 0 ? displayWeight(bigThreeStats.benchMax) : '—'}
              </span>
            </div>
            <div className="border-l border-border">
              <span className="text-[10px] text-text-muted uppercase font-bold block">Squat</span>
              <span className="font-bold text-text-primary text-sm mt-0.5 block font-mono">
                {bigThreeStats.squatMax > 0 ? displayWeight(bigThreeStats.squatMax) : '—'}
              </span>
            </div>
            <div className="border-l border-border">
              <span className="text-[10px] text-text-muted uppercase font-bold block">Deadlift</span>
              <span className="font-bold text-text-primary text-sm mt-0.5 block font-mono">
                {bigThreeStats.deadliftMax > 0 ? displayWeight(bigThreeStats.deadliftMax) : '—'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-2xs font-mono text-text-secondary pt-1">
            <span>Official DOTS Classification: <strong>{dotsClassification.tier}</strong></span>
            <button
              type="button"
              onClick={() => onNavigate('progress')}
              className="text-accent font-bold hover:underline"
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
