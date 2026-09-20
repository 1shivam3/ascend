import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { frequencySchema, validateField } from '../../utils/validation/onboardingSchema';

interface Props {
  selectedDays: number;
  onSelect: (days: number) => void;
  onNext: () => void;
  onBack: () => void;
}

const FREQUENCIES = [
  {
    days: 2,
    splitName: 'Full Body Minimalist',
    desc: 'High recovery window. Ideal for time-constrained athletes or hybrid sport focus.',
    cadence: ['ACTIVE', 'REST', 'REST', 'ACTIVE', 'REST', 'REST', 'REST'],
  },
  {
    days: 3,
    splitName: 'Full Body Heavy-Light-Medium',
    desc: 'Classic strength foundation. 48 hours recovery between every high-tonnage session.',
    cadence: ['ACTIVE', 'REST', 'ACTIVE', 'REST', 'ACTIVE', 'REST', 'REST'],
  },
  {
    days: 4,
    splitName: 'Upper / Lower Power & Density',
    desc: 'Optimal golden balance between stimulus frequency, joint recovery, and volume.',
    cadence: ['ACTIVE', 'ACTIVE', 'REST', 'ACTIVE', 'ACTIVE', 'REST', 'REST'],
  },
  {
    days: 5,
    splitName: 'Push / Pull / Legs / Upper / Lower',
    desc: 'High hypertrophy volume and targeted movement frequency for experienced lifters.',
    cadence: ['ACTIVE', 'ACTIVE', 'ACTIVE', 'REST', 'ACTIVE', 'ACTIVE', 'REST'],
  },
  {
    days: 6,
    splitName: 'Push / Pull / Legs (2x Frequency)',
    desc: 'Elite high-frequency stimulus requiring meticulous nutrition, sleep, and autoregulation.',
    cadence: ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'REST'],
  },
];

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function StepFrequency({ selectedDays, onSelect, onNext, onBack }: Props) {
  const currentConfig = FREQUENCIES.find(f => f.days === selectedDays) || FREQUENCIES[2];
  const validation = validateField(frequencySchema, selectedDays);

  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>WEEKLY FREQUENCY</Heading>
        <Caption style={styles.sub}>
          How many days per week will you commit to physical gym deployment?
        </Caption>

        {/* Days Selector Buttons */}
        <View style={styles.buttonRow}>
          {FREQUENCIES.map(f => {
            const isSelected = selectedDays === f.days;
            return (
              <TouchableOpacity
                key={f.days}
                activeOpacity={0.8}
                onPress={() => onSelect(f.days)}
                style={[styles.freqBtn, isSelected && styles.freqBtnActive]}
              >
                <MonoText
                  color={isSelected ? '#000000' : THEME.colors.textPrimary}
                  style={styles.freqNumber}
                >
                  {f.days}
                </MonoText>
                <Caption color={isSelected ? '#000000' : THEME.colors.textMuted} style={styles.freqDaysLabel}>
                  DAYS
                </Caption>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Frequency Detail Card */}
        <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <Heading level={3} color={THEME.colors.cyan}>
              {currentConfig.splitName}
            </Heading>
            <Badge label={`${selectedDays}D WORK / ${7 - selectedDays}D REST`} variant="cyan" size="sm" />
          </View>

          <Text color={THEME.colors.textSecondary} style={styles.desc}>
            {currentConfig.desc}
          </Text>

          {/* Weekly Cadence Strip */}
          <Caption upper style={styles.cadenceLabel}>SIMULATED WEEKLY CYCLE CADENCE</Caption>
          <View style={styles.calendarStrip}>
            {WEEK_DAYS.map((dayName, idx) => {
              const isActive = currentConfig.cadence[idx] === 'ACTIVE';
              return (
                <View key={idx} style={[styles.dayPill, isActive ? styles.dayPillActive : styles.dayPillRest]}>
                  <MonoText color={isActive ? '#000000' : THEME.colors.textMuted} style={styles.dayText}>
                    {dayName}
                  </MonoText>
                  <Caption style={[styles.dayStatus, { color: isActive ? '#000000' : THEME.colors.textDisabled }]}>
                    {isActive ? 'LIFT' : 'REST'}
                  </Caption>
                </View>
              );
            })}
          </View>
        </Card>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button
          title="CONFIRM FREQUENCY →"
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
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: THEME.spacing.md,
  },
  freqBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  freqBtnActive: {
    backgroundColor: THEME.colors.cyan,
    borderColor: THEME.colors.cyan,
  },
  freqNumber: {
    fontSize: 22,
    fontWeight: '900',
  },
  freqDaysLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  detailCard: {
    padding: THEME.spacing.md,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  desc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  cadenceLabel: {
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  calendarStrip: {
    flexDirection: 'row',
    gap: 6,
  },
  dayPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
  },
  dayPillActive: {
    backgroundColor: THEME.colors.cyan,
    borderColor: THEME.colors.cyan,
  },
  dayPillRest: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderColor: THEME.colors.borderSubtle,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '900',
  },
  dayStatus: {
    fontSize: 8,
    fontWeight: '800',
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
