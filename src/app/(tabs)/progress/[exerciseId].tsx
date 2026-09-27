import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../../../constants/theme';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { MilestoneRepository } from '../../../database/repositories/MilestoneRepository';
import { getDatabase } from '../../../database/sqlite';
import { useAuthStore } from '../../../store/useAuthStore';
import { Exercise, ExerciseMastery, PersonalRecord, ExerciseMilestone, UserExerciseMilestone } from '../../../types/domain.types';
import { MasteryEngine } from '../../../services/progression/MasteryEngine';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, StatText, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { TrendSparkline } from '../../../components/hud/TrendSparkline';
import { PROGRESSION_CONFIG } from '../../../config/progression.config';
import { FitnessComparisonCard } from '../../../components/comparison/FitnessComparisonCard';
import { FitnessComparisonModal } from '../../../components/comparison/FitnessComparisonModal';
import { FitnessComparisonService } from '../../../services/comparison/FitnessComparisonService';
import { FitnessComparisonEvaluation } from '../../../types/comparison.types';

interface RecentSetRow {
  id: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  estimated1RmKg: number;
  isPr: boolean;
  completedAt: string;
}

export default function ProgressDetailScreen() {
  const router = useRouter();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const profile = useAuthStore(s => s.profile);
  const userId = profile?.id;

  const [refreshing, setRefreshing] = useState(false);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [mastery, setMastery] = useState<ExerciseMastery | null>(null);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [milestones, setMilestones] = useState<ExerciseMilestone[]>([]);
  const [unlockedMilestones, setUnlockedMilestones] = useState<UserExerciseMilestone[]>([]);
  const [recentSets, setRecentSets] = useState<RecentSetRow[]>([]);
  const [comparisonEvaluation, setComparisonEvaluation] = useState<FitnessComparisonEvaluation | null>(null);
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    if (!exerciseId) return;
    try {
      const ex = await ExerciseRepository.getById(exerciseId);
      setExercise(ex);

      if (userId) {
        const [m, prList, msList, unlockedList, compEval] = await Promise.all([
          MasteryRepository.getMastery(userId, exerciseId),
          MasteryRepository.getPersonalRecords(userId, exerciseId),
          MilestoneRepository.getMilestonesForExercise(exerciseId),
          MilestoneRepository.getUserUnlockedMilestones(userId, exerciseId),
          FitnessComparisonService.evaluateUserComparison({
            userId,
            exerciseId,
            exerciseName: ex?.name,
            bodyweightKg: profile?.weightKg,
          }),
        ]);

        setMastery(m);
        setPrs(prList);
        setMilestones(msList);
        setUnlockedMilestones(unlockedList);
        setComparisonEvaluation(compEval);

        // Fetch recent sets
        const db = await getDatabase();
        const rows = await db.getAllAsync<{
          id: string;
          set_number: number;
          weight_kg: number;
          reps: number;
          estimated_1rm_kg: number;
          is_pr: number;
          completed_at: string;
        }>(
          `SELECT sl.id, sl.set_number, sl.weight_kg, sl.reps, sl.estimated_1rm_kg, sl.is_pr, sl.completed_at
           FROM set_logs sl
           JOIN exercise_logs el ON el.id = sl.exercise_log_id
           WHERE el.exercise_id = ? AND sl.user_id = ? AND sl.completed = 1
           ORDER BY sl.completed_at DESC LIMIT 12;`,
          [exerciseId, userId]
        );

        setRecentSets(
          rows.map(r => ({
            id: r.id,
            setNumber: r.set_number,
            weightKg: r.weight_kg,
            reps: r.reps,
            estimated1RmKg: r.estimated_1rm_kg,
            isPr: Boolean(r.is_pr),
            completedAt: r.completed_at,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load exercise detail dossier:', err);
    }
  }, [exerciseId, userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (!exercise) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <Heading level={3} color={THEME.colors.cyan}>LOADING MOVEMENT DOSSIER...</Heading>
        </View>
      </ScreenContainer>
    );
  }

  const progress = MasteryEngine.getExerciseProgress(mastery?.masteryXp || 0);
  const rankInfo = PROGRESSION_CONFIG.mastery.exerciseRanks[progress.rank] || {
    color: THEME.colors.cyan,
    title: 'E-Rank Lift',
  };

  const unlockedSet = new Set(unlockedMilestones.map(u => u.milestoneId));

  // Chart data extraction
  const recentPerf = mastery?.recentPerformance || [];
  const e1rmPoints = recentPerf.length > 1
    ? recentPerf.map(p => p.estimated1RmKg)
    : [mastery?.estimated1RmKg || 0];
  const volumePoints = recentPerf.length > 1
    ? recentPerf.map(p => Math.round(p.weightKg * p.reps))
    : [mastery?.bestVolumeKg || 0];

  return (
    <ScreenContainer scrollable={false}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.cyan}
            colors={[THEME.colors.cyan]}
          />
        }
      >
        {/* Return Navigation */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Text color={THEME.colors.cyan} style={styles.backText}>← RETURN TO LIFT MASTERY</Text>
        </TouchableOpacity>

        {/* Movement Heading */}
        <View style={styles.titleSection}>
          <Heading level={1} style={styles.exerciseName}>{exercise.name}</Heading>
          <View style={styles.tagsRow}>
            <Badge label={exercise.primaryMuscle} variant="cyan" />
            <Badge label={exercise.equipment} variant="neutral" />
            {exercise.progressionType && (
              <Badge label={exercise.progressionType.replace(/_/g, ' ')} variant="amber" />
            )}
          </View>
        </View>

        {/* Hero Mastery Level & Rank Card */}
        <Card variant="glass" accentBorder={rankInfo.color} style={styles.levelCard}>
          <View style={styles.levelHeaderRow}>
            <View>
              <Caption upper style={styles.levelLabel}>EXERCISE MASTERY</Caption>
              <StatText color={rankInfo.color} style={styles.levelNumber}>
                LEVEL {progress.level}
              </StatText>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                <View style={[styles.rankTag, { borderColor: rankInfo.color, backgroundColor: `${rankInfo.color}15` }]}>
                  <Text style={[styles.rankTagText, { color: rankInfo.color }]}>
                    {rankInfo.title.toUpperCase()}
                  </Text>
                </View>
                {(() => {
                  const trend = mastery?.trend || (mastery && mastery.totalSessions > 0 ? 'MAINTAINING' : 'NEW');
                  const trendConfig: Record<string, { label: string; color: string }> = {
                    IMPROVING: { label: '▲ IMPROVING', color: THEME.colors.emerald },
                    MAINTAINING: { label: '● MAINTAINING', color: THEME.colors.cyan },
                    REGRESSING: { label: '▼ REGRESSING', color: THEME.colors.amber },
                    NEW: { label: '★ NEW', color: THEME.colors.textMuted },
                  };
                  const trendInfo = trendConfig[trend] || trendConfig.NEW;
                  return (
                    <View style={[styles.rankTag, { borderColor: trendInfo.color, backgroundColor: `${trendInfo.color}15` }]}>
                      <Text style={[styles.rankTagText, { color: trendInfo.color }]}>
                        {trendInfo.label}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            </View>

            <View style={styles.xpCircle}>
              <MonoText style={styles.totalXpVal} color={THEME.colors.cyan}>
                {(mastery?.masteryXp || 0).toLocaleString()}
              </MonoText>
              <Caption upper style={styles.totalXpLabel}>TOTAL XP</Caption>
            </View>
          </View>

          {/* Progress Bar to next level */}
          <ProgressBar
            progressPercent={progress.progressPercent}
            color={rankInfo.color}
            size="md"
            label={`${progress.currentLevelXp.toLocaleString()} / ${progress.xpRequiredForNextLevel.toLocaleString()} XP TO LEVEL ${progress.level + 1}`}
            showPercent
          />
        </Card>

        {/* Biomechanical Telemetry Grid */}
        <Caption upper style={styles.sectionHeader}>BIOMECHANICAL PERFORMANCE</Caption>
        <View style={styles.statsGrid}>
          {(() => {
            const isCardio = exercise.progressionType === 'CARDIO' || exercise.movementPattern === 'CARDIO';
            const isBodyweight = exercise.isBodyweight || exercise.progressionType === 'BODYWEIGHT';

            if (isCardio) {
              return (
                <>
                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>BEST DISTANCE</Caption>
                    <StatText size="md" color={THEME.colors.cyan}>
                      {mastery?.bestDistanceMeters && mastery.bestDistanceMeters >= 1000
                        ? `${(mastery.bestDistanceMeters / 1000).toFixed(2)} km`
                        : `${mastery?.bestDistanceMeters || 0} m`}
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>BEST PACE</Caption>
                    <StatText size="md" color={THEME.colors.emerald}>
                      {mastery?.bestPaceSecondsPerKm && mastery.bestPaceSecondsPerKm > 0
                        ? `${Math.floor(mastery.bestPaceSecondsPerKm / 60)}:${(Math.round(mastery.bestPaceSecondsPerKm) % 60).toString().padStart(2, '0')} /km`
                        : '--:--'}
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>LIFETIME DURATION</Caption>
                    <StatText size="md" color={THEME.colors.amber}>
                      {Math.round((mastery?.totalDurationSeconds || 0) / 60)} min
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>LIFETIME DISTANCE</Caption>
                    <StatText size="md">
                      {mastery?.totalDistanceMeters && mastery.totalDistanceMeters >= 1000
                        ? `${(mastery.totalDistanceMeters / 1000).toFixed(1)} km`
                        : `${mastery?.totalDistanceMeters || 0} m`}
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>TOTAL SESSIONS</Caption>
                    <StatText size="md">
                      {mastery?.totalSessions || 0}
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>TOTAL SETS</Caption>
                    <StatText size="md">
                      {mastery?.totalSets || 0} sets
                    </StatText>
                  </Card>
                </>
              );
            }

            if (isBodyweight) {
              return (
                <>
                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>MAX REPS PR</Caption>
                    <StatText size="md" color={THEME.colors.cyan}>
                      {mastery?.bestReps || 0} reps
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>ADDED WEIGHT</Caption>
                    <StatText size="md" color={THEME.colors.emerald}>
                      {mastery?.bestWeightKg ? `${mastery.bestWeightKg} kg` : 'Bodyweight'}
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>TOTAL REPS</Caption>
                    <StatText size="md" color={THEME.colors.amber}>
                      {(mastery?.totalReps || 0).toLocaleString()}
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>LIFETIME TONNAGE</Caption>
                    <StatText size="md">
                      {Math.round(mastery?.totalVolumeKg || 0).toLocaleString()} kg
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>TOTAL SESSIONS</Caption>
                    <StatText size="md">
                      {mastery?.totalSessions || 0}
                    </StatText>
                  </Card>

                  <Card variant="surface" style={styles.statBox}>
                    <Caption upper style={styles.statLabel}>TOTAL SETS</Caption>
                    <StatText size="md">
                      {mastery?.totalSets || 0} sets
                    </StatText>
                  </Card>
                </>
              );
            }

            return (
              <>
                <Card variant="surface" style={styles.statBox}>
                  <Caption upper style={styles.statLabel}>ESTIMATED 1RM</Caption>
                  <StatText size="md" color={THEME.colors.cyan}>
                    {mastery?.estimated1RmKg || 0} kg
                  </StatText>
                </Card>

                <Card variant="surface" style={styles.statBox}>
                  <Caption upper style={styles.statLabel}>RELATIVE STRENGTH</Caption>
                  <StatText size="md" color={THEME.colors.emerald}>
                    {mastery?.relativeStrength ? `${mastery.relativeStrength}x BW` : 'N/A'}
                  </StatText>
                </Card>

                <Card variant="surface" style={styles.statBox}>
                  <Caption upper style={styles.statLabel}>BEST WORKING SET</Caption>
                  <StatText size="md" color={THEME.colors.amber}>
                    {mastery?.bestWeightKg || 0} kg × {mastery?.bestReps || 0}
                  </StatText>
                </Card>

                <Card variant="surface" style={styles.statBox}>
                  <Caption upper style={styles.statLabel}>LIFETIME TONNAGE</Caption>
                  <StatText size="md">
                    {Math.round(mastery?.totalVolumeKg || 0).toLocaleString()} kg
                  </StatText>
                </Card>

                <Card variant="surface" style={styles.statBox}>
                  <Caption upper style={styles.statLabel}>TOTAL SESSIONS</Caption>
                  <StatText size="md">
                    {mastery?.totalSessions || 0}
                  </StatText>
                </Card>

                <Card variant="surface" style={styles.statBox}>
                  <Caption upper style={styles.statLabel}>TOTAL SETS / REPS</Caption>
                  <StatText size="md">
                    {mastery?.totalSets || 0}s • {mastery?.totalReps || 0}r
                  </StatText>
                </Card>
              </>
            );
          })()}
        </View>

        {/* Progression Charts Row: 1RM & Volume */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>PROGRESSION DYNAMICS</Caption>
          <View style={styles.trendRow}>
            <View style={{ flex: 1 }}>
              <TrendSparkline
                data={e1rmPoints.length > 0 ? e1rmPoints : [0]}
                label="EST. 1RM TREND"
                currentValue={`${mastery?.estimated1RmKg || 0} kg`}
                delta={`${e1rmPoints.length} logs`}
                strokeColor={THEME.colors.cyan}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TrendSparkline
                data={volumePoints.length > 0 ? volumePoints : [0]}
                label="MAX SET VOLUME"
                currentValue={`${mastery?.bestVolumeKg || 0} kg`}
                delta={`${volumePoints.length} logs`}
                strokeColor={THEME.colors.amber}
              />
            </View>
          </View>
        </View>

        {/* Transparent Population & Cohort Benchmark */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>POPULATION & COHORT BENCHMARK</Caption>
          <FitnessComparisonCard
            evaluation={comparisonEvaluation}
            onOpenModal={() => setComparisonModalVisible(true)}
          />
        </View>

        {/* Milestones Checklist Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>MILESTONES CHECKLIST</Caption>
            <Badge
              label={`${unlockedMilestones.length} / ${milestones.length} UNLOCKED`}
              variant={unlockedMilestones.length > 0 ? 'emerald' : 'neutral'}
              size="sm"
            />
          </View>

          {milestones.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Caption style={styles.emptyText}>No predefined milestones for this movement pattern.</Caption>
            </Card>
          ) : (
            milestones.map(ms => {
              const isUnlocked = unlockedSet.has(ms.id);
              return (
                <Card
                  key={ms.id}
                  variant="surface"
                  style={[
                    styles.milestoneItemCard,
                    isUnlocked && styles.milestoneItemUnlocked,
                  ]}
                >
                  <View style={styles.milestoneLeft}>
                    <Text style={[styles.milestoneIcon, { color: isUnlocked ? '#10B981' : THEME.colors.textMuted }]}>
                      {isUnlocked ? '✓' : '🔒'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.milestoneTitle, isUnlocked && styles.milestoneTitleUnlocked]}>
                        {ms.title}
                      </Text>
                      <Caption color={THEME.colors.textMuted} style={styles.milestoneDesc}>
                        {ms.description}
                      </Caption>
                    </View>
                  </View>

                  <View style={styles.milestoneRight}>
                    <Badge
                      label={`+${ms.rewardXp} XP`}
                      variant={isUnlocked ? 'emerald' : 'neutral'}
                      size="sm"
                    />
                    {isUnlocked ? (
                      <Caption color="#10B981" style={styles.claimedText}>ACHIEVED</Caption>
                    ) : (
                      <Caption color={THEME.colors.textMuted} style={styles.claimedText}>
                        TARGET: {ms.threshold} kg
                      </Caption>
                    )}
                  </View>
                </Card>
              );
            })
          )}
        </View>

        {/* Personal Records Benchmark */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>VERIFIED PERSONAL RECORDS</Caption>
            <Badge label={`${prs.length} RECORDS`} variant="amber" size="sm" />
          </View>

          {prs.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Caption style={styles.emptyText}>No verified PRs yet for this movement.</Caption>
            </Card>
          ) : (
            prs.map(pr => {
              let formattedVal = `${pr.value} KG`;
              if (pr.prType === 'MAX_REPS') {
                formattedVal = `${pr.value} REPS`;
              } else if (pr.prType === 'BEST_DISTANCE') {
                formattedVal = pr.value >= 1000 ? `${(pr.value / 1000).toFixed(2)} KM` : `${pr.value} M`;
              } else if (pr.prType === 'BEST_PACE') {
                const mins = Math.floor(pr.value / 60);
                const secs = Math.round(pr.value % 60);
                formattedVal = `${mins}:${secs.toString().padStart(2, '0')} /KM`;
              }

              return (
                <Card key={pr.id} variant="surface" style={styles.prCard}>
                  <View style={styles.prRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="trophy" size={16} color="#FFB800" />
                      <Text style={styles.prType}>{pr.prType.replace('MAX_', '').replace('BEST_', '')}</Text>
                    </View>
                    <StatText size="md" color={THEME.colors.amber}>
                      {formattedVal}
                    </StatText>
                  </View>
                  <Caption color={THEME.colors.textMuted}>
                    {new Date(pr.achievedAt).toLocaleDateString()}
                  </Caption>
                </Card>
              );
            })
          )}
        </View>

        {/* Recent Workout History for this Exercise */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>RECENT PERFORMANCE HISTORY</Caption>
          {recentSets.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Caption style={styles.emptyText}>No historical logs recorded for this exercise yet.</Caption>
            </Card>
          ) : (
            recentSets.map((s, idx) => (
              <Card key={s.id || idx} variant="surface" style={styles.historySetCard}>
                <View style={styles.historySetRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.historySetNumber}>Set {s.setNumber}:</Text>
                      <MonoText color={THEME.colors.textPrimary} style={styles.historySetWeight}>
                        {s.weightKg} kg × {s.reps} reps
                      </MonoText>
                      {s.isPr && (
                        <Badge label="PR" variant="amber" size="sm" />
                      )}
                    </View>
                    <Caption color={THEME.colors.textMuted} style={{ marginTop: 2 }}>
                      {new Date(s.completedAt).toLocaleDateString()} • {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Caption>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.historySet1Rm}>e1RM: {s.estimated1RmKg} kg</Text>
                    <Caption color={THEME.colors.cyan}>
                      Vol: {Math.round(s.weightKg * s.reps)} kg
                    </Caption>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Tactical Execution Protocol */}
        {exercise.instructions && (
          <View style={styles.instructionsSection}>
            <Caption upper style={styles.sectionHeader}>TACTICAL EXECUTION PROTOCOL</Caption>
            <Card variant="surface">
              <Text color={THEME.colors.textSecondary} style={styles.instructionsText}>
                {exercise.instructions}
              </Text>
            </Card>
          </View>
        )}
      </ScrollView>

      <FitnessComparisonModal
        visible={comparisonModalVisible}
        initialExerciseId={exerciseId}
        userId={userId}
        userBodyweightKg={profile?.weightKg || 75}
        onClose={() => setComparisonModalVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  backBtn: {
    marginBottom: THEME.spacing.sm,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  titleSection: {
    marginBottom: THEME.spacing.md,
  },
  exerciseName: {
    marginBottom: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  levelCard: {
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
  },
  levelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  levelLabel: {
    letterSpacing: 1,
  },
  levelNumber: {
    marginVertical: 2,
  },
  rankTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  rankTagText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  xpCircle: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  totalXpVal: {
    fontSize: 18,
    fontWeight: '900',
  },
  totalXpLabel: {
    fontSize: 9,
  },
  section: {
    marginTop: THEME.spacing.md,
  },
  sectionHeader: {
    letterSpacing: 1.5,
    marginBottom: THEME.spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: THEME.spacing.xs,
  },
  statBox: {
    width: '48.5%',
    padding: 12,
  },
  statLabel: {
    marginBottom: 4,
  },
  trendRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: THEME.spacing.xs,
  },
  emptyText: {
    fontStyle: 'italic',
  },
  milestoneItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  milestoneItemUnlocked: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  milestoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  milestoneIcon: {
    fontSize: 16,
    fontWeight: '900',
  },
  milestoneTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  milestoneTitleUnlocked: {
    color: THEME.colors.textPrimary,
  },
  milestoneDesc: {
    fontSize: 10,
    marginTop: 2,
  },
  milestoneRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  claimedText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prCard: {
    marginBottom: THEME.spacing.xs,
    padding: 12,
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prType: {
    fontWeight: '700',
    fontSize: 13,
  },
  historySetCard: {
    marginBottom: 6,
    padding: 10,
  },
  historySetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historySetNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  historySetWeight: {
    fontSize: 13,
    fontWeight: '800',
  },
  historySet1Rm: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  instructionsSection: {
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xl,
  },
  instructionsText: {
    lineHeight: 20,
    fontSize: 13,
  },
});
