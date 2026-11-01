/**
 * Final-cert J3.1 (P3): a raw float artifact (5.400000095367432) was
 * visible in the meal form's fat rendering while the rounded label
 * showed 5.4. Every macro-gram rendering in the meal add/edit surfaces
 * now goes through the shared round1 helper (1 decimal, the same
 * helper the MealsPage editable fields already used). round1 is the
 * shared/extractable formatting helper, so it is unit-tested directly
 * plus source pins on the bindings that leaked the raw value.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { round1 } from '../src/lib/formatters';

describe('final-cert J3.1: round1 kills float artifacts', () => {
  it('the exact browser-observed artifact rounds to the label value', () => {
    expect(round1(5.400000095367432)).toBe(5.4);
    expect(String(round1(5.400000095367432))).toBe('5.4');
  });

  it('ordinary gram values keep 1-decimal rendering', () => {
    expect(round1(46.5)).toBe(46.5);
    expect(round1(0)).toBe(0);
    expect(round1(3.6499999)).toBe(3.6);
  });
});

describe('final-cert J3.1: meal form bindings use round1', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('MealsPage macro summary line in the add/edit form', () => {
    const src = read('src/components/MealsPage.tsx');
    expect(src).toContain('{round1(food.fatG)}g');
    expect(src).not.toContain("F:{isExactFoodItem(food) ? '' : '~'}{food.fatG}g");
  });

  it('ScanMealModal edit inputs and macro label', () => {
    const src = read('src/components/ScanMealModal.tsx');
    expect(src).toContain('value={round1(editFat)}');
    expect(src).toContain('value={round1(editProtein)}');
    expect(src).toContain('value={round1(editCarbs)}');
    expect(src).toContain('F: {round1(adjItem.fatG)}g');
    expect(src).not.toContain('value={editFat}');
  });

  it('BarcodeScannerModal macro tiles', () => {
    const src = read('src/components/BarcodeScannerModal.tsx');
    expect(src).toContain('{round1(currentFoodItem.fatG)}g');
    expect(src).not.toContain('{currentFoodItem.fatG}g');
  });
});
