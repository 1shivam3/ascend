/**
 * Core-lift overview computation for Progress (final-cert D-1).
 *
 * Extracted from ProgressPage's `coreLifts` memo so the matching rule
 * is unit-testable. The memo used to match PRs and workout exercises
 * with substring `.includes()` over bare fragments ('bench', 'squat'),
 * so a variant lift's record was displayed as the base lift's 1RM —
 * an 'Incline Bench Press' 120 kg PR listed as "Bench Press — 120 kg"
 * for a user with no Bench Press record at all (the FE-03 harm, which
 * the fix had applied to the analytics memos but not to this block).
 *
 * The rule here is the same exact normalized matching used by the
 * analytics (exerciseNamesEqual, lifter-twin.ts): a core lift matches
 * only its own name or one of its exact aliases ('Bench', 'OHP',
 * 'Military Press') — never a longer variant name containing it.
 */

import { exerciseNamesEqual } from './lifter-twin';
import { calculateOneRepMax } from './strength-standards';
import { isSetCompleted, type PersonalRecord, type WorkoutEntry } from './types';

export interface CoreLift {
  name: string;
  best1RMKg: number | null;
  hasRealRecord: boolean;
  /**
   * True when best1RMKg is an estimate rather than a performed single:
   * a multi-rep PR's stored oneRepMax is the Epley estimate, and the
   * workout fallback is always an estimated 1RM. A 1-rep PR is a real
   * single and is NOT an estimate (final-cert J4.1: the Progress PR
   * list labels estimates "est." like the charts do).
   */
  isEstimate: boolean;
}

export const CORE_LIFT_ALIASES: ReadonlyArray<{ name: string; aliases: string[] }> = [
  { name: 'Squat', aliases: ['Squat'] },
  { name: 'Bench Press', aliases: ['Bench Press', 'Bench'] },
  { name: 'Deadlift', aliases: ['Deadlift'] },
  { name: 'Overhead Press', aliases: ['Overhead Press', 'OHP', 'Military Press'] },
];

function matchesCoreLift(exerciseName: string, aliases: string[]): boolean {
  return aliases.some((alias) => exerciseNamesEqual(exerciseName, alias));
}

export function computeCoreLifts(
  prs: PersonalRecord[],
  workouts: WorkoutEntry[],
): CoreLift[] {
  return CORE_LIFT_ALIASES.map((item) => {
    // Check PRs (exact normalized matching only).
    const matchPRs = prs
      .filter((p) => matchesCoreLift(p.exercise, item.aliases))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let best1RMKg: number | null = null;
    let isEstimate = false;

    if (matchPRs.length > 0) {
      const best = matchPRs.reduce((a, b) => (b.oneRepMax > a.oneRepMax ? b : a));
      best1RMKg = best.oneRepMax;
      isEstimate = best.reps !== 1;
    }

    // Check workouts if no PR found (same exact matching).
    if (best1RMKg === null) {
      let maxWorkout1RM = 0;
      workouts.forEach((w) => {
        w.exercises.forEach((ex) => {
          if (matchesCoreLift(ex.name, item.aliases)) {
            ex.sets.filter(isSetCompleted).forEach((s) => {
              if (s.weight && s.reps) {
                const wKg = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
                const e1rm = calculateOneRepMax(wKg, s.reps);
                if (e1rm > maxWorkout1RM) maxWorkout1RM = e1rm;
              }
            });
          }
        });
      });
      if (maxWorkout1RM > 0) {
        best1RMKg = maxWorkout1RM;
        isEstimate = true;
      }
    }

    return {
      name: item.name,
      best1RMKg,
      hasRealRecord: best1RMKg !== null,
      isEstimate: best1RMKg !== null && isEstimate,
    };
  });
}
