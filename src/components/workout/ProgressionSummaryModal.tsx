import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { THEME } from '../../constants/theme';
import { WorkoutProgressionResult } from '../../types/progression.types';
import { TacticalButton } from '../ui/TacticalButton';
import { TacticalBadge } from '../ui/TacticalBadge';

interface ProgressionSummaryModalProps {
  visible: boolean;
  result: WorkoutProgressionResult | null;
  onDismiss: () => void;
}

export const ProgressionSummaryModal: React.FC<ProgressionSummaryModalProps> = ({
  visible,
  result,
  onDismiss,
}) => {
  if (!result) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Header Celebration */}
            <View style={styles.header}>
              <Text style={styles.headerSubtitle}>SESSION DEBRIEF</Text>
              <Text style={styles.headerTitle}>
                {result.didLevelUp ? '⚡ LEVEL ASCENSION ⚡' : 'MISSION ACCOMPLISHED'}
              </Text>
            </View>

            {/* Global XP & Level Card */}
            <View style={styles.xpCard}>
              <View style={styles.levelRow}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>LVL {result.newGlobalLevel}</Text>
                </View>
                <View style={styles.rankInfo}>
                  <Text style={styles.rankTierText}>{result.newRank.tier}</Text>
                  <Text style={styles.rankDivText}>DIVISION {result.newRank.division}</Text>
                </View>
                <View style={styles.xpGainContainer}>
                  <Text style={styles.xpGainText}>+{result.xpEarned}</Text>
                  <Text style={styles.xpGainLabel}>XP MINTED</Text>
                </View>
              </View>

              {result.didLevelUp && (
                <View style={styles.levelUpNotice}>
                  <Text style={styles.levelUpNoticeText}>
                    🎉 Advanced from Level {result.oldGlobalLevel} to {result.newGlobalLevel}!
                  </Text>
                </View>
              )}
            </View>

            {/* Streak & Habit Card */}
            <View style={styles.streakCard}>
              <View style={styles.streakRow}>
                <Text style={styles.streakFlame}>🔥</Text>
                <View style={styles.streakInfo}>
                  <Text style={styles.streakCount}>
                    {result.streakUpdated.currentStreak} DAY STREAK
                  </Text>
                  <Text style={styles.streakLongest}>
                    Personal Best: {result.streakUpdated.longestStreak} Days
                  </Text>
                </View>
              </View>

              {result.streakUpdated.isMilestone && (
                <View style={styles.milestoneNotice}>
                  <Text style={styles.milestoneText}>
                    ⭐ STREAK MILESTONE ACHIEVED!
                  </Text>
                </View>
              )}
            </View>

            {/* Personal Records Highlight */}
            {result.prsBrokenCount > 0 && (
              <View style={styles.prCard}>
                <Text style={styles.cardHeader}>🏆 NEW PERSONAL RECORDS ({result.prsBrokenCount})</Text>
                {result.exerciseMasteryUpdates.flatMap(u =>
                  u.prsBroken.map((pr, idx) => (
                    <View key={`${u.exerciseId}-${idx}`} style={styles.prItemRow}>
                      <Text style={styles.prExerciseName}>{u.exerciseName}</Text>
                      <TacticalBadge label={pr.type.replace('MAX_', '')} color={THEME.colors.amber} size="sm" />
                      <Text style={styles.prValueText}>{pr.value} kg</Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Exercise Mastery Progress */}
            <View style={styles.masteryCard}>
              <Text style={styles.cardHeader}>EXERCISE MASTERY PROGRESS</Text>
              {result.exerciseMasteryUpdates.map(u => (
                <View key={u.exerciseId} style={styles.masteryItem}>
                  <View style={styles.masteryTopRow}>
                    <Text style={styles.masteryExerciseName}>{u.exerciseName}</Text>
                    <Text style={styles.masteryXpGain}>+{u.xpEarned} MXP</Text>
                  </View>

                  <View style={styles.masteryLevelRow}>
                    <Text style={styles.masteryLevelText}>
                      Lift Level {u.newLevel}
                      {u.didLevelUp ? ` (Level Up from ${u.oldLevel}!)` : ''}
                    </Text>
                    <Text style={styles.mastery1RmText}>Est. 1RM: {u.new1RmKg} kg</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Attributes Delta */}
            <View style={styles.attrCard}>
              <Text style={styles.cardHeader}>ATTRIBUTE REINFORCEMENTS</Text>
              <View style={styles.attrGrid}>
                <View style={styles.attrItem}>
                  <Text style={styles.attrLabel}>STR</Text>
                  <Text style={styles.attrValue}>+{result.attributesDelta.strength}</Text>
                </View>
                <View style={styles.attrItem}>
                  <Text style={styles.attrLabel}>STA</Text>
                  <Text style={styles.attrValue}>+{result.attributesDelta.stamina}</Text>
                </View>
                <View style={styles.attrItem}>
                  <Text style={styles.attrLabel}>AGI</Text>
                  <Text style={styles.attrValue}>+{result.attributesDelta.agility}</Text>
                </View>
                <View style={styles.attrItem}>
                  <Text style={styles.attrLabel}>DIS</Text>
                  <Text style={styles.attrValue}>+{result.attributesDelta.discipline}</Text>
                </View>
                <View style={styles.attrItem}>
                  <Text style={styles.attrLabel}>VIT</Text>
                  <Text style={styles.attrValue}>+{result.attributesDelta.vitality}</Text>
                </View>
              </View>
            </View>

            {/* Dismiss CTA */}
            <TacticalButton
              title="CLAIM PROGRESSION & ASCEND"
              size="lg"
              onPress={onDismiss}
              style={{ marginTop: THEME.spacing.md }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: THEME.colors.backdrop,
    justifyContent: 'center',
    padding: THEME.spacing.md,
  },
  container: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.xl,
    borderWidth: 1,
    borderColor: THEME.colors.cyan,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  scrollContent: {
    padding: THEME.spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  headerSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerTitle: {
    color: THEME.colors.cyan,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 4,
    textAlign: 'center',
  },
  xpCard: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelBadge: {
    backgroundColor: THEME.colors.cyan,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.md,
    marginRight: THEME.spacing.md,
  },
  levelBadgeText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
  },
  rankInfo: {
    flex: 1,
  },
  rankTierText: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  rankDivText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  xpGainContainer: {
    alignItems: 'flex-end',
  },
  xpGainText: {
    color: THEME.colors.emerald,
    fontSize: 20,
    fontWeight: '900',
  },
  xpGainLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  levelUpNotice: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  levelUpNoticeText: {
    color: THEME.colors.amber,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  streakCard: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakFlame: {
    fontSize: 24,
    marginRight: 10,
  },
  streakInfo: {
    flex: 1,
  },
  streakCount: {
    color: THEME.colors.amber,
    fontSize: 15,
    fontWeight: '900',
  },
  streakLongest: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
  },
  milestoneNotice: {
    marginTop: 8,
    padding: 6,
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    borderRadius: THEME.borderRadius.sm,
  },
  milestoneText: {
    color: THEME.colors.amber,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  prCard: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    borderColor: THEME.colors.amber,
    borderWidth: 1,
  },
  cardHeader: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  prItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  prExerciseName: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  prValueText: {
    color: THEME.colors.amber,
    fontSize: 14,
    fontWeight: '900',
  },
  masteryCard: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  masteryItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  masteryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  masteryExerciseName: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  masteryXpGain: {
    color: THEME.colors.cyan,
    fontSize: 12,
    fontWeight: '800',
  },
  masteryLevelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  masteryLevelText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  mastery1RmText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  attrCard: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  attrGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  attrItem: {
    alignItems: 'center',
  },
  attrLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  attrValue: {
    color: THEME.colors.cyan,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
});
