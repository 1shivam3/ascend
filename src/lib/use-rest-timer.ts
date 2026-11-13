'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  restTimerReducer,
  REST_TIMER_INITIAL,
  type RestTimerState,
} from './rest-timer';

/**
 * §21 (Phase 3.2): the ONE rest-timer hook — every effect of the
 * machine lives here, so there is exactly one start path.
 *
 *  - Tick loop: while running, a 500ms interval + visibilitychange
 *    dispatch `tick` with the current time; the reducer derives
 *    the remainder from endsAt (backgrounding/sleep cannot drift).
 *  - Finish: onFinish fires exactly once per transition into
 *    'finished' (chime/haptic/notification are the caller's).
 *  - OS alert: scheduleAlert is called ONLY from start/resume/
 *    adjust-while-running — always with the same endsAt the
 *    reducer holds; cancelAlert from pause/skip/reset.
 *  - unlockAudio runs on the gesture paths (start/resume), while
 *    the user's tap is still on the stack.
 */
export interface UseRestTimerOptions {
  /** Duration start() uses when called without an explicit value. */
  defaultSeconds: number;
  onFinish?: () => void;
  scheduleAlert?: (endsAtMs: number) => void;
  cancelAlert?: () => void;
  unlockAudio?: () => void;
}

export interface RestTimerControls extends RestTimerState {
  /** The single start path. `seconds || defaultSeconds`, mirroring
   *  the historical startTimer semantics. */
  start: (seconds?: number) => void;
  pause: () => void;
  resume: () => void;
  /** running → pause; paused → resume; otherwise (idle/finished
   *  with nothing standing) → start. */
  togglePause: (startSeconds?: number) => void;
  adjust: (deltaSeconds: number) => void;
  skip: () => void;
  reset: (seconds: number) => void;
}

export function useRestTimer(options: UseRestTimerOptions): RestTimerControls {
  const [state, dispatch] = useReducer(restTimerReducer, REST_TIMER_INITIAL);

  // Latest callbacks/defaults without re-creating the controls or
  // re-subscribing the tick loop when a parent re-renders.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const stateRef = useRef(state);
  stateRef.current = state;

  const isRunning = state.status === 'running';
  useEffect(() => {
    if (!isRunning) return;
    const tick = () => dispatch({ type: 'tick', now: Date.now() });
    tick();
    const interval = setInterval(tick, 500);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isRunning]);

  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = state.status;
    if (prev !== 'finished' && state.status === 'finished') {
      optionsRef.current.onFinish?.();
    }
  }, [state.status]);

  const start = useCallback((seconds?: number) => {
    const o = optionsRef.current;
    const effective = seconds || o.defaultSeconds;
    const now = Date.now();
    dispatch({ type: 'start', now, seconds: effective });
    if (effective > 0) {
      o.unlockAudio?.();
      if (o.scheduleAlert) o.scheduleAlert(now + effective * 1000);
    }
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: 'pause', now: Date.now() });
    optionsRef.current.cancelAlert?.();
  }, []);

  const resume = useCallback(() => {
    const o = optionsRef.current;
    const s = stateRef.current;
    if (s.status !== 'paused' || s.secondsLeft <= 0) return;
    const now = Date.now();
    dispatch({ type: 'resume', now });
    o.unlockAudio?.();
    if (o.scheduleAlert) o.scheduleAlert(now + s.secondsLeft * 1000);
  }, []);

  const togglePause = useCallback(
    (startSeconds?: number) => {
      const s = stateRef.current;
      if (s.status === 'running') {
        pause();
      } else if (s.status === 'paused') {
        resume();
      } else if (s.secondsLeft > 0 && s.status === 'idle') {
        // A standing preset/remainder (logger bar): start from the
        // standing value, through the same single start path.
        start(s.secondsLeft);
      } else {
        start(startSeconds);
      }
    },
    [pause, resume, start]
  );

  const adjust = useCallback((deltaSeconds: number) => {
    const s = stateRef.current;
    // Move the OS alert to the same shifted instant the reducer
    // computes — before dispatching, from the pre-adjust endsAt.
    if (s.status === 'running' && s.endsAt !== null) {
      optionsRef.current.scheduleAlert?.(s.endsAt + deltaSeconds * 1000);
    }
    dispatch({ type: 'adjust', deltaSeconds });
  }, []);

  const skip = useCallback(() => {
    dispatch({ type: 'skip' });
    optionsRef.current.cancelAlert?.();
  }, []);

  const reset = useCallback((seconds: number) => {
    dispatch({ type: 'reset', seconds });
    optionsRef.current.cancelAlert?.();
  }, []);

  return {
    ...state,
    start,
    pause,
    resume,
    togglePause,
    adjust,
    skip,
    reset,
  };
}
