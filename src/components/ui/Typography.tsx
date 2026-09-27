import React from 'react';
import { Text as RNText, TextStyle, StyleProp } from 'react-native';
import { useTheme } from '../../constants/theme';

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
  color,
  align = 'left',
  numberOfLines,
}) => {
  const { colors, typographyStyles } = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        typographyStyles.body,
        { color: color ?? colors.textPrimary, textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

export const Heading: React.FC<BaseTypographyProps & { level?: 1 | 2 | 3 }> = ({
  children,
  style,
  color,
  align = 'left',
  level = 1,
  numberOfLines,
}) => {
  const { colors, typographyStyles } = useTheme();
  const baseStyle =
    level === 1
      ? typographyStyles.h1
      : level === 2
      ? typographyStyles.h2
      : typographyStyles.h3;
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        baseStyle,
        { color: color ?? colors.textPrimary, textAlign: align },
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
  color,
  align = 'left',
  numberOfLines,
}) => {
  const { colors, typographyStyles } = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        typographyStyles.bodyBold,
        { color: color ?? colors.textSecondary, textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

export const StatText: React.FC<BaseTypographyProps & { size?: 'hero' | 'display' | 'md' }> = ({
  children,
  style,
  color,
  align = 'left',
  size = 'display',
  numberOfLines,
}) => {
  const { colors, typographyStyles } = useTheme();
  const baseStyle =
    size === 'hero'
      ? typographyStyles.heroStat
      : size === 'md'
      ? typographyStyles.monoNumber
      : typographyStyles.displayStat;

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        baseStyle,
        { color: color ?? colors.textPrimary, textAlign: align },
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
  color,
  align = 'left',
  upper = false,
  numberOfLines,
}) => {
  const { colors, typographyStyles } = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        upper ? typographyStyles.labelUpper : typographyStyles.caption,
        { color: color ?? colors.textMuted, textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

export const MonoText: React.FC<BaseTypographyProps> = ({
  children,
  style,
  color,
  align = 'left',
  numberOfLines,
}) => {
  const { colors, typographyStyles } = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        typographyStyles.monoNumber,
        { color: color ?? colors.textPrimary, textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};
