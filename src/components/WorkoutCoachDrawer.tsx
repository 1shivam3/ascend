'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { AIWorkoutCommandResult } from '@/lib/types';
import { fetchWorkoutCommand } from '@/lib/ai-coach';
import {
  Bot,
  X,
  Sparkles,
  Clock,
  Dumbbell,
  BatteryLow,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Send
} from 'lucide-react';

interface WorkoutCoachDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkout: {
    name: string;
    exercises: Array<{
      name: string;
      sets: Array<{ reps: number; weight: number; unit: string }>;
    }>;
  };
  onApplyModifiedWorkout: (modifiedExercises: any[]) => void;
}

const COMMAND_PRESETS = [
  { label: 'Only have 30 mins', icon: Clock, prompt: 'Only have 30 minutes today' },
  { label: 'Gym is crowded', icon: Dumbbell, prompt: 'Gym is crowded, replace machine/cable stations with open dumbbells' },
  { label: 'Feeling low energy', icon: BatteryLow, prompt: 'Feeling low energy today, adjust load for technical recovery' },
  { label: 'Should I increase weight?', icon: TrendingUp, prompt: 'Should I increase weight on my primary lift today?' },
];

export default function WorkoutCoachDrawer({
  isOpen,
  onClose,
  activeWorkout,
  onApplyModifiedWorkout,
}: WorkoutCoachDrawerProps) {
  const store = useStore();
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIWorkoutCommandResult | null>(null);

  if (!isOpen) return null;

  const handleSendCommand = async (instruction: string) => {
    if (!instruction.trim()) return;
    setLoading(true);
    try {
      const res = await fetchWorkoutCommand(store, instruction, activeWorkout);
      setResponse(res);
      setInputText('');
    } catch (err) {
      console.error('Failed to execute workout command:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (response?.modifiedExercises && response.modifiedExercises.length > 0) {
      // Map back to WorkoutExercise format
      const mapped = response.modifiedExercises.map((e) => ({
        name: e.exercise,
        sets: Array.from({ length: e.sets }).map(() => ({
          weight: e.targetWeightKg,
          reps: parseInt(e.reps) || 8,
          unit: store.profile?.unit || 'kg',
        })),
      }));
      onApplyModifiedWorkout(mapped);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 shadow-2xl relative animate-slide-up sm:animate-scale-up space-y-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text-primary">
                Ask In-Workout Coach
              </h3>
              <p className="text-2xs text-text-muted">
                Active: <span className="font-semibold text-text-secondary">{activeWorkout.name || 'Current Workout'}</span> ({activeWorkout.exercises.length} moves)
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

        {/* Quick Command Chips */}
        <div className="space-y-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted block">
            Instant Workout Adjustments
          </span>
          <div className="grid grid-cols-2 gap-2">
            {COMMAND_PRESETS.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.label}
                  type="button"
                  onClick={() => handleSendCommand(cmd.prompt)}
                  disabled={loading}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-border-light dark:border-border-dark bg-bg-secondary hover:border-accent text-left transition-all text-xs font-semibold text-text-primary disabled:opacity-50"
                >
                  <Icon className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate">{cmd.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendCommand(inputText);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask anything or request a tweak..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-border-light dark:border-border-dark bg-bg-secondary text-text-primary text-xs focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="p-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>

        {/* Response Area */}
        {loading && (
          <div className="py-6 text-center space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin text-accent mx-auto" />
            <p className="text-xs text-text-muted font-medium">
              Coach adapting active workout...
            </p>
          </div>
        )}

        {response && !loading && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-2xs">
              <span className="font-bold uppercase tracking-wider text-accent">
                {response.summary}
              </span>
              <span className="text-3xs text-text-muted">Direct Guidance</span>
            </div>

            <p className="text-xs text-text-primary leading-relaxed font-medium">
              {response.coachAdvice}
            </p>

            {response.modifiedExercises && response.modifiedExercises.length > 0 && (
              <div className="pt-2 border-t border-accent/20 space-y-2">
                <span className="text-2xs font-semibold text-text-muted block">
                  New Adjusted Workout Layout:
                </span>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {response.modifiedExercises.map((e, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-white/70 dark:bg-[#161b22] text-xs flex justify-between items-center"
                    >
                      <span className="font-semibold text-text-primary">{e.exercise}</span>
                      <span className="text-accent font-mono text-2xs font-bold">
                        {e.sets} sets × {e.reps}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleApply}
                  className="w-full py-2.5 px-3 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Apply Changes to Workout</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
