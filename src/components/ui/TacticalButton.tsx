import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { THEME } from '../../constants/theme';

interface TacticalButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'amber' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const TacticalButton: React.FC<TacticalButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
}) => {
  const getBackgroundColor = () => {
    if (disabled) return THEME.colors.surfaceElevated;
    switch (variant) {
      case 'primary': return THEME.colors.cyan;
      case 'amber': return THEME.colors.amber;
      case 'danger': return THEME.colors.crimson;
      case 'secondary': return THEME.colors.surfaceElevated;
      case 'ghost': return 'transparent';
      default: return THEME.colors.cyan;
    }
  };

  const getTextColor = () => {
    if (disabled) return THEME.colors.textDisabled;
    switch (variant) {
      case 'primary': return '#000000'; // High contrast black on cyan
      case 'amber': return '#000000';   // High contrast black on amber
      case 'danger': return '#FFFFFF';
      case 'secondary': return THEME.colors.textPrimary;
      case 'ghost': return THEME.colors.cyan;
      default: return '#000000';
    }
  };

  const getBorderColor = () => {
    if (variant === 'secondary') return THEME.colors.border;
    if (variant === 'ghost') return THEME.colors.border;
    return 'transparent';
  };

  const height = size === 'sm' ? 36 : size === 'lg' ? 56 : 48;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          height,
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
          <Text
            style={[
              styles.text,
              { color: getTextColor(), fontSize: size === 'sm' ? 13 : 15 },
              icon ? { marginLeft: 8 } : undefined,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    minHeight: 44,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
