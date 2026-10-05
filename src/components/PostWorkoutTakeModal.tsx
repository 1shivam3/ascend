'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { AIPostWorkoutTake } from '@/lib/types';
import { fetchPostWorkoutTake } from '@/lib/ai-coach';
import {
  Trophy,
  X,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Clock,
  Dumbbell,
  CheckCircle2,
  Zap,
  Target
} from 'lucide-react';

interface PostWorkoutTakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  completedWorkout: {
    name: string;
    durationMinutes: number;
    exercises: Array<{
      name: string;
      sets: Array<{ reps: number; weight: number; unit: string }>;
    }>;
  };
}

export default function PostWorkoutTakeModal({
  isOpen,
  onClose,
  completedWorkout,
}: PostWorkoutTakeModalProps) {
  const store = useStore();
  const [take, setTake] = useState<AIPostWorkoutTake | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      let isMounted = true;
      setLoading(true);
      fetchPostWorkoutTake(store, completedWorkout)
        .then((res) => {
          if (isMounted) {
            setTake(res);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to get post-workout take:', err);
          if (isMounted) setLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const userUnit = store.profile?.unit || 'kg';
  const totalSets = useMemo(() => {
    return completedWorkout.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  }, [completedWorkout.exercises]);

  const totalVolume = useMemo(() => {
    let volKg = 0;
    for (const ex of completedWorkout.exercises) {
      for (const s of ex.sets) {
        const w = parseFloat(String(s.weight)) || 0;
        const r = parseInt(String(s.reps), 10) || 0;
        if (r > 0 && w > 0) {
          const wKg = s.unit === 'lbs' ? w * 0.453592 : w;
          volKg += wKg * r;
        }
      }
    }
    const displayVal = userUnit === 'lbs' ? Math.round(volKg * 2.20462) : Math.round(volKg);
    return `${displayVal.toLocaleString()} ${userUnit}`;
  }, [completedWorkout.exercises, userUnit]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayPRs = useMemo(() => {
    return (store.prs || []).filter((p) => p.date && p.date.startsWith(todayStr));
  }, [store.prs, todayStr]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-scale-in space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-text-primary">
                Session Complete!
              </h3>
              <p className="text-2xs text-text-muted">
                {completedWorkout.name || 'Workout'} logged to history
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Numbers Bar: 4 Core Athletic Metrics */}
        <div className="grid grid-cols-4 gap-1.5 py-2.5 border-y border-border text-center bg-bg-secondary/30 rounded-xl px-2">
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Duration</span>
            <span className="font-bold text-xs sm:text-sm text-text-primary font-mono">
              {completedWorkout.durationMinutes || 45}m
            </span>
          </div>
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Volume</span>
            <span className="font-bold text-xs sm:text-sm text-accent font-mono truncate block" title={totalVolume}>
              {totalVolume}
            </span>
          </div>
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Lifts</span>
            <span className="font-bold text-xs sm:text-sm text-text-primary font-mono">
              {completedWorkout.exercises.length}
            </span>
          </div>
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Sets</span>
            <span className="font-bold text-xs sm:text-sm text-emerald-500 font-mono">
              {totalSets}
            </span>
          </div>
        </div>

        {/* New PR Milestone Banner (if achieved) */}
        {todayPRs.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5 animate-scale-in">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
              <Zap className="w-4 h-4 fill-amber-500" />
              <span>{todayPRs.length} NEW PERSONAL RECORD{todayPRs.length > 1 ? 'S' : ''} DETECTED!</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {todayPRs.map((pr) => (
                <span
                  key={pr.id}
                  className="px-2 py-0.5 rounded-md bg-bg-card border border-amber-500/40 text-2xs font-mono text-text-primary font-semibold"
                >
                  {pr.exercise}: {userUnit === 'lbs' ? pr.weightLbs : pr.weightKg} {userUnit} × {pr.reps}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Coach's Take Card */}
        {loading ? (
          <div className="py-6 text-center space-y-2 animate-pulse">
            <Sparkles className="w-5 h-5 text-accent animate-spin mx-auto" />
            <p className="text-xs text-text-muted font-medium">
              Generating Coach&apos;s Take...
            </p>
          </div>
        ) : take ? (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-2xs">
              <span className="font-bold uppercase tracking-wider text-accent flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Coach&apos;s Take
              </span>
              {take.source === 'gemini' ? (
                <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                  AI Coach
                </span>
              ) : (
                <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-bg-secondary text-text-muted border border-border">
                  Local Coach
                </span>
              )}
            </div>

            <p className="text-sm font-black text-text-primary leading-snug">
              {take.headline}
            </p>

            <p className="text-xs text-text-secondary leading-relaxed">
              {take.volumeVsLastWeek}
            </p>

            {/* Next session target */}
            <div className="p-3 rounded-lg bg-bg-secondary border border-border space-y-1">
              <div className="flex items-center gap-1 text-2xs font-bold text-text-muted uppercase tracking-wider">
                <Target className="w-3.5 h-3.5 text-accent" />
                <span>Next Session Target</span>
              </div>
              <p className="text-xs font-semibold text-text-primary">
                {take.nextSessionTarget}
              </p>
            </div>
          </div>
        ) : null}

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}
