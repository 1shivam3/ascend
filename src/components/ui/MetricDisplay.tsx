import React from 'react';
import { View, Text as RNText, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../constants/theme';
import { Caption } from './Typography';

export interface MetricDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  subValue?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  valueColor?: string;
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<ViewStyle>;
}

export const MetricDisplay: React.FC<MetricDisplayProps> = ({
  label,
  value,
  unit,
  subValue,
  size = 'md',
  valueColor,
  align = 'left',
  style,
}) => {
  const { colors, typography } = useTheme();
  const activeValueColor = valueColor ?? colors.textPrimary;

  const getFontSize = () => {
    switch (size) {
      case 'hero': return typography.fontSizes.hero;
      case 'lg': return typography.fontSizes.displayLg;
      case 'sm': return typography.fontSizes.xl;
      case 'md':
      default: return typography.fontSizes.displaySm;
    }
  };

  const getUnitFontSize = () => {
    switch (size) {
      case 'hero': return typography.fontSizes.lg;
      case 'lg': return typography.fontSizes.md;
      case 'sm': return typography.fontSizes.xs;
      case 'md':
      default: return typography.fontSizes.sm;
    }
  };

  return (
    <View style={[styles.container, { alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }, style]}>
      <Caption upper style={[styles.label, { color: colors.textMuted }]}>{label}</Caption>
      
      <View style={styles.valueRow}>
        <RNText
          style={[
            styles.valueText,
            {
              fontSize: getFontSize(),
              color: activeValueColor,
              fontFamily: typography.fonts.mono,
            },
          ]}
        >
          {value}
        </RNText>
        {unit && (
          <RNText
            style={[
              styles.unitText,
              {
                fontSize: getUnitFontSize(),
                color: colors.textMuted,
                fontFamily: typography.fonts.mono,
              },
            ]}
          >
            {unit}
          </RNText>
        )}
      </View>

      {subValue && (
        <Caption style={[styles.subValue, { color: colors.textSecondary }]}>{subValue}</Caption>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
  },
  label: {
    letterSpacing: 1,
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  valueText: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  unitText: {
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subValue: {
    marginTop: 2,
  },
});
