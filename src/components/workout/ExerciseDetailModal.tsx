import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { Exercise, ExerciseMastery } from '../../types/domain.types';
import { ExerciseAlternativeService } from '../../services/workout/ExerciseAlternativeService';
import { MasteryRepository } from '../../database/repositories/MasteryRepository';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { PrimaryButton, SecondaryButton } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SectionHeader } from '../ui/SectionHeader';
import { Divider } from '../ui/Divider';

interface ExerciseDetailModalProps {
  visible: boolean;
  exercise: Exercise | null;
  onClose: () => void;
  onSelectAlternative?: (newExercise: Exercise) => void;
  userId?: string;
  isSwapMode?: boolean;
}

export const ExerciseDetailModal: React.FC<ExerciseDetailModalProps> = ({
  visible,
  exercise,
  onClose,
  onSelectAlternative,
  userId,
  isSwapMode = false,
}) => {
  const { colors, borderRadius, isDark } = useTheme();
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(exercise);
  const [alternatives, setAlternatives] = useState<Exercise[]>([]);
  const [mastery, setMastery] = useState<ExerciseMastery | null>(null);

  useEffect(() => {
    setCurrentExercise(exercise);
  }, [exercise]);

  useEffect(() => {
    if (!currentExercise) {
      setAlternatives([]);
      setMastery(null);
      return;
    }

    // Load alternatives
    ExerciseAlternativeService.getSuitableAlternatives(currentExercise).then(setAlternatives);

    // Load mastery records if user ID available
    if (userId) {
      MasteryRepository.getMastery(userId, currentExercise.id).then(setMastery);
    }
  }, [currentExercise, userId]);

  if (!currentExercise) return null;

  const difficultyVariant =
    currentExercise.difficulty === 'BEGINNER'
      ? 'emerald'
      : currentExercise.difficulty === 'ADVANCED'
      ? 'amber'
      : 'cyan';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Modal Top Bar */}
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <IconButton
            icon={<Ionicons name="close" size={22} color={colors.textPrimary} />}
            onPress={onClose}
            size="md"
            accessibilityLabel="Close"
          />
          <View style={styles.topBarCenter}>
            <Caption upper style={{ color: colors.textMuted, fontSize: 10, letterSpacing: 1 }}>
              EXERCISE INTELLIGENCE
            </Caption>
            <Text numberOfLines={1} style={[styles.topBarTitle, { color: colors.textPrimary }]}>
              {currentExercise.name}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header Card with Name and Primary Badges */}
          <Card variant="surface" style={styles.headerCard}>
            <View style={styles.badgeRow}>
              <Badge
                label={currentExercise.difficulty || 'INTERMEDIATE'}
                variant={difficultyVariant}
                size="sm"
              />
              <Badge
                label={currentExercise.movementPattern.replace(/_/g, ' ')}
                variant="neutral"
                size="sm"
              />
              <Badge
                label={currentExercise.equipment}
                variant="neutral"
                size="sm"
              />
            </View>

            <Heading level={1} style={styles.exerciseTitle}>
              {currentExercise.name}
            </Heading>

            {/* If in Swap Mode, show direct swap CTA */}
            {isSwapMode && onSelectAlternative && (
              <View style={{ marginTop: 12 }}>
                <PrimaryButton
                  title="Select This Movement"
                  icon={<Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />}
                  onPress={() => onSelectAlternative(currentExercise)}
                />
              </View>
            )}
          </Card>

          {/* Muscle Anatomy Target Section */}
          <View style={styles.sectionMargin}>
            <SectionHeader title="ANATOMICAL TARGETS" />
            <Card variant="surface" style={styles.muscleCard}>
              <View style={styles.muscleRow}>
                <Caption style={{ color: colors.textMuted, width: 90 }}>PRIMARY:</Caption>
                <View style={styles.chipsRow}>
                  <View
                    style={[
                      styles.primaryChip,
                      {
                        backgroundColor: isDark ? 'rgba(0, 229, 255, 0.15)' : `${colors.primary}15`,
                        borderColor: isDark ? colors.cyan : colors.primary,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.primaryChipText,
                        { color: isDark ? colors.cyan : colors.primary },
                      ]}
                    >
                      {currentExercise.primaryMuscle}
                    </Text>
                  </View>
                </View>
              </View>

              {currentExercise.secondaryMuscles && currentExercise.secondaryMuscles.length > 0 && (
                <View style={[styles.muscleRow, { marginTop: 10 }]}>
                  <Caption style={{ color: colors.textMuted, width: 90 }}>SECONDARY:</Caption>
                  <View style={styles.chipsRow}>
                    {currentExercise.secondaryMuscles.map((muscle) => (
                      <View
                        key={muscle}
                        style={[
                          styles.secondaryChip,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.border,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                      >
                        <Text style={[styles.secondaryChipText, { color: colors.textSecondary }]}>
                          {muscle}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Card>
          </View>

          {/* Instructions Section */}
          {currentExercise.instructions && (
            <View style={styles.sectionMargin}>
              <SectionHeader title="EXECUTION & FORM CUES" />
              <Card variant="surface" style={styles.infoCard}>
                <Text style={[styles.instructionsText, { color: colors.textPrimary }]}>
                  {currentExercise.instructions}
                </Text>
              </Card>
            </View>
          )}

          {/* Common Mistakes Section */}
          {currentExercise.commonMistakes && currentExercise.commonMistakes.length > 0 && (
            <View style={styles.sectionMargin}>
              <SectionHeader title="COMMON MISTAKES TO AVOID" />
              <Card variant="surface" style={styles.mistakesCard}>
                {currentExercise.commonMistakes.map((mistake, idx) => (
                  <View key={idx} style={styles.mistakeRow}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={18}
                      color={colors.amber}
                      style={{ marginTop: 2, marginRight: 8 }}
                    />
                    <Text style={[styles.mistakeText, { color: colors.textPrimary }]}>
                      {mistake}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>
          )}

          {/* Personal Record / Mastery History */}
          {mastery && (
            <View style={styles.sectionMargin}>
              <SectionHeader title="YOUR PERFORMANCE HISTORY" />
              <View style={styles.recordsGrid}>
                <Card variant="surface" style={styles.recordCard}>
                  <Caption upper style={{ color: colors.textMuted }}>ESTIMATED 1RM</Caption>
                  <MonoText style={[styles.recordValue, { color: isDark ? colors.cyan : colors.primary }]}>
                    {mastery.estimated1RmKg || 0} kg
                  </MonoText>
                </Card>
                <Card variant="surface" style={styles.recordCard}>
                  <Caption upper style={{ color: colors.textMuted }}>BEST WORKING WEIGHT</Caption>
                  <MonoText style={[styles.recordValue, { color: colors.textPrimary }]}>
                    {mastery.bestWeightKg || 0} kg
                  </MonoText>
                </Card>
                <Card variant="surface" style={styles.recordCard}>
                  <Caption upper style={{ color: colors.textMuted }}>SESSIONS LOGGED</Caption>
                  <MonoText style={[styles.recordValue, { color: colors.textPrimary }]}>
                    {mastery.totalSessions || 0}
                  </MonoText>
                </Card>
              </View>
            </View>
          )}

          {/* Suitable Alternatives Section */}
          <View style={styles.sectionMargin}>
            <SectionHeader
              title="SUITABLE ALTERNATIVES"
              actionText={`${alternatives.length} Matched`}
            />
            <Caption style={{ color: colors.textSecondary, marginBottom: 10 }}>
              Physiologically matched substitutions sharing the same movement pattern and target musculature.
            </Caption>

            {alternatives.length === 0 ? (
              <Card variant="surface" style={styles.emptyAltCard}>
                <Caption style={{ color: colors.textMuted }}>
                  No alternate movements available for this specialized exercise.
                </Caption>
              </Card>
            ) : (
              alternatives.map((alt) => (
                <Card key={alt.id} variant="surface" style={styles.altCard}>
                  <View style={styles.altCardContent}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.altBadgesRow}>
                        <Badge
                          label={alt.equipment}
                          variant="neutral"
                          size="sm"
                        />
                        <Badge
                          label={alt.difficulty || 'INTERMEDIATE'}
                          variant="neutral"
                          size="sm"
                        />
                      </View>
                      <Text style={[styles.altTitle, { color: colors.textPrimary }]}>
                        {alt.name}
                      </Text>
                      <Caption style={{ color: colors.textSecondary }}>
                        Target: {alt.primaryMuscle} • {alt.movementPattern.replace(/_/g, ' ')}
                      </Caption>
                    </View>

                    <View style={styles.altActionsCol}>
                      {isSwapMode && onSelectAlternative ? (
                        <TouchableOpacity
                          onPress={() => onSelectAlternative(alt)}
                          style={[
                            styles.swapBtn,
                            {
                              backgroundColor: isDark ? colors.cyan : colors.primary,
                              borderRadius: borderRadius.sm,
                            },
                          ]}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.swapBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                            Swap
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => setCurrentExercise(alt)}
                          style={[
                            styles.inspectBtn,
                            {
                              borderColor: colors.border,
                              borderRadius: borderRadius.sm,
                            },
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inspectBtnText, { color: colors.textPrimary }]}>
                            View →
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </Card>
              ))
            )}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topBarCenter: {
    alignItems: 'center',
    flex: 1,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    padding: 18,
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  exerciseTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionMargin: {
    marginBottom: 16,
  },
  muscleCard: {
    padding: 16,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  primaryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  primaryChipText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  secondaryChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  secondaryChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  infoCard: {
    padding: 16,
  },
  instructionsText: {
    fontSize: 14,
    lineHeight: 22,
  },
  mistakesCard: {
    padding: 16,
    gap: 10,
  },
  mistakeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mistakeText: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  recordsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  recordCard: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  recordValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  emptyAltCard: {
    padding: 16,
    alignItems: 'center',
  },
  altCard: {
    padding: 14,
    marginBottom: 8,
  },
  altCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  altBadgesRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  altTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  altActionsCol: {
    justifyContent: 'center',
  },
  swapBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  swapBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  inspectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  inspectBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
