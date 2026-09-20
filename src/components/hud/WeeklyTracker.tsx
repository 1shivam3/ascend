import React from 'react';
import { View, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { Text, Caption, MonoText } from '../ui/Typography';

export interface WeeklyTrackerProps {
  completedDayIndices?: number[]; // 0 = Mon, 1 = Tue, ..., 6 = Sun
  completedDays?: number[]; // alias
  targetDaysPerWeek?: number;
  targetDays?: number; // alias
  title?: string;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const WeeklyTracker: React.FC<WeeklyTrackerProps> = ({
  completedDayIndices,
  completedDays,
  targetDaysPerWeek,
  targetDays = 4,
  title = 'WEEKLY COMMITMENT',
}) => {
  const resolvedCompleted = completedDayIndices || completedDays || [];
  const resolvedTarget = targetDaysPerWeek || targetDays || 4;
  const now = new Date();
  const todayIndex = (now.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
  const completedCount = resolvedCompleted.length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Caption upper style={styles.title}>{title}</Caption>
        <MonoText color={completedCount >= resolvedTarget ? THEME.colors.emerald : THEME.colors.cyan} style={styles.countText}>
          {completedCount} / {resolvedTarget} SESSIONS
        </MonoText>
      </View>

      <View style={styles.daysRow}>
        {DAY_LABELS.map((label, idx) => {
          const isCompleted = resolvedCompleted.includes(idx);
          const isToday = idx === todayIndex;

          return (
            <View key={idx} style={styles.dayItem}>
              <View
                style={[
                  styles.pip,
                  isCompleted && styles.pipCompleted,
                  isToday && !isCompleted && styles.pipToday,
                ]}
              >
                {isCompleted ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <View style={[styles.innerDot, isToday && styles.innerDotToday]} />
                )}
              </View>
              <Caption
                color={isToday ? THEME.colors.cyan : THEME.colors.textMuted}
                style={[styles.dayLabel, isToday && styles.dayLabelToday]}
              >
                {label}
              </Caption>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    marginVertical: THEME.spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  title: {
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  countText: {
    fontSize: 12,
    fontWeight: '900',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  dayItem: {
    alignItems: 'center',
    gap: 6,
  },
  pip: {
    width: 32,
    height: 32,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipCompleted: {
    backgroundColor: THEME.colors.emerald,
    borderColor: THEME.colors.emerald,
  },
  pipToday: {
    borderColor: THEME.colors.cyan,
    backgroundColor: THEME.colors.surfaceElevated,
  },
  checkmark: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
  },
  innerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.colors.textMuted,
  },
  innerDotToday: {
    backgroundColor: THEME.colors.cyan,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  dayLabelToday: {
    fontWeight: '900',
  },
});
