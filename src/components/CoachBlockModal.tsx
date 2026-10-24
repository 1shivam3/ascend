"use client";

/**
 * CoachBlockModal — PR-B (§4.1/§4.3). Two steps, like a real coach's
 * process: a SHORT intake (prefilled from the profile + athlete model;
 * only gaps are asked), then the full block proposal WITH its
 * reasoning. Nothing is created until the athlete taps Approve (D3);
 * closing the modal keeps the proposal waiting in the Train tab.
 * Exercises can be removed in review — the edited copy is what gets
 * approved, and the store only honours an edit of the pending proposal.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { useToast } from './ui/Toast';
import {
  buildIntakePrefill,
  limitationChipId,
  validateIntake,
  LIMITATION_CHIPS,
  SESSION_LENGTH_OPTIONS,
  type BlockIntake,
} from '@/lib/block-intake';
import type { BlockProposal } from '@/lib/block-engine';
import { ATHLETE_GOAL_CONFIGS, type AthleteGoal } from '@/lib/types';
import type { EquipmentAccess } from '@/lib/workout-engine';
import { estimateSessionMinutes, MAX_WORKOUT_WEIGHT_KG } from '@/lib/workout-engine';
import { canonicalizeExerciseName } from '@/lib/workout-outcome-evidence';
import { CalendarRange, ChevronRight, Sparkles, Trash2, X } from 'lucide-react';

interface CoachBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open straight at the review step (from the pending-proposal banner). */
  startAtReview?: boolean;
}

type CoachBlockStringKey =
  | 'coachBlock.eqFullGym'
  | 'coachBlock.eqBarbell'
  | 'coachBlock.eqDumbbells'
  | 'coachBlock.eqBodyweight'
  | 'coachBlock.exp_beginner'
  | 'coachBlock.exp_intermediate'
  | 'coachBlock.exp_advanced'
  | 'coachBlock.week_build'
  | 'coachBlock.week_deload'
  | 'coachBlock.week_test';

const EQUIPMENT_OPTIONS: { id: EquipmentAccess; labelKey: CoachBlockStringKey }[] = [
  { id: 'full_gym', labelKey: 'coachBlock.eqFullGym' },
  { id: 'barbell_only', labelKey: 'coachBlock.eqBarbell' },
  { id: 'home_dumbbells', labelKey: 'coachBlock.eqDumbbells' },
  { id: 'bodyweight_only', labelKey: 'coachBlock.eqBodyweight' },
];

const EXPERIENCE_OPTIONS = ['beginner', 'intermediate', 'advanced'] as const;

const WEEKDAY_LABEL: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
        active
          ? 'bg-accent text-accent-on border-accent'
          : 'bg-bg-secondary text-text-secondary border-border hover:border-accent/50'
      }`}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-2xs font-mono font-bold uppercase tracking-wide text-text-muted block mb-1.5">
      {children}
    </span>
  );
}

export default function CoachBlockModal({ isOpen, onClose, startAtReview }: CoachBlockModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t } = useTranslation();
  const toast = useToast();

  const profile = useStore((s) => s.profile);
  const trainingProfile = useStore((s) => s.trainingProfile);
  const athleteModel = useStore((s) => s.athleteModel);
  const workouts = useStore((s) => s.workouts);
  const prs = useStore((s) => s.prs);
  const pendingProposal = useStore((s) => s.coachBlocks.pendingProposal);
  const weeklySchedule = useStore((s) => s.weeklySchedule);
  const plannedWorkouts = useStore((s) => s.plannedWorkouts);
  const proposeCoachBlock = useStore((s) => s.proposeCoachBlock);
  const approveBlockProposal = useStore((s) => s.approveBlockProposal);
  const dismissBlockProposal = useStore((s) => s.dismissBlockProposal);

  const [step, setStep] = useState<'intake' | 'review'>('intake');
  const [intake, setIntake] = useState<BlockIntake | null>(null);
  const [flaggedReasons, setFlaggedReasons] = useState<{ chipId: string; reason: string }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [edited, setEdited] = useState<BlockProposal | null>(null);
  const [expandedDay, setExpandedDay] = useState<number>(0);

  // (Re)seed whenever the modal opens: prefill is computed from the
  // CURRENT store, never cached from a previous open.
  useEffect(() => {
    if (!isOpen) return;
    const prefill = buildIntakePrefill({
      profile,
      trainingProfile,
      athleteModel,
      workouts,
      prs,
    });
    setIntake(prefill.intake);
    setFlaggedReasons(prefill.flaggedChips);
    setErrors([]);
    if (startAtReview && pendingProposal) {
      setEdited(pendingProposal);
      setStep('review');
    } else {
      setEdited(null);
      setStep('intake');
    }
    setExpandedDay(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const proposal = edited ?? pendingProposal;

  const scheduleChanges = useMemo(() => {
    if (!proposal) return [] as string[];
    return proposal.days
      .filter((d) => d.exercises.length > 0)
      .map((d) => {
        const current = weeklySchedule[d.weekday]?.workoutPlanId;
        const currentName = current
          ? plannedWorkouts.find((p) => p.id === current)?.name
          : null;
        return t('coachBlock.scheduleLine', {
          day: WEEKDAY_LABEL[d.weekday],
          plan: d.planName,
          replaced: currentName ? t('coachBlock.scheduleReplaces', { name: currentName }) : t('coachBlock.scheduleNew'),
        });
      });
  }, [proposal, weeklySchedule, plannedWorkouts, t]);

  if (!isOpen) return null;

  const handleGenerate = () => {
    if (!intake) return;
    const problems = validateIntake(intake);
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    const created = proposeCoachBlock(intake);
    setEdited(created);
    setStep('review');
    setExpandedDay(0);
  };

  const removeExercise = (dayIdx: number, exIdx: number) => {
    if (!proposal) return;
    const day = proposal.days[dayIdx];
    if (!day || day.exercises.length <= 1) return; // a day never empties
    const exercises = day.exercises.filter((_, i) => i !== exIdx);
    const remainingKeys = new Set(
      proposal.days.flatMap((d, di) =>
        (di === dayIdx ? exercises : d.exercises).map((e) => canonicalizeExerciseName(e.name))
      )
    );
    setEdited({
      ...proposal,
      days: proposal.days.map((d, di) => (di === dayIdx ? { ...d, exercises } : d)),
      schemes: proposal.schemes.filter((s) => remainingKeys.has(s.exerciseKey)),
    });
  };

  // SIM-P3-07: review used to be remove-only — a wrong load meant
  // rejecting the whole day or approving a bad number. Sets and load
  // are now editable in place; the day's time estimate recomputes.
  const editExercise = (dayIdx: number, exIdx: number, patch: { targetSets?: number; targetWeight?: number }) => {
    if (!proposal) return;
    const days = proposal.days.map((d, di) => {
      if (di !== dayIdx) return d;
      const exercises = d.exercises.map((e, ei) => (ei === exIdx ? { ...e, ...patch } : e));
      return { ...d, exercises, estimatedMinutes: estimateSessionMinutes({ exercises }) };
    });
    setEdited({ ...proposal, days });
  };

  const handleApprove = () => {
    if (!proposal) return;
    approveBlockProposal(proposal);
    toast.success(t('coachBlock.approvedMsg'), t('coachBlock.approvedTitle'));
    onClose();
  };

  const handleDiscard = () => {
    dismissBlockProposal();
    setEdited(null);
    onClose();
  };

  const toggleLimitation = (label: string) => {
    if (!intake) return;
    const has = intake.limitations.some((l) => l.toLowerCase() === label.toLowerCase());
    setIntake({
      ...intake,
      limitations: has
        ? intake.limitations.filter((l) => l.toLowerCase() !== label.toLowerCase())
        : [...intake.limitations, label],
    });
  };

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-lg w-full p-5 space-y-4 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-primary leading-tight">
                {t('coachBlock.title')}
              </h3>
              <p className="text-2xs text-text-muted font-mono">
                {step === 'intake' ? t('coachBlock.stepIntake') : t('coachBlock.stepReview')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'intake' && intake && (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">{t('coachBlock.intakeIntro')}</p>

            <div>
              <FieldLabel>{t('coachBlock.goal')}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(ATHLETE_GOAL_CONFIGS) as AthleteGoal[]).map((g) => (
                  <Chip
                    key={g}
                    active={intake.goal === g}
                    onClick={() => setIntake({ ...intake, goal: g })}
                  >
                    {ATHLETE_GOAL_CONFIGS[g].label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>{t('coachBlock.daysPerWeek')}</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {[2, 3, 4, 5, 6].map((d) => (
                    <Chip
                      key={d}
                      active={intake.daysPerWeek === d}
                      onClick={() => setIntake({ ...intake, daysPerWeek: d })}
                    >
                      {d}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>{t('coachBlock.sessionLength')}</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {SESSION_LENGTH_OPTIONS.map((m) => (
                    <Chip
                      key={m}
                      active={intake.sessionMinutes === m}
                      onClick={() => setIntake({ ...intake, sessionMinutes: m })}
                    >
                      {m}m
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <FieldLabel>{t('coachBlock.equipment')}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.id}
                    active={intake.equipment === opt.id}
                    onClick={() => setIntake({ ...intake, equipment: opt.id })}
                  >
                    {t(opt.labelKey)}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>{t('coachBlock.experience')}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {EXPERIENCE_OPTIONS.map((x) => (
                  <Chip
                    key={x}
                    active={intake.experience === x}
                    onClick={() => setIntake({ ...intake, experience: x })}
                  >
                    {t(`coachBlock.exp_${x}` as CoachBlockStringKey)}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>{t('coachBlock.limitations')}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {LIMITATION_CHIPS.map((chip) => (
                  <Chip
                    key={chip.id}
                    active={intake.limitations.some(
                      (l) => limitationChipId(l) === chip.id || l.toLowerCase() === chip.label.toLowerCase()
                    )}
                    onClick={() => toggleLimitation(chip.label)}
                  >
                    {chip.label}
                  </Chip>
                ))}
              </div>
              {flaggedReasons.map((f) => (
                <p key={f.chipId} className="text-2xs text-warning mt-1.5">
                  {f.reason}
                </p>
              ))}
              <p className="text-2xs text-text-muted mt-1.5">{t('coachBlock.limitationsHint')}</p>
            </div>

            <div>
              <FieldLabel>{t('coachBlock.topLifts')}</FieldLabel>
              <div className="space-y-1.5">
                {(intake.topLifts.length > 0
                  ? intake.topLifts
                  : (['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'] as const).map((name) => ({
                      name,
                      e1rmKg: 0,
                      source: 'entered' as const,
                    }))
                ).map((lift) => {
                  const existingIdx = intake.topLifts.findIndex(
                    (l) => l.name.toLowerCase() === lift.name.toLowerCase()
                  );
                  return (
                    <div key={lift.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-text-secondary capitalize">{lift.name}</span>
                      <label className="flex items-center gap-1 text-text-muted">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          placeholder="—"
                          value={existingIdx >= 0 ? Math.round(intake.topLifts[existingIdx].e1rmKg) || '' : ''}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v) || v < 0) return;
                            const entry = { name: lift.name, e1rmKg: v, source: 'entered' as const };
                            const topLifts =
                              existingIdx >= 0
                                ? intake.topLifts.map((l, li) => (li === existingIdx ? entry : l))
                                : [...intake.topLifts, entry];
                            setIntake({ ...intake, topLifts });
                          }}
                          className="w-20 bg-bg-secondary border border-border rounded-md px-2 py-1 text-right text-text-primary"
                          aria-label={`${lift.name} estimated 1RM in kg`}
                        />
                        kg {t('coachBlock.est1rm')}
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="text-2xs text-text-muted mt-1.5">{t('coachBlock.topLiftsHint')}</p>
            </div>

            {errors.length > 0 && (
              <div className="text-xs text-danger space-y-0.5">
                {errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}

            <button type="button" onClick={handleGenerate} className="btn-primary w-full py-2.5 font-bold">
              {t('coachBlock.buildButton')}
            </button>
          </div>
        )}

        {step === 'review' && proposal && (
          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-black text-text-primary tracking-tight">{proposal.name}</h4>
              <p className="text-xs text-text-secondary mt-1">{proposal.summary}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {proposal.weeks.map((w) => (
                  <span
                    key={w.index}
                    className={`text-2xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      w.type === 'deload'
                        ? 'bg-warning/15 text-warning'
                        : w.type === 'test'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-bg-secondary text-text-muted border border-border/60'
                    }`}
                  >
                    {t('coachBlock.weekLabel', { n: w.index })} · {t(`coachBlock.week_${w.type}` as CoachBlockStringKey)}
                  </span>
                ))}
              </div>
            </div>

            {proposal.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-1">
                {proposal.warnings.map((w, i) => (
                  <p key={i} className="text-2xs text-text-secondary">
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {proposal.days.map((day, di) => (
                <div key={day.planId || di} className="rounded-xl border border-border/70 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedDay(expandedDay === di ? -1 : di)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-bg-secondary cursor-pointer"
                    aria-expanded={expandedDay === di}
                  >
                    <span className="text-xs font-bold text-text-primary">
                      {day.label} · {WEEKDAY_LABEL[day.weekday]} · ~{day.estimatedMinutes}m
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 text-text-muted transition-transform ${expandedDay === di ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {expandedDay === di && (
                    <div className="px-3 py-2 space-y-2">
                      {day.exercises.map((ex, ei) => (
                        <div key={ei} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs text-text-primary font-semibold">
                              {ex.name}{' '}
                              <span className="font-mono text-text-muted font-normal">
                                {ex.targetSets}×{ex.targetReps}
                                {ex.targetWeight ? ` @ ${ex.targetWeight}${ex.targetUnit ?? ''}` : ''}
                                {ex.targetRpe ? ` · RPE ${ex.targetRpe}` : ''}
                              </span>
                            </p>
                            <p className="text-2xs text-text-muted">
                              {day.whyByExercise[canonicalizeExerciseName(ex.name)] ?? ''}
                            </p>
                            {/* SIM-P3-07: in-place sets/load editing. */}
                            <div className="flex items-center gap-3 pt-1">
                              <span className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => editExercise(di, ei, { targetSets: Math.max(1, (ex.targetSets || 3) - 1) })}
                                  disabled={(ex.targetSets || 3) <= 1}
                                  className="px-2 py-1 min-h-[44px] min-w-[44px] rounded-lg bg-bg-secondary border border-border text-text-primary font-bold disabled:opacity-30 cursor-pointer"
                                  aria-label={`Fewer sets for ${ex.name}`}
                                >
                                  −
                                </button>
                                <span className="text-2xs font-mono text-text-secondary min-w-[52px] text-center">
                                  {ex.targetSets || 3} sets
                                </span>
                                <button
                                  type="button"
                                  onClick={() => editExercise(di, ei, { targetSets: Math.min(10, (ex.targetSets || 3) + 1) })}
                                  disabled={(ex.targetSets || 3) >= 10}
                                  className="px-2 py-1 min-h-[44px] min-w-[44px] rounded-lg bg-bg-secondary border border-border text-text-primary font-bold disabled:opacity-30 cursor-pointer"
                                  aria-label={`More sets for ${ex.name}`}
                                >
                                  +
                                </button>
                              </span>
                              {typeof ex.targetWeight === 'number' && (() => {
                                const unit = ex.targetUnit || profile?.unit || 'kg';
                                const step = unit === 'lbs' ? 5 : 2.5;
                                const w = ex.targetWeight as number;
                                const cap = unit === 'lbs' ? Math.round(MAX_WORKOUT_WEIGHT_KG * 2.20462) : MAX_WORKOUT_WEIGHT_KG;
                                return (
                                  <span className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => editExercise(di, ei, { targetWeight: Math.max(0, Math.round((w - step) * 10) / 10) })}
                                      disabled={w <= 0}
                                      className="px-2 py-1 min-h-[44px] min-w-[44px] rounded-lg bg-bg-secondary border border-border text-text-primary font-bold disabled:opacity-30 cursor-pointer"
                                      aria-label={`Lighter load for ${ex.name}`}
                                    >
                                      −
                                    </button>
                                    <span className="text-2xs font-mono text-text-secondary min-w-[64px] text-center">
                                      {w}{unit}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => editExercise(di, ei, { targetWeight: Math.min(cap, Math.round((w + step) * 10) / 10) })}
                                      disabled={w >= cap}
                                      className="px-2 py-1 min-h-[44px] min-w-[44px] rounded-lg bg-bg-secondary border border-border text-text-primary font-bold disabled:opacity-30 cursor-pointer"
                                      aria-label={`Heavier load for ${ex.name}`}
                                    >
                                      +
                                    </button>
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExercise(di, ei)}
                            disabled={day.exercises.length <= 1}
                            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30 cursor-pointer shrink-0"
                            aria-label={`${t('coachBlock.removeExercise')} ${ex.name}`}
                            title={t('coachBlock.removeExercise')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div>
              <FieldLabel>{t('coachBlock.progressionTitle')}</FieldLabel>
              <div className="space-y-1">
                {proposal.schemes.slice(0, 8).map((s) => (
                  <p key={s.exerciseKey} className="text-2xs text-text-secondary">
                    <strong className="text-text-primary">{s.displayName}:</strong> {s.assumption}
                  </p>
                ))}
                {proposal.schemes.length > 8 && (
                  <p className="text-2xs text-text-muted">
                    {t('coachBlock.progressionMore', { count: proposal.schemes.length - 8 })}
                  </p>
                )}
              </div>
            </div>

            <div>
              <FieldLabel>
                <span className="inline-flex items-center gap-1">
                  <CalendarRange className="w-3 h-3" /> {t('coachBlock.scheduleTitle')}
                </span>
              </FieldLabel>
              <div className="space-y-0.5">
                {scheduleChanges.map((line, i) => (
                  <p key={i} className="text-2xs text-text-secondary">
                    {line}
                  </p>
                ))}
              </div>
              <p className="text-2xs text-text-muted mt-1">
                {t('coachBlock.startsOn', { date: proposal.startMonday })}
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleApprove} className="btn-primary flex-1 py-2.5 font-bold">
                {t('coachBlock.approveButton')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEdited(null);
                  setStep('intake');
                }}
                className="btn-secondary px-4 py-2.5 font-semibold"
              >
                {t('coachBlock.startOver')}
              </button>
            </div>
            <button
              type="button"
              onClick={handleDiscard}
              className="w-full text-center text-2xs text-text-muted hover:text-danger cursor-pointer"
            >
              {t('coachBlock.discard')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
