import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';
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
  color = THEME.colors.cyan,
  trackColor = THEME.colors.surfaceElevated,
  size = 'md',
  label,
  showPercent = false,
  style,
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progressPercent));

  const getHeight = () => {
    switch (size) {
      case 'sm': return 4;
      case 'lg': return 12;
      case 'md':
      default: return 7;
    }
  };

  return (
    <View style={[styles.container, style]}>
      {(label || showPercent) && (
        <View style={styles.labelRow}>
          {label ? <Caption upper>{label}</Caption> : <View />}
          {showPercent ? (
            <MonoText style={styles.percentText} color={color}>
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
            backgroundColor: trackColor,
          },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${clampedProgress}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: THEME.spacing.xs,
  },
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
    borderRadius: THEME.borderRadius.sharp,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  fill: {
    height: '100%',
    borderRadius: THEME.borderRadius.sharp,
  },
});
