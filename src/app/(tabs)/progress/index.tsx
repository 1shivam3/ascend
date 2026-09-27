import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../constants/theme';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { WorkoutRepository } from '../../../database/repositories/WorkoutRepository';
import { useAuthStore } from '../../../store/useAuthStore';
import { Exercise, ExerciseMastery, WorkoutSession, SetType } from '../../../types/domain.types';
import { FitnessProgressionService } from '../../../services/progression/FitnessProgressionService';
import {
  ProgressAnalyticsService,
  ChartMetric,
  ChartTimeRange,
  ChartQueryResult,
  CategorizedPrsResult,
  CategorizedPrItem,
} from '../../../services/progress/ProgressAnalyticsService';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { StatCard } from '../../../components/ui/StatCard';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { InteractiveProgressChart } from '../../../components/progress/InteractiveProgressChart';
import { CategorizedPRsView } from '../../../components/progress/CategorizedPRsView';
import { UnifiedProgressionModal } from '../../../components/progression/UnifiedProgressionModal';
import { LogWeightModal } from '../../../components/modals/LogWeightModal';
import { CustomDateRangeModal } from '../../../components/modals/CustomDateRangeModal';
import { ChartDataDetailsModal } from '../../../components/modals/ChartDataDetailsModal';
import { EditWorkoutRecordModal } from '../../../components/modals/EditWorkoutRecordModal';
import { FitnessComparisonCard } from '../../../components/comparison/FitnessComparisonCard';
import { FitnessComparisonModal } from '../../../components/comparison/FitnessComparisonModal';
import { FitnessComparisonService } from '../../../services/comparison/FitnessComparisonService';
import { FitnessComparisonEvaluation } from '../../../types/comparison.types';

export default function ProgressScreen() {
  const router = useRouter();
  const { colors, borderRadius, isDark } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const currentWeight = profile?.weightKg || 75;

  const [refreshing, setRefreshing] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // Interactive Graph State
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('ESTIMATED_1RM');
  const [selectedRange, setSelectedRange] = useState<ChartTimeRange>('30D');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<string | undefined>(undefined);
  const [chartQueryResult, setChartQueryResult] = useState<ChartQueryResult | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);

  // Categorized PRs
  const [categorizedPrs, setCategorizedPrs] = useState<CategorizedPrsResult | null>(null);

  // Workout History & Editing
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>([]);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutSession | null>(null);

  // Pillar Metrics
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [weeklyVolumeKg, setWeeklyVolumeKg] = useState(0);
  const [lifetimeWorkoutsCount, setLifetimeWorkoutsCount] = useState(0);
  const [enduranceMetrics, setEnduranceMetrics] = useState({
    sessionDensityRepsPerMin: 0,
    weeklyTonnageKg: 0,
    highRepSetsCount: 0,
    bestDistanceMeters: 0,
  });
  const [mobilityMetrics, setMobilityMetrics] = useState({
    mobilityScore: 10,
    warmupSetsCount: 0,
    unilateralSetsCount: 0,
    mobilityWorkoutsCount: 0,
  });

  // Modal Visibility State
  const [progressionModalVisible, setProgressionModalVisible] = useState(false);
  const [logWeightModalVisible, setLogWeightModalVisible] = useState(false);
  const [customRangeModalVisible, setCustomRangeModalVisible] = useState(false);
  const [chartDetailsModalVisible, setChartDetailsModalVisible] = useState(false);
  const [editRecordModalVisible, setEditRecordModalVisible] = useState(false);

  // Transparent Comparison State
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);
  const [comparisonEvaluation, setComparisonEvaluation] = useState<FitnessComparisonEvaluation | null>(null);
  const [comparisonExerciseId, setComparisonExerciseId] = useState<string>('ex-bench-press');

  // Load Comparison Data
  const loadComparison = useCallback(async (exerciseId: string) => {
    try {
      const evaluation = await FitnessComparisonService.evaluateUserComparison({
        userId,
        exerciseId,
        bodyweightKg: currentWeight,
      });
      setComparisonEvaluation(evaluation);
    } catch (err) {
      console.error('Failed to evaluate fitness comparison:', err);
    }
  }, [userId, currentWeight]);

  useEffect(() => {
    const targetId = selectedExerciseId !== 'ALL' ? selectedExerciseId : 'ex-bench-press';
    setComparisonExerciseId(targetId);
    loadComparison(targetId);
  }, [selectedExerciseId, loadComparison]);

  // 1. Load Core Exercise Catalog
  useEffect(() => {
    ExerciseRepository.getAll().then((list) => {
      setExercises(list);
    });
  }, []);

  // 2. Load Chart Data whenever query parameters change
  const fetchChartData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadingChart(true);
      const res = await ProgressAnalyticsService.getChartData(userId, {
        metric: selectedMetric,
        exerciseId: selectedExerciseId,
        timeRange: selectedRange,
        customStartDate,
        customEndDate,
      });
      setChartQueryResult(res);
    } catch (err) {
      console.error('Failed to load progress chart telemetry:', err);
    } finally {
      setLoadingChart(false);
    }
  }, [userId, selectedMetric, selectedExerciseId, selectedRange, customStartDate, customEndDate]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // 3. Load All Telemetry & Pillars
  const loadAllTelemetry = useCallback(async () => {
    if (!userId) return;
    try {
      const [
        prs,
        history,
        weeklyMonthly,
        lifetime,
        endurance,
        mobility,
      ] = await Promise.all([
        ProgressAnalyticsService.getCategorizedPersonalRecords(userId),
        WorkoutRepository.getRecentWorkouts(userId, 15),
        WorkoutRepository.getWeeklyMonthlyStats(userId),
        WorkoutRepository.getLifetimeStats(userId),
        ProgressAnalyticsService.getEnduranceMetrics(userId),
        ProgressAnalyticsService.getMobilityMetrics(userId),
      ]);

      setCategorizedPrs(prs);
      setWorkoutHistory(history);
      setWeeklyCount(weeklyMonthly.weeklyCount);
      setMonthlyCount(weeklyMonthly.monthlyCount);
      setWeeklyVolumeKg(weeklyMonthly.weeklyVolumeKg);
      setLifetimeWorkoutsCount(lifetime?.totalWorkouts || 0);
      setEnduranceMetrics(endurance);
      setMobilityMetrics(mobility);
    } catch (err) {
      console.error('Failed to load telemetry pillars:', err);
    }
  }, [userId]);

  useEffect(() => {
    loadAllTelemetry();
  }, [loadAllTelemetry]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchChartData(),
      loadAllTelemetry(),
      loadComparison(comparisonExerciseId),
    ]);
    setRefreshing(false);
  };

  // Record Editing Handlers
  const handleUpdateSet = async (
    setId: string,
    updates: { weightKg: number; reps: number; rpe?: number | null; setType?: SetType }
  ) => {
    if (!userId) return;
    await ProgressAnalyticsService.updateSetRecord(userId, setId, updates);
    await Promise.all([loadAllTelemetry(), fetchChartData()]);
    // Refresh editing workout if active
    if (editingWorkout) {
      const refreshed = await WorkoutRepository.getWorkoutById(editingWorkout.id);
      setEditingWorkout(refreshed);
    }
  };

  const handleDeleteSet = async (setId: string) => {
    if (!userId) return;
    await ProgressAnalyticsService.deleteSetRecord(userId, setId);
    await Promise.all([loadAllTelemetry(), fetchChartData()]);
    if (editingWorkout) {
      const refreshed = await WorkoutRepository.getWorkoutById(editingWorkout.id);
      setEditingWorkout(refreshed);
    }
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    if (!userId) return;
    await ProgressAnalyticsService.deleteWorkoutSession(userId, workoutId);
    setEditingWorkout(null);
    setEditRecordModalVisible(false);
    await Promise.all([loadAllTelemetry(), fetchChartData()]);
  };

  const handleSaveWeight = async (weightKg: number) => {
    if (!userId) return;
    await ProgressAnalyticsService.logBodyweight(userId, weightKg);
    await Promise.all([loadAllTelemetry(), fetchChartData()]);
  };

  // Unified Progression Status
  const totalXp = profile?.totalXp || 0;
  const unifiedStatus = useMemo(() => {
    return FitnessProgressionService.evaluateUnifiedProgression({
      totalXp,
      attributes: profile?.attributes || {
        strength: 10,
        endurance: 10,
        mobility: 10,
        consistency: 10,
        agility: 10,
        stamina: 10,
        discipline: 10,
        vitality: 10,
      },
      verifiedSessionsCount: lifetimeWorkoutsCount,
      athleteBodyweightKg: profile?.weightKg || 75,
    });
  }, [totalXp, profile?.attributes, lifetimeWorkoutsCount, profile?.weightKg]);

  const targetDays = profile?.trainingPreferences?.daysPerWeek || 4;
  const consistencyPercent = Math.min(
    100,
    Math.round((weeklyCount / Math.max(1, targetDays)) * 100)
  );

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
        <View style={{ flex: 1 }}>
          <Heading level={1} style={styles.screenTitle}>
            Progress
          </Heading>
          <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
            Long-term physical adaptations, PRs & verified history
          </Caption>
        </View>

        <TouchableOpacity
          onPress={() => setLogWeightModalVisible(true)}
          style={[
            styles.logWeightBtn,
            {
              backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#E6F7F0',
              borderColor: colors.emerald,
              borderRadius: borderRadius.sm,
            },
          ]}
          activeOpacity={0.8}
        >
          <Ionicons name="speedometer-outline" size={14} color={colors.emerald} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.emerald }}>
            + Log Weight
          </Text>
        </TouchableOpacity>
      </View>

      {/* Top Unified Progression & Rank Standing Card */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => setProgressionModalVisible(true)}
        style={{ marginBottom: 16 }}
      >
        <Card
          variant="elevated"
          style={{
            borderColor: isDark ? `${unifiedStatus.effectiveRank.color}44` : colors.border,
            borderWidth: 1.5,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: `${unifiedStatus.effectiveRank.color}22`,
                  borderWidth: 1,
                  borderColor: `${unifiedStatus.effectiveRank.color}66`,
                }}
              >
                <Text style={{ color: unifiedStatus.effectiveRank.color, fontSize: 11, fontWeight: '800' }}>
                  RANK {unifiedStatus.effectiveRank.tier}
                </Text>
              </View>
              <Badge
                label={unifiedStatus.confirmationStatus}
                variant={unifiedStatus.confirmationStatus === 'CONFIRMED' ? 'emerald' : 'amber'}
                size="sm"
              />
            </View>
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>
              Full Telemetry →
            </Text>
          </View>

          <View style={{ marginTop: 6 }}>
            <Heading level={3} style={{ color: colors.textPrimary }}>
              {unifiedStatus.effectiveRank.title}
            </Heading>
            <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
              Level {unifiedStatus.currentLevel} • {unifiedStatus.nextMilestone.summaryMessage}
            </Caption>
          </View>

          {/* 4 Dimension Mini Bars */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted }}>STR</Text>
                <MonoText style={{ fontSize: 9, color: colors.accent }}>{unifiedStatus.attributes.strength}</MonoText>
              </View>
              <ProgressBar progressPercent={unifiedStatus.attributes.strength} size="sm" color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted }}>END</Text>
                <MonoText style={{ fontSize: 9, color: colors.skyText }}>{unifiedStatus.attributes.endurance}</MonoText>
              </View>
              <ProgressBar progressPercent={unifiedStatus.attributes.endurance} size="sm" color={colors.skyText} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted }}>MOB</Text>
                <MonoText style={{ fontSize: 9, color: colors.lavenderText }}>{unifiedStatus.attributes.mobility ?? 10}</MonoText>
              </View>
              <ProgressBar progressPercent={unifiedStatus.attributes.mobility ?? 10} size="sm" color={colors.lavenderText} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted }}>CON</Text>
                <MonoText style={{ fontSize: 9, color: colors.amber }}>{unifiedStatus.attributes.consistency}</MonoText>
              </View>
              <ProgressBar progressPercent={unifiedStatus.attributes.consistency} size="sm" color={colors.amber} />
            </View>
          </View>
        </Card>
      </TouchableOpacity>

      {/* SECTION 1: Interactive Performance Analytics Graph */}
      <View style={styles.sectionMargin}>
        <SectionHeader
          title="PERFORMANCE ANALYTICS"
          actionText="Controls & Filters"
        />
        <InteractiveProgressChart
          queryResult={chartQueryResult}
          selectedMetric={selectedMetric}
          selectedRange={selectedRange}
          selectedExerciseId={selectedExerciseId}
          exercises={exercises}
          onSelectMetric={setSelectedMetric}
          onSelectRange={setSelectedRange}
          onSelectExercise={(eid) => setSelectedExerciseId(eid || 'ALL')}
          onOpenCustomRangeModal={() => setCustomRangeModalVisible(true)}
          onOpenDetailsModal={() => setChartDetailsModalVisible(true)}
          loading={loadingChart}
        />
      </View>

      {/* SECTION 2: 8 Fitness Adaptation Pillars Grid */}
      <View style={styles.sectionMargin}>
        <SectionHeader title="KEY ADAPTATION PILLARS" />

        {/* Row 1: Strength Progress & Body-Weight Trends */}
        <View style={styles.kpiRow}>
          {/* Pillar 1: Strength Progress */}
          <StatCard
            label="Strength Progress"
            value={unifiedStatus.attributes.strength}
            unit="pts"
            trend={
              (unifiedStatus.maxRelativeCompoundRatio ?? 0) > 0
                ? `${(unifiedStatus.maxRelativeCompoundRatio ?? 0).toFixed(2)}x BW`
                : 'Developing'
            }
            trendDirection="up"
            icon={<Ionicons name="flash-outline" size={18} color={colors.accent} />}
            accentColor={colors.accent}
            style={{ flex: 1 }}
          />

          {/* Pillar 2: Body-Weight Trends */}
          <StatCard
            label="Body Weight"
            value={currentWeight.toFixed(1)}
            unit="kg"
            trend="Scale Trend"
            icon={<Ionicons name="speedometer-outline" size={18} color={colors.emerald} />}
            accentColor={colors.emerald}
            style={{ flex: 1 }}
          />
        </View>

        {/* Row 2: Workout Consistency & Training Volume */}
        <View style={[styles.kpiRow, { marginTop: 10 }]}>
          {/* Pillar 3: Workout Consistency */}
          <StatCard
            label="Consistency"
            value={`${weeklyCount} / ${targetDays}`}
            unit="sessions"
            trend={`${consistencyPercent}% Target`}
            trendDirection={consistencyPercent >= 80 ? 'up' : 'neutral'}
            icon={<Ionicons name="calendar-outline" size={18} color={colors.amber} />}
            accentColor={colors.amber}
            style={{ flex: 1 }}
          />

          {/* Pillar 7: Training Volume */}
          <StatCard
            label="Weekly Volume"
            value={weeklyVolumeKg > 999 ? `${(weeklyVolumeKg / 1000).toFixed(1)}k` : weeklyVolumeKg}
            unit="kg"
            trend="Total Load"
            icon={<Ionicons name="layers-outline" size={18} color={colors.skyText} />}
            accentColor={colors.skyText}
            style={{ flex: 1 }}
          />
        </View>

        {/* Row 3: Endurance Progress & Mobility Assessment Progress */}
        <View style={[styles.kpiRow, { marginTop: 10 }]}>
          {/* Pillar 5: Endurance Progress */}
          <StatCard
            label="Endurance Density"
            value={enduranceMetrics.sessionDensityRepsPerMin}
            unit="reps/min"
            trend={`${enduranceMetrics.highRepSetsCount} High-Rep`}
            icon={<Ionicons name="repeat-outline" size={18} color={colors.skyText} />}
            accentColor={colors.skyText}
            style={{ flex: 1 }}
          />

          {/* Pillar 6: Mobility Assessment Progress */}
          <StatCard
            label="Mobility Rating"
            value={mobilityMetrics.mobilityScore}
            unit="/ 100"
            trend={`${mobilityMetrics.warmupSetsCount} Warmups`}
            icon={<Ionicons name="body-outline" size={18} color={colors.lavenderText} />}
            accentColor={colors.lavenderText}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {/* SECTION: Transparent Population & Cohort Benchmarks */}
      <View style={styles.sectionMargin}>
        <SectionHeader
          title="POPULATION & COHORT BENCHMARKS"
          actionText="Inspect Transparency"
          onActionPress={() => setComparisonModalVisible(true)}
        />
        <FitnessComparisonCard
          evaluation={comparisonEvaluation}
          onOpenModal={() => setComparisonModalVisible(true)}
        />
      </View>

      {/* SECTION 4: Personal Records (5 Separated Categories) */}
      <View style={styles.sectionMargin}>
        <SectionHeader
          title="PERSONAL RECORD BREAKTHROUGHS"
          actionText={categorizedPrs?.totalCount ? `${categorizedPrs.totalCount} Verified` : undefined}
        />
        <CategorizedPRsView
          prsResult={categorizedPrs}
          onSelectPr={(pr) => {
            // Filter graph to this exercise
            setSelectedExerciseId(pr.exerciseId);
            Haptics.selectionAsync();
          }}
        />
      </View>

      {/* SECTION 8: Workout History & Record Management */}
      <View style={styles.sectionMargin}>
        <SectionHeader
          title="WORKOUT HISTORY & RECORDS"
          actionText="Edit & Clean Up"
        />

        {workoutHistory.length === 0 ? (
          <Card variant="surface" style={styles.emptyHistoryBox}>
            <Ionicons name="barbell-outline" size={32} color={colors.textMuted} style={{ marginBottom: 6 }} />
            <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>No Completed Sessions</Text>
            <Caption style={{ color: colors.textMuted, textAlign: 'center', marginTop: 2 }}>
              Finish a workout session in Train to build your verified historical log.
            </Caption>
          </Card>
        ) : (
          <View style={styles.historyList}>
            {workoutHistory.map((w) => {
              const durMins = Math.round(w.durationSeconds / 60);
              const dateFormatted = new Date(w.startedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <Card key={w.id} variant="surface" style={styles.historyCard}>
                  <View style={styles.historyCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                        {w.title}
                      </Text>
                      <Caption style={{ color: colors.textMuted, marginTop: 2 }}>
                        {dateFormatted} • {durMins} min • {w.totalSets} sets • {Math.round(w.totalVolumeKg)} kg vol
                      </Caption>
                    </View>

                    <TouchableOpacity
                      onPress={() => {
                        setEditingWorkout(w);
                        setEditRecordModalVisible(true);
                        Haptics.selectionAsync();
                      }}
                      style={[
                        styles.manageRecordBtn,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: colors.border,
                          borderWidth: 1,
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="create-outline" size={14} color={colors.accent} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>
                        Edit / Clean Up
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Exercise Chips */}
                  <View style={styles.exChipRow}>
                    {w.exercises.slice(0, 4).map((el, i) => (
                      <View
                        key={el.id || i}
                        style={[
                          styles.exChip,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.borderSubtle,
                            borderRadius: borderRadius.xs,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          {el.exercise?.name || 'Movement'} ({el.sets.length}s)
                        </Text>
                      </View>
                    ))}
                    {w.exercises.length > 4 && (
                      <View style={[styles.exChip, { borderRadius: borderRadius.xs }]}>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>
                          +{w.exercises.length - 4} more
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>

      <View style={{ height: 40 }} />

      {/* MODALS */}
      <UnifiedProgressionModal
        visible={progressionModalVisible}
        status={unifiedStatus}
        onClose={() => setProgressionModalVisible(false)}
      />

      <LogWeightModal
        visible={logWeightModalVisible}
        currentWeightKg={currentWeight}
        onClose={() => setLogWeightModalVisible(false)}
        onSave={handleSaveWeight}
      />

      <CustomDateRangeModal
        visible={customRangeModalVisible}
        initialStartDate={customStartDate}
        initialEndDate={customEndDate}
        onClose={() => setCustomRangeModalVisible(false)}
        onApply={(s, e) => {
          setCustomStartDate(s);
          setCustomEndDate(e);
          setSelectedRange('CUSTOM');
        }}
      />

      <ChartDataDetailsModal
        visible={chartDetailsModalVisible}
        queryResult={chartQueryResult}
        exerciseName={exercises.find((e) => e.id === selectedExerciseId)?.name}
        onClose={() => setChartDetailsModalVisible(false)}
      />

      <EditWorkoutRecordModal
        visible={editRecordModalVisible}
        workout={editingWorkout}
        onClose={() => {
          setEditRecordModalVisible(false);
          setEditingWorkout(null);
        }}
        onUpdateSet={handleUpdateSet}
        onDeleteSet={handleDeleteSet}
        onDeleteWorkout={handleDeleteWorkout}
      />

      <FitnessComparisonModal
        visible={comparisonModalVisible}
        initialExerciseId={comparisonExerciseId}
        userId={userId}
        userBodyweightKg={currentWeight}
        onClose={() => setComparisonModalVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  logWeightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  sectionMargin: {
    marginTop: 20,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  emptyHistoryBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    padding: 14,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  manageRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  exChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  exChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
});
