/**
 * Coach session builder — turns a planned workout + today's readiness
 * into the session the Coach tab starts.
 *
 * This module is deliberately SMALL. Readiness scoring, missed sessions,
 * stalls, and weekly reviews already live in `coach-engine.ts` and are
 * reused via `useCoachDigest` — this file only does what no existing
 * helper does: adjust one session for today's band, sore/pain areas,
 * available minutes, and location.
 *
 * Rules (from the 2026-10-26 best-in-class coach research, §5 V1):
 * - Band → volume: primed/ready = as planned; caution = ~15% fewer sets
 *   (min 1 per exercise); rest = light variant (1 set per exercise).
 * - Sore areas: when freshness (soreness) is ≤ 2, exercises whose primary
 *   muscle is a flagged area are skipped — unless that would empty the
 *   session, in which case they stay and only sets are cut.
 * - Pain: any flagged pain area STOPS the session (deterministic pain
 *   screen: stop + refer, never diagnose). `trainAroundPain` is the
 *   user's explicit override: pain areas are then treated as sore areas.
 * - Time-box: accessories (last exercises) drop first until the estimate
 *   fits, then sets trim — never below 2 exercises or 1 set.
 * - Home: gym-only equipment (Barbell / Machine / Smith Machine / Cable)
 *   is flagged with library substitutes; nothing is auto-dropped, the
 *   user swaps with one tap.
 * - Muscle resolution uses `resolveExerciseMuscle` (null for unknown
 *   names) — never `getExerciseMuscle`, whose 'Chest' fallback would
 *   wrongly exclude unknown exercises when Chest is sore.
 */

import {
  resolveExerciseMuscle,
  findLibraryExercise,
  getLibrarySubstitutes,
} from './exercise-library';
import type { MuscleGroup } from './exercise-library';
import { estimatePlanDurationMin } from './workout-engine';
import type { PlannedExercise, PlannedWorkout } from './types';
import type { ReadinessResult } from './coach-engine';

/** Gym-only equipment — everything else is doable at home. */
export const GYM_ONLY_EQUIPMENT = ['Barbell', 'Machine', 'Smith Machine', 'Cable'] as const;

export interface SessionExercise {
  exercise: PlannedExercise;
  /** True when the exercise needs gym equipment and location is home. */
  needsGym: boolean;
  /** Up to 2 library substitute names (home flag only). */
  substitutes: string[];
}

export interface AdjustedSession {
  exercises: SessionExercise[];
  droppedForSoreness: number;
  droppedForTime: number;
  setsCut: boolean;
  /** Conservative duration estimate (the estimate's upper bound). */
  estimatedMin: number;
  /** True when the pain screen must stop the session. */
  stopForPain: boolean;
}

export interface SessionAdjustOptions {
  /** Readiness band from calculateReadiness (primed | ready | caution | rest). */
  band: ReadinessResult['band'];
  /** 1 (wrecked) – 5 (fresh). Areas only exclude when ≤ 2. */
  soreness: number;
  soreAreas: MuscleGroup[];
  painAreas: MuscleGroup[];
  /** User explicitly chose "train around it" on the pain screen. */
  trainAroundPain?: boolean;
  /** Available minutes (clamped to 10–180). */
  minutes: number;
  location: 'gym' | 'home';
}

const clampMinutes = (m: number): number =>
  Number.isFinite(m) ? Math.max(10, Math.min(180, Math.round(m))) : 45;

export function adjustSession(
  plan: PlannedWorkout,
  opts: SessionAdjustOptions
): AdjustedSession {
  const painAreas = opts.painAreas || [];
  if (painAreas.length > 0 && !opts.trainAroundPain) {
    return {
      exercises: [],
      droppedForSoreness: 0,
      droppedForTime: 0,
      setsCut: false,
      estimatedMin: 0,
      stopForPain: true,
    };
  }

  // Sore-area exclusion: pain areas (train-around mode) plus sore areas
  // when freshness is low. Unknown exercises resolve to null and are
  // never excluded.
  const exclusionAreas = new Set<MuscleGroup>();
  if (opts.trainAroundPain) {
    for (const a of painAreas) exclusionAreas.add(a);
  }
  if (opts.soreness <= 2) {
    for (const a of opts.soreAreas || []) exclusionAreas.add(a);
  }

  let kept: PlannedExercise[] = [...(plan.exercises || [])];
  let droppedForSoreness = 0;
  if (exclusionAreas.size > 0 && kept.length > 0) {
    const remaining = kept.filter((e) => {
      const muscle = resolveExerciseMuscle(e.name);
      return muscle === null || !exclusionAreas.has(muscle);
    });
    // Never empty the session: if everything would go, keep it all and
    // let the volume cut below do the work.
    if (remaining.length > 0) {
      droppedForSoreness = kept.length - remaining.length;
      kept = remaining;
    }
  }

  // Volume by band.
  let setsCut = false;
  const cutSets = (list: PlannedExercise[], factor: number): PlannedExercise[] =>
    list.map((e) => {
      const next = Math.max(1, Math.round(e.targetSets * factor));
      if (next !== e.targetSets) setsCut = true;
      return next === e.targetSets ? e : { ...e, targetSets: next };
    });
  if (opts.band === 'caution') {
    kept = cutSets(kept, 0.85);
  } else if (opts.band === 'rest') {
    kept = kept.map((e) => {
      if (e.targetSets !== 1) setsCut = true;
      return e.targetSets === 1 ? e : { ...e, targetSets: 1 };
    });
  }

  // Time-box: drop accessories (last) first, then trim sets.
  const minutes = clampMinutes(opts.minutes);
  let droppedForTime = 0;
  const estimate = () => estimatePlanDurationMin({ exercises: kept }).max;
  while (kept.length > 2 && estimate() > minutes) {
    kept = kept.slice(0, -1);
    droppedForTime += 1;
  }
  let guard = 0;
  while (estimate() > minutes && kept.some((e) => e.targetSets > 1) && guard < 5) {
    guard += 1;
    kept = kept.map((e) => {
      if (e.targetSets <= 1) return e;
      setsCut = true;
      return { ...e, targetSets: e.targetSets - 1 };
    });
  }

  // Home flags (no auto-drop — the user swaps).
  const exercises: SessionExercise[] = kept.map((e) => {
    if (opts.location !== 'home') return { exercise: e, needsGym: false, substitutes: [] };
    const lib = findLibraryExercise(e.name);
    if (!lib || !(GYM_ONLY_EQUIPMENT as readonly string[]).includes(lib.equipment)) {
      return { exercise: e, needsGym: false, substitutes: [] };
    }
    return {
      exercise: e,
      needsGym: true,
      substitutes: getLibrarySubstitutes(lib)
        .slice(0, 2)
        .map((s) => s.target.name),
    };
  });

  return {
    exercises,
    droppedForSoreness,
    droppedForTime,
    setsCut,
    estimatedMin: kept.length === 0 ? 0 : estimate(),
    stopForPain: false,
  };
}

/**
 * Swap one session exercise for a substitute: sets/reps stay, the load
 * is cleared so the start flow pre-fills it from PRs/defaults instead
 * of carrying the old lift's weight onto a new movement.
 */
export function swapSessionExercise(
  exercises: PlannedExercise[],
  index: number,
  newName: string
): PlannedExercise[] {
  if (index < 0 || index >= exercises.length) return exercises;
  return exercises.map((e, i) =>
    i === index ? { ...e, name: newName, targetWeight: undefined, notes: undefined } : e
  );
}

/** Protein target from bodyweight (1.6–2.2 g/kg/day). Null without a weight. */
export function proteinTargetG(bodyweightKg: number | undefined | null): { min: number; max: number } | null {
  if (typeof bodyweightKg !== 'number' || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) {
    return null;
  }
  return { min: Math.round(bodyweightKg * 1.6), max: Math.round(bodyweightKg * 2.2) };
}

/** This week's one-change suggestion from adherence (exactly one change). */
export type WeeklySuggestionKind = 'shrink' | 'progress' | 'hold';

export function weeklySuggestion(
  sessionsPlanned: number,
  sessionsDone: number
): { kind: WeeklySuggestionKind; missed: number } {
  const missed = Math.max(0, sessionsPlanned - sessionsDone);
  if (sessionsPlanned > 0 && sessionsDone / sessionsPlanned < 0.5) {
    return { kind: 'shrink', missed };
  }
  if (sessionsPlanned > 0 && sessionsDone >= sessionsPlanned) {
    return { kind: 'progress', missed };
  }
  return { kind: 'hold', missed };
}
