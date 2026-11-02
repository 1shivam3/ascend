import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_BODYWEIGHT_KG } from '../src/lib/defaults';

/**
 * Slop-tail Workstream C: the missing-profile bodyweight fallback was
 * split between 75 kg (25+ sites) and 70 kg (ProfileView), so the same
 * user was a different weight on different screens. All fallbacks now
 * read DEFAULT_BODYWEIGHT_KG. This pin fails if a numeric literal
 * fallback creeps back in on any bodyweight line.
 *
 * Deliberately NOT flagged: concrete seeded profile values (e.g. the
 * guest-profile seed in store.ts carries an explicit bodyweightKg: 70
 * starting profile the user can edit — that is data, not a fallback).
 */
describe('bodyweight fallback is unified on DEFAULT_BODYWEIGHT_KG', () => {
  it('the canonical value is the historical majority default, 75 kg', () => {
    expect(DEFAULT_BODYWEIGHT_KG).toBe(75);
  });

  it('no numeric bodyweight fallback literal remains anywhere in src', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          if (full.endsWith(join('lib', 'defaults.ts'))) continue;
          const lines = readFileSync(full, 'utf8').split('\n');
          lines.forEach((line, i) => {
            if (!/bodyweight/i.test(line)) return;
            if (/(\|\||\?\?)\s*(70|75)\b/.test(line)) offenders.push(`${full}:${i + 1}`);
            if (/bodyweightKg\s*=\s*(70|75)\b/.test(line)) offenders.push(`${full}:${i + 1}`);
            if (/bodyweight\w*\s*\?\s*[^:]+:\s*(70|75)\s*[;)]/.test(line)) offenders.push(`${full}:${i + 1}`);
          });
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
