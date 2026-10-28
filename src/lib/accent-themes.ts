/**
 * UX redesign — accent theme definitions + WCAG contrast math.
 *
 * Pure functions only (no React, no store access) so the preset table and
 * the custom-accent correction algorithm are unit-testable. The values
 * here are the personalization-spec §1.2 preset table, as CORRECTED by
 * the implementation contrast audit (see tests/accent-themes.test.ts):
 * where a proposed `on` pairing failed 4.5:1 for label text, the `on`
 * value — never the accent — was changed to the nearest passing choice
 * (white vs near-black; one of the two always passes for label text).
 *
 * Mechanism: the app's accent tokens are CSS variables
 * (--accent / --accent-dim / --accent-glow / --accent-text / --accent-on /
 * --accent-subtle). applyAccentVars() writes the resolved set as inline
 * styles on documentElement, which override the :root / .dark defaults.
 * Appearance mode (light/dark) stays a separate control; each preset
 * carries both variants.
 */

export type AppearanceMode = 'light' | 'dark';
export type AccentThemeId = 'vermilion' | 'cobalt' | 'forest' | 'plum' | 'teal' | 'rose' | 'custom';

export interface AccentVariant {
  accent: string;
  dim: string;
  text: string;
  on: string;
  subtle: string;
  glow: string;
}

export interface AccentPreset {
  id: Exclude<AccentThemeId, 'custom'>;
  name: string;
  light: AccentVariant;
  dark: AccentVariant;
}

/** Page backgrounds the accent-text ratio is measured against. */
export const PAGE_BACKGROUND: Record<AppearanceMode, string> = {
  light: '#F3F0E7',
  dark: '#121411',
};

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'vermilion',
    name: 'ASCEND Vermilion',
    light: { accent: '#E44427', dim: '#C7351B', text: '#C7351B', on: '#000000', subtle: '#FDF1EE', glow: 'rgba(228,68,39,0.16)' },
    dark: { accent: '#EB4E30', dim: '#C7351B', text: '#FF7D66', on: '#171916', subtle: 'rgba(228,68,39,0.15)', glow: 'rgba(235,78,48,0.28)' },
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    light: { accent: '#2563EB', dim: '#1D4ED8', text: '#1D4ED8', on: '#FFFFFF', subtle: '#EFF4FF', glow: 'rgba(37,99,235,0.16)' },
    dark: { accent: '#3B82F6', dim: '#2563EB', text: '#93C5FD', on: '#171916', subtle: 'rgba(59,130,246,0.15)', glow: 'rgba(59,130,246,0.28)' },
  },
  {
    id: 'forest',
    name: 'Forest',
    light: { accent: '#15803D', dim: '#166534', text: '#166534', on: '#FFFFFF', subtle: '#F0FDF4', glow: 'rgba(21,128,61,0.16)' },
    dark: { accent: '#4ADE80', dim: '#22C55E', text: '#86EFAC', on: '#052E16', subtle: 'rgba(74,222,128,0.15)', glow: 'rgba(74,222,128,0.28)' },
  },
  {
    id: 'plum',
    name: 'Plum',
    light: { accent: '#9333EA', dim: '#7E22CE', text: '#7E22CE', on: '#FFFFFF', subtle: '#FAF5FF', glow: 'rgba(147,51,234,0.16)' },
    dark: { accent: '#C084FC', dim: '#A855F7', text: '#D8B4FE', on: '#2E1065', subtle: 'rgba(192,132,252,0.15)', glow: 'rgba(192,132,252,0.28)' },
  },
  {
    id: 'teal',
    name: 'Teal',
    light: { accent: '#0F766E', dim: '#115E59', text: '#115E59', on: '#FFFFFF', subtle: '#F0FDFA', glow: 'rgba(15,118,110,0.16)' },
    dark: { accent: '#2DD4BF', dim: '#14B8A6', text: '#5EEAD4', on: '#042F2E', subtle: 'rgba(45,212,191,0.15)', glow: 'rgba(45,212,191,0.28)' },
  },
  {
    id: 'rose',
    name: 'Rose',
    light: { accent: '#E11D48', dim: '#BE123C', text: '#BE123C', on: '#FFFFFF', subtle: '#FFF1F2', glow: 'rgba(225,29,72,0.16)' },
    dark: { accent: '#FB7185', dim: '#F43F5E', text: '#FDA4AF', on: '#4C0519', subtle: 'rgba(251,113,133,0.15)', glow: 'rgba(251,113,133,0.28)' },
  },
];

// ── Color math (WCAG 2.x relative luminance + contrast ratio) ────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const p = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`.toUpperCase();
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

/** WCAG contrast ratio between two hex colors (1–21). Null on bad input. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return rgbToHex(channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255);
}

/**
 * Step lightness in fixed increments until `candidate` meets `minRatio`
 * against `background`, or the bound is hit. Returns the nearest passing
 * shade (same hue — never a different color). Direction: -1 darkens
 * (for light-mode text), +1 lightens (for dark-mode text).
 */
export function stepToRatio(
  hex: string,
  background: string,
  minRatio: number,
  direction: -1 | 1,
): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const STEP = 0.05;
  for (let i = 0; i <= 20; i++) {
    const l = Math.max(0, Math.min(1, hsl.l + direction * STEP * i));
    const candidate = hslToHex(hsl.h, hsl.s, l);
    const ratio = contrastRatio(candidate, background);
    if (ratio !== null && ratio >= minRatio) return candidate;
    if (l === 0 || l === 1) return candidate;
  }
  return hslToHex(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + direction * STEP * 20)));
}

// ── Hex input handling ───────────────────────────────────────────────────

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Accepts #RGB or #RRGGBB; normalizes to #RRGGBB. Null when invalid. */
export function normalizeHex(input: string): string | null {
  const v = input.trim();
  if (!HEX_RE.test(v)) return null;
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return v.toUpperCase();
}

// ── Resolution ───────────────────────────────────────────────────────────

export function getPreset(id: AccentThemeId): AccentPreset | null {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Derive a full custom-accent variant from a requested hex, per
 * personalization-spec §1.3. The requested hex is the accent; the
 * dark-mode accent is the same hue brightened for the dark background;
 * the light-mode accent is the same hue DARKENED until it reads clearly
 * (≥3:1 vs the light background for UI use) — a pale hex no longer
 * ships verbatim and invisible in light mode, it ships corrected (same
 * hue, darker shade) with the corrected note set. Text is stepped
 * until it meets 4.5:1; `on` is white or near-black, whichever meets
 * 4.5:1 against the accent. Returns null on bad input.
 * Also reports whether any derived value differs from the requested
 * hex, so the UI can show the corrected-shade note BEFORE Apply.
 */
export function deriveCustomAccent(
  requestedHex: string,
  mode: AppearanceMode,
): { variant: AccentVariant; correctedNote: string | null } | null {
  const hex = normalizeHex(requestedHex);
  if (!hex) return null;
  const bg = PAGE_BACKGROUND[mode];
  const hsl = hexToHsl(hex);
  if (!hsl) return null;

  // Accent: darkened in light mode until it reads clearly (≥3:1 vs the
  // light background) — stepToRatio returns the hex unchanged when it
  // already passes, so saturated colors are untouched. Brightened in
  // dark mode until ≥3:1 vs the dark background or lightness 0.8, as
  // before. The user's chosen hex is what both derivations start from;
  // only the direction differs per mode.
  let accent = hex;
  if (mode === 'light') {
    accent = stepToRatio(hex, bg, 3, -1);
  } else {
    for (let i = 0; i <= 16; i++) {
      const l = Math.min(0.8, hsl.l + 0.05 * i);
      const candidate = hslToHex(hsl.h, hsl.s, l);
      const ratio = contrastRatio(candidate, bg);
      if (ratio !== null && ratio >= 3) {
        accent = candidate;
        break;
      }
      accent = candidate;
    }
  }

  // Text: step away from the background until ≥4.5:1.
  const direction: -1 | 1 = mode === 'light' ? -1 : 1;
  const text = stepToRatio(accent, bg, 4.5, direction);

  // On: white, then near-black (#171916), then pure black — the first
  // that meets ≥4.5:1 against the accent. The spec's two-choice ladder
  // has a dead zone (accent luminance ~0.183–0.216, which includes
  // vermilion itself: white 4.07, #171916 4.34) where neither passes;
  // pure black closes it (5.15 on vermilion) without touching the accent.
  // The accent itself is never changed to fix an `on` pairing.
  const whiteRatio = contrastRatio('#FFFFFF', accent);
  const blackRatio = contrastRatio('#171916', accent);
  const pureBlackRatio = contrastRatio('#000000', accent);
  const on =
    whiteRatio !== null && whiteRatio >= 4.5
      ? '#FFFFFF'
      : blackRatio !== null && blackRatio >= 4.5
        ? '#171916'
        : '#000000';
  void pureBlackRatio;

  // Dim: one lightness step darker (light) / one step darker than the
  // brightened dark accent; subtle/glow: accent at low alpha.
  const accentHsl = hexToHsl(accent);
  const dim = accentHsl
    ? hslToHex(accentHsl.h, accentHsl.s, Math.max(0, accentHsl.l - 0.07))
    : accent;
  const rgb = hexToRgb(accent);
  const subtle =
    rgb && mode === 'light'
      ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`
      : rgb
        ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`
        : accent;
  const glow = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${mode === 'light' ? 0.16 : 0.28})` : accent;

  // Chip use (Stage 9 audit): accent-text also sits on the accent-subtle
  // wash, whose effective background is the wash blended over the page
  // background. Stepping text further in the same direction only improves
  // the page-background ratio, so step until it passes against the blend
  // too — otherwise the blend shift alone can drop a passing pair below
  // 4.5:1 (vermilion: 4.66 on chalk, 4.49 on its own wash).
  let chipText = text;
  if (rgb) {
    const bgRgb = hexToRgb(bg);
    const alpha = mode === 'light' ? 0.08 : 0.15;
    if (bgRgb) {
      const channels = [rgb.r, rgb.g, rgb.b];
      const bgChannels = [bgRgb.r, bgRgb.g, bgRgb.b];
      const blendedHex = `#${channels
        .map((fg, i) => Math.round(alpha * fg + (1 - alpha) * bgChannels[i]))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
      const chipRatio = contrastRatio(text, blendedHex);
      if (chipRatio !== null && chipRatio < 4.5) {
        chipText = stepToRatio(text, blendedHex, 4.5, direction);
      }
    }
  }

  const variant: AccentVariant = { accent, dim, text: chipText, on, subtle, glow };
  const correctedNote =
    accent.toUpperCase() !== hex.toUpperCase() || chipText.toUpperCase() !== hex.toUpperCase()
      ? `Adjusted for readability — text uses ${chipText}, not ${hex}.`
      : null;
  return { variant, correctedNote };
}

/** Input gate for custom accents (Stage 9 audit, corrected): the light
    variant is now DARKENED by derivation until ≥3:1 vs the light page
    background, so a pale hex no longer blocks Apply — it applies with
    the corrected-shade note. The gate therefore checks the DERIVED
    light variant, not the raw hex: it still blocks (error + no Apply)
    if derivation somehow failed to reach the bar, so an invisible
    accent/focus ring can never ship. The bar is not lowered. */
export function isCustomAccentUsable(hex: string): boolean {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  const derived = deriveCustomAccent(normalized, 'light');
  if (!derived) return false;
  const ratio = contrastRatio(derived.variant.accent, PAGE_BACKGROUND.light);
  return ratio !== null && ratio >= 3;
}

/** Resolve the full variant for a stored theme selection + mode. */
export function resolveAccentVariant(
  theme: AccentThemeId,
  customHex: string | null,
  mode: AppearanceMode,
): AccentVariant {
  if (theme === 'custom' && customHex) {
    const derived = deriveCustomAccent(customHex, mode);
    if (derived) return derived.variant;
  }
  const preset = getPreset(theme === 'custom' ? 'vermilion' : theme);
  if (!preset) return ACCENT_PRESETS[0][mode];
  return preset[mode];
}

/** CSS variable map for a resolved variant (triplets for rgb() uses). */
export function accentVariantToCssVars(v: AccentVariant): Record<string, string> {
  const rgb = hexToRgb(v.accent);
  const dimRgb = hexToRgb(v.dim);
  return {
    '--accent': rgb ? `${rgb.r} ${rgb.g} ${rgb.b}` : v.accent,
    '--accent-dim': dimRgb ? `${dimRgb.r} ${dimRgb.g} ${dimRgb.b}` : v.dim,
    '--accent-glow': v.glow,
    '--accent-hex': v.accent,
    '--accent-text': v.text,
    '--accent-on': v.on,
    '--accent-subtle': v.subtle,
  };
}

/**
 * Write the resolved accent vars as inline styles on documentElement.
 * No-op on the server. Inline styles override the :root / .dark defaults
 * and are re-applied whenever the theme selection or appearance mode
 * changes, so light/dark switches recompute the right variant.
 */
export function applyAccentVars(vars: Record<string, string>): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
}
