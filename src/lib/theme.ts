/**
 * ASCEND Theme & Accent Personalization Engine
 *
 * Implements the curated accent theme presets with WCAG 2.2 AA contrast protection,
 * CSS variable injection, and persistent theme application.
 */

export type AccentPreset = 'vermilion' | 'amber' | 'cobalt' | 'emerald' | 'silver' | 'crimson' | 'custom';

export interface ThemePresetDefinition {
  id: AccentPreset;
  name: string;
  tagline: string;
  light: {
    hex: string;
    rgb: string;        // 'R G B' for Tailwind / CSS vars
    dimHex: string;
    dimRgb: string;
    glow: string;
    textHex: string;    // accessible text on Chalk light background
    onAccentHex: string;// text on top of the accent button
  };
  dark: {
    hex: string;
    rgb: string;
    dimHex: string;
    dimRgb: string;
    glow: string;
    textHex: string;    // accessible text on Graphite dark background
    onAccentHex: string;
  };
}

export const THEME_PRESETS: Record<Exclude<AccentPreset, 'custom'>, ThemePresetDefinition> = {
  vermilion: {
    id: 'vermilion',
    name: 'ASCEND Vermilion',
    tagline: 'Authentic athletic flame (Default)',
    light: {
      hex: '#E44427',
      rgb: '228 68 39',
      dimHex: '#C7351B',
      dimRgb: '199 53 27',
      glow: 'rgba(228, 68, 39, 0.20)',
      textHex: '#C7351B',
      onAccentHex: '#FFFFFF',
    },
    dark: {
      hex: '#EB4E30',
      rgb: '235 78 48',
      dimHex: '#C7351B',
      dimRgb: '199 53 27',
      glow: 'rgba(235, 78, 48, 0.28)',
      textHex: '#FF7D66',
      onAccentHex: '#FFFFFF',
    },
  },
  amber: {
    id: 'amber',
    name: 'Volt Amber',
    tagline: 'Warm, high-energy focus',
    light: {
      hex: '#D97706',
      rgb: '217 119 6',
      dimHex: '#B45309',
      dimRgb: '180 83 9',
      glow: 'rgba(245, 158, 11, 0.20)',
      textHex: '#92400E',
      onAccentHex: '#FFFFFF',
    },
    dark: {
      hex: '#F59E0B',
      rgb: '245 158 11',
      dimHex: '#D97706',
      dimRgb: '217 119 6',
      glow: 'rgba(245, 158, 11, 0.28)',
      textHex: '#FBBF24',
      onAccentHex: '#171916',
    },
  },
  cobalt: {
    id: 'cobalt',
    name: 'Electric Cobalt',
    tagline: 'Technical, iron-discipline steel',
    light: {
      hex: '#2563EB',
      rgb: '37 99 235',
      dimHex: '#1D4ED8',
      dimRgb: '29 78 216',
      glow: 'rgba(37, 99, 235, 0.20)',
      textHex: '#1E40AF',
      onAccentHex: '#FFFFFF',
    },
    dark: {
      hex: '#3B82F6',
      rgb: '59 130 246',
      dimHex: '#2563EB',
      dimRgb: '37 99 235',
      glow: 'rgba(59, 130, 246, 0.28)',
      textHex: '#60A5FA',
      onAccentHex: '#FFFFFF',
    },
  },
  emerald: {
    id: 'emerald',
    name: 'Hyper Emerald',
    tagline: 'Endurance, vitality & longevity',
    light: {
      hex: '#059669',
      rgb: '5 150 105',
      dimHex: '#047857',
      dimRgb: '4 120 87',
      glow: 'rgba(16, 185, 129, 0.20)',
      textHex: '#065F46',
      onAccentHex: '#FFFFFF',
    },
    dark: {
      hex: '#10B981',
      rgb: '16 185 129',
      dimHex: '#059669',
      dimRgb: '5 150 105',
      glow: 'rgba(16, 185, 129, 0.28)',
      textHex: '#34D399',
      onAccentHex: '#171916',
    },
  },
  silver: {
    id: 'silver',
    name: 'Monochrome Silver',
    tagline: 'Minimalist, calm chalk studio',
    light: {
      hex: '#5E615A',
      rgb: '94 97 90',
      dimHex: '#454841',
      dimRgb: '69 72 65',
      glow: 'rgba(133, 128, 118, 0.20)',
      textHex: '#2C302B',
      onAccentHex: '#FFFFFF',
    },
    dark: {
      hex: '#A5A9A1',
      rgb: '165 169 161',
      dimHex: '#8B8F87',
      dimRgb: '139 143 135',
      glow: 'rgba(226, 223, 214, 0.20)',
      textHex: '#F3F0E7',
      onAccentHex: '#171916',
    },
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Power',
    tagline: 'Maximum power & PR aggression',
    light: {
      hex: '#DC2626',
      rgb: '220 38 38',
      dimHex: '#B91C1C',
      dimRgb: '185 28 28',
      glow: 'rgba(220, 38, 38, 0.20)',
      textHex: '#991B1B',
      onAccentHex: '#FFFFFF',
    },
    dark: {
      hex: '#EF4444',
      rgb: '239 68 68',
      dimHex: '#DC2626',
      dimRgb: '220 38 38',
      glow: 'rgba(239, 68, 68, 0.28)',
      textHex: '#F87171',
      onAccentHex: '#FFFFFF',
    },
  },
};

/**
 * Converts a hex code to an RGB triplet string 'R G B'
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number; triplet: string } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6 && clean.length !== 3) return null;
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = parseInt(full, 16);
  if (isNaN(num)) return null;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return { r, g, b, triplet: `${r} ${g} ${b}` };
}

/**
 * Computes luminance to calculate accessible contrast ratios.
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Applies the active theme preset or custom color to the document root CSS variables.
 */
export function applyAccentTheme(
  preset: AccentPreset = 'vermilion',
  customHex?: string,
  isDark = true
) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (preset === 'custom' && customHex) {
    const rgb = hexToRgb(customHex);
    if (rgb) {
      const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
      const onAccent = lum > 0.4 ? '#171916' : '#FFFFFF';
      root.style.setProperty('--accent', rgb.triplet);
      root.style.setProperty('--accent-dim', rgb.triplet);
      root.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
      root.style.setProperty('--accent-hex', customHex);
      root.style.setProperty('--accent-on', onAccent);
      root.style.setProperty('--accent-text', customHex);
      return;
    }
  }

  // Fallback / standard preset resolution
  const def = THEME_PRESETS[preset === 'custom' ? 'vermilion' : preset] || THEME_PRESETS.vermilion;
  const values = isDark ? def.dark : def.light;

  root.style.setProperty('--accent', values.rgb);
  root.style.setProperty('--accent-dim', values.dimRgb);
  root.style.setProperty('--accent-glow', values.glow);
  root.style.setProperty('--accent-hex', values.hex);
  root.style.setProperty('--accent-on', values.onAccentHex);
  root.style.setProperty('--accent-text', values.textHex);
}
