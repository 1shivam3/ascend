'use client';

import React, { useState } from 'react';
import { TrainingDecisionRecord, Unit } from '@/lib/types';
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
} from 'lucide-react';
import { useToast } from './ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export interface PolicyDecisionCardProps {
  decision: TrainingDecisionRecord;
  userUnit?: Unit;
  onAccepted?: (decision: TrainingDecisionRecord) => void;
  onOverridden?: (decision: TrainingDecisionRecord) => void;
  onDismissed?: (decision: TrainingDecisionRecord) => void;
}

export default function PolicyDecisionCard({
  decision,
  userUnit = 'kg',
  onAccepted,
  onOverridden,
  onDismissed,
}: PolicyDecisionCardProps) {
  const acceptPolicyDecision = useStore((state) => state.acceptPolicyDecision);
  const overridePolicyDecision = useStore((state) => state.overridePolicyDecision);
  const dismissPolicyDecision = useStore((state) => state.dismissPolicyDecision);
  const toast = useToast();

  const [isOverriding, setIsOverriding] = useState(false);
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

  const handleAccept = () => {
    if (!isPending) {
      toast.info(`Decision is already ${decision.status}.`, 'Action Unavailable');
      return;
    }
    acceptPolicyDecision(decision.id);
    toast.success(
      `Accepted recommendation for ${decision.exerciseName}: ${decision.proposedPrescription.weight} ${userUnit} × ${decision.proposedPrescription.reps} reps.`,
      'Recommendation Accepted'
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
      toast.info(`Decision is already ${decision.status}.`, 'Action Unavailable');
      setIsOverriding(false);
      return;
    }

    if (customWeight <= 0 || customReps <= 0) {
      toast.error('Weight and reps must be positive numbers.', 'Invalid Override');
      return;
    }

    overridePolicyDecision(decision.id, {
      customWeight,
      customReps,
      reason: overrideReason.trim() || undefined,
    });

    toast.info(
      `Recorded manual override for ${decision.exerciseName}: ${customWeight} ${userUnit} × ${customReps} reps.`,
      'Target Overridden'
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
      toast.info(`Decision is already ${decision.status}.`, 'Action Unavailable');
      return;
    }
    dismissPolicyDecision(decision.id);
    toast.info(`Dismissed decision for ${decision.exerciseName}.`, 'Decision Dismissed');
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
      aria-label={`Training decision for ${decision.exerciseName}`}
    >
      {/* ── Top Header: Exercise, Session Date, Status Badge ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent">
              POLICY V{decision.policyVersion}
            </span>
            <span className="text-[10px] font-mono text-text-muted">
              • Session: {sessionDate}
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
              <span>PENDING REVIEW</span>
            </Badge>
          )}
          {isAccepted && (
            <Badge variant="success" size="sm" className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>ACCEPTED</span>
            </Badge>
          )}
          {isOverridden && (
            <Badge variant="brand" size="sm" className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-accent" />
              <span>OVERRIDDEN</span>
            </Badge>
          )}
          {isDismissed && (
            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-text-muted" />
              <span>DISMISSED</span>
            </Badge>
          )}

          {/* Action Category Badge */}
          {decision.actionCategory === 'candidate_load_progression' && (
            <Badge variant="success" size="sm">
              +{decision.proposedPrescription.deltaWeight} {userUnit} LOAD
            </Badge>
          )}
          {decision.actionCategory === 'candidate_rep_progression' && (
            <Badge variant="success" size="sm">
              +{decision.proposedPrescription.deltaReps} REPS
            </Badge>
          )}
          {decision.actionCategory === 'hold_current_target' && (
            <Badge variant="neutral" size="sm">
              HOLD TARGET
            </Badge>
          )}
          {decision.actionCategory === 'review_required' && (
            <Badge variant="warning" size="sm">
              REVIEW REQUIRED
            </Badge>
          )}
          {decision.actionCategory === 'insufficient_evidence' && (
            <Badge variant="neutral" size="sm">
              INSUFFICIENT EVIDENCE
            </Badge>
          )}
        </div>
      </div>

      {/* ── Targets Comparison Grid (Current vs Proposed / Overridden) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-center">
        {/* Current Target */}
        <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70">
          <span className="text-[9px] uppercase font-bold text-text-muted block">
            CURRENT TARGET
          </span>
          <span className="text-sm font-bold text-text-primary block mt-0.5">
            {hasCurrentTargets
              ? `${decision.currentPrescription.weight} ${userUnit} × ${decision.currentPrescription.reps} reps`
              : 'Unconfigured / Initial'}
          </span>
          {decision.currentPrescription.targetRpe && (
            <span className="text-[10px] text-text-muted block">
              @{decision.currentPrescription.targetRpe} Target RPE
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
              ? 'ATHLETE OVERRIDE'
              : isAccepted
              ? 'ACCEPTED TARGET'
              : 'PROPOSED TARGET'}
          </span>
          <span className="text-sm font-black text-text-primary block mt-0.5">
            {isOverridden && decision.userOverride
              ? `${decision.userOverride.customWeight ?? decision.proposedPrescription.weight} ${userUnit} × ${
                  decision.userOverride.customReps ?? decision.proposedPrescription.reps
                } reps`
              : `${decision.proposedPrescription.weight} ${userUnit} × ${decision.proposedPrescription.reps} reps`}
          </span>
          {isOverridden && decision.userOverride?.overrideReason ? (
            <span className="text-[10px] text-accent block truncate" title={decision.userOverride.overrideReason}>
              Reason: {decision.userOverride.overrideReason}
            </span>
          ) : (
            <span className="text-[10px] text-text-muted block">
              @{decision.proposedPrescription.targetRpe ?? 8} Target RPE
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
          aria-label="Toggle evidence audit and limitations details"
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px] font-mono font-bold text-text-secondary">
              Supporting Evidence ({decision.evidenceCount} comparable sessions)
            </span>
          </div>
          <div className="flex items-center gap-1 text-text-muted">
            <span className="text-[10px] font-mono hidden sm:inline">
              {showEvidenceDetails ? 'Hide' : 'Details'}
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
                <span className="text-text-muted block">Prescribed Sets</span>
                <span className="font-bold text-text-primary">
                  {decision.evidenceAudit.completedPrescribedSets} /{' '}
                  {decision.evidenceAudit.totalPrescribedSetsEvaluated}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-bg-secondary border border-border/60">
                <span className="text-text-muted block">Rep Comparisons</span>
                <span className="font-bold text-text-primary">
                  {decision.evidenceAudit.usableRepComparisons}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-bg-secondary border border-border/60 col-span-2 sm:col-span-1">
                <span className="text-text-muted block">Sufficiency Tier</span>
                <span className="font-bold text-accent capitalize">
                  {decision.evidenceSufficiencyTier.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Technical Rule ID & Policy Version (kept secondary) */}
            <div className="text-[10px] font-mono text-text-muted pt-1 border-t border-border/40 flex items-center justify-between flex-wrap gap-1">
              <span>Rule ID: {decision.ruleId}</span>
              <span>Model: {decision.progressionModel}</span>
              <span>Schema: {decision.policyVersion}</span>
            </div>

            {/* Relevant Limitations & Missing Data */}
            {hasLimitations && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase font-mono">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Evidence Limitations & Configuration Notes</span>
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
          aria-label="Target override form"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOverriding(false);
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase text-accent">
              Athlete Target Override
            </span>
            <button
              type="button"
              onClick={() => setIsOverriding(false)}
              className="text-text-muted hover:text-text-primary p-1 rounded-md"
              aria-label="Close override form"
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
                Weight ({userUnit})
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
                Reps
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
              Optional Reason
            </label>
            <input
              id={`override-reason-${decision.id}`}
              type="text"
              placeholder="e.g. Deload week, travel equipment, joint caution"
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
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveOverride}
            >
              Save Override
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-border/50">
          {/* Resolved State Confirmation Text */}
          <div className="text-[11px] font-mono text-text-muted">
            {isAccepted && (
              <div className="space-y-0.5">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 inline shrink-0" />
                  Target accepted on {decision.acceptedAt ? decision.acceptedAt.split('T')[0] : 'recent review'}.
                </span>
                <span className="text-[10px] text-text-muted block">
                  Recorded in ledger. Does not alter workout plans automatically.
                </span>
              </div>
            )}
            {isOverridden && (
              <div className="space-y-0.5">
                <span className="text-accent font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 inline shrink-0" />
                  Target manually overridden by athlete.
                </span>
                <span className="text-[10px] text-text-muted block">
                  Override recorded in ledger. Does not alter workout plans automatically.
                </span>
              </div>
            )}
            {isDismissed && (
              <div className="space-y-0.5">
                <span className="text-text-muted flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 inline shrink-0" />
                  Recommendation dismissed.
                </span>
                <span className="text-[10px] text-text-muted block">
                  Existing prescriptions preserved.
                </span>
              </div>
            )}
            {isPending && (
              <span>Action required: review recommended targets.</span>
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
                  aria-label={`Accept recommendation for ${decision.exerciseName}`}
                  leftIcon={<Check className="w-3.5 h-3.5 stroke-[3]" />}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsOverriding(true)}
                  aria-label={`Override recommendation for ${decision.exerciseName}`}
                  leftIcon={<Sliders className="w-3.5 h-3.5" />}
                >
                  Override
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  aria-label={`Dismiss recommendation for ${decision.exerciseName}`}
                >
                  Dismiss
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="opacity-60 cursor-not-allowed"
                aria-disabled="true"
              >
                Decision Resolved
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
