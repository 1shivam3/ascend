'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { TrendingUp, ArrowUpRight } from 'lucide-react';
import { calculateOneRepMax } from '@/lib/strength-standards';

export default function ProgressChart() {
  const { prs, profile } = useStore();
  const userUnit = profile?.unit || 'kg';

  // Get list of distinct exercises with PRs
  const exercisesWithPRs = useMemo(() => {
    const set = new Set<string>();
    prs.forEach((pr) => {
      if (pr.exercise) set.add(pr.exercise);
    });
    return Array.from(set);
  }, [prs]);

  const [selectedExercise, setSelectedExercise] = useState<string>('all');
  const [activePoint, setActivePoint] = useState<{
    date: string;
    weight: number;
    reps: number;
    oneRepMax: number;
    exercise: string;
  } | null>(null);

  // Filter and sort PRs chronologically
  const chartData = useMemo(() => {
    if (!prs || prs.length === 0) return [];

    let filtered = prs;
    if (selectedExercise !== 'all') {
      filtered = prs.filter((p) => p.exercise === selectedExercise);
    }

    const sorted = [...filtered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return sorted.map((pr) => {
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
  }, [prs, selectedExercise, userUnit]);

  // SVG dimensions
  const width = 380;
  const height = 150;
  const paddingX = 24;
  const paddingY = 20;

  const { points, minVal, maxVal, delta } = useMemo(() => {
    if (chartData.length === 0) {
      return { points: '', minVal: 0, maxVal: 0, delta: 0 };
    }

    const values = chartData.map((d) => d.oneRepMax);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 10;
    const diff = values[values.length - 1] - values[0];

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

    return {
      points: pathString,
      pointObjects: pts,
      minVal: min,
      maxVal: max,
      delta: Math.round(diff * 10) / 10,
    };
  }, [chartData]);

  if (prs.length === 0) {
    return null;
  }

  return (
    <div className="card space-y-3">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="section-title mb-0">STRENGTH PROGRESS</h2>
        </div>

        <div className="flex items-center gap-2">
          {delta !== 0 && (
            <span
              className={`text-2xs font-mono font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                delta > 0
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-danger/15 text-danger'
              }`}
            >
              <ArrowUpRight className="w-3 h-3" />
              {delta > 0 ? `+${delta}` : delta} {userUnit}
            </span>
          )}

          <select
            value={selectedExercise}
            onChange={(e) => {
              setSelectedExercise(e.target.value);
              setActivePoint(null);
            }}
            className="text-xs py-1 px-2.5 bg-bg-secondary border border-border rounded-lg"
          >
            <option value="all">All Lifts</option>
            {exercisesWithPRs.map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SVG Chart */}
      {chartData.length > 0 ? (
        <div className="relative pt-1">
          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-36 overflow-visible"
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
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
                className="text-border/40"
                strokeDasharray="3 3"
              />
              <line
                x1={paddingX}
                y1={height - paddingY}
                x2={width - paddingX}
                y2={height - paddingY}
                stroke="currentColor"
                className="text-border/40"
                strokeDasharray="3 3"
              />

              {/* Area Fill */}
              {chartData.length > 1 && points && (
                <path
                  d={`${points} L ${width - paddingX} ${height - paddingY} L ${paddingX} ${height - paddingY} Z`}
                  fill="url(#chartGradient)"
                />
              )}

              {/* Stroke Line */}
              {points && (
                <path
                  d={points}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Point Dots */}
              {chartData.map((d, i) => {
                const x =
                  chartData.length === 1
                    ? width / 2
                    : paddingX + (i / (chartData.length - 1)) * (width - paddingX * 2);
                const range = maxVal - minVal || 10;
                const y =
                  height -
                  paddingY -
                  ((d.oneRepMax - minVal) / range) * (height - paddingY * 2);

                const isActive = activePoint?.date === d.date && activePoint?.oneRepMax === d.oneRepMax;

                return (
                  <g key={d.id || i} onClick={() => setActivePoint(d)} className="cursor-pointer">
                    <circle
                      cx={x}
                      cy={y}
                      r={isActive ? 6 : 4}
                      fill="var(--bg-card)"
                      stroke="var(--accent)"
                      strokeWidth={isActive ? 3 : 2}
                      className="transition-all hover:scale-125"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Active Point Card / Tooltip */}
          {activePoint ? (
            <div className="mt-2 p-2.5 rounded-lg bg-bg-secondary border border-border flex items-center justify-between text-xs animate-fade-in font-mono">
              <div>
                <span className="font-semibold text-text-primary block">{activePoint.exercise}</span>
                <span className="text-text-muted text-2xs">
                  {new Date(activePoint.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-accent font-bold text-sm">
                  {activePoint.weight} {userUnit} × {activePoint.reps}
                </span>
                <span className="text-text-muted text-2xs block">
                  Est. 1RM: {activePoint.oneRepMax} {userUnit}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center text-2xs text-text-muted font-mono pt-1 px-1">
              <span>Low: {Math.round(minVal)} {userUnit}</span>
              <span>Tap dots for details</span>
              <span>Peak: {Math.round(maxVal)} {userUnit}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-4 font-mono">
          No records found for this lift.
        </p>
      )}
    </div>
  );
}
