import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { heightCmSchema, validateField, cmToFtIn, ftInToCm } from '../../utils/validation/onboardingSchema';

interface Props {
  initialHeightCm: number;
  onUpdate: (heightCm: number) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepHeight({ initialHeightCm, onUpdate, onNext, onBack }: Props) {
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm');
  const [heightCm, setHeightCm] = useState(initialHeightCm || 175);
  const [cmInputStr, setCmInputStr] = useState(String(initialHeightCm || 175));

  const ftIn = cmToFtIn(heightCm);
  const [feetStr, setFeetStr] = useState(String(ftIn.feet));
  const [inchesStr, setInchesStr] = useState(String(ftIn.inches));

  const validation = validateField(heightCmSchema, heightCm);

  const handleAdjustCm = (delta: number) => {
    const next = Math.max(90, Math.min(260, heightCm + delta));
    setHeightCm(next);
    setCmInputStr(String(next));
    const converted = cmToFtIn(next);
    setFeetStr(String(converted.feet));
    setInchesStr(String(converted.inches));
    onUpdate(next);
  };

  const handleCmChange = (text: string) => {
    setCmInputStr(text);
    const num = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) {
      setHeightCm(num);
      const converted = cmToFtIn(num);
      setFeetStr(String(converted.feet));
      setInchesStr(String(converted.inches));
      onUpdate(num);
    }
  };

  const handleFtInChange = (fStr: string, iStr: string) => {
    setFeetStr(fStr);
    setInchesStr(iStr);
    const f = parseInt(fStr, 10) || 0;
    const i = parseInt(iStr, 10) || 0;
    const calculatedCm = ftInToCm(f, i);
    setHeightCm(calculatedCm);
    setCmInputStr(String(calculatedCm));
    onUpdate(calculatedCm);
  };

  return (
    <View style={styles.container}>
      <View>
        <View style={styles.headerRow}>
          <Heading level={2} style={styles.header}>OPERATIVE STATURE</Heading>
          <View style={styles.unitToggle}>
            <TouchableOpacity
              onPress={() => setUnit('cm')}
              style={[styles.unitBtn, unit === 'cm' && styles.unitBtnActive]}
            >
              <MonoText color={unit === 'cm' ? '#000000' : THEME.colors.textMuted} style={styles.unitText}>
                CM
              </MonoText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setUnit('ft')}
              style={[styles.unitBtn, unit === 'ft' && styles.unitBtnActive]}
            >
              <MonoText color={unit === 'ft' ? '#000000' : THEME.colors.textMuted} style={styles.unitText}>
                FT / IN
              </MonoText>
            </TouchableOpacity>
          </View>
        </View>

        <Caption style={styles.sub}>
          Barbell biomechanics and lever lengths directly influence optimal movement patterns and moment arms.
        </Caption>

        {/* Display Card */}
        <Card variant="glass" accentBorder={validation.isValid ? THEME.colors.cyan : THEME.colors.crimson} style={styles.displayCard}>
          <Caption upper style={styles.label}>VERTICAL STATURE MEASUREMENT</Caption>

          {unit === 'cm' ? (
            <View style={styles.inputRow}>
              <TouchableOpacity onPress={() => handleAdjustCm(-1)} style={styles.stepBtn}>
                <MonoText style={styles.stepBtnText}>-</MonoText>
              </TouchableOpacity>

              <View style={styles.numberBox}>
                <TextInput
                  value={cmInputStr}
                  onChangeText={handleCmChange}
                  keyboardType="numeric"
                  maxLength={3}
                  style={styles.numericInput}
                />
                <Caption upper style={styles.unitTag}>CENTIMETERS</Caption>
              </View>

              <TouchableOpacity onPress={() => handleAdjustCm(1)} style={styles.stepBtn}>
                <MonoText style={styles.stepBtnText}>+</MonoText>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.ftInRow}>
              <View style={styles.ftInBox}>
                <TextInput
                  value={feetStr}
                  onChangeText={t => handleFtInChange(t, inchesStr)}
                  keyboardType="numeric"
                  maxLength={1}
                  style={styles.numericInput}
                />
                <Caption upper style={styles.unitTag}>FEET</Caption>
              </View>
              <Heading level={1} color={THEME.colors.cyan} style={styles.quoteMark}>'</Heading>
              <View style={styles.ftInBox}>
                <TextInput
                  value={inchesStr}
                  onChangeText={t => handleFtInChange(feetStr, t)}
                  keyboardType="numeric"
                  maxLength={2}
                  style={styles.numericInput}
                />
                <Caption upper style={styles.unitTag}>INCHES</Caption>
              </View>
            </View>
          )}

          {/* Error Banner */}
          {!validation.isValid && (
            <View style={styles.errorBox}>
              <Badge label={validation.error || 'Invalid height'} variant="crimson" size="sm" />
            </View>
          )}

          {/* Micro Steps */}
          <View style={styles.quickRow}>
            <TouchableOpacity onPress={() => handleAdjustCm(-5)} style={styles.microBtn}>
              <Caption>-5 CM</Caption>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAdjustCm(5)} style={styles.microBtn}>
              <Caption>+5 CM</Caption>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Biomechanical Lever Summary */}
        <Card variant="surface" style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text color={THEME.colors.cyan} style={{ fontWeight: '800' }}>ℹ️ BIOMECHANICAL LEVERS:</Text>
            <Text color={THEME.colors.textSecondary} style={{ fontSize: 12, marginTop: 4 }}>
              {heightCm > 185
                ? 'Longer femur and humerus lever arms require wider stance variations and greater torque.'
                : heightCm < 170
                ? 'Compact lever arms afford high mechanical advantage on Squat and Bench Press.'
                : 'Balanced lever arms suited for versatile conventional and hybrid movement patterns.'}
            </Text>
          </View>
        </Card>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button
          title="CONFIRM HEIGHT →"
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
  ftInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  ftInBox: {
    alignItems: 'center',
    minWidth: 80,
  },
  quoteMark: {
    fontSize: 40,
    marginTop: -20,
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
    minWidth: 130,
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
  infoRow: {
    gap: 2,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
