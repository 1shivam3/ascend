import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME, useTheme } from '../../constants/theme';
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
  onUpdateNotes?: (notes: string) => void;
  onViewDetails?: () => void;
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
  onUpdateNotes,
  onViewDetails,
}) => {
  const { colors, borderRadius, isDark } = useTheme();
  const exercise = exerciseLog.exercise;
  const prescription = exerciseLog.prescription;

  const [notesOpen, setNotesOpen] = useState(Boolean(exerciseLog.notes));
  const [notesText, setNotesText] = useState(exerciseLog.notes || '');

  useEffect(() => {
    setNotesText(exerciseLog.notes || '');
  }, [exerciseLog.notes]);

  const handleNotesChange = (text: string) => {
    setNotesText(text);
    onUpdateNotes?.(text);
  };

  const getRestGuidance = () => {
    if (prescription?.rest_seconds) {
      return `${prescription.rest_seconds}s`;
    }
    if (exercise?.tier === 'COMPOUND_PRIMARY' || exercise?.tier === 'COMPOUND_SECONDARY') {
      return '2-3 min (compounds)';
    }
    if (exercise?.tier === 'ACCESSORY') {
      return '90-120s (accessories)';
    }
    return '60-90s (isolation)';
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: borderRadius.lg,
        },
        supersetBadge ? [styles.supersetCard, { borderLeftColor: colors.amber }] : null,
      ]}
    >
      {/* Superset Banner */}
      {supersetBadge && (
        <View
          style={[
            styles.supersetBanner,
            {
              backgroundColor: `${colors.amber}18`,
              borderColor: `${colors.amber}40`,
              borderRadius: borderRadius.sm,
            },
          ]}
        >
          <Text style={[styles.supersetBannerText, { color: colors.amber }]}>
            SUPERSET [{supersetBadge}]
          </Text>
          {onToggleSuperset && (
            <TouchableOpacity
              onPress={onToggleSuperset}
              style={[styles.unlinkBtn, { backgroundColor: `${colors.amber}25` }]}
            >
              <Text style={[styles.unlinkText, { color: colors.amber }]}>UNLINK</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onViewDetails}
          disabled={!onViewDetails}
          activeOpacity={onViewDetails ? 0.7 : 1}
          style={styles.titleContainer}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>
              {exercise?.name || 'Exercise'}
            </Text>
            {onViewDetails && (
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.cyan}
                style={styles.infoIcon}
              />
            )}
          </View>
          <View style={styles.badgeRow}>
            {exercise?.primaryMuscle && (
              <TacticalBadge label={exercise.primaryMuscle} size="sm" color={colors.cyan} />
            )}
            {exercise?.difficulty && (
              <TacticalBadge
                label={exercise.difficulty}
                size="sm"
                color={
                  exercise.difficulty === 'BEGINNER'
                    ? colors.emerald
                    : exercise.difficulty === 'INTERMEDIATE'
                    ? colors.amber
                    : colors.crimson
                }
              />
            )}
            {exercise?.equipment && (
              <TacticalBadge
                label={exercise.equipment}
                size="sm"
                color={colors.textSecondary}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Action Controls: Note, Replace, Skip, Remove */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setNotesOpen(!notesOpen)}
            style={styles.actionBtn}
            accessibilityLabel="Toggle exercise notes"
          >
            <Text
              style={[
                styles.noteActionText,
                { color: notesText.trim() ? colors.cyan : colors.textMuted },
              ]}
            >
              {notesText.trim() ? 'NOTE •' : '+ NOTE'}
            </Text>
          </TouchableOpacity>

          {!supersetBadge && onToggleSuperset && (
            <TouchableOpacity onPress={onToggleSuperset} style={styles.actionBtn}>
              <Text style={[styles.supersetActionText, { color: colors.amber }]}>
                + SUPERSET
              </Text>
            </TouchableOpacity>
          )}
          {onReplaceExercise && (
            <TouchableOpacity onPress={onReplaceExercise} style={styles.actionBtn}>
              <Text style={[styles.replaceText, { color: colors.cyan }]}>REPLACE</Text>
            </TouchableOpacity>
          )}
          {onSkipExercise && (
            <TouchableOpacity onPress={onSkipExercise} style={styles.actionBtn}>
              <Text style={[styles.skipText, { color: colors.amber }]}>SKIP</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onRemoveExercise} style={styles.actionBtn}>
            <Text style={[styles.removeText, { color: colors.crimson }]}>REMOVE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Prescription Target Bar */}
      {prescription && (
        <View
          style={[
            styles.prescriptionBar,
            {
              backgroundColor: colors.surfaceElevated,
              borderRadius: borderRadius.sm,
            },
          ]}
        >
          <Text style={[styles.prescriptionLabel, { color: colors.cyan }]}>TARGET:</Text>
          <Text style={[styles.prescriptionVal, { color: colors.textPrimary }]}>
            {prescription.sets} sets × {prescription.target_reps} reps
            {prescription.target_weight ? ` @ ${prescription.target_weight}kg` : ''}
          </Text>
          <Text style={[styles.restVal, { color: colors.textMuted }]}>
            • Rest: {prescription.rest_seconds}s
          </Text>
        </View>
      )}

      {/* Rest Guidance Tip */}
      <View
        style={[
          styles.restGuidanceBar,
          {
            backgroundColor: isDark ? 'rgba(0, 229, 255, 0.05)' : colors.surfaceElevated,
            borderRadius: borderRadius.sm,
          },
        ]}
      >
        <Ionicons name="timer-outline" size={12} color={colors.cyan} />
        <Text style={[styles.restGuidanceText, { color: colors.textSecondary }]}>
          Rest guidance: {getRestGuidance()} • Rest as needed
        </Text>
      </View>

      {/* Expandable Notes Input */}
      {notesOpen && (
        <View style={styles.notesSection}>
          <TextInput
            style={[
              styles.notesInput,
              {
                color: colors.textPrimary,
                borderColor: colors.borderSubtle,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.surfaceElevated,
                borderRadius: borderRadius.sm,
              },
            ]}
            placeholder="Log form cues, equipment setup, or performance notes..."
            placeholderTextColor={colors.textMuted}
            value={notesText}
            onChangeText={handleNotesChange}
            multiline
            numberOfLines={2}
          />
        </View>
      )}

      {/* Table Column Headers */}
      <View style={[styles.columnHeaders, { borderBottomColor: colors.borderSubtle }]}>
        <Text style={[styles.colLabel, { width: 32, textAlign: 'center', color: colors.textMuted }]}>
          SET
        </Text>
        <Text style={[styles.colLabel, { minWidth: 44, textAlign: 'center', color: colors.textMuted }]}>
          REF
        </Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center', color: colors.textMuted }]}>
          KG
        </Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center', color: colors.textMuted }]}>
          REPS
        </Text>
        <Text style={[styles.colLabel, { width: 38, textAlign: 'center', color: colors.textMuted }]}>
          RPE
        </Text>
        <Text style={[styles.colLabel, { width: 34, textAlign: 'center', color: colors.textMuted }]}>
          DONE
        </Text>
      </View>

      {/* Set Rows */}
      {exerciseLog.sets.map((set) => (
        <SetRow
          key={set.id}
          set={set}
          previousPerformance={previousPerformance}
          targetWeight={prescription?.target_weight}
          targetReps={prescription?.target_reps}
          onUpdate={(updates) => onUpdateSet(set.id, updates)}
          onToggleCompleted={() => onToggleSetCompleted(set.id)}
          onSkipSet={onSkipSet ? () => onSkipSet(set.id) : undefined}
          onOpenPlateCalculator={() => onOpenPlateCalculator(set)}
          onDelete={() => onDeleteSet(set.id)}
        />
      ))}

      {/* Add Set Action Buttons */}
      <View style={styles.footerRow}>
        <TouchableOpacity
          onPress={() => onAddSet('NORMAL')}
          style={[
            styles.addSetBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              borderRadius: borderRadius.sm,
            },
          ]}
        >
          <Text style={[styles.addSetText, { color: colors.textPrimary }]}>+ ADD SET</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onAddSet('WARMUP')}
          style={[
            styles.addWarmupBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.amber,
              borderRadius: borderRadius.sm,
            },
          ]}
        >
          <Text style={[styles.addWarmupText, { color: colors.amber }]}>+ WARMUP</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onAddSet('DROP')}
          style={[
            styles.addDropBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.violet,
              borderRadius: borderRadius.sm,
            },
          ]}
        >
          <Text style={[styles.addDropText, { color: colors.violet }]}>+ DROP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  infoIcon: {
    marginLeft: 2,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '800',
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
  noteActionText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  replaceText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  skipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  removeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prescriptionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 4,
    gap: 6,
  },
  prescriptionLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  prescriptionVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  restVal: {
    fontSize: 10,
  },
  restGuidanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 4,
  },
  restGuidanceText: {
    fontSize: 10,
    fontWeight: '600',
  },
  notesSection: {
    marginVertical: 6,
  },
  notesInput: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    minHeight: 44,
    textAlignVertical: 'top',
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
