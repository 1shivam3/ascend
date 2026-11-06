/**
 * Audit Phase 4, Task 4.5 (P2-9) — ONE macro colour set.
 *
 * Protein / carbs / fat labels AND bars across Fuel, meal detail and
 * coach surfaces resolve from the --macro-* tokens (tailwind `macro`
 * group). Before this, the adherence card paired a RED protein label
 * (text-accent) with a GREEN bar (bg-emerald-400), the macro split
 * bar painted its protein segment with the accent itself, and every
 * other surface improvised its own emerald/sky/amber shade. Calories
 * deliberately has no macro token: it stays the accent (label
 * text-accent-text, bar bg-accent), documented in globals.css.
 *
 * Light label shades were stepped one notch darker than the raw
 * palette (#166534 / #92400E instead of #15803D / #B45309) so the
 * labels hold ≥4.5:1 on card, page AND sunken surfaces — the ratios
 * below are recomputed from the shipped tokens.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { contrastRatio } from '../src/lib/accent-themes';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const css = read('src/app/globals.css');

function themeVars(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const hex = (triplet: string) =>
  `#${triplet.split(/\s+/).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;

const MACROS = ['protein', 'carbs', 'fat'] as const;
const SURFACES = ['bg-card', 'bg-primary', 'bg-secondary'] as const;

describe('Phase 4.5 — macro tokens', () => {
  it('globals.css defines the macro set in both themes; tailwind maps it', () => {
    for (const sel of [':root', '.dark']) {
      const vars = themeVars(sel);
      for (const m of MACROS) expect(vars[`macro-${m}`], `${sel} --macro-${m}`).toBeTruthy();
    }
    const cfg = read('tailwind.config.js');
    for (const m of MACROS) {
      expect(cfg).toContain(`${m}: 'rgb(var(--macro-${m}) / <alpha-value>)'`);
    }
  });

  it('macro labels hold ≥4.5:1 on card, page and sunken surfaces in both themes', () => {
    for (const sel of [':root', '.dark']) {
      const vars = themeVars(sel);
      for (const m of MACROS) {
        for (const s of SURFACES) {
          const ratio = contrastRatio(hex(vars[`macro-${m}`]), hex(vars[s]));
          expect(ratio, `${sel} macro-${m} on ${s}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('macro bars hold ≥3:1 against the bar track (bg-secondary) in both themes', () => {
    for (const sel of [':root', '.dark']) {
      const vars = themeVars(sel);
      for (const m of MACROS) {
        expect(contrastRatio(hex(vars[`macro-${m}`]), hex(vars['bg-secondary']))).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('Phase 4.5 — surfaces consume the one set', () => {
  const meals = read('src/components/MealsPage.tsx');

  it('adherence card: labels and bars both use the macro tokens', () => {
    expect(meals).toContain('text-macro-protein');
    expect(meals).toContain('text-macro-carbs');
    expect(meals).toContain('text-macro-fat');
    expect(meals).toContain('bg-macro-protein');
    expect(meals).toContain('bg-macro-carbs');
    expect(meals).toContain('bg-macro-fat');
    // Calories stays the accent, on the AA text token.
    expect(meals).toContain('<span className="font-semibold text-accent-text">{t(\'meals.calories\')}</span>');
  });

  it('the split-bar protein segment is no longer painted with the accent', () => {
    expect(meals).not.toContain('className="bg-accent h-full"');
    expect(meals).toContain('className="bg-macro-protein h-full"');
  });

  it('no raw-palette macro bars remain in MealsPage', () => {
    expect(meals).not.toContain('bg-emerald-400');
    expect(meals).not.toContain('bg-sky-400');
    expect(meals).not.toContain('bg-amber-400');
  });

  it('meal detail (scan result) protein uses the token', () => {
    expect(read('src/components/ScanMealModal.tsx')).toContain('text-macro-protein');
  });
});
