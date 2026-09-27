import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { WorkoutSession, SetLog, SetType } from '../../types/domain.types';

interface EditWorkoutRecordModalProps {
  visible: boolean;
  workout: WorkoutSession | null;
  onClose: () => void;
  onUpdateSet: (setId: string, updates: { weightKg: number; reps: number; rpe?: number | null; setType?: SetType }) => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
  onDeleteWorkout: (workoutId: string) => Promise<void>;
}

export const EditWorkoutRecordModal: React.FC<EditWorkoutRecordModalProps> = ({
  visible,
  workout,
  onClose,
  onUpdateSet,
  onDeleteSet,
  onDeleteWorkout,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  // Selected set for editing
  const [editingSet, setEditingSet] = useState<SetLog | null>(null);
  const [weightStr, setWeightStr] = useState('');
  const [repsStr, setRepsStr] = useState('');
  const [rpeStr, setRpeStr] = useState('');
  const [setType, setSetType] = useState<SetType>('NORMAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!workout) return null;

  const startEditSet = (set: SetLog) => {
    setEditingSet(set);
    setWeightStr(String(set.weightKg || 0));
    setRepsStr(String(set.reps || 0));
    setRpeStr(set.rpe ? String(set.rpe) : '');
    setSetType(set.setType || 'NORMAL');
    setError(null);
    Haptics.selectionAsync();
  };

  const handleSaveSet = async () => {
    if (!editingSet) return;
    const w = parseFloat(weightStr);
    const r = parseInt(repsStr, 10);
    const rpeVal = rpeStr ? parseFloat(rpeStr) : null;

    if (isNaN(w) || w < 0 || w > 500) {
      setError('Weight must be between 0 and 500 kg.');
      return;
    }
    if (isNaN(r) || r < 0 || r > 100) {
      setError('Reps must be between 0 and 100.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onUpdateSet(editingSet.id, {
        weightKg: w,
        reps: r,
        rpe: rpeVal,
        setType,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingSet(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update set');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteSet = (setId: string) => {
    Alert.alert(
      'Remove Set',
      'Are you sure you want to remove this set record? Personal records and session volume will be automatically recalculated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await onDeleteSet(setId);
              setEditingSet(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete set');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const confirmDeleteWorkout = () => {
    Alert.alert(
      'Delete Workout Record',
      `Delete "${workout.title}"? This will permanently remove this session and recalculate all exercise PRs and totals.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Workout',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await onDeleteWorkout(workout.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onClose();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete workout');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Heading level={3} style={{ color: colors.textPrimary }}>
              Manage Workout Record
            </Heading>
            <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
              {workout.title} • {new Date(workout.startedAt).toLocaleDateString()}
            </Caption>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Active Set Edit Form (if selected) */}
          {editingSet && (
            <Card variant="elevated" style={[styles.editCard, { borderColor: colors.primary, borderWidth: 1.5 }]}>
              <View style={styles.editHeaderRow}>
                <Text style={{ fontWeight: '800', color: colors.primary }}>
                  Editing Set {editingSet.setNumber}
                </Text>
                <TouchableOpacity onPress={() => setEditingSet(null)}>
                  <Caption style={{ color: colors.textMuted }}>Done</Caption>
                </TouchableOpacity>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Caption style={{ color: colors.textMuted, marginBottom: 4 }}>WEIGHT (KG)</Caption>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: borderRadius.sm }]}
                    value={weightStr}
                    onChangeText={setWeightStr}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Caption style={{ color: colors.textMuted, marginBottom: 4 }}>REPS</Caption>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: borderRadius.sm }]}
                    value={repsStr}
                    onChangeText={setRepsStr}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Caption style={{ color: colors.textMuted, marginBottom: 4 }}>RPE (1-10)</Caption>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: borderRadius.sm }]}
                    value={rpeStr}
                    onChangeText={setRpeStr}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 8.5"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              {/* Set Type Pills */}
              <View style={styles.typePillRow}>
                {(['NORMAL', 'WARMUP', 'DROP', 'FAILURE'] as SetType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setSetType(t)}
                    style={[
                      styles.typePill,
                      {
                        backgroundColor: setType === t ? (isDark ? colors.cyan : colors.primary) : colors.surface,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: setType === t ? '#FFFFFF' : colors.textSecondary,
                      }}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {error && <Caption style={{ color: colors.crimson, marginTop: 8 }}>{error}</Caption>}

              <View style={styles.editActionRow}>
                <Button
                  title="Remove Set"
                  variant="outline"
                  size="sm"
                  onPress={() => confirmDeleteSet(editingSet.id)}
                  style={{ borderColor: colors.crimson }}
                />
                <Button
                  title={saving ? 'Saving...' : 'Save Changes'}
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  onPress={handleSaveSet}
                />
              </View>
            </Card>
          )}

          {/* Exercise & Sets List */}
          <Caption upper style={{ fontWeight: '800', color: colors.textMuted, marginBottom: 8 }}>
            SESSION EXERCISES & SET LOGS
          </Caption>

          {workout.exercises.map((el) => (
            <Card key={el.id} variant="surface" style={styles.exerciseCard}>
              <View style={styles.exTitleRow}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                  {el.exercise?.name || 'Exercise'}
                </Text>
                <Caption style={{ color: colors.textMuted }}>{el.sets.length} sets</Caption>
              </View>

              <View style={styles.setsList}>
                {el.sets.map((s) => {
                  const isBeingEdited = editingSet?.id === s.id;
                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.setRow,
                        {
                          borderBottomColor: colors.borderSubtle,
                          backgroundColor: isBeingEdited ? `${colors.primary}12` : 'transparent',
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                          Set {s.setNumber}
                        </Text>
                        <Badge label={s.setType} size="sm" variant={s.setType === 'WARMUP' ? 'neutral' : 'emerald'} />
                      </View>

                      <MonoText style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                        {s.weightKg} kg × {s.reps} reps {s.rpe ? `@ RPE ${s.rpe}` : ''}
                      </MonoText>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => startEditSet(s)}
                          style={[styles.iconActionBtn, { backgroundColor: `${colors.primary}18`, borderRadius: borderRadius.xs }]}
                        >
                          <Ionicons name="pencil-outline" size={14} color={isDark ? colors.cyan : colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => confirmDeleteSet(s.id)}
                          style={[styles.iconActionBtn, { backgroundColor: `${colors.crimson}18`, borderRadius: borderRadius.xs }]}
                        >
                          <Ionicons name="trash-outline" size={14} color={colors.crimson} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          ))}

          {/* Delete Duplicate Workout Button */}
          <View style={{ marginTop: 24, paddingBottom: 24 }}>
            <Button
              title="Delete Entire Workout Session"
              variant="outline"
              size="md"
              onPress={confirmDeleteWorkout}
              style={{ borderColor: colors.crimson }}
            />
            <Caption style={{ textAlign: 'center', color: colors.textMuted, marginTop: 6 }}>
              Use to remove duplicate logged workouts or erroneous sessions.
            </Caption>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  editCard: {
    padding: 14,
    marginBottom: 16,
  },
  editHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    height: 44,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
  },
  typePillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  editActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  exerciseCard: {
    padding: 14,
    marginBottom: 12,
  },
  exTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  setsList: {
    gap: 4,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  iconActionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
