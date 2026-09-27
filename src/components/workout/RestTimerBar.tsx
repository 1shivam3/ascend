import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { useWorkoutStore } from '../../store/useWorkoutStore';

export const RestTimerBar: React.FC = () => {
  const { colors, borderRadius, isDark } = useTheme();
  const {
    isRestTimerRunning,
    restTimerSecondsRemaining,
    restTimerTotalSeconds,
    tickRestTimer,
    skipRestTimer,
    addRestSeconds,
  } = useWorkoutStore();

  useEffect(() => {
    if (!isRestTimerRunning) return;

    const interval = setInterval(() => {
      tickRestTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [isRestTimerRunning, tickRestTimer]);

  if (!isRestTimerRunning) return null;

  const isOvertime = restTimerSecondsRemaining <= 0;
  const absSeconds = Math.abs(restTimerSecondsRemaining);
  const minutes = Math.floor(absSeconds / 60);
  const seconds = absSeconds % 60;
  const formattedTime = `${isOvertime ? '+' : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressRatio =
    restTimerTotalSeconds > 0
      ? Math.max(0, Math.min(1, restTimerSecondsRemaining / restTimerTotalSeconds))
      : 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
    >
      {/* Progress track */}
      <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB' }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progressRatio * 100}%`,
              backgroundColor: isOvertime ? colors.emerald : colors.cyan,
            },
          ]}
        />
      </View>

      <View style={styles.contentRow}>
        {/* Time and guidance label */}
        <View style={styles.timeSection}>
          <View style={styles.headerLabelRow}>
            <Ionicons
              name={isOvertime ? 'checkmark-circle-outline' : 'timer-outline'}
              size={13}
              color={isOvertime ? colors.emerald : colors.cyan}
            />
            <Text
              style={[
                styles.timerLabel,
                { color: isOvertime ? colors.emerald : colors.cyan },
              ]}
            >
              {isOvertime ? 'RECOVERED • READY' : 'SELF-DIRECTED REST'}
            </Text>
          </View>
          <Text
            style={[
              styles.timerDigits,
              { color: isOvertime ? colors.emerald : colors.textPrimary },
            ]}
          >
            {formattedTime}
          </Text>
          <Text style={[styles.reassuranceText, { color: colors.textMuted }]}>
            Rest as needed • No XP penalty
          </Text>
        </View>

        {/* Tactile gym controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={() => addRestSeconds(30)}
            style={[
              styles.controlBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                borderRadius: borderRadius.sm,
              },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.controlBtnText, { color: colors.textPrimary }]}>+30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => addRestSeconds(-15)}
            style={[
              styles.controlBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                borderRadius: borderRadius.sm,
              },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.controlBtnText, { color: colors.textPrimary }]}>-15s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={skipRestTimer}
            style={[
              styles.dismissBtn,
              {
                backgroundColor: isDark ? 'rgba(0, 229, 255, 0.12)' : `${colors.cyan}18`,
                borderColor: colors.cyan,
                borderRadius: borderRadius.sm,
              },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.dismissBtnText, { color: colors.cyan }]}>DONE ✓</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  progressTrack: {
    height: 3,
    marginBottom: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeSection: {
    justifyContent: 'center',
  },
  headerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 1,
  },
  timerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timerDigits: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  reassuranceText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  controlBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    minWidth: 44,
    alignItems: 'center',
  },
  controlBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
