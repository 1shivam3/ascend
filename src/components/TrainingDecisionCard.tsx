'use client';

import React, { useState } from 'react';
import { TrainingDecision } from '@/lib/types';
import { useStore } from '@/lib/store';
import {
  Check,
  RotateCcw,
  TrendingUp,
  AlertTriangle,
  Info,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useToast } from './ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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
  const [customWeight, setCustomWeight] = useState<number>(decision.nextPrescription.weight);

  const isAccepted = decision.status === 'accepted';
  const isOverridden = decision.status === 'overridden';

  const handleAccept = () => {
    acceptTrainingDecision(decision.exerciseName);
    toast.success(`Accepted ${decision.nextPrescription.weight}${userUnit} target for ${decision.exerciseName}`, 'Target Accepted');
    if (onAccepted) onAccepted(decision);
  };

  const handleOverride = () => {
    overrideTrainingDecision(decision.exerciseName, customWeight);
    toast.info(`Set ${decision.exerciseName} prescription to ${customWeight}${userUnit}`, 'Target Overridden');
    setIsOverriding(false);
    if (onOverridden) onOverridden({ ...decision, userOverrideWeight: customWeight, status: 'overridden' });
  };

  const isPositive = decision.deltaKg > 0;
  const isNegative = decision.deltaKg < 0;

  return (
    <Card variant="default" padding="md" className="space-y-3 font-sans border-border/80">
      {/* Header Row: Exercise Name & Delta */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent block">
            DECISION LEDGER
          </span>
          <h3 className="text-base font-black font-display text-text-primary tracking-tight">
            {decision.exerciseName.toUpperCase()}
          </h3>
        </div>

        <div>
          {isPositive ? (
            <Badge variant="success" size="sm">
              +{decision.deltaKg} {userUnit}
            </Badge>
          ) : isNegative ? (
            <Badge variant="warning" size="sm">
              {decision.deltaKg} {userUnit}
            </Badge>
          ) : (
            <Badge variant="neutral" size="sm">
              LOAD HELD
            </Badge>
          )}
        </div>
      </div>

      {/* Comparison: Previous vs Next (Understandable in 3 seconds) */}
      <div className="grid grid-cols-2 gap-2.5 font-mono">
        <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70 text-center">
          <span className="text-[9px] uppercase font-bold text-text-muted block">PREVIOUS</span>
          <span className="text-sm font-bold text-text-primary block mt-0.5">
            {decision.previousPerformance.weight} {userUnit} × {decision.previousPerformance.reps}
          </span>
          {decision.previousPerformance.rpe && (
            <span className="text-[10px] text-text-muted block">
              @{decision.previousPerformance.rpe} RPE
            </span>
          )}
        </div>

        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/30 text-center">
          <span className="text-[9px] uppercase font-bold text-accent block">NEXT PRESCRIPTION</span>
          <span className="text-sm font-black text-text-primary block mt-0.5">
            {isOverridden
              ? `${decision.userOverrideWeight} ${userUnit} (Manual)`
              : `${decision.nextPrescription.weight} ${userUnit} × ${decision.nextPrescription.reps}`}
          </span>
          <span className="text-[10px] text-accent block">
            @{decision.expectedRpe || decision.nextPrescription.targetRpe || 8} target
          </span>
        </div>
      </div>

      {/* Why? Audit & Evidence */}
      <div className="p-2.5 rounded-xl bg-bg-secondary/60 border border-border/60 text-left space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold text-accent uppercase">WHY?</span>
          <span className="text-[10px] font-mono text-text-muted">
            Evidence: {decision.evidenceCount} comparable {decision.evidenceCount === 1 ? 'session' : 'sessions'}
          </span>
        </div>
        <p className="text-xs text-text-secondary leading-snug">
          {decision.explanation}
        </p>
      </div>

      {/* Action Controls: Accept / Override */}
      {isOverriding ? (
        <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/80 space-y-2 animate-fade-in text-left">
          <span className="text-[10px] font-mono font-bold uppercase text-text-muted block">
            Set custom target weight ({userUnit}):
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step={userUnit === 'lbs' ? '5' : '2.5'}
              value={customWeight}
              onChange={(e) => setCustomWeight(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-bg-card border border-border rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
            />
            <Button variant="primary" size="sm" onClick={handleOverride}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsOverriding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {isAccepted ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Target Accepted</span>
            </div>
          ) : isOverridden ? (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono font-bold">
              <Sparkles className="w-4 h-4" />
              <span>Manual Override Active</span>
            </div>
          ) : (
            <span className="text-[10px] text-text-muted font-mono">
              Suggested by engine
            </span>
          )}

          <div className="flex items-center gap-2">
            {!isAccepted && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleAccept}
                leftIcon={<Check className="w-3.5 h-3.5 stroke-[3]" />}
              >
                Accept
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCustomWeight(
                  isOverridden
                    ? decision.userOverrideWeight || decision.nextPrescription.weight
                    : decision.nextPrescription.weight
                );
                setIsOverriding(true);
              }}
            >
              {isOverridden ? 'Edit Override' : 'Override'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
