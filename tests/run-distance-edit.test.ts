import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildRunWorkoutEntry,
  getRunSession,
  normalizeRunDistanceKm,
  MAX_RUN_DISTANCE_KM,
} from '../src/lib/run-program';
import { sanitizeWorkoutUpdate } from '../src/lib/update-sanitize';
import { useStore } from '../src/lib/store';
import type { WorkoutEntry } from '../src/lib/types';

const runEntry = (id: string, distanceKm?: number): WorkoutEntry =>
  buildRunWorkoutEntry({
    id,
    session: getRunSession('c25k-w2d1')!,
    date: '2026-10-05',
    durationSeconds: 1800,
    intervalsCompleted: 18,
    intervalsTotal: 18,
    ...(distanceKm !== undefined ? { distanceKm } : {}),
  });

describe('normalizeRunDistanceKm — the one distance rule', () => {
  it('keeps valid values and rounds to 2 decimals (same as the completion save)', () => {
    expect(normalizeRunDistanceKm(5)).toBe(5);
    expect(normalizeRunDistanceKm(3.456)).toBe(3.46);
    expect(normalizeRunDistanceKm(3.454)).toBe(3.45);
    expect(normalizeRunDistanceKm('7.5')).toBe(7.5);
    expect(normalizeRunDistanceKm(MAX_RUN_DISTANCE_KM)).toBe(MAX_RUN_DISTANCE_KM);
  });

  it('rejects non-finite, non-positive, and over-ceiling values', () => {
    expect(normalizeRunDistanceKm(0)).toBeUndefined();
    expect(normalizeRunDistanceKm(-2)).toBeUndefined();
    expect(normalizeRunDistanceKm(NaN)).toBeUndefined();
    expect(normalizeRunDistanceKm(Infinity)).toBeUndefined();
    expect(normalizeRunDistanceKm(MAX_RUN_DISTANCE_KM + 0.01)).toBeUndefined();
    expect(normalizeRunDistanceKm('abc')).toBeUndefined();
    expect(normalizeRunDistanceKm(undefined)).toBeUndefined();
    expect(normalizeRunDistanceKm(null)).toBeUndefined();
  });

  it('the completion builder applies the same rule (no second rounding path)', () => {
    expect(runEntry('b1', 3.456).distanceKm).toBe(3.46);
    expect(runEntry('b2', 9999).distanceKm).toBeUndefined();
    expect(runEntry('b3').distanceKm).toBeUndefined();
  });
});

describe('sanitizeWorkoutUpdate — distance at the store boundary', () => {
  it('sets, changes, and rounds distanceKm', () => {
    const base = runEntry('s1');
    const set = sanitizeWorkoutUpdate(base, { distanceKm: 5.237 });
    expect(set.distanceKm).toBe(5.24);
    const changed = sanitizeWorkoutUpdate(set, { distanceKm: 6 });
    expect(changed.distanceKm).toBe(6);
  });

  it('an explicit undefined CLEARS the field entirely', () => {
    const withKm = runEntry('s2', 4.2);
    const cleared = sanitizeWorkoutUpdate(withKm, { distanceKm: undefined });
    expect(cleared.distanceKm).toBeUndefined();
    expect('distanceKm' in cleared).toBe(false);
  });

  it('an invalid number keeps the existing value (clearing is explicit only)', () => {
    const withKm = runEntry('s3', 4.2);
    expect(sanitizeWorkoutUpdate(withKm, { distanceKm: 99999 }).distanceKm).toBe(4.2);
    expect(sanitizeWorkoutUpdate(withKm, { distanceKm: NaN }).distanceKm).toBe(4.2);
    expect(sanitizeWorkoutUpdate(withKm, { distanceKm: -1 }).distanceKm).toBe(4.2);
  });

  it('an update that does not mention distanceKm leaves it untouched', () => {
    const withKm = runEntry('s4', 4.2);
    const renamed = sanitizeWorkoutUpdate(withKm, { name: 'Renamed' });
    expect(renamed.distanceKm).toBe(4.2);
    expect(renamed.name).toBe('Renamed');
  });
});

describe('store updateWorkout — set → change → clear on a saved run', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('round-trips the distance on the stored record', () => {
    const store = useStore.getState();
    store.addWorkout(runEntry('w1'));
    const get = () => useStore.getState().workouts.find((w) => w.id === 'w1')!;

    expect(get().distanceKm).toBeUndefined();

    store.updateWorkout('w1', { distanceKm: 5.237 });
    expect(get().distanceKm).toBe(5.24);
    // A genuine edit is stamped so sync newest-wins sees it (DI-08).
    expect(get().updatedAt).toBeTruthy();

    store.updateWorkout('w1', { distanceKm: 6.5 });
    expect(get().distanceKm).toBe(6.5);

    store.updateWorkout('w1', { distanceKm: undefined });
    expect(get().distanceKm).toBeUndefined();
    expect('distanceKm' in get()).toBe(false);

    // The rest of the record survives the edits untouched.
    expect(get().kind).toBe('run');
    expect(get().runSessionId).toBe('c25k-w2d1');
    expect(get().exercises).toHaveLength(1);
  });

  it('does not touch other records and ignores unknown ids', () => {
    const store = useStore.getState();
    store.addWorkout(runEntry('w2'));
    store.addWorkout(runEntry('w3', 2.5));
    store.updateWorkout('w2', { distanceKm: 3 });
    expect(useStore.getState().workouts.find((w) => w.id === 'w3')!.distanceKm).toBe(2.5);
    store.updateWorkout('nope', { distanceKm: 3 });
    expect(useStore.getState().workouts).toHaveLength(2);
  });
});

describe('distance edit surface (source pins)', () => {
  const workoutPage = readFileSync('src/components/WorkoutPage.tsx', 'utf8');
  const detailsView = readFileSync('src/components/WorkoutDetailsView.tsx', 'utf8');

  it('the edit row renders ONLY for run records in the History expansion', () => {
    expect(workoutPage).toContain("workout.kind === 'run' && <RunDistanceRow workout={workout} />");
    expect(workoutPage).toContain('function RunDistanceRow');
  });

  it('the row writes through updateWorkout with a decimal input (km, step 0.01)', () => {
    expect(workoutPage).toContain('state.updateWorkout');
    expect(workoutPage).toContain('inputMode="decimal"');
    expect(workoutPage).toContain('step="0.01"');
    // Empty save clears: the editor passes distanceKm: undefined.
    expect(workoutPage).toContain("trimmed === '' ? undefined : normalizeRunDistanceKm(parsed)");
  });

  it('WorkoutDetailsView is the PLAN detail view — it has no distance surface', () => {
    // Recorded so the surface choice is deliberate: saved-workout detail
    // lives in the History expansion, not in the plan detail view.
    expect(detailsView).not.toContain('distanceKm');
    expect(detailsView).toContain('plan: PlannedWorkout');
  });
});
