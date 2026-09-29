'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { calculateOneRepMax } from '@/lib/strength-standards';

const PRIMARY_EXERCISES = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];

type Timeframe = '30d' | '3m' | 'all';

export default function ProgressChart() {
  const { prs, profile } = useStore();
  const userUnit = profile?.unit || 'kg';

  // Find all distinct exercises that have PRs
  const availableExercises = useMemo(() => {
    const set = new Set<string>();
    prs.forEach((pr) => {
      if (pr.exercise) set.add(pr.exercise);
    });
    return Array.from(set);
  }, [prs]);

  // Default to first primary exercise that has PRs, or first available PR exercise
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
  const [activePoint, setActivePoint] = useState<{
    date: string;
    weight: number;
    reps: number;
    oneRepMax: number;
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

  const chartData = useMemo(() => {
    return filteredPRs.map((pr) => {
      const displayWeight = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
      const e1RM = calculateOneRepMax(displayWeight, pr.reps);
      return {
        id: pr.id,
        exercise: pr.exercise,
        date: pr.date,
        weight: Math.round(displayWeight * 10) / 10,
        reps: pr.reps,
        oneRepMax: Math.round(e1RM * 10) / 10,
      };
    });
  }, [filteredPRs, userUnit]);

  // SVG dimensions
  const width = 380;
  const height = 140;
  const paddingX = 24;
  const paddingY = 20;

  const { points, areaPoints, pointObjects, minVal, maxVal, delta, latestVal } = useMemo(() => {
    if (chartData.length === 0) {
      return { points: '', areaPoints: '', pointObjects: [], minVal: 0, maxVal: 0, delta: 0, latestVal: 0 };
    }

    const values = chartData.map((d) => d.oneRepMax);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 10;
    const diff = values[values.length - 1] - values[0];
    const latest = values[values.length - 1];

    const pts = chartData.map((d, i) => {
      const x =
        chartData.length === 1
          ? width / 2
          : paddingX + (i / (chartData.length - 1)) * (width - paddingX * 2);
      const y =
        height -
        paddingY -
        ((d.oneRepMax - min) / range) * (height - paddingY * 2);
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
  }, [chartData]);

  if (prs.length === 0) return null;

  // Exercises to show in the toggle bar (primary 4 + any other tracked exercises)
  const displayTabs = Array.from(
    new Set([...PRIMARY_EXERCISES, ...availableExercises])
  ).slice(0, 5);

  return (
    <div className="card space-y-3 bg-bg-card border border-border">
      {/* ── Header: Title & Timeframe Selector (Item 12) ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="section-title text-[11px] mb-0">STRENGTH TREND</h2>
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

      {/* ── Exercise Toggles: Squat | Bench | Deadlift | OHP (Item 12) ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {displayTabs.map((ex) => {
          const isSelected = selectedExercise.toLowerCase() === ex.toLowerCase();
          const hasPR = availableExercises.some((ae) => ae.toLowerCase() === ex.toLowerCase());

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
                  : hasPR
                  ? 'bg-bg-secondary border-border text-text-primary hover:border-accent/40'
                  : 'bg-bg-secondary/40 border-border/40 text-text-muted/60'
              }`}
            >
              {ex}
            </button>
          );
        })}
      </div>

      {/* ── Stats Summary Bar ── */}
      {chartData.length > 0 ? (
        <div className="flex items-baseline justify-between pt-1">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-text-primary font-sans">
                {activePoint ? activePoint.oneRepMax : latestVal}
              </span>
              <span className="text-xs text-text-muted">{userUnit} 1RM</span>
            </div>
            <p className="text-2xs text-text-muted mt-0.5">
              {activePoint
                ? `${new Date(activePoint.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${activePoint.weight} ${userUnit} × ${activePoint.reps} reps`
                : `${chartData.length} records in this period`}
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
                {delta > 0 ? `+${delta}` : delta} {userUnit}
              </span>
            ) : (
              <span className="text-xs text-text-muted font-medium">Consistent</span>
            )}
            <p className="text-2xs text-text-muted mt-0.5">Peak: {maxVal} {userUnit}</p>
          </div>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-text-muted">
          No records logged for {selectedExercise} in this timeframe.
        </div>
      )}

      {/* ── Interactive SVG Sparkline Chart ── */}
      {chartData.length > 0 && (
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

              {/* Interactive Data Points */}
              {pointObjects.map((pt, i) => {
                const isSelected = activePoint?.date === pt.data.date;
                return (
                  <g key={i}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 6 : 4}
                      className="fill-bg-card stroke-accent transition-all cursor-pointer"
                      strokeWidth={isSelected ? 3 : 2}
                      onClick={() =>
                        setActivePoint({
                          date: pt.data.date,
                          weight: pt.data.weight,
                          reps: pt.data.reps,
                          oneRepMax: pt.data.oneRepMax,
                        })
                      }
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
