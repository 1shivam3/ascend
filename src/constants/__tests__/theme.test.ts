import { describe, it, expect } from 'vitest';
import { THEME, SPACING, TYPOGRAPHY } from '../theme';

describe('ASCEND Theme & Design System Invariants', () => {
  it('enforces restrained athletic color tokens and high contrast text', () => {
    expect(THEME.colors.background).toBe('#090B10');
    expect(THEME.colors.textPrimary).toBe('#F8FAFC');
    expect(THEME.colors.cyan).toBe('#00E5FF');
    expect(THEME.colors.crimson).toBe('#EF4444');
    expect(THEME.colors.border).toBe('#1F293D');
  });

  it('enforces 8-point based spacing scale', () => {
    expect(SPACING.xs).toBe(4);
    expect(SPACING.sm).toBe(8);
    expect(SPACING.md).toBe(12);
    expect(SPACING.lg).toBe(16);
    expect(SPACING.xl).toBe(20);
    expect(SPACING.xxl).toBe(24);
  });

  it('provides large numerical display font sizes for athletic stats', () => {
    expect(TYPOGRAPHY.fontSizes.displayLg).toBeGreaterThanOrEqual(48);
    expect(TYPOGRAPHY.fontSizes.hero).toBeGreaterThanOrEqual(56);
  });
});
