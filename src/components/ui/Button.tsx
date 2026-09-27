import React from 'react';
import {
  TouchableOpacity,
  Text as RNText,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../constants/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'icon'
  | 'danger'
  | 'PRIMARY'
  | 'SECONDARY'
  | 'OUTLINE'
  | 'GHOST'
  | 'DESTRUCTIVE'
  | 'ICON';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title?: string;
  children?: React.ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  hapticFeedback?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  style,
  textStyle,
  hapticFeedback = true,
  accessibilityLabel,
  testID,
}) => {
  const { colors, borderRadius, shadows, isDark } = useTheme();

  // Normalize variant string
  const normalizedVariant = (variant || 'primary').toLowerCase();

  const handlePress = () => {
    if (disabled || loading) return;
    if (hapticFeedback) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Safe fallback for platforms lacking haptic hardware
      }
    }
    onPress();
  };

  const getBackgroundColor = () => {
    if (disabled) {
      return isDark ? 'rgba(255, 255, 255, 0.06)' : '#E5E7EB';
    }
    switch (normalizedVariant) {
      case 'primary':
        return isDark ? '#FFFFFF' : '#111827';
      case 'secondary':
        return colors.surfaceElevated;
      case 'outline':
      case 'ghost':
        return 'transparent';
      case 'destructive':
      case 'danger':
        return colors.crimson;
      case 'icon':
        return colors.surfaceElevated;
      default:
        return isDark ? '#FFFFFF' : '#111827';
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.textDisabled;
    switch (normalizedVariant) {
      case 'primary':
        return isDark ? '#0E1015' : '#FFFFFF';
      case 'secondary':
        return colors.textPrimary;
      case 'outline':
        return colors.textPrimary;
      case 'ghost':
        return isDark ? colors.textPrimary : colors.textSecondary;
      case 'destructive':
      case 'danger':
        return '#FFFFFF';
      case 'icon':
        return colors.textPrimary;
      default:
        return isDark ? '#0E1015' : '#FFFFFF';
    }
  };

  const getBorderColor = () => {
    if (disabled) return 'transparent';
    switch (normalizedVariant) {
      case 'outline':
        return colors.border;
      case 'secondary':
        return colors.border;
      case 'icon':
        return colors.border;
      case 'destructive':
      case 'danger':
        return colors.crimson;
      default:
        return 'transparent';
    }
  };

  const getMinHeight = () => {
    switch (size) {
      case 'sm':
        return 48; // strict 48dp minimum touch target
      case 'lg':
        return 56;
      case 'md':
      default:
        return 48;
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return 13;
      case 'lg':
        return 16;
      case 'md':
      default:
        return 14;
    }
  };

  const getPaddingHorizontal = () => {
    if (normalizedVariant === 'icon') return 0;
    switch (size) {
      case 'sm':
        return 14;
      case 'lg':
        return 22;
      case 'md':
      default:
        return 18;
    }
  };

  const isIconOnly = normalizedVariant === 'icon';
  const resolvedTextColor = getTextColor();
  const resolvedFontSize = getFontSize();
  const labelText = title ?? (typeof children === 'string' ? children : null);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof labelText === 'string' ? labelText : undefined)}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      testID={testID}
      style={[
        styles.base,
        {
          minHeight: getMinHeight(),
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: getBorderColor() === 'transparent' ? 0 : 1,
          borderRadius: isIconOnly ? borderRadius.full : borderRadius.md,
          paddingHorizontal: getPaddingHorizontal(),
          width: isIconOnly ? getMinHeight() : fullWidth ? '100%' : undefined,
          opacity: disabled ? 0.6 : 1,
        },
        normalizedVariant === 'primary' && !isDark ? shadows.card : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={resolvedTextColor} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon ? <View style={styles.iconContainer}>{icon}</View> : null}

          {labelText ? (
            <RNText
              numberOfLines={1}
              style={[
                styles.text,
                {
                  color: resolvedTextColor,
                  fontSize: resolvedFontSize,
                },
                icon ? { marginLeft: 8 } : undefined,
                iconRight ? { marginRight: 8 } : undefined,
                textStyle,
              ]}
            >
              {labelText}
            </RNText>
          ) : (
            children
          )}

          {iconRight ? <View style={styles.iconContainer}>{iconRight}</View> : null}
        </View>
      )}
    </TouchableOpacity>
  );
};

export const PrimaryButton: React.FC<ButtonProps> = (props) => (
  <Button variant="primary" {...props} />
);

export const SecondaryButton: React.FC<ButtonProps> = (props) => (
  <Button variant="secondary" {...props} />
);

export const OutlineButton: React.FC<ButtonProps> = (props) => (
  <Button variant="outline" {...props} />
);

export const GhostButton: React.FC<ButtonProps> = (props) => (
  <Button variant="ghost" {...props} />
);

export const DestructiveButton: React.FC<ButtonProps> = (props) => (
  <Button variant="destructive" {...props} />
);

export const ActionButton: React.FC<ButtonProps> = (props) => (
  <Button {...props} />
);

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
