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
  Search,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { WorkoutExercise, WorkoutSet, WorkoutEntry, PersonalRecord, AthleteGoal, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import { isMainCompoundLift, calculateOneRepMax, getEquipmentType, getExerciseList, isBodyweightExercise, isDumbbellExercise, getEffectiveExerciseLoad, suggestLoad } from '@/lib/strength-standards';
import {
  EXERCISE_LIBRARY,
  ExerciseItem,
  searchExercises,
  getExerciseMuscle,
  getExerciseFormCues,
} from '@/lib/exercise-library';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  getQuickSubstitutes,
  getExercisePrescription,
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

function getPlateSummary(targetWeight: number, unit: 'kg' | 'lbs' = 'kg'): string | null {
  const barWeight = unit === 'lbs' ? 45 : 20;
  if (!targetWeight || targetWeight <= barWeight) return null;
  const res = calculatePlates(targetWeight, barWeight, unit);
  if (!res.plates || res.plates.length === 0) return null;
  const parts = res.plates.map((p) => (p.count > 1 ? `${p.count}×${p.weight}` : `${p.weight}`));
  return `${parts.join(' + ')} /side`;
}

function triggerHaptic(type: 'set_complete' | 'rest_done' | 'pr_hit') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    if (type === 'set_complete') {
      navigator.vibrate([45, 35, 45]);
    } else if (type === 'rest_done') {
      navigator.vibrate([120, 80, 120, 80, 240]);
    } else if (type === 'pr_hit') {
      navigator.vibrate([60, 40, 80, 40, 120]);
    }
  } catch {
    // Ignore unsupported vibration
  }
}

export default function ActiveWorkoutScreen({
  initialExercises,
  workoutName = 'Workout Session',
  onFinish,
  onCancel,
}: ActiveWorkoutScreenProps) {
  const { profile, workouts, addPR, prs, saveWorkoutDraft } = useStore();
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
  const [isExerciseJumpOpen, setIsExerciseJumpOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [localExerciseName, setLocalExerciseName] = useState('');
  const renameContainerRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(-1);
  const [isChangeExerciseModalOpen, setIsChangeExerciseModalOpen] = useState<boolean>(false);

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

  const completedSetsThisEx = useMemo(() => {
    return currentExercise?.sets.filter((s) => s.completed || (s.reps > 0 && (parseFloat(String(s.weight)) || 0) > 0)).length || 0;
  }, [currentExercise?.sets]);

  const totalSetsThisEx = currentExercise?.sets.length || 0;

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

  const isCurrentBarbell = useMemo(() => {
    return getEquipmentType(currentExercise?.name || '') === 'barbell';
  }, [currentExercise?.name]);

  const isCurrentDumbbell = useMemo(() => {
    return isDumbbellExercise(currentExercise?.name || '');
  }, [currentExercise?.name]);

  const [activeRpePickerSetIdx, setActiveRpePickerSetIdx] = useState<number | null>(null);

  useEffect(() => {
    setIsEditingName(false);
    setLocalExerciseName(exercises[activeExerciseIdx]?.name || '');
    setSelectedSuggestionIdx(-1);
    const currentSets = exercises[activeExerciseIdx]?.sets || [];
    const firstIncomplete = currentSets.findIndex((s) => !s.completed);
    setActiveSetIdx(firstIncomplete !== -1 ? firstIncomplete : 0);
    setShowEffortPrompt(currentSets.length > 0 && currentSets.every((s) => s.completed));
    setEffortChosen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExerciseIdx]);

  // ── Auto-save In-Progress Session to Local Storage ────────────────────────
  useEffect(() => {
    if (exercises.some((e) => e.name.trim() || e.sets.some((s) => s.completed || (parseFloat(String(s.weight)) || 0) > 0))) {
      saveWorkoutDraft({
        date: new Date().toISOString().split('T')[0],
        name: workoutName,
        exercises,
        startedFromPlan: workoutName,
        sessionStartTime,
        savedAt: new Date().toISOString(),
      });
    }
  }, [exercises, workoutName, sessionStartTime, saveWorkoutDraft]);

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

  // ── Change / Rename Exercise Autocomplete & Selection ─────────────────────
  const handleSelectNewExerciseName = useCallback(
    (newName: string, isBW?: boolean) => {
      const trimmed = newName.trim();
      if (!trimmed) {
        setIsEditingName(false);
        return;
      }

      const isBodyweight = isBW !== undefined ? isBW : isBodyweightExercise(trimmed);
      const wasBodyweight = isBodyweightExercise(currentExercise?.name || '');

      setExercises((prev) =>
        prev.map((ex, i) => {
          if (i !== activeExerciseIdx) return ex;

          // If switching between bodyweight and weighted exercise on uncompleted sets, adapt default weights
          let updatedSets = ex.sets;
          if (isBodyweight && !wasBodyweight) {
            updatedSets = ex.sets.map((s) => (s.completed ? s : { ...s, weight: 0 }));
          } else if (!isBodyweight && wasBodyweight) {
            const defaultWeight = userUnit === 'lbs' ? 115 : 50;
            updatedSets = ex.sets.map((s) =>
              s.completed ? s : { ...s, weight: (parseFloat(String(s.weight)) || 0) === 0 ? defaultWeight : s.weight }
            );
          }

          return {
            ...ex,
            name: trimmed,
            sets: updatedSets,
          };
        })
      );

      setIsEditingName(false);
      setLocalExerciseName(trimmed);
      setSelectedSuggestionIdx(-1);
      toast.success(`Exercise changed to "${trimmed}"`, 'Exercise Updated');
    },
    [activeExerciseIdx, currentExercise?.name, userUnit, toast]
  );

  // Autocomplete suggestions when renaming / changing current exercise
  const renameSuggestions = useMemo(() => {
    if (!isEditingName) return [];
    const query = localExerciseName.trim().toLowerCase();
    const currentNameLower = (currentExercise?.name || '').toLowerCase();

    // If query is empty or unchanged, show smart recommendations from the same muscle group
    if (!query || query === currentNameLower) {
      const currentMuscle = getExerciseMuscle(currentExercise?.name || '');
      const sameMuscle = EXERCISE_LIBRARY.filter(
        (ex) => ex.muscle === currentMuscle && ex.name.toLowerCase() !== currentNameLower
      );
      if (sameMuscle.length >= 6) {
        return sameMuscle.slice(0, 8);
      }
      const others = EXERCISE_LIBRARY.filter(
        (ex) => ex.muscle !== currentMuscle && ex.name.toLowerCase() !== currentNameLower
      );
      return [...sameMuscle, ...others].slice(0, 8);
    }

    // When typing query, filter and rank matches:
    const allMatches = searchExercises(query);
    const sorted = [...allMatches].sort((a, b) => {
      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();
      const aStarts = aLower.startsWith(query);
      const bStarts = bLower.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      const aIdx = aLower.indexOf(query);
      const bIdx = bLower.indexOf(query);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      return 0;
    });

    return sorted.slice(0, 8);
  }, [isEditingName, localExerciseName, currentExercise?.name]);

  // Close rename dropdown on outside click or save if valid edit
  useEffect(() => {
    if (!isEditingName) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (renameContainerRef.current && !renameContainerRef.current.contains(e.target as Node)) {
        const trimmed = localExerciseName.trim();
        if (trimmed && trimmed !== currentExercise?.name) {
          handleSelectNewExerciseName(trimmed);
        } else {
          setIsEditingName(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isEditingName, localExerciseName, currentExercise?.name, handleSelectNewExerciseName]);

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev < renameSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev > 0 ? prev - 1 : renameSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIdx >= 0 && selectedSuggestionIdx < renameSuggestions.length) {
        const chosen = renameSuggestions[selectedSuggestionIdx];
        handleSelectNewExerciseName(chosen.name, chosen.isBodyweight);
      } else {
        const trimmed = localExerciseName.trim();
        if (trimmed) {
          handleSelectNewExerciseName(trimmed);
        } else {
          setIsEditingName(false);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setLocalExerciseName(currentExercise?.name || '');
      setIsEditingName(false);
      setSelectedSuggestionIdx(-1);
    }
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
          triggerHaptic('rest_done');
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

  const prescription = useMemo(() => {
    if (!currentExercise?.name) return null;
    return getExercisePrescription(
      currentExercise.name,
      workouts,
      prs,
      userUnit,
      primaryGoal
    );
  }, [currentExercise?.name, workouts, prs, userUnit, primaryGoal]);

  const formCues = useMemo(() => {
    if (!currentExercise?.name) return [];
    return getExerciseFormCues(currentExercise.name);
  }, [currentExercise?.name]);

  const [showFormCues, setShowFormCues] = useState(false);
  const [showWhyTarget, setShowWhyTarget] = useState(false);

  const postWorkoutLedger = useMemo(() => {
    const improved: string[] = [];
    const steady: string[] = [];
    const nextRules: string[] = [];

    for (const ex of exercises) {
      if (!ex.name.trim()) continue;
      const validSets = ex.sets.filter((s) => s.completed || (s.reps > 0 && (parseFloat(String(s.weight)) || 0) > 0));
      if (validSets.length === 0) continue;
      const allDone = validSets.every((s) => (s.rpe ?? 8) <= 8 && s.reps >= 8);
      const pr = prs.find((p) => p.exercise.toLowerCase() === ex.name.toLowerCase());
      const maxW = Math.max(...validSets.map((s) => parseFloat(String(s.weight)) || 0));

      if (allDone || (pr && maxW > (userUnit === 'lbs' ? (pr.weightLbs || pr.weightKg * 2.20462) : pr.weightKg))) {
        improved.push(`${ex.name}: Solid volume & speed`);
        nextRules.push(`${ex.name}: +${userUnit === 'lbs' ? 5 : 2.5}${userUnit} next exposure`);
      } else {
        steady.push(`${ex.name}: Held load at ${maxW}${userUnit}`);
        nextRules.push(`${ex.name}: Aim for +1 rep next session`);
      }
    }

    return {
      improved: improved.length > 0 ? improved.slice(0, 2) : ['First session calibration completed'],
      steady: steady.length > 0 ? steady.slice(0, 2) : ['Movement quality & baseline established'],
      nextRules: nextRules.length > 0 ? nextRules.slice(0, 2) : ['Follow prescribed target progression'],
    };
  }, [exercises, prs, userUnit]);

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
      triggerHaptic('set_complete');
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
      triggerHaptic('set_complete');
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

  // Warm-up sets generator preview
  const generatedWarmupPreview = useMemo(() => {
    const firstWorkingSet = currentExercise?.sets.find((s) => (parseFloat(String(s.weight)) || 0) > 0) || currentExercise?.sets[0];
    const workingWeight = firstWorkingSet ? (parseFloat(String(firstWorkingSet.weight)) || 0) : (userUnit === 'lbs' ? 135 : 60);
    const barWeight = userUnit === 'lbs' ? 45 : 20;

    const roundStep = (w: number) => {
      const step = userUnit === 'lbs' ? 5 : 2.5;
      return Math.round(w / step) * step;
    };

    const warmups: (WorkoutSet & { label: string })[] = [];
    const targetReps = currentExercise?.sets[0]?.reps || defaultTargetReps;

    // Set 1: Empty Bar / Motor Pattern Prep
    warmups.push({
      weight: barWeight,
      reps: targetReps >= 8 ? 10 : 8,
      unit: userUnit,
      completed: false,
      rpe: 5,
      isWarmup: true,
      label: 'Barbell Prep / Motor Groove',
    });

    // Case 1: Light load (<= 45kg / 95lbs) - 1 ramp set avoids pre-fatigue
    if (workingWeight <= barWeight * 2.2) {
      const mid = roundStep(barWeight + (workingWeight - barWeight) * 0.55);
      if (mid > barWeight && mid < workingWeight) {
        warmups.push({
          weight: mid,
          reps: 5,
          unit: userUnit,
          completed: false,
          rpe: 6.5,
          isWarmup: true,
          label: 'Light Ramp (~55%)',
        });
      }
    }
    // Case 2: Moderate load (45-85kg) - 2 ramp sets (50%, 75%)
    else if (workingWeight <= barWeight * 4.2) {
      const s1 = roundStep(workingWeight * 0.50);
      const s2 = roundStep(workingWeight * 0.75);

      if (s1 > barWeight) {
        warmups.push({ weight: s1, reps: 5, unit: userUnit, completed: false, rpe: 6, isWarmup: true, label: 'Blood Flow (~50%)' });
      }
      if (s2 > s1 && s2 < workingWeight) {
        warmups.push({ weight: s2, reps: 3, unit: userUnit, completed: false, rpe: 7, isWarmup: true, label: 'Potentiation (~75%)' });
      }
      if (targetReps <= 4) {
        const s3 = roundStep(workingWeight * 0.88);
        if (s3 > s2 && s3 < workingWeight) {
          warmups.push({ weight: s3, reps: 1, unit: userUnit, completed: false, rpe: 7.5, isWarmup: true, label: 'Neural Primer (~88%)' });
        }
      }
    }
    // Case 3: Heavy load (> 85kg) - 3-4 progressive sets
    else {
      const s1 = roundStep(workingWeight * 0.45);
      const s2 = roundStep(workingWeight * 0.65);
      const s3 = roundStep(workingWeight * 0.82);

      if (s1 > barWeight) {
        warmups.push({ weight: s1, reps: 5, unit: userUnit, completed: false, rpe: 6, isWarmup: true, label: 'Blood Flow (~45%)' });
      }
      if (s2 > s1) {
        warmups.push({ weight: s2, reps: 3, unit: userUnit, completed: false, rpe: 6.5, isWarmup: true, label: 'Groove Velocity (~65%)' });
      }
      if (s3 > s2) {
        warmups.push({ weight: s3, reps: 2, unit: userUnit, completed: false, rpe: 7, isWarmup: true, label: 'Ramp Weight (~82%)' });
      }
      const single = roundStep(workingWeight * 0.91);
      if (single > s3 && single < workingWeight) {
        warmups.push({ weight: single, reps: 1, unit: userUnit, completed: false, rpe: 7.5, isWarmup: true, label: 'CNS Activation (~91%)' });
      }
    }

    return {
      workingWeight,
      warmups,
    };
  }, [currentExercise?.sets, defaultTargetReps, userUnit]);

  // Warm-up sets generator
  const handleGenerateWarmupSets = () => {
    const warmupsToInsert: WorkoutSet[] = generatedWarmupPreview.warmups.map((w) => ({
      weight: w.weight,
      reps: w.reps,
      unit: w.unit,
      completed: false,
      rpe: w.rpe,
      isWarmup: true,
    }));

    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: [...warmupsToInsert, ...ex.sets],
        };
      })
    );

    setIsWarmupModalOpen(false);
    toast.success(`Prepended ${warmupsToInsert.length} warm-up sets marked [W]!`, 'Warm-Up Added');
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

      // PR detection (Both 1RM PRs and Rep PRs at working loads)
      let topSet = { weightKg: 0, reps: 0, e1RMKg: 0 };
      let bestRepPR: { weightKg: number; weightLbs: number; reps: number; prevReps: number; e1RMKg: number } | null = null;

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

          // Scan past workouts to check if this is a Rep PR at this specific working weight
          let maxPrevRepsAtWeight = 0;
          for (const pastWk of workouts) {
            for (const pastEx of pastWk.exercises) {
              if (pastEx.name.toLowerCase() === ex.name.toLowerCase()) {
                for (const pastSet of pastEx.sets) {
                  const pw = parseFloat(String(pastSet.weight)) || 0;
                  const pr = parseInt(String(pastSet.reps), 10) || 0;
                  const pwKg = pastSet.unit === 'lbs' ? pw * 0.453592 : pw;
                  if (Math.abs(pwKg - wKg) < 1.0 && pr > maxPrevRepsAtWeight) {
                    maxPrevRepsAtWeight = pr;
                  }
                }
              }
            }
          }

          if (maxPrevRepsAtWeight > 0 && sReps > maxPrevRepsAtWeight) {
            if (!bestRepPR || (sReps - maxPrevRepsAtWeight > bestRepPR.reps - bestRepPR.prevReps)) {
              bestRepPR = {
                weightKg: Math.round(wKg * 10) / 10,
                weightLbs: Math.round(wKg * 2.20462 * 10) / 10,
                reps: sReps,
                prevReps: maxPrevRepsAtWeight,
                e1RMKg: Math.round(e1rm * 10) / 10,
              };
            }
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
          notes: 'All-Time 1RM PR',
          prType: '1rm',
        });
        newPRsCount++;
      } else if (bestRepPR) {
        const prId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pr_rep_${Date.now()}`;
        addPR({
          id: prId,
          exercise: ex.name,
          weightKg: bestRepPR.weightKg,
          weightLbs: bestRepPR.weightLbs,
          reps: bestRepPR.reps,
          oneRepMax: bestRepPR.e1RMKg,
          date: today,
          notes: `Rep PR: +${bestRepPR.reps - bestRepPR.prevReps} reps at ${userUnit === 'lbs' ? bestRepPR.weightLbs : bestRepPR.weightKg} ${userUnit}`,
          prType: 'reps',
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
          {/* Secondary ⋯ Tools Menu (Available for quick tools & helper sheets) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              className="w-8 h-8 rounded-lg bg-bg-secondary hover:bg-bg-tertiary border border-border/80 text-text-secondary hover:text-text-primary transition-all flex items-center justify-center active:scale-95 cursor-pointer"
              title="Workout Tools & Options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isMoreMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-bg-card border border-border shadow-xl p-1.5 z-50 animate-fade-in space-y-1"
                onClick={() => setIsMoreMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    const firstW = parseFloat(String(currentExercise.sets[activeSetIdx]?.weight || currentExercise.sets[0]?.weight)) || 60;
                    openPlateCalculatorForWeight(firstW);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Dumbbell className="w-3.5 h-3.5 text-accent" />
                  <span>Plate helper</span>
                </button>
                {formCues.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFormCues((prev) => !prev)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Form execution cues</span>
                  </button>
                )}
                {prescription?.whyThisWeight && (
                  <button
                    type="button"
                    onClick={() => setShowWhyTarget((prev) => !prev)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Bot className="w-3.5 h-3.5 text-accent" />
                    <span>Why this target weight?</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsWarmupModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>Warm-up sets</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdaptModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-accent/15 hover:text-accent transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-accent" />
                  <span>Change routine / split</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-text-muted" />
                  <span>Voice dictation</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddExerciseModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 border-t border-border/40 pt-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-text-muted" />
                  <span>Add exercise</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              saveWorkoutDraft({
                date: new Date().toISOString().split('T')[0],
                name: workoutName,
                exercises,
                startedFromPlan: workoutName,
                sessionStartTime,
                savedAt: new Date().toISOString(),
              });
              toast.info('Workout saved! You can resume anytime from the Home screen.', 'Session Paused');
              onCancel();
            }}
            className="bg-bg-secondary hover:bg-bg-tertiary active:scale-95 text-text-secondary hover:text-text-primary border border-border/80 font-bold text-xs px-2.5 sm:px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            title="Pause and save workout draft to resume later"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pause</span>
          </button>

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

      {/* ── Exercise Navigation Bar (Focused 1 of N with hairline progress) ── */}
      <nav className="bg-bg-card border-b border-border/80 px-4 py-2 flex items-center justify-between shrink-0 max-w-[480px] mx-auto w-full">
        <button
          type="button"
          disabled={activeExerciseIdx === 0}
          onClick={() => setActiveExerciseIdx((prev) => Math.max(0, prev - 1))}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-20 transition-all flex items-center gap-1 cursor-pointer"
          aria-label="Previous exercise"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-xs font-semibold hidden sm:inline">Prev</span>
        </button>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-black text-accent">
              {activeExerciseIdx + 1}
            </span>
            <span className="text-xs font-mono text-text-muted">of</span>
            <span className="text-xs font-mono font-bold text-text-secondary">
              {exercises.length}
            </span>
          </div>
          {/* Hairline progress track */}
          <div className="w-24 h-1 bg-bg-secondary rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-accent transition-all duration-300 rounded-full"
              style={{ width: `${((activeExerciseIdx + 1) / exercises.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsAddExerciseModalOpen(true)}
            className="p-1.5 rounded-lg text-text-muted hover:text-accent transition-colors cursor-pointer"
            title="Add Exercise"
            aria-label="Add Exercise"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={activeExerciseIdx === exercises.length - 1}
            onClick={() => setActiveExerciseIdx((prev) => Math.min(exercises.length - 1, prev + 1))}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-20 transition-all flex items-center gap-1 cursor-pointer"
            aria-label="Next exercise"
          >
            <span className="text-xs font-semibold hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* ── Main Exercise Focus Workspace (Radically simplified) ───────── */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 max-w-[480px] mx-auto w-full pb-32">
        {/* First-time guidance tips (Idea 9) */}
        {showFirstTimeTips && (
          <div className="mb-4 p-3.5 rounded-xl bg-accent/10 border border-accent/30 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-accent flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
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
                <div ref={renameContainerRef} className="relative w-full z-40">
                  <div className="relative flex items-center">
                    <input
                      ref={renameInputRef}
                      type="text"
                      autoFocus
                      value={localExerciseName}
                      placeholder="Type to search or rename..."
                      onChange={(e) => {
                        setLocalExerciseName(e.target.value);
                        setSelectedSuggestionIdx(-1);
                      }}
                      onKeyDown={handleRenameKeyDown}
                      className="text-lg sm:text-2xl font-black text-text-primary bg-bg-secondary rounded-xl pl-3 pr-9 py-2 border-2 border-accent outline-none w-full tracking-tight font-sans shadow-xl shadow-black/60"
                    />
                    {localExerciseName && (
                      <button
                        type="button"
                        onClick={() => {
                          setLocalExerciseName('');
                          renameInputRef.current?.focus();
                        }}
                        className="absolute right-2.5 p-1 rounded-md text-text-muted hover:text-text-primary transition-colors"
                        title="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown Menu for Exercise Suggestions */}
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-bg-card/95 backdrop-blur-md border border-border/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden z-50 animate-scale-in">
                    {/* Suggestions Header */}
                    <div className="px-3 py-2 bg-bg-secondary/80 border-b border-border/50 flex items-center justify-between text-3xs font-semibold text-text-muted uppercase tracking-wider">
                      <span className="truncate">
                        {localExerciseName.trim()
                          ? `Matches for "${localExerciseName.trim()}"`
                          : `Similar ${getExerciseMuscle(currentExercise.name)} Exercises`}
                      </span>
                      <span className="font-mono text-accent shrink-0">
                        {renameSuggestions.length} found
                      </span>
                    </div>

                    {/* Suggestions List */}
                    <div className="max-h-60 overflow-y-auto divide-y divide-border/20">
                      {renameSuggestions.map((item, idx) => {
                        const isHighlighted = idx === selectedSuggestionIdx;
                        const isCurrent = item.name.toLowerCase() === (currentExercise.name || '').toLowerCase();
                        return (
                          <button
                            key={item.id || item.name}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectNewExerciseName(item.name, item.isBodyweight)}
                            className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                              isHighlighted
                                ? 'bg-accent/20 text-accent'
                                : 'hover:bg-bg-secondary text-text-primary'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold truncate ${isHighlighted ? 'text-accent' : 'text-text-primary'}`}>
                                  {item.name}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-semibold shrink-0">
                                    Current
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-3xs text-text-muted">
                                <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border/40 font-medium">
                                  {item.muscle}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border/40 font-medium">
                                  {item.equipment}
                                </span>
                                {item.isBodyweight && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                    Bodyweight
                                  </span>
                                )}
                              </div>
                            </div>
                            <ArrowRightLeft className={`w-3.5 h-3.5 shrink-0 ${isHighlighted ? 'text-accent' : 'text-text-muted'}`} />
                          </button>
                        );
                      })}

                      {renameSuggestions.length === 0 && (
                        <div className="px-4 py-4 text-center text-xs text-text-muted">
                          No matching exercises in library.
                        </div>
                      )}

                      {/* Custom name option when typed name is non-empty and not exact match */}
                      {localExerciseName.trim() &&
                        !renameSuggestions.some(
                          (s) => s.name.toLowerCase() === localExerciseName.trim().toLowerCase()
                        ) && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectNewExerciseName(localExerciseName.trim())}
                            className="w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 bg-accent/10 hover:bg-accent/20 text-accent transition-colors border-t border-accent/20"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Plus className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-xs font-bold truncate">
                                Use custom name: &ldquo;{localExerciseName.trim()}&rdquo;
                              </span>
                            </div>
                            <span className="text-3xs font-mono uppercase text-accent/80 shrink-0">Custom</span>
                          </button>
                        )}
                    </div>

                    {/* Bottom Action: Browse all categories via modal */}
                    <div className="p-2 bg-bg-secondary/90 border-t border-border/60 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setIsEditingName(false);
                          setIsChangeExerciseModalOpen(true);
                        }}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-bg-tertiary hover:bg-bg-card border border-border/70 text-text-secondary hover:text-text-primary text-2xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Dumbbell className="w-3.5 h-3.5 text-accent" />
                        <span>Browse Categories...</span>
                      </button>

                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setLocalExerciseName(currentExercise.name);
                          setIsEditingName(false);
                        }}
                        className="py-1.5 px-3 rounded-xl hover:bg-bg-tertiary text-text-muted hover:text-text-primary text-2xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    setLocalExerciseName(currentExercise.name);
                    setSelectedSuggestionIdx(-1);
                    setIsEditingName(true);
                    setTimeout(() => renameInputRef.current?.select(), 50);
                  }}
                  className="flex items-center gap-2 cursor-pointer group"
                  title="Tap to change or rename exercise"
                >
                  <h2 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight font-sans truncate group-hover:text-accent transition-colors">
                    {currentExercise.name || 'Untitled Exercise'}
                  </h2>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-bg-secondary group-hover:bg-accent/15 border border-border/60 group-hover:border-accent/40 text-text-muted group-hover:text-accent transition-all shrink-0">
                    <Edit2 className="w-3 h-3" />
                    <span className="text-[10px] font-semibold hidden sm:inline">Change</span>
                  </div>
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

          {/* Context & Target Card (Clean Minimal Comparison) */}
          <div className="p-3.5 rounded-2xl bg-bg-card border border-border/80 mt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block">
                  Today&apos;s Target
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-base sm:text-lg font-bold font-sans text-accent">
                    {prescription ? `${prescription.targetWeight} ${userUnit} × ${prescription.targetReps} reps` : `${currentExercise.sets[0]?.weight || 0} ${userUnit} × ${currentExercise.sets[0]?.reps || 8}`}
                  </span>
                  {userMode === 'advanced' && (
                    <span className="text-xs font-mono text-text-muted">
                      @{prescription?.targetRpe || 8}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block">
                  Last Time
                </span>
                <span className="text-xs font-semibold text-text-secondary block">
                  {prescription?.lastPerformance
                    ? `${prescription.lastPerformance.weight} ${userUnit} × ${prescription.lastPerformance.reps} reps`
                    : lastPerf
                    ? lastPerf.summary
                    : fallbackPR
                    ? `Baseline: ${userUnit === 'lbs' ? fallbackPR.weightLbs : fallbackPR.weightKg} ${userUnit} × ${fallbackPR.reps}`
                    : 'First exposure'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {userMode === 'beginner' ? (
          /* ── BEGINNER MODE: ONE SET AT A TIME (Idea 4 & 5) ── */
          <section className="space-y-4">
            {/* Set pills navigator */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Set {activeSetIdx + 1} of {currentExercise.sets.length}
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
                        : s.isWarmup
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-bg-secondary text-text-muted border border-border/60 hover:text-text-primary'
                    }`}
                    title={s.isWarmup ? `Warm-up Set ${idx + 1}` : `Set ${idx + 1}`}
                  >
                    {s.completed ? '✓' : s.isWarmup ? 'W' : idx + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddSet}
                  className="w-7 h-7 rounded-full bg-bg-secondary text-accent border border-accent/30 hover:bg-accent/15 flex items-center justify-center text-xs ml-1 cursor-pointer"
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
                    className={`p-3 rounded-xl border active:scale-95 transition-all text-center cursor-pointer ${
                      effortChosen === 'easy'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-bg-secondary border-border/80 hover:border-emerald-500/60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto mb-1.5 font-mono font-bold text-[11px]">
                      @7
                    </span>
                    <span className="text-xs font-bold text-text-primary block">Easy</span>
                    <span className="text-3xs text-text-muted">Could do more</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogExerciseEffort(8, 'good')}
                    className={`p-3 rounded-xl border active:scale-95 transition-all text-center cursor-pointer ${
                      effortChosen === 'good'
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-bg-secondary border-border/80 hover:border-accent/60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center mx-auto mb-1.5 font-mono font-bold text-[11px]">
                      @8
                    </span>
                    <span className="text-xs font-bold text-accent block">Target</span>
                    <span className="text-3xs text-text-muted">Just right</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogExerciseEffort(9.5, 'hard')}
                    className={`p-3 rounded-xl border active:scale-95 transition-all text-center cursor-pointer ${
                      effortChosen === 'hard'
                        ? 'bg-danger/20 border-danger text-danger'
                        : 'bg-bg-secondary border-border/80 hover:border-danger/60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-danger/15 text-danger flex items-center justify-center mx-auto mb-1.5 font-mono font-bold text-[11px]">
                      @9.5
                    </span>
                    <span className="text-xs font-bold text-text-primary block">Hard</span>
                    <span className="text-3xs text-text-muted">Near limit</span>
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
                      className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Next: {exercises[activeExerciseIdx + 1]?.name}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowEffortPrompt(false);
                        setIsFinishModalOpen(true);
                      }}
                      className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 border-none cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Finish Workout</span>
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
                    <span className="text-xs font-medium text-text-muted">
                      {isCurrentBodyweight ? `Added Weight (${userUnit})` : isCurrentDumbbell ? `Weight / DB (${userUnit})` : `Weight (${userUnit})`}
                    </span>
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => handleWeightStep(activeSetIdx, -currentWeightStep)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
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
                          className="w-28 sm:w-32 px-1 py-0.5 text-center font-mono font-black text-2xl sm:text-3xl text-text-primary bg-transparent outline-none border-b-2 border-border focus:border-accent tabular-nums tracking-tight"
                        />
                        {isCurrentBodyweight && (
                          <span className="text-3xs text-accent font-semibold mt-0.5">
                            {(parseFloat(String(currentExercise.sets[activeSetIdx]?.weight)) || 0) === 0 ? 'Bodyweight' : `+${currentExercise.sets[activeSetIdx]?.weight} ${userUnit}`}
                          </span>
                        )}
                        {isCurrentDumbbell && (
                          <span className="text-[10px] font-mono font-medium text-amber-500/90 mt-0.5" title="Weight per dumbbell">
                            (per dumbbell)
                          </span>
                        )}
                        {isCurrentBarbell && (
                          (() => {
                            const w = parseFloat(String(currentExercise.sets[activeSetIdx]?.weight)) || 0;
                            const plates = getPlateSummary(w, userUnit);
                            return plates ? (
                              <span className="text-[10px] font-mono font-medium text-accent/90 mt-0.5" title={plates}>
                                [{plates}]
                              </span>
                            ) : null;
                          })()
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleWeightStep(activeSetIdx, currentWeightStep)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    {/* Quick increment chips */}
                    <div className="flex items-center justify-center gap-1 pt-1">
                      {[-5, -2.5, 2.5, 5].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          onClick={() => handleWeightStep(activeSetIdx, delta)}
                          className="px-2 py-0.5 rounded-lg bg-bg-secondary hover:bg-bg-tertiary border border-border/70 text-text-secondary hover:text-text-primary text-[10px] font-mono font-bold active:scale-95 transition-all cursor-pointer"
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reps Stepper */}
                  <div className="text-center space-y-2">
                    <span className="text-xs font-medium text-text-muted">
                      Reps
                    </span>
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => handleRepsStep(activeSetIdx, -1)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
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
                        className="w-24 sm:w-28 px-1 py-0.5 text-center font-mono font-black text-2xl sm:text-3xl text-text-primary bg-transparent outline-none border-b-2 border-border focus:border-accent tabular-nums tracking-tight"
                      />
                      <button
                        type="button"
                        onClick={() => handleRepsStep(activeSetIdx, 1)}
                        className="w-10 h-10 rounded-xl bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border font-bold text-lg flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Beginner Mode Effort (RPE) Picker Button */}
                <div className="flex items-center justify-center pt-0.5 pb-1">
                  <button
                    type="button"
                    onClick={() => setActiveRpePickerSetIdx(activeSetIdx)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-bg-secondary hover:bg-bg-tertiary border border-border/70 hover:border-accent/40 text-xs font-mono font-bold text-text-secondary hover:text-text-primary active:scale-95 transition-all cursor-pointer"
                    title="Tap to select target effort / RPE"
                  >
                    <span className="text-accent font-black text-xs sm:text-sm">@{currentExercise.sets[activeSetIdx]?.rpe || 8}</span>
                    <span className="text-text-muted text-2xs font-sans">
                      Effort (RPE) • Tap to adjust
                    </span>
                  </button>
                </div>

                {/* Giant Done Button */}
                <button
                  type="button"
                  onClick={() => handleCompleteActiveSet(activeSetIdx)}
                  className={`w-full py-4 rounded-xl text-base font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] cursor-pointer ${
                    currentExercise.sets[activeSetIdx]?.completed
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25'
                      : 'bg-accent hover:brightness-105 text-white shadow-accent/25'
                  }`}
                >
                  <Check className="w-5 h-5 stroke-[3]" />
                  <span>{currentExercise.sets[activeSetIdx]?.completed ? `Set ${activeSetIdx + 1} Completed` : `Complete Set ${activeSetIdx + 1}`}</span>
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
                    className="btn-secondary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:border-accent text-text-primary transition-all shadow-xs cursor-pointer"
                  >
                    <span>Next Exercise: {exercises[activeExerciseIdx + 1]?.name}</span>
                    <ChevronRight className="w-4 h-4 text-accent" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFinishModalOpen(true)}
                    className="btn-primary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 border-none text-white shadow-md shadow-emerald-500/20 cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Finish Workout</span>
                  </button>
                )}

                {activeExerciseIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIdx((prev) => prev - 1)}
                    className="w-full py-2 text-2xs text-text-muted hover:text-text-primary flex items-center justify-center gap-1 transition-colors cursor-pointer"
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
                  <div className="w-14 shrink-0 flex items-center gap-1">
                    {set.isWarmup ? (
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30" title="Warm-up ramp set">
                        W{sIdx + 1}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-text-muted">
                        Set {sIdx + 1}
                      </span>
                    )}
                  </div>

                  {/* Weight & Reps inputs */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* Weight Input */}
                    <div className="flex flex-col items-center">
                      <div className="flex items-center bg-bg-secondary rounded-xl px-2 py-1.5 border border-border/60 focus-within:border-accent min-w-[76px] sm:min-w-[88px] shrink-0">
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
                          className="w-14 sm:w-16 p-0 text-center font-mono font-bold text-sm sm:text-base text-text-primary bg-transparent outline-none tabular-nums"
                        />
                        <span className="text-2xs text-text-muted font-medium ml-1 shrink-0">{userUnit}</span>
                      </div>
                      {isCurrentDumbbell && (
                        <span className="text-[9px] font-mono text-amber-500/90 mt-0.5 truncate max-w-[100px] text-center" title="Weight per dumbbell">
                          / dumbbell
                        </span>
                      )}
                      {isCurrentBarbell && (
                        (() => {
                          const w = parseFloat(String(set.weight)) || 0;
                          const plates = getPlateSummary(w, userUnit);
                          return plates ? (
                            <span className="text-[9px] font-mono text-accent/80 mt-0.5 truncate max-w-[100px] text-center" title={plates}>
                              {plates}
                            </span>
                          ) : null;
                        })()
                      )}
                    </div>

                    <span className="text-text-muted font-medium text-xs">×</span>

                    {/* Reps Input */}
                    <div className="flex items-center bg-bg-secondary rounded-xl px-2 py-1.5 border border-border/60 focus-within:border-accent min-w-[62px] sm:min-w-[72px] shrink-0">
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
                        className="w-10 sm:w-12 p-0 text-center font-mono font-bold text-sm sm:text-base text-text-primary bg-transparent outline-none tabular-nums"
                      />
                      <span className="text-2xs text-text-muted font-medium ml-1 shrink-0">reps</span>
                    </div>

                    {/* Effort / RPE badge */}
                    <button
                      type="button"
                      onClick={() => setActiveRpePickerSetIdx(sIdx)}
                      className="min-w-[44px] text-xs font-mono font-bold px-2 py-1.5 rounded-xl bg-bg-secondary border border-border/60 text-text-secondary hover:text-accent hover:border-accent/40 active:scale-95 transition-all shrink-0 text-center cursor-pointer"
                      title="Tap to select effort (RPE)"
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

            {/* Exercise Completion Auto-Advance Prompt (Advanced Mode) */}
            {currentExercise.sets.length > 0 && currentExercise.sets.every((s) => s.completed) && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-bg-card to-accent/15 border border-emerald-500/40 flex items-center justify-between gap-3 animate-fade-in my-3 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                    ✓
                  </div>
                  <div>
                    <p className="text-xs font-black text-text-primary">
                      {currentExercise.name} Complete!
                    </p>
                    <p className="text-3xs text-text-muted">
                      All {currentExercise.sets.length} sets logged successfully
                    </p>
                  </div>
                </div>
                {activeExerciseIdx < exercises.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIdx((prev) => prev + 1)}
                    className="px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
                  >
                    <span>Next: {exercises[activeExerciseIdx + 1]?.name}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFinishModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Finish Workout</span>
                  </button>
                )}
              </div>
            )}

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

      {/* ── Sticky Bottom Session Bar: Pulse Strip + Rest Controls ── */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-bg-card/95 backdrop-blur-md border-t border-border px-4 py-2.5 shadow-2xl">
        <div className="max-w-[480px] mx-auto space-y-2">
          {/* Live Pulse Strip & Quick Exercise Jump */}
          <div className="flex items-center justify-between text-2xs font-mono">
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              <span className="text-text-muted shrink-0">Ex {activeExerciseIdx + 1}/{exercises.length}:</span>
              <span className="font-bold text-text-primary truncate">{currentExercise?.name}</span>
              <span className="text-text-muted shrink-0">•</span>
              <span className="text-text-secondary shrink-0">
                Sets: {completedSetsThisEx}/{totalSetsThisEx} (Total {sessionStats.completedSetsCount}/{sessionStats.totalSetsCount})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsExerciseJumpOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-bg-secondary hover:bg-accent/15 hover:text-accent border border-border/80 text-text-primary font-sans font-bold text-3xs shrink-0 flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
              title="Quick Jump to any exercise"
            >
              <span>Jump</span>
              <span className="text-[10px] text-accent">▾</span>
            </button>
          </div>

          {/* Rest Timer row (if not dismissed) or compact rest pill toggle (if dismissed) */}
          {isRestTimerDismissed ? (
            <div className="flex items-center justify-between pt-1 border-t border-border/40 text-3xs font-mono text-text-muted">
              <button
                type="button"
                onClick={() => setIsRestTimerDismissed(false)}
                className="flex items-center gap-1.5 text-accent hover:underline font-semibold"
              >
                <Timer className="w-3 h-3" />
                <span>Rest: {formatTime(restSecondsLeft > 0 ? restSecondsLeft : restTotalSeconds)} (Tap to show)</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustTimer(-30)}
                  className="px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted hover:text-text-primary active:scale-95"
                >
                  -30s
                </button>
                <button
                  type="button"
                  onClick={() => adjustTimer(30)}
                  className="px-1.5 py-0.5 rounded bg-bg-secondary text-accent hover:bg-accent/15 active:scale-95"
                >
                  +30s
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsRestTimerDismissed(true)}
                  className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                  title="Hide timer controls"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted block leading-none">
                    REST TIMER
                  </span>
                  <div className="text-lg sm:text-xl font-black font-mono text-text-primary tracking-tight leading-none mt-0.5 tabular-nums">
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
                  className="px-2 py-1 rounded-lg bg-bg-secondary text-text-muted hover:text-text-primary border border-border text-xs font-mono font-bold hover:border-accent/40 active:scale-95 transition-all"
                  title="Subtract 30 seconds"
                >
                  -30s
                </button>
                <button
                  type="button"
                  onClick={() => adjustTimer(30)}
                  className="px-2.5 py-1 rounded-lg bg-bg-secondary text-text-primary border border-border text-xs font-mono font-bold hover:border-accent/40 active:scale-95 transition-all"
                  title="Add 30 seconds"
                >
                  +30s
                </button>
                <button
                  type="button"
                  onClick={skipTimer}
                  className="px-3 py-1 rounded-lg bg-accent text-white text-xs font-bold active:scale-95 transition-all shadow-xs"
                >
                  SKIP
                </button>
              </div>
            </div>
          )}
        </div>
      </footer>

      {/* ── Quick Exercise Jump Drawer ─────────────────────────────────── */}
      {isExerciseJumpOpen && (
        <div className="modal-overlay" onClick={() => setIsExerciseJumpOpen(false)}>
          <div
            className="modal-content max-w-sm rounded-t-3xl sm:rounded-3xl p-5 space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <span className="text-3xs font-mono font-bold uppercase tracking-wider text-accent">
                  QUICK NAVIGATION
                </span>
                <h3 className="text-base font-black text-text-primary font-sans mt-0.5">
                  Jump to Exercise
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExerciseJumpOpen(false)}
                className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto no-scrollbar">
              {exercises.map((ex, idx) => {
                const isCurrent = idx === activeExerciseIdx;
                const completedCount = ex.sets.filter((s) => s.completed || (s.reps > 0 && (parseFloat(String(s.weight)) || 0) > 0)).length;
                const totalCount = ex.sets.length;
                const isDone = totalCount > 0 && completedCount === totalCount;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveExerciseIdx(idx);
                      setIsExerciseJumpOpen(false);
                    }}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.98] ${
                      isCurrent
                        ? 'bg-accent/15 border-accent text-text-primary shadow-xs'
                        : isDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-text-secondary hover:border-emerald-500/60'
                        : 'bg-bg-secondary/60 border-border/70 text-text-primary hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono font-black text-xs shrink-0 ${
                          isCurrent
                            ? 'bg-accent text-white'
                            : isDone
                            ? 'bg-emerald-500 text-white'
                            : 'bg-bg-secondary text-text-muted border border-border'
                        }`}
                      >
                        {isDone ? '✓' : idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate font-sans">
                          {ex.name}
                        </div>
                        <div className="text-3xs font-mono text-text-muted">
                          {completedCount} of {totalCount} sets completed
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {isCurrent && (
                        <span className="text-3xs font-mono font-bold px-2 py-0.5 rounded-full bg-accent text-white">
                          Active
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
                Generates a proven powerlifting ramp to prime your nervous system and prevent injury before your working sets.
              </p>

              <div className="p-3 rounded-xl bg-bg-secondary border border-border/80 space-y-2 font-mono text-2xs">
                <div className="flex items-center justify-between text-accent font-bold">
                  <span>Planned Warm-up Progression</span>
                  <span className="text-text-muted font-normal text-3xs">
                    Target: {generatedWarmupPreview.workingWeight} {userUnit}
                  </span>
                </div>
                <div className="space-y-1.5 divide-y divide-border/40">
                  {generatedWarmupPreview.warmups.map((w, idx) => (
                    <div key={idx} className="pt-1.5 first:pt-0 flex items-center justify-between text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold text-3xs border border-amber-500/20">
                          W{idx + 1}
                        </span>
                        <span className="font-semibold text-text-primary">
                          {w.weight} {w.unit} × {w.reps} reps
                        </span>
                      </div>
                      <span className="text-3xs text-text-muted truncate max-w-[130px]">{w.label}</span>
                    </div>
                  ))}
                </div>
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

      {/* ── Change Exercise Modal (Full Library Browser) ──────────────────── */}
      <ExerciseSelectorModal
        isOpen={isChangeExerciseModalOpen}
        onClose={() => setIsChangeExerciseModalOpen(false)}
        title="Change Exercise"
        defaultMuscle={getExerciseMuscle(currentExercise?.name || '')}
        onSelectExercise={(selected) => {
          handleSelectNewExerciseName(selected.name, selected.isBodyweight);
          setIsChangeExerciseModalOpen(false);
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

              {/* Post-Workout Adaptation Ledger */}
              <div className="space-y-2 pt-1 text-left">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted block">
                  TRAINING ADAPTATION SUMMARY
                </span>

                {/* 1. What improved */}
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>What improved</span>
                  </div>
                  <ul className="text-2xs text-text-secondary space-y-0.5 list-disc list-inside">
                    {postWorkoutLedger.improved.map((item, idx) => (
                      <li key={idx} className="leading-snug">{item}</li>
                    ))}
                  </ul>
                </div>

                {/* 2. What stays the same */}
                <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                    <Layers className="w-3.5 h-3.5 text-text-muted" />
                    <span>What stays the same</span>
                  </div>
                  <ul className="text-2xs text-text-muted space-y-0.5 list-disc list-inside">
                    {postWorkoutLedger.steady.map((item, idx) => (
                      <li key={idx} className="leading-snug">{item}</li>
                    ))}
                  </ul>
                </div>

                {/* 3. What changes next time */}
                <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>What changes next time</span>
                  </div>
                  <ul className="text-2xs text-text-secondary space-y-0.5 list-disc list-inside">
                    {postWorkoutLedger.nextRules.map((item, idx) => (
                      <li key={idx} className="leading-snug">{item}</li>
                    ))}
                  </ul>
                </div>
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

      {/* 1-Tap RPE / Effort Picker Modal */}
      {activeRpePickerSetIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-sm bg-bg-card border border-border/80 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <h3 className="font-bold text-text-primary text-sm font-sans">
                  Select Effort (RPE)
                </h3>
                <p className="text-3xs text-text-muted">
                  Set {activeRpePickerSetIdx + 1} • Rate of Perceived Exertion
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRpePickerSetIdx(null)}
                className="p-1 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {[
                { rpe: 6, label: 'Warm-up / Light', rir: '4+ RIR', desc: 'Could do 4+ more' },
                { rpe: 7, label: 'Moderate', rir: '3 RIR', desc: 'Fast bar speed' },
                { rpe: 7.5, label: 'Moderate+', rir: '2-3 RIR', desc: 'Crisp & strong' },
                { rpe: 8, label: 'Sweet Spot', rir: '2 RIR', desc: 'Standard target' },
                { rpe: 8.5, label: 'Heavy', rir: '1-2 RIR', desc: 'Challenging' },
                { rpe: 9, label: 'Very Heavy', rir: '1 RIR', desc: 'Could do 1 more' },
                { rpe: 9.5, label: 'Near Limit', rir: '<1 RIR', desc: 'Grind / Almost max' },
                { rpe: 10, label: 'Maximum Effort', rir: '0 RIR', desc: 'Absolute limit' },
              ].map((item) => {
                const currentVal = currentExercise?.sets[activeRpePickerSetIdx]?.rpe || 8;
                const isSelected = currentVal === item.rpe;
                return (
                  <button
                    key={item.rpe}
                    type="button"
                    onClick={() => {
                      handleRPESelect(activeRpePickerSetIdx, item.rpe);
                      setActiveRpePickerSetIdx(null);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-accent/15 border-accent text-accent shadow-xs'
                        : 'bg-bg-secondary/70 border-border/70 hover:border-border text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-black text-sm">@{item.rpe}</span>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-accent/20 text-accent' : 'bg-bg-tertiary text-text-muted'
                      }`}>
                        {item.rir}
                      </span>
                    </div>
                    <div className="text-2xs font-bold truncate">{item.label}</div>
                    <div className="text-[10px] text-text-muted truncate">{item.desc}</div>
                  </button>
                );
              })}
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
