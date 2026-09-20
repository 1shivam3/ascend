import { SPACING } from './spacing';
import { TYPOGRAPHY, TYPOGRAPHY_STYLES } from './typography';

export const THEME = {
  colors: {
    // Backgrounds & Base
    background: '#090B10',
    surface: '#121622',
    surfaceElevated: '#1A2030',
    surfaceGlass: 'rgba(18, 22, 34, 0.75)',
    surfaceGlassHeavy: 'rgba(18, 22, 34, 0.92)',
    
    // Sharp borders
    border: '#1F293D',
    borderSubtle: '#161E2E',
    borderActive: '#00E5FF',
    borderFocus: '#0070F3',
    
    // Core Athletic / Cyberpunk Accents (Restrained & High Contrast)
    cyan: '#00E5FF',
    cyanSubtle: 'rgba(0, 229, 255, 0.12)',
    blue: '#0070F3',
    blueSubtle: 'rgba(0, 112, 243, 0.12)',
    amber: '#F59E0B',
    amberSubtle: 'rgba(245, 158, 11, 0.12)',
    emerald: '#10B981',
    emeraldSubtle: 'rgba(16, 185, 129, 0.12)',
    crimson: '#EF4444',
    crimsonSubtle: 'rgba(239, 68, 68, 0.12)',
    violet: '#8B5CF6',
    violetSubtle: 'rgba(139, 92, 246, 0.12)',

    // Text & Grayscale
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textDisabled: '#475569',
    
    // Overlays
    backdrop: 'rgba(9, 11, 16, 0.85)',
  },
  spacing: SPACING,
  typography: TYPOGRAPHY,
  typographyStyles: TYPOGRAPHY_STYLES,
  borderRadius: {
    sharp: 4,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },
} as const;

export type ThemeColors = typeof THEME.colors;
export { SPACING, TYPOGRAPHY, TYPOGRAPHY_STYLES };
