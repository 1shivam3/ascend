'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
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
import { getDemoForExercise } from '@/lib/exercise-media';
import ExerciseDemo from '@/components/ExerciseDemo';
import { WorkoutExercise, WorkoutSet, WorkoutEntry, PersonalRecord, AthleteGoal, ATHLETE_GOAL_CONFIGS, SetExecutionStatus, isSetCompleted, DEFAULT_GOALS, resolvePrimaryGoal, Unit } from '@/lib/types';
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
  getFilteredSubstitutes,
  getExercisePrescription,
  isActiveSetCompleted,
  finalizeWorkoutExercises,
  getExecutedExercises,
  getNextSessionTarget,
  applyExerciseEffortRating,
} from '@/lib/workout-engine';
import { calculatePlates, PlateInfo, BARBELL_PRESETS } from '@/lib/plate-calculator';
import { compareSetAdherence } from '@/lib/workout-adherence';
import { useToast } from '@/components/ui/Toast';
import { CollapsibleDetails } from '@/components/ui/CollapsibleDetails';
import { getPackedGymSwapsForNames } from '@/lib/crowded-gym';
import { useTranslation, type StringKey } from '@/lib/i18n';
import VoiceWorkoutLoggerModal from '@/components/VoiceWorkoutLoggerModal';
import ConstraintAdapterModal from '@/components/ConstraintAdapterModal';
import ExerciseSelectorModal from '@/components/ExerciseSelectorModal';
import { VoiceWorkoutResult } from '@/lib/voice-logger';
import { useAppNavigation } from '@/lib/navigation';
import { safeRandomId, getLocalTodayStr, formatDuration } from '@/lib/formatters';
import ConfirmationModal from '@/components/ConfirmationModal';

interface ActiveWorkoutScreenProps {
  initialExercises: WorkoutExercise[];
  workoutName?: string;
  planId?: string;
  /** Epoch ms when the session originally started (restored on resume so the timer doesn't reset). */
  initialSessionStartTime?: number;
  onFinish: (workout: WorkoutEntry, newPRsCount: number) => void;
  onCancel: () => void;
  onPause?: () => void;
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

/** Compact crowded-gym swap banner: one line, Swap / Keep. */
function PackedSwapBanner({
  text,
  swapLabel,
  keepLabel,
  onSwap,
  onKeep,
  compact = false,
}: {
  text: string;
  swapLabel: string;
  keepLabel: string;
  onSwap: () => void;
  onKeep: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-accent/10 border border-accent/30 animate-fade-in ${
        compact ? '' : 'mb-4'
      }`}
    >
      <span className="text-xs font-semibold text-text-primary leading-snug">{text}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onSwap}
          className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-3xs font-bold active:scale-95 transition-all cursor-pointer"
        >
          {swapLabel}
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-border text-3xs font-semibold text-text-secondary active:scale-95 transition-all cursor-pointer"
        >
          {keepLabel}
        </button>
      </span>
    </div>
  );
}

export default function ActiveWorkoutScreen({
  initialExercises,
  workoutName = 'Workout Session',
  planId,
  initialSessionStartTime,
  onFinish,
  onCancel,
  onPause,
}: ActiveWorkoutScreenProps) {
  const { profile, workouts, addPR, prs, saveWorkoutDraft, trainingDecisions } = useStore();
  const userMode = useStore((state) => state.userMode) || 'beginner';
  const toggleUserMode = useStore((state) => state.toggleUserMode);
  const toast = useToast();
  const userUnit = profile?.unit || 'kg';

  // Athlete goal personalization — single source of truth via resolvePrimaryGoal
  const primaryGoal: AthleteGoal = resolvePrimaryGoal(profile?.goals);
  const goalConfig = ATHLETE_GOAL_CONFIGS[primaryGoal] || ATHLETE_GOAL_CONFIGS.build_muscle;

  // Beginner mode: one set at a time & exercise effort prompt
  const [activeSetIdx, setActiveSetIdx] = useState<number>(0);
  const [showEffortPrompt, setShowEffortPrompt] = useState<boolean>(false);
  const [exerciseToRemove, setExerciseToRemove] = useState<number | null>(null);
  const [effortChosen, setEffortChosen] = useState<'easy' | 'good' | 'hard' | null>(null);
  // Exercises for which the effort prompt was already answered — never re-show
  // (e.g. after removing a different exercise shifts the indices).
  const effortAnsweredRef = useRef<Set<number>>(new Set());
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
        const isBW = isBodyweightExercise(exName);
        const rawSets = (e.sets && e.sets.length > 0) ? e.sets : [
          { weight: isBW ? 0 : undefined, reps: defaultReps, unit: userUnit, completed: false, rpe: 8 },
        ];
        return {
          ...e,
          name: exName,
          sets: rawSets.map((s) => {
            let finalWeight: number | undefined = undefined;
            if (typeof s.weight === 'number' && !isNaN(s.weight)) {
              finalWeight = s.weight;
            } else if (typeof s.weight === 'string' && (s.weight as string).trim() !== '') {
              const parsed = parseFloat(s.weight as string);
              finalWeight = isNaN(parsed) ? undefined : parsed;
            } else if (isBW) {
              finalWeight = 0;
            } else {
              finalWeight = undefined;
            }

            const isDone = isActiveSetCompleted(s);
            const resolvedStatus = s.status || (isDone ? 'completed' : 'pending');

            // CRITICAL (Issue 2):
            // When resuming an existing draft, NEVER fabricate prescriptions!
            // If the draft recorded prescribedWeight / prescribedReps, retain them.
            // If it is an old draft without recorded prescriptions, leave them undefined.
            // Handle partial prescription fields deliberately without assumptions.
            const prescribedWeight = s.prescribedWeight !== undefined ? s.prescribedWeight : undefined;
            const prescribedReps = s.prescribedReps !== undefined ? s.prescribedReps : undefined;
            const prescribedRpe = s.prescribedRpe !== undefined ? s.prescribedRpe : undefined;
            const prescribedUnit = s.prescribedUnit !== undefined ? s.prescribedUnit : undefined;
            const appliedDecisionId = s.appliedDecisionId || e.appliedDecisionId;

            return {
              ...s,
              weight: finalWeight,
              unit: s.unit || userUnit,
              completed: isDone,
              status: resolvedStatus,
              prescribedWeight,
              prescribedReps,
              prescribedRpe,
              prescribedUnit,
              appliedDecisionId,
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
          {
            weight: defaultBenchW,
            reps: defaultReps,
            unit: userUnit,
            completed: false,
            status: 'pending',
            rpe: 8,
            prescribedWeight: defaultBenchW,
            prescribedReps: defaultReps,
            prescribedRpe: 8,
            prescribedUnit: userUnit,
          },
          {
            weight: defaultBenchW,
            reps: defaultReps,
            unit: userUnit,
            completed: false,
            status: 'pending',
            rpe: 8,
            prescribedWeight: defaultBenchW,
            prescribedReps: defaultReps,
            prescribedRpe: 8,
            prescribedUnit: userUnit,
          },
          {
            weight: defaultBenchW,
            reps: defaultReps,
            unit: userUnit,
            completed: false,
            status: 'pending',
            rpe: 8,
            prescribedWeight: defaultBenchW,
            prescribedReps: defaultReps,
            prescribedRpe: 8,
            prescribedUnit: userUnit,
          },
        ],
      },
    ];
  });

  const [activeExerciseIdx, setActiveExerciseIdx] = useState<number>(0);
  // Restored from the draft on resume so the timer keeps counting instead of resetting to 0:00.
  const [sessionStartTime] = useState<number>(() => initialSessionStartTime || Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Modals & Panels
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const plateModalRef = useRef<HTMLDivElement>(null); const { dialogProps: plateDialogProps } = useModalA11y(plateModalRef, isPlateModalOpen, () => setIsPlateModalOpen(false));
  const [plateTargetWeight, setPlateTargetWeight] = useState<number>(60);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const finishModalRef = useRef<HTMLDivElement>(null); const { dialogProps: finishDialogProps } = useModalA11y(finishModalRef, isFinishModalOpen, () => setIsFinishModalOpen(false));
  // QA4-028: double-submit guard for workout finish — the workout id is
  // minted inside handleConfirmFinish, so a fast double-tap would save
  // two distinct workouts. Ref blocks re-entry synchronously; state
  // disables the button.
  const [isFinishing, setIsFinishing] = useState(false);
  const isFinishingRef = useRef(false);
  const [isWarmupModalOpen, setIsWarmupModalOpen] = useState(false);
  const warmupModalRef = useRef<HTMLDivElement>(null); const { dialogProps: warmupDialogProps } = useModalA11y(warmupModalRef, isWarmupModalOpen, () => setIsWarmupModalOpen(false));
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const discardConfirmRef = useRef<HTMLDivElement>(null); const { dialogProps: discardDialogProps } = useModalA11y(discardConfirmRef, isDiscardConfirmOpen, () => setIsDiscardConfirmOpen(false));
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const swapModalRef = useRef<HTMLDivElement>(null); const { dialogProps: swapDialogProps } = useModalA11y(swapModalRef, isSwapModalOpen, () => setIsSwapModalOpen(false));
  const [swapReason, setSwapReason] = useState<'equipment' | 'hurts' | 'too_hard' | 'prefer_other'>('equipment');
  const trainingProfile = useStore((state) => state.trainingProfile);
  const setTrainingProfile = useStore((state) => state.setTrainingProfile);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isExerciseJumpOpen, setIsExerciseJumpOpen] = useState(false);
  const exerciseJumpRef = useRef<HTMLDivElement>(null); const { dialogProps: exerciseJumpDialogProps } = useModalA11y(exerciseJumpRef, isExerciseJumpOpen, () => setIsExerciseJumpOpen(false));
  // Crowded-gym mode — per session, never persisted. When ON, every
  // remaining exercise gets a one-tap dumbbell/bodyweight swap banner;
  // accepted swaps are real session changes and stay when it's OFF.
  const [gymPacked, setGymPacked] = useState(false);
  const [packedDismissed, setPackedDismissed] = useState<Set<string>>(new Set());
  const { t } = useTranslation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [localExerciseName, setLocalExerciseName] = useState('');
  const renameContainerRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(-1);
  const [isChangeExerciseModalOpen, setIsChangeExerciseModalOpen] = useState<boolean>(false);
  const [weightInputStr, setWeightInputStr] = useState<string | null>(null);

  const { registerBackHandler } = useAppNavigation();

  // Sub-sheet back handlers
  useEffect(() => {
    if (isDiscardConfirmOpen) {
      return registerBackHandler(() => { setIsDiscardConfirmOpen(false); return true; }, 120);
    }
  }, [isDiscardConfirmOpen, registerBackHandler]);

  useEffect(() => {
    if (isFinishModalOpen) {
      return registerBackHandler(() => { setIsFinishModalOpen(false); return true; }, 110);
    }
  }, [isFinishModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isPlateModalOpen) {
      return registerBackHandler(() => { setIsPlateModalOpen(false); return true; }, 110);
    }
  }, [isPlateModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isWarmupModalOpen) {
      return registerBackHandler(() => { setIsWarmupModalOpen(false); return true; }, 110);
    }
  }, [isWarmupModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isAddExerciseModalOpen) {
      return registerBackHandler(() => { setIsAddExerciseModalOpen(false); return true; }, 110);
    }
  }, [isAddExerciseModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isVoiceModalOpen) {
      return registerBackHandler(() => { setIsVoiceModalOpen(false); return true; }, 110);
    }
  }, [isVoiceModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isAdaptModalOpen) {
      return registerBackHandler(() => { setIsAdaptModalOpen(false); return true; }, 110);
    }
  }, [isAdaptModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isMoreMenuOpen) {
      return registerBackHandler(() => { setIsMoreMenuOpen(false); return true; }, 110);
    }
  }, [isMoreMenuOpen, registerBackHandler]);

  useEffect(() => {
    if (isExerciseJumpOpen) {
      return registerBackHandler(() => { setIsExerciseJumpOpen(false); return true; }, 110);
    }
  }, [isExerciseJumpOpen, registerBackHandler]);

  useEffect(() => {
    if (isChangeExerciseModalOpen) {
      return registerBackHandler(() => { setIsChangeExerciseModalOpen(false); return true; }, 110);
    }
  }, [isChangeExerciseModalOpen, registerBackHandler]);

  // Main Active Workout back interceptor (prevents accidental screen dismissal)
  useEffect(() => {
    return registerBackHandler(() => {
      setIsDiscardConfirmOpen(true);
      return true;
    }, 95);
  }, [registerBackHandler]);

  // Sticky Rest Timer state (initialized to athlete's goal rest duration)
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(() => goalConfig.defaultRestSeconds);
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [isRestRunning, setIsRestRunning] = useState<boolean>(false);
  const [isRestFinished, setIsRestFinished] = useState<boolean>(false);
  const [isRestPopoverOpen, setIsRestPopoverOpen] = useState<boolean>(false);

  // ── Screen 13: Dedicated Set Complete Transition state ────────────────────
  const [completedSetSummary, setCompletedSetSummary] = useState<{
    exerciseName: string;
    setIndex: number;
    totalSets: number;
    weight: number;
    reps: number;
    unit: string;
    isPR?: boolean;
  } | null>(null);
  const [isCompletingSet, setIsCompletingSet] = useState(false);

  useEffect(() => {
    if (completedSetSummary) {
      return registerBackHandler(() => {
        setCompletedSetSummary(null);
        return true;
      }, 105);
    }
  }, [completedSetSummary, registerBackHandler]);

  // Current active exercise
  const currentExercise = exercises[activeExerciseIdx] || exercises[0];

  const completedSetsThisEx = useMemo(() => {
    return currentExercise?.sets.filter(isActiveSetCompleted).length || 0;
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
  const rpePickerRef = useRef<HTMLDivElement>(null); const { dialogProps: rpeDialogProps } = useModalA11y(rpePickerRef, activeRpePickerSetIdx !== null, () => setActiveRpePickerSetIdx(null));

  // When the Set Complete overlay is dismissed and all sets are done, surface
  // the effort prompt (it was deferred while the overlay was up).
  useEffect(() => {
    if (!completedSetSummary && !showEffortPrompt && !effortChosen && !effortAnsweredRef.current.has(activeExerciseIdx)) {
      const currentSets = exercises[activeExerciseIdx]?.sets || [];
      if (currentSets.length > 0 && currentSets.every(isActiveSetCompleted)) {
        setShowEffortPrompt(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSetSummary]);

  useEffect(() => {
    setIsEditingName(false);
    setLocalExerciseName(exercises[activeExerciseIdx]?.name || '');
    setSelectedSuggestionIdx(-1);
    const currentSets = exercises[activeExerciseIdx]?.sets || [];
    const firstIncomplete = currentSets.findIndex((s) => !isActiveSetCompleted(s));
    setActiveSetIdx(firstIncomplete !== -1 ? firstIncomplete : 0);
    // Never re-show the prompt for an exercise that was already answered —
    // removing another exercise shifts indices and must not resurrect it.
    const alreadyAnswered = effortAnsweredRef.current.has(activeExerciseIdx);
    setShowEffortPrompt(
      !alreadyAnswered && currentSets.length > 0 && currentSets.every(isActiveSetCompleted)
    );
    setEffortChosen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExerciseIdx]);

  // ── Auto-save In-Progress Session to Local Storage ────────────────────────
  // Only snapshot once the athlete has genuinely started: at least one set
  // explicitly completed. Saving on mere exercise names caused phantom
  // "IN-PROGRESS WORKOUT DETECTED" banners for sessions the athlete never
  // began (template exercises are pre-named on open).
  useEffect(() => {
    if (exercises.some((e) => e.sets.some((s) => isActiveSetCompleted(s)))) {
      saveWorkoutDraft({
        date: getLocalTodayStr(),
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
      toast.error(t('workout.toastCannotRemove'), t('workout.toastCannotRemoveTitle'));
      return;
    }
    const target = exercises[idxToRemove];
    const completedSets = target?.sets.filter(isActiveSetCompleted).length || 0;
    if (completedSets > 0) {
      // Confirm when logged work would be destroyed.
      setExerciseToRemove(idxToRemove);
      return;
    }
    confirmRemoveExercise(idxToRemove);
  };

  const confirmRemoveExercise = (idxToRemove: number) => {
    const removedName = exercises[idxToRemove]?.name || 'Exercise';
    setExercises((prev) => prev.filter((_, i) => i !== idxToRemove));
    setActiveExerciseIdx((prev) => (prev >= idxToRemove ? Math.max(0, prev - 1) : prev));
    toast.info(t('workout.toastRemoved', { name: removedName }), t('workout.toastExerciseRemovedTitle'));
    setExerciseToRemove(null);
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
            updatedSets = ex.sets.map((s) => (isActiveSetCompleted(s) ? s : { ...s, weight: 0 }));
          } else if (!isBodyweight && wasBodyweight) {
            const defaultWeight = userUnit === 'lbs' ? 115 : 50;
            updatedSets = ex.sets.map((s) =>
              isActiveSetCompleted(s) ? s : { ...s, weight: (parseFloat(String(s.weight)) || 0) === 0 ? defaultWeight : s.weight }
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
      toast.success(t('workout.toastChanged', { name: trimmed }), t('workout.toastExerciseUpdatedTitle'));
    },
    [activeExerciseIdx, currentExercise?.name, userUnit, toast]
  );

  // Guided swap: replaces the current exercise with a same-pattern substitute.
  // "Hurts" swaps additionally (a) flag pain on the session entry so the
  // SAFETY-01 policy locks progression, and (b) persist the exercise in
  // dislikedExercises so future generated plans never prescribe it again.
  const handleApplySwap = useCallback(
    (subName: string) => {
      const original = currentExercise?.name;
      if (swapReason === 'hurts' && original) {
        setExercises((prev) =>
          prev.map((ex, i) =>
            i === activeExerciseIdx
              ? {
                  ...ex,
                  reportsPain: true,
                  // The rename below changes this entry into the substitute —
                  // painfulExerciseName keeps the pain attributed to the
                  // ORIGINAL exercise so SAFETY-01 locks the right lift.
                  painfulExerciseName: original,
                  athleteFlags: { ...(ex.athleteFlags || {}), reportsPain: true },
                }
              : ex
          )
        );
        const existing = trainingProfile?.dislikedExercises || [];
        if (!existing.includes(original)) {
          setTrainingProfile({ dislikedExercises: [...existing, original] });
        }
        toast.info(t('workout.toastPainNoted', { name: original }), t('workout.toastPainTitle'));
      }
      handleSelectNewExerciseName(subName);
      setIsSwapModalOpen(false);
    },
    [activeExerciseIdx, currentExercise?.name, swapReason, trainingProfile?.dislikedExercises, setTrainingProfile, handleSelectNewExerciseName, toast]
  );

  // ── Crowded-gym suggestions (aligned by exercise index) ──────────────
  const packedSwaps = useMemo(
    () =>
      gymPacked
        ? getPackedGymSwapsForNames(
            exercises.map((e) => e.name),
            { exclusions: trainingProfile?.dislikedExercises || [] }
          )
        : [],
    [gymPacked, exercises, trainingProfile?.dislikedExercises]
  );

  const dismissPackedFor = useCallback((name: string) => {
    setPackedDismissed((prev) => new Set(prev).add(name));
  }, []);

  // Accept a packed swap at any index. The ACTIVE exercise goes through
  // the existing swap path (handleSelectNewExerciseName); other indices
  // get the same rename semantics — bodyweight <-> weighted set-weight
  // adaptation on uncompleted sets only.
  const applyPackedSwapAt = useCallback(
    (idx: number) => {
      const swap = packedSwaps[idx];
      if (!swap) return;
      if (idx === activeExerciseIdx) {
        handleSelectNewExerciseName(swap.name);
        return;
      }
      const target = exercises[idx];
      if (!target) return;
      const isBodyweight = isBodyweightExercise(swap.name);
      const wasBodyweight = isBodyweightExercise(target.name);
      setExercises((prev) =>
        prev.map((ex, i) => {
          if (i !== idx) return ex;
          let updatedSets = ex.sets;
          if (isBodyweight && !wasBodyweight) {
            updatedSets = ex.sets.map((s) => (isActiveSetCompleted(s) ? s : { ...s, weight: 0 }));
          } else if (!isBodyweight && wasBodyweight) {
            const defaultWeight = userUnit === 'lbs' ? 115 : 50;
            updatedSets = ex.sets.map((s) =>
              isActiveSetCompleted(s)
                ? s
                : { ...s, weight: (parseFloat(String(s.weight)) || 0) === 0 ? defaultWeight : s.weight }
            );
          }
          return { ...ex, name: swap.name, sets: updatedSets };
        })
      );
      toast.success(t('workout.toastChanged', { name: swap.name }), t('workout.toastExerciseUpdatedTitle'));
    },
    [packedSwaps, activeExerciseIdx, exercises, handleSelectNewExerciseName, userUnit, toast]
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

  // Timestamp-based drift-free rest timer reference
  const restTargetEndTimeRef = useRef<number | null>(null);

  // Elapsed workout timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  // Countdown Rest Timer - timestamp based to eliminate mobile background/tab sleep drift
  useEffect(() => {
    if (!isRestRunning) return;
    const updateTick = () => {
      const endTime = restTargetEndTimeRef.current;
      if (!endTime) return;
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      if (remaining <= 0) {
        setIsRestRunning(false);
        setIsRestFinished(true);
        setRestSecondsLeft(0);
        restTargetEndTimeRef.current = null;
        playRestDoneChime();
        triggerHaptic('rest_done');
      } else {
        setRestSecondsLeft(remaining);
      }
    };

    updateTick();
    const interval = setInterval(updateTick, 500);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateTick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isRestRunning, playRestDoneChime]);

  // Start rest timer
  const startTimer = useCallback(
    (seconds?: number) => {
      const targetSec = seconds || defaultRestDuration;
      restTargetEndTimeRef.current = Date.now() + targetSec * 1000;
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
    } else if (isRestRunning) {
      restTargetEndTimeRef.current = null;
      setIsRestRunning(false);
    } else {
      restTargetEndTimeRef.current = Date.now() + restSecondsLeft * 1000;
      setIsRestRunning(true);
    }
  };

  const adjustTimer = (delta: number) => {
    setRestSecondsLeft((prev) => {
      const next = Math.max(0, prev + delta);
      if (restTargetEndTimeRef.current) {
        restTargetEndTimeRef.current += delta * 1000;
      }
      return next;
    });
  };

  const skipTimer = () => {
    restTargetEndTimeRef.current = null;
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
      primaryGoal,
      trainingDecisions
    );
  }, [currentExercise?.name, workouts, prs, userUnit, primaryGoal, trainingDecisions]);

  const targetDisplay = useMemo(() => {
    if (!currentExercise || !currentExercise.sets || currentExercise.sets.length === 0) {
      return { text: '—', isUnconfigured: true, targetRpe: undefined };
    }
    const firstSet = currentExercise.sets[0];
    const isBW = isBodyweightExercise(currentExercise.name);
    const targetReps = firstSet?.prescribedReps ?? firstSet?.reps ?? 8;
    const targetRpe = firstSet?.prescribedRpe;

    // 1. Explicit numeric prescribed weight
    if (typeof firstSet?.prescribedWeight === 'number' && Number.isFinite(firstSet.prescribedWeight)) {
      if (isBW) {
        if (firstSet.prescribedWeight === 0) {
          return { text: `BW × ${targetReps} reps`, isUnconfigured: false, targetRpe };
        } else {
          return { text: `+${firstSet.prescribedWeight} ${firstSet.prescribedUnit || userUnit} × ${targetReps} reps`, isUnconfigured: false, targetRpe };
        }
      }
      return {
        text: `${firstSet.prescribedWeight} ${firstSet.prescribedUnit || userUnit} × ${targetReps} reps`,
        isUnconfigured: false,
        targetRpe,
      };
    }

    // 2. Bodyweight exercise without explicit extra load:
    if (isBW) {
      return { text: `BW × ${targetReps} reps`, isUnconfigured: false, targetRpe };
    }

    // 3. Unconfigured non-bodyweight exercise:
    return {
      text: `Unconfigured load × ${targetReps} reps`,
      isUnconfigured: true,
      targetRpe: undefined,
    };
  }, [currentExercise, userUnit]);

  const formCues = useMemo(() => {
    if (!currentExercise?.name) return [];
    return getExerciseFormCues(currentExercise.name);
  }, [currentExercise?.name]);

  // Animated demo (original SVG artwork — see lib/exercise-media). Most
  // exercises have none; the Form affordance then stays exactly as it was,
  // driven by cues alone. No demo → no extra UI, never a placeholder.
  const currentDemo = useMemo(() => {
    if (!currentExercise?.name) return null;
    return getDemoForExercise(currentExercise.name);
  }, [currentExercise?.name]);
  const hasFormSurface = formCues.length > 0 || currentDemo !== null;

  const [showFormCues, setShowFormCues] = useState(false);
  const formCuesRef = useRef<HTMLDivElement>(null); const { dialogProps: formCuesDialogProps } = useModalA11y(formCuesRef, showFormCues, () => setShowFormCues(false));
  const [showWhyTarget, setShowWhyTarget] = useState(false);
  const whyTargetRef = useRef<HTMLDivElement>(null); const { dialogProps: whyTargetDialogProps } = useModalA11y(whyTargetRef, showWhyTarget, () => setShowWhyTarget(false));

  // Close the form-cues / why-target sheets when the exercise changes, so
  // they never show stale content for the wrong exercise.
  useEffect(() => {
    setShowFormCues(false);
    setShowWhyTarget(false);
  }, [activeExerciseIdx]);
  useEffect(() => {
    if (showFormCues) {
      return registerBackHandler(() => { setShowFormCues(false); return true; }, 110);
    }
  }, [showFormCues, registerBackHandler]);
  useEffect(() => {
    if (showWhyTarget) {
      return registerBackHandler(() => { setShowWhyTarget(false); return true; }, 110);
    }
  }, [showWhyTarget, registerBackHandler]);

  // Training Adaptation Summary. Next-session targets come from the single
  // canonical getNextSessionTarget() — the same function the Coach's Take
  // reads — so the two surfaces can never contradict each other.
  const postWorkoutLedger = useMemo(() => {
    const improved: string[] = [];
    const steady: string[] = [];
    const nextRules: Array<{ summary: string; rationale?: string }> = [];

    for (const ex of exercises) {
      if (!ex.name.trim()) continue;
      const validSets = ex.sets.filter(isActiveSetCompleted);
      if (validSets.length === 0) continue;
      const target = getNextSessionTarget(
        ex.name,
        validSets.map((s) => ({
          weight: parseFloat(String(s.weight)) || 0,
          reps: parseInt(String(s.reps), 10) || 0,
          rpe: s.rpe,
          unit: (s.unit as Unit) || userUnit,
        })),
        userUnit,
        {
          // Pain flagged on THIS movement holds its progression. When the
          // entry is a pain-swap substitute, the pain belongs to the
          // original (painfulExerciseName) — the substitute progresses.
          hadPain:
            (ex.reportsPain === true || ex.athleteFlags?.reportsPain === true) &&
            (!ex.painfulExerciseName || ex.painfulExerciseName === ex.name),
        }
      );
      if (!target) continue;

      if (target.directive === 'progress_load') {
        improved.push(`${ex.name}: moved with reserve — ready for more load`);
      } else if (target.directive === 'hold') {
        steady.push(`${ex.name}: hard session — consolidating at ${target.weight}${userUnit}`);
      } else {
        steady.push(`${ex.name}: building reps at ${target.weight}${userUnit}`);
      }
      nextRules.push({ summary: target.summaryText, rationale: target.rationale });
    }

    return {
      improved: improved.length > 0 ? improved.slice(0, 2) : ['First session calibration completed'],
      steady: steady.length > 0 ? steady.slice(0, 2) : ['Movement quality & baseline established'],
      nextRules:
        nextRules.length > 0
          ? nextRules.slice(0, 2)
          : [{ summary: 'Follow prescribed target progression' }],
    };
  }, [exercises, userUnit]);

  // Weight & Reps handlers (direct typing + steppers)
  // A manual correction to one set carries forward to the remaining untouched
  // sets of the same exercise: later sets that are not completed and still
  // carry the edited set's previous value follow the correction. Sets the
  // athlete already customized (or completed) are never overwritten.
  const handleSetWeightChange = (setIdx: number, val: string | number | undefined) => {
    let numericWeight: number | undefined = undefined;
    if (typeof val === 'number') {
      numericWeight = isNaN(val) ? undefined : val;
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') {
        numericWeight = undefined;
      } else {
        const parsed = parseFloat(trimmed);
        numericWeight = isNaN(parsed) ? undefined : parsed;
      }
    }
    // QA4-026: typed input bypasses the stepper's Math.max(0, …) clamp —
    // apply the same floor here so a negative weight can never be stored.
    if (numericWeight !== undefined && Number.isFinite(numericWeight)) {
      numericWeight = Math.max(0, numericWeight);
    }
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        const oldWeight = ex.sets[setIdx]?.weight;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j === setIdx) return { ...s, weight: numericWeight };
            if (j > setIdx && !isActiveSetCompleted(s) && s.weight === oldWeight) {
              return { ...s, weight: numericWeight };
            }
            return s;
          }),
        };
      })
    );
  };

  const handleWeightStep = (setIdx: number, step: number) => {
    setWeightInputStr(null);
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        const editedSet = ex.sets[setIdx];
        const baseW = typeof editedSet?.weight === 'number' && !isNaN(editedSet.weight)
          ? editedSet.weight
          : (typeof editedSet?.prescribedWeight === 'number' && !isNaN(editedSet.prescribedWeight) ? editedSet.prescribedWeight : 0);
        const newW = Math.max(0, Math.round((baseW + step) * 10) / 10);
        const oldWeight = editedSet?.weight;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j === setIdx) return { ...s, weight: newW };
            if (j > setIdx && !isActiveSetCompleted(s) && s.weight === oldWeight) {
              return { ...s, weight: newW };
            }
            return s;
          }),
        };
      })
    );
  };

  const handleSetRepsChange = (setIdx: number, val: string | number) => {
    // QA4-026: typed reps were stored raw (`as any`), bypassing the
    // stepper's floor — a negative or fractional value persisted into
    // volume math. Normalize: keep '' while typing, otherwise a
    // non-negative integer.
    let cleanReps: string | number = val;
    if (typeof val === 'number') {
      cleanReps = Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0;
    } else if (typeof val === 'string' && val.trim() !== '') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) cleanReps = Math.max(0, Math.floor(parsed));
    }
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        const oldReps = ex.sets[setIdx]?.reps;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j === setIdx) return { ...s, reps: cleanReps as any };
            if (j > setIdx && !isActiveSetCompleted(s) && s.reps === oldReps) {
              return { ...s, reps: cleanReps as any };
            }
            return s;
          }),
        };
      })
    );
  };

  const handleRepsStep = (setIdx: number, step: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        const editedSet = ex.sets[setIdx];
        const currentR = parseInt(String(editedSet?.reps), 10) || 0;
        const newR = Math.max(1, currentR + step);
        const oldReps = editedSet?.reps;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j === setIdx) return { ...s, reps: newR };
            if (j > setIdx && !isActiveSetCompleted(s) && s.reps === oldReps) {
              return { ...s, reps: newR };
            }
            return s;
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
    setWeightInputStr(null);
    const wasCompleted = isActiveSetCompleted(currentExercise.sets[setIdx]);
    const isNowCompleted = !wasCompleted;

    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const finalW = (s.weight === undefined && isCurrentBodyweight) ? 0 : s.weight;
            return {
              ...s,
              weight: finalW,
              completed: isNowCompleted,
              status: isNowCompleted ? 'completed' : 'pending',
            };
          }),
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
        t('workout.toastSetLogged', {
          n: setIdx + 1,
          duration: restDuration >= 60 ? `${restDuration / 60}m` : `${restDuration}s`,
        }),
        t('workout.toastSetCompleteTitle')
      );
    }
  };

  const handleSkipSet = (setIdx: number) => {
    setWeightInputStr(null);
    const isCurrentlySkipped = currentExercise?.sets[setIdx]?.status === 'skipped';
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            return {
              ...s,
              completed: false,
              status: isCurrentlySkipped ? 'pending' : 'skipped',
            };
          }),
        };
      })
    );

    if (!isCurrentlySkipped) {
      toast.info(t('workout.toastSetSkipped', { n: setIdx + 1 }), t('workout.toastSetSkippedTitle'));
      // Advance to next incomplete set if available
      const nextIncomplete = currentExercise.sets.findIndex(
        (s, j) => j > setIdx && !isActiveSetCompleted(s) && s.status !== 'skipped'
      );
      if (nextIncomplete !== -1) {
        setActiveSetIdx(nextIncomplete);
      }
    } else {
      toast.info(t('workout.toastSetPending', { n: setIdx + 1 }), t('workout.toastSetPendingTitle'));
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
            if (!isActiveSetCompleted(s)) {
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
      t('workout.toastTargetApplied', {
        weight: progRec.targetWeight,
        unit: userUnit,
        reps: progRec.targetReps,
      }),
      t('workout.toastTargetAppliedTitle')
    );
  };

  const handleAddSet = () => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const lastValidWeight = (lastSet && typeof lastSet.weight === 'number' && !isNaN(lastSet.weight))
          ? lastSet.weight
          : (isCurrentBodyweight ? 0 : undefined);
        const newReps = lastSet ? (parseInt(String(lastSet.reps), 10) || 8) : defaultTargetReps;
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              weight: lastValidWeight,
              reps: newReps,
              unit: userUnit,
              completed: false,
              status: 'pending',
              rpe: lastSet?.rpe ?? 8,
              prescribedWeight: lastSet?.prescribedWeight,
              prescribedReps: lastSet?.prescribedReps,
              prescribedRpe: lastSet?.prescribedRpe,
              prescribedUnit: lastSet?.prescribedUnit,
              appliedDecisionId: lastSet?.appliedDecisionId,
            },
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
    if (isCompletingSet) return;
    setIsCompletingSet(true);
    setTimeout(() => setIsCompletingSet(false), 300);

    setWeightInputStr(null);
    const targetSet = currentExercise.sets[setIdx];
    const wasCompleted = isActiveSetCompleted(targetSet);
    const isNowCompleted = !wasCompleted;

    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== activeExerciseIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const finalW = (s.weight === undefined && isCurrentBodyweight) ? 0 : s.weight;
            return {
              ...s,
              weight: finalW,
              completed: isNowCompleted,
              status: isNowCompleted ? 'completed' : 'pending',
            };
          }),
        };
      })
    );

    if (isNowCompleted) {
      triggerHaptic('set_complete');
      // Auto start rest timer
      const restDuration = defaultRestDuration;
      startTimer(restDuration);

      const completedW = (targetSet.weight === undefined && isCurrentBodyweight) ? 0 : (targetSet.weight ?? 0);
      setCompletedSetSummary({
        exerciseName: currentExercise.name || 'Exercise',
        setIndex: setIdx,
        totalSets: currentExercise.sets.length,
        weight: completedW,
        reps: targetSet.reps,
        unit: userUnit,
        isPR: !!targetSet.isPR,
      });

      // Check if there is another set to perform in this exercise
      const remainingSets = currentExercise.sets.filter((s, j) => j !== setIdx && !isActiveSetCompleted(s));
      if (remainingSets.length > 0) {
        const nextIncomplete = currentExercise.sets.findIndex((s, j) => j > setIdx && !isActiveSetCompleted(s));
        if (nextIncomplete !== -1) {
          setActiveSetIdx(nextIncomplete);
        } else {
          const anyIncomplete = currentExercise.sets.findIndex((s, j) => j !== setIdx && !isActiveSetCompleted(s));
          if (anyIncomplete !== -1) setActiveSetIdx(anyIncomplete);
        }
      } else {
        // Defer the effort prompt until the Set Complete overlay is dismissed
        // (it stacks above otherwise).
        if (!completedSetSummary) setShowEffortPrompt(true);
      }
    }
  };

  const handleProceedNextSet = () => {
    setCompletedSetSummary(null);
    const remainingSets = currentExercise.sets.filter((s) => !isActiveSetCompleted(s));
    if (remainingSets.length > 0) {
      const nextIncomplete = currentExercise.sets.findIndex((s) => !isActiveSetCompleted(s));
      if (nextIncomplete !== -1) {
        setActiveSetIdx(nextIncomplete);
      }
    } else if (activeExerciseIdx < exercises.length - 1) {
      setActiveExerciseIdx((prev) => prev + 1);
      setActiveSetIdx(0);
    } else {
      setIsFinishModalOpen(true);
    }
  };

  const handleLogExerciseEffort = (rpe: number, label: 'easy' | 'good' | 'hard') => {
    setEffortChosen(label);
    effortAnsweredRef.current.add(activeExerciseIdx);
    // Store the exercise-level rating SEPARATELY. applyExerciseEffortRating
    // backfills only sets with no logged per-set RPE — never overwrites a
    // logged value (that corrupted History averages).
    setExercises((prev) =>
      prev.map((ex, i) => (i === activeExerciseIdx ? applyExerciseEffortRating(ex, rpe, label) : ex))
    );
    toast.success(
      t('workout.toastEffortLogged', {
        label: t(
          label === 'easy'
            ? 'workout.easy'
            : label === 'hard'
            ? 'workout.hard'
            : 'workout.target'
        ).toUpperCase(),
        rpe,
      }),
      t('workout.toastExerciseCompleteTitle')
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
          targetSetIdx = ex.sets.findIndex((s) => !isActiveSetCompleted(s));
        }

        let nextSets = [...ex.sets];
        if (targetSetIdx >= 0 && targetSetIdx < nextSets.length) {
          nextSets[targetSetIdx] = {
            ...nextSets[targetSetIdx],
            weight: result.weight,
            reps: result.reps,
            rpe: result.rpe ?? nextSets[targetSetIdx].rpe,
            completed: true,
            status: 'completed',
          };
        } else {
          nextSets.push({
            weight: result.weight,
            reps: result.reps,
            unit: userUnit,
            rpe: result.rpe,
            completed: true,
            status: 'completed',
            prescribedWeight: result.weight,
            prescribedReps: result.reps,
            prescribedRpe: result.rpe,
            prescribedUnit: userUnit,
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
      status: 'pending',
      rpe: w.rpe,
      isWarmup: true,
      prescribedWeight: w.weight,
      prescribedReps: w.reps,
      prescribedRpe: w.rpe,
      prescribedUnit: w.unit,
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
    toast.success(t('workout.toastWarmupAdded', { count: warmupsToInsert.length }), t('workout.toastWarmupAddedTitle'));
  };

  const [plateBarWeight, setPlateBarWeight] = useState<number>(() => (userUnit === 'lbs' ? 45 : 20));

  // Live Plate Calculator trigger
  const openPlateCalculatorForWeight = (weight: number) => {
    setPlateTargetWeight(weight);
    setIsPlateModalOpen(true);
  };

  // Plate calculation result
  const plateResult = useMemo(() => {
    return calculatePlates(plateTargetWeight, plateBarWeight, userUnit);
  }, [plateTargetWeight, plateBarWeight, userUnit]);

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
        const isDone = isActiveSetCompleted(s);
        if (isDone && sReps > 0) {
          completedSetsCount++;
          const wKg = s.unit === 'lbs' ? sWeight * 0.453592 : sWeight;
          totalVolumeKg += wKg * sReps;
        } else if (isDone) {
          completedSetsCount++;
        }
      }
    }

    return {
      totalVolumeKg: Math.round(totalVolumeKg),
      completedSetsCount,
      totalSetsCount,
      durationMinutes: Math.round(elapsedSeconds / 60),
      durationSeconds: elapsedSeconds,
      durationFormatted: formatDuration(elapsedSeconds),
    };
  }, [exercises, elapsedSeconds]);

  // Pause Workout & Save Draft to resume later
  const handlePauseWorkout = () => {
    saveWorkoutDraft({
      date: getLocalTodayStr(),
      name: workoutName,
      exercises,
      startedFromPlan: workoutName,
      sessionStartTime,
      savedAt: new Date().toISOString(),
    });
    toast.info(t('workout.toastPaused'), t('workout.toastPausedTitle'));
    if (onPause) {
      onPause();
    } else {
      onCancel();
    }
  };

  // Finish Workout & detect PRs
  const handleConfirmFinish = () => {
    // QA4-028: in-flight guard — a second tap while finishing must not
    // mint and save a duplicate workout (the id is created below).
    if (isFinishingRef.current) return;
    const today = getLocalTodayStr();
    const { validExercises, hasCompletedSets, hasMeaningfulData } = finalizeWorkoutExercises(exercises);

    if (!hasMeaningfulData) {
      toast.error(t('workout.toastCannotFinish'), t('workout.toastCannotFinishTitle'));
      return;
    }

    isFinishingRef.current = true;
    setIsFinishing(true);

    // PR detection (only evaluates completed sets)
    let newPRsCount = 0;
    if (hasCompletedSets) {
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
          if (s.isWarmup || !isSetCompleted(s)) continue;
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
                    if (pastSet.isWarmup || !isSetCompleted(pastSet)) continue;
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
          const isFirstExposure = existingPRs.length === 0;
          const prId = safeRandomId('pr');
          addPR({
            id: prId,
            exercise: ex.name,
            weightKg: topSet.weightKg,
            weightLbs: Math.round(topSet.weightKg * 2.20462 * 10) / 10,
            reps: topSet.reps,
            oneRepMax: topSet.e1RMKg,
            date: today,
            notes: isFirstExposure ? 'Baseline established from first session' : 'All-Time 1RM PR',
            prType: '1rm',
          });
          if (!isFirstExposure) {
            newPRsCount++;
          }
        } else if (bestRepPR) {
          const prId = safeRandomId('pr_rep');
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
    }

    // Record only what was actually performed or explicitly skipped.
    // Never fall back to the full plan: an interrupted session with zero
    // completed sets is saved with zero sets, not 17 phantom ones.
    const exercisesToSave = getExecutedExercises(validExercises);

    // Honest denominator for adherence: count prescribed sets in the FULL
    // session (before filtering to executed), so finishing 1 of 17 sets
    // reports 1/17 — not a re-baselined 1/1 = 100%.
    let plannedTotalSets: number | undefined;
    {
      let prescribed = 0;
      for (const ex of validExercises) {
        for (let idx = 0; idx < (ex.sets || []).length; idx++) {
          try {
            if (compareSetAdherence(ex.sets[idx], ex.name || '', idx).isPrescribed) prescribed++;
          } catch { /* treat unparseable sets as unprescribed */ }
        }
      }
      if (prescribed > 0) plannedTotalSets = prescribed;
    }

    const workoutEntry: WorkoutEntry = {
      id: safeRandomId('wk'),
      date: today,
      name: workoutName,
      planId,
      plannedTotalSets,
      durationMinutes: Math.round(elapsedSeconds / 60),
      durationSeconds: elapsedSeconds,
      exercises: exercisesToSave,
    };

    setIsFinishModalOpen(false);
    if (!hasCompletedSets) {
      toast.info(t('workout.toastInterrupted'), t('workout.toastInterruptedTitle'));
    }
    onFinish(workoutEntry, newPRsCount);
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary text-text-primary flex flex-col overflow-hidden select-none animate-fade-in font-sans">
      {/* ── Top Bar (Minimal, focused gym header) ───────────── */}
      <header className="px-4 py-2.5 bg-bg-card border-b border-border/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsDiscardConfirmOpen(true)}
            className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-lg bg-bg-secondary text-text-muted hover:text-danger flex items-center justify-center transition-colors active:scale-95 cursor-pointer shrink-0"
            aria-label="Discard Workout"
            title="Discard Workout"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-text-primary tracking-tight truncate max-w-[200px] sm:max-w-md font-sans">
              {workoutName}
            </h1>
            <div className="flex items-center gap-1.5 text-3xs font-mono text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handlePauseWorkout}
            className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg bg-bg-secondary hover:bg-bg-tertiary text-text-muted hover:text-text-primary border border-border/80 flex items-center justify-center transition-all cursor-pointer"
            title="Pause and save draft"
            aria-label="Pause and save draft"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsFinishModalOpen(true)}
            className="px-2.5 py-1.5 min-h-[40px] rounded-lg bg-bg-secondary hover:bg-emerald-500/15 border border-border/80 hover:border-emerald-500/40 text-text-secondary hover:text-emerald-400 font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer"
            title="Finish workout"
            aria-label="Finish workout"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">{t('common.finish')}</span>
          </button>

          {/* Form cues + Warm-up: the two things a beginner needs MOST
              were buried 4th/6th in the overflow menu. They get visible
              header buttons (the menu entries stay for discoverability). */}
          {hasFormSurface && (
            <button
              type="button"
              onClick={() => setShowFormCues((prev) => !prev)}
              className="px-2.5 py-1.5 min-h-[40px] rounded-lg bg-bg-secondary hover:bg-accent/15 border border-border/80 hover:border-accent/40 text-text-secondary hover:text-accent font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer"
              title="How to do this exercise — form cues"
              aria-label="Form cues for this exercise"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('workout.form')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsWarmupModalOpen(true)}
            className="px-2.5 py-1.5 min-h-[40px] rounded-lg bg-bg-secondary hover:bg-amber-500/15 border border-border/80 hover:border-amber-500/40 text-text-secondary hover:text-amber-400 font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer"
            title="Generate warm-up sets"
            aria-label="Warm-up sets"
          >
            <Flame className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('workout.warmup')}</span>
          </button>

          {/* Secondary ⋯ Tools Menu (Available for quick tools & helper sheets) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg bg-bg-secondary hover:bg-bg-tertiary border border-border/80 text-text-secondary hover:text-text-primary transition-all flex items-center justify-center active:scale-95 cursor-pointer"
              aria-label="Workout Tools & Options"
              title="Workout Tools & Options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {isMoreMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-bg-card border border-border shadow-xl p-1.5 z-50 animate-fade-in space-y-1"
                onClick={() => setIsMoreMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={handlePauseWorkout}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 text-text-muted" />
                  <span>{t('workout.pauseSaveDraft')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFinishModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{t('workout.finishWorkout')}</span>
                </button>
                <div className="border-t border-border/40 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    const firstW = parseFloat(String(currentExercise.sets[activeSetIdx]?.weight || currentExercise.sets[0]?.weight)) || 60;
                    openPlateCalculatorForWeight(firstW);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Dumbbell className="w-3.5 h-3.5 text-accent" />
                  <span>{t('workout.plateHelper')}</span>
                </button>
                {hasFormSurface && (
                  <button
                    type="button"
                    onClick={() => setShowFormCues((prev) => !prev)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>{t('workout.formCues')}</span>
                  </button>
                )}
                {prescription?.whyThisWeight && (
                  <button
                    type="button"
                    onClick={() => setShowWhyTarget((prev) => !prev)}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Bot className="w-3.5 h-3.5 text-accent" />
                    <span>{t('workout.whyTargetWeight')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsWarmupModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t('workout.warmupSets')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdaptModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-accent/15 hover:text-accent transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-accent" />
                  <span>{t('workout.changeRoutine')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-text-muted" />
                  <span>{t('workout.voiceDictation')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddExerciseModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 border-t border-border/40 pt-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-text-muted" />
                  <span>{t('workout.addExercise')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSwapModalOpen(true)}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-text-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-accent" />
                  <span>{t('workout.swapExercise')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Exercise Navigation Bar (Focused 1 of N with hairline progress) ── */}
      <nav className="bg-bg-card border-b border-border/80 px-4 py-2 flex items-center justify-between shrink-0 max-w-[480px] mx-auto w-full">
        <button
          type="button"
          disabled={activeExerciseIdx === 0}
          onClick={() => setActiveExerciseIdx((prev) => Math.max(0, prev - 1))}
          className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-text-primary disabled:opacity-20 transition-all flex items-center justify-center gap-1 cursor-pointer"
          aria-label={t('workout.previousExercise')}
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-xs font-semibold hidden sm:inline">{t('workout.prev')}</span>
        </button>

        <div
          onClick={() => setIsExerciseJumpOpen(true)}
          className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
          title={t('workout.jumpTitle')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setIsExerciseJumpOpen(true);
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-black text-accent">
              {activeExerciseIdx + 1}
            </span>
            <span className="text-xs font-mono text-text-muted">{t('workout.of')}</span>
            <span className="text-xs font-mono font-bold text-text-secondary">
              {exercises.length}
            </span>
            <span className="text-[10px] text-accent font-sans">▾</span>
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
            className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-accent transition-colors flex items-center justify-center cursor-pointer"
            title={t('workout.addExerciseTitle')}
            aria-label={t('workout.addExerciseTitle')}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={activeExerciseIdx === exercises.length - 1}
            onClick={() => setActiveExerciseIdx((prev) => Math.min(exercises.length - 1, prev + 1))}
            className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-text-primary disabled:opacity-20 transition-all flex items-center justify-center gap-1 cursor-pointer"
            aria-label={t('workout.nextExercise')}
          >
            <span className="text-xs font-semibold hidden sm:inline">{t('workout.next')}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* ── Crowded-gym toggle (per session) ──────────────────────────── */}
      <div className="bg-bg-card border-b border-border/80 px-4 py-1.5 shrink-0">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary">{t('packed.toggle')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={gymPacked}
            aria-label={t('packed.toggle')}
            onClick={() => setGymPacked((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
              gymPacked ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                gymPacked ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── Main Exercise Focus Workspace (Radically simplified) ───────── */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 max-w-[480px] mx-auto w-full pb-16">
        {/* Crowded-gym swap banner for the current exercise */}
        {gymPacked &&
          currentExercise &&
          packedSwaps[activeExerciseIdx] &&
          !packedDismissed.has(currentExercise.name) &&
          currentExercise.sets.some((s) => !isActiveSetCompleted(s)) && (
            <PackedSwapBanner
              text={t('packed.tryInstead', { name: packedSwaps[activeExerciseIdx]!.name })}
              swapLabel={t('packed.swap')}
              keepLabel={t('packed.keep')}
              onSwap={() => applyPackedSwapAt(activeExerciseIdx)}
              onKeep={() => dismissPackedFor(currentExercise.name)}
            />
          )}

        {/* First-time guidance tips (Idea 9) */}
        {showFirstTimeTips && (
          <div className="mb-4 p-3.5 rounded-xl bg-accent/10 border border-accent/30 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-accent flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>{t('workout.quickTips')}</span>
              </span>
              <button
                type="button"
                onClick={dismissFirstTimeTips}
                className="text-2xs text-text-muted hover:text-text-primary px-2 py-0.5 rounded bg-bg-secondary border border-border transition-colors"
              >
                {t('workout.gotIt')}
              </button>
            </div>
            <ul className="text-2xs text-text-secondary space-y-1 list-disc list-inside">
              <li>{t('workout.tip1')}</li>
              <li>{t('workout.tip2')}</li>
              <li>{t('workout.tip3')}</li>
            </ul>
          </div>
        )}

        {/* Exercise Header */}
        <section className="mb-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider font-sans">
              {t('workout.exerciseOf', { current: activeExerciseIdx + 1, total: exercises.length })}
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
                      placeholder={t('workout.renamePlaceholder')}
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
                        className="absolute right-2.5 p-1 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-md text-text-muted hover:text-text-primary transition-colors"
                        title="Clear search"
                        aria-label="Clear search"
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
                          ? t('workout.matchesFor', { query: localExerciseName.trim() })
                          : t('workout.similarExercises', { muscle: getExerciseMuscle(currentExercise.name) })}
                      </span>
                      <span className="font-mono text-accent shrink-0">
                        {t('workout.foundCount', { count: renameSuggestions.length })}
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
                                    {t('workout.current')}
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
                                    {t('workout.bodyweight')}
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
                          {t('workout.noMatching')}
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
                                {t('workout.useCustomName', { name: localExerciseName.trim() })}
                              </span>
                            </div>
                            <span className="text-3xs font-mono uppercase text-accent/80 shrink-0">{t('workout.custom')}</span>
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
                        <span>{t('workout.browseCategories')}</span>
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
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setLocalExerciseName(currentExercise.name);
                    setSelectedSuggestionIdx(-1);
                    setIsEditingName(true);
                    setTimeout(() => renameInputRef.current?.select(), 50);
                  }}
                  className="flex items-center gap-2 cursor-pointer group text-left bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
                  aria-label={t('workout.changeAria', { name: currentExercise.name || t('workout.untitled') })}
                  title={t('workout.changeTitle')}
                >
                  <h2 className="display-title font-display uppercase tracking-tight text-3xl sm:text-4xl text-text-primary group-hover:text-[#E44427] transition-colors truncate">
                    {(currentExercise.name || t('workout.untitled')).toUpperCase()}.
                  </h2>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-bg-secondary group-hover:bg-accent/15 border border-border/60 group-hover:border-accent/40 text-text-muted group-hover:text-accent transition-all shrink-0">
                    <Edit2 className="w-3 h-3" />
                    <span className="text-[10px] font-semibold hidden sm:inline">{t('workout.change')}</span>
                  </div>
                </button>
              )}
            </div>

            {exercises.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveExercise(activeExerciseIdx)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                aria-label={t('workout.removeExercise')}
                title={t('workout.removeExercise')}
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
                  {t('workout.todaysTarget')}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-base sm:text-lg font-bold font-sans text-accent">
                    {targetDisplay.text}
                  </span>
                  {userMode === 'advanced' && targetDisplay.targetRpe !== undefined && (
                    <span className="text-xs font-mono text-text-muted">
                      @{targetDisplay.targetRpe}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block">
                  {t('workout.lastTime')}
                </span>
                <span className="text-xs font-semibold text-text-secondary block">
                  {prescription?.lastPerformance
                    ? t('workout.lastPerformance', {
                        weight: prescription.lastPerformance.weight,
                        unit: userUnit,
                        reps: prescription.lastPerformance.reps,
                      })
                    : lastPerf
                    ? lastPerf.summary
                    : fallbackPR
                    ? t('workout.baseline', {
                        weight: userUnit === 'lbs' ? fallbackPR.weightLbs : fallbackPR.weightKg,
                        unit: userUnit,
                        reps: fallbackPR.reps,
                      })
                    : t('workout.firstExposure')}
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
                {t('workout.setOf', { current: activeSetIdx + 1, total: currentExercise.sets.length })}
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
                    className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center ${
                      idx === activeSetIdx && !showEffortPrompt
                        ? 'bg-[#E44427] text-white font-black shadow-xs'
                        : isActiveSetCompleted(s)
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : s.status === 'skipped'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : s.isWarmup
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-bg-secondary text-text-muted border border-border/60 hover:text-text-primary'
                    }`}
                    title={s.status === 'skipped' ? t('workout.skippedSet', { n: idx + 1 }) : s.isWarmup ? t('workout.warmupSet', { n: idx + 1 }) : t('workout.setN', { n: idx + 1 })}
                  >
                    {isActiveSetCompleted(s) ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.status === 'skipped' ? 'S' : s.isWarmup ? 'W' : idx + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddSet}
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-bg-secondary text-accent border border-accent/30 hover:bg-accent/15 flex items-center justify-center text-xs ml-1 cursor-pointer"
                  title="Add set"
                  aria-label="Add set"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {currentExercise.sets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      handleRemoveSet(currentExercise.sets.length - 1);
                      setActiveSetIdx((prev) => Math.min(prev, currentExercise.sets.length - 2));
                    }}
                    className="h-10 min-h-[40px] px-2.5 rounded-full bg-bg-secondary text-text-muted border border-border/60 hover:text-danger hover:border-danger/40 flex items-center justify-center text-[11px] font-bold font-mono ml-1 cursor-pointer"
                    title="Remove last set"
                    aria-label="Remove last set"
                  >
                    {t('workout.removeSetShort')}
                  </button>
                )}
              </div>
            </div>

            {showEffortPrompt ? (
              /* Post-exercise effort prompt (Idea 5: Ask effort once per exercise) */
              <div className="card p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/10 border border-accent/40 text-center space-y-4 animate-fade-in shadow-md">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-text-primary tracking-tight">
                    {t('workout.completedSuffix', { name: currentExercise.name })}
                  </h3>
                  <p className="text-xs text-text-secondary mt-1">
                    {t('workout.howHard')}
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
                    <span className="text-xs font-bold text-text-primary block">{t('workout.easy')}</span>
                    <span className="text-3xs text-text-muted">{t('workout.easyDesc')}</span>
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
                    <span className="text-xs font-bold text-accent block">{t('workout.target')}</span>
                    <span className="text-3xs text-text-muted">{t('workout.targetDesc')}</span>
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
                    <span className="text-xs font-bold text-text-primary block">{t('workout.hard')}</span>
                    <span className="text-3xs text-text-muted">{t('workout.hardDesc')}</span>
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
                      <span>{t('workout.nextWithName', { name: exercises[activeExerciseIdx + 1]?.name })}</span>
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
                      <span>{t('workout.finishWorkout')}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* The One Set Focus Card */
              <div className="card p-5 sm:p-6 bg-bg-card border border-border/80 shadow-md space-y-6 animate-fade-in">
                <div className="space-y-4">
                  {/* Weight Stepper Row (Reference: Screen 12 & Screen 6) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-bg-secondary/40 border border-border/70 flex flex-col items-center gap-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-text-muted">
                      {isCurrentBodyweight ? t('workout.addedWeight', { unit: userUnit }) : isCurrentDumbbell ? t('workout.weightPerDb', { unit: userUnit }) : t('workout.weight', { unit: userUnit })}
                    </span>
                    <div className="w-full flex items-center justify-between px-2">
                      <button
                        type="button"
                        onClick={() => handleWeightStep(activeSetIdx, -currentWeightStep)}
                        aria-label={t('workout.decreaseWeight')}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-bg-card hover:bg-bg-tertiary text-text-primary border border-border/80 font-bold text-2xl flex items-center justify-center active:scale-90 transition-transform cursor-pointer shadow-xs"
                      >
                        -
                      </button>

                      <div className="flex flex-col items-center">
                        <div className="flex items-baseline justify-center gap-1.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={isCurrentBodyweight ? t('workout.addedWeightAria', { unit: userUnit }) : t('workout.weightAria', { unit: userUnit })}
                            value={weightInputStr !== null ? weightInputStr : (currentExercise.sets[activeSetIdx]?.weight !== undefined ? String(currentExercise.sets[activeSetIdx].weight) : '')}
                            placeholder={isCurrentBodyweight ? '0' : (currentExercise.sets[activeSetIdx]?.prescribedWeight !== undefined ? String(currentExercise.sets[activeSetIdx].prescribedWeight) : '—')}
                            onFocus={(e) => {
                              setWeightInputStr(currentExercise.sets[activeSetIdx]?.weight !== undefined ? String(currentExercise.sets[activeSetIdx].weight) : '');
                              e.target.select();
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                setWeightInputStr(val);
                                handleSetWeightChange(activeSetIdx, val);
                              }
                            }}
                            onBlur={() => {
                              setWeightInputStr(null);
                            }}
                            className="w-32 px-1 text-center font-sans font-black text-4xl sm:text-5xl text-text-primary bg-transparent outline-none border-none tabular-nums tracking-tight"
                          />
                          <span className="text-sm sm:text-base font-bold text-text-muted">
                            {isCurrentBodyweight ? 'BW' : userUnit}
                          </span>
                        </div>
                        {isCurrentBodyweight && (
                          <span className="text-3xs text-accent font-semibold mt-0.5">
                            {currentExercise.sets[activeSetIdx]?.weight === undefined || currentExercise.sets[activeSetIdx]?.weight === 0 ? t('workout.bodyweight') : `+${currentExercise.sets[activeSetIdx]?.weight} ${userUnit}`}
                          </span>
                        )}
                        {isCurrentDumbbell && (
                          <span className="text-2xs font-mono font-medium text-amber-500/90 mt-0.5" title="Weight per dumbbell">
                            {t('workout.perDumbbell')}
                          </span>
                        )}
                        {isCurrentBarbell && (
                          (() => {
                            const w = parseFloat(String(currentExercise.sets[activeSetIdx]?.weight)) || 0;
                            const plates = getPlateSummary(w, userUnit);
                            return plates ? (
                              <span className="text-2xs font-mono font-medium text-accent/90 mt-0.5" title={plates}>
                                [{plates}]
                              </span>
                            ) : null;
                          })()
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleWeightStep(activeSetIdx, currentWeightStep)}
                        aria-label={t('workout.increaseWeight')}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-bg-card hover:bg-bg-tertiary text-text-primary border border-border/80 font-bold text-2xl flex items-center justify-center active:scale-90 transition-transform cursor-pointer shadow-xs"
                      >
                        +
                      </button>
                    </div>

                    {/* Quick increment chips */}
                    <div className="flex items-center justify-center gap-1.5 pt-1">
                      {[-5, -2.5, 2.5, 5].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          onClick={() => handleWeightStep(activeSetIdx, delta)}
                          aria-label={t('workout.adjustWeightBy', { delta: delta > 0 ? `+${delta}` : delta, unit: userUnit })}
                          className="px-2.5 py-1 min-h-[40px] rounded-lg bg-bg-card hover:bg-bg-tertiary border border-border/70 text-text-secondary hover:text-text-primary text-2xs font-mono font-bold active:scale-95 transition-all cursor-pointer"
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reps Stepper Row (Reference: Screen 12 & Screen 6) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-bg-secondary/40 border border-border/70 flex flex-col items-center gap-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-text-muted">
                      {t('workout.reps')}
                    </span>
                    <div className="w-full flex items-center justify-between px-2">
                      <button
                        type="button"
                        onClick={() => handleRepsStep(activeSetIdx, -1)}
                        aria-label={t('workout.decreaseReps')}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-bg-card hover:bg-bg-tertiary text-text-primary border border-border/80 font-bold text-2xl flex items-center justify-center active:scale-90 transition-transform cursor-pointer shadow-xs"
                      >
                        -
                      </button>
                      <div className="flex items-baseline justify-center gap-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={t('workout.reps')}
                          value={currentExercise.sets[activeSetIdx]?.reps ?? ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d*$/.test(val)) {
                              handleSetRepsChange(activeSetIdx, val);
                            }
                          }}
                          className="w-24 px-1 text-center font-sans font-black text-4xl sm:text-5xl text-text-primary bg-transparent outline-none border-none tabular-nums tracking-tight"
                        />
                        <span className="text-sm sm:text-base font-bold text-text-muted">{t('workout.reps').toLowerCase()}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRepsStep(activeSetIdx, 1)}
                        aria-label={t('workout.increaseReps')}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-bg-card hover:bg-bg-tertiary text-text-primary border border-border/80 font-bold text-2xl flex items-center justify-center active:scale-90 transition-transform cursor-pointer shadow-xs"
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
                    className="inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl bg-bg-secondary hover:bg-bg-tertiary border border-border/70 hover:border-accent/40 text-xs font-mono font-bold text-text-secondary hover:text-text-primary active:scale-95 transition-all cursor-pointer"
                    title="Tap to select target effort / RPE"
                  >
                    <span className="text-accent font-black text-xs sm:text-sm">{currentExercise.sets[activeSetIdx]?.rpe ? `@${currentExercise.sets[activeSetIdx].rpe}` : 'RPE'}</span>
                    <span className="text-text-muted text-2xs font-sans">
                      {t('workout.effortRpe')}
                    </span>
                  </button>
                </div>

                {/* Screen 12 Action Buttons: Skip (~35%) and Complete Set (~65%) */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSkipSet(activeSetIdx)}
                    className={`w-[35%] py-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all border cursor-pointer active:scale-95 ${
                      currentExercise.sets[activeSetIdx]?.status === 'skipped'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
                        : 'bg-bg-secondary hover:bg-bg-tertiary border-border/80 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <span>{currentExercise.sets[activeSetIdx]?.status === 'skipped' ? t('workout.unskip') : t('workout.skip')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCompletingSet}
                    onClick={() => handleCompleteActiveSet(activeSetIdx)}
                    className={`w-[65%] py-3.5 rounded-xl text-sm sm:text-base font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] cursor-pointer ${
                      isActiveSetCompleted(currentExercise.sets[activeSetIdx])
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25'
                        : 'bg-[#E44427] hover:bg-[#c9361e] text-white shadow-[#E44427]/25'
                    }`}
                  >
                    <Check className="w-5 h-5 stroke-[3]" />
                    <span>{isActiveSetCompleted(currentExercise.sets[activeSetIdx]) ? t('workout.setDone', { n: activeSetIdx + 1 }) : t('workout.completeSet')}</span>
                  </button>
                </div>
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
                    <span>{t('workout.nextExerciseWithName', { name: exercises[activeExerciseIdx + 1]?.name })}</span>
                    <ChevronRight className="w-4 h-4 text-accent" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFinishModalOpen(true)}
                    className="btn-primary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 border-none text-white shadow-md shadow-emerald-500/20 cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>{t('workout.finishWorkout')}</span>
                  </button>
                )}

                {activeExerciseIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIdx((prev) => prev - 1)}
                    className="w-full py-2 min-h-[40px] text-2xs text-text-muted hover:text-text-primary flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>{t('workout.previousWithName', { name: exercises[activeExerciseIdx - 1]?.name })}</span>
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
                  className="py-3 flex items-center justify-between gap-1.5 sm:gap-2"
                >
                  {/* Set number */}
                  <div className="w-8 sm:w-12 shrink-0 flex items-center gap-1">
                    {set.status === 'skipped' ? (
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30" title={t('workout.skippedSetTitle')}>
                        S{sIdx + 1}
                      </span>
                    ) : set.isWarmup ? (
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30" title={t('workout.warmupRampTitle')}>
                        W{sIdx + 1}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-text-muted font-mono">
                        <span className="sm:hidden">{sIdx + 1}</span>
                        <span className="hidden sm:inline">{t('workout.setN', { n: sIdx + 1 })}</span>
                      </span>
                    )}
                  </div>

                  {/* Weight & Reps inputs */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    {/* Weight Input */}
                    <div className="flex flex-col items-center">
                      <div className="flex items-center bg-bg-secondary rounded-xl px-1.5 sm:px-2 py-1.5 min-h-[40px] border border-border/60 focus-within:border-accent w-[78px] sm:w-[92px] shrink-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={isCurrentBodyweight ? t('workout.setAddedWeightAria', { n: sIdx + 1, unit: userUnit }) : t('workout.setWeightAria', { n: sIdx + 1, unit: userUnit })}
                          value={set.weight !== undefined ? String(set.weight) : ''}
                          placeholder={isCurrentBodyweight ? '0 (BW)' : (set.prescribedWeight !== undefined ? String(set.prescribedWeight) : '—')}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
                              handleSetWeightChange(sIdx, val);
                            }
                          }}
                          onBlur={() => {
                            const parsed = typeof set.weight === 'number' ? set.weight : parseFloat(String(set.weight));
                            const finalW = isNaN(parsed)
                              ? (isCurrentBodyweight ? 0 : undefined)
                              : Math.max(0, Math.round(parsed * 10) / 10);
                            handleSetWeightChange(sIdx, finalW !== undefined ? finalW : '');
                          }}
                          className="w-full min-w-0 p-0 text-center font-mono font-bold text-base text-text-primary bg-transparent outline-none tabular-nums"
                        />
                        <span className="text-3xs sm:text-2xs text-text-muted font-medium ml-0.5 shrink-0">{userUnit}</span>
                      </div>
                      {isCurrentDumbbell && (
                        <span className="text-3xs font-mono text-amber-500/90 mt-0.5 truncate max-w-[80px] sm:max-w-[100px] text-center" title="Weight per dumbbell">
                          / db
                        </span>
                      )}
                      {isCurrentBarbell && (
                        (() => {
                          const w = typeof set.weight === 'number' && !isNaN(set.weight) ? set.weight : 0;
                          const plates = w > 0 ? getPlateSummary(w, userUnit) : null;
                          return plates ? (
                            <span className="text-3xs font-mono text-accent/80 mt-0.5 truncate max-w-[80px] sm:max-w-[100px] text-center" title={plates}>
                              {plates}
                            </span>
                          ) : null;
                        })()
                      )}
                    </div>

                    <span className="text-text-muted font-medium text-xs shrink-0">×</span>

                    {/* Reps Input */}
                    <div className="flex items-center bg-bg-secondary rounded-xl px-1.5 sm:px-2 py-1.5 min-h-[40px] border border-border/60 focus-within:border-accent w-[60px] sm:w-[74px] shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={t('workout.setRepsAria', { n: sIdx + 1 })}
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
                        className="w-full min-w-0 p-0 text-center font-mono font-bold text-base text-text-primary bg-transparent outline-none tabular-nums"
                      />
                      <span className="text-3xs sm:text-2xs text-text-muted font-medium ml-0.5 shrink-0">
                        <span className="sm:hidden">r</span>
                        <span className="hidden sm:inline">{t('workout.reps').toLowerCase()}</span>
                      </span>
                    </div>

                    {/* Effort / RPE badge */}
                    <button
                      type="button"
                      onClick={() => setActiveRpePickerSetIdx(sIdx)}
                      className="min-w-[42px] px-2 py-2 min-h-[40px] text-2xs sm:text-xs font-mono font-bold rounded-xl bg-bg-secondary border border-border/60 text-text-secondary hover:text-accent hover:border-accent/40 active:scale-95 transition-all shrink-0 text-center cursor-pointer"
                      title={t('workout.rpeBadgeTitle')}
                    >
                      {set.rpe ? `@${set.rpe}` : 'RPE'}
                    </button>
                  </div>

                  {/* Actions: Skip & Complete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSkipSet(sIdx)}
                      className={`px-2.5 sm:px-3 py-2 min-h-[40px] rounded-lg text-3xs sm:text-2xs font-mono font-semibold transition-all border cursor-pointer ${
                        set.status === 'skipped'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'text-text-muted hover:text-text-primary border-transparent hover:border-border/60'
                      }`}
                      title={set.status === 'skipped' ? t('workout.setSkippedTitle') : t('workout.skipThisSet')}
                      aria-label={t('workout.skipSet')}
                    >
                      {set.status === 'skipped' ? 'SKP' : t('workout.skip')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSetComplete(sIdx)}
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 ${
                        isActiveSetCompleted(set)
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'border-2 border-border/80 hover:border-text-secondary text-transparent'
                      }`}
                      aria-label={isActiveSetCompleted(set) ? t('workout.completedSet') : t('workout.markSetComplete')}
                    >
                      <Check className={`w-4 h-4 sm:w-5 sm:h-5 stroke-[3] ${isActiveSetCompleted(set) ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Set / Remove Set */}
            <div className="pt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleAddSet}
                className="text-xs font-bold text-accent hover:underline flex items-center gap-1.5 py-2 min-h-[40px] px-3 rounded-xl hover:bg-accent/10 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{t('workout.addSet')}</span>
              </button>
              {currentExercise.sets.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveSet(currentExercise.sets.length - 1)}
                  className="text-xs font-medium text-text-muted hover:text-danger py-2 min-h-[40px] px-3 rounded-xl hover:bg-danger/10 transition-colors"
                >
                  {t('workout.removeSet')}
                </button>
              )}
            </div>

            {/* Exercise Completion Auto-Advance Prompt (Advanced Mode) */}
            {currentExercise.sets.length > 0 && currentExercise.sets.every(isActiveSetCompleted) && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-bg-card to-accent/15 border border-emerald-500/40 flex items-center justify-between gap-3 animate-fade-in my-3 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-text-primary">
                      {t('workout.exerciseComplete', { name: currentExercise.name })}
                    </p>
                    <p className="text-3xs text-text-muted">
                      {t('workout.allSetsLogged', { count: currentExercise.sets.length })}
                    </p>
                  </div>
                </div>
                {activeExerciseIdx < exercises.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIdx((prev) => prev + 1)}
                    className="px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
                  >
                    <span>{t('workout.nextWithName', { name: exercises[activeExerciseIdx + 1]?.name })}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFinishModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{t('workout.finishWorkout')}</span>
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
                  <span>{t('workout.nextExerciseCaps', { name: exercises[activeExerciseIdx + 1]?.name })}</span>
                  <ChevronRight className="w-4 h-4 text-accent" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsFinishModalOpen(true)}
                  className="btn-primary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 border-none text-white shadow-md shadow-emerald-500/20"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{t('workout.finishWorkoutCaps')}</span>
                </button>
              )}

              {activeExerciseIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveExerciseIdx((prev) => prev - 1)}
                  className="w-full py-2 min-h-[40px] text-2xs text-text-muted hover:text-text-primary flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{t('workout.previousWithName', { name: exercises[activeExerciseIdx - 1]?.name })}</span>
                </button>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ── Single Small Floating Rest Timer Button ───────────────────────── */}
      <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-1.5 select-none pointer-events-auto">
        {isRestPopoverOpen && (
          <div className="bg-bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-2 flex items-center gap-1.5 animate-scale-in">
            <button
              type="button"
              onClick={() => adjustTimer(-30)}
              className="px-2 py-2 min-h-[40px] rounded-lg bg-bg-secondary text-text-muted hover:text-text-primary text-xs font-mono font-bold active:scale-95 transition-all cursor-pointer"
              title="Subtract 30 seconds"
            >
              -30s
            </button>
            <button
              type="button"
              onClick={() => adjustTimer(30)}
              className="px-2 py-2 min-h-[40px] rounded-lg bg-bg-secondary text-accent hover:bg-accent/15 text-xs font-mono font-bold active:scale-95 transition-all cursor-pointer"
              title="Add 30 seconds"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={togglePauseTimer}
              className="px-2 py-2 min-h-[40px] rounded-lg bg-bg-secondary text-text-secondary hover:text-text-primary text-xs font-semibold active:scale-95 transition-all cursor-pointer"
            >
              {isRestRunning ? t('workout.pause') : t('workout.resume')}
            </button>
            <button
              type="button"
              onClick={() => {
                skipTimer();
                setIsRestPopoverOpen(false);
              }}
              className="px-2.5 py-2 min-h-[40px] rounded-lg bg-[#E44427] text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
            >
              {t('workout.skip')}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (isRestFinished) {
              setIsRestFinished(false);
              setRestSecondsLeft(0);
            } else if (!isRestRunning && restSecondsLeft === 0) {
              startTimer();
            } else {
              setIsRestPopoverOpen((prev) => !prev);
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full shadow-xl backdrop-blur-md font-mono text-xs font-bold transition-all active:scale-95 cursor-pointer border ${
            isRestFinished
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
              : isRestRunning
              ? 'bg-bg-card/95 border-accent text-accent shadow-accent/20 animate-pulse'
              : 'bg-bg-card/90 border-border text-text-secondary hover:text-text-primary hover:border-accent/40'
          }`}
          title={isRestRunning ? t('workout.timerControls') : t('workout.restTimer')}
        >
          <Timer className={`w-3.5 h-3.5 ${isRestRunning ? 'text-accent' : 'text-text-muted'}`} />
          <span>
            {isRestFinished
              ? t('workout.ready')
              : formatTime(restSecondsLeft > 0 ? restSecondsLeft : restTotalSeconds)}
          </span>
        </button>
      </div>

      {/* ── Quick Exercise Jump Drawer ─────────────────────────────────── */}
      {isExerciseJumpOpen && (
        <div ref={exerciseJumpRef} {...exerciseJumpDialogProps} className="modal-overlay" onClick={() => setIsExerciseJumpOpen(false)}>
          <div
            className="modal-content max-w-sm rounded-t-3xl sm:rounded-3xl p-5 space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <span className="text-3xs font-mono font-bold uppercase tracking-wider text-accent">
                  {t('workout.quickNavigation')}
                </span>
                <h3 className="text-base font-black text-text-primary font-sans mt-0.5">
                  {t('workout.jumpToExercise')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExerciseJumpOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                aria-label={t('workout.closeJump')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto no-scrollbar">
              {exercises.map((ex, idx) => {
                const isCurrent = idx === activeExerciseIdx;
                const completedCount = ex.sets.filter(isActiveSetCompleted).length;
                const totalCount = ex.sets.length;
                const isDone = totalCount > 0 && completedCount === totalCount;
                const packedSwap = gymPacked ? packedSwaps[idx] : null;
                const showPacked =
                  !!packedSwap && !isDone && !packedDismissed.has(ex.name);

                return (
                  <div key={idx} className="space-y-1.5">
                  <button
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
                            ? 'bg-[#E44427] text-white'
                            : isDone
                            ? 'bg-emerald-500 text-white'
                            : 'bg-bg-secondary text-text-muted border border-border'
                        }`}
                      >
                        {isDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate font-sans">
                          {ex.name}
                        </div>
                        <div className="text-3xs font-mono text-text-muted">
                          {t('workout.setsCompleted', { done: completedCount, total: totalCount })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {isCurrent && (
                        <span className="text-3xs font-mono font-bold px-2 py-0.5 rounded-full bg-[#E44427] text-white">
                          {t('workout.active')}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </div>
                  </button>
                  {showPacked && packedSwap && (
                    <PackedSwapBanner
                      compact
                      text={t('packed.tryInstead', { name: packedSwap.name })}
                      swapLabel={t('packed.swap')}
                      keepLabel={t('packed.keep')}
                      onSwap={() => applyPackedSwapAt(idx)}
                      onKeep={() => dismissPackedFor(ex.name)}
                    />
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Warm-up Generator Modal ─────────────────────────────────────── */}
      {isWarmupModalOpen && (
        <div ref={warmupModalRef} {...warmupDialogProps} className="modal-overlay" onClick={() => setIsWarmupModalOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-text-primary">{t('workout.warmupGenerator')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWarmupModalOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary"
                aria-label={t('workout.closeWarmup')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('workout.warmupDesc')}
              </p>

              <div className="p-3 rounded-xl bg-bg-secondary border border-border/80 space-y-2 font-mono text-2xs">
                <div className="flex items-center justify-between text-accent font-bold">
                  <span>{t('workout.plannedWarmup')}</span>
                  <span className="text-text-muted font-normal text-3xs">
                    {t('workout.targetLabel', { weight: generatedWarmupPreview.workingWeight, unit: userUnit })}
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
                          {w.weight} {w.unit} × {t('prs.repsWord', { reps: w.reps })}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateWarmupSets}
                  className="btn-primary flex-1 py-2 text-xs font-bold"
                >
                  {t('workout.insertSets')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Form Cues Sheet ──────────────────────────────────────────────── */}
      {showFormCues && hasFormSurface && (
        <div ref={formCuesRef} {...formCuesDialogProps} className="modal-overlay" onClick={() => setShowFormCues(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                <div>
                  <h3 className="font-bold text-text-primary">{t('workout.formCuesHeading')}</h3>
                  <p className="text-2xs text-text-muted">{currentExercise?.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFormCues(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary"
                aria-label={t('workout.closeFormCues')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2.5">
              {currentDemo && currentExercise?.name && (
                <ExerciseDemo name={currentExercise.name} />
              )}
              {formCues.map((cue, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-bg-secondary border border-border/60">
                  <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-3xs font-bold flex items-center justify-center shrink-0 mt-0.5 font-mono">
                    {idx + 1}
                  </span>
                  <p className="text-xs text-text-secondary leading-relaxed">{cue}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Why This Target Weight Sheet ─────────────────────────────────── */}
      {showWhyTarget && prescription?.whyThisWeight && (
        <div ref={whyTargetRef} {...whyTargetDialogProps} className="modal-overlay" onClick={() => setShowWhyTarget(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-accent" />
                <div>
                  <h3 className="font-bold text-text-primary">{t('workout.whyThisTarget')}</h3>
                  <p className="text-2xs text-text-muted">{currentExercise?.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWhyTarget(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary"
                aria-label={t('workout.closeWhy')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="p-3 rounded-xl bg-accent/10 border border-accent/25">
                <p className="text-xs font-bold text-accent font-mono">{targetDisplay.text}</p>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                {prescription.whyThisWeight}
              </p>
              {prescription.lastPerformance && (
                <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/60 text-2xs text-text-muted">
                  {t('workout.lastTimeColon')} <span className="font-bold text-text-primary font-mono">
                    {t('workout.lastPerformance', {
                      weight: prescription.lastPerformance.weight,
                      unit: userUnit,
                      reps: prescription.lastPerformance.reps,
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Live Plate Calculator Modal ──────────────────────────────────── */}
      {isPlateModalOpen && (
        <div ref={plateModalRef} {...plateDialogProps} className="modal-overlay" onClick={() => setIsPlateModalOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-text-primary">{t('workout.plateCalculator')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPlateModalOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary"
                aria-label={t('workout.closePlate')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-center p-3 rounded-xl bg-bg-secondary border border-border space-y-2">
                <span className="text-3xs uppercase font-mono text-text-muted block">{t('workout.targetBarbellWeight')}</span>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlateTargetWeight((w) => Math.max(20, Math.round((w - 2.5) * 10) / 10))}
                    className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg bg-bg-card hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all border border-border/40 cursor-pointer"
                    aria-label={t('workout.decreaseBarbell', { unit: userUnit })}
                    title={`-2.5 ${userUnit}`}
                  >
                    -2.5
                  </button>
                  <div className="flex items-center justify-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={t('workout.targetBarbellAria')}
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
                    className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg bg-bg-card hover:bg-accent/20 active:scale-90 text-text-secondary hover:text-accent font-mono font-bold text-xs flex items-center justify-center transition-all border border-border/40 cursor-pointer"
                    aria-label={t('workout.increaseBarbell', { unit: userUnit })}
                    title={`+2.5 ${userUnit}`}
                  >
                    +2.5
                  </button>
                </div>
                <span className="text-2xs font-mono text-text-secondary block">
                  {plateResult.barWeight} {userUnit} {t('workout.barWord')} +{' '}
                  <strong className="text-text-primary">{t('workout.perSide', { weight: plateResult.weightPerSide, unit: userUnit })}</strong>
                </span>
              </div>

              {/* Barbell Type Selection */}
              <div className="space-y-1.5">
                <span className="text-3xs uppercase font-mono text-text-muted block">{t('workout.barbellType')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {BARBELL_PRESETS.map((preset) => {
                    const presetWeight = userUnit === 'kg' ? preset.weightKg : preset.weightLbs;
                    const isSelected = plateBarWeight === presetWeight;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setPlateBarWeight(presetWeight)}
                        className={`px-2 py-1 rounded-lg text-2xs font-mono transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-accent text-bg-primary font-bold shadow-xs'
                            : 'bg-bg-secondary hover:bg-bg-card text-text-secondary border border-border/70'
                        }`}
                        title={preset.description}
                      >
                        {preset.shortName} ({presetWeight} {userUnit})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Plate List Breakdown */}
              <div className="space-y-1.5">
                <span className="text-3xs uppercase font-mono text-text-muted block">{t('workout.platesPerSide')}</span>
                {plateResult.plates.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-2">{t('workout.emptyBarbell', { weight: plateResult.barWeight, unit: userUnit })}</p>
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
                            {p.count}× {p.weight} {userUnit}
                          </span>
                          <span className="text-3xs text-text-muted font-mono">{t('workout.totalSuffix', { total: p.count * p.weight, unit: userUnit })}</span>
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
                {t('common.done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Swap Exercise Modal (guided substitutes, pain reporting) ──────── */}
      {isSwapModalOpen && currentExercise && (
        <div ref={swapModalRef} {...swapDialogProps} aria-label={t('workout.swapExercise')} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-sm bg-bg-card border border-border/80 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-text-primary text-sm">{t('workout.swapTitle', { name: currentExercise.name })}</h3>
                <p className="text-3xs text-text-muted mt-0.5">{t('workout.swapSubtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSwapModalOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary"
                aria-label={t('workout.closeSwap')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-2xs font-bold uppercase tracking-wide text-text-muted">{t('workout.whySwapping')}</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'equipment', labelKey: 'workout.swapReasonEquipment' },
                  { id: 'hurts', labelKey: 'workout.swapReasonHurts' },
                  { id: 'too_hard', labelKey: 'workout.swapReasonHard' },
                  { id: 'prefer_other', labelKey: 'workout.swapReasonPrefer' },
                ] as const).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSwapReason(r.id)}
                    className={`px-2.5 py-1.5 rounded-full text-2xs font-bold cursor-pointer transition-all ${swapReason === r.id ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:text-text-primary'}`}
                  >
                    {t(r.labelKey)}
                  </button>
                ))}
              </div>
              {swapReason === 'hurts' && (
                <p className="text-2xs text-amber-400 leading-relaxed pt-1">
                  {t('workout.swapHurtsNote', { name: currentExercise.name })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              {getFilteredSubstitutes(currentExercise.name, {
                equipment: trainingProfile?.equipment || 'full_gym',
                exclusions: trainingProfile?.dislikedExercises || [],
                // "Hurts" swaps must leave the painful movement family
                // entirely — the raw table offered hinge-for-hinge swaps.
                avoidSameFamilyAs: swapReason === 'hurts' ? currentExercise.name : undefined,
              }).map((sub) => (
                  <button
                    key={sub.name}
                    type="button"
                    onClick={() => handleApplySwap(sub.name)}
                    className="w-full text-left p-3 rounded-xl bg-bg-secondary border border-border/70 hover:border-accent/60 transition-all cursor-pointer"
                  >
                    <span className="block text-sm font-bold text-text-primary">{sub.name}</span>
                    <span className="block text-2xs text-text-muted mt-0.5">{sub.reason}</span>
                  </button>
                ))}
              <p className="text-2xs text-text-muted text-center pt-1">
                {t('workout.swapNeedOther')}
              </p>
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
                {
                  weight: defaultW,
                  reps: defaultR,
                  unit: userUnit,
                  completed: false,
                  status: 'pending',
                  rpe: 8,
                  prescribedWeight: isBW ? 0 : (defaultW > 0 ? defaultW : undefined),
                  prescribedReps: defaultR,
                  prescribedRpe: 8,
                  prescribedUnit: userUnit,
                },
                {
                  weight: defaultW,
                  reps: defaultR,
                  unit: userUnit,
                  completed: false,
                  status: 'pending',
                  rpe: 8,
                  prescribedWeight: isBW ? 0 : (defaultW > 0 ? defaultW : undefined),
                  prescribedReps: defaultR,
                  prescribedRpe: 8,
                  prescribedUnit: userUnit,
                },
                {
                  weight: defaultW,
                  reps: defaultR,
                  unit: userUnit,
                  completed: false,
                  status: 'pending',
                  rpe: 8,
                  prescribedWeight: isBW ? 0 : (defaultW > 0 ? defaultW : undefined),
                  prescribedReps: defaultR,
                  prescribedRpe: 8,
                  prescribedUnit: userUnit,
                },
              ],
            },
          ]);
          setActiveExerciseIdx(exercises.length);
          setIsAddExerciseModalOpen(false);
          toast.success(t('workout.toastExerciseAdded', { name: selected.name }), t('workout.toastExerciseAddedTitle'));
        }}
      />

      {/* ── Change Exercise Modal (Full Library Browser) ──────────────────── */}
      <ExerciseSelectorModal
        isOpen={isChangeExerciseModalOpen}
        onClose={() => setIsChangeExerciseModalOpen(false)}
        title={t('workout.changeExerciseTitle')}
        defaultMuscle={getExerciseMuscle(currentExercise?.name || '')}
        onSelectExercise={(selected) => {
          handleSelectNewExerciseName(selected.name, selected.isBodyweight);
          setIsChangeExerciseModalOpen(false);
        }}
      />

      {/* ── Discard Confirmation Modal ───────────────────────────────────── */}
      {/* ── Remove Exercise Confirmation (only when completed sets exist) ── */}
      <ConfirmationModal
        isOpen={exerciseToRemove !== null}
        onClose={() => setExerciseToRemove(null)}
        onConfirm={() => { if (exerciseToRemove !== null) confirmRemoveExercise(exerciseToRemove); }}
        title={t('workout.removeExerciseTitle')}
        message={
          exerciseToRemove !== null
            ? t(
                exercises[exerciseToRemove]?.sets.filter(isActiveSetCompleted).length === 1
                  ? 'workout.removeExerciseMsgOne'
                  : 'workout.removeExerciseMsgMany',
                {
                  name: exercises[exerciseToRemove]?.name || 'Exercise',
                  count: exercises[exerciseToRemove]?.sets.filter(isActiveSetCompleted).length || 0,
                }
              )
            : ''
        }
        confirmText={t('workout.remove')}
        cancelText={t('workout.keep')}
        variant="danger"
      />

      {isDiscardConfirmOpen && (
        <div ref={discardConfirmRef} {...discardDialogProps} className="modal-overlay" onClick={() => setIsDiscardConfirmOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 space-y-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-danger/15 text-danger flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-text-primary">{t('workout.discardTitle')}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('workout.discardMsg')}
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDiscardConfirmOpen(false)}
                  className="btn-secondary flex-1 py-2 text-xs font-semibold"
                >
                  {t('workout.keepTraining')}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="btn-danger flex-1 py-2 text-xs font-bold"
                >
                  {t('workout.discardShort')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Finish Workout Summary Modal ─────────────────────────────────── */}
      {isFinishModalOpen && (() => {
        const doneRatio = sessionStats.totalSetsCount > 0
          ? sessionStats.completedSetsCount / sessionStats.totalSetsCount
          : 1;
        const isPartial = doneRatio < 0.8;
        return (
        <div ref={finishModalRef} {...finishDialogProps} className="modal-overlay" onClick={() => setIsFinishModalOpen(false)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#E44427]" />
                {/* Honest title: a 2-of-17 bail is "SESSION SAVED.", not a trophy ceremony. */}
                <h3 className="display-title font-display uppercase tracking-tight text-xl text-text-primary">{isPartial ? t('workout.sessionSaved') : t('workout.workoutComplete')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFinishModalOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary"
                aria-label={t('workout.closeSummary')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-bg-secondary text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">{t('workout.volume')}</span>
                  <span className="text-lg font-black font-mono text-accent block mt-0.5">
                    {sessionStats.totalVolumeKg}kg
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-bg-secondary text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">{t('workout.sets')}</span>
                  <span className="text-lg font-black font-mono text-emerald-400 block mt-0.5">
                    {sessionStats.completedSetsCount}/{sessionStats.totalSetsCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-bg-secondary text-center border border-border">
                  <span className="text-3xs uppercase font-mono text-text-muted block">{t('workout.time')}</span>
                  <span className="text-lg font-black font-mono text-text-primary block mt-0.5">
                    {sessionStats.durationFormatted}
                  </span>
                </div>
              </div>

              {/* Post-Workout Adaptation Ledger */}
              <div className="space-y-2 pt-1 text-left">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted block">
                  {t('workout.adaptationSummary')}
                </span>

                {/* 1. What improved */}
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{t('workout.whatImproved')}</span>
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
                    <span>{t('workout.whatStays')}</span>
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
                    <span>{t('workout.whatChanges')}</span>
                  </div>
                  <ul className="text-2xs text-text-secondary space-y-0.5 list-disc list-inside">
                    {postWorkoutLedger.nextRules.map((item, idx) => (
                      <li key={idx} className="leading-snug">
                        {item.summary}
                        {item.rationale && (
                          <CollapsibleDetails label={t('workout.why')}>
                            <p>{item.rationale}</p>
                          </CollapsibleDetails>
                        )}
                      </li>
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
                  {t('workout.resume')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFinish}
                  disabled={isFinishing}
                  className="btn-primary flex-1 py-2.5 text-xs font-bold shadow-md shadow-accent/25 disabled:opacity-50"
                >
                  {isFinishing ? t('workout.saving') : t('workout.saveFinish')}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 1-Tap RPE / Effort Picker Modal */}
      {activeRpePickerSetIdx !== null && (
        <div ref={rpePickerRef} {...rpeDialogProps} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-sm bg-bg-card border border-border/80 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <h3 className="font-bold text-text-primary text-sm font-sans">
                  {t('workout.howHardSet')}
                </h3>
                <p className="text-3xs text-text-muted">
                  {t('workout.rpeExplainer', { n: activeRpePickerSetIdx + 1 })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRpePickerSetIdx(null)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
                aria-label={t('workout.closeEffort')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {[
                { rpe: 6, labelKey: 'workout.rpe6Label', rirKey: 'workout.rpe6Rir', descKey: 'workout.rpe6Desc' },
                { rpe: 7, labelKey: 'workout.rpe7Label', rirKey: 'workout.rpe7Rir', descKey: 'workout.rpe7Desc' },
                { rpe: 7.5, labelKey: 'workout.rpe75Label', rirKey: 'workout.rpe75Rir', descKey: 'workout.rpe75Desc' },
                { rpe: 8, labelKey: 'workout.rpe8Label', rirKey: 'workout.rpe8Rir', descKey: 'workout.rpe8Desc' },
                { rpe: 8.5, labelKey: 'workout.rpe85Label', rirKey: 'workout.rpe85Rir', descKey: 'workout.rpe85Desc' },
                { rpe: 9, labelKey: 'workout.rpe9Label', rirKey: 'workout.rpe9Rir', descKey: 'workout.rpe9Desc' },
                { rpe: 9.5, labelKey: 'workout.rpe95Label', rirKey: 'workout.rpe95Rir', descKey: 'workout.rpe95Desc' },
                { rpe: 10, labelKey: 'workout.rpe10Label', rirKey: 'workout.rpe10Rir', descKey: 'workout.rpe10Desc' },
              ].map((item) => {
                const currentVal = currentExercise?.sets[activeRpePickerSetIdx]?.rpe ?? -1;
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
                        {t(item.rirKey as StringKey)}
                      </span>
                    </div>
                    <div className="text-2xs font-bold truncate">{t(item.labelKey as StringKey)}</div>
                    <div className="text-[10px] text-text-muted truncate">{t(item.descKey as StringKey)}</div>
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

      {/* ── Screen 13: Set Complete! Transition View (Reference: Flow Board Screen 13) ── */}
      {completedSetSummary && (
        <div className="fixed inset-0 z-50 bg-[#171916] text-[#F3F0E7] flex flex-col justify-between p-6 animate-fade-in max-w-md mx-auto">
          {/* Top Bar with subtle workout info */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-[#858076]">
              {workoutName}
            </span>
            <button
              type="button"
              onClick={() => setCompletedSetSummary(null)}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-[#212420] border border-[#2C302B] flex items-center justify-center text-[#858076] hover:text-[#F3F0E7] transition-colors cursor-pointer"
              aria-label="Dismiss set complete screen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Center Celebratory State */}
          <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-6 space-y-4">
            {/* Sage Checkmark Circle */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#858076]/20 border-2 border-[#858076] text-[#858076] flex items-center justify-center shadow-lg shadow-[#858076]/10 animate-scale-in">
              <Check className="w-10 h-10 sm:w-12 sm:h-12 stroke-[3] text-[#858076]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-[#F3F0E7] tracking-tight font-sans">
                {t('workout.setComplete')}
              </h2>
              <p className="text-sm font-semibold text-[#858076]">
                {t('workout.setCompleteLine', {
                  exercise: completedSetSummary.exerciseName,
                  current: completedSetSummary.setIndex + 1,
                  total: completedSetSummary.totalSets,
                })}
              </p>
            </div>

            {/* Performance Summary Pill */}
            <div className="px-4 py-2 rounded-xl bg-[#212420] border border-[#2C302B] inline-flex items-center gap-2 shadow-xs">
              <span className="text-base sm:text-lg font-bold font-mono text-[#F3F0E7]">
                {completedSetSummary.weight > 0 ? `${completedSetSummary.weight} ${completedSetSummary.unit} × ` : ''}
                {t('prs.repsWord', { reps: completedSetSummary.reps })}
              </span>
              {completedSetSummary.isPR && (
                <span className="px-2 py-0.5 rounded-full bg-[#E44427] text-white text-xs font-black uppercase tracking-wider">
                  {t('workout.newPr')}
                </span>
              )}
            </div>

            {/* Live Rest Timer Countdown */}
            <div className="pt-6 pb-2 space-y-2 w-full max-w-xs">
              <span className="text-2xs font-bold uppercase tracking-wider text-[#858076] font-mono block">
                {t('workout.restTimer')}
              </span>
              <div className="text-5xl sm:text-6xl font-black font-mono text-[#F3F0E7] tabular-nums tracking-tight">
                {isRestFinished
                  ? t('workout.ready')
                  : formatTime(restSecondsLeft > 0 ? restSecondsLeft : restTotalSeconds)}
              </div>

              {/* Timer Controls */}
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => adjustTimer(-30)}
                  className="px-3 py-1.5 min-h-[40px] rounded-lg bg-[#212420] border border-[#2C302B] text-xs font-mono text-[#858076] hover:text-[#F3F0E7] transition-colors cursor-pointer"
                >
                  -30s
                </button>
                <button
                  type="button"
                  onClick={togglePauseTimer}
                  className="px-4 py-1.5 min-h-[40px] rounded-lg bg-[#212420] border border-[#2C302B] text-xs font-bold text-[#F3F0E7] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isRestRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isRestRunning ? t('workout.pause') : t('workout.resume')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => adjustTimer(30)}
                  className="px-3 py-1.5 min-h-[40px] rounded-lg bg-[#212420] border border-[#2C302B] text-xs font-mono text-[#858076] hover:text-[#F3F0E7] transition-colors cursor-pointer"
                >
                  +30s
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Actions: Next Set & End Workout */}
          <div className="w-full max-w-xs mx-auto space-y-2.5 pb-2">
            <button
              type="button"
              onClick={handleProceedNextSet}
              className="btn-primary w-full py-4 text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#E44427]/25 cursor-pointer active:scale-[0.98]"
            >
              <span>{t('workout.nextSet')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setCompletedSetSummary(null);
                setIsFinishModalOpen(true);
              }}
              className="w-full py-2 text-xs font-semibold text-[#858076] hover:text-[#F3F0E7] transition-colors cursor-pointer text-center block"
            >
              {t('workout.endWorkout')}
            </button>
          </div>
        </div>
      )}

      {/* Datalist for autocomplete */}
      <datalist id="active-exercises-list">
        {availableExercises.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
