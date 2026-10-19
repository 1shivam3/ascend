'use client';

import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Play,
  Edit2,
  Share2,
  Trash2,
  Clock,
  Flame,
} from 'lucide-react';
import { PlannedWorkout } from '@/lib/types';
import { useStore } from '@/lib/store';
import { getLastExercisePerformance } from '@/lib/workout-engine';
import { getWorkoutBodyParts } from '@/lib/workout-schedule';

interface WorkoutDetailsViewProps {
  plan: PlannedWorkout;
  onBack: () => void;
  onStart: (plan: PlannedWorkout) => void;
  onEdit?: (plan: PlannedWorkout) => void;
  onShare?: (plan: PlannedWorkout) => void;
  onDelete?: (plan: PlannedWorkout) => void;
}

export default function WorkoutDetailsView({
  plan,
  onBack,
  onStart,
  onEdit,
  onShare,
  onDelete,
}: WorkoutDetailsViewProps) {
  const { profile, workouts } = useStore();
  const userUnit = profile?.unit || 'kg';

  const exerciseCount = plan.exercises?.length || 0;
  const estimatedDuration = Math.max(30, exerciseCount * 8);

  const bodyParts = React.useMemo(() => {
    const detected = getWorkoutBodyParts(plan.exercises || []);
    if (detected.length > 0) return detected.slice(0, 2);
    if (plan.goalTag) return [plan.goalTag];
    return ['Strength', 'Full Body'];
  }, [plan]);

  const defaultDescription =
    plan.description ||
    'Build strength and muscle with compound movements and focused accessory work.';

  return (
    <div className="fixed inset-0 z-[60] bg-[#171916] text-[#F3F0E7] flex flex-col justify-between max-w-md mx-auto overflow-y-auto animate-fade-in pb-28">
      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#171916]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-[#2C302B]/60">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to workouts"
          className="w-10 h-10 rounded-full bg-[#212420] border border-[#2C302B] flex items-center justify-center text-[#F3F0E7] hover:bg-[#2A2E29] active:scale-95 transition-all cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-xs font-semibold tracking-wider uppercase text-[#858076]">
          Workout Details
        </span>

        <div className="flex items-center gap-2">
          {onShare && (
            <button
              type="button"
              onClick={() => onShare(plan)}
              aria-label="Share workout plan"
              className="w-10 h-10 rounded-full bg-[#212420] border border-[#2C302B] flex items-center justify-center text-[#F3F0E7] hover:bg-[#2A2E29] active:scale-95 transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-[#858076]" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(plan)}
              aria-label="Edit workout plan"
              className="w-10 h-10 rounded-full bg-[#212420] border border-[#2C302B] flex items-center justify-center text-[#F3F0E7] hover:bg-[#2A2E29] active:scale-95 transition-all cursor-pointer"
            >
              <Edit2 className="w-4 h-4 text-[#858076]" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(plan)}
              aria-label="Delete workout plan"
              className="w-10 h-10 rounded-full bg-[#212420] border border-[#2C302B] flex items-center justify-center text-[#F3F0E7] hover:bg-[#2A2E29] active:scale-95 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-[#858076]" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5 flex-1">
        {/* ── Hero Photograph (Reference Screen 11) ───────────────────────── */}
        <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-[#212420] border border-[#2C302B] shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/splash-athlete.jpg"
            alt="Workout hero photograph"
            className="w-full h-full object-cover object-center filter brightness-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#171916] via-transparent to-transparent opacity-90" />
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-[#171916]/80 backdrop-blur-sm border border-[#2C302B] text-2xs font-semibold text-[#F3F0E7] flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#E44427]" />
              {estimatedDuration} min
            </span>
            <span className="px-2.5 py-1 rounded-full bg-[#171916]/80 backdrop-blur-sm border border-[#2C302B] text-2xs font-semibold text-[#F3F0E7] flex items-center gap-1">
              <Flame className="w-3 h-3 text-[#E44427]" />
              {exerciseCount} exercises
            </span>
          </div>
        </div>

        {/* ── Title, Metadata & Description ───────────────────────────────── */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-[#F3F0E7] tracking-tight leading-snug">
            {plan.name.replace(/^Builtin\s+/i, '')}
          </h1>

          <div className="flex items-center gap-2 flex-wrap">
            {bodyParts.map((tag, i) => (
              <span
                key={i}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#212420] text-[#858076] border border-[#2C302B]"
              >
                {tag}
              </span>
            ))}
            <span className="text-xs text-[#858076]">
              {estimatedDuration} min · {exerciseCount} exercises
            </span>
          </div>

          <p className="text-sm text-[#858076] leading-relaxed pt-1">
            {defaultDescription}
          </p>
        </div>

        {/* ── Exercises Section ────────────────────────────────────────────── */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F3F0E7] tracking-tight">
              Exercises
            </h2>
            <span className="text-xs text-[#858076]">
              {exerciseCount} total
            </span>
          </div>

          <div className="space-y-2.5">
            {plan.exercises?.map((ex, idx) => {
              const lastPerf = getLastExercisePerformance(ex.name, workouts);
              const targetSets = ex.targetSets || 3;
              const targetReps = ex.targetReps || 8;
              const targetW = ex.targetWeight;

              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#212420] border border-[#2C302B] flex items-center justify-between gap-3 shadow-xs hover:border-[#858076]/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#2A2E29] border border-[#2C302B] flex items-center justify-center shrink-0 text-[#858076]">
                      <Dumbbell className="w-4 h-4 text-[#E44427]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-[#F3F0E7] truncate">
                        {ex.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-[#858076] mt-0.5">
                        <span>
                          {targetSets} sets · {targetReps} reps
                          {targetW ? ` @ ${targetW} ${ex.targetUnit || userUnit}` : ''}
                        </span>
                        {lastPerf && lastPerf.bestWeight > 0 && (
                          <span className="text-2xs text-[#858076]/80 font-mono">
                            • Prev: {lastPerf.bestWeight} {userUnit} × {lastPerf.bestReps}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-[#858076] shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Fixed Bottom CTA ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-[#171916] via-[#171916]/95 to-transparent z-[70]">
        <button
          type="button"
          onClick={() => onStart(plan)}
          className="w-full py-4 rounded-xl bg-[#E44427] hover:bg-[#d03b20] active:scale-[0.99] text-white font-bold text-base shadow-lg shadow-[#E44427]/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Start Workout</span>
        </button>
      </div>
    </div>
  );
}
