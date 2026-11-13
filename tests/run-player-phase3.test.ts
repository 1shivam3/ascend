/**
 * Phase 3.7 — §22 run session + C25K.
 *
 * The player is one reducer: phase/status/countdown/credit in a
 * single state (before: 3 useState flags + 4 hand-synced refs).
 * A run counts toward its program session only at the documented
 * threshold (≥80% of intervals finished naturally); partial runs
 * are still logged and recorded as partial. Attempts are told
 * apart by enrollmentId — re-enrolling keeps prior attempts'
 * runs, stamped with the old id, not counted. No enrollment →
 * the program is never "complete". Deleting the only counted
 * entry for a session is detectable (the history UI warns).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildIntervalSchedule,
  buildRunWorkoutEntry,
  doesRunEntryCount,
  getRunProgramProgress,
  getRunSession,
  isRunEntryComplete,
  legacyEnrollmentId,
  resolveEnrollmentId,
  sanitizeRunProgramState,
  wouldUncompleteRunSession,
  type RunProgramState,
} from '@/lib/run-program';
import {
  currentRunPhase,
  initialRunPlayerState,
  runPlayerReducer,
  type RunPlayerState,
} from '@/lib/run-player';
import type { WorkoutEntry } from '@/lib/types';

const session = getRunSession('c25k-w1d1')!; // 8 × (60 run / 90 walk); 16 body phases + warmup + cooldown
const phases = buildIntervalSchedule(session);
const tick = (s: RunPlayerState, dt: number) => runPlayerReducer(s, { type: 'tick', dtSeconds: dt }, phases);
const runOutPhase = (s: RunPlayerState) => tick(s, currentRunPhase(s, phases)!.seconds);

describe('§22 player reducer', () => {
  it('starts running on the warm-up at full length', () => {
    const s = initialRunPlayerState(phases);
    expect(s.status).toBe('running');
    expect(currentRunPhase(s, phases)?.kind).toBe('warmup');
    expect(s.phaseLeft).toBe(300);
    expect(s.intervalsCompleted).toBe(0);
  });

  it('a tick that ends the warm-up advances without credit', () => {
    const s = runOutPhase(initialRunPlayerState(phases));
    expect(currentRunPhase(s, phases)?.kind).toBe('run');
    expect(s.intervalsCompleted).toBe(0);
    expect(s.phaseLeft).toBe(60);
  });

  it('natural phase ends earn credit; skips do not', () => {
    let s = runOutPhase(initialRunPlayerState(phases)); // warm-up done
    s = runOutPhase(s); // run 1 done naturally
    expect(s.intervalsCompleted).toBe(1);
    s = runPlayerReducer(s, { type: 'skip' }, phases); // skip walk 1
    expect(s.intervalsCompleted).toBe(1);
    expect(currentRunPhase(s, phases)?.kind).toBe('run');
  });

  it('pause freezes the countdown; resume continues it', () => {
    let s = initialRunPlayerState(phases);
    s = tick(s, 100);
    s = runPlayerReducer(s, { type: 'pause' }, phases);
    const frozen = tick(s, 500); // tick while paused is a no-op
    expect(frozen).toBe(s);
    s = runPlayerReducer(s, { type: 'resume' }, phases);
    s = tick(s, 200);
    expect(currentRunPhase(s, phases)?.kind).toBe('run');
  });

  it('playing the whole schedule finishes with full credit and phaseIdx at the end', () => {
    let s = initialRunPlayerState(phases);
    while (s.status !== 'finished') s = runOutPhase(s);
    expect(s.phaseIdx).toBe(phases.length);
    expect(s.intervalsCompleted).toBe(16);
    expect(currentRunPhase(s, phases)).toBeUndefined();
  });

  it('endNow finishes mid-schedule with only the credit earned (partial)', () => {
    let s = runOutPhase(initialRunPlayerState(phases));
    s = runPlayerReducer(s, { type: 'endNow' }, phases);
    expect(s.status).toBe('finished');
    expect(s.phaseIdx).toBe(1); // still mid-schedule — the cue logic keys off this
    expect(s.intervalsCompleted).toBe(0);
  });

  it('skipping the final phase also finishes (without its credit)', () => {
    let s = initialRunPlayerState(phases);
    // Skip everything: no natural completions at all.
    while (s.status !== 'finished') s = runPlayerReducer(s, { type: 'skip' }, phases);
    expect(s.phaseIdx).toBe(phases.length);
    expect(s.intervalsCompleted).toBe(0);
  });

  it('a long tick (app slept) crosses exactly one phase — overshoot discarded', () => {
    const s = tick(initialRunPlayerState(phases), 10000);
    expect(s.phaseIdx).toBe(1);
    expect(s.phaseLeft).toBe(60); // next phase starts full
    expect(s.elapsed).toBe(10000);
  });
});

describe('§22 completion threshold', () => {
  const entry = (done: number, total: number): WorkoutEntry =>
    buildRunWorkoutEntry({
      id: `r-${done}-${total}`,
      session,
      date: '2026-11-10',
      durationSeconds: 1500,
      intervalsCompleted: done,
      intervalsTotal: total,
    });

  it('the entry stamps structured counts', () => {
    const e = entry(13, 16);
    expect(e.runIntervalsCompleted).toBe(13);
    expect(e.runIntervalsTotal).toBe(16);
  });

  it('≥80% of intervals completes the session; below it does not', () => {
    expect(isRunEntryComplete(entry(16, 16))).toBe(true);
    expect(isRunEntryComplete(entry(13, 16))).toBe(true); // 81%
    expect(isRunEntryComplete(entry(12, 16))).toBe(false); // 75%
    expect(isRunEntryComplete(entry(0, 16))).toBe(false);
  });

  it('a partial run is LOGGED but does not complete the session in progress', () => {
    const state: RunProgramState = { enrolledDate: '2026-11-09', enrollmentId: 'enr-A' };
    const partial = buildRunWorkoutEntry({
      id: 'r-partial',
      session,
      date: '2026-11-10',
      durationSeconds: 400,
      intervalsCompleted: 2,
      intervalsTotal: 16,
      enrollmentId: 'enr-A',
    });
    expect(partial.exercises[0].notes).toContain('2 of 16 intervals finished');
    const progress = getRunProgramProgress([partial], state);
    expect(progress.completedCount).toBe(0);
    expect(progress.nextSession?.id).toBe('c25k-w1d1'); // still next up
  });

  it('legacy entries (no structured counts) count as completed', () => {
    const legacy = { ...entry(16, 16), runIntervalsCompleted: undefined, runIntervalsTotal: undefined };
    expect(isRunEntryComplete(legacy)).toBe(true);
  });
});

describe('§22 enrollment identity', () => {
  const mkRun = (over: Partial<WorkoutEntry>): WorkoutEntry =>
    ({
      id: 'x',
      date: '2026-11-10',
      name: 'run',
      kind: 'run',
      runSessionId: 'c25k-w1d1',
      exercises: [],
      ...over,
    }) as WorkoutEntry;

  it('stamped runs count only under their own enrollment — date edits cannot move them', () => {
    const a: RunProgramState = { enrolledDate: '2026-11-01', enrollmentId: 'enr-A' };
    const b: RunProgramState = { enrolledDate: '2026-11-01', enrollmentId: 'enr-B' };
    const runFromA = mkRun({ runEnrollmentId: 'enr-A', date: '2026-09-01' }); // backdated
    expect(doesRunEntryCount(runFromA, a)).toBe(true); // stamp wins over the date
    expect(doesRunEntryCount(runFromA, b)).toBe(false); // previous attempt: kept, not counted
  });

  it('unstamped legacy runs attribute by enrolled date', () => {
    const state: RunProgramState = { enrolledDate: '2026-11-05' };
    expect(doesRunEntryCount(mkRun({ date: '2026-11-06' }), state)).toBe(true);
    expect(doesRunEntryCount(mkRun({ date: '2026-11-01' }), state)).toBe(false);
    // …and against the derived legacy id when a stamp exists.
    const stampedLegacy = mkRun({ runEnrollmentId: legacyEnrollmentId('2026-11-05'), date: '2026-11-01' });
    expect(doesRunEntryCount(stampedLegacy, state)).toBe(true);
  });

  it('re-enrollment keeps prior attempts: progress restarts, history intact', () => {
    const attempt1: RunProgramState = { enrolledDate: '2026-10-01', enrollmentId: 'enr-1' };
    const runs = [
      mkRun({ id: 'a1', runEnrollmentId: 'enr-1' }),
      mkRun({ id: 'a2', runEnrollmentId: 'enr-1', runSessionId: 'c25k-w1d2' }),
    ];
    expect(getRunProgramProgress(runs, attempt1).completedCount).toBe(2);
    const attempt2: RunProgramState = { enrolledDate: '2026-11-09', enrollmentId: 'enr-2' };
    const progress = getRunProgramProgress(runs, attempt2);
    expect(progress.completedCount).toBe(0);
    expect(progress.nextSession?.id).toBe('c25k-w1d1');
    expect(runs).toHaveLength(2); // nothing erased
  });

  it('no enrollment → nothing counts and the program is never complete', () => {
    const allRuns = Array.from({ length: 24 }, (_, i) =>
      mkRun({ id: `r${i}`, runSessionId: `c25k-w${Math.floor(i / 3) + 1}d${(i % 3) + 1}` })
    );
    const progress = getRunProgramProgress(allRuns, null);
    expect(progress.completedCount).toBe(0);
    expect(progress.complete).toBe(false);
    expect(doesRunEntryCount(allRuns[0], null)).toBe(false);
  });

  it('resolveEnrollmentId + sanitize mint the deterministic legacy id', () => {
    expect(resolveEnrollmentId({ enrolledDate: '2026-10-05' })).toBe('enr-legacy-2026-10-05');
    expect(sanitizeRunProgramState({ enrolledDate: '2026-10-05', enrollmentId: 'enr-x' })).toEqual({
      enrolledDate: '2026-10-05',
      enrollmentId: 'enr-x',
    });
  });
});

describe('§22 delete warning predicate', () => {
  const state: RunProgramState = { enrolledDate: '2026-11-01', enrollmentId: 'enr-A' };
  const counted = buildRunWorkoutEntry({
    id: 'only',
    session,
    date: '2026-11-10',
    durationSeconds: 1700,
    intervalsCompleted: 16,
    intervalsTotal: 16,
    enrollmentId: 'enr-A',
  });

  it('the only counted entry for a session warns', () => {
    expect(wouldUncompleteRunSession(counted, [counted], state)).toBe(true);
  });

  it('a duplicate counted entry means deleting one does NOT un-complete', () => {
    const dupe = { ...counted, id: 'dupe' };
    expect(wouldUncompleteRunSession(counted, [counted, dupe], state)).toBe(false);
  });

  it('partial or foreign-enrollment entries never warn', () => {
    const partial = buildRunWorkoutEntry({
      id: 'p',
      session,
      date: '2026-11-10',
      durationSeconds: 300,
      intervalsCompleted: 1,
      intervalsTotal: 16,
      enrollmentId: 'enr-A',
    });
    expect(wouldUncompleteRunSession(partial, [partial], state)).toBe(false);
    const foreign = { ...counted, id: 'f', runEnrollmentId: 'enr-OLD' };
    expect(wouldUncompleteRunSession(foreign, [foreign], state)).toBe(false);
  });
});

describe('§22 source guards', () => {
  it('the screen consumes the reducer and holds no hand-synced player refs', () => {
    const screen = readFileSync('src/components/RunSessionScreen.tsx', 'utf8');
    expect(screen).toContain('runPlayerReducer');
    expect(screen).not.toContain('phaseIdxRef');
    expect(screen).not.toContain('phaseLeftRef');
    expect(screen).not.toContain('completedBodyRef');
    expect(screen).not.toContain('setPhaseIdx');
    expect(screen).not.toContain('setIsRunning');
    expect(screen).not.toContain('setFinished');
  });
});
