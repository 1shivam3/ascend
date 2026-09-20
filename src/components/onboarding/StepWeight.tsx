import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { weightKgSchema, validateField, kgToLbs, lbsToKg } from '../../utils/validation/onboardingSchema';

interface Props {
  initialWeightKg: number;
  onUpdate: (weightKg: number) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepWeight({ initialWeightKg, onUpdate, onNext, onBack }: Props) {
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightKg, setWeightKg] = useState(initialWeightKg || 75);
  const [inputStr, setInputStr] = useState(String(initialWeightKg || 75));

  const validation = validateField(weightKgSchema, weightKg);

  const handleUnitToggle = (targetUnit: 'kg' | 'lbs') => {
    if (targetUnit === unit) return;
    setUnit(targetUnit);
    if (targetUnit === 'lbs') {
      const lbs = kgToLbs(weightKg);
      setInputStr(String(lbs));
    } else {
      setInputStr(String(Math.round(weightKg * 10) / 10));
    }
  };

  const handleAdjust = (deltaKg: number) => {
    const nextKg = Math.max(20, Math.min(360, Math.round((weightKg + deltaKg) * 10) / 10));
    setWeightKg(nextKg);
    if (unit === 'kg') {
      setInputStr(String(nextKg));
    } else {
      setInputStr(String(kgToLbs(nextKg)));
    }
    onUpdate(nextKg);
  };

  const handleTextChange = (text: string) => {
    setInputStr(text);
    const num = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) {
      if (unit === 'kg') {
        setWeightKg(num);
        onUpdate(num);
      } else {
        const convertedKg = lbsToKg(num);
        setWeightKg(convertedKg);
        onUpdate(convertedKg);
      }
    }
  };

  const getWeightCategory = (kg: number) => {
    if (kg < 66) return 'Featherweight Class';
    if (kg < 77) return 'Middleweight Class';
    if (kg < 93) return 'Light Heavyweight Class';
    if (kg < 105) return 'Heavyweight Class';
    return 'Super Heavyweight Division';
  };

  return (
    <View style={styles.container}>
      <View>
        <View style={styles.headerRow}>
          <Heading level={2} style={styles.header}>OPERATIVE MASS</Heading>
          <View style={styles.unitToggle}>
            <TouchableOpacity
              onPress={() => handleUnitToggle('kg')}
              style={[styles.unitBtn, unit === 'kg' && styles.unitBtnActive]}
            >
              <MonoText color={unit === 'kg' ? '#000000' : THEME.colors.textMuted} style={styles.unitText}>
                KG
              </MonoText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleUnitToggle('lbs')}
              style={[styles.unitBtn, unit === 'lbs' && styles.unitBtnActive]}
            >
              <MonoText color={unit === 'lbs' ? '#000000' : THEME.colors.textMuted} style={styles.unitText}>
                LBS
              </MonoText>
            </TouchableOpacity>
          </View>
        </View>

        <Caption style={styles.sub}>
          Body mass is critical for relative strength coefficients (Wilks / DOTS) and 1RM power output scaling.
        </Caption>

        {/* Digital Scale Card */}
        <Card variant="glass" accentBorder={validation.isValid ? THEME.colors.cyan : THEME.colors.crimson} style={styles.displayCard}>
          <Caption upper style={styles.label}>TACTICAL SCALE READOUT</Caption>

          <View style={styles.inputRow}>
            <TouchableOpacity onPress={() => handleAdjust(-0.5)} style={styles.stepBtn}>
              <MonoText style={styles.stepBtnText}>-</MonoText>
            </TouchableOpacity>

            <View style={styles.numberBox}>
              <TextInput
                value={inputStr}
                onChangeText={handleTextChange}
                keyboardType="numeric"
                maxLength={5}
                style={styles.numericInput}
              />
              <Caption upper style={styles.unitTag}>{unit === 'kg' ? 'KILOGRAMS' : 'POUNDS'}</Caption>
            </View>

            <TouchableOpacity onPress={() => handleAdjust(0.5)} style={styles.stepBtn}>
              <MonoText style={styles.stepBtnText}>+</MonoText>
            </TouchableOpacity>
          </View>

          {/* Validation Error */}
          {!validation.isValid && (
            <View style={styles.errorBox}>
              <Badge label={validation.error || 'Invalid bodyweight'} variant="crimson" size="sm" />
            </View>
          )}

          {/* Micro Step Adjusters */}
          <View style={styles.quickRow}>
            <TouchableOpacity onPress={() => handleAdjust(-2.5)} style={styles.microBtn}>
              <Caption>-2.5 KG</Caption>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAdjust(2.5)} style={styles.microBtn}>
              <Caption>+2.5 KG</Caption>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Division Indicator */}
        <Card variant="surface" style={styles.infoCard}>
          <View style={styles.divisionRow}>
            <Caption upper style={styles.divisionLabel}>ATHLETIC WEIGHT DIVISION</Caption>
            <Badge label={getWeightCategory(weightKg)} variant="amber" size="sm" dot />
          </View>
          <Caption color={THEME.colors.textMuted} style={{ marginTop: 6 }}>
            Relative strength thresholds scale non-linearly with bodyweight based on physiological cross-sectional area.
          </Caption>
        </Card>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button
          title="CONFIRM WEIGHT →"
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  header: {
    letterSpacing: 1.5,
  },
  sub: {
    marginBottom: THEME.spacing.lg,
    lineHeight: 18,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unitBtnActive: {
    backgroundColor: THEME.colors.cyan,
  },
  unitText: {
    fontSize: 11,
    fontWeight: '800',
  },
  displayCard: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
  },
  label: {
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  inputRow: {
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
    minWidth: 140,
  },
  numericInput: {
    fontFamily: THEME.typography.fonts.mono,
    fontSize: 56,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    padding: 0,
  },
  unitTag: {
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
  infoCard: {
    padding: 12,
  },
  divisionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divisionLabel: {
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
