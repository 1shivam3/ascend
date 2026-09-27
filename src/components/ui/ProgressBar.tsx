import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../constants/theme';
import { Caption, MonoText } from './Typography';

export interface ProgressBarProps {
  progressPercent: number; // 0 - 100
  color?: string;
  trackColor?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showPercent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progressPercent,
  color,
  trackColor,
  size = 'md',
  label,
  showPercent = false,
  style,
}) => {
  const { colors, borderRadius, spacing, isDark } = useTheme();
  const clampedProgress = Math.min(100, Math.max(0, progressPercent));

  const activeColor = color ?? colors.accent;
  const activeTrackColor =
    trackColor ??
    (isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceElevated);

  const getHeight = () => {
    switch (size) {
      case 'sm':
        return 4;
      case 'lg':
        return 12;
      case 'md':
      default:
        return 8;
    }
  };

  return (
    <View style={[styles.container, { marginVertical: spacing.xs }, style]}>
      {(label || showPercent) && (
        <View style={styles.labelRow}>
          {label ? <Caption upper>{label}</Caption> : <View />}
          {showPercent ? (
            <MonoText style={styles.percentText} color={activeColor}>
              {Math.round(clampedProgress)}%
            </MonoText>
          ) : null}
        </View>
      )}

      <View
        style={[
          styles.track,
          {
            height: getHeight(),
            backgroundColor: activeTrackColor,
            borderRadius: borderRadius.full,
            borderColor: colors.borderSubtle,
          },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${clampedProgress}%`,
              backgroundColor: activeColor,
              borderRadius: borderRadius.full,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  percentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  track: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
  },
  fill: {
    height: '100%',
  },
});
