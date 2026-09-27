import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { Heading, Caption, Text } from './Typography';

export interface WorkoutCardProps {
  title: string;
  category?: string;
  durationMinutes?: number;
  exerciseCount?: number;
  exerciseNames?: string[];
  xpReward?: number;
  isRecommended?: boolean;
  onPress?: () => void;
  onStartPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const WorkoutCard: React.FC<WorkoutCardProps> = ({
  title,
  category,
  durationMinutes,
  exerciseCount,
  exerciseNames,
  xpReward,
  isRecommended = false,
  onPress,
  onStartPress,
  style,
}) => {
  const { colors, borderRadius, shadows, isDark } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isRecommended
            ? (isDark ? colors.cyan : colors.primary)
            : colors.border,
          borderRadius: borderRadius.lg, // 18px
        },
        shadows.card,
        style,
      ]}
    >
      {/* Top badges row */}
      <View style={styles.topRow}>
        <View style={styles.badges}>
          {category ? (
            <View
              style={[
                styles.categoryBadge,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : colors.surfaceElevated,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Caption
                upper
                style={[styles.categoryText, { color: colors.textSecondary }]}
              >
                {category}
              </Caption>
            </View>
          ) : null}

          {isRecommended ? (
            <View
              style={[
                styles.recommendedBadge,
                {
                  backgroundColor: isDark
                    ? `${colors.cyan}18`
                    : `${colors.primary}12`,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Text
                style={[
                  styles.recommendedText,
                  { color: isDark ? colors.cyan : colors.primary },
                ]}
              >
                Recommended
              </Text>
            </View>
          ) : null}
        </View>

        {xpReward ? (
          <View
            style={[
              styles.xpBadge,
              {
                backgroundColor: `${colors.amber}18`,
                borderRadius: borderRadius.full,
              },
            ]}
          >
            <Ionicons name="sparkles" size={12} color={colors.amber} />
            <Text style={[styles.xpText, { color: colors.amber }]}>
              +{xpReward} XP
            </Text>
          </View>
        ) : null}
      </View>

      {/* Main Routine Title */}
      <Heading level={2} style={styles.title} numberOfLines={1}>
        {title}
      </Heading>

      {/* Routine Metadata (Duration & Exercise Count) */}
      <View style={styles.metaRow}>
        {durationMinutes ? (
          <View style={styles.metaItem}>
            <Ionicons
              name="time-outline"
              size={14}
              color={colors.textSecondary}
            />
            <Caption style={{ color: colors.textSecondary }}>
              {durationMinutes} min
            </Caption>
          </View>
        ) : null}

        {exerciseCount ? (
          <View style={styles.metaItem}>
            <Ionicons
              name="barbell-outline"
              size={14}
              color={colors.textSecondary}
            />
            <Caption style={{ color: colors.textSecondary }}>
              {exerciseCount} exercises
            </Caption>
          </View>
        ) : null}
      </View>

      {/* Exercise preview chips */}
      {exerciseNames && exerciseNames.length > 0 ? (
        <View style={styles.previewContainer}>
          {exerciseNames.slice(0, 3).map((name, idx) => (
            <View
              key={idx}
              style={[
                styles.previewChip,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.05)'
                    : colors.surfaceElevated,
                  borderRadius: borderRadius.xs,
                },
              ]}
            >
              <Caption style={[styles.previewText, { color: colors.textMuted }]}>
                {name}
              </Caption>
            </View>
          ))}
          {exerciseNames.length > 3 ? (
            <Caption style={[styles.moreText, { color: colors.textMuted }]}>
              +{exerciseNames.length - 3} more
            </Caption>
          ) : null}
        </View>
      ) : null}

      {/* Bottom CTA Row */}
      {onStartPress ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onStartPress}
            style={[
              styles.startBtn,
              {
                backgroundColor: isDark ? colors.cyan : colors.primary,
                borderRadius: borderRadius.sm,
              },
            ]}
          >
            <Ionicons
              name="play"
              size={14}
              color={isDark ? '#000000' : '#FFFFFF'}
            />
            <Text
              style={[
                styles.startBtnText,
                { color: isDark ? '#000000' : '#FFFFFF' },
              ]}
            >
              Start Session
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderWidth: 1,
    marginVertical: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
  },
  recommendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '700',
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  xpText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontWeight: '700',
    fontSize: 17,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    marginBottom: 6,
  },
  previewChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewText: {
    fontSize: 11,
  },
  moreText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
