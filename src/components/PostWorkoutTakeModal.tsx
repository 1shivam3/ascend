'use client';

import React, { useState, useEffect } from 'react';
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

  if (!isOpen) return null;

  const totalSets = completedWorkout.exercises.reduce((acc, e) => acc + e.sets.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-scale-up space-y-4">
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

        {/* Quick Numbers Bar */}
        <div className="grid grid-cols-3 gap-2 py-2 border-y border-border-light dark:border-border-dark text-center">
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Duration</span>
            <span className="font-bold text-sm text-text-primary">
              {completedWorkout.durationMinutes || 45} min
            </span>
          </div>
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Exercises</span>
            <span className="font-bold text-sm text-text-primary">
              {completedWorkout.exercises.length}
            </span>
          </div>
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Total Sets</span>
            <span className="font-bold text-sm text-accent font-mono">
              {totalSets}
            </span>
          </div>
        </div>

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
            <div className="p-3 rounded-lg bg-white/70 dark:bg-[#161b22] border border-border-light dark:border-border-dark space-y-1">
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
