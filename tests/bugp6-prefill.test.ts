/**
 * Phase 6 verification: the set-weight prefill cascade.
 *
 * The brief's order is previous set → last session → plan target →
 * unset, never a fabricated number. The audit found one violation:
 * swapping a bodyweight exercise for a weighted one mid-session
 * (rename path and crowded-gym swap path) stamped a made-up
 * 50 kg / 115 lb onto every uncompleted set. Both sites are fixed;
 * this pin keeps the fabrication from coming back, and the P0-1
 * zero-weight suite (audit-phase1-zero-weight) covers the target
 * layer of the cascade.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const screen = readFileSync(
  join(process.cwd(), 'src/components/ActiveWorkoutScreen.tsx'),
  'utf8'
);

describe('Phase 6: no fabricated set-weight prefill', () => {
  it('ActiveWorkoutScreen contains no defaultWeight substitution', () => {
    expect(screen).not.toContain('defaultWeight');
    expect(screen).not.toMatch(/weight:\s*\(parseFloat\(String\(s\.weight\)\)/);
  });

  it('the BW→weighted direction is documented as unset at both swap sites', () => {
    const mentions = screen.match(/BW→weighted/g) ?? [];
    expect(mentions.length).toBeGreaterThanOrEqual(2);
  });
});
