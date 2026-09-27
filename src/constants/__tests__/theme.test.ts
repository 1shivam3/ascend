import { describe, it, expect } from 'vitest';
import {
  THEME,
  LIGHT_THEME,
  DARK_THEME,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY,
  DISPLAY_TYPOGRAPHY,
  BODY_TYPOGRAPHY,
} from '../theme';

describe('ASCEND Unified Design System & Theme Tokens', () => {
  describe('Light Theme (Light-First Interface)', () => {
    it('enforces soft neutral backgrounds and clean white/stone cards', () => {
      expect(LIGHT_THEME.colors.background).toBe('#F8F9FA');
      expect(LIGHT_THEME.colors.surface).toBe('#FFFFFF');
      expect(LIGHT_THEME.colors.surfaceElevated).toBe('#F1F3F5');
      expect(LIGHT_THEME.colors.border).toBe('#E5E7EB');
    });

    it('enforces restrained athletic sage & warm amber accents', () => {
      expect(LIGHT_THEME.colors.accent).toBe('#728424');
      expect(LIGHT_THEME.colors.accentSubtle).toBe('#F0F4E8');
      expect(LIGHT_THEME.colors.accentWarm).toBe('#D97706');
      expect(LIGHT_THEME.colors.primaryButton).toBe('#728424');
      expect(LIGHT_THEME.colors.primaryButtonText).toBe('#FFFFFF');
    });

    it('enforces high-contrast readable typography for light mode', () => {
      expect(LIGHT_THEME.colors.textPrimary).toBe('#111827');
      expect(LIGHT_THEME.colors.textSecondary).toBe('#4B5563');
      expect(LIGHT_THEME.colors.textMuted).toBe('#6B7280');
    });

    it('provides pastel action pill container tokens', () => {
      expect(LIGHT_THEME.colors.peach).toBe('#FDEED9');
      expect(LIGHT_THEME.colors.peachText).toBe('#B45309');
      expect(LIGHT_THEME.colors.mint).toBe('#E6F7F0');
      expect(LIGHT_THEME.colors.mintText).toBe('#047857');
      expect(LIGHT_THEME.colors.lavender).toBe('#EDE9FE');
      expect(LIGHT_THEME.colors.lavenderText).toBe('#6D28D9');
      expect(LIGHT_THEME.colors.sky).toBe('#E0F2FE');
      expect(LIGHT_THEME.colors.skyText).toBe('#0369A1');
    });

    it('provides soft diffuse shadows without harsh black drops', () => {
      expect(LIGHT_THEME.shadows.card.shadowOpacity).toBeLessThanOrEqual(0.06);
      expect(LIGHT_THEME.shadows.card.shadowRadius).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Dark Theme (Velvety Charcoal Obsidian & Elevated Slate)', () => {
    it('enforces velvety charcoal obsidian background and slate cards', () => {
      expect(DARK_THEME.colors.background).toBe('#0E1015');
      expect(DARK_THEME.colors.surface).toBe('#171922');
      expect(DARK_THEME.colors.surfaceElevated).toBe('#1F222E');
    });

    it('enforces visible hairline borders for distinct card separation in dark mode', () => {
      expect(DARK_THEME.colors.border).toBe('#282C3A');
      expect(DARK_THEME.colors.border).not.toBe(DARK_THEME.colors.background);
      expect(DARK_THEME.colors.border).not.toBe(DARK_THEME.colors.surface);
    });

    it('enforces accessible high-contrast primary button with dark text', () => {
      expect(DARK_THEME.colors.primaryButton).toBe('#FFFFFF');
      expect(DARK_THEME.colors.primaryButtonText).toBe('#0E1015');
    });

    it('enforces high-contrast readable typography for dark mode with no unreadable muted text', () => {
      expect(DARK_THEME.colors.textPrimary).toBe('#FFFFFF');
      expect(DARK_THEME.colors.textSecondary).toBe('#A1A1AA');
      expect(DARK_THEME.colors.textMuted).toBe('#71717A');
    });

    it('provides dark-adapted pastel action pill container tokens', () => {
      expect(DARK_THEME.colors.peach).toBe('#2A2016');
      expect(DARK_THEME.colors.peachText).toBe('#FBBF24');
      expect(DARK_THEME.colors.mint).toBe('#13281E');
      expect(DARK_THEME.colors.mintText).toBe('#34D399');
      expect(DARK_THEME.colors.lavender).toBe('#221B33');
      expect(DARK_THEME.colors.lavenderText).toBe('#A78BFA');
      expect(DARK_THEME.colors.sky).toBe('#132333');
      expect(DARK_THEME.colors.skyText).toBe('#38BDF8');
    });
  });

  describe('Design System Constants', () => {
    it('enforces standard spacing scale', () => {
      expect(SPACING.xs).toBe(4);
      expect(SPACING.sm).toBe(8);
      expect(SPACING.md).toBe(12);
      expect(SPACING.lg).toBe(16);
      expect(SPACING.xl).toBe(20);
      expect(SPACING.xxl).toBe(24);
    });

    it('enforces rounded border radius scale', () => {
      expect(BORDER_RADIUS.sm).toBe(10);
      expect(BORDER_RADIUS.md).toBe(14);
      expect(BORDER_RADIUS.lg).toBe(18);
      expect(BORDER_RADIUS.xl).toBe(22);
      expect(BORDER_RADIUS.full).toBe(9999);
    });

    it('enforces typography roles and hierarchy', () => {
      expect(DISPLAY_TYPOGRAPHY.hero.fontSize).toBeGreaterThanOrEqual(56);
      expect(BODY_TYPOGRAPHY.body.fontSize).toBe(15);
      expect(BODY_TYPOGRAPHY.h1.fontSize).toBe(24);
    });
  });
});
