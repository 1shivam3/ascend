import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';

export interface SubtleContainerProps {
  children: React.ReactNode;
  variant?: 'flat' | 'elevated' | 'bordered' | 'ghost';
  padding?: keyof typeof THEME.spacing;
  accentBorder?: string;
  style?: StyleProp<ViewStyle>;
}

export const SubtleContainer: React.FC<SubtleContainerProps> = ({
  children,
  variant = 'flat',
  padding = 'md',
  accentBorder,
  style,
}) => {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'elevated': return THEME.colors.surfaceElevated;
      case 'ghost': return 'transparent';
      case 'bordered':
      case 'flat':
      default: return THEME.colors.surface;
    }
  };

  const getBorderColor = () => {
    if (accentBorder) return accentBorder;
    if (variant === 'bordered') return THEME.colors.border;
    return THEME.colors.borderSubtle;
  };

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          padding: THEME.spacing[padding],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
  },
});
