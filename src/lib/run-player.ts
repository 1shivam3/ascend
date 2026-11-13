/**
 * §22: the run session player as ONE machine.
 *
 * Before §22, RunSessionScreen held the player as three useState
 * flags (phaseIdx, isRunning, finished) plus four refs hand-synced
 * alongside them (phaseIdxRef, phaseLeftRef, lastTickRef,
 * completedBodyRef) — every transition had to write both copies,
 * and the render even read a ref for the intervals-done line.
 * Now the whole player is this reducer: phase, status, countdown
 * and credit live in one state, transitions are pure and tested,
 * and the component keeps only the wall-clock ref the tick
 * measures with (effect bookkeeping, not player state).
 *
 * Semantics preserved from the hand-synced version:
 * - A phase earns interval credit only when it ends NATURALLY
 *   (the countdown reaches zero) — skipping earns none.
 * - Warm-up and cool-down never earn body-interval credit.
 * - Advancing past the last phase finishes — naturally, by skip,
 *   the finish cue fires either way (the component tells this
 *   from phaseIdx reaching the end; 'endNow' leaves phaseIdx
 *   mid-schedule, cue-free, exactly as before).
 * - A tick's overshoot past a phase end is discarded: the next
 *   phase starts full.
 */
import type { IntervalPhase } from './run-program';
import { assertNever } from './assert';

export interface RunPlayerState {
  /** Index into the phase schedule; === phases.length when the
   *  schedule was played/skipped to its end. */
  phaseIdx: number;
  /** Seconds left in the current phase (float; display ceils). */
  phaseLeft: number;
  status: 'running' | 'paused' | 'finished';
  /** Total elapsed seconds (float). */
  elapsed: number;
  /** Body phases (not warm-up/cool-down) finished naturally. */
  intervalsCompleted: number;
}

export type RunPlayerAction =
  | { type: 'tick'; dtSeconds: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skip' }
  | { type: 'endNow' };

export function initialRunPlayerState(phases: IntervalPhase[]): RunPlayerState {
  return {
    phaseIdx: 0,
    phaseLeft: phases[0]?.seconds ?? 0,
    status: 'running',
    elapsed: 0,
    intervalsCompleted: 0,
  };
}

function advance(
  state: RunPlayerState,
  phases: IntervalPhase[],
  natural: boolean
): RunPlayerState {
  const current = phases[state.phaseIdx];
  const credited =
    natural && current && current.kind !== 'warmup' && current.kind !== 'cooldown'
      ? state.intervalsCompleted + 1
      : state.intervalsCompleted;
  const next = state.phaseIdx + 1;
  if (next >= phases.length) {
    return { ...state, phaseIdx: next, phaseLeft: 0, status: 'finished', intervalsCompleted: credited };
  }
  return {
    ...state,
    phaseIdx: next,
    phaseLeft: phases[next].seconds,
    intervalsCompleted: credited,
  };
}

export function runPlayerReducer(
  state: RunPlayerState,
  action: RunPlayerAction,
  phases: IntervalPhase[]
): RunPlayerState {
  switch (action.type) {
    case 'tick': {
      if (state.status !== 'running') return state;
      const phaseLeft = state.phaseLeft - action.dtSeconds;
      const ticked: RunPlayerState = {
        ...state,
        phaseLeft,
        elapsed: state.elapsed + action.dtSeconds,
      };
      return phaseLeft <= 0 ? advance(ticked, phases, true) : ticked;
    }
    case 'pause':
      return state.status === 'running' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'running' } : state;
    case 'skip':
      return state.status === 'finished' ? state : advance(state, phases, false);
    case 'endNow':
      return state.status === 'finished' ? state : { ...state, status: 'finished' };
    default:
      return assertNever(action);
  }
}

/** The phase the player is on (undefined once played to the end). */
export function currentRunPhase(
  state: RunPlayerState,
  phases: IntervalPhase[]
): IntervalPhase | undefined {
  return phases[state.phaseIdx];
}
