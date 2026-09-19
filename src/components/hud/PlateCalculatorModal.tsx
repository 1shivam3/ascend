import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { THEME } from '../../constants/theme';
import { calculateBarbellPlates } from '../../utils/1rm';
import { TacticalButton } from '../ui/TacticalButton';

interface PlateCalculatorModalProps {
  visible: boolean;
  initialWeightKg: number;
  onClose: () => void;
  onApplyWeight?: (newWeightKg: number) => void;
}

const PLATE_COLORS: Record<number, { bg: string; text: string }> = {
  25: { bg: '#DC2626', text: '#FFFFFF' }, // Red
  20: { bg: '#2563EB', text: '#FFFFFF' }, // Blue
  15: { bg: '#EAB308', text: '#000000' }, // Yellow
  10: { bg: '#16A34A', text: '#FFFFFF' }, // Green
  5: { bg: '#F8FAFC', text: '#000000' },  // White
  2.5: { bg: '#334155', text: '#FFFFFF' },// Dark Slate
  1.25: { bg: '#94A3B8', text: '#000000' },// Silver
};

export const PlateCalculatorModal: React.FC<PlateCalculatorModalProps> = ({
  visible,
  initialWeightKg,
  onClose,
  onApplyWeight,
}) => {
  const [weight, setWeight] = useState(initialWeightKg > 20 ? initialWeightKg : 60);
  const barWeight = 20;

  const { platesPerSide, remainderKg } = calculateBarbellPlates(weight, barWeight);

  const handleAdjust = (delta: number) => {
    const updated = Math.max(barWeight, weight + delta);
    setWeight(Math.round(updated * 10) / 10);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>BARBELL PLATE CALCULATOR</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weightDisplayRow}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjust(-5)}>
              <Text style={styles.stepBtnText}>-5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjust(-2.5)}>
              <Text style={styles.stepBtnText}>-2.5</Text>
            </TouchableOpacity>

            <View style={styles.weightValueContainer}>
              <Text style={styles.weightValue}>{weight}</Text>
              <Text style={styles.weightUnit}>KG TOTAL</Text>
            </View>

            <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjust(2.5)}>
              <Text style={styles.stepBtnText}>+2.5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjust(5)}>
              <Text style={styles.stepBtnText}>+5</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.barNote}>Standard Olympic Barbell: 20 kg</Text>

          {/* Barbell Visualizer */}
          <View style={styles.barbellRack}>
            <View style={styles.barbellSleeve}>
              {platesPerSide.length === 0 ? (
                <Text style={styles.emptyBarText}>No plates (Empty Bar)</Text>
              ) : (
                platesPerSide.map((p, idx) => {
                  const plateStyle = PLATE_COLORS[p.plateWeight] || { bg: '#475569', text: '#FFF' };
                  return (
                    <View key={`${p.plateWeight}-${idx}`} style={styles.plateStackGroup}>
                      {Array.from({ length: p.countPerSide }).map((_, cIdx) => (
                        <View
                          key={cIdx}
                          style={[
                            styles.plateGraphic,
                            {
                              backgroundColor: plateStyle.bg,
                              height: 38 + Math.min(42, p.plateWeight * 1.6),
                            },
                          ]}
                        >
                          <Text style={[styles.plateWeightText, { color: plateStyle.text }]}>
                            {p.plateWeight}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </View>
          </View>

          {/* Plate Inventory Summary */}
          <ScrollView style={styles.platesSummary}>
            <Text style={styles.summaryTitle}>EACH SIDE OF BAR:</Text>
            {platesPerSide.length === 0 ? (
              <Text style={styles.summaryEmpty}>Bar only (20kg)</Text>
            ) : (
              platesPerSide.map(p => (
                <View key={p.plateWeight} style={styles.summaryRow}>
                  <View style={[styles.plateDot, { backgroundColor: PLATE_COLORS[p.plateWeight]?.bg || '#FFF' }]} />
                  <Text style={styles.summaryWeight}>{p.plateWeight} kg plate</Text>
                  <Text style={styles.summaryCount}>× {p.countPerSide}</Text>
                </View>
              ))
            )}

            {remainderKg > 0 && (
              <Text style={styles.remainderWarning}>
                ⚠️ {remainderKg} kg remainder cannot be loaded with standard plates.
              </Text>
            )}
          </ScrollView>

          <View style={styles.actionRow}>
            {onApplyWeight && (
              <TacticalButton
                title={`USE ${weight} KG`}
                onPress={() => {
                  onApplyWeight(weight);
                  onClose();
                }}
                style={{ flex: 1, marginRight: THEME.spacing.sm }}
              />
            )}
            <TacticalButton
              title="CLOSE"
              variant="secondary"
              onPress={onClose}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: THEME.colors.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: THEME.borderRadius.xl,
    borderTopRightRadius: THEME.borderRadius.xl,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  title: {
    color: THEME.colors.cyan,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: THEME.colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  weightDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: THEME.spacing.sm,
  },
  stepBtn: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  stepBtnText: {
    color: THEME.colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  weightValueContainer: {
    alignItems: 'center',
  },
  weightValue: {
    color: THEME.colors.textPrimary,
    fontSize: 36,
    fontWeight: '900',
  },
  weightUnit: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  barNote: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: THEME.spacing.md,
  },
  barbellRack: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    marginBottom: THEME.spacing.md,
  },
  barbellSleeve: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyBarText: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  plateStackGroup: {
    flexDirection: 'row',
    gap: 2,
  },
  plateGraphic: {
    width: 22,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateWeightText: {
    fontSize: 9,
    fontWeight: '900',
  },
  platesSummary: {
    maxHeight: 160,
    marginBottom: THEME.spacing.md,
  },
  summaryTitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  summaryEmpty: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  plateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  summaryWeight: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  summaryCount: {
    color: THEME.colors.cyan,
    fontSize: 14,
    fontWeight: '800',
  },
  remainderWarning: {
    color: THEME.colors.amber,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: THEME.spacing.sm,
  },
});
