/**
 * Round-2 persona regression tests — load accounting, taper honesty,
 * Hinglish parsing, readiness check-in.
 *
 * KAVYA-1/RAHUL-3 (bodyweight + cardio load visible to readiness),
 * RAHUL-2 (a taper is not detraining), SUNITA-4 (Hindi-first meal
 * text), KABIR-4 (manual check-in actually moves readiness).
 */
import { describe, it, expect } from 'vitest';
import { calculateWorkoutTonnage } from '../src/lib/ai-coach';
import {
  generateCoachWeeklyReview,
  detectPatterns,
  calculateReadiness,
} from '../src/lib/coach-engine';
import { parseNaturalMealOffline } from '../src/lib/macros';
import type { WorkoutEntry } from '../src/lib/types';

const entry = (
  name: string,
  sets: { reps: number; weight: number }[],
  extra: Partial<WorkoutEntry> = {}
): WorkoutEntry => ({
  id: `w_${name}`,
  date: '2026-10-15',
  name,
  exercises: [
    {
      name,
      sets: sets.map((s) => ({ ...s, unit: 'kg' as const, completed: true })),
    },
  ],
  ...extra,
});

describe('training load accounting (KAVYA-1 / RAHUL-3)', () => {
  it('bodyweight squats and lunges now count load (was: only 4 named lifts)', () => {
    const bw = entry('Bodyweight Squat', [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }]);
    expect(calculateWorkoutTonnage(bw, 80)).toBeGreaterThan(1000);
  });
  it('a 40-minute run is real load, not zero', () => {
    const run: WorkoutEntry = {
      id: 'run1',
      date: '2026-10-15',
      name: 'Morning Run',
      durationMinutes: 40,
      exercises: [
        { name: 'Running', sets: [{ reps: 1, weight: 0, unit: 'kg', completed: true }] },
      ],
    };
    // 40 min × 80 kg × 0.5 = 1600 kg-equivalent.
    expect(calculateWorkoutTonnage(run, 80)).toBeGreaterThanOrEqual(1600);
  });
  it('weighted work is unchanged by the cardio proxy', () => {
    const bench = entry('Bench Press', [{ reps: 5, weight: 100 }]);
    expect(calculateWorkoutTonnage(bench, 80)).toBe(500);
  });
});

describe('a taper is not detraining (RAHUL-2)', () => {
  const heavyWeek: WorkoutEntry[] = [
    entry('Bench Press', [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }]),
    entry('Back Squat', [{ reps: 5, weight: 140 }, { reps: 5, weight: 140 }]),
    entry('Deadlift', [{ reps: 3, weight: 180 }]),
  ];
  const taperWeek: WorkoutEntry[] = [
    entry('Bench Press', [{ reps: 5, weight: 50 }]),
    entry('Back Squat', [{ reps: 5, weight: 70 }]),
    entry('Deadlift', [{ reps: 3, weight: 90 }]),
  ];
  it('same session count with lighter loads reads as a taper', () => {
    const review = generateCoachWeeklyReview(taperWeek, heavyWeek, []);
    expect(review.whatDidnt).not.toContain('detraining');
    expect(review.whatDidnt).toContain('taper');
  });
  it('fewer sessions AND lighter loads still reads as a drop', () => {
    const review = generateCoachWeeklyReview([taperWeek[0]], heavyWeek, []);
    expect(review.whatDidnt).toContain('detraining');
  });
  it('volume_collapse stays silent when attendance held for 8 weeks', () => {
    const mk = (weight: number): WorkoutEntry[] => [
      entry('Bench Press', [{ reps: 5, weight }]),
      entry('Back Squat', [{ reps: 5, weight }]),
    ];
    // detectPatterns inspects the last 8 weeks of history ending today;
    // build dates relative to now so the windowing is deterministic.
    const dayMs = 24 * 3600 * 1000;
    const dated = (weeksAgo: number, ws: WorkoutEntry[]): WorkoutEntry[] =>
      ws.map((w, i) => ({
        ...w,
        id: `${w.id}_${weeksAgo}_${i}`,
        date: new Date(Date.now() - weeksAgo * 7 * dayMs - i * dayMs)
          .toISOString()
          .split('T')[0],
      }));
    const history: WorkoutEntry[] = [];
    for (let wk = 7; wk >= 2; wk--) history.push(...dated(wk, mk(100)));
    history.push(...dated(1, mk(40)));
    history.push(...dated(0, mk(40)));
    const patterns = detectPatterns(history);
    expect(patterns.some((p) => p.kind === 'volume_collapse')).toBe(false);
  });
});

describe('Hindi-first meal parsing (SUNITA-4)', () => {
  it('"do roti aur ek katori dal" parses as 2 roti + 1 katori dal', () => {
    const items = parseNaturalMealOffline('do roti aur ek katori dal');
    expect(items).toHaveLength(2);
    const roti = items.find((i) => i.name.toLowerCase().includes('roti'));
    const dal = items.find((i) => i.name.toLowerCase().includes('dal'));
    expect(roti?.calories).toBeGreaterThan(80);
    expect(dal?.quantity).toBe(1);
    expect(dal?.calories).toBeGreaterThan(100);
  });
  it('Hindi food names resolve: chawal, anda, doodh, sabzi', () => {
    for (const text of ['100g chawal', '2 anda', '1 glass doodh', '1 katori sabzi']) {
      const items = parseNaturalMealOffline(text);
      expect(items).toHaveLength(1);
      expect(items[0].isUnmatched).toBeFalsy();
      expect(items[0].calories).toBeGreaterThan(0);
    }
  });
  it('English parsing is untouched', () => {
    const items = parseNaturalMealOffline('2 roti, 1 bowl dal');
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.calories > 0)).toBe(true);
  });
});

describe('manual check-in moves readiness (KABIR-4)', () => {
  const history: WorkoutEntry[] = [
    {
      id: 'h1',
      date: new Date().toISOString().split('T')[0],
      exercises: [
        { name: 'Bench Press', sets: [{ reps: 5, weight: 60, unit: 'kg', completed: true }] },
      ],
    },
  ];
  it('a rough check-in lowers the score and names the reason', () => {
    const base = calculateReadiness(history, []);
    const rough = calculateReadiness(history, [], { sleep: 1, soreness: 2 });
    expect(rough.score).toBeLessThan(base.score);
    expect(rough.factors.join(' ')).toContain('sleep was rough');
  });
  it('a great check-in never lowers the score', () => {
    const base = calculateReadiness(history, []);
    const great = calculateReadiness(history, [], { sleep: 5, soreness: 5, energy: 5 });
    expect(great.score).toBeGreaterThanOrEqual(base.score);
  });
});
