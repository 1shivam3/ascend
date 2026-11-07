/**
 * QA-hardening F4 fix phase — one section per Phase 4 finding.
 * Every test here failed before its fix and passes after (verified by
 * stashing the fix and re-running).
 */
import { describe, expect, it } from 'vitest';
import {
  findLimitationClashes,
  generateAdaptedExercisesFromSelection,
  generateExercisesFromSelection,
} from '@/components/SuggestedWorkoutModal';
import {
  getInjuryBannedFamilies,
  getMovementFamily,
  getPlanBannedJoints,
  isExerciseJointBanned,
  prepareGeneratedPlans,
} from '@/lib/workout-engine';
import type { PlannedWorkout } from '@/lib/store';

// ─── F4-3: modal generator ignored DECLARED limitations ─────────────

const VIKRAM_CTX = {
  equipment: 'full_gym' as const,
  exclusions: [] as string[],
  limitations: ['Knee', 'Low back'] as string[],
};

describe('F4-3: Suggested Workout modal generation respects declared limitations', () => {
  it('Legs for Knee + Low back never contains Squat or any plan-banned movement', () => {
    const { exercises, limitationAdjusted } = generateAdaptedExercisesFromSelection(
      ['legs'],
      'medium',
      'kg',
      VIKRAM_CTX
    );
    expect(limitationAdjusted).toBe(true);
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.map((e) => e.name)).not.toContain('Squat');
    const bannedFamilies = getInjuryBannedFamilies(VIKRAM_CTX.limitations);
    const bannedJoints = getPlanBannedJoints(VIKRAM_CTX.limitations);
    for (const ex of exercises) {
      expect(bannedFamilies.has(getMovementFamily(ex.name))).toBe(false);
      expect(isExerciseJointBanned(ex.name, bannedJoints)).toBe(false);
    }
  });

  it('matches prepareGeneratedPlans output exactly (same machinery as the split path)', () => {
    const raw = generateExercisesFromSelection(['legs'], 'medium', 'kg');
    const plan: PlannedWorkout = {
      id: 'parity',
      name: 'Legs',
      createdAt: new Date().toISOString(),
      exercises: raw,
    };
    const expected = prepareGeneratedPlans([plan], { ...VIKRAM_CTX, unit: 'kg' })[0].exercises;
    const { exercises } = generateAdaptedExercisesFromSelection(['legs'], 'medium', 'kg', VIKRAM_CTX);
    expect(exercises).toEqual(expected);
  });

  it('without limitations the raw picks pass through unchanged (Squat stays)', () => {
    const { exercises, limitationAdjusted } = generateAdaptedExercisesFromSelection(
      ['legs'],
      'medium',
      'kg',
      { equipment: 'full_gym', exclusions: [], limitations: [] }
    );
    expect(limitationAdjusted).toBe(false);
    expect(exercises.map((e) => e.name)).toEqual(
      generateExercisesFromSelection(['legs'], 'medium', 'kg').map((e) => e.name)
    );
    expect(exercises.map((e) => e.name)).toContain('Squat');
  });

  it('default Chest + Arms for Vikram still leads with Bench Press, no Squat/Deadlift', () => {
    const { exercises } = generateAdaptedExercisesFromSelection(
      ['chest', 'arms'],
      'medium',
      'kg',
      VIKRAM_CTX
    );
    const names = exercises.map((e) => e.name);
    expect(names).toContain('Bench Press');
    expect(names).not.toContain('Squat');
    expect(names).not.toContain('Deadlift');
  });

  it('a Shoulder limitation removes overhead pressing (vertical_push family)', () => {
    const { exercises, limitationAdjusted } = generateAdaptedExercisesFromSelection(
      ['shoulders'],
      'medium',
      'kg',
      { equipment: 'full_gym', exclusions: [], limitations: ['Shoulder'] }
    );
    expect(limitationAdjusted).toBe(true);
    expect(exercises.map((e) => e.name)).not.toContain('Overhead Press');
    for (const ex of exercises) {
      expect(getMovementFamily(ex.name)).not.toBe('vertical_push');
    }
  });
});

describe('F4-3: findLimitationClashes (the modal + plan-editor warning detection)', () => {
  it('flags Squat for a Knee limitation and clears it with none', () => {
    const list = [{ name: 'Squat' }, { name: 'Bench Press' }] as never[];
    expect(findLimitationClashes(list, ['Knee'])).toEqual(['Squat']);
    expect(findLimitationClashes(list, [])).toEqual([]);
    // Neck bans vertical_push + the neck joint — neither exercise trips it.
    expect(findLimitationClashes(list, ['Neck'])).toEqual([]);
  });
});
