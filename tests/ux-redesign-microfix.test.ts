/**
 * Micro-fix round 2 (2026-10-25): regression pins for the items live
 * browser re-verification proved STILL broken after the first fix round
 * (preview of 83bc7c6, guest-only; qa-results.md §6).
 *
 * Static source pins, same technique as the Stage 1–10 and live-fix
 * suites: these are flow/wiring defects (which UI is rendered, which
 * handler runs on Escape), not arithmetic. Live re-verification of
 * these fixes is a later parent-run phase — nothing here claims a
 * browser saw the fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('L4 rest timer — live path is pill + popover, not the overlay', () => {
  const aws = () => src('src/components/ActiveWorkoutScreen.tsx');

  it('the popover carries the countdown readout (same source as the pill)', () => {
    const s = aws();
    // Slice strictly between the popover render and the pill render, so
    // the pin cannot pass via the pill's own readout below it.
    const popoverStart = s.indexOf('{isRestPopoverOpen && (');
    const pillStart = s.indexOf('{!completedSetSummary && !isRestPopoverOpen && (');
    expect(popoverStart).toBeGreaterThan(-1);
    expect(pillStart).toBeGreaterThan(popoverStart);
    const popover = s.slice(popoverStart, pillStart);
    expect(popover).toContain(
      'formatTime(restSecondsLeft > 0 ? restSecondsLeft : defaultRestDuration)'
    );
    expect(popover).toContain('adjustTimer(-30)');
  });

  it('the pill hides while the popover is open (single timer UI)', () => {
    expect(aws()).toContain('{!completedSetSummary && !isRestPopoverOpen && (');
  });

  it('Escape on the popover closes it AND pauses (dismissRestPopover)', () => {
    const s = aws();
    expect(s).toContain('const dismissRestPopover = useCallback');
    expect(s).toContain('setIsRestPopoverOpen(false)');
    // The popover Escape effect is gated on popover-open + overlay-closed.
    expect(s).toContain('if (!isRestPopoverOpen || completedSetSummary) return;');
    expect(s).toContain("if (e.key === 'Escape') dismissRestPopover();");
  });

  it('opening the overlay closes the popover (no triple-stacked timer UI)', () => {
    const s = aws();
    expect(s).toContain('if (completedSetSummary) setIsRestPopoverOpen(false);');
  });

  it('the popover has a collapse-only close (mobile has no Escape)', () => {
    const s = aws();
    // X button that closes without touching the timer (Skip kills it).
    expect(s).toContain("aria-label={t('common.close')}");
  });

  it('preset unity is preserved: pill idle still reads defaultRestDuration', () => {
    expect(aws()).toContain(
      'formatTime(restSecondsLeft > 0 ? restSecondsLeft : defaultRestDuration)'
    );
  });
});

describe('L12 focus visibility', () => {
  it('no focus rule uses the bare --accent triplet (invalid color)', () => {
    const css = src('src/app/globals.css');
    expect(css).not.toContain('outline: 2px solid var(--accent)');
    // Both rules now use the rgb() form the triplet requires.
    expect(css).toContain('outline: 2px solid rgb(var(--accent));');
  });

  it('the unlayered :focus-visible rule still exists', () => {
    const css = src('src/app/globals.css');
    expect(css).toContain(':focus-visible {');
    expect(css).toContain('outline-offset: 2px;');
  });
});

describe('L9b favorites row wraps', () => {
  it('the quick-add favorites row wraps instead of scrolling', () => {
    const meals = src('src/components/MealsPage.tsx');
    const row = meals.slice(meals.indexOf('quickAddFavorites'));
    const rowBlock = row.slice(0, row.indexOf('favoriteFoods.map'));
    expect(rowBlock).toContain('flex flex-wrap');
    expect(rowBlock).not.toContain('overflow-x-auto');
    expect(rowBlock).not.toContain('mask-image');
  });
});

describe('L2 Simple habit heading', () => {
  it('Simple uses a today heading, Detailed keeps the week heading', () => {
    const home = src('src/components/HomePage.tsx');
    expect(home).toContain(
      "{density === 'simple' ? t('home.habitsToday') : t('home.habitsThisWeek')}"
    );
  });

  it('the new heading key exists in both dictionaries', () => {
    expect((en as Record<string, string>)['home.habitsToday']).toBe(
      "Today's habits"
    );
    expect((hi as Record<string, string>)['home.habitsToday']).toBeTruthy();
  });
});

describe('L3 Auto clarification', () => {
  it('an Auto hint states the current density → mode mapping', () => {
    const settings = src('src/components/SettingsView.tsx');
    expect(settings).toContain('{!uiPreferences.workoutModeOverride && (');
    expect(settings).toContain('settings.densityDetailed');
    expect(settings).toContain('settings.densitySimple');
    expect(settings).toContain('modeLabel(workoutMode)');
  });

  it('the follow-density behavior itself is unchanged (null = follow)', () => {
    const settings = src('src/components/SettingsView.tsx');
    expect(settings).toContain('workoutModeOverride: m === ' + "'auto' ? null : m");
  });
});
