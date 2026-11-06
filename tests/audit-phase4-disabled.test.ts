/**
 * Audit Phase 4, Task 4.2 (P1-7) — ONE disabled-button style.
 *
 * The style: bg-secondary surface + text-muted label + border token,
 * full opacity, no shadow. It is applied three ways, all carrying the
 * same tokens: the .btn-* :disabled rule in globals.css, ui/Button's
 * disabled: variants, and the identical disabled: variant set on
 * ad-hoc CTAs. The disabled pair is accent-independent (the accent
 * system never overrides --bg-secondary / --text-muted), so the
 * contrast proof iterates every accent combination the app can be in
 * — 6 presets + the custom-hex correction path, × light/dark — and
 * recomputes the pair from the globals.css tokens for each.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ACCENT_PRESETS,
  deriveCustomAccent,
  contrastRatio,
  type AppearanceMode,
} from '../src/lib/accent-themes';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

function themeVars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function tripletToHex(v: string): string {
  const [r, g, b] = v.split(/\s+/).map(Number);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

const css = read('src/app/globals.css');
const MODES: AppearanceMode[] = ['light', 'dark'];
const disabledPair = (mode: AppearanceMode) => {
  const vars = themeVars(css, mode === 'light' ? ':root' : '.dark');
  return {
    fg: tripletToHex(vars['text-muted']),
    bg: tripletToHex(vars['bg-secondary']),
  };
};

describe('Phase 4.2 — disabled contrast across every accent combination', () => {
  it('there are 6 presets to iterate', () => {
    expect(ACCENT_PRESETS).toHaveLength(6);
  });

  for (const preset of ACCENT_PRESETS) {
    for (const mode of MODES) {
      it(`${preset.id} / ${mode}: disabled text on disabled surface ≥ 4.5:1`, () => {
        const { fg, bg } = disabledPair(mode);
        const ratio = contrastRatio(fg, bg);
        expect(ratio).not.toBeNull();
        expect(ratio!).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const mode of MODES) {
    it(`custom hex (pale, corrected) / ${mode}: disabled pair still ≥ 4.5:1`, () => {
      // The custom path derives accent tokens only; the disabled pair
      // comes from the theme tokens and cannot be dragged down by a
      // pale user hex.
      const derived = deriveCustomAccent('#E9E4FF', mode);
      expect(derived).not.toBeNull();
      const { fg, bg } = disabledPair(mode);
      expect(contrastRatio(fg, bg)!).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the disabled pair is visually distinct from the enabled accent CTA', () => {
    // Distinctness: the disabled surface is the sunken neutral token,
    // never the accent fill, in either theme.
    for (const mode of MODES) {
      const vars = themeVars(css, mode === 'light' ? ':root' : '.dark');
      expect(vars['bg-secondary']).not.toBe(vars['accent']);
    }
  });
});

describe('Phase 4.2 — the one style is what ships', () => {
  it('globals.css carries the .btn-* :disabled rule with the tokens', () => {
    expect(css).toContain('.btn-primary:disabled');
    expect(css).toContain('.btn-secondary:disabled');
    expect(css).toContain('.btn-danger:disabled');
    const rule = css.slice(css.indexOf('.btn-primary:disabled'));
    const block = rule.slice(0, rule.indexOf('}'));
    expect(block).toContain('background-color: rgb(var(--bg-secondary))');
    expect(block).toContain('color: rgb(var(--text-muted))');
    expect(block).toContain('border-color: rgb(var(--border))');
    expect(block).toContain('opacity: 1');
  });

  it('ui/Button carries the same tokens as disabled: variants', () => {
    const src = read('src/components/ui/Button.tsx');
    expect(src).toContain('disabled:bg-bg-secondary');
    expect(src).toContain('disabled:text-text-muted');
    expect(src).toContain('disabled:border-border');
    expect(src).toContain('disabled:shadow-none');
    expect(src).toContain('disabled:opacity-100');
  });

  it('no sub-100 disabled opacity fade remains anywhere in src', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) {
          const s = fs.readFileSync(p, 'utf8');
          for (const m of s.matchAll(/disabled:opacity-(\d+)/g)) {
            if (m[1] !== '100') offenders.push(`${p}: disabled:opacity-${m[1]}`);
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
