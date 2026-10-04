'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { calculateOneRepMax } from '@/lib/strength-standards';
import { getExerciseHistorySessions } from '@/lib/lifter-twin';

const PRIMARY_EXERCISES = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];

type Timeframe = '30d' | '3m' | 'all';
type MetricMode = 'e1rm' | 'volume';

export default function ProgressChart() {
  const { prs, profile, workouts } = useStore();
  const userUnit = profile?.unit || 'kg';

  // Find all distinct exercises that have PRs or logged workout sessions
  const availableExercises = useMemo(() => {
    const set = new Set<string>();
    prs.forEach((pr) => {
      if (pr.exercise) set.add(pr.exercise);
    });
    (workouts || []).forEach((w) => {
      w.exercises.forEach((e) => {
        if (e.name) set.add(e.name);
      });
    });
    return Array.from(set);
  }, [prs, workouts]);

  // Default to first primary exercise that has records, or first available
  const initialExercise = useMemo(() => {
    const primaryMatch = PRIMARY_EXERCISES.find((pe) =>
      availableExercises.some((ae) => ae.toLowerCase() === pe.toLowerCase())
    );
    if (primaryMatch) {
      const match = availableExercises.find((ae) => ae.toLowerCase() === primaryMatch.toLowerCase());
      return match || PRIMARY_EXERCISES[0];
    }
    return availableExercises[0] || 'Squat';
  }, [availableExercises]);

  const [selectedExercise, setSelectedExercise] = useState<string>(initialExercise);
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [metricMode, setMetricMode] = useState<MetricMode>('e1rm');
  const [activePoint, setActivePoint] = useState<{
    date: string;
    value: number;
    weight: number;
    reps: number;
    oneRepMax: number;
    setsCount?: number;
    avgRpe?: number;
    rpeDrift?: number;
    effortTrend?: 'low' | 'moderate' | 'high';
  } | null>(null);

  // Sync initialExercise if selection isn't set yet
  React.useEffect(() => {
    if (!selectedExercise && initialExercise) {
      setSelectedExercise(initialExercise);
    }
  }, [initialExercise, selectedExercise]);

  // Filter PRs by selected exercise and timeframe
  const filteredPRs = useMemo(() => {
    if (!prs || prs.length === 0) return [];

    let target = prs.filter(
      (p) => p.exercise.toLowerCase() === selectedExercise.toLowerCase()
    );

    // Apply timeframe filter
    if (timeframe !== 'all') {
      const now = new Date().getTime();
      const days = timeframe === '30d' ? 30 : 90;
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      target = target.filter((p) => new Date(p.date).getTime() >= cutoff);
    }

    // Sort chronologically
    return [...target].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [prs, selectedExercise, timeframe]);

  // 1RM chart data derived from PRs
  const e1rmData = useMemo(() => {
    return filteredPRs.map((pr) => {
      const displayWeight = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
      const e1RM = calculateOneRepMax(displayWeight, pr.reps);
      return {
        id: pr.id,
        exercise: pr.exercise,
        date: pr.date,
        value: Math.round(e1RM * 10) / 10,
        weight: Math.round(displayWeight * 10) / 10,
        reps: pr.reps,
        oneRepMax: Math.round(e1RM * 10) / 10,
        setsCount: 1,
        avgRpe: 8,
        rpeDrift: 0,
        effortTrend: 'moderate' as const,
        hasEffortSpike: false,
      };
    });
  }, [filteredPRs, userUnit]);

  // Volume load & RPE fatigue data derived from workouts
  const volumeData = useMemo(() => {
    const rawSessions = getExerciseHistorySessions(selectedExercise, workouts || []);
    let filtered = rawSessions;

    if (timeframe !== 'all') {
      const now = new Date().getTime();
      const days = timeframe === '30d' ? 30 : 90;
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      filtered = rawSessions.filter((s) => new Date(s.date).getTime() >= cutoff);
    }

    if (filtered.length > 0) {
      return filtered.map((s, idx) => ({
        id: `${s.date}-${idx}`,
        exercise: selectedExercise,
        date: s.date,
        value: s.totalVolume,
        weight: s.bestWeight,
        reps: s.bestReps,
        oneRepMax: s.bestE1RM,
        setsCount: s.sets.length,
        avgRpe: s.fatigue.averageRpe,
        rpeDrift: s.fatigue.rpeDriftTotal,
        effortTrend: s.fatigue.withinSessionEffortTrend,
        hasEffortSpike: s.fatigue.hasEffortSpike,
      }));
    }

    // Fallback: estimate volume from PR records if no multi-set workouts exist yet
    return filteredPRs.map((pr) => {
      const displayWeight = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
      const vol = Math.round(displayWeight * pr.reps);
      const e1RM = calculateOneRepMax(displayWeight, pr.reps);
      return {
        id: pr.id,
        exercise: pr.exercise,
        date: pr.date,
        value: vol,
        weight: Math.round(displayWeight * 10) / 10,
        reps: pr.reps,
        oneRepMax: Math.round(e1RM * 10) / 10,
        setsCount: 1,
        avgRpe: 8,
        rpeDrift: 0,
        effortTrend: 'moderate' as const,
        hasEffortSpike: false,
      };
    });
  }, [selectedExercise, workouts, timeframe, filteredPRs, userUnit]);

  // Active dataset according to metric mode
  const currentChartData = useMemo(() => {
    return metricMode === 'volume' ? volumeData : e1rmData;
  }, [metricMode, volumeData, e1rmData]);

  // Dynamic Autoregulation & Fatigue Insight
  const autoregulationInsight = useMemo(() => {
    if (currentChartData.length < 2) return null;
    const latest = currentChartData[currentChartData.length - 1];
    const previous = currentChartData[currentChartData.length - 2];
    const valDelta = latest.value - previous.value;

    if (latest.effortTrend === 'high' || latest.hasEffortSpike || (latest.rpeDrift !== undefined && latest.rpeDrift >= 1.5)) {
      return {
        headline: 'Fatigue Accumulation Detected',
        explanation: `Latest session logged high within-session effort drift (+${latest.rpeDrift ?? 1.5} RPE, Avg @${latest.avgRpe} RPE). Central nervous system exertion is elevated. Maintain current load or take a deload buffer before pushing volume.`,
      };
    }

    if (valDelta > 0 && latest.avgRpe !== undefined && latest.avgRpe <= 8.5) {
      return {
        headline: 'Positive Progressive Overload',
        explanation: `Tonnage expanded by +${valDelta.toLocaleString()} ${userUnit} while exertion remained controlled (Avg @${latest.avgRpe} RPE). Your training stimulus is driving muscular adaptation without neuromuscular exhaustion.`,
      };
    }

    if (latest.avgRpe !== undefined && latest.avgRpe < 7.5 && latest.effortTrend === 'low') {
      return {
        headline: 'High Neuromuscular Reserve',
        explanation: `Working sets completed with comfortable reserve (Avg @${latest.avgRpe} RPE, negligible drift). You are in an optimal recovery window to increment load or reps next session.`,
      };
    }

    return {
      headline: 'Controlled Volume Maintenance',
      explanation: `Work capacity is stable at ${latest.value.toLocaleString()} ${userUnit} (Avg @${latest.avgRpe ?? 8} RPE). Solidifying motor efficiency and work capacity at this load.`,
    };
  }, [currentChartData, userUnit]);

  // SVG dimensions
  const width = 380;
  const height = 140;
  const paddingX = 24;
  const paddingY = 20;

  const { points, areaPoints, pointObjects, minVal, maxVal, delta, latestVal } = useMemo(() => {
    if (currentChartData.length === 0) {
      return { points: '', areaPoints: '', pointObjects: [], minVal: 0, maxVal: 0, delta: 0, latestVal: 0 };
    }

    const values = currentChartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 10;
    const diff = values[values.length - 1] - values[0];
    const latest = values[values.length - 1];

    const pts = currentChartData.map((d, i) => {
      const x =
        currentChartData.length === 1
          ? width / 2
          : paddingX + (i / (currentChartData.length - 1)) * (width - paddingX * 2);
      const y =
        height -
        paddingY -
        ((d.value - min) / range) * (height - paddingY * 2);
      return { x, y, data: d };
    });

    const pathString = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const areaString =
      pts.length > 1
        ? `${pathString} L ${pts[pts.length - 1].x} ${height - paddingY} L ${pts[0].x} ${height - paddingY} Z`
        : '';

    return {
      points: pathString,
      areaPoints: areaString,
      pointObjects: pts,
      minVal: min,
      maxVal: max,
      delta: Math.round(diff * 10) / 10,
      latestVal: latest,
    };
  }, [currentChartData]);

  if (prs.length === 0 && (!workouts || workouts.length === 0)) return null;

  // Exercises to show in the toggle bar (primary 4 + any other tracked exercises)
  const displayTabs = Array.from(
    new Set([...PRIMARY_EXERCISES, ...availableExercises])
  ).slice(0, 5);

  return (
    <div className="card space-y-3 bg-bg-card border border-border">
      {/* ── Header: Title, Metric Mode Toggle & Timeframe Selector ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="section-title text-[11px] mb-0">
            {metricMode === 'e1rm' ? 'STRENGTH TREND (1RM)' : 'VOLUME & EFFORT DRIFT'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Mode Toggle: 1RM vs Volume & Fatigue */}
          <div className="flex items-center gap-0.5 bg-bg-secondary p-0.5 rounded-lg border border-border/60 text-2xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMetricMode('e1rm');
                setActivePoint(null);
              }}
              className={`px-2 py-0.5 rounded-md transition-all ${
                metricMode === 'e1rm'
                  ? 'bg-bg-card text-accent font-bold shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              1RM
            </button>
            <button
              type="button"
              onClick={() => {
                setMetricMode('volume');
                setActivePoint(null);
              }}
              className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-1 ${
                metricMode === 'volume'
                  ? 'bg-bg-card text-accent font-bold shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <span>Volume &amp; Fatigue</span>
            </button>
          </div>

          {/* Timeframe Toggles: 30D | 3M | All Time */}
          <div className="flex items-center gap-1 bg-bg-secondary p-0.5 rounded-lg border border-border/60 text-2xs font-semibold">
            {(['30d', '3m', 'all'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  setTimeframe(tf);
                  setActivePoint(null);
                }}
                className={`px-2 py-0.5 rounded-md transition-all ${
                  timeframe === tf
                    ? 'bg-bg-card text-accent font-bold shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tf === '30d' ? '30D' : tf === '3m' ? '3M' : 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Exercise Toggles: Squat | Bench | Deadlift | OHP ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {displayTabs.map((ex) => {
          const isSelected = selectedExercise.toLowerCase() === ex.toLowerCase();
          const hasRecord = availableExercises.some((ae) => ae.toLowerCase() === ex.toLowerCase());

          return (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setSelectedExercise(ex);
                setActivePoint(null);
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
                isSelected
                  ? 'bg-accent text-white border-accent shadow-xs'
                  : hasRecord
                  ? 'bg-bg-secondary border-border text-text-primary hover:border-accent/40'
                  : 'bg-bg-secondary/40 border-border/40 text-text-muted/60'
              }`}
            >
              {ex}
            </button>
          );
        })}
      </div>

      {/* ── Chart Content ── */}
      {currentChartData.length >= 3 ? (
        <>
          {/* ── Stats Summary Bar ── */}
          <div className="flex items-baseline justify-between pt-1">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-text-primary font-sans tabular-nums">
                  {activePoint ? activePoint.value.toLocaleString() : latestVal.toLocaleString()}
                </span>
                <span className="text-xs text-text-muted">
                  {userUnit} {metricMode === 'volume' ? 'Volume' : '1RM'}
                </span>
              </div>
              <p className="text-2xs text-text-muted mt-0.5">
                {activePoint
                  ? metricMode === 'volume'
                    ? `${new Date(activePoint.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })} • ${activePoint.setsCount || 1} sets • Top: ${activePoint.weight} ${userUnit} × ${
                        activePoint.reps
                      } • Avg @${activePoint.avgRpe || 8} RPE (${
                        (activePoint.rpeDrift ?? 0) >= 0 ? `+${activePoint.rpeDrift ?? 0}` : activePoint.rpeDrift
                      } drift)`
                    : `${new Date(activePoint.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })} • ${activePoint.weight} ${userUnit} × ${activePoint.reps} reps`
                  : `${currentChartData.length} records in this period`}
              </p>
            </div>

            <div className="text-right">
              {delta !== 0 ? (
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                    delta > 0
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-danger/10 text-danger'
                  }`}
                >
                  {delta > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()} {userUnit}
                </span>
              ) : (
                <span className="text-xs text-text-muted font-medium">Consistent</span>
              )}
              <p className="text-2xs text-text-muted mt-0.5">
                Peak: {maxVal.toLocaleString()} {userUnit}
              </p>
            </div>
          </div>

          {/* ── Interactive SVG Sparkline Chart ── */}
          <div className="relative pt-1">
            <div className="w-full overflow-hidden">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-32 overflow-visible"
              >
                <defs>
                  <linearGradient id="strengthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line
                  x1={paddingX}
                  y1={paddingY}
                  x2={width - paddingX}
                  y2={paddingY}
                  stroke="currentColor"
                  className="text-border/60"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <line
                  x1={paddingX}
                  y1={height - paddingY}
                  x2={width - paddingX}
                  y2={height - paddingY}
                  stroke="currentColor"
                  className="text-border/60"
                  strokeWidth="1"
                />

                {/* Shaded Area */}
                {areaPoints && (
                  <path d={areaPoints} fill="url(#strengthGradient)" />
                )}

                {/* Trend Line */}
                <path
                  d={points}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Interactive Data Points with Autoregulation Effort Colors */}
                {pointObjects.map((pt, i) => {
                  const isSelected = activePoint?.date === pt.data.date;
                  const effortTrend = pt.data.effortTrend;
                  const strokeColor =
                    metricMode === 'volume'
                      ? effortTrend === 'high'
                        ? '#f59e0b'
                        : effortTrend === 'low'
                        ? '#10b981'
                        : 'var(--accent)'
                      : 'var(--accent)';

                  return (
                    <g key={i}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 6 : 4}
                        className="fill-bg-card transition-all cursor-pointer"
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 2}
                        onClick={() => setActivePoint(pt.data)}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* ── Volume Mode Legend & Autoregulation Insight ── */}
          {metricMode === 'volume' && (
            <div className="pt-2 border-t border-border/50 space-y-2">
              {/* RPE & Fatigue Legend */}
              <div className="flex items-center justify-between text-3xs font-mono text-text-muted flex-wrap gap-2">
                <span className="font-semibold text-text-secondary">Autoregulation Status:</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Low Drift (Reserve)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-accent" />
                    <span>Target Effort (@8-8.5)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>High Drift / Deload Signal</span>
                  </span>
                </div>
              </div>

              {/* Dynamic Autoregulation Coaching Insight */}
              {autoregulationInsight && (
                <div className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border/70 text-2xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-accent">
                    <Activity className="w-3.5 h-3.5" />
                    <span>AUTOREGULATION INSIGHT:</span>
                    <span className="text-text-primary">{autoregulationInsight.headline}</span>
                  </div>
                  <p className="text-text-secondary text-3xs leading-relaxed">
                    {autoregulationInsight.explanation}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="py-6 px-4 text-center rounded-xl bg-bg-secondary/40 border border-border/50">
          <p className="text-xs font-semibold text-text-primary">
            {currentChartData.length === 0
              ? `No records logged for ${selectedExercise} in this timeframe.`
              : 'Not enough workout history yet.'}
          </p>
          <p className="text-2xs text-text-muted mt-1">
            {currentChartData.length === 0
              ? 'Log PRs or workouts to track your strength over time.'
              : 'Complete a few sessions to see your trend.'}
          </p>
        </div>
      )}
    </div>
  );
}
