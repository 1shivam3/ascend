import React from 'react';
import { View, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';

interface Props {
  username: string;
  avatarUrl: string;
  onComplete: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function StepFirstQuest({ username, avatarUrl, onComplete, onBack, isLoading }: Props) {
  return (
    <View style={styles.container}>
      <View>
        <View style={styles.badgeRow}>
          <Badge label="TACTICAL DIRECTIVE ASSIGNED" variant="cyan" size="md" dot />
        </View>

        <Heading level={2} style={styles.header}>INITIAL DIRECTIVE</Heading>
        <Caption style={styles.sub}>
          Every recruit must prove their mettle on the gym floor to activate neural synchronization.
        </Caption>

        {/* Quest Card */}
        <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.questCard}>
          <View style={styles.questHeader}>
            <View style={styles.questTitleArea}>
              <Heading level={1} style={styles.avatarGlyph}>{avatarUrl}</Heading>
              <View>
                <Caption upper color={THEME.colors.cyan} style={styles.missionCode}>
                  DIRECTIVE // 001
                </Caption>
                <Heading level={2} style={styles.questTitle}>
                  First Blood
                </Heading>
              </View>
            </View>
            <Badge label="+150 XP" variant="cyan" size="sm" />
          </View>

          <Text color={THEME.colors.textSecondary} style={styles.questDesc}>
            Deploy to your physical training facility and log your first completed session. Every set, repetition, and load recorded will directly increase your mastery level and character attributes.
          </Text>

          <View style={styles.objectiveBox}>
            <Caption upper style={styles.objectiveLabel}>PRIMARY OBJECTIVE</Caption>
            <View style={styles.objectiveRow}>
              <MonoText color={THEME.colors.cyan}>[ ]</MonoText>
              <Text style={styles.objectiveText}>Complete & Save 1 Gym Session</Text>
              <Caption color={THEME.colors.amber} style={{ marginLeft: 'auto' }}>0 / 1</Caption>
            </View>
            <ProgressBar progressPercent={0} size="sm" color={THEME.colors.cyan} style={{ marginTop: 6 }} />
          </View>

          {/* Rewards Preview */}
          <Caption upper style={styles.rewardsLabel}>DIRECTIVE COMPLETION REWARDS</Caption>
          <View style={styles.rewardsGrid}>
            <View style={styles.rewardItem}>
              <MonoText style={styles.rewardVal}>+150 XP</MonoText>
              <Caption>Total Experience</Caption>
            </View>
            <View style={styles.rewardItem}>
              <MonoText color={THEME.colors.amber} style={styles.rewardVal}>E-RANK IV</MonoText>
              <Caption>Rank Verification</Caption>
            </View>
            <View style={styles.rewardItem}>
              <MonoText color={THEME.colors.emerald} style={styles.rewardVal}>1 TOKEN</MonoText>
              <Caption>Streak Freeze</Caption>
            </View>
          </View>
        </Card>

        <Caption align="center" style={styles.footerNote}>
          Assigned to Operative @{username || 'Vanguard'} • Stored securely in local database
        </Caption>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} disabled={isLoading} style={{ flex: 1 }} />
        <Button
          title="COMMENCE ASCENSION →"
          variant="primary"
          size="lg"
          loading={isLoading}
          onPress={onComplete}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.sm,
  },
  badgeRow: {
    alignItems: 'center',
    marginBottom: 6,
  },
  header: {
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  sub: {
    marginBottom: THEME.spacing.md,
    lineHeight: 18,
    textAlign: 'center',
  },
  questCard: {
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
  },
  questHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  questTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarGlyph: {
    fontSize: 32,
  },
  missionCode: {
    letterSpacing: 2,
    fontWeight: '800',
  },
  questTitle: {
    letterSpacing: 1,
  },
  questDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  objectiveBox: {
    padding: 10,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 14,
  },
  objectiveLabel: {
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  objectiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  objectiveText: {
    fontSize: 13,
    fontWeight: '700',
  },
  rewardsLabel: {
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  rewardsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  rewardItem: {
    flex: 1,
    padding: 8,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    alignItems: 'center',
  },
  rewardVal: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  footerNote: {
    color: THEME.colors.textMuted,
    marginTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
