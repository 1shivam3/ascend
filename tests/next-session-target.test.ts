import { describe, it, expect } from 'vitest';
import { getNextSessionTarget } from '../src/lib/workout-engine';
import { generateDeterministicPostWorkoutTake } from '../src/lib/ai-coach';

const set = (weight: number, reps: number, rpe?: number) => ({ weight, reps, rpe });

describe('Canonical next-session target (bugs: contradictory targets, RPE ignored)', () => {
  it('holds the load when avg RPE >= 9', () => {
    const t = getNextSessionTarget('Bench Press', [set(40, 8, 9), set(40, 8, 10), set(40, 8, 9)], 'kg');
    expect(t?.directive).toBe('hold');
    expect(t?.weight).toBe(40);
    expect(t?.summaryText).toBe('Bench Press: hold 40kg × 8 next session');
    expect(t?.rationale).toContain('avg RPE');
  });

  it('progresses the load when avg RPE <= 7', () => {
    const t = getNextSessionTarget('Bench Press', [set(40, 8, 6), set(40, 8, 7), set(40, 8, 7)], 'kg');
    expect(t?.directive).toBe('progress_load');
    expect(t?.weight).toBe(42.5);
    expect(t?.summaryText).toBe('Bench Press: 42.5kg × 8 next session');
  });

  it('adds a rep in the middle RPE band (the bug report case: @8, @9, @8)', () => {
    const t = getNextSessionTarget('Bench Press', [set(40, 8, 8), set(40, 8, 9), set(40, 8, 8)], 'kg');
    expect(t?.directive).toBe('add_rep');
    expect(t?.weight).toBe(40);
    expect(t?.reps).toBe(9);
    expect(t?.summaryText).toBe('Bench Press: 40kg × 9 next session');
    // Reasoning must be surfaced, not identical to no-RPE output
    expect(t?.rationale).toContain('8.3');
  });

  it('adds a rep when no RPE was logged', () => {
    const t = getNextSessionTarget('Bench Press', [set(40, 8), set(40, 8)], 'kg');
    expect(t?.directive).toBe('add_rep');
    expect(t?.weight).toBe(40);
    expect(t?.reps).toBe(9);
  });

  it('returns null when nothing was completed', () => {
    expect(getNextSessionTarget('Bench Press', [], 'kg')).toBeNull();
    expect(getNextSessionTarget('Bench Press', [{ weight: 40, reps: 0 }], 'kg')).toBeNull();
  });

  it('steps 5lb in lbs mode', () => {
    const t = getNextSessionTarget('Bench Press', [set(135, 8, 6), set(135, 8, 7)], 'lbs');
    expect(t?.directive).toBe('progress_load');
    expect(t?.weight).toBe(140);
  });

  it('Coach Take deterministic path reads the same canonical function', () => {
    const completedWorkout = {
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { reps: 8, weight: 40, unit: 'kg', status: 'completed', rpe: 8 },
            { reps: 8, weight: 40, unit: 'kg', status: 'completed', rpe: 9 },
            { reps: 8, weight: 40, unit: 'kg', status: 'completed', rpe: 8 },
          ],
        },
      ],
      durationMinutes: 12,
    };
    const take = generateDeterministicPostWorkoutTake(completedWorkout);
    // Must match what the Training Adaptation Summary shows for the same input
    const canonical = getNextSessionTarget(
      'Bench Press',
      [
        { weight: 40, reps: 8, rpe: 8, unit: 'kg' },
        { weight: 40, reps: 8, rpe: 9, unit: 'kg' },
        { weight: 40, reps: 8, rpe: 8, unit: 'kg' },
      ],
      'kg'
    );
    expect(take.nextSessionTarget).toBe(`NEXT SESSION TARGET: ${canonical?.summaryText}`);
  });
});
