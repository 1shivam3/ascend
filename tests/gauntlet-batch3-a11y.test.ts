/**
 * Gauntlet batch-3 (UX/a11y) fixes: A11Y-04, A11Y-07, A11Y-09,
 * A11Y-10, A11Y-11, A11Y-12, A11Y-16, UX-13, UX-15, UX-19, UX-20,
 * UX-22. Mostly source pins + the contrast math, following the
 * repo's existing source-scan test pattern.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { nextTabIndex } from '../src/lib/tab-keyboard';

const readSrc = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

function* walkTsx(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTsx(p);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) yield p;
  }
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe('A11Y-04: replacement text colours meet AA (4.5:1) on their surfaces', () => {
  const pairs: Array<[string, string, string]> = [
    ['#C7351B', '#F3F0E7', 'accent-text (light) on chalk'],
    ['#FF7D66', '#171916', 'accent-text (dark) on graphite'],
    ['#5E615A', '#F3F0E7', 'sage text (light) on chalk'],
    ['#A5A096', '#212420', 'sage text (dark) on dark card'],
    ['#C2410C', '#F3F0E7', 'matrix workout label (light)'],
    ['#0369A1', '#F3F0E7', 'matrix water label (light)'],
    ['#92400E', '#F3F0E7', 'matrix creatine label (light)'],
    ['#166534', '#F3F0E7', 'matrix protein label (light)'],
  ];
  it.each(pairs)('%s on %s (%s) >= 4.5', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the failing literals are gone from components', () => {
    const srcRoot = path.resolve(__dirname, '../src/components');
    for (const file of walkTsx(srcRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, file).not.toContain('text-[#858076]');
    }
  });

  it('globals typography + badge classes carry the fixed colours', () => {
    const css = readSrc('src/app/globals.css');
    expect(css).toContain('text-[#5E615A] dark:text-[#A5A096]');
    expect(css).toContain('.matrix-row-label-workout { color: #C2410C; }');
  });
});

describe('A11Y-07: feedback form fields are labelled', () => {
  const src = readSrc('src/components/FeedbackModal.tsx');
  it('title/message/email have ids and matching htmlFor labels', () => {
    for (const id of ['fb-title', 'fb-message', 'fb-email']) {
      expect(src).toContain(`id="${id}"`);
      expect(src).toContain(`htmlFor="${id}"`);
    }
  });
  it('category is a labelled group', () => {
    expect(src).toContain('role="group" aria-labelledby="fb-category-label"');
    expect(src).toContain('id="fb-category-label"');
  });
});

describe('A11Y-09: tab arrow-key math', () => {
  it('arrows wrap, Home/End jump, other keys ignored', () => {
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('ArrowDown', 1, 3)).toBe(2);
    expect(nextTabIndex('ArrowUp', 0, 3)).toBe(2);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
    expect(nextTabIndex('Enter', 0, 3)).toBeNull();
    expect(nextTabIndex('a', 0, 3)).toBeNull();
  });
  it('all six tab groups wire the shared handler', () => {
    expect(readSrc('src/components/WorkoutPage.tsx')).toContain('tabListKeyDown');
    expect(readSrc('src/components/MealsPage.tsx')).toContain('tabListKeyDown');
    const progress = readSrc('src/components/ProgressPage.tsx');
    expect(progress.match(/tabListKeyDown/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe('A11Y-10: no hardcoded English accessible names remain', () => {
  it('grep gate over all components', () => {
    const srcRoot = path.resolve(__dirname, '../src');
    for (const file of walkTsx(srcRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, file).not.toContain('aria-label="Close"');
      expect(content, file).not.toContain('aria-label="Report AI content"');
    }
  });
  it('the localized keys exist in both locales', () => {
    expect(readSrc('src/lib/i18n/en.ts')).toContain("'common.reportAiContent'");
    expect(readSrc('src/lib/i18n/hi.ts')).toContain("'common.reportAiContent'");
  });
});

describe('A11Y-11 + UX-14: icon buttons gained names and >=28px targets', () => {
  it('LogPastWorkoutModal title-only buttons have aria-labels', () => {
    const src = readSrc('src/components/LogPastWorkoutModal.tsx');
    for (const key of ['lp.removeExercise', 'lp.painToggleHint', 'lp.rpeTitle', 'lp.removeSet', 'lp.duplicateSet']) {
      expect(src).toContain(`aria-label={t('${key}')}`);
    }
  });
  it('BodyMetrics delete + named close buttons are >=28px', () => {
    const body = readSrc('src/components/BodyMetricsModal.tsx');
    expect(body).toContain("aria-label={t('bodyMetrics.deleteRecord')}");
    expect(body).toContain('min-h-[28px] min-w-[28px]');
    expect(readSrc('src/components/HomeMatrix.tsx')).toContain('min-h-[28px] min-w-[28px]');
    expect(readSrc('src/components/FuelPrefsPrompt.tsx')).toContain('min-h-[28px] min-w-[28px]');
    expect(readSrc('src/components/ConstraintAdapterModal.tsx')).toContain("aria-label={t('common.back')}");
  });
});

describe('A11Y-12: body-metric errors are programmatically linked', () => {
  const src = readSrc('src/components/BodyMetricsModal.tsx');
  it.each(['weight', 'height', 'bodyFat', 'chest', 'waist', 'hips', 'date'])(
    '%s error has an id and the input describes it',
    (field) => {
      expect(src).toContain(`id="modal-${field}-error"`);
      expect(src).toContain(`aria-describedby={errors.${field} ? 'modal-${field}-error' : undefined}`);
      expect(src).toContain(`aria-invalid={!!errors.${field}}`);
    },
  );
});

describe('A11Y-16: onboarding progressbar semantics', () => {
  it('valuemin is 0 and valuetext carries the step text', () => {
    const src = readSrc('src/components/onboarding/StepProgressBar.tsx');
    expect(src).toContain('aria-valuemin={0}');
    expect(src).toContain('aria-valuetext=');
    expect(src).not.toContain('aria-valuemin={1}');
  });
});

describe('UX-13: toast dismiss is named and >= 28px', () => {
  it('ToastItem close button', () => {
    const src = readSrc('src/components/ui/Toast.tsx');
    expect(src).toContain("aria-label={t('common.close')}");
    expect(src).toContain('p-2 -m-1');
  });
});

describe('UX-15: type sizes are rem-based so the text-size setting scales them', () => {
  it('no text-[Npx] utilities remain in src', () => {
    const srcRoot = path.resolve(__dirname, '../src');
    for (const file of walkTsx(srcRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, file).not.toMatch(/text-\[\d+px\]/);
    }
  });
  it('globals typography classes use rem', () => {
    const css = readSrc('src/app/globals.css');
    expect(css).toContain('text-[2rem] leading-[2.25rem]');
    expect(css).toContain('text-[1.375rem] leading-[1.75rem]');
    expect(css).toContain('text-[0.75rem] sm:text-[0.8125rem]');
  });
});

describe('UX-19: the two reset paths are distinguished at their entries', () => {
  it('Settings reset row carries the permanence hint; fork hint says archived', () => {
    expect(readSrc('src/components/SettingsView.tsx')).toContain("t('vault.deleteResetHint')");
    expect(readSrc('src/lib/i18n/en.ts')).toContain("'vault.deleteResetHint'");
    expect(readSrc('src/lib/i18n/hi.ts')).toContain("'vault.deleteResetHint'");
    expect(readSrc('src/lib/i18n/en.ts')).toContain('archived, not deleted');
  });
});

describe('UX-20: heatmap legend states the dot mapping', () => {
  it('legend row with the four dot colours and labels', () => {
    const src = readSrc('src/components/WorkoutHeatmap.tsx');
    for (const color of ['#FF6A1A', '#38BDF8', '#F5B301', '#22C55E']) {
      expect(src).toContain(color);
    }
    expect(src).toContain("t('heat.gym')");
    expect(src).toContain("t('heat.protein')");
  });
});

describe('UX-22: truncated Fuel names carry title tooltips', () => {
  it('meal/food/favorite names have title attributes', () => {
    const src = readSrc('src/components/MealsPage.tsx');
    expect(src).toContain('title={displayMealName(meal.name)}');
    expect(src).toContain('title={food.name}');
    expect(src).toContain('title={fav.name}');
  });
});
