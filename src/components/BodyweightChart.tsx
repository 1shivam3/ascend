'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { Scale, TrendingUp, TrendingDown, Minus } from 'lucide-react';

function formatDisplayDate(dateStr: string): string {
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

export default function BodyweightChart() {
  const { bodyMetrics, profile } = useStore();
  const userUnit = profile?.unit || 'kg';

  // Sort chronological for chart
  const sortedMetrics = useMemo(() => {
    if (!bodyMetrics || bodyMetrics.length === 0) return [];
    return [...bodyMetrics].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [bodyMetrics]);

  // Compute 7-day moving averages
  const chartPointsData = useMemo(() => {
    if (sortedMetrics.length === 0) return [];

    return sortedMetrics.map((item, idx) => {
      const weight = userUnit === 'lbs' ? Math.round(item.weightKg * 2.20462 * 10) / 10 : item.weightKg;
      // Window of up to 7 prior days including today
      const windowItems = sortedMetrics.slice(Math.max(0, idx - 6), idx + 1);
      const avgKg = windowItems.reduce((sum, m) => sum + m.weightKg, 0) / windowItems.length;
      const avg = userUnit === 'lbs' ? Math.round(avgKg * 2.20462 * 10) / 10 : Math.round(avgKg * 10) / 10;

      return {
        id: item.id,
        date: item.date,
        weight,
        avg7d: avg,
      };
    });
  }, [sortedMetrics, userUnit]);

  const [activePoint, setActivePoint] = useState<{
    date: string;
    weight: number;
    avg7d: number;
  } | null>(null);

  const [showAvg, setShowAvg] = useState(true);
  const [showDaily, setShowDaily] = useState(true);

  // SVG dimensions
  const width = 380;
  const height = 150;
  const paddingX = 24;
  const paddingY = 20;

  const { pointsDaily, pointsAvg, pointObjects, minVal, maxVal, delta } = useMemo(() => {
    if (chartPointsData.length === 0) {
      return { pointsDaily: '', pointsAvg: '', pointObjects: [], minVal: 0, maxVal: 0, delta: 0 };
    }

    const weights = chartPointsData.map((d) => d.weight);
    const avgs = chartPointsData.map((d) => d.avg7d);
    const allVals = [...weights, ...avgs];
    let min = Math.min(...allVals);
    let max = Math.max(...allVals);

    if (min === max) {
      min -= 2;
      max += 2;
    } else {
      const pad = (max - min) * 0.15;
      min -= pad;
      max += pad;
    }

    const range = max - min;
    const innerW = width - paddingX * 2;
    const innerH = height - paddingY * 2;

    const coordsDaily = chartPointsData.map((d, i) => {
      const x = chartPointsData.length === 1 ? width / 2 : paddingX + (i / (chartPointsData.length - 1)) * innerW;
      const y = paddingY + (1 - (d.weight - min) / range) * innerH;
      return { x, y, data: d };
    });

    const coordsAvg = chartPointsData.map((d, i) => {
      const x = chartPointsData.length === 1 ? width / 2 : paddingX + (i / (chartPointsData.length - 1)) * innerW;
      const y = paddingY + (1 - (d.avg7d - min) / range) * innerH;
      return { x, y };
    });

    const pointsDailyStr = coordsDaily.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const pointsAvgStr = coordsAvg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const firstVal = chartPointsData[0].avg7d;
    const lastVal = chartPointsData[chartPointsData.length - 1].avg7d;
    const deltaVal = Math.round((lastVal - firstVal) * 10) / 10;

    return {
      pointsDaily: pointsDailyStr,
      pointsAvg: pointsAvgStr,
      pointObjects: coordsDaily,
      minVal: min,
      maxVal: max,
      delta: deltaVal,
    };
  }, [chartPointsData]);

  if (chartPointsData.length === 0) {
    return (
      <div className="card p-5 text-center bg-bg-card border border-border">
        <Scale className="w-6 h-6 text-text-muted mx-auto mb-2 opacity-50" />
        <p className="text-xs text-text-muted">Log weight to visualize 7-day average trends.</p>
      </div>
    );
  }

  const latest = chartPointsData[chartPointsData.length - 1];

  return (
    <div className="card p-4 bg-bg-card border border-border space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-3xs uppercase font-mono font-bold text-accent tracking-wider block">
            WEIGHT TREND &amp; 7-DAY AVERAGE
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black font-mono text-text-primary">
              {activePoint ? activePoint.weight : latest.weight} {userUnit}
            </span>
            <span className="text-2xs font-mono text-purple-400">
              {chartPointsData.length >= 3
                ? `7d Avg: ${activePoint ? activePoint.avg7d : latest.avg7d} ${userUnit}`
                : `Avg: Calibrating`}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-xs font-mono font-bold">
            {chartPointsData.length < 3 ? (
              <span className="text-text-muted flex items-center gap-0.5">
                <Minus className="w-3.5 h-3.5" /> Baseline
              </span>
            ) : delta > 0 ? (
              <span className="text-emerald-500 flex items-center gap-0.5">
                <TrendingUp className="w-3.5 h-3.5" /> +{delta} {userUnit}
              </span>
            ) : delta < 0 ? (
              <span className="text-rose-500 flex items-center gap-0.5">
                <TrendingDown className="w-3.5 h-3.5" /> {delta} {userUnit}
              </span>
            ) : (
              <span className="text-text-muted flex items-center gap-0.5">
                <Minus className="w-3.5 h-3.5" /> Stable
              </span>
            )}
          </div>
          <span className="text-3xs text-text-muted font-mono">
            {activePoint
              ? formatDisplayDate(activePoint.date)
              : `${chartPointsData.length} ${chartPointsData.length === 1 ? 'record' : 'records'}`}
          </span>
        </div>
      </div>

      {/* Legend with interactive toggles */}
      <div className="flex items-center justify-between text-3xs font-mono text-text-muted border-t border-border/50 pt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDaily(!showDaily)}
            className={`flex items-center gap-1.5 transition-opacity ${showDaily ? 'opacity-100 font-semibold' : 'opacity-35 line-through'}`}
            title="Toggle daily weight line"
          >
            <span className="w-2.5 h-0.5 bg-accent rounded" />
            <span>Daily Weight</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAvg(!showAvg)}
            className={`flex items-center gap-1.5 transition-opacity ${showAvg ? 'opacity-100 font-bold text-purple-400' : 'opacity-35 line-through'}`}
            title="Toggle 7-day moving average"
          >
            <span className="w-2.5 h-0.5 bg-purple-400 rounded" />
            <span>7-Day Moving Avg</span>
          </button>
        </div>
        <span className="text-3xs text-text-muted hidden sm:inline">Tap point to inspect</span>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full aspect-[380/150] overflow-hidden rounded-xl bg-bg-secondary/40 border border-border/60">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="var(--border)"
            strokeDasharray="3 3"
            strokeOpacity="0.4"
          />
          <line
            x1={paddingX}
            y1={height / 2}
            x2={width - paddingX}
            y2={height / 2}
            stroke="var(--border)"
            strokeDasharray="3 3"
            strokeOpacity="0.4"
          />
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="var(--border)"
            strokeDasharray="3 3"
            strokeOpacity="0.4"
          />

          {/* 7-Day Average Smoothed Line (Purple) */}
          {showAvg && pointsAvg && (
            <polyline
              fill="none"
              stroke="#c084fc"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsAvg}
            />
          )}

          {/* Daily Weight Line (Accent Gold/Orange) */}
          {showDaily && pointsDaily && (
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2 2"
              points={pointsDaily}
            />
          )}

          {/* Interactive Data Dots */}
          {pointObjects.map((p, idx) => (
            <g key={idx} className="cursor-pointer" onClick={() => setActivePoint(p.data)}>
              <circle
                cx={p.x}
                cy={p.y}
                r={activePoint?.date === p.data.date ? 5 : 3}
                fill={activePoint?.date === p.data.date ? '#ffffff' : 'var(--accent)'}
                stroke="var(--bg-primary)"
                strokeWidth="1.5"
                className="transition-all hover:r-5"
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
