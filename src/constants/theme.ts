export const THEME = {
  colors: {
    background: '#0B0D13',
    surface: '#141824',
    surfaceElevated: '#1C2234',
    surfaceGlass: 'rgba(20, 24, 36, 0.85)',
    border: '#283149',
    borderSubtle: '#1C2438',
    borderActive: '#00F0FF',
    
    // Core Tactical Accents
    cyan: '#00F0FF',
    cyanGlow: 'rgba(0, 240, 255, 0.25)',
    amber: '#FFB800',
    amberGlow: 'rgba(255, 184, 0, 0.25)',
    violet: '#8B5CF6',
    violetGlow: 'rgba(139, 92, 246, 0.25)',
    crimson: '#FF3366',
    crimsonGlow: 'rgba(255, 51, 102, 0.25)',
    emerald: '#10B981',
    emeraldGlow: 'rgba(16, 185, 129, 0.25)',

    // Text & Grayscale
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textDisabled: '#475569',
    
    // Overlays
    backdrop: 'rgba(11, 13, 19, 0.8)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    hud: 32,
  },
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    hero: 32,
    display: 40,
  },
} as const;

export type ThemeColors = typeof THEME.colors;
