'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Dumbbell,
  Trophy,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Bot,
  Layers,
  ArrowRightLeft,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { WorkoutExercise, WorkoutSet, WorkoutEntry, PersonalRecord } from '@/lib/types';
import { isMainCompoundLift, calculateOneRepMax, getEquipmentType } from '@/lib/strength-standards';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  getQuickSubstitutes,
} from '@/lib/workout-engine';
import { calculatePlates, PlateInfo } from '@/lib/plate-calculator';
import { useToast } from '@/components/ui/Toast';

interface ActiveWorkoutScreenProps {
  initialExercises: WorkoutExercise[];
  workoutName?: string;
  onFinish: (workout: WorkoutEntry, newPRsCount: number) => void;
  onCancel: () => void;
}

export default function ActiveWorkoutScreen({
  initialExercises,
  workoutName = 'Workout Session',
  onFinish,
  onCancel,
}: ActiveWorkoutScreenProps) {
  const { profile, workouts, addPR, prs } = useStore();
  const toast = useToast();
  const userUnit = profile?.unit || 'kg';

  // Session state
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => {
    if (initialExercises && initialExercises.length > 0) {
      return initialExercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({
          ...s,
          unit: s.unit || userUnit,
          completed: s.completed || false,
        })),
      }));
    }
    return [
      {
        name: 'Bench Press',
        sets: [
          { weight: 60, reps: 8, unit: userUnit, completed: false, rpe: 8 },
          { weight: 60, reps: 8, unit: userUnit, completed: false, rpe: 8 },
          { weight: 60, reps: 8, unit: userUnit, completed: false, rpe: 8 },
        ],
      },
    ];
  });

  const [activeExerciseIdx, setActiveExerciseIdx] = useState<number>(0);
  const [sessionStartTime] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Modals & Panels
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [plateTargetWeight, setPlateTargetWeight] = useState<number>(60);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isWarmupModalOpen, setIsWarmupModalOpen] = useState(false);
  const [warmupWorkingWeight, setWarmupWorkingWeight] = useState<number>(60);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');

  // Sticky Rest Timer state
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(180);
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [isRestRunning, setIsRestRunning] = useState<boolean>(false);
  const [isRestFinished, setIsRestFinished] = useState<boolean>(false);

  // Current active exercise
  const currentExercise = exercises[activeExerciseIdx] || exercises[0];

  // Check if current exercise is a main compound lift (Bench, Squat, Deadlift, OHP)
  const isCurrentMainLift = useMemo(() => {
    if (!currentExercise) return false;
    return isMainCompoundLift(currentExercise.name);
  }, [currentExercise]);

  // Elapsed workout timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  // Countdown Rest Timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRestRunning && restSecondsLeft > 0) {
      interval = setInterval(() => {
        setRestSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsRestRunning(false);
            setIsRestFinished(true);
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([100, 50, 100, 50, 200]);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRestRunning, restSecondsLeft]);

  // Start rest timer
  const startTimer = useCallback(
    (seconds?: number) => {
      const defaultSec = isCurrentMainLift ? 180 : 90;
      const targetSec = seconds || restTotalSeconds || defaultSec;
      setRestTotalSeconds(targetSec);
      setRestSecondsLeft(targetSec);
      setIsRestRunning(true);
      setIsRestFinished(false);
    },
    [isCurrentMainLift, restTotalSeconds]
  );

  const togglePauseTimer = () => {
    if (restSecondsLeft === 0) {
      startTimer();
    } else {
      setIsRestRunning((prev) => !prev);
    }
  };

  const adjustTimer = (delta: number) => {
    setRestSecondsLeft((prev) => Math.max(0, prev + delta));
  };

  const skipTimer = () => {
    setRestSecondsLeft(0);
    setIsRestRunning(false);
    setIsRestFinished(false);
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Performance history & Smart Progression for current exercise
  const lastPerf = useMemo(() => {
    if (!currentExercise?.name) return null;
    return getLastExercisePerformance(currentExercise.name, workouts);
  }, [currentExercise?.name, workouts]);

  const progRec = useMemo(() => {
    if (!currentExercise?.name) return null;
    return getProgressionRecommendation(currentExercise.name, workouts, userUnit);
  }, [currentExercise?.name, workouts, userUnit]);

  // Weight & Reps handlers (direct typing + steppers)
  const handleSetWeightChange = (setIdx: number, val: string | number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            return { ...s, weight: val as any };
          }),
        };
      })
    );
  };

  const handleWeightStep = (setIdx: number, step: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const currentW = parseFloat(String(s.weight)) || 0;
            const newW = Math.max(0, Math.round((currentW + step) * 10) / 10);
            return { ...s, weight: newW };
          }),
        };
      })
    );
  };

  const handleSetRepsChange = (setIdx: number, val: string | number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            return { ...s, reps: val as any };
          }),
        };
      })
    );
  };

  const handleRepsStep = (setIdx: number, step: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const currentR = parseInt(String(s.reps), 10) || 0;
            const newR = Math.max(1, currentR + step);
            return { ...s, reps: newR };
          }),
        };
      })
    );
  };

  const handleRPESelect = (setIdx: number, rpe: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, rpe } : s)),
        };
      })
    );
  };

  const handleToggleSetComplete = (setIdx: number) => {
    const isNowCompleted = !currentExercise.sets[setIdx].completed;

    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, completed: isNowCompleted } : s)),
        };
      })
    );

    if (isNowCompleted) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
      // Auto start rest timer (3 min for main lifts, 90s for accessories)
      const restDuration = isCurrentMainLift ? 180 : 90;
      startTimer(restDuration);
      toast.info(
        `Set ${setIdx + 1} logged! Rest timer started (${restDuration >= 60 ? `${restDuration / 60}m` : `${restDuration}s`}).`,
        'Set Complete'
      );
    }
  };

  const handleAddSet = () => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const newWeight = lastSet ? (parseFloat(String(lastSet.weight)) || 0) : 60;
        const newReps = lastSet ? (parseInt(String(lastSet.reps), 10) || 0) : 8;
        return {
          ...ex,
          sets: [
            ...ex.sets,
            { weight: newWeight, reps: newReps, unit: userUnit, completed: false, rpe: 8 },
          ],
        };
      })
    );
  };

  const handleRemoveSet = (setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.filter((_, j) => j !== setIdx),
        };
      })
    );
  };

  // Warm-up sets generator
  const handleGenerateWarmupSets = () => {
    const firstWorkingSet = currentExercise.sets.find((s) => (parseFloat(String(s.weight)) || 0) > 0) || currentExercise.sets[0];
    const workingWeight = firstWorkingSet ? (parseFloat(String(firstWorkingSet.weight)) || 0) : 80;
    const barWeight = 20;

    // Standard warm-up ramp:
    // Set 1: Empty Bar (20kg) x 10
    // Set 2: 40% x 5
    // Set 3: 60% x 3
    // Set 4: 80% x 1
    const warmups: WorkoutSet[] = [];

    // Empty bar
    warmups.push({
      weight: barWeight,
      reps: 10,
      unit: userUnit,
      completed: false,
      rpe: 5,
    });

    if (workingWeight > barWeight * 1.5) {
      const set40 = Math.round((workingWeight * 0.4) / 2.5) * 2.5;
      if (set40 > barWeight) {
        warmups.push({
          weight: set40,
          reps: 5,
          unit: userUnit,
          completed: false,
          rpe: 6,
        });
      }

      const set60 = Math.round((workingWeight * 0.6) / 2.5) * 2.5;
      if (set60 > set40) {
        warmups.push({
          weight: set60,
          reps: 3,
          unit: userUnit,
          completed: false,
          rpe: 7,
        });
      }

      const set80 = Math.round((workingWeight * 0.8) / 2.5) * 2.5;
      if (set80 > set60) {
        warmups.push({
          weight: set80,
          reps: 1,
          unit: userUnit,
          completed: false,
          rpe: 7.5,
        });
      }
    }

    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: [...warmups, ...ex.sets],
        };
      })
    );

    setIsWarmupModalOpen(false);
    toast.success(`Generated ${warmups.length} progressive warm-up sets!`, 'Warm-Up Added');
  };

  // Live Plate Calculator trigger
  const openPlateCalculatorForWeight = (weight: number) => {
    setPlateTargetWeight(weight);
    setIsPlateModalOpen(true);
  };

  // Plate calculation result
  const plateResult = useMemo(() => {
    return calculatePlates(plateTargetWeight, 20, userUnit);
  }, [plateTargetWeight, userUnit]);

  // Total volume and completed metrics
  const sessionStats = useMemo(() => {
    let totalVolumeKg = 0;
    let completedSetsCount = 0;
    let totalSetsCount = 0;

    for (const ex of exercises) {
      for (const s of ex.sets) {
        totalSetsCount++;
        const sWeight = parseFloat(String(s.weight)) || 0;
        const sReps = parseInt(String(s.reps), 10) || 0;
        if (s.completed && sWeight > 0 && sReps > 0) {
          completedSetsCount++;
          const wKg = s.unit === 'lbs' ? sWeight * 0.453592 : sWeight;
          totalVolumeKg += wKg * sReps;
        }
      }
    }

    return {
      totalVolumeKg: Math.round(totalVolumeKg),
      completedSetsCount,
      totalSetsCount,
      durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)),
    };
  }, [exercises, elapsedSeconds]);

  // Finish Workout & detect PRs
  const handleConfirmFinish = () => {
    const today = new Date().toISOString().split('T')[0];
    const validExercises = exercises
      .filter((e) => e.name.trim().length > 0)
      .map((e) => ({
        name: e.name.trim(),
        sets: e.sets
          .filter((s) => (parseInt(String(s.reps), 10) || 0) > 0)
          .map((s) => ({
            ...s,
            weight: parseFloat(String(s.weight)) || 0,
            reps: parseInt(String(s.reps), 10) || 0,
          })),
        notes: e.notes,
      }))
      .filter((e) => e.sets.length > 0);

    if (validExercises.length === 0) {
      toast.error('No exercises with reps recorded.', 'Cannot Finish');
      return;
    }

    // PR detection
    let newPRsCount = 0;
    for (const ex of validExercises) {
      const existingPRs = prs.filter((p) => p.exercise.toLowerCase() === ex.name.toLowerCase());
      const currentBest1RMKg =
        existingPRs.length > 0 ? Math.max(...existingPRs.map((p) => p.oneRepMax)) : 0;

      let topSet = { weightKg: 0, reps: 0, e1RMKg: 0 };
      for (const s of ex.sets) {
        const sWeight = parseFloat(String(s.weight)) || 0;
        const sReps = parseInt(String(s.reps), 10) || 0;
        if (s.completed && sWeight > 0 && sReps > 0) {
          const wKg = s.unit === 'lbs' ? sWeight * 0.453592 : sWeight;
          const e1rm = calculateOneRepMax(wKg, sReps);
          if (e1rm > topSet.e1RMKg) {
            topSet = { weightKg: Math.round(wKg * 10) / 10, reps: sReps, e1RMKg: Math.round(e1rm * 10) / 10 };
          }
        }
      }

      if (topSet.e1RMKg > currentBest1RMKg && topSet.e1RMKg > 0) {
        const prId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pr_${Date.now()}`;
        addPR({
          id: prId,
          exercise: ex.name,
          weightKg: topSet.weightKg,
          weightLbs: Math.round(topSet.weightKg * 2.20462 * 10) / 10,
          reps: topSet.reps,
          oneRepMax: topSet.e1RMKg,
          date: today,
          notes: 'Auto-detected from active workout session',
        });
        newPRsCount++;
      }
    }

    const workoutEntry: WorkoutEntry = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `wk_${Date.now()}`,
      date: today,
      exercises: validExercises,
    };

    onFinish(workoutEntry, newPRsCount);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0D12] text-text-primary flex flex-col overflow-hidden select-none animate-fade-in font-sans">
      {/* ── Top Bar (Navigation locked: full screen gym focus) ───────────── */}
      <header className="px-4 py-3 bg-[#141821] border-b border-border/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsDiscardConfirmOpen(true)}
            className="w-8 h-8 rounded-lg bg-bg-secondary text-text-muted hover:text-danger flex items-center justify-center transition-colors active:scale-95"
            title="Discard Workout"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-black text-text-primary tracking-tight truncate max-w-[160px] sm:max-w-xs font-mono">
              {workoutName}
            </h1>
            <div className="flex items-center gap-1.5 text-3xs font-mono text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>ACTIVE SESSION</span>
              <span className="text-text-muted">•</span>
              <span className="text-text-secondary">{formatTime(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFinishModalOpen(true)}
            className="bg-accent hover:brightness-110 active:scale-95 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-md shadow-accent/25 transition-all flex items-center gap-1"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Finish</span>
          </button>
        </div>
      </header>

      {/* ── Exercise Navigation Carousel (One exercise at a time) ───────── */}
      <nav className="bg-[#0B0D12] border-b border-border/60 px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 mr-2">
          {exercises.map((ex, idx) => {
            const isCompleted = ex.sets.length > 0 && ex.sets.every((s) => s.completed);
            const isCurrent = idx === activeExerciseIdx;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveExerciseIdx(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isCurrent
                    ? 'bg-accent text-white shadow-xs font-mono'
                    : isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-[#141821] text-text-secondary hover:text-text-primary border border-border/70'
                }`}
              >
                <span>{idx + 1}.</span>
                <span className="max-w-[110px] truncate">{ex.name || `Exercise ${idx + 1}`}</span>
                {isCompleted && <Check className="w-3 h-3 stroke-[3] text-emerald-400" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsAddExerciseModalOpen(true)}
            className="p-1.5 rounded-lg bg-[#141821] text-accent border border-accent/30 hover:bg-accent/15 transition-all shrink-0"
            title="Add Exercise"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={activeExerciseIdx === 0}
            onClick={() => setActiveExerciseIdx((prev) => Math.max(0, prev - 1))}
            className="w-7 h-7 rounded-lg bg-[#141821] border border-border text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-3xs font-mono text-text-muted px-1">
            {activeExerciseIdx + 1}/{exercises.length}
          </span>
          <button
            type="button"
            disabled={activeExerciseIdx === exercises.length - 1}
            onClick={() => setActiveExerciseIdx((prev) => Math.min(exercises.length - 1, prev + 1))}
            className="w-7 h-7 rounded-lg bg-[#141821] border border-border text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* ── Exercise Work Area (Scrollable single exercise focus) ───────── */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 max-w-xl mx-auto w-full pb-28">
        {/* Exercise Header Card */}
        <section className="bg-[#141821] border border-border/80 rounded-2xl p-4 space-y-2.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-3xs uppercase font-mono font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-md">
                  {getEquipmentType(currentExercise.name)}
                </span>
                {isCurrentMainLift && (
                  <span className="text-3xs uppercase font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">
                    POWERLIFTING CORE
                  </span>
                )}
              </div>
              <h2 className="text-xl font-extrabold text-text-primary mt-1 tracking-tight">
                {currentExercise.name}
              </h2>
            </div>

            {/* Quick Actions (Warm-up & Plates) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsWarmupModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-bg-secondary hover:bg-accent/15 border border-border hover:border-accent/40 text-2xs font-semibold text-text-secondary hover:text-accent transition-all flex items-center gap-1"
                title="Generate Warm-up Sets"
              >
                <Flame className="w-3.5 h-3.5 text-accent" />
                <span>Warm-up</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const firstW = parseFloat(String(currentExercise.sets[0]?.weight)) || 60;
                  openPlateCalculatorForWeight(firstW);
                }}
                className="px-2.5 py-1 rounded-lg bg-bg-secondary hover:bg-accent/15 border border-border hover:border-accent/40 text-2xs font-semibold text-text-secondary hover:text-accent transition-all flex items-center gap-1"
                title="Barbell Plate Calculator"
              >
                <Dumbbell className="w-3.5 h-3.5 text-accent" />
                <span>Plates</span>
              </button>
            </div>
          </div>

          {/* Last Performance & Smart Progression Coach */}
          {(lastPerf || progRec) && (
            <div className="pt-2 border-t border-border/60 space-y-1.5 text-2xs">
              {lastPerf && (
                <div className="flex items-center justify-between text-text-secondary font-mono">
                  <span className="text-text-muted">Last Session:</span>
                  <span className="font-bold text-text-primary">
                    {lastPerf.summary} <span className="text-text-muted/70">({lastPerf.date})</span>
                  </span>
                </div>
              )}
              {progRec && (
                <div className="p-2 rounded-xl bg-accent/10 border border-accent/25 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-accent">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>COACH TARGET:</span>
                    </div>
                    <span className="font-mono font-bold text-text-primary">{progRec.targetSummary}</span>
                  </div>
                  <p className="text-3xs text-text-secondary leading-snug">{progRec.rationale}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Set Rows Table (weight | reps | RPE | ✓) ─────────────────── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-3 text-3xs font-mono text-text-muted uppercase tracking-wider">
            <span className="w-10 sm:w-12 shrink-0">Set</span>
            <div className="flex-1 flex items-center justify-between pl-1 sm:pl-2 pr-1">
              <span className="text-center w-28 sm:w-32">Weight ({userUnit})</span>
              <span className="text-center w-24 sm:w-28">Reps</span>
              <span className="text-center w-12 sm:w-14">RPE</span>
              <span className="w-9 sm:w-10 text-center">Done</span>
            </div>
          </div>

          <div className="space-y-2">
            {currentExercise.sets.map((set, sIdx) => {
              const prevSet = lastPerf?.sets?.[sIdx];

              return (
                <div
                  key={sIdx}
                  className={`p-2.5 sm:p-3 rounded-2xl border transition-all ${
                    set.completed
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-[#141821] border-border/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                    {/* Set Number & Previous session in grey */}
                    <div className="w-10 sm:w-12 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono font-bold text-accent">S{sIdx + 1}</span>
                        <button
                          type="button"
                          onClick={() => openPlateCalculatorForWeight(parseFloat(String(set.weight)) || 60)}
                          className="text-text-muted/60 hover:text-accent transition-colors p-0.5"
                          title="Barbell plates for this set"
                        >
                          <Dumbbell className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      {prevSet ? (
                        <span
                          className="text-[10px] text-text-muted/80 font-mono block truncate"
                          title={`Last session: ${prevSet.weight}kg × ${prevSet.reps}`}
                        >
                          {prevSet.weight}×{prevSet.reps}
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted/40 font-mono block">—</span>
                      )}
                    </div>

                    {/* Weight Steppers & Direct Input */}
                    <div className="flex items-center gap-0.5 sm:gap-1 bg-[#1B2030] p-1 rounded-xl border border-border/60">
                      <button
                        type="button"
                        onClick={() => handleWeightStep(sIdx, -2.5)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#141821] hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all shrink-0"
                        title="-2.5 kg"
                      >
                        -2.5
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={set.weight ?? ''}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            handleSetWeightChange(sIdx, val);
                          }
                        }}
                        onBlur={() => {
                          const parsed = parseFloat(String(set.weight));
                          handleSetWeightChange(sIdx, isNaN(parsed) ? 0 : Math.max(0, Math.round(parsed * 10) / 10));
                        }}
                        className="w-12 sm:w-14 text-center font-mono font-bold text-xs sm:text-sm text-text-primary bg-[#141821] hover:bg-[#181d28] focus:bg-[#0E1118] border border-transparent focus:border-accent rounded-lg py-1 px-0.5 outline-none transition-all"
                        title="Type weight directly or use -2.5 / +2.5"
                      />
                      <button
                        type="button"
                        onClick={() => handleWeightStep(sIdx, 2.5)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#141821] hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all shrink-0"
                        title="+2.5 kg"
                      >
                        +2.5
                      </button>
                    </div>

                    {/* Reps Steppers & Direct Input */}
                    <div className="flex items-center gap-0.5 sm:gap-1 bg-[#1B2030] p-1 rounded-xl border border-border/60">
                      <button
                        type="button"
                        onClick={() => handleRepsStep(sIdx, -1)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#141821] hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all shrink-0"
                        title="-1 Rep"
                      >
                        -1
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={set.reps ?? ''}
                        placeholder="1"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*$/.test(val)) {
                            handleSetRepsChange(sIdx, val);
                          }
                        }}
                        onBlur={() => {
                          const parsed = parseInt(String(set.reps), 10);
                          handleSetRepsChange(sIdx, isNaN(parsed) ? 1 : Math.max(1, parsed));
                        }}
                        className="w-9 sm:w-11 text-center font-mono font-bold text-xs sm:text-sm text-text-primary bg-[#141821] hover:bg-[#181d28] focus:bg-[#0E1118] border border-transparent focus:border-accent rounded-lg py-1 px-0.5 outline-none transition-all"
                        title="Type reps directly or use -1 / +1"
                      />
                      <button
                        type="button"
                        onClick={() => handleRepsStep(sIdx, 1)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#141821] hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all shrink-0"
                        title="+1 Rep"
                      >
                        +1
                      </button>
                    </div>

                    {/* RPE Selector */}
                    <div className="shrink-0">
                      <select
                        value={set.rpe || 8}
                        onChange={(e) => handleRPESelect(sIdx, Number(e.target.value))}
                        className="bg-[#1B2030] border border-border/60 text-accent font-mono font-bold text-2xs p-1.5 sm:p-2 rounded-xl outline-none focus:border-accent"
                        title="RPE (Rate of Perceived Exertion)"
                      >
                        <option value="6">@6</option>
                        <option value="6.5">@6.5</option>
                        <option value="7">@7</option>
                        <option value="7.5">@7.5</option>
                        <option value="8">@8</option>
                        <option value="8.5">@8.5</option>
                        <option value="9">@9</option>
                        <option value="9.5">@9.5</option>
                        <option value="10">@10</option>
                      </select>
                    </div>

                    {/* Checkmark Button (Tick to log set & auto-start rest timer) */}
                    <button
                      type="button"
                      onClick={() => handleToggleSetComplete(sIdx)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 shrink-0 ${
                        set.completed
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                          : 'bg-[#1B2030] border border-border/80 text-text-muted hover:border-emerald-500/50 hover:text-emerald-400'
                      }`}
                      title="Complete Set (Auto-starts rest timer)"
                    >
                      <Check className="w-5 h-5 stroke-[3]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Set Button */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddSet}
              className="btn-secondary flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>Add Set</span>
            </button>
            {currentExercise.sets.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveSet(currentExercise.sets.length - 1)}
                className="px-3 py-2.5 rounded-xl bg-[#141821] border border-border/70 text-text-muted hover:text-danger text-xs font-semibold"
                title="Remove Last Set"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </section>
      </main>

      {/* ── Sticky Bottom Rest Timer (Pinned at bottom, auto-triggered) ── */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#141821]/95 backdrop-blur-md border-t border-accent/25 px-4 py-2.5 shadow-2xl">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-3xs font-mono font-bold uppercase tracking-wider text-accent">
                  REST TIMER
                </span>
                {isRestFinished && (
                  <span className="text-3xs font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded-full animate-bounce">
                    READY!
                  </span>
                )}
              </div>
              <div className="text-2xl font-black font-mono text-text-primary tracking-tight leading-none mt-0.5">
                {isRestFinished ? (
                  <span className="text-emerald-400">READY</span>
                ) : (
                  formatTime(restSecondsLeft > 0 ? restSecondsLeft : restTotalSeconds)
                )}
              </div>
            </div>
          </div>

          {/* Quick timer adjustments */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePauseTimer}
              className="p-2.5 rounded-xl bg-accent text-white hover:brightness-105 active:scale-95 transition-all shadow-sm"
              title={isRestRunning ? 'Pause' : 'Start'}
            >
              {isRestRunning ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            </button>
            <button
              type="button"
              onClick={() => adjustTimer(30)}
              className="px-2.5 py-2 rounded-xl bg-[#1B2030] text-text-primary border border-border text-xs font-mono font-bold hover:border-accent/40 active:scale-95 transition-all"
              title="+30 Seconds"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={skipTimer}
              className="px-2.5 py-2 rounded-xl bg-[#1B2030] text-text-muted hover:text-text-primary border border-border text-xs font-semibold active:scale-95 transition-all"
              title="Skip Rest"
            >
              Skip
            </button>
          </div>
        </div>
      </footer>

      {/* ── Warm-up Generator Modal ─────────────────────────────────────── */}
      {isWarmupModalOpen && (
        <div className="modal-overlay" onClick={() => setIsWarmupModalOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-text-primary">Warm-up Sets Generator</h3>
              </div>
              <button onClick={() => setIsWarmupModalOpen(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              <p className="text-xs text-text-secondary leading-relaxed">
                Generates a proven powerlifting ramp (Empty Bar &rarr; 40% &rarr; 60% &rarr; 80%) to prime your nervous system and prevent injury before your heavy working sets.
              </p>

              <div className="p-3 rounded-xl bg-[#1B2030] border border-border/80 space-y-1.5 font-mono text-2xs">
                <div className="text-accent font-bold">Planned Warm-up Progression:</div>
                <div className="text-text-secondary">• Set 1: 20kg Bar × 10 reps (Groove motor pattern)</div>
                <div className="text-text-secondary">• Set 2: ~40% × 5 reps (Blood flow)</div>
                <div className="text-text-secondary">• Set 3: ~60% × 3 reps (Potentiation)</div>
                <div className="text-text-secondary">• Set 4: ~80% × 1 rep (Neural readiness)</div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWarmupModalOpen(false)}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateWarmupSets}
                  className="btn-primary flex-1 py-2 text-xs font-bold"
                >
                  Insert Sets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Live Plate Calculator Modal ──────────────────────────────────── */}
      {isPlateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPlateModalOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-text-primary">Plate Calculator</h3>
              </div>
              <button onClick={() => setIsPlateModalOpen(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-center p-3 rounded-xl bg-[#1B2030] border border-border space-y-2">
                <span className="text-3xs uppercase font-mono text-text-muted block">TARGET BARBELL WEIGHT</span>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlateTargetWeight((w) => Math.max(20, Math.round((w - 2.5) * 10) / 10))}
                    className="w-8 h-8 rounded-lg bg-[#141821] hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all"
                    title="-2.5 kg"
                  >
                    -2.5
                  </button>
                  <div className="flex items-center justify-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={plateTargetWeight || ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setPlateTargetWeight(val === '' ? 0 : parseFloat(val));
                        }
                      }}
                      onBlur={() => {
                        setPlateTargetWeight((w) => Math.max(20, Math.round((w || 20) * 10) / 10));
                      }}
                      className="w-24 text-center text-2xl font-black font-mono text-accent bg-[#141821] border border-border focus:border-accent rounded-lg py-1 outline-none"
                    />
                    <span className="text-xs font-mono text-text-muted ml-1.5">{userUnit}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlateTargetWeight((w) => Math.round((w + 2.5) * 10) / 10)}
                    className="w-8 h-8 rounded-lg bg-[#141821] hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all"
                    title="+2.5 kg"
                  >
                    +2.5
                  </button>
                </div>
                <span className="text-2xs font-mono text-text-secondary block">
                  {plateResult.barWeight}kg Bar +{' '}
                  <strong className="text-text-primary">{plateResult.weightPerSide}kg per side</strong>
                </span>
              </div>

              {/* Plate List Breakdown */}
              <div className="space-y-1.5">
                <span className="text-3xs uppercase font-mono text-text-muted block">PLATES PER SIDE:</span>
                {plateResult.plates.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-2">Empty barbell (20kg)</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {plateResult.plates.map((p, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl flex items-center gap-2 border border-border"
                        style={{ backgroundColor: `${p.color}20` }}
                      >
                        <div
                          className="w-4 h-8 rounded-sm shrink-0 border border-white/20"
                          style={{ backgroundColor: p.color }}
                        />
                        <div>
                          <span className="text-xs font-black font-mono text-text-primary block">
                            {p.count}× {p.weight}kg
                          </span>
                          <span className="text-3xs text-text-muted font-mono">{p.count * p.weight}kg total</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsPlateModalOpen(false)}
                className="btn-primary w-full py-2.5 text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Exercise Modal ───────────────────────────────────────────── */}
      {isAddExerciseModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddExerciseModalOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-text-primary">Add Exercise</h3>
              <button onClick={() => setIsAddExerciseModalOpen(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="text"
                placeholder="Exercise name (e.g. Incline Bench)"
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                autoFocus
                className="w-full bg-[#1B2030] border border-border rounded-xl p-2.5 text-sm outline-none focus:border-accent"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddExerciseModalOpen(false)}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newExerciseName.trim()}
                  onClick={() => {
                    const name = newExerciseName.trim();
                    setExercises((prev) => [
                      ...prev,
                      {
                        name,
                        sets: [
                          { weight: 50, reps: 8, unit: userUnit, completed: false, rpe: 8 },
                          { weight: 50, reps: 8, unit: userUnit, completed: false, rpe: 8 },
                          { weight: 50, reps: 8, unit: userUnit, completed: false, rpe: 8 },
                        ],
                      },
                    ]);
                    setActiveExerciseIdx(exercises.length);
                    setNewExerciseName('');
                    setIsAddExerciseModalOpen(false);
                    toast.success(`Added "${name}" to session`, 'Exercise Added');
                  }}
                  className="btn-primary flex-1 py-2 text-xs font-bold disabled:opacity-40"
                >
                  Add Exercise
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Discard Confirmation Modal ───────────────────────────────────── */}
      {isDiscardConfirmOpen && (
        <div className="modal-overlay" onClick={() => setIsDiscardConfirmOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 space-y-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-danger/15 text-danger flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-text-primary">Discard Active Workout?</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Are you sure you want to quit? Unsaved sets from this workout session will be lost.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDiscardConfirmOpen(false)}
                  className="btn-secondary flex-1 py-2 text-xs font-semibold"
                >
                  Keep Training
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="btn-danger flex-1 py-2 text-xs font-bold"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Finish Workout Summary Modal ─────────────────────────────────── */}
      {isFinishModalOpen && (
        <div className="modal-overlay" onClick={() => setIsFinishModalOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-text-primary">Workout Summary</h3>
              </div>
              <button onClick={() => setIsFinishModalOpen(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-[#1B2030] text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">VOLUME</span>
                  <span className="text-lg font-black font-mono text-accent block mt-0.5">
                    {sessionStats.totalVolumeKg}kg
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#1B2030] text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">SETS</span>
                  <span className="text-lg font-black font-mono text-emerald-400 block mt-0.5">
                    {sessionStats.completedSetsCount}/{sessionStats.totalSetsCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#1B2030] text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">TIME</span>
                  <span className="text-lg font-black font-mono text-text-primary block mt-0.5">
                    {sessionStats.durationMinutes}m
                  </span>
                </div>
              </div>

              {/* Progression Coach Summary */}
              <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
                  <Bot className="w-4 h-4" />
                  <span>SMART PROGRESSION READY</span>
                </div>
                <p className="text-2xs text-text-secondary leading-relaxed">
                  Next weight recommendations and volume adaptations will be calibrated for your upcoming session based on RPE and target completions.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsFinishModalOpen(false)}
                  className="btn-secondary flex-1 py-2.5 text-xs"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFinish}
                  className="btn-primary flex-1 py-2.5 text-xs font-bold shadow-md shadow-accent/25"
                >
                  Save &amp; Finish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
