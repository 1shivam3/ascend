"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { getExerciseList, calculateOneRepMax } from '@/lib/strength-standards';
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
} from 'lucide-react';
import { WorkoutEntry, WorkoutExercise, WorkoutSet, PlannedWorkout, PlannedExercise } from '@/lib/store';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  getQuickSubstitutes,
  compressWorkout,
  parseVoiceWorkout,
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

interface WorkoutPageProps {
  onNavigate?: (tab: 'home' | 'prs' | 'workout' | 'meals') => void;
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
}

function PlanCard({ plan, onStart, onEdit, onDelete }: PlanCardProps) {
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

export default function WorkoutPage({ onNavigate }: WorkoutPageProps = {}) {
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

  // ── Logger modal state ─────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  /** When the logger is pre-filled from a plan, store its name here */
  const [startedFromPlan, setStartedFromPlan] = useState<string | null>(null);

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
    setExercises(prev => [...prev, { name: exerciseName, sets: [{ reps: 8, weight: 0, unit: userUnit }] }]);
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
    if (exercises.length === 0) handleAddExercise();
    setIsModalOpen(true);
  };

  // ─── Start plan → pre-fill logger ────────────────────────────────────────

  const handleStartPlan = (plan: PlannedWorkout) => {
    setSessionStartTime(Date.now());
    const preFilledExercises: WorkoutExercise[] = plan.exercises.map(pe => ({
      name: pe.name,
      sets: Array.from({ length: Math.max(1, pe.targetSets) }, () => ({
        weight: pe.targetWeight ?? 0,
        reps: pe.targetReps,
        unit: pe.targetUnit ?? userUnit,
      })),
    }));
    setExercises(preFilledExercises);
    setDate(new Date().toISOString().split('T')[0]);
    setStartedFromPlan(plan.name);
    setIsModalOpen(true);
  };

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
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="w-8 h-8 rounded-lg bg-bg-card border border-border flex items-center justify-center text-accent hover:border-accent transition-colors active:scale-95"
              title="Return to Home Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">Workouts</h1>
            <p className="text-2xs text-text-muted font-mono">Log your sessions &amp; track consistency</p>
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
          <button className="btn-primary flex items-center gap-1.5" onClick={openBlankLogger}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Log Workout</span>
            <span className="sm:hidden">Log</span>
          </button>
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
                {activeWorkoutDraft.exercises.filter((e) => e.name.trim()).length} exercises saved
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

      {/* ── 1. TODAY'S WORKOUT HERO (Item 13: Strong "let's train" moment) ── */}
      <section className="card p-4 sm:p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/5 border border-border shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <h2 className="section-title text-[11px] mb-0">TODAY&apos;S WORKOUT</h2>
          </div>
          {plannedWorkouts.length > 0 && (
            <span className="text-2xs text-text-muted font-medium">
              {plannedWorkouts.length} {plannedWorkouts.length === 1 ? 'plan' : 'plans'} ready
            </span>
          )}
        </div>

        <div>
          <h3 className="text-lg font-bold text-text-primary leading-tight">
            {plannedWorkouts.length > 0
              ? plannedWorkouts[0].name
              : 'No workout planned'}
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {plannedWorkouts.length > 0
              ? `${plannedWorkouts[0].exercises.length} exercises configured • Ready to train`
              : 'Start a workout from scratch or create a plan'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {plannedWorkouts.length > 0 ? (
            <button
              type="button"
              onClick={() => handleStartPlan(plannedWorkouts[0])}
              className="btn-primary py-3 text-xs font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-white stroke-white" />
              <span className="truncate">Start: {plannedWorkouts[0].name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openBlankLogger}
              className="btn-primary py-3 text-xs font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-white stroke-white" />
              <span>START WORKOUT</span>
            </button>
          )}

          {workouts.length > 0 ? (
            <button
              type="button"
              onClick={handleRepeatLastWorkout}
              className="btn-secondary py-3 text-xs font-semibold px-3 flex items-center justify-center gap-1.5 border-border hover:border-accent/40 text-text-primary hover:text-accent transition-colors"
              title={`Repeat last session from ${workouts[0]?.date}`}
            >
              <FastForward className="w-3.5 h-3.5 text-accent" />
              <span>Repeat Last ({workouts[0]?.exercises.length} ex)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSuggestedModalOpen(true)}
              className="btn-secondary py-3 text-xs font-semibold px-3 flex items-center justify-center gap-1.5 border-border hover:border-accent/40 text-text-primary hover:text-accent transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>⚡ Suggest Plan</span>
            </button>
          )}

          <button
            type="button"
            onClick={openBlankLogger}
            className="btn-secondary py-3 text-xs font-semibold px-3 flex items-center justify-center gap-1.5 border-border hover:border-accent/40 text-text-primary hover:text-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span>Start Empty</span>
          </button>
        </div>

        {/* Quick Exercise Library & Suggestion Bar */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50 text-2xs">
          <button
            type="button"
            onClick={() => setIsExerciseLibraryOpen(true)}
            className="text-text-muted hover:text-accent flex items-center gap-1.5 py-1 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-accent" />
            <span>Browse Exercise Library (History &amp; PRs) &rarr;</span>
          </button>

          {workouts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsSuggestedModalOpen(true)}
              className="text-accent hover:underline flex items-center gap-1 font-semibold"
            >
              <Zap className="w-3 h-3" />
              <span>Suggest Workout</span>
            </button>
          )}
        </div>
      </section>

      {/* ── 2. CONTEXTUAL REST TIMER (Compact utility outside workout) ── */}
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

        <div className="flex items-center gap-1.5">
          {[60, 90, 120].map((s) => (
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSuggestedModalOpen(true)}
              className="text-accent text-xs font-semibold flex items-center gap-1 hover:underline"
              title="Generate a suggested workout routine"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ Suggest Plan</span>
            </button>
            <span className="text-border">•</span>
            <button
              onClick={openCreatePlan}
              className="text-text-secondary hover:text-text-primary text-xs font-semibold flex items-center gap-1 hover:underline"
              title="Create new workout plan"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>New Plan</span>
            </button>
          </div>
        </div>

        {/* ── Suggested Workout Generator Banner Card ── */}
        <div className="card p-3.5 bg-gradient-to-r from-bg-card via-bg-elevated/40 to-bg-card border border-accent/35 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-text-primary block font-sans">
                SUGGESTED WORKOUT GENERATOR
              </span>
              <span className="text-2xs text-text-muted font-sans">
                Choose body part &amp; intensity (Low / Med / High) to generate a fully editable routine
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSuggestedModalOpen(true)}
            className="btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Generate Plan</span>
          </button>
        </div>

        {plannedWorkouts.length === 0 ? (
          /* Item 15: Compact empty state instead of giant empty rectangle */
          <div className="card p-3.5 flex items-center justify-between border-dashed border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">No saved plans yet</p>
                <p className="text-2xs text-text-muted">Save your routines for 1-tap logging or generate one</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSuggestedModalOpen(true)}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Suggest</span>
              </button>
              <button
                onClick={openCreatePlan}
                className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <span>Create</span>
              </button>
            </div>
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
                      <p className="text-xs text-text-secondary mt-0.5">
                        {workout.exercises.length} exercises • {totalSets} sets
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
                                <span className="text-text-primary font-medium">
                                  {set.weight} {set.unit}
                                </span>{' '}
                                × {set.reps} reps
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => {
                            deleteWorkout(workout.id);
                            toast.info(`Deleted workout session from ${workout.date}.`, 'Workout Removed');
                          }}
                          className="text-danger hover:text-danger/80 text-xs flex items-center gap-1.5 px-2 py-1 rounded hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Workout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Log Workout Modal ────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeLogger}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-text-primary">Log Workout</h2>
                {startedFromPlan ? (
                  <p className="text-2xs text-accent font-mono mt-0.5 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    Started from plan: <span className="font-bold">{startedFromPlan}</span>
                  </p>
                ) : (
                  <p className="text-2xs text-text-muted font-mono mt-0.5">Record your session</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleVoiceLogging}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${
                    isListening
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse'
                      : 'bg-bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-accent/40'
                  }`}
                  title="Hands-free voice logging (e.g. 'Bench 70 for 8 8 7')"
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-accent" />}
                  <span>{isListening ? 'Listening...' : 'Voice'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCoachDrawerOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-bold hover:bg-accent/25 transition-all shadow-xs"
                  title="Ask In-Workout AI Coach"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Ask Coach</span>
                </button>
                <button onClick={closeLogger} className="text-text-secondary hover:text-text-primary p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Time Compressor Quick Bar */}
            <div className="px-4 py-2 bg-bg-secondary/40 border-b border-border/60 flex items-center justify-between text-2xs">
              <span className="text-text-muted font-medium flex items-center gap-1">
                <Clock className="w-3 h-3 text-accent" />
                Compress session:
              </span>
              <div className="flex items-center gap-1.5">
                {[30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleCompressWorkout(mins as 30 | 45 | 60)}
                    className="px-2 py-0.5 rounded bg-bg-elevated hover:bg-accent/20 border border-border text-text-secondary hover:text-accent font-mono transition-colors"
                    title={`Compress routine to ${mins} minutes keeping core compound lifts`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
              {/* Prominent In-Workout Rest Timer */}
              <div className="p-3.5 rounded-xl bg-bg-card border border-accent/25 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Timer className="w-4 h-4 text-accent" />
                    <span className="text-2xs font-bold text-accent uppercase tracking-wider font-mono">
                      Rest Interval
                    </span>
                  </div>
                  {isTimerFinished && (
                    <span className="text-2xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full animate-bounce">
                      SET READY!
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl sm:text-4xl font-black text-text-primary tracking-tight font-mono">
                      {isTimerFinished ? (
                        <span className="text-emerald-500">READY</span>
                      ) : (
                        formatTimer(restSecondsLeft > 0 ? restSecondsLeft : restTotalSeconds)
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={togglePauseTimer}
                      className="p-2.5 rounded-xl bg-accent text-white hover:brightness-105 active:scale-95 transition-all shadow-xs shadow-accent/25"
                      title={isRestRunning ? 'Pause' : 'Start'}
                    >
                      {isRestRunning ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustTimer(30)}
                      className="px-2.5 py-2 rounded-xl bg-bg-secondary text-text-primary border border-border text-xs font-semibold hover:border-accent/40 active:scale-95 transition-all"
                      title="+30 Seconds"
                    >
                      +30s
                    </button>
                    <button
                      type="button"
                      onClick={skipTimer}
                      className="px-2.5 py-2 rounded-xl bg-bg-secondary text-text-muted hover:text-text-primary border border-border text-xs font-medium active:scale-95 transition-all"
                      title="Skip Rest"
                    >
                      Skip
                    </button>
                  </div>
                </div>

                {/* Preset intervals */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[60, 90, 120, 180].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => startTimer(s)}
                      className={`py-1 rounded-lg text-2xs font-semibold border transition-all text-center ${
                        restTotalSeconds === s && restSecondsLeft > 0
                          ? 'bg-accent text-white border-accent shadow-xs'
                          : 'bg-bg-secondary border-border text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {s >= 60 ? `${s / 60}m` : `${s}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date picker */}
              <div>
                <label className="section-title mb-2 block">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary pl-10 focus:border-accent outline-none text-sm"
                  />
                  <Calendar className="w-4 h-4 text-text-secondary absolute left-3 top-3.5" />
                </div>
              </div>

              {/* Exercises */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="section-title mb-0">Exercises</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsExerciseLibraryOpen(true)}
                      className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-elevated border border-border transition-colors"
                      title="Browse full exercise database with muscle groups and personal PR history"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-accent" />
                      <span>Browse Library</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddExercise()}
                      className="text-accent text-xs font-semibold flex items-center gap-1 hover:brightness-110 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/30 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Exercise
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {exercises.map((exercise, i) => {
                    const lastPerf = getLastExercisePerformance(exercise.name, workouts);
                    const progRec = getProgressionRecommendation(exercise.name, workouts, userUnit);
                    const quickSubs = getQuickSubstitutes(exercise.name);

                    return (
                      <div key={i} className="border border-border rounded-xl p-3.5 bg-bg-elevated/40 relative">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-accent font-semibold">EXERCISE {i + 1}</span>
                          <div className="flex items-center gap-1.5">
                            {exercise.name.trim() && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setQuickSubstituteIndex(quickSubstituteIndex === i ? null : i)}
                                  className="flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                                  title="Quick substitute options"
                                >
                                  <ArrowRightLeft className="w-3 h-3" />
                                  <span>Replace</span>
                                </button>
                                {quickSubstituteIndex === i && (
                                  <div className="absolute right-0 top-7 z-30 w-72 bg-bg-card border border-accent/40 rounded-xl shadow-xl p-2.5 space-y-2 animate-in fade-in zoom-in-95">
                                    <div className="flex items-center justify-between pb-1 border-b border-border">
                                      <span className="text-3xs uppercase font-bold text-accent font-mono">
                                        Quick Direct Substitutes
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setQuickSubstituteIndex(null)}
                                        className="text-text-muted hover:text-text-primary p-0.5"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>

                                    {/* Equipment Filter Chips (Item 22) */}
                                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                                      {['all', 'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'].map((eq) => (
                                        <button
                                          key={eq}
                                          type="button"
                                          onClick={() => setQuickSubEquipmentFilter(eq)}
                                          className={`px-1.5 py-0.5 rounded text-3xs capitalize font-medium transition-colors ${
                                            quickSubEquipmentFilter === eq
                                              ? 'bg-accent text-white font-bold'
                                              : 'bg-bg-secondary text-text-muted hover:text-text-primary'
                                          }`}
                                        >
                                          {eq}
                                        </button>
                                      ))}
                                    </div>

                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                      {quickSubs
                                        .filter((sub) => quickSubEquipmentFilter === 'all' || sub.equipment.toLowerCase() === quickSubEquipmentFilter.toLowerCase())
                                        .map((sub, sIdx) => (
                                          <button
                                            key={sIdx}
                                            type="button"
                                            onClick={() => handleQuickSubstitute(i, sub)}
                                            className="w-full text-left p-1.5 rounded-lg hover:bg-accent/15 flex flex-col transition-colors"
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-semibold text-text-primary">{sub.name}</span>
                                              <span className="text-3xs uppercase font-mono text-accent">{sub.equipment}</span>
                                            </div>
                                            <span className="text-3xs text-text-muted">{sub.reason}</span>
                                          </button>
                                        ))}
                                      {quickSubs.filter((sub) => quickSubEquipmentFilter === 'all' || sub.equipment.toLowerCase() === quickSubEquipmentFilter.toLowerCase()).length === 0 && (
                                        <p className="text-3xs text-text-muted text-center py-2">No {quickSubEquipmentFilter} substitutes found.</p>
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickSubstituteIndex(null);
                                        setSubstitutionExerciseIndex(i);
                                      }}
                                      className="w-full text-left p-1.5 rounded-lg hover:bg-bg-secondary text-2xs text-accent font-semibold pt-1 border-t border-border flex items-center justify-between"
                                    >
                                      <span>Ask AI for deeper options...</span>
                                      <ArrowRightLeft className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            <button
                              onClick={() => handleRemoveExercise(i)}
                              className="text-text-muted hover:text-danger p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="Exercise Name (e.g. Bench Press)"
                          value={exercise.name}
                          onChange={e => handleExerciseNameChange(i, e.target.value)}
                          list="exercises-list"
                          className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary mb-2 text-sm focus:border-accent outline-none"
                        />

                        {/* Last Performance & Progression Coach Pill */}
                        {exercise.name.trim() && (lastPerf || progRec) && (
                          <div className="mb-3 p-2 rounded-lg bg-bg-secondary/60 border border-border/70 space-y-1 text-2xs">
                            {lastPerf && (
                              <div className="flex items-center justify-between text-text-secondary">
                                <span className="font-semibold text-accent">Last time:</span>
                                <span className="font-mono">{lastPerf.summary} <span className="text-text-muted">({lastPerf.date})</span></span>
                              </div>
                            )}
                            {progRec && (
                              <div className="space-y-1">
                                <div className="flex items-baseline justify-between text-emerald-500 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-3xs uppercase tracking-wider font-semibold">Target:</span>
                                    <span className="font-mono text-text-primary">{progRec.targetSummary}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRationaleIndex(expandedRationaleIndex === i ? null : i)}
                                    className="text-3xs text-accent underline hover:text-accent-hover font-semibold"
                                  >
                                    {expandedRationaleIndex === i ? 'Hide' : 'Why?'}
                                  </button>
                                </div>
                                {expandedRationaleIndex === i && (
                                  <p className="text-3xs text-text-secondary italic pt-0.5 bg-bg-card/40 p-1.5 rounded border border-border/40">
                                    {progRec.rationale}
                                  </p>
                                )}
                              </div>
                            )}
                            {progRec?.isPlateau && (
                              <div className="flex items-center gap-1 text-amber-500 font-medium text-3xs pt-0.5">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Plateau detected ({progRec.plateauSessionsCount} sessions flat). Deload or swap.</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          {exercise.sets.map((set, j) => (
                            <div key={j} className="flex gap-2 items-center">
                              <span className="text-text-muted text-xs w-7 font-mono">S{j + 1}</span>

                              {/* 1-Tap Autofill from Last Session */}
                              {lastPerf?.sets && lastPerf.sets[j] && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const prevS = lastPerf.sets[j];
                                    handleSetChange(i, j, 'weight', prevS.weight);
                                    handleSetChange(i, j, 'reps', prevS.reps);
                                  }}
                                  className="px-1.5 py-1 rounded text-3xs font-mono bg-bg-card hover:bg-accent/20 border border-border/80 text-text-muted hover:text-accent transition-colors shrink-0"
                                  title="Autofill previous weight and reps"
                                >
                                  Prev: {lastPerf.sets[j].weight}×{lastPerf.sets[j].reps}
                                </button>
                              )}

                              <input
                                type="number"
                                placeholder="Weight"
                                value={set.weight || ''}
                                onChange={e => handleSetChange(i, j, 'weight', Number(e.target.value))}
                                className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                              />
                              <select
                                value={set.unit}
                                onChange={e => handleSetChange(i, j, 'unit', e.target.value)}
                                className="bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                              >
                                <option value="kg">kg</option>
                                <option value="lbs">lbs</option>
                              </select>
                              <span className="text-text-muted text-xs">×</span>
                              <input
                                type="number"
                                placeholder="Reps"
                                value={set.reps || ''}
                                onChange={e => handleSetChange(i, j, 'reps', Number(e.target.value))}
                                className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                              />
                              <button
                                onClick={() => handleRemoveSet(i, j)}
                                className="text-text-muted hover:text-danger p-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => handleAddSet(i)}
                          className="btn-ghost text-xs mt-2.5 w-full flex items-center justify-center gap-1 py-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Set
                        </button>

                        {/* Tiny Exercise Notes Field (Item 11) */}
                        <div className="mt-2.5 pt-2 border-t border-border/50">
                          <input
                            type="text"
                            placeholder="Exercise note (e.g. 2 RIR, pause at bottom, seat pos 4)..."
                            value={exercise.notes || ''}
                            onChange={(e) => handleExerciseNotesChange(i, e.target.value)}
                            className="w-full bg-bg-secondary/40 border border-border/40 rounded-lg px-2.5 py-1 text-2xs text-text-secondary placeholder:text-text-muted/60 focus:border-accent outline-none font-sans"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex gap-3">
              <button onClick={closeLogger} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={handleSaveWorkout}
                disabled={exercises.length === 0 || !exercises.some(e => e.name.trim())}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                Save Workout
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
}
