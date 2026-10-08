'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '@/lib/store';
import {
  TrendingUp,
  Dumbbell,
  Trophy,
  Scale,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  BarChart3,
  Flame,
  CheckCircle2,
  Droplet,
  ChevronLeft,
  ChevronRight,
  Bot,
  Layers,
  Award,
  Share2,
  Activity,
  HelpCircle,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { getBigThreeStats, calculateDOTS, getDOTSClassification } from '@/lib/dots';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import PRsPage from '@/components/PRsPage';
import LifterProfileView from '@/components/LifterProfileView';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import ProgressChart from '@/components/ProgressChart';
import BodyweightChart from '@/components/BodyweightChart';
import MuscleVolumeLandmarks from '@/components/MuscleVolumeLandmarks';
import MeetAttemptPlannerModal from '@/components/MeetAttemptPlannerModal';
import WeeklyRecapModal from '@/components/WeeklyRecapModal';
import { plural } from '@/lib/formatters';
import { useAppNavigation } from '@/lib/navigation';

function formatProgressDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = parseInt(m, 10) - 1;
      return `${months[monthIdx] || m} ${parseInt(d, 10)}, ${y}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

interface ProgressPageProps {
  initialTab?: 'overview' | 'strength' | 'prs' | 'bodyweight' | 'training' | 'body' | 'consistency';
  onNavigate?: (tab: 'home' | 'workout' | 'progress' | 'meals' | 'prs') => void;
}

export default function ProgressPage({ initialTab = 'strength', onNavigate }: ProgressPageProps) {
  // Normalize 5 legacy tabs to 3 streamlined tabs: 'strength' | 'body' | 'consistency'
  const resolvedInitialTab = useMemo<'strength' | 'body' | 'consistency'>(() => {
    if (initialTab === 'bodyweight' || initialTab === 'body') return 'body';
    if (initialTab === 'training' || initialTab === 'consistency') return 'consistency';
    return 'strength';
  }, [initialTab]);

  const [activeTab, setActiveTab] = useState<'strength' | 'body' | 'consistency'>(resolvedInitialTab);
  const [strengthSubView, setStrengthSubView] = useState<'overview' | 'twin' | 'prs'>(
    initialTab === 'prs' ? 'prs' : 'overview'
  );

  useEffect(() => {
    if (initialTab === 'bodyweight' || initialTab === 'body') {
      setActiveTab('body');
    } else if (initialTab === 'training' || initialTab === 'consistency') {
      setActiveTab('consistency');
    } else if (initialTab === 'prs') {
      setActiveTab('strength');
      setStrengthSubView('prs');
    } else if (initialTab === 'strength' || initialTab === 'overview') {
      setActiveTab('strength');
    }
  }, [initialTab]);

  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs || []);
  const workouts = useStore((state) => state.workouts || []);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const latestWeeklyReview = useStore((state) => state.latestWeeklyReview);

  const primaryGoal = (profile?.goals?.[0] as string) || 'build_muscle';
  const isPowerlifter = primaryGoal === 'get_stronger';

  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isMeetModalOpen, setIsMeetModalOpen] = useState(false);
  const [isWeeklyRecapOpen, setIsWeeklyRecapOpen] = useState(false);
  const [isDotsInfoOpen, setIsDotsInfoOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();

  // Modal Back Handlers
  useEffect(() => {
    if (isToolsMenuOpen) {
      return registerBackHandler(() => { setIsToolsMenuOpen(false); return true; }, 100);
    }
  }, [isToolsMenuOpen, registerBackHandler]);

  // Sub-view Back Handler: If viewing Lifter Twin or PRs, back returns to overview
  useEffect(() => {
    if (activeTab === 'strength' && strengthSubView !== 'overview') {
      return registerBackHandler(() => {
        setStrengthSubView('overview');
        return true;
      }, 50);
    }
  }, [activeTab, strengthSubView, registerBackHandler]);

  // Modal Back Handlers
  useEffect(() => {
    if (isWeightModalOpen) {
      return registerBackHandler(() => { setIsWeightModalOpen(false); return true; }, 100);
    }
  }, [isWeightModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isMeetModalOpen) {
      return registerBackHandler(() => { setIsMeetModalOpen(false); return true; }, 100);
    }
  }, [isMeetModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isWeeklyRecapOpen) {
      return registerBackHandler(() => { setIsWeeklyRecapOpen(false); return true; }, 100);
    }
  }, [isWeeklyRecapOpen, registerBackHandler]);

  useEffect(() => {
    if (isDotsInfoOpen) {
      return registerBackHandler(() => { setIsDotsInfoOpen(false); return true; }, 100);
    }
  }, [isDotsInfoOpen, registerBackHandler]);

  const userUnit = profile?.unit || 'kg';

  const displayWeight = (kg: number) => {
    if (userUnit === 'lbs') {
      return `${Math.round(kg * 2.20462)} lbs`;
    }
    return `${Math.round(kg * 10) / 10} kg`;
  };

  // ── Big 3 & Powerlifting DOTS ─────────────────────────────────────────────
  const bigThreeStats = useMemo(() => getBigThreeStats(prs), [prs]);
  const dotsScore = useMemo(() => {
    if (!profile || !profile.bodyweightKg || bigThreeStats.totalKg === 0) return 0;
    return calculateDOTS(profile.bodyweightKg, bigThreeStats.totalKg, profile.gender);
  }, [profile, bigThreeStats.totalKg]);
  const dotsClassification = useMemo(() => getDOTSClassification(dotsScore), [dotsScore]);

  // ── Bodyweight 7-Day Moving Average & Trend (Deduplicated per calendar date) ──
  const bodyweightAnalytics = useMemo(() => {
    if (!bodyMetrics || bodyMetrics.length === 0) return null;

    // Deduplicate by calendar date: pick lowest/fasted weight per day
    // to prevent diurnal fluid fluctuations or multiple logs in a single day from skewing moving averages
    const dayMap = new Map<string, (typeof bodyMetrics)[0]>();
    for (const item of bodyMetrics) {
      const existing = dayMap.get(item.date);
      if (!existing || item.weightKg <= existing.weightKg) {
        dayMap.set(item.date, item);
      }
    }

    const dedupedMetrics = Array.from(dayMap.values());
    const sorted = dedupedMetrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recent7 = sorted.slice(0, 7);
    const avgKg = recent7.reduce((sum, b) => sum + b.weightKg, 0) / recent7.length;

    let trendText = '—';
    let trendDelta = 0;
    if (sorted.length >= 3) {
      const older = sorted.slice(2, 9);
      if (older.length > 0) {
        const olderAvg = older.reduce((sum, b) => sum + b.weightKg, 0) / older.length;
        trendDelta = avgKg - olderAvg;
        const convertedDelta = userUnit === 'lbs' ? trendDelta * 2.20462 : trendDelta;
        if (Math.abs(convertedDelta) >= 0.1) {
          trendText = `${convertedDelta > 0 ? '+' : ''}${convertedDelta.toFixed(1)} ${userUnit}/wk`;
        } else {
          trendText = 'Stable';
        }
      }
    }

    return {
      current: sorted[0],
      avgKg,
      trendText,
      trendDelta,
      history: sorted,
      distinctDaysCount: sorted.length,
    };
  }, [bodyMetrics, userUnit]);

  // ── Training Consistency Stats ───────────────────────────────────────────
  const trainingAnalytics = useMemo(() => {
    const totalSessions = workouts.length;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const workoutsThisWeek = workouts.filter((w) => new Date(w.date) >= startOfWeek).length;

    const recentWorkouts = workouts.slice(0, 10);
    const totalSets = recentWorkouts.reduce(
      (sum, w) => sum + w.exercises.reduce((eSum, ex) => eSum + ex.sets.length, 0),
      0
    );

    return {
      totalSessions,
      workoutsThisWeek,
      totalSets,
    };
  }, [workouts]);

  // ── Big 4 Compound Lifts (Short labels, baseline detection) ───────────────
  const liftTrends = useMemo(() => {
    const mainLifts = [
      { key: 'Bench', searchNames: ['bench press', 'bench'] },
      { key: 'Squat', searchNames: ['squat', 'barbell squat'] },
      { key: 'Deadlift', searchNames: ['deadlift', 'barbell deadlift'] },
      { key: 'OHP', searchNames: ['overhead press', 'ohp', 'military press', 'shoulder press'] },
    ];

    return mainLifts.map(({ key, searchNames }) => {
      const matchPRs = prs
        .filter((p) => searchNames.some((s) => p.exercise.toLowerCase().includes(s)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const best1RM = matchPRs.length > 0 ? Math.max(...matchPRs.map((p) => p.oneRepMax)) : 0;
      const latest = matchPRs[0] || null;

      let trend: 'up' | 'stable' | 'none' = 'none';
      if (workouts.length >= 3 && matchPRs.length >= 2) {
        if (matchPRs[0].oneRepMax > matchPRs[1].oneRepMax) trend = 'up';
        else trend = 'stable';
      } else if (best1RM > 0) {
        trend = 'stable';
      }

      return {
        name: key,
        best1RM,
        latest,
        trend,
        isBaseline: workouts.length < 3 && best1RM > 0,
      };
    });
  }, [prs, workouts.length]);

  // ── Streamlined 3 Sub-Tabs ────────────────────────────────────────────────
  const subTabs = [
    {
      id: 'strength',
      label: isPowerlifter
        ? 'Strength & Lifts'
        : primaryGoal === 'build_muscle'
        ? 'Hypertrophy & Lifts'
        : primaryGoal === 'stamina'
        ? 'Conditioning & Lifts'
        : 'Lifts & Trends',
    },
    { id: 'body', label: 'Bodyweight' },
    { id: 'consistency', label: 'Consistency' },
  ] as const;

  return (
    <div className="page animate-fade-in space-y-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              className="p-1.5 -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Go back to previous page"
              title="Go back"
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          )}
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted block">
              TRAINING TRAJECTORY
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight font-display">
              Am I Getting Better?
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsWeeklyRecapOpen(true)}
            className="btn-secondary py-1.5 px-2.5 text-xs font-bold flex items-center gap-1.5 text-text-primary hover:text-accent border-border hover:border-accent/40 transition-colors shadow-xs cursor-pointer"
            title="Generate Weekly Training Card (WhatsApp / Instagram)"
          >
            <Share2 className="w-3.5 h-3.5 text-accent" />
            <span className="text-2xs font-bold hidden sm:inline">Weekly Card</span>
          </button>
          <button
            type="button"
            onClick={() => setIsToolsMenuOpen(true)}
            className="py-1.5 px-2.5 rounded-xl bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Analytics Tools & Actions"
            aria-label="Analytics Tools"
          >
            <SlidersHorizontal className="w-4 h-4 text-accent" />
            <span className="text-2xs font-bold text-text-primary font-mono hidden sm:inline">Tools</span>
          </button>
        </div>
      </header>

      {/* Sub-Navigation (3 clean tabs) */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-2">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all text-center cursor-pointer ${
              activeTab === tab.id
                ? 'bg-accent text-white shadow-xs'
                : 'bg-bg-secondary text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: STRENGTH ───────────────────────────────────────────────── */}
      {activeTab === 'strength' && (
        <div className="space-y-4 animate-fade-in">
          {/* Sub-view selector for Strength */}
          <div className="flex items-center gap-1.5 p-1 bg-bg-secondary rounded-xl border border-border/70">
            <button
              type="button"
              onClick={() => setStrengthSubView('overview')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                strengthSubView === 'overview'
                  ? 'bg-bg-card text-accent shadow-xs border border-accent/20'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Lift Trends
            </button>
            <button
              type="button"
              onClick={() => setStrengthSubView('twin')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                strengthSubView === 'twin'
                  ? 'bg-bg-card text-accent shadow-xs border border-accent/20'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-accent" />
              <span>Lifter Twin</span>
            </button>
            <button
              type="button"
              onClick={() => setStrengthSubView('prs')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                strengthSubView === 'prs'
                  ? 'bg-bg-card text-accent shadow-xs border border-accent/20'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Personal Records
            </button>
          </div>

          {strengthSubView === 'overview' ? (
            <div className="space-y-4">
              {/* Grounded Insight Banner (No fake progress on new accounts) */}
              <div className="card p-3.5 bg-gradient-to-r from-accent/15 via-bg-card to-accent/5 border border-accent/30 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  <span className="text-label font-bold text-accent">
                    {primaryGoal === 'build_muscle'
                      ? 'Hypertrophy Intelligence'
                      : isPowerlifter
                      ? 'Strength Intelligence'
                      : primaryGoal === 'lose_fat'
                      ? 'Body Composition Intelligence'
                      : 'Training Intelligence'}
                  </span>
                </div>
                <p className="text-xs text-text-primary leading-relaxed font-sans">
                  {latestWeeklyReview?.weekSummary ||
                    (primaryGoal === 'build_muscle'
                      ? workouts.length >= 3 && prs.length > 0
                        ? 'Hypertrophy progression verified: weekly muscle volume and progressive overload are tracking well.'
                        : workouts.length > 0
                        ? `${workouts.length} of 3 baseline workouts logged. Complete 3 workouts to establish verified muscle progression trends.`
                        : 'Baseline lifts calibrated. Complete 3 workouts to establish hypertrophy volume and progression trends.'
                      : isPowerlifter
                      ? workouts.length >= 3 && prs.length > 0
                        ? `Your strength profile is calibrated at ${dotsClassification.tier}. Primary compound lifts are advancing with positive progressive overload.`
                        : workouts.length > 0
                        ? `${workouts.length} of 3 baseline workouts logged. Complete 3 workouts to establish verified progressive overload trends.`
                        : 'Baseline 1RM entered. Log at least 3 workouts to unlock progressive overload trends and powerlifting total progression.'
                      : workouts.length >= 3
                      ? 'Progress verified: tracking working weights, consistency, and volume trends.'
                      : `${workouts.length} of 3 baseline workouts logged. Complete 3 workouts to establish verified progression trends.`)}
                </p>
              </div>

              {/* Lifter Twin Callout */}
              <div
                onClick={() => setStrengthSubView('twin')}
                className="card p-3.5 bg-gradient-to-r from-accent/20 via-bg-card to-accent/5 border border-accent/40 space-y-2 shadow-xs cursor-pointer hover:border-accent transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent shrink-0">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors flex items-center gap-1.5">
                        <span>Lifter Twin</span>
                      </h4>
                      <p className="text-2xs text-text-secondary">
                        What ASCEND has learned about your fatigue, recovery &amp; progression
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-accent flex items-center gap-0.5">
                    <span>Inspect</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              {/* ── GOAL-SPECIFIC ADAPTIVE METRICS ── */}

              {/* 1. POWERLIFTING / GET STRONGER: Big 3 & DOTS Score */}
              {isPowerlifter && (
                <>
                  <div className="card p-4 sm:p-5 bg-bg-card border border-border space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="section-title text-[10px] mb-0 font-sans">
                          POWERLIFTING TOTAL
                        </span>
                        <h3 className="text-lg font-bold text-text-primary mt-0.5">Big 3 &amp; Strength Score</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsMeetModalOpen(true)}
                          className="btn-secondary py-1 px-2.5 text-2xs font-semibold flex items-center gap-1 text-text-secondary hover:text-text-primary"
                          title="Powerlifting Meet Attempt Planner"
                        >
                          <Trophy className="w-3 h-3 text-accent" />
                          <span>Meet Planner</span>
                        </button>
                        <div className="text-right">
                          <span className="text-2xl font-black text-text-primary font-sans tabular-nums block">
                            {bigThreeStats.totalKg > 0 ? displayWeight(bigThreeStats.totalKg) : '—'}
                          </span>
                          <span className="text-3xs text-text-muted block">Squat + Bench + Deadlift</span>
                        </div>
                      </div>
                    </div>

                    {/* Strength Score Banner */}
                    <div
                      onClick={() => setIsDotsInfoOpen(true)}
                      className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 flex items-center justify-between cursor-pointer hover:border-accent/40 transition-all group"
                      title="What is DOTS? Tap for explanation"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent font-bold font-mono text-sm group-hover:scale-105 transition-transform">
                          {dotsScore > 0 ? Math.round(dotsScore) : '—'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-text-primary block font-sans group-hover:text-accent transition-colors">
                              Strength Score (DOTS)
                            </span>
                            <HelpCircle className="w-3.5 h-3.5 text-text-muted group-hover:text-accent transition-colors" />
                          </div>
                          <span className="text-2xs text-text-muted">
                            Bodyweight-normalized strength benchmark (tap to learn)
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-accent/10 text-accent font-mono uppercase tracking-wider">
                        {dotsClassification.tier}
                      </span>
                    </div>
                  </div>

                  <ProgressChart />

                  {/* Compound Lifts Snapshot */}
                  <section className="card p-4 space-y-3 bg-bg-card border border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="section-title text-[11px] mb-0 font-sans">COMPOUND LIFTS (1RM)</h4>
                      <span className="text-3xs text-text-muted">
                        {workouts.length < 3 ? 'Baseline calibration' : 'Progressive overload verified'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {liftTrends.map((l) => (
                        <div
                          key={l.name}
                          className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-text-primary truncate">{l.name}</span>
                            {workouts.length >= 3 ? (
                              l.trend === 'up' ? (
                                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-text-muted" />
                              )
                            ) : null}
                          </div>

                          <div className="text-lg font-black text-text-primary font-sans tabular-nums">
                            {l.best1RM > 0 ? displayWeight(l.best1RM) : '—'}
                          </div>

                          <div className="text-3xs text-text-muted font-mono">
                            {profile?.bodyweightKg && l.best1RM > 0 ? (
                              <span>{(l.best1RM / profile.bodyweightKg).toFixed(2)}× BW</span>
                            ) : (
                              <span>Uncalibrated</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {liftTrends.some((l) => l.isBaseline) && (
                      <p className="text-2xs text-text-muted pt-1 border-t border-border/50">
                        * Baseline lifts entered during onboarding (e.g. 80 kg × 5 reps → Est. 1RM: 93.3 kg via Epley formula)
                      </p>
                    )}
                  </section>
                </>
              )}

              {/* 2. GENERAL / HYPERTROPHY / FAT LOSS / STAMINA (Non-Powerlifting Trainees) */}
              {!isPowerlifter && (
                <>
                  {/* Hypertrophy Muscle Volume Landmarks for Build Muscle & General Fitness */}
                  {(primaryGoal === 'build_muscle' || primaryGoal === 'general_fitness') && (
                    <MuscleVolumeLandmarks />
                  )}

                  {/* Lean Tissue Preservation for Fat Loss Trainees */}
                  {primaryGoal === 'lose_fat' && (
                    <div className="card p-4 bg-bg-card border border-border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="section-title text-[10px] mb-0 font-sans">DEFICIT RETENTION MONITOR</span>
                        <span className="text-3xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Lean Mass Preserved
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        In a caloric deficit, your primary indicator of muscle preservation is maintaining compound lift working weights. As long as working sets remain stable, fat loss occurs without lean tissue breakdown.
                      </p>
                    </div>
                  )}

                  {/* Work Capacity & Conditioning for Improve Fitness / Stamina Trainees */}
                  {primaryGoal === 'stamina' && (
                    <div className="card p-4 bg-bg-card border border-border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="section-title text-[10px] mb-0 font-sans">WORK CAPACITY &amp; ENDURANCE</span>
                        <span className="text-3xs font-mono text-accent font-bold bg-accent/10 px-2 py-0.5 rounded-full border border-accent/25">
                          Aerobic Base &amp; Density
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        Tracks training density (short rest efficiency) and aerobic conditioning intervals (Zone 2 cardio and rowing/cycling work capacity).
                      </p>
                    </div>
                  )}

                  {/* Compound Lifts Snapshot */}
                  <section className="card p-4 space-y-3 bg-bg-card border border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="section-title text-[11px] mb-0 font-sans">COMPOUND LIFTS (1RM)</h4>
                      <span className="text-3xs text-text-muted">
                        {workouts.length < 3 ? 'Baseline calibration' : 'Progressive overload verified'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {liftTrends.map((l) => (
                        <div
                          key={l.name}
                          className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-text-primary truncate">{l.name}</span>
                            {workouts.length >= 3 ? (
                              l.trend === 'up' ? (
                                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-text-muted" />
                              )
                            ) : null}
                          </div>

                          <div className="text-lg font-black text-text-primary font-sans tabular-nums">
                            {l.best1RM > 0 ? displayWeight(l.best1RM) : '—'}
                          </div>

                          <div className="text-3xs text-text-muted font-mono">
                            {profile?.bodyweightKg && l.best1RM > 0 ? (
                              <span>{(l.best1RM / profile.bodyweightKg).toFixed(2)}× BW</span>
                            ) : (
                              <span>Uncalibrated</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {liftTrends.some((l) => l.isBaseline) && (
                      <p className="text-2xs text-text-muted pt-1 border-t border-border/50">
                        * Baseline lifts entered during onboarding (e.g. 80 kg × 5 reps → Est. 1RM: 93.3 kg via standard Epley formula)
                      </p>
                    )}
                  </section>

                  {/* Interactive e1RM Strength Trend Line per Lift */}
                  <ProgressChart />
                </>
              )}

              {/* Action to switch to PR details */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setStrengthSubView('prs')}
                  className="btn-secondary py-2.5 px-4 text-xs font-bold inline-flex items-center gap-1.5 w-full justify-center"
                >
                  <Trophy className="w-3.5 h-3.5 text-accent" />
                  <span>View All Personal Records &amp; Milestones &rarr;</span>
                </button>
              </div>
            </div>
          ) : strengthSubView === 'twin' ? (
            <div className="animate-fade-in">
              <LifterProfileView
                onStartWorkoutForExercise={() => {
                  if (onNavigate) onNavigate('workout');
                }}
              />
            </div>
          ) : (
            /* Embedded PRs Page Component */
            <div className="animate-fade-in -mx-4 sm:mx-0">
              <PRsPage onNavigate={(tab) => onNavigate && onNavigate(tab)} />
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: BODY (Bodyweight & Composition) ────────────────────────── */}
      {activeTab === 'body' && (
        <div className="space-y-4 animate-fade-in">
          {bodyMetrics.length === 0 ? (
            <div className="card p-8 bg-bg-card border border-border text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 mx-auto flex items-center justify-center">
                <Scale className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-text-primary font-sans">No Weight Logs Recorded</h3>
                <p className="text-xs text-text-muted max-w-xs mx-auto">
                  Log your daily or weekly morning weight to track your 7-day moving average and bodyweight trends.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWeightModalOpen(true)}
                className="btn-primary py-2.5 px-5 text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-accent/25"
              >
                <Plus className="w-4 h-4" />
                <span>Log Weight</span>
              </button>
            </div>
          ) : (
            <>
              {/* Current & 7-Day Average Card */}
              <section className="card p-4 sm:p-5 bg-bg-card border border-border space-y-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="section-title text-[10px] mb-0 font-sans">BODY MASS ANALYTICS</span>
                    <h3 className="text-lg font-bold text-text-primary mt-0.5">Weight &amp; Composition</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWeightModalOpen(true)}
                    className="btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log Weight</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border space-y-1">
                    <span className="text-label text-text-muted font-bold block">
                      Latest measurement
                    </span>
                    <div className="text-2xl font-black text-text-primary font-sans tabular-nums mt-0.5">
                      {bodyweightAnalytics?.current ? displayWeight(bodyweightAnalytics.current.weightKg) : '—'}
                    </div>
                    <span className="text-3xs text-text-muted">
                      {bodyweightAnalytics?.current ? `Logged ${formatProgressDate(bodyweightAnalytics.current.date)}` : 'No logs yet'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border space-y-1">
                    <span className="text-label text-purple-400 font-bold block">
                      7-day moving avg
                    </span>
                    <div className="text-2xl font-black text-purple-400 font-sans tabular-nums mt-0.5">
                      {bodyweightAnalytics && bodyweightAnalytics.distinctDaysCount >= 3 ? displayWeight(bodyweightAnalytics.avgKg) : 'Calibrating'}
                    </div>
                    <span className="text-3xs text-text-muted">
                      Rate: {bodyweightAnalytics && bodyweightAnalytics.distinctDaysCount >= 3 ? bodyweightAnalytics.trendText : 'Need 3+ days'}
                    </span>
                  </div>
                </div>
              </section>

              {/* 7-Day Average & Daily Weight SVG Trend Chart */}
              <BodyweightChart />

              {/* Historical Logs List */}
              <section className="card p-4 bg-bg-card border border-border space-y-3">
                <h4 className="section-title text-[11px] mb-0 font-sans">RECENT WEIGHT LOGS</h4>
                <div className="divide-y divide-border/60">
                  {[...bodyMetrics]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 15)
                    .map((log) => (
                      <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="text-text-secondary">{formatProgressDate(log.date)}</span>
                        <span className="font-bold text-text-primary tabular-nums">{displayWeight(log.weightKg)}</span>
                      </div>
                    ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* ── TAB 3: CONSISTENCY (Heatmap & Training History) ───────────────── */}
      {activeTab === 'consistency' && (
        <div className="space-y-4 animate-fade-in">
          <div className="card p-4 bg-bg-card border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary">Habit &amp; Workout Matrix</h3>
                <p className="text-2xs text-text-muted">Multi-habit accountability across gym, water, protein, creatine</p>
              </div>
              <span className="text-xs font-bold text-text-secondary tabular-nums">
                {plural(trainingAnalytics.workoutsThisWeek, 'session')} this week
              </span>
            </div>
            <WorkoutHeatmap />
          </div>

          {/* Weekly Social Recap Card Banner */}
          <div className="card p-3.5 bg-gradient-to-r from-accent/15 via-bg-card to-accent/5 border border-accent/30 flex items-center justify-between gap-3 shadow-xs">
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>Weekly WhatsApp / IG Card</span>
              </h4>
              <p className="text-2xs text-text-muted mt-0.5 truncate">
                Export a shareable weekly summary of your tonnage, sessions, and strength metrics.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsWeeklyRecapOpen(true)}
              className="btn-primary py-2 px-3 text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs hover:brightness-105 active:scale-95 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Card</span>
            </button>
          </div>

          {/* Recent Completed Workouts List */}
          <div className="card p-4 bg-bg-card border border-border space-y-3">
            <h4 className="section-title text-[11px] mb-0 font-sans">RECENT COMPLETED WORKOUTS</h4>
            {workouts.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No workouts logged yet.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {workouts.slice(0, 10).map((w) => {
                  const totalSets = w.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
                  const totalTonnage = w.exercises.reduce(
                    (sum, ex) =>
                      sum +
                      ex.sets.reduce((sSum, s) => sSum + (s.weight || 0) * (s.reps || 0), 0),
                    0
                  );
                  const allRpes = w.exercises.flatMap((e) =>
                    e.sets.map((s) => s.rpe).filter((r): r is number => typeof r === 'number')
                  );
                  const avgRpe =
                    allRpes.length > 0
                      ? (allRpes.reduce((a, b) => a + b, 0) / allRpes.length).toFixed(1)
                      : null;

                  return (
                    <div key={w.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0 pr-1">
                        <span className="font-semibold text-text-primary block truncate">
                          {plural(w.exercises.length, 'exercise')} ({w.exercises.map((e) => e.name).slice(0, 2).join(', ')}...)
                        </span>
                        <span className="text-3xs text-text-muted font-mono">{formatProgressDate(w.date)}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-2xs font-medium text-text-secondary tabular-nums block">
                          {plural(totalSets, 'set')}
                          {totalTonnage > 0 && ` • ${Math.round(totalTonnage).toLocaleString()} ${userUnit}`}
                        </span>
                        {avgRpe && (
                          <span className="text-3xs font-mono font-bold text-accent block">
                            Avg @{avgRpe} RPE
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bodyweight Modal */}
      <BodyMetricsModal isOpen={isWeightModalOpen} onClose={() => setIsWeightModalOpen(false)} />

      {/* Powerlifting Meet Attempt Planner Modal */}
      <MeetAttemptPlannerModal isOpen={isMeetModalOpen} onClose={() => setIsMeetModalOpen(false)} />

      {/* Weekly Training Social Recap Card Modal */}
      <WeeklyRecapModal isOpen={isWeeklyRecapOpen} onClose={() => setIsWeeklyRecapOpen(false)} />

      {/* ── What is DOTS? Modal ────────────────────────────────────────── */}
      {isDotsInfoOpen && (
        <div className="modal-overlay" onClick={() => setIsDotsInfoOpen(false)}>
          <div
            className="modal-content max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">What is the DOTS Score?</h3>
                  <p className="text-2xs text-text-muted">Standardized pound-for-pound strength formula</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDotsInfoOpen(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed font-sans">
              <p>
                The <strong>DOTS formula</strong> is the official standard used by the International Powerlifting Federation (IPF). It normalizes strength against bodyweight using a polynomial curve, allowing lifters of different bodyweights and genders to fairly compare strength.
              </p>

              <div className="card p-3 bg-bg-secondary/70 border border-border/80 space-y-1.5">
                <span className="text-2xs font-mono font-bold text-accent uppercase block">
                  ASCEND TIER CLASSIFICATIONS
                </span>
                <div className="space-y-1 text-2xs font-mono">
                  <div className="flex justify-between py-0.5 border-b border-border/40">
                    <span className="text-text-muted">&lt; 250</span>
                    <span className="font-semibold text-text-primary">Novice</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-border/40">
                    <span className="text-text-muted">250 – 349</span>
                    <span className="font-semibold text-text-primary">Intermediate</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-border/40">
                    <span className="text-text-muted">350 – 424</span>
                    <span className="font-semibold text-accent">Advanced</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-border/40">
                    <span className="text-text-muted">425 – 499</span>
                    <span className="font-semibold text-amber-500">Elite</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-text-muted">500+</span>
                    <span className="font-bold text-emerald-500">World Class</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-text-primary text-2xs space-y-1">
                <strong className="text-accent block">How to Improve Your Score:</strong>
                <p>
                  1. Increase your 1RM on the Big 3 (Squat, Bench Press, and Deadlift).
                </p>
                <p>
                  2. Maintain or improve body composition—higher strength at a leaner bodyweight yields a higher DOTS coefficient.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDotsInfoOpen(false)}
              className="w-full btn-primary py-2.5 text-xs font-bold"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Analytics & Progress Tools Drawer / Sheet ── */}
      {isToolsMenuOpen && (
        <div
          className="modal-overlay z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setIsToolsMenuOpen(false)}
        >
          <div
            className="modal-content w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-text-primary text-base">Progress Tools</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsWeeklyRecapOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Weekly Share Card</h4>
                    <p className="text-2xs text-text-muted">Export visual progress card for WhatsApp &amp; Instagram</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsWeightModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Log Bodyweight</h4>
                    <p className="text-2xs text-text-muted">Morning weight check-in &amp; 7-day moving averages</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsMeetModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Meet Attempt Planner</h4>
                    <p className="text-2xs text-text-muted">Plan competition attempts: Opener, 2nd &amp; 3rd lifts</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsDotsInfoOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">DOTS Score &amp; Standards</h4>
                    <p className="text-2xs text-text-muted">
                      {dotsScore > 0 ? `Current: ${dotsScore} (${dotsClassification.tier})` : 'Understand normalized strength tiers'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setActiveTab('strength');
                  setStrengthSubView('twin');
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Lifter Twin Profile</h4>
                    <p className="text-2xs text-text-muted">Inspect fatigue recovery &amp; progression rate</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setActiveTab('strength');
                  setStrengthSubView('prs');
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-bg-card text-text-muted flex items-center justify-center shrink-0 border border-border">
                    <Dumbbell className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Personal Records Ledger</h4>
                    <p className="text-2xs text-text-muted">{prs.length} personal records logged</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
