import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { ExerciseLog, SetLog, SetType } from '../../types/domain.types';
import { TacticalBadge } from '../ui/TacticalBadge';
import { SetRow } from './SetRow';

interface ExerciseCardProps {
  exerciseLog: ExerciseLog;
  previousPerformance?: { weightKg: number; reps: number } | null;
  supersetBadge?: string;
  onToggleSuperset?: () => void;
  onAddSet: (setType?: SetType) => void;
  onUpdateSet: (setId: string, updates: Partial<SetLog>) => void;
  onToggleSetCompleted: (setId: string) => void;
  onSkipSet?: (setId: string) => void;
  onDeleteSet: (setId: string) => void;
  onRemoveExercise: () => void;
  onReplaceExercise?: () => void;
  onSkipExercise?: () => void;
  onOpenPlateCalculator: (set: SetLog) => void;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exerciseLog,
  previousPerformance,
  supersetBadge,
  onToggleSuperset,
  onAddSet,
  onUpdateSet,
  onToggleSetCompleted,
  onSkipSet,
  onDeleteSet,
  onRemoveExercise,
  onReplaceExercise,
  onSkipExercise,
  onOpenPlateCalculator,
}) => {
  const exercise = exerciseLog.exercise;
  const prescription = exerciseLog.prescription;

  return (
    <View style={[styles.card, supersetBadge ? styles.supersetCard : null]}>
      {/* Superset Banner */}
      {supersetBadge && (
        <View style={styles.supersetBanner}>
          <Text style={styles.supersetBannerText}>SUPERSET [{supersetBadge}]</Text>
          {onToggleSuperset && (
            <TouchableOpacity onPress={onToggleSuperset} style={styles.unlinkBtn}>
              <Text style={styles.unlinkText}>UNLINK</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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

        {/* Action Controls: Replace, Skip, Remove */}
        <View style={styles.headerActions}>
          {!supersetBadge && onToggleSuperset && (
            <TouchableOpacity onPress={onToggleSuperset} style={styles.actionBtn}>
              <Text style={styles.supersetActionText}>+ SUPERSET</Text>
            </TouchableOpacity>
          )}
          {onReplaceExercise && (
            <TouchableOpacity onPress={onReplaceExercise} style={styles.actionBtn}>
              <Text style={styles.replaceText}>REPLACE</Text>
            </TouchableOpacity>
          )}
          {onSkipExercise && (
            <TouchableOpacity onPress={onSkipExercise} style={styles.actionBtn}>
              <Text style={styles.skipText}>SKIP</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onRemoveExercise} style={styles.actionBtn}>
            <Text style={styles.removeText}>REMOVE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Prescription Target Bar */}
      {prescription && (
        <View style={styles.prescriptionBar}>
          <Text style={styles.prescriptionLabel}>TARGET:</Text>
          <Text style={styles.prescriptionVal}>
            {prescription.sets} sets × {prescription.target_reps} reps
            {prescription.target_weight ? ` @ ${prescription.target_weight}kg` : ''}
          </Text>
          <Text style={styles.restVal}>• Rest: {prescription.rest_seconds}s</Text>
        </View>
      )}

      {/* Table Column Headers */}
      <View style={styles.columnHeaders}>
        <Text style={[styles.colLabel, { width: 32, textAlign: 'center' }]}>SET</Text>
        <Text style={[styles.colLabel, { minWidth: 44, textAlign: 'center' }]}>REF</Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>KG</Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>REPS</Text>
        <Text style={[styles.colLabel, { width: 38, textAlign: 'center' }]}>RPE</Text>
        <Text style={[styles.colLabel, { width: 34, textAlign: 'center' }]}>DONE</Text>
      </View>

      {/* Set Rows */}
      {exerciseLog.sets.map(set => (
        <SetRow
          key={set.id}
          set={set}
          previousPerformance={previousPerformance}
          targetWeight={prescription?.target_weight}
          targetReps={prescription?.target_reps}
          onUpdate={updates => onUpdateSet(set.id, updates)}
          onToggleCompleted={() => onToggleSetCompleted(set.id)}
          onSkipSet={onSkipSet ? () => onSkipSet(set.id) : undefined}
          onOpenPlateCalculator={() => onOpenPlateCalculator(set)}
          onDelete={() => onDeleteSet(set.id)}
        />
      ))}

      {/* Add Set Action Buttons */}
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
    marginBottom: THEME.spacing.xs,
  },
  titleContainer: {
    flex: 1,
  },
  exerciseName: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  replaceText: {
    color: THEME.colors.cyan,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  skipText: {
    color: THEME.colors.amber,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  removeText: {
    color: THEME.colors.crimson,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prescriptionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sharp,
    marginVertical: 4,
    gap: 6,
  },
  prescriptionLabel: {
    color: THEME.colors.cyan,
    fontSize: 10,
    fontWeight: '800',
  },
  prescriptionVal: {
    color: THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  restVal: {
    color: THEME.colors.textMuted,
    fontSize: 10,
  },
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    gap: 6,
  },
  colLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: THEME.spacing.sm,
  },
  addSetBtn: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addSetText: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  addWarmupBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.amber,
    alignItems: 'center',
  },
  addWarmupText: {
    color: THEME.colors.amber,
    fontSize: 11,
    fontWeight: '800',
  },
  addDropBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.violet,
    alignItems: 'center',
  },
  addDropText: {
    color: THEME.colors.violet,
    fontSize: 11,
    fontWeight: '800',
  },
  supersetCard: {
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.amber,
  },
  supersetBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sharp,
    marginBottom: THEME.spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.3)',
  },
  supersetBannerText: {
    color: THEME.colors.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  unlinkBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 184, 0, 0.2)',
  },
  unlinkText: {
    color: THEME.colors.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  supersetActionText: {
    color: THEME.colors.amber,
    fontSize: 10,
    fontWeight: '800',
  },
});
