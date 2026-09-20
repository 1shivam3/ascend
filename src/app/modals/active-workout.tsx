import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../constants/theme';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackHandler';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { TemplateRepository } from '../../database/repositories/TemplateRepository';
import { SupersetEngine } from '../../services/workout/SupersetEngine';
import { Exercise, SetLog } from '../../types/domain.types';
import { WorkoutProgressionResult } from '../../types/progression.types';
import { ExerciseCard } from '../../components/workout/ExerciseCard';
import { RestTimerBar } from '../../components/workout/RestTimerBar';
import { PlateCalculatorModal } from '../../components/hud/PlateCalculatorModal';
import { ProgressionSummaryModal } from '../../components/workout/ProgressionSummaryModal';
import { PRCelebrationModal } from '../../components/workout/PRCelebrationModal';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { Heading, Text, Caption, StatText, MonoText } from '../../components/ui/Typography';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { BottomSheet } from '../../components/ui/BottomSheet';

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const {
    activeWorkout,
    elapsedSeconds,
    tickTimer,
    addExercise,
    removeExercise,
    replaceExercise,
    skipExercise,
    addSet,
    updateSet,
    skipSet,
    toggleSetCompleted,
    deleteSet,
    finishWorkout,
    discardWorkout,
    startWorkout,
    activePR,
    dismissActivePR,
    linkAsSuperset,
    unlinkSuperset,
    focusedSupersetTarget,
    clearFocusedSupersetTarget,
  } = useWorkoutStore();

  const loadProfile = useAuthStore(s => s.loadProfile);

  // Modal States
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [replacingExerciseLogId, setReplacingExerciseLogId] = useState<string | null>(null);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Plate Calculator State
  const [plateCalcVisible, setPlateCalcVisible] = useState(false);
  const [targetSetForPlates, setTargetSetForPlates] = useState<{ exerciseLogId: string; set: SetLog } | null>(null);

  // Progression Summary State
  const [progressionResult, setProgressionResult] = useState<WorkoutProgressionResult | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);

  // Intercept Android hardware back button
  const handleAndroidBack = useCallback(() => {
    Alert.alert(
      'Session in Progress',
      'Leave active session screen? Your workout timer and sets remain running in the background.',
      [
        { text: 'Keep Logging', style: 'cancel' },
        { text: 'Minimize to HUD', onPress: () => router.back() },
      ]
    );
    return true; // prevent default exit
  }, [router]);

  useAndroidBackHandler(handleAndroidBack, Boolean(activeWorkout));

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
      Alert.alert('Empty Session', 'Log at least one movement before completing.');
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
          text: 'Discard Session',
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
    if (replacingExerciseLogId) {
      await replaceExercise(replacingExerciseLogId, ex);
      setReplacingExerciseLogId(null);
    } else {
      await addExercise(ex);
    }
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

  const handleSaveAsTemplate = async () => {
    if (!activeWorkout || activeWorkout.exercises.length === 0) {
      Alert.alert('Empty Session', 'Log at least one exercise before saving as a template.');
      return;
    }
    try {
      const template = await TemplateRepository.createFromWorkoutSession(
        activeWorkout.userId,
        activeWorkout,
        `${activeWorkout.title} Template`
      );
      Alert.alert('Template Saved!', `"${template.name}" has been saved to My Routines.`);
    } catch (err) {
      console.error('Failed to save workout template:', err);
      Alert.alert('Error', 'Failed to save routine template.');
    }
  };

  // Format Elapsed Time
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Calculate live session tonnage
  const currentVolume = activeWorkout?.exercises
    .flatMap(e => e.sets)
    .filter(s => s.completed && !s.isSkipped)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0) || 0;

  return (
    <ScreenContainer scrollable={false}>
      {/* Top Tactical Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleDiscard} style={styles.discardBtn}>
          <Text color={THEME.colors.crimson} style={styles.discardText}>DISCARD</Text>
        </TouchableOpacity>

        <View style={styles.timerBadge}>
          <View style={styles.recordDot} />
          <MonoText style={styles.timerDigits}>{formattedTime}</MonoText>
        </View>

        <TouchableOpacity onPress={handleFinish} style={styles.finishBtn}>
          <Text color="#000000" style={styles.finishText}>FINISH</Text>
        </TouchableOpacity>
      </View>

      {/* Session Title & Tonnage HUD */}
      <View style={styles.hudSection}>
        <View style={styles.titleRow}>
          <Heading level={3} style={styles.workoutTitle}>
            {activeWorkout?.title || 'Tactical Training'}
          </Heading>
          <TouchableOpacity onPress={handleSaveAsTemplate} style={styles.saveRoutineBtn}>
            <Text style={styles.saveRoutineText}>+ SAVE ROUTINE</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hudMetricsRow}>
          <View style={styles.metricItem}>
            <Caption upper style={styles.metricLabel}>VOLUME</Caption>
            <StatText size="md" color={THEME.colors.cyan}>{Math.round(currentVolume)} kg</StatText>
          </View>
          <View style={styles.metricItem}>
            <Caption upper style={styles.metricLabel}>MOVEMENTS</Caption>
            <StatText size="md">{activeWorkout?.exercises.length || 0}</StatText>
          </View>
          <View style={styles.metricItem}>
            <Caption upper style={styles.metricLabel}>SETS DONE</Caption>
            <StatText size="md" color={THEME.colors.emerald}>
              {activeWorkout?.exercises.flatMap(e => e.sets).filter(s => s.completed && !s.isSkipped).length || 0}
            </StatText>
          </View>
        </View>
      </View>

      {/* Superset Live Navigation Banner */}
      {focusedSupersetTarget && (
        <TouchableOpacity
          onPress={() => clearFocusedSupersetTarget()}
          style={styles.supersetNavBanner}
        >
          <Text style={styles.supersetNavIcon}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.supersetNavTitle}>
              {focusedSupersetTarget.isRoundComplete
                ? `SUPERSET ROUND COMPLETE`
                : `SUPERSET NEXT MOVEMENT`}
            </Text>
            <Caption style={styles.supersetNavSub}>
              Tap to dismiss • Moving to Set #{focusedSupersetTarget.nextSetNumber}
            </Caption>
          </View>
          <Badge label="NEXT ➔" variant="amber" size="sm" />
        </TouchableOpacity>
      )}

      {/* Exercise Cards List */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeWorkout?.exercises.map((el, idx) => {
          let supersetBadge: string | undefined;
          if (el.supersetId) {
            const group = activeWorkout.exercises.filter(e => e.supersetId === el.supersetId);
            const idxInGroup = group.findIndex(e => e.id === el.id);
            supersetBadge = SupersetEngine.getSupersetBadgeLabel(el.supersetId, Math.max(0, idxInGroup));
          }

          return (
            <ExerciseCard
              key={el.id}
              exerciseLog={el}
              supersetBadge={supersetBadge}
              onToggleSuperset={() => {
                if (el.supersetId) {
                  unlinkSuperset(el.supersetId);
                } else {
                  const nextEx = activeWorkout.exercises[idx + 1];
                  if (nextEx) {
                    linkAsSuperset([el.id, nextEx.id]);
                  } else {
                    linkAsSuperset([el.id]);
                  }
                }
              }}
              onAddSet={setType => addSet(el.id, setType)}
              onUpdateSet={(setId, updates) => updateSet(el.id, setId, updates)}
              onToggleSetCompleted={setId => toggleSetCompleted(el.id, setId)}
              onDeleteSet={setId => deleteSet(el.id, setId)}
              onRemoveExercise={() => removeExercise(el.id)}
              onOpenPlateCalculator={set => handleOpenPlateCalc(el.id, set)}
              onReplaceExercise={() => {
                setReplacingExerciseLogId(el.id);
                setExercisePickerVisible(true);
              }}
              onSkipExercise={() => skipExercise(el.id)}
              onSkipSet={setId => skipSet(el.id, setId)}
            />
          );
        })}

        {/* Add Movement Button */}
        <Button
          title="+ ADD MOVEMENT"
          size="md"
          variant="secondary"
          onPress={() => {
            setReplacingExerciseLogId(null);
            setExercisePickerVisible(true);
          }}
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

      {/* Exercise Picker BottomSheet */}
      <BottomSheet
        visible={exercisePickerVisible}
        onClose={() => {
          setExercisePickerVisible(false);
          setReplacingExerciseLogId(null);
        }}
        title={replacingExerciseLogId ? 'REPLACE MOVEMENT' : 'SELECT MOVEMENT'}
      >
        <TextInput
          style={styles.pickerSearchInput}
          placeholder="Search exercise name or muscle..."
          placeholderTextColor={THEME.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <View style={styles.pickerList}>
          {availableExercises.map(ex => (
            <TouchableOpacity
              key={ex.id}
              style={styles.pickerItem}
              onPress={() => handleSelectExercise(ex)}
            >
              <View>
                <Heading level={3} style={styles.pickerItemName}>{ex.name}</Heading>
                <Caption style={styles.pickerItemSub}>
                  {ex.primaryMuscle} • {ex.equipment}
                </Caption>
              </View>
              <Badge label={ex.movementPattern.replace('_', ' ')} size="sm" variant="cyan" />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Live PR Celebration Modal */}
      <PRCelebrationModal
        visible={Boolean(activePR)}
        pr={activePR}
        onDismiss={dismissActivePR}
      />

      {/* Level-Up & Progression Celebration Modal */}
      <ProgressionSummaryModal
        visible={summaryVisible}
        result={progressionResult}
        onDismiss={() => {
          setSummaryVisible(false);
          router.back();
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: THEME.borderRadius.sharp,
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
    fontSize: 14,
    fontWeight: '900',
  },
  finishBtn: {
    backgroundColor: THEME.colors.cyan,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
  },
  finishText: {
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  workoutTitle: {
    flex: 1,
  },
  saveRoutineBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sharp,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.3)',
  },
  saveRoutineText: {
    color: THEME.colors.cyan,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  supersetNavBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.amber,
    gap: 10,
  },
  supersetNavIcon: {
    fontSize: 18,
  },
  supersetNavTitle: {
    color: THEME.colors.amber,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  supersetNavSub: {
    color: THEME.colors.textSecondary,
    fontSize: 10,
  },
  hudMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    alignItems: 'flex-start',
  },
  metricLabel: {
    fontSize: 9,
  },
  scrollContent: {
    padding: THEME.spacing.md,
    paddingBottom: 80,
  },
  addExerciseBtn: {
    marginTop: THEME.spacing.md,
  },
  pickerSearchInput: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sm,
    paddingHorizontal: 12,
    height: 44,
    color: THEME.colors.textPrimary,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  pickerList: {
    gap: 4,
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
    marginBottom: 2,
  },
  pickerItemSub: {
    color: THEME.colors.textSecondary,
  },
});
