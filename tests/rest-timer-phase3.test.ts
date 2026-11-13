/**
 * Phase 3.2 (§21): the rest timer is ONE machine.
 *
 * Before: three flag states + an authoritative ref in
 * ActiveWorkoutScreen, with the start sequence open-coded 3× —
 * two of the copies (set-toggle complete, voice-log complete)
 * never assigned the ref the countdown reads, so the UI claimed
 * "running" while the countdown effect early-returned on a null
 * ref forever: a frozen pill, no finish, no chime. WorkoutPage
 * ran a second, decrement-based timer that drifted whenever the
 * tab slept.
 *
 * Now: a pure reducer { status, endsAt, secondsLeft } owns the
 * state (lib/rest-timer), one hook (lib/use-rest-timer) owns the
 * effects (tick loop, finish effects, OS alert scheduling in the
 * single start path), and both components consume it. These
 * tests pin the reducer with explicit timestamps — backgrounding
 * and sleep are just large `now` jumps.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  restTimerReducer,
  REST_TIMER_INITIAL,
  type RestTimerState,
} from '../src/lib/rest-timer';

const T0 = 1_700_000_000_000;
const run = (actions: Parameters<typeof restTimerReducer>[1][], from: RestTimerState = REST_TIMER_INITIAL) =>
  actions.reduce((s, a) => restTimerReducer(s, a), from);

describe('§21 rest timer reducer', () => {
  it('start enters running with an endsAt — the ONLY way to run', () => {
    const s = run([{ type: 'start', now: T0, seconds: 90 }]);
    expect(s).toEqual({ status: 'running', endsAt: T0 + 90_000, secondsLeft: 90 });
  });

  it('tick derives the remainder from endsAt — a 10-minute sleep lands on finished, not drift', () => {
    const s = run([
      { type: 'start', now: T0, seconds: 90 },
      { type: 'tick', now: T0 + 45_000 },
    ]);
    expect(s.secondsLeft).toBe(45);
    expect(s.status).toBe('running');

    const slept = run([
      { type: 'start', now: T0, seconds: 90 },
      { type: 'tick', now: T0 + 600_000 },
    ]);
    expect(slept).toEqual({ status: 'finished', endsAt: null, secondsLeft: 0 });
  });

  it('pause freezes the remainder; resume re-derives endsAt from it', () => {
    const paused = run([
      { type: 'start', now: T0, seconds: 90 },
      { type: 'pause', now: T0 + 30_000 },
    ]);
    expect(paused).toEqual({ status: 'paused', endsAt: null, secondsLeft: 60 });

    const resumed = restTimerReducer(paused, { type: 'resume', now: T0 + 3_600_000 });
    expect(resumed).toEqual({
      status: 'running',
      endsAt: T0 + 3_600_000 + 60_000,
      secondsLeft: 60,
    });
  });

  it('adjust is pure: it shifts endsAt AND the display together while running', () => {
    const s = run([
      { type: 'start', now: T0, seconds: 90 },
      { type: 'adjust', deltaSeconds: 30 },
    ]);
    expect(s.endsAt).toBe(T0 + 120_000);
    expect(s.secondsLeft).toBe(120);

    const down = restTimerReducer(s, { type: 'adjust', deltaSeconds: -200 });
    expect(down.secondsLeft).toBe(0);
    // endsAt may pass into the past; the next tick finishes it.
    expect(restTimerReducer(down, { type: 'tick', now: T0 + 1 }).status).toBe('finished');
  });

  it('adjust while paused moves only the standing remainder; on finished it revives to idle', () => {
    const paused = run([
      { type: 'start', now: T0, seconds: 90 },
      { type: 'pause', now: T0 },
      { type: 'adjust', deltaSeconds: -30 },
    ]);
    expect(paused).toEqual({ status: 'paused', endsAt: null, secondsLeft: 60 });

    const finished = run([
      { type: 'start', now: T0, seconds: 10 },
      { type: 'tick', now: T0 + 20_000 },
      { type: 'adjust', deltaSeconds: 15 },
    ]);
    expect(finished).toEqual({ status: 'idle', endsAt: null, secondsLeft: 15 });
  });

  it('skip and reset return to idle (reset keeps a preset value)', () => {
    const running = run([{ type: 'start', now: T0, seconds: 90 }]);
    expect(restTimerReducer(running, { type: 'skip' })).toEqual(REST_TIMER_INITIAL);
    expect(restTimerReducer(running, { type: 'reset', seconds: 120 })).toEqual({
      status: 'idle', endsAt: null, secondsLeft: 120,
    });
  });

  it('illegal transitions are no-ops, never corrupt states', () => {
    expect(restTimerReducer(REST_TIMER_INITIAL, { type: 'pause', now: T0 })).toBe(REST_TIMER_INITIAL);
    expect(restTimerReducer(REST_TIMER_INITIAL, { type: 'resume', now: T0 })).toBe(REST_TIMER_INITIAL);
    expect(restTimerReducer(REST_TIMER_INITIAL, { type: 'tick', now: T0 })).toBe(REST_TIMER_INITIAL);
    const s = run([{ type: 'start', now: T0, seconds: 0 }]);
    expect(s.status).toBe('idle'); // a zero-length start is not a run
  });
});

describe('§21 source guards — the inline copies stay gone', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('ActiveWorkoutScreen has no ref-based timer and no hand-rolled start copies', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    expect(src).not.toContain('restTargetEndTimeRef');
    expect(src).not.toContain('setIsRestRunning');
    // The alert is scheduled inside the one hook, never inline at a call site.
    expect(src).not.toContain('scheduleRestAlert(Date.now()');
    expect(src).toContain('useRestTimer');
  });

  it('WorkoutPage consumes the same hook (no second decrement timer)', () => {
    const src = read('src/components/WorkoutPage.tsx');
    expect(src).toContain('useRestTimer');
    expect(src).not.toContain('setRestSecondsLeft((prev)');
    expect(src).not.toContain('setIsTimerFinished');
  });
});
