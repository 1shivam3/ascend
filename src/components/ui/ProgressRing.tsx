import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../../constants/theme';
import { Heading, Caption } from './Typography';

export interface ProgressRingProps {
  progress: number; // 0 to 1 (or 0 to 100)
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  centerText?: string;
  centerSubtext?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 110,
  strokeWidth = 9,
  color,
  backgroundColor,
  centerText,
  centerSubtext,
  icon,
  children,
  style,
}) => {
  const { colors, isDark } = useTheme();

  // Normalize progress between 0 and 1
  const normalizedProgress = Math.min(
    Math.max(progress > 1 && progress <= 100 ? progress / 100 : progress, 0),
    1
  );

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - normalizedProgress);

  const ringColor = color ?? colors.accent;
  const trackColor =
    backgroundColor ??
    (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)');

  return (
    <View style={[{ width: size, height: size }, styles.container, style]}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          {/* Background Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Active Progress */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Svg>

      {/* Center Content */}
      <View style={styles.centerContainer}>
        {children ? (
          children
        ) : (
          <>
            {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
            {centerText ? (
              <Heading level={2} style={styles.centerText}>
                {centerText}
              </Heading>
            ) : null}
            {centerSubtext ? (
              <Caption style={styles.centerSubtext}>{centerSubtext}</Caption>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: 2,
  },
  centerText: {
    fontWeight: '800',
    fontSize: 20,
    lineHeight: 24,
  },
  centerSubtext: {
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
