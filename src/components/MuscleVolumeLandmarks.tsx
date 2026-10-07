'use client';

import React, { useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  getExerciseMuscle,
  getExerciseSecondaryMuscles,
  ResistanceMuscleGroup,
  RESISTANCE_MUSCLE_GROUPS,
} from '@/lib/exercise-library';
import { Layers, Flame, CheckCircle2, TrendingUp, Info } from 'lucide-react';

interface LandmarkConfig {
  mev: number;      // Minimum Effective Volume
  mavMin: number;   // Maximum Adaptive Volume (Min Optimal)
  mavMax: number;   // Maximum Adaptive Volume (Max Optimal)
  mrv: number;      // Maximum Recoverable Volume
}

const MUSCLE_LANDMARKS: Record<ResistanceMuscleGroup, LandmarkConfig> = {
  Chest:     { mev: 8,  mavMin: 10, mavMax: 18, mrv: 22 },
  Back:      { mev: 10, mavMin: 12, mavMax: 20, mrv: 25 },
  Legs:      { mev: 10, mavMin: 12, mavMax: 20, mrv: 24 },
  Shoulders: { mev: 8,  mavMin: 10, mavMax: 16, mrv: 20 },
  Arms:      { mev: 6,  mavMin: 8,  mavMax: 14, mrv: 18 },
  Core:      { mev: 4,  mavMin: 6,  mavMax: 10, mrv: 14 },
};

export default function MuscleVolumeLandmarks() {
  const workouts = useStore((state) => state.workouts || []);
  const profile = useStore((state) => state.profile);
  const experience = profile?.userMode === 'beginner' ? 'beginner' : profile?.userMode === 'advanced' ? 'advanced' : 'intermediate';

  // Adapt volume landmarks dynamically by user training experience
  const landmarks = useMemo(() => {
    const mult = experience === 'beginner' ? 0.75 : experience === 'advanced' ? 1.2 : 1.0;
    const res: Record<ResistanceMuscleGroup, LandmarkConfig> = { ...MUSCLE_LANDMARKS };
    for (const k of Object.keys(res) as ResistanceMuscleGroup[]) {
      res[k] = {
        mev: Math.max(4, Math.round(MUSCLE_LANDMARKS[k].mev * mult)),
        mavMin: Math.max(6, Math.round(MUSCLE_LANDMARKS[k].mavMin * mult)),
        mavMax: Math.max(10, Math.round(MUSCLE_LANDMARKS[k].mavMax * mult)),
        mrv: Math.max(12, Math.round(MUSCLE_LANDMARKS[k].mrv * mult)),
      };
    }
    return res;
  }, [experience]);

  // Compute sets logged in the last 7 days (or current training week)
  const weeklyMuscleStats = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentWorkouts = workouts.filter((w) => {
      const ts = new Date(w.date).getTime();
      return !isNaN(ts) && ts >= sevenDaysAgo;
    });

    const setCounts: Record<ResistanceMuscleGroup, number> = {
      Chest: 0,
      Back: 0,
      Legs: 0,
      Shoulders: 0,
      Arms: 0,
      Core: 0,
    };

    recentWorkouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        const primary = getExerciseMuscle(ex.name);
        const secondaries = getExerciseSecondaryMuscles(ex.name);
        const completedCount = ex.sets.filter((s) => s.completed !== false && (s.reps > 0 || (s.weight && s.weight > 0))).length;
        if (primary !== 'Conditioning' && primary in setCounts) {
          setCounts[primary as ResistanceMuscleGroup] = (setCounts[primary as ResistanceMuscleGroup] || 0) + completedCount;
        }
        secondaries.forEach((sec) => {
          if (sec !== primary && sec !== 'Conditioning' && sec in setCounts) {
            setCounts[sec as ResistanceMuscleGroup] = (setCounts[sec as ResistanceMuscleGroup] || 0) + completedCount * 0.5;
          }
        });
      });
    });

    return setCounts;
  }, [workouts]);

  const totalWeeklySets = useMemo(() => {
    const sum = Object.values(weeklyMuscleStats).reduce((acc, n) => acc + n, 0);
    return sum % 1 === 0 ? sum : sum.toFixed(1);
  }, [weeklyMuscleStats]);

  return (
    <div className="card p-4 sm:p-5 bg-bg-card border border-border space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-3xs uppercase font-semibold text-accent tracking-wider block">
            Hypertrophy Volume Guide
          </span>
          <h3 className="text-base font-bold text-text-primary mt-0.5 flex items-center gap-2">
            <span>Weekly Muscle Volume</span>
            <span className="text-2xs font-mono font-normal text-text-muted">
              ({totalWeeklySets} sets in last 7d)
            </span>
          </h3>
        </div>
        <span className="text-3xs font-mono px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25 text-accent font-semibold">
          Suggested Range ({experience})
        </span>
      </div>

      {/* Grid of Muscle Volumes */}
      <div className="space-y-3">
        {RESISTANCE_MUSCLE_GROUPS.map((muscle) => {
          const sets = weeklyMuscleStats[muscle] || 0;
          const config = landmarks[muscle];
          const pct = Math.min(100, Math.round((sets / config.mavMax) * 100));

          let statusLabel = 'Below Baseline';
          let statusColor = 'text-text-muted bg-bg-secondary border-border/80';
          let barColor = 'bg-text-muted';

          if (sets === 0) {
            statusLabel = 'Untrained (0 sets)';
            statusColor = 'text-text-muted bg-bg-secondary/60 border-border/50';
            barColor = 'bg-text-muted/30';
          } else if (sets < config.mev) {
            statusLabel = 'Low Stimulus';
            statusColor = 'text-amber-500 bg-amber-500/10 border-amber-500/30';
            barColor = 'bg-amber-500';
          } else if (sets >= config.mev && sets < config.mavMin) {
            statusLabel = 'Maintenance';
            statusColor = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
            barColor = 'bg-sky-400';
          } else if (sets >= config.mavMin && sets <= config.mavMax) {
            statusLabel = 'Target Range';
            statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
            barColor = 'bg-emerald-500';
          } else {
            statusLabel = 'High Volume';
            statusColor = 'text-purple-400 bg-purple-500/10 border-purple-500/30';
            barColor = 'bg-purple-400';
          }

          return (
            <div key={muscle} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-text-primary font-sans">{muscle}</span>
                  <span className={`text-[10px] font-mono px-2 py-0.2 rounded-full border ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-2xs">
                  <span className="font-bold text-text-primary text-xs">{sets % 1 === 0 ? sets : sets.toFixed(1)}</span>
                  <span className="text-text-muted">/ {config.mavMin}–{config.mavMax} suggested range</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-bg-secondary/80 overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Guide explanation footer */}
      <div className="pt-2 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between text-3xs font-mono text-text-muted gap-1.5">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Suggested range: 10–20 sets/wk</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>Maintenance: 6–10 sets</span>
          </span>
        </div>
        <span className="text-[10px] text-text-muted/80">
          *1.0x primary + 0.5x synergist stimulus
        </span>
      </div>
    </div>
  );
}
