/**
 * Audit Phase 4, Task 4.8 (P3-1) — formatting consistency.
 *
 * formatNumber / formatDate join formatDuration in lib/formatters
 * as THE user-facing formatters. Migrated surfaces (pinned below):
 * Today fuel card, Fuel adherence card + day total + meal chips,
 * coach block start dates (were raw ISO "2026-11-09" inside
 * sentences), coach weekly-review tonnage (was "1.2t"), and the
 * Weekly Training Card (hero was "1.2t", share text disagreed; the
 * preview sat letterboxed in a black box — the container now hugs
 * the rendered 4:5 card).
 *
 * Deliberately left (see the Phase 4 report for the full list):
 * per-food row values and other sub-1,000 figures where grouping
 * cannot differ, the challenges sheets' local short-date helper
 * ("Nov 6" — a different, shorter format by design), canvas-internal
 * and log/debug formatting, and the remaining toLocaleDateString
 * calls that already go through formatLocalDate or locale-aware
 * inline options.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatNumber, formatDate, formatDuration } from '../src/lib/formatters';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('Phase 4.8 — the shared formatters', () => {
  it('formatNumber groups thousands', () => {
    expect(formatNumber(2592, 'en-US')).toBe('2,592');
    expect(formatNumber(1200, 'en-US')).toBe('1,200');
    expect(formatNumber(999, 'en-US')).toBe('999');
    // Indian grouping for the Hindi locale (lakh style).
    expect(formatNumber(123456, 'hi-IN')).toBe('1,23,456');
  });

  it('formatDate renders the History style', () => {
    expect(formatDate('2026-11-06', 'en-US')).toBe('Fri, Nov 6, 2026');
    expect(formatDate('2026-11-09', 'en-US')).toBe('Mon, Nov 9, 2026');
  });

  it('formatDuration (pre-existing) still anchors the set', () => {
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(10)).toBe('10s');
  });
});

describe('Phase 4.8 — migrated surfaces', () => {
  it('Today and Fuel agree on the fuel target format', () => {
    const home = read('src/components/HomePage.tsx');
    expect(home).toContain('formatNumber(fuelStats.calories)');
    expect(home).toContain('formatNumber(fuelStats.targetCalories)');
    expect(home).not.toContain('fuelStats.calories.toLocaleString()');
    const meals = read('src/components/MealsPage.tsx');
    expect(meals).toContain('formatNumber(Math.round(todayMacros.calories))');
    expect(meals).toContain('formatNumber(displayGoals?.calories || splitFallback.calories)');
    expect(meals).toContain('formatNumber(Math.round(todayMacros.proteinG))');
  });

  it('coach block dates are formatted, never raw ISO', () => {
    const block = read('src/components/CoachBlockModal.tsx');
    expect(block).toContain('formatDate(proposal.startMonday)');
    expect(block).not.toContain('{ date: proposal.startMonday }');
    const tab = read('src/components/CoachChatTab.tsx');
    expect(tab).toContain('formatDate(coachBlocks.activeBlock.startMonday)');
  });

  it('volumes read as grouped kg, never tonnes shorthand', () => {
    const review = read('src/components/CoachWeeklyReviewModal.tsx');
    expect(review).toContain('formatNumber(Math.round(review.tonnageKg))} kg');
    expect(review).not.toContain('toFixed(1)}t');
    const recap = read('src/components/WeeklyRecapModal.tsx');
    expect(recap).toContain('const heroValue = formatNumber(weeklyStats.totalVolume)');
    expect(recap).not.toContain('toFixed(1)}t');
    expect(recap).toContain('formatNumber(weeklyStats.totalVolume)} ${profile?.unit');
  });

  it('the recap preview container matches the rendered card (no black letterbox)', () => {
    const recap = read('src/components/WeeklyRecapModal.tsx');
    expect(recap).toContain('shadow-md w-fit mx-auto');
    expect(recap).not.toContain('bg-black relative max-h-[380px]');
    expect(recap).toContain('block h-auto max-h-[380px] w-auto max-w-full');
  });
});
