/**
 * UI/UX audit Phase 3 — Task 3.2 (P2-2): one name per feature.
 *
 *  - The Fuel screen's title is "Fuel" — the same word as its tab —
 *    in both languages; the "MEALS" title and the "NUTRITION & FUEL"
 *    kicker are gone. ("Meals" survives only as the history sub-tab.)
 *  - The plate calculator is "Plate Calculator" in its modal title,
 *    the workout menu, and the PRs page. The compact 'Plate Calc'
 *    card-footer button is the one deliberate short form left: the
 *    modal it opens carries the full name as its title.
 *  - The feature name is "Form Coach" everywhere it titles a surface;
 *    "Form Check" exists only as the Today quick-action label.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const enRec = en as Record<string, string>;
const hiRec = hi as Record<string, string>;

describe('P2-2 Fuel naming', () => {
  it('screen title matches the tab label in both languages', () => {
    expect(en['meals.title']).toBe('Fuel');
    expect(en['meals.title']).toBe(en['nav.fuel']);
    expect(hi['meals.title']).toBe(hi['nav.fuel']);
  });

  it('the NUTRITION & FUEL kicker is gone (key + usage)', () => {
    expect(enRec['meals.eyebrow']).toBeUndefined();
    expect(hiRec['meals.eyebrow']).toBeUndefined();
    expect(read('src/components/MealsPage.tsx')).not.toContain("t('meals.eyebrow')");
  });

  it('"Meals" survives only as the history sub-tab label', () => {
    expect(en['meals.tabMeals']).toBe('Meals');
  });
});

describe('P2-2 Plate Calculator naming', () => {
  it('modal title, workout menu and PRs title all use the full name', () => {
    expect(en['plates.title']).toBe('Plate Calculator');
    expect(en['workout.plateHelper']).toBe('Plate Calculator');
    expect(en['prs.plateCalculator']).toBe('Plate Calculator');
    expect(en['tools.plateTitle']).toBe('Plate Calculator');
    expect(en['workout.plateCalculator']).toBe('Plate Calculator');
  });

  it('Hindi agrees across the same surfaces', () => {
    const values = new Set([
      hi['plates.title'],
      hi['workout.plateHelper'],
      hi['prs.plateCalculator'],
      hi['tools.plateTitle'],
      hi['workout.plateCalculator'],
    ]);
    expect(values.size).toBe(1);
  });

  it('the one short form left is the compact PR-card button (full name is the modal title)', () => {
    expect(en['prs.plateCalc']).toBe('Plate Calc');
    expect(read('src/components/PlateCalculatorModal.tsx')).toContain("t('plates.title')");
  });
});

describe('P2-2 Form Coach naming', () => {
  it('the feature name is "Form Coach" with no brand-prefixed variant', () => {
    expect(en['tools.formCoachTitle']).toBe('Form Coach');
    expect(en['workout.formCoach']).toBe('Form Coach');
    expect(hi['tools.formCoachTitle']).toBe('फ़ॉर्म कोच');
  });

  it('no rendered surface hard-codes the old "ASCEND Form Coach" title', () => {
    expect(read('src/features/form-coach/components/FormCoachModal.tsx')).not.toContain('>ASCEND Form Coach<');
    expect(read('src/components/WorkoutPage.tsx')).not.toContain('>ASCEND Form Coach<');
  });

  it('"Form Check" exists only as the Today quick-action label', () => {
    expect(en['home.formCheck']).toBe('Form Check');
    const home = read('src/components/HomePage.tsx');
    expect(home).toContain("t('home.formCheck')");
  });
});
