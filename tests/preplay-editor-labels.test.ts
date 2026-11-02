import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Pre-play D-A11Y-1: every input/select in the meal-entry (MealsPage)
// and plan-builder (WorkoutPage) editors carries a programmatically
// associated label (htmlFor/id or aria-label). The audit found 14
// labels in MealsPage and 6 in WorkoutPage with no association at all.
// These pins assert each editor's main fields keep their association.
const read = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const meals = read('src/components/MealsPage.tsx');
const workout = read('src/components/WorkoutPage.tsx');

describe('pre-play editor label association (D-A11Y-1)', () => {
  it('meal builder: name, per-food name/quantity/unit and macro fields', () => {
    expect(meals).toContain('htmlFor="meal-builder-name"');
    expect(meals).toContain('id="meal-builder-name"');
    expect(meals).toContain('htmlFor={`food-${i}-name`}');
    expect(meals).toContain('id={`food-${i}-name`}');
    expect(meals).toContain("aria-label={t('meals.qtyPlaceholder')}");
    expect(meals).toContain("aria-label={t('meals.unit')}");
    for (const f of ['calories', 'protein', 'carbs', 'fat']) {
      expect(meals).toContain(`htmlFor={\`food-\${i}-${f}\`}`);
      expect(meals).toContain(`id={\`food-\${i}-${f}\`}`);
    }
  });

  it('daily-targets editor: all four goal inputs', () => {
    for (const f of ['calories', 'protein', 'carbs', 'fat']) {
      expect(meals).toContain(`htmlFor="meal-goal-${f}"`);
      expect(meals).toContain(`id="meal-goal-${f}"`);
    }
  });

  it('pinned-food editor: name, quantity, unit and macro inputs', () => {
    for (const f of ['name', 'quantity', 'unit', 'calories', 'protein', 'carbs', 'fat']) {
      expect(meals).toContain(`htmlFor="pinned-food-${f}"`);
      expect(meals).toContain(`id="pinned-food-${f}"`);
    }
  });

  it('plan builder: plan name and per-exercise fields', () => {
    expect(workout).toContain('htmlFor="plan-builder-name"');
    expect(workout).toContain('id="plan-builder-name"');
    expect(workout).toContain('aria-label={`Exercise ${i + 1} name`}');
    for (const f of ['sets', 'reps', 'weight', 'rpe', 'notes']) {
      expect(workout).toContain(`htmlFor={\`plan-ex-\${i}-${f}\`}`);
      expect(workout).toContain(`id={\`plan-ex-\${i}-${f}\`}`);
    }
    expect(workout).toContain('aria-label="Weight unit"');
  });
});

describe('pre-play meal-add honesty (D-UX-7)', () => {
  it('match state resolves on name entry, before any quantity', () => {
    // The name-change branch refreshes isUnmatched/isApproximateMatch
    // even when quantity is unset, and the banner renders outside the
    // quantity-gated branch.
    expect(meals).toContain('Pre-play D-UX-7: resolve the match state');
    const bannerIdx = meals.indexOf("(food.isUnmatched || food.isApproximateMatch) && (");
    const qtyGateIdx = meals.indexOf('{!isQtySet ? (');
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(qtyGateIdx).toBeGreaterThan(-1);
    expect(bannerIdx).toBeLessThan(qtyGateIdx);
  });

  it('saving an all-zero entry is disabled with a hint', () => {
    expect(meals).toContain('meals.zeroNutritionHint');
    expect(meals).toContain('|| !!zeroFood}');
    const en = read('src/lib/i18n/en.ts');
    const hi = read('src/lib/i18n/hi.ts');
    expect(en).toContain("'meals.zeroNutritionHint'");
    expect(hi).toContain("'meals.zeroNutritionHint'");
  });
});
