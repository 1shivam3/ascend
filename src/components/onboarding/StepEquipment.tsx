import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { equipmentSchema, validateField } from '../../utils/validation/onboardingSchema';

interface Props {
  selectedEquipment: string[];
  onToggle: (id: string) => void;
  onSetAll: (list: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

interface EquipmentItem {
  id: string;
  name: string;
  glyph: string;
  sub: string;
}

const EQUIPMENT_LIST: EquipmentItem[] = [
  { id: 'BARBELL', name: 'Barbell & Plates', glyph: '🏋️', sub: 'Olympic barbells, power racks, bumper plates' },
  { id: 'DUMBBELL', name: 'Dumbbells', glyph: '🦾', sub: 'Full range dumbbell pairs and adjustable weights' },
  { id: 'CABLE', name: 'Cable Station', glyph: '⛓️', sub: 'Adjustable dual pulleys, lat pulldown, seated rows' },
  { id: 'MACHINE', name: 'Gym Machines', glyph: '⚙️', sub: 'Leg press, hack squat, chest press, pec fly' },
  { id: 'BODYWEIGHT', name: 'Calisthenics Bars', glyph: '🤸', sub: 'Pull-up bars, dip stations, gymnastic rings' },
  { id: 'KETTLEBELL', name: 'Kettlebells', glyph: '🔔', sub: 'Cast iron bells for ballistic and unilateral work' },
  { id: 'OTHER', name: 'Resistance Bands', glyph: '➰', sub: 'Loop bands, mobility straps, and chains' },
];

const ALL_GYM_IDS = ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'];

export function StepEquipment({ selectedEquipment, onToggle, onSetAll, onNext, onBack }: Props) {
  const validation = validateField(equipmentSchema, selectedEquipment);

  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>OPERATIONAL ARMORY</Heading>
        <Caption style={styles.sub}>
          Select all equipment categories accessible during your training deployments.
        </Caption>

        {/* Quick Batch Actions */}
        <View style={styles.batchRow}>
          <TouchableOpacity
            onPress={() => onSetAll(ALL_GYM_IDS)}
            style={styles.batchBtn}
          >
            <Caption color={THEME.colors.cyan}>+ ALL COMMERCIAL GYM</Caption>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onSetAll(['BODYWEIGHT'])}
            style={styles.batchBtn}
          >
            <Caption color={THEME.colors.textMuted}>BODYWEIGHT ONLY</Caption>
          </TouchableOpacity>
        </View>

        {/* Equipment Matrix */}
        <View style={styles.grid}>
          {EQUIPMENT_LIST.map(item => {
            const isSelected = selectedEquipment.includes(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={() => onToggle(item.id)}
              >
                <Card
                  variant={isSelected ? 'elevated' : 'surface'}
                  accentBorder={isSelected ? THEME.colors.cyan : undefined}
                  style={[styles.itemCard, isSelected && styles.itemCardActive]}
                >
                  <View style={styles.itemHeader}>
                    <View style={styles.titleWithIcon}>
                      <Heading level={3} style={styles.glyph}>{item.glyph}</Heading>
                      <View>
                        <Heading level={3} color={isSelected ? THEME.colors.cyan : THEME.colors.textPrimary}>
                          {item.name}
                        </Heading>
                        <Caption color={THEME.colors.textMuted} style={styles.itemSub}>{item.sub}</Caption>
                      </View>
                    </View>
                    <Badge
                      label={isSelected ? 'READY' : 'ABSENT'}
                      variant={isSelected ? 'cyan' : 'neutral'}
                      size="sm"
                    />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Validation error */}
        {!validation.isValid && (
          <View style={styles.errorBox}>
            <Badge label={validation.error || 'Select at least 1 equipment type'} variant="crimson" size="sm" />
          </View>
        )}
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button
          title={`CONFIRM GEAR (${selectedEquipment.length}) →`}
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
    marginBottom: THEME.spacing.sm,
    lineHeight: 18,
  },
  batchRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: THEME.spacing.md,
  },
  batchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  grid: {
    gap: 8,
  },
  itemCard: {
    padding: 10,
  },
  itemCardActive: {
    backgroundColor: THEME.colors.surfaceElevated,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  glyph: {
    fontSize: 20,
  },
  itemSub: {
    fontSize: 10,
    marginTop: 2,
  },
  errorBox: {
    marginTop: 10,
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
