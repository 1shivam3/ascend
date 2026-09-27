import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useTheme } from '../../constants/theme';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'surface' | 'glass' | 'elevated' | 'soft' | 'outlined';
  accentBorder?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'surface',
  accentBorder,
  onPress,
  style,
  padding = 'md',
}) => {
  const { colors, borderRadius, shadows, spacing, isDark } = useTheme();

  const getBackgroundColor = () => {
    switch (variant) {
      case 'glass':
        return colors.surfaceGlass;
      case 'elevated':
        return colors.surfaceElevated;
      case 'soft':
        return isDark ? colors.surfaceElevated : colors.surfaceMuted;
      case 'outlined':
        return 'transparent';
      case 'surface':
      default:
        return colors.surface;
    }
  };

  const getPadding = () => {
    switch (padding) {
      case 'none':
        return 0;
      case 'sm':
        return spacing.sm;
      case 'lg':
        return spacing.lg;
      case 'md':
      default:
        return spacing.md;
    }
  };

  const containerStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    padding: getPadding(),
    borderRadius: borderRadius.lg, // 18px rounded card
    borderWidth: 1,
    borderColor: accentBorder || colors.border,
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={onPress}
        style={[
          styles.card,
          containerStyle,
          variant !== 'outlined' ? shadows.card : null,
          style,
        ]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.card,
        containerStyle,
        variant !== 'outlined' ? shadows.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 4,
    overflow: 'hidden',
  },
});
