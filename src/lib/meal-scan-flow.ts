/**
 * §29 — the meal-scan flow as ONE explicit state machine.
 *
 * Before: a 3-value step union ('select' | 'analyzing' |
 * 'review') plus four orthogonal booleans (live camera, camera
 * denied, capturing, processing) and a detached error string —
 * the real state was the combination, and several combinations
 * were meaningless (cameraDenied && analyzing, capturing while
 * in review…). Now the flow state is a discriminated union and
 * every transition goes through mealScanReducer:
 *
 *   select ──camera-request──▶ cameraLive ──capture-start──▶ capturing
 *     ▲                          │                              │
 *     │                          ├─camera-denied─▶ cameraDenied │ capture-done /
 *     │                          │                    │         │ capture-failed
 *     └──────── camera-closed ───┴────────────────────┘         ▼
 *     │                                                       select
 *     ├─analyze-start─▶ analyzing ──analyze-succeeded{source}─▶ review{source}
 *     │                    │                                    │
 *     │                    ├─analyze-aborted────────▶ select    │ analyze-succeeded
 *     │                    └─analyze-failed{reason}─▶ error     │  {source:'refined'}
 *     ├─offline-estimate────────────────────────────▶ review{source:'offline'}
 *     ├─file-error{reason}─▶ error{reason} ──dismiss-error──▶ select
 *     └─reset (from anywhere) ──▶ select
 *
 * The review state CARRIES its source ('cloud' | 'offline' |
 * 'refined') and the review screen shows it — a user can tell an
 * on-device estimate from a cloud analysis from a refinement.
 * The offline estimate is synchronous, so it enters review
 * directly (no fake analyzing pass); every other path to review
 * goes through analyzing.
 *
 * Two busy flags deliberately stay local to the component and
 * are NOT flow states: image compression (inside the select
 * family — it decides nothing but a spinner) and refinement-in-
 * progress (inside review). They gate no transition.
 *
 * Camera PERMISSION is its own small machine below: the flow
 * machine says WHERE the user is; the permission machine says
 * what the browser last answered.
 */

export type ScanResultSource = 'cloud' | 'offline' | 'refined';

export type MealScanState =
  | { step: 'select' }
  | { step: 'cameraLive' }
  | { step: 'cameraDenied' }
  | { step: 'capturing' }
  | { step: 'analyzing' }
  | { step: 'review'; source: ScanResultSource }
  | { step: 'error'; reason: string };

export type MealScanEvent =
  | { type: 'camera-request' }
  | { type: 'camera-denied' }
  | { type: 'camera-closed' }
  | { type: 'capture-start' }
  | { type: 'capture-done' }
  | { type: 'capture-failed' }
  | { type: 'analyze-start' }
  | { type: 'analyze-succeeded'; source: ScanResultSource }
  | { type: 'analyze-failed'; reason: string }
  | { type: 'analyze-aborted' }
  | { type: 'offline-estimate' }
  | { type: 'file-error'; reason: string }
  | { type: 'dismiss-error' }
  | { type: 'reset' };

export const INITIAL_MEAL_SCAN_STATE: MealScanState = { step: 'select' };

const SELECT_FAMILY: ReadonlySet<MealScanState['step']> = new Set([
  'select',
  'cameraLive',
  'cameraDenied',
  'capturing',
  'error',
]);

/** True for the states that render the select layout (photo
 * intake: upload area / viewfinder / preview / notes). */
export function isSelectFamily(state: MealScanState): boolean {
  return SELECT_FAMILY.has(state.step);
}

export function mealScanReducer(
  state: MealScanState,
  event: MealScanEvent
): MealScanState {
  switch (event.type) {
    case 'reset':
      return { step: 'select' };
    case 'camera-request':
      // Opening (or flipping) the camera mounts the viewfinder
      // while getUserMedia resolves — from the select family or
      // a review retake.
      if (SELECT_FAMILY.has(state.step) || state.step === 'review') {
        return { step: 'cameraLive' };
      }
      return state;
    case 'camera-denied':
      return state.step === 'cameraLive' ? { step: 'cameraDenied' } : state;
    case 'camera-closed':
      return state.step === 'cameraLive' ||
        state.step === 'capturing' ||
        state.step === 'cameraDenied'
        ? { step: 'select' }
        : state;
    case 'capture-start':
      return state.step === 'cameraLive' ? { step: 'capturing' } : state;
    case 'capture-done':
    case 'capture-failed':
      return state.step === 'capturing' ? { step: 'select' } : state;
    case 'analyze-start':
      return SELECT_FAMILY.has(state.step) ? { step: 'analyzing' } : state;
    case 'analyze-succeeded':
      // Cloud analysis lands from analyzing; a refinement lands
      // from review (or analyzing, if a future path routes it
      // through the spinner).
      return state.step === 'analyzing' || state.step === 'review'
        ? { step: 'review', source: event.source }
        : state;
    case 'analyze-failed':
      return state.step === 'analyzing'
        ? { step: 'error', reason: event.reason }
        : state;
    case 'analyze-aborted':
      return state.step === 'analyzing' ? { step: 'select' } : state;
    case 'offline-estimate':
      // The banner's escape hatch works from the error state too.
      return SELECT_FAMILY.has(state.step)
        ? { step: 'review', source: 'offline' }
        : state;
    case 'file-error':
      return SELECT_FAMILY.has(state.step)
        ? { step: 'error', reason: event.reason }
        : state;
    case 'dismiss-error':
      return state.step === 'error' ? { step: 'select' } : state;
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera permission — its own small machine
// ─────────────────────────────────────────────────────────────────────────────

export type CameraPermissionState =
  | 'unknown'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported';

export type CameraPermissionEvent =
  | { type: 'request' }
  | { type: 'granted' }
  | { type: 'denied' }
  | { type: 'unsupported' }
  | { type: 'error' };

export function cameraPermissionReducer(
  state: CameraPermissionState,
  event: CameraPermissionEvent
): CameraPermissionState {
  switch (event.type) {
    case 'request':
      return 'requesting';
    case 'granted':
      return state === 'requesting' ? 'granted' : state;
    case 'denied':
      return state === 'requesting' ? 'denied' : state;
    case 'unsupported':
      return 'unsupported';
    case 'error':
      // A non-permission failure (no device, busy hardware): the
      // permission question itself is unanswered again.
      return state === 'requesting' ? 'unknown' : state;
    default:
      return state;
  }
}
