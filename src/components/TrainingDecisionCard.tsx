"use client";

import React, { useState } from 'react';
import { TrainingDecision } from '@/lib/types';
import { useStore } from '@/lib/store';
import {
  Scale,
  Check,
  RotateCcw,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Info,
  ShieldCheck,
  Target,
  Activity,
} from 'lucide-react';
import { useToast } from './ui/Toast';

interface TrainingDecisionCardProps {
  decision: TrainingDecision;
  userUnit?: 'kg' | 'lbs';
  onAccepted?: (decision: TrainingDecision) => void;
  onOverridden?: (decision: TrainingDecision) => void;
}

export default function TrainingDecisionCard({
  decision,
  userUnit = 'kg',
  onAccepted,
  onOverridden,
}: TrainingDecisionCardProps) {
  const acceptTrainingDecision = useStore((state) => state.acceptTrainingDecision);
  const overrideTrainingDecision = useStore((state) => state.overrideTrainingDecision);
  const toast = useToast();

  const [isOverriding, setIsOverriding] = useState(false);
  const [customWeight, setCustomWeight] = useState<number>(decision.previousPerformance.weight);

  const isAccepted = decision.status === 'accepted';
  const isOverridden = decision.status === 'overridden';

  const handleAccept = () => {
    acceptTrainingDecision(decision.exerciseName);
    toast.success(`Accepted ${decision.nextPrescription.weight}${userUnit} target for ${decision.exerciseName}`, 'Prescription Accepted');
    if (onAccepted) onAccepted(decision);
  };

  const handleOverride = () => {
    overrideTrainingDecision(decision.exerciseName, customWeight);
    toast.info(`Overrode ${decision.exerciseName} prescription to ${customWeight}${userUnit}`, 'Decision Overridden');
    setIsOverriding(false);
    if (onOverridden) onOverridden({ ...decision, userOverrideWeight: customWeight, status: 'overridden' });
  };

  const isPositive = decision.deltaKg > 0;
  const isNegative = decision.deltaKg < 0;

  // Format program intent
  const intentLabel =
    decision.programIntent === 'readiness_adaptation'
      ? 'Readiness Adaptation'
      : decision.programIntent === 'progressive_overload'
      ? 'Progressive Overload'
      : decision.programIntent === 'technique'
      ? 'Technique Consolidation'
      : 'Strength Development';

  // Format confidence label
  const confidenceLabel =
    decision.confidence === 'high'
      ? 'High Confidence'
      : decision.confidence === 'established'
      ? 'Established Pattern'
      : decision.confidence === 'early_signal'
      ? 'Early Signal'
      : 'Calibrating Baseline';

  return (
    <div className="card p-3.5 sm:p-4 bg-bg-card border border-accent/30 space-y-3 shadow-xs relative overflow-hidden font-sans">
      {/* Accent subtle glow top border */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent/60 via-accent to-accent/20" />

      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <Scale className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-bold text-xs text-text-primary uppercase tracking-wider truncate">
                {decision.exerciseName}
              </h4>
              <span className="text-3xs font-mono px-1.5 py-0.2 rounded bg-bg-secondary text-text-muted border border-border/80">
                {decision.evidenceCount} {decision.evidenceCount === 1 ? 'exposure' : 'exposures'}
              </span>
              <span className="text-3xs font-mono px-1.5 py-0.2 rounded bg-accent/10 text-accent border border-accent/30">
                {confidenceLabel}
              </span>
            </div>
            <p className="text-3xs text-accent font-mono font-semibold">
              Training Memory • {intentLabel}
            </p>
          </div>
        </div>

        {/* Delta Tag */}
        <div className="shrink-0 text-right">
          {isPositive ? (
            <span className="text-2xs font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>+{decision.deltaKg}{userUnit}</span>
            </span>
          ) : isNegative ? (
            <span className="text-2xs font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>{decision.deltaKg}{userUnit}</span>
            </span>
          ) : (
            <span className="text-2xs font-mono font-bold text-sky-400 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-full">
              Load Held
            </span>
          )}
        </div>
      </div>

      {/* Comparison Grid: Previous vs Next Prescription */}
      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-bg-secondary/70 border border-border/70 font-mono text-center">
        {/* Previous Session */}
        <div className="p-1.5 rounded-lg bg-bg-card border border-border/50">
          <span className="text-3xs uppercase text-text-muted block">Previous Session</span>
          <span className="text-sm font-bold text-text-primary block mt-0.5">
            {decision.previousPerformance.weight} {userUnit} × {decision.previousPerformance.reps}
          </span>
          <span className="text-3xs text-text-secondary block">
            {decision.previousPerformance.sets} sets {decision.previousPerformance.rpe ? `@ RPE ${decision.previousPerformance.rpe}` : ''}
          </span>
        </div>

        {/* Today's Prescribed Adaptation */}
        <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/40">
          <span className="text-3xs uppercase text-accent font-bold block">Adapted Prescription</span>
          <span className="text-sm font-black text-text-primary block mt-0.5">
            {isOverridden
              ? `${decision.userOverrideWeight || decision.previousPerformance.weight} ${userUnit} (Override)`
              : `${decision.nextPrescription.weight} ${userUnit} × ${decision.nextPrescription.reps}`}
          </span>
          <span className="text-3xs text-accent font-medium block">
            {decision.nextPrescription.sets} sets @ Expected RPE {decision.expectedRpe || decision.nextPrescription.targetRpe}
          </span>
        </div>
      </div>

      {/* Prediction vs Outcome (If workout was executed) */}
      {decision.actualExecution && (
        <div className="p-2.5 rounded-xl bg-bg-secondary/90 border border-border flex items-center justify-between text-2xs font-mono">
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Target className="w-3.5 h-3.5 text-accent" />
            <span>Actual Execution:</span>
            <span className="font-bold text-text-primary">
              {decision.actualExecution.weight} {userUnit} × {decision.actualExecution.reps} @ RPE {decision.actualExecution.actualRpe}
            </span>
          </div>
          {decision.predictionError !== undefined && (
            <div className="flex items-center gap-1">
              <span className="text-3xs text-text-muted uppercase">Prediction Error:</span>
              <span
                className={`font-bold px-1.5 py-0.2 rounded ${
                  Math.abs(decision.predictionError) <= 0.5
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                {decision.predictionError >= 0 ? `+${decision.predictionError}` : decision.predictionError} RPE
              </span>
            </div>
          )}
        </div>
      )}

      {/* Auditable Rationale */}
      <div className="p-2.5 rounded-lg bg-bg-secondary/40 border border-border/60 text-left space-y-1">
        <div className="flex items-center gap-1 text-accent text-3xs font-mono font-bold">
          <Info className="w-3 h-3" />
          <span>Why did ASCEND adapt this lift?</span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed font-sans">
          {decision.explanation}
        </p>
      </div>

      {/* Action Controls: Accept / Override */}
      {isOverriding ? (
        <div className="p-2.5 rounded-xl bg-bg-secondary border border-border space-y-2 animate-fade-in text-left">
          <span className="text-2xs font-mono font-bold text-text-primary block">
            Manual Override Weight ({userUnit}):
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step={userUnit === 'lbs' ? '5' : '2.5'}
              value={customWeight}
              onChange={(e) => setCustomWeight(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-bg-card border border-border rounded-lg py-1.5 px-3 text-xs font-mono text-text-primary outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleOverride}
              className="btn-primary py-1.5 px-3 text-xs font-bold"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsOverriding(false)}
              className="btn-ghost py-1.5 px-2 text-xs text-text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {isAccepted ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Prescription Active</span>
            </div>
          ) : isOverridden ? (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono font-bold">
              <Sparkles className="w-4 h-4" />
              <span>User Override Applied</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-text-muted text-3xs font-mono">
              <Activity className="w-3.5 h-3.5 text-accent animate-pulse" />
              <span>Auditable Recommendation</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {!isAccepted && (
              <button
                type="button"
                onClick={handleAccept}
                className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Accept</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCustomWeight(
                  isOverridden
                    ? decision.userOverrideWeight || decision.nextPrescription.weight
                    : decision.nextPrescription.weight
                );
                setIsOverriding(true);
              }}
              className="btn-secondary py-1.5 px-2.5 text-xs text-text-secondary hover:text-text-primary"
            >
              {isOverridden ? 'Edit Override' : 'Override'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
