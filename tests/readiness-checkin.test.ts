import { describe, it, expect, beforeEach } from 'vitest';
import { calculateReadiness, type ManualCheckin } from '../src/lib/coach-engine';
import { useStore, partializeAppState } from '../src/lib/store';
import { getLocalTodayStr } from '../src/lib/formatters';
import type { WorkoutEntry, WorkoutExercise, WorkoutSet } from '../src/lib/types';

/**
 * Regression suite for the "readiness check-in does nothing" bug.
 *
 * Root cause: calculateReadiness AVERAGED sleep/soreness/energy into one
 * number, then applied nothing for an average in [3, 4), a flat +3 for
 * any average ≥ 4, and a penalty only below 3 — and with a load score
 * near 100 the +3 was clamped away entirely. Most real selections moved
 * the score by 0. The fix scores each input independently (see
 * CHECKIN_STEP_POINTS in coach-engine.ts). These tests pin the contract:
 * every input, swept alone, moves the score monotonically, visibly.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

let wid = 0;
const wset = (weight: number, reps: number, rpe?: number): WorkoutSet => ({
  reps,
  weight,
  unit: 'kg',
  rpe,
  completed: true,
  status: 'completed',
});
const wex = (name: string, sets: WorkoutSet[]): WorkoutExercise => ({ name, sets });
const wentry = (date: string, exercises: WorkoutExercise[]): WorkoutEntry => ({
  id: `rc${++wid}`,
  date,
  exercises,
});

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * One moderate session today. Deterministic mid-range base: the engine's
 * thin-history/ACWR factors put the no-check-in score at 80, far from both
 * clamps, so every check-in delta is fully visible in either direction.
 */
const baseHistory = (): WorkoutEntry[] => [
  wentry(daysAgo(0), [wex('Barbell Bench Press', [wset(60, 5, 8), wset(60, 5, 8), wset(60, 5, 8)])]),
];

const NEUTRAL: ManualCheckin = { sleep: 3, soreness: 3, energy: 3 };

// ── Per-input sweeps ────────────────────────────────────────────────────────

describe('readiness check-in — each input moves the score on its own', () => {
  const histories = baseHistory();
  const base = calculateReadiness(histories, []).score;

  it('baseline fixture is mid-range (deltas cannot hide in a clamp)', () => {
    expect(base).toBeGreaterThanOrEqual(70);
    expect(base).toBeLessThanOrEqual(85);
  });

  const sweeps: Array<{
    key: 'sleep' | 'soreness' | 'energy';
    minSwing: number;
    minStep: number;
  }> = [
    { key: 'sleep', minSwing: 16, minStep: 4 },
    { key: 'soreness', minSwing: 16, minStep: 4 },
    { key: 'energy', minSwing: 12, minStep: 3 },
  ];

  for (const { key, minSwing, minStep } of sweeps) {
    it(`${key}: sweeping 1→5 raises the score monotonically, ≥${minSwing} points total`, () => {
      const scores = [1, 2, 3, 4, 5].map(
        (v) => calculateReadiness(histories, [], { ...NEUTRAL, [key]: v }).score
      );
      // Correct direction + strict monotonicity at every step.
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i] - scores[i - 1]).toBeGreaterThanOrEqual(minStep);
      }
      expect(scores[4] - scores[0]).toBeGreaterThanOrEqual(minSwing);
      // Neutral value reproduces the no-check-in score exactly.
      expect(scores[2]).toBe(base);
    });
  }

  it('the reported bug: soreness 5→1 with great sleep/energy still drops the score hard', () => {
    // Old engine: average (5+1+5)/3 ≈ 3.67 sat in the dead zone → Δ0.
    const fresh = calculateReadiness(histories, [], { sleep: 4, soreness: 5, energy: 4 }).score;
    const wrecked = calculateReadiness(histories, [], { sleep: 4, soreness: 1, energy: 4 }).score;
    expect(fresh - wrecked).toBe(16);
  });

  it('even at the 100 ceiling a bad check-in pulls the score down (no silent clamp swallow)', () => {
    const good = calculateReadiness(histories, [], { sleep: 5, soreness: 5, energy: 5 }).score;
    const bad = calculateReadiness(histories, [], { sleep: 5, soreness: 1, energy: 5 }).score;
    expect(good).toBe(100);
    expect(bad).toBeLessThan(good);
    expect(good - bad).toBeGreaterThanOrEqual(5);
  });

  it('combined extremes span the full documented range', () => {
    const worst = calculateReadiness(histories, [], { sleep: 1, soreness: 1, energy: 1 }).score;
    const best = calculateReadiness(histories, [], { sleep: 5, soreness: 5, energy: 5 }).score;
    expect(best - worst).toBeGreaterThanOrEqual(30);
    expect(worst).toBeLessThan(base);
    expect(best).toBeGreaterThan(base);
  });

  it('factor breakdown reflects the check-in in both directions', () => {
    const rough = calculateReadiness(histories, [], { sleep: 1, soreness: 3, energy: 3 });
    expect(rough.factors.join(' ')).toContain('sleep was rough');
    const sore = calculateReadiness(histories, [], { sleep: 3, soreness: 1, energy: 3 });
    expect(sore.factors.join(' ')).toContain("you're still sore");
    const great = calculateReadiness(histories, [], { sleep: 5, soreness: 5, energy: 5 });
    expect(great.factors.join(' ').toLowerCase()).toContain('check-in helps');
    const neutral = calculateReadiness(histories, [], { ...NEUTRAL });
    expect(neutral.factors.join(' ').toLowerCase()).not.toContain('check-in');
  });

  it('energy is optional: omitting it contributes exactly nothing', () => {
    const withNeutralEnergy = calculateReadiness(histories, [], { sleep: 2, soreness: 2, energy: 3 });
    const withoutEnergy = calculateReadiness(histories, [], { sleep: 2, soreness: 2 });
    expect(withoutEnergy.score).toBe(withNeutralEnergy.score);
  });
});

// ── Absent check-in: behavior is exactly the pre-fix engine ────────────────

describe('readiness check-in — absent check-in changes nothing', () => {
  it('no check-in === all-neutral check-in, score and factors', () => {
    const histories = baseHistory();
    const none = calculateReadiness(histories, []);
    const neutral = calculateReadiness(histories, [], { sleep: 3, soreness: 3 });
    expect(neutral.score).toBe(none.score);
    expect(neutral.factors).toEqual(none.factors);
    expect(neutral.band).toBe(none.band);
  });

  it('no-history baseline is untouched without a check-in', () => {
    const res = calculateReadiness([], []);
    expect(res.score).toBe(70);
    expect(res.band).toBe('ready');
  });

  it('no-history: a check-in still registers, but never reaches primed on thin data', () => {
    const bad = calculateReadiness([], [], { sleep: 1, soreness: 1, energy: 1 });
    expect(bad.score).toBeLessThan(70);
    const great = calculateReadiness([], [], { sleep: 5, soreness: 5, energy: 5 });
    expect(great.score).toBeGreaterThan(70);
    expect(great.score).toBeLessThanOrEqual(79);
    expect(great.band).not.toBe('primed');
  });
});

// ── Store → engine path (the exact seam HomePage uses) ─────────────────────

class MockStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
}
const mockStorage = new MockStorage();

describe('readiness check-in — store → engine path (HomePage seam)', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    mockStorage.clear();
    useStore.getState().clearAllData();
  });

  it('a check-in saved via setDailyCheckin changes the computed score, and re-saving updates it again', () => {
    const today = getLocalTodayStr();
    const histories = baseHistory();
    const { setDailyCheckin } = useStore.getState();

    // HomePage derives: todayCheckin = dailyCheckins[todayStr], then
    // calculateReadiness(workouts, metrics, todayCheckin).
    const scoreForSavedCheckin = () =>
      calculateReadiness(histories, [], useStore.getState().dailyCheckins?.[today]).score;

    const before = scoreForSavedCheckin();
    expect(useStore.getState().dailyCheckins?.[today]).toBeUndefined();

    setDailyCheckin(today, { sleep: 3, soreness: 1, energy: 3 });
    const soreScore = scoreForSavedCheckin();
    expect(soreScore).toBe(before - 8);

    // Changing the selection again produces a NEW stored object (the
    // reactivity contract HomePage's useMemo depends on) and a new score.
    const firstSaved = useStore.getState().dailyCheckins[today];
    setDailyCheckin(today, { sleep: 3, soreness: 5, energy: 3 });
    const secondSaved = useStore.getState().dailyCheckins[today];
    expect(secondSaved).not.toBe(firstSaved);
    expect(scoreForSavedCheckin()).toBe(before + 8);
    expect(scoreForSavedCheckin() - soreScore).toBe(16);
  });

  it("the day's check-in is in the persisted slice", () => {
    const today = getLocalTodayStr();
    const checkin: ManualCheckin = { sleep: 2, soreness: 4, energy: 5 };
    useStore.getState().setDailyCheckin(today, checkin);
    const persisted = partializeAppState(useStore.getState()) as unknown as {
      dailyCheckins: Record<string, ManualCheckin>;
    };
    expect(persisted.dailyCheckins[today]).toEqual(checkin);
  });
});
