/**
 * Slop-audit next batch — WS2 (retention truth), WS4 (true-vector
 * icon), WS5 (exercise instructions). WS1 has its own file
 * (tests/food-atwater-sweep.test.ts); WS3 extended the F-07 legal test.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXERCISE_LIBRARY } from '../src/lib/exercise-library';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('WS2: deletion/retention wording matches the implementation', () => {
  // The delete route erases ASCEND's own tables + auth user
  // synchronously; AI provider logs persist up to 30 days (Privacy §2);
  // manual rights requests are answered within 30 days (Privacy §8).
  // No surface may promise 0-day erasure or 24-hour manual handling.
  it('README carries no zero-retention guarantee', () => {
    const readme = read('README.md');
    expect(readme).not.toContain('Zero Retention Guarantee');
    expect(readme).not.toContain('0-day purging');
    expect(readme).toContain('within 30 days');
    expect(readme).toContain('up to 30 days');
  });

  it('delete page strings use the implemented truth in both languages', () => {
    for (const dict of [en, hi]) {
      expect(dict['del.manualHelpB']).not.toContain('24');
      expect(dict['del.policyBody']).not.toContain('0 days retention');
      expect(dict['del.policyBody']).not.toContain('zero-retention');
    }
    expect(en['del.manualHelpB']).toContain('30 days');
    expect(en['del.policyBody']).toContain('up to 30 days');
    expect(en['del.policyBody']).toContain('within 30 days');
  });

  it('privacy page carries no 0-day erasure claim', () => {
    const src = read('src/app/privacy/page.tsx');
    expect(src).not.toContain('0-day');
    expect(src).toContain('up to 30 days');
  });

  it('delete-account portal comment discloses the real retention bound', () => {
    const src = read('src/app/delete-account/page.tsx');
    expect(src).not.toContain('0 days retention');
    expect(src).toContain('up to 30 days');
  });
});

describe('WS4: icon.svg is a genuine vector', () => {
  it('contains no embedded raster and stays small', () => {
    const svg = read('public/icon.svg');
    expect(svg).not.toContain('data:image');
    expect(svg).not.toContain('<image');
    expect(svg).toContain('#FF6B1F');
    expect(Buffer.byteLength(svg, 'utf8')).toBeLessThan(4096);
  });
});

describe('WS5: every exercise carries instructions in the house format', () => {
  // The format of the original 20: exactly 3 steps — setup, execution,
  // finish/cue — each a full sentence (shortest existing step: 43
  // chars), mirrored by a 3-step Hindi howToHi.
  it('all 104 exercises have 3-step howTo and howToHi', () => {
    expect(EXERCISE_LIBRARY.length).toBe(104);
    for (const e of EXERCISE_LIBRARY) {
      expect(e.howTo, e.id).toBeDefined();
      expect(e.howTo!.length, e.id).toBe(3);
      expect(e.howToHi, e.id).toBeDefined();
      expect(e.howToHi!.length, e.id).toBe(3);
      for (const step of e.howTo!) {
        expect(step.length, `${e.id}: ${step}`).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('instruction copy stays plain: no marketing filler, no result promises', () => {
    const banned = [
      'unlock', 'supercharge', 'empower', 'synergy', 'biohack',
      'torch', 'melt fat', 'blast fat', 'secret', 'guarantee',
      'build muscle fast', 'get ripped', 'burn fat fast',
    ];
    for (const e of EXERCISE_LIBRARY) {
      for (const step of e.howTo ?? []) {
        const lower = step.toLowerCase();
        for (const word of banned) {
          expect(lower, `${e.id}: ${step}`).not.toContain(word);
        }
      }
    }
  });
});
