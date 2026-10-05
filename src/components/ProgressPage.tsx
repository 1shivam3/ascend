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
  Award,
  Share2,
  Activity,
} from 'lucide-react';
import { getBigThreeStats, calculateDOTS, getDOTSClassification } from '@/lib/dots';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import PRsPage from '@/components/PRsPage';
import LifterProfileView from '@/components/LifterProfileView';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import ProgressChart from '@/components/ProgressChart';
import BodyweightChart from '@/components/BodyweightChart';
import MeetAttemptPlannerModal from '@/components/MeetAttemptPlannerModal';
import WeeklyRecapModal from '@/components/WeeklyRecapModal';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { plural } from '@/lib/formatters';

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
  const [strengthSubView, setStrengthSubView] = useState<'overview' | 'twin' | 'prs'>('overview');

  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs || []);
  const workouts = useStore((state) => state.workouts || []);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const latestWeeklyReview = useStore((state) => state.latestWeeklyReview);

  const isPowerlifter = (profile?.goals?.[0] === 'get_stronger') || profile?.goals?.includes('get_stronger');

  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isMeetModalOpen, setIsMeetModalOpen] = useState(false);
  const [isWeeklyRecapOpen, setIsWeeklyRecapOpen] = useState(false);

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

  // ── Bodyweight 7-Day Moving Average & Trend ────────────────────────────────
  const bodyweightAnalytics = useMemo(() => {
    if (!bodyMetrics || bodyMetrics.length === 0) return null;
    const sorted = [...bodyMetrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
    { id: 'strength', label: 'Strength' },
    { id: 'body', label: 'Body' },
    { id: 'consistency', label: 'Consistency' },
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
          <button
            type="button"
            onClick={() => setIsWeeklyRecapOpen(true)}
            className="btn-secondary py-1.5 px-2.5 text-xs font-bold flex items-center gap-1.5 text-text-primary hover:text-accent border-border hover:border-accent/40 transition-colors shadow-xs"
            title="Generate Weekly Training Card (WhatsApp / Instagram)"
          >
            <Share2 className="w-3.5 h-3.5 text-accent" />
            <span className="text-2xs font-bold hidden sm:inline">Weekly Card</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Sub-Navigation Pill Bar (3 clean tabs) */}
      <nav className="flex items-center gap-2 border-b border-border/60 pb-2">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all text-center ${
              activeTab === tab.id
                ? 'bg-accent text-white shadow-xs'
                : 'bg-bg-secondary text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── TAB 1: STRENGTH ───────────────────────────────────────────────── */}
      {activeTab === 'strength' && (
        <div className="space-y-4 animate-fade-in">
          {/* Sub-view selector for Strength */}
          <div className="flex items-center gap-1.5 p-1 bg-bg-secondary rounded-xl border border-border/70">
            <button
              type="button"
              onClick={() => setStrengthSubView('overview')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center ${
                strengthSubView === 'overview'
                  ? 'bg-bg-card text-accent shadow-xs border border-accent/20'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setStrengthSubView('twin')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
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
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center ${
                strengthSubView === 'prs'
                  ? 'bg-bg-card text-accent shadow-xs border border-accent/20'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              PRs &amp; Ranks
            </button>
          </div>

          {strengthSubView === 'overview' ? (
            <div className="space-y-4">
              {/* Grounded Insight Banner (No fake progress on new accounts) */}
              <div className="card p-3.5 bg-gradient-to-r from-accent/15 via-bg-card to-accent/5 border border-accent/30 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  <span className="text-label font-bold text-accent">
                    Strength Intelligence
                  </span>
                </div>
                <p className="text-xs text-text-primary leading-relaxed font-sans">
                  {latestWeeklyReview?.weekSummary ||
                    (workouts.length >= 3 && prs.length > 0
                      ? `Your strength profile is calibrated at ${dotsClassification.tier}. Primary compound lifts are advancing with positive progressive overload.`
                      : workouts.length > 0
                      ? `${workouts.length} of 3 baseline workouts logged. Complete 3 workouts to establish verified progressive overload trends.`
                      : 'Baseline 1RM entered. Log at least 3 workouts to unlock progressive overload trends and DOTS rating progression.')}
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

              {/* Big 4 Compound Lifts Snapshot (Leads for Hypertrophy / Build Muscle) */}
              {!isPowerlifter && (
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
                      * Values based on baseline 1RM entered during onboarding
                    </p>
                  )}
                </section>
              )}

              {/* Interactive e1RM Strength Trend Line per Lift */}
              {!isPowerlifter && <ProgressChart />}

              {/* Big 3 Total & Official DOTS Rating Card */}
              <div className="card p-4 sm:p-5 bg-bg-card border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="section-title text-[10px] mb-0 font-sans">
                      {isPowerlifter ? 'POWERLIFTING TOTAL' : 'STRENGTH BENCHMARKS'}
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
                <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent font-bold font-mono text-sm">
                      {dotsScore > 0 ? Math.round(dotsScore) : '—'}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-text-primary block font-sans">
                        Strength Score (DOTS)
                      </span>
                      <span className="text-2xs text-text-muted">
                        Bodyweight-normalized strength benchmark
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-accent/10 text-accent font-mono uppercase tracking-wider">
                    {dotsClassification.tier}
                  </span>
                </div>
              </div>

              {/* Powerlifting layout shows Compound Lifts & Chart below Big 3 */}
              {isPowerlifter && (
                <>
                  <ProgressChart />

                  {/* Big 4 Compound Lifts Snapshot (Short Labels: Bench, Squat, Deadlift, OHP) */}
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
                        * Values based on baseline 1RM entered during onboarding
                      </p>
                    )}
                  </section>
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
                      {bodyweightAnalytics && bodyMetrics.length >= 3 ? displayWeight(bodyweightAnalytics.avgKg) : 'Calibrating'}
                    </div>
                    <span className="text-3xs text-text-muted">
                      Rate: {bodyweightAnalytics && bodyMetrics.length >= 3 ? bodyweightAnalytics.trendText : 'Need 3+ logs'}
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
    </div>
  );
}
