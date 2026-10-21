import { describe, it, expect } from 'vitest';
import {
  getGoalAdaptiveSplitTemplates,
  scaleSplitTemplatesForAthlete,
} from '../src/lib/workout-engine';

const benchOf = (plans: ReturnType<typeof getGoalAdaptiveSplitTemplates>) =>
  plans
    .flatMap((p) => p.exercises)
    .find((e) => e.name === 'Bench Press')?.targetWeight;

describe('First-exposure load scaling (bug: 62kg beginner prescribed 70kg bench)', () => {
  it('scales a 62kg beginner bench down to a safe first exposure', () => {
    const plans = getGoalAdaptiveSplitTemplates('get_stronger', 'kg', {
      bodyweightKg: 62,
      experience: 'beginner',
    });
    // 75 * (62/85) * 0.6 = 32.8 -> 32.5kg (~0.52x BW)
    expect(benchOf(plans)).toBe(32.5);
  });

  it('leaves templates unchanged when no athlete context is given', () => {
    const plans = getGoalAdaptiveSplitTemplates('get_stronger', 'kg');
    expect(benchOf(plans)).toBe(75);
  });

  it('keeps an 85kg intermediate on the template default', () => {
    const plans = getGoalAdaptiveSplitTemplates('get_stronger', 'kg', {
      bodyweightKg: 85,
      experience: 'intermediate',
    });
    expect(benchOf(plans)).toBe(75);
  });

  it('scales an intermediate proportionally to bodyweight', () => {
    const plans = getGoalAdaptiveSplitTemplates('get_stronger', 'kg', {
      bodyweightKg: 100,
      experience: 'intermediate',
    });
    // 75 * (100/85) = 88.2 -> 87.5
    expect(benchOf(plans)).toBe(87.5);
  });

  it('never gives a beginner more than the template default', () => {
    const plans = getGoalAdaptiveSplitTemplates('get_stronger', 'kg', {
      bodyweightKg: 150,
      experience: 'beginner',
    });
    expect(benchOf(plans)).toBeLessThanOrEqual(75);
  });

  it('leaves bodyweight exercises at 0', () => {
    // QA4-021: for a beginner the Pull-ups entry itself is regressed to
    // Lat Pulldown (see qa4-tail-sweep.test.ts) — the regressed entry keeps
    // the bodyweight exercise's 0 load rather than inventing one.
    const plans = getGoalAdaptiveSplitTemplates('get_stronger', 'kg', {
      bodyweightKg: 62,
      experience: 'beginner',
    });
    const regressed = plans
      .flatMap((p) => p.exercises)
      .find((e) => e.name === 'Lat Pulldown' && e.notes?.includes('Pull-up regression'));
    expect(regressed?.targetWeight).toBe(0);
  });

  it('rounds to 5lb increments in lbs mode', () => {
    const plans = getGoalAdaptiveSplitTemplates('get_stronger', 'lbs', {
      bodyweightKg: 62,
      experience: 'beginner',
    });
    const bench = benchOf(plans)!;
    expect(bench % 5).toBe(0);
    expect(bench).toBeLessThan(165);
  });

  it('scaleSplitTemplatesForAthlete returns plans unchanged without a bodyweight', () => {
    const plans = getGoalAdaptiveSplitTemplates('build_muscle', 'kg');
    expect(scaleSplitTemplatesForAthlete(plans, false, {})).toBe(plans);
  });
});
