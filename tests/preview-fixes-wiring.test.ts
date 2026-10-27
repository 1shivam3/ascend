import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Preview-fix B1b wiring pins (source-level, following the
 * follower-delete-guard-wiring precedent): the reset resurrection
 * was not a missing guard call — both reset paths already guard —
 * but late writes from the old leader after a follower takeover.
 * These pins keep the three countermeasures wired:
 *  1. the emergency-snapshot timer proves leadership at FIRE time
 *     (not just schedule time) before writing;
 *  2. persist writes suppress when another tab provably owns the
 *     leader record, even before the in-memory flag catches up;
 *  3. clearAllData re-claims leadership synchronously after the
 *     purge, so the old leader's tick cannot win the vacuum.
 */

function src(rel: string): string {
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}

describe('B1b: reset anti-resurrection wiring', () => {
  it('snapshot timer proves leadership at fire time', () => {
    const s = src('lib/store.ts');
    expect(s).toContain('if (guard && !guard.isProvenLeader()) return;');
  });

  it('persist writes suppress on a fresh other-owned record', () => {
    const s = src('lib/store.ts');
    expect(s).toContain('isOtherLeaderActive()');
  });

  it('clearAllData re-claims leadership after the purge', () => {
    const s = src('lib/store.ts');
    const at = s.indexOf('clearAllData: () => {');
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, at + 4000);
    expect(block).toContain('purgeLocalAppData();');
    expect(block.indexOf('takeOver()')).toBeGreaterThan(
      block.indexOf('purgeLocalAppData();'),
    );
  });

  it('guard exposes synchronous record proof', () => {
    const s = src('lib/tab-leader.ts');
    expect(s).toContain('isProvenLeader()');
    expect(s).toContain('isOtherLeaderActive()');
  });
});
