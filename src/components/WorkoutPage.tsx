"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { tabListKeyDown } from '@/lib/tab-keyboard';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { validatePlanExercises } from '@/lib/plan-validation';
import { useToday } from '@/lib/use-today';
import { getScheduledPlanEntries } from '@/lib/scheduled-days';
import { ensureDeleteWillPersist } from '@/lib/delete-persist-guard';
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
  Footprints,
  Trophy,
} from 'lucide-react';
import { WorkoutEntry, WorkoutExercise, WorkoutSet, PlannedWorkout, PlannedExercise } from '@/lib/store';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  parseVoiceWorkout,
  getTodaySessionState,
  getGoalAdaptiveSplitTemplates,
  isSetCompleted,
  finalizeWorkoutExercises,
  getExecutedExercises,
  createWorkoutExercisesFromPlan,
  getExercisePrescription,
  getInjuryBannedFamilies,
  getInjuryBannedJoints,
  getMovementFamily,
  isExerciseJointBanned,
  estimatePlanDurationMin,
} from '@/lib/workout-engine';
import { compareSetAdherence } from '@/lib/workout-adherence';
import {
  buildPercentSuggestions,
  estimateE1rmKg,
  isMainCompound,
  mainCompoundKey,
  percentSetWeights,
  TOP_SET_PCT,
} from '@/lib/percent-1rm';
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  isNativePlatform,
} from '@/lib/voice-logger';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import ExerciseLibraryModal from '@/components/ExerciseLibraryModal';
import PostWorkoutTakeModal from '@/components/PostWorkoutTakeModal';
import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal';
import CoachBlockModal from '@/components/CoachBlockModal';
import CoachChatTab from '@/components/CoachChatTab';
import CoachChatSection from '@/components/CoachChatSection';
import PlanPrefsPrompt from '@/components/PlanPrefsPrompt';
import CoachWeeklyReviewModal from '@/components/CoachWeeklyReviewModal';
import BlockDebriefModal from '@/components/BlockDebriefModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import { AthleteGoal, ATHLETE_GOAL_CONFIGS, DayOfWeek, SetExecutionStatus, DEFAULT_GOALS, resolvePrimaryGoal, MAX_PLAN_NAME_LENGTH } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

import ActiveWorkoutScreen from '@/components/ActiveWorkoutScreen';
import { resolveWorkoutMode } from '@/lib/workout-mode';
import SegmentedControl from '@/components/ui/SegmentedControl';
import RunSessionScreen from '@/components/RunSessionScreen';
import {
  getRunProgramProgress,
  describeSession,
  sessionTotalSeconds,
  type RunSession,
} from '@/lib/run-program';
import WorkoutDetailsView from '@/components/WorkoutDetailsView';
import ShareProgramModal from '@/components/ShareProgramModal';
import WeeklyScheduleModal from '@/components/WeeklyScheduleModal';
import LogPastWorkoutModal from '@/components/LogPastWorkoutModal';
import ExerciseSelectorModal from '@/components/ExerciseSelectorModal';
import PlanVsActualReview from '@/components/PlanVsActualReview';
import ConfirmationModal from '@/components/ConfirmationModal';
import {
  DAYS_OF_WEEK,
  DAY_DISPLAY_INFO,
  getTodayDayOfWeek,
  getWorkoutBodyParts,
  getScheduledWorkoutForDay,
} from '@/lib/workout-schedule';
import { plural, safeRandomId, getLocalTodayStr, formatLocalDate, parseLocalDate } from '@/lib/formatters';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t } = useTranslation();
  const prs = useStore((state) => state.prs);
  const workouts = useStore((state) => state.workouts);
  const trainingProfile = useStore((state) => state.trainingProfile);
  const [planName, setPlanName] = useState('');
  const [planExercises, setPlanExercises] = useState<PlannedExercise[]>([emptyPlanExercise(userUnit, defaultTargetReps)]);
  const [intensityMode, setIntensityMode] = useState<'rpe' | 'percent'>('rpe');

  // Sync state when opening or switching between create/edit
  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setPlanName(initial.name);
        setPlanExercises(initial.exercises.length > 0 ? initial.exercises : [emptyPlanExercise(userUnit, defaultTargetReps)]);
        setIntensityMode(initial.intensityMode === 'percent' ? 'percent' : 'rpe');
      } else {
        setPlanName('');
        setPlanExercises([emptyPlanExercise(userUnit, defaultTargetReps)]);
        setIntensityMode('rpe');
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
    const trimmedName = planName.trim().slice(0, MAX_PLAN_NAME_LENGTH);
    if (!trimmedName) {
      toast.error(t('toast.planNameRequired'), t('toast.titlePlanNameRequired'));
      return;
    }
    const validExercises = planExercises.filter(e => e.name.trim());
    if (validExercises.length === 0) {
      toast.error(t('toast.planNeedExercise'), t('toast.titleNoExercises'));
      return;
    }
    // LIVE-P1-01: validation lives in lib/plan-validation (unit-tested).
    // A blank TARGET WEIGHT is valid — it means bodyweight / no
    // prescribed load — and must not fail as "weight cannot be negative".
    const validation = validatePlanExercises(planExercises);
    if (!validation.ok) {
      const { name, kind } = validation.error;
      if (kind === 'sets') {
        toast.error(t('toast.planSetsMin', { name }), t('toast.titleInvalidSets'));
      } else if (kind === 'reps') {
        toast.error(t('toast.planRepsMin', { name }), t('toast.titleInvalidReps'));
      } else {
        toast.error(t('toast.planWeightNeg', { name }), t('toast.titleInvalidWeight'));
      }
      return;
    }
    onSave({ name: trimmedName, exercises: validation.exercises, intensityMode });
    onClose();
  };

  const isValid = planName.trim().length > 0 && planExercises.some(e => e.name.trim());

  if (!isOpen) return null;

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              {initial ? 'Edit Plan' : 'Build workout plan'}
            </h2>
            <p className="text-2xs text-text-muted font-mono mt-0.5">
              {initial ? 'Modify your saved plan' : 'Build a reusable workout template'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* SIM-P1-02: hand-built plans used to bypass ALL limitation /
              pain machinery silently. Warn (don't block — the user may
              have recovered) when a listed exercise loads a joint or
              movement family their declared limitations ban. */}
          {(() => {
            const limitations = trainingProfile?.injuriesOrLimitations || [];
            if (limitations.length === 0) return null;
            const bannedFamilies = getInjuryBannedFamilies(limitations);
            const bannedJoints = getInjuryBannedJoints(limitations);
            const conflicts = planExercises
              .map((e) => e.name.trim())
              .filter((n) => n && (bannedFamilies.has(getMovementFamily(n)) || isExerciseJointBanned(n, bannedJoints)));
            if (conflicts.length === 0) return null;
            return (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                <span className="font-bold">Heads up — limitation clash: </span>
                {conflicts.join(', ')} {conflicts.length === 1 ? 'loads' : 'load'} an area in your declared limitations ({limitations.join(', ')}). Generated plans swap or drop these automatically; hand-built plans only warn. Swap it out if it still hurts.
              </div>
            );
          })()}
          {/* Plan Name */}
          <div>
            <label className="section-title mb-2 block">Plan Name</label>
            <input
              type="text"
              placeholder='e.g. "Push Day", "Leg Day", "Full Body A"'
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              maxLength={MAX_PLAN_NAME_LENGTH}
              className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary focus:border-accent outline-none text-sm"
            />
          </div>

          {/* Intensity mode — RPE (default) or % of estimated 1RM */}
          <div className="border border-border rounded-xl p-3.5 bg-bg-elevated/40 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-text-primary">{t('plan.intensityPercent')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={intensityMode === 'percent'}
                aria-label={t('plan.intensityPercent')}
                onClick={() => setIntensityMode(intensityMode === 'percent' ? 'rpe' : 'percent')}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                  intensityMode === 'percent' ? 'bg-accent' : 'bg-bg-secondary border border-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    intensityMode === 'percent' ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <p className="text-2xs text-text-muted leading-relaxed">{t('plan.intensityPercentHint')}</p>
            {intensityMode === 'percent' &&
              !planExercises.some(
                (ex) => isMainCompound(ex.name) && estimateE1rmKg(ex.name, prs, workouts) !== null
              ) && (
                <p className="text-2xs text-amber-400 leading-relaxed">{t('plan.intensityNoData')}</p>
              )}
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
                  className="text-text-muted hover:text-accent-text text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Dumbbell className="w-3.5 h-3.5" />
                  <span>Browse Library</span>
                </button>
                <button
                  type="button"
                  onClick={addExercise}
                  className="text-accent-text text-xs font-semibold flex items-center gap-1 hover:brightness-110"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Exercise
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {planExercises.map((ex, i) => (
                <div key={i} className="border border-border rounded-xl p-3.5 bg-bg-elevated/40">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-mono text-accent-text font-semibold">EXERCISE {i + 1}</span>
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
                    <span className="text-2xs text-text-muted font-mono">NAME</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetExerciseIndex(i);
                        setIsSelectorOpen(true);
                      }}
                      className="text-2xs text-accent-text hover:underline font-mono"
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

                  {/* %1RM suggestion preview (percent mode, main lifts) */}
                  {intensityMode === 'percent' && typeof ex.targetWeight !== 'number' && (() => {
                    const e1rmKg = mainCompoundKey(ex.name) ? estimateE1rmKg(ex.name, prs, workouts) : null;
                    if (!e1rmKg) return null;
                    const unit = (ex.targetUnit as 'kg' | 'lbs') || userUnit;
                    const weights = percentSetWeights(e1rmKg, ex.targetSets || 1, unit);
                    const e1rmDisplay = unit === 'lbs' ? Math.round(e1rmKg * 2.20462) : Math.round(e1rmKg);
                    return (
                      <p className="mt-2 text-2xs font-mono text-accent-text">
                        {t('plan.suggestedFrom1rm', {
                          weight: weights[0],
                          unit,
                          pct: Math.round(TOP_SET_PCT * 100),
                          e1rm: e1rmDisplay,
                        })}
                      </p>
                    );
                  })()}

                  {/* Target RPE — the plan schema carries it and sharing
                      now preserves it, but this editor never exposed it */}
                  <div className="mt-2">
                    <label className="text-2xs text-text-muted font-mono block mb-1">TARGET RPE (OPTIONAL)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={0.5}
                      placeholder="e.g. 8"
                      value={ex.targetRpe ?? ''}
                      onChange={e =>
                        updateExercise(
                          i,
                          'targetRpe',
                          e.target.value === ''
                            ? undefined
                            : Math.min(10, Math.max(1, Number(e.target.value)))
                        )
                      }
                      className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                    />
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
  onOpen: () => void;
}

function PlanCard({ plan, onStart, onEdit, onDelete, onShare, onDuplicate, onOpen }: PlanCardProps) {
  const { t } = useTranslation();
  const coachBlocks = useStore((state) => state.coachBlocks);
  const updatePlannedWorkout = useStore((state) => state.updatePlannedWorkout);
  const adoptPlanForCoaching = useStore((state) => state.adoptPlanForCoaching);
  const unadoptPlanForCoaching = useStore((state) => state.unadoptPlanForCoaching);
  const isBlockPlan =
    Boolean(plan.coachBlockId) &&
    coachBlocks.activeBlock?.status === 'active' &&
    coachBlocks.activeBlock.planIds.includes(plan.id);
  const isAdopted = Boolean(coachBlocks.adoptedPlans?.[plan.id]);
  const MAX_VISIBLE = 3;
  const visibleExercises = plan.exercises.slice(0, MAX_VISIBLE);
  const remainder = plan.exercises.length - MAX_VISIBLE;

  return (
    <div className="card flex flex-col gap-3">
      {/* Card top row. Layout contract (QA4 P3): the name block is
          flex-1 + min-w-0 and the title truncates, so it can only ever
          occupy the space left over by the shrink-0 action rail — the
          icons can never paint over the name's last glyphs (a long or
          unlucky-width name used to render clipped under the first
          icon, e.g. "Upper A" → "Uppei A"). Full name stays available
          via the title tooltip and the plan detail view. */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onOpen}
          role="button"
          tabIndex={0}
          aria-label={`View details for ${plan.name}`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        >
          <h3 className="font-bold text-text-primary truncate leading-tight" title={plan.name}>{plan.name}</h3>
          <p className="text-xs text-text-muted font-mono mt-0.5">
            {plan.exercises.length} exercise{plan.exercises.length !== 1 ? 's' : ''}
            {/* SIM-P2-17: a duration estimate before starting. */}
            {' · '}{(() => { const d = estimatePlanDurationMin(plan); return t('plan.estDuration', { min: d.min, max: d.max }); })()}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* SIM-P3-04: %1RM mode used to be silently inert on generated
              plans — it lived only inside the plan editor. A card-level
              toggle makes it discoverable and switchable anywhere. */}
          <button
            type="button"
            onClick={() => updatePlannedWorkout(plan.id, {
              ...plan,
              intensityMode: plan.intensityMode === 'percent' ? 'rpe' : 'percent',
            })}
            title={t('plan.usePercent')}
            aria-label={t('plan.usePercent')}
            aria-pressed={plan.intensityMode === 'percent'}
            className={`px-2 py-1.5 min-h-[44px] rounded-lg text-2xs font-mono font-bold transition-colors cursor-pointer ${
              plan.intensityMode === 'percent'
                ? 'bg-accent text-accent-on'
                : 'text-text-muted hover:text-accent-text hover:bg-accent/10'
            }`}
          >
            %1RM
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate plan"
            aria-label="Duplicate plan"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onShare}
            title="Share plan via WhatsApp or QR"
            aria-label="Share plan via WhatsApp or QR"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Edit plan"
            aria-label="Edit plan"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete plan"
            aria-label="Delete plan"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
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
            className="text-2xs bg-bg-elevated border border-border rounded-md px-2 py-0.5 text-text-secondary font-mono break-words"
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
            <span className="text-text-secondary truncate flex-1 mr-2" title={ex.name || undefined}>{ex.name || '—'}</span>
            <span className="text-text-muted font-mono shrink-0">
              {ex.targetSets}×{ex.targetReps}
              {ex.targetWeight ? ` @ ${ex.targetWeight}${ex.targetUnit ?? ''}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Coach management (PR-B): a block plan is labelled; any other
          plan can be adopted by the coach without changing it. */}
      {(isBlockPlan || isAdopted) && (
        <div className="flex items-center gap-1.5">
          <span className="text-2xs font-mono font-bold text-accent-text bg-accent/15 px-2 py-0.5 rounded-md">
            {isBlockPlan ? t('coachBlock.badgeBlock') : t('coachBlock.badgeManaged')}
          </span>
          {isAdopted && !isBlockPlan && (
            <button
              type="button"
              onClick={() => unadoptPlanForCoaching(plan.id)}
              className="text-2xs text-text-muted hover:text-danger cursor-pointer"
            >
              {t('coachBlock.stopCoaching')}
            </button>
          )}
        </div>
      )}
      {!isBlockPlan && !isAdopted && (
        <button
          type="button"
          onClick={() => adoptPlanForCoaching(plan.id)}
          className="self-start text-2xs font-semibold text-accent-text hover:underline cursor-pointer"
        >
          {t('coachBlock.coachThisPlan')}
        </button>
      )}

      {/* Start button */}
      <button
        type="button"
        onClick={onStart}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2"
      >
        <Play className="w-4 h-4" />
        {t('train.startWorkout')}
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WorkoutPage({ onNavigate, startPlanOnMount }: WorkoutPageProps = {}) {
  const { t, language } = useTranslation();
  // SIM-P2-19: dates render in the active language, not hardcoded en-US.
  const dateLocale = language === 'hi' ? 'hi-IN' : 'en-US';
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
  // UX redesign Stage 4 — workout view follows app density unless the
  // user pinned an explicit override (null = Auto, follows density).
  const density = useStore((state) => state.uiPreferences?.density ?? 'simple');
  const workoutModeOverride = useStore((state) => state.uiPreferences?.workoutModeOverride ?? null);
  const setUiPreferences = useStore((state) => state.setUiPreferences);
  const workoutMode = resolveWorkoutMode(density, workoutModeOverride);
  const weeklySchedule = useStore((state) => state.weeklySchedule);
  const setWeeklySchedule = useStore((state) => state.setWeeklySchedule);
  // Coach blocks (PR-B)
  const coachBlocks = useStore((state) => state.coachBlocks);
  const refreshPlateauProposals = useStore((state) => state.refreshPlateauProposals);
  const weeklyReviews = useStore((state) => state.weeklyReviews);
  const refreshWeeklyReview = useStore((state) => state.refreshWeeklyReview);
  const trainingProfile = useStore((state) => state.trainingProfile);
  // User's weekly-target override from Settings (null = automatic, 0 = off).
  const weeklyTargetOverride = useStore((state) => state.uiPreferences?.weeklyTargetDays ?? null);
  const coachEnabled = useStore((state) => state.uiPreferences?.coachEnabled ?? true);
  // Run program (opt-in): enrollment from the store, progress from logs.
  const runProgram = useStore((state) => state.runProgram);
  const enrollRunProgram = useStore((state) => state.enrollRunProgram);
  const leaveRunProgram = useStore((state) => state.leaveRunProgram);
  const runProgress = useMemo(
    () => getRunProgramProgress(workouts, runProgram),
    [workouts, runProgram],
  );
  const [activeRunSession, setActiveRunSession] = useState<RunSession | null>(null);
  const [isRunIntroOpen, setIsRunIntroOpen] = useState(false);
  const toast = useToast();
  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();

  const userUnit = profile?.unit || 'kg';
  const availableExercises = getExerciseList();

  const todayStr = useToday();
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
  const changeWorkoutRef = useRef<HTMLDivElement>(null); const { dialogProps: changeWorkoutDialogProps } = useModalA11y(changeWorkoutRef, isChangeWorkoutOpen, () => setIsChangeWorkoutOpen(false));
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

  // ── Voice State ────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);

  // ── Exercise Library & AI State ───────────────────────────────────────────
  const [isExerciseLibraryOpen, setIsExerciseLibraryOpen] = useState(false);
  const [postWorkoutSummary, setPostWorkoutSummary] = useState<{
    name: string;
    // Optional (FE-04): a past-workout log may genuinely have no
    // duration — the take modal renders '--' rather than a fake 45.
    durationMinutes?: number;
    durationSeconds?: number;
    exercises: WorkoutExercise[];
  } | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  // ── Plan modal state ───────────────────────────────────────────────────────
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isPlanPrefsOpen, setIsPlanPrefsOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlannedWorkout | null>(null);
  const [planToDelete, setPlanToDelete] = useState<PlannedWorkout | null>(null);
  const [isSuggestedModalOpen, setIsSuggestedModalOpen] = useState(false);
  const [isCoachBlockOpen, setIsCoachBlockOpen] = useState(false);
  const [coachBlockAtReview, setCoachBlockAtReview] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [targetScheduleDay, setTargetScheduleDay] = useState<DayOfWeek | undefined>(undefined);
  const [historyFilter, setHistoryFilter] = useState('');
  // Restore the sub-view (Plans vs History) the user was last in, and keep
  // it persisted so a refresh lands back on the same sub-view.
  const setLastTrainSubTab = useStore((state) => state.setLastTrainSubTab);
  const [trainSubTab, setTrainSubTab] = useState<'plans' | 'coach' | 'history'>(
    () => useStore.getState().lastTrainSubTab ?? 'plans'
  );
  const [selectedDetailsPlan, setSelectedDetailsPlan] = useState<PlannedWorkout | null>(null);

  useEffect(() => {
    setLastTrainSubTab(trainSubTab);
  }, [trainSubTab, setLastTrainSubTab]);

  // ── Progressive Disclosure UI States ──────────────────────────────────────
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null); const { dialogProps: toolsMenuDialogProps } = useModalA11y(toolsMenuRef, isToolsMenuOpen, () => setIsToolsMenuOpen(false));
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
    if (trainSubTab !== 'plans') {
      return registerBackHandler(() => {
        setTrainSubTab('plans');
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
    if (isCoachBlockOpen) {
      return registerBackHandler(() => { setIsCoachBlockOpen(false); return true; }, 100);
    }
  }, [isCoachBlockOpen, registerBackHandler]);

  useEffect(() => {
    if (isReviewOpen) {
      return registerBackHandler(() => { setIsReviewOpen(false); return true; }, 100);
    }
  }, [isReviewOpen, registerBackHandler]);

  useEffect(() => {
    if (isDebriefOpen) {
      return registerBackHandler(() => { setIsDebriefOpen(false); return true; }, 100);
    }
  }, [isDebriefOpen, registerBackHandler]);

  // Plateau proposals for coach-managed lifts are (re)built when the
  // Train tab mounts — cheap, deterministic, and dismissal-safe (the
  // engine never re-proposes a dismissed change). The weekly review for
  // the last completed week is generated the same way.
  useEffect(() => {
    refreshPlateauProposals();
    refreshWeeklyReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    toast.success(t('toast.workoutResumed'), t('toast.titleWorkoutRestored'));
  };

  // "Start Workout" on Home saves a fresh draft and navigates here — a draft
  // created seconds ago with zero completed sets is a session being STARTED,
  // not resumed. Open it immediately instead of making the user hunt for a
  // Resume button behind an alarming "IN-PROGRESS DETECTED" banner.
  const autoStartRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeWorkoutDraft && !isModalOpen && autoStartRef.current !== activeWorkoutDraft.savedAt) {
      const hasWork = activeWorkoutDraft.exercises.some((e) =>
        (e.sets || []).some((s) => isSetCompleted(s) || s.status === 'skipped')
      );
      const ageMs = Date.now() - new Date(activeWorkoutDraft.savedAt).getTime();
      if (!hasWork && ageMs < 120000) {
        autoStartRef.current = activeWorkoutDraft.savedAt;
        handleResumeWorkout();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkoutDraft, isModalOpen]);

  const handleDiscardDraft = () => {
    // UX #1: discarding used to be instant and irreversible — a stray
    // tap erased an in-progress workout draft. Now the toast carries
    // Undo (6s lifetime, same pattern as plan deletion): the captured
    // draft + plan linkage are restored exactly.
    const capturedDraft = activeWorkoutDraft;
    const capturedPlan = startedFromPlan;
    const capturedPlanId = startedFromPlanId;
    clearWorkoutDraft();
    setStartedFromPlan(null);
    setStartedFromPlanId(null);
    toast.showToast('info', t('toast.draftDiscarded'), t('toast.titleDraftCleared'), undefined, {
      label: t('common.undo'),
      onAction: () => {
        if (capturedDraft) saveWorkoutDraft(capturedDraft);
        setStartedFromPlan(capturedPlan);
        setStartedFromPlanId(capturedPlanId);
      },
    });
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
        rpe: s.rpe,
        prescribedWeight: s.weight,
        prescribedReps: s.reps,
        prescribedRpe: s.rpe,
        prescribedUnit: s.unit || userUnit,
      })),
    }));
    setExercises(clonedExercises);
    setDate(getLocalTodayStr());
    setStartedFromPlan(`Repeated (${last.date})`);
    setIsModalOpen(true);
    toast.success(clonedExercises.length === 1 ? t('toast.lastSessionLoadedOne') : t('toast.lastSessionLoadedMany', { count: clonedExercises.length }), t('toast.titleWorkoutLoaded'));
  };

  // Voice logging goes through the shared recognizer in lib/voice-logger:
  // Web Speech in browsers, the native OS recognizer inside the app
  // (Android WebView has no Web Speech API). Transcripts stream into
  // pageVoiceTranscriptRef and are parsed once when the session ends.
  const pageVoiceRecognizerRef = useRef<any>(null);
  const pageVoiceTranscriptRef = useRef('');
  const pageVoiceHandledRef = useRef(false);

  const processPageVoiceTranscript = (transcript: string) => {
    const parsed = parseVoiceWorkout(transcript, availableExercises);
    if (parsed) {
      setExercises((prev) => [
        ...prev.filter((e) => e.name.trim()),
        {
          name: parsed.exerciseName,
          sets: parsed.sets.map((s) => ({ ...s, unit: userUnit })),
        },
      ]);
      toast.success(t('toast.voiceLogged', { exercise: parsed.exerciseName, sets: parsed.sets.map((s) => `${s.weight}×${s.reps}`).join(', ') }), t('toast.titleVoiceAdded'));
    } else {
      toast.error(t('toast.voiceParseFailed', { transcript }), t('toast.titleVoiceError'));
    }
  };

  const toggleVoiceLogging = () => {
    if (typeof window === 'undefined') return;

    if (isListening) {
      // Stop now — the recognizer's onEnd parses the final transcript.
      try {
        pageVoiceRecognizerRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      toast.error(t('toast.voiceUnsupportedBrowser'), t('toast.titleVoiceLogging'));
      return;
    }

    try {
      pageVoiceTranscriptRef.current = '';
      pageVoiceHandledRef.current = false;
      try {
        pageVoiceRecognizerRef.current?.abort();
      } catch {}

      const recognizer = createSpeechRecognizer({
        lang: 'en-US',
        onResult: (text: string) => {
          pageVoiceTranscriptRef.current = text;
        },
        onError: (err: string) => {
          setIsListening(false);
          if (err === 'not-allowed' || err === 'service-not-allowed') {
            toast.error(isNativePlatform() ? t('toast.voiceMicNative') : t('toast.voiceMicBrowser'), t('toast.titleVoiceLogging'));
          } else if (err === 'unavailable') {
            toast.error(t('toast.voiceUnavailableDevice'), t('toast.titleVoiceLogging'));
          }
        },
        onEnd: () => {
          setIsListening(false);
          const transcript = pageVoiceTranscriptRef.current.trim();
          if (transcript && !pageVoiceHandledRef.current) {
            pageVoiceHandledRef.current = true;
            processPageVoiceTranscript(transcript);
          }
        },
      });

      if (!recognizer) {
        toast.error(t('toast.voiceUnsupportedBrowser'), t('toast.titleVoiceLogging'));
        return;
      }

      pageVoiceRecognizerRef.current = recognizer;
      recognizer.start();
      setIsListening(true);
      toast.info(t('toast.voiceListening'), t('toast.titleVoiceLogging'));
    } catch {
      setIsListening(false);
    }
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
    toast.success(t('toast.exerciseAdded', { name: exerciseName }), t('toast.titleExerciseAdded'));
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
    // %1RM mode (opt-in per plan): suggested loads for main compounds.
    const percentSuggestions =
      plan.intensityMode === 'percent'
        ? buildPercentSuggestions(plan, userPrs, useStore.getState().workouts, userUnit)
        : {};
    // SIM-P3-04: never start silently without the loads the mode
    // promises — say why when no suggestion could be built.
    if (plan.intensityMode === 'percent' && Object.keys(percentSuggestions).length === 0) {
      toast.info(t('plan.intensityNoData'), t('plan.intensityPercent'));
    }
    const percentWeightsByIndex: Record<number, number[]> = {};
    for (const [idx, s] of Object.entries(percentSuggestions)) {
      percentWeightsByIndex[Number(idx)] = s.weights;
    }
    const preFilledExercises = createWorkoutExercisesFromPlan(plan, {
      userUnit,
      userPrs,
      applications,
      percentWeightsByIndex,
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
            toast.info(t('toast.restReady'), t('toast.titleSetReady'));
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
      toast.error(t('toast.emptyWorkout'), t('toast.titleEmptyWorkout'));
      return;
    }

    const workoutId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `w_${Date.now()}`;

    // Record only what was actually performed or explicitly skipped.
    // Never fall back to the full plan: an interrupted session with zero
    // completed sets is saved with zero sets, not phantom planned ones.
    const exercisesToSave = getExecutedExercises(validExercises);

    // Honest denominator for adherence: count prescribed sets in the FULL
    // session (before filtering to executed), so finishing 1 of 18 sets
    // reports 1/18 — not a re-baselined 1/1 = 100%.
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

    const sessionDurationSeconds = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
    const durationMin = Math.round(sessionDurationSeconds / 60);

    const newWorkout: WorkoutEntry = {
      id: workoutId,
      date,
      name: startedFromPlan || undefined,
      planId: startedFromPlanId || undefined,
      plannedTotalSets,
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
          const isFirstExposure = existingPRs.length === 0;
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
            notes: isFirstExposure ? 'Baseline established from first session' : 'Auto-detected from workout session',
          });
          // Only celebrate as a "New PR" when there's a baseline to beat.
          // First-exposure sets establish the baseline silently.
          if (!isFirstExposure) {
            newPRCount++;
          }
        }
      }
    }

    if (newPRCount > 0) {
      toast.success(newPRCount === 1 ? t('toast.newPRsOne') : t('toast.newPRsMany', { count: newPRCount }), t('toast.titleNewPR'));
    } else if (hasCompletedSets) {
      toast.success(exercisesToSave.length === 1 ? t('toast.workoutLoggedOne') : t('toast.workoutLoggedMany', { count: exercisesToSave.length }), t('toast.titleWorkoutSaved'));
    } else {
      toast.info(exercisesToSave.length === 1 ? t('toast.interruptedSavedOne') : t('toast.interruptedSavedMany', { count: exercisesToSave.length }), t('toast.titleInterruptedSaved'));
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
        toast.error(t('toast.duplicatePlanName', { name: planData.name }), t('toast.titleDuplicateName'));
        return;
      }
      updatePlannedWorkout(editingPlan.id, {
        ...editingPlan,
        name: planData.name,
        exercises: planData.exercises,
        intensityMode: planData.intensityMode,
      });
      toast.success(t('toast.planUpdated', { name: planData.name }), t('toast.titlePlanSaved'));
      // If the edited plan is open in the detail view, refresh it so the
      // view reflects the saved changes instead of the stale snapshot.
      if (selectedDetailsPlan && selectedDetailsPlan.id === editingPlan.id) {
        const refreshed = useStore.getState().plannedWorkouts.find((p) => p.id === editingPlan.id);
        if (refreshed) setSelectedDetailsPlan(refreshed);
      }
    } else {
      const newPlan: PlannedWorkout = {
        id: safeRandomId('plan'),
        createdAt: new Date().toISOString(),
        name: planData.name,
        exercises: planData.exercises,
        intensityMode: planData.intensityMode,
      };
      // The store auto-renames on collision ("X (Copy)") instead of overwriting.
      const nameTaken = plannedWorkouts.some(
        (p) => p.name.toLowerCase() === planData.name.toLowerCase()
      );
      addPlannedWorkout(newPlan);
      toast.success(nameTaken ? t('toast.planCreatedCopy', { name: planData.name }) : t('toast.planCreated', { name: planData.name }), t('toast.titlePlanCreated'));
    }
    setEditingPlan(null);
  };

  const handleEditPlan = (plan: PlannedWorkout) => {
    setEditingPlan(plan);
    setIsPlanModalOpen(true);
  };

  const handleDeletePlan = (plan: PlannedWorkout) => {
    // Ask for confirmation first (modal below); warn when a paused session
    // draft references this plan.
    setPlanToDelete(plan);
  };

  const confirmDeletePlan = async () => {
    if (!planToDelete) return;
    const plan = planToDelete;
    // F19 (audit): guard FIRST, before the snapshot/draft-unlink below
    // — a plan deleted in a follower tab never reached storage and came
    // back after reload behind a success toast. On failure, delete
    // nothing and keep the confirm modal open for retry.
    const willPersist = await ensureDeleteWillPersist();
    if (!willPersist) {
      toast.error(t('toast.deleteNotSaved'), t('toast.titleDeleteNotSaved'));
      return;
    }
    // QA4-014: snapshot index + schedule + tombstones BEFORE the delete
    // rewires them, so the toast's Undo can restore the exact prior
    // state. (The draft unlink below is NOT reverted by undo — the
    // draft's logged sets are kept; it just stays unlinked.)
    const st = useStore.getState();
    const planIndex = st.plannedWorkouts.findIndex((p) => p.id === plan.id);
    const prevSchedule = st.weeklySchedule;
    const prevDeletedPlanIds = [...st.deletedPlanIds];
    // Unlink the in-progress draft from the deleted plan so the resume banner
    // never references a plan that no longer exists. The logged sets are kept.
    if (
      activeWorkoutDraft &&
      (activeWorkoutDraft.startedFromPlanId === plan.id ||
        activeWorkoutDraft.planId === plan.id)
    ) {
      saveWorkoutDraft({
        ...activeWorkoutDraft,
        startedFromPlan: null,
        startedFromPlanId: null,
        planId: undefined,
      });
    }
    deletePlannedWorkout(plan.id);
    toast.showToast('info', `Plan "${plan.name}" deleted.`, 'Plan Removed', undefined, {
      label: 'Undo',
      onAction: () =>
        useStore.getState().restorePlannedWorkout(plan, planIndex, prevSchedule, prevDeletedPlanIds),
    });
    setPlanToDelete(null);
    // If the deleted plan was open in the detail view, close that view too.
    if (selectedDetailsPlan && selectedDetailsPlan.id === plan.id) {
      setSelectedDetailsPlan(null);
    }
  };

  const handleDuplicatePlan = (plan: PlannedWorkout) => {
    const duplicatedPlan: PlannedWorkout = {
      id: safeRandomId('plan'),
      createdAt: new Date().toISOString(),
      name: `${plan.name} (Copy)`,
      exercises: plan.exercises.map(e => ({ ...e })),
    };
    addPlannedWorkout(duplicatedPlan);
    toast.success(t('toast.planDuplicated', { name: plan.name }), t('toast.titlePlanDuplicated'));
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    // Progressive prompt (simplified onboarding): experience / equipment /
    // days are asked the first time a plan is built, not during
    // onboarding. Once asked — answered or skipped — plans open directly.
    let asked = false;
    try {
      asked = window.localStorage.getItem('ascend_plan_prefs_asked_v1') === '1';
    } catch {}
    if (!asked) {
      setIsPlanPrefsOpen(true);
      return;
    }
    setIsPlanModalOpen(true);
  };

  const handlePlanPrefsDone = () => {
    try {
      window.localStorage.setItem('ascend_plan_prefs_asked_v1', '1');
    } catch {}
    setIsPlanPrefsOpen(false);
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

  // ─── Screen 4 Figma Blueprint Helpers ─────────────────────────────────────
  const splitLabel = useMemo(() => {
    // FND-02: pinned scheduled-day definition — a day counts only when
    // its plan still exists, matching the adherence denominator.
    const scheduledDaysCount = getScheduledPlanEntries(weeklySchedule, plannedWorkouts).length;
    const days = scheduledDaysCount > 0 ? scheduledDaysCount : (trainingProfile?.daysPerWeek || 4);
    const splitType = trainingProfile?.preferredSplit === 'push_pull_legs' ? 'PUSH / PULL / LEGS' : trainingProfile?.preferredSplit === 'bro_split' ? 'BRO SPLIT' : 'UPPER / LOWER';
    return `${days}-DAY ${splitType}`;
  }, [weeklySchedule, plannedWorkouts, trainingProfile]);

  const currentWeekDateRange = useMemo(() => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startMonth = startOfWeek.toLocaleDateString(dateLocale, { month: 'short' });
    const endMonth = endOfWeek.toLocaleDateString(dateLocale, { month: 'short' });
    return startMonth === endMonth
      ? `${startMonth} ${startOfWeek.getDate()}–${endOfWeek.getDate()}`
      : `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}`;
  }, [dateLocale]);

  const weeklyScheduleStats = useMemo(() => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const weekWorkouts = workouts.filter((w) => parseLocalDate(w.date) >= startOfWeek);
    const trainedDates = new Set(weekWorkouts.map((w) => w.date.split('T')[0]));

    // FND-02: pinned scheduled-day definition — a day counts only when
    // its plan still exists, matching the adherence denominator.
    const scheduledDaysCount = getScheduledPlanEntries(weeklySchedule, plannedWorkouts).length;
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

  // The active routine is always one of the USER's own plans (QA4-023:
  // Train shows user plans only; no template surfaces remain here).
  const activeRoutinePlan = useMemo(() => {
    if (todaySessionInfo.plannedWorkoutId) {
      const found = plannedWorkouts.find((p) => p.id === todaySessionInfo.plannedWorkoutId);
      if (found) return found;
    }
    return plannedWorkouts[0] || null;
  }, [todaySessionInfo.plannedWorkoutId, plannedWorkouts]);

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
      // SIM-P2-19: date-only strings parsed as UTC midnight used to
      // shift the day for IST evenings; parseLocalDate pins local noon.
      const past = parseLocalDate(dateStr);
      past.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return t('workout.todayRel');
      if (diffDays === 1) return t('workout.yesterdayRel');
      if (diffDays > 1 && diffDays < 7) return t('workout.daysAgoRel', { days: diffDays });
      return past.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

    // NOTE: the plan detail view replaces the main list render, but the modals
  // below MUST stay mounted — Share/Edit/Delete are all reachable from the
  // detail view's top bar. (Previously the early return skipped them, so
  // tapping Share/Edit silently armed the modal state and it popped open
  // only after going Back — and Delete had no entry point at all.)
  if (selectedDetailsPlan && !isModalOpen) {
    return (
      <>
        <WorkoutDetailsView
          plan={selectedDetailsPlan}
          onBack={() => setSelectedDetailsPlan(null)}
          onStart={(p) => {
            setSelectedDetailsPlan(null);
            handleStartPlan(p);
          }}
          onEdit={handleEditPlan}
          onShare={(p) => setSharingPlan(p)}
          onDelete={(p) => setPlanToDelete(p)}
        />

        {/* ── Plan Delete Confirmation (also reachable from detail view) ─── */}
        {/* NOTE: these overlays must sit above the detail view itself (z-[60]),
            so each is wrapped in a z-[70] stacking context. Without this the
            modals render *behind* the detail page. */}
        <div className="relative z-[70]">
          <ConfirmationModal
            isOpen={!!planToDelete}
            onClose={() => setPlanToDelete(null)}
            onConfirm={confirmDeletePlan}
            title="Delete this plan?"
            message={
              planToDelete &&
              activeWorkoutDraft &&
              (activeWorkoutDraft.startedFromPlanId === planToDelete.id ||
                activeWorkoutDraft.planId === planToDelete.id)
                ? `"${planToDelete.name}" has a paused session. Deleting it will unlink the in-progress draft (your logged sets are kept). You can undo the deletion right after.`
                : planToDelete
                  ? `"${planToDelete.name}" will be deleted. You can undo right after deleting.`
                  : ''
            }
            confirmText="Delete Plan"
            cancelText="Keep"
            variant="danger"
          />
        </div>

        {/* ── Plan Create/Edit Modal (also reachable from detail view) ───── */}
        <div className="relative z-[70]">
          <PlanModal
            isOpen={isPlanModalOpen}
            onClose={() => { setIsPlanModalOpen(false); setEditingPlan(null); }}
            initial={editingPlan}
            availableExercises={availableExercises}
            userUnit={userUnit}
            defaultTargetReps={defaultTargetReps}
            onSave={handleSavePlan}
          />
        </div>

        {/* ── Share Program Modal (also reachable from detail view) ───────── */}
        <div className="relative z-[70]">
          <ShareProgramModal
            plan={sharingPlan}
            isOpen={Boolean(sharingPlan)}
            onClose={() => setSharingPlan(null)}
          />
        </div>

        {/* ── Coach Block Modal (also reachable from detail view) ────────── */}
        <div className="relative z-[70]">
          <CoachBlockModal
            isOpen={isCoachBlockOpen}
            onClose={() => setIsCoachBlockOpen(false)}
            startAtReview={coachBlockAtReview}
          />
        </div>
      </>
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
                className="w-11 h-11 rounded-full bg-bg-card border border-border/80 flex items-center justify-center text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
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
            {workoutMode === 'advanced' && (
              <button
                type="button"
                onClick={() => setIsPlateModalOpen(true)}
                className="w-11 h-11 rounded-full bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                title={t('tools.plateTitle')}
                aria-label={t('tools.plateTitle')}
              >
                <Dumbbell className="w-4 h-4 text-accent" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsToolsMenuOpen(true)}
              className="w-11 h-11 rounded-full bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
              title={t('tools.title')}
              aria-label={t('tools.title')}
            >
              <SlidersHorizontal className="w-4 h-4 text-accent" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Segmented Control: Plans + Coach + History ── */}
      <div role="tablist" aria-label="Train navigation" className="segmented-control" onKeyDown={tabListKeyDown((i) => setTrainSubTab((['plans', 'coach', 'history'] as const)[i]))}>
        <button
          type="button"
          role="tab"
          aria-selected={trainSubTab === 'plans'}
          onClick={() => setTrainSubTab('plans')}
          className={`segmented-item ${trainSubTab === 'plans' ? 'active' : ''}`}
        >
          {t('train.plans')} {plannedWorkouts.length > 0 && `(${plannedWorkouts.length})`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={trainSubTab === 'coach'}
          onClick={() => setTrainSubTab('coach')}
          className={`segmented-item ${trainSubTab === 'coach' ? 'active' : ''}`}
        >
          {t('train.coach')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={trainSubTab === 'history'}
          onClick={() => setTrainSubTab('history')}
          className={`segmented-item ${trainSubTab === 'history' ? 'active' : ''}`}
        >
          {t('train.history')}
        </button>
      </div>

      {/* ── TAB 1: PLANS (user plans only — pre-made templates were
          removed per the standing Train decision, QA4-023) ── */}
      {trainSubTab === 'plans' && (
        <div className="space-y-4 animate-fade-in">
      {activeWorkoutDraft && !isModalOpen && (
        <div className="card p-3.5 bg-bg-card border border-accent/40 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <FastForward className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-text-primary block font-sans">
                Workout in progress
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

      {/* Weekly review row (PR-C) — block management now lives in the Coach tab */}
        {weeklyReviews.length > 0 && (
          <button
            type="button"
            onClick={() => setIsReviewOpen(true)}
            className="card w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                {t('weeklyReview.cardTitle')}
                {!weeklyReviews[weeklyReviews.length - 1].seen && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-label="New" />
                )}
              </p>
              <p className="text-2xs text-text-muted truncate">
                {weeklyReviews[weeklyReviews.length - 1].focus.headline}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
          </button>
        )}

      {/* ── Your Plans ── */}
      <section className="space-y-2.5" aria-label={t('train.yourPlans')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent" />
            <h2 className="section-title text-[0.6875rem] mb-0">{t('train.yourPlans').toUpperCase()}</h2>
            {plannedWorkouts.length > 0 && (
              <span className="text-2xs bg-accent/15 text-accent-text font-bold px-1.5 py-0.5 rounded-md font-mono">
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
          <div className="card p-4 sm:p-5 flex flex-col border-dashed border-border gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary">{t('workout.emptyPlansTitle')}</p>
                <p className="text-2xs text-text-muted">{t('workout.emptyPlansHint')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openCreatePlan}
                className="btn-primary py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 flex-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
                <span>{t('workout.createOwn')}</span>
              </button>
              {/* UX #14: the empty-plans card offered only "Create My Own",
                  although a suggestion modal already exists — a new user
                  with no plans had no one-tap suggestion path. */}
              <button
                type="button"
                onClick={() => setIsSuggestedModalOpen(true)}
                className="py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 flex-1 cursor-pointer rounded-xl bg-bg-secondary border border-border text-text-primary hover:border-accent/40 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>{t('workout.suggestOne')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {plannedWorkouts.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onStart={() => handleStartPlan(plan)}
                onEdit={() => handleEditPlan(plan)}
                onDelete={() => handleDeletePlan(plan)}
                onShare={() => setSharingPlan(plan)}
                onDuplicate={() => handleDuplicatePlan(plan)}
                onOpen={() => setSelectedDetailsPlan(plan)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Running (opt-in Couch to 5K program) ── */}
      <section className="space-y-2.5" aria-label={t('run.title')}>
        <div className="flex items-center gap-2">
          <Footprints className="w-4 h-4 text-accent" />
          <h2 className="section-title text-[0.6875rem] mb-0">{t('run.title').toUpperCase()}</h2>
        </div>
        <div className="card p-4 sm:p-5 space-y-3">
          {!runProgram ? (
            <>
              {/* Non-enrolled: one row until tapped — the full intro and
                  enroll button live behind it, so nothing is lost. */}
              <button
                type="button"
                onClick={() => setIsRunIntroOpen((o) => !o)}
                aria-expanded={isRunIntroOpen}
                className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
              >
                <span className="text-sm font-bold text-text-primary">{t('run.programName')}</span>
                <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${isRunIntroOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isRunIntroOpen && (
                <>
                  <div>
                    <p className="text-2xs text-text-muted mt-0.5 leading-relaxed">{t('run.programDesc')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => enrollRunProgram(getLocalTodayStr())}
                    className="btn-primary py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{t('run.startProgram')}</span>
                  </button>
                </>
              )}
            </>
          ) : runProgress.complete ? (
            <>
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-text-primary">{t('run.programName')}</p>
                  <p className="text-2xs text-text-muted">{t('run.programComplete')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => enrollRunProgram(getLocalTodayStr())}
                  className="py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 flex-1 cursor-pointer rounded-xl border border-accent/50 text-accent-text hover:bg-accent/10 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('run.restartProgram')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => leaveRunProgram()}
                  className="py-2 px-4 text-xs font-semibold text-text-muted hover:text-text-primary cursor-pointer"
                >
                  {t('run.leaveProgram')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-text-primary">{t('run.programName')}</p>
                  <p className="text-2xs text-text-muted mt-0.5">
                    {t('run.weekOf', { week: runProgress.currentWeek })} ·{' '}
                    {t('run.sessionsDone', { done: runProgress.completedCount, total: runProgress.totalCount })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => leaveRunProgram()}
                  className="text-2xs font-semibold text-text-muted hover:text-text-primary cursor-pointer shrink-0"
                >
                  {t('run.leaveProgram')}
                </button>
              </div>
              <div className="w-full h-2 rounded-full bg-border/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.round((runProgress.completedCount / runProgress.totalCount) * 100)}%` }}
                />
              </div>
              {runProgress.nextSession && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-bg-secondary border border-border/60">
                  <div className="min-w-0">
                    <p className="text-2xs font-bold text-text-muted uppercase tracking-wide">{t('run.nextRun')}</p>
                    <p className="text-xs font-semibold text-text-primary mt-0.5">
                      {t('run.sessionLabel', { week: runProgress.nextSession.week, day: runProgress.nextSession.day })}
                      {' · '}
                      {Math.round(sessionTotalSeconds(runProgress.nextSession) / 60)} min
                    </p>
                    <p className="text-2xs text-text-muted truncate">{describeSession(runProgress.nextSession)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRunSession(runProgress.nextSession)}
                    className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{t('run.startRun')}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
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
                    ? 'bg-accent text-accent-on border-accent'
                    : 'bg-bg-secondary border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {s >= 60 ? `${s / 60}m` : `${s}s`}
              </button>
            ))}
            <button
              type="button"
              onClick={togglePauseTimer}
              className="p-1.5 rounded-lg bg-accent text-accent-on hover:brightness-105 active:scale-95 transition-all"
              title={isRestRunning ? 'Pause' : 'Start'}
              aria-label={isRestRunning ? 'Pause' : 'Start'}
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
              {weeklyTargetOverride === 0
                ? `${weeklyScheduleStats.completedCount} completed this week`
                : `${weeklyScheduleStats.completedCount} of ${weeklyTargetOverride ?? weeklyScheduleStats.targetDays} completed this week`}
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
      {workoutMode === 'advanced' && (activePolicyDecision || (activeTrainingDecision && activeTrainingDecision.evidenceCount >= 1)) && (
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
              <span className="w-2 h-2 rounded-full bg-accent" />
              <h2 className="section-title text-[0.6875rem] mb-0 font-mono">
                {activePolicyDecision
                  ? 'TRAINING DECISION POLICY RECOMMENDATION'
                  : 'WHY DID MY PRESCRIPTION CHANGE?'}
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs text-text-muted font-mono hidden sm:inline">
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

      {/* ── TAB 2: HISTORY ─────────────────────────────────────────────────── */}
      {trainSubTab === 'history' && (
        <div className="space-y-4 animate-fade-in">

      {/* ── 4. RECENT WORKOUTS HISTORY (Item 27: Action-oriented empty state) ─ */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="section-title text-[0.6875rem] mb-0">RECENT WORKOUTS</h2>
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
                    aria-label={`Workout on ${parseLocalDate(workout.date).toLocaleDateString(dateLocale)}`}
                  >
                    <div>
                      <h3 className="font-semibold text-text-primary">
                        {parseLocalDate(workout.date).toLocaleDateString(dateLocale, {
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
                              <p className="font-medium text-accent-text text-sm">{ex.name}</p>
                              {effortSummary && effortSummary.averageRpe > 0 && (
                                <div className="flex items-center gap-1.5 text-2xs font-mono">
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
                                          className="text-[0.5625rem] font-mono px-1 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold"
                                          title="Skipped Set"
                                        >
                                          SKIPPED
                                        </span>
                                      )}
                                      {isNotAttempted && (
                                        <span
                                          className="text-[0.5625rem] font-mono px-1 py-0.5 rounded bg-bg-secondary text-text-muted border border-border/60 font-bold"
                                          title="Not Attempted"
                                        >
                                          NOT ATTEMPTED
                                        </span>
                                      )}
                                      {isDone && rpeVal !== undefined && (
                                        <span
                                          className="text-2xs font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent-text font-bold"
                                          title={`RPE @${rpeVal} (${rirVal} RIR - Reps in Reserve)`}
                                        >
                                          @{rpeVal}
                                        </span>
                                      )}
                                      {isDone && set.isPR && (
                                        <span
                                          className="text-[0.5625rem] font-mono px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold"
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
                              onClick={async () => {
                                // Follower-tab delete guard: a delete in a
                                // follower tab never reached storage, so it
                                // came back after reload behind a success
                                // toast. Claim leadership + rehydrate FIRST;
                                // on failure, error out and delete nothing
                                // (the confirm UI stays open for retry).
                                const willPersist = await ensureDeleteWillPersist();
                                if (!willPersist) {
                                  toast.error(t('toast.deleteNotSaved'), t('toast.titleDeleteNotSaved'));
                                  return;
                                }
                                // Snapshot AFTER the rehydrate above, so the
                                // toast's Undo restores the fresh state at
                                // the fresh index (mirrors the plan/meal undo).
                                const st = useStore.getState();
                                const workoutIndex = st.workouts.findIndex((w) => w.id === workout.id);
                                const snapshot = workoutIndex >= 0 ? st.workouts[workoutIndex] : workout;
                                deleteWorkout(workout.id);
                                setConfirmDeleteId(null);
                                toast.showToast('info', `Deleted workout session from ${workout.date}.`, 'Workout Removed', undefined, {
                                  label: 'Undo',
                                  onAction: () => useStore.getState().insertWorkoutAt(snapshot, workoutIndex),
                                });
                              }}
                              className="min-h-[44px] px-3 py-2 bg-danger text-white rounded text-xs font-semibold hover:bg-danger/90 transition-colors"
                            >
                              Yes, Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[44px] px-3 py-2 bg-bg-secondary text-text-muted rounded text-xs font-semibold hover:text-text-primary transition-colors"
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
                className="btn-secondary w-full py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-1.5 border border-border/80 hover:border-accent/40 text-text-secondary hover:text-accent-text transition-colors shadow-xs cursor-pointer"
              >
                <span>View All ({filteredWorkouts.length}) Workouts</span>
                <ChevronDown className="w-3.5 h-3.5 text-accent" />
              </button>
            )}

            {showAllHistory && !historyFilter.trim() && (
              <button
                type="button"
                onClick={() => setShowAllHistory(false)}
                className="text-2xs text-text-muted hover:text-accent-text mx-auto py-1.5 flex items-center gap-1 transition-colors cursor-pointer"
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

      {/* ── TAB: COACH (simple coach chat — designs today's session from
          the check-in; readiness comes from the existing coach engine) ── */}
      {trainSubTab === 'coach' && (
        <div className="space-y-4">
          <CoachChatTab
            onStartPlan={handleStartPlan}
            onBuildBlock={() => { setCoachBlockAtReview(false); setIsCoachBlockOpen(true); }}
            onReviewBlock={() => { setCoachBlockAtReview(true); setIsCoachBlockOpen(true); }}
            onOpenWeeklyReview={() => setIsReviewOpen(true)}
            onOpenDebrief={() => setIsDebriefOpen(true)}
          />
          {/* Conversational coach chat — an inline section below the
              guided check-in (not a drawer; the removed drawer stays
              removed). Answers are grounded in the user's own data. */}
          <CoachChatSection />
        </div>
      )}

      {/* ── Run Session Player ─────────────────────────────────────────── */}
      {activeRunSession && (
        <RunSessionScreen
          session={activeRunSession}
          onFinish={(entry) => {
            addWorkout(entry);
            setActiveRunSession(null);
            toast.success(t('run.saved'), entry.name);
          }}
          onCancel={() => setActiveRunSession(null)}
        />
      )}

      {/* ── Dedicated Fullscreen Active Workout Experience ──────────────── */}
      {isModalOpen && (
        <ActiveWorkoutScreen
          initialExercises={exercises}
          workoutName={startedFromPlan || 'Workout Session'}
          planId={startedFromPlanId || undefined}
          initialSessionStartTime={sessionStartTime}
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
              toast.success(newPRsCount === 1 ? t('toast.newPRsOne') : t('toast.newPRsMany', { count: newPRsCount }), t('toast.titleNewPR'));
            } else {
              toast.success(workoutEntry.exercises.length === 1 ? t('toast.workoutLoggedOne') : t('toast.workoutLoggedMany', { count: workoutEntry.exercises.length }), t('toast.titleWorkoutSaved'));
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

      {/* ── Plan Delete Confirmation ───────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={!!planToDelete}
        onClose={() => setPlanToDelete(null)}
        onConfirm={confirmDeletePlan}
        title="Delete this plan?"
        message={
          planToDelete &&
          activeWorkoutDraft &&
          (activeWorkoutDraft.startedFromPlanId === planToDelete.id ||
            activeWorkoutDraft.planId === planToDelete.id)
            ? `"${planToDelete.name}" has a paused session. Deleting it will unlink the in-progress draft (your logged sets are kept). You can undo the deletion right after.`
            : planToDelete
              ? `"${planToDelete.name}" will be deleted. You can undo right after deleting.`
              : ''
        }
        confirmText="Delete Plan"
        cancelText="Keep"
        variant="danger"
      />

      {/* ── First-plan progressive prompt (simplified onboarding) ──────── */}
      <PlanPrefsPrompt isOpen={isPlanPrefsOpen} onDone={handlePlanPrefsDone} />

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
            // FE-04 (audit-3): show the workout the user actually
            // logged — its real name and duration. This handler used
            // to substitute the literal 'Completed Workout' and a
            // fabricated 45 minutes regardless of the entry.
            name: entry.name || entry.exercises[0]?.name || 'Completed Workout',
            durationMinutes: entry.durationMinutes,
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

      {/* Post-Workout Coach's Take Modal — a coach surface: with Coach
          off in Settings it must not auto-appear after every workout. */}
      {postWorkoutSummary && coachEnabled && (
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

      {/* Coach Block Modal (PR-B) */}
      <CoachBlockModal
        isOpen={isCoachBlockOpen}
        onClose={() => setIsCoachBlockOpen(false)}
        startAtReview={coachBlockAtReview}
      />

      {/* Weekly Review + Block Debrief Modals (PR-C) */}
      <CoachWeeklyReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        review={weeklyReviews[weeklyReviews.length - 1] ?? null}
      />
      <BlockDebriefModal
        isOpen={isDebriefOpen}
        onClose={() => setIsDebriefOpen(false)}
        block={coachBlocks.activeBlock}
        onStartNextBlock={() => { setCoachBlockAtReview(false); setIsCoachBlockOpen(true); }}
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
        <div ref={changeWorkoutRef} {...changeWorkoutDialogProps} className="modal-overlay" onClick={() => setIsChangeWorkoutOpen(false)}>
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
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
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
                    <span className="text-xs font-bold text-text-primary block group-hover:text-accent-text transition-colors">
                      Log Finished / Past Workout
                    </span>
                    <span className="text-2xs text-text-muted">
                      Already completed your session? Record weights and reps now
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
              </button>
              {/* My Workouts & Weekly Schedule */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-mono font-bold uppercase tracking-wider text-accent-text">
                    MY WORKOUTS &amp; SCHEDULE
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChangeWorkoutOpen(false);
                        setIsScheduleModalOpen(true);
                      }}
                      className="text-xs font-semibold text-text-muted hover:text-accent-text flex items-center gap-1 transition-colors"
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
                      className="text-xs font-semibold text-accent-text hover:underline flex items-center gap-1"
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
                              <span className="font-bold text-sm text-text-primary block group-hover:text-accent-text">
                                {plan.name}
                              </span>
                              {scheduledDays.length > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-bg-card border border-border text-2xs font-mono font-bold text-text-muted">
                                  {scheduledDays.join(', ')}
                                </span>
                              )}
                            </div>
                            {bodyParts.length > 0 ? (
                              <span className="text-2xs text-accent-text font-medium block mt-0.5">
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
                  <span>{t('train.startEmptyWorkout')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Training Tools & Actions Drawer / Sheet ── */}
      {isToolsMenuOpen && (
        <div ref={toolsMenuRef} {...toolsMenuDialogProps}
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
                <h3 className="font-bold text-text-primary text-base">{t('tools.title')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">{t('tools.plateTitle')}</h4>
                    <p className="text-2xs text-text-muted">{t('tools.plateHint')}</p>
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">{t('tools.scheduleTitle')}</h4>
                    <p className="text-2xs text-text-muted">{t('tools.scheduleHint')}</p>
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">{t('tools.libraryTitle')}</h4>
                    <p className="text-2xs text-text-muted">{t('tools.libraryHint')}</p>
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">{t('tools.pastTitle')}</h4>
                    <p className="text-2xs text-text-muted">{t('tools.pastHint')}</p>
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">{t('tools.buildTitle')}</h4>
                    <p className="text-2xs text-text-muted">{t('tools.buildHint')}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {/* Workout view — follows app density unless overridden (Stage 4) */}
            <div className="pt-3 border-t border-border/80 space-y-2">
              <div>
                <span className="text-xs font-bold text-text-primary block">{t('workout.viewMode')}</span>
                <span className="text-2xs text-text-muted">
                  {workoutMode === 'advanced' ? t('tools.viewAdvanced') : t('tools.viewSimple')}
                  {workoutModeOverride ? '' : ` · ${t('workout.viewAuto')}`}
                </span>
              </div>
              <SegmentedControl
                ariaLabel={t('workout.viewMode')}
                value={workoutModeOverride ?? 'auto'}
                options={[
                  { value: 'auto', label: t('workout.viewAuto') },
                  { value: 'beginner', label: t('workout.viewSimple') },
                  { value: 'advanced', label: t('workout.viewAdvanced') },
                ]}
                onChange={(v) => setUiPreferences({ workoutModeOverride: v === 'auto' ? null : v })}
              />
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
