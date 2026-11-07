/**
 * QA-hardening Phase 3 — Check 3: accent contrast re-verification.
 *
 * Computational WCAG AA verification of every pair the design
 * system actually paints from an accent, in BOTH themes (Chalk
 * light / Graphite dark), for:
 *  - all six presets (Vermilion, Cobalt, Forest, Plum, Teal, Rose)
 *  - three RANDOM custom hexes from a fixed-seed PRNG (seed
 *    20261107 — the seed is the contract: anyone re-running this
 *    file tests the same three hexes), pushed through the real
 *    deriveCustomAccent correction path, as a user's pick would be.
 *
 * Pairs (brief: primary buttons, disabled buttons, chips, switches,
 * links, habit matrix):
 *  - links / selected labels:        accent-text on page bg  ≥ 4.5
 *  - primary buttons / switch on:    accent-on on accent     ≥ 4.5
 *  - chips (selected):               accent-text on the subtle
 *                                    wash blended over page bg ≥ 4.5
 *  - switches / focus rings / bars:  accent fill vs page bg  ≥ 3.0
 *  - habit matrix workout cell:      accent-on on accent     ≥ 4.5
 *                                    (same pair as buttons — the
 *                                    matrix glyph token)
 * Accent-independent pairs, both themes:
 *  - disabled buttons (the shared audit-Phase-4 style):
 *    text-muted on bg-secondary ≥ 4.5 (WCAG exempts disabled
 *    controls; the app chose an AA style, so it is held to it)
 *  - habit matrix glyphs: the graphite ink on the water /
 *    creatine / protein fills ≥ 4.5.
 *
 * The audit Phase 4 test verified presets + hand-picked custom
 * samples; the random-hex leg is new here. Theme token values are
 * parsed out of globals.css so this file tracks the real tokens.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACCENT_PRESETS,
  PAGE_BACKGROUND,
  contrastRatio,
  deriveCustomAccent,
  hexToRgb,
  rgbToHex,
  type AppearanceMode,
  type AccentVariant,
} from '../src/lib/accent-themes';

const MODES: AppearanceMode[] = ['light', 'dark'];

/** mulberry32 — tiny deterministic PRNG; the seed fixes the hexes. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261107);
export const RANDOM_CUSTOM_HEXES: string[] = Array.from({ length: 3 }, () => {
  const byte = () => Math.floor(rand() * 256);
  return rgbToHex(byte(), byte(), byte());
});

/** Composite a hex or rgba() colour over the page background. */
function blendOver(fg: string, bgHex: string): string {
  const bg = hexToRgb(bgHex)!;
  let r = 0, g = 0, b = 0, a = 1;
  if (fg.startsWith('#')) {
    ({ r, g, b } = hexToRgb(fg)!);
  } else {
    const parts = fg.match(/[\d.]+/g)!.map(Number);
    [r, g, b] = parts;
    a = parts[3] ?? 1;
  }
  return rgbToHex(a * r + (1 - a) * bg.r, a * g + (1 - a) * bg.g, a * b + (1 - a) * bg.b);
}

function expectVariantSafe(label: string, v: AccentVariant, mode: AppearanceMode) {
  const bg = PAGE_BACKGROUND[mode];
  expect(contrastRatio(v.text, bg), `${label} link/text on page bg`).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(v.on, v.accent), `${label} button/matrix-glyph on accent`).toBeGreaterThanOrEqual(4.5);
  expect(
    contrastRatio(v.text, blendOver(v.subtle, bg)),
    `${label} chip text on subtle blend`,
  ).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(v.accent, bg), `${label} accent fill vs page bg`).toBeGreaterThanOrEqual(3);
}

describe('Phase 3 check 3: presets pass AA in both themes', () => {
  for (const preset of ACCENT_PRESETS) {
    for (const mode of MODES) {
      it(`${preset.name} (${preset.id}) / ${mode}`, () => {
        expectVariantSafe(`${preset.id}/${mode}`, preset[mode], mode);
      });
    }
  }
});

describe('Phase 3 check 3: fixed-seed random custom hexes pass AA after derivation', () => {
  it('the seed produces the recorded hexes', () => {
    // If this ever changes, the PRNG or seed changed — the report
    // quotes these hexes, so a silent change must fail loudly.
    expect(RANDOM_CUSTOM_HEXES).toEqual(['#93F2B9', '#B992BC', '#A82C62']);
  });
  for (const hex of RANDOM_CUSTOM_HEXES) {
    for (const mode of MODES) {
      it(`custom ${hex} / ${mode}`, () => {
        const derived = deriveCustomAccent(hex, mode);
        expect(derived, `deriveCustomAccent(${hex}, ${mode})`).not.toBeNull();
        expectVariantSafe(`custom ${hex}/${mode}`, derived!.variant, mode);
      });
    }
  }
});

// ── Theme-token pairs parsed from globals.css ─────────────────────
const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');

function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`token --${name} not found`);
  return rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
}

function themeBlocks(): Record<AppearanceMode, string> {
  const darkStart = css.indexOf('.dark');
  return {
    light: css.slice(0, darkStart),
    dark: css.slice(darkStart),
  };
}

describe('Phase 3 check 3: disabled style + habit glyphs (theme tokens)', () => {
  const blocks = themeBlocks();
  for (const mode of MODES) {
    it(`${mode}: disabled text-muted on bg-secondary ≥ 4.5`, () => {
      const fg = tokenIn(blocks[mode], 'text-muted');
      const bg = tokenIn(blocks[mode], 'bg-secondary');
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: habit glyph ink on water/creatine/protein fills ≥ 4.5`, () => {
      const ink = '#171916'; // HABIT_ON_FILL ink in src/lib/habit-tokens.ts
      for (const habit of ['habit-water', 'habit-creatine', 'habit-protein'] as const) {
        const fill = tokenIn(blocks[mode], habit);
        expect(contrastRatio(ink, fill), `${mode} ink on ${habit}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
