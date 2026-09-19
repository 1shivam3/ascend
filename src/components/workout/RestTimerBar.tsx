import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { useWorkoutStore } from '../../store/useWorkoutStore';

export const RestTimerBar: React.FC = () => {
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

  const minutes = Math.floor(restTimerSecondsRemaining / 60);
  const seconds = restTimerSecondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const progressRatio = restTimerTotalSeconds > 0 
    ? Math.min(1, restTimerSecondsRemaining / restTimerTotalSeconds) 
    : 0;

  return (
    <View style={styles.container}>
      {/* Progress line */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
      </View>

      <View style={styles.contentRow}>
        <View style={styles.timeSection}>
          <Text style={styles.timerLabel}>REST TIMER</Text>
          <Text style={styles.timerDigits}>{formattedTime}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={() => addRestSeconds(30)} style={styles.controlBtn}>
            <Text style={styles.controlBtnText}>+30s</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => addRestSeconds(-15)} style={styles.controlBtn}>
            <Text style={styles.controlBtnText}>-15s</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={skipRestTimer} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>SKIP</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderTopWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
  },
  progressTrack: {
    height: 3,
    backgroundColor: THEME.colors.background,
    marginBottom: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.colors.cyan,
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeSection: {
    justifyContent: 'center',
  },
  timerLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerDigits: {
    color: THEME.colors.cyan,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controlBtn: {
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  controlBtnText: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  skipBtn: {
    backgroundColor: 'rgba(255, 51, 102, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.crimson,
  },
  skipBtnText: {
    color: THEME.colors.crimson,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
