"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { getExerciseList, calculateOneRepMax, isMainCompoundLift } from '@/lib/strength-standards';
import { generateTrainingDecision } from '@/lib/lifter-twin';
import TrainingDecisionCard from '@/components/TrainingDecisionCard';
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  Trash2,
  ArrowLeft,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Dumbbell,
  Sparkles,
  BookOpen,
  Edit2,
  CheckCircle2,
  ArrowRightLeft,
  Bot,
  Zap,
  Mic,
  MicOff,
  Clock,
  Flame,
  FastForward,
  Check,
  AlertTriangle,
  Share2,
} from 'lucide-react';
import { WorkoutEntry, WorkoutExercise, WorkoutSet, PlannedWorkout, PlannedExercise } from '@/lib/store';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  getQuickSubstitutes,
  compressWorkout,
  parseVoiceWorkout,
  getTodaySessionState,
  ExerciseSubstitute,
} from '@/lib/workout-engine';
import ThemeToggle from '@/components/ui/ThemeToggle';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import ExerciseSubstitutionModal from '@/components/ExerciseSubstitutionModal';
import ExerciseLibraryModal from '@/components/ExerciseLibraryModal';
import WorkoutCoachDrawer from '@/components/WorkoutCoachDrawer';
import PostWorkoutTakeModal from '@/components/PostWorkoutTakeModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import { AISubstitutionResult } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import ActiveWorkoutScreen from '@/components/ActiveWorkoutScreen';
import ShareProgramModal from '@/components/ShareProgramModal';
import { plural } from '@/lib/formatters';

interface WorkoutPageProps {
  onNavigate?: (tab: 'home' | 'prs' | 'workout' | 'meals') => void;
  startPlanOnMount?: PlannedWorkout | null;
}

// ─── Plan Creation / Edit Modal ──────────────────────────────────────────────

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: PlannedWorkout | null;
  availableExercises: string[];
  userUnit: 'kg' | 'lbs';
  onSave: (plan: Omit<PlannedWorkout, 'id' | 'createdAt'>) => void;
}

const emptyPlanExercise = (unit: 'kg' | 'lbs'): PlannedExercise => ({
  name: '',
  targetSets: 3,
  targetReps: 8,
  targetWeight: undefined,
  targetUnit: unit,
  notes: '',
});

export const BUILTIN_SPLIT_TEMPLATES: PlannedWorkout[] = [
  {
    id: 'builtin_upper_a',
    name: 'Upper A',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: 70, targetUnit: 'kg' },
      { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
      { name: 'Overhead Press', targetSets: 3, targetReps: 10, targetWeight: 40, targetUnit: 'kg' },
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 12, targetWeight: 55, targetUnit: 'kg' },
      { name: 'Dumbbell Curl', targetSets: 3, targetReps: 12, targetWeight: 14, targetUnit: 'kg' },
    ],
  },
  {
    id: 'builtin_lower_a',
    name: 'Lower A',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Squat', targetSets: 4, targetReps: 6, targetWeight: 100, targetUnit: 'kg' },
      { name: 'Romanian Deadlift', targetSets: 3, targetReps: 10, targetWeight: 80, targetUnit: 'kg' },
      { name: 'Leg Press', targetSets: 3, targetReps: 12, targetWeight: 160, targetUnit: 'kg' },
      { name: 'Calf Raise', targetSets: 4, targetReps: 15, targetWeight: 50, targetUnit: 'kg' },
    ],
  },
  {
    id: 'builtin_upper_b',
    name: 'Upper B',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Incline Bench', targetSets: 4, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
      { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: 'kg' },
      { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 10, targetWeight: 22, targetUnit: 'kg' },
      { name: 'Lateral Raise', targetSets: 4, targetReps: 15, targetWeight: 10, targetUnit: 'kg' },
      { name: 'Tricep Extension', targetSets: 3, targetReps: 12, targetWeight: 25, targetUnit: 'kg' },
    ],
  },
  {
    id: 'builtin_lower_b',
    name: 'Lower B',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Deadlift', targetSets: 4, targetReps: 5, targetWeight: 120, targetUnit: 'kg' },
      { name: 'Front Squat', targetSets: 3, targetReps: 8, targetWeight: 70, targetUnit: 'kg' },
      { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 10, targetWeight: 16, targetUnit: 'kg' },
      { name: 'Hamstring Curl', targetSets: 3, targetReps: 12, targetWeight: 45, targetUnit: 'kg' },
    ],
  },
];

function PlanModal({ isOpen, onClose, initial, availableExercises, userUnit, onSave }: PlanModalProps) {
  const [planName, setPlanName] = useState('');
  const [planExercises, setPlanExercises] = useState<PlannedExercise[]>([emptyPlanExercise(userUnit)]);

  // Sync state when opening or switching between create/edit
  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setPlanName(initial.name);
        setPlanExercises(initial.exercises.length > 0 ? initial.exercises : [emptyPlanExercise(userUnit)]);
      } else {
        setPlanName('');
        setPlanExercises([emptyPlanExercise(userUnit)]);
      }
    }
  }, [isOpen, initial, userUnit]);

  const updateExercise = useCallback((idx: number, field: keyof PlannedExercise, value: unknown) => {
    setPlanExercises(prev => prev.map((ex, i) => i === idx ? { ...ex, [field]: value } : ex));
  }, []);

  const addExercise = () => setPlanExercises(prev => [...prev, emptyPlanExercise(userUnit)]);
  const removeExercise = (idx: number) => setPlanExercises(prev => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    const trimmedName = planName.trim();
    if (!trimmedName) return;
    const validExercises = planExercises.filter(e => e.name.trim());
    if (validExercises.length === 0) return;
    onSave({ name: trimmedName, exercises: validExercises });
    onClose();
  };

  const isValid = planName.trim().length > 0 && planExercises.some(e => e.name.trim());

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              {initial ? 'Edit Plan' : 'Create Workout Plan'}
            </h2>
            <p className="text-2xs text-text-muted font-mono mt-0.5">
              {initial ? 'Modify your saved plan' : 'Build a reusable workout template'}
            </p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* Plan Name */}
          <div>
            <label className="section-title mb-2 block">Plan Name</label>
            <input
              type="text"
              placeholder='e.g. "Push Day", "Leg Day", "Full Body A"'
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary focus:border-accent outline-none text-sm"
            />
          </div>

          {/* Exercises */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="section-title">Exercises</label>
              <button
                onClick={addExercise}
                className="text-accent text-xs font-semibold flex items-center gap-1 hover:brightness-110"
              >
                <Plus className="w-3.5 h-3.5" /> Add Exercise
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {planExercises.map((ex, i) => (
                <div key={i} className="border border-border rounded-xl p-3.5 bg-bg-elevated/40">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-mono text-accent font-semibold">EXERCISE {i + 1}</span>
                    <button
                      onClick={() => removeExercise(i)}
                      disabled={planExercises.length === 1}
                      className="text-text-muted hover:text-danger p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Name */}
                  <input
                    type="text"
                    placeholder="Exercise name (e.g. Bench Press)"
                    value={ex.name}
                    onChange={e => updateExercise(i, 'name', e.target.value)}
                    list="plan-exercises-list"
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary mb-3 text-sm focus:border-accent outline-none"
                  />

                  {/* Sets / Reps / Weight row */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-2xs text-text-muted font-mono block mb-1">TARGET SETS</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={ex.targetSets || ''}
                        onChange={e => updateExercise(i, 'targetSets', Number(e.target.value))}
                        className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-2xs text-text-muted font-mono block mb-1">TARGET REPS</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={ex.targetReps || ''}
                        onChange={e => updateExercise(i, 'targetReps', Number(e.target.value))}
                        className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  {/* Optional Weight */}
                  <div>
                    <label className="text-2xs text-text-muted font-mono block mb-1">TARGET WEIGHT (OPTIONAL)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 80"
                        value={ex.targetWeight ?? ''}
                        onChange={e => updateExercise(i, 'targetWeight', e.target.value === '' ? undefined : Number(e.target.value))}
                        className="flex-1 bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                      />
                      <select
                        value={ex.targetUnit ?? userUnit}
                        onChange={e => updateExercise(i, 'targetUnit', e.target.value)}
                        className="bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                      >
                        <option value="kg">kg</option>
                        <option value="lbs">lbs</option>
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="mt-2">
                    <label className="text-2xs text-text-muted font-mono block mb-1">NOTES (OPTIONAL)</label>
                    <input
                      type="text"
                      placeholder="e.g. Pause at bottom, control eccentric"
                      value={ex.notes ?? ''}
                      onChange={e => updateExercise(i, 'notes', e.target.value)}
                      className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="btn-primary flex-1 disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            {initial ? 'Save Changes' : 'Save Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: PlannedWorkout;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
}

function PlanCard({ plan, onStart, onEdit, onDelete, onShare }: PlanCardProps) {
  const MAX_VISIBLE = 3;
  const visibleExercises = plan.exercises.slice(0, MAX_VISIBLE);
  const remainder = plan.exercises.length - MAX_VISIBLE;

  return (
    <div className="card flex flex-col gap-3">
      {/* Card top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-text-primary truncate">{plan.name}</h3>
          <p className="text-2xs text-text-muted font-mono mt-0.5">
            {plan.exercises.length} exercise{plan.exercises.length !== 1 ? 's' : ''}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onShare}
            title="Share plan via WhatsApp or QR"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onEdit}
            title="Edit plan"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            title="Delete plan"
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Exercise preview chips */}
      <div className="flex flex-wrap gap-1.5">
        {visibleExercises.map((ex, i) => (
          <span
            key={i}
            className="text-2xs bg-bg-elevated border border-border rounded-md px-2 py-0.5 text-text-secondary font-mono truncate max-w-[140px]"
            title={ex.name}
          >
            {ex.name || <span className="italic opacity-50">Unnamed</span>}
          </span>
        ))}
        {remainder > 0 && (
          <span className="text-2xs bg-bg-elevated border border-border/60 rounded-md px-2 py-0.5 text-text-muted font-mono">
            +{remainder} more
          </span>
        )}
      </div>

      {/* Exercise detail rows */}
      <div className="flex flex-col gap-1">
        {plan.exercises.map((ex, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-1">
            <span className="text-text-secondary truncate flex-1 mr-2">{ex.name || '—'}</span>
            <span className="text-text-muted font-mono shrink-0">
              {ex.targetSets}×{ex.targetReps}
              {ex.targetWeight ? ` @ ${ex.targetWeight}${ex.targetUnit ?? ''}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Start button */}
      <button
        onClick={onStart}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2"
      >
        <Play className="w-4 h-4" />
        Start Workout
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WorkoutPage({ onNavigate, startPlanOnMount }: WorkoutPageProps = {}) {
  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs);
  const workouts = useStore((state) => state.workouts);
  const addWorkout = useStore((state) => state.addWorkout);
  const deleteWorkout = useStore((state) => state.deleteWorkout);
  const addPR = useStore((state) => state.addPR);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts);
  const addPlannedWorkout = useStore((state) => state.addPlannedWorkout);
  const updatePlannedWorkout = useStore((state) => state.updatePlannedWorkout);
  const deletePlannedWorkout = useStore((state) => state.deletePlannedWorkout);
  const activeWorkoutDraft = useStore((state) => state.activeWorkoutDraft);
  const saveWorkoutDraft = useStore((state) => state.saveWorkoutDraft);
  const clearWorkoutDraft = useStore((state) => state.clearWorkoutDraft);
  const toast = useToast();

  const userUnit = profile?.unit || 'kg';
  const availableExercises = getExerciseList();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todaySessionInfo = useMemo(() => {
    return getTodaySessionState(
      todayStr,
      workouts,
      plannedWorkouts,
      activeWorkoutDraft,
      userUnit
    );
  }, [todayStr, workouts, plannedWorkouts, activeWorkoutDraft, userUnit]);

  // ── Training Decision Ledger (Auditable prescription) ──────────────────────
  const targetExerciseForDecision = useMemo(() => {
    if (plannedWorkouts.length > 0 && plannedWorkouts[0].exercises.length > 0) {
      const compound = plannedWorkouts[0].exercises.find((e) => isMainCompoundLift(e.name));
      if (compound) return compound.name;
      return plannedWorkouts[0].exercises[0].name;
    }
    if (workouts.length > 0 && workouts[0].exercises.length > 0) {
      const compound = workouts[0].exercises.find((e) => isMainCompoundLift(e.name));
      if (compound) return compound.name;
      return workouts[0].exercises[0].name;
    }
    return null;
  }, [plannedWorkouts, workouts]);

  const activeTrainingDecision = useMemo(() => {
    if (!targetExerciseForDecision || workouts.length === 0) return null;
    return generateTrainingDecision(targetExerciseForDecision, workouts, userUnit);
  }, [targetExerciseForDecision, workouts, userUnit]);

  // ── Logger modal state ─────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** When the logger is pre-filled from a plan, store its name here */
  const [startedFromPlan, setStartedFromPlan] = useState<string | null>(null);
  const [sharingPlan, setSharingPlan] = useState<PlannedWorkout | null>(null);

  // ── Rest Timer State ───────────────────────────────────────────────────────
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(90);
  const [isRestRunning, setIsRestRunning] = useState<boolean>(false);
  const [isTimerFinished, setIsTimerFinished] = useState<boolean>(false);

  // ── Workout Logger Form State ──────────────────────────────────────────────
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);

  // ── Quick Substitution & Voice State ───────────────────────────────────────
  const [quickSubstituteIndex, setQuickSubstituteIndex] = useState<number | null>(null);
  const [quickSubEquipmentFilter, setQuickSubEquipmentFilter] = useState<string>('all');
  const [isListening, setIsListening] = useState(false);
  const [expandedRationaleIndex, setExpandedRationaleIndex] = useState<number | null>(null);

  // ── Exercise Library & AI State ───────────────────────────────────────────
  const [isExerciseLibraryOpen, setIsExerciseLibraryOpen] = useState(false);
  const [substitutionExerciseIndex, setSubstitutionExerciseIndex] = useState<number | null>(null);
  const [isCoachDrawerOpen, setIsCoachDrawerOpen] = useState(false);
  const [postWorkoutSummary, setPostWorkoutSummary] = useState<{
    name: string;
    durationMinutes: number;
    exercises: WorkoutExercise[];
  } | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  // ── Plan modal state ───────────────────────────────────────────────────────
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlannedWorkout | null>(null);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);

  // ── Auto-save Draft to Local Storage ──────────────────────────────────────
  useEffect(() => {
    if (isModalOpen && exercises.some((e) => e.name.trim() || e.sets.some((s) => s.weight > 0 || s.reps > 0))) {
      saveWorkoutDraft({
        date,
        exercises,
        startedFromPlan,
        sessionStartTime,
        savedAt: new Date().toISOString(),
      });
    }
  }, [isModalOpen, exercises, date, startedFromPlan, sessionStartTime, saveWorkoutDraft]);

  const handleResumeWorkout = () => {
    if (!activeWorkoutDraft) return;
    setDate(activeWorkoutDraft.date);
    setExercises(activeWorkoutDraft.exercises);
    setStartedFromPlan(activeWorkoutDraft.startedFromPlan || null);
    setSessionStartTime(activeWorkoutDraft.sessionStartTime || Date.now());
    setIsModalOpen(true);
    toast.success('Resumed active workout session!', 'Workout Restored');
  };

  const handleDiscardDraft = () => {
    clearWorkoutDraft();
    toast.info('Workout draft discarded.', 'Draft Cleared');
  };

  const handleRepeatLastWorkout = () => {
    if (workouts.length === 0) return;
    const last = workouts[0];
    setSessionStartTime(Date.now());
    const clonedExercises: WorkoutExercise[] = last.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        unit: s.unit || userUnit,
      })),
    }));
    setExercises(clonedExercises);
    setDate(new Date().toISOString().split('T')[0]);
    setStartedFromPlan(`Repeated (${last.date})`);
    setIsModalOpen(true);
    toast.success(`Loaded ${clonedExercises.length} exercises from last session!`, 'Workout Loaded');
  };

  const handleCompressWorkout = (mins: 30 | 45 | 60) => {
    const compressed = compressWorkout(exercises, mins);
    setExercises(compressed);
    toast.info(
      `Workout shortened to ~${mins} min (${compressed.length} primary movements preserved).`,
      'Time Adapted'
    );
  };

  const handleQuickSubstitute = (index: number, sub: ExerciseSubstitute) => {
    const targetEx = exercises[index];
    if (!targetEx) return;
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === index
          ? {
              ...ex,
              name: sub.name,
            }
          : ex
      )
    );
    setQuickSubstituteIndex(null);
    toast.success(`Swapped to ${sub.name}`, 'Exercise Replaced');
  };

  const toggleVoiceLogging = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      toast.error('Voice recognition is not supported on this browser.', 'Voice Logging');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        toast.info('Listening... Say e.g. "Bench 70 for 8 8 7"', 'Voice Logging');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);
        const parsed = parseVoiceWorkout(transcript, availableExercises);
        if (parsed) {
          setExercises((prev) => [
            ...prev.filter((e) => e.name.trim()),
            {
              name: parsed.exerciseName,
              sets: parsed.sets.map((s) => ({ ...s, unit: userUnit })),
            },
          ]);
          toast.success(
            `Logged "${parsed.exerciseName}" (${parsed.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')})`,
            'Voice Input Added'
          );
        } else {
          toast.error(`Could not parse: "${transcript}"`, 'Voice Error');
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleApplyReplacement = (replacement: AISubstitutionResult) => {
    if (substitutionExerciseIndex !== null) {
      setExercises(prev => prev.map((ex, i) => {
        if (i === substitutionExerciseIndex) {
          return {
            name: replacement.replacementExercise,
            sets: Array.from({ length: replacement.targetSets || ex.sets.length || 3 }).map(() => ({
              weight: replacement.targetWeightKg || ex.sets[0]?.weight || 0,
              reps: parseInt(replacement.targetReps || '8') || 8,
              unit: userUnit,
            })),
          };
        }
        return ex;
      }));
      toast.success(`Replaced with ${replacement.replacementExercise}`, 'Exercise Substituted');
      setSubstitutionExerciseIndex(null);
    }
  };

  const handleApplyModifiedWorkout = (modifiedExercises: WorkoutExercise[]) => {
    setExercises(modifiedExercises);
    toast.success('Workout updated according to Coach directive.', 'Workout Adapted');
  };

  // ─── Workout logger helpers ────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedWorkouts);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedWorkouts(newExpanded);
  };

  const handleAddExercise = (exerciseName = '') => {
    const finalName = exerciseName.trim() || (exercises.length === 0 ? 'Bench Press' : `Exercise ${exercises.length + 1}`);
    setExercises(prev => [...prev, { name: finalName, sets: [{ reps: 8, weight: userUnit === 'kg' ? 60 : 135, unit: userUnit }] }]);
  };

  const handleSelectFromLibrary = (exerciseName: string) => {
    if (!isModalOpen) {
      setStartedFromPlan(null);
      setSessionStartTime(Date.now());
      setExercises([{ name: exerciseName, sets: [{ reps: 8, weight: 0, unit: userUnit }] }]);
      setIsModalOpen(true);
    } else {
      handleAddExercise(exerciseName);
    }
    toast.success(`Added "${exerciseName}" to session`, 'Exercise Added');
  };

  const handleExerciseNotesChange = (index: number, notes: string) => {
    setExercises(prev => prev.map((ex, i) => i === index ? { ...ex, notes } : ex));
  };

  const handleRemoveExercise = (index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
  };

  const handleExerciseNameChange = (index: number, name: string) => {
    setExercises(prev => prev.map((ex, i) => i === index ? { ...ex, name } : ex));
  };

  const handleAddSet = (exerciseIndex: number) => {
    setExercises(prev => {
      const updated = [...prev];
      const prevSet = updated[exerciseIndex].sets[updated[exerciseIndex].sets.length - 1];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: [
          ...updated[exerciseIndex].sets,
          {
            reps: prevSet?.reps ?? 8,
            weight: prevSet?.weight ?? 0,
            unit: prevSet?.unit ?? userUnit,
          },
        ],
      };
      return updated;
    });
  };

  const handleRemoveSet = (exerciseIndex: number, setIndex: number) => {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exerciseIndex
          ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIndex) }
          : ex
      )
    );
  };

  const handleSetChange = (exerciseIndex: number, setIndex: number, field: keyof WorkoutSet, value: unknown) => {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exerciseIndex
          ? {
              ...ex,
              sets: ex.sets.map((s, j) =>
                j === setIndex ? { ...s, [field]: value } : s
              ),
            }
          : ex
      )
    );
  };

  // ─── Open logger (blank) ─────────────────────────────────────────────────

  const openBlankLogger = () => {
    setStartedFromPlan(null);
    setSessionStartTime(Date.now());
    if (exercises.length === 0 || exercises.every(e => !e.name.trim())) {
      setExercises([{ name: 'Bench Press', sets: [{ reps: 8, weight: userUnit === 'kg' ? 60 : 135, unit: userUnit }] }]);
    }
    setIsModalOpen(true);
  };

  // ─── Start plan → pre-fill logger ────────────────────────────────────────

  const handleStartPlan = (plan: PlannedWorkout) => {
    setSessionStartTime(Date.now());
    const storedDecisions = useStore.getState().trainingDecisions;
    const preFilledExercises: WorkoutExercise[] = plan.exercises.map(pe => {
      const activeDecision = storedDecisions[pe.name];
      let assignedWeight = pe.targetWeight ?? 0;
      let assignedRpe = 8;
      if (activeDecision?.status === 'accepted') {
        assignedWeight = activeDecision.nextPrescription.weight;
        assignedRpe = activeDecision.nextPrescription.targetRpe;
      } else if (activeDecision?.status === 'overridden' && activeDecision.userOverrideWeight !== undefined) {
        assignedWeight = activeDecision.userOverrideWeight;
        assignedRpe = activeDecision.nextPrescription.targetRpe;
      }

      return {
        name: pe.name,
        sets: Array.from({ length: Math.max(1, pe.targetSets) }, () => ({
          weight: assignedWeight,
          reps: pe.targetReps,
          unit: pe.targetUnit ?? userUnit,
          rpe: assignedRpe,
        })),
      };
    });
    setExercises(preFilledExercises);
    setDate(new Date().toISOString().split('T')[0]);
    setStartedFromPlan(plan.name);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (startPlanOnMount) {
      handleStartPlan(startPlanOnMount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPlanOnMount]);

  // ─── Close logger ─────────────────────────────────────────────────────────

  const closeLogger = () => {
    setIsModalOpen(false);
    setStartedFromPlan(null);
  };

  // ─── Audio Beep ─────────────────────────────────────────────────────────

  const playBeep = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('ASCEND • REST COMPLETE', {
          body: 'Rest time is up! Ready for your next set.',
          icon: '/favicon.ico',
        });
      }
    } catch {}
  };

  // ─── Rest Timer Effect ───────────────────────────────────────────────────

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRestRunning && restSecondsLeft > 0) {
      interval = setInterval(() => {
        setRestSecondsLeft((prev) => {
          if (prev <= 1) {
            playBeep();
            toast.info('⏰ Rest time is up! Ready for your next set.', 'SET READY');
            setIsRestRunning(false);
            setIsTimerFinished(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isRestRunning, restSecondsLeft, toast]);

  const startTimer = (seconds: number) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch {}
    }
    setRestTotalSeconds(seconds);
    setRestSecondsLeft(seconds);
    setIsRestRunning(true);
    setIsTimerFinished(false);
  };

  const togglePauseTimer = () => {
    if (restSecondsLeft === 0) {
      startTimer(restTotalSeconds || 90);
    } else {
      setIsRestRunning(r => !r);
    }
  };

  const resetTimer = () => {
    setIsRestRunning(false);
    setIsTimerFinished(false);
    setRestSecondsLeft(restTotalSeconds);
  };

  const skipTimer = () => {
    setIsRestRunning(false);
    setRestSecondsLeft(0);
    setIsTimerFinished(false);
  };

  const adjustTimer = (deltaSeconds: number) => {
    setRestSecondsLeft(prev => Math.max(0, prev + deltaSeconds));
    setIsTimerFinished(false);
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  // ─── Save Workout ─────────────────────────────────────────────────────────

  const handleSaveWorkout = () => {
    const validExercises = exercises.filter(e => e.name.trim() && e.sets.length > 0);
    if (validExercises.length === 0) {
      toast.error('Please add at least one exercise with sets.', 'Empty Workout');
      return;
    }

    const workoutId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `w_${Date.now()}`;

    const newWorkout: WorkoutEntry = { id: workoutId, date, exercises: validExercises };
    addWorkout(newWorkout);

    // Auto-PR Detection
    let newPRCount = 0;
    for (const ex of validExercises) {
      const exName = ex.name.trim();
      const existingPRs = prs.filter(p => p.exercise.toLowerCase() === exName.toLowerCase());
      const currentBest1RMKg = existingPRs.length > 0 ? Math.max(...existingPRs.map(p => p.oneRepMax)) : 0;

      let topSet = { weightKg: 0, weightLbs: 0, reps: 0, e1RMKg: 0, rawWeight: 0, unit: userUnit as 'kg' | 'lbs' };

      for (const s of ex.sets) {
        const wNum = s.weight;
        const rNum = s.reps;
        if (wNum > 0 && rNum > 0) {
          const wKg = s.unit === 'lbs' ? wNum * 0.453592 : wNum;
          const wLbs = s.unit === 'lbs' ? wNum : wNum * 2.20462;
          const e1RM = calculateOneRepMax(wKg, rNum);
          if (e1RM > topSet.e1RMKg) {
            topSet = {
              weightKg: Math.round(wKg * 10) / 10,
              weightLbs: Math.round(wLbs * 10) / 10,
              reps: rNum,
              e1RMKg: Math.round(e1RM * 10) / 10,
              rawWeight: wNum,
              unit: s.unit,
            };
          }
        }
      }

      if (topSet.e1RMKg > currentBest1RMKg && topSet.e1RMKg > 0) {
        const prId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pr_${Date.now()}_${Math.random()}`;
        addPR({
          id: prId,
          exercise: exName,
          weightKg: topSet.weightKg,
          weightLbs: topSet.weightLbs,
          reps: topSet.reps,
          oneRepMax: topSet.e1RMKg,
          date,
          notes: 'Auto-detected from workout session',
        });
        newPRCount++;
      }
    }

    if (newPRCount > 0) {
      toast.success(
        `🎉 ${newPRCount} New Personal Record${newPRCount > 1 ? 's' : ''} detected & synced to your PRs!`,
        'New PR Milestone'
      );
    } else {
      toast.success(
        `Logged workout with ${validExercises.length} exercise${validExercises.length > 1 ? 's' : ''}!`,
        'Workout Saved'
      );
    }

    const durationMin = Math.max(15, Math.round((Date.now() - sessionStartTime) / 60000));
    setPostWorkoutSummary({
      name: startedFromPlan || 'Workout Session',
      durationMinutes: durationMin,
      exercises: validExercises,
    });

    clearWorkoutDraft();
    setIsModalOpen(false);
    setStartedFromPlan(null);
    setDate(new Date().toISOString().split('T')[0]);
    setExercises([]);
  };

  // ─── Plan CRUD handlers ───────────────────────────────────────────────────

  const handleSavePlan = (planData: Omit<PlannedWorkout, 'id' | 'createdAt'>) => {
    if (editingPlan) {
      updatePlannedWorkout(editingPlan.id, {
        ...editingPlan,
        name: planData.name,
        exercises: planData.exercises,
      });
      toast.success(`Plan "${planData.name}" updated.`, 'Plan Saved');
    } else {
      const newPlan: PlannedWorkout = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `plan_${Date.now()}`,
        createdAt: new Date().toISOString(),
        name: planData.name,
        exercises: planData.exercises,
      };
      addPlannedWorkout(newPlan);
      toast.success(`Plan "${planData.name}" created!`, 'Plan Created');
    }
    setEditingPlan(null);
  };

  const handleEditPlan = (plan: PlannedWorkout) => {
    setEditingPlan(plan);
    setIsPlanModalOpen(true);
  };

  const handleDeletePlan = (plan: PlannedWorkout) => {
    deletePlannedWorkout(plan.id);
    toast.info(`Plan "${plan.name}" deleted.`, 'Plan Removed');
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    setIsPlanModalOpen(true);
  };

  // ─── Suggested Workout Handlers ───────────────────────────────────────────

  const handleStartSuggestedWorkout = (workoutName: string, suggestedExercises: PlannedExercise[]) => {
    setSessionStartTime(Date.now());
    const preFilled: WorkoutExercise[] = suggestedExercises.map(pe => ({
      name: pe.name,
      sets: Array.from({ length: Math.max(1, pe.targetSets) }, () => ({
        weight: pe.targetWeight ?? 0,
        reps: pe.targetReps,
        unit: pe.targetUnit ?? userUnit,
      })),
    }));
    setExercises(preFilled);
    setDate(new Date().toISOString().split('T')[0]);
    setStartedFromPlan(workoutName);
    setIsModalOpen(true);
  };

  const handleSaveSuggestedPlan = (planData: Omit<PlannedWorkout, 'id' | 'createdAt'>) => {
    const newPlan: PlannedWorkout = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `plan_${Date.now()}`,
      createdAt: new Date().toISOString(),
      name: planData.name,
      exercises: planData.exercises,
    };
    addPlannedWorkout(newPlan);
  };

  // ─── Sorted workout history ───────────────────────────────────────────────

  const sortedWorkouts = useMemo(
    () => [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20),
    [workouts]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page animate-fade-in space-y-4">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2.5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">Workouts</h1>
            <p className="text-label text-text-muted">Log your sessions &amp; track consistency</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlateModalOpen(true)}
            className="p-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
            title="Plate Calculator & Warmup Ramp"
          >
            <Dumbbell className="w-4 h-4 text-accent" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* ── ACTIVE WORKOUT DRAFT RESUME BANNER ── */}
      {activeWorkoutDraft && !isModalOpen && (
        <div className="card p-3.5 bg-gradient-to-r from-accent/20 via-bg-card to-accent/10 border border-accent/40 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0">
              <FastForward className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-text-primary block font-sans">
                IN-PROGRESS WORKOUT DETECTED
              </span>
              <span className="text-2xs text-text-secondary">
                {activeWorkoutDraft.startedFromPlan ? `Plan: ${activeWorkoutDraft.startedFromPlan} • ` : ''}
                {plural(activeWorkoutDraft.exercises.filter((e) => e.name.trim()).length, 'exercise')} saved
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-xs text-text-muted hover:text-danger px-2 py-1 transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleResumeWorkout}
              className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Resume</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 1. TODAY'S WORKOUT HERO (Single Source of Truth) ── */}
      <section className="card p-4 sm:p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/5 border border-border shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                todaySessionInfo.status === 'completed'
                  ? 'bg-emerald-500'
                  : todaySessionInfo.status === 'in_progress'
                  ? 'bg-accent animate-pulse'
                  : todaySessionInfo.status === 'planned'
                  ? 'bg-accent'
                  : 'bg-text-muted'
              }`}
            />
            <h2 className="section-title text-[11px] mb-0">
              {todaySessionInfo.status === 'completed'
                ? 'TODAY COMPLETED'
                : todaySessionInfo.status === 'in_progress'
                ? 'IN PROGRESS'
                : "TODAY'S WORKOUT"}
            </h2>
          </div>
          <span className="text-label text-text-muted font-medium">
            {todaySessionInfo.status === 'completed' && todaySessionInfo.totalSets
              ? plural(todaySessionInfo.totalSets, 'set')
              : todaySessionInfo.status === 'planned'
              ? `${plural(todaySessionInfo.exercises.length, 'exercise')} ready`
              : todaySessionInfo.status === 'in_progress'
              ? 'Draft active'
              : `${plural(plannedWorkouts.length, 'plan')} available`}
          </span>
        </div>

        <div>
          <h3 className="text-lg font-bold text-text-primary leading-tight">
            {todaySessionInfo.title}
          </h3>
          <p className="text-body text-text-secondary mt-0.5">
            {todaySessionInfo.subtitle}
          </p>
        </div>

        {/* If completed today, show verified summary metrics */}
        {todaySessionInfo.status === 'completed' && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-label tabular-nums">
            {todaySessionInfo.volumeKg && todaySessionInfo.volumeKg > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-primary font-semibold">
                {todaySessionInfo.volumeKg.toLocaleString()} kg volume
              </span>
            ) : null}
            {todaySessionInfo.durationMin && todaySessionInfo.durationMin > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-muted">
                {todaySessionInfo.durationMin} min
              </span>
            ) : todaySessionInfo.totalSets && todaySessionInfo.totalSets > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-text-muted">
                {plural(todaySessionInfo.totalSets, 'set')}
              </span>
            ) : null}
          </div>
        )}

        {/* Load hint for planned workout */}
        {todaySessionInfo.status === 'planned' && todaySessionInfo.firstExerciseLoadHint && (
          <div className="pt-0.5">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-bg-secondary border border-border text-2xs font-mono text-text-secondary">
              {todaySessionInfo.firstExerciseLoadHint}
            </span>
          </div>
        )}

        {/* Consolidated Primary & Secondary CTA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {todaySessionInfo.status === 'in_progress' ? (
            <button
              type="button"
              onClick={handleResumeWorkout}
              className="btn-primary py-3 px-4 text-xs font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-white stroke-white" />
              <span>Resume Session</span>
            </button>
          ) : todaySessionInfo.status === 'planned' ? (
            <button
              type="button"
              onClick={() => handleStartPlan(plannedWorkouts[0])}
              className="btn-primary py-3 px-4 text-xs font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-white stroke-white" />
              <span className="truncate">Start: {plannedWorkouts[0].name}</span>
            </button>
          ) : todaySessionInfo.status === 'completed' ? (
            <button
              type="button"
              onClick={openBlankLogger}
              className="btn-secondary py-3 px-4 text-xs font-bold flex items-center justify-center gap-2 border-border hover:border-accent/40 text-text-primary hover:text-accent transition-colors"
            >
              <Play className="w-4 h-4 fill-text-primary stroke-text-primary" />
              <span>Log Additional Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openBlankLogger}
              className="btn-primary py-3 px-4 text-xs font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-white stroke-white" />
              <span>START WORKOUT</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSuggestedModalOpen(true)}
            className="btn-secondary py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-border hover:border-accent/40 text-text-primary hover:text-accent transition-colors"
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span>Suggest Plan / Templates</span>
          </button>
        </div>

        {/* Quick Split Templates Bar */}
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <div className="flex items-center justify-between text-2xs text-text-muted">
            <span className="font-mono uppercase font-bold tracking-wider text-accent">Quick Split Templates:</span>
            {workouts.length > 0 && (
              <button
                type="button"
                onClick={handleRepeatLastWorkout}
                className="text-text-secondary hover:text-accent font-medium flex items-center gap-1 transition-colors"
              >
                <FastForward className="w-3 h-3 text-accent" />
                <span>Repeat last session</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {BUILTIN_SPLIT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleStartPlan(tmpl)}
                className="py-1.5 px-2.5 rounded-lg bg-bg-secondary/70 border border-border/70 text-2xs font-semibold text-text-primary hover:border-accent/50 hover:bg-accent/10 transition-colors text-left flex items-center justify-between"
                title={`Start ${tmpl.name} (${tmpl.exercises.length} movements)`}
              >
                <span className="truncate">{tmpl.name}</span>
                <Play className="w-2.5 h-2.5 text-accent shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Quick Exercise Library Link */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50 text-2xs">
          <button
            type="button"
            onClick={() => setIsExerciseLibraryOpen(true)}
            className="text-text-muted hover:text-accent flex items-center gap-1.5 py-1 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-accent" />
            <span>Browse Exercise Library (History &amp; PRs) &rarr;</span>
          </button>
        </div>
      </section>

      {/* ── ASCEND AUDITABLE PRESCRIPTION: DECISION LEDGER ── */}
      {activeTrainingDecision && activeTrainingDecision.evidenceCount >= 1 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <h2 className="section-title text-[11px] mb-0 font-mono">
                WHY DID MY PRESCRIPTION CHANGE?
              </h2>
            </div>
            <span className="text-3xs text-text-muted font-mono">
              Auditable AI Coach
            </span>
          </div>
          <TrainingDecisionCard
            decision={activeTrainingDecision}
            userUnit={userUnit}
          />
        </section>
      )}

      {/* ── 2. CONTEXTUAL REST TIMER (Only visible during active rest) ── */}
      {(isRestRunning || isTimerFinished || restSecondsLeft > 0) && (
        <section className="px-3.5 py-2.5 rounded-xl bg-bg-card border border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Timer className="w-4 h-4 text-accent shrink-0" />
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-text-primary font-mono">
                {isTimerFinished ? (
                  <span className="text-emerald-500">READY</span>
                ) : (
                  formatTimer(restSecondsLeft > 0 ? restSecondsLeft : restTotalSeconds)
                )}
              </span>
              <span className="text-2xs text-text-muted hidden sm:inline">Rest Timer</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[60, 90, 120, 180, 300].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => startTimer(s)}
                className={`px-2 py-1 rounded-lg text-2xs font-semibold border transition-all ${
                  restTotalSeconds === s && restSecondsLeft > 0
                    ? 'bg-accent text-white border-accent'
                    : 'bg-bg-secondary border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {s >= 60 ? `${s / 60}m` : `${s}s`}
              </button>
            ))}
            <button
              type="button"
              onClick={togglePauseTimer}
              className="p-1.5 rounded-lg bg-accent text-white hover:brightness-105 active:scale-95 transition-all"
              title={isRestRunning ? 'Pause' : 'Start'}
            >
              {isRestRunning ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
            </button>
          </div>
        </section>
      )}

      {/* ── 3. WORKOUT PLANS SECTION ────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent" />
            <h2 className="section-title text-[11px] mb-0">WORKOUT PLANS</h2>
            {plannedWorkouts.length > 0 && (
              <span className="text-2xs bg-accent/15 text-accent font-bold px-1.5 py-0.5 rounded-md font-mono">
                {plannedWorkouts.length}
              </span>
            )}
          </div>
          <button
            onClick={openCreatePlan}
            className="text-text-secondary hover:text-text-primary text-xs font-semibold flex items-center gap-1 hover:underline"
            title="Create new workout plan"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span>New Plan</span>
          </button>
        </div>

        {plannedWorkouts.length === 0 ? (
          <div className="card p-3.5 flex items-center justify-between border-dashed border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">No custom plans saved yet</p>
                <p className="text-2xs text-text-muted">Build your personalized routine or load a split template above</p>
              </div>
            </div>
            <button
              onClick={openCreatePlan}
              className="btn-secondary py-1 px-3 text-xs font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>Create Plan</span>
            </button>
          </div>
        ) : (
          /* Plan cards grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plannedWorkouts.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onStart={() => handleStartPlan(plan)}
                onEdit={() => handleEditPlan(plan)}
                onDelete={() => handleDeletePlan(plan)}
                onShare={() => setSharingPlan(plan)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 4. RECENT WORKOUTS HISTORY (Item 27: Action-oriented empty state) ─ */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="section-title text-[11px] mb-0">RECENT WORKOUTS</h2>
          </div>
          {sortedWorkouts.length > 0 && (
            <span className="text-2xs text-text-muted font-medium">
              {sortedWorkouts.length} logged
            </span>
          )}
        </div>

        {sortedWorkouts.length === 0 ? (
          <div className="card text-center py-8 px-4 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent mx-auto">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">Your journey starts here.</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Log your first workout to begin tracking consistency and volume.
              </p>
            </div>
            <button
              type="button"
              onClick={openBlankLogger}
              className="btn-primary mx-auto text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>START WORKOUT</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedWorkouts.map(workout => {
              const isExpanded = expandedWorkouts.has(workout.id);
              const totalSets = workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);

              return (
                <div key={workout.id} className="card">
                  <div
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => toggleExpand(workout.id)}
                  >
                    <div>
                      <h3 className="font-semibold text-text-primary">
                        {new Date(workout.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </h3>
                      <p className="text-label text-text-secondary mt-0.5 tabular-nums">
                        {plural(workout.exercises.length, 'exercise')} • {plural(totalSets, 'set')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronUp className="w-5 h-5 text-text-secondary" />
                        : <ChevronDown className="w-5 h-5 text-text-secondary" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                      {workout.exercises.map((ex, i) => (
                        <div key={i} className="bg-bg-elevated p-3 rounded-lg">
                          <p className="font-medium text-accent mb-2 text-sm">{ex.name}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-text-secondary">
                            {ex.sets.map((set, j) => (
                              <div key={j} className="bg-bg-primary px-2.5 py-1.5 rounded border border-border">
                                Set {j + 1}:{' '}
                                <span className="text-text-primary font-medium tabular-nums">
                                  {set.weight} {set.unit}
                                </span>{' '}
                                × {set.reps} reps
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end pt-2">
                        {confirmDeleteId === workout.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">Delete this workout?</span>
                            <button
                              type="button"
                              onClick={() => {
                                deleteWorkout(workout.id);
                                setConfirmDeleteId(null);
                                toast.info(`Deleted workout session from ${workout.date}.`, 'Workout Removed');
                              }}
                              className="px-2.5 py-1 bg-danger text-white rounded text-xs font-semibold hover:bg-danger/90 transition-colors"
                            >
                              Yes, Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 bg-bg-secondary text-text-muted rounded text-xs font-semibold hover:text-text-primary transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(workout.id)}
                            className="text-danger hover:text-danger/80 text-xs flex items-center gap-1.5 px-2 py-1 rounded hover:bg-danger/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Workout
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Dedicated Fullscreen Active Workout Experience ──────────────── */}
      {isModalOpen && (
        <ActiveWorkoutScreen
          initialExercises={exercises}
          workoutName={startedFromPlan || 'Workout Session'}
          onFinish={(workoutEntry, newPRsCount) => {
            addWorkout(workoutEntry);
            clearWorkoutDraft();
            setIsModalOpen(false);
            setExercises([]);
            setStartedFromPlan(null);
            if (newPRsCount > 0) {
              toast.success(
                `🎉 ${newPRsCount} New PR${newPRsCount > 1 ? 's' : ''} detected & synced to your PRs!`,
                'New PR Milestone'
              );
            } else {
              toast.success(
                `Logged workout with ${workoutEntry.exercises.length} exercise${workoutEntry.exercises.length > 1 ? 's' : ''}!`,
                'Workout Saved'
              );
            }
          }}
          onCancel={() => {
            clearWorkoutDraft();
            setIsModalOpen(false);
            setExercises([]);
            setStartedFromPlan(null);
          }}
        />
      )}

      {/* ── Plan Create/Edit Modal ───────────────────────────────────────── */}
      <PlanModal
        isOpen={isPlanModalOpen}
        onClose={() => { setIsPlanModalOpen(false); setEditingPlan(null); }}
        initial={editingPlan}
        availableExercises={availableExercises}
        userUnit={userUnit}
        onSave={handleSavePlan}
      />

      {/* Datalists */}
      <datalist id="exercises-list">
        {availableExercises.map(ex => <option key={ex} value={ex} />)}
      </datalist>
      <datalist id="plan-exercises-list">
        {availableExercises.map(ex => <option key={ex} value={ex} />)}
      </datalist>

      {/* Barbell Plate Loading & Warmup Sets Calculator Modal */}
      <PlateCalculatorModal
        isOpen={isPlateModalOpen}
        onClose={() => setIsPlateModalOpen(false)}
        initialUnit={userUnit}
        initialWeight={userUnit === 'kg' ? 100 : 225}
      />

      {/* AI Exercise Substitution Modal */}
      {substitutionExerciseIndex !== null && (
        <ExerciseSubstitutionModal
          isOpen={substitutionExerciseIndex !== null}
          onClose={() => setSubstitutionExerciseIndex(null)}
          exerciseName={exercises[substitutionExerciseIndex]?.name || ''}
          onApplyReplacement={handleApplyReplacement}
        />
      )}

      {/* In-Workout Ask Coach Drawer */}
      <WorkoutCoachDrawer
        isOpen={isCoachDrawerOpen}
        onClose={() => setIsCoachDrawerOpen(false)}
        activeWorkout={{
          name: startedFromPlan || 'Current Workout',
          exercises,
        }}
        onApplyModifiedWorkout={handleApplyModifiedWorkout}
      />

      {/* Post-Workout Coach's Take Modal */}
      {postWorkoutSummary && (
        <PostWorkoutTakeModal
          isOpen={!!postWorkoutSummary}
          onClose={() => setPostWorkoutSummary(null)}
          completedWorkout={postWorkoutSummary}
        />
      )}

      {/* Suggested Workout Plan Generator Modal */}
      <SuggestedWorkoutModal
        isOpen={isSuggestedModalOpen}
        onClose={() => setIsSuggestedModalOpen(false)}
        userUnit={userUnit}
        onStartWorkout={handleStartSuggestedWorkout}
        onSavePlan={handleSaveSuggestedPlan}
      />

      {/* Exercise Library Modal (Item 21) */}
      <ExerciseLibraryModal
        isOpen={isExerciseLibraryOpen}
        onClose={() => setIsExerciseLibraryOpen(false)}
        onSelectExercise={handleSelectFromLibrary}
        workouts={workouts}
        prs={prs}
        userUnit={userUnit}
      />

      {/* Share Program Modal (Distribution Loop) */}
      <ShareProgramModal
        plan={sharingPlan}
        isOpen={Boolean(sharingPlan)}
        onClose={() => setSharingPlan(null)}
      />
    </div>
  );
}
