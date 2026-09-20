import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { NutritionRepository, NutritionEntry } from '../../database/repositories/NutritionRepository';

interface NutritionModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onLogged?: () => void;
}

export const NutritionModal: React.FC<NutritionModalProps> = ({
  visible,
  userId,
  onClose,
  onLogged,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(todayStr);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [water, setWater] = useState('');
  const [bodyweight, setBodyweight] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible && userId) {
      NutritionRepository.getDailyNutrition(userId, todayStr).then(existing => {
        if (existing) {
          setCalories(existing.calories ? String(existing.calories) : '');
          setProtein(existing.proteinG ? String(existing.proteinG) : '');
          setCarbs(existing.carbsG ? String(existing.carbsG) : '');
          setFat(existing.fatG ? String(existing.fatG) : '');
          setWater(existing.waterMl ? String(existing.waterMl) : '');
          setBodyweight(existing.bodyweightKg ? String(existing.bodyweightKg) : '');
        } else {
          setCalories('');
          setProtein('');
          setCarbs('');
          setFat('');
          setWater('');
          setBodyweight('');
        }
      });
    }
  }, [visible, userId, todayStr]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const entry: NutritionEntry = {
        userId,
        date,
        calories: Number(calories) || 0,
        proteinG: Number(protein) || 0,
        carbsG: Number(carbs) || 0,
        fatG: Number(fat) || 0,
        waterMl: Number(water) || 0,
        bodyweightKg: bodyweight ? Number(bodyweight) : null,
      };

      await NutritionRepository.logDailyNutrition(entry);
      Alert.alert('Nutrition Logged', 'Daily intake and bodyweight telemetry updated.');
      if (onLogged) onLogged();
      onClose();
    } catch (err) {
      Alert.alert('Save Error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="DAILY NUTRITION LOGGING">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Conservative Disclaimer Notice */}
        <Card variant="surface" accentBorder={THEME.colors.cyan} style={styles.disclaimerCard}>
          <Caption color={THEME.colors.textMuted} style={styles.disclaimerText}>
            ℹ️ <Text color={THEME.colors.textPrimary}>Notice:</Text> Informational tracking tool for general athletic conditioning only. Not intended for clinical diagnosis, dietary disease management, or medical nutritional therapy. Consult a licensed physician or registered dietitian for specific clinical nutrition guidance.
          </Caption>
        </Card>

        <Caption upper style={styles.inputSectionTitle}>MACRONUTRIENTS & ENERGY</Caption>

        <View style={styles.inputGrid}>
          <View style={styles.inputBox}>
            <Caption upper style={styles.inputLabel}>CALORIES (KCAL)</Caption>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2400"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="numeric"
              value={calories}
              onChangeText={setCalories}
            />
          </View>

          <View style={styles.inputBox}>
            <Caption upper style={styles.inputLabel}>PROTEIN (G)</Caption>
            <TextInput
              style={styles.input}
              placeholder="e.g. 180"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="numeric"
              value={protein}
              onChangeText={setProtein}
            />
          </View>

          <View style={styles.inputBox}>
            <Caption upper style={styles.inputLabel}>CARBOHYDRATES (G)</Caption>
            <TextInput
              style={styles.input}
              placeholder="e.g. 250"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="numeric"
              value={carbs}
              onChangeText={setCarbs}
            />
          </View>

          <View style={styles.inputBox}>
            <Caption upper style={styles.inputLabel}>FAT (G)</Caption>
            <TextInput
              style={styles.input}
              placeholder="e.g. 70"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="numeric"
              value={fat}
              onChangeText={setFat}
            />
          </View>
        </View>

        <Caption upper style={[styles.inputSectionTitle, { marginTop: THEME.spacing.md }]}>
          HYDRATION & BIOMETRICS
        </Caption>

        <View style={styles.inputGrid}>
          <View style={styles.inputBox}>
            <Caption upper style={styles.inputLabel}>WATER (ML)</Caption>
            <TextInput
              style={styles.input}
              placeholder="e.g. 3000"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="numeric"
              value={water}
              onChangeText={setWater}
            />
          </View>

          <View style={styles.inputBox}>
            <Caption upper style={styles.inputLabel}>BODYWEIGHT (KG)</Caption>
            <TextInput
              style={styles.input}
              placeholder="e.g. 78.5"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="decimal-pad"
              value={bodyweight}
              onChangeText={setBodyweight}
            />
          </View>
        </View>

        <View style={styles.btnRow}>
          <Button
            title="CANCEL"
            variant="ghost"
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <Button
            title="SAVE LOG"
            variant="primary"
            onPress={handleSave}
            disabled={isSaving}
            style={{ flex: 2 }}
          />
        </View>
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: THEME.spacing.xs,
  },
  disclaimerCard: {
    padding: 10,
    marginBottom: THEME.spacing.md,
    backgroundColor: THEME.colors.surfaceElevated,
  },
  disclaimerText: {
    fontSize: 10,
    lineHeight: 14,
  },
  inputSectionTitle: {
    letterSpacing: 1.2,
    fontWeight: '800',
    marginBottom: 6,
  },
  inputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inputBox: {
    width: '48.5%',
    backgroundColor: THEME.colors.surfaceElevated,
    padding: 10,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  inputLabel: {
    fontSize: 9,
    marginBottom: 4,
  },
  input: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
    paddingVertical: 2,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: THEME.spacing.lg,
  },
});
