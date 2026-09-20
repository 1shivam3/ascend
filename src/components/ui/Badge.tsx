import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';

export interface BadgeProps {
  label: string;
  variant?: 'neutral' | 'cyan' | 'amber' | 'emerald' | 'crimson' | 'violet';
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
  const getBadgeColors = () => {
    switch (variant) {
      case 'cyan':
        return { color: THEME.colors.cyan, bg: THEME.colors.cyanSubtle, border: THEME.colors.cyan };
      case 'amber':
        return { color: THEME.colors.amber, bg: THEME.colors.amberSubtle, border: THEME.colors.amber };
      case 'emerald':
        return { color: THEME.colors.emerald, bg: THEME.colors.emeraldSubtle, border: THEME.colors.emerald };
      case 'crimson':
        return { color: THEME.colors.crimson, bg: THEME.colors.crimsonSubtle, border: THEME.colors.crimson };
      case 'violet':
        return { color: THEME.colors.violet, bg: THEME.colors.violetSubtle, border: THEME.colors.violet };
      case 'neutral':
      default:
        return { color: THEME.colors.textSecondary, bg: THEME.colors.surfaceElevated, border: THEME.colors.border };
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
          paddingHorizontal: isSmall ? 6 : 9,
          paddingVertical: isSmall ? 2 : 4,
        },
        style,
      ]}
    >
      {dot && (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
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
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
