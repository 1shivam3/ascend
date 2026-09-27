import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { FitnessComparisonEvaluation, UserPerformanceInput } from '../../types/comparison.types';
import { FitnessComparisonService } from '../../services/comparison/FitnessComparisonService';
import { POPULATION_BENCHMARKS } from '../../config/population_benchmarks.config';

interface FitnessComparisonModalProps {
  visible: boolean;
  initialExerciseId?: string;
  userId?: string;
  userBodyweightKg?: number;
  onClose: () => void;
}

const COMPARISON_EXERCISES = [
  { id: 'ex-bench-press', name: 'Barbell Bench Press', icon: 'barbell-outline' },
  { id: 'ex-pushups', name: 'Push-ups', icon: 'body-outline' },
  { id: 'ex-back-squat', name: 'Barbell Back Squat', icon: 'barbell-outline' },
  { id: 'ex-deadlift', name: 'Conventional Deadlift', icon: 'fitness-outline' },
  { id: 'ex-pullups', name: 'Pull-ups', icon: 'trending-up-outline' },
  { id: 'ex-bicep-curl', name: 'Dumbbell Curl (No Norms)', icon: 'help-circle-outline' },
];

export const FitnessComparisonModal: React.FC<FitnessComparisonModalProps> = ({
  visible,
  initialExerciseId = 'ex-bench-press',
  userId,
  userBodyweightKg = 75,
  onClose,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(initialExerciseId);
  const [activeMode, setActiveMode] = useState<'LOGGED' | 'SIMULATOR'>('LOGGED');

  // Simulator inputs
  const [simWeight, setSimWeight] = useState<string>('80');
  const [simReps, setSimReps] = useState<string>('5');
  const [simBodyweight, setSimBodyweight] = useState<string>(String(userBodyweightKg || 75));
  const [simRpe, setSimRpe] = useState<string>('8');

  // Evaluation state
  const [evaluation, setEvaluation] = useState<FitnessComparisonEvaluation | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (initialExerciseId) {
      setSelectedExerciseId(initialExerciseId);
    }
  }, [initialExerciseId]);

  // Load evaluation when exercise or mode or simulator inputs change
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    setLoading(true);

    const runEvaluation = async () => {
      try {
        if (activeMode === 'LOGGED') {
          const evalResult = await FitnessComparisonService.evaluateUserComparison({
            userId,
            exerciseId: selectedExerciseId,
            bodyweightKg: userBodyweightKg,
          });
          if (isMounted) {
            setEvaluation(evalResult);
            // Pre-populate simulator with current evaluation
            setSimWeight(String(evalResult.enteredPerformance.weightKg || 80));
            setSimReps(String(evalResult.enteredPerformance.reps || 5));
            setSimBodyweight(String(evalResult.bodyweightKg || 75));
            setSimRpe(evalResult.enteredPerformance.rpe ? String(evalResult.enteredPerformance.rpe) : '8');
          }
        } else {
          // Simulator Mode: explicit user input
          const parsedWeight = parseFloat(simWeight) || 0;
          const parsedReps = parseInt(simReps, 10) || 1;
          const parsedBw = parseFloat(simBodyweight) || 75;
          const parsedRpe = parseFloat(simRpe) || null;

          const customPerformance: UserPerformanceInput = {
            weightKg: parsedWeight,
            reps: parsedReps,
            rpe: parsedRpe,
            isTested1Rm: parsedReps === 1 && (parsedRpe === null || parsedRpe >= 8.5),
            isEstimated1Rm: parsedReps > 1,
            isSelfReported: true,
            verifiedSessionId: null,
          };

          const evalResult = await FitnessComparisonService.evaluateUserComparison({
            userId,
            exerciseId: selectedExerciseId,
            userPerformance: customPerformance,
            bodyweightKg: parsedBw,
          });

          if (isMounted) {
            setEvaluation(evalResult);
          }
        }
      } catch (err) {
        console.error('Failed to evaluate fitness comparison:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    runEvaluation();

    return () => {
      isMounted = false;
    };
  }, [visible, selectedExerciseId, activeMode, simWeight, simReps, simBodyweight, simRpe, userId, userBodyweightKg]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.headerBadgeRow}>
              <Caption style={{ color: colors.accent, fontWeight: '800', letterSpacing: 0.8, fontSize: 10 }}>
                SCIENTIFIC TRANSPARENCY
              </Caption>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Caption style={{ color: colors.textSecondary, fontSize: 10 }}>11-POINT DOSSIER</Caption>
            </View>
            <Heading level={3} style={{ color: colors.textPrimary, marginTop: 2 }}>
              Fitness Population Comparison
            </Heading>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.closeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Exercise Selector Horizontal Scroll */}
          <View style={styles.exerciseSelectorContainer}>
            <Caption style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8, fontWeight: '700' }}>
              SELECT EXERCISE TO COMPARE
            </Caption>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exerciseChips}>
              {COMPARISON_EXERCISES.map((ex) => {
                const isSelected = ex.id === selectedExerciseId;
                return (
                  <TouchableOpacity
                    key={ex.id}
                    onPress={() => setSelectedExerciseId(ex.id)}
                    style={[
                      styles.exerciseChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border,
                        borderRadius: borderRadius.md,
                      },
                    ]}
                  >
                    <Ionicons
                      name={ex.icon as any}
                      size={14}
                      color={isSelected ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={{
                        color: isSelected ? '#FFFFFF' : colors.textPrimary,
                        fontSize: 12,
                        fontWeight: isSelected ? '700' : '500',
                        marginLeft: 6,
                      }}
                    >
                      {ex.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Mode Switcher: Logged vs Simulator */}
          <View style={[styles.modeSwitcher, { backgroundColor: colors.surface, borderRadius: borderRadius.md }]}>
            <TouchableOpacity
              onPress={() => setActiveMode('LOGGED')}
              style={[
                styles.modeTab,
                activeMode === 'LOGGED' && [styles.activeTab, { backgroundColor: colors.primary }],
              ]}
            >
              <Ionicons
                name="checkmark-done-circle-outline"
                size={16}
                color={activeMode === 'LOGGED' ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={{
                  color: activeMode === 'LOGGED' ? '#FFFFFF' : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: 12,
                  marginLeft: 6,
                }}
              >
                My Logged Best
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveMode('SIMULATOR')}
              style={[
                styles.modeTab,
                activeMode === 'SIMULATOR' && [styles.activeTab, { backgroundColor: colors.primary }],
              ]}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={activeMode === 'SIMULATOR' ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={{
                  color: activeMode === 'SIMULATOR' ? '#FFFFFF' : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: 12,
                  marginLeft: 6,
                }}
              >
                What-If Simulator
              </Text>
            </TouchableOpacity>
          </View>

          {/* Simulator Interactive Inputs */}
          {activeMode === 'SIMULATOR' && (
            <Card style={[styles.simulatorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.simHeader}>
                <Ionicons name="calculator-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.textPrimary, fontWeight: '700', marginLeft: 6, fontSize: 13 }}>
                  Simulation Controls
                </Text>
              </View>

              <View style={styles.simGrid}>
                <View style={styles.simInputGroup}>
                  <Caption style={{ color: colors.textMuted, fontSize: 10 }}>WEIGHT (KG)</Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    value={simWeight}
                    onChangeText={setSimWeight}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.simInputGroup}>
                  <Caption style={{ color: colors.textMuted, fontSize: 10 }}>REPS</Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    value={simReps}
                    onChangeText={setSimReps}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.simInputGroup}>
                  <Caption style={{ color: colors.textMuted, fontSize: 10 }}>BODYWEIGHT (KG)</Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    value={simBodyweight}
                    onChangeText={setSimBodyweight}
                    keyboardType="numeric"
                    placeholder="75"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.simInputGroup}>
                  <Caption style={{ color: colors.textMuted, fontSize: 10 }}>RPE</Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    value={simRpe}
                    onChangeText={setSimRpe}
                    keyboardType="numeric"
                    placeholder="8"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
              <Caption style={{ color: colors.textMuted, fontSize: 10, marginTop: 6 }}>
                Simulate different working sets to inspect relative strength and normative band transitions.
              </Caption>
            </Card>
          )}

          {/* Insufficient Data Banner (if benchmark lacks peer-reviewed cohort) */}
          {evaluation && !evaluation.hasReliableData && (
            <Card
              style={[
                styles.insufficientBanner,
                {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(254, 226, 226, 0.7)',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)',
                },
              ]}
            >
              <View style={styles.bannerHeader}>
                <Ionicons name="warning-outline" size={20} color={colors.error || '#EF4444'} />
                <Heading level={3} style={{ color: colors.error || '#EF4444', marginLeft: 8 }}>
                  {evaluation.insufficientDataMessage || 'Not enough reliable data for this comparison.'}
                </Heading>
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 13, marginTop: 8, lineHeight: 18 }}>
                ASCEND will not claim you are stronger than a specific percentage of the general population or
                the world unless peer-reviewed, representative demographic data directly validates that conclusion.
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 16 }}>
                Unlike typical fitness calculators that invent artificial percentiles from arbitrary user polls or
                conflate competitive powerlifting records with average citizens, ASCEND maintains absolute scientific
                data integrity.
              </Text>
            </Card>
          )}

          {/* THE 11 REQUIRED COMPARISON ITEMS */}
          {evaluation && (
            <View style={styles.transparencyDossierContainer}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                <Heading level={3} style={{ color: colors.textPrimary, marginLeft: 8 }}>
                  11-Point Transparency Breakdown
                </Heading>
              </View>

              {/* Point 1: Exercise */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>1</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>Exercise</Text>
                </View>
                <MonoText style={{ color: colors.accent, fontSize: 16, fontWeight: '800', marginTop: 4 }}>
                  {evaluation.exerciseName}
                </MonoText>
                <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
                  Primary Muscle: {evaluation.primaryMuscle} • Movement Pattern: {evaluation.movementPattern}
                </Caption>
              </Card>

              {/* Point 2: User's entered performance */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>2</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>
                    User's Entered Performance
                  </Text>
                </View>
                <MonoText style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 4 }}>
                  {evaluation.enteredPerformance.summaryText}
                </MonoText>
                <View style={styles.subDetailRow}>
                  <Caption style={{ color: colors.textSecondary }}>
                    Weight: {evaluation.enteredPerformance.weightKg} kg | Reps: {evaluation.enteredPerformance.reps} |
                    RPE: {evaluation.enteredPerformance.rpe ?? 'Unspecified'} | Effective 1RM:{' '}
                    {evaluation.enteredPerformance.effective1RmKg} kg
                  </Caption>
                </View>
              </Card>

              {/* Point 3: Body weight */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>3</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>Body Weight</Text>
                </View>
                <MonoText style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 4 }}>
                  {evaluation.bodyweightKg} kg
                </MonoText>
                <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
                  {activeMode === 'LOGGED'
                    ? 'Retrieved from verified user athlete profile.'
                    : 'Configured in What-If Simulator.'}
                </Caption>
              </Card>

              {/* Point 4: Relative strength */}
              <Card
                style={[
                  styles.dossierItemCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.accent,
                    borderWidth: 1,
                  },
                ]}
              >
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.numberBadgeText}>4</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>
                    Relative Strength (lifted weight / body weight)
                  </Text>
                </View>
                <View style={styles.relativeStrengthBox}>
                  <MonoText style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>
                    {evaluation.performanceValueType === 'BODYWEIGHT_REPETITIONS'
                      ? `${evaluation.enteredPerformance.reps} reps`
                      : `${evaluation.relativeStrengthRatio}x Bodyweight`}
                  </MonoText>
                  <Caption style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    Calculation: {evaluation.enteredPerformance.effective1RmKg} kg lifted / {evaluation.bodyweightKg} kg BW
                  </Caption>
                </View>
                <View style={[styles.noteCallout, { backgroundColor: colors.surfaceMuted }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginLeft: 8, flex: 1 }}>
                    {evaluation.relativeStrengthNote}
                  </Text>
                </View>
              </Card>

              {/* Point 5: Reference group */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>5</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>Reference Group</Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                  {evaluation.referenceGroup}
                </Text>
                <View style={[styles.warningPill, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(254, 243, 199, 0.7)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#F59E0B" />
                  <Text style={{ color: '#D97706', fontSize: 11, fontWeight: '600', marginLeft: 6, flex: 1 }}>
                    {evaluation.referenceGroup.toLowerCase().includes('general population')
                      ? 'True general population cohort (includes active and sedentary adults).'
                      : 'Recreational resistance trainees only. NOT representative of the general population.'}
                  </Text>
                </View>
              </Card>

              {/* Point 6: Data source */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>6</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>Data Source</Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                  {evaluation.dataSource}
                </Text>
              </Card>

              {/* Point 7: Population and date, when available */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>7</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>
                    Population and Date
                  </Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                  {evaluation.populationAndDate}
                </Text>
              </Card>

              {/* Point 8: Method used */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>8</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>Method Used</Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                  {evaluation.methodUsed}
                </Text>
              </Card>

              {/* Point 9: Limitations */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>9</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>Limitations</Text>
                </View>
                <View style={styles.limitationsList}>
                  {evaluation.limitations.map((lim, idx) => (
                    <View key={idx} style={styles.limitationItem}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 17 }}>
                        {lim}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>

              {/* Point 10: Whether the value is estimated or tested */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>10</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>
                    Value Type (Estimated vs Tested)
                  </Text>
                </View>
                <View style={styles.provenanceRow}>
                  <Badge
                    label={
                      evaluation.performanceValueType === 'TESTED_1RM'
                        ? 'DIRECTLY TESTED 1RM'
                        : evaluation.performanceValueType === 'ESTIMATED_1RM'
                        ? 'SUBMAXIMAL EPLEY ESTIMATE (≤10 REPS)'
                        : evaluation.performanceValueType === 'BODYWEIGHT_REPETITIONS'
                        ? 'DIRECT BODYWEIGHT REPETITIONS'
                        : 'RECORDED WORKING SET'
                    }
                    variant={evaluation.performanceValueType === 'TESTED_1RM' ? 'emerald' : 'cyan'}
                    size="md"
                  />
                </View>
                <Caption style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 16 }}>
                  {evaluation.performanceValueType === 'TESTED_1RM'
                    ? 'Verified maximum effort single repetition performed under high intensity (RPE ≥ 8.5).'
                    : evaluation.performanceValueType === 'ESTIMATED_1RM'
                    ? 'Calculated using canonical Epley formula. Note: submaximal 1RM calculations strictly lose validity when sets exceed 10 repetitions.'
                    : 'Evaluated on continuous bodyweight execution until volitional fatigue.'}
                </Caption>
              </Card>

              {/* Point 11: Whether the user's data is self-reported or verified */}
              <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.dossierItemHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.numberBadgeText}>11</Text>
                  </View>
                  <Text style={[styles.dossierItemTitle, { color: colors.textPrimary }]}>
                    Data Provenance (Self-Reported vs Verified)
                  </Text>
                </View>
                <View style={styles.provenanceRow}>
                  <Badge
                    label={
                      evaluation.dataVerificationStatus === 'VERIFIED_WORKOUT_DATA'
                        ? 'VERIFIED WORKOUT DATA'
                        : 'SELF-REPORTED / SIMULATOR'
                    }
                    variant={evaluation.dataVerificationStatus === 'VERIFIED_WORKOUT_DATA' ? 'emerald' : 'amber'}
                    size="md"
                  />
                </View>
                <Caption style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 16 }}>
                  {evaluation.dataVerificationStatus === 'VERIFIED_WORKOUT_DATA'
                    ? 'Logged directly during an active workout session with real-time timers and logged sets in SQLite.'
                    : 'Entered manually into profile onboarding or adjusted inside the What-If Simulator.'}
                </Caption>
              </Card>

              {/* Cohort Normative Bands (if available) */}
              {evaluation.hasReliableData && POPULATION_BENCHMARKS[selectedExerciseId]?.normBands && (
                <Card style={[styles.dossierItemCard, { backgroundColor: colors.surface, marginTop: 8 }]}>
                  <View style={styles.normBandsHeader}>
                    <Ionicons name="bar-chart-outline" size={16} color={colors.accent} />
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', marginLeft: 6, fontSize: 14 }}>
                      Cohort Distribution Bands
                    </Text>
                  </View>
                  <Caption style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: 10 }}>
                    Published benchmarks from {evaluation.dataSource}
                  </Caption>

                  <View style={styles.bandsTable}>
                    {POPULATION_BENCHMARKS[selectedExerciseId].normBands?.map((band, idx) => {
                      const isCurrentTier = evaluation.contextualObservation?.tierName === band.tierName;
                      return (
                        <View
                          key={idx}
                          style={[
                            styles.bandRow,
                            {
                              backgroundColor: isCurrentTier
                                ? isDark
                                  ? 'rgba(56, 189, 248, 0.15)'
                                  : 'rgba(14, 165, 233, 0.15)'
                                : 'transparent',
                              borderColor: isCurrentTier ? colors.accent : colors.border,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text
                                style={{
                                  color: isCurrentTier ? colors.accent : colors.textPrimary,
                                  fontWeight: isCurrentTier ? '800' : '600',
                                  fontSize: 13,
                                }}
                              >
                                {band.tierName}
                              </Text>
                              {isCurrentTier && (
                                <View style={[styles.currentTierBadge, { backgroundColor: colors.accent }]}>
                                  <Text style={styles.currentTierBadgeText}>YOUR CURRENT BAND</Text>
                                </View>
                              )}
                            </View>
                            <Caption style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                              {band.percentileRangeDescription}
                            </Caption>
                            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                              {band.contextNote}
                            </Text>
                          </View>

                          <View style={styles.bandMetricBox}>
                            <MonoText style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>
                              {band.minRatio !== undefined && band.maxRatio !== undefined
                                ? `${band.minRatio}x - ${band.maxRatio}x`
                                : band.minRatio !== undefined
                                ? `≥ ${band.minRatio}x`
                                : band.maxRatio !== undefined
                                ? `≤ ${band.maxRatio}x`
                                : band.minReps !== undefined && band.maxReps !== undefined
                                ? `${band.minReps} - ${band.maxReps} reps`
                                : band.minReps !== undefined
                                ? `≥ ${band.minReps} reps`
                                : `≤ ${band.maxReps} reps`}
                            </MonoText>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              )}

              {/* Scientific Caveats & Anti-Fabrication Callout */}
              <View style={[styles.caveatCard, { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md }]}>
                <Ionicons name="information-circle" size={18} color={colors.accent} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>
                    Scientific Guardrail & Allometric Reality
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                    {evaluation.generalPopulationCaveat}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                    {evaluation.allometricScalingNote}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 6,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  exerciseSelectorContainer: {
    marginBottom: 12,
  },
  exerciseChips: {
    flexDirection: 'row',
    gap: 8,
  },
  exerciseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  modeSwitcher: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: 14,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeTab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  simulatorCard: {
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
  },
  simHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  simGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  simInputGroup: {
    flex: 1,
    minWidth: '45%',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  insufficientBanner: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transparencyDossierContainer: {
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dossierItemCard: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 10,
  },
  dossierItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  numberBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  dossierItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subDetailRow: {
    marginTop: 4,
  },
  relativeStrengthBox: {
    marginVertical: 6,
  },
  noteCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  limitationsList: {
    marginTop: 6,
  },
  limitationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
  },
  provenanceRow: {
    marginTop: 6,
  },
  normBandsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bandsTable: {
    gap: 8,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  currentTierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  currentTierBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  bandMetricBox: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  caveatCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    marginTop: 10,
  },
});
