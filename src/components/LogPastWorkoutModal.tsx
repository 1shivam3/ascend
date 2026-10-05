'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Dumbbell,
  Check,
  Clock,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { WorkoutExercise, WorkoutSet, WorkoutEntry, PersonalRecord, PlannedWorkout } from '@/lib/types';
import {
  isBodyweightExercise,
  calculateOneRepMax,
} from '@/lib/strength-standards';
import ExerciseSelectorModal from '@/components/ExerciseSelectorModal';
import { useToast } from '@/components/ui/Toast';

interface LogPastWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (workout: WorkoutEntry) => void;
}

export default function LogPastWorkoutModal({
  isOpen,
  onClose,
  onSaved,
}: LogPastWorkoutModalProps) {
  const profile = useStore((state) => state.profile);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts || []);
  const prs = useStore((state) => state.prs || []);
  const addWorkout = useStore((state) => state.addWorkout);
  const addPR = useStore((state) => state.addPR);
  const toast = useToast();

  const userUnit = profile?.unit || 'kg';
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [date, setDate] = useState(todayStr);
  const [workoutName, setWorkoutName] = useState('Completed Workout');
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [isExerciseSelectorOpen, setIsExerciseSelectorOpen] = useState(false);

  const [exercises, setExercises] = useState<WorkoutExercise[]>([
    {
      name: 'Bench Press',
      sets: [
        { weight: userUnit === 'lbs' ? 135 : 60, reps: 10, unit: userUnit, completed: true },
        { weight: userUnit === 'lbs' ? 135 : 60, reps: 8, unit: userUnit, completed: true },
        { weight: userUnit === 'lbs' ? 135 : 60, reps: 8, unit: userUnit, completed: true },
      ],
    },
  ]);

  if (!isOpen) return null;

  const handleLoadPlan = (plan: PlannedWorkout) => {
    setWorkoutName(plan.name);
    const loaded: WorkoutExercise[] = plan.exercises.map((pEx) => {
      const isBW = isBodyweightExercise(pEx.name);
      const w = isBW ? 0 : (pEx.targetWeight || (userUnit === 'lbs' ? 115 : 50));
      const r = pEx.targetReps || 8;
      const count = Math.max(1, pEx.targetSets || 3);

      const sets: WorkoutSet[] = [];
      for (let i = 0; i < count; i++) {
        sets.push({
          weight: w,
          reps: r,
          unit: userUnit,
          completed: true,
        });
      }

      return {
        name: pEx.name,
        sets,
      };
    });

    setExercises(loaded);
    toast.info(`Loaded ${plan.name} (${loaded.length} exercises)`, 'Template Applied');
  };

  const handleAddExerciseFromLibrary = (selected: { name: string; isBodyweight: boolean; defaultWeightKg?: number; defaultReps?: number }) => {
    const isBW = selected.isBodyweight || isBodyweightExercise(selected.name);
    const defaultW = isBW ? 0 : (selected.defaultWeightKg || (userUnit === 'lbs' ? 115 : 50));
    const defaultR = selected.defaultReps || 8;

    setExercises((prev) => [
      ...prev,
      {
        name: selected.name,
        sets: [
          { weight: defaultW, reps: defaultR, unit: userUnit, completed: true },
          { weight: defaultW, reps: defaultR, unit: userUnit, completed: true },
          { weight: defaultW, reps: defaultR, unit: userUnit, completed: true },
        ],
      },
    ]);
    setIsExerciseSelectorOpen(false);
  };

  const handleRemoveExercise = (idx: number) => {
    if (exercises.length <= 1) {
      toast.error('Workout must have at least one exercise', 'Cannot Remove');
      return;
    }
    setExercises((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddSet = (exIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              weight: lastSet ? lastSet.weight : (userUnit === 'lbs' ? 115 : 50),
              reps: lastSet ? lastSet.reps : 8,
              unit: userUnit,
              completed: true,
            },
          ],
        };
      })
    );
  };

  const handleRemoveSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        if (ex.sets.length <= 1) return ex;
        return {
          ...ex,
          sets: ex.sets.filter((_, j) => j !== setIdx),
        };
      })
    );
  };

  const handleSetChange = (exIdx: number, setIdx: number, field: 'weight' | 'reps', val: string) => {
    const num = parseFloat(val);
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            return {
              ...s,
              [field]: isNaN(num) ? 0 : num,
            };
          }),
        };
      })
    );
  };

  const handleSavePastWorkout = () => {
    const validExercises = exercises.filter((ex) => ex.name.trim() && ex.sets.length > 0);
    if (validExercises.length === 0) {
      toast.error('Please enter at least one exercise with sets.', 'Empty Workout');
      return;
    }

    const durationNum = parseInt(durationMinutes, 10) || 45;
    const workoutId = crypto.randomUUID();

    const entry: WorkoutEntry = {
      id: workoutId,
      date: new Date(`${date}T12:00:00`).toISOString(),
      exercises: validExercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          completed: true,
        })),
      })),
    };

    // Auto-detect PRs
    let newPRsCount = 0;
    validExercises.forEach((ex) => {
      const isBW = isBodyweightExercise(ex.name);
      ex.sets.forEach((s) => {
        const w = parseFloat(String(s.weight)) || 0;
        const r = parseInt(String(s.reps), 10) || 0;
        if (r <= 0) return;
        if (!isBW && w <= 0) return;

        const effectiveW = isBW ? (w > 0 ? (profile?.bodyweightKg || 70) + w : (profile?.bodyweightKg || 70)) : w;
        const current1RM = calculateOneRepMax(effectiveW, r);

        const existingBest = prs
          .filter((p) => p.exercise.toLowerCase() === ex.name.toLowerCase())
          .reduce((max, p) => Math.max(max, p.oneRepMax), 0);

        if (current1RM > existingBest && current1RM > 0) {
          const wKg = userUnit === 'lbs' ? w * 0.453592 : w;
          const wLbs = userUnit === 'kg' ? w * 2.20462 : w;
          const prRecord: PersonalRecord = {
            id: crypto.randomUUID(),
            exercise: ex.name,
            weightKg: Math.round(wKg * 10) / 10,
            weightLbs: Math.round(wLbs * 10) / 10,
            reps: r,
            oneRepMax: Math.round(current1RM * 10) / 10,
            date: entry.date,
            notes: `Auto-detected from past workout: ${workoutName}`,
          };
          addPR(prRecord);
          newPRsCount++;
        }
      });
    });

    addWorkout(entry);
    if (onSaved) onSaved(entry);

    if (newPRsCount > 0) {
      toast.success(`🎉 Workout logged! ${newPRsCount} new PR${newPRsCount > 1 ? 's' : ''} saved!`, 'Workout Saved');
    } else {
      toast.success(`Logged ${validExercises.length} exercises from ${date}`, 'Workout Saved');
    }

    onClose();
  };

  return (
    <>
      <div className="modal-overlay z-50" onClick={onClose}>
        <div
          className="modal-content max-w-lg w-full max-h-[90vh] flex flex-col p-0 overflow-hidden animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-border/80 flex items-center justify-between shrink-0 bg-bg-card">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-text-primary">Log Completed Workout</h2>
                <p className="text-2xs text-text-muted">Record a session after finishing at the gym</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Meta Row: Date, Duration, Name */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-2xs font-mono font-bold uppercase text-text-muted block mb-1">
                  DATE
                </label>
                <input
                  type="date"
                  value={date}
                  max={todayStr}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-bg-secondary border border-border/80 rounded-xl px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-2xs font-mono font-bold uppercase text-text-muted block mb-1">
                  DURATION (MIN)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="45"
                    className="w-full bg-bg-secondary border border-border/80 rounded-xl px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent"
                  />
                  <span className="text-3xs font-mono text-text-muted absolute right-3 top-1/2 -translate-y-1/2">
                    min
                  </span>
                </div>
              </div>

              <div>
                <label className="text-2xs font-mono font-bold uppercase text-text-muted block mb-1">
                  SESSION NAME
                </label>
                <input
                  type="text"
                  value={workoutName}
                  onChange={(e) => setWorkoutName(e.target.value)}
                  placeholder="e.g. Push Day"
                  className="w-full bg-bg-secondary border border-border/80 rounded-xl px-3 py-2 text-xs font-bold text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Quick Template Selector */}
            {plannedWorkouts.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-3xs font-mono font-bold uppercase text-text-muted block">
                  OR PRE-FILL FROM SAVED WORKOUT:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-2xs">
                  {plannedWorkouts.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => handleLoadPlan(plan)}
                      className="px-3 py-1 rounded-full bg-bg-secondary hover:bg-accent/15 border border-border/60 hover:border-accent/40 text-text-secondary hover:text-accent font-semibold whitespace-nowrap transition-all"
                    >
                      {plan.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Exercises List */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-mono font-bold uppercase text-text-muted">
                  EXERCISES ({exercises.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsExerciseSelectorOpen(true)}
                  className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Exercise</span>
                </button>
              </div>

              {exercises.map((ex, exIdx) => {
                const isBW = isBodyweightExercise(ex.name);
                return (
                  <div
                    key={exIdx}
                    className="card p-3.5 bg-bg-card border border-border/80 rounded-2xl space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-3xs font-bold flex items-center justify-center">
                          {exIdx + 1}
                        </span>
                        <h4 className="text-sm font-bold text-text-primary font-sans">{ex.name}</h4>
                        {isBW && (
                          <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">
                            BW
                          </span>
                        )}
                      </div>

                      {exercises.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(exIdx)}
                          className="p-1 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove exercise"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Sets Rows */}
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-12 text-3xs font-mono text-text-muted px-1">
                        <span className="col-span-2">SET</span>
                        <span className="col-span-5">{isBW ? `ADDED WT (${userUnit})` : `WEIGHT (${userUnit})`}</span>
                        <span className="col-span-4">REPS</span>
                        <span className="col-span-1 text-right"></span>
                      </div>

                      {ex.sets.map((set, sIdx) => (
                        <div key={sIdx} className="grid grid-cols-12 gap-1.5 items-center">
                          <span className="col-span-2 text-xs font-mono font-bold text-text-muted pl-1">
                            {sIdx + 1}
                          </span>
                          <div className="col-span-5">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              placeholder={isBW ? '0 (BW)' : '60'}
                              value={set.weight === 0 && isBW ? '' : set.weight}
                              onChange={(e) => handleSetChange(exIdx, sIdx, 'weight', e.target.value)}
                              className="w-full bg-bg-secondary border border-border/80 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
                            />
                          </div>
                          <div className="col-span-4">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              placeholder="8"
                              value={set.reps || ''}
                              onChange={(e) => handleSetChange(exIdx, sIdx, 'reps', e.target.value)}
                              className="w-full bg-bg-secondary border border-border/80 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
                            />
                          </div>
                          <div className="col-span-1 text-right">
                            {ex.sets.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSet(exIdx, sIdx)}
                                className="text-text-muted hover:text-red-400 p-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddSet(exIdx)}
                      className="text-3xs font-bold text-accent hover:underline flex items-center gap-1 pt-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Set</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="p-4 border-t border-border/80 bg-bg-card flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary py-2.5 px-4 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSavePastWorkout}
              className="btn-primary py-2.5 px-5 text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-accent/20 flex-1 sm:flex-initial"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Save to Workout History</span>
            </button>
          </div>
        </div>
      </div>

      <ExerciseSelectorModal
        isOpen={isExerciseSelectorOpen}
        onClose={() => setIsExerciseSelectorOpen(false)}
        onSelectExercise={handleAddExerciseFromLibrary}
      />
    </>
  );
}
