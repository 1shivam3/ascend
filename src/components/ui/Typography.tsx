import React from 'react';
import { Text as RNText, TextStyle, StyleProp } from 'react-native';
import { THEME } from '../../constants/theme';

interface BaseTypographyProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
}

export const Text: React.FC<BaseTypographyProps> = ({
  children,
  style,
  color = THEME.colors.textPrimary,
  align = 'left',
  numberOfLines,
}) => (
  <RNText
    numberOfLines={numberOfLines}
    style={[
      THEME.typographyStyles.body,
      { color, textAlign: align },
      style,
    ]}
  >
    {children}
  </RNText>
);

export const Heading: React.FC<BaseTypographyProps & { level?: 1 | 2 | 3 }> = ({
  children,
  style,
  color = THEME.colors.textPrimary,
  align = 'left',
  level = 1,
  numberOfLines,
}) => {
  const baseStyle = level === 1 ? THEME.typographyStyles.h1 : level === 2 ? THEME.typographyStyles.h2 : THEME.typographyStyles.h3;
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        baseStyle,
        { color, textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

export const Subheading: React.FC<BaseTypographyProps> = ({
  children,
  style,
  color = THEME.colors.textSecondary,
  align = 'left',
  numberOfLines,
}) => (
  <RNText
    numberOfLines={numberOfLines}
    style={[
      THEME.typographyStyles.bodyBold,
      { color, textAlign: align },
      style,
    ]}
  >
    {children}
  </RNText>
);

export const StatText: React.FC<BaseTypographyProps & { size?: 'hero' | 'display' | 'md' }> = ({
  children,
  style,
  color = THEME.colors.textPrimary,
  align = 'left',
  size = 'display',
  numberOfLines,
}) => {
  const baseStyle = size === 'hero' 
    ? THEME.typographyStyles.heroStat 
    : size === 'md' 
    ? THEME.typographyStyles.monoNumber 
    : THEME.typographyStyles.displayStat;

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        baseStyle,
        { color, textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

export const Caption: React.FC<BaseTypographyProps & { upper?: boolean }> = ({
  children,
  style,
  color = THEME.colors.textMuted,
  align = 'left',
  upper = false,
  numberOfLines,
}) => (
  <RNText
    numberOfLines={numberOfLines}
    style={[
      upper ? THEME.typographyStyles.labelUpper : THEME.typographyStyles.caption,
      { color, textAlign: align },
      style,
    ]}
  >
    {children}
  </RNText>
);

export const MonoText: React.FC<BaseTypographyProps> = ({
  children,
  style,
  color = THEME.colors.textPrimary,
  align = 'left',
  numberOfLines,
}) => (
  <RNText
    numberOfLines={numberOfLines}
    style={[
      THEME.typographyStyles.monoNumber,
      { color, textAlign: align },
      style,
    ]}
  >
    {children}
  </RNText>
);
