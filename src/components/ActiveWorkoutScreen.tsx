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
  Edit2,
  Mic,
  Zap,
  MoreHorizontal,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { WorkoutExercise, WorkoutSet, WorkoutEntry, PersonalRecord, AthleteGoal, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import { isMainCompoundLift, calculateOneRepMax, getEquipmentType, getExerciseList, isBodyweightExercise, isDumbbellExercise, getEffectiveExerciseLoad, suggestLoad } from '@/lib/strength-standards';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  getQuickSubstitutes,
} from '@/lib/workout-engine';
import { calculatePlates, PlateInfo } from '@/lib/plate-calculator';
import { useToast } from '@/components/ui/Toast';
import VoiceWorkoutLoggerModal from '@/components/VoiceWorkoutLoggerModal';
import ConstraintAdapterModal from '@/components/ConstraintAdapterModal';
import ExerciseSelectorModal from '@/components/ExerciseSelectorModal';
import { VoiceWorkoutResult } from '@/lib/voice-logger';

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
  const userMode = useStore((state) => state.userMode) || 'beginner';
  const toggleUserMode = useStore((state) => state.toggleUserMode);
  const toast = useToast();
  const userUnit = profile?.unit || 'kg';

  // Athlete goal personalization
  const primaryGoal: AthleteGoal = (profile?.goals && profile.goals.length > 0)
    ? (profile.goals[0] as AthleteGoal)
    : 'build_muscle';
  const goalConfig = ATHLETE_GOAL_CONFIGS[primaryGoal] || ATHLETE_GOAL_CONFIGS.build_muscle;

  // Beginner mode: one set at a time & exercise effort prompt
  const [activeSetIdx, setActiveSetIdx] = useState<number>(0);
  const [showEffortPrompt, setShowEffortPrompt] = useState<boolean>(false);
  const [effortChosen, setEffortChosen] = useState<'easy' | 'good' | 'hard' | null>(null);
  const [showFirstTimeTips, setShowFirstTimeTips] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return !localStorage.getItem('ascend_workout_tips_seen') && workouts.length === 0;
      } catch {
        return false;
      }
    }
    return false;
  });

  const dismissFirstTimeTips = () => {
    setShowFirstTimeTips(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ascend_workout_tips_seen', 'true');
      } catch {}
    }
  };

  const defaultTargetReps = useMemo(() => {
    const { min, max } = goalConfig.defaultRepRange;
    return Math.round((min + max) / 2);
  }, [goalConfig.defaultRepRange]);

  const availableExercises = useMemo(() => getExerciseList(), []);

  // Session state
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => {
    const defaultReps = Math.round((goalConfig.defaultRepRange.min + goalConfig.defaultRepRange.max) / 2);
    if (initialExercises && initialExercises.length > 0) {
      return initialExercises.map((e, idx) => {
        const exName = e.name && e.name.trim().length > 0 ? e.name.trim() : (idx === 0 ? 'Bench Press' : `Exercise ${idx + 1}`);
        const pr = prs.find((p) => p.exercise.toLowerCase() === exName.toLowerCase());
        const rawSets = (e.sets && e.sets.length > 0) ? e.sets : [
          { weight: 0, reps: defaultReps, unit: userUnit, completed: false, rpe: 8 },
        ];
        return {
          ...e,
          name: exName,
          sets: rawSets.map((s) => {
            const numW = parseFloat(String(s.weight));
            let finalWeight: any = s.weight;
            if (isNaN(numW) || numW <= 0) {
              if (pr && pr.oneRepMax > 0) {
                finalWeight = suggestLoad(pr.oneRepMax, s.reps || defaultReps, s.rpe || 8, userUnit);
              } else {
                finalWeight = '';
              }
            }
            return {
              ...s,
              weight: finalWeight,
              unit: s.unit || userUnit,
              completed: s.completed || false,
            };
          }),
        };
      });
    }
    const benchPr = prs.find((p) => p.exercise.toLowerCase() === 'bench press');
    const defaultBenchW = benchPr && benchPr.oneRepMax > 0
      ? suggestLoad(benchPr.oneRepMax, defaultReps, 8, userUnit)
      : (userUnit === 'kg' ? 60 : 135);
    return [
      {
        name: 'Bench Press',
        sets: [
          { weight: defaultBenchW, reps: defaultReps, unit: userUnit, completed: false, rpe: 8 },
          { weight: defaultBenchW, reps: defaultReps, unit: userUnit, completed: false, rpe: 8 },
          { weight: defaultBenchW, reps: defaultReps, unit: userUnit, completed: false, rpe: 8 },
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
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [localExerciseName, setLocalExerciseName] = useState('');

  // Sticky Rest Timer state (initialized to athlete's goal rest duration)
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(() => goalConfig.defaultRestSeconds);
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [isRestRunning, setIsRestRunning] = useState<boolean>(false);
  const [isRestFinished, setIsRestFinished] = useState<boolean>(false);
  const [isRestTimerDismissed, setIsRestTimerDismissed] = useState<boolean>(false);
  const [isRestTimerEnabled, setIsRestTimerEnabled] = useState<boolean>(true);

  // Intensity metric preference: RPE vs RIR
  const [intensityMode, setIntensityMode] = useState<'rpe' | 'rir'>(() => {
    if (typeof window !== 'undefined') {
      try {
        return (localStorage.getItem('ascend_intensity_mode') as 'rpe' | 'rir') || 'rpe';
      } catch {
        return 'rpe';
      }
    }
    return 'rpe';
  });

  const toggleIntensityMode = () => {
    setIntensityMode((prev) => {
      const next = prev === 'rpe' ? 'rir' : 'rpe';
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('ascend_intensity_mode', next);
        } catch {
          // ignore storage error
        }
      }
      return next;
    });
  };

  // Current active exercise
  const currentExercise = exercises[activeExerciseIdx] || exercises[0];

  // Adaptive weight stepper step based on exercise type and unit
  const currentWeightStep = useMemo(() => {
    const isDB = isDumbbellExercise(currentExercise?.name || '');
    if (userUnit === 'lbs') {
      return isDB ? 2.5 : 5;
    }
    return isDB ? 1 : 2.5;
  }, [currentExercise?.name, userUnit]);

  const isCurrentBodyweight = useMemo(() => {
    return isBodyweightExercise(currentExercise?.name || '');
  }, [currentExercise?.name]);

  useEffect(() => {
    setIsEditingName(false);
    setLocalExerciseName(exercises[activeExerciseIdx]?.name || '');
    const currentSets = exercises[activeExerciseIdx]?.sets || [];
    const firstIncomplete = currentSets.findIndex((s) => !s.completed);
    setActiveSetIdx(firstIncomplete !== -1 ? firstIncomplete : 0);
    setShowEffortPrompt(currentSets.length > 0 && currentSets.every((s) => s.completed));
    setEffortChosen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExerciseIdx]);

  const handleRemoveExercise = (idxToRemove: number) => {
    if (exercises.length <= 1) {
      toast.error('Workout must have at least one exercise.', 'Cannot Remove');
      return;
    }
    const removedName = exercises[idxToRemove]?.name || 'Exercise';
    setExercises((prev) => prev.filter((_, i) => i !== idxToRemove));
    setActiveExerciseIdx((prev) => (prev >= idxToRemove ? Math.max(0, prev - 1) : prev));
    toast.info(`Removed "${removedName}" from workout.`, 'Exercise Removed');
  };

  // Check if current exercise is a main compound lift (Bench, Squat, Deadlift, OHP)
  const isCurrentMainLift = useMemo(() => {
    if (!currentExercise) return false;
    return isMainCompoundLift(currentExercise.name);
  }, [currentExercise]);

  // Dynamic rest duration adapting to athlete goal, movement demands, and set reps
  const defaultRestDuration = useMemo(() => {
    const targetReps = parseInt(String(currentExercise?.sets?.[0]?.reps), 10) || defaultTargetReps;
    // Heavy compounds at 6 reps or fewer need ~3 minutes (180s) regardless of goal
    if (isCurrentMainLift) {
      if (targetReps <= 6) return 180;
      if (targetReps <= 8) return 120;
      return 90;
    }
    // Accessories and isolations
    if (targetReps <= 8) return 90;
    return 60;
  }, [currentExercise?.sets, defaultTargetReps, isCurrentMainLift]);

  // Screen Wake Lock API: Keep mobile screen on while in active workout
  useEffect(() => {
    let wakeLock: any = null;
    let isMounted = true;

    const requestWakeLock = async () => {
      try {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && isMounted) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // Battery/power-saving may reject wake lock request
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    };
  }, []);

  // Web Audio chime when rest finishes
  const playRestDoneChime = useCallback(() => {
    try {
      const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Autoplay restrictions or unsupported audio
    }
  }, []);

  // Elapsed workout timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  // Countdown Rest Timer - runs smoothly when isRestRunning is active
  useEffect(() => {
    if (!isRestRunning) return;
    const interval = setInterval(() => {
      setRestSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRestRunning(false);
          setIsRestFinished(true);
          playRestDoneChime();
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 200]);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRestRunning, playRestDoneChime]);

  // Start rest timer
  const startTimer = useCallback(
    (seconds?: number) => {
      const targetSec = seconds || defaultRestDuration;
      setRestTotalSeconds(targetSec);
      setRestSecondsLeft(targetSec);
      setIsRestRunning(true);
      setIsRestFinished(false);
    },
    [defaultRestDuration]
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

  const fallbackPR = useMemo(() => {
    if (!currentExercise?.name) return null;
    return prs.find((p) => p.exercise.toLowerCase() === currentExercise.name.toLowerCase()) || null;
  }, [currentExercise?.name, prs]);

  const progRec = useMemo(() => {
    if (!currentExercise?.name) return null;
    return getProgressionRecommendation(currentExercise.name, workouts, userUnit, primaryGoal);
  }, [currentExercise?.name, workouts, userUnit, primaryGoal]);

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
      // Auto start rest timer immediately based on athlete goal & lift type
      const restDuration = defaultRestDuration;
      setRestTotalSeconds(restDuration);
      setRestSecondsLeft(restDuration);
      setIsRestRunning(true);
      setIsRestFinished(false);
      toast.info(
        `Set ${setIdx + 1} logged! Rest timer started (${restDuration >= 60 ? `${restDuration / 60}m` : `${restDuration}s`}).`,
        'Set Complete'
      );
    }
  };

  const handleApplyCoachTarget = () => {
    if (!progRec) return;
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (!s.completed) {
              return {
                ...s,
                weight: progRec.targetWeight,
                reps: progRec.targetReps,
              };
            }
            return s;
          }),
        };
      })
    );
    toast.success(
      `Applied target: ${progRec.targetWeight}${userUnit} × ${progRec.targetReps} reps!`,
      'Target Applied'
    );
  };

  const handleAddSet = () => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const newWeight = lastSet ? (parseFloat(String(lastSet.weight)) || 0) : (userUnit === 'lbs' ? 135 : 60);
        const newReps = lastSet ? (parseInt(String(lastSet.reps), 10) || 0) : defaultTargetReps;
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

  const handleCompleteActiveSet = (setIdx: number) => {
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
        navigator.vibrate(20);
      }
      // Auto start rest timer
      const restDuration = defaultRestDuration;
      setRestTotalSeconds(restDuration);
      setRestSecondsLeft(restDuration);
      setIsRestRunning(true);
      setIsRestFinished(false);

      // Check if there is another set to perform in this exercise
      const remainingSets = currentExercise.sets.filter((s, j) => j !== setIdx && !s.completed);
      if (remainingSets.length > 0) {
        const nextIncomplete = currentExercise.sets.findIndex((s, j) => j > setIdx && !s.completed);
        if (nextIncomplete !== -1) {
          setActiveSetIdx(nextIncomplete);
        } else {
          const anyIncomplete = currentExercise.sets.findIndex((s, j) => j !== setIdx && !s.completed);
          if (anyIncomplete !== -1) setActiveSetIdx(anyIncomplete);
        }
      } else {
        setShowEffortPrompt(true);
      }
    }
  };

  const handleLogExerciseEffort = (rpe: number, label: 'easy' | 'good' | 'hard') => {
    setEffortChosen(label);
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => ({ ...s, rpe })),
        };
      })
    );
    toast.success(
      `Logged effort as ${label.toUpperCase()} (@${rpe} Effort)`,
      'Exercise Complete'
    );
  };

  const handleApplyVoiceSet = (result: VoiceWorkoutResult) => {
    let targetExIdx = activeExerciseIdx;
    if (result.exerciseName) {
      const targetLower = result.exerciseName.toLowerCase();
      const matchIdx = exercises.findIndex(
        (ex) => {
          const exLower = ex.name.toLowerCase();
          return exLower === targetLower || exLower.includes(targetLower) || targetLower.includes(exLower);
        }
      );
      if (matchIdx !== -1) {
        targetExIdx = matchIdx;
        setActiveExerciseIdx(matchIdx);
      }
    }

    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== targetExIdx) return ex;

        let targetSetIdx = -1;
        if (result.setIndex && result.setIndex > 0) {
          targetSetIdx = result.setIndex - 1;
        } else {
          targetSetIdx = ex.sets.findIndex((s) => !s.completed);
        }

        let nextSets = [...ex.sets];
        if (targetSetIdx >= 0 && targetSetIdx < nextSets.length) {
          nextSets[targetSetIdx] = {
            ...nextSets[targetSetIdx],
            weight: result.weight,
            reps: result.reps,
            rpe: result.rpe ?? nextSets[targetSetIdx].rpe ?? 8,
            completed: true,
          };
        } else {
          nextSets.push({
            weight: result.weight,
            reps: result.reps,
            unit: userUnit,
            rpe: result.rpe ?? 8,
            completed: true,
          });
        }

        return { ...ex, sets: nextSets };
      })
    );

    // Auto-trigger rest interval timer
    const restDuration = defaultRestDuration;
    setRestTotalSeconds(restDuration);
    setRestSecondsLeft(restDuration);
    setIsRestRunning(true);
    setIsRestFinished(false);
  };

  // Warm-up sets generator
  const handleGenerateWarmupSets = () => {
    const firstWorkingSet = currentExercise.sets.find((s) => (parseFloat(String(s.weight)) || 0) > 0) || currentExercise.sets[0];
    const workingWeight = firstWorkingSet ? (parseFloat(String(firstWorkingSet.weight)) || 0) : 80;
    const barWeight = 20;

    const roundStep = (w: number) => {
      const step = userUnit === 'lbs' ? 5 : 2.5;
      return Math.round(w / step) * step;
    };

    const warmups: WorkoutSet[] = [];
    const targetReps = currentExercise?.sets[0]?.reps || defaultTargetReps;

    // Set 1: Empty Bar / Motor Pattern Prep
    warmups.push({
      weight: barWeight,
      reps: targetReps >= 8 ? 10 : 8,
      unit: userUnit,
      completed: false,
      rpe: 5,
    });

    // Case 1: Light load (<= 45kg) - 1 ramp set avoids pre-fatigue
    if (workingWeight <= barWeight * 2.2) {
      const mid = roundStep(barWeight + (workingWeight - barWeight) * 0.55);
      if (mid > barWeight && mid < workingWeight) {
        warmups.push({
          weight: mid,
          reps: 5,
          unit: userUnit,
          completed: false,
          rpe: 6.5,
        });
      }
    }
    // Case 2: Moderate load (45-85kg) - 2 ramp sets (50%, 75%)
    else if (workingWeight <= barWeight * 4.2) {
      const s1 = roundStep(workingWeight * 0.50);
      const s2 = roundStep(workingWeight * 0.75);

      if (s1 > barWeight) {
        warmups.push({ weight: s1, reps: 5, unit: userUnit, completed: false, rpe: 6 });
      }
      if (s2 > s1 && s2 < workingWeight) {
        warmups.push({ weight: s2, reps: 3, unit: userUnit, completed: false, rpe: 7 });
      }
      // If doing heavy low reps (<= 4 reps), prime CNS with an 88% potentiator single
      if (targetReps <= 4) {
        const s3 = roundStep(workingWeight * 0.88);
        if (s3 > s2 && s3 < workingWeight) {
          warmups.push({ weight: s3, reps: 1, unit: userUnit, completed: false, rpe: 7.5 });
        }
      }
    }
    // Case 3: Heavy load (> 85kg) - 3-4 progressive sets to prime nervous system without metabolic fatigue
    else {
      const s1 = roundStep(workingWeight * 0.45);
      const s2 = roundStep(workingWeight * 0.65);
      const s3 = roundStep(workingWeight * 0.82);

      if (s1 > barWeight) {
        warmups.push({ weight: s1, reps: 5, unit: userUnit, completed: false, rpe: 6 });
      }
      if (s2 > s1) {
        warmups.push({ weight: s2, reps: 3, unit: userUnit, completed: false, rpe: 6.5 });
      }
      if (s3 > s2) {
        warmups.push({ weight: s3, reps: 2, unit: userUnit, completed: false, rpe: 7 });
      }
      // Potentiating single at 91% for high-threshold motor unit recruitment
      const single = roundStep(workingWeight * 0.91);
      if (single > s3 && single < workingWeight) {
        warmups.push({ weight: single, reps: 1, unit: userUnit, completed: false, rpe: 7.5 });
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
        const isDone = s.completed || (sReps > 0 && sWeight > 0);
        if (isDone && sReps > 0) {
          completedSetsCount++;
          const wKg = s.unit === 'lbs' ? sWeight * 0.453592 : sWeight;
          totalVolumeKg += wKg * sReps;
        } else if (s.completed) {
          completedSetsCount++;
        }
      }
    }

    return {
      totalVolumeKg: Math.round(totalVolumeKg),
      completedSetsCount: Math.max(completedSetsCount, exercises.some(e => e.sets.some(s => s.reps > 0)) ? 1 : 0),
      totalSetsCount,
      durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)),
    };
  }, [exercises, elapsedSeconds]);

  // Finish Workout & detect PRs
  const handleConfirmFinish = () => {
    const today = new Date().toISOString().split('T')[0];
    const validExercises = exercises
      .map((e, idx) => {
        const cleanName = e.name && e.name.trim().length > 0 ? e.name.trim() : (idx === 0 ? 'Bench Press' : `Exercise ${idx + 1}`);
        const validSets = e.sets
          .map((s) => {
            const w = parseFloat(String(s.weight)) || 0;
            const r = parseInt(String(s.reps), 10) || (w > 0 ? 1 : 8);
            return {
              ...s,
              completed: true,
              weight: w,
              reps: r,
            };
          })
          .filter((s) => s.reps > 0);

        return {
          name: cleanName,
          sets: validSets,
          notes: e.notes,
        };
      })
      .filter((e) => e.sets.length > 0);

    if (validExercises.length === 0) {
      toast.error('Please record at least 1 set with reps before finishing.', 'Cannot Finish');
      return;
    }

    // PR detection
    let newPRsCount = 0;
    const userBW = profile?.bodyweightKg || 75;
    for (const ex of validExercises) {
      const isBW = isBodyweightExercise(ex.name);
      const existingPRs = prs.filter((p) => p.exercise.toLowerCase() === ex.name.toLowerCase());
      const currentBest1RMKg =
        existingPRs.length > 0 ? Math.max(...existingPRs.map((p) => p.oneRepMax)) : 0;

      let topSet = { weightKg: 0, reps: 0, e1RMKg: 0 };
      for (const s of ex.sets) {
        const sWeight = parseFloat(String(s.weight)) || 0;
        const sReps = parseInt(String(s.reps), 10) || 0;
        if (sReps > 0 && (sWeight > 0 || isBW)) {
          const wKg = s.unit === 'lbs' ? sWeight * 0.453592 : sWeight;
          const effectiveLoadKg = getEffectiveExerciseLoad(ex.name, wKg, userBW);
          const e1rm = calculateOneRepMax(effectiveLoadKg, sReps);
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

    setIsFinishModalOpen(false);
    onFinish(workoutEntry, newPRsCount);
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary text-text-primary flex flex-col overflow-hidden select-none animate-fade-in font-sans">
      {/* ── Top Bar (Navigation locked: full screen gym focus) ───────────── */}
      <header className="px-4 py-3 bg-bg-card border-b border-border/80 flex items-center justify-between shrink-0">
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
          {/* Secondary ⋯ Tools Menu (In advanced mode, or available for quick tools) */}
          {userMode === 'advanced' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                className="w-8 h-8 rounded-lg bg-bg-secondary hover:bg-bg-tertiary border border-border/80 text-text-secondary hover:text-text-primary transition-all flex items-center justify-center active:scale-95"
                title="Workout Tools & Options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {isMoreMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-52 rounded-xl bg-bg-card border border-border shadow-xl p-1.5 z-50 animate-fade-in space-y-1"
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => setIsAdaptModalOpen(true)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-accent/15 hover:text-accent transition-colors flex items-center gap-2"
                  >
                    <Zap className="w-3.5 h-3.5 text-accent" />
                    <span>Change today&apos;s workout</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const firstW = parseFloat(String(currentExercise.sets[0]?.weight)) || 60;
                      openPlateCalculatorForWeight(firstW);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2"
                  >
                    <Dumbbell className="w-3.5 h-3.5 text-text-muted" />
                    <span>Plate helper</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWarmupModalOpen(true)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2"
                  >
                    <Flame className="w-3.5 h-3.5 text-text-muted" />
                    <span>Warm-up sets</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsVoiceModalOpen(true)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2"
                  >
                    <Mic className="w-3.5 h-3.5 text-text-muted" />
                    <span>Voice dictation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddExerciseModalOpen(true)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 border-t border-border/40 pt-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-text-muted" />
                    <span>Add exercise</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsFinishModalOpen(true)}
            className="bg-accent hover:brightness-105 active:scale-95 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm shadow-accent/25 transition-all flex items-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Finish</span>
          </button>
        </div>
      </header>

      {/* ── Exercise Switcher Bar (Numbered indicators, clean & quiet) ── */}
      <nav className="bg-bg-primary border-b border-border/50 px-4 py-2 flex items-center justify-between shrink-0 max-w-[480px] mx-auto w-full">
        <button
          type="button"
          disabled={activeExerciseIdx === 0}
          onClick={() => setActiveExerciseIdx((prev) => Math.max(0, prev - 1))}
          className="w-8 h-8 rounded-lg bg-bg-secondary text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center justify-center transition-colors"
          aria-label="Previous exercise"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {exercises.map((ex, idx) => {
            const isCompleted = ex.sets.length > 0 && ex.sets.every((s) => s.completed);
            const isCurrent = idx === activeExerciseIdx;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveExerciseIdx(idx)}
                className={`w-7 h-7 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center ${
                  isCurrent
                    ? 'bg-accent text-white shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-bg-secondary text-text-muted hover:text-text-primary border border-border/60'
                }`}
                title={ex.name}
              >
                {isCompleted ? '✓' : idx + 1}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsAddExerciseModalOpen(true)}
            className="w-7 h-7 rounded-full bg-bg-secondary text-accent border border-accent/30 hover:bg-accent/15 flex items-center justify-center transition-all ml-1"
            title="Add Exercise"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          disabled={activeExerciseIdx === exercises.length - 1}
          onClick={() => setActiveExerciseIdx((prev) => Math.min(exercises.length - 1, prev + 1))}
          className="w-8 h-8 rounded-lg bg-bg-secondary text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center justify-center transition-colors"
          aria-label="Next exercise"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </nav>

      {/* ── Main Exercise Focus Workspace (Radically simplified) ───────── */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 max-w-[480px] mx-auto w-full pb-32">
        {/* First-time guidance tips (Idea 9) */}
        {showFirstTimeTips && (
          <div className="mb-4 p-3.5 rounded-xl bg-accent/10 border border-accent/30 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-accent flex items-center gap-1.5">
                <span>👋</span>
                <span>Quick gym tips</span>
              </span>
              <button
                type="button"
                onClick={dismissFirstTimeTips}
                className="text-2xs text-text-muted hover:text-text-primary px-2 py-0.5 rounded bg-bg-secondary border border-border transition-colors"
              >
                Got it
              </button>
            </div>
            <ul className="text-2xs text-text-secondary space-y-1 list-disc list-inside">
              <li>Weights and reps are pre-filled for you</li>
              <li>Tap the big Done button after completing each set</li>
              <li>Your rest timer starts automatically</li>
            </ul>
          </div>
        )}

        {/* Exercise Header */}
        <section className="mb-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider font-sans">
              Exercise {activeExerciseIdx + 1} of {exercises.length}
            </span>
            <span className="text-2xs font-mono text-text-muted uppercase">
              {getEquipmentType(currentExercise.name)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <input
                  type="text"
                  autoFocus
                  value={localExerciseName}
                  placeholder="Exercise Name"
                  onBlur={() => {
                    const trimmed = localExerciseName.trim();
                    if (trimmed) {
                      setExercises((prev) =>
                        prev.map((ex, i) => (i === activeExerciseIdx ? { ...ex, name: trimmed } : ex))
                      );
                    }
                    setIsEditingName(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = localExerciseName.trim();
                      if (trimmed) {
                        setExercises((prev) =>
                          prev.map((ex, i) => (i === activeExerciseIdx ? { ...ex, name: trimmed } : ex))
                        );
                      }
                      setIsEditingName(false);
                    } else if (e.key === 'Escape') {
                      setLocalExerciseName(currentExercise.name);
                      setIsEditingName(false);
                    }
                  }}
                  onChange={(e) => setLocalExerciseName(e.target.value)}
                  className="text-2xl sm:text-3xl font-black text-text-primary bg-bg-secondary rounded-xl px-3 py-1 border border-accent outline-none w-full tracking-tight font-sans"
                />
              ) : (
                <div
                  onClick={() => {
                    setLocalExerciseName(currentExercise.name);
                    setIsEditingName(true);
                  }}
                  className="flex items-center gap-2 cursor-pointer group"
                  title="Tap to rename exercise"
                >
                  <h2 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight font-sans truncate group-hover:text-accent transition-colors">
                    {currentExercise.name || 'Untitled Exercise'}
                  </h2>
                  <Edit2 className="w-3.5 h-3.5 text-accent opacity-80 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              )}
            </div>

            {exercises.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveExercise(activeExerciseIdx)}
                className="p-2 rounded-xl text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                title="Remove this exercise from workout"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Context: Last session */}
          {lastPerf ? (
            <div className="text-xs text-text-muted">
              <span>Last time: </span>
              <span className="font-semibold text-text-secondary">{lastPerf.summary}</span>
            </div>
          ) : fallbackPR && workouts.length === 0 ? (
            <div className="text-xs text-text-muted">
              <span>Baseline: </span>
              <span className="font-semibold text-text-secondary">
                {userUnit === 'lbs' ? fallbackPR.weightLbs : fallbackPR.weightKg} {userUnit} × {fallbackPR.reps}
              </span>
            </div>
          ) : (
            <div className="text-xs text-text-muted">
              <span>Last time: —</span>
            </div>
          )}

          {/* Today's Target */}
          <div className="pt-0.5 text-xs font-semibold text-accent tracking-wide uppercase">
            <span>TODAY: </span>
            <span className="font-mono text-text-primary text-sm font-bold ml-1 normal-case">
              {currentExercise.sets[0]?.weight ? `${currentExercise.sets[0]?.weight} ${userUnit}` : 'Custom'} × {currentExercise.sets[0]?.reps || 8}
              {userMode === 'advanced' && ` @${currentExercise.sets[0]?.rpe || 8}`}
            </span>
          </div>
        </section>

        {userMode === 'beginner' ? (
          /* ── BEGINNER MODE: ONE SET AT A TIME (Idea 4 & 5) ── */
          <section className="space-y-4">
            {/* Set pills navigator */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-text-muted">
                SET {activeSetIdx + 1} OF {currentExercise.sets.length}
              </span>
              <div className="flex items-center gap-1.5">
                {currentExercise.sets.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveSetIdx(idx);
                      setShowEffortPrompt(false);
                    }}
                    className={`w-7 h-7 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center ${
                      idx === activeSetIdx && !showEffortPrompt
                        ? 'bg-accent text-white shadow-xs'
                        : s.completed
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-bg-secondary text-text-muted border border-border/60 hover:text-text-primary'
                    }`}
                    title={`Set ${idx + 1}`}
                  >
                    {s.completed ? '✓' : idx + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddSet}
                  className="w-7 h-7 rounded-full bg-bg-secondary text-accent border border-accent/30 hover:bg-accent/15 flex items-center justify-center text-xs ml-1"
                  title="Add set"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {showEffortPrompt ? (
              /* Post-exercise effort prompt (Idea 5: Ask effort once per exercise) */
              <div className="card p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/10 border border-accent/40 text-center space-y-4 animate-fade-in shadow-md">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="text-lg font-black text-text-primary tracking-tight">
                    {currentExercise.name} Completed!
                  </h3>
                  <p className="text-xs text-text-secondary mt-1">
                    How hard was that exercise today?
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleLogExerciseEffort(7, 'easy')}
                    className={`p-3 rounded-xl border active:scale-95 transition-all text-center ${
                      effortChosen === 'easy'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-bg-secondary border-border/80 hover:border-emerald-500/60'
                    }`}
                  >
                    <span className="text-xl block mb-1">😊</span>
                    <span className="text-xs font-bold text-text-primary block">Easy</span>
                    <span className="text-3xs text-text-muted">Could do more</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogExerciseEffort(8, 'good')}
                    className={`p-3 rounded-xl border active:scale-95 transition-all text-center ${
                      effortChosen === 'good'
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-bg-secondary border-border/80 hover:border-accent/60'
                    }`}
                  >
                    <span className="text-xl block mb-1">👍</span>
                    <span className="text-xs font-bold text-accent block">Good</span>
                    <span className="text-3xs text-text-muted">Just right</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogExerciseEffort(9.5, 'hard')}
                    className={`p-3 rounded-xl border active:scale-95 transition-all text-center ${
                      effortChosen === 'hard'
                        ? 'bg-danger/20 border-danger text-danger'
                        : 'bg-bg-secondary border-border/80 hover:border-danger/60'
                    }`}
                  >
                    <span className="text-xl block mb-1">🥵</span>
                    <span className="text-xs font-bold text-text-primary block">Hard</span>
                    <span className="text-3xs text-text-muted">Pushed to limit</span>
                  </button>
                </div>

                <div className="pt-2">
                  {activeExerciseIdx < exercises.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowEffortPrompt(false);
                        setActiveExerciseIdx((prev) => prev + 1);
                      }}
                      className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <span>NEXT: {exercises[activeExerciseIdx + 1]?.name}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowEffortPrompt(false);
                        setIsFinishModalOpen(true);
                      }}
                      className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 border-none"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>FINISH WORKOUT</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* The One Set Focus Card */
              <div className="card p-5 sm:p-6 bg-bg-card border border-border/80 shadow-md space-y-6 animate-fade-in">
                <div className="grid grid-cols-2 gap-4">
                  {/* Weight Stepper */}
                  <div className="text-center space-y-2">
                    <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                      {isCurrentBodyweight ? `ADDED WEIGHT (${userUnit})` : `WEIGHT (${userUnit})`}
                    </span>
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => handleWeightStep(activeSetIdx, -currentWeightStep)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform"
                      >
                        -
                      </button>
                      <div className="flex flex-col items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={currentExercise.sets[activeSetIdx]?.weight ?? ''}
                          placeholder={isCurrentBodyweight ? '0 (BW)' : '0'}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
                              handleSetWeightChange(activeSetIdx, val);
                            }
                          }}
                          className="w-16 sm:w-20 text-center font-mono font-black text-2xl text-text-primary bg-transparent outline-none border-b-2 border-border focus:border-accent"
                        />
                        {isCurrentBodyweight && (
                          <span className="text-3xs text-accent font-semibold mt-0.5">
                            {(parseFloat(String(currentExercise.sets[activeSetIdx]?.weight)) || 0) === 0 ? 'Bodyweight' : `+${currentExercise.sets[activeSetIdx]?.weight} ${userUnit}`}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleWeightStep(activeSetIdx, currentWeightStep)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Reps Stepper */}
                  <div className="text-center space-y-2">
                    <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                      REPS
                    </span>
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => handleRepsStep(activeSetIdx, -1)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform"
                      >
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={currentExercise.sets[activeSetIdx]?.reps ?? ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*$/.test(val)) {
                            handleSetRepsChange(activeSetIdx, val);
                          }
                        }}
                        className="w-14 sm:w-16 text-center font-mono font-black text-2xl text-text-primary bg-transparent outline-none border-b-2 border-border focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => handleRepsStep(activeSetIdx, 1)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Giant Done Button */}
                <button
                  type="button"
                  onClick={() => handleCompleteActiveSet(activeSetIdx)}
                  className={`w-full py-4 rounded-xl text-base font-black tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${
                    currentExercise.sets[activeSetIdx]?.completed
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25'
                      : 'bg-accent hover:brightness-105 text-white shadow-accent/25'
                  }`}
                >
                  <Check className="w-5 h-5 stroke-[3]" />
                  <span>{currentExercise.sets[activeSetIdx]?.completed ? 'SET DONE ✓' : 'DONE'}</span>
                </button>
              </div>
            )}

            {/* Exercise Switcher Navigation CTA */}
            {!showEffortPrompt && (
              <div className="pt-3 space-y-2">
                {activeExerciseIdx < exercises.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIdx((prev) => prev + 1)}
                    className="btn-secondary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:border-accent text-text-primary transition-all shadow-xs"
                  >
                    <span>NEXT EXERCISE: {exercises[activeExerciseIdx + 1]?.name}</span>
                    <ChevronRight className="w-4 h-4 text-accent" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFinishModalOpen(true)}
                    className="btn-primary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 border-none text-white shadow-md shadow-emerald-500/20"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>FINISH WORKOUT</span>
                  </button>
                )}

                {activeExerciseIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIdx((prev) => prev - 1)}
                    className="w-full py-2 text-2xs text-text-muted hover:text-text-primary flex items-center justify-center gap-1 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous: {exercises[activeExerciseIdx - 1]?.name}</span>
                  </button>
                )}
              </div>
            )}
          </section>
        ) : (
          /* ── ADVANCED MODE: FULL MULTI-SET TABLE (Existing rich view) ── */
          <section className="space-y-1">
            <div className="divide-y divide-border/40">
              {currentExercise.sets.map((set, sIdx) => (
                <div
                  key={sIdx}
                  className="py-3 flex items-center justify-between gap-2"
                >
                  {/* Set number */}
                  <div className="w-14 shrink-0">
                    <span className="text-xs font-semibold text-text-muted">
                      Set {sIdx + 1}
                    </span>
                  </div>

                  {/* Weight & Reps inputs */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* Weight Input */}
                    <div className="flex items-center bg-bg-secondary rounded-xl px-2.5 py-1.5 border border-border/60 focus-within:border-accent">
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
                        className="w-12 sm:w-14 text-center font-mono font-bold text-sm sm:text-base text-text-primary bg-transparent outline-none"
                      />
                      <span className="text-2xs text-text-muted font-medium ml-0.5">{userUnit}</span>
                    </div>

                    <span className="text-text-muted font-medium text-xs">×</span>

                    {/* Reps Input */}
                    <div className="flex items-center bg-bg-secondary rounded-xl px-2.5 py-1.5 border border-border/60 focus-within:border-accent">
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
                        className="w-9 sm:w-11 text-center font-mono font-bold text-sm sm:text-base text-text-primary bg-transparent outline-none"
                      />
                      <span className="text-2xs text-text-muted font-medium ml-0.5">reps</span>
                    </div>

                    {/* Effort / RPE badge */}
                    <button
                      type="button"
                      onClick={() => {
                        const cur = set.rpe || 8;
                        const next = cur >= 10 ? 6 : cur + 0.5;
                        handleRPESelect(sIdx, next);
                      }}
                      className="text-xs font-mono font-bold px-2 py-1.5 rounded-xl bg-bg-secondary border border-border/60 text-text-secondary hover:text-accent active:scale-95 transition-all"
                      title="Tap to adjust effort / RPE"
                    >
                      @{set.rpe || 8}
                    </button>
                  </div>

                  {/* Checkmark Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleSetComplete(sIdx)}
                    className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 ${
                      set.completed
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'border-2 border-border/80 hover:border-text-secondary text-transparent'
                    }`}
                    aria-label={set.completed ? "Completed set" : "Mark set complete"}
                  >
                    <Check className={`w-5 h-5 stroke-[3] ${set.completed ? 'opacity-100' : 'opacity-0'}`} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Set / Remove Set */}
            <div className="pt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleAddSet}
                className="text-xs font-bold text-accent hover:underline flex items-center gap-1.5 py-2 px-3 rounded-xl hover:bg-accent/10 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Set</span>
              </button>
              {currentExercise.sets.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveSet(currentExercise.sets.length - 1)}
                  className="text-xs font-medium text-text-muted hover:text-danger py-2 px-3 rounded-xl hover:bg-danger/10 transition-colors"
                >
                  Remove Set
                </button>
              )}
            </div>

            {/* Next Exercise / Finish CTA in Advanced Mode */}
            <div className="pt-4 pb-2 space-y-2">
              {activeExerciseIdx < exercises.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveExerciseIdx((prev) => prev + 1)}
                  className="btn-secondary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:border-accent text-text-primary transition-all shadow-xs"
                >
                  <span>NEXT EXERCISE: {exercises[activeExerciseIdx + 1]?.name}</span>
                  <ChevronRight className="w-4 h-4 text-accent" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsFinishModalOpen(true)}
                  className="btn-primary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 border-none text-white shadow-md shadow-emerald-500/20"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>FINISH WORKOUT</span>
                </button>
              )}

              {activeExerciseIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveExerciseIdx((prev) => prev - 1)}
                  className="w-full py-2 text-2xs text-text-muted hover:text-text-primary flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous: {exercises[activeExerciseIdx - 1]?.name}</span>
                </button>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ── Sticky Bottom Rest Timer (Dismissable & Non-intrusive) ────────── */}
      {isRestTimerDismissed ? (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-1 p-1 rounded-full bg-bg-card/95 backdrop-blur border border-accent/40 shadow-xl">
          <button
            type="button"
            onClick={() => setIsRestTimerDismissed(false)}
            className="px-2.5 py-1.5 text-xs font-mono font-bold text-accent flex items-center gap-1.5 active:scale-95 transition-all hover:text-accent/80"
            title="Open rest timer bar"
          >
            <Timer className="w-3.5 h-3.5" />
            <span>Rest: {formatTime(restSecondsLeft > 0 ? restSecondsLeft : restTotalSeconds)}</span>
          </button>
          <div className="flex items-center gap-0.5 border-l border-border/70 pl-1 pr-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                adjustTimer(-30);
              }}
              className="px-1.5 py-0.5 rounded text-3xs font-mono font-bold text-text-muted hover:text-text-primary hover:bg-bg-secondary active:scale-95 transition-all"
              title="Subtract 30 seconds"
            >
              -30s
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                adjustTimer(30);
              }}
              className="px-1.5 py-0.5 rounded text-3xs font-mono font-bold text-accent hover:bg-accent/15 active:scale-95 transition-all"
              title="Add 30 seconds"
            >
              +30s
            </button>
          </div>
        </div>
      ) : (
        <footer className="fixed bottom-0 left-0 right-0 z-40 bg-bg-card/95 backdrop-blur-md border-t border-border px-4 py-2.5 shadow-2xl">
          <div className="max-w-[480px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsRestTimerDismissed(true)}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                title="Hide timer bar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block">
                  REST
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-text-primary tracking-tight leading-none mt-0.5 tabular-nums">
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
                onClick={() => adjustTimer(-30)}
                className="px-2.5 py-1.5 rounded-xl bg-bg-secondary text-text-muted hover:text-text-primary border border-border text-xs font-mono font-bold hover:border-accent/40 active:scale-95 transition-all"
                title="Subtract 30 seconds"
              >
                -30s
              </button>
              <button
                type="button"
                onClick={() => adjustTimer(30)}
                className="px-3 py-1.5 rounded-xl bg-bg-secondary text-text-primary border border-border text-xs font-mono font-bold hover:border-accent/40 active:scale-95 transition-all"
                title="Add 30 seconds"
              >
                +30s
              </button>
              <button
                type="button"
                onClick={skipTimer}
                className="px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-bold active:scale-95 transition-all shadow-xs"
              >
                SKIP
              </button>
            </div>
          </div>
        </footer>
      )}

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

              <div className="p-3 rounded-xl bg-bg-secondary border border-border/80 space-y-1.5 font-mono text-2xs">
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
              <div className="text-center p-3 rounded-xl bg-bg-secondary border border-border space-y-2">
                <span className="text-3xs uppercase font-mono text-text-muted block">TARGET BARBELL WEIGHT</span>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlateTargetWeight((w) => Math.max(20, Math.round((w - 2.5) * 10) / 10))}
                    className="w-8 h-8 rounded-lg bg-bg-card hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all border border-border/40"
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
                      className="w-24 text-center text-2xl font-black font-mono text-accent bg-bg-card border border-border focus:border-accent rounded-lg py-1 outline-none"
                    />
                    <span className="text-xs font-mono text-text-muted ml-1.5">{userUnit}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlateTargetWeight((w) => Math.round((w + 2.5) * 10) / 10)}
                    className="w-8 h-8 rounded-lg bg-bg-card hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all border border-border/40"
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

      {/* ── Add Exercise Modal (With muscle categories & search) ──────────── */}
      <ExerciseSelectorModal
        isOpen={isAddExerciseModalOpen}
        onClose={() => setIsAddExerciseModalOpen(false)}
        onSelectExercise={(selected) => {
          const isBW = selected.isBodyweight || isBodyweightExercise(selected.name);
          const defaultW = isBW ? 0 : (selected.defaultWeightKg || (userUnit === 'lbs' ? 115 : 50));
          const defaultR = selected.defaultReps || defaultTargetReps;

          setExercises((prev) => [
            ...prev,
            {
              name: selected.name,
              sets: [
                { weight: defaultW, reps: defaultR, unit: userUnit, completed: false, rpe: 8 },
                { weight: defaultW, reps: defaultR, unit: userUnit, completed: false, rpe: 8 },
                { weight: defaultW, reps: defaultR, unit: userUnit, completed: false, rpe: 8 },
              ],
            },
          ]);
          setActiveExerciseIdx(exercises.length);
          setIsAddExerciseModalOpen(false);
          toast.success(`Added "${selected.name}" to workout`, 'Exercise Added');
        }}
      />

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
                <div className="p-3 rounded-xl bg-bg-secondary text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">VOLUME</span>
                  <span className="text-lg font-black font-mono text-accent block mt-0.5">
                    {sessionStats.totalVolumeKg}kg
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-bg-secondary text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">SETS</span>
                  <span className="text-lg font-black font-mono text-emerald-400 block mt-0.5">
                    {sessionStats.completedSetsCount}/{sessionStats.totalSetsCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-bg-secondary text-center border border-border">
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

      {/* Voice Workout Logger Modal */}
      <VoiceWorkoutLoggerModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        currentExerciseName={currentExercise?.name}
        defaultUnit={userUnit}
        onApplySet={handleApplyVoiceSet}
      />

      {/* Real-World Constraint Adapter Modal */}
      <ConstraintAdapterModal
        isOpen={isAdaptModalOpen}
        onClose={() => setIsAdaptModalOpen(false)}
        exercises={exercises}
        userUnit={userUnit}
        onApplyAdaptedWorkout={(adaptedExercises) => {
          setExercises(adaptedExercises);
        }}
      />

      {/* Datalist for autocomplete */}
      <datalist id="active-exercises-list">
        {availableExercises.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
