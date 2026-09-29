'use client';

import React, { useMemo, useState } from 'react';
import {
  Trophy,
  Dumbbell,
  UtensilsCrossed,
  ChevronRight,
  Info,
  Scale,
  HardDrive,
  X,
  Play,
  Flame,
  Plus,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Droplet,
  Award,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { getLiftLevel, getOverallLevel } from '@/lib/strength-standards';
import ThemeToggle from '@/components/ui/ThemeToggle';
import RankBadge from '@/components/ui/RankBadge';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import DataVaultModal from '@/components/DataVaultModal';
import LegalHubModal from '@/components/LegalHubModal';
import InstallAppBanner from '@/components/InstallAppBanner';
import { getBigThreeStats, calculateDOTS, getDOTSClassification } from '@/lib/dots';
import DailyEssentialsCard from '@/components/DailyEssentialsCard';
import QuickLogBar from '@/components/QuickLogBar';
import NextBestActionBanner from '@/components/NextBestActionBanner';
import HydrationModal from '@/components/HydrationModal';
import CreatineModal from '@/components/CreatineModal';
import WeeklyConsistencyCard from '@/components/WeeklyConsistencyCard';
import DailyTimelineCard from '@/components/DailyTimelineCard';
import MonthlyAscensionReportModal from '@/components/MonthlyAscensionReportModal';
import { calculateHydrationTarget, formatWaterLiters } from '@/lib/habits';
import { useToast } from '@/components/ui/Toast';

interface HomePageProps {
  onNavigate: (tab: 'home' | 'prs' | 'workout' | 'meals') => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { profile, prs, workouts, plannedWorkouts } = useStore();

  const todayDate = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = todayDate.getFullYear();
    const m = String(todayDate.getMonth() + 1).padStart(2, '0');
    const d = String(todayDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [todayDate]);

  const formattedDate = useMemo(() => {
    return todayDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }, [todayDate]);

  // Today's workout state
  const todayWorkouts = useMemo(() => {
    return workouts.filter((w) => w.date && w.date.startsWith(todayStr));
  }, [workouts, todayStr]);

  const hasTrainedToday = todayWorkouts.length > 0;
  const activePlan = plannedWorkouts?.[0] || null;

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

    const top = lifts.slice(0, 3);
    const overall = getOverallLevel(lifts.map((l) => l.levelInfo));

    return { topLifts: top, overallLevel: overall };
  }, [prs, profile]);

  // Powerlifting Big 3 Stats
  const bigThreeStats = useMemo(() => getBigThreeStats(prs || []), [prs]);

  // DOTS Score calculation
  const dotsScore = useMemo(() => {
    if (!profile || !profile.bodyweightKg || bigThreeStats.totalKg === 0) return 0;
    return calculateDOTS(profile.bodyweightKg, bigThreeStats.totalKg, profile.gender);
  }, [profile, bigThreeStats.totalKg]);

  const dotsClassification = useMemo(() => getDOTSClassification(dotsScore), [dotsScore]);

  // XP / Level progression calculation (Item 6)
  const levelProgress = useMemo(() => {
    if (!overallLevel) {
      return { currentXP: 0, maxXP: 1000, nextLevelXP: 1000, pct: 0, currentRank: 'FOUNDATION' };
    }
    const lvl = overallLevel.level;
    // Each level tier represents 100 XP
    const currentTierXP = (lvl % 10) * 100 + 45;
    const maxTierXP = 1000;
    const pct = Math.min(100, Math.max(8, lvl));
    const nextLevelXP = 1000 - currentTierXP;

    let rank = 'FOUNDATION';
    if (lvl > 95) rank = 'GRANDMASTER';
    else if (lvl > 80) rank = 'MASTER';
    else if (lvl > 65) rank = 'ELITE';
    else if (lvl > 45) rank = 'ADVANCED';
    else if (lvl > 30) rank = 'SKILLED';
    else if (lvl > 15) rank = 'TRAINED';

    return { currentXP: currentTierXP, maxXP: maxTierXP, nextLevelXP, pct, currentRank: rank };
  }, [overallLevel]);

  // Display weight helper
  const displayWeight = (weightKg: number) => {
    if (profile?.unit === 'lbs') {
      return `${Math.round(weightKg * 2.20462)} lbs`;
    }
    return `${Math.round(weightKg)} kg`;
  };

  // Habit store state
  const toast = useToast();
  const waterLogs = useStore((state) => state.waterLogs || {});
  const logWater = useStore((state) => state.logWater);
  const hydrationConfig = useStore((state) => state.hydrationConfig);

  const waterToday = waterLogs[todayStr] || 0;
  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  // Context-aware reminders (Item 6):
  const showPostWorkoutHydrationPrompt = hasTrainedToday && waterToday < waterTargetMl;
  const currentHour = new Date().getHours();
  const showAfternoonHydrationCheck = !hasTrainedToday && currentHour >= 14 && waterToday < 1200;

  // Modals state
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [isBodyMetricsModalOpen, setIsBodyMetricsModalOpen] = useState(false);
  const [isDataVaultModalOpen, setIsDataVaultModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [showDOTSModal, setShowDOTSModal] = useState(false);
  const [showBwRatioInfo, setShowBwRatioInfo] = useState(false);
  const [isHydrationModalOpen, setIsHydrationModalOpen] = useState(false);
  const [isCreatineModalOpen, setIsCreatineModalOpen] = useState(false);
  const [isAscensionReportModalOpen, setIsAscensionReportModalOpen] = useState(false);

  return (
    <div className="page animate-fade-in space-y-4">
      {/* PWA Install Banner */}
      <InstallAppBanner />

      {/* ── 1. IDENTITY HEADER ──────────────────────────────────────────────── */}
      <header className="flex justify-between items-center pt-1 pb-1">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="text-left group transition-transform active:scale-95"
          title="ASCEND - Click to scroll to top"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white shadow-xs shadow-accent/25">
              <Dumbbell className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-text-primary tracking-tight leading-none">
                ASCEND
              </h1>
              <p className="text-xs text-text-secondary font-medium mt-0.5">{formattedDate}</p>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {/* Quick Bodyweight Chip */}
          <button
            type="button"
            onClick={() => setIsBodyMetricsModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-card border border-border text-xs font-semibold text-text-primary hover:border-accent/40 transition-colors shadow-xs"
            title="Update Bodyweight"
          >
            <Scale className="w-3.5 h-3.5 text-accent" />
            <span>
              {profile?.unit === 'lbs'
                ? `${Math.round((profile?.bodyweightKg || 75) * 2.20462)} lbs`
                : `${Math.round(profile?.bodyweightKg || 75)} kg`}
            </span>
          </button>

          {/* Plate Calculator Quick Action */}
          <button
            type="button"
            onClick={() => setIsPlateModalOpen(true)}
            className="btn-circle"
            title="Barbell Plate Calculator"
          >
            <Dumbbell className="w-4 h-4 text-accent" />
          </button>

          <ThemeToggle />
        </div>
      </header>

      {/* ── 5. COMPACT MOTIVATION (Item 5: Compact, not full screen-width card) ── */}
      <div className="px-1 flex items-center justify-between text-xs text-text-secondary font-sans border-l-2 border-accent pl-2.5 py-0.5">
        <p className="font-medium text-text-primary">Build the next version of yourself.</p>
        <span className="text-text-muted text-[11px] hidden sm:inline">• Consistency &gt; intensity</span>
      </div>

      {/* ── CONTEXT-AWARE REMINDERS (Item 6) ── */}
      {showPostWorkoutHydrationPrompt && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between text-xs animate-fade-in shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-500 shrink-0">
              <Droplet className="w-4 h-4 fill-sky-500/30" />
            </div>
            <div>
              <span className="font-bold text-text-primary block leading-tight">
                POST-WORKOUT REHYDRATION
              </span>
              <span className="text-[11px] text-text-secondary mt-0.5 block">
                Workout complete ✓ Water logged: {formatWaterLiters(waterToday)} / {formatWaterLiters(waterTargetMl)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logWater(500, todayStr);
              toast.success('+500 ml logged!', 'Hydration Updated');
            }}
            className="btn-secondary py-1 px-2.5 text-xs font-bold text-sky-600 border-sky-500/40 hover:bg-sky-500/10 shrink-0"
          >
            +500 ML
          </button>
        </div>
      )}

      {showAfternoonHydrationCheck && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs animate-fade-in shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Droplet className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-text-primary block leading-tight">
                HYDRATION CHECK
              </span>
              <span className="text-[11px] text-text-secondary mt-0.5 block">
                You are behind target: {formatWaterLiters(waterToday)} / {formatWaterLiters(waterTargetMl)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logWater(500, todayStr);
              toast.success('+500 ml logged!', 'Hydration Updated');
            }}
            className="btn-secondary py-1 px-2.5 text-xs font-bold text-amber-600 border-amber-500/40 hover:bg-amber-500/10 shrink-0"
          >
            +500 ML
          </button>
        </div>
      )}

      {/* ── NEXT BEST ACTION (Item 11 & 19: High-impact single direction) ── */}
      <NextBestActionBanner
        onNavigateWorkout={() => onNavigate('workout')}
        onNavigateMeals={() => onNavigate('meals')}
        onOpenWeightModal={() => setIsBodyMetricsModalOpen(true)}
        onOpenHydrationModal={() => setIsHydrationModalOpen(true)}
        onOpenCreatineModal={() => setIsCreatineModalOpen(true)}
      />

      {/* ── DAILY ESSENTIALS CHECKLIST (Item 1, 4 & 5: Unified habit OS) ── */}
      <DailyEssentialsCard
        onOpenHydrationModal={() => setIsHydrationModalOpen(true)}
        onOpenCreatineModal={() => setIsCreatineModalOpen(true)}
        onOpenWeightModal={() => setIsBodyMetricsModalOpen(true)}
        onNavigateMeals={() => onNavigate('meals')}
        onNavigateWorkout={() => onNavigate('workout')}
      />

      {/* ── QUICK LOG BAR (Item 8: 1-Tap strip) ── */}
      <QuickLogBar
        onOpenWeightModal={() => setIsBodyMetricsModalOpen(true)}
        onOpenHydrationModal={() => setIsHydrationModalOpen(true)}
        onOpenCreatineModal={() => setIsCreatineModalOpen(true)}
      />

      {/* ── 2. LEVEL & RANK SYSTEM (Item 6: Visually stronger progression) ───── */}
      <section
        onClick={() => onNavigate('prs')}
        className="card p-4 bg-bg-card border border-border hover:border-accent/50 cursor-pointer transition-all duration-150 active:scale-[0.99] select-none"
      >
        <div className="flex items-start justify-between">
          <div>
            <span className="section-title text-[11px] block">STRENGTH RANK</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h2 className="text-2xl font-black text-text-primary tracking-tight font-sans">
                {overallLevel ? overallLevel.title : 'VANGUARD'}
              </h2>
              <span className="text-sm font-bold text-accent">
                LEVEL {overallLevel ? overallLevel.level : 1}
              </span>
            </div>
          </div>
          <RankBadge
            rank={levelProgress.currentRank as any}
            size="sm"
          />
        </div>

        {/* Strong progression visual bar */}
        <div className="mt-3 space-y-1.5">
          <div className="level-bar h-2.5 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="level-bar-fill h-full bg-accent rounded-full transition-all duration-700"
              style={{ width: `${levelProgress.pct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-xs text-text-muted">
            <span className="font-semibold text-text-secondary">
              {overallLevel ? `${overallLevel.averageRatio}× BW Ratio` : 'Calibrating lifts'}
            </span>
            <span className="text-accent font-medium">
              {overallLevel ? `${100 - (overallLevel.level % 100)} to next tier` : 'Log a PR to rank'}
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. TODAY'S MAIN ACTION (Item 4 & Item 9: Solid orange START WORKOUT) ─ */}
      <section className="card p-4 sm:p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/5 border border-border shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="section-title text-[11px] mb-0">TODAY&apos;S TRAINING</span>
          </div>
          {hasTrainedToday && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> Trained Today
            </span>
          )}
        </div>

        <div>
          <h3 className="text-lg font-bold text-text-primary leading-tight">
            {hasTrainedToday
              ? 'Session Complete!'
              : activePlan
              ? activePlan.name
              : 'Ready to Train'}
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {hasTrainedToday
              ? `${todayWorkouts.length} workout logged for today. Rest & recover.`
              : activePlan
              ? `${activePlan.exercises.length} exercises planned • Tap to start`
              : 'Start a blank workout or choose a training plan.'}
          </p>
        </div>

        {/* Prominent Primary Solid Orange Button (Item 3 & Item 9) */}
        <button
          type="button"
          onClick={() => onNavigate('workout')}
          className="btn-primary w-full py-3 text-sm font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all"
        >
          <Play className="w-4 h-4 fill-white stroke-white" />
          <span>{hasTrainedToday ? 'LOG ANOTHER WORKOUT' : 'START WORKOUT'}</span>
        </button>

        {/* Secondary Quick Action Links (Item 9: Clean, lower prominence than Start Workout) */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => onNavigate('meals')}
            className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-accent" />
            <span>Log Meal</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('prs')}
            className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Trophy className="w-3.5 h-3.5 text-accent" />
            <span>Record PR</span>
          </button>
        </div>
      </section>

      {/* ── WEEKLY CONSISTENCY (Item 12: 4 Pillars 7-Day Adherence) ── */}
      <WeeklyConsistencyCard />

      {/* ── 4. KEY STATS SUMMARY (Item 4: 361 kg Big 3 | 1.47× BW | 7 PRs) ───── */}
      <section className="grid grid-cols-3 gap-2.5">
        <div
          onClick={() => onNavigate('prs')}
          className="card p-3 text-center cursor-pointer hover:border-accent/40 transition-colors"
        >
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
            BIG 3 TOTAL
          </span>
          <span className="text-xl font-black text-text-primary mt-1 block">
            {bigThreeStats.totalKg > 0 ? `${bigThreeStats.totalKg}` : '—'}
            <span className="text-xs font-normal text-text-muted ml-0.5">kg</span>
          </span>
        </div>

        <div
          onClick={() => setShowBwRatioInfo(true)}
          className="card p-3 text-center cursor-pointer hover:border-accent/40 transition-colors"
        >
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
            BW RATIO
          </span>
          <span className="text-xl font-black text-text-primary mt-1 block">
            {overallLevel ? `${overallLevel.averageRatio}×` : '—'}
          </span>
        </div>

        <div
          onClick={() => onNavigate('prs')}
          className="card p-3 text-center cursor-pointer hover:border-accent/40 transition-colors"
        >
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
            TOTAL PRS
          </span>
          <span className="text-xl font-black text-accent mt-1 block">
            {prs?.length || 0}
          </span>
        </div>
      </section>

      {/* ── 7. BIG 3 TOTAL BREAKDOWN (Item 7: Clean, strong numbers) ─────────── */}
      {bigThreeStats.totalKg > 0 && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="section-title text-[11px]">POWERLIFTING TOTAL</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-text-primary font-sans">
                  {displayWeight(bigThreeStats.totalKg)}
                </span>
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Personal Best
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('prs')}
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Squat • Bench • Deadlift 3-column pill */}
          <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-bg-secondary text-center text-xs font-sans">
            <div>
              <span className="text-[10px] text-text-muted uppercase font-bold block">Squat</span>
              <span className="font-bold text-text-primary text-sm">
                {bigThreeStats.squatMax > 0 ? displayWeight(bigThreeStats.squatMax) : '—'}
              </span>
            </div>
            <div className="border-l border-border">
              <span className="text-[10px] text-text-muted uppercase font-bold block">Bench</span>
              <span className="font-bold text-text-primary text-sm">
                {bigThreeStats.benchMax > 0 ? displayWeight(bigThreeStats.benchMax) : '—'}
              </span>
            </div>
            <div className="border-l border-border">
              <span className="text-[10px] text-text-muted uppercase font-bold block">Deadlift</span>
              <span className="font-bold text-text-primary text-sm">
                {bigThreeStats.deadliftMax > 0 ? displayWeight(bigThreeStats.deadliftMax) : '—'}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ── 8. IMPROVED DOTS PRESENTATION (Item 8: Clean card with View details →) ─ */}
      <section className="card p-4 flex items-center justify-between bg-bg-card border border-border">
        <div>
          <span className="section-title text-[11px] block">DOTS SCORE</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black text-accent font-sans">
              {dotsScore > 0 ? dotsScore : '—'}
            </span>
            <span className="text-xs font-bold text-text-primary">
              {dotsScore > 0 ? dotsClassification.tier : 'Calibration required'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            {dotsScore > 0
              ? `${dotsClassification.description}`
              : 'Log Squat, Bench & Deadlift to calculate'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowDOTSModal(true)}
          className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 shrink-0 p-1.5 rounded-lg hover:bg-accent/10 transition-colors"
        >
          <span>View details</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* ── 6. MONTHLY HABIT ACTIVITY & ASCENSION REPORT (Item 10 & 14) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="section-title text-[11px] mb-0">MONTHLY PROGRESSION</span>
          <button
            type="button"
            onClick={() => setIsAscensionReportModalOpen(true)}
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 py-0.5"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Ascension Report</span>
          </button>
        </div>
        <WorkoutHeatmap
          onNavigate={onNavigate}
          onOpenHydrationModal={() => setIsHydrationModalOpen(true)}
          onOpenCreatineModal={() => setIsCreatineModalOpen(true)}
        />
      </div>

      {/* ── DAILY TIMELINE (Item 8: Chronological feed) ── */}
      <DailyTimelineCard />

      {/* ── TOP LIFTS SHOWCASE ──────────────────────────────────────────────── */}
      {topLifts.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="section-title text-[11px]">TOP LIFTS</h2>
            <button
              type="button"
              onClick={() => onNavigate('prs')}
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {topLifts.map((lift, idx) => (
              <div
                key={`${lift.exercise}-${idx}`}
                onClick={() => onNavigate('prs')}
                className="card p-3.5 flex items-center justify-between cursor-pointer hover:border-accent/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center font-bold text-xs text-text-primary">
                    {idx + 1}
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-text-primary capitalize block leading-tight">
                      {lift.exercise}
                    </span>
                    <span className="text-xs text-text-muted font-medium mt-0.5 block">
                      LV {lift.levelInfo?.level || 0} • {lift.levelInfo?.rank || 'FOUNDATION'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-text-primary text-base">
                    {displayWeight(lift.oneRepMax)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FOOTER UTILITY ──────────────────────────────────────────────────── */}
      <div className="pt-2 pb-8 flex items-center justify-between text-xs text-text-muted font-sans border-t border-border/60">
        <button
          type="button"
          onClick={() => setIsPrivacyModalOpen(true)}
          className="hover:text-text-primary underline transition-colors"
        >
          Legal &amp; Privacy
        </button>
        <button
          type="button"
          onClick={() => setIsDataVaultModalOpen(true)}
          className="text-accent hover:underline flex items-center gap-1.5 font-semibold"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Data Backup &amp; Reset</span>
        </button>
      </div>

      {/* ── DOTS DETAILS MODAL ──────────────────────────────────────────────── */}
      {showDOTSModal && (
        <div className="modal-overlay" onClick={() => setShowDOTSModal(false)}>
          <div
            className="modal-content p-5 space-y-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-accent">
                <Trophy className="w-5 h-5" />
                <h3 className="font-bold text-base text-text-primary">
                  DOTS Score Breakdown
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDOTSModal(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed font-sans">
              <div className="p-3 rounded-xl bg-bg-secondary text-center space-y-1">
                <span className="text-2xs uppercase text-text-muted font-bold">Official Score</span>
                <p className="text-3xl font-black text-accent">{dotsScore || '—'}</p>
                <p className="text-xs font-bold text-text-primary">{dotsClassification.tier}</p>
                <p className="text-2xs text-text-muted">{dotsClassification.description}</p>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Bodyweight</span>
                  <span className="font-semibold text-text-primary">{profile?.bodyweightKg || 75} kg</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Big 3 Total</span>
                  <span className="font-semibold text-text-primary">{bigThreeStats.totalKg} kg</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Squat 1RM</span>
                  <span className="font-semibold text-text-primary">{bigThreeStats.squatMax} kg</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Bench 1RM</span>
                  <span className="font-semibold text-text-primary">{bigThreeStats.benchMax} kg</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-text-muted">Deadlift 1RM</span>
                  <span className="font-semibold text-text-primary">{bigThreeStats.deadliftMax} kg</span>
                </div>
              </div>

              <p className="text-[11px] text-text-muted pt-1">
                DOTS is the official powerlifting formula that compares strength across different bodyweights and genders.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowDOTSModal(false)}
              className="btn-primary w-full py-2.5 text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Plate Calculator Modal */}
      <PlateCalculatorModal
        isOpen={isPlateModalOpen}
        onClose={() => setIsPlateModalOpen(false)}
        initialUnit={profile?.unit || 'kg'}
      />

      {/* Body Metrics Modal */}
      <BodyMetricsModal
        isOpen={isBodyMetricsModalOpen}
        onClose={() => setIsBodyMetricsModalOpen(false)}
      />

      {/* Data Vault Modal */}
      <DataVaultModal
        isOpen={isDataVaultModalOpen}
        onClose={() => setIsDataVaultModalOpen(false)}
      />

      {/* Legal Hub Modal */}
      <LegalHubModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      {/* BW Ratio Info Modal */}
      {showBwRatioInfo && (
        <div className="modal-overlay" onClick={() => setShowBwRatioInfo(false)}>
          <div
            className="modal-content p-5 space-y-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-accent">
                <Info className="w-5 h-5" />
                <h3 className="font-bold text-base text-text-primary">
                  What is BW Ratio?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBwRatioInfo(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed font-sans">
              <p>
                <strong className="text-text-primary">BW Ratio (Bodyweight Ratio)</strong> measures your pound-for-pound strength relative to your bodyweight.
              </p>
              <div className="p-3 rounded-xl bg-bg-secondary space-y-1.5 text-xs">
                <p>• <strong>0.75× – 1.0×:</strong> Foundation lifter</p>
                <p>• <strong>1.0× – 1.5×:</strong> Skilled / Intermediate</p>
                <p>• <strong>1.5× – 2.0×:</strong> Advanced lifter</p>
                <p>• <strong>2.0×+:</strong> Elite power lifter</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowBwRatioInfo(false)}
              className="btn-primary w-full py-2.5 text-xs font-bold"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Hydration Target Modal */}
      <HydrationModal
        isOpen={isHydrationModalOpen}
        onClose={() => setIsHydrationModalOpen(false)}
      />

      {/* Creatine Tracker & Supply Modal */}
      <CreatineModal
        isOpen={isCreatineModalOpen}
        onClose={() => setIsCreatineModalOpen(false)}
      />

      {/* Monthly Ascension Progression Report Modal */}
      <MonthlyAscensionReportModal
        isOpen={isAscensionReportModalOpen}
        onClose={() => setIsAscensionReportModalOpen(false)}
      />
    </div>
  );
}
