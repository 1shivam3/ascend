import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { SetLog, SetType } from '../../types/domain.types';

interface SetRowProps {
  set: SetLog;
  onUpdate: (updates: Partial<SetLog>) => void;
  onToggleCompleted: () => void;
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

export const SetRow: React.FC<SetRowProps> = ({
  set,
  onUpdate,
  onToggleCompleted,
  onOpenPlateCalculator,
  onDelete,
}) => {
  const cycleSetType = () => {
    const currentIndex = SET_TYPE_CYCLE.indexOf(set.setType);
    const nextIndex = (currentIndex + 1) % SET_TYPE_CYCLE.length;
    onUpdate({ setType: SET_TYPE_CYCLE[nextIndex] });
  };

  const currentTypeInfo = SET_TYPE_LABELS[set.setType] || SET_TYPE_LABELS.NORMAL;

  return (
    <View style={[styles.row, set.completed && styles.rowCompleted]}>
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

      {/* Weight Input */}
      <View style={styles.inputContainer}>
        <TextInput
          keyboardType="numeric"
          style={[styles.input, set.completed && styles.inputCompleted]}
          value={set.weightKg === 0 ? '' : String(set.weightKg)}
          placeholder="0"
          placeholderTextColor={THEME.colors.textMuted}
          onChangeText={text => {
            const val = parseFloat(text) || 0;
            onUpdate({ weightKg: val });
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
          placeholder="0"
          placeholderTextColor={THEME.colors.textMuted}
          onChangeText={text => {
            const val = parseInt(text, 10) || 0;
            onUpdate({ reps: val });
          }}
        />
      </View>

      {/* Estimated 1RM Badge */}
      <View style={styles.e1rmBadge}>
        <Text style={styles.e1rmLabel}>1RM</Text>
        <Text style={styles.e1rmValue}>{set.estimated1RmKg > 0 ? set.estimated1RmKg : '-'}</Text>
      </View>

      {/* Checkbox Complete Action */}
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

      {/* Delete set option if uncompleted */}
      {!set.completed && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
    gap: 8,
  },
  rowCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  setTypeBtn: {
    width: 34,
    height: 34,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTypeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 8,
    height: 40,
  },
  input: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
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
  e1rmBadge: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  e1rmLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  e1rmValue: {
    color: THEME.colors.cyan,
    fontSize: 13,
    fontWeight: '800',
  },
  checkBtn: {
    width: 40,
    height: 40,
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
    backgroundColor: THEME.colors.surfaceElevated,
    borderColor: THEME.colors.border,
  },
  checkText: {
    fontSize: 18,
    fontWeight: '900',
  },
  deleteBtn: {
    padding: 6,
  },
  deleteText: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
