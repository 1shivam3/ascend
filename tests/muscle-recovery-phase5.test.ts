/**
 * Phase 5 — §D3: recovery-status precedence, documented + pinned.
 *
 * 'fatigued' outranks 'recent' BY DESIGN: a muscle trained
 * yesterday with a heavy 48h volume is both, and the fatigue
 * warning is the signal that matters. This suite pins the
 * precedence (and the surrounding boundaries) so a future
 * "tidy-up" of recoveryStatusFor cannot silently flip it.
 */
import { describe, it, expect } from 'vitest';
import { FATIGUE_SETS_48H, recoveryStatusFor } from '@/lib/muscle-volume';

describe('recoveryStatusFor precedence', () => {
  it("'fatigued' outranks 'recent' when both apply", () => {
    // Trained yesterday (daysSince 1 ≤ 4 → 'recent' territory)
    // with a fatiguing 48h volume → 'fatigued' wins.
    expect(recoveryStatusFor(1, FATIGUE_SETS_48H)).toBe('fatigued');
    expect(recoveryStatusFor(0, FATIGUE_SETS_48H + 4)).toBe('fatigued');
    expect(recoveryStatusFor(4, FATIGUE_SETS_48H)).toBe('fatigued');
  });

  it('below the fatigue volume, recency decides', () => {
    expect(recoveryStatusFor(1, FATIGUE_SETS_48H - 1)).toBe('recent');
    expect(recoveryStatusFor(4, 0)).toBe('recent');
    expect(recoveryStatusFor(5, 0)).toBe('fresh');
    // Even an old session with heavy 48h volume is 'fatigued'
    // (the 48h window is what it is — volume is recent by
    // construction of the input).
    expect(recoveryStatusFor(9, FATIGUE_SETS_48H)).toBe('fatigued');
  });

  it("'never' is checked first and stands alone", () => {
    expect(recoveryStatusFor(null, 0)).toBe('never');
    expect(recoveryStatusFor(null, 99)).toBe('never');
  });
});
