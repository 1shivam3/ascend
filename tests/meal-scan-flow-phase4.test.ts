/**
 * Phase 4.3 — §29 meal-scan flow machine.
 *
 * Transition-table tests for both pure reducers (the camera and
 * the AI are mocked by construction: the component translates
 * their outcomes into events, and the events are what is tested),
 * plus source guards that the modal dispatches through the
 * machine and keeps no legacy flag setters.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  INITIAL_MEAL_SCAN_STATE,
  cameraPermissionReducer,
  isSelectFamily,
  mealScanReducer,
  type MealScanState,
} from '@/lib/meal-scan-flow';

const S = (step: MealScanState['step'], extra: object = {}): MealScanState =>
  ({ step, ...extra }) as MealScanState;

describe('meal scan flow transitions', () => {
  it('camera: request → live → capturing → select; denied is its own state', () => {
    let st = mealScanReducer(INITIAL_MEAL_SCAN_STATE, { type: 'camera-request' });
    expect(st.step).toBe('cameraLive');
    st = mealScanReducer(st, { type: 'capture-start' });
    expect(st.step).toBe('capturing');
    st = mealScanReducer(st, { type: 'capture-done' });
    expect(st.step).toBe('select');

    let denied = mealScanReducer(INITIAL_MEAL_SCAN_STATE, { type: 'camera-request' });
    denied = mealScanReducer(denied, { type: 'camera-denied' });
    expect(denied.step).toBe('cameraDenied');
    // Retry from the denied panel re-enters the live state.
    expect(mealScanReducer(denied, { type: 'camera-request' }).step).toBe('cameraLive');
    expect(mealScanReducer(denied, { type: 'camera-closed' }).step).toBe('select');
  });

  it('analysis: select → analyzing → review{cloud}; failure lands in error{reason}', () => {
    let st = mealScanReducer(INITIAL_MEAL_SCAN_STATE, { type: 'analyze-start' });
    expect(st.step).toBe('analyzing');
    st = mealScanReducer(st, { type: 'analyze-succeeded', source: 'cloud' });
    expect(st).toEqual({ step: 'review', source: 'cloud' });

    let fail = mealScanReducer(INITIAL_MEAL_SCAN_STATE, { type: 'analyze-start' });
    fail = mealScanReducer(fail, { type: 'analyze-failed', reason: 'boom' });
    expect(fail).toEqual({ step: 'error', reason: 'boom' });
    // The error banner's offline escape hatch works from error.
    expect(mealScanReducer(fail, { type: 'offline-estimate' })).toEqual({
      step: 'review',
      source: 'offline',
    });
    expect(mealScanReducer(fail, { type: 'dismiss-error' }).step).toBe('select');
  });

  it('offline estimate enters review directly with its source; refinement re-sources review', () => {
    expect(mealScanReducer(INITIAL_MEAL_SCAN_STATE, { type: 'offline-estimate' })).toEqual({
      step: 'review',
      source: 'offline',
    });
    const review = S('review', { source: 'cloud' });
    expect(mealScanReducer(review, { type: 'analyze-succeeded', source: 'refined' })).toEqual({
      step: 'review',
      source: 'refined',
    });
  });

  it('illegal combinations are unrepresentable: stray events no-op', () => {
    const review = S('review', { source: 'cloud' });
    expect(mealScanReducer(review, { type: 'capture-start' })).toBe(review);
    expect(mealScanReducer(review, { type: 'camera-denied' })).toBe(review);
    expect(mealScanReducer(review, { type: 'analyze-failed', reason: 'x' })).toBe(review);
    const analyzing = S('analyzing');
    expect(mealScanReducer(analyzing, { type: 'camera-request' })).toBe(analyzing);
    expect(mealScanReducer(analyzing, { type: 'analyze-aborted' }).step).toBe('select');
  });

  it('reset returns to select from anywhere; select family covers the intake states', () => {
    expect(mealScanReducer(S('analyzing'), { type: 'reset' }).step).toBe('select');
    expect(mealScanReducer(S('review', { source: 'offline' }), { type: 'reset' }).step).toBe(
      'select'
    );
    for (const step of ['select', 'cameraLive', 'cameraDenied', 'capturing', 'error'] as const) {
      expect(isSelectFamily(S(step, step === 'error' ? { reason: 'r' } : {}))).toBe(true);
    }
    expect(isSelectFamily(S('analyzing'))).toBe(false);
    expect(isSelectFamily(S('review', { source: 'cloud' }))).toBe(false);
  });
});

describe('camera permission machine', () => {
  it('unknown → requesting → granted/denied; errors un-ask; unsupported is terminal-ish', () => {
    expect(cameraPermissionReducer('unknown', { type: 'request' })).toBe('requesting');
    expect(cameraPermissionReducer('requesting', { type: 'granted' })).toBe('granted');
    expect(cameraPermissionReducer('requesting', { type: 'denied' })).toBe('denied');
    expect(cameraPermissionReducer('requesting', { type: 'error' })).toBe('unknown');
    expect(cameraPermissionReducer('unknown', { type: 'unsupported' })).toBe('unsupported');
    // A stray grant with no request in flight changes nothing.
    expect(cameraPermissionReducer('unknown', { type: 'granted' })).toBe('unknown');
    // Asking again after a denial re-enters requesting.
    expect(cameraPermissionReducer('denied', { type: 'request' })).toBe('requesting');
  });
});

describe('modal wiring (source guards)', () => {
  const src = readFileSync('src/components/ScanMealModal.tsx', 'utf8');

  it('no legacy flow setters survive', () => {
    for (const legacy of [
      'setStep(',
      'setScanError(',
      'setCameraDenied(',
      'setIsLiveCameraActive(',
      'setIsCapturingFrame(',
    ]) {
      expect(src).not.toContain(legacy);
    }
  });

  it('every outcome dispatches through the machine, incl. the refined source', () => {
    for (const ev of [
      "'camera-request'",
      "'camera-denied'",
      "'capture-start'",
      "'capture-done'",
      "'capture-failed'",
      "'analyze-start'",
      "'analyze-aborted'",
      "'offline-estimate'",
      "'file-error'",
      "source: 'cloud'",
      "source: 'refined'",
    ]) {
      expect(src).toContain(ev);
    }
    expect(src).toContain('isSelectFamily(flow)');
    expect(src).toContain('scan.sourceOffline');
  });
});
