import React from 'react';
import {
  TouchableOpacity,
  Text as RNText,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { THEME } from '../../constants/theme';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  hapticFeedback?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconRight,
  style,
  textStyle,
  hapticFeedback = true,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;
    if (hapticFeedback) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Safe fallback if unsupported
      }
    }
    onPress();
  };

  const getBackgroundColor = () => {
    if (disabled) return THEME.colors.surfaceElevated;
    switch (variant) {
      case 'primary': return THEME.colors.cyan;
      case 'secondary': return THEME.colors.surfaceElevated;
      case 'outline': return 'transparent';
      case 'ghost': return 'transparent';
      case 'danger': return THEME.colors.crimson;
      default: return THEME.colors.cyan;
    }
  };

  const getTextColor = () => {
    if (disabled) return THEME.colors.textDisabled;
    switch (variant) {
      case 'primary': return '#000000'; // High contrast black text on cyan
      case 'secondary': return THEME.colors.textPrimary;
      case 'outline': return THEME.colors.cyan;
      case 'ghost': return THEME.colors.textSecondary;
      case 'danger': return '#FFFFFF';
      default: return '#000000';
    }
  };

  const getBorderColor = () => {
    if (disabled) return THEME.colors.borderSubtle;
    switch (variant) {
      case 'outline': return THEME.colors.cyan;
      case 'secondary': return THEME.colors.border;
      case 'danger': return THEME.colors.crimson;
      default: return 'transparent';
    }
  };

  const getHeight = () => {
    switch (size) {
      case 'sm': return 36;
      case 'lg': return 54;
      case 'md':
      default: return 46;
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm': return THEME.typography.fontSizes.sm;
      case 'lg': return THEME.typography.fontSizes.lg;
      case 'md':
      default: return THEME.typography.fontSizes.md;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        styles.base,
        {
          height: getHeight(),
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <>
          {icon ? <>{icon}</> : null}
          <RNText
            style={[
              styles.text,
              {
                color: getTextColor(),
                fontSize: getFontSize(),
              },
              icon ? { marginLeft: 8 } : undefined,
              iconRight ? { marginRight: 8 } : undefined,
              textStyle,
            ]}
          >
            {title}
          </RNText>
          {iconRight ? <>{iconRight}</> : null}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
