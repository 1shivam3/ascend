import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import {
  aggregateStepsByDate,
  summarizeSleepMinutes,
  latestWeightsByDate,
  mergeHealthWeights,
  buildHealthSignals,
  shiftDateStr,
  type HealthDaySummary,
} from '../src/lib/health-connect';
import { calculateReadiness } from '../src/lib/coach-engine';
import type { BodyMetricEntry, WorkoutEntry } from '../src/lib/types';

function iso(dateStr: string, h: number, m = 0): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).toISOString();
}

describe('aggregateStepsByDate', () => {
  it('sums samples per local date and ignores zero/negative', () => {
    const out = aggregateStepsByDate([
      { startDate: iso('2026-10-19', 9), value: 3000 },
      { startDate: iso('2026-10-19', 18), value: 2500 },
      { startDate: iso('2026-10-20', 8), value: 1200 },
      { startDate: iso('2026-10-20', 9), value: 0 },
    ]);
    expect(out['2026-10-19']).toBe(5500);
    expect(out['2026-10-20']).toBe(1200);
  });
});

describe('summarizeSleepMinutes', () => {
  it('counts a session ending this morning toward last night', () => {
    const mins = summarizeSleepMinutes(
      [{ startDate: iso('2026-10-19', 23, 0), endDate: iso('2026-10-20', 6, 30) }],
      '2026-10-20'
    );
    expect(mins).toBe(450);
  });

  it('ignores sessions ending in the afternoon (naps / previous night)', () => {
    expect(
      summarizeSleepMinutes(
        [{ startDate: iso('2026-10-20', 14), endDate: iso('2026-10-20', 15, 30) }],
        '2026-10-20'
      )
    ).toBeNull();
    expect(
      summarizeSleepMinutes(
        [{ startDate: iso('2026-10-18', 23), endDate: iso('2026-10-19', 6) }],
        '2026-10-20'
      )
    ).toBeNull();
  });

  it('excludes awake-stage samples and caps the total at 16h', () => {
    const mins = summarizeSleepMinutes(
      [
        { startDate: iso('2026-10-19', 22), endDate: iso('2026-10-20', 10), sleepState: 'asleep' },
        { startDate: iso('2026-10-19', 21), endDate: iso('2026-10-20', 9), sleepState: 'asleep' },
        { startDate: iso('2026-10-20', 3), endDate: iso('2026-10-20', 3, 20), sleepState: 'awake' },
      ],
      '2026-10-20'
    );
    expect(mins).toBe(16 * 60);
  });

  it('returns null when there is no usable sleep data', () => {
    expect(summarizeSleepMinutes([], '2026-10-20')).toBeNull();
  });
});

describe('latestWeightsByDate', () => {
  it('keeps the latest sample per date, rounded to 0.1 kg', () => {
    const out = latestWeightsByDate([
      { startDate: iso('2026-10-19', 7), value: 80.24 },
      { startDate: iso('2026-10-19', 21), value: 80.66 },
      { startDate: iso('2026-10-18', 7), value: 81.02 },
    ]);
    expect(out).toEqual([
      { date: '2026-10-18', weightKg: 81 },
      { date: '2026-10-19', weightKg: 80.7 },
    ]);
  });
});

describe('mergeHealthWeights', () => {
  const manual: BodyMetricEntry = { id: 'm1', date: '2026-10-19', weightKg: 80 };
  const hcOld: BodyMetricEntry = {
    id: 'hc-weight-2026-10-18',
    date: '2026-10-18',
    weightKg: 81,
    source: 'health-connect',
  };

  it('never overwrites a manual weigh-in', () => {
    const { upserts, skippedManualDates } = mergeHealthWeights([manual], [
      { date: '2026-10-19', weightKg: 79.5 },
    ]);
    expect(upserts).toEqual([]);
    expect(skippedManualDates).toEqual(['2026-10-19']);
  });

  it('updates an existing Health Connect entry in place (same id)', () => {
    const { upserts } = mergeHealthWeights([hcOld], [{ date: '2026-10-18', weightKg: 80.8 }]);
    expect(upserts).toEqual([{ ...hcOld, weightKg: 80.8 }]);
  });

  it('does not upsert when the HC value is unchanged', () => {
    const { upserts } = mergeHealthWeights([hcOld], [{ date: '2026-10-18', weightKg: 81 }]);
    expect(upserts).toEqual([]);
  });

  it('creates a tagged entry for a new date', () => {
    const { upserts } = mergeHealthWeights([], [{ date: '2026-10-20', weightKg: 79.9 }]);
    expect(upserts).toEqual([
      { id: 'hc-weight-2026-10-20', date: '2026-10-20', weightKg: 79.9, source: 'health-connect' },
    ]);
  });
});

describe('buildHealthSignals', () => {
  const base: HealthDaySummary = {
    date: '2026-10-20',
    stepsToday: 4000,
    stepsYesterday: 8000,
    sleepMinutesLastNight: 430,
  };

  it('passes sleep and yesterday steps through', () => {
    expect(buildHealthSignals(base)).toEqual({ sleepMinutesLastNight: 430, stepsYesterday: 8000 });
  });

  it('drops zero steps (cannot distinguish not-worn from sedentary)', () => {
    expect(buildHealthSignals({ ...base, stepsYesterday: 0 })).toEqual({
      sleepMinutesLastNight: 430,
    });
  });

  it('drops sub-hour sleep fragments and empty summaries', () => {
    expect(buildHealthSignals({ ...base, sleepMinutesLastNight: 30, stepsYesterday: 0 })).toBeUndefined();
    expect(buildHealthSignals(null)).toBeUndefined();
    expect(buildHealthSignals(undefined)).toBeUndefined();
  });
});

describe('readiness with health signals', () => {
  const noWorkouts: WorkoutEntry[] = [];

  it('is identical to baseline when signals are absent', () => {
    const base = calculateReadiness(noWorkouts, []);
    expect(calculateReadiness(noWorkouts, [], undefined, undefined)).toEqual(base);
    expect(calculateReadiness(noWorkouts, [], undefined, {})).toEqual(base);
  });

  it('penalizes very short device sleep', () => {
    const base = calculateReadiness(noWorkouts, []);
    const withSleep = calculateReadiness(noWorkouts, [], undefined, {
      sleepMinutesLastNight: 300,
    });
    expect(withSleep.score).toBe(base.score - 10);
    expect(withSleep.factors.join(' ')).toContain('sleep');
  });

  it('does not double-count sleep when a manual check-in exists', () => {
    const checkin = { sleep: 5, soreness: 5 };
    const a = calculateReadiness(noWorkouts, [], checkin);
    const b = calculateReadiness(noWorkouts, [], checkin, { sleepMinutesLastNight: 240 });
    expect(b.score).toBe(a.score);
  });

  it('penalizes a very low-movement yesterday, ignores a normal one', () => {
    const base = calculateReadiness(noWorkouts, []);
    const low = calculateReadiness(noWorkouts, [], undefined, { stepsYesterday: 900 });
    expect(low.score).toBe(base.score - 5);
    const normal = calculateReadiness(noWorkouts, [], undefined, { stepsYesterday: 6000 });
    expect(normal.score).toBe(base.score);
  });
});

describe('store applyHealthSync', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('merges weights, keeps manual entries, stores the summary', () => {
    useStore.getState().addBodyMetric({ id: 'm1', date: '2026-10-19', weightKg: 80 });
    useStore.getState().applyHealthSync({
      summary: {
        date: '2026-10-20',
        stepsToday: 5000,
        stepsYesterday: 7000,
        sleepMinutesLastNight: 420,
      },
      weights: [
        { date: '2026-10-19', weightKg: 79.4 },
        { date: '2026-10-20', weightKg: 79.8 },
      ],
    });
    const s = useStore.getState();
    const byDate = new Map(s.bodyMetrics.map((m) => [m.date, m]));
    expect(byDate.get('2026-10-19')?.weightKg).toBe(80); // manual wins
    expect(byDate.get('2026-10-20')).toMatchObject({ weightKg: 79.8, source: 'health-connect' });
    expect(s.healthSummary?.stepsToday).toBe(5000);
    expect(s.healthConnectLastSyncedAt).toBeTruthy();
  });

  it('health consent defaults to OFF', () => {
    expect(useStore.getState().uiPreferences.healthConnectEnabled).toBe(false);
  });
});

describe('shiftDateStr', () => {
  it('shifts across month boundaries', () => {
    expect(shiftDateStr('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDateStr('2026-10-31', 1)).toBe('2026-11-01');
  });
});
