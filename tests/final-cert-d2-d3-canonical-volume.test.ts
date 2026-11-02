/**
 * Final-cert D-2 (P2) + D-3 (P3): WeeklyRecapModal, PostWorkoutTakeModal
 * and the ActiveWorkoutScreen live counter must all use the canonical
 * DI-05 volume (src/lib/volume.ts) instead of ad-hoc weight×reps loops.
 *
 * D-2 pinned inputs (from tests/gauntlet-di05-volume.test.ts):
 *  - 100 lbs × 10 completed, kg profile → 453.6 kg (the old Recap loop
 *    showed 1000 "KG" — no lbs→kg conversion).
 *  - Pull-ups 3×10 @ BW 80 → 2400 kg (the old loops showed 0 — no
 *    bodyweight load; D-3's two surfaces had the same omission).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { calculateWorkoutVolumeKg, calculateExerciseVolumeKg } from '../src/lib/volume';
import type { WorkoutEntry, WorkoutSet } from '../src/lib/types';

function set(partial: Partial<WorkoutSet>): WorkoutSet {
  return { reps: 0, unit: 'kg', status: 'completed', completed: true, ...partial };
}

const lbsBench: WorkoutEntry = {
  id: 'fc-lbs',
  name: 'Bench Day',
  date: '2026-10-26',
  exercises: [
    { name: 'Bench Press', sets: [set({ reps: 10, weight: 100, unit: 'lbs' })] },
  ],
} as WorkoutEntry;

const pullups: WorkoutEntry = {
  id: 'fc-pullups',
  name: 'Pull Day',
  date: '2026-10-26',
  exercises: [
    {
      name: 'Pull-ups',
      sets: [set({ reps: 10, weight: 0 }), set({ reps: 10, weight: 0 }), set({ reps: 10, weight: 0 })],
    },
  ],
} as WorkoutEntry;

describe('final-cert D-2/D-3: canonical volume pinned inputs', () => {
  it('100 lbs × 10 → 453.6 kg (not the Recap loop\u2019s 1000)', () => {
    expect(calculateWorkoutVolumeKg(lbsBench, 80)).toBeCloseTo(453.6, 1);
  });

  it('pull-ups 3×10 @ BW 80 → 2400 kg at workout and exercise level (not 0)', () => {
    expect(calculateWorkoutVolumeKg(pullups, 80)).toBe(2400);
    expect(calculateExerciseVolumeKg(pullups.exercises[0], 80)).toBe(2400);
  });

  it('uncompleted sets never count, even with load', () => {
    const w = {
      ...pullups,
      exercises: [
        { name: 'Pull-ups', sets: [set({ reps: 10, weight: 0, status: 'pending', completed: false })] },
      ],
    } as unknown as WorkoutEntry;
    expect(calculateWorkoutVolumeKg(w, 80)).toBe(0);
  });
});

describe('final-cert D-2/D-3: all three surfaces route through lib/volume', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('WeeklyRecapModal uses calculateWorkoutVolumeKg with the profile bodyweight', () => {
    const src = read('src/components/WeeklyRecapModal.tsx');
    expect(src).toContain('calculateWorkoutVolumeKg(w, profile?.bodyweightKg)');
    expect(src).not.toContain('totalVolume += weight * reps');
  });

  it('PostWorkoutTakeModal uses calculateWorkoutVolumeKg with the profile bodyweight', () => {
    const src = read('src/components/PostWorkoutTakeModal.tsx');
    expect(src).toContain('calculateWorkoutVolumeKg(');
    expect(src).toContain('store.profile?.bodyweightKg');
    expect(src).not.toContain('if (r > 0 && w > 0)');
  });

  it('ActiveWorkoutScreen live counter uses calculateExerciseVolumeKg with bodyweight', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    expect(src).toContain('calculateExerciseVolumeKg(ex, profile?.bodyweightKg)');
  });
});
