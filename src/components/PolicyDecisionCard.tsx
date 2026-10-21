'use client';

import React, { useState, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { TrainingDecisionRecord, Unit, validatePolicyDecisionApplication } from '@/lib/types';
import { useStore } from '@/lib/store';
import {
  Check,
  RotateCcw,
  AlertTriangle,
  Info,
  ShieldCheck,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  Sliders,
  HelpCircle,
  Calendar,
  CheckCheck,
} from 'lucide-react';
import { useToast } from './ui/Toast';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export interface PolicyDecisionCardProps {
  decision: TrainingDecisionRecord;
  userUnit?: Unit;
  onAccepted?: (decision: TrainingDecisionRecord) => void;
  onOverridden?: (decision: TrainingDecisionRecord) => void;
  onDismissed?: (decision: TrainingDecisionRecord) => void;
  onApplied?: (decision: TrainingDecisionRecord) => void;
}

export default function PolicyDecisionCard({
  decision,
  userUnit = 'kg',
  onAccepted,
  onOverridden,
  onDismissed,
  onApplied,
}: PolicyDecisionCardProps) {
  const { t } = useTranslation();
  const acceptPolicyDecision = useStore((state) => state.acceptPolicyDecision);
  const overridePolicyDecision = useStore((state) => state.overridePolicyDecision);
  const dismissPolicyDecision = useStore((state) => state.dismissPolicyDecision);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts);
  const policyDecisionApplications = useStore((state) => state.policyDecisionApplications);
  const applyPolicyDecisionToFuturePrescription = useStore(
    (state) => state.applyPolicyDecisionToFuturePrescription
  );
  const toast = useToast();

  const [isOverriding, setIsOverriding] = useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const applyModalRef = useRef<HTMLDivElement>(null); const { dialogProps: applyDialogProps } = useModalA11y(applyModalRef, isApplyModalOpen, () => setIsApplyModalOpen(false));
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedExerciseIndex, setSelectedExerciseIndex] = useState<number>(0);
  const [customWeight, setCustomWeight] = useState<number>(
    decision.userOverride?.customWeight ?? decision.proposedPrescription.weight
  );
  const [customReps, setCustomReps] = useState<number>(
    decision.userOverride?.customReps ?? decision.proposedPrescription.reps
  );
  const [overrideReason, setOverrideReason] = useState<string>(
    decision.userOverride?.overrideReason ?? ''
  );
  const [showEvidenceDetails, setShowEvidenceDetails] = useState<boolean>(false);

  const isPending = decision.status === 'pending';
  const isAccepted = decision.status === 'accepted';
  const isOverridden = decision.status === 'overridden';
  const isDismissed = decision.status === 'dismissed';
  const isApplied = Boolean(decision.appliedAt);
  const isApplicableAction =
    decision.ruleId !== 'SAFETY-01' &&
    decision.actionCategory !== 'review_required' &&
    decision.actionCategory !== 'insufficient_evidence';

  // Candidate plans containing this exercise (case-insensitive)
  const candidatePlans = (plannedWorkouts || []).filter((p) =>
    p.exercises.some(
      (ex) => ex.name.trim().toLowerCase() === decision.exerciseName.trim().toLowerCase()
    )
  );

  const currentSelectedPlan =
    plannedWorkouts?.find((p) => p.id === selectedPlanId) || candidatePlans[0];

  const matchingExercisesInSelectedPlan = currentSelectedPlan
    ? currentSelectedPlan.exercises
        .map((ex, idx) => ({ exercise: ex, index: idx }))
        .filter(
          ({ exercise }) =>
            exercise.name.trim().toLowerCase() === decision.exerciseName.trim().toLowerCase()
        )
    : [];

  const effectiveExerciseIndex =
    matchingExercisesInSelectedPlan.some((m) => m.index === selectedExerciseIndex)
      ? selectedExerciseIndex
      : (matchingExercisesInSelectedPlan[0]?.index ?? 0);

  const selectedTargetExercise = currentSelectedPlan?.exercises[effectiveExerciseIndex];

  const validationResult =
    currentSelectedPlan && selectedTargetExercise
      ? validatePolicyDecisionApplication(
          decision,
          currentSelectedPlan,
          effectiveExerciseIndex,
          selectedTargetExercise.id,
          policyDecisionApplications
        )
      : null;

  const appliedPlanName =
    decision.appliedTargetPlanName ||
    (decision.appliedTargetPlanId
      ? plannedWorkouts?.find((p) => p.id === decision.appliedTargetPlanId)?.name ||
        decision.appliedTargetPlanId
      : 'workout plan');

  const handleOpenApplyModal = () => {
    if (candidatePlans.length > 0) {
      const first = candidatePlans[0];
      setSelectedPlanId(first.id);
      const firstMatch = first.exercises.findIndex(
        (ex) => ex.name.trim().toLowerCase() === decision.exerciseName.trim().toLowerCase()
      );
      setSelectedExerciseIndex(firstMatch >= 0 ? firstMatch : 0);
    } else {
      setSelectedPlanId('');
      setSelectedExerciseIndex(0);
    }
    setIsApplyModalOpen(true);
  };

  const handleConfirmApply = () => {
    if (!currentSelectedPlan) {
      toast.error(t('pdc.toastNoPlan'), t('pdc.toastAppFailed'));
      return;
    }

    const res = applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: currentSelectedPlan.id,
      targetExerciseIndex: effectiveExerciseIndex,
      targetExerciseId: selectedTargetExercise?.id,
      actionSource: 'athlete_confirmed',
    });

    if (res.success) {
      toast.success(res.message, t('pdc.toastUpdated'));
      setIsApplyModalOpen(false);
      if (onApplied) {
        onApplied({
          ...decision,
          appliedAt: res.auditRecord?.appliedAt || new Date().toISOString(),
          appliedTargetPlanId: currentSelectedPlan.id,
          appliedTargetExerciseName: selectedTargetExercise?.name || decision.exerciseName,
          appliedTargetExerciseId: selectedTargetExercise?.id,
          appliedTargetExerciseIndex: effectiveExerciseIndex,
        });
      }
    } else {
      toast.error(res.message, t('pdc.toastAppFailed'));
    }
  };

  const handleAccept = () => {
    if (!isPending) {
      toast.info(t('pdc.toastAlready', { status: decision.status }), t('pdc.toastUnavailable'));
      return;
    }
    acceptPolicyDecision(decision.id);
    toast.success(
      t('pdc.toastAccepted', { name: decision.exerciseName, weight: decision.proposedPrescription.weight, unit: userUnit, reps: decision.proposedPrescription.reps }),
      t('pdc.toastAcceptedT')
    );
    if (onAccepted) {
      onAccepted({
        ...decision,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      });
    }
  };

  const handleSaveOverride = () => {
    if (!isPending) {
      toast.info(t('pdc.toastAlready', { status: decision.status }), t('pdc.toastUnavailable'));
      setIsOverriding(false);
      return;
    }

    if (customWeight <= 0 || customReps <= 0) {
      toast.error(t('pdc.toastInvalid'), t('pdc.toastInvalidT'));
      return;
    }

    overridePolicyDecision(decision.id, {
      customWeight,
      customReps,
      reason: overrideReason.trim() || undefined,
    });

    toast.info(
      t('pdc.toastOverridden', { name: decision.exerciseName, weight: customWeight, unit: userUnit, reps: customReps }),
      t('pdc.toastOverriddenT')
    );
    setIsOverriding(false);
    if (onOverridden) {
      onOverridden({
        ...decision,
        status: 'overridden',
        userOverride: {
          customWeight,
          customReps,
          overrideReason: overrideReason.trim() || undefined,
          overriddenAt: new Date().toISOString(),
        },
      });
    }
  };

  const handleDismiss = () => {
    if (!isPending) {
      toast.info(t('pdc.toastAlready', { status: decision.status }), t('pdc.toastUnavailable'));
      return;
    }
    dismissPolicyDecision(decision.id);
    toast.info(t('pdc.toastDismissed', { name: decision.exerciseName }), t('pdc.toastDismissedT'));
    if (onDismissed) {
      onDismissed({
        ...decision,
        status: 'dismissed',
        dismissedAt: new Date().toISOString(),
      });
    }
  };

  // Determine session label from ID or audit
  const sessionDate = decision.evidenceAudit.lastExposureDate
    ? decision.evidenceAudit.lastExposureDate.split('T')[0]
    : decision.createdAt.split('T')[0];

  const hasCurrentTargets =
    decision.currentPrescription.weight !== undefined &&
    decision.currentPrescription.reps !== undefined;

  const hasLimitations = decision.evidenceAudit.limitations.length > 0;

  return (
    <Card
      variant="default"
      padding="md"
      className="space-y-3.5 font-sans border-border/80 text-left relative overflow-hidden"
      role="region"
      aria-label={t('pdc.aria', { name: decision.exerciseName })}
    >
      {/* ── Top Header: Exercise, Session Date, Status Badge ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent">
              POLICY V{decision.policyVersion}
            </span>
            <span className="text-[10px] font-mono text-text-muted">
              • {t('pdc.session', { date: sessionDate })}
            </span>
          </div>
          <h3 className="text-base font-black font-display text-text-primary tracking-tight">
            {decision.exerciseName.toUpperCase()}
          </h3>
        </div>

        {/* Status & Action Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status Badge with distinct text & icon */}
          {isPending && (
            <Badge variant="warning" size="sm" className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>{t('pdc.pendingReview')}</span>
            </Badge>
          )}
          {isAccepted && !isApplied && (
            <Badge variant="success" size="sm" className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{t('pdc.accepted')}</span>
            </Badge>
          )}
          {isAccepted && isApplied && (
            <Badge variant="success" size="sm" className="flex items-center gap-1 font-mono">
              <CheckCheck className="w-3 h-3 text-emerald-400" />
              <span>{t('pdc.applied')}</span>
            </Badge>
          )}
          {isOverridden && (
            <Badge variant="brand" size="sm" className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-accent" />
              <span>{t('pdc.overridden')}</span>
            </Badge>
          )}
          {isDismissed && (
            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-text-muted" />
              <span>{t('pdc.dismissed')}</span>
            </Badge>
          )}

          {/* Action Category Badge */}
          {decision.actionCategory === 'candidate_load_progression' && (
            <Badge variant="success" size="sm">
              {t('pdc.load', { delta: decision.proposedPrescription.deltaWeight ?? 0, unit: userUnit })}
            </Badge>
          )}
          {decision.actionCategory === 'candidate_rep_progression' && (
            <Badge variant="success" size="sm">
              {t('pdc.repsBadge', { delta: decision.proposedPrescription.deltaReps ?? 0 })}
            </Badge>
          )}
          {decision.actionCategory === 'hold_current_target' && (
            <Badge variant="neutral" size="sm">
              {t('pdc.holdTarget')}
            </Badge>
          )}
          {decision.actionCategory === 'review_required' && (
            <Badge variant="warning" size="sm">
              {t('pdc.reviewRequired')}
            </Badge>
          )}
          {decision.actionCategory === 'insufficient_evidence' && (
            <Badge variant="neutral" size="sm">
              {t('pdc.insufficient')}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Targets Comparison Grid (Current vs Proposed / Overridden) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-center">
        {/* Current Target */}
        <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70">
          <span className="text-[9px] uppercase font-bold text-text-muted block">
            {t('pdc.currentTarget')}
          </span>
          <span className="text-sm font-bold text-text-primary block mt-0.5">
            {hasCurrentTargets
              ? t('pdc.wxr', { weight: decision.currentPrescription.weight ?? 0, unit: userUnit, reps: decision.currentPrescription.reps ?? 0 })
              : t('pdc.unconfigured')}
          </span>
          {decision.currentPrescription.targetRpe && (
            <span className="text-[10px] text-text-muted block">
              {t('pdc.targetRpe', { rpe: decision.currentPrescription.targetRpe })}
            </span>
          )}
        </div>

        {/* Proposed Target or Athlete Override */}
        <div
          className={`p-2.5 rounded-xl border text-center ${
            isOverridden
              ? 'bg-accent/10 border-accent/40'
              : isAccepted
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-bg-secondary/90 border-border/70'
          }`}
        >
          <span
            className={`text-[9px] uppercase font-bold block ${
              isOverridden ? 'text-accent' : isAccepted ? 'text-emerald-400' : 'text-text-muted'
            }`}
          >
            {isOverridden
              ? t('pdc.athleteOverride')
              : isAccepted
              ? t('pdc.acceptedTarget')
              : t('pdc.proposedTarget')}
          </span>
          <span className="text-sm font-black text-text-primary block mt-0.5">
            {isOverridden && decision.userOverride
              ? t('pdc.wxr', { weight: decision.userOverride.customWeight ?? decision.proposedPrescription.weight ?? 0, unit: userUnit, reps: decision.userOverride.customReps ?? decision.proposedPrescription.reps ?? 0 })
              : t('pdc.wxr', { weight: decision.proposedPrescription.weight ?? 0, unit: userUnit, reps: decision.proposedPrescription.reps ?? 0 })}
          </span>
          {isOverridden && decision.userOverride?.overrideReason ? (
            <span className="text-[10px] text-accent block truncate" title={decision.userOverride.overrideReason}>
              {t('pdc.reason', { reason: decision.userOverride.overrideReason })}
            </span>
          ) : (
            <span className="text-[10px] text-text-muted block">
              {t('pdc.targetRpe', { rpe: decision.proposedPrescription.targetRpe ?? 8 })}
            </span>
          )}
        </div>
      </div>

      {/* ── Plain-Language Explanation ── */}
      <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/60 space-y-1">
        <h4 className="text-xs font-bold text-text-primary">
          {decision.headline}
        </h4>
        <p className="text-xs text-text-secondary leading-relaxed">
          {decision.explanation}
        </p>
      </div>

      {/* ── Evidence Summary & Limitations (Progressive Disclosure) ── */}
      <div className="border border-border/60 rounded-xl overflow-hidden bg-bg-card">
        <button
          type="button"
          onClick={() => setShowEvidenceDetails((prev) => !prev)}
          className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-bg-secondary/40 transition-colors"
          aria-expanded={showEvidenceDetails}
          aria-label={t('pdc.toggleEvidence')}
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px] font-mono font-bold text-text-secondary">
              {t('pdc.evidence', { count: decision.evidenceCount })}
            </span>
          </div>
          <div className="flex items-center gap-1 text-text-muted">
            <span className="text-[10px] font-mono hidden sm:inline">
              {showEvidenceDetails ? t('pdc.hide') : t('pdc.details')}
            </span>
            {showEvidenceDetails ? (
              <ChevronUp className="w-3.5 h-3.5 text-accent" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-accent" />
            )}
          </div>
        </button>

        {showEvidenceDetails && (
          <div className="p-3 border-t border-border/60 bg-bg-secondary/30 space-y-2.5 text-xs animate-fade-in">
            {/* Metric Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[10px]">
              <div className="p-2 rounded-lg bg-bg-secondary border border-border/60">
                <span className="text-text-muted block">{t('pdc.prescribedSets')}</span>
                <span className="font-bold text-text-primary">
                  {decision.evidenceAudit.completedPrescribedSets} /{' '}
                  {decision.evidenceAudit.totalPrescribedSetsEvaluated}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-bg-secondary border border-border/60">
                <span className="text-text-muted block">{t('pdc.repComparisons')}</span>
                <span className="font-bold text-text-primary">
                  {decision.evidenceAudit.usableRepComparisons}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-bg-secondary border border-border/60 col-span-2 sm:col-span-1">
                <span className="text-text-muted block">{t('pdc.suffTier')}</span>
                <span className="font-bold text-accent capitalize">
                  {decision.evidenceSufficiencyTier.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Technical Rule ID & Policy Version (kept secondary) */}
            <div className="text-[10px] font-mono text-text-muted pt-1 border-t border-border/40 flex items-center justify-between flex-wrap gap-1">
              <span>{t('pdc.ruleId', { id: decision.ruleId })}</span>
              <span>{t('pdc.model', { model: decision.progressionModel })}</span>
              <span>{t('pdc.schema', { version: decision.policyVersion })}</span>
            </div>

            {/* Relevant Limitations & Missing Data */}
            {hasLimitations && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase font-mono">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{t('pdc.limitations')}</span>
                </div>
                <ul className="space-y-1 text-[11px] text-text-secondary list-disc pl-4">
                  {decision.evidenceAudit.limitations.map((lim, idx) => (
                    <li key={idx} className="leading-snug">
                      {lim}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Athlete Actions: Accept / Override / Dismiss ── */}
      {isOverriding ? (
        <div
          className="p-3 rounded-xl bg-bg-secondary border border-accent/40 space-y-2.5 animate-fade-in text-left"
          role="group"
          aria-label={t('pdc.overrideFormAria')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOverriding(false);
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase text-accent">
              {t('pdc.athleteTargetOverride')}
            </span>
            <button
              type="button"
              onClick={() => setIsOverriding(false)}
              className="text-text-muted hover:text-text-primary p-1 rounded-md"
              aria-label={t('pdc.closeOverride')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor={`override-weight-${decision.id}`}
                className="text-[10px] font-mono text-text-muted block mb-1"
              >
                {t('pdc.weightLabel', { unit: userUnit })}
              </label>
              <input
                id={`override-weight-${decision.id}`}
                type="number"
                step={userUnit === 'lbs' ? '5' : '2.5'}
                min="0"
                autoFocus
                value={customWeight}
                onChange={(e) => setCustomWeight(parseFloat(e.target.value) || 0)}
                className="w-full bg-bg-card border border-border rounded-lg py-1.5 px-2.5 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label
                htmlFor={`override-reps-${decision.id}`}
                className="text-[10px] font-mono text-text-muted block mb-1"
              >
                {t('pdc.reps')}
              </label>
              <input
                id={`override-reps-${decision.id}`}
                type="number"
                min="1"
                max="50"
                value={customReps}
                onChange={(e) => setCustomReps(parseInt(e.target.value, 10) || 1)}
                className="w-full bg-bg-card border border-border rounded-lg py-1.5 px-2.5 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`override-reason-${decision.id}`}
              className="text-[10px] font-mono text-text-muted block mb-1"
            >
              {t('pdc.optionalReason')}
            </label>
            <input
              id={`override-reason-${decision.id}`}
              type="text"
              placeholder={t('pdc.reasonPlaceholder')}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-bg-card border border-border rounded-lg py-1.5 px-2.5 text-xs text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOverriding(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveOverride}
            >
              {t('pdc.saveOverride')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-border/50">
          {/* Resolved State Confirmation Text */}
          <div className="text-[11px] font-mono text-text-muted">
            {isAccepted && (
              <div className="space-y-0.5">
                {isApplied ? (
                  <>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5 inline shrink-0" />
                      {t('pdc.appliedTo', { plan: appliedPlanName, date: decision.appliedAt?.split('T')[0] ?? '' })}
                    </span>
                    <span className="text-[10px] text-text-muted block">
                      {t('pdc.appliedNote')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 inline shrink-0" />
                      {t('pdc.acceptedOn', { date: decision.acceptedAt ? decision.acceptedAt.split('T')[0] : t('pdc.recentReview') })}
                    </span>
                    <span className="text-[10px] text-text-muted block">
                      {t('pdc.acceptedNote')}
                    </span>
                  </>
                )}
              </div>
            )}
            {isOverridden && (
              <div className="space-y-0.5">
                <span className="text-accent font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 inline shrink-0" />
                  {t('pdc.overriddenMsg')}
                </span>
                <span className="text-[10px] text-text-muted block">
                  {t('pdc.overriddenNote')}
                </span>
              </div>
            )}
            {isDismissed && (
              <div className="space-y-0.5">
                <span className="text-text-muted flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 inline shrink-0" />
                  {t('pdc.dismissedMsg')}
                </span>
                <span className="text-[10px] text-text-muted block">
                  {t('pdc.dismissedNote')}
                </span>
              </div>
            )}
            {isPending && (
              <span>{t('pdc.actionRequired')}</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            {isPending ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAccept}
                  aria-label={t('pdc.acceptAria', { name: decision.exerciseName })}
                  leftIcon={<Check className="w-3.5 h-3.5 stroke-[3]" />}
                >
                  {t('pdc.accept')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsOverriding(true)}
                  aria-label={t('pdc.overrideAria', { name: decision.exerciseName })}
                  leftIcon={<Sliders className="w-3.5 h-3.5" />}
                >
                  {t('pdc.override')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  aria-label={t('pdc.dismissAria', { name: decision.exerciseName })}
                >
                  {t('pdc.dismiss')}
                </Button>
              </>
            ) : isAccepted && isApplicableAction ? (
              isApplied ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="opacity-80 cursor-not-allowed font-mono text-emerald-400 border-emerald-500/40 text-xs"
                  aria-disabled="true"
                >
                  {t('pdc.appliedToPlan')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenApplyModal}
                  aria-label={t('pdc.applyAria', { name: decision.exerciseName })}
                  leftIcon={<Calendar className="w-3.5 h-3.5" />}
                >
                  {t('pdc.applyTemplate')}
                </Button>
              )
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="opacity-60 cursor-not-allowed"
                aria-disabled="true"
              >
                {t('pdc.resolved')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Apply Recommendation to Future Workout ── */}
      {isApplyModalOpen && (
        <div ref={applyModalRef} {...applyDialogProps}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`apply-modal-title-${decision.id}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsApplyModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg bg-bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto text-left font-sans">
            <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent">
                    {t('pdc.deliberate')}
                  </span>
                </div>
                <h3
                  id={`apply-modal-title-${decision.id}`}
                  className="text-base font-black font-display text-text-primary tracking-tight mt-0.5"
                >
                  {t('pdc.applyTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors"
                aria-label={t('pdc.closeModal')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {candidatePlans.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-400 font-mono">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{t('pdc.noPlans')}</span>
                </div>
                <p className="text-text-secondary leading-relaxed">
                  {t('pdc.noPlansBody', { exercise: decision.exerciseName })}
                </p>
                <p className="text-text-muted text-[11px] leading-relaxed">
                  {t('pdc.noPlansHint', { exercise: decision.exerciseName })}
                </p>
                <div className="pt-2 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setIsApplyModalOpen(false)}>
                    {t('common.close')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Plan Selector */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={`select-plan-${decision.id}`}
                    className="text-[11px] font-mono font-bold text-text-secondary block"
                  >
                    {t('pdc.selectPlan')}
                  </label>
                  <select
                    id={`select-plan-${decision.id}`}
                    value={currentSelectedPlan?.id || ''}
                    onChange={(e) => {
                      const newPlanId = e.target.value;
                      setSelectedPlanId(newPlanId);
                      const targetP = plannedWorkouts?.find((p) => p.id === newPlanId);
                      if (targetP) {
                        const idx = targetP.exercises.findIndex(
                          (ex) => ex.name.trim().toLowerCase() === decision.exerciseName.trim().toLowerCase()
                        );
                        setSelectedExerciseIndex(idx >= 0 ? idx : 0);
                      }
                    }}
                    className="w-full bg-bg-secondary border border-border rounded-xl py-2 px-3 text-xs font-mono text-text-primary outline-none focus:border-accent"
                  >
                    {candidatePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t('pdc.planOption', { name: p.name, count: p.exercises.length })}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Multiple Exercise Disambiguation (if more than 1 in plan) */}
                {matchingExercisesInSelectedPlan.length > 1 && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`select-ex-instance-${decision.id}`}
                      className="text-[11px] font-mono font-bold text-text-secondary block"
                    >
                      {t('pdc.selectInstance')}
                    </label>
                    <select
                      id={`select-ex-instance-${decision.id}`}
                      value={effectiveExerciseIndex}
                      onChange={(e) => setSelectedExerciseIndex(parseInt(e.target.value, 10))}
                      className="w-full bg-bg-secondary border border-border rounded-xl py-2 px-3 text-xs font-mono text-text-primary outline-none focus:border-accent"
                    >
                      {matchingExercisesInSelectedPlan.map(({ exercise, index }) => (
                        <option key={index} value={index}>
                          {t('pdc.instanceOption', { n: index + 1, sets: exercise.targetSets, reps: exercise.targetReps, weight: exercise.targetWeight ?? t('pdc.unset'), unit: exercise.targetUnit || userUnit })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Side-by-side Targets Comparison */}
                <div className="grid grid-cols-2 gap-2 font-mono text-center">
                  <div className="p-3 rounded-xl bg-bg-secondary border border-border/80">
                    <span className="text-[9px] uppercase font-bold text-text-muted block">
                      {t('pdc.currentTemplate')}
                    </span>
                    <span className="text-sm font-bold text-text-primary block mt-1">
                      {selectedTargetExercise?.targetWeight !== undefined
                        ? `${selectedTargetExercise.targetWeight} ${selectedTargetExercise.targetUnit || userUnit}`
                          : t('pdc.unsetCap')}{' '}
                      × {selectedTargetExercise?.targetReps ?? '—'} {t('pdc.reps').toLowerCase()}
                    </span>
                    <span className="text-[10px] text-text-muted block mt-0.5">
                      {t('pdc.sets', { sets: selectedTargetExercise?.targetSets ?? 3 })}
                      {selectedTargetExercise?.targetRpe ? ` @ RPE ${selectedTargetExercise.targetRpe}` : ''}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[9px] uppercase font-bold text-emerald-400 block">
                      {t('pdc.newTemplate')}
                    </span>
                    <span className="text-sm font-black text-text-primary block mt-1">
                      {t('pdc.wxr', { weight: decision.proposedPrescription.weight ?? 0, unit: decision.proposedPrescription.unit ?? userUnit, reps: decision.proposedPrescription.reps ?? 0 })}
                    </span>
                    <span className="text-[10px] text-emerald-400 block mt-0.5">
                      {t('pdc.setsRpe', { sets: decision.proposedPrescription.sets ?? 0, rpe: decision.proposedPrescription.targetRpe ?? 8 })}
                    </span>
                  </div>
                </div>

                {/* Progression Delta */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-secondary/70 border border-border/60 font-mono text-[11px]">
                  <span className="text-text-muted">{t('pdc.progression')}</span>
                  <span className="font-bold text-accent">
                    {decision.proposedPrescription.deltaWeight && decision.proposedPrescription.deltaWeight > 0
                      ? t('pdc.deltaLoad', { delta: decision.proposedPrescription.deltaWeight, unit: decision.proposedPrescription.unit ?? userUnit })
                      : decision.proposedPrescription.deltaReps && decision.proposedPrescription.deltaReps > 0
                      ? t('pdc.deltaReps', { delta: decision.proposedPrescription.deltaReps })
                      : t('pdc.holdTarget')}
                  </span>
                </div>

                {/* Plain-Language Explanation */}
                <div className="p-2.5 rounded-xl bg-bg-secondary/50 border border-border/50 space-y-1">
                  <span className="text-[10px] font-mono font-bold text-text-muted uppercase block">
                    {t('pdc.rationale')}
                  </span>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    {decision.explanation}
                  </p>
                </div>

                {/* Validation Warnings / Blocks */}
                {validationResult && !validationResult.valid && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold font-mono text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{t('pdc.blocked')}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-300">
                      {validationResult.message}
                    </p>
                  </div>
                )}

                {/* Already Applied Notice */}
                {validationResult?.alreadyApplied && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold font-mono text-[11px]">
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{t('pdc.alreadyApplied')}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-300">
                      {t('pdc.alreadyBody')}
                    </p>
                  </div>
                )}

                {/* Explicit Invariant Disclaimer */}
                <div className="p-2.5 rounded-xl bg-bg-secondary/30 border border-border/40 text-[10px] text-text-muted leading-relaxed font-mono">
                  {t('pdc.guard', { plan: currentSelectedPlan?.name ?? '' })}
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsApplyModalOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!validationResult?.valid || validationResult?.alreadyApplied}
                    onClick={handleConfirmApply}
                    leftIcon={<Check className="w-3.5 h-3.5 stroke-[3]" />}
                  >
                    {t('pdc.confirmApply')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
