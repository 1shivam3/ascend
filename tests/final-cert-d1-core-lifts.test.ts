/**
 * Final-cert D-1 (P2): Progress `coreLifts` must use exact normalized
 * matching (exerciseNamesEqual), not substring `.includes()`. Before
 * the fix, an Incline Bench Press PR alone made the overview list
 * "Bench Press — 120 kg" for a user with no Bench Press record.
 */
import { describe, it, expect } from 'vitest';
import { computeCoreLifts } from '../src/lib/core-lifts';
import type { PersonalRecord, WorkoutEntry } from '../src/lib/types';

function pr(exercise: string, oneRepMax: number, reps = 1): PersonalRecord {
  return {
    id: `pr-${exercise}`,
    exercise,
    weightKg: oneRepMax,
    weightLbs: Math.round(oneRepMax * 2.20462),
    reps,
    oneRepMax,
    date: '2026-10-20',
  } as PersonalRecord;
}

function workout(name: string, weight: number, reps: number): WorkoutEntry {
  return {
    id: `w-${name}`,
    date: '2026-10-20',
    exercises: [{ name, sets: [{ reps, weight, unit: 'kg', completed: true }] }],
  } as WorkoutEntry;
}

describe('final-cert D-1: computeCoreLifts exact matching', () => {
  it('an Incline Bench Press PR alone does NOT list Bench Press', () => {
    const lifts = computeCoreLifts([pr('Incline Bench Press', 120)], []);
    const bench = lifts.find((l) => l.name === 'Bench Press')!;
    expect(bench.hasRealRecord).toBe(false);
    expect(bench.best1RMKg).toBeNull();
  });

  it('positive control: an exact Bench Press PR still lists', () => {
    const lifts = computeCoreLifts([pr('Bench Press', 100)], []);
    const bench = lifts.find((l) => l.name === 'Bench Press')!;
    expect(bench.hasRealRecord).toBe(true);
    expect(bench.best1RMKg).toBe(100);
    expect(bench.isEstimate).toBe(false); // a performed single
  });

  it('the heavier variant does not win over a real Bench Press PR', () => {
    const lifts = computeCoreLifts([pr('Bench Press', 100), pr('Incline Bench Press', 120)], []);
    expect(lifts.find((l) => l.name === 'Bench Press')!.best1RMKg).toBe(100);
  });

  it('variant squats/deadlifts do not inflate the base lifts (PR or workout path)', () => {
    const lifts = computeCoreLifts(
      [pr('Front Squat', 140), pr('Sumo Deadlift', 200)],
      [workout('Goblet Squat', 60, 5)],
    );
    expect(lifts.find((l) => l.name === 'Squat')!.hasRealRecord).toBe(false);
    expect(lifts.find((l) => l.name === 'Deadlift')!.hasRealRecord).toBe(false);
  });

  it('hero-lift fallback path: workout fallback uses exact matching too', () => {
    const lifts = computeCoreLifts([], [workout('Incline Bench Press', 120, 1)]);
    expect(lifts.find((l) => l.name === 'Bench Press')!.hasRealRecord).toBe(false);
    const withBench = computeCoreLifts([], [workout('bench press', 100, 5)]);
    const bench = withBench.find((l) => l.name === 'Bench Press')!;
    expect(bench.hasRealRecord).toBe(true);
    expect(bench.best1RMKg).toBeGreaterThan(100); // e1RM from a 5-rep set
    expect(bench.isEstimate).toBe(true);
  });

  it('exact aliases still match: Bench, OHP, Military Press', () => {
    const lifts = computeCoreLifts([pr('Bench', 90), pr('ohp', 60)], []);
    expect(lifts.find((l) => l.name === 'Bench Press')!.best1RMKg).toBe(90);
    expect(lifts.find((l) => l.name === 'Overhead Press')!.best1RMKg).toBe(60);
  });

  it('a multi-rep PR is flagged as an estimate (J4.1 provenance)', () => {
    const lifts = computeCoreLifts([pr('Bench Press', 116.7, 5)], []);
    expect(lifts.find((l) => l.name === 'Bench Press')!.isEstimate).toBe(true);
  });
});
