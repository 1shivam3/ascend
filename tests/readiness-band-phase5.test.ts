/**
 * Phase 5 — §D1: the readiness band thresholds exist ONCE.
 *
 * Phase 0 found them written twice in coach-engine.ts (a
 * bandFor helper for the no-history branch, an inlined copy
 * for the history branch). They are now the single exported
 * readinessBandForScore; this suite pins the boundary table
 * and guards the source against a second copy creeping back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateReadiness, readinessBandForScore } from '@/lib/coach-engine';

describe('readinessBandForScore — the one threshold table', () => {
  it('pins every boundary', () => {
    expect(readinessBandForScore(100)).toBe('primed');
    expect(readinessBandForScore(80)).toBe('primed');
    expect(readinessBandForScore(79)).toBe('ready');
    expect(readinessBandForScore(60)).toBe('ready');
    expect(readinessBandForScore(59)).toBe('caution');
    expect(readinessBandForScore(40)).toBe('caution');
    expect(readinessBandForScore(39)).toBe('rest');
    expect(readinessBandForScore(1)).toBe('rest');
  });

  it('both calculateReadiness branches agree with the table', () => {
    // No-history branch: score is clamped to ≤ 79 by design, so
    // the reachable bands are ready/caution/rest — and 'primed'
    // is intentionally unreachable without history (§D1 note).
    const noHistory = calculateReadiness([], [], undefined);
    expect(noHistory.score).toBeLessThanOrEqual(79);
    expect(noHistory.band).toBe(readinessBandForScore(noHistory.score));
    expect(noHistory.band).not.toBe('primed');
  });

  it('divergence guard: the threshold literal appears exactly once in the source', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/coach-engine.ts'), 'utf8');
    const thresholdSites = src.match(/>=\s*80\s*\?/g) ?? [];
    expect(thresholdSites).toHaveLength(1);
    // And no inlined if-chain reimplementation survives.
    expect(src).not.toMatch(/if \(score >= 80\) band = 'primed'/);
  });
});
