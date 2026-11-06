import { describe, it, expect } from 'vitest';
import {
  createWorkoutExercisesFromPlan,
  getNextSessionTarget,
  setNeedsWeightPrompt,
  prefillUnsetSetsFromHistory,
  getWorkingSetWeight,
} from '../src/lib/workout-engine';
import type { PlannedWorkout, WorkoutSet } from '../src/lib/types';

// UI/UX audit Phase 1, Task 1.1 (P0-1): workouts must never start at,
// target, or adapt from 0 kg. These tests pin the engine-level rules
// the ActiveWorkoutScreen now relies on.

function planWith(targetWeight: number | undefined, name = 'Bench Press'): PlannedWorkout {
  return {
    id: 'plan-p0',
    name: 'Audit P0',
    createdAt: '2026-11-06T00:00:00.000Z',
    exercises: [{ name, targetSets: 3, targetReps: 8, targetWeight }],
  };
}

function set(partial: Partial<WorkoutSet>): WorkoutSet {
  return { reps: 8, completed: false, ...partial } as WorkoutSet;
}

describe('P0-1 plan creation: a stored 0 is not a configuration', () => {
  it('first-ever exercise: targetWeight 0 on a loaded lift stays UNSET (never weight 0)', () => {
    const [bench] = createWorkoutExercisesFromPlan(planWith(0), { userUnit: 'kg' });
    expect(bench.sets).toHaveLength(3);
    for (const s of bench.sets) {
      expect(s.weight).toBeUndefined();
      expect(s.prescribedWeight).toBeUndefined();
    }
  });

  it('a positive plan target still configures the sets', () => {
    const [bench] = createWorkoutExercisesFromPlan(planWith(60), { userUnit: 'kg' });
    expect(bench.sets.every((s) => s.weight === 60 && s.prescribedWeight === 60)).toBe(true);
  });

  it('bodyweight plan target of 0 still means "no added load" (configured)', () => {
    const [pushups] = createWorkoutExercisesFromPlan(planWith(0, 'Push-ups'), { userUnit: 'kg' });
    expect(pushups.sets.every((s) => s.weight === 0 && s.prescribedWeight === 0)).toBe(true);
  });
});

describe('P0-1 next-session target: never prescribed from weightless sets', () => {
  it('loaded exercise logged at 0 kg produces NO target', () => {
    const target = getNextSessionTarget(
      'Bench Press',
      [set({ weight: 0, reps: 8 }), set({ weight: 0, reps: 8 })],
      'kg'
    );
    expect(target).toBeNull();
  });

  it('loaded exercise logged with unset weight produces NO target', () => {
    const target = getNextSessionTarget(
      'Bench Press',
      [set({ weight: undefined, reps: 8 }), set({ weight: undefined, reps: 6 })],
      'kg'
    );
    expect(target).toBeNull();
  });

  it('mixed session: the weighted sets still produce a target', () => {
    const target = getNextSessionTarget(
      'Bench Press',
      [set({ weight: undefined, reps: 8 }), set({ weight: 60, reps: 8, rpe: 8 })],
      'kg'
    );
    expect(target).not.toBeNull();
    expect(target!.weight).toBeGreaterThan(0);
    expect(target!.summaryText).toMatch(/^Bench Press: 60kg × /);
    expect(target!.summaryText).not.toMatch(/[\s:]0kg ×/);
  });

  it('with-history exercise: weighted sets progress as before', () => {
    const target = getNextSessionTarget(
      'Bench Press',
      [set({ weight: 60, reps: 8, rpe: 7 }), set({ weight: 60, reps: 8, rpe: 7 })],
      'kg'
    );
    expect(target).not.toBeNull();
    expect(target!.directive).toBe('progress_load');
  });

  it('bodyweight rep progression is preserved — and never prints "0kg"', () => {
    const target = getNextSessionTarget(
      'Push-ups',
      [set({ weight: 0, reps: 12 }), set({ weight: 0, reps: 12 })],
      'kg'
    );
    expect(target).not.toBeNull();
    expect(target!.directive).toBe('add_rep');
    expect(target!.reps).toBe(13);
    expect(target!.summaryText).not.toMatch(/[\s:]0kg ×/);
    expect(target!.summaryText).toContain('BW');
  });

  it('explosive quality-hold is preserved (its directive names no load)', () => {
    const target = getNextSessionTarget(
      'Box Jump',
      [set({ weight: 0, reps: 5 }), set({ weight: 0, reps: 5 })],
      'kg'
    );
    expect(target).not.toBeNull();
    expect(target!.directive).toBe('hold');
  });
});

describe('P0-1 "Log without weight?" prompt predicate', () => {
  it('prompts for a loaded exercise with unset weight', () => {
    expect(setNeedsWeightPrompt('Bench Press', set({ weight: undefined }))).toBe(true);
  });

  it('prompts for a loaded exercise logged at 0', () => {
    expect(setNeedsWeightPrompt('Bench Press', set({ weight: 0 }))).toBe(true);
  });

  it('never prompts when a real weight is logged', () => {
    expect(setNeedsWeightPrompt('Bench Press', set({ weight: 60 }))).toBe(false);
  });

  it('bodyweight exercises are exempt', () => {
    expect(setNeedsWeightPrompt('Push-ups', set({ weight: 0 }))).toBe(false);
    expect(setNeedsWeightPrompt('Pull-ups', set({ weight: undefined }))).toBe(false);
  });
});

describe('P0-1 prefill from last session (priority b)', () => {
  it('unset sets inherit weight AND reps from the matching last-session set', () => {
    const fresh = [set({ weight: undefined, reps: 8 }), set({ weight: undefined, reps: 8 })];
    const last = [set({ weight: 60, reps: 10 }), set({ weight: 62.5, reps: 9 })];
    const out = prefillUnsetSetsFromHistory(fresh, last);
    expect(out[0].weight).toBe(60);
    expect(out[0].reps).toBe(10);
    expect(out[1].weight).toBe(62.5);
    expect(out[1].reps).toBe(9);
  });

  it('never overwrites a set that already carries a value', () => {
    const fresh = [set({ weight: 40, reps: 5 })];
    const last = [set({ weight: 60, reps: 10 })];
    expect(prefillUnsetSetsFromHistory(fresh, last)).toBe(fresh);
  });

  it('no history → input returned unchanged', () => {
    const fresh = [set({ weight: undefined })];
    expect(prefillUnsetSetsFromHistory(fresh, null)).toBe(fresh);
    expect(prefillUnsetSetsFromHistory(fresh, [])).toBe(fresh);
  });
});

describe('P0-1 working weight for the warm-up generator', () => {
  it('returns the first real load', () => {
    expect(getWorkingSetWeight([set({ weight: undefined }), set({ weight: 80 })])).toBe(80);
  });

  it('returns null when every set is unset or 0 (generator must ask, not invent)', () => {
    expect(getWorkingSetWeight([set({ weight: undefined }), set({ weight: 0 })])).toBeNull();
    expect(getWorkingSetWeight([])).toBeNull();
  });
});
