import React, { useState } from 'react';
import { WorkoutEntry } from '@/lib/types';
import { calculateWorkoutAdherence } from '@/lib/workout-adherence';
import {
  formatRepComparison,
  formatLoadComparison,
  formatRpeComparison,
  getSetStatusBadge,
  formatSetCompletionSummary,
} from '@/lib/workout-adherence-presentation';
import { ChevronDown, ChevronUp, Target } from 'lucide-react';

export interface PlanVsActualReviewProps {
  workout: WorkoutEntry;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Read-only Plan vs Actual Workout Review component.
 *
 * Renders trustworthy outcome metrics comparing prescribed targets to actual
 * performance for saved workouts. Uses progressive disclosure to keep history
 * cards compact on mobile devices.
 */
export const PlanVsActualReview: React.FC<PlanVsActualReviewProps> = ({
  workout,
  defaultExpanded = false,
  className = '',
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(defaultExpanded);

  const adherence = calculateWorkoutAdherence(workout);
  const completionSummary = formatSetCompletionSummary(adherence);

  // If session has no prescription data (e.g. manual log or legacy record),
  // display neutral informative notice without showing false 0% adherence.
  if (!adherence.hasPrescriptionData) {
    return (
      <div
        className={`p-3 rounded-xl bg-bg-secondary/40 border border-border/50 text-xs text-text-muted flex items-center justify-between gap-2 ${className}`}
      >
        <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-text-muted">
          <Target className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span>Plan vs Actual</span>
        </div>
        <span className="text-2xs text-text-secondary truncate">
          {completionSummary.detailText}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-border bg-bg-elevated/50 overflow-hidden text-text-primary ${className}`}
    >
      {/* ── Summary Header & Bar ── */}
      <div className="p-3 bg-bg-secondary/60 border-b border-border/60">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-accent shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-text-primary">
              Plan vs Actual Review
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="text-2xs font-mono px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold"
              title="Prescribed set completion rate"
            >
              Set completion: {completionSummary.completionRateFormatted}
            </span>

            <button
              type="button"
              onClick={() => setIsDetailsOpen((prev) => !prev)}
              className="text-xs font-mono text-text-secondary hover:text-accent flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-bg-primary"
              aria-expanded={isDetailsOpen}
              aria-label={isDetailsOpen ? 'Collapse set comparison details' : 'Expand set comparison details'}
            >
              <span className="text-3xs uppercase hidden sm:inline">
                {isDetailsOpen ? 'Hide details' : 'View details'}
              </span>
              {isDetailsOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* ── Key Summary Metric Pills ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-1.5 mt-2.5">
          <div className="px-2 py-1.5 rounded-lg bg-bg-primary border border-border text-center">
            <span className="text-3xs uppercase font-mono text-text-muted block">Prescribed</span>
            <span className="text-xs font-bold font-mono text-text-primary block mt-0.5 tabular-nums">
              {adherence.totalPrescribedSets} sets
            </span>
          </div>

          <div className="px-2 py-1.5 rounded-lg bg-bg-primary border border-border text-center">
            <span className="text-3xs uppercase font-mono text-text-muted block">Completed</span>
            <span className="text-xs font-bold font-mono text-emerald-400 block mt-0.5 tabular-nums">
              {adherence.completedPrescribedSets} sets
            </span>
          </div>

          <div className="px-2 py-1.5 rounded-lg bg-bg-primary border border-border text-center">
            <span className="text-3xs uppercase font-mono text-text-muted block">Skipped</span>
            <span className="text-xs font-bold font-mono text-rose-400 block mt-0.5 tabular-nums">
              {adherence.skippedPrescribedSets} sets
            </span>
          </div>

          <div className="px-2 py-1.5 rounded-lg bg-bg-primary border border-border text-center">
            <span className="text-3xs uppercase font-mono text-text-muted block">Not Attempted</span>
            <span className="text-xs font-bold font-mono text-text-muted block mt-0.5 tabular-nums">
              {adherence.notAttemptedPrescribedSets} sets
            </span>
          </div>

          {adherence.extraCompletedSets > 0 && (
            <div className="px-2 py-1.5 rounded-lg bg-bg-primary border border-border text-center col-span-2 sm:col-span-1">
              <span className="text-3xs uppercase font-mono text-text-muted block">Extra Sets</span>
              <span className="text-xs font-bold font-mono text-amber-400 block mt-0.5 tabular-nums">
                {adherence.extraCompletedSets} sets
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Progressive Disclosure: Per-Set Detailed Comparisons ── */}
      {isDetailsOpen && (
        <div className="p-3 space-y-3.5 bg-bg-elevated/30">
          <div className="text-2xs font-mono uppercase tracking-wider text-text-muted">
            Target vs Actual Set Comparisons
          </div>

          {adherence.exercises.map((exSummary) => (
            <div
              key={exSummary.exerciseName}
              className="p-2.5 rounded-lg bg-bg-secondary/70 border border-border/80 space-y-2"
            >
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-semibold text-xs text-accent">
                  {exSummary.exerciseName}
                </span>
                {exSummary.hasPrescriptionData && exSummary.setCompletionPercentage !== null && (
                  <span className="text-3xs font-mono text-text-secondary">
                    {exSummary.completedPrescribedSets}/{exSummary.totalPrescribedSets} completed ({exSummary.setCompletionPercentage}%)
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {exSummary.sets.map((setComp, sIdx) => {
                  const repStr = formatRepComparison(setComp);
                  const loadStr = formatLoadComparison(setComp);
                  const rpeStr = formatRpeComparison(setComp);
                  const badge = getSetStatusBadge(setComp);

                  return (
                    <div
                      key={sIdx}
                      className="p-2 rounded bg-bg-primary border border-border/70 space-y-1"
                    >
                      <div className="flex items-center justify-between text-2xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-text-primary">
                            Set {setComp.setIndex + 1}
                          </span>
                          {setComp.isWarmup && (
                            <span
                              className="text-[9px] font-mono px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold border border-purple-500/30"
                              title="Warm-up Set"
                            >
                              WARMUP
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${badge.badgeClass}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 pt-0.5 text-2xs font-mono">
                        {repStr && (
                          <div className="px-2 py-1 rounded bg-bg-secondary/60 border border-border/40">
                            <span className="text-3xs uppercase font-sans text-text-muted block">
                              Reps
                            </span>
                            <span className="text-text-primary block break-words">
                              {repStr}
                            </span>
                          </div>
                        )}

                        {loadStr && (
                          <div className="px-2 py-1 rounded bg-bg-secondary/60 border border-border/40">
                            <span className="text-3xs uppercase font-sans text-text-muted block">
                              Load
                            </span>
                            <span className="text-text-primary block break-words">
                              {loadStr}
                            </span>
                          </div>
                        )}

                        {rpeStr && (
                          <div className="px-2 py-1 rounded bg-bg-secondary/60 border border-border/40">
                            <span className="text-3xs uppercase font-sans text-text-muted block">
                              RPE
                            </span>
                            <span className="text-text-primary block break-words">
                              {rpeStr}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlanVsActualReview;
