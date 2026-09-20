import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { durationSchema, validateField } from '../../utils/validation/onboardingSchema';

interface Props {
  selectedDuration: number;
  onSelect: (duration: number) => void;
  onNext: () => void;
  onBack: () => void;
}

const DURATIONS = [
  { minutes: 30, label: '30 MIN', tier: 'EXPRESS' },
  { minutes: 45, label: '45 MIN', tier: 'FOCUSED' },
  { minutes: 60, label: '60 MIN', tier: 'STANDARD' },
  { minutes: 75, label: '75 MIN', tier: 'EXPANDED' },
  { minutes: 90, label: '90 MIN', tier: 'MARATHON' },
];

export function StepDuration({ selectedDuration, onSelect, onNext, onBack }: Props) {
  const validation = validateField(durationSchema, selectedDuration);

  // Estimate workout distribution
  const warmupMin = Math.min(10, Math.round(selectedDuration * 0.15));
  const compoundMin = Math.round((selectedDuration - warmupMin) * 0.6);
  const accessoryMin = selectedDuration - warmupMin - compoundMin;

  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>SESSION DURATION</Heading>
        <Caption style={styles.sub}>
          Target working duration per gym session, excluding post-workout showers.
        </Caption>

        {/* Duration Selector Chips */}
        <View style={styles.chipRow}>
          {DURATIONS.map(d => {
            const isSelected = selectedDuration === d.minutes;
            return (
              <TouchableOpacity
                key={d.minutes}
                activeOpacity={0.8}
                onPress={() => onSelect(d.minutes)}
                style={[styles.chip, isSelected && styles.chipActive]}
              >
                <MonoText color={isSelected ? '#000000' : THEME.colors.textPrimary} style={styles.chipNumber}>
                  {d.label}
                </MonoText>
                <Caption color={isSelected ? '#000000' : THEME.colors.textMuted} style={styles.chipTier}>
                  {d.tier}
                </Caption>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Structure Breakdown Card */}
        <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.structureCard}>
          <View style={styles.structureHeader}>
            <Heading level={3} color={THEME.colors.cyan}>
              {selectedDuration} MIN PROGRAM ARCHITECTURE
            </Heading>
            <Badge label="OPTIMIZED" variant="cyan" size="sm" />
          </View>

          <Text color={THEME.colors.textSecondary} style={styles.structureDesc}>
            Calculated rest intervals, set counts, and warm-up sets calibrated for high CNS stimulus without excessive cortisol accumulation.
          </Text>

          <View style={styles.barSection}>
            <View style={styles.barItem}>
              <View style={styles.barHeader}>
                <Caption upper>DYNAMIC MOBILITY & RAMP-UP</Caption>
                <MonoText style={styles.barValue}>{warmupMin} MIN</MonoText>
              </View>
              <ProgressBar progressPercent={(warmupMin / selectedDuration) * 100} color={THEME.colors.cyan} size="sm" />
            </View>

            <View style={styles.barItem}>
              <View style={styles.barHeader}>
                <Caption upper>PRIMARY HEAVY COMPOUND WORK</Caption>
                <MonoText style={styles.barValue}>{compoundMin} MIN</MonoText>
              </View>
              <ProgressBar progressPercent={(compoundMin / selectedDuration) * 100} color={THEME.colors.amber} size="sm" />
            </View>

            <View style={styles.barItem}>
              <View style={styles.barHeader}>
                <Caption upper>ACCESSORY & METABOLIC ISOLATION</Caption>
                <MonoText style={styles.barValue}>{accessoryMin} MIN</MonoText>
              </View>
              <ProgressBar progressPercent={(accessoryMin / selectedDuration) * 100} color={THEME.colors.emerald} size="sm" />
            </View>
          </View>
        </Card>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button
          title="CONFIRM DURATION →"
          variant="primary"
          onPress={onNext}
          disabled={!validation.isValid}
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
  header: {
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sub: {
    marginBottom: THEME.spacing.md,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: THEME.spacing.md,
  },
  chip: {
    flex: 1,
    minWidth: '28%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  chipActive: {
    backgroundColor: THEME.colors.cyan,
    borderColor: THEME.colors.cyan,
  },
  chipNumber: {
    fontSize: 14,
    fontWeight: '900',
  },
  chipTier: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  structureCard: {
    padding: THEME.spacing.md,
  },
  structureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  structureDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  barSection: {
    gap: 12,
  },
  barItem: {
    gap: 4,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barValue: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
