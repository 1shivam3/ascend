import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { WorkoutRepository } from '../../database/repositories/WorkoutRepository';
import { MasteryRepository } from '../../database/repositories/MasteryRepository';
import { MilestoneRepository } from '../../database/repositories/MilestoneRepository';
import { QuestRepository } from '../../database/repositories/QuestRepository';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { WorkoutSession, ExerciseMastery, Exercise, ExerciseMilestone } from '../../types/domain.types';
import { UserQuestProgress } from '../../types/quest.types';
import { MasteryEngine } from '../../services/progression/MasteryEngine';
import { PROGRESSION_CONFIG } from '../../config/progression.config';
import { LevelOrb } from '../../components/hud/LevelOrb';
import { WeeklyTracker } from '../../components/hud/WeeklyTracker';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { Heading, Text, Caption, StatText, MonoText } from '../../components/ui/Typography';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { getMasteryTierForLevel } from '../../constants/ranks';
import { SocialHubModal } from '../../components/social/SocialHubModal';

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore(s => s.profile);
  const { isActive, activeWorkout, elapsedSeconds, startWorkout } = useWorkoutStore();

  const [refreshing, setRefreshing] = useState(false);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSession[]>([]);
  const [weeklyCompletedDays, setWeeklyCompletedDays] = useState<number[]>([]);
  const [topMasteries, setTopMasteries] = useState<ExerciseMastery[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});
  const [todaysQuest, setTodaysQuest] = useState<UserQuestProgress | null>(null);
  const [socialHubVisible, setSocialHubVisible] = useState(false);
  const [closestMilestone, setClosestMilestone] = useState<{
    milestone: ExerciseMilestone;
    exerciseName: string;
    currentMetricValue: number;
    remaining: number;
    progressPercent: number;
  } | null>(null);

  const loadDashboardData = useCallback(async () => {
    if (!profile?.id) return;
    const userId = profile.id;
    const userLevel = profile.globalLevel || 1;

    try {
      const [workouts, weekDays, masteries, quests, allExercises, closest] = await Promise.all([
        WorkoutRepository.getRecentWorkouts(userId, 4),
        WorkoutRepository.getWeeklyWorkoutDays(userId),
        MasteryRepository.getTopMasteries(userId, 3),
        QuestRepository.getQuestsWithState(userId, userLevel),
        ExerciseRepository.getAll(),
        MilestoneRepository.getClosestMilestone(userId),
      ]);

      setRecentWorkouts(workouts);
      setWeeklyCompletedDays(weekDays);
      setTopMasteries(masteries);
      setClosestMilestone(closest);

      // Create lookup map for exercise names
      const exMap: Record<string, Exercise> = {};
      allExercises.forEach(ex => {
        exMap[ex.id] = ex;
      });
      setExerciseMap(exMap);

      // Select top Daily quest for Today's Quest display
      const dailyQuests = quests.filter(q => q.quest?.type === 'DAILY');
      const activeDaily = dailyQuests.find(q => q.state === 'IN_PROGRESS') ||
        dailyQuests.find(q => q.state === 'AVAILABLE') ||
        dailyQuests[0] || null;
      setTodaysQuest(activeDaily);
    } catch (err) {
      console.error('Failed to load dashboard telemetry:', err);
    }
  }, [profile?.id, profile?.globalLevel]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, isActive]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleStartWorkout = async () => {
    if (!isActive) {
      const rawGoal = profile?.primaryGoal || profile?.primary_goal || profile?.goal || 'GET_STRONGER';
      const goalTitles: Record<string, string> = {
        GET_STRONGER: 'Heavy Strength Protocol',
        BUILD_MUSCLE: 'Hypertrophy Protocol Alpha',
        ATHLETIC_PERFORMANCE: 'Tactical Power & Speed Protocol',
        ENDURANCE: 'Endurance Conditioning Protocol',
        CALISTHENICS: 'Bodyweight Mastery Protocol',
        LOSE_FAT: 'Metabolic Conditioning Protocol',
        SPORT_PERFORMANCE: 'Athletic Agility Protocol',
        GENERAL_FITNESS: 'Total Conditioning Protocol',
        CUSTOM: 'Custom Operative Protocol',
      };
      const sessionTitle = goalTitles[rawGoal] || `${String(rawGoal).replace(/_/g, ' ')} Protocol`;
      await startWorkout(sessionTitle);
    }
    router.push('/modals/active-workout' as any);
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedDuration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const targetDays = profile?.trainingPreferences?.daysPerWeek || 4;

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
        {/* Top Operative HUD Header */}
        <View style={styles.header}>
          <View>
            <Heading level={1} color={THEME.colors.cyan} style={styles.appTitle}>
              ASCEND
            </Heading>
            <Caption style={styles.greeting}>
              OPERATOR: {profile?.displayName?.toUpperCase() || 'VANGUARD'}
            </Caption>
          </View>

          {/* Streak Flame Pill */}
          <View style={styles.streakBadge}>
            <Text style={styles.streakFlame}>🔥</Text>
            <StatText size="md" color={THEME.colors.amber} style={styles.streakText}>
              {profile?.currentStreak || 0} D
            </StatText>
          </View>
        </View>

        {/* 3-SECOND ACTIONABLE NEXT STEP */}
        {isActive ? (
          /* Active Workout Resume Card */
          <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.activeBanner}>
            <TouchableOpacity
              onPress={() => router.push('/modals/active-workout' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.activeBannerContent}>
                <View style={styles.activeBannerLeft}>
                  <View style={styles.pulseDot} />
                  <View>
                    <Heading level={3} style={styles.activeBannerTitle}>
                      TRAINING SESSION ACTIVE
                    </Heading>
                    <Caption color={THEME.colors.cyan}>
                      {formattedDuration} • {activeWorkout?.exercises.length || 0} Movements Loaded
                    </Caption>
                  </View>
                </View>
                <Badge label="RESUME" variant="cyan" size="sm" />
              </View>
            </TouchableOpacity>
          </Card>
        ) : (
          /* Deploy Today's Protocol CTA Card */
          <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.directiveCard}>
            <View style={styles.directiveTopRow}>
              <Badge label="TODAY'S WORKOUT" variant="cyan" size="sm" dot />
              <Caption color={THEME.colors.textMuted}>
                {profile?.trainingPreferences?.sessionDurationMinutes || 60} MIN PROTOCOL
              </Caption>
            </View>
            <Heading level={2} style={styles.protocolTitle}>
              {profile?.goal === 'HYPERTROPHY' ? 'HYPERTROPHY ACCELERATOR' : 'TACTICAL STRENGTH DEPLOYMENT'}
            </Heading>
            <Text color={THEME.colors.textSecondary} style={styles.protocolDesc}>
              High-tension compound overload session calibrated to advance global Rank and prime neuromuscular adaptations.
            </Text>
            <Button
              title="DEPLOY PROTOCOL →"
              size="lg"
              onPress={handleStartWorkout}
              style={styles.deployBtn}
            />
          </Card>
        )}

        {/* Character Progression Orb Widget */}
        <View style={styles.section}>
          <LevelOrb totalXp={profile?.totalXp || 0} />
        </View>

        {/* Weekly Completion Tracker */}
        <View style={styles.section}>
          <WeeklyTracker
            completedDays={weeklyCompletedDays}
            targetDays={targetDays}
            title="WEEKLY DEPLOYMENT CYCLES"
          />
        </View>

        {/* Tactical Squad & Social Feed Quick Access */}
        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setSocialHubVisible(true)}
          >
            <Card variant="surface" accentBorder={THEME.colors.cyan} style={styles.squadBannerCard}>
              <View style={styles.squadBannerRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Heading level={3} style={{ fontSize: 14 }}>🤝 TACTICAL SQUAD & FEED</Heading>
                    <Badge label="COMMUNITY" variant="cyan" size="sm" />
                  </View>
                  <Caption color={THEME.colors.textSecondary}>
                    Track squad breakthroughs, applaud PRs, and recruit operatives.
                  </Caption>
                </View>
                <Badge label="OPEN FEED →" variant="neutral" size="sm" />
              </View>
            </Card>
          </TouchableOpacity>
        </View>

        {/* Today's Quest Directive */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>TODAY'S DIRECTIVE</Caption>
            <TouchableOpacity onPress={() => router.push('/quests' as any)}>
              <Caption color={THEME.colors.cyan} style={styles.viewAllText}>VIEW DIRECTIVES →</Caption>
            </TouchableOpacity>
          </View>

          {todaysQuest ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/quests' as any)}
            >
              <Card
                variant="surface"
                accentBorder={todaysQuest.completed ? THEME.colors.emerald : THEME.colors.border}
                style={styles.questCard}
              >
                <View style={styles.questTopRow}>
                  <View style={styles.questTitleRow}>
                    <Heading level={3} style={styles.questTitle}>
                      {todaysQuest.quest?.title}
                    </Heading>
                    <Badge
                      label={todaysQuest.state || (todaysQuest.completed ? 'COMPLETED' : 'AVAILABLE')}
                      variant={todaysQuest.completed ? 'emerald' : todaysQuest.state === 'IN_PROGRESS' ? 'amber' : 'cyan'}
                      size="sm"
                    />
                  </View>
                  <Badge
                    label={`+${todaysQuest.quest?.xpReward} XP`}
                    variant={todaysQuest.quest?.badgeVariant || 'cyan'}
                    size="sm"
                  />
                </View>
                <Text color={THEME.colors.textSecondary} style={styles.questDesc}>
                  {todaysQuest.quest?.description}
                </Text>
                <ProgressBar
                  progressPercent={Math.min(100, Math.round((todaysQuest.currentProgress / todaysQuest.targetValue) * 100))}
                  size="sm"
                  label={`${todaysQuest.currentProgress.toLocaleString()} / ${todaysQuest.targetValue.toLocaleString()} ${todaysQuest.quest?.unit}`}
                  showPercent
                  color={todaysQuest.completed ? THEME.colors.emerald : THEME.colors.cyan}
                />
              </Card>
            </TouchableOpacity>
          ) : (
            <Card variant="surface" style={styles.emptySmallCard}>
              <Caption align="center">All daily directives synchronized and accomplished.</Caption>
            </Card>
          )}
        </View>

        {/* Closest Milestone Banner */}
        {closestMilestone && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Caption upper style={styles.sectionHeader}>NEXT LIFT MILESTONE</Caption>
              <Badge label={`+${closestMilestone.milestone.rewardXp} XP`} variant="amber" size="sm" />
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/progress/${closestMilestone.milestone.exerciseId}` as any)}
            >
              <Card variant="glass" accentBorder={THEME.colors.amber} style={styles.milestoneBannerCard}>
                <View style={styles.milestoneBannerTop}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Heading level={3} style={styles.milestoneExerciseName}>
                      {closestMilestone.exerciseName.toUpperCase()}
                    </Heading>
                    <Text style={styles.milestoneGoalText}>
                      {closestMilestone.milestone.title}
                    </Text>
                  </View>
                  <View style={styles.milestoneRemainingPill}>
                    <Text style={styles.milestoneRemainingText}>
                      {closestMilestone.remaining} kg AWAY
                    </Text>
                  </View>
                </View>

                <View style={styles.milestoneProgressContainer}>
                  <ProgressBar
                    progressPercent={closestMilestone.progressPercent}
                    color={THEME.colors.amber}
                    size="sm"
                    label={`${closestMilestone.currentMetricValue} KG / ${closestMilestone.milestone.threshold} KG (${closestMilestone.progressPercent}%)`}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          </View>
        )}

        {/* Your Strongest Lifts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>YOUR STRONGEST LIFTS</Caption>
            <TouchableOpacity onPress={() => router.push('/progress' as any)}>
              <Caption color={THEME.colors.cyan} style={styles.viewAllText}>ALL MOVEMENTS →</Caption>
            </TouchableOpacity>
          </View>

          {topMasteries.length === 0 ? (
            <Card variant="surface" style={styles.emptyMasteryCard}>
              <Caption align="center" style={styles.emptyMasteryText}>
                No movement masteries initiated yet. Complete training protocols to record sets and unlock lift progression.
              </Caption>
            </Card>
          ) : (
            topMasteries.map(m => {
              const ex = exerciseMap[m.exerciseId];
              const name = ex?.name || 'Movement Telemetry';
              const progress = MasteryEngine.getExerciseProgress(m.masteryXp || 0);
              const rankColor = PROGRESSION_CONFIG.mastery.exerciseRanks[progress.rank]?.color || THEME.colors.cyan;

              return (
                <TouchableOpacity
                  key={m.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/progress/${m.exerciseId}` as any)}
                >
                  <Card variant="surface" style={styles.masteryHighlightCard}>
                    <View style={styles.masteryTopRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Heading level={3} style={styles.masteryName}>{name}</Heading>
                        <Caption color={THEME.colors.textMuted}>
                          EST. 1RM: <Text color={THEME.colors.cyan}>{m.estimated1RmKg} kg</Text>
                          {m.relativeStrength ? ` • ${m.relativeStrength}x BW` : ''} • SESSIONS: {m.totalSessions}
                        </Caption>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <View style={[styles.masteryPill, { borderColor: rankColor, backgroundColor: `${rankColor}15` }]}>
                          <Text style={[styles.masteryLvlText, { color: rankColor }]}>
                            RANK {progress.rank}
                          </Text>
                        </View>
                        <View style={[styles.masteryPill, { borderColor: THEME.colors.border }]}>
                          <Text style={[styles.masteryLvlText, { color: '#FFF' }]}>
                            LVL {progress.level}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Recent Missions Log */}
        <View style={styles.recentSection}>
          <Caption upper style={styles.sectionHeader}>RECENT MISSIONS</Caption>
          {recentWorkouts.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Heading level={3} align="center" style={styles.emptyText}>
                No recent sessions recorded
              </Heading>
              <Caption align="center" style={styles.emptySubtext}>
                Initiate a training protocol to record telemetry and mint character progression.
              </Caption>
            </Card>
          ) : (
            recentWorkouts.map(w => (
              <Card key={w.id} variant="surface" style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Heading level={3} style={styles.historyTitle}>{w.title}</Heading>
                  <Text color={THEME.colors.emerald} style={styles.historyXp}>
                    +{w.xpEarned} XP
                  </Text>
                </View>
                <View style={styles.historyMetaRow}>
                  <Caption>
                    {w.completedAt ? new Date(w.completedAt).toLocaleDateString() : 'Today'}
                  </Caption>
                  <Caption>
                    {Math.round(w.totalVolumeKg).toLocaleString()} kg • {w.totalSets} Sets • {Math.round(w.durationSeconds / 60)} min
                  </Caption>
                </View>
              </Card>
            ))
          )}
        </View>
        {/* Social Hub Modal */}
        <SocialHubModal
          visible={socialHubVisible}
          onClose={() => setSocialHubVisible(false)}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
    marginTop: THEME.spacing.xs,
  },
  appTitle: {
    letterSpacing: 2,
  },
  greeting: {
    letterSpacing: 0.8,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  streakFlame: {
    fontSize: 14,
    marginRight: 6,
  },
  streakText: {
    fontSize: 14,
  },
  activeBanner: {
    marginBottom: THEME.spacing.md,
  },
  activeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.cyan,
  },
  activeBannerTitle: {
    letterSpacing: 0.8,
  },
  directiveCard: {
    marginBottom: THEME.spacing.md,
    padding: THEME.spacing.md,
  },
  directiveTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  protocolTitle: {
    letterSpacing: 0.5,
    marginBottom: 4,
    fontSize: 18,
  },
  protocolDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  deployBtn: {
    marginTop: 4,
  },
  section: {
    marginBottom: THEME.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  sectionHeader: {
    letterSpacing: 1.5,
  },
  viewAllText: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1,
  },
  questCard: {
    padding: THEME.spacing.md,
  },
  questTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  questTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  questTitle: {
    fontSize: 14,
  },
  questDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  emptySmallCard: {
    padding: 16,
  },
  emptyMasteryCard: {
    padding: 20,
  },
  emptyMasteryText: {
    lineHeight: 18,
  },
  masteryHighlightCard: {
    marginBottom: THEME.spacing.xs,
    padding: 12,
  },
  masteryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  masteryName: {
    fontSize: 14,
    marginBottom: 2,
  },
  masteryPill: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    backgroundColor: THEME.colors.surfaceElevated,
    minWidth: 64,
  },
  masteryLvlText: {
    fontSize: 12,
    fontWeight: '900',
  },
  masteryTierText: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  recentSection: {
    marginTop: THEME.spacing.xs,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    marginBottom: 4,
  },
  emptySubtext: {
    maxWidth: 280,
  },
  historyCard: {
    marginBottom: THEME.spacing.xs,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyTitle: {
    fontSize: 14,
  },
  historyXp: {
    fontWeight: '800',
  },
  historyMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  milestoneBannerCard: {
    padding: 12,
    marginBottom: THEME.spacing.xs,
  },
  recentRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  squadBannerCard: {
    padding: 12,
  },
  squadBannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  milestoneBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  milestoneExerciseName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 1,
  },
  milestoneGoalText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  milestoneRemainingPill: {
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.4)',
  },
  milestoneRemainingText: {
    color: '#FFB800',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  milestoneProgressContainer: {
    marginTop: 4,
  },
});
