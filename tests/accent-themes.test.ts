import { describe, it, expect } from 'vitest';
import {
  ACCENT_PRESETS,
  PAGE_BACKGROUND,
  contrastRatio,
  deriveCustomAccent,
  normalizeHex,
} from '../src/lib/accent-themes';

/**
 * UX redesign Stage 1 — implementation contrast audit (personalization-
 * spec §1.5). One row per preset × mode × use. The gate: ZERO failing
 * rows ship. Accent-text must meet ≥4.5:1 vs the page background;
 * accent-on must meet ≥4.5:1 vs the accent for label text.
 */
describe('accent preset contrast audit', () => {
  for (const preset of ACCENT_PRESETS) {
    for (const mode of ['light', 'dark'] as const) {
      const v = preset[mode];
      const bg = PAGE_BACKGROUND[mode];
      it(`${preset.id} ${mode}: accent-text ≥4.5:1 vs page background`, () => {
        const ratio = contrastRatio(v.text, bg);
        expect(ratio).not.toBeNull();
        expect(ratio!).toBeGreaterThanOrEqual(4.5);
      });
      it(`${preset.id} ${mode}: accent-on ≥4.5:1 vs accent (label text)`, () => {
        const ratio = contrastRatio(v.on, v.accent);
        expect(ratio).not.toBeNull();
        expect(ratio!).toBeGreaterThanOrEqual(4.5);
      });
      it(`${preset.id} ${mode}: accent is UI-visible vs page background (≥3:1)`, () => {
        const ratio = contrastRatio(v.accent, bg);
        expect(ratio).not.toBeNull();
        expect(ratio!).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('custom accent derivation', () => {
  // Spec §1.5: five custom-accent cases — very light, very dark,
  // mid-grey, saturated yellow, default vermilion (regression).
  const cases: Array<[string, string]> = [
    ['very light', '#F5EFE0'],
    ['very dark', '#1A1A2E'],
    ['mid-grey', '#808080'],
    ['saturated yellow', '#FFEB00'],
    ['vermilion regression', '#E44427'],
  ];
  for (const [label, hex] of cases) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${label} ${mode}: derived text ≥4.5:1, on ≥4.5:1`, () => {
        const derived = deriveCustomAccent(hex, mode);
        expect(derived).not.toBeNull();
        const { variant } = derived!;
        const textRatio = contrastRatio(variant.text, PAGE_BACKGROUND[mode]);
        expect(textRatio).not.toBeNull();
        expect(textRatio!).toBeGreaterThanOrEqual(4.5);
        const onRatio = contrastRatio(variant.on, variant.accent);
        expect(onRatio).not.toBeNull();
        expect(onRatio!).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it('pale yellow shows a corrected-shade note before Apply', () => {
    const derived = deriveCustomAccent('#FFEB00', 'light');
    expect(derived).not.toBeNull();
    expect(derived!.correctedNote).toMatch(/Adjusted for readability/);
  });
  it('invalid hex derives nothing', () => {
    expect(deriveCustomAccent('not-a-color', 'light')).toBeNull();
    expect(deriveCustomAccent('#12', 'light')).toBeNull();
  });
  it('normalizeHex expands #RGB and uppercases', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('#e44427')).toBe('#E44427');
    expect(normalizeHex('red')).toBeNull();
  });
});
