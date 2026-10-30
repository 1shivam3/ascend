'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
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
import { useToday } from '@/lib/use-today';
import { WorkoutExercise, WorkoutSet, WorkoutEntry, PersonalRecord, PlannedWorkout } from '@/lib/types';
import {
  isBodyweightExercise,
  calculateOneRepMax,
  getEffectiveExerciseLoad,
} from '@/lib/strength-standards';
import { MAX_WORKOUT_WEIGHT_KG } from '@/lib/workout-engine';
import ExerciseSelectorModal from '@/components/ExerciseSelectorModal';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';
import { safeRandomId, getLocalTodayStr } from '@/lib/formatters';

interface LogPastWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (workout: WorkoutEntry) => void;
}

const RPE_PRESETS: { value: number; label: string; descKey: StringKey }[] = [
  { value: 0, label: 'No RPE', descKey: 'lp.rpeNone' },
  { value: 6, label: '@6', descKey: 'lp.rpe6' },
  { value: 7, label: '@7', descKey: 'lp.rpe7' },
  { value: 7.5, label: '@7.5', descKey: 'lp.rpe75' },
  { value: 8, label: '@8', descKey: 'lp.rpe8' },
  { value: 8.5, label: '@8.5', descKey: 'lp.rpe85' },
  { value: 9, label: '@9', descKey: 'lp.rpe9' },
  { value: 9.5, label: '@9.5', descKey: 'lp.rpe95' },
  { value: 10, label: '@10', descKey: 'lp.rpe10' },
];

export default function LogPastWorkoutModal({
  isOpen,
  onClose,
  onSaved,
}: LogPastWorkoutModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t } = useTranslation();
  const profile = useStore((state) => state.profile);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts || []);
  const prs = useStore((state) => state.prs || []);
  const addWorkout = useStore((state) => state.addWorkout);
  const addPR = useStore((state) => state.addPR);
  const toast = useToast();

  const userUnit = profile?.unit || 'kg';
  const weightStep = userUnit === 'lbs' ? 5 : 2.5;

  const todayStr = useToday();
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalTodayStr(d);
  }, [todayStr]);

  const [date, setDate] = useState(todayStr);
  const [workoutName, setWorkoutName] = useState(() => t('lp.defaultName'));
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [isExerciseSelectorOpen, setIsExerciseSelectorOpen] = useState(false);
  const [quickPlanId, setQuickPlanId] = useState('');

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
    toast.info(t('lp.toastLoaded', { name: plan.name, count: loaded.length }), t('lp.toastTemplate'));
  };

  /**
   * One-tap "mark as complete": logs the selected planned workout as a fully
   * completed past session on the chosen date — all prescribed sets recorded
   * as completed with prescribed weights/reps. No manual exercise entry.
   */
  const handleQuickLogPlan = () => {
    const plan = plannedWorkouts.find((p) => p.id === quickPlanId);
    if (!plan) {
      toast.error(t('lp.toastPickPlan'), t('lp.toastNoPlan'));
      return;
    }
    const completedExercises: WorkoutExercise[] = plan.exercises.map((pEx) => {
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
          // No fabricated RPE: the user did not rate these sets, and a
          // made-up 8 would feed the progression engine a false signal.
          rpe: undefined,
          completed: true,
          prescribedWeight: pEx.targetWeight,
          prescribedReps: pEx.targetReps,
        });
      }
      return { name: pEx.name, sets };
    });

    const parsedDuration = parseInt(durationMinutes, 10);
    const entry: WorkoutEntry = {
      id: safeRandomId('wk'),
      date: new Date(`${date}T12:00:00`).toISOString(),
      name: plan.name,
      planId: plan.id,
      plannedTotalSets: completedExercises.reduce((n, ex) => n + ex.sets.length, 0),
      // Blank duration stays blank — never invent 45 minutes.
      durationMinutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined,
      exercises: completedExercises,
    };

    addWorkout(entry);
    if (onSaved) onSaved(entry);
    toast.success(t('lp.toastLoggedComplete', { name: plan.name, count: completedExercises.length }), t('lp.toastLogged'));
    onClose();
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
          { weight: defaultW, reps: defaultR, unit: userUnit, rpe: undefined, completed: true },
          { weight: defaultW, reps: defaultR, unit: userUnit, rpe: undefined, completed: true },
          { weight: defaultW, reps: defaultR, unit: userUnit, rpe: undefined, completed: true },
        ],
      },
    ]);
    setIsExerciseSelectorOpen(false);
  };

  const handleRemoveExercise = (idx: number) => {
    if (exercises.length <= 1) {
      toast.error(t('lp.toastMinOne'), t('lp.toastCannotRemove'));
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
    const validExercises = exercises
      .map((ex) => {
        const isBW = isBodyweightExercise(ex.name);
        const validSets = ex.sets
          .filter((s) => {
            const r = parseInt(String(s.reps), 10) || 0;
            const w = parseFloat(String(s.weight)) || 0;
            return r > 0 && (w > 0 || isBW || s.isWarmup);
          })
          .map((s) => ({
            ...s,
            completed: true,
            reps: parseInt(String(s.reps), 10) || 0,
            weight: parseFloat(String(s.weight)) || 0,
          }));
        return {
          ...ex,
          sets: validSets,
        };
      })
      .filter((ex) => ex.name.trim() && ex.sets.length > 0);

    if (validExercises.length === 0) {
      toast.error(t('lp.toastEmpty'), t('lp.toastEmptyT'));
      return;
    }

    const workoutId = safeRandomId('wk');

    const parsedDuration = parseInt(durationMinutes, 10);
    const entry: WorkoutEntry = {
      id: workoutId,
      date: new Date(`${date}T12:00:00`).toISOString(),
      // FE-04 (audit-3): the form collects a name and a duration, but
      // this entry used to drop both — the saved workout lost the
      // name the user typed, and the Coach's Take downstream had
      // nothing real to show. Blank duration stays blank, exactly
      // like the quick-log path — never invent 45 minutes.
      name: workoutName,
      durationMinutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined,
      exercises: validExercises,
    };

    // Auto-detect PRs
    let newPRsCount = 0;
    const userBW = profile?.bodyweightKg || 75;
    validExercises.forEach((ex) => {
      const isBW = isBodyweightExercise(ex.name);
      ex.sets.forEach((s) => {
        if (s.isWarmup) return;
        const w = parseFloat(String(s.weight)) || 0;
        const r = parseInt(String(s.reps), 10) || 0;
        if (r <= 0) return;
        if (!isBW && w <= 0) return;

        const wKg = userUnit === 'lbs' ? w * 0.453592 : w;
        const effectiveLoadKg = getEffectiveExerciseLoad(ex.name, wKg, userBW);
        const current1RM = calculateOneRepMax(effectiveLoadKg, r);
        // SIM-P1-06: above-cap loads never mint PRs (typo guard, same
        // 500 kg ceiling as the live workout flow).

        const existingBest = prs
          .filter((p) => p.exercise.toLowerCase() === ex.name.toLowerCase())
          .reduce((max, p) => Math.max(max, p.oneRepMax), 0);

        if (current1RM > existingBest && current1RM > 0 && wKg <= MAX_WORKOUT_WEIGHT_KG) {
          const wLbs = userUnit === 'kg' ? w * 2.20462 : w;
          const prRecord: PersonalRecord = {
            id: safeRandomId('pr'),
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
      toast.success(t(newPRsCount > 1 ? 'lp.toastSavedPr' : 'lp.toastSavedPrOne', { count: newPRsCount }), t('lp.toastSavedT'));
    } else {
      toast.success(t('lp.toastSaved', { count: validExercises.length, date }), t('lp.toastSavedT'));
    }

    onClose();
  };

  return (
    <>
      <div ref={modalRef} {...dialogProps} className="modal-overlay z-50" onClick={onClose}>
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
                  {t('lp.title')}
                </h2>
                <p className="text-xs text-text-muted">
                  {t('lp.subtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Summary Strip */}
          <div className="px-4 sm:px-5 py-2.5 bg-bg-secondary/60 border-b border-border/50 flex items-center justify-between text-2xs text-text-secondary">
            <div className="flex items-center gap-3 font-mono">
              <span>{t('lp.exercisesCount', { count: exercises.length })}</span>
              <span>•</span>
              <span>{t('lp.setsCount', { count: sessionStats.totalSets })}</span>
              <span>•</span>
              <span className="text-accent font-semibold">{t('lp.volume', { volume: sessionStats.totalVolume, unit: userUnit })}</span>
            </div>
            <span className="text-2xs text-text-muted font-mono uppercase tracking-wider">
              {t('lp.autoPr')}
            </span>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Meta Row: Date, Duration, Session Name */}
            <div className="p-3.5 rounded-2xl bg-bg-secondary/40 border border-border/60 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Quick Log: mark a planned workout complete in one tap */}
                {plannedWorkouts.length > 0 && (
                  <div className="sm:col-span-3 p-3 rounded-xl bg-accent/5 border border-accent/25 space-y-2">
                    <span className="text-2xs font-mono font-bold uppercase tracking-wider text-accent-text block">
                      {t('lp.quickLog')}
                    </span>
                    <div className="flex gap-2">
                      <select
                        value={quickPlanId}
                        onChange={(e) => setQuickPlanId(e.target.value)}
                        className="flex-1 bg-bg-card border border-border/80 rounded-xl px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-accent"
                        aria-label={t('lp.chooseAria')}
                      >
                        <option value="">{t('lp.choose')}</option>
                        {plannedWorkouts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {t(p.exercises.length === 1 ? 'lp.planOptionOne' : 'lp.planOption', { name: p.name, count: p.exercises.length })}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleQuickLogPlan}
                        disabled={!quickPlanId}
                        className="btn-primary px-4 py-2 text-xs font-bold disabled:opacity-40 shrink-0"
                      >
                        {t('lp.logComplete')}
                      </button>
                    </div>
                    <p className="text-2xs text-text-muted">
                      {t('lp.quickHint')}
                    </p>
                  </div>
                )}
                {/* Date */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-2xs font-mono font-semibold uppercase text-text-muted">
                      {t('lp.date')}
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDate(todayStr)}
                        className={`text-2xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                          date === todayStr ? 'bg-accent text-bg-primary font-bold' : 'text-text-muted hover:text-accent-text bg-bg-card'
                        }`}
                      >
                        {t('lp.today')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDate(yesterdayStr)}
                        className={`text-2xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                          date === yesterdayStr ? 'bg-accent text-bg-primary font-bold' : 'text-text-muted hover:text-accent-text bg-bg-card'
                        }`}
                      >
                        {t('lp.yesterday')}
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
                    {t('lp.duration')}
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
                    <span className="text-2xs font-mono text-text-muted absolute right-3 top-1/2 -translate-y-1/2">
                      {t('lp.min')}
                    </span>
                  </div>
                </div>

                {/* Session Name */}
                <div>
                  <label className="text-2xs font-mono font-semibold uppercase text-text-muted block mb-1">
                    {t('lp.sessionTitle')}
                  </label>
                  <input
                    type="text"
                    value={workoutName}
                    onChange={(e) => setWorkoutName(e.target.value)}
                    placeholder={t('lp.titlePlaceholder')}
                    className="w-full bg-bg-card border border-border/80 rounded-xl px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Quick Template Selector */}
              {plannedWorkouts.length > 0 && (
                <div className="pt-1 border-t border-border/40">
                  <span className="text-2xs font-mono font-semibold uppercase text-text-muted block mb-1.5">
                    {t('lp.prefill')}
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
                  <span>{t('lp.exercises')}</span>
                  <span className="text-2xs font-mono text-text-muted">({exercises.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsExerciseSelectorOpen(true)}
                  className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 rounded-xl border border-accent/30 text-accent-text hover:border-accent cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('lp.addExercise')}</span>
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
                        <span className="w-6 h-6 rounded-lg bg-accent/15 text-accent-text font-mono text-xs font-bold flex items-center justify-center">
                          {exIdx + 1}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-text-primary leading-tight">{ex.name}</h4>
                          <span className="text-2xs text-text-muted font-mono">
                            {isBW ? t('lp.bodyweight') : t('lp.loaded', { unit: userUnit })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAddSet(exIdx)}
                          className="text-xs font-semibold text-accent-text hover:bg-accent/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('lp.set')}</span>
                        </button>
                        {exercises.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(exIdx)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title={t('lp.removeExercise')}
                            aria-label={t('lp.removeExercise')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* SIM-P2-07: pain on past workouts — previously only
                            the live "Hurts" swap created pain episodes, so
                            backfilled history undercounted pain. */}
                        <button
                          type="button"
                          onClick={() => setExercises((prev) => prev.map((e, i) => i === exIdx ? { ...e, reportsPain: !e.reportsPain } : e))}
                          title={t('lp.painToggleHint')}
                            aria-label={t('lp.painToggleHint')}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors cursor-pointer ${ex.reportsPain ? 'text-red-400 bg-red-500/10' : 'text-text-muted hover:text-red-400 hover:bg-red-500/10'}`}
                        >
                          {ex.reportsPain ? '✓ ' : ''}{t('lp.painToggle')}
                        </button>
                      </div>
                    </div>

                    {/* Sets Table */}
                    <div className="space-y-2">
                      {/* Table Column Labels */}
                      <div className="grid grid-cols-12 gap-2 text-[0.625rem] font-mono font-semibold uppercase text-text-muted px-1">
                        <span className="col-span-1 text-center">#</span>
                        <span className="col-span-5 text-center">{isBW ? t('lp.added', { unit: userUnit }) : t('lp.load', { unit: userUnit })}</span>
                        <span className="col-span-3 text-center">{t('lp.reps')}</span>
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
                            <span className="text-2xs font-mono text-text-muted ml-1 shrink-0">{userUnit}</span>
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
                            <span className="text-2xs font-mono text-text-muted ml-1 shrink-0">{t('lp.repsUnit')}</span>
                          </div>

                          {/* RPE Selector */}
                          <div className="col-span-2">
                            <select
                              value={set.rpe || 0}
                              onChange={(e) => handleSetChange(exIdx, sIdx, 'rpe', e.target.value)}
                              className="w-full bg-bg-secondary border border-border/60 rounded-xl px-1.5 py-1.5 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent cursor-pointer text-center truncate"
                              title={t('lp.rpeTitle')}
                            aria-label={t('lp.rpeTitle')}
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
                                title={t('lp.removeSet')}
                            aria-label={t('lp.removeSet')}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDuplicateSet(exIdx, sIdx)}
                                className="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                                title={t('lp.duplicateSet')}
                            aria-label={t('lp.duplicateSet')}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Quick Weight Adjust Chips for Active Set */}
                      <div className="flex items-center justify-between pt-1 px-1">
                        <span className="text-2xs font-mono text-text-muted">
                          {t('lp.quickStep', { unit: userUnit })}
                        </span>
                        <div className="flex items-center gap-1">
                          {[-weightStep * 2, -weightStep, weightStep, weightStep * 2].map((delta) => (
                            <button
                              key={delta}
                              type="button"
                              onClick={() => handleAdjustWeight(exIdx, ex.sets.length - 1, delta)}
                              className="px-2 py-0.5 rounded-lg bg-bg-secondary hover:bg-bg-tertiary border border-border/60 text-text-secondary hover:text-text-primary text-[0.625rem] font-mono font-bold active:scale-95 transition-all cursor-pointer"
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
              className="w-full py-3.5 rounded-2xl border-2 border-dashed border-border/80 hover:border-accent/60 bg-bg-secondary/30 hover:bg-accent/5 text-text-secondary hover:text-accent-text font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('lp.addAnother')}</span>
            </button>
          </div>

          {/* Footer Save Button */}
          <div className="p-4 sm:p-5 border-t border-border/70 bg-bg-card/90 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary py-2.5 px-4 text-xs font-semibold rounded-xl cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSavePastWorkout}
              className="btn-primary py-2.5 px-6 text-xs font-bold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-accent/20 flex-1 sm:flex-initial cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{t('lp.save', { count: exercises.length })}</span>
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
