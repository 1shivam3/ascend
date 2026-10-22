import { describe, it, expect } from 'vitest';
import {
  getPackedGymSwap,
  getPackedGymSwapsForNames,
  applyPackedSwapToPlanExercise,
  applyPackedSwapsToPlan,
  packedEquipmentOf,
} from '../src/lib/crowded-gym';
import { getExerciseMuscle } from '../src/lib/exercise-library';
import type { PlannedWorkout } from '../src/lib/types';

const GYM_EXERCISES = [
  'Bench Press',
  'Incline Bench Press',
  'Chest Press Machine',
  'Cable Fly',
  'Barbell Squat',
  'Hack Squat',
  'Leg Press',
  'Leg Extension',
  'Deadlift',
  'Romanian Deadlift',
  'Barbell Row',
  'Seated Cable Row',
  'Lat Pulldown',
  'Overhead Press',
  'Smith Machine Squat',
];

describe('getPackedGymSwap', () => {
  it('suggests the dumbbell twin for the flagship case: Bench Press', () => {
    const swap = getPackedGymSwap('Bench Press');
    expect(swap?.name).toBe('Dumbbell Bench Press');
    expect(swap?.equipment).toBe('dumbbell');
  });

  it('only ever suggests minimal-equipment, same-muscle, bar-free swaps', () => {
    for (const name of GYM_EXERCISES) {
      const swap = getPackedGymSwap(name);
      if (!swap) continue;
      // Minimal equipment only — never barbell/cable/machine/smith.
      expect(['dumbbell', 'bodyweight']).toContain(swap.equipment);
      expect(packedEquipmentOf(swap.name, swap.equipment)).toBe(swap.equipment);
      // Same muscle group as the original.
      expect(getExerciseMuscle(swap.name)).toBe(getExerciseMuscle(name));
      // Never the exercise itself, never a bar-dependent move.
      expect(swap.name.toLowerCase()).not.toBe(name.toLowerCase());
      expect(swap.name).not.toMatch(/pull[- ]?ups?|chin[- ]?ups?/i);
    }
  });

  it('covers the common packed-gym lifts', () => {
    expect(getPackedGymSwap('Barbell Squat')?.name).toBe('Goblet Squat');
    expect(getPackedGymSwap('Deadlift')?.name).toBe('Dumbbell Romanian Deadlift');
    expect(getPackedGymSwap('Lat Pulldown')?.name).toBe('Single-Arm Dumbbell Row');
    expect(getPackedGymSwap('Cable Fly')?.name).toBe('Dumbbell Chest Fly');
    // PR-A2: the old table's target "Dumbbell Shoulder Press" never existed
    // in the library — the real exercise is the seated variant.
    expect(getPackedGymSwap('Overhead Press')?.name).toBe('Seated Dumbbell Shoulder Press');
  });

  it('returns null for exercises that are already minimal-equipment', () => {
    expect(getPackedGymSwap('Push-ups')).toBeNull();
    expect(getPackedGymSwap('Dumbbell Bench Press')).toBeNull();
    expect(getPackedGymSwap('Pull-ups')).toBeNull();
    expect(getPackedGymSwap('')).toBeNull();
  });

  it('never suggests pull-ups/chin-ups (they need a bar)', () => {
    // Lat Pulldown's table leads with Pull-ups; the suggestion must be
    // the next-best bar-free option instead.
    const swap = getPackedGymSwap('Lat Pulldown');
    expect(swap).not.toBeNull();
    expect(swap?.name).not.toMatch(/pull[- ]?up/i);
  });

  it('respects the exclusion list', () => {
    expect(getPackedGymSwap('Bench Press', { exclusions: ['Dumbbell Bench Press'] })).toBeNull();
    const swap = getPackedGymSwap('Barbell Squat', { exclusions: ['Goblet Squat'] });
    if (swap) expect(swap.name).not.toBe('Goblet Squat');
  });

  it('aligns suggestions by index for a whole session', () => {
    const swaps = getPackedGymSwapsForNames(['Bench Press', 'Push-ups', 'Barbell Squat']);
    expect(swaps).toHaveLength(3);
    expect(swaps[0]?.name).toBe('Dumbbell Bench Press');
    expect(swaps[1]).toBeNull();
    expect(swaps[2]?.name).toBe('Goblet Squat');
  });
});

describe('applyPackedSwapToPlanExercise', () => {
  it('adapts a barbell load to a realistic dumbbell load (60 kg → 20 kg)', () => {
    const swapped = applyPackedSwapToPlanExercise(
      { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
      false
    );
    expect(swapped?.name).toBe('Dumbbell Bench Press');
    // Engine rule: ~35% of the barbell load, rounded to a 2.5 kg step.
    expect(swapped?.targetWeight).toBe(20);
    expect(swapped?.targetSets).toBe(4);
    expect(swapped?.targetReps).toBe(8);
    expect(swapped?.notes).toContain('Swapped from Bench Press — gym packed');
  });

  it('adapts loads in lbs too (135 lb → 45 lb)', () => {
    const swapped = applyPackedSwapToPlanExercise(
      { name: 'Bench Press', targetSets: 3, targetReps: 10, targetWeight: 135, targetUnit: 'lbs' },
      true
    );
    expect(swapped?.targetWeight).toBe(45);
  });

  it('returns null (no change) for already-minimal exercises', () => {
    expect(
      applyPackedSwapToPlanExercise({ name: 'Push-ups', targetSets: 3, targetReps: 15 }, false)
    ).toBeNull();
  });

  it('does not mutate the original exercise', () => {
    const original = { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: 60 };
    applyPackedSwapToPlanExercise(original, false);
    expect(original.name).toBe('Bench Press');
    expect(original.targetWeight).toBe(60);
  });
});

describe('applyPackedSwapsToPlan (preview toggle semantics)', () => {
  const plan: PlannedWorkout = {
    id: 'p1',
    name: 'Push Day',
    createdAt: '2026-10-20T00:00:00.000Z',
    exercises: [
      { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
      { name: 'Push-ups', targetSets: 3, targetReps: 15 },
      { name: 'Overhead Press', targetSets: 3, targetReps: 10, targetWeight: 40, targetUnit: 'kg' },
    ],
  };

  it('pre-swaps the whole plan into a NEW plan object', () => {
    const { plan: swapped, swappedCount } = applyPackedSwapsToPlan(plan, false);
    expect(swappedCount).toBe(2);
    expect(swapped).not.toBe(plan);
    expect(swapped.exercises[0].name).toBe('Dumbbell Bench Press');
    expect(swapped.exercises[1].name).toBe('Push-ups'); // already minimal — untouched
    expect(swapped.exercises[2].name).toBe('Seated Dumbbell Shoulder Press'); // PR-A2: real library name
  });

  it('leaves the original plan intact — toggling OFF restores the original view', () => {
    applyPackedSwapsToPlan(plan, false);
    expect(plan.exercises.map((e) => e.name)).toEqual([
      'Bench Press',
      'Push-ups',
      'Overhead Press',
    ]);
  });
});
