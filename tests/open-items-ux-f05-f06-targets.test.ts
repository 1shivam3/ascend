/**
 * Open-items UX F-05/F-06 (P2): primary targets below the app's own
 * 44px floor. Fixes are sizing-only (visual design unchanged):
 *  - .segmented-item (Train/Progress/Fuel sub-navigation + the shared
 *    SegmentedControl) gains min-h-[44px].
 *  - SettingsToggle keeps its 44×24 visual track but gains a 44×44
 *    hit area via the new .tap-44 utility (same pattern as .tap-40).
 *  - Settings section chips and the segmented-style Settings grid
 *    pickers (units, language, diet, workout view) gain min-h-[44px].
 *  - Active-workout set inputs rise min-h-[40px] → min-h-[44px], and
 *    the reps container widens to match the weight container.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('open-items UX F-05/F-06: 44px touch targets', () => {
  it('.segmented-item carries the 44px minimum height', () => {
    const css = read('src/app/globals.css');
    const block = css.match(/\.segmented-item \{[^}]*\}/)?.[0] ?? '';
    expect(block).toContain('min-h-[44px]');
  });

  it('.tap-44 utility exists at the full 44px floor', () => {
    const css = read('src/app/globals.css');
    const block = css.match(/\.tap-44::before \{[^}]*\}/)?.[0] ?? '';
    expect(block).toContain('width: 44px');
    expect(block).toContain('height: 44px');
  });

  it('SettingsToggle uses the expanded hit area, visual track unchanged', () => {
    const src = read('src/components/SettingsView.tsx');
    expect(src).toContain('tap-44 w-11 h-6 rounded-full');
    expect(src).toContain('role="switch"');
  });

  it('Settings section chips are ≥44px tall targets', () => {
    const src = read('src/components/SettingsView.tsx');
    expect(src).toContain('min-h-[44px] inline-flex items-center rounded-full');
  });

  it('set inputs are 44px tall and the reps box matches the weight box width', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    expect(src).not.toContain('min-h-[40px]');
    const containers = src.match(/min-h-\[44px\] border border-border\/60 focus-within:border-accent w-\[\d+px\] sm:w-\[\d+px\]/g) ?? [];
    expect(containers.length).toBe(2);
    for (const c of containers) expect(c).toContain('w-[78px] sm:w-[92px]');
  });
});
