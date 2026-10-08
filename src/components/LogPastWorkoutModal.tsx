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
  Copy,
  Gauge,
  Sparkles,
  Info,
  ChevronRight,
  Flame,
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

const RPE_PRESETS = [
  { value: 0, label: 'No RPE', desc: 'Not tracked' },
  { value: 6, label: '@6', desc: 'Warmup / very easy (4+ reps in reserve)' },
  { value: 7, label: '@7', desc: 'Easy effort (3 reps in reserve)' },
  { value: 7.5, label: '@7.5', desc: 'Solid effort (2–3 reps in reserve)' },
  { value: 8, label: '@8', desc: 'Standard work set (2 reps in reserve)' },
  { value: 8.5, label: '@8.5', desc: 'Hard work set (1–2 reps in reserve)' },
  { value: 9, label: '@9', desc: 'Heavy effort (1 rep in reserve)' },
  { value: 9.5, label: '@9.5', desc: 'Near max (maybe 1 rep left)' },
  { value: 10, label: '@10', desc: 'Maximum effort (0 reps left)' },
];

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
  const weightStep = userUnit === 'lbs' ? 5 : 2.5;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [date, setDate] = useState(todayStr);
  const [workoutName, setWorkoutName] = useState('Completed Workout');
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [isExerciseSelectorOpen, setIsExerciseSelectorOpen] = useState(false);

  const [exercises, setExercises] = useState<WorkoutExercise[]>([
    {
      name: 'Bench Press',
      sets: [
        { weight: userUnit === 'lbs' ? 135 : 60, reps: 10, unit: userUnit, rpe: 8, completed: true },
        { weight: userUnit === 'lbs' ? 135 : 60, reps: 8, unit: userUnit, rpe: 8, completed: true },
        { weight: userUnit === 'lbs' ? 135 : 60, reps: 8, unit: userUnit, rpe: 8.5, completed: true },
      ],
    },
  ]);

  // Compute live session stats
  const sessionStats = useMemo(() => {
    let totalSets = 0;
    let totalVolume = 0;

    exercises.forEach((ex) => {
      ex.sets.forEach((s) => {
        const w = parseFloat(String(s.weight)) || 0;
        const r = parseInt(String(s.reps), 10) || 0;
        if (r > 0) {
          totalSets += 1;
          totalVolume += w * r;
        }
      });
    });

    return {
      totalSets,
      totalVolume: Math.round(totalVolume),
    };
  }, [exercises]);

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
          rpe: 8,
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
          { weight: defaultW, reps: defaultR, unit: userUnit, rpe: 8, completed: true },
          { weight: defaultW, reps: defaultR, unit: userUnit, rpe: 8, completed: true },
          { weight: defaultW, reps: defaultR, unit: userUnit, rpe: 8, completed: true },
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
              rpe: lastSet?.rpe || 8,
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

  const handleDuplicateSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const targetSet = ex.sets[setIdx];
        const clonedSet: WorkoutSet = {
          weight: targetSet ? targetSet.weight : (userUnit === 'lbs' ? 115 : 50),
          reps: targetSet ? targetSet.reps : 8,
          unit: userUnit,
          rpe: targetSet?.rpe || 8,
          completed: true,
        };
        const updated = [...ex.sets];
        updated.splice(setIdx + 1, 0, clonedSet);
        return {
          ...ex,
          sets: updated,
        };
      })
    );
  };

  const handleSetChange = (exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rpe', val: string | number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            if (field === 'rpe') {
              const num = typeof val === 'number' ? val : parseFloat(val);
              return {
                ...s,
                rpe: isNaN(num) || num <= 0 ? undefined : num,
              };
            }
            if (val === '') {
              return {
                ...s,
                [field]: '' as any,
              };
            }
            const num = typeof val === 'number' ? val : (field === 'reps' ? parseInt(val, 10) : parseFloat(val));
            return {
              ...s,
              [field]: isNaN(num) ? (field === 'reps' ? 1 : 0) : num,
            };
          }),
        };
      })
    );
  };

  const handleSetBlur = (exIdx: number, setIdx: number, field: 'weight' | 'reps') => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const current = s[field];
            if ((current as any) === '' || current === undefined || isNaN(Number(current))) {
              return {
                ...s,
                [field]: field === 'reps' ? 1 : 0,
              };
            }

            return s;
          }),
        };
      })
    );
  };


  const handleAdjustWeight = (exIdx: number, setIdx: number, delta: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const currentW = parseFloat(String(s.weight)) || 0;
            const nextW = Math.max(0, Math.round((currentW + delta) * 10) / 10);
            return {
              ...s,
              weight: nextW,
            };
          }),
        };
      })
    );
  };

  const handleAdjustReps = (exIdx: number, setIdx: number, delta: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const currentR = parseInt(String(s.reps), 10) || 0;
            const nextR = Math.max(1, currentR + delta);
            return {
              ...s,
              reps: nextR,
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
            notes: `Logged past workout: ${workoutName}${s.rpe ? ` @${s.rpe}` : ''}`,
          };
          addPR(prRecord);
          newPRsCount++;
        }
      });
    });

    addWorkout(entry);
    if (onSaved) onSaved(entry);

    if (newPRsCount > 0) {
      toast.success(`Workout logged! ${newPRsCount} new PR${newPRsCount > 1 ? 's' : ''} saved!`, 'Workout Saved');
    } else {
      toast.success(`Logged ${validExercises.length} exercises from ${date}`, 'Workout Saved');
    }

    onClose();
  };

  return (
    <>
      <div className="modal-overlay z-50" onClick={onClose}>
        <div
          className="modal-content max-w-lg w-full max-h-[92vh] flex flex-col p-0 overflow-hidden animate-scale-in rounded-3xl border border-border shadow-2xl bg-bg-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-border/70 flex items-center justify-between shrink-0 bg-bg-card/90 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent">
                <Dumbbell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
                  Log Past Workout
                </h2>
                <p className="text-xs text-text-muted">
                  Record your completed gym session with weights, reps &amp; RPE
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Summary Strip */}
          <div className="px-4 sm:px-5 py-2.5 bg-bg-secondary/60 border-b border-border/50 flex items-center justify-between text-2xs text-text-secondary">
            <div className="flex items-center gap-3 font-mono">
              <span>{exercises.length} Exercises</span>
              <span>•</span>
              <span>{sessionStats.totalSets} Sets</span>
              <span>•</span>
              <span className="text-accent font-semibold">{sessionStats.totalVolume} {userUnit} Volume</span>
            </div>
            <span className="text-3xs text-text-muted font-mono uppercase tracking-wider">
              AUTO PR TRACKING ON
            </span>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Meta Row: Date, Duration, Session Name */}
            <div className="p-3.5 rounded-2xl bg-bg-secondary/40 border border-border/60 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Date */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-2xs font-mono font-semibold uppercase text-text-muted">
                      DATE
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDate(todayStr)}
                        className={`text-3xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                          date === todayStr ? 'bg-accent text-bg-primary font-bold' : 'text-text-muted hover:text-accent bg-bg-card'
                        }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setDate(yesterdayStr)}
                        className={`text-3xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                          date === yesterdayStr ? 'bg-accent text-bg-primary font-bold' : 'text-text-muted hover:text-accent bg-bg-card'
                        }`}
                      >
                        Yesterday
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={date}
                    max={todayStr}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-bg-card border border-border/80 rounded-xl px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent"
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="text-2xs font-mono font-semibold uppercase text-text-muted block mb-1">
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
                      className="w-full bg-bg-card border border-border/80 rounded-xl px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent"
                    />
                    <span className="text-3xs font-mono text-text-muted absolute right-3 top-1/2 -translate-y-1/2">
                      min
                    </span>
                  </div>
                </div>

                {/* Session Name */}
                <div>
                  <label className="text-2xs font-mono font-semibold uppercase text-text-muted block mb-1">
                    SESSION TITLE
                  </label>
                  <input
                    type="text"
                    value={workoutName}
                    onChange={(e) => setWorkoutName(e.target.value)}
                    placeholder="e.g. Upper Body Focus"
                    className="w-full bg-bg-card border border-border/80 rounded-xl px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Quick Template Selector */}
              {plannedWorkouts.length > 0 && (
                <div className="pt-1 border-t border-border/40">
                  <span className="text-3xs font-mono font-semibold uppercase text-text-muted block mb-1.5">
                    OR PRE-FILL FROM SAVED WORKOUT:
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-2xs">
                    {plannedWorkouts.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => handleLoadPlan(plan)}
                        className="px-3 py-1 rounded-full bg-bg-card hover:bg-accent/15 border border-border hover:border-accent/40 text-text-secondary hover:text-accent font-semibold whitespace-nowrap transition-all active:scale-95 cursor-pointer"
                      >
                        {plan.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Exercises List */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>Exercises</span>
                  <span className="text-2xs font-mono text-text-muted">({exercises.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsExerciseSelectorOpen(true)}
                  className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 rounded-xl border border-accent/30 text-accent hover:border-accent cursor-pointer"
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
                    className="p-4 bg-bg-secondary/40 border border-border/80 rounded-2xl space-y-3 shadow-xs hover:border-border transition-colors"
                  >
                    {/* Exercise Card Header */}
                    <div className="flex items-center justify-between pb-1 border-b border-border/50">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-accent/15 text-accent font-mono text-xs font-bold flex items-center justify-center">
                          {exIdx + 1}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-text-primary leading-tight">{ex.name}</h4>
                          <span className="text-3xs text-text-muted font-mono">
                            {isBW ? 'Bodyweight Movement' : `Loaded Exercise (${userUnit})`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAddSet(exIdx)}
                          className="text-xs font-semibold text-accent hover:bg-accent/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Set</span>
                        </button>
                        {exercises.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(exIdx)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Remove exercise"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sets Table */}
                    <div className="space-y-2">
                      {/* Table Column Labels */}
                      <div className="grid grid-cols-12 gap-2 text-[10px] font-mono font-semibold uppercase text-text-muted px-1">
                        <span className="col-span-1 text-center">#</span>
                        <span className="col-span-5 text-center">{isBW ? `ADDED (${userUnit})` : `LOAD (${userUnit})`}</span>
                        <span className="col-span-3 text-center">REPS</span>
                        <span className="col-span-2 text-center">RPE</span>
                        <span className="col-span-1 text-right"></span>
                      </div>

                      {/* Set Rows */}
                      {ex.sets.map((set, sIdx) => (
                        <div
                          key={sIdx}
                          className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-bg-card/70 border border-border/50 hover:border-border transition-colors"
                        >
                          {/* Set Number */}
                          <span className="col-span-1 text-xs font-mono font-bold text-text-muted text-center">
                            {sIdx + 1}
                          </span>

                          {/* Weight Input Box */}
                          <div className="col-span-5 flex items-center bg-bg-secondary border border-border/60 rounded-xl px-2.5 py-1.5 focus-within:border-accent">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder={isBW ? '0 (BW)' : '60'}
                              value={set.weight === 0 && isBW ? '' : (set.weight ?? '')}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  handleSetChange(exIdx, sIdx, 'weight', val);
                                }
                              }}
                              onBlur={() => handleSetBlur(exIdx, sIdx, 'weight')}
                              className="w-full text-center font-mono font-bold text-xs sm:text-sm text-text-primary bg-transparent outline-none p-0 tabular-nums"
                            />
                            <span className="text-3xs font-mono text-text-muted ml-1 shrink-0">{userUnit}</span>
                          </div>

                          {/* Reps Input Box */}
                          <div className="col-span-3 flex items-center bg-bg-secondary border border-border/60 rounded-xl px-2 py-1.5 focus-within:border-accent">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="8"
                              value={set.reps ?? ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*$/.test(val)) {
                                  handleSetChange(exIdx, sIdx, 'reps', val);
                                }
                              }}
                              onBlur={() => handleSetBlur(exIdx, sIdx, 'reps')}
                              className="w-full text-center font-mono font-bold text-xs sm:text-sm text-text-primary bg-transparent outline-none p-0 tabular-nums"
                            />
                            <span className="text-3xs font-mono text-text-muted ml-1 shrink-0">reps</span>
                          </div>

                          {/* RPE Selector */}
                          <div className="col-span-2">
                            <select
                              value={set.rpe || 0}
                              onChange={(e) => handleSetChange(exIdx, sIdx, 'rpe', e.target.value)}
                              className="w-full bg-bg-secondary border border-border/60 rounded-xl px-1.5 py-1.5 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent cursor-pointer text-center truncate"
                              title="Rate of Perceived Exertion (RPE)"
                            >
                              {RPE_PRESETS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.value === 0 ? '-' : p.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Actions (Duplicate / Delete) */}
                          <div className="col-span-1 flex items-center justify-end gap-1">
                            {ex.sets.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveSet(exIdx, sIdx)}
                                className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                title="Remove set"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDuplicateSet(exIdx, sIdx)}
                                className="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                                title="Duplicate set"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Quick Weight Adjust Chips for Active Set */}
                      <div className="flex items-center justify-between pt-1 px-1">
                        <span className="text-3xs font-mono text-text-muted">
                          Quick step ({userUnit}):
                        </span>
                        <div className="flex items-center gap-1">
                          {[-weightStep * 2, -weightStep, weightStep, weightStep * 2].map((delta) => (
                            <button
                              key={delta}
                              type="button"
                              onClick={() => handleAdjustWeight(exIdx, ex.sets.length - 1, delta)}
                              className="px-2 py-0.5 rounded-lg bg-bg-secondary hover:bg-bg-tertiary border border-border/60 text-text-secondary hover:text-text-primary text-[10px] font-mono font-bold active:scale-95 transition-all cursor-pointer"
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Bottom Add Exercise CTA */}
            <button
              type="button"
              onClick={() => setIsExerciseSelectorOpen(true)}
              className="w-full py-3.5 rounded-2xl border-2 border-dashed border-border/80 hover:border-accent/60 bg-bg-secondary/30 hover:bg-accent/5 text-text-secondary hover:text-accent font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Another Exercise to Workout</span>
            </button>
          </div>

          {/* Footer Save Button */}
          <div className="p-4 sm:p-5 border-t border-border/70 bg-bg-card/90 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary py-2.5 px-4 text-xs font-semibold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSavePastWorkout}
              className="btn-primary py-2.5 px-6 text-xs font-bold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-accent/20 flex-1 sm:flex-initial cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Save {exercises.length} Exercises to History</span>
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
