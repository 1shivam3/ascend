import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { THEME } from '../../constants/theme';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'surface' | 'glass' | 'elevated';
  accentBorder?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'glass',
  accentBorder,
  onPress,
  style,
  padding = 'md',
}) => {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'glass': return THEME.colors.surfaceGlass;
      case 'elevated': return THEME.colors.surfaceElevated;
      case 'surface':
      default: return THEME.colors.surface;
    }
  };

  const getPadding = () => {
    switch (padding) {
      case 'none': return 0;
      case 'sm': return THEME.spacing.sm;
      case 'lg': return THEME.spacing.lg;
      case 'md':
      default: return THEME.spacing.md;
    }
  };

  const containerStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    padding: getPadding(),
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: accentBorder || THEME.colors.border,
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={onPress}
        style={[styles.card, containerStyle, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, containerStyle, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: THEME.spacing.xs,
    overflow: 'hidden',
  },
});
