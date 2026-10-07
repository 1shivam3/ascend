"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { getExerciseList, calculateOneRepMax, isMainCompoundLift, isBodyweightExercise, getEffectiveExerciseLoad, suggestLoad } from '@/lib/strength-standards';
import { generateTrainingDecision, calculateSetEffortDrift } from '@/lib/lifter-twin';
import TrainingDecisionCard from '@/components/TrainingDecisionCard';
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
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
} from '@/lib/workout-engine';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import ExerciseSubstitutionModal from '@/components/ExerciseSubstitutionModal';
import ExerciseLibraryModal from '@/components/ExerciseLibraryModal';
import WorkoutCoachDrawer from '@/components/WorkoutCoachDrawer';
import PostWorkoutTakeModal from '@/components/PostWorkoutTakeModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import { AISubstitutionResult, AthleteGoal, ATHLETE_GOAL_CONFIGS, DayOfWeek } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import ActiveWorkoutScreen from '@/components/ActiveWorkoutScreen';
import ShareProgramModal from '@/components/ShareProgramModal';
import WeeklyScheduleModal from '@/components/WeeklyScheduleModal';
import LogPastWorkoutModal from '@/components/LogPastWorkoutModal';
import ExerciseSelectorModal from '@/components/ExerciseSelectorModal';
import {
  DAYS_OF_WEEK,
  DAY_DISPLAY_INFO,
  getTodayDayOfWeek,
  getWorkoutBodyParts,
  getScheduledWorkoutForDay,
} from '@/lib/workout-schedule';
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
            onClick={onDuplicate}
            title="Duplicate plan"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
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
  const goals = useStore((state) => state.goals || ['get_stronger', 'build_muscle']);
  const userMode = useStore((state) => state.userMode) || 'beginner';
  const toggleUserMode = useStore((state) => state.toggleUserMode);
  const weeklySchedule = useStore((state) => state.weeklySchedule);
  const setWeeklySchedule = useStore((state) => state.setWeeklySchedule);
  const toast = useToast();

  const userUnit = profile?.unit || 'kg';
  const availableExercises = getExerciseList();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
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
    const activeGoals = goals || ['get_stronger', 'build_muscle'];
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

  // Athlete goal personalization
  const primaryGoal: AthleteGoal = (profile?.goals && profile.goals.length > 0)
    ? (profile.goals[0] as AthleteGoal)
    : (goals && goals.length > 0 ? (goals[0] as AthleteGoal) : 'build_muscle');
  const goalConfig = ATHLETE_GOAL_CONFIGS[primaryGoal] || ATHLETE_GOAL_CONFIGS.build_muscle;

  const defaultTargetReps = useMemo(() => {
    const { min, max } = goalConfig.defaultRepRange;
    return Math.round((min + max) / 2);
  }, [goalConfig.defaultRepRange]);

  const adaptiveSplitTemplates = useMemo(() => {
    return getGoalAdaptiveSplitTemplates(primaryGoal, userUnit);
  }, [primaryGoal, userUnit]);

  // Goal-adaptive default rest period
  const defaultRestSeconds = useMemo(() => {
    return goalConfig.defaultRestSeconds;
  }, [goalConfig.defaultRestSeconds]);

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
    return generateTrainingDecision(targetExerciseForDecision, workouts, userUnit, 8.0, goals);
  }, [targetExerciseForDecision, workouts, userUnit, goals]);

  const [isChangeWorkoutOpen, setIsChangeWorkoutOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogPastModalOpen, setIsLogPastModalOpen] = useState(false);
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** When the logger is pre-filled from a plan, store its name here */
  const [startedFromPlan, setStartedFromPlan] = useState<string | null>(null);
  const [sharingPlan, setSharingPlan] = useState<PlannedWorkout | null>(null);

  // ── Rest Timer State ───────────────────────────────────────────────────────
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(defaultRestSeconds);
  const [isRestRunning, setIsRestRunning] = useState<boolean>(false);
  const [isTimerFinished, setIsTimerFinished] = useState<boolean>(false);

  useEffect(() => {
    setRestTotalSeconds(defaultRestSeconds);
  }, [defaultRestSeconds]);

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
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [targetScheduleDay, setTargetScheduleDay] = useState<DayOfWeek | undefined>(undefined);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');

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
    const userPrs = useStore.getState().prs;
    const preFilledExercises: WorkoutExercise[] = plan.exercises.map(pe => {
      const activeDecision = storedDecisions[pe.name];
      let assignedWeight: number | '' = pe.targetWeight ?? 0;
      let assignedRpe = 8;
      if (activeDecision?.status === 'accepted') {
        assignedWeight = activeDecision.nextPrescription.weight;
        assignedRpe = activeDecision.nextPrescription.targetRpe;
      } else if (activeDecision?.status === 'overridden' && activeDecision.userOverrideWeight !== undefined) {
        assignedWeight = activeDecision.userOverrideWeight;
        assignedRpe = activeDecision.nextPrescription.targetRpe;
      } else if (!assignedWeight || assignedWeight === 0) {
        const pr = userPrs.find(p => p.exercise.toLowerCase() === pe.name.toLowerCase());
        if (pr && pr.oneRepMax > 0) {
          assignedWeight = suggestLoad(pr.oneRepMax, pe.targetReps, assignedRpe, userUnit);
        } else {
          assignedWeight = '';
        }
      }

      return {
        name: pe.name,
        sets: Array.from({ length: Math.max(1, pe.targetSets) }, () => ({
          weight: assignedWeight !== '' && assignedWeight > 0 ? assignedWeight : ('' as any),
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
    const userBW = profile?.bodyweightKg || 75;
    for (const ex of validExercises) {
      const exName = ex.name.trim();
      const isBW = isBodyweightExercise(exName);
      const existingPRs = prs.filter(p => p.exercise.toLowerCase() === exName.toLowerCase());
      const currentBest1RMKg = existingPRs.length > 0 ? Math.max(...existingPRs.map(p => p.oneRepMax)) : 0;

      let topSet = { weightKg: 0, weightLbs: 0, reps: 0, e1RMKg: 0, rawWeight: 0, unit: userUnit as 'kg' | 'lbs' };

      for (const s of ex.sets) {
        const wNum = s.weight;
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

    if (newPRCount > 0) {
      toast.success(
        `${newPRCount} New Personal Record${newPRCount > 1 ? 's' : ''} detected & synced to your PRs!`,
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

  const handleDuplicatePlan = (plan: PlannedWorkout) => {
    const duplicatedPlan: PlannedWorkout = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan_${Date.now()}`,
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

  const filteredWorkouts = useMemo(() => {
    if (!historyFilter.trim()) return sortedWorkouts;
    const q = historyFilter.toLowerCase().trim();
    return sortedWorkouts.filter((w) =>
      w.exercises.some((e) => e.name.toLowerCase().includes(q))
    );
  }, [sortedWorkouts, historyFilter]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page animate-fade-in space-y-4">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight font-sans">Train</h1>
          <p className="text-label text-text-muted">Today&apos;s workout &amp; training log</p>
        </div>
        <div className="flex items-center gap-2">
          {userMode === 'advanced' && (
            <button
              type="button"
              onClick={() => setIsPlateModalOpen(true)}
              className="p-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
              title="Plate Helper"
            >
              <Dumbbell className="w-4 h-4 text-accent" />
            </button>
          )}
        </div>
      </header>

      {/* ── ACTIVE WORKOUT DRAFT RESUME BANNER ── */}
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

      {/* ── WEEKLY SCHEDULE STRIP (Days & Body Parts) ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
              WEEKLY SCHEDULE &amp; SPLIT
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setTargetScheduleDay(todayDayOfWeek);
              setIsScheduleModalOpen(true);
            }}
            className="text-xs font-bold text-accent bg-accent/10 border border-accent/25 px-2.5 py-1 rounded-lg hover:bg-accent/20 flex items-center gap-1 transition-colors shadow-xs"
          >
            <Edit2 className="w-3 h-3" />
            <span>Customize Days</span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {DAYS_OF_WEEK.map((day) => {
            const info = DAY_DISPLAY_INFO[day];
            const sched = getScheduledWorkoutForDay(weeklySchedule, day, plannedWorkouts);
            const isToday = day === todayDayOfWeek;

            return (
              <button
                key={day}
                type="button"
                onClick={() => {
                  setTargetScheduleDay(day);
                  setIsScheduleModalOpen(true);
                }}
                className={`py-2 px-1 rounded-xl border text-center transition-all flex flex-col items-center justify-between min-h-[68px] sm:min-h-[76px] cursor-pointer group active:scale-95 ${
                  isToday
                    ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent/30'
                    : sched.isRest
                    ? 'border-border/40 bg-bg-secondary/40 text-text-muted hover:border-border'
                    : 'border-border/70 bg-bg-card hover:border-accent/50 hover:bg-bg-card/80'
                }`}
                title={
                  sched.isRest
                    ? `${info.label}: Rest Day`
                    : `${info.label}: ${sched.title} (${sched.bodyParts.join(', ') || 'Workout'})`
                }
              >
                <div className="flex items-center gap-1">
                  {isToday && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                  <span
                    className={`text-[11px] font-mono font-black uppercase ${
                      isToday ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'
                    }`}
                  >
                    {info.short}
                  </span>
                </div>

                <div className="my-1 w-full px-0.5">
                  {sched.isRest ? (
                    <span className="text-[10px] font-mono font-medium text-text-muted block">
                      REST
                    </span>
                  ) : (
                    <span className="text-2xs font-bold text-text-primary line-clamp-1 block leading-tight font-sans">
                      {sched.plan?.name.replace('Builtin ', '') || sched.title}
                    </span>
                  )}
                </div>

                <span
                  className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full line-clamp-1 block ${
                    sched.isRest
                      ? 'bg-bg-secondary text-text-muted'
                      : isToday
                      ? 'bg-accent text-white'
                      : 'bg-accent/15 text-accent border border-accent/20'
                  }`}
                >
                  {sched.isRest ? 'OFF' : sched.bodyParts[0] || 'TRAIN'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 1. TODAY'S WORKOUT HERO (One screen, one decision) ── */}
      {(() => {
        const scheduledToday = getScheduledWorkoutForDay(weeklySchedule, todayDayOfWeek, plannedWorkouts);
        const currentPlan =
          (todaySessionInfo.plannedWorkoutId
            ? plannedWorkouts.find((p) => p.id === todaySessionInfo.plannedWorkoutId)
            : scheduledToday.plan) ||
          (plannedWorkouts.length > 0 ? plannedWorkouts[0] : adaptiveSplitTemplates[0]);

        const workoutTitle =
          todaySessionInfo.status === 'in_progress'
            ? (activeWorkoutDraft?.startedFromPlan || 'Workout in Progress')
            : todaySessionInfo.status === 'completed'
            ? (todaySessionInfo.title || 'Today Completed')
            : todaySessionInfo.isRestDay
            ? 'Rest & Recovery'
            : currentPlan?.name || "Today's Workout";

        const exerciseList =
          todaySessionInfo.status === 'in_progress'
            ? (activeWorkoutDraft?.exercises.map((e) => e.name).filter(Boolean) || [])
            : todaySessionInfo.status === 'completed'
            ? todaySessionInfo.exercises
            : todaySessionInfo.isRestDay
            ? []
            : currentPlan?.exercises.map((e) => e.name) || [];

        const bodyParts = todaySessionInfo.bodyParts || (currentPlan ? getWorkoutBodyParts(currentPlan.exercises) : []);
        const durationEst = Math.max(30, exerciseList.length * 10);

        // If today is a rest day and no workout is in progress / completed
        if (todaySessionInfo.isRestDay && todaySessionInfo.status !== 'in_progress' && todaySessionInfo.status !== 'completed') {
          return (
            <section className="card p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/5 border border-border shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-2xs font-mono font-bold tracking-wider uppercase text-text-muted">
                    TODAY&apos;S SCHEDULE • {todayDayOfWeek.toUpperCase()}
                  </span>
                </div>
                <span className="text-2xs text-emerald-400 font-semibold font-mono">
                  Rest &amp; Recovery
                </span>
              </div>

              <div>
                <h2 className="text-2xl font-black text-text-primary tracking-tight">
                  Rest &amp; Recovery
                </h2>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                  Scheduled rest day. Hydrate, hit your protein target, and let muscle tissue adapt.
                </p>
              </div>

              <div className="pt-1 space-y-3">
                <button
                  type="button"
                  onClick={() => setIsChangeWorkoutOpen(true)}
                  className="btn-secondary w-full py-3.5 px-4 text-sm font-bold flex items-center justify-center gap-2 border-border hover:border-accent/40 text-text-primary hover:text-accent transition-colors"
                >
                  <Play className="w-4 h-4 fill-text-primary stroke-text-primary" />
                  <span>START A WORKOUT ANYWAY</span>
                </button>

                <div className="flex items-center justify-between text-xs pt-1 px-1">
                  <button
                    type="button"
                    onClick={() => setIsScheduleModalOpen(true)}
                    className="text-text-muted hover:text-accent font-medium flex items-center gap-1.5 transition-colors py-1"
                  >
                    <Calendar className="w-3.5 h-3.5 text-accent" />
                    <span>Edit weekly schedule</span>
                  </button>
                  <button
                    type="button"
                    onClick={openBlankLogger}
                    className="text-text-muted hover:text-accent font-medium flex items-center gap-1.5 transition-colors py-1"
                  >
                    <Plus className="w-3.5 h-3.5 text-accent" />
                    <span>Start empty workout</span>
                  </button>
                </div>
              </div>
            </section>
          );
        }

        return (
          <section className="card p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/5 border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    todaySessionInfo.status === 'completed'
                      ? 'bg-emerald-500'
                      : todaySessionInfo.status === 'in_progress'
                      ? 'bg-accent animate-pulse'
                      : 'bg-accent'
                  }`}
                />
                <span className="text-xs font-semibold text-text-secondary">
                  {todaySessionInfo.status === 'completed'
                    ? 'Completed Today'
                    : todaySessionInfo.status === 'in_progress'
                    ? 'Session in Progress'
                    : `Today's Workout • ${todayDayOfWeek.charAt(0).toUpperCase() + todayDayOfWeek.slice(1)}`}
                </span>
              </div>
              <span className="text-2xs text-text-muted font-medium">
                ~{durationEst} min • {plural(exerciseList.length, 'movement')}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight font-sans">
                  {workoutTitle}
                </h2>
                {bodyParts.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent text-3xs font-semibold">
                    {bodyParts.join(' • ')}
                  </span>
                )}
              </div>
              {exerciseList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {exerciseList.map((exName, exIdx) => (
                    <span
                      key={exIdx}
                      className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border/70 text-xs text-text-secondary font-medium"
                    >
                      {exName}
                    </span>
                  ))}
                </div>
              )}
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

            {/* Primary CTA & at most two choices */}
            <div className="pt-1 space-y-3">
              {todaySessionInfo.status === 'in_progress' ? (
                <button
                  type="button"
                  onClick={handleResumeWorkout}
                  className="btn-primary w-full py-3.5 px-4 text-sm font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-white stroke-white" />
                  <span>Resume Workout</span>
                </button>
              ) : todaySessionInfo.status === 'completed' ? (
                <button
                  type="button"
                  onClick={() => currentPlan && handleStartPlan(currentPlan)}
                  className="btn-secondary w-full py-3.5 px-4 text-sm font-bold flex items-center justify-center gap-2 border-border hover:border-accent/40 text-text-primary hover:text-accent transition-colors"
                >
                  <Play className="w-4 h-4 fill-text-primary stroke-text-primary" />
                  <span>Log Additional Session</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => currentPlan && handleStartPlan(currentPlan)}
                  className="btn-primary w-full py-3.5 px-4 text-sm font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-white stroke-white" />
                  <span>Start Workout</span>
                </button>
              )}

              {/* Clean secondary choices: at most 2 choices */}
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <button
                  type="button"
                  onClick={() => setIsChangeWorkoutOpen(true)}
                  className="text-text-muted hover:text-accent font-medium flex items-center gap-1.5 transition-colors py-1"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-accent" />
                  <span>Change Routine / Split</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsLogPastModalOpen(true)}
                  className="text-text-muted hover:text-accent font-medium flex items-center gap-1.5 transition-colors py-1"
                >
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  <span>Log Past Session</span>
                </button>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── ASCEND AUDITABLE PRESCRIPTION: DECISION LEDGER (Advanced mode) ── */}
      {userMode === 'advanced' && activeTrainingDecision && activeTrainingDecision.evidenceCount >= 1 && (
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

      {/* ── 2. CONTEXTUAL REST TIMER (Only visible while rest is actively running) ── */}
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

      {/* ── 3. WORKOUT PLANS SECTION (Advanced mode) ────────────────────────── */}
      {userMode === 'advanced' && (
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
                  <p className="text-2xs text-text-muted">Build your personalized routine or load a ready-made workout</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plannedWorkouts.map(plan => (
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
      )}

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

        {sortedWorkouts.length > 2 && (
          <div className="relative">
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
        ) : filteredWorkouts.length === 0 && historyFilter.trim() !== '' ? (
          <div className="card text-center py-6 px-4 space-y-1 text-text-muted text-xs">
            <p className="font-semibold text-text-primary">No workouts found</p>
            <p>No logged sessions matched &ldquo;{historyFilter}&rdquo;.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredWorkouts.map(workout => {
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
                      {workout.exercises.map((ex, i) => {
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
                              {ex.sets.map((set, j) => {
                                const rpeVal = set.rpe;
                                const rirVal =
                                  rpeVal !== undefined
                                    ? Math.max(0, Math.round((10 - rpeVal) * 10) / 10)
                                    : undefined;

                                return (
                                  <div
                                    key={j}
                                    className="bg-bg-primary px-2.5 py-1.5 rounded border border-border flex items-center justify-between gap-1.5"
                                  >
                                    <div className="truncate">
                                      Set {j + 1}:{' '}
                                      <span className="text-text-primary font-medium tabular-nums">
                                        {set.weight} {set.unit}
                                      </span>{' '}
                                      × {set.reps}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {rpeVal !== undefined && (
                                        <span
                                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold"
                                          title={`RPE @${rpeVal} (${rirVal} RIR - Reps in Reserve)`}
                                        >
                                          @{rpeVal}
                                        </span>
                                      )}
                                      {set.isPR && (
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
            const durationMin = Math.max(15, Math.round((Date.now() - sessionStartTime) / 60000));
            setPostWorkoutSummary({
              name: startedFromPlan || 'Workout Session',
              durationMinutes: durationMin,
              exercises: workoutEntry.exercises,
            });
            setIsModalOpen(false);
            setExercises([]);
            setStartedFromPlan(null);
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
                    <span>Browse ready-made splits &amp; AI plan generator</span>
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
