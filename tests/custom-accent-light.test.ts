import { describe, expect, it } from 'vitest';
import {
  PAGE_BACKGROUND,
  contrastRatio,
  deriveCustomAccent,
  isCustomAccentUsable,
  relativeLuminance,
} from '../src/lib/accent-themes';

// Light custom accents must APPLY (user-reported bug): derivation now
// darkens the light-mode variant until ≥3:1 vs the light page
// background (same hue, darker shade), with the corrected-shade note.
// The bar is NOT lowered and no invisible accent ships. Presets and
// dark-variant behavior are unchanged.

describe('light custom accents apply with a corrected light variant', () => {
  const lightHexes: Array<[string, string]> = [
    ['pale yellow', '#FFF9C4'],
    ['light pink', '#FFD1DC'],
    ['near-white', '#FDFDFD'],
    ['background-equal', '#F3F0E7'],
  ];

  for (const [label, hex] of lightHexes) {
    it(`${label} (${hex}) is usable and its corrected light accent meets ≥3:1`, () => {
      expect(isCustomAccentUsable(hex)).toBe(true);
      const derived = deriveCustomAccent(hex, 'light');
      expect(derived).not.toBeNull();
      const { variant } = derived!;
      const ratio = contrastRatio(variant.accent, PAGE_BACKGROUND.light);
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(3);
      // Corrected: strictly darker than the entered hex, and the user
      // is told the shade was adjusted.
      expect(relativeLuminance(variant.accent)!).toBeLessThan(relativeLuminance(hex)!);
      expect(derived!.correctedNote).toMatch(/Adjusted for readability/);
      // Text and on-pairings still meet their bars on the corrected accent.
      expect(contrastRatio(variant.text, PAGE_BACKGROUND.light)!).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(variant.on, variant.accent)!).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('saturated colors are untouched in light mode (no gratuitous correction)', () => {
    const derived = deriveCustomAccent('#E44427', 'light');
    expect(derived).not.toBeNull();
    expect(derived!.variant.accent).toBe('#E44427');
  });
});

describe('dark-variant behavior unchanged', () => {
  it('light hexes still brighten for dark mode and meet ≥3:1 there', () => {
    for (const hex of ['#FFF9C4', '#FFD1DC', '#FDFDFD', '#F3F0E7']) {
      const derived = deriveCustomAccent(hex, 'dark');
      expect(derived).not.toBeNull();
      const ratio = contrastRatio(derived!.variant.accent, PAGE_BACKGROUND.dark);
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(3);
      // Dark derivation starts from the user's hex and lightens; the
      // light-mode correction never leaks into the dark variant.
      expect(derived!.variant.accent).not.toBe(deriveCustomAccent(hex, 'light')!.variant.accent);
    }
  });

  it('invalid input still derives nothing and is not usable', () => {
    expect(deriveCustomAccent('not-a-color', 'light')).toBeNull();
    expect(isCustomAccentUsable('not-a-color')).toBe(false);
    expect(isCustomAccentUsable('#12')).toBe(false);
  });
});
