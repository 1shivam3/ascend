import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../constants/theme';

export interface BadgeProps {
  label: string;
  variant?: 'neutral' | 'cyan' | 'amber' | 'emerald' | 'crimson' | 'violet' | 'accent' | 'peach' | 'mint' | 'lavender' | 'sky';
  dot?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  dot = false,
  size = 'md',
  style,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  const getBadgeColors = () => {
    switch (variant) {
      case 'accent':
        return {
          color: colors.accent,
          bg: colors.accentSubtle,
          border: isDark ? 'rgba(142, 164, 50, 0.35)' : 'rgba(114, 132, 36, 0.20)',
        };
      case 'peach':
        return {
          color: colors.peachText,
          bg: colors.peach,
          border: isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(180, 83, 9, 0.15)',
        };
      case 'mint':
        return {
          color: colors.mintText,
          bg: colors.mint,
          border: isDark ? 'rgba(52, 211, 153, 0.3)' : 'rgba(4, 120, 87, 0.15)',
        };
      case 'lavender':
        return {
          color: colors.lavenderText,
          bg: colors.lavender,
          border: isDark ? 'rgba(167, 139, 250, 0.3)' : 'rgba(109, 40, 217, 0.15)',
        };
      case 'sky':
        return {
          color: colors.skyText,
          bg: colors.sky,
          border: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(3, 105, 161, 0.15)',
        };
      case 'cyan':
        return {
          color: colors.cyan,
          bg: colors.cyanSubtle,
          border: isDark ? 'rgba(56, 189, 248, 0.3)' : colors.border,
        };
      case 'amber':
        return {
          color: colors.amber,
          bg: colors.amberSubtle,
          border: isDark ? 'rgba(245, 158, 11, 0.3)' : colors.border,
        };
      case 'emerald':
        return {
          color: colors.emerald,
          bg: colors.emeraldSubtle,
          border: isDark ? 'rgba(16, 185, 129, 0.3)' : colors.border,
        };
      case 'crimson':
        return {
          color: colors.crimson,
          bg: colors.crimsonSubtle,
          border: isDark ? 'rgba(239, 68, 68, 0.3)' : colors.border,
        };
      case 'violet':
        return {
          color: colors.violet,
          bg: colors.violetSubtle,
          border: isDark ? 'rgba(139, 92, 246, 0.3)' : colors.border,
        };
      case 'neutral':
      default:
        return {
          color: colors.textSecondary,
          bg: colors.surfaceElevated,
          border: colors.border,
        };
    }
  };

  const { color, bg, border } = getBadgeColors();
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: borderRadius.sm,
          paddingHorizontal: isSmall ? 6 : 9,
          paddingVertical: isSmall ? 2 : 4,
        },
        style,
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text
        style={[
          styles.text,
          {
            color,
            fontSize: isSmall ? 10 : 11,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
