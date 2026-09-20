import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { TrainingExperience } from '../../utils/validation/onboardingSchema';

interface Props {
  selectedExperience: TrainingExperience;
  onSelect: (experience: TrainingExperience) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ExperienceOption {
  id: TrainingExperience;
  rankTitle: string;
  duration: string;
  glyph: string;
  description: string;
  progressionNote: string;
  badgeVariant: 'neutral' | 'cyan' | 'amber' | 'violet';
}

const TIERS: ExperienceOption[] = [
  {
    id: 'NOVICE',
    rankTitle: 'INITIATE RECRUIT',
    duration: '< 6 MONTHS TRAINING',
    glyph: '🔰',
    description: 'Mastering baseline compound movement mechanics, bar paths, and foundational neural adaptations.',
    progressionNote: 'Rapid weekly linear progression potential (+2.5 kg/week).',
    badgeVariant: 'neutral',
  },
  {
    id: 'INTERMEDIATE',
    rankTitle: 'VANGUARD OPERATIVE',
    duration: '1 – 3 YEARS CONSISTENT',
    glyph: '⚔️',
    description: 'Solid command of major barbell lifts, established working capacity, and familiarity with progressive overload.',
    progressionNote: 'Wave periodization with planned fatigue dissipation.',
    badgeVariant: 'cyan',
  },
  {
    id: 'ADVANCED',
    rankTitle: 'CENTURION ELITE',
    duration: '3 – 5 YEARS INTENSE',
    glyph: '🛡️',
    description: 'High volume tolerance, refined technical efficiency near 1RM, and acute neuromuscular precision.',
    progressionNote: 'Block periodization with concentrated volume loading.',
    badgeVariant: 'amber',
  },
  {
    id: 'ELITE',
    rankTitle: 'SOVEREIGN ASCENDANT',
    duration: '5+ YEARS SPECIALIZED',
    glyph: '👑',
    description: 'Operating near biological potential. Requires micro-loading, targeted weak-point isolation, and strict recovery.',
    progressionNote: 'High technical mastery and multi-week peaking cycles.',
    badgeVariant: 'violet',
  },
];

export function StepExperience({ selectedExperience, onSelect, onNext, onBack }: Props) {
  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>TRAINING EXPERIENCE</Heading>
        <Caption style={styles.sub}>
          Sets your starting RPG character rank, base attributes, and weekly overload cadence.
        </Caption>

        <View style={styles.list}>
          {TIERS.map(t => {
            const isSelected = selectedExperience === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.8}
                onPress={() => onSelect(t.id)}
              >
                <Card
                  variant={isSelected ? 'elevated' : 'surface'}
                  accentBorder={isSelected ? THEME.colors.cyan : undefined}
                  style={[styles.card, isSelected && styles.cardActive]}
                >
                  <View style={styles.topRow}>
                    <View style={styles.titleGroup}>
                      <Heading level={3} style={styles.glyph}>{t.glyph}</Heading>
                      <View>
                        <Heading level={3} color={isSelected ? THEME.colors.cyan : THEME.colors.textPrimary}>
                          {t.rankTitle}
                        </Heading>
                        <Caption color={THEME.colors.textMuted}>{t.duration}</Caption>
                      </View>
                    </View>
                    <Badge label={t.id} variant={t.badgeVariant} size="sm" />
                  </View>

                  <Text color={THEME.colors.textSecondary} style={styles.desc}>
                    {t.description}
                  </Text>

                  <Caption color={THEME.colors.cyan} style={styles.note}>
                    ⚡ {t.progressionNote}
                  </Caption>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button title="CONFIRM TIER →" variant="primary" onPress={onNext} style={{ flex: 2 }} />
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
  header: {
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sub: {
    marginBottom: THEME.spacing.md,
    lineHeight: 18,
  },
  list: {
    gap: 10,
  },
  card: {
    padding: 12,
  },
  cardActive: {
    backgroundColor: THEME.colors.surfaceElevated,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glyph: {
    fontSize: 22,
  },
  desc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  note: {
    fontSize: 11,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
