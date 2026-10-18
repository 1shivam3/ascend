"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { getExerciseList, calculateOneRepMax, isMainCompoundLift, isBodyweightExercise, getEffectiveExerciseLoad, suggestLoad } from '@/lib/strength-standards';
import { generateTrainingDecision, calculateSetEffortDrift } from '@/lib/lifter-twin';
import TrainingDecisionCard from '@/components/TrainingDecisionCard';
import PolicyDecisionCard from '@/components/PolicyDecisionCard';
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
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
  Target,
  Copy,
  Search,
  MoreVertical,
  SlidersHorizontal,
  Info,
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
  getGoalAdaptiveSplitTemplates,
  isSetCompleted,
  finalizeWorkoutExercises,
  getExecutedExercises,
  createWorkoutExercisesFromPlan,
  getExercisePrescription,
} from '@/lib/workout-engine';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import ExerciseSubstitutionModal from '@/components/ExerciseSubstitutionModal';
import ExerciseLibraryModal from '@/components/ExerciseLibraryModal';
import WorkoutCoachDrawer from '@/components/WorkoutCoachDrawer';
import PostWorkoutTakeModal from '@/components/PostWorkoutTakeModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import { AISubstitutionResult, AthleteGoal, ATHLETE_GOAL_CONFIGS, DayOfWeek, SetExecutionStatus, DEFAULT_GOALS, resolvePrimaryGoal } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import ActiveWorkoutScreen from '@/components/ActiveWorkoutScreen';
import WorkoutDetailsView from '@/components/WorkoutDetailsView';
import ShareProgramModal from '@/components/ShareProgramModal';
import WeeklyScheduleModal from '@/components/WeeklyScheduleModal';
import LogPastWorkoutModal from '@/components/LogPastWorkoutModal';
import ExerciseSelectorModal from '@/components/ExerciseSelectorModal';
import PlanVsActualReview from '@/components/PlanVsActualReview';
import {
  DAYS_OF_WEEK,
  DAY_DISPLAY_INFO,
  getTodayDayOfWeek,
  getWorkoutBodyParts,
  getScheduledWorkoutForDay,
} from '@/lib/workout-schedule';
import { plural, safeRandomId, getLocalTodayStr, formatLocalDate } from '@/lib/formatters';
import { useAppNavigation } from '@/lib/navigation';

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
  defaultTargetReps?: number;
  onSave: (plan: Omit<PlannedWorkout, 'id' | 'createdAt'>) => void;
}

const emptyPlanExercise = (unit: 'kg' | 'lbs', targetReps = 8): PlannedExercise => ({
  name: '',
  targetSets: 3,
  targetReps,
  targetWeight: undefined,
  targetUnit: unit,
  notes: '',
});

export const BUILTIN_SPLIT_TEMPLATES: PlannedWorkout[] = getGoalAdaptiveSplitTemplates('build_muscle', 'kg');

function PlanModal({
  isOpen,
  onClose,
  initial,
  availableExercises,
  userUnit,
  defaultTargetReps = 8,
  onSave,
}: PlanModalProps) {
  const [planName, setPlanName] = useState('');
  const [planExercises, setPlanExercises] = useState<PlannedExercise[]>([emptyPlanExercise(userUnit, defaultTargetReps)]);

  // Sync state when opening or switching between create/edit
  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setPlanName(initial.name);
        setPlanExercises(initial.exercises.length > 0 ? initial.exercises : [emptyPlanExercise(userUnit, defaultTargetReps)]);
      } else {
        setPlanName('');
        setPlanExercises([emptyPlanExercise(userUnit, defaultTargetReps)]);
      }
    }
  }, [isOpen, initial, userUnit, defaultTargetReps]);

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [targetExerciseIndex, setTargetExerciseIndex] = useState<number | null>(null);
  const toast = useToast();

  const updateExercise = useCallback((idx: number, field: keyof PlannedExercise, value: unknown) => {
    setPlanExercises(prev => prev.map((ex, i) => i === idx ? { ...ex, [field]: value } : ex));
  }, []);

  const addExercise = () => setPlanExercises(prev => [...prev, emptyPlanExercise(userUnit, defaultTargetReps)]);
  const removeExercise = (idx: number) => setPlanExercises(prev => prev.filter((_, i) => i !== idx));

  const handleSelectFromLibrary = (selected: { name: string; isBodyweight: boolean; defaultWeightKg?: number; defaultReps?: number }) => {
    if (targetExerciseIndex !== null) {
      updateExercise(targetExerciseIndex, 'name', selected.name);
      if (selected.defaultReps) updateExercise(targetExerciseIndex, 'targetReps', selected.defaultReps);
      if (selected.isBodyweight) {
        updateExercise(targetExerciseIndex, 'targetWeight', 0);
      } else if (selected.defaultWeightKg) {
        updateExercise(targetExerciseIndex, 'targetWeight', userUnit === 'lbs' ? Math.round(selected.defaultWeightKg * 2.20462) : selected.defaultWeightKg);
      }
    } else {
      const isBW = selected.isBodyweight || isBodyweightExercise(selected.name);
      const w = isBW ? 0 : (selected.defaultWeightKg ? (userUnit === 'lbs' ? Math.round(selected.defaultWeightKg * 2.20462) : selected.defaultWeightKg) : (userUnit === 'lbs' ? 115 : 50));
      setPlanExercises(prev => [
        ...prev,
        {
          name: selected.name,
          targetSets: 3,
          targetReps: selected.defaultReps || defaultTargetReps,
          targetWeight: w,
          targetUnit: userUnit,
          notes: '',
        }
      ]);
    }
    setIsSelectorOpen(false);
    setTargetExerciseIndex(null);
  };

  const handleSave = () => {
    const trimmedName = planName.trim();
    if (!trimmedName) {
      toast.error('Please give the plan a name.', 'Missing Name');
      return;
    }
    const validExercises = planExercises.filter(e => e.name.trim());
    if (validExercises.length === 0) {
      toast.error('Add at least one exercise to the plan.', 'No Exercises');
      return;
    }
    for (const ex of validExercises) {
      const sets = Number(ex.targetSets);
      if (!Number.isFinite(sets) || sets < 1) {
        toast.error(`"${ex.name.trim()}": sets must be at least 1.`, 'Invalid Sets');
        return;
      }
      const reps = Number(ex.targetReps);
      if (!Number.isFinite(reps) || reps < 1) {
        toast.error(`"${ex.name.trim()}": reps must be at least 1.`, 'Invalid Reps');
        return;
      }
      const weight = Number(ex.targetWeight);
      if (!Number.isFinite(weight) || weight < 0) {
        toast.error(`"${ex.name.trim()}": weight cannot be negative.`, 'Invalid Weight');
        return;
      }
    }
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
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary p-1">
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetExerciseIndex(null);
                    setIsSelectorOpen(true);
                  }}
                  className="text-text-muted hover:text-accent text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Dumbbell className="w-3.5 h-3.5" />
                  <span>Browse Library</span>
                </button>
                <button
                  type="button"
                  onClick={addExercise}
                  className="text-accent text-xs font-semibold flex items-center gap-1 hover:brightness-110"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Exercise
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {planExercises.map((ex, i) => (
                <div key={i} className="border border-border rounded-xl p-3.5 bg-bg-elevated/40">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-mono text-accent font-semibold">EXERCISE {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeExercise(i)}
                      disabled={planExercises.length === 1}
                      className="text-text-muted hover:text-danger p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Name */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-3xs text-text-muted font-mono">NAME</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetExerciseIndex(i);
                        setIsSelectorOpen(true);
                      }}
                      className="text-3xs text-accent hover:underline font-mono"
                    >
                      Pick from library
                    </button>
                  </div>
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
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className="btn-primary flex-1 disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            {initial ? 'Save Changes' : 'Save Plan'}
          </button>
        </div>
      </div>

      <ExerciseSelectorModal
        isOpen={isSelectorOpen}
        onClose={() => {
          setIsSelectorOpen(false);
          setTargetExerciseIndex(null);
        }}
        onSelectExercise={handleSelectFromLibrary}
      />
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
  onDuplicate: () => void;
}

function PlanCard({ plan, onStart, onEdit, onDelete, onShare, onDuplicate }: PlanCardProps) {
  const MAX_VISIBLE = 3;
  const visibleExercises = plan.exercises.slice(0, MAX_VISIBLE);
  const remainder = plan.exercises.length - MAX_VISIBLE;

  return (
    <div className="card flex flex-col gap-3">
      {/* Card top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-text-primary line-clamp-2 leading-tight">{plan.name}</h3>
          <p className="text-2xs text-text-muted font-mono mt-0.5">
            {plan.exercises.length} exercise{plan.exercises.length !== 1 ? 's' : ''}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate plan"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onShare}
            title="Share plan via WhatsApp or QR"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Edit plan"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
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
        type="button"
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
  const goals = useStore((state) => state.goals && state.goals.length > 0 ? state.goals : DEFAULT_GOALS);
  const trainingDecisions = useStore((state) => state.trainingDecisions);
  const policyDecisionRecords = useStore((state) => state.policyDecisionRecords);
  const userMode = useStore((state) => state.userMode) || 'beginner';
  const toggleUserMode = useStore((state) => state.toggleUserMode);
  const weeklySchedule = useStore((state) => state.weeklySchedule);
  const setWeeklySchedule = useStore((state) => state.setWeeklySchedule);
  const trainingProfile = useStore((state) => state.trainingProfile);
  const toast = useToast();
  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();

  const userUnit = profile?.unit || 'kg';
  const availableExercises = getExerciseList();

  const todayStr = useMemo(() => getLocalTodayStr(), []);
  const todayDayOfWeek = useMemo(() => getTodayDayOfWeek(todayStr), [todayStr]);
  const todaySessionInfo = useMemo(() => {
    const raw = getTodaySessionState(
      todayStr,
      workouts,
      plannedWorkouts,
      activeWorkoutDraft,
      userUnit,
      weeklySchedule
    );
    return raw;
  }, [todayStr, workouts, plannedWorkouts, activeWorkoutDraft, userUnit, weeklySchedule]);

  // Dynamic synergy / goals label
  const goalSynergyLabel = useMemo(() => {
    const activeGoals = goals && goals.length > 0 ? goals : DEFAULT_GOALS;
    if (activeGoals.length === 0) return 'Set Goals';
    const isPowerbuilding = activeGoals.includes('get_stronger') && activeGoals.includes('build_muscle');
    const isRecomp = activeGoals.includes('lose_fat') && activeGoals.includes('build_muscle');
    const isAthletic = activeGoals.includes('stamina') && activeGoals.includes('get_stronger');

    if (isPowerbuilding) return 'Powerbuilding';
    if (isRecomp) return 'Recomp';
    if (isAthletic) return 'Hybrid';
    if (activeGoals.length === 1) return ATHLETE_GOAL_CONFIGS[activeGoals[0]]?.label || 'Goal Set';
    return activeGoals.map((g) => ATHLETE_GOAL_CONFIGS[g]?.label || g).join(' + ');
  }, [goals]);

  // Athlete goal personalization — single source of truth via resolvePrimaryGoal
  const primaryGoal: AthleteGoal = resolvePrimaryGoal(
    profile?.goals && profile.goals.length > 0 ? profile.goals : goals
  );
  const goalConfig = ATHLETE_GOAL_CONFIGS[primaryGoal] || ATHLETE_GOAL_CONFIGS.build_muscle;

  const defaultTargetReps = useMemo(() => {
    const { min, max } = goalConfig.defaultRepRange;
    return Math.round((min + max) / 2);
  }, [goalConfig.defaultRepRange]);

  const adaptiveSplitTemplates = useMemo(() => {
    return getGoalAdaptiveSplitTemplates(primaryGoal, userUnit, {
      bodyweightKg: profile?.bodyweightKg,
      experience: userMode,
    });
  }, [primaryGoal, userUnit, profile?.bodyweightKg, userMode]);

  // Goal-adaptive default rest period
  const defaultRestSeconds = useMemo(() => {
    return goalConfig.defaultRestSeconds;
  }, [goalConfig.defaultRestSeconds]);

  // ── Workout Logger Form State ──────────────────────────────────────────────
  const [date, setDate] = useState(getLocalTodayStr());
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);

  // ── Training Decision Ledger (Auditable prescription) ──────────────────────
  const targetExerciseForDecision = useMemo(() => {
    if (exercises.length > 0) {
      const compound = exercises.find((e) => isMainCompoundLift(e.name));
      if (compound && compound.name.trim()) return compound.name;
      const firstValid = exercises.find((e) => e.name && e.name.trim());
      if (firstValid) return firstValid.name;
    }
    if (activeWorkoutDraft && activeWorkoutDraft.exercises && activeWorkoutDraft.exercises.length > 0) {
      const compound = activeWorkoutDraft.exercises.find((e) => isMainCompoundLift(e.name));
      if (compound && compound.name.trim()) return compound.name;
      const firstValid = activeWorkoutDraft.exercises.find((e) => e.name && e.name.trim());
      if (firstValid) return firstValid.name;
    }
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
  }, [exercises, activeWorkoutDraft, plannedWorkouts, workouts]);

  const activeTrainingDecision = useMemo(() => {
    if (!targetExerciseForDecision || workouts.length === 0) return null;
    const cleanTarget = targetExerciseForDecision.trim().toLowerCase();
    const storedKey = Object.keys(trainingDecisions || {}).find(
      (k) => k.trim().toLowerCase() === cleanTarget
    );
    if (storedKey && trainingDecisions[storedKey]) {
      return trainingDecisions[storedKey];
    }
    return generateTrainingDecision(targetExerciseForDecision, workouts, userUnit, 8.0, goals);
  }, [targetExerciseForDecision, workouts, userUnit, goals, trainingDecisions]);

  const activePolicyDecision = useMemo(() => {
    if (!targetExerciseForDecision) return null;
    const cleanTarget = targetExerciseForDecision.trim().toLowerCase();
    const stored = Object.values(policyDecisionRecords || {}).find(
      (d) =>
        d.exerciseName.trim().toLowerCase() === cleanTarget ||
        d.canonicalExerciseKey === cleanTarget
    );
    return stored || null;
  }, [targetExerciseForDecision, policyDecisionRecords]);

  const [isChangeWorkoutOpen, setIsChangeWorkoutOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogPastModalOpen, setIsLogPastModalOpen] = useState(false);
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** When the logger is pre-filled from a plan, store its name here */
  const [startedFromPlan, setStartedFromPlan] = useState<string | null>(null);
  const [startedFromPlanId, setStartedFromPlanId] = useState<string | null>(null);
  const [sharingPlan, setSharingPlan] = useState<PlannedWorkout | null>(null);

  // ── Rest Timer State ───────────────────────────────────────────────────────
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(defaultRestSeconds);
  const [isRestRunning, setIsRestRunning] = useState<boolean>(false);
  const [isTimerFinished, setIsTimerFinished] = useState<boolean>(false);

  useEffect(() => {
    setRestTotalSeconds(defaultRestSeconds);
  }, [defaultRestSeconds]);

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
    durationSeconds?: number;
    exercises: WorkoutExercise[];
  } | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  // ── Plan modal state ───────────────────────────────────────────────────────
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlannedWorkout | null>(null);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [targetScheduleDay, setTargetScheduleDay] = useState<DayOfWeek | undefined>(undefined);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [trainSubTab, setTrainSubTab] = useState<'workouts' | 'plans' | 'history'>('workouts');
  const [selectedDetailsPlan, setSelectedDetailsPlan] = useState<PlannedWorkout | null>(null);

  // ── Progressive Disclosure UI States ──────────────────────────────────────
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isScheduleExpanded, setIsScheduleExpanded] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isDecisionExpanded, setIsDecisionExpanded] = useState(false);

  // Sub-tab Back Handler: returning to workouts hub
  useEffect(() => {
    if (selectedDetailsPlan) {
      return registerBackHandler(() => {
        setSelectedDetailsPlan(null);
        return true;
      }, 50);
    }
    if (trainSubTab !== 'workouts') {
      return registerBackHandler(() => {
        setTrainSubTab('workouts');
        return true;
      }, 40);
    }
  }, [selectedDetailsPlan, trainSubTab, registerBackHandler]);

  // ── Register Modal Back Handlers (Interconnected Navigation) ──────────────
  useEffect(() => {
    if (isToolsMenuOpen) {
      return registerBackHandler(() => { setIsToolsMenuOpen(false); return true; }, 100);
    }
  }, [isToolsMenuOpen, registerBackHandler]);

  useEffect(() => {
    if (isChangeWorkoutOpen) {
      return registerBackHandler(() => { setIsChangeWorkoutOpen(false); return true; }, 100);
    }
  }, [isChangeWorkoutOpen, registerBackHandler]);

  useEffect(() => {
    if (isPlateModalOpen) {
      return registerBackHandler(() => { setIsPlateModalOpen(false); return true; }, 100);
    }
  }, [isPlateModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isExerciseLibraryOpen) {
      return registerBackHandler(() => { setIsExerciseLibraryOpen(false); return true; }, 100);
    }
  }, [isExerciseLibraryOpen, registerBackHandler]);

  useEffect(() => {
    if (isPlanModalOpen) {
      return registerBackHandler(() => { setIsPlanModalOpen(false); setEditingPlan(null); return true; }, 100);
    }
  }, [isPlanModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isSuggestedModalOpen) {
      return registerBackHandler(() => { setIsSuggestedModalOpen(false); return true; }, 100);
    }
  }, [isSuggestedModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isScheduleModalOpen) {
      return registerBackHandler(() => { setIsScheduleModalOpen(false); return true; }, 100);
    }
  }, [isScheduleModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isLogPastModalOpen) {
      return registerBackHandler(() => { setIsLogPastModalOpen(false); return true; }, 100);
    }
  }, [isLogPastModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isGoalSelectorOpen) {
      return registerBackHandler(() => { setIsGoalSelectorOpen(false); return true; }, 100);
    }
  }, [isGoalSelectorOpen, registerBackHandler]);

  useEffect(() => {
    if (postWorkoutSummary) {
      return registerBackHandler(() => { setPostWorkoutSummary(null); return true; }, 100);
    }
  }, [postWorkoutSummary, registerBackHandler]);

  useEffect(() => {
    if (sharingPlan) {
      return registerBackHandler(() => { setSharingPlan(null); return true; }, 100);
    }
  }, [sharingPlan, registerBackHandler]);

  useEffect(() => {
    if (isModalOpen) {
      return registerBackHandler(() => {
        setIsModalOpen(false);
        return true;
      }, 100);
    }
  }, [isModalOpen, registerBackHandler]);

  useEffect(() => {
    if (expandedWorkouts.size > 0) {
      return registerBackHandler(() => {
        setExpandedWorkouts(new Set());
        return true;
      }, 80);
    }
  }, [expandedWorkouts, registerBackHandler]);

  useEffect(() => {
    if (isCoachDrawerOpen) {
      return registerBackHandler(() => {
        setIsCoachDrawerOpen(false);
        return true;
      }, 100);
    }
  }, [isCoachDrawerOpen, registerBackHandler]);

  useEffect(() => {
    if (confirmDeleteId) {
      return registerBackHandler(() => {
        setConfirmDeleteId(null);
        return true;
      }, 100);
    }
  }, [confirmDeleteId, registerBackHandler]);

  // ── Auto-save Draft to Local Storage ──────────────────────────────────────
  useEffect(() => {
    if (isModalOpen && exercises.some((e) => e.name.trim() || e.sets.some((s) => (typeof s.weight === 'number' && s.weight > 0) || s.reps > 0))) {
      saveWorkoutDraft({
        date,
        name: startedFromPlan || undefined,
        planId: startedFromPlanId || undefined,
        exercises,
        startedFromPlan,
        startedFromPlanId,
        sessionStartTime,
        savedAt: new Date().toISOString(),
      });
    }
  }, [isModalOpen, exercises, date, startedFromPlan, startedFromPlanId, sessionStartTime, saveWorkoutDraft]);

  const handleResumeWorkout = () => {
    if (!activeWorkoutDraft) return;
    setDate(activeWorkoutDraft.date);
    setExercises(activeWorkoutDraft.exercises);
    setStartedFromPlan(activeWorkoutDraft.startedFromPlan || null);
    setStartedFromPlanId(activeWorkoutDraft.startedFromPlanId || activeWorkoutDraft.planId || null);
    setSessionStartTime(activeWorkoutDraft.sessionStartTime || Date.now());
    setIsModalOpen(true);
    toast.success('Resumed active workout session!', 'Workout Restored');
  };

  const handleDiscardDraft = () => {
    clearWorkoutDraft();
    setStartedFromPlan(null);
    setStartedFromPlanId(null);
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
        completed: false,
        status: 'pending' as const,
        rpe: s.rpe || 8,
        prescribedWeight: s.weight,
        prescribedReps: s.reps,
        prescribedRpe: s.rpe || 8,
        prescribedUnit: s.unit || userUnit,
      })),
    }));
    setExercises(clonedExercises);
    setDate(getLocalTodayStr());
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
          const isBW = isBodyweightExercise(replacement.replacementExercise);
          const repWeight = typeof replacement.targetWeightKg === 'number' && Number.isFinite(replacement.targetWeightKg)
            ? replacement.targetWeightKg
            : (typeof ex.sets[0]?.weight === 'number' && Number.isFinite(ex.sets[0].weight)
                ? ex.sets[0].weight
                : (isBW ? 0 : undefined));

          return {
            name: replacement.replacementExercise,
            sets: Array.from({ length: replacement.targetSets || ex.sets.length || 3 }).map(() => ({
              weight: repWeight,
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
    const defaultW = userUnit === 'kg' ? 60 : 135;
    setExercises(prev => [
      ...prev,
      {
        name: finalName,
        sets: [
          {
            reps: 8,
            weight: defaultW,
            unit: userUnit,
            completed: false,
            status: 'pending' as const,
            rpe: 8,
            prescribedWeight: defaultW,
            prescribedReps: 8,
            prescribedRpe: 8,
            prescribedUnit: userUnit,
          },
        ],
      },
    ]);
  };

  const handleSelectFromLibrary = (exerciseName: string) => {
    if (!isModalOpen) {
      setStartedFromPlan(null);
      setSessionStartTime(Date.now());
      setExercises([
        {
          name: exerciseName,
          sets: [
            {
              reps: 8,
              weight: 0,
              unit: userUnit,
              completed: false,
              status: 'pending' as const,
              rpe: 8,
              prescribedReps: 8,
              prescribedRpe: 8,
              prescribedUnit: userUnit,
            },
          ],
        },
      ]);
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
      const isBW = isBodyweightExercise(updated[exerciseIndex].name);
      const prevW = prevSet ? prevSet.weight : (isBW ? 0 : undefined);
      const prevR = prevSet?.reps ?? 8;
      const prevU = prevSet?.unit ?? userUnit;
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: [
          ...updated[exerciseIndex].sets,
          {
            reps: prevR,
            weight: prevW,
            unit: prevU,
            completed: false,
            status: 'pending' as const,
            rpe: prevSet?.rpe ?? 8,
            prescribedWeight: prevSet?.prescribedWeight,
            prescribedReps: prevSet?.prescribedReps,
            prescribedRpe: prevSet?.prescribedRpe,
            prescribedUnit: prevSet?.prescribedUnit,
            appliedDecisionId: prevSet?.appliedDecisionId,
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
    setStartedFromPlanId(null);
    setSessionStartTime(Date.now());
    if (exercises.length === 0 || exercises.every(e => !e.name.trim())) {
      const defaultW = userUnit === 'kg' ? 60 : 135;
      setExercises([
        {
          name: 'Bench Press',
          sets: [
            {
              reps: 8,
              weight: defaultW,
              unit: userUnit,
              completed: false,
              status: 'pending' as const,
              rpe: 8,
              prescribedWeight: defaultW,
              prescribedReps: 8,
              prescribedRpe: 8,
              prescribedUnit: userUnit,
            },
          ],
        },
      ]);
    }
    setIsModalOpen(true);
  };

  // ─── Start plan → pre-fill logger ────────────────────────────────────────

  const handleStartPlan = (plan: PlannedWorkout) => {
    setSessionStartTime(Date.now());
    const userPrs = useStore.getState().prs;
    const applications = useStore.getState().policyDecisionApplications || [];
    const preFilledExercises = createWorkoutExercisesFromPlan(plan, {
      userUnit,
      userPrs,
      applications,
    });
    setExercises(preFilledExercises);
    setDate(getLocalTodayStr());
    setStartedFromPlan(plan.name);
    setStartedFromPlanId(plan.id);
    try {
      const setDaySchedule = useStore.getState().setDaySchedule;
      if (setDaySchedule) {
        setDaySchedule(todayDayOfWeek, {
          workoutPlanId: plan.id,
          customTitle: plan.name,
          bodyParts: getWorkoutBodyParts(plan.exercises),
        });
      }
    } catch {}
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
    const { validExercises, hasCompletedSets, hasMeaningfulData } = finalizeWorkoutExercises(exercises);

    if (!hasMeaningfulData) {
      toast.error('No exercises or planned sets recorded to save.', 'Empty Workout');
      return;
    }

    const workoutId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `w_${Date.now()}`;

    // Record only what was actually performed or explicitly skipped.
    // Never fall back to the full plan: an interrupted session with zero
    // completed sets is saved with zero sets, not phantom planned ones.
    const exercisesToSave = getExecutedExercises(validExercises);

    const sessionDurationSeconds = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
    const durationMin = Math.round(sessionDurationSeconds / 60);

    const newWorkout: WorkoutEntry = {
      id: workoutId,
      date,
      name: startedFromPlan || undefined,
      planId: startedFromPlanId || undefined,
      durationMinutes: durationMin,
      durationSeconds: sessionDurationSeconds,
      exercises: exercisesToSave,
    };
    addWorkout(newWorkout);

    // Auto-PR Detection (only evaluates completed sets)
    let newPRCount = 0;
    if (hasCompletedSets) {
      const userBW = profile?.bodyweightKg || 75;
      for (const ex of exercisesToSave) {
        const exName = ex.name.trim();
        const isBW = isBodyweightExercise(exName);
        const existingPRs = prs.filter(p => p.exercise.toLowerCase() === exName.toLowerCase());
        const currentBest1RMKg = existingPRs.length > 0 ? Math.max(...existingPRs.map(p => p.oneRepMax)) : 0;

        let topSet = { weightKg: 0, weightLbs: 0, reps: 0, e1RMKg: 0, rawWeight: 0, unit: userUnit as 'kg' | 'lbs' };

        for (const s of ex.sets) {
          if (s.isWarmup || !isSetCompleted(s)) continue;
          const wNum = typeof s.weight === 'number' && !isNaN(s.weight) ? s.weight : 0;
          const rNum = s.reps;
          if (rNum > 0 && (wNum > 0 || isBW)) {
            const wKg = s.unit === 'lbs' ? wNum * 0.453592 : wNum;
            const wLbs = s.unit === 'lbs' ? wNum : wNum * 2.20462;
            const effectiveLoadKg = getEffectiveExerciseLoad(exName, wKg, userBW);
            const e1RM = calculateOneRepMax(effectiveLoadKg, rNum);
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
    }

    if (newPRCount > 0) {
      toast.success(
        `${newPRCount} New Personal Record${newPRCount > 1 ? 's' : ''} detected & synced to your PRs!`,
        'New PR Milestone'
      );
    } else if (hasCompletedSets) {
      toast.success(
        `Logged workout with ${exercisesToSave.length} exercise${exercisesToSave.length > 1 ? 's' : ''}!`,
        'Workout Saved'
      );
    } else {
      toast.info(
        `Saved interrupted workout with ${exercisesToSave.length} exercise${exercisesToSave.length > 1 ? 's' : ''} (0 completed sets).`,
        'Interrupted Session Saved'
      );
    }

    setPostWorkoutSummary({
      name: startedFromPlan || 'Workout Session',
      durationMinutes: durationMin,
      durationSeconds: sessionDurationSeconds,
      exercises: exercisesToSave,
    });

    clearWorkoutDraft();
    setIsModalOpen(false);
    setStartedFromPlan(null);
    setStartedFromPlanId(null);
    setDate(getLocalTodayStr());
    setExercises([]);
  };

  // ─── Plan CRUD handlers ───────────────────────────────────────────────────

  const handleSavePlan = (planData: Omit<PlannedWorkout, 'id' | 'createdAt'>) => {
    if (editingPlan) {
      const clash = plannedWorkouts.some(
        (p) => p.id !== editingPlan.id && p.name.toLowerCase() === planData.name.toLowerCase()
      );
      if (clash) {
        toast.error(`A different plan is already named "${planData.name}". Please choose another name.`, 'Duplicate Name');
        return;
      }
      updatePlannedWorkout(editingPlan.id, {
        ...editingPlan,
        name: planData.name,
        exercises: planData.exercises,
      });
      toast.success(`Plan "${planData.name}" updated.`, 'Plan Saved');
    } else {
      const newPlan: PlannedWorkout = {
        id: safeRandomId('plan'),
        createdAt: new Date().toISOString(),
        name: planData.name,
        exercises: planData.exercises,
      };
      // The store auto-renames on collision ("X (Copy)") instead of overwriting.
      const nameTaken = plannedWorkouts.some(
        (p) => p.name.toLowerCase() === planData.name.toLowerCase()
      );
      addPlannedWorkout(newPlan);
      toast.success(
        nameTaken
          ? `A plan named "${planData.name}" already exists — saved as "${planData.name} (Copy)".`
          : `Plan "${planData.name}" created!`,
        'Plan Created'
      );
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

  const handleDuplicatePlan = (plan: PlannedWorkout) => {
    const duplicatedPlan: PlannedWorkout = {
      id: safeRandomId('plan'),
      createdAt: new Date().toISOString(),
      name: `${plan.name} (Copy)`,
      exercises: plan.exercises.map(e => ({ ...e })),
    };
    addPlannedWorkout(duplicatedPlan);
    toast.success(`Duplicated "${plan.name}"`, 'Plan Duplicated');
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    setIsPlanModalOpen(true);
  };

  // ─── Suggested Workout Handlers ───────────────────────────────────────────

  const handleStartSuggestedWorkout = (workoutName: string, suggestedExercises: PlannedExercise[]) => {
    setSessionStartTime(Date.now());
    const userPrs = useStore.getState().prs;
    const applications = useStore.getState().policyDecisionApplications || [];
    const suggestedPlan: PlannedWorkout = {
      id: `suggested_${Date.now()}`,
      name: workoutName,
      createdAt: getLocalTodayStr(),
      exercises: suggestedExercises,
    };
    const preFilled = createWorkoutExercisesFromPlan(suggestedPlan, {
      userUnit,
      userPrs,
      applications,
    });
    setExercises(preFilled);
    setDate(getLocalTodayStr());
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

  const filteredWorkouts = useMemo(() => {
    if (!historyFilter.trim()) return sortedWorkouts;
    const q = historyFilter.toLowerCase().trim();
    return sortedWorkouts.filter((w) =>
      w.exercises.some((e) => e.name.toLowerCase().includes(q))
    );
  }, [sortedWorkouts, historyFilter]);

  // ─── Screen 4 Figma Blueprint State & Helpers ─────────────────────────────
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);

  const splitLabel = useMemo(() => {
    const scheduledDaysCount = weeklySchedule
      ? Object.values(weeklySchedule).filter((d) => d && d.workoutPlanId !== 'rest').length
      : 0;
    const days = scheduledDaysCount > 0 ? scheduledDaysCount : (trainingProfile?.daysPerWeek || 4);
    const splitType = trainingProfile?.preferredSplit === 'push_pull_legs' ? 'PUSH / PULL / LEGS' : trainingProfile?.preferredSplit === 'bro_split' ? 'BRO SPLIT' : 'UPPER / LOWER';
    return `${days}-DAY ${splitType}`;
  }, [weeklySchedule, trainingProfile]);

  const currentWeekDateRange = useMemo(() => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short' });
    return startMonth === endMonth
      ? `${startMonth} ${startOfWeek.getDate()}–${endOfWeek.getDate()}`
      : `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}`;
  }, []);

  const weeklyScheduleStats = useMemo(() => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const weekWorkouts = workouts.filter((w) => new Date(w.date) >= startOfWeek);
    const trainedDates = new Set(weekWorkouts.map((w) => w.date.split('T')[0]));

    const scheduledDaysCount = weeklySchedule
      ? Object.values(weeklySchedule).filter((d) => d && d.workoutPlanId !== 'rest').length
      : 0;
    const targetDays = scheduledDaysCount > 0 ? scheduledDaysCount : (trainingProfile?.daysPerWeek || 4);

    const daysLabels: { day: DayOfWeek; short: string }[] = [
      { day: 'monday', short: 'MON' },
      { day: 'tuesday', short: 'TUE' },
      { day: 'wednesday', short: 'WED' },
      { day: 'thursday', short: 'THU' },
      { day: 'friday', short: 'FRI' },
      { day: 'saturday', short: 'SAT' },
      { day: 'sunday', short: 'SUN' },
    ];

    const days = daysLabels.map(({ day, short }, idx) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + idx);
      const dStr = getLocalTodayStr(d);
      const isCompleted = trainedDates.has(dStr);
      const isToday = day === todayDayOfWeek;
      const sched = getScheduledWorkoutForDay(weeklySchedule, day, plannedWorkouts);
      return {
        day,
        short,
        dStr,
        isCompleted,
        isToday,
        isRest: sched.isRest,
      };
    });

    return {
      completedCount: trainedDates.size,
      targetDays,
      days,
    };
  }, [workouts, weeklySchedule, trainingProfile?.daysPerWeek, todayDayOfWeek, plannedWorkouts]);

  const activeRoutinePlan = useMemo(() => {
    if (selectedRoutineId) {
      const found = plannedWorkouts.find((p) => p.id === selectedRoutineId) || adaptiveSplitTemplates.find((p) => p.id === selectedRoutineId);
      if (found) return found;
    }
    if (todaySessionInfo.plannedWorkoutId) {
      const found = plannedWorkouts.find((p) => p.id === todaySessionInfo.plannedWorkoutId);
      if (found) return found;
    }
    return plannedWorkouts[0] || adaptiveSplitTemplates[0];
  }, [selectedRoutineId, todaySessionInfo.plannedWorkoutId, plannedWorkouts, adaptiveSplitTemplates]);

  const activeRoutineExercisesWithTargets = useMemo(() => {
    if (!activeRoutinePlan?.exercises) return [];
    return activeRoutinePlan.exercises.map((ex) => {
      const presc = getExercisePrescription(
        ex.name,
        workouts,
        prs,
        userUnit,
        primaryGoal,
        trainingDecisions
      );
      return {
        name: ex.name,
        targetWeight: presc.targetWeight || (userUnit === 'lbs' ? 135 : 60),
        targetReps: presc.targetReps || ex.targetReps || 8,
        setsCount: ex.targetSets || 3,
      };
    });
  }, [activeRoutinePlan, workouts, prs, userUnit, primaryGoal, trainingDecisions]);

  const formatRelativeWorkoutTime = (dateStr: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const past = new Date(dateStr);
      past.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
      return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const availableRoutines: PlannedWorkout[] = useMemo(() => {
    const result: PlannedWorkout[] = [];
    const seenNames = new Set<string>();

    for (const p of plannedWorkouts) {
      const clean = p.name.trim();
      if (!seenNames.has(clean.toLowerCase())) {
        seenNames.add(clean.toLowerCase());
        result.push(p);
      }
    }

    const templateTitles = [
      'Upper Body Strength',
      'Lower Body Strength',
      'Full Body',
      'Push Pull Legs',
      'Mobility & Recovery',
    ];

    adaptiveSplitTemplates.forEach((template, idx) => {
      const friendlyName = templateTitles[idx] || template.name.replace(/^Builtin\s+/i, '');
      if (!seenNames.has(friendlyName.toLowerCase())) {
        seenNames.add(friendlyName.toLowerCase());
        result.push({
          ...template,
          name: friendlyName,
        });
      }
    });

    if (result.length < 5) {
      const fallbackTemplates: PlannedWorkout[] = [
        {
          id: 'ref_upper_body',
          name: 'Upper Body Strength',
          createdAt: '2026-01-01',
          description: 'Build strength and muscle with compound movements and focused accessory work.',
          goalTag: 'Upper Body',
          exercises: [
            { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: userUnit === 'lbs' ? 185 : 85, targetUnit: userUnit },
            { name: 'Bent Over Row', targetSets: 4, targetReps: 8, targetWeight: userUnit === 'lbs' ? 155 : 70, targetUnit: userUnit },
            { name: 'Shoulder Press', targetSets: 3, targetReps: 10, targetWeight: userUnit === 'lbs' ? 95 : 42.5, targetUnit: userUnit },
            { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: userUnit === 'lbs' ? 135 : 60, targetUnit: userUnit },
            { name: 'Incline Dumbbell Press', targetSets: 3, targetReps: 10, targetWeight: userUnit === 'lbs' ? 50 : 22, targetUnit: userUnit },
            { name: 'Dumbbell Curl', targetSets: 3, targetReps: 12, targetWeight: userUnit === 'lbs' ? 30 : 14, targetUnit: userUnit },
          ],
        },
        {
          id: 'ref_lower_body',
          name: 'Lower Body Strength',
          createdAt: '2026-01-01',
          description: 'Maximize quad, hamstring, and glute development with heavy foundational compound lifts.',
          goalTag: 'Lower Body',
          exercises: [
            { name: 'Squat', targetSets: 4, targetReps: 6, targetWeight: userUnit === 'lbs' ? 225 : 100, targetUnit: userUnit },
            { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 185 : 85, targetUnit: userUnit },
            { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: userUnit === 'lbs' ? 360 : 160, targetUnit: userUnit },
            { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 40 : 18, targetUnit: userUnit },
            { name: 'Hamstring Curl', targetSets: 3, targetReps: 12, targetWeight: userUnit === 'lbs' ? 110 : 50, targetUnit: userUnit },
            { name: 'Calf Raise', targetSets: 4, targetReps: 15, targetWeight: userUnit === 'lbs' ? 135 : 60, targetUnit: userUnit },
          ],
        },
        {
          id: 'ref_full_body',
          name: 'Full Body',
          createdAt: '2026-01-01',
          description: 'High-efficiency total body stimulus balancing anterior and posterior athletic movement patterns.',
          goalTag: 'Full Body',
          exercises: [
            { name: 'Squat', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 185 : 85, targetUnit: userUnit },
            { name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 165 : 75, targetUnit: userUnit },
            { name: 'Deadlift', targetSets: 3, targetReps: 5, targetWeight: userUnit === 'lbs' ? 245 : 110, targetUnit: userUnit },
            { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 85 : 40, targetUnit: userUnit },
            { name: 'Barbell Row', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 135 : 60, targetUnit: userUnit },
            { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: userUnit },
          ],
        },
        {
          id: 'ref_push_pull_legs',
          name: 'Push Pull Legs',
          createdAt: '2026-01-01',
          description: 'Comprehensive hypertrophy split targeting pressing, pulling, and lower chain power.',
          goalTag: 'Split Routine',
          exercises: [
            { name: 'Incline Bench', targetSets: 4, targetReps: 8, targetWeight: userUnit === 'lbs' ? 155 : 70, targetUnit: userUnit },
            { name: 'Dips', targetSets: 3, targetReps: 10, targetWeight: 0, targetUnit: userUnit },
            { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 95 : 42.5, targetUnit: userUnit },
            { name: 'Lateral Raise', targetSets: 4, targetReps: 12, targetWeight: userUnit === 'lbs' ? 25 : 12, targetUnit: userUnit },
            { name: 'Pull-ups', targetSets: 4, targetReps: 8, targetWeight: 0, targetUnit: userUnit },
            { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: userUnit === 'lbs' ? 145 : 65, targetUnit: userUnit },
            { name: 'Leg Press', targetSets: 4, targetReps: 10, targetWeight: userUnit === 'lbs' ? 400 : 180, targetUnit: userUnit },
            { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: userUnit === 'lbs' ? 185 : 85, targetUnit: userUnit },
          ],
        },
        {
          id: 'ref_mobility',
          name: 'Mobility & Recovery',
          createdAt: '2026-01-01',
          description: 'Active recovery, joint decompression, and core stability to accelerate athletic regeneration.',
          goalTag: 'Recovery',
          exercises: [
            { name: 'Goblet Squat', targetSets: 3, targetReps: 12, targetWeight: userUnit === 'lbs' ? 35 : 16, targetUnit: userUnit },
            { name: 'Front Plank (Seconds)', targetSets: 3, targetReps: 45, targetWeight: 0, targetUnit: userUnit },
            { name: 'Hanging Knee Raise', targetSets: 3, targetReps: 12, targetWeight: 0, targetUnit: userUnit },
            { name: 'Incline Treadmill Walk', targetSets: 1, targetReps: 15, targetWeight: 0, targetUnit: userUnit },
            { name: 'Dumbbell Walking Lunge', targetSets: 3, targetReps: 12, targetWeight: userUnit === 'lbs' ? 20 : 10, targetUnit: userUnit },
          ],
        },
      ];

      for (const fb of fallbackTemplates) {
        if (!seenNames.has(fb.name.toLowerCase())) {
          seenNames.add(fb.name.toLowerCase());
          result.push(fb);
        }
      }
    }

    return result;
  }, [plannedWorkouts, adaptiveSplitTemplates, userUnit]);

  if (selectedDetailsPlan && !isModalOpen) {
    return (
      <WorkoutDetailsView
        plan={selectedDetailsPlan}
        onBack={() => setSelectedDetailsPlan(null)}
        onStart={(p) => {
          setSelectedDetailsPlan(null);
          handleStartPlan(p);
        }}
        onEdit={handleEditPlan}
        onShare={(p) => setSharingPlan(p)}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER (Screen 10 — Workout List)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page animate-fade-in space-y-4">
      {/* ── Screen 10 Header (Reference: Flow Board Screen 10) ───────────── */}
      <header className="pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button
                type="button"
                onClick={goBack}
                className="w-10 h-10 rounded-full bg-bg-card border border-border/80 flex items-center justify-center text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
                aria-label="Go back"
              >
                <ChevronLeft className="w-5 h-5 text-accent" />
              </button>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold font-sans text-text-primary tracking-tight">
              Train
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {userMode === 'advanced' && (
              <button
                type="button"
                onClick={() => setIsPlateModalOpen(true)}
                className="w-10 h-10 rounded-full bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                title="Plate Calculator"
                aria-label="Plate Calculator"
              >
                <Dumbbell className="w-4 h-4 text-accent" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsToolsMenuOpen(true)}
              className="w-10 h-10 rounded-full bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
              title="Training Tools & Actions"
              aria-label="Training Tools"
            >
              <SlidersHorizontal className="w-4 h-4 text-accent" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Segmented Control (Reference: Screen 10 in Image 1 & Image 3) ── */}
      <div role="tablist" aria-label="Train navigation" className="segmented-control">
        <button
          type="button"
          role="tab"
          aria-selected={trainSubTab === 'workouts'}
          onClick={() => setTrainSubTab('workouts')}
          className={`segmented-item ${trainSubTab === 'workouts' ? 'active' : ''}`}
        >
          Workouts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={trainSubTab === 'plans'}
          onClick={() => setTrainSubTab('plans')}
          className={`segmented-item ${trainSubTab === 'plans' ? 'active' : ''}`}
        >
          Plans {plannedWorkouts.length > 0 && `(${plannedWorkouts.length})`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={trainSubTab === 'history'}
          onClick={() => setTrainSubTab('history')}
          className={`segmented-item ${trainSubTab === 'history' ? 'active' : ''}`}
        >
          History
        </button>
      </div>

      {/* ── TAB 1: WORKOUTS ── */}
      {trainSubTab === 'workouts' && (
        <div className="space-y-4 animate-fade-in">
      {activeWorkoutDraft && !isModalOpen && (
        <div className="card p-3.5 bg-bg-card border border-accent/40 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
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

      {/* ── Screen 10 Workout Routines List (Reference: Flow Board Screen 10) ── */}
      <section className="space-y-3" aria-label="Available Workout Routines">
        {availableRoutines.map((routine) => {
          const exCount = routine.exercises?.length || 0;
          const duration = Math.max(30, exCount * 8);
          const cleanName = routine.name.replace(/^Builtin\s+/i, '');

          return (
            <div
              key={routine.id}
              onClick={() => setSelectedDetailsPlan(routine)}
              className="card p-3.5 sm:p-4 bg-bg-card border border-border/80 hover:border-accent/40 transition-all flex items-center justify-between gap-3 cursor-pointer group shadow-xs active:scale-[0.99]"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedDetailsPlan(routine);
                }
              }}
              aria-label={`View details for ${cleanName}`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center shrink-0 group-hover:bg-accent/15 transition-colors">
                  <Dumbbell className="w-5 h-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold font-sans text-text-primary tracking-tight truncate group-hover:text-accent transition-colors">
                    {cleanName}
                  </h3>
                  <p className="text-xs text-text-muted font-sans mt-0.5">
                    ~{duration} min · {exCount} exercises
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-accent transition-colors" />
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Contextual Rest Timer (Visible when timer is active) ── */}
      {isRestRunning && (
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

      {/* ── Schedule Status Footer (Reference: Screen 10 Schedule Context) ── */}
      <section className="card p-4 bg-bg-card border border-border/80 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-2xs font-bold text-text-muted uppercase tracking-wider font-mono block">
              Current Split
            </span>
            <span className="text-sm font-bold text-text-primary font-sans">
              {trainingProfile?.preferredSplit
                ? trainingProfile.preferredSplit === 'push_pull_legs'
                  ? 'Push / Pull / Legs'
                  : trainingProfile.preferredSplit === 'upper_lower'
                  ? 'Upper / Lower Split'
                  : trainingProfile.preferredSplit === 'full_body'
                  ? 'Full Body Routine'
                  : 'Body Part Split'
                : 'Upper / Lower Split'}
            </span>
            <span className="text-2xs text-text-muted block mt-0.5">
              {weeklyScheduleStats.completedCount} of {weeklyScheduleStats.targetDays} completed this week
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsScheduleModalOpen(true)}
            className="btn-secondary py-2 px-3 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
          >
            Adjust plan
          </button>
        </div>

        {/* Quick Tools Row: Suggested Workout & Past Session */}
        <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setIsSuggestedModalOpen(true)}
            className="text-text-muted hover:text-accent font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>Suggested Workout</span>
          </button>
          <button
            type="button"
            onClick={() => setIsLogPastModalOpen(true)}
            className="text-text-muted hover:text-accent font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <span>Log Past Session</span>
          </button>
        </div>
      </section>

      {/* ── ASCEND AUDITABLE PRESCRIPTION: DECISION LEDGER (Advanced mode) ── */}
      {userMode === 'advanced' && (activePolicyDecision || (activeTrainingDecision && activeTrainingDecision.evidenceCount >= 1)) && (
        <section className="space-y-2" aria-label="Progression Policy Recommendation">
          <div
            className="flex items-center justify-between cursor-pointer p-3 rounded-xl bg-bg-card border border-border/70 hover:border-accent/40 transition-colors shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setIsDecisionExpanded((prev) => !prev)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsDecisionExpanded((prev) => !prev);
              }
            }}
            aria-expanded={isDecisionExpanded}
            aria-label="Toggle progression policy recommendation"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <h2 className="section-title text-[11px] mb-0 font-mono">
                {activePolicyDecision
                  ? 'TRAINING DECISION POLICY RECOMMENDATION'
                  : 'WHY DID MY PRESCRIPTION CHANGE?'}
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-3xs text-text-muted font-mono hidden sm:inline">
                {isDecisionExpanded ? 'Collapse' : 'Inspect Insights'}
              </span>
              {isDecisionExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-accent" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-accent" />
              )}
            </div>
          </div>
          {isDecisionExpanded && (
            <div className="animate-fade-in space-y-2">
              {activePolicyDecision && (
                <div className="p-2.5 rounded-lg bg-bg-secondary/60 border border-border/60 text-2xs text-text-muted flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <span>
                    Audit Note: Decisions in this ledger record candidate progression. Accepting or overriding stores your decision in the ledger; it does not alter current workout draft targets or automatically rewrite future workout plans.
                  </span>
                </div>
              )}
              {activePolicyDecision ? (
                <PolicyDecisionCard
                  decision={activePolicyDecision}
                  userUnit={userUnit}
                />
              ) : activeTrainingDecision ? (
                <TrainingDecisionCard
                  decision={activeTrainingDecision}
                  userUnit={userUnit}
                />
              ) : null}
            </div>
          )}
        </section>
      )}
        </div>
      )}

      {/* ── TAB 2: PLANS ────────────────────────────────────────────────────── */}
      {trainSubTab === 'plans' && (
        <div className="space-y-4 animate-fade-in">
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-accent" />
                <h2 className="section-title text-[11px] mb-0">CUSTOM WORKOUT PLANS</h2>
                {plannedWorkouts.length > 0 && (
                  <span className="text-2xs bg-accent/15 text-accent font-bold px-1.5 py-0.5 rounded-md font-mono">
                    {plannedWorkouts.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={openCreatePlan}
                className="text-text-secondary hover:text-text-primary text-xs font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                title="Create new workout plan"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <span>New Plan</span>
              </button>
            </div>

            {plannedWorkouts.length === 0 ? (
              <div className="card p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between border-dashed border-border gap-3 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-primary">No custom plans saved yet</p>
                    <p className="text-2xs text-text-muted">Build your personalized routine or load a ready-made workout</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openCreatePlan}
                  className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-white" />
                  <span>Create Plan</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {plannedWorkouts.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onStart={() => handleStartPlan(plan)}
                    onEdit={() => handleEditPlan(plan)}
                    onDelete={() => handleDeletePlan(plan)}
                    onShare={() => setSharingPlan(plan)}
                    onDuplicate={() => handleDuplicatePlan(plan)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── TAB 3: HISTORY ─────────────────────────────────────────────────── */}
      {trainSubTab === 'history' && (
        <div className="space-y-4 animate-fade-in">

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

        {sortedWorkouts.length > 2 && (showAllHistory || historyFilter.trim()) && (
          <div className="relative animate-fade-in">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search past workouts (e.g. Bench, Squat, Pull-ups)..."
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none font-sans"
            />
          </div>
        )}

        {sortedWorkouts.length === 0 ? (
          <div className="card text-center py-8 px-4 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent mx-auto">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">Your journey starts here.</p>
              <p className="text-xs text-text-muted mt-1 max-w-xs mx-auto">
                Completed training sessions, logged sets, and volume metrics will appear here.
              </p>
            </div>
          </div>
        ) : filteredWorkouts.length === 0 && historyFilter.trim() !== '' ? (
          <div className="card text-center py-6 px-4 space-y-1 text-text-muted text-xs">
            <p className="font-semibold text-text-primary">No workouts found</p>
            <p>No logged sessions matched &ldquo;{historyFilter}&rdquo;.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {((showAllHistory || historyFilter.trim()) ? filteredWorkouts : filteredWorkouts.slice(0, 3)).map(workout => {
              const isExpanded = expandedWorkouts.has(workout.id);
              const completedSetsCount = workout.exercises.reduce(
                (sum, e) => sum + e.sets.filter((s) => isSetCompleted(s) || s.status === 'skipped').length,
                0
              );
              const totalSets = completedSetsCount > 0
                ? completedSetsCount
                : workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
              const performedExercises = workout.exercises.filter(
                (e) => e.sets.some((s) => isSetCompleted(s) || s.status === 'skipped')
              );
              const displayExercises = performedExercises.length > 0 ? performedExercises : workout.exercises;

              return (
                <div key={workout.id} className="card">
                  <button
                    type="button"
                    className="w-full flex justify-between items-center text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/40 rounded-lg p-0.5"
                    onClick={() => toggleExpand(workout.id)}
                    aria-expanded={isExpanded}
                    aria-label={`Workout on ${new Date(workout.date).toLocaleDateString()}`}
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
                        {plural(displayExercises.length, 'exercise')} • {plural(totalSets, 'set')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronUp className="w-5 h-5 text-text-secondary" />
                        : <ChevronDown className="w-5 h-5 text-text-secondary" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                      {displayExercises.map((ex, i) => {
                        const effortSummary = ex.sets.some((s) => s.rpe !== undefined)
                          ? calculateSetEffortDrift(ex.sets)
                          : null;

                        return (
                          <div key={i} className="bg-bg-elevated p-3 rounded-lg space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <p className="font-medium text-accent text-sm">{ex.name}</p>
                              {effortSummary && effortSummary.averageRpe > 0 && (
                                <div className="flex items-center gap-1.5 text-3xs font-mono">
                                  <span className="text-text-muted">Effort:</span>
                                  <span className="px-1.5 py-0.5 rounded bg-bg-primary border border-border text-accent font-bold">
                                    Avg @{effortSummary.averageRpe} RPE
                                  </span>
                                  {effortSummary.rpeDriftTotal !== 0 && (
                                    <span
                                      className={`px-1.5 py-0.5 rounded ${
                                        effortSummary.withinSessionEffortTrend === 'high'
                                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                          : 'bg-bg-primary text-text-muted border border-border'
                                      }`}
                                      title={`Within-session effort drift across sets: ${
                                        effortSummary.rpeDriftTotal >= 0 ? '+' : ''
                                      }${effortSummary.rpeDriftTotal} RPE`}
                                    >
                                      {effortSummary.rpeDriftTotal > 0
                                        ? `+${effortSummary.rpeDriftTotal}`
                                        : effortSummary.rpeDriftTotal} drift
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-text-secondary">
                              {(ex.sets.filter((s) => isSetCompleted(s) || s.status === 'skipped').length > 0
                                ? ex.sets.filter((s) => isSetCompleted(s) || s.status === 'skipped')
                                : ex.sets
                              ).map((set, j) => {
                                const rpeVal = set.rpe;
                                const rirVal =
                                  rpeVal !== undefined
                                    ? Math.max(0, Math.round((10 - rpeVal) * 10) / 10)
                                    : undefined;

                                const isSkipped = set.status === 'skipped';
                                const isNotAttempted = set.status === 'not_attempted';
                                const isDone = isSetCompleted(set);

                                return (
                                  <div
                                    key={j}
                                    className={`px-2.5 py-1.5 rounded border flex items-center justify-between gap-1.5 ${
                                      isSkipped
                                        ? 'bg-rose-500/5 border-rose-500/20 opacity-75'
                                        : isNotAttempted
                                        ? 'bg-bg-primary/50 border-border/60 opacity-60'
                                        : 'bg-bg-primary border-border'
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      Set {j + 1}:{' '}
                                      <span className={`tabular-nums ${isDone ? 'text-text-primary font-medium' : 'text-text-muted line-through'}`}>
                                        {set.weight} {set.unit}
                                      </span>{' '}
                                      × {set.reps}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isSkipped && (
                                        <span
                                          className="text-[9px] font-mono px-1 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold"
                                          title="Skipped Set"
                                        >
                                          SKIPPED
                                        </span>
                                      )}
                                      {isNotAttempted && (
                                        <span
                                          className="text-[9px] font-mono px-1 py-0.5 rounded bg-bg-secondary text-text-muted border border-border/60 font-bold"
                                          title="Not Attempted"
                                        >
                                          NOT ATTEMPTED
                                        </span>
                                      )}
                                      {isDone && rpeVal !== undefined && (
                                        <span
                                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold"
                                          title={`RPE @${rpeVal} (${rirVal} RIR - Reps in Reserve)`}
                                        >
                                          @{rpeVal}
                                        </span>
                                      )}
                                      {isDone && set.isPR && (
                                        <span
                                          className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold"
                                          title="Personal Record Set"
                                        >
                                          PR
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {/* ── Plan vs Actual Workout Review ── */}
                      <PlanVsActualReview workout={workout} />

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

            {!showAllHistory && !historyFilter.trim() && filteredWorkouts.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllHistory(true)}
                className="btn-secondary w-full py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-1.5 border border-border/80 hover:border-accent/40 text-text-secondary hover:text-accent transition-colors shadow-xs cursor-pointer"
              >
                <span>View All ({filteredWorkouts.length}) Workouts</span>
                <ChevronDown className="w-3.5 h-3.5 text-accent" />
              </button>
            )}

            {showAllHistory && !historyFilter.trim() && (
              <button
                type="button"
                onClick={() => setShowAllHistory(false)}
                className="text-2xs text-text-muted hover:text-accent mx-auto py-1.5 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Show Recent 3 Only</span>
                <ChevronUp className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </section>
        </div>
      )}

      {/* ── Dedicated Fullscreen Active Workout Experience ──────────────── */}
      {isModalOpen && (
        <ActiveWorkoutScreen
          initialExercises={exercises}
          workoutName={startedFromPlan || 'Workout Session'}
          planId={startedFromPlanId || undefined}
          onFinish={(workoutEntry, newPRsCount) => {
            addWorkout(workoutEntry);
            clearWorkoutDraft();
            const durationMin = workoutEntry.durationMinutes ?? Math.round((Date.now() - sessionStartTime) / 60000);
            const durationSec = workoutEntry.durationSeconds ?? Math.round((Date.now() - sessionStartTime) / 1000);
            setPostWorkoutSummary({
              name: startedFromPlan || 'Workout Session',
              durationMinutes: durationMin,
              durationSeconds: durationSec,
              exercises: workoutEntry.exercises,
            });
            setIsModalOpen(false);
            setExercises([]);
            setStartedFromPlan(null);
            setStartedFromPlanId(null);
            if (newPRsCount > 0) {
              toast.success(
                `${newPRsCount} New PR${newPRsCount > 1 ? 's' : ''} detected & synced to your PRs!`,
                'New PR Milestone'
              );
            } else {
              toast.success(
                `Logged workout with ${workoutEntry.exercises.length} exercise${workoutEntry.exercises.length > 1 ? 's' : ''}!`,
                'Workout Saved'
              );
            }
          }}
          onPause={() => {
            setIsModalOpen(false);
            setExercises([]);
            setStartedFromPlan(null);
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
        defaultTargetReps={defaultTargetReps}
        onSave={handleSavePlan}
      />

      {/* Log Completed / Past Workout Modal */}
      <LogPastWorkoutModal
        isOpen={isLogPastModalOpen}
        onClose={() => setIsLogPastModalOpen(false)}
        onSaved={(entry) => {
          setPostWorkoutSummary({
            name: 'Completed Workout',
            durationMinutes: 45,
            exercises: entry.exercises,
          });
        }}
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

      {/* Goal Selector Modal */}
      <GoalSelectorModal
        isOpen={isGoalSelectorOpen}
        onClose={() => setIsGoalSelectorOpen(false)}
      />

      {/* Suggested Workout Plan Generator Modal */}
      <SuggestedWorkoutModal
        isOpen={isSuggestedModalOpen}
        onClose={() => setIsSuggestedModalOpen(false)}
        userUnit={userUnit}
        defaultIntensity={primaryGoal === 'get_stronger' ? 'high' : primaryGoal === 'stamina' ? 'low' : 'medium'}
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

      {/* ── Change Workout Bottom Sheet / Modal ──────────────────────────── */}
      {isChangeWorkoutOpen && (
        <div className="modal-overlay" onClick={() => setIsChangeWorkoutOpen(false)}>
          <div
            className="modal-content max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-text-primary">Change Workout</h2>
                <p className="text-2xs text-text-muted">Choose what you want to train today</p>
              </div>
              <button
                type="button"
                onClick={() => setIsChangeWorkoutOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto space-y-4">
              {/* Option to log past/finished workout */}
              <button
                type="button"
                onClick={() => {
                  setIsChangeWorkoutOpen(false);
                  setIsLogPastModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-accent/10 border border-accent/30 hover:border-accent/60 flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-text-primary block group-hover:text-accent transition-colors">
                      Log Finished / Past Workout
                    </span>
                    <span className="text-3xs text-text-muted">
                      Already completed your session? Record weights and reps now
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
              </button>
              {/* My Workouts & Weekly Schedule */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-mono font-bold uppercase tracking-wider text-accent">
                    MY WORKOUTS &amp; SCHEDULE
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChangeWorkoutOpen(false);
                        setIsScheduleModalOpen(true);
                      }}
                      className="text-xs font-semibold text-text-muted hover:text-accent flex items-center gap-1 transition-colors"
                      title="Customize which day you train which workout"
                    >
                      <Calendar className="w-3.5 h-3.5 text-accent" />
                      <span>Schedule Days</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsChangeWorkoutOpen(false);
                        openCreatePlan();
                      }}
                      className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Plan</span>
                    </button>
                  </div>
                </div>

                {plannedWorkouts.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {plannedWorkouts.map((plan) => {
                      const bodyParts = getWorkoutBodyParts(plan.exercises);
                      const scheduledDays = Object.entries(weeklySchedule || {})
                        .filter(([_, d]) => d.workoutPlanId === plan.id)
                        .map(([day]) => DAY_DISPLAY_INFO[day as keyof typeof DAY_DISPLAY_INFO]?.short || day);

                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => {
                            setIsChangeWorkoutOpen(false);
                            handleStartPlan(plan);
                          }}
                          className="p-3 rounded-xl bg-bg-secondary border border-border/80 hover:border-accent/50 hover:bg-accent/5 text-left flex items-center justify-between transition-colors group"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-text-primary block group-hover:text-accent">
                                {plan.name}
                              </span>
                              {scheduledDays.length > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-bg-card border border-border text-3xs font-mono font-bold text-text-muted">
                                  {scheduledDays.join(', ')}
                                </span>
                              )}
                            </div>
                            {bodyParts.length > 0 ? (
                              <span className="text-3xs text-accent font-medium block mt-0.5">
                                {bodyParts.join(' • ')}
                              </span>
                            ) : null}
                            <span className="text-xs text-text-muted line-clamp-1 mt-0.5">
                              {plan.exercises.map((e) => e.name).join(', ')}
                            </span>
                          </div>
                          <Play className="w-4 h-4 text-accent shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted italic py-1">No custom workouts created yet.</p>
                )}
              </div>

              {/* Ready-Made Splits & AI Generator - Tucked away in a clean dropdown */}
              <div className="pt-2 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setIsTemplateDropdownOpen((prev) => !prev)}
                  className="w-full py-2.5 px-3 rounded-xl bg-bg-secondary/40 border border-border/60 hover:border-accent/40 text-left flex items-center justify-between transition-colors text-xs font-semibold text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Browse ready-made splits &amp; workout plan builder</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isTemplateDropdownOpen ? 'rotate-180 text-accent' : ''
                    }`}
                  />
                </button>

                {isTemplateDropdownOpen && (
                  <div className="mt-2.5 space-y-3 p-3 rounded-xl bg-bg-secondary/30 border border-border/50 animate-fade-in">
                    <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                      READY-MADE SPLIT TEMPLATES
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {adaptiveSplitTemplates.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => {
                            setIsChangeWorkoutOpen(false);
                            handleStartPlan(tmpl);
                          }}
                          className="p-2.5 rounded-lg bg-bg-card border border-border/80 hover:border-accent/50 text-left flex items-center justify-between transition-colors group"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-xs text-text-primary block group-hover:text-accent">
                              {tmpl.name}
                            </span>
                            <span className="text-3xs text-text-muted line-clamp-1">
                              {tmpl.exercises.map((e) => e.name).join(', ')}
                            </span>
                          </div>
                          <Play className="w-3.5 h-3.5 text-accent shrink-0" />
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChangeWorkoutOpen(false);
                        setIsSuggestedModalOpen(true);
                      }}
                      className="w-full p-2.5 rounded-lg bg-accent/10 border border-accent/30 text-accent font-semibold text-xs flex items-center justify-center gap-2 hover:bg-accent/20 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Let ASCEND suggest a new plan</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Utility Links */}
              <div className="pt-2 border-t border-border/50 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangeWorkoutOpen(false);
                    setIsExerciseLibraryOpen(true);
                  }}
                  className="w-full p-2.5 rounded-xl bg-bg-secondary/50 border border-border/60 hover:border-accent/40 text-left text-xs font-semibold text-text-primary flex items-center gap-2.5 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-accent" />
                  <span>Browse Exercise Library</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsChangeWorkoutOpen(false);
                    openBlankLogger();
                  }}
                  className="w-full p-2.5 rounded-xl bg-bg-secondary/50 border border-border/60 hover:border-accent/40 text-left text-xs font-semibold text-text-primary flex items-center gap-2.5 transition-colors"
                >
                  <Plus className="w-4 h-4 text-text-muted" />
                  <span>Start empty workout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Training Tools & Actions Drawer / Sheet ── */}
      {isToolsMenuOpen && (
        <div
          className="modal-overlay z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setIsToolsMenuOpen(false)}
        >
          <div
            className="modal-content w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-text-primary text-base">Training Tools</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsPlateModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Dumbbell className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Plate Calculator</h4>
                    <p className="text-2xs text-text-muted">Calculate exact barbell loading plates</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setTargetScheduleDay(todayDayOfWeek);
                  setIsScheduleModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Weekly Schedule &amp; Split</h4>
                    <p className="text-2xs text-text-muted">Assign days, target muscle groups &amp; rest days</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsExerciseLibraryOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Exercise Library</h4>
                    <p className="text-2xs text-text-muted">Browse 100+ movements, cues &amp; substitutions</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsLogPastModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Log Past Session</h4>
                    <p className="text-2xs text-text-muted">Back-fill a workout completed on a previous day</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  openCreatePlan();
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Create Workout Plan</h4>
                    <p className="text-2xs text-text-muted">Design a reusable custom workout routine</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {/* Display Mode Switch */}
            <div className="pt-3 border-t border-border/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-text-primary block">Display Mode</span>
                <span className="text-2xs text-text-muted">
                  {userMode === 'advanced' ? 'Advanced (All analytics & insights)' : 'Simple (Focused essentials)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleUserMode()}
                className="px-3 py-1.5 rounded-lg border border-border bg-bg-secondary text-xs font-bold text-accent hover:border-accent/40 transition-colors cursor-pointer"
              >
                Switch to {userMode === 'advanced' ? 'Simple' : 'Advanced'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Schedule & Body Parts Modal */}
      <WeeklyScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setTargetScheduleDay(undefined);
        }}
        plannedWorkouts={plannedWorkouts}
        initialDay={targetScheduleDay}
      />
    </div>
  );
}
