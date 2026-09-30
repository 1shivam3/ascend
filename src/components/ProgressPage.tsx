'use client';

import React, { useState, useMemo } from 'react';
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
  ChevronRight,
  Bot,
  Layers,
} from 'lucide-react';
import { getBigThreeStats, calculateDOTS, getDOTSClassification } from '@/lib/dots';
import { getLiftLevel, getOverallLevel, calculateOneRepMax } from '@/lib/strength-standards';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import PRsPage from '@/components/PRsPage';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import ThemeToggle from '@/components/ui/ThemeToggle';
import RankBadge from '@/components/ui/RankBadge';

interface ProgressPageProps {
  initialTab?: 'overview' | 'strength' | 'prs' | 'bodyweight' | 'training';
  onNavigate?: (tab: 'home' | 'workout' | 'progress' | 'meals' | 'prs') => void;
}

export default function ProgressPage({ initialTab = 'overview', onNavigate }: ProgressPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'strength' | 'prs' | 'bodyweight' | 'training'>(
    initialTab === 'prs' ? 'prs' : initialTab
  );

  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs || []);
  const workouts = useStore((state) => state.workouts || []);
  const meals = useStore((state) => state.meals || []);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const latestWeeklyReview = useStore((state) => state.latestWeeklyReview);

  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);

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

  // ── Overall Lift Level ────────────────────────────────────────────────────
  const overallLevel = useMemo(() => {
    if (!profile?.bodyweightKg || !prs.length) return null;
    const prsByExercise = new Map();
    for (const pr of prs) {
      const existing = prsByExercise.get(pr.exercise);
      if (!existing || pr.oneRepMax > existing.oneRepMax) {
        prsByExercise.set(pr.exercise, pr);
      }
    }
    const lifts = Array.from(prsByExercise.values()).map((pr) => {
      return getLiftLevel(pr.exercise, pr.oneRepMax, profile.bodyweightKg, profile.gender);
    });
    return getOverallLevel(lifts);
  }, [prs, profile]);

  // ── Bodyweight 7-Day Moving Average & Trend ────────────────────────────────
  const bodyweightAnalytics = useMemo(() => {
    if (!bodyMetrics || bodyMetrics.length === 0) return null;
    const sorted = [...bodyMetrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recent7 = sorted.slice(0, 7);
    const avgKg = recent7.reduce((sum, b) => sum + b.weightKg, 0) / recent7.length;

    let trendText = 'Stable';
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
    };
  }, [bodyMetrics, userUnit]);

  // ── Training Volume & Consistency ─────────────────────────────────────────
  const trainingAnalytics = useMemo(() => {
    const totalSessions = workouts.length;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const workoutsThisWeek = workouts.filter((w) => new Date(w.date) >= startOfWeek).length;

    // Calculate total sets this week
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

  // ── Big 4 Main Compound Lift Trends ───────────────────────────────────────
  const liftTrends = useMemo(() => {
    const mainNames = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press'];
    return mainNames.map((name) => {
      const matchPRs = prs
        .filter((p) => p.exercise.toLowerCase() === name.toLowerCase())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const best1RM = matchPRs.length > 0 ? Math.max(...matchPRs.map((p) => p.oneRepMax)) : 0;
      const latest = matchPRs[0] || null;

      let trend: 'up' | 'stable' | 'none' = 'none';
      if (matchPRs.length >= 2) {
        if (matchPRs[0].oneRepMax > matchPRs[1].oneRepMax) trend = 'up';
        else trend = 'stable';
      } else if (matchPRs.length === 1) {
        trend = 'stable';
      }

      return {
        name,
        best1RM,
        latest,
        trend,
      };
    });
  }, [prs]);

  // ── Render Sub-Tabs ───────────────────────────────────────────────────────
  const subTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'strength', label: 'Strength' },
    { id: 'prs', label: 'PRs & Lifts' },
    { id: 'bodyweight', label: 'Bodyweight' },
    { id: 'training', label: 'Training' },
  ] as const;

  return (
    <div className="page animate-fade-in space-y-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">Progress</h1>
          <p className="text-2xs text-text-muted font-mono">Strength, Body &amp; Training Intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Sub-Navigation Pill Bar */}
      <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b border-border/60">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-accent text-white font-bold shadow-xs'
                : 'bg-bg-secondary text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── TAB 1: OVERVIEW ───────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* AI Progress Insight Banner */}
          <div className="card p-3.5 bg-gradient-to-r from-accent/15 via-bg-card to-accent/5 border border-accent/30 space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-2xs uppercase tracking-wider font-bold text-accent font-mono">
                ASCEND PROGRESS INSIGHT
              </span>
            </div>
            <p className="text-xs text-text-primary leading-relaxed font-sans">
              {latestWeeklyReview?.weekSummary ||
                (prs.length > 0
                  ? `Your strength profile is calibrated at Level ${overallLevel?.level || 30} (${overallLevel?.title || 'Iron Will'}). Primary compound lifts are advancing with positive progressive overload.`
                  : 'Start logging workouts and setting PRs to generate real-time strength trends and progressive overload advice.')}
            </p>
          </div>

          {/* Core Metrics Quad */}
          <div className="grid grid-cols-2 gap-3">
            {/* Big 3 Total */}
            <div
              onClick={() => setActiveTab('strength')}
              className="card p-3.5 bg-bg-card border border-border hover:border-accent/40 cursor-pointer transition-colors space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xs uppercase tracking-wider font-bold text-text-muted font-mono">
                  BIG 3 TOTAL
                </span>
                <Dumbbell className="w-3.5 h-3.5 text-accent" />
              </div>
              <div className="text-xl font-black text-text-primary font-sans">
                {bigThreeStats.totalKg > 0 ? displayWeight(bigThreeStats.totalKg) : '—'}
              </div>
              <p className="text-3xs text-text-muted">
                {dotsScore > 0 ? `${Math.round(dotsScore)} DOTS • ${dotsClassification}` : 'S/B/D sum'}
              </p>
            </div>

            {/* Bodyweight Trend */}
            <div
              onClick={() => setActiveTab('bodyweight')}
              className="card p-3.5 bg-bg-card border border-border hover:border-accent/40 cursor-pointer transition-colors space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xs uppercase tracking-wider font-bold text-text-muted font-mono">
                  7-DAY WEIGHT
                </span>
                <Scale className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-xl font-black text-text-primary font-sans">
                {bodyweightAnalytics ? displayWeight(bodyweightAnalytics.avgKg) : '—'}
              </div>
              <p className="text-3xs text-text-muted">
                {bodyweightAnalytics ? `Rate: ${bodyweightAnalytics.trendText}` : 'Track body mass'}
              </p>
            </div>

            {/* Weekly Training Volume */}
            <div
              onClick={() => setActiveTab('training')}
              className="card p-3.5 bg-bg-card border border-border hover:border-accent/40 cursor-pointer transition-colors space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xs uppercase tracking-wider font-bold text-text-muted font-mono">
                  WORKOUTS
                </span>
                <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="text-xl font-black text-text-primary font-sans">
                {trainingAnalytics.workoutsThisWeek}
                <span className="text-xs font-normal text-text-muted ml-1">this week</span>
              </div>
              <p className="text-3xs text-text-muted">
                {trainingAnalytics.totalSessions} sessions logged
              </p>
            </div>

            {/* Overall Strength Level */}
            <div
              onClick={() => setActiveTab('prs')}
              className="card p-3.5 bg-bg-card border border-border hover:border-accent/40 cursor-pointer transition-colors space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xs uppercase tracking-wider font-bold text-text-muted font-mono">
                  LIFT RANK
                </span>
                <Trophy className="w-3.5 h-3.5 text-accent" />
              </div>
              <div className="text-xl font-black text-accent font-sans">
                {overallLevel ? `LV ${overallLevel.level}` : '—'}
              </div>
              <p className="text-3xs text-text-muted truncate">
                {overallLevel ? overallLevel.title : 'Log PRs to calibrate'}
              </p>
            </div>
          </div>

          {/* Quick Lifts Snapshot */}
          <section className="card p-4 space-y-3 bg-bg-card border border-border">
            <div className="flex items-center justify-between">
              <h3 className="section-title text-[11px] mb-0 font-sans">COMPOUND LIFTS SNAPSHOT</h3>
              <button
                type="button"
                onClick={() => setActiveTab('strength')}
                className="text-xs text-accent font-semibold flex items-center gap-0.5 hover:underline"
              >
                <span>View Charts</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {liftTrends.map((l) => (
                <div key={l.name} className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border/80 space-y-1">
                  <span className="text-3xs text-text-muted font-medium block truncate">{l.name}</span>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-text-primary font-mono">
                      {l.best1RM > 0 ? displayWeight(l.best1RM) : '—'}
                    </span>
                    {l.trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />}
                    {l.trend === 'stable' && <Minus className="w-3 h-3 text-text-muted" />}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Consistency Heatmap */}
          <section className="card p-4 space-y-2 bg-bg-card border border-border">
            <div className="flex items-center justify-between">
              <h3 className="section-title text-[11px] mb-0 font-sans">TRAINING CONSISTENCY</h3>
              <span className="text-2xs text-text-muted font-mono">{workouts.length} total sessions</span>
            </div>
            <WorkoutHeatmap />
          </section>
        </div>
      )}

      {/* ── TAB 2: STRENGTH ───────────────────────────────────────────────── */}
      {activeTab === 'strength' && (
        <div className="space-y-4 animate-fade-in">
          <div className="card p-4 bg-bg-card border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary">Powerlifting Big 3 &amp; Standards</h3>
                <p className="text-2xs text-text-muted">Direct bodyweight ratio calibration</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-accent font-mono">
                  {bigThreeStats.totalKg > 0 ? displayWeight(bigThreeStats.totalKg) : '0 kg'}
                </span>
                <span className="text-3xs text-text-muted block">Big 3 Total</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Squat */}
              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border space-y-1">
                <span className="text-3xs uppercase font-bold text-text-muted font-mono block">SQUAT 1RM</span>
                <div className="text-lg font-black text-text-primary font-mono">
                  {bigThreeStats.squatMax > 0 ? displayWeight(bigThreeStats.squatMax) : '—'}
                </div>
                <p className="text-3xs text-text-secondary">
                  {profile?.bodyweightKg && bigThreeStats.squatMax > 0
                    ? `${(bigThreeStats.squatMax / profile.bodyweightKg).toFixed(2)}× bodyweight`
                    : 'Uncalibrated'}
                </p>
              </div>

              {/* Bench */}
              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border space-y-1">
                <span className="text-3xs uppercase font-bold text-text-muted font-mono block">BENCH PRESS 1RM</span>
                <div className="text-lg font-black text-text-primary font-mono">
                  {bigThreeStats.benchMax > 0 ? displayWeight(bigThreeStats.benchMax) : '—'}
                </div>
                <p className="text-3xs text-text-secondary">
                  {profile?.bodyweightKg && bigThreeStats.benchMax > 0
                    ? `${(bigThreeStats.benchMax / profile.bodyweightKg).toFixed(2)}× bodyweight`
                    : 'Uncalibrated'}
                </p>
              </div>

              {/* Deadlift */}
              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border space-y-1">
                <span className="text-3xs uppercase font-bold text-text-muted font-mono block">DEADLIFT 1RM</span>
                <div className="text-lg font-black text-text-primary font-mono">
                  {bigThreeStats.deadliftMax > 0 ? displayWeight(bigThreeStats.deadliftMax) : '—'}
                </div>
                <p className="text-3xs text-text-secondary">
                  {profile?.bodyweightKg && bigThreeStats.deadliftMax > 0
                    ? `${(bigThreeStats.deadliftMax / profile.bodyweightKg).toFixed(2)}× bodyweight`
                    : 'Uncalibrated'}
                </p>
              </div>
            </div>
          </div>

          {/* DOTS Score Breakdown */}
          <div className="card p-4 bg-bg-card border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent font-bold font-mono">
                {Math.round(dotsScore) || '—'}
              </div>
              <div>
                <span className="text-xs font-bold text-text-primary block font-sans">
                  DOTS Strength Score
                </span>
                <span className="text-2xs text-text-muted">
                  Official bodyweight-normalized powerlifting strength rating
                </span>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-accent/10 text-accent font-mono">
              {dotsClassification.tier}
            </span>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('prs')}
              className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Manage Personal Records &amp; Milestones</span>
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 3: PRS (Personal Records Sub-Page) ─────────────────────────── */}
      {activeTab === 'prs' && (
        <div className="animate-fade-in -mx-4 sm:mx-0">
          <PRsPage onNavigate={(tab) => onNavigate && onNavigate(tab)} />
        </div>
      )}

      {/* ── TAB 4: BODYWEIGHT ─────────────────────────────────────────────── */}
      {activeTab === 'bodyweight' && (
        <div className="space-y-4 animate-fade-in">
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
              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border">
                <span className="text-3xs uppercase font-bold text-text-muted font-mono block">
                  LATEST MEASUREMENT
                </span>
                <div className="text-2xl font-black text-text-primary font-mono mt-0.5">
                  {bodyweightAnalytics?.current ? displayWeight(bodyweightAnalytics.current.weightKg) : '—'}
                </div>
                <span className="text-3xs text-text-muted">
                  {bodyweightAnalytics?.current ? `Logged ${bodyweightAnalytics.current.date}` : 'No logs yet'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border">
                <span className="text-3xs uppercase font-bold text-purple-400 font-mono block">
                  7-DAY MOVING AVG
                </span>
                <div className="text-2xl font-black text-purple-400 font-mono mt-0.5">
                  {bodyweightAnalytics ? displayWeight(bodyweightAnalytics.avgKg) : '—'}
                </div>
                <span className="text-3xs text-text-muted">
                  Trend: {bodyweightAnalytics ? bodyweightAnalytics.trendText : 'Steady'}
                </span>
              </div>
            </div>
          </section>

          {/* Historical Logs List */}
          <section className="card p-4 bg-bg-card border border-border space-y-3">
            <h4 className="section-title text-[11px] mb-0 font-sans">RECENT WEIGHT LOGS</h4>
            {bodyMetrics.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No weight logs recorded yet.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {[...bodyMetrics]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 15)
                  .map((log) => (
                    <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                      <span className="font-mono text-text-secondary">{log.date}</span>
                      <span className="font-mono font-bold text-text-primary">{displayWeight(log.weightKg)}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── TAB 5: TRAINING ───────────────────────────────────────────────── */}
      {activeTab === 'training' && (
        <div className="space-y-4 animate-fade-in">
          <div className="card p-4 bg-bg-card border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary">Training Consistency</h3>
                <p className="text-2xs text-text-muted">Consistency beats intensity across 52 weeks</p>
              </div>
              <span className="text-sm font-bold font-mono text-accent">
                {trainingAnalytics.workoutsThisWeek} sessions this week
              </span>
            </div>
            <WorkoutHeatmap />
          </div>

          {/* Recent Workout Log Summary */}
          <div className="card p-4 bg-bg-card border border-border space-y-3">
            <h4 className="section-title text-[11px] mb-0 font-sans">RECENT COMPLETED WORKOUTS</h4>
            {workouts.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No workouts logged yet.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {workouts.slice(0, 10).map((w) => (
                  <div key={w.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-text-primary block">
                        {w.exercises.length} Exercises ({w.exercises.map((e) => e.name).slice(0, 2).join(', ')}...)
                      </span>
                      <span className="text-3xs text-text-muted font-mono">{w.date}</span>
                    </div>
                    <span className="text-2xs font-mono font-medium text-text-secondary">
                      {w.exercises.reduce((acc, ex) => acc + ex.sets.length, 0)} sets
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bodyweight Modal */}
      <BodyMetricsModal isOpen={isWeightModalOpen} onClose={() => setIsWeightModalOpen(false)} />
    </div>
  );
}
