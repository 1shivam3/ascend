import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { THEME } from '../../constants/theme';
import { Exercise, WorkoutTemplate, TemplateSplitType } from '../../types/domain.types';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { TemplateRepository } from '../../database/repositories/TemplateRepository';
import { SupersetEngine } from '../../services/workout/SupersetEngine';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface TemplateBuilderModalProps {
  visible: boolean;
  userId: string;
  initialTemplate?: WorkoutTemplate | null;
  onClose: () => void;
  onSaved: (template: WorkoutTemplate) => void;
}

interface TemplateExerciseDraft {
  exerciseId: string;
  exerciseName: string;
  primaryMuscle: string;
  equipment: string;
  targetSets: number;
  targetReps: string;
  targetWeightKg: number | null;
  targetRpe: number | null;
  restSeconds: number;
  supersetId: string | null;
  notes: string | null;
}

const SPLIT_OPTIONS: TemplateSplitType[] = [
  'PUSH',
  'PULL',
  'LEGS',
  'UPPER',
  'LOWER',
  'FULL_BODY',
  'CUSTOM',
];

export const TemplateBuilderModal: React.FC<TemplateBuilderModalProps> = ({
  visible,
  userId,
  initialTemplate,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [splitType, setSplitType] = useState<TemplateSplitType>('PUSH');
  const [durationMin, setDurationMin] = useState(60);
  const [exercises, setExercises] = useState<TemplateExerciseDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Exercise Picker Sheet State
  const [pickerVisible, setPickerVisible] = useState(false);
  const [catalogExercises, setCatalogExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (initialTemplate) {
      setName(initialTemplate.name);
      setDescription(initialTemplate.description || '');
      setSplitType(initialTemplate.splitType);
      setDurationMin(initialTemplate.estimatedDurationMin || 60);
      setExercises(
        initialTemplate.exercises.map(e => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exercise?.name || 'Exercise',
          primaryMuscle: e.exercise?.primaryMuscle || 'General',
          equipment: e.exercise?.equipment || 'BARBELL',
          targetSets: e.targetSets || 3,
          targetReps: String(e.targetReps || '8-12'),
          targetWeightKg: e.targetWeightKg ?? null,
          targetRpe: e.targetRpe ?? null,
          restSeconds: e.restSeconds || 90,
          supersetId: e.supersetId || null,
          notes: e.notes || null,
        }))
      );
    } else {
      setName('');
      setDescription('');
      setSplitType('PUSH');
      setDurationMin(60);
      setExercises([]);
    }
  }, [initialTemplate, visible]);

  useEffect(() => {
    if (pickerVisible) {
      ExerciseRepository.search(searchQuery).then(setCatalogExercises);
    }
  }, [pickerVisible, searchQuery]);

  const handleAddExerciseFromCatalog = (ex: Exercise) => {
    setExercises(prev => [
      ...prev,
      {
        exerciseId: ex.id,
        exerciseName: ex.name,
        primaryMuscle: ex.primaryMuscle,
        equipment: ex.equipment,
        targetSets: 3,
        targetReps: '8-10',
        targetWeightKg: ex.equipment === 'BARBELL' ? 60 : ex.equipment === 'DUMBBELL' ? 20 : 0,
        targetRpe: 8,
        restSeconds: 90,
        supersetId: null,
        notes: null,
      },
    ]);
    setPickerVisible(false);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveExercise = (index: number, direction: 'UP' | 'DOWN') => {
    setExercises(prev => {
      const next = [...prev];
      const targetIndex = direction === 'UP' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleToggleSupersetWithNext = (index: number) => {
    if (index >= exercises.length - 1) return;

    setExercises(prev => {
      const next = [...prev];
      const current = next[index];
      const target = next[index + 1];

      if (current.supersetId && current.supersetId === target.supersetId) {
        // Unlink them
        current.supersetId = null;
        target.supersetId = null;
      } else {
        // Link them
        const existingIds = next.map(e => e.supersetId);
        const newSsId = current.supersetId || target.supersetId || SupersetEngine.generateSupersetId(existingIds);
        current.supersetId = newSsId;
        target.supersetId = newSsId;
      }
      return next;
    });
  };

  const handleUpdateExerciseField = <K extends keyof TemplateExerciseDraft>(
    index: number,
    field: K,
    value: TemplateExerciseDraft[K]
  ) => {
    setExercises(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter a name for this routine template.');
      return;
    }
    if (exercises.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one exercise to this routine.');
      return;
    }

    setIsSaving(true);
    try {
      const template = await TemplateRepository.saveTemplate(
        userId,
        {
          id: initialTemplate?.id,
          name: name.trim(),
          description: description.trim() || null,
          splitType,
          folder: 'Custom Routines',
          isPreset: false,
          estimatedDurationMin: durationMin,
        },
        exercises.map((e, idx) => ({
          exerciseId: e.exerciseId,
          orderIndex: idx,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          targetWeightKg: e.targetWeightKg,
          targetRpe: e.targetRpe,
          restSeconds: e.restSeconds,
          supersetId: e.supersetId,
          notes: e.notes,
        }))
      );

      onSaved(template);
      onClose();
    } catch (err) {
      console.error('Failed to save workout template:', err);
      Alert.alert('Save Failed', 'Could not save routine template. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Heading level={2} style={styles.headerTitle}>
                {initialTemplate ? 'EDIT ROUTINE' : 'CREATE ROUTINE'}
              </Heading>
              <Caption color={THEME.colors.cyan}>
                TACTICAL TEMPLATE SPECIFICATION
              </Caption>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Routine Name */}
            <View style={styles.fieldGroup}>
              <Caption style={styles.fieldLabel}>ROUTINE DESIGNATION</Caption>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Upper Heavy Blitz"
                placeholderTextColor={THEME.colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Split Type Selector */}
            <View style={styles.fieldGroup}>
              <Caption style={styles.fieldLabel}>TACTICAL SPLIT CATEGORY</Caption>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.splitRow}>
                {SPLIT_OPTIONS.map(split => {
                  const isSelected = splitType === split;
                  return (
                    <TouchableOpacity
                      key={split}
                      onPress={() => setSplitType(split)}
                      style={[styles.splitChip, isSelected && styles.splitChipSelected]}
                    >
                      <Text style={[styles.splitChipText, isSelected && styles.splitChipTextSelected]}>
                        {split}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Duration Selector */}
            <View style={styles.fieldGroup}>
              <Caption style={styles.fieldLabel}>ESTIMATED DURATION: {durationMin} MIN</Caption>
              <View style={styles.durationRow}>
                {[45, 60, 75, 90].map(mins => (
                  <TouchableOpacity
                    key={mins}
                    onPress={() => setDurationMin(mins)}
                    style={[styles.durationBtn, durationMin === mins && styles.durationBtnActive]}
                  >
                    <Text style={[styles.durationBtnText, durationMin === mins && styles.durationBtnTextActive]}>
                      {mins}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Prescribed Movements */}
            <View style={styles.movementsHeader}>
              <Caption style={styles.fieldLabel}>PRESCRIBED MOVEMENTS ({exercises.length})</Caption>
              <TouchableOpacity onPress={() => setPickerVisible(true)} style={styles.addExerciseMiniBtn}>
                <Text style={styles.addExerciseMiniBtnText}>+ ADD MOVEMENT</Text>
              </TouchableOpacity>
            </View>

            {exercises.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyText}>No movements prescribed yet.</Text>
                <Caption style={styles.emptySub}>
                  Add exercises from the catalog to build your training protocol.
                </Caption>
              </Card>
            ) : (
              exercises.map((item, idx) => {
                const isNextInSuperset = idx < exercises.length - 1 && item.supersetId && item.supersetId === exercises[idx + 1].supersetId;
                return (
                  <Card key={`${item.exerciseId}-${idx}`} style={[styles.exerciseCard, item.supersetId ? styles.exerciseCardSuperset : null]}>
                    <View style={styles.exerciseHeader}>
                      <View style={styles.exerciseNameCol}>
                        <View style={styles.exerciseBadgeRow}>
                          <MonoText style={styles.exerciseIndex}>#{String(idx + 1).padStart(2, '0')}</MonoText>
                          {item.supersetId && (
                            <Badge label={`SUPERSET ${item.supersetId}`} variant="amber" size="sm" />
                          )}
                          <Badge label={item.primaryMuscle} variant="cyan" size="sm" />
                        </View>
                        <Text style={styles.exerciseName}>{item.exerciseName}</Text>
                      </View>

                      {/* Reorder and Delete Controls */}
                      <View style={styles.reorderControls}>
                        <TouchableOpacity
                          disabled={idx === 0}
                          onPress={() => handleMoveExercise(idx, 'UP')}
                          style={[styles.iconBtn, idx === 0 && styles.iconBtnDisabled]}
                        >
                          <Text style={styles.iconBtnText}>▲</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          disabled={idx === exercises.length - 1}
                          onPress={() => handleMoveExercise(idx, 'DOWN')}
                          style={[styles.iconBtn, idx === exercises.length - 1 && styles.iconBtnDisabled]}
                        >
                          <Text style={styles.iconBtnText}>▼</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRemoveExercise(idx)} style={styles.deleteBtn}>
                          <Text style={styles.deleteBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Prescriptions Grid: Sets, Reps, Weight, Rest */}
                    <View style={styles.prescriptionGrid}>
                      <View style={styles.gridItem}>
                        <Caption style={styles.gridLabel}>SETS</Caption>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity
                            onPress={() => handleUpdateExerciseField(idx, 'targetSets', Math.max(1, item.targetSets - 1))}
                            style={styles.stepBtn}
                          >
                            <Text style={styles.stepBtnText}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepValue}>{item.targetSets}</Text>
                          <TouchableOpacity
                            onPress={() => handleUpdateExerciseField(idx, 'targetSets', item.targetSets + 1)}
                            style={styles.stepBtn}
                          >
                            <Text style={styles.stepBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.gridItem}>
                        <Caption style={styles.gridLabel}>TARGET REPS</Caption>
                        <TextInput
                          style={styles.gridInput}
                          value={item.targetReps}
                          onChangeText={val => handleUpdateExerciseField(idx, 'targetReps', val)}
                          placeholder="8-12"
                          placeholderTextColor={THEME.colors.textMuted}
                        />
                      </View>

                      <View style={styles.gridItem}>
                        <Caption style={styles.gridLabel}>WEIGHT (KG)</Caption>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity
                            onPress={() => handleUpdateExerciseField(idx, 'targetWeightKg', Math.max(0, (item.targetWeightKg || 0) - 2.5))}
                            style={styles.stepBtn}
                          >
                            <Text style={styles.stepBtnText}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepValue}>{item.targetWeightKg ?? 0}</Text>
                          <TouchableOpacity
                            onPress={() => handleUpdateExerciseField(idx, 'targetWeightKg', (item.targetWeightKg || 0) + 2.5)}
                            style={styles.stepBtn}
                          >
                            <Text style={styles.stepBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.gridItem}>
                        <Caption style={styles.gridLabel}>REST</Caption>
                        <TouchableOpacity
                          onPress={() => {
                            const cycle = [30, 60, 90, 120, 180];
                            const currentIdx = cycle.indexOf(item.restSeconds);
                            const nextRest = cycle[(currentIdx + 1) % cycle.length];
                            handleUpdateExerciseField(idx, 'restSeconds', nextRest);
                          }}
                          style={styles.restToggleBtn}
                        >
                          <Text style={styles.restToggleText}>{item.restSeconds}s</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Superset Link with Next Action */}
                    {idx < exercises.length - 1 && (
                      <TouchableOpacity
                        onPress={() => handleToggleSupersetWithNext(idx)}
                        style={[styles.supersetToggleBar, isNextInSuperset && styles.supersetToggleBarActive]}
                      >
                        <Text style={[styles.supersetToggleText, isNextInSuperset && styles.supersetToggleTextActive]}>
                          {isNextInSuperset ? '✓ LINKED AS SUPERSET WITH NEXT MOVEMENT' : '+ LINK AS SUPERSET WITH NEXT MOVEMENT'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </Card>
                );
              })
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* Footer CTA */}
          <View style={styles.footer}>
            <Button
              title={isSaving ? 'SAVING...' : 'SAVE ROUTINE TEMPLATE'}
              onPress={handleSave}
              disabled={isSaving}
              variant="primary"
              style={styles.saveBtn}
            />
          </View>
        </View>

        {/* Exercise Catalog Picker Modal */}
        <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <Heading level={3}>SELECT EXERCISE</Heading>
                <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search exercises by name or muscle..."
                placeholderTextColor={THEME.colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
                {catalogExercises.map(ex => (
                  <TouchableOpacity
                    key={ex.id}
                    onPress={() => handleAddExerciseFromCatalog(ex)}
                    style={styles.pickerItem}
                  >
                    <View>
                      <Text style={styles.pickerItemName}>{ex.name}</Text>
                      <Caption style={styles.pickerItemSub}>
                        {ex.primaryMuscle} • {ex.equipment}
                      </Caption>
                    </View>
                    <Badge label="+ ADD" variant="cyan" size="sm" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: THEME.colors.background,
    borderTopLeftRadius: THEME.borderRadius.lg,
    borderTopRightRadius: THEME.borderRadius.lg,
    height: '92%',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  headerTitle: {
    letterSpacing: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  closeBtnText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    padding: THEME.spacing.md,
  },
  fieldGroup: {
    marginBottom: THEME.spacing.md,
  },
  fieldLabel: {
    color: THEME.colors.textSecondary,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    color: THEME.colors.textPrimary,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  splitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.sharp,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  splitChipSelected: {
    backgroundColor: THEME.colors.cyan,
    borderColor: THEME.colors.cyan,
  },
  splitChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
  },
  splitChipTextSelected: {
    color: '#000',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  durationBtnActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
  },
  durationBtnText: {
    color: THEME.colors.textSecondary,
    fontWeight: '800',
    fontSize: 13,
  },
  durationBtnTextActive: {
    color: THEME.colors.cyan,
  },
  movementsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  addExerciseMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.cyan,
  },
  addExerciseMiniBtnText: {
    color: THEME.colors.cyan,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyCard: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
  },
  emptyText: {
    color: THEME.colors.textPrimary,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    textAlign: 'center',
  },
  exerciseCard: {
    marginBottom: THEME.spacing.md,
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  exerciseCardSuperset: {
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.amber,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: THEME.spacing.sm,
  },
  exerciseNameCol: {
    flex: 1,
  },
  exerciseBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  exerciseIndex: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  reorderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: THEME.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  iconBtnDisabled: {
    opacity: 0.3,
  },
  iconBtnText: {
    color: THEME.colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 51, 102, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.crimson,
    marginLeft: 4,
  },
  deleteBtnText: {
    color: THEME.colors.crimson,
    fontSize: 12,
    fontWeight: '900',
  },
  prescriptionGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  gridItem: {
    flex: 1,
  },
  gridLabel: {
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    height: 36,
  },
  stepBtn: {
    width: 26,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: THEME.colors.cyan,
    fontSize: 14,
    fontWeight: '900',
  },
  stepValue: {
    flex: 1,
    textAlign: 'center',
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  gridInput: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    color: THEME.colors.textPrimary,
    height: 36,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
  },
  restToggleBtn: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restToggleText: {
    color: THEME.colors.amber,
    fontSize: 12,
    fontWeight: '800',
  },
  supersetToggleBar: {
    marginTop: THEME.spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.sharp,
    backgroundColor: 'rgba(255, 184, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.25)',
    alignItems: 'center',
  },
  supersetToggleBarActive: {
    backgroundColor: 'rgba(255, 184, 0, 0.18)',
    borderColor: THEME.colors.amber,
  },
  supersetToggleText: {
    color: THEME.colors.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  supersetToggleTextActive: {
    color: THEME.colors.amber,
    fontWeight: '900',
  },
  footer: {
    padding: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  saveBtn: {
    width: '100%',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.9)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: THEME.colors.background,
    borderTopLeftRadius: THEME.borderRadius.lg,
    borderTopRightRadius: THEME.borderRadius.lg,
    height: '80%',
    padding: THEME.spacing.md,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  pickerSearchInput: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    color: THEME.colors.textPrimary,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: THEME.spacing.md,
  },
  pickerList: {
    flex: 1,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  pickerItemName: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  pickerItemSub: {
    color: THEME.colors.textSecondary,
  },
});
