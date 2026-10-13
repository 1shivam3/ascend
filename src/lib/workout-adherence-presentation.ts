import {
  SetAdherenceComparison,
  WorkoutAdherenceSummary,
  ExerciseAdherenceSummary,
} from '@/lib/workout-adherence';

/**
 * Formats rep plan versus actual comparison string neutrally.
 *
 * Examples:
 * - 8 planned → 8 actual (0 difference)
 * - 8 planned → 10 actual (+2 reps)
 * - 8 planned → 6 actual (-2 reps)
 * - 8 planned (when skipped or not attempted)
 * - 8 reps (extra) (when unprescribed extra set)
 */
export function formatRepComparison(comp: SetAdherenceComparison): string | null {
  if (!comp) return null;

  // Unprescribed extra set
  if (!comp.isPrescribed) {
    if (typeof comp.actualReps === 'number' && !isNaN(comp.actualReps)) {
      return `${comp.actualReps} reps (extra)`;
    }
    return null;
  }

  // Prescribed set without explicit prescribed reps (e.g. load-only or RPE-only prescription)
  if (comp.prescribedReps === undefined) {
    if (typeof comp.actualReps === 'number' && !isNaN(comp.actualReps)) {
      return `${comp.actualReps} actual (unprescribed reps)`;
    }
    return null;
  }

  const plannedStr = `${comp.prescribedReps} planned`;

  // Skipped, not attempted, or uncompleted sets never show deltas
  if (!comp.isCompleted || comp.status === 'skipped' || comp.status === 'not_attempted') {
    return plannedStr;
  }

  // Completed prescribed set
  if (typeof comp.actualReps === 'number' && !isNaN(comp.actualReps)) {
    let deltaStr = '';
    if (comp.repDelta !== null) {
      if (comp.repDelta === 0) {
        deltaStr = ' (0 difference)';
      } else if (comp.repDelta > 0) {
        const unitWord = comp.repDelta === 1 ? 'rep' : 'reps';
        deltaStr = ` (+${comp.repDelta} ${unitWord})`;
      } else {
        const unitWord = comp.repDelta === -1 ? 'rep' : 'reps';
        deltaStr = ` (${comp.repDelta} ${unitWord})`;
      }
    }
    return `${plannedStr} → ${comp.actualReps} actual${deltaStr}`;
  }

  // Completed prescribed set but actual reps missing
  return `${plannedStr} → — actual`;
}

/**
 * Formats load plan versus actual comparison string neutrally.
 *
 * Examples:
 * - 95 kg planned → 100 kg actual (+5 kg)
 * - 100 kg planned → 95 kg actual (-5 kg)
 * - 95 kg planned → 95 kg actual (0 difference)
 * - 95 kg planned (when skipped or not attempted)
 * - 100 kg (extra) (when unprescribed extra set)
 */
export function formatLoadComparison(comp: SetAdherenceComparison): string | null {
  if (!comp) return null;

  // Unprescribed extra set
  if (!comp.isPrescribed) {
    if (typeof comp.actualWeight === 'number' && !isNaN(comp.actualWeight)) {
      const aUnit = comp.actualUnit ? ` ${comp.actualUnit}` : '';
      return `${comp.actualWeight}${aUnit} (extra)`;
    }
    return null;
  }

  // Prescribed set without explicit prescribed load (e.g. reps-only or RPE-only)
  if (comp.prescribedWeight === undefined) {
    if (typeof comp.actualWeight === 'number' && !isNaN(comp.actualWeight)) {
      const aUnit = comp.actualUnit ? ` ${comp.actualUnit}` : '';
      return `${comp.actualWeight}${aUnit} actual (unprescribed load)`;
    }
    return null;
  }

  const pUnit = comp.prescribedUnit ? ` ${comp.prescribedUnit}` : '';
  const plannedStr = `${comp.prescribedWeight}${pUnit} planned`;

  // Skipped, not attempted, or uncompleted sets never show deltas
  if (!comp.isCompleted || comp.status === 'skipped' || comp.status === 'not_attempted') {
    return plannedStr;
  }

  // Completed prescribed set
  if (typeof comp.actualWeight === 'number' && !isNaN(comp.actualWeight)) {
    const aUnit = comp.actualUnit ? ` ${comp.actualUnit}` : pUnit;
    const actualStr = `${comp.actualWeight}${aUnit} actual`;

    let deltaStr = '';
    if (comp.loadDelta !== null && comp.loadDeltaUnit) {
      if (comp.loadDelta === 0) {
        deltaStr = ' (0 difference)';
      } else if (comp.loadDelta > 0) {
        deltaStr = ` (+${comp.loadDelta} ${comp.loadDeltaUnit})`;
      } else {
        deltaStr = ` (${comp.loadDelta} ${comp.loadDeltaUnit})`;
      }
    }
    return `${plannedStr} → ${actualStr}${deltaStr}`;
  }

  // Completed prescribed set but actual weight missing
  return `${plannedStr} → — actual`;
}

/**
 * Formats RPE plan versus actual comparison string neutrally.
 *
 * Examples:
 * - @8 planned → @9 actual (+1 RPE)
 * - @8 planned → @7.5 actual (-0.5 RPE)
 * - @8 planned → @8 actual (0 difference)
 * - @8 planned (when skipped or not attempted)
 * - @8.5 actual (extra) (when unprescribed extra set)
 */
export function formatRpeComparison(comp: SetAdherenceComparison): string | null {
  if (!comp) return null;

  // Unprescribed extra set
  if (!comp.isPrescribed) {
    if (typeof comp.actualRpe === 'number' && !isNaN(comp.actualRpe)) {
      return `@${comp.actualRpe} actual (extra)`;
    }
    return null;
  }

  // Prescribed set without explicit prescribed RPE
  if (comp.prescribedRpe === undefined) {
    if (typeof comp.actualRpe === 'number' && !isNaN(comp.actualRpe)) {
      return `@${comp.actualRpe} actual (unprescribed RPE)`;
    }
    return null;
  }

  const plannedStr = `@${comp.prescribedRpe} planned`;

  // Skipped, not attempted, or uncompleted sets never show deltas
  if (!comp.isCompleted || comp.status === 'skipped' || comp.status === 'not_attempted') {
    return plannedStr;
  }

  // Completed prescribed set
  if (typeof comp.actualRpe === 'number' && !isNaN(comp.actualRpe)) {
    let deltaStr = '';
    if (comp.rpeDelta !== null) {
      if (comp.rpeDelta === 0) {
        deltaStr = ' (0 difference)';
      } else if (comp.rpeDelta > 0) {
        deltaStr = ` (+${comp.rpeDelta} RPE)`;
      } else {
        deltaStr = ` (${comp.rpeDelta} RPE)`;
      }
    }
    return `${plannedStr} → @${comp.actualRpe} actual${deltaStr}`;
  }

  // Completed prescribed set but actual RPE missing
  return `${plannedStr} → — actual`;
}

/**
 * Determines the visual badge label and styling variant for a set adherence comparison.
 */
export function getSetStatusBadge(comp: SetAdherenceComparison): {
  label: string;
  variant: 'completed' | 'skipped' | 'not_attempted' | 'extra' | 'pending';
  badgeClass: string;
} {
  if (!comp.isPrescribed && comp.isCompleted) {
    return {
      label: 'EXTRA SET',
      variant: 'extra',
      badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    };
  }

  if (comp.status === 'skipped') {
    return {
      label: 'SKIPPED',
      variant: 'skipped',
      badgeClass: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    };
  }

  if (comp.status === 'not_attempted') {
    return {
      label: 'NOT ATTEMPTED',
      variant: 'not_attempted',
      badgeClass: 'bg-bg-secondary text-text-muted border border-border/60',
    };
  }

  if (comp.status === 'pending') {
    return {
      label: 'PENDING',
      variant: 'pending',
      badgeClass: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
    };
  }

  if (comp.isCompleted) {
    return {
      label: 'COMPLETED',
      variant: 'completed',
      badgeClass: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    };
  }

  return {
    label: 'NOT ATTEMPTED',
    variant: 'not_attempted',
    badgeClass: 'bg-bg-secondary text-text-muted border border-border/60',
  };
}

/**
 * Formats a set count with proper grammatical pluralization.
 * Examples:
 * - 0 sets
 * - 1 set
 * - 2 sets
 */
export function formatSetCount(count: number): string {
  return `${count} ${count === 1 ? 'set' : 'sets'}`;
}

/**
 * Formats the summary text for prescribed set completion rate.
 *
 * Rules:
 * - If workout has no prescription data, returns neutral unavailable indicator (never 0%).
 * - If workout has prescription data, returns exact percentage and set count breakdown.
 */
export function formatSetCompletionSummary(summary: WorkoutAdherenceSummary): {
  label: string;
  hasPrescription: boolean;
  completionRateFormatted: string | null;
  detailText: string;
} {
  if (!summary || !summary.hasPrescriptionData) {
    return {
      label: 'Set completion',
      hasPrescription: false,
      completionRateFormatted: null,
      detailText: 'Manually logged session — no prescribed targets recorded',
    };
  }

  const rate =
    summary.setCompletionPercentage !== null
      ? `${summary.setCompletionPercentage}%`
      : '—';

  const setWord = summary.totalPrescribedSets === 1 ? 'set' : 'sets';

  return {
    label: 'Set completion',
    hasPrescription: true,
    completionRateFormatted: rate,
    detailText: `${summary.completedPrescribedSets} of ${summary.totalPrescribedSets} prescribed ${setWord} completed`,
  };
}
