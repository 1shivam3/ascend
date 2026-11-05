/**
 * Item-4 (2026-11-05): 360px overflow fixes — layout only.
 *
 * Four rows were built as non-wrapping flex rows whose Hindi labels
 * (~2.4× the English) cannot fit a 360px screen:
 *  1. ActiveWorkout discard-confirm: 3 buttons in a max-w-sm modal
 *     (~100px each) vs the 26-char Hindi 'रोकें और ड्राफ़्ट सेव करें'
 *     → the row now stacks vertically.
 *  2. ActiveWorkout finish-modal footer: Resume / Save & finish
 *     (Hindi 24 chars) → the row wraps, buttons keep a 9rem floor.
 *  3. MealsPage ghee/oil chip row: heading + level chips → both the
 *     row and the chip group wrap.
 *  4. ActiveWorkout RPE pill: '@10' + the ~33-char Hindi effort
 *     label → the pill wraps its label instead of widening the row.
 *
 * Layout classes cannot be behavior-tested in the SSR harness, so
 * these are wiring pins (the repo's convention for such changes):
 * each asserts the wrap/stack utility is present on the exact row
 * and that the row's content/handlers did not change.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const aws = read('src/components/ActiveWorkoutScreen.tsx');
const meals = read('src/components/MealsPage.tsx');

/** The JSX region between two markers, for scoping class assertions. */
function region(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe('360px overflow — discard-confirm stacks', () => {
  const modal = region(aws, 'isDiscardConfirmOpen && (', 'Finish Workout Summary Modal');

  it('the 3-button row is a vertical stack, buttons unchanged', () => {
    expect(modal).toContain('<div className="flex flex-col gap-2 pt-2">');
    expect(modal).not.toContain('<div className="flex gap-2 pt-2">');
    expect(modal).toContain("{t('workout.keepTraining')}");
    expect(modal).toContain("{t('workout.pauseSaveDraft')}");
    expect(modal).toContain("{t('workout.discardShort')}");
    expect(modal).toContain('handlePauseWorkout()');
  });
});

describe('360px overflow — finish-modal footer wraps', () => {
  const footer = region(aws, 'workout.resume', '1-Tap RPE');

  it('the footer row wraps and both buttons keep a min width floor', () => {
    expect(aws).toContain('<div className="flex flex-wrap gap-2 pt-1">');
    expect(footer).toContain('btn-secondary flex-1 min-w-[9rem]');
    expect(footer).toContain('btn-primary flex-1 min-w-[9rem]');
    expect(footer).toContain('handleConfirmFinish');
  });
});

describe('360px overflow — RPE pill wraps its label', () => {
  const pill = region(aws, 'Beginner Mode Effort (RPE) Picker Button', 'Screen 12 Action Buttons');

  it('the pill is wrap-safe and capped at the row width', () => {
    expect(pill).toContain('inline-flex flex-wrap justify-center max-w-full');
    expect(pill).toContain('whitespace-normal text-center leading-snug');
    expect(pill).toContain("{t('workout.effortRpe')}");
  });
});

describe('360px overflow — ghee/oil chip row wraps', () => {
  const row = region(meals, 'Ghee/oil honesty prompt', 'Footer with Meal Totals');

  it('row and chip group both wrap; chips and heading unchanged', () => {
    expect(row).toContain('flex flex-wrap items-center justify-between gap-2');
    expect(row).toContain('<div className="flex flex-wrap justify-end gap-1">');
    expect(row).toContain("{t('meals.gheeOilHeading')}");
    expect(row).toContain('OIL_LEVELS.map');
    expect(row).toContain('handleOilChange(i, level.id)');
  });
});
