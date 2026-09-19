import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../constants/theme';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { Exercise, SetLog } from '../../types/domain.types';
import { WorkoutProgressionResult } from '../../types/progression.types';
import { ExerciseCard } from '../../components/workout/ExerciseCard';
import { RestTimerBar } from '../../components/workout/RestTimerBar';
import { PlateCalculatorModal } from '../../components/hud/PlateCalculatorModal';
import { ProgressionSummaryModal } from '../../components/workout/ProgressionSummaryModal';
import { TacticalButton } from '../../components/ui/TacticalButton';
import { TacticalBadge } from '../../components/ui/TacticalBadge';

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const {
    activeWorkout,
    elapsedSeconds,
    tickTimer,
    addExercise,
    removeExercise,
    addSet,
    updateSet,
    toggleSetCompleted,
    deleteSet,
    finishWorkout,
    discardWorkout,
    startWorkout,
  } = useWorkoutStore();

  const loadProfile = useAuthStore(s => s.loadProfile);

  // Modal States
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Plate Calculator State
  const [plateCalcVisible, setPlateCalcVisible] = useState(false);
  const [targetSetForPlates, setTargetSetForPlates] = useState<{ exerciseLogId: string; set: SetLog } | null>(null);

  // Progression Summary State
  const [progressionResult, setProgressionResult] = useState<WorkoutProgressionResult | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);

  // Timer Tick
  useEffect(() => {
    const interval = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [tickTimer]);

  // Load exercises when picker opens
  useEffect(() => {
    if (exercisePickerVisible) {
      ExerciseRepository.search(searchQuery).then(setAvailableExercises);
    }
  }, [exercisePickerVisible, searchQuery]);

  // Auto-init if accessed without active session
  useEffect(() => {
    if (!activeWorkout) {
      startWorkout('Field Deployment');
    }
  }, [activeWorkout, startWorkout]);

  const handleFinish = async () => {
    if (!activeWorkout || activeWorkout.exercises.length === 0) {
      Alert.alert('Empty Session', 'Log at least one exercise before completing.');
      return;
    }

    const completedSets = activeWorkout.exercises.flatMap(e => e.sets).filter(s => s.completed);
    if (completedSets.length === 0) {
      Alert.alert('No Completed Sets', 'Mark at least one set completed (✓) to mint progression.');
      return;
    }

    const result = await finishWorkout();
    if (result) {
      await loadProfile();
      setProgressionResult(result);
      setSummaryVisible(true);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      'Discard Session?',
      'All unsaved set data for this workout will be erased.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            discardWorkout();
            router.back();
          },
        },
      ]
    );
  };

  const handleSelectExercise = async (ex: Exercise) => {
    await addExercise(ex);
    setExercisePickerVisible(false);
    setSearchQuery('');
  };

  const handleOpenPlateCalc = (exerciseLogId: string, set: SetLog) => {
    setTargetSetForPlates({ exerciseLogId, set });
    setPlateCalcVisible(true);
  };

  const handleApplyPlateWeight = (weightKg: number) => {
    if (targetSetForPlates) {
      updateSet(targetSetForPlates.exerciseLogId, targetSetForPlates.set.id, {
        weightKg,
      });
    }
  };

  // Format Elapsed Time
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Calculate live session tonnage
  const currentVolume = activeWorkout?.exercises
    .flatMap(e => e.sets)
    .filter(s => s.completed)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0) || 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Tactical Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleDiscard} style={styles.discardBtn}>
          <Text style={styles.discardText}>DISCARD</Text>
        </TouchableOpacity>

        <View style={styles.timerBadge}>
          <View style={styles.recordDot} />
          <Text style={styles.timerDigits}>{formattedTime}</Text>
        </View>

        <TouchableOpacity onPress={handleFinish} style={styles.finishBtn}>
          <Text style={styles.finishText}>FINISH</Text>
        </TouchableOpacity>
      </View>

      {/* Session Title & Tonnage HUD */}
      <View style={styles.hudSection}>
        <Text style={styles.workoutTitle}>{activeWorkout?.title || 'Tactical Training'}</Text>
        <View style={styles.hudMetricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>VOLUME</Text>
            <Text style={styles.metricValue}>{Math.round(currentVolume)} kg</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>MOVEMENTS</Text>
            <Text style={styles.metricValue}>{activeWorkout?.exercises.length || 0}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>SETS DONE</Text>
            <Text style={styles.metricValue}>
              {activeWorkout?.exercises.flatMap(e => e.sets).filter(s => s.completed).length || 0}
            </Text>
          </View>
        </View>
      </View>

      {/* Exercise Cards List */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeWorkout?.exercises.map(el => (
          <ExerciseCard
            key={el.id}
            exerciseLog={el}
            onAddSet={setType => addSet(el.id, setType)}
            onUpdateSet={(setId, updates) => updateSet(el.id, setId, updates)}
            onToggleSetCompleted={setId => toggleSetCompleted(el.id, setId)}
            onDeleteSet={setId => deleteSet(el.id, setId)}
            onRemoveExercise={() => removeExercise(el.id)}
            onOpenPlateCalculator={set => handleOpenPlateCalc(el.id, set)}
          />
        ))}

        {/* Add Movement Action */}
        <TacticalButton
          title="+ ADD MOVEMENT"
          size="md"
          variant="secondary"
          onPress={() => setExercisePickerVisible(true)}
          style={styles.addExerciseBtn}
        />
      </ScrollView>

      {/* Rest Timer Floating Bar */}
      <RestTimerBar />

      {/* Plate Calculator Modal */}
      {targetSetForPlates && (
        <PlateCalculatorModal
          visible={plateCalcVisible}
          initialWeightKg={targetSetForPlates.set.weightKg}
          onClose={() => setPlateCalcVisible(false)}
          onApplyWeight={handleApplyPlateWeight}
        />
      )}

      {/* Exercise Picker Modal */}
      <Modal visible={exercisePickerVisible} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>SELECT MOVEMENT</Text>
              <TouchableOpacity onPress={() => setExercisePickerVisible(false)}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search exercise name or muscle..."
              placeholderTextColor={THEME.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <ScrollView style={styles.pickerList}>
              {availableExercises.map(ex => (
                <TouchableOpacity
                  key={ex.id}
                  style={styles.pickerItem}
                  onPress={() => handleSelectExercise(ex)}
                >
                  <View>
                    <Text style={styles.pickerItemName}>{ex.name}</Text>
                    <Text style={styles.pickerItemSub}>
                      {ex.primaryMuscle} • {ex.equipment}
                    </Text>
                  </View>
                  <TacticalBadge label={ex.movementPattern.replace('_', ' ')} size="sm" color={THEME.colors.cyan} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Level-Up & Progression Celebration Modal */}
      <ProgressionSummaryModal
        visible={summaryVisible}
        result={progressionResult}
        onDismiss={() => {
          setSummaryVisible(false);
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  discardBtn: {
    padding: 6,
  },
  discardText: {
    color: THEME.colors.crimson,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.crimson,
    marginRight: 6,
  },
  timerDigits: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  finishBtn: {
    backgroundColor: THEME.colors.cyan,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sm,
  },
  finishText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hudSection: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  workoutTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  hudMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    alignItems: 'flex-start',
  },
  metricLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metricValue: {
    color: THEME.colors.cyan,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  scrollContent: {
    padding: THEME.spacing.md,
    paddingBottom: 80,
  },
  addExerciseBtn: {
    marginTop: THEME.spacing.md,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: THEME.colors.backdrop,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: THEME.borderRadius.xl,
    borderTopRightRadius: THEME.borderRadius.xl,
    padding: THEME.spacing.lg,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  pickerTitle: {
    color: THEME.colors.cyan,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  pickerClose: {
    color: THEME.colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  pickerSearchInput: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    paddingHorizontal: 12,
    height: 44,
    color: THEME.colors.textPrimary,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  pickerList: {
    maxHeight: 380,
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
  },
  pickerItemSub: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
