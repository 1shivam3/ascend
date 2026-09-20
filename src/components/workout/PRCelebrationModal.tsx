import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { DetectedPR } from '../../services/workout/PREngine';
import { Heading, Text, Caption, StatText } from '../ui/Typography';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface PRCelebrationModalProps {
  visible: boolean;
  pr: DetectedPR | null;
  onDismiss: () => void;
}

export const PRCelebrationModal: React.FC<PRCelebrationModalProps> = ({
  visible,
  pr,
  onDismiss,
}) => {
  if (!pr) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          {/* Top Cyber Accents */}
          <View style={styles.cornerAccentTL} />
          <View style={styles.cornerAccentTR} />

          {/* Glowing Header */}
          <View style={styles.headerArea}>
            <Text style={styles.trophyIcon}>⚡</Text>
            <Heading level={2} style={styles.headline}>PERSONAL RECORD</Heading>
            <Caption upper style={styles.tierTitle}>
              {pr.title}
            </Caption>
          </View>

          {/* Exercise Details */}
          <View style={styles.exerciseBox}>
            <Text style={styles.exerciseName}>{pr.exerciseName}</Text>
            <StatText size="hero" color={THEME.colors.amber} style={styles.statValue}>
              {pr.newValue} {pr.unit}
            </StatText>
            <Text style={styles.deltaText}>
              {pr.delta > 0 ? `+${pr.delta} ${pr.unit} PR` : 'FIRST RECORD SET'}
            </Text>
          </View>

          {/* XP & Rewards */}
          <View style={styles.rewardsRow}>
            <Badge label={`+${pr.xpBonus} XP MINTED`} variant="amber" size="md" />
            <Badge label="TRANSACTION VERIFIED" variant="cyan" size="md" />
          </View>

          {/* Quick Dismiss Button */}
          <Button
            title="CLAIM & CONTINUE LOGGING"
            variant="primary"
            size="md"
            onPress={onDismiss}
            style={styles.dismissBtn}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.xl,
    borderWidth: 1.5,
    borderColor: THEME.colors.amber,
    padding: THEME.spacing.lg,
    alignItems: 'center',
    position: 'relative',
    shadowColor: THEME.colors.amber,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  cornerAccentTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 14,
    height: 14,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: THEME.colors.amber,
  },
  cornerAccentTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: THEME.colors.amber,
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  trophyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  headline: {
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  tierTitle: {
    color: THEME.colors.amber,
    letterSpacing: 2,
    marginTop: 2,
    fontWeight: '800',
  },
  exerciseBox: {
    width: '100%',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    alignItems: 'center',
    marginVertical: THEME.spacing.sm,
  },
  exerciseName: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontWeight: '900',
    marginVertical: 4,
  },
  deltaText: {
    color: THEME.colors.emerald,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rewardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: THEME.spacing.md,
  },
  dismissBtn: {
    width: '100%',
    marginTop: THEME.spacing.xs,
  },
});
