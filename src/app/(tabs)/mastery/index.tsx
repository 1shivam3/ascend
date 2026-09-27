import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../constants/theme';
import { useAuthStore } from '../../../store/useAuthStore';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { MilestoneRepository } from '../../../database/repositories/MilestoneRepository';
import { Exercise, ExerciseMastery, ExerciseMilestone } from '../../../types/domain.types';
import { MasteryEngine } from '../../../services/progression/MasteryEngine';
import { PROGRESSION_CONFIG, RankTier } from '../../../config/progression.config';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { Divider } from '../../../components/ui/Divider';
import { ExerciseDetailModal } from '../../../components/workout/ExerciseDetailModal';

type MuscleGroupFilter = 'ALL' | 'CHEST' | 'BACK' | 'SHOULDERS' | 'LEGS' | 'ARMS' | 'CORE';
type MovementPatternFilter = 'ALL' | 'SQUAT' | 'HINGE' | 'PUSH' | 'PULL' | 'CARRY' | 'CARDIO';
type DifficultyFilter = 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

interface MuscleGroupSummary {
  id: MuscleGroupFilter;
  name: string;
  iconName: keyof typeof Ionicons.glyphMap;
  level: number;
  xp: number;
  xpToNext: number;
  progressPercent: number;
  exerciseCount: number;
  topExerciseName?: string;
  top1Rm?: number;
}

const MUSCLE_DEFINITIONS: {
  id: MuscleGroupFilter;
  name: string;
  iconName: keyof typeof Ionicons.glyphMap;
  keywords: string[];
}[] = [
  { id: 'CHEST', name: 'Chest', iconName: 'flash-outline', keywords: ['chest', 'pec', 'bench', 'pushup', 'dip'] },
  { id: 'BACK', name: 'Back', iconName: 'shield-outline', keywords: ['back', 'lat', 'row', 'pullup', 'chin', 'deadlift'] },
  { id: 'SHOULDERS', name: 'Shoulders', iconName: 'fitness-outline', keywords: ['shoulder', 'delt', 'press', 'overhead', 'lateral'] },
  { id: 'LEGS', name: 'Legs', iconName: 'walk-outline', keywords: ['leg', 'quad', 'hamstring', 'glute', 'squat', 'lunge', 'calf'] },
  { id: 'ARMS', name: 'Arms', iconName: 'barbell-outline', keywords: ['arm', 'bicep', 'tricep', 'curl', 'extension'] },
  { id: 'CORE', name: 'Core', iconName: 'flame-outline', keywords: ['core', 'ab', 'plank', 'crunch', 'hollow'] },
];

export default function MasteryScreen() {
  const router = useRouter();
  const { colors, borderRadius, shadows, isDark } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id || '';

  const [refreshing, setRefreshing] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [masteries, setMasteries] = useState<ExerciseMastery[]>([]);
  const [closestMilestone, setClosestMilestone] = useState<{
    milestone: ExerciseMilestone;
    exerciseName: string;
    currentMetricValue: number;
    remaining: number;
    progressPercent: number;
  } | null>(null);

  // Filters
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroupFilter>('ALL');
  const [selectedPattern, setSelectedPattern] = useState<MovementPatternFilter>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Exercise Detail Modal State
  const [selectedDetailExercise, setSelectedDetailExercise] = useState<Exercise | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [allMasteries, allExercises, milestone] = await Promise.all([
        MasteryRepository.getAllMasteries(userId),
        ExerciseRepository.getAll(),
        MilestoneRepository.getClosestMilestone(userId),
      ]);
      setMasteries(allMasteries);
      setExercises(allExercises);
      setClosestMilestone(milestone);
    } catch (err) {
      console.error('Failed to load mastery data:', err);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Group masteries by exercise ID
  const masteryMap = useMemo(() => {
    const map = new Map<string, ExerciseMastery>();
    masteries.forEach((m) => map.set(m.exerciseId, m));
    return map;
  }, [masteries]);

  // Compute Muscle Group Summaries
  const muscleSummaries = useMemo<MuscleGroupSummary[]>(() => {
    return MUSCLE_DEFINITIONS.map((def) => {
      const matchedExercises = exercises.filter((ex) => {
        const text = `${ex.name} ${ex.primaryMuscle || ''} ${(
          ex.secondaryMuscles || []
        ).join(' ')} ${ex.movementPattern || ''}`.toLowerCase();
        return def.keywords.some((k) => text.includes(k));
      });

      const matchedMasteries = matchedExercises
        .map((ex) => masteryMap.get(ex.id))
        .filter(Boolean) as ExerciseMastery[];

      if (matchedMasteries.length === 0) {
        return {
          id: def.id,
          name: def.name,
          iconName: def.iconName,
          level: 1,
          xp: 0,
          xpToNext: 1000,
          progressPercent: 0,
          exerciseCount: matchedExercises.length,
        };
      }

      const totalLevel = matchedMasteries.reduce((sum, m) => sum + m.masteryLevel, 0);
      const totalXp = matchedMasteries.reduce((sum, m) => sum + m.masteryXp, 0);
      const avgLevel = Math.max(1, Math.round(totalLevel / matchedMasteries.length));
      const xpInTier = totalXp % 1000;
      const progressPercent = Math.min(100, Math.round((xpInTier / 1000) * 100));

      let topExName: string | undefined;
      let top1Rm = 0;
      matchedMasteries.forEach((m) => {
        const e1rm = m.estimated1RmKg || 0;
        if (e1rm > top1Rm) {
          top1Rm = e1rm;
          const ex = exercises.find((e) => e.id === m.exerciseId);
          if (ex) topExName = ex.name;
        }
      });

      return {
        id: def.id,
        name: def.name,
        iconName: def.iconName,
        level: avgLevel,
        xp: xpInTier,
        xpToNext: 1000,
        progressPercent,
        exerciseCount: matchedExercises.length,
        topExerciseName: topExName,
        top1Rm: top1Rm > 0 ? top1Rm : undefined,
      };
    });
  }, [exercises, masteryMap]);

  // Filtered exercise mastery pairs
  const filteredItems = useMemo(() => {
    return exercises
      .filter((ex) => {
        if (searchQuery.trim().length > 0) {
          const q = searchQuery.toLowerCase();
          const match =
            ex.name.toLowerCase().includes(q) ||
            (ex.primaryMuscle && ex.primaryMuscle.toLowerCase().includes(q));
          if (!match) return false;
        }

        if (selectedMuscle !== 'ALL') {
          const def = MUSCLE_DEFINITIONS.find((d) => d.id === selectedMuscle);
          if (def) {
            const text = `${ex.name} ${ex.primaryMuscle || ''} ${(
              ex.secondaryMuscles || []
            ).join(' ')}`.toLowerCase();
            const matches = def.keywords.some((k) => text.includes(k));
            if (!matches) return false;
          }
        }

        if (selectedPattern !== 'ALL') {
          if (ex.movementPattern?.toUpperCase() !== selectedPattern) return false;
        }

        if (selectedDifficulty !== 'ALL') {
          const diff = ex.difficulty || 'INTERMEDIATE';
          if (diff !== selectedDifficulty) return false;
        }

        return true;
      })
      .map((ex) => ({
        exercise: ex,
        mastery: masteryMap.get(ex.id),
      }))
      .sort((a, b) => {
        const lvlA = a.mastery?.masteryLevel || 0;
        const lvlB = b.mastery?.masteryLevel || 0;
        if (lvlB !== lvlA) return lvlB - lvlA;
        return a.exercise.name.localeCompare(b.exercise.name);
      });
  }, [exercises, masteryMap, searchQuery, selectedMuscle, selectedPattern, selectedDifficulty]);

  return (
    <ScreenContainer
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header */}
      <View style={styles.header}>
        <Heading level={1} style={styles.screenTitle}>
          Mastery
        </Heading>
        <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
          Muscle disciplines, lift proficiency & progressive overload
        </Caption>
      </View>

      {/* Milestone Radar Banner */}
      {closestMilestone && (
        <Card
          variant="surface"
          style={[
            styles.milestoneBanner,
            {
              borderColor: colors.accent,
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={styles.milestoneTop}>
            <View style={styles.milestoneLeft}>
              <Caption
                upper
                style={{
                  color: colors.accent,
                  fontWeight: '700',
                  fontSize: 10,
                }}
              >
                NEXT MILESTONE THRESHOLD
              </Caption>
              <Heading level={2} style={styles.milestoneTitle}>
                {closestMilestone.exerciseName}: {closestMilestone.milestone.title}
              </Heading>
            </View>
            <Badge
              label={`${closestMilestone.progressPercent}%`}
              variant="accent"
              size="sm"
            />
          </View>
          <ProgressBar
            progressPercent={closestMilestone.progressPercent}
            color={colors.accent}
            size="sm"
            style={{ marginTop: 8 }}
          />
          <Caption style={{ color: colors.textSecondary, marginTop: 6, fontSize: 11 }}>
            {closestMilestone.remaining} units to unlock • +
            {closestMilestone.milestone.rewardXp} XP reward
          </Caption>
        </Card>
      )}

      {/* Muscle Disciplines Grid */}
      <SectionHeader title="MUSCLE DISCIPLINES" />

      <View style={styles.muscleGrid}>
        {muscleSummaries.map((item) => {
          const isSelected = selectedMuscle === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => setSelectedMuscle(isSelected ? 'ALL' : item.id)}
              activeOpacity={0.8}
              style={styles.muscleGridCol}
            >
              <Card
                variant="surface"
                style={[
                  styles.muscleCard,
                  {
                    borderColor: isSelected
                      ? colors.accent
                      : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.muscleTopRow}>
                  <View
                    style={[
                      styles.muscleIconBox,
                      {
                        backgroundColor: isSelected
                          ? colors.accentSubtle
                          : colors.surfaceElevated,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.iconName}
                      size={18}
                      color={
                        isSelected
                          ? colors.accent
                          : colors.textPrimary
                      }
                    />
                  </View>
                  <MonoText
                    style={[
                      styles.muscleLevel,
                      {
                        color: isSelected
                          ? colors.accent
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    LV {item.level}
                  </MonoText>
                </View>

                <Text style={styles.muscleName}>{item.name}</Text>

                <ProgressBar
                  progressPercent={item.progressPercent}
                  color={
                    isSelected
                      ? colors.accent
                      : colors.textMuted
                  }
                  size="sm"
                  style={{ marginVertical: 6 }}
                />

                <View style={styles.muscleMetaRow}>
                  <Caption style={{ color: colors.textMuted, fontSize: 10 }}>
                    {item.exerciseCount} lifts
                  </Caption>
                  {item.top1Rm ? (
                    <MonoText style={{ fontSize: 11, fontWeight: '700' }}>
                      {item.top1Rm} kg
                    </MonoText>
                  ) : null}
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </View>

      <Divider marginVertical={12} />

      {/* Search & Pattern Filters Header */}
      <SectionHeader
        title="EXERCISE MASTERY"
        actionText={
          selectedMuscle !== 'ALL' ||
          selectedPattern !== 'ALL' ||
          selectedDifficulty !== 'ALL' ||
          searchQuery.length > 0
            ? 'Reset Filters'
            : undefined
        }
        onActionPress={() => {
          setSelectedMuscle('ALL');
          setSelectedPattern('ALL');
          setSelectedDifficulty('ALL');
          setSearchQuery('');
        }}
      />

      {/* Search Input Bar */}
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: borderRadius.md,
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textMuted}
          style={{ marginRight: 8 }}
        />
        <TextInput
          placeholder="Search movements or muscles..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Movement Pattern Filter Horizontal Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.patternFilterRow}
      >
        {(
          [
            'ALL',
            'SQUAT',
            'HINGE',
            'PUSH',
            'PULL',
            'CARRY',
            'CARDIO',
          ] as MovementPatternFilter[]
        ).map((pat) => {
          const isSelected = selectedPattern === pat;
          return (
            <TouchableOpacity
              key={pat}
              onPress={() => setSelectedPattern(pat)}
              style={[
                styles.patternChip,
                {
                  backgroundColor: isSelected
                    ? colors.primaryButton
                    : colors.surface,
                  borderColor: isSelected
                    ? 'transparent'
                    : colors.border,
                  borderRadius: borderRadius.full,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.patternChipText,
                  {
                    color: isSelected
                      ? colors.primaryButtonText
                      : colors.textSecondary,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {pat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Difficulty Filter Horizontal Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.patternFilterRow, { marginTop: 8 }]}
      >
        {(['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as DifficultyFilter[]).map((diff) => {
          const isSelected = selectedDifficulty === diff;
          return (
            <TouchableOpacity
              key={diff}
              onPress={() => setSelectedDifficulty(diff)}
              style={[
                styles.patternChip,
                {
                  backgroundColor: isSelected
                    ? colors.primaryButton
                    : colors.surface,
                  borderColor: isSelected
                    ? 'transparent'
                    : colors.border,
                  borderRadius: borderRadius.full,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.patternChipText,
                  {
                    color: isSelected
                      ? colors.primaryButtonText
                      : colors.textSecondary,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {diff}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Exercise Mastery Items */}
      <View style={styles.masteryList}>
        {filteredItems.length === 0 ? (
          <Card variant="surface" style={styles.emptyContainer}>
            <Ionicons
              name="search-outline"
              size={36}
              color={colors.textMuted}
              style={{ marginBottom: 8 }}
            />
            <Heading level={3} style={{ marginBottom: 4 }}>
              No Exercises Found
            </Heading>
            <Caption style={{ textAlign: 'center', color: colors.textSecondary }}>
              Try adjusting your search criteria or resetting filters.
            </Caption>
          </Card>
        ) : (
          filteredItems.map(({ exercise, mastery }) => {
            const level = mastery?.masteryLevel || 1;
            const rank = (mastery?.rank || 'E') as RankTier;
            const rankColor = PROGRESSION_CONFIG.mastery.exerciseRanks[rank]?.color || colors.accent;
            const progress = MasteryEngine.getExerciseProgress(
              mastery?.masteryXp || 0
            );

            const bestWeight = mastery?.bestWeightKg || 0;
            const e1rm = mastery?.estimated1RmKg || 0;
            const prsCount = mastery?.personalRecordsCount || 0;
            const totalSessions = mastery?.totalSessions || 0;

            return (
              <TouchableOpacity
                key={exercise.id}
                onPress={() => {
                  setSelectedDetailExercise(exercise);
                  setDetailModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Card variant="surface" style={styles.exerciseItem}>
                  {/* Item Top Row */}
                  <View style={styles.exerciseItemTop}>
                    {/* Left: Rank Badge + Titles */}
                    <View style={styles.exerciseTitleCol}>
                      <View
                        style={[
                          styles.rankBadge,
                          {
                            backgroundColor: `${rankColor}18`,
                            borderRadius: borderRadius.xs,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.rankBadgeText,
                            {
                              color: rankColor,
                            },
                          ]}
                        >
                          {rank}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Heading level={3} style={styles.exerciseItemName} numberOfLines={1}>
                          {exercise.name}
                        </Heading>
                        <Caption style={{ color: colors.textSecondary, fontSize: 11 }}>
                          {exercise.movementPattern?.replace(/_/g, ' ') || 'STRENGTH'} •{' '}
                          {exercise.primaryMuscle || 'GENERAL'}
                        </Caption>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                          <Badge
                            label={exercise.difficulty || 'INTERMEDIATE'}
                            variant={
                              exercise.difficulty === 'BEGINNER'
                                ? 'emerald'
                                : exercise.difficulty === 'ADVANCED'
                                ? 'amber'
                                : 'accent'
                            }
                            size="sm"
                          />
                          <Badge
                            label={exercise.equipment}
                            variant="neutral"
                            size="sm"
                          />
                        </View>
                      </View>
                    </View>

                    {/* Right: Level & XP */}
                    <View style={styles.levelBadgeCol}>
                      <MonoText
                        style={[
                          styles.levelValue,
                          { color: colors.accent },
                        ]}
                      >
                        LV {level}
                      </MonoText>
                      <Caption style={{ color: colors.textMuted, fontSize: 10 }}>
                        {progress.currentLevelXp} / {progress.xpRequiredForNextLevel} XP
                      </Caption>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <ProgressBar
                    progressPercent={progress.progressPercent}
                    color={rankColor}
                    size="sm"
                    style={{ marginVertical: 8 }}
                  />

                  {/* Technical Metric Telemetry Bar */}
                  <View
                    style={[
                      styles.telemetryBar,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.04)'
                          : colors.surfaceElevated,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    <View style={styles.telemetryItem}>
                      <Caption style={{ color: colors.textMuted, fontSize: 10 }}>
                        BEST WT
                      </Caption>
                      <MonoText style={{ fontWeight: '700', fontSize: 12 }}>
                        {bestWeight > 0 ? `${bestWeight} kg` : '—'}
                      </MonoText>
                    </View>

                    <View style={styles.telemetryItem}>
                      <Caption style={{ color: colors.textMuted, fontSize: 10 }}>
                        EST. 1RM
                      </Caption>
                      <MonoText style={{ fontWeight: '700', fontSize: 12 }}>
                        {e1rm > 0 ? `${e1rm} kg` : '—'}
                      </MonoText>
                    </View>

                    <View style={styles.telemetryItem}>
                      <Caption style={{ color: colors.textMuted, fontSize: 10 }}>
                        PRS
                      </Caption>
                      <MonoText style={{ fontWeight: '700', fontSize: 12 }}>
                        {prsCount}
                      </MonoText>
                    </View>

                    <View style={styles.telemetryItem}>
                      <Caption style={{ color: colors.textMuted, fontSize: 10 }}>
                        SESSIONS
                      </Caption>
                      <MonoText style={{ fontWeight: '700', fontSize: 12 }}>
                        {totalSessions}
                      </MonoText>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />

      <ExerciseDetailModal
        visible={detailModalVisible}
        exercise={selectedDetailExercise}
        userId={userId}
        onClose={() => setDetailModalVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  milestoneBanner: {
    marginBottom: 16,
    padding: 16,
  },
  milestoneTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  milestoneLeft: {
    flex: 1,
    marginRight: 8,
  },
  milestoneTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  muscleGridCol: {
    width: '48%',
  },
  muscleCard: {
    padding: 12,
  },
  muscleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  muscleIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muscleLevel: {
    fontSize: 11,
    fontWeight: '800',
  },
  muscleName: {
    fontSize: 14,
    fontWeight: '700',
  },
  muscleMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  patternFilterRow: {
    gap: 8,
    paddingBottom: 14,
  },
  patternChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
  },
  patternChipText: {
    fontSize: 11,
  },
  masteryList: {
    gap: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  exerciseItem: {
    padding: 14,
  },
  exerciseItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  exerciseTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  rankBadge: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontWeight: '800',
    fontSize: 14,
  },
  exerciseItemName: {
    fontSize: 15,
    fontWeight: '700',
  },
  levelBadgeCol: {
    alignItems: 'flex-end',
  },
  levelValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  telemetryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  telemetryItem: {
    alignItems: 'center',
    gap: 2,
  },
});
