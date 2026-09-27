import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../constants/theme';
import { Caption, Text } from './Typography';

export interface SectionHeaderProps {
  title: string;
  actionText?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
  subtle?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  actionText,
  onActionPress,
  style,
  subtle = false,
}) => {
  const { colors, spacing, borderRadius, isDark } = useTheme();

  return (
    <View style={[styles.container, { paddingVertical: spacing.xs }, style]}>
      <View style={styles.left}>
        <View
          style={[
            styles.indicator,
            {
              backgroundColor: subtle
                ? colors.textMuted
                : isDark
                ? colors.cyan
                : colors.primary,
              borderRadius: borderRadius.sharp,
            },
          ]}
        />
        <Caption
          upper
          style={[
            styles.title,
            {
              color: subtle ? colors.textMuted : colors.textPrimary,
            },
          ]}
        >
          {title}
        </Caption>
      </View>

      {actionText && onActionPress && (
        <TouchableOpacity
          onPress={onActionPress}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            style={[
              styles.action,
              { color: isDark ? colors.cyan : colors.primary },
            ]}
          >
            {actionText}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 8,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 3,
    height: 12,
  },
  title: {
    fontWeight: '700',
    letterSpacing: 0.8,
    fontSize: 12,
  },
  action: {
    fontWeight: '600',
    fontSize: 13,
  },
});
