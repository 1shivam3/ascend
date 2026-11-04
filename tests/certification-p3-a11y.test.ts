/**
 * Final certification — Round 2e accessibility/design P3 sweep.
 *
 *  A11Y-01 the active bottom-nav label used raw --accent as 12px text
 *          in light mode (3.57:1, fails WCAG AA); it now uses the
 *          --accent-text token (4.66:1). Dark mode is unchanged (raw
 *          --accent already passes at 5.00:1 and is the shipped look).
 *  UI-1b-04 the Training Tools sheet close button was the app's only
 *          unnamed button; it now carries aria-label common.close,
 *          like the labelled sheet-close in the same file.
 *  UI-1b-05 the first-run tip told users to tap a "Done" button; the
 *          button is labelled "Complete Set" (EN) / "सेट पूरा करें" (HI).
 *  DEV-1   the "Gym packed?" explainer was ellipsized at every phone
 *          width (truncate); it wraps now, like the plan-detail sibling.
 *  UI-1b-06 Today sections render in resolved (visual) order in the DOM
 *          via sectionNodes + resolvedToday.map — no flex `order`
 *          reshuffle, so keyboard/screen-reader order = visual order
 *          for default and user-customized layouts alike.
 *  A11Y-06 the rest countdowns carry role="timer" (implicit
 *          aria-live="off": no per-second spam) and a polite sr-only
 *          region announces rest completion once.
 *  py-0.2  a dead spacing class (not in the Tailwind scale, generated
 *          no CSS) on chips in FormSessionSummaryModal and
 *          GoalSelectorModal is now the real py-0.5.
 *  UI-1b-08 the Weekly Recap "Share WhatsApp" button used off-token
 *          emerald literals; the colour now lives in the token system
 *          as --brand-whatsapp (documented third-party brand exception),
 *          rendered through the Tailwind `brand` palette.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';
import { contrastRatio } from '../src/lib/accent-themes';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('certification P3 a11y/design sweep', () => {
  it('A11Y-01: active nav label uses --accent-text in light mode; dark keeps raw --accent', () => {
    const css = read('src/app/globals.css');
    const light = /\.native-tab-item\.active\s*\{([^}]*)\}/.exec(css);
    expect(light).not.toBeNull();
    expect(light![1]).toContain('color: var(--accent-text);');
    expect(light![1]).not.toContain('text-accent');
    const dark = /\.dark \.native-tab-item\.active\s*\{([^}]*)\}/.exec(css);
    expect(dark).not.toBeNull();
    expect(dark![1]).toContain('color: rgb(var(--accent));');
  });

  it('A11Y-01: the token swap is what makes the label pass AA (ratio math)', () => {
    // Nav bar background is bg-primary (chalk #F3F0E7 light / #121411 dark).
    expect(contrastRatio('#E44427', '#F3F0E7')).toBeLessThan(4.5); // old: raw accent text
    expect(contrastRatio('#C7351B', '#F3F0E7')!).toBeGreaterThanOrEqual(4.5); // new: --accent-text
    expect(contrastRatio('#EB4E30', '#121411')!).toBeGreaterThanOrEqual(4.5); // dark: unchanged, already passed
  });

  it('UI-1b-04: Training Tools sheet close button has an accessible name', () => {
    const src = read('src/components/WorkoutPage.tsx');
    const titleIdx = src.indexOf(">{t('tools.title')}</h3>");
    expect(titleIdx).toBeGreaterThan(-1);
    const afterTitle = src.slice(titleIdx, titleIdx + 1200);
    const btnEnd = afterTitle.indexOf('</button>');
    expect(btnEnd).toBeGreaterThan(-1);
    expect(afterTitle.slice(0, btnEnd)).toContain("aria-label={t('common.close')}");
  });

  it('UI-1b-05: the first-run tip names the real button in both languages', () => {
    expect(en['workout.tip2']).toContain('Complete Set');
    expect(en['workout.tip2']).not.toContain('Done button');
    expect(hi['workout.tip2']).toContain('सेट पूरा करें');
    expect(en['workout.completeSet']).toBe('Complete Set');
  });

  it('DEV-1: the in-workout "Gym packed?" explainer is no longer truncated', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    const line = src.split('\n').find((l) => l.includes("t('packed.previewHint')"));
    expect(line).toBeDefined();
    expect(line!).not.toContain('truncate');
  });

  it('UI-1b-06: Today renders sections in resolved DOM order (no flex order)', () => {
    const src = read('src/components/HomePage.tsx');
    expect(src).not.toContain('orderOf');
    expect(src).not.toContain('style={{ order:');
    expect(src).toContain('const sectionNodes: Record<TodaySectionId, React.ReactNode>');
    expect(src).toContain('{resolvedToday.map((section) => (');
    expect(src).toContain('<Fragment key={section.id}>{sectionNodes[section.id]}</Fragment>');
    for (const id of [
      'nutrition-strip', 'habit-matrix', 'quick-actions', 'hydration',
      'readiness', 'level', 'steps', 'challenge', 'weekly-review-detail', 'quote',
    ]) {
      expect(src).toContain(`'${id}': (`);
    }
    expect(src).toContain('coach: uiPreferences.coachEnabled && shown(\'coach\') && (');
  });

  it('A11Y-06: rest countdowns expose role="timer" and rest-end is announced politely', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    // Strip JSX comments first: the A11Y-06 explainer comment itself names
    // the attribute and must not inflate the count.
    const codeOnly = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(codeOnly.split('role="timer"').length - 1).toBe(3);
    expect(src).toContain('<span aria-live="polite" className="sr-only">');
    expect(src).toContain("isRestFinished ? `${t('workout.restTimer')}: ${t('workout.ready')}` : ''");
  });

  it('py-0.2: dead spacing class replaced by py-0.5 in the two audited modals', () => {
    const summary = read('src/features/form-coach/components/FormSessionSummaryModal.tsx');
    expect(summary).not.toContain('py-0.2');
    expect(summary).toContain('px-1.5 py-0.5 rounded text-2xs');
    const goals = read('src/components/GoalSelectorModal.tsx');
    expect(goals).not.toContain('py-0.2');
    expect(goals.split('px-1.5 py-0.5 rounded bg-bg-secondary/80').length - 1).toBe(2);
  });

  it('UI-1b-08: WhatsApp share green is a named brand token, used via the config', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('--brand-whatsapp: 5 150 105;');
    expect(css).toContain('--brand-whatsapp-hover: 16 185 129;');
    const config = read('tailwind.config.js');
    expect(config).toContain("whatsapp: 'rgb(var(--brand-whatsapp) / <alpha-value>)'");
    expect(config).toContain("whatsappHover: 'rgb(var(--brand-whatsapp-hover) / <alpha-value>)'");
    const modal = read('src/components/WeeklyRecapModal.tsx');
    expect(modal).toContain('bg-brand-whatsapp hover:bg-brand-whatsappHover');
    expect(modal).not.toContain('bg-emerald-600');
  });
});
