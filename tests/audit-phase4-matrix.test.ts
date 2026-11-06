/**
 * Audit Phase 4, Task 4.4 (P2-3) — consistency matrix tokens.
 *
 * Both matrices (HomeMatrix weekly/monthly + WeeklyHabitMatrix) take
 * their cell colours from ONE token source: workout = the accent
 * token, water/creatine/protein = the --habit-* globals.css tokens
 * (which also back the tailwind utilities of the same names). Done
 * state is never colour alone: a Check glyph rides the fill and the
 * cell's accessible name states "Done". Row labels sit at the 2xs
 * (11px) floor in the app sans — the 10px mono labels are gone.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HABIT_FILL, HABIT_LABEL_CLASS, HABIT_ON_FILL } from '../src/lib/habit-tokens';
import { ACCENT_PRESETS, contrastRatio } from '../src/lib/accent-themes';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const css = read('src/app/globals.css');

function themeBlock(selector: string): string {
  const start = css.indexOf(selector);
  return css.slice(start, css.indexOf('}', start));
}

describe('Phase 4.4 — habit tokens exist and agree everywhere', () => {
  it('globals.css defines the habit vars in BOTH themes with the audited values', () => {
    for (const block of [themeBlock(':root'), themeBlock('.dark')]) {
      expect(block).toContain('--habit-water: 56 189 248');
      expect(block).toContain('--habit-creatine: 245 179 1');
      expect(block).toContain('--habit-protein: 34 197 94');
    }
  });

  it('tailwind water/protein/creatine utilities resolve from the same vars', () => {
    const cfg = read('tailwind.config.js');
    expect(cfg).toContain("water: 'rgb(var(--habit-water) / <alpha-value>)'");
    expect(cfg).toContain("protein: 'rgb(var(--habit-protein) / <alpha-value>)'");
    expect(cfg).toContain("creatine: 'rgb(var(--habit-creatine) / <alpha-value>)'");
  });

  it('the shared token table maps every habit', () => {
    expect(HABIT_FILL.workout).toBe('rgb(var(--accent))');
    expect(HABIT_FILL.water).toBe('rgb(var(--habit-water))');
    expect(HABIT_FILL.creatine).toBe('rgb(var(--habit-creatine))');
    expect(HABIT_FILL.protein).toBe('rgb(var(--habit-protein))');
    for (const id of ['workout', 'water', 'creatine', 'protein'] as const) {
      expect(HABIT_LABEL_CLASS[id]).toBe(`matrix-row-label-${id}`);
      expect(HABIT_ON_FILL[id]).toBeTruthy();
    }
  });

  it('the done glyph reads on every fill (≥3:1 graphics bar)', () => {
    // Ink on the three bright fills.
    for (const fill of ['#38BDF8', '#F5B301', '#22C55E']) {
      expect(contrastRatio(HABIT_ON_FILL.water, fill)).toBeGreaterThanOrEqual(3);
    }
    // Accent-on on every preset accent, both modes (the full AA pair
    // is re-proven in audit-phase4-accent-safety; ≥3 is the bar here).
    for (const p of ACCENT_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        expect(contrastRatio(p[mode].on, p[mode].accent)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('Phase 4.4 — both matrices consume the tokens', () => {
  const OLD_HEXES = ['#FF6A1A', '#38BDF8', '#F5B301', '#22C55E'];
  for (const f of ['src/components/HomeMatrix.tsx', 'src/components/WeeklyHabitMatrix.tsx']) {
    it(`${f}: no local hex table, tokens + glyph + stated done`, () => {
      const src = read(f);
      for (const hex of OLD_HEXES) expect(src, `${f} still carries ${hex}`).not.toContain(hex);
      expect(src).toContain("from '@/lib/habit-tokens'");
      expect(src).toContain('HABIT_FILL');
      expect(src).toContain('<Check');
      // Readable row labels: 2xs sans, not the 10px arbitrary size.
      expect(src).toContain('text-2xs font-sans');
      expect(src).not.toContain('text-[0.625rem]');
    });
  }

  it('done state is named in the cell aria-labels', () => {
    expect(read('src/components/HomeMatrix.tsx')).toContain("t('homeMatrix.done')");
    expect(read('src/components/WeeklyHabitMatrix.tsx')).toContain("t('habit.done')");
  });

  it('habit.done exists in both locales', () => {
    expect(read('src/lib/i18n/en.ts')).toContain("'habit.done': 'Done'");
    expect(read('src/lib/i18n/hi.ts')).toContain("'habit.done':");
  });
});
