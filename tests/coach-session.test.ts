import { describe, it, expect } from 'vitest';
import {
  adjustSession,
  checkinSteps,
  swapSessionExercise,
  proteinTargetG,
  weeklySuggestion,
} from '../src/lib/coach-session';
import type { PlannedWorkout } from '../src/lib/types';

/**
 * Coach tab session builder (2026-10-26): volume by readiness band,
 * sore/pain-area exclusion, time-box trimming, home gym flags.
 * Fixtures use real library names where equipment matters
 * ('Barbell Bench Press', 'Dumbbell Bench Press') and keyword-resolved
 * names elsewhere (resolveExerciseMuscle covers 'squat', 'deadlift').
 */

const plan: PlannedWorkout = {
  id: 'p1',
  name: 'Push Day',
  createdAt: '2026-10-26',
  exercises: [
    { name: 'Barbell Bench Press', targetSets: 4, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
    { name: 'Dumbbell Bench Press', targetSets: 3, targetReps: 10, targetWeight: 22, targetUnit: 'kg' },
    { name: 'Barbell Squat', targetSets: 4, targetReps: 6, targetWeight: 100, targetUnit: 'kg' },
    { name: 'Deadlift', targetSets: 3, targetReps: 5, targetWeight: 120, targetUnit: 'kg' },
  ],
};

const baseOpts = {
  band: 'ready' as const,
  soreness: 4,
  soreAreas: [] as never[],
  painAreas: [] as never[],
  minutes: 60,
  location: 'gym' as const,
};

describe('adjustSession volume by band', () => {
  it('ready: session unchanged', () => {
    const s = adjustSession(plan, baseOpts);
    expect(s.stopForPain).toBe(false);
    expect(s.exercises.map((e) => e.exercise.targetSets)).toEqual([4, 3, 4, 3]);
    expect(s.setsCut).toBe(false);
  });

  it('caution: ~15% fewer sets, min 1', () => {
    const s = adjustSession(plan, { ...baseOpts, band: 'caution' });
    expect(s.exercises.map((e) => e.exercise.targetSets)).toEqual([3, 3, 3, 3]);
    expect(s.setsCut).toBe(true);
  });

  it('rest: light variant, 1 set each', () => {
    const s = adjustSession(plan, { ...baseOpts, band: 'rest' });
    expect(s.exercises.map((e) => e.exercise.targetSets)).toEqual([1, 1, 1, 1]);
  });

  it('primed: session unchanged', () => {
    const s = adjustSession(plan, { ...baseOpts, band: 'primed' });
    expect(s.exercises.map((e) => e.exercise.targetSets)).toEqual([4, 3, 4, 3]);
  });
});

describe('adjustSession pain screen', () => {
  it('any pain area stops the session', () => {
    const s = adjustSession(plan, { ...baseOpts, painAreas: ['Chest'] });
    expect(s.stopForPain).toBe(true);
    expect(s.exercises).toEqual([]);
  });

  it('trainAroundPain excludes (never trains) the pain areas', () => {
    const s = adjustSession(plan, {
      ...baseOpts,
      painAreas: ['Chest'],
      trainAroundPain: true,
    });
    expect(s.stopForPain).toBe(false);
    expect(s.exercises.map((e) => e.exercise.name)).toEqual(['Barbell Squat', 'Deadlift']);
  });
});

describe('adjustSession sore-area exclusion', () => {
  it('low freshness + sore areas drops those muscles', () => {
    const s = adjustSession(plan, {
      ...baseOpts,
      soreness: 2,
      soreAreas: ['Legs'],
    });
    expect(s.exercises.map((e) => e.exercise.name)).toEqual([
      'Barbell Bench Press',
      'Dumbbell Bench Press',
      'Deadlift',
    ]);
    expect(s.droppedForSoreness).toBe(1);
  });

  it('high freshness + sore areas does NOT exclude', () => {
    const s = adjustSession(plan, { ...baseOpts, soreness: 4, soreAreas: ['Legs'] });
    expect(s.exercises).toHaveLength(4);
    expect(s.droppedForSoreness).toBe(0);
  });

  it('never empties the session: all-sore plan stays whole', () => {
    const chestOnly: PlannedWorkout = {
      ...plan,
      exercises: [
        { name: 'Barbell Bench Press', targetSets: 4, targetReps: 8 },
        { name: 'Dumbbell Bench Press', targetSets: 3, targetReps: 10 },
      ],
    };
    const s = adjustSession(chestOnly, {
      ...baseOpts,
      soreness: 1,
      soreAreas: ['Chest'],
    });
    expect(s.exercises).toHaveLength(2);
    expect(s.droppedForSoreness).toBe(0);
  });

  it('unknown names are never excluded (no Chest-fallback trap)', () => {
    const weird: PlannedWorkout = {
      ...plan,
      exercises: [{ name: 'Zqx Jumble Press', targetSets: 3, targetReps: 10 }],
    };
    const s = adjustSession(weird, {
      ...baseOpts,
      soreness: 1,
      soreAreas: ['Chest'],
    });
    expect(s.exercises).toHaveLength(1);
  });
});

describe('adjustSession time-box and home flags', () => {
  it('15 minutes trims accessories first, never below 2 exercises', () => {
    const s = adjustSession(plan, { ...baseOpts, minutes: 15 });
    expect(s.exercises.length).toBeGreaterThanOrEqual(2);
    expect(s.droppedForTime).toBeGreaterThan(0);
    expect(s.estimatedMin).toBeLessThanOrEqual(15);
  });

  it('home flags gym-only equipment with substitutes, keeps dumbbell work', () => {
    const s = adjustSession(plan, { ...baseOpts, location: 'home' });
    const bench = s.exercises.find((e) => e.exercise.name === 'Barbell Bench Press');
    const dbBench = s.exercises.find((e) => e.exercise.name === 'Dumbbell Bench Press');
    expect(bench?.needsGym).toBe(true);
    expect(bench?.substitutes.length).toBeGreaterThan(0);
    expect(dbBench?.needsGym).toBe(false);
  });

  it('gym location flags nothing', () => {
    const s = adjustSession(plan, baseOpts);
    expect(s.exercises.every((e) => !e.needsGym)).toBe(true);
  });
});

describe('swapSessionExercise', () => {
  it('replaces the name, keeps sets/reps, clears the old weight', () => {
    const next = swapSessionExercise(plan.exercises, 0, 'Dumbbell Bench Press');
    expect(next[0].name).toBe('Dumbbell Bench Press');
    expect(next[0].targetSets).toBe(4);
    expect(next[0].targetReps).toBe(8);
    expect(next[0].targetWeight).toBeUndefined();
    expect(next[1].name).toBe('Dumbbell Bench Press');
  });

  it('out-of-range index returns the list unchanged', () => {
    expect(swapSessionExercise(plan.exercises, 9, 'X')).toBe(plan.exercises);
  });
});

describe('checkinSteps (chat question order)', () => {
  it('low freshness inserts the areas question after freshness', () => {
    expect(checkinSteps(2)).toEqual([
      'sleep',
      'freshness',
      'areas',
      'energy',
      'minutes',
      'location',
      'pain',
    ]);
  });

  it('fresh muscles skip the areas question (it would change nothing)', () => {
    expect(checkinSteps(4)).toEqual([
      'sleep',
      'freshness',
      'energy',
      'minutes',
      'location',
      'pain',
    ]);
  });
});

describe('proteinTargetG and weeklySuggestion', () => {
  it('70 kg → 112–154 g', () => {
    expect(proteinTargetG(70)).toEqual({ min: 112, max: 154 });
  });

  it('no bodyweight → null (card hides, never asks)', () => {
    expect(proteinTargetG(undefined)).toBeNull();
    expect(proteinTargetG(0)).toBeNull();
  });

  it('weekly: <50% adherence → shrink, full week → progress, else hold', () => {
    expect(weeklySuggestion(4, 1)).toEqual({ kind: 'shrink', missed: 3 });
    expect(weeklySuggestion(4, 4)).toEqual({ kind: 'progress', missed: 0 });
    expect(weeklySuggestion(4, 3)).toEqual({ kind: 'hold', missed: 1 });
    expect(weeklySuggestion(0, 0)).toEqual({ kind: 'hold', missed: 0 });
  });

  it('weekly (FE-02): a partial week is judged only on elapsed days', () => {
    // Monday morning: nothing due yet — no verdict at all.
    expect(weeklySuggestion(4, 0, 0)).toEqual({ kind: 'hold', missed: 0 });
    // One session due and missed is not enough evidence to condemn
    // the week ("more than half the week was missed" needs half the
    // week's sessions due first).
    expect(weeklySuggestion(4, 0, 1)).toEqual({ kind: 'hold', missed: 1 });
    // Half the week due, none done → shrink is earned.
    expect(weeklySuggestion(4, 0, 2)).toEqual({ kind: 'shrink', missed: 2 });
    // Half due, half of those done → hold.
    expect(weeklySuggestion(4, 1, 2)).toEqual({ kind: 'hold', missed: 1 });
    // All sessions done early but a scheduled day remains → not yet
    // an end-of-week "progress" verdict.
    expect(weeklySuggestion(4, 4, 3)).toEqual({ kind: 'hold', missed: 0 });
    // Week complete: all due, all done → progress; extra unscheduled
    // sessions change nothing.
    expect(weeklySuggestion(4, 4, 4)).toEqual({ kind: 'progress', missed: 0 });
    expect(weeklySuggestion(4, 7, 4)).toEqual({ kind: 'progress', missed: 0 });
  });
});
