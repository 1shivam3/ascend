import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, StatText, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ageSchema, validateField } from '../../utils/validation/onboardingSchema';

interface Props {
  initialAge: number;
  onUpdate: (age: number) => void;
  onNext: () => void;
  onBack: () => void;
}

const QUICK_AGES = [18, 22, 25, 30, 35, 40, 50];

export function StepAge({ initialAge, onUpdate, onNext, onBack }: Props) {
  const [age, setAge] = useState(initialAge || 25);
  const [inputStr, setInputStr] = useState(String(initialAge || 25));

  const validation = validateField(ageSchema, age);

  const handleAdjust = (delta: number) => {
    const next = Math.max(10, Math.min(100, age + delta));
    setAge(next);
    setInputStr(String(next));
    onUpdate(next);
  };

  const handleInputChange = (text: string) => {
    setInputStr(text);
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) {
      setAge(num);
      onUpdate(num);
    }
  };

  const handleQuickSelect = (val: number) => {
    setAge(val);
    setInputStr(String(val));
    onUpdate(val);
  };

  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>OPERATIVE AGE</Heading>
        <Caption style={styles.sub}>
          Used to calculate baseline metabolic recovery, age-graded strength standards, and work capacity.
        </Caption>

        {/* Digital Counter Card */}
        <Card variant="glass" accentBorder={validation.isValid ? THEME.colors.cyan : THEME.colors.crimson} style={styles.displayCard}>
          <Caption upper style={styles.label}>CHRONOLOGICAL AGE</Caption>
          
          <View style={styles.counterRow}>
            <TouchableOpacity onPress={() => handleAdjust(-1)} style={styles.stepBtn}>
              <MonoText style={styles.stepBtnText}>-</MonoText>
            </TouchableOpacity>

            <View style={styles.numberBox}>
              <TextInput
                value={inputStr}
                onChangeText={handleInputChange}
                keyboardType="numeric"
                maxLength={3}
                style={styles.numericInput}
              />
              <Caption upper style={styles.yearsLabel}>YEARS OLD</Caption>
            </View>

            <TouchableOpacity onPress={() => handleAdjust(1)} style={styles.stepBtn}>
              <MonoText style={styles.stepBtnText}>+</MonoText>
            </TouchableOpacity>
          </View>

          {/* Error / Validation Feedback */}
          {!validation.isValid && (
            <View style={styles.errorBox}>
              <Badge label={validation.error || 'Invalid age'} variant="crimson" size="sm" />
            </View>
          )}

          {/* Micro Step Adjusters */}
          <View style={styles.quickRow}>
            <TouchableOpacity onPress={() => handleAdjust(-5)} style={styles.microBtn}>
              <Caption>-5 YRS</Caption>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAdjust(5)} style={styles.microBtn}>
              <Caption>+5 YRS</Caption>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Quick Selectors */}
        <Caption upper style={styles.quickLabel}>QUICK SELECT</Caption>
        <View style={styles.chipRow}>
          {QUICK_AGES.map(val => (
            <TouchableOpacity
              key={val}
              onPress={() => handleQuickSelect(val)}
              style={[styles.chip, age === val && styles.chipActive]}
            >
              <MonoText color={age === val ? '#000000' : THEME.colors.textSecondary} style={styles.chipText}>
                {val}
              </MonoText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button
          title="CONFIRM AGE →"
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
    marginBottom: THEME.spacing.lg,
    lineHeight: 18,
  },
  displayCard: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  label: {
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: THEME.borderRadius.sharp,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 24,
    color: THEME.colors.cyan,
  },
  numberBox: {
    alignItems: 'center',
    minWidth: 120,
  },
  numericInput: {
    fontFamily: THEME.typography.fonts.mono,
    fontSize: 56,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    padding: 0,
  },
  yearsLabel: {
    letterSpacing: 2,
    color: THEME.colors.cyan,
    marginTop: -4,
  },
  errorBox: {
    marginTop: 12,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
  },
  microBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  quickLabel: {
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.sharp,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  chipActive: {
    backgroundColor: THEME.colors.cyan,
    borderColor: THEME.colors.cyan,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
