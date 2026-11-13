/**
 * Phase 4.4 — §32 rep verdict: ONE field, one shared rule.
 *
 * - status is the only verdict field (isValid is gone; validity
 *   is derived via isValidRep);
 * - all three machines stamp it through repVerdict;
 * - the squat machine — the one that used to emit ONLY valid
 *   reps — now emits a 'failed' record when a closed attempt
 *   misses a measurable criterion;
 * - saved reports normalize at the storage read seam.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RepStateMachine,
  DEFAULT_SQUAT_CONFIG,
} from '@/features/form-coach/services/analysis/RepStateMachine';
import {
  isValidRep,
  normalizeFormRep,
  repVerdict,
  type FormRep,
} from '@/features/form-coach/models/form-session.types';
import {
  FORM_SESSIONS_STORAGE_KEY,
  readFormSessions,
} from '@/features/form-coach/repositories/form-session-storage';

describe('repVerdict — the shared rule', () => {
  it('criteria met → valid; not met → failed with the reason', () => {
    expect(repVerdict(true)).toEqual({ status: 'valid' });
    expect(repVerdict(false, 'Depth not reached')).toEqual({
      status: 'failed',
      invalidReason: 'Depth not reached',
    });
  });
});

describe('§32 squat machine emits failed records', () => {
  function machine() {
    return new RepStateMachine({ ...DEFAULT_SQUAT_CONFIG, minRepDurationMs: 500 });
  }

  it('a too-fast closed attempt emits a failed rep instead of vanishing', () => {
    const sm = machine();
    sm.update(165, 5, 0.95, 1000); // standing (anchors the rep start)
    sm.update(135, 15, 0.95, 1100); // descending
    sm.update(85, 30, 0.95, 1200); // bottom
    sm.update(105, 25, 0.95, 1300); // ascending
    const rep = sm.update(158, 8, 0.95, 1400); // closes at 400ms < 500ms
    expect(rep).not.toBeNull();
    expect(rep?.status).toBe('failed');
    expect(rep?.invalidReason).toBe('Rep too fast');
    expect(isValidRep(rep!)).toBe(false);
    expect(rep?.repNumber).toBe(1);
    expect(sm.getCompletedRepCount()).toBe(1);
  });

  it('attempt numbering counts valid and failed alike (deadlift/cycle convention)', () => {
    const sm = machine();
    // Rep 1: valid, 1300ms.
    sm.update(165, 5, 0.95, 1000);
    sm.update(135, 15, 0.95, 1400);
    sm.update(85, 30, 0.95, 1800);
    sm.update(105, 25, 0.95, 2000);
    const r1 = sm.update(158, 8, 0.95, 2300);
    expect(r1?.status).toBe('valid');
    expect(r1?.repNumber).toBe(1);
    // Rep 2: too fast.
    sm.update(135, 15, 0.95, 2400);
    sm.update(85, 30, 0.95, 2500);
    sm.update(105, 25, 0.95, 2550);
    const r2 = sm.update(158, 8, 0.95, 2600);
    expect(r2?.status).toBe('failed');
    expect(r2?.repNumber).toBe(2);
    expect(sm.getCompletedRepCount()).toBe(2);
  });
});

describe('§32 saved-report migration (normalizeFormRep + storage seam)', () => {
  const legacyRep = (over: object = {}) =>
    ({
      repNumber: 1,
      startTime: 0,
      endTime: 1000,
      durationSeconds: 1,
      descentDurationSeconds: 0.5,
      ascentDurationSeconds: 0.5,
      minKneeAngleDeg: 80,
      estimatedDepth: 'parallel',
      maxTorsoInclinationDeg: 10,
      trackingConfidence: 0.9,
      observations: [],
      ...over,
    }) as unknown as FormRep;

  it('derives status from the legacy boolean and drops it', () => {
    const a = normalizeFormRep(legacyRep({ isValid: true } as any));
    expect(a.status).toBe('valid');
    expect('isValid' in a).toBe(false);
    const b = normalizeFormRep(legacyRep({ isValid: false } as any));
    expect(b.status).toBe('failed');
  });

  it('a canonical rep passes through by reference; an existing status wins', () => {
    const canonical = legacyRep({ status: 'unverified' });
    expect(normalizeFormRep(canonical)).toBe(canonical);
    const both = normalizeFormRep(
      legacyRep({ status: 'unverified', isValid: false } as any),
    );
    expect(both.status).toBe('unverified');
    expect('isValid' in both).toBe(false);
  });

  it('readFormSessions normalizes every stored rep', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    (globalThis as any).window = globalThis;
    store.set(
      FORM_SESSIONS_STORAGE_KEY,
      JSON.stringify([
        { id: 's1', reps: [legacyRep({ isValid: true } as any), legacyRep({ isValid: false } as any)] },
      ]),
    );
    const sessions = readFormSessions();
    expect(sessions[0].reps.map((r) => r.status)).toEqual(['valid', 'failed']);
    expect(sessions[0].reps.every((r) => !('isValid' in r))).toBe(true);
  });
});
