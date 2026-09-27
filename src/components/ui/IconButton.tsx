import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../constants/theme';

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'surface' | 'ghost' | 'tinted' | 'primary';
  tintColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  size = 'md',
  variant = 'surface',
  tintColor,
  disabled = false,
  style,
  accessibilityLabel,
}) => {
  const { colors, borderRadius } = useTheme();

  const handlePress = () => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore unsupported
    }
    onPress();
  };

  const dimensions = size === 'sm' ? 36 : size === 'lg' ? 48 : 44;
  const hitSlopValue = Math.max(0, (48 - dimensions) / 2);

  const getBackgroundColor = () => {
    if (disabled) return colors.surfaceElevated;
    switch (variant) {
      case 'primary':
        return colors.primary;
      case 'tinted':
        return tintColor ? `${tintColor}15` : colors.accentSubtle;
      case 'ghost':
        return 'transparent';
      case 'surface':
      default:
        return colors.surfaceElevated;
    }
  };

  const getBorderColor = () => {
    if (variant === 'surface') return colors.border;
    return 'transparent';
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{
        top: hitSlopValue,
        bottom: hitSlopValue,
        left: hitSlopValue,
        right: hitSlopValue,
      }}
      style={[
        styles.button,
        {
          width: dimensions,
          height: dimensions,
          borderRadius: borderRadius.full,
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'surface' ? 1 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {icon}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
