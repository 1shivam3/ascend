'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { AIPostWorkoutTake, isSetCompleted } from '@/lib/types';
import { fetchPostWorkoutTake, generateDeterministicPostWorkoutTake } from '@/lib/ai-coach';
import { getNextSessionTarget } from '@/lib/workout-engine';
import { formatDuration } from '@/lib/formatters';
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
    durationMinutes?: number;
    durationSeconds?: number;
    exercises: Array<{
      name: string;
      sets: Array<{ reps: number; weight?: number; unit: string; completed?: boolean; status?: string; rpe?: number }>;
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
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      setLoading(true);
      setTake(null);
      // Timeout guard: never leave the athlete stuck on "Generating...".
      // After 20s, fall back to the deterministic local take.
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Coach take timed out')), 20000);
      });
      Promise.race([fetchPostWorkoutTake(store, completedWorkout), timeoutPromise])
        .then((res) => {
          if (isMounted) {
            // The next-session target always comes from the canonical
            // getNextSessionTarget() — the same function the Training
            // Adaptation Summary reads — so the two surfaces agree even
            // when Gemini generates the rest of the take.
            const primary = completedWorkout.exercises[0];
            const primarySets = (primary?.sets || [])
              .filter((s) => isSetCompleted(s as any))
              .map((s) => ({
                weight: parseFloat(String(s.weight)) || 0,
                reps: parseInt(String(s.reps), 10) || 0,
                rpe: typeof s.rpe === 'number' ? s.rpe : undefined,
                unit: (s.unit as 'kg' | 'lbs') || store.profile?.unit || 'kg',
              }));
            const canonical = primary
              ? getNextSessionTarget(
                  primary.name,
                  primarySets,
                  (primarySets[0]?.unit as 'kg' | 'lbs') || store.profile?.unit || 'kg'
                )
              : null;
            setTake(
              canonical
                ? { ...res, nextSessionTarget: `NEXT SESSION TARGET: ${canonical.summaryText}` }
                : res
            );
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to get post-workout take:', err);
          if (isMounted) {
            // Fallback: deterministic local take so the modal always has content.
            try {
              setTake(generateDeterministicPostWorkoutTake(completedWorkout));
            } catch {
              setTake({
                headline: 'Session complete.',
                summary: 'Workout logged. Your next session targets are calculated from your completed sets.',
                nextSessionTarget: '',
                source: 'offline_heuristic',
              } as AIPostWorkoutTake);
            }
            setLoading(false);
          }
        });

      return () => {
        isMounted = false;
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const userUnit = store.profile?.unit || 'kg';
  const totalSets = useMemo(() => {
    return completedWorkout.exercises.reduce((acc, e) => acc + e.sets.filter((s) => isSetCompleted(s as any)).length, 0);
  }, [completedWorkout.exercises]);

  const totalVolume = useMemo(() => {
    let volKg = 0;
    for (const ex of completedWorkout.exercises) {
      for (const s of ex.sets) {
        if (!isSetCompleted(s as any)) continue;
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Workout session summary"
    >
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md max-h-[88dvh] flex flex-col shadow-2xl relative animate-scale-in overflow-hidden">
        {/* Sticky Header */}
        <div className="p-4 pb-3 border-b border-border flex items-center justify-between shrink-0 bg-bg-card z-10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500 shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-text-primary leading-tight">
                Session Complete!
              </h3>
              <p className="text-2xs text-text-muted truncate max-w-[220px]">
                {completedWorkout.name || 'Workout'} logged to history
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer transition-colors"
            aria-label="Close summary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {/* Quick Numbers Bar: 4 Core Athletic Metrics */}
        <div className="grid grid-cols-4 gap-1.5 py-2.5 border-y border-border text-center bg-bg-secondary/30 rounded-xl px-2">
          <div>
            <span className="text-3xs uppercase tracking-wider text-text-muted block">Duration</span>
            <span className="font-bold text-xs sm:text-sm text-text-primary font-mono">
              {completedWorkout.durationSeconds !== undefined
                ? formatDuration(completedWorkout.durationSeconds)
                : completedWorkout.durationMinutes !== undefined
                ? formatDuration(completedWorkout.durationMinutes * 60)
                : '--'}
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
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 animate-scale-in">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
              <Zap className="w-4 h-4 fill-amber-500" />
              <span>{todayPRs.length} NEW PERSONAL RECORD{todayPRs.length > 1 ? 'S' : ''} DETECTED!</span>
            </div>
            <div className="space-y-1.5">
              {todayPRs.map((pr) => {
                const isRepPR = pr.prType === 'reps' || pr.notes?.includes('Rep PR');
                const displayWeight = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
                return (
                  <div
                    key={pr.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-bg-card/90 border border-amber-500/30 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                        {isRepPR ? (
                          <Zap className="w-3.5 h-3.5 text-accent fill-accent" />
                        ) : (
                          <Trophy className="w-3.5 h-3.5 text-accent" />
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-text-primary block">{pr.exercise}</span>
                        <span className="text-3xs text-text-muted font-mono">
                          {isRepPR ? (pr.notes || 'Rep Milestone') : `1RM: ${userUnit === 'lbs' ? Math.round(pr.oneRepMax * 2.20462) : pr.oneRepMax} ${userUnit}`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-black text-amber-400 text-xs block">
                        {displayWeight} {userUnit} × {pr.reps}
                      </span>
                      <span className="text-[10px] text-text-muted uppercase font-sans font-semibold">
                        {isRepPR ? 'Rep PR' : '1RM PR'}
                      </span>
                    </div>
                  </div>
                );
              })}
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
                  Autoregulated Coach
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
        </div>

        {/* Sticky Pinned Footer with Done CTA */}
        <div className="p-4 pt-3 border-t border-border shrink-0 bg-bg-card z-10">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 rounded-xl bg-[#E44427] text-white font-bold text-xs hover:bg-[#d03b20] active:scale-98 transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            aria-label="Done and return to workouts"
          >
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            <span>Done & Return to Workouts</span>
          </button>
        </div>
      </div>
    </div>
  );
}
