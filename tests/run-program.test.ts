import { describe, it, expect, beforeEach } from 'vitest';
import {
  RUN_SESSIONS,
  RUN_PROGRAM_WEEKS,
  buildIntervalSchedule,
  sessionRunSeconds,
  sessionLongestRunSeconds,
  sessionTotalSeconds,
  weekRunSeconds,
  describeSession,
  getRunProgramProgress,
  getCompletedRunSessionIds,
  buildRunWorkoutEntry,
  sanitizeRunProgramState,
  getRunSession,
} from '../src/lib/run-program';
import { dayIsActive, buildActiveDays, calculateStreak } from '../src/lib/streak-freeze';
import { getWeeklyHabitsConsistency, getDayType } from '../src/lib/habits';
import { useStore, partializeAppState } from '../src/lib/store';
import type { WorkoutEntry } from '../src/lib/types';

describe('Couch to 5K program table', () => {
  it('has 8 weeks × 3 runs with stable unique ids', () => {
    expect(RUN_SESSIONS).toHaveLength(RUN_PROGRAM_WEEKS * 3);
    expect(new Set(RUN_SESSIONS.map((s) => s.id)).size).toBe(24);
    for (let wk = 1; wk <= 8; wk++) {
      expect(RUN_SESSIONS.filter((s) => s.week === wk)).toHaveLength(3);
    }
    expect(getRunSession('c25k-w5d3')!.segments).toEqual([{ kind: 'run', seconds: 1200 }]);
  });

  it('progresses monotonically: weekly running volume never goes down', () => {
    const totals = Array.from({ length: 8 }, (_, i) => weekRunSeconds(i + 1));
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]);
    }
    // And it really builds: week 8 runs 3× the minutes of week 1.
    expect(totals[7]).toBeGreaterThan(totals[0] * 3);
  });

  it('the longest continuous run bout never shrinks week over week', () => {
    // The classic plan's real progression axis: individual sessions in
    // week 5 day 1 total slightly less running than week 4, but the
    // longest unbroken bout grows every single week.
    const longest = Array.from({ length: 8 }, (_, i) =>
      Math.max(
        ...RUN_SESSIONS.filter((s) => s.week === i + 1).map(sessionLongestRunSeconds),
      ),
    );
    for (let i = 1; i < longest.length; i++) {
      expect(longest[i]).toBeGreaterThanOrEqual(longest[i - 1]);
    }
    expect(longest[0]).toBe(60);
    expect(longest[7]).toBe(1800);
    // Graduation: week 8 is 30 continuous minutes, every run.
    for (const s of RUN_SESSIONS.filter((x) => x.week === 8)) {
      expect(sessionRunSeconds(s)).toBe(1800);
      expect(s.segments).toHaveLength(1);
    }
  });
});

describe('buildIntervalSchedule', () => {
  it('wraps intervals in a 5-minute warm-up and cool-down walk', () => {
    const phases = buildIntervalSchedule(getRunSession('c25k-w1d1')!);
    expect(phases[0]).toEqual({ kind: 'warmup', seconds: 300 });
    expect(phases[phases.length - 1]).toEqual({ kind: 'cooldown', seconds: 300 });
    const total = phases.reduce((a, p) => a + p.seconds, 0);
    expect(total).toBe(sessionTotalSeconds(getRunSession('c25k-w1d1')!));
  });

  it('expands week 1 into 8 run/walk pairs in order', () => {
    const phases = buildIntervalSchedule(getRunSession('c25k-w1d1')!);
    const body = phases.slice(1, -1);
    expect(body).toHaveLength(16);
    for (let i = 0; i < body.length; i += 2) {
      expect(body[i]).toEqual({ kind: 'run', seconds: 60 });
      expect(body[i + 1]).toEqual({ kind: 'walk', seconds: 90 });
    }
  });

  it('a continuous session is warm-up, one long run, cool-down', () => {
    const phases = buildIntervalSchedule(getRunSession('c25k-w5d3')!);
    expect(phases.map((p) => p.kind)).toEqual(['warmup', 'run', 'cooldown']);
    expect(phases[1].seconds).toBe(1200);
  });

  it('describes sessions for humans', () => {
    expect(describeSession(getRunSession('c25k-w1d1')!)).toContain('8 ×');
    expect(describeSession(getRunSession('c25k-w5d3')!)).toBe('20 min continuous run');
    expect(describeSession(getRunSession('c25k-w8d1')!)).toBe('30 min continuous run');
  });
});

const runEntry = (sessionId: string, date: string): WorkoutEntry =>
  buildRunWorkoutEntry({
    id: `run-${sessionId}-${date}`,
    session: getRunSession(sessionId)!,
    date,
    durationSeconds: 1800,
    intervalsCompleted: 18,
    intervalsTotal: 18,
  });

describe('run logging → progress, streaks, habits', () => {
  it('builds an honest entry: kind run, no faked sets, distance kept', () => {
    const entry = buildRunWorkoutEntry({
      id: 'r1',
      session: getRunSession('c25k-w1d1')!,
      date: '2026-10-05',
      durationSeconds: 1680,
      intervalsCompleted: 10,
      intervalsTotal: 18,
      distanceKm: 3.456,
    });
    expect(entry.kind).toBe('run');
    expect(entry.runSessionId).toBe('c25k-w1d1');
    expect(entry.distanceKm).toBe(3.46);
    expect(entry.exercises[0].sets).toEqual([]);
    expect(entry.exercises[0].notes).toContain('10 of 18 intervals finished');
    expect(entry.durationMinutes).toBe(28);
  });

  it('derives progress from logged runs and finds the next session', () => {
    const workouts = [runEntry('c25k-w1d1', '2026-10-05'), runEntry('c25k-w1d2', '2026-10-07')];
    const progress = getRunProgramProgress(workouts, { enrolledDate: '2026-10-05' });
    expect(progress.completedCount).toBe(2);
    expect(progress.nextSession!.id).toBe('c25k-w1d3');
    expect(progress.currentWeek).toBe(1);
    expect(progress.complete).toBe(false);
  });

  it('ignores runs from before (re-)enrollment', () => {
    const workouts = [runEntry('c25k-w1d1', '2026-09-01')];
    const ids = getCompletedRunSessionIds(workouts, '2026-10-05');
    expect(ids.size).toBe(0);
    const progress = getRunProgramProgress(workouts, { enrolledDate: '2026-10-05' });
    expect(progress.nextSession!.id).toBe('c25k-w1d1');
  });

  it('a logged run makes the day active for streaks', () => {
    const workouts = [runEntry('c25k-w1d1', '2026-10-05')];
    expect(dayIsActive('2026-10-05', workouts, [])).toBe(true);
    expect(dayIsActive('2026-10-06', workouts, [])).toBe(false);
    const active = buildActiveDays(workouts, []);
    expect(active).toEqual(['2026-10-05']);
    const streak = calculateStreak({
      dailyActivity: active,
      freezesAvailable: 1,
      todayStr: '2026-10-05',
    });
    expect(streak.currentStreak).toBe(1);
  });

  it('a logged run counts as a training day in habit plumbing', () => {
    const workouts = [runEntry('c25k-w1d1', '2026-10-05')];
    expect(getDayType('2026-10-05', workouts, {})).toBe('training');
    const consistency = getWeeklyHabitsConsistency({
      todayDate: new Date(2026, 9, 5), // Mon 2026-10-05
      workouts,
      waterLogs: {},
      waterTargetMl: 2500,
      creatineLogs: {},
      meals: [],
      proteinTargetG: 120,
    });
    expect(consistency.workoutScore.done).toBe(1);
  });
});

describe('run program store state', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('enrolls, persists, and leaves cleanly', () => {
    const store = useStore.getState();
    expect(store.runProgram).toBeNull();
    store.enrollRunProgram('2026-10-05');
    expect(useStore.getState().runProgram).toEqual({ enrolledDate: '2026-10-05' });
    const persisted = partializeAppState(useStore.getState()) as Record<string, unknown>;
    expect(persisted.runProgram).toEqual({ enrolledDate: '2026-10-05' });
    useStore.getState().leaveRunProgram();
    expect(useStore.getState().runProgram).toBeNull();
  });

  it('clearAllData resets enrollment; sanitize validates backups', () => {
    useStore.getState().enrollRunProgram('2026-10-05');
    useStore.getState().clearAllData();
    expect(useStore.getState().runProgram).toBeNull();
    expect(sanitizeRunProgramState({ enrolledDate: '2026-10-05' })).toEqual({ enrolledDate: '2026-10-05' });
    expect(sanitizeRunProgramState({ enrolledDate: 'not-a-date' })).toBeNull();
    expect(sanitizeRunProgramState(null)).toBeNull();
    expect(sanitizeRunProgramState('junk')).toBeNull();
  });
});
