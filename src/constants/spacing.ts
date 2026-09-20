export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  hud: 32,
  hero: 48,
} as const;

export type SpacingKey = keyof typeof SPACING;
