import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { SetLog, SetType } from '../../types/domain.types';

interface SetRowProps {
  set: SetLog;
  previousPerformance?: { weightKg: number; reps: number } | null;
  targetWeight?: number | null;
  targetReps?: number | string | null;
  onUpdate: (updates: Partial<SetLog>) => void;
  onToggleCompleted: () => void;
  onSkipSet?: () => void;
  onOpenPlateCalculator: () => void;
  onDelete: () => void;
}

const SET_TYPE_CYCLE: SetType[] = ['NORMAL', 'WARMUP', 'DROP', 'FAILURE'];

const SET_TYPE_LABELS: Record<SetType, { label: string; color: string }> = {
  NORMAL: { label: '1', color: THEME.colors.textSecondary },
  WARMUP: { label: 'W', color: THEME.colors.amber },
  DROP: { label: 'D', color: THEME.colors.violet },
  FAILURE: { label: 'F', color: THEME.colors.crimson },
};

const RPE_STEPS = [7, 7.5, 8, 8.5, 9, 9.5, 10];

export const SetRow: React.FC<SetRowProps> = ({
  set,
  previousPerformance,
  targetWeight,
  targetReps,
  onUpdate,
  onToggleCompleted,
  onSkipSet,
  onOpenPlateCalculator,
  onDelete,
}) => {
  const cycleSetType = () => {
    const currentIndex = SET_TYPE_CYCLE.indexOf(set.setType);
    const nextIndex = (currentIndex + 1) % SET_TYPE_CYCLE.length;
    onUpdate({ setType: SET_TYPE_CYCLE[nextIndex] });
  };

  const cycleRpe = () => {
    const currentRpe = set.rpe ?? 7.5;
    const currentIndex = RPE_STEPS.indexOf(currentRpe);
    const nextIndex = (currentIndex + 1) % RPE_STEPS.length;
    onUpdate({ rpe: RPE_STEPS[nextIndex], RPE: RPE_STEPS[nextIndex] });
  };

  const adjustWeight = (delta: number) => {
    const current = set.weightKg || previousPerformance?.weightKg || targetWeight || 0;
    const updated = Math.max(0, current + delta);
    onUpdate({ weightKg: updated, weight: updated });
  };

  const adjustReps = (delta: number) => {
    const current = set.reps || previousPerformance?.reps || Number(targetReps) || 0;
    const updated = Math.max(0, current + delta);
    onUpdate({ reps: updated, actual_reps: updated });
  };

  const currentTypeInfo = SET_TYPE_LABELS[set.setType] || SET_TYPE_LABELS.NORMAL;

  // Placeholder from target or previous
  const ghostWeight = Number(targetWeight ?? previousPerformance?.weightKg ?? 0);
  const ghostReps = targetReps ?? previousPerformance?.reps ?? '';
  const hasGhostWeight = ghostWeight > 0;
  const hasGhostReps = Boolean(ghostReps && String(ghostReps) !== '0');

  if (set.isSkipped) {
    return (
      <View style={[styles.row, styles.rowSkipped]}>
        <View style={[styles.setTypeBtn, { borderColor: THEME.colors.textMuted }]}>
          <Text style={[styles.setTypeText, { color: THEME.colors.textMuted }]}>{set.setNumber}</Text>
        </View>

        <View style={styles.skippedBadgeContainer}>
          <Text style={styles.skippedText}>SET SKIPPED</Text>
        </View>

        <TouchableOpacity onPress={onSkipSet} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>RESTORE</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, set.completed && styles.containerCompleted]}>
      <View style={styles.mainRow}>
        {/* Set Number / Type Toggle Button */}
        <TouchableOpacity
          onPress={cycleSetType}
          style={[
            styles.setTypeBtn,
            { borderColor: set.setType !== 'NORMAL' ? currentTypeInfo.color : THEME.colors.border },
          ]}
        >
          <Text style={[styles.setTypeText, { color: currentTypeInfo.color }]}>
            {set.setType === 'NORMAL' ? set.setNumber : currentTypeInfo.label}
          </Text>
        </TouchableOpacity>

        {/* Previous / Target Ghost Reference */}
        {(hasGhostWeight || hasGhostReps) && (
          <View style={styles.ghostContainer}>
            <Text style={styles.ghostLabel}>
              {previousPerformance ? 'PREV' : 'TARGET'}
            </Text>
            <Text style={styles.ghostValue}>
              {hasGhostWeight ? `${ghostWeight}k` : ''}
              {hasGhostWeight && hasGhostReps ? ' × ' : ''}
              {hasGhostReps ? `${ghostReps}` : ''}
            </Text>
          </View>
        )}

        {/* Weight Input with Quick Stepper */}
        <View style={styles.inputContainer}>
          <TextInput
            keyboardType="numeric"
            style={[styles.input, set.completed && styles.inputCompleted]}
            value={set.weightKg === 0 ? '' : String(set.weightKg)}
            placeholder={hasGhostWeight ? String(ghostWeight) : '0'}
            placeholderTextColor={THEME.colors.textMuted}
            onChangeText={text => {
              const val = parseFloat(text) || 0;
              onUpdate({ weightKg: val, weight: val });
            }}
          />
          <TouchableOpacity onPress={onOpenPlateCalculator} style={styles.plateIconBtn}>
            <Text style={styles.plateIconText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Reps Input */}
        <View style={styles.inputContainer}>
          <TextInput
            keyboardType="numeric"
            style={[styles.input, set.completed && styles.inputCompleted]}
            value={set.reps === 0 ? '' : String(set.reps)}
            placeholder={hasGhostReps ? String(ghostReps) : '0'}
            placeholderTextColor={THEME.colors.textMuted}
            onChangeText={text => {
              const val = parseInt(text, 10) || 0;
              onUpdate({ reps: val, actual_reps: val });
            }}
          />
        </View>

        {/* RPE Selector Badge */}
        <TouchableOpacity onPress={cycleRpe} style={styles.rpeBadge}>
          <Text style={styles.rpeLabel}>RPE</Text>
          <Text style={styles.rpeValue}>{set.rpe ?? 8}</Text>
        </TouchableOpacity>

        {/* Complete Checkbox */}
        <TouchableOpacity
          onPress={onToggleCompleted}
          style={[
            styles.checkBtn,
            set.completed ? styles.checkBtnActive : styles.checkBtnInactive,
          ]}
        >
          <Text style={[styles.checkText, { color: set.completed ? '#000000' : THEME.colors.textMuted }]}>
            {set.completed ? '✓' : ''}
          </Text>
        </TouchableOpacity>

        {/* Quick Actions (Skip / Delete) */}
        {!set.completed && (
          <View style={styles.sideActions}>
            {onSkipSet && (
              <TouchableOpacity onPress={onSkipSet} style={styles.skipBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={styles.skipText}>SKIP</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Fast Stepper Pill Strip (Visible when set is not yet completed for lightning-fast logging) */}
      {!set.completed && (
        <View style={styles.stepperStrip}>
          <Text style={styles.stepperLabel}>KG:</Text>
          <TouchableOpacity onPress={() => adjustWeight(-5)} style={styles.stepPill}>
            <Text style={styles.stepPillText}>-5</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => adjustWeight(-2.5)} style={styles.stepPill}>
            <Text style={styles.stepPillText}>-2.5</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => adjustWeight(2.5)} style={styles.stepPill}>
            <Text style={styles.stepPillText}>+2.5</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => adjustWeight(5)} style={styles.stepPill}>
            <Text style={styles.stepPillText}>+5</Text>
          </TouchableOpacity>

          <Text style={[styles.stepperLabel, { marginLeft: 12 }]}>REPS:</Text>
          <TouchableOpacity onPress={() => adjustReps(-1)} style={styles.stepPill}>
            <Text style={styles.stepPillText}>-1</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => adjustReps(1)} style={styles.stepPill}>
            <Text style={styles.stepPillText}>+1</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  containerCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  rowSkipped: {
    opacity: 0.5,
  },
  skippedBadgeContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },
  skippedText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  restoreBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  restoreText: {
    color: THEME.colors.cyan,
    fontSize: 10,
    fontWeight: '800',
  },
  setTypeBtn: {
    width: 32,
    height: 32,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTypeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  ghostContainer: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    color: THEME.colors.textMuted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ghostValue: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  inputContainer: {
    flex: 1,
    height: 34,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  input: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    padding: 0,
    fontFamily: 'monospace',
  },
  inputCompleted: {
    color: THEME.colors.emerald,
  },
  plateIconBtn: {
    padding: 2,
  },
  plateIconText: {
    fontSize: 12,
  },
  rpeBadge: {
    width: 38,
    height: 34,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeLabel: {
    color: THEME.colors.textMuted,
    fontSize: 8,
    fontWeight: '800',
  },
  rpeValue: {
    color: THEME.colors.amber,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  checkBtn: {
    width: 34,
    height: 34,
    borderRadius: THEME.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  checkBtnActive: {
    backgroundColor: THEME.colors.emerald,
    borderColor: THEME.colors.emerald,
  },
  checkBtnInactive: {
    backgroundColor: 'transparent',
    borderColor: THEME.colors.border,
  },
  checkText: {
    fontSize: 16,
    fontWeight: '900',
  },
  sideActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  skipBtn: {
    paddingHorizontal: 4,
  },
  skipText: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  deleteBtn: {
    paddingHorizontal: 4,
  },
  deleteText: {
    color: THEME.colors.crimson,
    fontSize: 13,
    fontWeight: '700',
  },
  stepperStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 38,
    gap: 4,
  },
  stepperLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.sharp,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  stepPillText: {
    color: THEME.colors.cyan,
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
});
