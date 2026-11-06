/**
 * UI/UX audit Phase 3 — Task 3.3 (P0-4): meal scan trust.
 *
 * Two guarantees:
 *  1. Indian food aliases resolve to ONE canonical item — pigeon pea
 *     is toor/arhar dal and NEVER chana; chana is chickpea; 'chana
 *     dal' (split Bengal gram) stays its own entry; roti/chapati/
 *     phulka are one family. The "Cooked Pigeon Peas (Chana)"
 *     mislabel is fixed at the post-processing layer.
 *  2. Displayed confidence is computed from checkable signals (DB
 *     match, portion plausibility, macro consistency, item-set
 *     consistency, user edits) — the model's self-reported
 *     confidence is discarded by the route and never rendered by
 *     the modal.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { estimateMacros } from '../src/lib/macros';
import {
  resolveFoodAlias,
  foodIdentityKey,
  canonicalDisplayName,
} from '../src/lib/food-aliases';
import { sanitizeScannedItems } from '../src/lib/scan-meal-sanitize';
import {
  computeItemConfidence,
  computeMealConfidence,
  stampScanConfidence,
  type ScanItemLike,
} from '../src/lib/scan-confidence';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('P0-4 aliases: pigeon pea is toor, chana is chickpea', () => {
  it('pigeon pea resolves to toor dal values, never chana values', () => {
    const peas = estimateMacros('Pigeon Peas', 150, 'g');
    expect(peas.isUnmatched).toBe(false);
    expect(peas.calories).toBe(165); // toor dal: 110 kcal/100 g
    const chana = estimateMacros('Chana', 150, 'g');
    expect(chana.calories).toBe(246); // chickpea: 164 kcal/100 g
    expect(peas.calories).not.toBe(chana.calories);
  });

  it('the exact audit string "Cooked Pigeon Peas (Chana)" matches toor dal', () => {
    const r = estimateMacros('Cooked Pigeon Peas (Chana)', 150, 'g');
    expect(r.isUnmatched).toBe(false);
    expect(r.calories).toBe(165);
  });

  it('alias table: arhar/toor/red gram → toor dal; kabuli chana → chana', () => {
    expect(resolveFoodAlias('Arhar Dal')).toBe('toor dal');
    expect(resolveFoodAlias('toor')).toBe('toor dal');
    expect(resolveFoodAlias('Red Gram')).toBe('toor dal');
    expect(resolveFoodAlias('Kabuli Chana')).toBe('chana');
    expect(resolveFoodAlias('Chickpeas')).toBe('chana');
    expect(estimateMacros('Arhar Dal', 180, 'g').calories).toBe(198);
    expect(estimateMacros('Kabuli Chana', 100, 'g').calories).toBe(164);
  });

  it('chana dal is NOT chickpea — it keeps its own entry', () => {
    expect(resolveFoodAlias('Chana Dal')).toBeNull();
    expect(estimateMacros('Chana Dal', 100, 'g').calories).toBe(130);
    expect(estimateMacros('Chickpeas', 100, 'g').calories).toBe(164);
    expect(foodIdentityKey('Chana Dal')).toBe('chana dal');
    expect(foodIdentityKey('Chana Dal')).not.toBe(foodIdentityKey('Chickpeas'));
  });

  it('chana and chickpea share one identity; pigeon pea shares toor dal identity', () => {
    expect(foodIdentityKey('Chickpeas')).toBe(foodIdentityKey('Chana'));
    expect(foodIdentityKey('Cooked Pigeon Peas (Chana)')).toBe('toor dal');
  });

  it('roti / chapati / phulka are one family with equal treatment', () => {
    for (const name of ['Roti', 'Chapati', 'Phulka']) {
      const r = estimateMacros(name, 1, 'piece');
      expect(r.isUnmatched).toBe(false);
      expect(r.calories).toBe(80); // household piece weight, same for the family
    }
    expect(foodIdentityKey('Chapati')).toBe('roti');
    expect(foodIdentityKey('Phulka')).toBe('roti');
  });

  it('yellow dal stays its own first-class entry', () => {
    expect(estimateMacros('Yellow Dal', 100, 'g').calories).toBe(110);
  });

  it('sanitize rewrites the mislabel to the canonical display name', () => {
    const [item] = sanitizeScannedItems([
      { name: 'Cooked Pigeon Peas (Chana)', calories: 200, proteinG: 10, carbsG: 30, fatG: 3, estimatedGrams: 180 },
    ]);
    expect(item.name).toBe('Toor Dal (Pigeon Pea)');
    expect(canonicalDisplayName('Cooked Pigeon Peas (Chana)')).toBe('Toor Dal (Pigeon Pea)');
  });

  it('sanitize leaves non-alias names untouched', () => {
    const [item] = sanitizeScannedItems([
      { name: 'Grilled Chicken Breast', calories: 248, proteinG: 46, carbsG: 0, fatG: 5.4, estimatedGrams: 150 },
    ]);
    expect(item.name).toBe('Grilled Chicken Breast');
    expect(canonicalDisplayName('Grilled Chicken Breast')).toBeNull();
  });
});

const chicken: ScanItemLike = {
  name: 'Chicken Breast',
  estimatedGrams: 150,
  calories: 248,
  proteinG: 46,
  carbsG: 0,
  fatG: 5.4,
};
const creatine: ScanItemLike = {
  name: 'Creatine Monohydrate',
  estimatedGrams: 5,
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
};
const unknown: ScanItemLike = {
  name: 'Zqxwv Platter',
  estimatedGrams: 200,
  calories: 400,
  proteinG: 20,
  carbsG: 40,
  fatG: 20,
};

describe('P0-4 computed confidence', () => {
  it('High: DB-matched, plausible, consistent single item', () => {
    const meal = computeMealConfidence([chicken]);
    expect(meal.level).toBe('high');
    expect(meal.perItem[0].signals).toMatchObject({
      dbMatch: true,
      dbApproximate: false,
      portionPlausible: true,
      numbersConsistent: true,
      itemSetConsistent: true,
    });
  });

  it('High: a correctly read creatine tub (0 kcal DB entry)', () => {
    expect(computeMealConfidence([creatine]).level).toBe('high');
  });

  it('Low: food unknown to the database', () => {
    const c = computeItemConfidence(unknown, { itemSetConsistent: true });
    expect(c.level).toBe('low');
    expect(c.signals.dbMatch).toBe(false);
  });

  it('Low: absurd portion (5000 g) even for a known food', () => {
    const big: ScanItemLike = { ...chicken, estimatedGrams: 5000, calories: 8250, proteinG: 1550, fatG: 180 };
    const c = computeItemConfidence(big, { itemSetConsistent: true });
    expect(c.level).toBe('low');
    expect(c.signals.portionPlausible).toBe(false);
  });

  it('Low: physically impossible energy density', () => {
    const dense: ScanItemLike = { ...chicken, estimatedGrams: 100, calories: 2000 };
    expect(computeItemConfidence(dense, { itemSetConsistent: true }).level).toBe('low');
  });

  it('Medium: macros that disagree with the stated calories (Atwater drift)', () => {
    const off: ScanItemLike = { name: 'Chicken Breast', estimatedGrams: 150, calories: 600, proteinG: 10, carbsG: 10, fatG: 10 };
    const c = computeItemConfidence(off, { itemSetConsistent: true });
    expect(c.level).toBe('medium');
    expect(c.signals.numbersConsistent).toBe(false);
    expect(c.signals.dbMatch).toBe(true);
  });

  it('Medium: word-overlap DB match can never be High', () => {
    const fuzzy: ScanItemLike = { name: 'Zqxwv Fruit', estimatedGrams: 100, calories: 60, proteinG: 1, carbsG: 14, fatG: 0.2 };
    const c = computeItemConfidence(fuzzy, { itemSetConsistent: true });
    expect(c.signals.dbMatch).toBe(true);
    expect(c.signals.dbApproximate).toBe(true);
    expect(c.level).toBe('medium');
  });

  it('High gating: duplicate foods break the item set — items cap at Medium, meal is Low', () => {
    const roti: ScanItemLike = { name: 'Roti', estimatedGrams: 40, calories: 106, proteinG: 3.2, carbsG: 22, fatG: 0.6 };
    const meal = computeMealConfidence([roti, { ...roti, name: 'Chapati' }]);
    expect(meal.itemSetConsistent).toBe(false);
    expect(meal.perItem[0].level).toBe('medium');
    expect(meal.level).toBe('low');
  });

  it('item-set: more than 5 items is inconsistent', () => {
    const items: ScanItemLike[] = [
      { name: 'Roti', estimatedGrams: 40, calories: 106, proteinG: 3.2, carbsG: 22, fatG: 0.6 },
      { name: 'Dal', estimatedGrams: 180, calories: 209, proteinG: 16.2, carbsG: 36, fatG: 0.7 },
      { name: 'Chana', estimatedGrams: 100, calories: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6 },
      { name: 'Sambar', estimatedGrams: 100, calories: 65, proteinG: 3, carbsG: 10, fatG: 1.5 },
      { name: 'Toor Dal', estimatedGrams: 180, calories: 198, proteinG: 12.6, carbsG: 32.4, fatG: 4.5 },
      { name: 'Masoor Dal', estimatedGrams: 100, calories: 115, proteinG: 7.5, carbsG: 17, fatG: 2 },
    ];
    const meal = computeMealConfidence(items);
    expect(meal.itemSetConsistent).toBe(false);
    expect(meal.level).toBe('low');
  });

  it('item-set: a bare ghee item the user did not flag reads as deconstruction', () => {
    const dal: ScanItemLike = { name: 'Dal', estimatedGrams: 180, calories: 209, proteinG: 16.2, carbsG: 36, fatG: 0.7 };
    const ghee: ScanItemLike = { name: 'Ghee', estimatedGrams: 10, calories: 90, proteinG: 0, carbsG: 0, fatG: 10 };
    expect(computeMealConfidence([dal, ghee]).level).toBe('low');
    const flagged = computeMealConfidence([dal, ghee], { hiddenIngredients: ['+ Extra Ghee / Oil'] });
    expect(flagged.itemSetConsistent).toBe(true);
    expect(flagged.level).toBe('high');
  });

  it('meal level is the weakest item level', () => {
    const fuzzy: ScanItemLike = { name: 'Zqxwv Fruit', estimatedGrams: 100, calories: 60, proteinG: 1, carbsG: 14, fatG: 0.2 };
    expect(computeMealConfidence([chicken, fuzzy]).level).toBe('medium');
    expect(computeMealConfidence([chicken, unknown]).level).toBe('low');
    expect(computeMealConfidence([]).level).toBe('low');
  });

  it('signal (d): a user edit is surfaced but never inflates the level', () => {
    const edited = computeItemConfidence(unknown, { itemSetConsistent: true, userVerified: true });
    expect(edited.signals.userVerified).toBe(true);
    expect(edited.level).toBe('low');
    const meal = computeMealConfidence([chicken], { editedIndices: new Set([0]) });
    expect(meal.perItem[0].signals.userVerified).toBe(true);
    expect(meal.level).toBe('high');
  });

  it('route stamping overwrites model self-reported confidence', () => {
    const stamped = stampScanConfidence([
      { ...chicken, confidence: 'low' as const },
      { ...unknown, confidence: 'high' as const },
    ]);
    expect(stamped.items[0].confidence).toBe('high');
    expect(stamped.items[1].confidence).toBe('low');
    expect(stamped.mealConfidence).toBe('low');
  });
});

describe('P0-4 wiring: self-reported confidence never reaches the UI', () => {
  it('route stamps computed confidence and ignores parsed.confidence', () => {
    const route = read('src/app/api/ai/scan-meal/route.ts');
    expect(route).toContain('stampScanConfidence');
    expect(route).not.toContain('parsed.confidence');
    expect(route).toContain('Toor Dal'); // canonical-name prompt rule
  });

  it('modal renders only computed confidence', () => {
    const modal = read('src/components/ScanMealModal.tsx');
    expect(modal).toContain('computeMealConfidence');
    expect(modal).not.toContain('item.confidence ===');
    expect(modal).not.toContain('analysis.confidence ===');
  });

  it('analyzing step shows the photo thumbnail and an elapsed-time line', () => {
    const modal = read('src/components/ScanMealModal.tsx');
    expect(modal).toContain("t('scan.elapsed'");
    expect(modal).toContain('scanElapsedSec');
    // Cancel Scan + Instant Offline Estimate are kept.
    expect(modal).toContain("t('scan.cancelScan')");
    expect(modal).toContain("t('scan.instantOffline')");
  });

  it('review step pins the summary (Estimated badge + total) outside the scroll region', () => {
    const modal = read('src/components/ScanMealModal.tsx');
    expect(modal).toContain('overflow-y-auto min-h-0');
    expect(modal).toContain("t('scan.estimatedBadge')");
  });
});
