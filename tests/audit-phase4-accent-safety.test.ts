/**
 * Audit Phase 4, Task 4.3 (P1-8) — accent safety.
 *
 * Every pair the design system actually renders from an accent
 * variant must hold AA in BOTH appearance modes, for every preset
 * and for the custom-hex correction path:
 *  - accent-text on the page background (links, selected labels)
 *  - accent-text on the accent-subtle wash blended over the page
 *    background (Chip selected state, segmented-adjacent tints,
 *    selected chips everywhere)
 *  - accent-on on the accent fill (primary CTA label)
 *  - the accent fill itself ≥ 3:1 against the page background
 *    (UI-component bar: switch track, focus ring, bars)
 * Failures, if any ever appear, must be fixed in accent-themes.ts
 * tokens — never with per-component hard-coded colours.
 *
 * Also pins the Settings fix: the custom-hex field's placeholder is
 * the ACTIVE accent's hex (resolved by the parent), never a
 * hard-coded stale hex.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const MODES: AppearanceMode[] = ['light', 'dark'];

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
  expect(contrastRatio(v.text, bg), `${label} text/page-bg`).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(v.on, v.accent), `${label} on/accent`).toBeGreaterThanOrEqual(4.5);
  expect(
    contrastRatio(v.text, blendOver(v.subtle, bg)),
    `${label} text/subtle-blend`,
  ).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(v.accent, bg), `${label} accent/page-bg`).toBeGreaterThanOrEqual(3);
}

describe('Phase 4.3 — preset accent safety, both themes', () => {
  for (const preset of ACCENT_PRESETS) {
    for (const mode of MODES) {
      it(`${preset.id} / ${mode}`, () => {
        expectVariantSafe(`${preset.id}/${mode}`, preset[mode], mode);
      });
    }
  }
});

describe('Phase 4.3 — custom-hex correction path safety', () => {
  // Pale (incl. the old lavender one-off), page-bg-identical, amber,
  // pink tint, saturated, near-black: derivation must land every pair.
  const SAMPLES = ['#E9E4FF', '#F3F0E7', '#F5B301', '#FFD1DC', '#0F766E', '#171916'];
  for (const hex of SAMPLES) {
    for (const mode of MODES) {
      it(`${hex} / ${mode}`, () => {
        const derived = deriveCustomAccent(hex, mode);
        expect(derived).not.toBeNull();
        expectVariantSafe(`custom ${hex}/${mode}`, derived!.variant, mode);
      });
    }
  }
});

describe('Phase 4.3 — the custom-hex field shows the active accent', () => {
  it('ThemePicker takes the placeholder from the activeHex prop', () => {
    const src = read('src/components/ThemePicker.tsx');
    expect(src).toContain('placeholder={activeHex}');
    expect(src).not.toContain('placeholder="#E44427"');
  });

  it('SettingsView resolves the active accent and passes it down', () => {
    const src = read('src/components/SettingsView.tsx');
    expect(src).toContain('resolveAccentVariant(');
    expect(src).toContain('activeHex={activeAccentHex}');
  });
});
