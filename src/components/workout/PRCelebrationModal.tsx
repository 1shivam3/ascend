import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { DetectedPR } from '../../services/workout/PREngine';
import { Heading, Text, Caption, StatText, MonoText } from '../ui/Typography';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { SubtleContainer } from '../ui/SubtleContainer';
import { BackgroundLayer } from '../layout/BackgroundLayer';
import { QuoteEngine } from '../../services/quotes/QuoteEngine';

export interface PRCelebrationModalProps {
  visible: boolean;
  pr: DetectedPR | null;
  onDismiss: () => void;
}

export const PRCelebrationModal: React.FC<PRCelebrationModalProps> = ({
  visible,
  pr,
  onDismiss,
}) => {
  if (!pr || !visible) return null;

  const quote = QuoteEngine.getQuote('PR');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <BackgroundLayer theme="ASCENSION" intensity={0.12} />

        <View style={styles.cardContainer}>
          <SubtleContainer accentBorder={THEME.colors.amber} style={styles.card}>
            {/* Top Accent Icon */}
            <View style={styles.headerArea}>
              <View style={styles.iconCircle}>
                <Text style={styles.trophyIcon}>⚡</Text>
              </View>
              <MonoText style={styles.tierTitle}>PERSONAL RECORD BREAKTHROUGH</MonoText>
              <Heading level={1} style={styles.headline}>
                NEW LIFETIME PR
              </Heading>
            </View>

            {/* Exercise Details */}
            <View style={styles.exerciseBox}>
              <Text style={styles.exerciseName}>{pr.exerciseName}</Text>
              <StatText size="hero" color={THEME.colors.amber} style={styles.statValue}>
                {pr.newValue} {pr.unit}
              </StatText>
              <MonoText style={styles.deltaText}>
                {pr.delta > 0 ? `+${pr.delta} ${pr.unit} BREAKTHROUGH` : 'BASELINE PR ESTABLISHED'}
              </MonoText>
            </View>

            {/* XP & Rewards */}
            <View style={styles.rewardsRow}>
              <Badge label={`+${pr.xpBonus} BONUS XP`} variant="amber" size="md" />
              <Badge label="SQLITE VERIFIED" variant="cyan" size="md" />
            </View>

            {/* Contextual PR Quote */}
            <View style={styles.quoteBox}>
              <Text style={styles.quoteText}>"{quote.text}"</Text>
              <Caption style={styles.quoteAuthor}>— ASCEND CODE</Caption>
            </View>

            {/* Quick Dismiss Button */}
            <Button
              title="CLAIM RECORD & CONTINUE →"
              variant="primary"
              size="lg"
              onPress={onDismiss}
              style={styles.dismissBtn}
            />
          </SubtleContainer>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 9, 12, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.lg,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 380,
  },
  card: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: THEME.colors.amber,
    marginBottom: 8,
  },
  trophyIcon: {
    fontSize: 24,
  },
  tierTitle: {
    color: THEME.colors.amber,
    letterSpacing: 1.5,
    fontSize: 9,
    fontWeight: '900',
  },
  headline: {
    letterSpacing: 1.5,
    textAlign: 'center',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  exerciseBox: {
    width: '100%',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    alignItems: 'center',
    marginVertical: THEME.spacing.xs,
  },
  exerciseName: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
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
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  rewardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: THEME.spacing.sm,
  },
  quoteBox: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.sharp,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: THEME.colors.amber,
    marginVertical: THEME.spacing.sm,
    width: '100%',
  },
  quoteText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: THEME.colors.textSecondary,
    lineHeight: 16,
    textAlign: 'center',
  },
  quoteAuthor: {
    fontSize: 8,
    letterSpacing: 1,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '800',
  },
  dismissBtn: {
    width: '100%',
    marginTop: THEME.spacing.xs,
  },
});
