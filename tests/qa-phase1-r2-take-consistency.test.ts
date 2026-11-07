import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getVolumeComparison, formatVolumeShift } from '../src/lib/ai-coach';
import { detectSessionPRs, getBestPRForExercise } from '../src/lib/session-pr-detection';
import { computeSessionBest, gateSessionOutcome } from '../src/lib/pr-reevaluation';
import type { PersonalRecord, WorkoutEntry, WorkoutSet } from '../src/lib/types';

// QA-hardening R2 — Coach's Take self-contradiction.
//
// Two sources of the observed sheet: (1) getVolumeComparison returned
// diffPercent 0 when last week had no data, so the coach context said
// "Shift=+0%" and the take announced "0% total tonnage vs last week";
// (2) the banner counted every PR dated today while the context cited
// the first loosely-matching record — banner and headline could
// celebrate different PRs. Now: null means "No comparison yet", and
// both surfaces read lib/session-pr-detection.

const mkSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  reps: 5,
  weight: 100,
  unit: 'kg',
  completed: true,
  status: 'completed',
  ...over,
});

const mkWorkout = (id: string, date: string, sets: WorkoutSet[], name = 'Bench Press'): WorkoutEntry => ({
  id,
  date,
  name: 'Session',
  exercises: [{ name, sets }],
});

const mkPR = (over: Partial<PersonalRecord> = {}): PersonalRecord => ({
  id: 'pr1',
  exercise: 'Bench Press',
  weightKg: 100,
  weightLbs: 220.5,
  reps: 5,
  oneRepMax: 116.7,
  date: '2026-11-07',
  notes: 'All-Time 1RM PR',
  prType: '1rm',
  ...over,
});

// Wednesday 2026-11-04: this week = Mon 2026-11-02 … Sun 2026-11-08;
// last week = Mon 2026-10-26 … Sun 2026-11-01.
const TARGET = new Date(2026, 10, 4, 12, 0, 0);

describe('QA R2 — volume comparison honesty', () => {
  it('no prior week: diffPercent is null and renders "No comparison yet", never 0%', () => {
    const thisWeek = mkWorkout('a', '2026-11-04', [mkSet(), mkSet()]);
    const v = getVolumeComparison([thisWeek], 75, TARGET);
    expect(v.thisWeekKg).toBe(1000);
    expect(v.lastWeekKg).toBe(0);
    expect(v.diffPercent).toBeNull();
    expect(formatVolumeShift(v.diffPercent)).toBe('No comparison yet');
  });

  it('no workouts at all: still no comparison', () => {
    const v = getVolumeComparison([], 75, TARGET);
    expect(v.diffPercent).toBeNull();
  });

  it('prior week present: a real signed percent', () => {
    const lastWeek = mkWorkout('b', '2026-10-28', [mkSet(), mkSet()]);
    const thisWeek = mkWorkout('a', '2026-11-04', [mkSet(), mkSet(), mkSet()]);
    const v = getVolumeComparison([lastWeek, thisWeek], 75, TARGET);
    expect(v.lastWeekKg).toBe(1000);
    expect(v.thisWeekKg).toBe(1500);
    expect(v.diffPercent).toBe(50);
    expect(formatVolumeShift(v.diffPercent)).toBe('+50%');
  });

  it('a session this week (even Monday) never counts as last week', () => {
    const monday = mkWorkout('m', '2026-11-02', [mkSet(), mkSet()]);
    const v = getVolumeComparison([monday], 75, TARGET);
    expect(v.thisWeekKg).toBe(1000);
    expect(v.lastWeekKg).toBe(0);
    expect(v.diffPercent).toBeNull();
  });
});

describe('QA R2 — one PR detection for banner and headline', () => {
  it('first-ever lift: finish detection mints a baseline outcome', () => {
    const best = computeSessionBest('Bench Press', [mkSet()], [], 75);
    const outcome = gateSessionOutcome(best, 0);
    expect(outcome).not.toBeNull();
    expect(outcome?.kind).toBe('1rm');
    expect(outcome?.oneRepMax).toBe(116.7);
  });

  it('matching an existing PR exactly: no new outcome (a held PR is not a new PR)', () => {
    const history = [mkWorkout('h', '2026-10-26', [mkSet()])];
    const best = computeSessionBest('Bench Press', [mkSet()], history, 75);
    const outcome = gateSessionOutcome(best, 116.7);
    expect(outcome).toBeNull();
  });

  it('beating a PR: an improvement outcome over the standing best', () => {
    const history = [mkWorkout('h', '2026-10-26', [mkSet()])];
    const best = computeSessionBest('Bench Press', [mkSet({ weight: 110 })], history, 75);
    const outcome = gateSessionOutcome(best, 116.7);
    expect(outcome).not.toBeNull();
    expect(outcome?.oneRepMax).toBe(128.3);
  });

  it('banner attribution: only this session’s exercises, only its day', () => {
    const workout = mkWorkout('w', '2026-11-07', [mkSet({ weight: 110 })]);
    const prs = [
      mkPR({ id: 'this-session', weightKg: 110, oneRepMax: 128.3 }),
      mkPR({ id: 'earlier-today-other-lift', exercise: 'Squat', date: '2026-11-07' }),
      mkPR({ id: 'yesterday-same-lift', date: '2026-11-06' }),
    ];
    expect(detectSessionPRs(prs, workout).map((p) => p.id)).toEqual(['this-session']);
  });

  it('standing best is the max e1RM record, not the first stored', () => {
    const prs = [
      mkPR({ id: 'low-first', weightKg: 90, reps: 8, oneRepMax: 114.3, date: '2026-10-20' }),
      mkPR({ id: 'the-best', weightKg: 100, reps: 5, oneRepMax: 116.7, date: '2026-10-26' }),
      mkPR({ id: 'mid', weightKg: 105, reps: 3, oneRepMax: 115.5, date: '2026-11-01' }),
    ];
    expect(getBestPRForExercise(prs, 'Bench Press')?.id).toBe('the-best');
    expect(getBestPRForExercise(prs, 'Squat')).toBeNull();
  });

  it('wiring: banner and coach context both read the shared detection', () => {
    const modal = readFileSync('src/components/PostWorkoutTakeModal.tsx', 'utf8');
    expect(modal).toContain('detectSessionPRs');
    const ctx = readFileSync('src/lib/ai-context.ts', 'utf8');
    expect(ctx).toContain('getBestPRForExercise');
    expect(ctx).toContain('formatVolumeShift');
  });
});
