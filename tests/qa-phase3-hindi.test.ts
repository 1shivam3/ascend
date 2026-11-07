/**
 * QA-hardening Phase 3 — Check 5: Hindi completeness (MECHANICAL).
 *
 * The owner's scope (2026-11-02): Hindi translation QUALITY is
 * deprioritized — this check verifies completeness only, never
 * whether a translation is good Hindi:
 *
 *  1. every key in the complete English dictionary (`en.ts` defines
 *     the StringKey set) exists in `hi.ts` with a non-empty value;
 *  2. `translate('hi', key)` with both dictionaries present returns
 *     the Hindi value for every key — never the English fallback and
 *     never the raw key (a missing hi entry silently degrading to
 *     English on a Hindi surface is the defect this check exists to
 *     catch);
 *  3. interpolation placeholders ({name}-style) match between en and
 *     hi for every key — a dropped placeholder silently loses the
 *     interpolated value at render time;
 *  4. no hi value is an echo of its own key (a placeholder row that
 *     was never actually filled in).
 */
import { describe, it, expect } from 'vitest';
import { en, type StringKey } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';
import { translate } from '../src/lib/i18n';

const EN_KEYS = Object.keys(en) as StringKey[];

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort();
}

describe('Phase 3 Check 5 — Hindi dictionary completeness (mechanical)', () => {
  it('the English dictionary is the non-trivial key set this check sweeps', () => {
    expect(EN_KEYS.length).toBeGreaterThan(3_000);
  });

  it('every en key exists in hi with a non-empty value', () => {
    const missing: string[] = [];
    const empty: string[] = [];
    for (const key of EN_KEYS) {
      const value = hi[key];
      if (value === undefined) missing.push(key);
      else if (value.trim().length === 0) empty.push(key);
    }
    expect(missing, `keys absent from hi.ts: ${missing.slice(0, 20).join(', ')}`).toEqual([]);
    expect(empty, `keys with empty hi values: ${empty.slice(0, 20).join(', ')}`).toEqual([]);
  });

  it('translate(hi) resolves the Hindi value for every key — no English fallback, no raw key', () => {
    const fellBack: string[] = [];
    for (const key of EN_KEYS) {
      const resolved = translate('hi', key, undefined, { en, hi });
      if (resolved !== hi[key]) fellBack.push(key);
    }
    expect(
      fellBack,
      `keys where translate(hi) did not return the hi value: ${fellBack.slice(0, 20).join(', ')}`,
    ).toEqual([]);
  });

  it('interpolation placeholders match between en and hi for every key', () => {
    // ONE documented exception class, pinned by
    // tests/hindi-localization-item4.test.ts: the four
    // weeklyReview.coachFormChecks* Hindi templates deliberately
    // drop {scope} — its value is an English "<exercise> sessions"
    // fragment generated in weekly-review.ts that cannot sit inside
    // the Hindi sentence, so the templates bake in "सत्र" instead.
    // Recorded as Phase 3 finding F3-5 (the trade-off loses the
    // exercise scope in Hindi; localizing the scope VALUE is the
    // real fix and is an owner decision). For these keys the sweep
    // still requires exact parity on every other placeholder.
    const SCOPE_DROPPED = new Set([
      'weeklyReview.coachFormChecksReps',
      'weeklyReview.coachFormChecksLockouts',
      'weeklyReview.coachFormChecksMixed',
      'weeklyReview.coachFormChecksNoReps',
    ]);
    const mismatched: string[] = [];
    for (const key of EN_KEYS) {
      const hiValue = hi[key];
      if (hiValue === undefined) continue; // covered by the completeness test
      const enPh = placeholders(en[key]);
      const hiPh = placeholders(hiValue);
      const expected = SCOPE_DROPPED.has(key) ? enPh.filter((p) => p !== 'scope') : enPh;
      if (expected.join('|') !== hiPh.join('|')) {
        mismatched.push(`${key} (en: ${enPh.join(',') || '—'}; hi: ${hiPh.join(',') || '—'})`);
      }
    }
    expect(
      mismatched,
      `placeholder mismatches: ${mismatched.slice(0, 20).join(' | ')}`,
    ).toEqual([]);
  });

  it('no hi value is an unfilled echo of its own key', () => {
    const echoes = EN_KEYS.filter((key) => hi[key] === (key as string));
    expect(echoes).toEqual([]);
  });
});
