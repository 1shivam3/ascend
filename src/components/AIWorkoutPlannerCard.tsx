'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { AIPlannedWorkout, AIPlannedExercise } from '@/lib/types';
import { fetchOrGenerateDailyPlan } from '@/lib/ai-coach';
import {
  Dumbbell,
  Play,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  HelpCircle,
  CheckCircle2,
  Zap
} from 'lucide-react';

interface AIWorkoutPlannerCardProps {
  onStartWorkout: (plan: AIPlannedWorkout) => void;
}

export default function AIWorkoutPlannerCard({ onStartWorkout }: AIWorkoutPlannerCardProps) {
  const store = useStore();
  const [plan, setPlan] = useState<AIPlannedWorkout | undefined>(store.todaysAIWorkoutPlan);
  const [loading, setLoading] = useState(false);
  const [showExercises, setShowExercises] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  // Sync from store
  useEffect(() => {
    if (store.todaysAIWorkoutPlan) {
      setPlan(store.todaysAIWorkoutPlan);
    }
  }, [store.todaysAIWorkoutPlan]);

  // Initial load
  useEffect(() => {
    if (!plan && store._hasHydrated) {
      handleGenerate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store._hasHydrated]);

  const handleGenerate = async (forceRefresh = true) => {
    setLoading(true);
    try {
      const generated = await fetchOrGenerateDailyPlan(store, { forceRefresh });
      setPlan(generated);
    } catch (err) {
      console.error('Failed to plan workout:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !plan) {
    return (
      <div className="card p-5 bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark shadow-sm rounded-2xl animate-pulse space-y-3">
        <div className="h-4 bg-bg-secondary rounded w-1/3" />
        <div className="h-6 bg-bg-secondary rounded w-2/3" />
        <div className="h-10 bg-bg-secondary rounded w-full" />
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="card p-5 bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark shadow-sm rounded-2xl relative overflow-hidden transition-all">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-accent/10 rounded-bl-full pointer-events-none" />

      {/* Header Badge */}
      <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-2xs font-bold uppercase tracking-wider text-text-muted">
            TODAY&apos;S TRAINING PLAN
          </span>
          {plan.source === 'gemini' ? (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-3xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Sparkles className="w-2.5 h-2.5" /> Gemini Adapted
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-3xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <Zap className="w-2.5 h-2.5" /> Heuristic
            </span>
          )}
        </div>

        <button
          onClick={() => handleGenerate(true)}
          disabled={loading}
          title="Regenerate today's training plan"
          className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
        </button>
      </div>

      {/* Title & Duration */}
      <div className="mb-3 relative z-10">
        <h2 className="text-xl font-black text-text-primary tracking-tight">
          {plan.workoutName}
        </h2>
        <div className="flex items-center gap-3 text-xs text-text-muted mt-1 font-medium">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-accent" />
            ~{plan.estimatedDurationMin} min
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Dumbbell className="w-3.5 h-3.5 text-blue-500" />
            {plan.exercises.length} exercises
          </span>
          <span>•</span>
          <span className="text-text-secondary truncate">{plan.focus}</span>
        </div>
      </div>

      {/* "Why am I doing this?" Accordion */}
      <div className="mb-4 relative z-10">
        <button
          onClick={() => setShowWhy(!showWhy)}
          className="flex items-center gap-1.5 text-2xs font-semibold text-accent hover:underline mb-1"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Why this workout?</span>
          {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showWhy && (
          <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-xs text-text-secondary leading-relaxed animate-fade-in font-medium">
            {plan.whyThisWorkout}
          </div>
        )}
      </div>

      {/* Exercises List Toggle */}
      <div className="mb-4 relative z-10">
        <button
          onClick={() => setShowExercises(!showExercises)}
          className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 text-xs font-semibold text-text-primary transition-colors"
        >
          <span>View {plan.exercises.length} Planned Movements &amp; Targets</span>
          {showExercises ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showExercises && (
          <div className="mt-2 space-y-2 animate-fade-in">
            {plan.exercises.map((ex, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-border-light dark:border-border-dark bg-white/60 dark:bg-[#1c2128] text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-primary text-sm">
                    {idx + 1}. {ex.exercise}
                  </span>
                  <span className="font-mono font-bold text-accent px-2 py-0.5 rounded-md bg-accent/10">
                    {ex.targetWeightKg > 0 ? `${ex.targetWeightKg} kg` : 'Bodyweight'} × {ex.sets} sets ({ex.reps} reps)
                  </span>
                </div>
                <div className="flex items-center justify-between text-2xs text-text-muted">
                  <span className="text-text-secondary italic">{ex.reason}</span>
                  <span>Rest: {ex.restSeconds}s</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Call To Action: 1-Tap Start Workout */}
      <button
        onClick={() => onStartWorkout(plan)}
        className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover active:scale-[0.99] text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-sm transition-all relative z-10"
      >
        <Play className="w-4 h-4 fill-white" />
        <span>START TODAY&apos;S WORKOUT</span>
      </button>
    </div>
  );
}
