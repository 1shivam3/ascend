/**
 * §21 (Phase 3.2): the rest timer as ONE pure state machine.
 *
 * Before: three boolean/number flags plus an authoritative
 * `restTargetEndTimeRef` in ActiveWorkoutScreen, with the start
 * sequence open-coded three times — two copies never assigned
 * the ref the countdown effect reads, so the UI could claim
 * "running" with no countdown behind it (a frozen pill that
 * never finished). WorkoutPage ran a second, decrement-based
 * timer that drifted whenever the tab slept.
 *
 * Now the state is a single value: a status, the authoritative
 * `endsAt` (epoch ms, present exactly while running), and the
 * derived `secondsLeft` display value. Every transition is this
 * reducer; every effect (tick loop, finish effects, the OS
 * alert) lives in use-rest-timer.ts. Time is always derived from
 * endsAt, so backgrounding and sleep are just large `now` jumps —
 * the tick after waking lands on the true remainder (or
 * finished), never on drift.
 */

export type RestTimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface RestTimerState {
  status: RestTimerStatus;
  /** Authoritative end instant (epoch ms). Non-null ⟺ running. */
  endsAt: number | null;
  /** Display value, derived from endsAt on every tick. */
  secondsLeft: number;
}

export const REST_TIMER_INITIAL: RestTimerState = {
  status: 'idle',
  endsAt: null,
  secondsLeft: 0,
};

export type RestTimerAction =
  | { type: 'start'; now: number; seconds: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'adjust'; deltaSeconds: number }
  | { type: 'tick'; now: number }
  | { type: 'skip' }
  | { type: 'reset'; seconds: number };

const remainingAt = (endsAt: number, now: number): number =>
  Math.max(0, Math.ceil((endsAt - now) / 1000));

export function restTimerReducer(state: RestTimerState, action: RestTimerAction): RestTimerState {
  switch (action.type) {
    case 'start': {
      const seconds = Math.max(0, Math.floor(action.seconds));
      if (seconds <= 0) return REST_TIMER_INITIAL;
      return { status: 'running', endsAt: action.now + seconds * 1000, secondsLeft: seconds };
    }
    case 'pause': {
      if (state.status !== 'running' || state.endsAt === null) return state;
      return { status: 'paused', endsAt: null, secondsLeft: remainingAt(state.endsAt, action.now) };
    }
    case 'resume': {
      if (state.status !== 'paused' || state.secondsLeft <= 0) return state;
      return {
        status: 'running',
        endsAt: action.now + state.secondsLeft * 1000,
        secondsLeft: state.secondsLeft,
      };
    }
    case 'adjust': {
      const delta = Math.floor(action.deltaSeconds);
      if (state.status === 'running' && state.endsAt !== null) {
        // Pure: endsAt and the display move together; the next
        // tick re-derives the display from the shifted endsAt.
        return {
          status: 'running',
          endsAt: state.endsAt + delta * 1000,
          secondsLeft: Math.max(0, state.secondsLeft + delta),
        };
      }
      // Idle/paused: move the standing remainder. Adjusting a
      // finished timer revives it to idle with the new value
      // (the logger bar's +/- after READY behaves this way).
      return {
        status: state.status === 'finished' ? 'idle' : state.status,
        endsAt: null,
        secondsLeft: Math.max(0, state.secondsLeft + delta),
      };
    }
    case 'tick': {
      if (state.status !== 'running' || state.endsAt === null) return state;
      const remaining = remainingAt(state.endsAt, action.now);
      if (remaining <= 0) return { status: 'finished', endsAt: null, secondsLeft: 0 };
      return remaining === state.secondsLeft ? state : { ...state, secondsLeft: remaining };
    }
    case 'skip':
      return REST_TIMER_INITIAL;
    case 'reset':
      return { status: 'idle', endsAt: null, secondsLeft: Math.max(0, Math.floor(action.seconds)) };
    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}
