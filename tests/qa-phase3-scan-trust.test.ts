/**
 * QA-hardening Phase 3 — Check 1 (meal-scan trust), unit level.
 *
 * Scripted re-verification of the audit Phase 3 (P0-4) contract,
 * independent of tests/scan-trust.test.ts (which was written with
 * the fix). The contract points re-asserted here are the ones the
 * Phase 3 brief names:
 *
 *  1. Displayed confidence is COMPUTED from checkable signals —
 *     a payload whose model claims 'high' everywhere is re-stamped
 *     to the computed levels; the model's word never survives.
 *  2. A user edit is surfaced in the signals (userVerified) but
 *     NEVER inflates the level — a Low item stays Low after an
 *     edit, a Medium item stays Medium.
 *  3. Meal confidence is the weakest item's level, and an
 *     inconsistent item set drops the meal to Low.
 *  4. The alias table maps toor/arhar/pigeon pea to toor dal —
 *     "pigeon pea" NEVER surfaces as Chana — and 'chana dal' keeps
 *     its own identity (it is not chickpea).
 *
 * The rendered surface (thumbnail while analyzing, Estimated badge,
 * total, computed label in the modal) is verified by the live drive
 * in qa/e2e/p3-scan-trust.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveFoodAlias,
  canonicalDisplayName,
  foodIdentityKey,
} from '../src/lib/food-aliases';
import { sanitizeScannedItems } from '../src/lib/scan-meal-sanitize';
import {
  computeItemConfidence,
  computeMealConfidence,
  stampScanConfidence,
  type ScanItemLike,
} from '../src/lib/scan-confidence';

const TOOR_DAL: ScanItemLike = {
  name: 'Toor Dal (Pigeon Pea)',
  estimatedGrams: 150,
  calories: 165,
  proteinG: 9,
  carbsG: 22,
  fatG: 4.5,
};

/** Physically impossible: 4,000 kcal in 10 g (40,000 kcal/100 g). */
const IMPOSSIBLE_ROTI: ScanItemLike = {
  name: 'Roti',
  estimatedGrams: 10,
  calories: 4000,
  proteinG: 7,
  carbsG: 48,
  fatG: 3,
};

describe('Phase 3 check 1: computed confidence, not the model\u2019s word', () => {
  it('route stamping overwrites a payload that claims high everywhere', () => {
    const lying = [
      { ...TOOR_DAL, confidence: 'high' as const },
      { ...IMPOSSIBLE_ROTI, confidence: 'high' as const },
    ];
    const stamped = stampScanConfidence(lying);
    expect(stamped.items[0].confidence).toBe('high'); // genuinely checkable
    expect(stamped.items[1].confidence).toBe('low'); // model said high; computed says low
    expect(stamped.mealConfidence).toBe('low');
  });

  it('an unknown food is Low even when the model is confident', () => {
    const unknown: ScanItemLike = {
      name: 'Zqx Blorple Stew',
      estimatedGrams: 200,
      calories: 300,
      proteinG: 10,
      carbsG: 30,
      fatG: 10,
    };
    const c = computeItemConfidence(unknown, { itemSetConsistent: true });
    expect(c.signals.dbMatch).toBe(false);
    expect(c.level).toBe('low');
  });

  it('edits surface as userVerified but never inflate the level', () => {
    const editedImpossible = computeMealConfidence([IMPOSSIBLE_ROTI], {
      editedIndices: new Set([0]),
    });
    expect(editedImpossible.perItem[0].signals.userVerified).toBe(true);
    expect(editedImpossible.perItem[0].level).toBe('low');
    expect(editedImpossible.level).toBe('low');

    const unedited = computeMealConfidence([TOOR_DAL, IMPOSSIBLE_ROTI]);
    const edited = computeMealConfidence([TOOR_DAL, IMPOSSIBLE_ROTI], {
      editedIndices: new Set([0, 1]),
    });
    expect(edited.level).toBe(unedited.level);
    expect(edited.perItem.map((p) => p.level)).toEqual(
      unedited.perItem.map((p) => p.level),
    );
  });

  it('meal level is the weakest item; an inconsistent set is Low', () => {
    expect(computeMealConfidence([TOOR_DAL]).level).toBe('high');
    expect(computeMealConfidence([TOOR_DAL, IMPOSSIBLE_ROTI]).level).toBe('low');
    // Duplicate food (alias-aware identity) breaks the set.
    const dup = computeMealConfidence([
      TOOR_DAL,
      { ...TOOR_DAL, name: 'Arhar Dal' },
    ]);
    expect(dup.itemSetConsistent).toBe(false);
    expect(dup.level).toBe('low');
  });
});

describe('Phase 3 check 1: pigeon pea is toor dal, never chana', () => {
  it('alias table: toor/arhar/pigeon pea → toor dal; chana = chickpea', () => {
    expect(resolveFoodAlias('pigeon pea')).toBe('toor dal');
    expect(resolveFoodAlias('Pigeon Peas')).toBe('toor dal');
    expect(resolveFoodAlias('arhar')).toBe('toor dal');
    expect(resolveFoodAlias('arhar dal')).toBe('toor dal');
    expect(resolveFoodAlias('toor')).toBe('toor dal');
    expect(resolveFoodAlias('chickpeas')).toBe('chana');
    expect(resolveFoodAlias('kabuli chana')).toBe('chana');
  });

  it("'chana dal' is not chickpea and is never aliased to chana", () => {
    expect(resolveFoodAlias('chana dal')).toBeNull();
    expect(foodIdentityKey('chana dal')).toBe('chana dal');
    expect(foodIdentityKey('pigeon pea')).toBe(foodIdentityKey('toor dal'));
    expect(foodIdentityKey('pigeon pea')).not.toBe(foodIdentityKey('chana'));
  });

  it('the audit mislabel sanitizes to the honest canonical name', () => {
    const [item] = sanitizeScannedItems([
      {
        name: 'Cooked Pigeon Peas (Chana)',
        quantity: '1 katori',
        estimatedGrams: 150,
        calories: 165,
        proteinG: 9,
        carbsG: 22,
        fatG: 4.5,
        confidence: 'high',
      },
    ]);
    expect(item.name).toBe('Toor Dal (Pigeon Pea)');
    expect(item.name).not.toMatch(/chana/i);
    expect(canonicalDisplayName('Cooked Pigeon Peas (Chana)')).toBe(
      'Toor Dal (Pigeon Pea)',
    );
  });
});
