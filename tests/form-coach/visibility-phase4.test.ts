/**
 * Phase 4.4 — §33 shared visibility helper.
 *
 * The trailing-window rule used to exist as two identical
 * private copies (squat + deadlift analyzers). It is one shared
 * function now; these are its semantics, tested once.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  sustainedVisibilityOut,
  type VisibilitySample,
} from '@/features/form-coach/services/analysis/visibility';

describe('sustainedVisibilityOut', () => {
  it('a brief dip inside a visible window is not sustained', () => {
    const w: VisibilitySample[] = [];
    let out = false;
    for (let t = 0; t <= 1000; t += 100) {
      out = sustainedVisibilityOut(w, t !== 500, t);
    }
    expect(out).toBe(false);
  });

  it('a majority-bad window spanning ≥700ms is sustained', () => {
    const w: VisibilitySample[] = [];
    let out = false;
    for (let t = 0; t <= 800; t += 100) {
      out = sustainedVisibilityOut(w, false, t);
    }
    expect(out).toBe(true);
  });

  it('a short bad burst (<700ms span) is not yet sustained', () => {
    const w: VisibilitySample[] = [];
    let out = false;
    for (let t = 0; t <= 400; t += 100) {
      out = sustainedVisibilityOut(w, false, t);
    }
    expect(out).toBe(false);
  });

  it('both analyzers delegate to the shared helper (no private copies left)', () => {
    for (const f of ['SquatAnalyzer.ts', 'DeadliftAnalyzer.ts']) {
      const src = readFileSync(`src/features/form-coach/analyzers/${f}`, 'utf8');
      expect(src).toContain('sustainedVisibilityOut(window, ok, timestampMs)');
      expect(src).not.toContain('VISIBILITY_BAD_SHARE = 0.6');
    }
  });
});
