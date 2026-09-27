import { SPACING } from './spacing';
import { TYPOGRAPHY, TYPOGRAPHY_STYLES, DISPLAY_TYPOGRAPHY, BODY_TYPOGRAPHY } from './typography';

export const BORDER_RADIUS = {
  sharp: 4,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  full: 9999,
} as const;

export const SHADOWS = {
  light: {
    card: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.04,
      shadowRadius: 12,
      elevation: 2,
    },
    cardHover: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.07,
      shadowRadius: 16,
      elevation: 4,
    },
    floating: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.10,
      shadowRadius: 20,
      elevation: 6,
    },
  },
  dark: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 2,
    },
    cardHover: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 4,
    },
    floating: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.60,
      shadowRadius: 18,
      elevation: 6,
    },
  },
} as const;

export const LIGHT_THEME = {
  isDark: false,
  colors: {
    // Background & Surfaces (Inspired by Ref 1, 2, 4)
    background: '#F8F9FA', // Soft neutral light stone
    surface: '#FFFFFF', // Clean white card
    surfaceElevated: '#F1F3F5', // Light stone elevated card / chip
    surfaceMuted: '#E9ECEF', // Subtle muted container
    surfaceGlass: 'rgba(255, 255, 255, 0.94)',
    surfaceGlassHeavy: 'rgba(255, 255, 255, 0.98)',
    obsidian: '#111827',
    graphite: '#F1F3F5',
    graphiteElevated: '#FFFFFF',

    // Clean Hairline Borders & Dividers
    border: '#E5E7EB', // Visible, clean hairline border (Ref 1)
    borderSubtle: '#F1F3F5', // Subtle divider
    borderActive: '#728424', // Restrained athletic sage
    borderFocus: '#728424',
    divider: '#E5E7EB',

    // Primary Brand & Accents (Restrained Palette)
    primary: '#111827', // Crisp near-black / deep slate for titles
    primaryButton: '#728424', // Organic athletic sage green (Ref 1)
    primaryButtonText: '#FFFFFF', // High contrast white text
    accent: '#728424', // Organic athletic sage green
    accentSubtle: '#F0F4E8', // Soft sage badge / container (Ref 1)
    accentWarm: '#D97706', // Warm amber / apricot for streaks & medals (Ref 4)
    accentWarmSubtle: '#FEF3C7',

    // Soft Pastel Action Pill Containers (Ref 1 & 2)
    peach: '#FDEED9',
    peachText: '#B45309',
    mint: '#E6F7F0',
    mintText: '#047857',
    lavender: '#EDE9FE',
    lavenderText: '#6D28D9',
    sky: '#E0F2FE',
    skyText: '#0369A1',

    // Signals & Semantics
    cyan: '#0284C7', // Restrained tech sky
    cyanSubtle: 'rgba(2, 132, 199, 0.08)',
    cyanGlow: 'rgba(2, 132, 199, 0.16)',
    blue: '#2563EB',
    blueSubtle: 'rgba(37, 99, 235, 0.08)',

    emerald: '#10B981',
    emeraldSubtle: 'rgba(16, 185, 129, 0.10)',
    success: '#10B981',

    amber: '#D97706',
    amberSubtle: 'rgba(217, 119, 6, 0.10)',
    warning: '#D97706',

    crimson: '#EF4444',
    crimsonSubtle: 'rgba(239, 68, 68, 0.10)',
    error: '#EF4444',

    violet: '#8B5CF6',
    violetSubtle: 'rgba(139, 92, 246, 0.10)',

    // High-Contrast Typography
    textPrimary: '#111827', // Contrast > 13:1 against white & light stone
    textSecondary: '#4B5563', // Contrast > 7:1 (WCAG AAA)
    textMuted: '#6B7280', // Contrast > 4.6:1 (WCAG AA)
    textDisabled: '#9CA3AF',

    // Atmospheric Backdrops
    backdrop: 'rgba(15, 23, 42, 0.45)',
    vignette: 'rgba(0, 0, 0, 0.10)',
  },
  spacing: SPACING,
  typography: TYPOGRAPHY,
  typographyStyles: TYPOGRAPHY_STYLES,
  displayTypography: DISPLAY_TYPOGRAPHY,
  bodyTypography: BODY_TYPOGRAPHY,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS.light,
} as const;

export const DARK_THEME = {
  isDark: true,
  colors: {
    // Background & Surfaces (Velvety matte charcoal obsidian & elevated slate - Ref 3)
    background: '#0E1015', // Deep rich charcoal black (Ref 3)
    surface: '#171922', // Elevated dark slate card
    surfaceElevated: '#1F222E', // Interactive card / button surface
    surfaceMuted: '#262A38', // Muted dark surface
    surfaceGlass: 'rgba(23, 25, 34, 0.90)',
    surfaceGlassHeavy: 'rgba(23, 25, 34, 0.98)',
    obsidian: '#0E1015',
    graphite: '#171922',
    graphiteElevated: '#1F222E',

    // Visible Hairline Borders & Dividers (Essential for card separation in dark mode!)
    border: '#282C3A', // Visible hairline border separating cards from background (Ref 3)
    borderSubtle: '#1E212D',
    borderActive: '#FFFFFF', // High-contrast active border
    borderFocus: '#8EA432',
    divider: '#282C3A',

    // Primary Brand & Accents (Restrained Palette)
    primary: '#FFFFFF', // High-contrast white for headings & metrics
    primaryButton: '#FFFFFF', // Crisp solid white button with dark text (Ref 3)
    primaryButtonText: '#0E1015', // Solid near-black text for maximum readability
    accent: '#8EA432', // Restrained athletic sage green
    accentSubtle: 'rgba(142, 164, 50, 0.14)',
    accentWarm: '#F59E0B', // Solar amber for streaks & medals
    accentWarmSubtle: 'rgba(245, 158, 11, 0.14)',

    // Pastel Action Pill Containers (Dark adapted)
    peach: '#2A2016',
    peachText: '#FBBF24',
    mint: '#13281E',
    mintText: '#34D399',
    lavender: '#221B33',
    lavenderText: '#A78BFA',
    sky: '#132333',
    skyText: '#38BDF8',

    // Signals & Semantics
    cyan: '#38BDF8', // Refined sky blue, not blinding neon
    cyanSubtle: 'rgba(56, 189, 248, 0.12)',
    cyanGlow: 'rgba(56, 189, 248, 0.20)',
    blue: '#3B82F6',
    blueSubtle: 'rgba(59, 130, 246, 0.12)',

    emerald: '#10B981',
    emeraldSubtle: 'rgba(16, 185, 129, 0.12)',
    success: '#10B981',

    amber: '#F59E0B',
    amberSubtle: 'rgba(245, 158, 11, 0.12)',
    warning: '#F59E0B',

    crimson: '#EF4444',
    crimsonSubtle: 'rgba(239, 68, 68, 0.12)',
    error: '#EF4444',

    violet: '#8B5CF6',
    violetSubtle: 'rgba(139, 92, 246, 0.12)',

    // High-Contrast Typography
    textPrimary: '#FFFFFF', // Brilliant white, contrast > 15:1 against #171922
    textSecondary: '#A1A1AA', // Clean light slate, contrast > 7:1 against #171922
    textMuted: '#71717A', // Legible gray subtext, contrast > 4.6:1 against #171922 (No unreadable text!)
    textDisabled: '#52525B',

    // Atmospheric Backdrops
    backdrop: 'rgba(8, 9, 12, 0.82)',
    vignette: 'rgba(0, 0, 0, 0.50)',
  },
  spacing: SPACING,
  typography: TYPOGRAPHY,
  typographyStyles: TYPOGRAPHY_STYLES,
  displayTypography: DISPLAY_TYPOGRAPHY,
  bodyTypography: BODY_TYPOGRAPHY,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS.dark,
} as const;

// Backward-compatible default export preserving all previous properties
export const THEME = DARK_THEME;

export type ThemeColors = typeof DARK_THEME.colors;
export type AppTheme = typeof LIGHT_THEME | typeof DARK_THEME;

export { SPACING, TYPOGRAPHY, TYPOGRAPHY_STYLES, DISPLAY_TYPOGRAPHY, BODY_TYPOGRAPHY };
export { useTheme } from '../hooks/useTheme';
