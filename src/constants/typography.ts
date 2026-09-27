import { TextStyle, Platform } from 'react-native';

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const TYPOGRAPHY = {
  fontSizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    displaySm: 30,
    displayMd: 38,
    displayLg: 48,
    hero: 56,
  },
  fontWeights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  } as const,
  lineHeights: {
    tight: 1.1,
    normal: 1.35,
    relaxed: 1.5,
  },
  letterSpacing: {
    tighter: -0.8,
    tight: -0.4,
    normal: 0,
    wide: 0.8,
    wider: 1.5,
    widest: 2.5,
  },
  fonts: {
    mono: MONO_FONT,
  },
} as const;

/**
 * DISPLAY Role:
 * For levels, ranks, XP, milestones, and major numbers.
 * Technical, powerful, readable, and athletic.
 */
export const DISPLAY_TYPOGRAPHY: Record<string, TextStyle> = {
  hero: {
    fontSize: TYPOGRAPHY.fontSizes.hero,
    fontWeight: TYPOGRAPHY.fontWeights.black,
    letterSpacing: TYPOGRAPHY.letterSpacing.tighter,
    fontFamily: TYPOGRAPHY.fonts.mono,
  },
  rank: {
    fontSize: TYPOGRAPHY.fontSizes.displayLg,
    fontWeight: TYPOGRAPHY.fontWeights.black,
    letterSpacing: TYPOGRAPHY.letterSpacing.tight,
    textTransform: 'uppercase',
  },
  levelNumber: {
    fontSize: TYPOGRAPHY.fontSizes.displayMd,
    fontWeight: TYPOGRAPHY.fontWeights.black,
    fontFamily: TYPOGRAPHY.fonts.mono,
    letterSpacing: TYPOGRAPHY.letterSpacing.tighter,
  },
  statNumber: {
    fontSize: TYPOGRAPHY.fontSizes.displaySm,
    fontWeight: TYPOGRAPHY.fontWeights.bold,
    fontFamily: TYPOGRAPHY.fonts.mono,
    letterSpacing: TYPOGRAPHY.letterSpacing.tight,
  },
  monoMetric: {
    fontSize: TYPOGRAPHY.fontSizes.xl,
    fontWeight: TYPOGRAPHY.fontWeights.bold,
    fontFamily: TYPOGRAPHY.fonts.mono,
  },
};

/**
 * BODY Role:
 * For normal UI text, descriptions, lists, forms, and controls.
 * Clean, readable, balanced contrast.
 */
export const BODY_TYPOGRAPHY: Record<string, TextStyle> = {
  h1: {
    fontSize: TYPOGRAPHY.fontSizes.xxl,
    fontWeight: TYPOGRAPHY.fontWeights.extrabold,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },
  h2: {
    fontSize: TYPOGRAPHY.fontSizes.xl,
    fontWeight: TYPOGRAPHY.fontWeights.bold,
    letterSpacing: TYPOGRAPHY.letterSpacing.normal,
  },
  h3: {
    fontSize: TYPOGRAPHY.fontSizes.lg,
    fontWeight: TYPOGRAPHY.fontWeights.bold,
    letterSpacing: TYPOGRAPHY.letterSpacing.normal,
  },
  body: {
    fontSize: TYPOGRAPHY.fontSizes.md,
    fontWeight: TYPOGRAPHY.fontWeights.regular,
    lineHeight: 22,
  },
  bodyBold: {
    fontSize: TYPOGRAPHY.fontSizes.md,
    fontWeight: TYPOGRAPHY.fontWeights.bold,
    lineHeight: 22,
  },
  caption: {
    fontSize: TYPOGRAPHY.fontSizes.xs,
    fontWeight: TYPOGRAPHY.fontWeights.medium,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },
  labelUpper: {
    fontSize: TYPOGRAPHY.fontSizes.xs,
    fontWeight: TYPOGRAPHY.fontWeights.extrabold,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
    textTransform: 'uppercase',
  },
};

export const TYPOGRAPHY_STYLES: Record<string, TextStyle> = {
  heroStat: DISPLAY_TYPOGRAPHY.hero,
  displayStat: DISPLAY_TYPOGRAPHY.levelNumber,
  h1: BODY_TYPOGRAPHY.h1,
  h2: BODY_TYPOGRAPHY.h2,
  h3: BODY_TYPOGRAPHY.h3,
  body: BODY_TYPOGRAPHY.body,
  bodyBold: BODY_TYPOGRAPHY.bodyBold,
  caption: BODY_TYPOGRAPHY.caption,
  labelUpper: BODY_TYPOGRAPHY.labelUpper,
  monoNumber: {
    fontSize: TYPOGRAPHY.fontSizes.md,
    fontWeight: TYPOGRAPHY.fontWeights.bold,
    fontFamily: TYPOGRAPHY.fonts.mono,
  },
};
