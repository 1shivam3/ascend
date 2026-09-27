import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Text as RNText,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackHandler';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { TemplateRepository } from '../../database/repositories/TemplateRepository';
import { SupersetEngine } from '../../services/workout/SupersetEngine';
import { ExerciseAlternativeService } from '../../services/workout/ExerciseAlternativeService';
import { Exercise, SetLog } from '../../types/domain.types';
import { WorkoutProgressionResult } from '../../types/progression.types';
import { ExerciseCard } from '../../components/workout/ExerciseCard';
import { RestTimerBar } from '../../components/workout/RestTimerBar';
import { PlateCalculatorModal } from '../../components/hud/PlateCalculatorModal';
import { ProgressionSummaryModal } from '../../components/workout/ProgressionSummaryModal';
import { PRCelebrationModal } from '../../components/workout/PRCelebrationModal';
import { ExerciseDetailModal } from '../../components/workout/ExerciseDetailModal';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../components/ui/Typography';
import { Card } from '../../components/ui/Card';
import { Button, PrimaryButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Divider } from '../../components/ui/Divider';

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const { colors, borderRadius, shadows, isDark } = useTheme();
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
    updateExerciseNotes,
    finishWorkout,
    discardWorkout,
    startWorkout,
    activePR,
    dismissActivePR,
    linkAsSuperset,
    unlinkSuperset,
    focusedSupersetTarget,
    clearFocusedSupersetTarget,
    isRestTimerRunning,
    restTimerSecondsRemaining,
  } = useWorkoutStore();

  const loadProfile = useAuthStore((s) => s.loadProfile);

  // Modal States
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [replacingExerciseLogId, setReplacingExerciseLogId] = useState<string | null>(null);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [recommendedAlternatives, setRecommendedAlternatives] = useState<Exercise[]>([]);
  const [selectedDetailExercise, setSelectedDetailExercise] = useState<Exercise | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Plate Calculator State
  const [plateCalcVisible, setPlateCalcVisible] = useState(false);
  const [targetSetForPlates, setTargetSetForPlates] = useState<{
    exerciseLogId: string;
    set: SetLog;
  } | null>(null);

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
    return true;
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

  // Load recommended biomechanical alternatives when replacing an exercise
  useEffect(() => {
    if (replacingExerciseLogId && exercisePickerVisible) {
      const targetLog = activeWorkout?.exercises.find(
        (e) => e.id === replacingExerciseLogId
      );
      if (targetLog?.exercise) {
        ExerciseAlternativeService.getSuitableAlternatives(targetLog.exercise).then(
          setRecommendedAlternatives
        );
      }
    } else {
      setRecommendedAlternatives([]);
    }
  }, [replacingExerciseLogId, exercisePickerVisible, activeWorkout]);

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

    const completedSets = activeWorkout.exercises
      .flatMap((e) => e.sets)
      .filter((s) => s.completed);
    if (completedSets.length === 0) {
      Alert.alert(
        'No Completed Sets',
        'Mark at least one set completed (✓) to mint progression.'
      );
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

  // Format Elapsed Time
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(
    seconds
  ).padStart(2, '0')}`;

  // Determine current active quest item
  const exercises = activeWorkout?.exercises || [];
  let activeExerciseIndex = exercises.findIndex((ex) =>
    ex.sets.some((s) => !s.completed && !s.isSkipped)
  );
  if (activeExerciseIndex === -1 && exercises.length > 0) {
    activeExerciseIndex = exercises.length - 1;
  }
  const activeExercise = exercises[activeExerciseIndex] || null;
  const activeSetIndex = activeExercise
    ? activeExercise.sets.findIndex((s) => !s.completed && !s.isSkipped)
    : -1;
  const activeSet =
    activeSetIndex !== -1 && activeExercise
      ? activeExercise.sets[activeSetIndex]
      : null;

  // Workout-level stats for header overview
  const targetMuscleGroups = Array.from(
    new Set(exercises.map((e) => e.exercise?.primaryMuscle).filter(Boolean))
  );
  const targetMusclesLabel =
    targetMuscleGroups.length > 0 ? targetMuscleGroups.join(' • ') : 'Full Body';

  const allSets = exercises.flatMap((e) => e.sets);
  const completedSetsCount = allSets.filter((s) => s.completed).length;
  const totalSetsCount = allSets.length;
  const estimatedDurationMin = Math.max(
    15,
    Math.round(totalSetsCount * 2.5)
  );

  return (
    <ScreenContainer scrollable={false}>
      {/* Top Bar with Timer and Controls */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleDiscard}
          style={styles.discardBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.discardText, { color: colors.crimson }]}>
            Discard
          </Text>
        </TouchableOpacity>

        <View
          style={[
            styles.timerBadge,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              borderRadius: borderRadius.full,
            },
          ]}
        >
          <View
            style={[styles.recordDot, { backgroundColor: colors.crimson }]}
          />
          <MonoText style={styles.timerDigits}>{formattedTime}</MonoText>
        </View>

        <TouchableOpacity
          onPress={handleFinish}
          style={[
            styles.finishBtn,
            {
              backgroundColor: isDark ? colors.cyan : colors.primary,
              borderRadius: borderRadius.md,
            },
          ]}
        >
          <Text
            style={[
              styles.finishText,
              { color: isDark ? '#000000' : '#FFFFFF' },
            ]}
          >
            Finish
          </Text>
        </TouchableOpacity>
      </View>

      {/* Focus Quest Command Panel */}
      {activeExercise && activeSet ? (
        <View style={styles.questCommandWrap}>
          <Card
            variant="surface"
            style={[
              styles.questCommandCard,
              {
                borderColor: isDark ? colors.cyan : colors.primary,
                borderWidth: 1.5,
              },
            ]}
          >
            <View style={styles.questTopHeader}>
              <Caption
                upper
                style={{
                  color: isDark ? colors.cyan : colors.primary,
                  fontWeight: '700',
                  fontSize: 11,
                }}
              >
                EXERCISE {activeExerciseIndex + 1} OF {exercises.length}
              </Caption>
              <Caption upper style={{ color: colors.textMuted, fontSize: 10 }}>
                {activeExercise.exercise?.movementPattern?.replace(/_/g, ' ') ||
                  'STRENGTH'}
              </Caption>
            </View>

            <Heading level={2} style={styles.questExerciseTitle} numberOfLines={1}>
              {activeExercise.exercise?.name || 'Movement'}
            </Heading>

            <View style={styles.questSetExecutionRow}>
              <View>
                <Caption upper style={{ color: colors.textMuted, fontSize: 10 }}>
                  SET {activeSetIndex + 1} OF {activeExercise.sets.length}
                </Caption>
                <RNText
                  style={[
                    styles.activeSetNumbers,
                    { color: isDark ? colors.cyan : colors.textPrimary },
                  ]}
                >
                  {activeSet.weightKg} kg × {activeSet.reps}
                </RNText>
              </View>

              {isRestTimerRunning && (
                <View style={styles.restTimerDisplay}>
                  <Caption
                    upper
                    style={{ color: colors.amber, fontWeight: '700' }}
                  >
                    REST
                  </Caption>
                  <MonoText
                    style={[styles.restDigits, { color: colors.amber }]}
                  >
                    {Math.floor(restTimerSecondsRemaining / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(restTimerSecondsRemaining % 60).toString().padStart(2, '0')}
                  </MonoText>
                </View>
              )}
            </View>

            <PrimaryButton
              title="Complete Set ✓"
              onPress={() => toggleSetCompleted(activeExercise.id, activeSet.id)}
            />
          </Card>
        </View>
      ) : null}

      {/* Superset Live Navigation Banner */}
      {focusedSupersetTarget && (
        <TouchableOpacity
          onPress={() => clearFocusedSupersetTarget()}
          style={[
            styles.supersetNavBanner,
            {
              backgroundColor: `${colors.amber}18`,
              borderBottomColor: colors.amber,
            },
          ]}
        >
          <Ionicons name="flash" size={18} color={colors.amber} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.supersetNavTitle, { color: colors.amber }]}>
              {focusedSupersetTarget.isRoundComplete
                ? 'Superset Round Complete'
                : 'Next Superset Movement'}
            </Text>
            <Caption style={{ color: colors.textSecondary }}>
              Moving to Set #{focusedSupersetTarget.nextSetNumber}
            </Caption>
          </View>
          <Badge label="NEXT ➔" variant="amber" size="sm" />
        </TouchableOpacity>
      )}

      {/* Exercise Cards List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Workout Overview Header Card */}
        <View
          style={[
            styles.workoutOverviewCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              borderRadius: borderRadius.lg,
            },
          ]}
        >
          <View style={styles.overviewTopRow}>
            <View style={{ flex: 1 }}>
              <Caption
                upper
                style={{
                  color: isDark ? colors.cyan : colors.primary,
                  fontWeight: '800',
                  letterSpacing: 1,
                  fontSize: 10,
                }}
              >
                ACTIVE PROTOCOL
              </Caption>
              <Heading level={2} style={styles.overviewWorkoutTitle}>
                {activeWorkout?.name || 'Tactical Protocol'}
              </Heading>
            </View>
            <Badge
              label={`${completedSetsCount}/${totalSetsCount} SETS`}
              variant={
                completedSetsCount === totalSetsCount && totalSetsCount > 0
                  ? 'emerald'
                  : 'cyan'
              }
              size="sm"
            />
          </View>

          <View style={styles.overviewMetaRow}>
            <View style={styles.metaItem}>
              <Ionicons
                name="barbell-outline"
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {targetMusclesLabel}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons
                name="time-outline"
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                ~{estimatedDurationMin} min est.
              </Text>
            </View>
          </View>
        </View>

        {activeWorkout?.exercises.map((el, idx) => {
          let supersetBadge: string | undefined;
          if (el.supersetId) {
            const group = activeWorkout.exercises.filter(
              (e) => e.supersetId === el.supersetId
            );
            const idxInGroup = group.findIndex((e) => e.id === el.id);
            supersetBadge = SupersetEngine.getSupersetBadgeLabel(
              el.supersetId,
              Math.max(0, idxInGroup)
            );
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
              onAddSet={(setType) => addSet(el.id, setType)}
              onUpdateSet={(setId, updates) => updateSet(el.id, setId, updates)}
              onToggleSetCompleted={(setId) => toggleSetCompleted(el.id, setId)}
              onDeleteSet={(setId) => deleteSet(el.id, setId)}
              onRemoveExercise={() => removeExercise(el.id)}
              onOpenPlateCalculator={(set) => handleOpenPlateCalc(el.id, set)}
              onReplaceExercise={() => {
                setReplacingExerciseLogId(el.id);
                setExercisePickerVisible(true);
              }}
              onSkipExercise={() => skipExercise(el.id)}
              onSkipSet={(setId) => skipSet(el.id, setId)}
              onUpdateNotes={(notes) => updateExerciseNotes(el.id, notes)}
              onViewDetails={() => setSelectedDetailExercise(el.exercise || null)}
            />
          );
        })}

        {/* Add Movement Button */}
        <Button
          title="+ Add Exercise"
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
        title={replacingExerciseLogId ? 'Replace Movement' : 'Add Movement'}
      >
        {/* Recommended biomechanical alternatives when replacing */}
        {replacingExerciseLogId &&
          recommendedAlternatives.length > 0 &&
          !searchQuery.trim() && (
            <View style={styles.altRecommendationsSection}>
              <Caption
                upper
                style={{
                  color: isDark ? colors.cyan : colors.primary,
                  fontWeight: '800',
                  letterSpacing: 0.5,
                  fontSize: 10,
                  marginBottom: 8,
                }}
              >
                RECOMMENDED ALTERNATIVES (BIOMECHANICALLY MATCHED)
              </Caption>
              {recommendedAlternatives.slice(0, 4).map((alt) => (
                <TouchableOpacity
                  key={alt.id}
                  style={[
                    styles.altPickerCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: isDark ? 'rgba(0, 229, 255, 0.4)' : colors.border,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                  onPress={() => handleSelectExercise(alt)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Heading level={3} style={styles.pickerItemName}>
                        {alt.name}
                      </Heading>
                      <Badge label="SUITABLE" variant="cyan" size="sm" />
                    </View>
                    <Caption style={{ color: colors.textSecondary }}>
                      {alt.primaryMuscle} • {alt.equipment} • {alt.difficulty || 'INTERMEDIATE'}
                    </Caption>
                  </View>
                  <Ionicons
                    name="swap-horizontal"
                    size={18}
                    color={isDark ? colors.cyan : colors.primary}
                  />
                </TouchableOpacity>
              ))}
              <Divider marginVertical={12} />
              <Caption
                upper
                style={{
                  color: colors.textMuted,
                  fontWeight: '800',
                  letterSpacing: 0.5,
                  fontSize: 10,
                  marginBottom: 8,
                }}
              >
                OR SELECT FROM ALL MOVEMENTS
              </Caption>
            </View>
          )}

        <TextInput
          style={[
            styles.pickerSearchInput,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              color: colors.textPrimary,
              borderRadius: borderRadius.md,
            },
          ]}
          placeholder="Search exercise name or muscle..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <View style={styles.pickerList}>
          {availableExercises.map((ex) => (
            <TouchableOpacity
              key={ex.id}
              style={[styles.pickerItem, { borderBottomColor: colors.borderSubtle }]}
              onPress={() => handleSelectExercise(ex)}
            >
              <View>
                <Heading level={3} style={styles.pickerItemName}>
                  {ex.name}
                </Heading>
                <Caption style={{ color: colors.textSecondary }}>
                  {ex.primaryMuscle} • {ex.equipment}
                </Caption>
              </View>
              <Badge
                label={ex.movementPattern.replace('_', ' ')}
                size="sm"
                variant="cyan"
              />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Exercise Detail Modal */}
      <ExerciseDetailModal
        visible={Boolean(selectedDetailExercise)}
        exercise={selectedDetailExercise}
        onClose={() => setSelectedDetailExercise(null)}
        onSelectAlternative={(newEx: Exercise) => {
          if (replacingExerciseLogId) {
            handleSelectExercise(newEx);
          }
          setSelectedDetailExercise(null);
        }}
        isSwapMode={Boolean(replacingExerciseLogId)}
      />

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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  discardBtn: {
    padding: 6,
  },
  discardText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  timerDigits: {
    fontSize: 14,
    fontWeight: '800',
  },
  finishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  finishText: {
    fontSize: 13,
    fontWeight: '700',
  },
  questCommandWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  questCommandCard: {
    padding: 16,
  },
  questTopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  questExerciseTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  questSetExecutionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeSetNumbers: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  restTimerDisplay: {
    alignItems: 'flex-end',
  },
  restDigits: {
    fontSize: 22,
    fontWeight: '800',
  },
  supersetNavBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  supersetNavTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  addExerciseBtn: {
    marginTop: 14,
    minHeight: 48,
  },
  pickerSearchInput: {
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    marginBottom: 14,
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
  },
  pickerItemName: {
    marginBottom: 2,
    fontSize: 15,
  },
  workoutOverviewCard: {
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  overviewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  overviewWorkoutTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  overviewMetaRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  altRecommendationsSection: {
    marginBottom: 10,
  },
  altPickerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
});
