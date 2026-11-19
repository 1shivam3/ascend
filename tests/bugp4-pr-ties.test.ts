/**
 * T1 (bug program Phase 4): PR flags on tied sets.
 *
 * The replay/gate layer already enforced "strictly exceeds" for
 * RECORDS (covered by pr-source-phase3 + qa-phase1-r1: first lift =
 * baseline, match is not a PR, delete/edit/undo recompute, manual
 * records persist). The remaining defect was at the BADGE layer:
 * `isPRSet` matches EVERY set equal to the mark, so a session with
 * two identical top sets (the gym video: 60 kg × 10 twice) badged
 * both. `flaggedPRSets` flags exactly one — the first.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import {
  computeSessionPRMarks,
  flaggedPRSets,
  isPRSet,
} from '../src/lib/pr-reevaluation';
import type { WorkoutEntry, WorkoutSet } from '../src/lib/types';

const mkSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  reps: 10,
  weight: 60,
  unit: 'kg',
  status: 'completed',
  ...over,
});

const mkWorkout = (id: string, date: string, sets: WorkoutSet[]): WorkoutEntry => ({
  id,
  date,
  name: 'Session',
  exercises: [{ name: 'Bench Press', sets }],
});

describe('T1: tied sets — one flag per mark', () => {
  it('two identical top sets in one session: one mark, one flagged set (the first)', () => {
    const s1 = mkSet();
    const s2 = mkSet();
    const w = mkWorkout('w1', '2026-11-02', [s1, s2]);
    const marks = computeSessionPRMarks([w], [], 75);
    expect(marks).toHaveLength(1);
    // The old predicate matches both — that was the bug.
    expect(isPRSet(marks, 'w1', 'Bench Press', s1)).toBe(true);
    expect(isPRSet(marks, 'w1', 'Bench Press', s2)).toBe(true);
    const flagged = flaggedPRSets(marks, w);
    expect(flagged.size).toBe(1);
    expect(flagged.has(s1)).toBe(true);
    expect(flagged.has(s2)).toBe(false);
  });

  it('first-ever lift is flagged once and is the baseline performance', () => {
    const s1 = mkSet({ weight: 100, reps: 5 });
    const w = mkWorkout('w1', '2026-11-02', [s1]);
    const marks = computeSessionPRMarks([w], [], 75);
    expect(marks).toHaveLength(1);
    expect(flaggedPRSets(marks, w).has(s1)).toBe(true);
  });

  it('a later session that only TIES the record earns no mark and no flag', () => {
    const w1 = mkWorkout('w1', '2026-11-02', [mkSet()]);
    const tieSet = mkSet();
    const w2 = mkWorkout('w2', '2026-11-09', [tieSet]);
    const marks = computeSessionPRMarks([w1, w2], [], 75);
    expect(marks.map((m) => m.workoutId)).toEqual(['w1']);
    expect(flaggedPRSets(marks, w2).size).toBe(0);
  });

  it('beating the record flags the new best set only', () => {
    const w1 = mkWorkout('w1', '2026-11-02', [mkSet()]);
    const beat = mkSet({ weight: 62.5 });
    const w2 = mkWorkout('w2', '2026-11-09', [mkSet(), beat]);
    const marks = computeSessionPRMarks([w1, w2], [], 75);
    expect(marks.map((m) => m.workoutId)).toEqual(['w1', 'w2']);
    const flagged = flaggedPRSets(marks, w2);
    expect(flagged.size).toBe(1);
    expect(flagged.has(beat)).toBe(true);
  });

  it('rep-PR mark flags the first set that matches it, not a later equal set', () => {
    const s1 = mkWorkout('s1', '2026-10-26', [
      mkSet({ weight: 120, reps: 1 }),
      mkSet({ weight: 100, reps: 5 }),
    ]);
    const r1 = mkSet({ weight: 100, reps: 6 });
    const r2 = mkSet({ weight: 100, reps: 6 });
    const s2 = mkWorkout('s2', '2026-11-02', [r1, r2]);
    const marks = computeSessionPRMarks([s1, s2], [], 75);
    const flagged = flaggedPRSets(marks, s2);
    expect(flagged.size).toBe(1);
    expect(flagged.has(r1)).toBe(true);
    expect(flagged.has(r2)).toBe(false);
  });

  it('duplicate exercise blocks: the flag lands in the first block', () => {
    const a = mkSet();
    const b = mkSet();
    const w: WorkoutEntry = {
      id: 'w1',
      date: '2026-11-02',
      name: 'Session',
      exercises: [
        { name: 'Bench Press', sets: [a] },
        { name: 'Bench Press', sets: [b] },
      ],
    };
    const marks = computeSessionPRMarks([w], [], 75);
    const flagged = flaggedPRSets(marks, w);
    expect(flagged.size).toBe(1);
    expect(flagged.has(a)).toBe(true);
  });
});

describe('T1: badge source follows delete / undo (store level)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('delete removes the mark; undo restores it; a second delete removes it again', () => {
    const w = mkWorkout('w1', '2026-11-02', [mkSet(), mkSet()]);
    useStore.setState({ workouts: [w], prs: [] });
    const marksNow = () =>
      computeSessionPRMarks(useStore.getState().workouts, useStore.getState().prs, 75);
    expect(marksNow()).toHaveLength(1);

    useStore.getState().deleteWorkout('w1');
    expect(marksNow()).toHaveLength(0);

    useStore.getState().insertWorkoutAt(w, 0);
    expect(marksNow()).toHaveLength(1);
    // The restored session still flags exactly one of the tied sets.
    expect(flaggedPRSets(marksNow(), useStore.getState().workouts[0]).size).toBe(1);

    useStore.getState().deleteWorkout('w1');
    expect(marksNow()).toHaveLength(0);
    useStore.getState().insertWorkoutAt(w, 0);
    expect(marksNow()).toHaveLength(1);
  });
});
