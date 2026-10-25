import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Today bottom-clearance contract.
 *
 * What was checked (and ruled out) for the reported "tabs overlapping"
 * on the home page:
 * - The tab items cannot overlap each other: they sit in a 4-column
 *   grid with min-width 0 and short labels in both languages, and the
 *   labels wrap instead of overflowing (no nowrap/truncate anywhere).
 * - Today itself has no fixed/absolute/sticky element on master
 *   (no pills, no overlays inside HomePage); the toast is fixed top,
 *   the rest pill lives in the workout overlay (where the nav hides).
 * - What DOES break: the fixed tab bar's height grows with the
 *   device safe area (and with larger text, which grows the items),
 *   while Today's bottom padding was a flat 96px (pb-24) that
 *   overrode .page's safe-area-aware calc. On a large-safe-area
 *   device with larger text the bar reaches past 96px and covers
 *   the last rows of Today.
 *
 * Bar-height model (all numbers read from src/app/globals.css and
 * src/app/page.tsx, not guessed):
 * - bar top padding pt-1.5 = 6px; border-t = 1px
 * - item = max(min-height 48, icon 20 + label margin mt-1 4 +
 *   label 12px @ 1.5 line-height 18 + vertical padding py-1 8) = 50px
 * - bar bottom padding = max(8px, safe-area-inset-bottom)
 * - bar(safeArea) = 6 + 50 + 1 + max(8, safeArea)
 * - with text scaling, the label term grows: 18 * scale
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const globalsCss = readFileSync(path.join(repoRoot, 'src/app/globals.css'), 'utf8');
const homePage = readFileSync(path.join(repoRoot, 'src/components/HomePage.tsx'), 'utf8');

function barHeightPx(safeAreaPx: number, textScale = 1): number {
  const labelPx = Math.round(18 * textScale);
  const itemPx = Math.max(48, 20 + 4 + labelPx + 8);
  return 6 + itemPx + 1 + Math.max(8, safeAreaPx);
}

function todayPaddingPx(safeAreaPx: number): number {
  // .page-bottom-safe: calc(6rem + env(safe-area-inset-bottom, 0px))
  return 96 + safeAreaPx;
}

describe('Today bottom clearance above the fixed tab bar', () => {
  it('Today root uses the safe-area-aware padding, not the flat pb-24 override', () => {
    const rootMatch = homePage.match(/<div className="page animate-fade-in[^"]*"/);
    expect(rootMatch).not.toBeNull();
    const rootClasses = rootMatch![0];
    expect(rootClasses).toContain('page-bottom-safe');
    expect(rootClasses).not.toContain('pb-24');

    const blockMatch = globalsCss.match(/\.page-bottom-safe\s*\{[^}]*\}/);
    expect(blockMatch).not.toBeNull();
    expect(blockMatch![0]).toContain('env(safe-area-inset-bottom');
    expect(blockMatch![0]).toContain('6rem');
  });

  it('the tab bar CSS the model reads from is still shaped as assumed', () => {
    // If these change, the clearance model above must be revisited.
    // Rebase note (2026-10-25, onto redesign master): the bar went from
    // 4 to 5 columns when the redesign added the You destination, so the
    // pin moved from grid-cols-4 to grid-cols-5. Column count is
    // horizontal only and does not enter the bar-height formula, which
    // depends on the vertical terms below — all re-verified unchanged
    // (icon 20 + mt-1 4 + 12px label + py-1 8, min-height 48, pt-1.5,
    // border-t 1, bottom max(0.5rem, safe-area)).
    expect(globalsCss).toContain('grid-cols-5');
    expect(globalsCss).toContain('pt-1.5');
    expect(globalsCss).toContain('min-height: 48px');
    expect(globalsCss).toContain('padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0.5rem));');
  });

  it('padding clears the bar at every safe-area value', () => {
    for (const safeArea of [0, 8, 20, 34, 50]) {
      expect(todayPaddingPx(safeArea)).toBeGreaterThanOrEqual(barHeightPx(safeArea));
    }
  });

  it('padding still clears the bar with larger text on a large-safe-area device', () => {
    // The old flat 96px failed here: bar(34px safe area, 1.4x text)
    // = 6 + (20 + 4 + 25 + 8) + 1 + 34 = 98 > 96.
    expect(barHeightPx(34, 1.4)).toBe(98);
    expect(96).toBeLessThan(barHeightPx(34, 1.4));
    expect(todayPaddingPx(34)).toBeGreaterThanOrEqual(barHeightPx(34, 1.4));
    expect(todayPaddingPx(0)).toBeGreaterThanOrEqual(barHeightPx(0, 1.5));
  });

  it('no visible change where the safe area is 0 (padding stays exactly 96px)', () => {
    expect(todayPaddingPx(0)).toBe(96);
  });
});
