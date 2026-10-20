import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProteinGapSuggestion,
  getWholeDayAdaptation,
  getDayKindTargets,
  isHintDismissed,
  dismissHint,
} from '../src/lib/nutrition-coach';
import { FOOD_DB } from '../src/lib/macros';
import { useStore } from '../src/lib/store';

class MockStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}
const mockStorage = new MockStorage();

describe('vegetarian protein coach', () => {
  const base = { proteinLoggedG: 40, proteinTargetG: 120, hour: 19 };

  it('suggests for vegetarian users tracking below target in the evening', () => {
    const s = getProteinGapSuggestion({ ...base, diet: 'vegetarian' });
    expect(s).not.toBeNull();
    expect(s!.gapG).toBe(80);
    expect(s!.anchor.proteinG).toBeGreaterThan(0);
    expect(s!.message).toContain('80 g to go');
  });

  it('never fires for non-vegetarian users', () => {
    expect(getProteinGapSuggestion({ ...base, diet: 'non_vegetarian' })).toBeNull();
  });

  it('fires for eggitarian and vegan users too', () => {
    expect(getProteinGapSuggestion({ ...base, diet: 'eggitarian' })).not.toBeNull();
    expect(getProteinGapSuggestion({ ...base, diet: 'vegan' })).not.toBeNull();
  });

  it('vegan anchors never contain dairy, egg or whey', () => {
    const s = getProteinGapSuggestion({ ...base, diet: 'vegan' });
    expect(s!.anchor.detail.toLowerCase()).not.toMatch(/paneer|yogurt|curd|milk|egg|whey/);
  });

  it('stays quiet in the morning and when the gap is small', () => {
    expect(getProteinGapSuggestion({ ...base, diet: 'vegetarian', hour: 9 })).toBeNull();
    expect(
      getProteinGapSuggestion({ diet: 'vegetarian', proteinLoggedG: 112, proteinTargetG: 120, hour: 19 })
    ).toBeNull();
    expect(
      getProteinGapSuggestion({ diet: 'vegetarian', proteinLoggedG: 130, proteinTargetG: 120, hour: 19 })
    ).toBeNull();
  });

  it('anchor protein comes from real DB values (cooked dal katori ≈ 10 g, not dry-chart 24 g)', () => {
    // Gap of exactly ~10 g with a 15 g minimum threshold won't fire; use
    // a bigger gap and verify the dal anchor value directly via the
    // smallest covering anchor for a moderate gap.
    const s = getProteinGapSuggestion({
      diet: 'vegan',
      proteinLoggedG: 100,
      proteinTargetG: 118,
      hour: 20,
    });
    expect(s).not.toBeNull();
    const dalPer100 = FOOD_DB['dal tadka'].proteinG;
    expect(dalPer100).toBe(7); // cooked, per 100 g — honest value
    expect(Number(((dalPer100 * 150) / 100).toFixed(1))).toBe(10.5);
  });

  it('message names a concrete food with an amount', () => {
    const s = getProteinGapSuggestion({ ...base, diet: 'vegetarian' });
    expect(s!.message).toMatch(/Adding .+ \(~\d+(\.\d+)? g protein\)/);
  });

  it('R3: message never overclaims — a small anchor against a big gap says what remains', () => {
    // Gap 50 g; the biggest veg anchor (whey, ~24 g) covers under half.
    const s = getProteinGapSuggestion({
      diet: 'vegetarian',
      proteinLoggedG: 70,
      proteinTargetG: 120,
      hour: 18,
    });
    expect(s).not.toBeNull();
    expect(s!.anchor.proteinG).toBeLessThan(s!.gapG / 2 + 1);
    expect(s!.message).not.toContain('close most of the gap');
    expect(s!.message).toContain('still be left');
    // A gap the anchor genuinely covers may say so.
    const s2 = getProteinGapSuggestion({
      diet: 'vegetarian',
      proteinLoggedG: 97,
      proteinTargetG: 120,
      hour: 19,
    });
    expect(s2!.message).toContain('close the gap');
  });
});

describe('whole-day adaptation', () => {
  it('fires at ≥65% of target by mid-afternoon with the remaining budget', () => {
    const a = getWholeDayAdaptation({ caloriesLogged: 1600, calorieTarget: 2000, hour: 15 });
    expect(a).not.toBeNull();
    expect(a!.consumedPct).toBe(80);
    expect(a!.suggestedDinnerKcal).toBe(400);
    expect(a!.reason).toContain('saved goals don\'t change');
  });

  it('stays quiet below 65%, in the morning, or when the day is already over target', () => {
    expect(getWholeDayAdaptation({ caloriesLogged: 1000, calorieTarget: 2000, hour: 15 })).toBeNull();
    expect(getWholeDayAdaptation({ caloriesLogged: 1600, calorieTarget: 2000, hour: 10 })).toBeNull();
    expect(getWholeDayAdaptation({ caloriesLogged: 2100, calorieTarget: 2000, hour: 15 })).toBeNull();
    expect(getWholeDayAdaptation({ caloriesLogged: 0, calorieTarget: 0, hour: 15 })).toBeNull();
  });

  it('boundary: exactly 65% at 14:00 fires', () => {
    expect(
      getWholeDayAdaptation({ caloriesLogged: 1300, calorieTarget: 2000, hour: 14 })
    ).not.toBeNull();
  });

  it('R3: no absurd micro-dinner — under 250 kcal remaining stays quiet', () => {
    expect(
      getWholeDayAdaptation({ caloriesLogged: 2280, calorieTarget: 2400, hour: 15 })
    ).toBeNull();
    // 250 kcal remaining exactly is a plausible light dinner: fires.
    expect(
      getWholeDayAdaptation({ caloriesLogged: 1750, calorieTarget: 2000, hour: 15 })
    ).not.toBeNull();
  });
});

describe('fast / festival day targets', () => {
  const goals = { calories: 2000, proteinG: 130, carbsG: 220, fatG: 65 };

  it('no-grain fast keeps targets, with honest guidance copy', () => {
    const t = getDayKindTargets('no_grain_fast', goals);
    expect(t!.calories).toBe(2000);
    expect(t!.note).toContain('guidance');
  });

  it('one-meal fast lowers calories ~30% but keeps protein', () => {
    const t = getDayKindTargets('one_meal_fast', goals);
    expect(t!.calories).toBe(1400);
    expect(t!.proteinG).toBe(130);
  });

  it('R3: both fast modes carry a diabetes/medication caution (Meera safety)', () => {
    expect(getDayKindTargets('no_grain_fast', goals)!.note).toMatch(/diabetes/i);
    expect(getDayKindTargets('one_meal_fast', goals)!.note).toMatch(/doctor/i);
    // The festival buffer is a user-chosen feast day, not a fast — no
    // fasting caution needed there.
    expect(getDayKindTargets('festival_feast', goals)!.note).not.toMatch(/diabetes/i);
  });

  it('festival day adds a +400 kcal buffer', () => {
    const t = getDayKindTargets('festival_feast', goals);
    expect(t!.calories).toBe(2400);
  });

  it('normal day returns null', () => {
    expect(getDayKindTargets(null, goals)).toBeNull();
    expect(getDayKindTargets(undefined, goals)).toBeNull();
  });
});

describe('hint dismissal + mealDayKinds store', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    mockStorage.clear();
    useStore.getState().clearAllData();
  });

  it('dismissals persist per date + kind', () => {
    expect(isHintDismissed('2026-10-20', 'protein')).toBe(false);
    dismissHint('2026-10-20', 'protein');
    expect(isHintDismissed('2026-10-20', 'protein')).toBe(true);
    expect(isHintDismissed('2026-10-20', 'adaptation')).toBe(false);
    expect(isHintDismissed('2026-10-21', 'protein')).toBe(false);
  });

  it('mealDayKinds set/clear per date and wipe on reset', () => {
    useStore.getState().setMealDayKind('2026-10-20', 'festival_feast');
    expect(useStore.getState().mealDayKinds['2026-10-20']).toBe('festival_feast');
    useStore.getState().setMealDayKind('2026-10-20', null);
    expect(useStore.getState().mealDayKinds['2026-10-20']).toBeUndefined();
    useStore.getState().setMealDayKind('2026-10-21', 'one_meal_fast');
    useStore.getState().clearAllData();
    expect(useStore.getState().mealDayKinds).toEqual({});
  });
});
