import { describe, it, expect } from 'vitest';
import { BACKGROUND_THEMES, BackgroundThemeId } from '../backgrounds';

describe('Background Themes Engine', () => {
  const expectedThemes: BackgroundThemeId[] = [
    'AWAKENING',
    'ASCENSION',
    'IRON_FORGE',
    'VOID',
    'SUMMIT',
    'NEON_DISTRICT',
    'STORM',
    'ECLIPSE',
  ];

  it('defines all 8 original atmospheric themes', () => {
    expectedThemes.forEach(themeKey => {
      const theme = BACKGROUND_THEMES[themeKey];
      expect(theme).toBeDefined();
      expect(theme.name).toBeTruthy();
      expect(theme.usage).toBeTruthy();
      expect(theme.primaryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.gradientStops.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('maintains deep obsidian gradient foundations', () => {
    Object.values(BACKGROUND_THEMES).forEach(theme => {
      expect(theme.gradientStops[1]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.defaultIntensity).toBeGreaterThan(0);
      expect(theme.defaultIntensity).toBeLessThanOrEqual(1);
    });
  });
});
