import { describe, expect, it } from 'vitest';
import { TEXT_SCALE_FONT_SIZE, applyTextScale } from '@/lib/text-scale';
import { estimatePlanDurationMin } from '@/lib/workout-engine';

/**
 * Persona-sim round 5 — Batch C (SIM-P1-08, SIM-P2-17). Component-level
 * changes (Settings control, plan-card render, library expansion,
 * scan badges, review steppers) are covered by tsc + the i18n parity
 * test; the pure logic below is unit-tested.
 */

describe('text scale (SIM-P1-08)', () => {
  it('maps scales to root font sizes, normal clearing any override', () => {
    expect(TEXT_SCALE_FONT_SIZE.normal).toBe('');
    expect(TEXT_SCALE_FONT_SIZE.large).toBe('112.5%');
    expect(TEXT_SCALE_FONT_SIZE.xlarge).toBe('125%');
  });

  it('applyTextScale never throws without a DOM (SSR / node test env)', () => {
    expect(() => applyTextScale('large')).not.toThrow();
    expect(() => applyTextScale(undefined)).not.toThrow();
  });
});

describe('plan duration estimate (SIM-P2-17)', () => {
  it('returns a range bracketing the point estimate', () => {
    const d = estimatePlanDurationMin({
      exercises: [
        { targetSets: 3 },
        { targetSets: 3 },
        { targetSets: 3 },
        { targetSets: 3 },
      ],
    });
    // 12 sets × 2.2 + 4 exercises × 2 = 34.4 min → ±25% range.
    expect(d.min).toBe(26);
    expect(d.max).toBe(43);
    expect(d.min).toBeLessThan(d.max);
  });

  it('defaults missing targetSets to 3 and never returns below 5 min', () => {
    const d = estimatePlanDurationMin({ exercises: [{}] });
    expect(d.min).toBeGreaterThanOrEqual(5);
    expect(d.max).toBeGreaterThanOrEqual(d.min);
  });
});
