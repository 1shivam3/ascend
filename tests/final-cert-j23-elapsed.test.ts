/**
 * Final-cert J2.3 (P2): elapsed workout timer reset to 0:00 after a
 * tab-switch resume, and finish summary (1m 21s) disagreed with the
 * completion screen (1m 25s). Elapsed/duration are now DERIVED from
 * the persisted session start timestamp (the active-workout draft's
 * sessionStartTime) via lib/workout-elapsed — the one source every
 * surface reads — so a remount is a re-read, never a restart.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getElapsedSeconds, getSessionDuration } from '../src/lib/workout-elapsed';
import { useStore } from '../src/lib/store';

const T0 = 1_762_000_000_000; // arbitrary session start (ms)

describe('final-cert J2.3: elapsed derives from the persisted start timestamp', () => {
  it('elapsed at +52s is 52, not a mount-relative value', () => {
    expect(getElapsedSeconds(T0, T0 + 52_000)).toBe(52);
  });

  it('simulated remount: discarding all local state and re-deriving shows the FULL elapsed', () => {
    // "Mount 1" reads elapsed at +52s.
    const mount1 = getElapsedSeconds(T0, T0 + 52_000);
    expect(mount1).toBe(52);
    // Tab switch unmounts everything; 33s pass on other tabs.
    // "Mount 2" (resume) re-derives from the same persisted timestamp:
    // the old code restarted at 0:00; the derivation shows 85s.
    const mount2 = getElapsedSeconds(T0, T0 + 85_000);
    expect(mount2).toBe(85);
    expect(mount2).not.toBe(0);
  });

  it('finish summary and completion read the same duration source', () => {
    const finish = getSessionDuration(T0, T0 + 81_400);
    expect(finish.durationSeconds).toBe(81);
    expect(finish.durationMinutes).toBe(1);
    // Same instant, same source → identical values on both surfaces.
    expect(getSessionDuration(T0, T0 + 81_400)).toEqual(finish);
  });

  it('guards: missing/invalid start → 0; clock skew never goes negative', () => {
    expect(getElapsedSeconds(undefined, T0)).toBe(0);
    expect(getElapsedSeconds(null, T0)).toBe(0);
    expect(getElapsedSeconds(T0, T0 - 5_000)).toBe(0);
  });

  it('store level: the draft persists sessionStartTime across a simulated remount', () => {
    useStore.getState().saveWorkoutDraft({
      date: '2026-11-01',
      name: 'Upper A',
      exercises: [],
      startedFromPlan: 'Upper A',
      sessionStartTime: T0,
      savedAt: new Date(T0).toISOString(),
    } as never);
    // A remounted page seeds its start marker from the store draft.
    const persisted = useStore.getState().activeWorkoutDraft?.sessionStartTime;
    expect(persisted).toBe(T0);
    expect(getElapsedSeconds(persisted, T0 + 52_000)).toBe(52);
    useStore.getState().clearWorkoutDraft();
  });

  it('wiring: both finish paths and the screen timer use the shared helper', () => {
    const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    const screen = read('src/components/ActiveWorkoutScreen.tsx');
    expect(screen).toContain('getSessionDuration(sessionStartTime, Date.now())');
    expect(screen).toContain('getElapsedSeconds(sessionStartTime, Date.now())');
    const page = read('src/components/WorkoutPage.tsx');
    expect(page).toContain('getSessionDuration(sessionStartTime, Date.now())');
    expect(page).toContain('activeWorkoutDraft?.sessionStartTime || Date.now()');
  });
});
