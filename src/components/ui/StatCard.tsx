import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../constants/theme';
import { Heading, Caption, Text } from './Typography';

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  accentColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  trend,
  trendDirection = 'up',
  icon,
  accentColor,
  onPress,
  style,
  compact = false,
}) => {
  const { colors, borderRadius, shadows, isDark } = useTheme();

  const cardBackground = isDark ? colors.surface : colors.surface;
  const cardBorder = isDark ? colors.border : colors.border;
  const trendColor =
    trendDirection === 'up'
      ? colors.emerald
      : trendDirection === 'down'
      ? colors.crimson
      : colors.textMuted;

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBackground,
          borderColor: cardBorder,
          borderRadius: borderRadius.lg, // 18px
          padding: compact ? 12 : 16,
        },
        shadows.card,
        style,
      ]}
    >
      {/* Top row: Icon + Trend badge */}
      <View style={styles.headerRow}>
        {icon ? (
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: accentColor
                  ? `${accentColor}15`
                  : isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : colors.surfaceElevated,
                borderRadius: borderRadius.sm,
              },
            ]}
          >
            {icon}
          </View>
        ) : null}

        {trend ? (
          <View
            style={[
              styles.trendBadge,
              {
                backgroundColor: `${trendColor}18`,
                borderRadius: borderRadius.full,
              },
            ]}
          >
            <Text
              style={[
                styles.trendText,
                { color: trendColor },
              ]}
            >
              {trend}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Main Value */}
      <View style={styles.valueRow}>
        <Heading
          level={compact ? 2 : 1}
          style={[styles.value, { color: accentColor ?? colors.textPrimary }]}
        >
          {value}
        </Heading>
        {unit ? (
          <Caption style={[styles.unit, { color: colors.textSecondary }]}>
            {unit}
          </Caption>
        ) : null}
      </View>

      {/* Metric Label */}
      <Caption
        upper
        style={[styles.label, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Caption>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    minWidth: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  trendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 2,
  },
  value: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  unit: {
    fontWeight: '600',
    fontSize: 13,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
});
