import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { ExerciseLog, SetLog, SetType } from '../../types/domain.types';
import { TacticalBadge } from '../ui/TacticalBadge';
import { SetRow } from './SetRow';

interface ExerciseCardProps {
  exerciseLog: ExerciseLog;
  onAddSet: (setType?: SetType) => void;
  onUpdateSet: (setId: string, updates: Partial<SetLog>) => void;
  onToggleSetCompleted: (setId: string) => void;
  onDeleteSet: (setId: string) => void;
  onRemoveExercise: () => void;
  onOpenPlateCalculator: (set: SetLog) => void;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exerciseLog,
  onAddSet,
  onUpdateSet,
  onToggleSetCompleted,
  onDeleteSet,
  onRemoveExercise,
  onOpenPlateCalculator,
}) => {
  const exercise = exerciseLog.exercise;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.exerciseName}>{exercise?.name || 'Exercise'}</Text>
          <View style={styles.badgeRow}>
            {exercise?.primaryMuscle && (
              <TacticalBadge label={exercise.primaryMuscle} size="sm" color={THEME.colors.cyan} />
            )}
            {exercise?.equipment && (
              <TacticalBadge label={exercise.equipment} size="sm" color={THEME.colors.textSecondary} />
            )}
          </View>
        </View>

        <TouchableOpacity onPress={onRemoveExercise} style={styles.removeBtn}>
          <Text style={styles.removeText}>REMOVE</Text>
        </TouchableOpacity>
      </View>

      {/* Table Column Headers */}
      <View style={styles.columnHeaders}>
        <Text style={[styles.colLabel, { width: 34, textAlign: 'center' }]}>SET</Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>KG</Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>REPS</Text>
        <Text style={[styles.colLabel, { width: 48, textAlign: 'center' }]}>1RM</Text>
        <Text style={[styles.colLabel, { width: 40, textAlign: 'center' }]}>DONE</Text>
      </View>

      {/* Set Rows */}
      {exerciseLog.sets.map(set => (
        <SetRow
          key={set.id}
          set={set}
          onUpdate={updates => onUpdateSet(set.id, updates)}
          onToggleCompleted={() => onToggleSetCompleted(set.id)}
          onOpenPlateCalculator={() => onOpenPlateCalculator(set)}
          onDelete={() => onDeleteSet(set.id)}
        />
      ))}

      {/* Add Set Action */}
      <View style={styles.footerRow}>
        <TouchableOpacity onPress={() => onAddSet('NORMAL')} style={styles.addSetBtn}>
          <Text style={styles.addSetText}>+ ADD SET</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onAddSet('WARMUP')} style={styles.addWarmupBtn}>
          <Text style={styles.addWarmupText}>+ WARMUP</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onAddSet('DROP')} style={styles.addDropBtn}>
          <Text style={styles.addDropText}>+ DROP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    marginVertical: THEME.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: THEME.spacing.sm,
  },
  titleContainer: {
    flex: 1,
  },
  exerciseName: {
    color: THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  removeBtn: {
    padding: 4,
  },
  removeText: {
    color: THEME.colors.crimson,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    gap: 8,
  },
  colLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.md,
    gap: 8,
  },
  addSetBtn: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceElevated,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
  },
  addSetText: {
    color: THEME.colors.cyan,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  addWarmupBtn: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
  },
  addWarmupText: {
    color: THEME.colors.amber,
    fontSize: 11,
    fontWeight: '800',
  },
  addDropBtn: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
  },
  addDropText: {
    color: THEME.colors.violet,
    fontSize: 11,
    fontWeight: '800',
  },
});
