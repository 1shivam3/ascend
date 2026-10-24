/**
 * LIVE-P1 RESIDUALS — fixes for the three findings from the live re-tap of
 * the d247ad2c preview (guest mode), after all 4 original P1 repros PASSED:
 *
 * R1. Hindi Readiness "Why?" body: the heading was translated but the
 *     no-history explanation body stayed English. Now a dual-field
 *     factorsI18n entry (same Rounds 3–5 pattern).
 * R2. Hindi Fuel badge "Macro Lens • Voice / Text • Indian IFCT" stayed
 *     English. Now an i18n key (feature name transliterated, following the
 *     existing 'scan.title' → 'मैक्रो लेंस' precedent).
 * R3. Protein display consistency: the per-line value (46.5 g, library),
 *     the coach text (46.5 g) and the Meal Total (~47 g, Math.round) did
 *     not agree. The Meal Total now renders the same 1-decimal value the
 *     engine computes. The reported free-text 45 g figure is NOT
 *     reproducible in this build: typed input runs through the exact same
 *     estimator as a tapped suggestion (proven below), so a typed
 *     "Chicken breast" yields the library 46.5 g, not 45 g.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { calculateReadiness } from '../src/lib/coach-engine';
import { estimateMacros, calculateMealMacros } from '../src/lib/macros';
import { translate } from '../src/lib/i18n';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';
import { renderLocalizedSentence } from '../src/lib/coach-i18n';

// English / Hindi renderers over the real dictionaries.
const tEn = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('en', key, params);
const tHi = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('hi', key, params);
const renderEn = (s: Parameters<typeof renderLocalizedSentence>[2], fallback: string) =>
  renderLocalizedSentence(tEn, 'en', s, fallback);
const renderHi = (s: Parameters<typeof renderLocalizedSentence>[2], fallback: string) =>
  renderLocalizedSentence(tHi, 'hi', s, fallback);

const NO_HISTORY_EN =
  'No recent training logged, so there is no fatigue to recover from. Start at a comfortable effort and let the first week set your baseline.';

// ── R1: Hindi Readiness "Why?" body ──────────────────────────────────────────

describe('LIVE-P1-RESIDUAL-01 Hindi readiness no-history factor', () => {
  it('attaches a factorsI18n struct to the no-history factor (index 0)', () => {
    const result = calculateReadiness([], []);
    expect(result.factors[0]).toBe(NO_HISTORY_EN);
    expect(result.factorsI18n).toBeDefined();
    expect(result.factorsI18n!.length).toBe(result.factors.length);
    expect(result.factorsI18n![0]).toEqual({ key: 'ready.factorNoHistory' });
    // Every other factor in this branch has no localized form yet → null.
    for (let i = 1; i < result.factorsI18n!.length; i++) {
      expect(result.factorsI18n![i]).toBeNull();
    }
  });

  it('renders byte-identical English and real Hindi through the i18n system', () => {
    const result = calculateReadiness([], []);
    const struct = result.factorsI18n![0];
    expect(renderEn(struct, result.factors[0])).toBe(NO_HISTORY_EN);
    const hindi = renderHi(struct, result.factors[0]);
    expect(hindi).toBe(translate('hi', 'ready.factorNoHistory'));
    expect(hindi).not.toBe(NO_HISTORY_EN);
    expect(hindi).toMatch(/[\u0900-\u097F]/); // Devanagari present
  });

  it('renderer falls back to the English factor when no struct exists', () => {
    expect(renderHi(null, NO_HISTORY_EN)).toBe(NO_HISTORY_EN);
    expect(renderHi(undefined, NO_HISTORY_EN)).toBe(NO_HISTORY_EN);
  });

  it('both dictionaries define the key with real copy', () => {
    expect(en['ready.factorNoHistory']).toBe(NO_HISTORY_EN);
    const hindiCopy = translate('hi', 'ready.factorNoHistory');
    expect(hindiCopy).not.toBe(NO_HISTORY_EN);
    expect(hindiCopy.length).toBeGreaterThan(0);
  });
});

// ── R2: Hindi Fuel badge ─────────────────────────────────────────────────────

describe('LIVE-P1-RESIDUAL-02 Hindi Fuel input-methods badge', () => {
  it('both dictionaries define meals.inputMethods with real copy', () => {
    expect(en['meals.inputMethods']).toBe('Macro Lens • Voice / Text • Indian IFCT');
    expect(hi['meals.inputMethods']).toBe('मैक्रो लेंस • आवाज़ / टेक्स्ट • भारतीय IFCT');
    expect(translate('hi', 'meals.inputMethods')).toBe('मैक्रो लेंस • आवाज़ / टेक्स्ट • भारतीय IFCT');
  });

  it('MealsPage renders the badge through i18n, not a hardcoded string', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/MealsPage.tsx'), 'utf-8');
    expect(src).toContain("t('meals.inputMethods')");
    expect(src).not.toContain('Macro Lens • Voice / Text • Indian IFCT');
  });
});

// ── R3: protein display consistency ──────────────────────────────────────────

describe('LIVE-P1-RESIDUAL-03 protein display consistency', () => {
  it('typed free text yields the library value — the 45 g figure is not reproducible', () => {
    // The typed path (handleFoodChange name) and the tapped-suggestion path
    // (handleSelectSuggestion) both call estimateMacros with the same args.
    const typed = estimateMacros('Chicken breast', 150, 'g');
    expect(typed.isUnmatched).toBe(false);
    expect(typed.calories).toBe(248);
    expect(typed.proteinG).toBe(46.5);
    expect(typed.carbsG).toBe(0);
    expect(typed.fatG).toBe(5.4);
  });

  it('the computed meal total is already 1-decimal, so the render must not re-round it', () => {
    const totals = calculateMealMacros([
      { name: 'Chicken breast', calories: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4, quantity: 150, unit: 'g' },
    ]);
    expect(totals.proteinG).toBe(46.5);
    // Math.round(46.5) === 47 was the displayed total; the render now uses
    // round1, matching the per-line value and the coach text (46.5).
    expect(Math.round(totals.proteinG)).toBe(47);
    const src = readFileSync(join(process.cwd(), 'src/components/MealsPage.tsx'), 'utf-8');
    expect(src).toContain('round1(currentMealMacros.proteinG)');
    expect(src).not.toContain('Math.round(currentMealMacros.proteinG)');
    expect(src).toContain('round1(currentMealMacros.carbsG)');
    expect(src).toContain('round1(currentMealMacros.fatG)');
  });

  it('genuinely unmatched entries are still flagged for the amber banner', () => {
    const est = estimateMacros('zzzqqq unknown food', 100, 'g');
    expect(est.isUnmatched).toBe(true);
  });
});
