import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Text as RNText,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { WorkoutRepository } from '../../database/repositories/WorkoutRepository';
import { TemplateRepository } from '../../database/repositories/TemplateRepository';
import { WorkoutTemplate } from '../../types/domain.types';
import { XpEngine } from '../../services/progression/XpEngine';
import { FitnessProgressionService } from '../../services/progression/FitnessProgressionService';
import { useStepStore } from '../../store/useStepStore';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { Character2D } from '../../components/avatar/Character2D';
import { MuscleBottomSheet } from '../../components/avatar/MuscleBottomSheet';
import { BodyRegionId } from '../../components/avatar/types';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Card } from '../../components/ui/Card';
import { PrimaryButton } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Heading, Text, Caption, MonoText } from '../../components/ui/Typography';
import { SocialHubModal } from '../../components/social/SocialHubModal';
import { TitlesModal } from '../../components/titles/TitlesModal';
import { AvatarCustomizationModal } from '../../components/avatar/AvatarCustomizationModal';
import { DeviceActivityModal } from '../../components/health/DeviceActivityModal';

export default function HomeScreen() {
  const router = useRouter();
  const { colors, borderRadius, isDark } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const updateAvatarConfig = useAuthStore((s) => s.updateAvatarConfig);
  const { isActive, activeWorkout, elapsedSeconds, startWorkout } = useWorkoutStore();

  const [refreshing, setRefreshing] = useState(false);
  const [socialHubVisible, setSocialHubVisible] = useState(false);
  const [titlesModalVisible, setTitlesModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<BodyRegionId | null>(null);
  const [muscleSheetVisible, setMuscleSheetVisible] = useState(false);
  const [deviceActivityVisible, setDeviceActivityVisible] = useState(false);

  // Step counter state from useStepStore
  const {
    todaySteps,
    stepGoal,
    progressPercent: stepProgressPercent,
    initialize: initializeStepCounter,
    refreshSteps,
  } = useStepStore();

  // Compact metrics state
  const [totalPrs, setTotalPrs] = useState(0);
  const [recommendedTemplate, setRecommendedTemplate] = useState<WorkoutTemplate | null>(null);
  const [verifiedSessionsCount, setVerifiedSessionsCount] = useState(0);

  const loadDashboardData = useCallback(async () => {
    if (!profile?.id) return;
    const userId = profile.id;

    try {
      const [stats, prs, templates] = await Promise.all([
        WorkoutRepository.getLifetimeStats(userId),
        WorkoutRepository.getTotalPrCount(userId),
        TemplateRepository.getUserTemplates(userId).catch(() => []),
      ]);

      setVerifiedSessionsCount(stats?.totalWorkouts || 0);
      setTotalPrs(prs || 0);
      if (templates && templates.length > 0) {
        setRecommendedTemplate(templates[0]);
      }
    } catch (err) {
      console.error('Failed to load home dashboard telemetry:', err);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, isActive]);

  useEffect(() => {
    if (profile?.id) {
      initializeStepCounter(profile.id);
    }
  }, [profile?.id, initializeStepCounter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboardData(), refreshSteps()]);
    setRefreshing(false);
  };

  // Progression calculation
  const totalXp = profile?.totalXp || 0;
  const levelInfo = XpEngine.getLevelInfo(totalXp);
  const unifiedStatus = FitnessProgressionService.evaluateUnifiedProgression({
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
    verifiedSessionsCount,
    athleteBodyweightKg: profile?.weightKg || 75,
  });

  const rank = {
    tier: unifiedStatus.effectiveRank.tier,
    division: unifiedStatus.rankDivision,
    definition: unifiedStatus.effectiveRank,
  };

  // Format active workout timer
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedDuration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // User identity
  const displayName = profile?.displayName || profile?.username || 'Operative';
  const currentStreak = profile?.currentStreak || 0;

  // Workout mission meta
  const rawGoal = profile?.primaryGoal || profile?.primary_goal || profile?.goal || 'GET_STRONGER';
  const goalTitles: Record<string, string> = {
    GET_STRONGER: 'Heavy Strength Protocol',
    BUILD_MUSCLE: 'Hypertrophy Protocol Alpha',
    ATHLETIC_PERFORMANCE: 'Tactical Power Protocol',
    ENDURANCE: 'Conditioning Protocol',
    CALISTHENICS: 'Bodyweight Mastery',
    LOSE_FAT: 'Metabolic Conditioning',
    SPORT_PERFORMANCE: 'Athletic Agility Protocol',
    GENERAL_FITNESS: 'Foundational Conditioning',
    CUSTOM: 'Custom Protocol',
  };

  const goalDescriptions: Record<string, string> = {
    GET_STRONGER: 'Raw Strength & Progressive Overload',
    BUILD_MUSCLE: 'Hypertrophy & Neuromuscular Density',
    ATHLETIC_PERFORMANCE: 'Explosive Power & Speed',
    ENDURANCE: 'Aerobic & Muscular Stamina',
    CALISTHENICS: 'Relative Strength & Body Control',
    LOSE_FAT: 'Metabolic Output & Conditioning',
    SPORT_PERFORMANCE: 'Multi-planar Athletic Agility',
    GENERAL_FITNESS: 'Total Athletic Conditioning',
    CUSTOM: 'Personalized Athletic Programming',
  };

  const defaultMissionTitle = goalTitles[rawGoal] || 'Daily Kinetic Protocol';
  const missionTitle = isActive
    ? activeWorkout?.name || 'Strength Session'
    : recommendedTemplate?.name || defaultMissionTitle;

  const missionGoal = goalDescriptions[rawGoal] || 'Targeted Physical Conditioning';
  const missionDuration = recommendedTemplate?.estimatedDurationMin || profile?.trainingPreferences?.sessionDurationMinutes || 45;
  const missionExerciseCount = isActive
    ? activeWorkout?.exercises.length || 0
    : recommendedTemplate
    ? recommendedTemplate.exercises.length
    : 5;

  const handleStartWorkout = async () => {
    if (!isActive) {
      const title = recommendedTemplate?.name || defaultMissionTitle;
      await startWorkout(title, recommendedTemplate?.id);
    }
    router.push('/modals/active-workout' as any);
  };

  const handleSelectRegion = (regionId: BodyRegionId) => {
    setSelectedRegion(regionId);
    setMuscleSheetVisible(true);
  };

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
      {/* ========================================================================= */}
      {/* SECTION 1 — HEADER (Compact Identity & XP Progress)                       */}
      {/* ========================================================================= */}
      <View style={styles.headerSection}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerIdentityCol}>
            {/* Username + Rank Badge */}
            <View style={styles.usernameRow}>
              <Heading level={2} style={styles.usernameText} numberOfLines={1}>
                {displayName}
              </Heading>

              <View
                style={[
                  styles.rankBadge,
                  {
                    backgroundColor: isDark
                      ? `${rank.definition.color}22`
                      : `${rank.definition.color}18`,
                    borderColor: `${rank.definition.color}55`,
                  },
                ]}
              >
                <RNText style={[styles.rankBadgeText, { color: rank.definition.color }]}>
                  RANK {rank.tier}
                </RNText>
              </View>

              {profile?.activeTitle && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setTitlesModalVisible(true)}
                  style={[
                    styles.titlePill,
                    {
                      backgroundColor: isDark ? '#221B33' : '#EDE9FE',
                      borderColor: isDark ? '#3D2F5C' : '#DDD6FE',
                    },
                  ]}
                  accessibilityLabel="Active Title"
                >
                  <Ionicons
                    name="ribbon-outline"
                    size={10}
                    color={isDark ? '#A78BFA' : '#6D28D9'}
                    style={{ marginRight: 3 }}
                  />
                  <RNText
                    style={[
                      styles.titlePillText,
                      { color: isDark ? '#A78BFA' : '#6D28D9' },
                    ]}
                    numberOfLines={1}
                  >
                    {profile.activeTitle}
                  </RNText>
                </TouchableOpacity>
              )}
            </View>

            {/* Level + XP Progress Numbers */}
            <View style={styles.levelRow}>
              <RNText style={[styles.levelLabel, { color: colors.textPrimary }]}>
                Level {levelInfo.level}
              </RNText>
              <RNText style={[styles.bulletDivider, { color: colors.textMuted }]}>•</RNText>
              <RNText style={[styles.xpText, { color: colors.textSecondary }]}>
                {levelInfo.currentLevelXp.toLocaleString()} / {levelInfo.xpRequiredForNextLevel.toLocaleString()} XP
              </RNText>
            </View>
          </View>

          {/* Quick Header Navigation Actions */}
          <View style={styles.headerActions}>
            <IconButton
              icon={
                <Ionicons
                  name="notifications-outline"
                  size={19}
                  color={colors.textPrimary}
                />
              }
              onPress={() => setSocialHubVisible(true)}
              size="sm"
              accessibilityLabel="Notifications"
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/profile' as any)}
              style={[
                styles.profileAvatarButton,
                {
                  borderColor: rank.definition.color,
                  backgroundColor: isDark ? colors.surfaceElevated : '#FFFFFF',
                },
              ]}
              accessibilityLabel="View Profile"
            >
              <Ionicons name="person" size={15} color={rank.definition.color} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Compact Linear XP Progress Bar */}
        <View style={styles.xpProgressWrapper}>
          <ProgressBar
            progressPercent={levelInfo.progressPercent}
            size="sm"
            color={rank.definition.color}
          />
        </View>
      </View>

      {/* ========================================================================= */}
      {/* SECTION 2 — CHARACTER (Visual Centerpiece with Front/Back Toggle & Swipe)  */}
      {/* ========================================================================= */}
      <View style={styles.characterSection}>
        <Character2D
          height={320}
          onSelectRegion={handleSelectRegion}
          selectedRegion={selectedRegion}
          rankTier={rank.tier}
          globalLevel={levelInfo.level}
          onOpenCustomizer={() => setAvatarModalVisible(true)}
          showControls={true}
          interactiveHotspots={true}
        />
      </View>

      {/* ========================================================================= */}
      {/* SECTION 3 — TODAY'S MISSION (Primary Workout Card & Strongest CTA)        */}
      {/* ========================================================================= */}
      <View style={styles.missionSection}>
        <Card
          variant="surface"
          style={[
            styles.missionCard,
            isActive && {
              borderColor: colors.emerald,
              borderWidth: 1.5,
            },
          ]}
        >
          {/* Status Badge + Duration Chip Row */}
          <View style={styles.missionHeaderRow}>
            <View style={styles.missionStatusGroup}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isActive ? colors.emerald : colors.accent },
                ]}
              />
              <Caption
                upper
                style={[
                  styles.statusTagText,
                  { color: isActive ? colors.emerald : colors.accent },
                ]}
              >
                {isActive ? 'SESSION IN PROGRESS' : "TODAY'S MISSION"}
              </Caption>
            </View>

            <View
              style={[
                styles.durationChip,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : '#F1F3F5',
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={12}
                color={colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <MonoText style={[styles.durationChipText, { color: colors.textPrimary }]}>
                {isActive ? formattedDuration : `${missionDuration} MIN`}
              </MonoText>
            </View>
          </View>

          {/* Workout Name */}
          <Heading level={2} style={styles.missionTitle} numberOfLines={1}>
            {missionTitle}
          </Heading>

          {/* Goal & Exercise Count Metadata */}
          <View style={styles.missionMetaRow}>
            <View style={styles.metaItem}>
              <Ionicons
                name="fitness-outline"
                size={13}
                color={colors.textSecondary}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {missionGoal}
              </Text>
            </View>
            <RNText style={[styles.metaDot, { color: colors.textMuted }]}>•</RNText>
            <View style={styles.metaItem}>
              <Ionicons
                name="barbell-outline"
                size={13}
                color={colors.textSecondary}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {missionExerciseCount} Exercises
              </Text>
            </View>
          </View>

          {/* Primary Action Button — The Strongest CTA on Screen */}
          <View style={styles.ctaWrapper}>
            <PrimaryButton
              title={isActive ? 'RESUME WORKOUT' : 'START WORKOUT'}
              size="lg"
              icon={
                <Ionicons
                  name={isActive ? 'play' : 'flash'}
                  size={18}
                  color={colors.primaryButtonText}
                />
              }
              onPress={handleStartWorkout}
            />
          </View>
        </Card>
      </View>

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* SECTION 4 — COMPACT PROGRESS & STEPS (Compact Progress Bar • Streak • PRs) */}
      {/* ========================================================================= */}
      <View style={styles.progressStripSection}>
        {/* Compact Steps Card */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setDeviceActivityVisible(true)}
        >
          <Card variant="surface" style={styles.stepsCard}>
            <View style={styles.stepsTopRow}>
              <View style={styles.stepsHeaderLeft}>
                <Ionicons name="footsteps" size={14} color={colors.cyan} style={{ marginRight: 6 }} />
                <Caption upper style={[styles.stepsTitle, { color: colors.textMuted }]}>
                  STEPS
                </Caption>
              </View>
              <RNText style={[styles.stepsValueText, { color: colors.textPrimary }]}>
                {todaySteps.toLocaleString()}{' '}
                <RNText style={[styles.stepsGoalSubText, { color: colors.textSecondary }]}>
                  / {stepGoal.toLocaleString()}
                </RNText>
              </RNText>
            </View>
            <View style={{ marginTop: 8 }}>
              <ProgressBar
                progressPercent={stepProgressPercent}
                size="sm"
                color={colors.cyan}
              />
            </View>
          </Card>
        </TouchableOpacity>

        {/* Compact Streak & PRs Strip */}
        <Card variant="surface" style={[styles.progressStripCard, { marginTop: 8 }]}>
          {/* 1. Streak */}
          <View style={styles.progressCol}>
            <View style={styles.progressColHeader}>
              <Ionicons name="flame" size={14} color={colors.amber} style={{ marginRight: 4 }} />
              <Caption upper style={[styles.progressColLabel, { color: colors.textMuted }]}>
                Streak
              </Caption>
            </View>
            <View style={styles.progressValueRow}>
              <Heading level={2} style={styles.progressValueText}>
                {currentStreak}
              </Heading>
              <Caption style={[styles.progressUnitText, { color: colors.textSecondary }]}>
                {currentStreak === 1 ? 'day' : 'days'}
              </Caption>
            </View>
          </View>

          <View style={[styles.stripDivider, { backgroundColor: colors.border }]} />

          {/* 2. PRs */}
          <View style={styles.progressCol}>
            <View style={styles.progressColHeader}>
              <Ionicons name="trophy" size={14} color={colors.accent} style={{ marginRight: 4 }} />
              <Caption upper style={[styles.progressColLabel, { color: colors.textMuted }]}>
                PRs
              </Caption>
            </View>
            <View style={styles.progressValueRow}>
              <Heading level={2} style={styles.progressValueText}>
                {totalPrs}
              </Heading>
              <Caption style={[styles.progressUnitText, { color: colors.textSecondary }]}>
                {totalPrs === 1 ? 'record' : 'records'}
              </Caption>
            </View>
          </View>
        </Card>
      </View>

      {/* ========================================================================= */}
      {/* MODALS (Dedicated detailed inspection on demand)                          */}
      {/* ========================================================================= */}
      <MuscleBottomSheet
        visible={muscleSheetVisible}
        regionId={selectedRegion}
        userId={profile?.id || ''}
        onClose={() => setMuscleSheetVisible(false)}
      />

      <SocialHubModal
        visible={socialHubVisible}
        onClose={() => setSocialHubVisible(false)}
      />

      <TitlesModal
        visible={titlesModalVisible}
        userId={profile?.id || ''}
        onClose={() => setTitlesModalVisible(false)}
        onTitleChanged={() => {
          useAuthStore.getState().loadProfile();
        }}
      />

      <AvatarCustomizationModal
        visible={avatarModalVisible}
        onClose={() => setAvatarModalVisible(false)}
        initialConfig={profile?.avatarConfig}
        heightCm={profile?.heightCm || 175}
        weightKg={profile?.weightKg || 75}
        experience={profile?.experience || 'INTERMEDIATE'}
        goal={profile?.goal || 'GET_STRONGER'}
        onSave={async (config) => {
          await updateAvatarConfig(config);
        }}
      />

      <DeviceActivityModal
        visible={deviceActivityVisible}
        onClose={() => setDeviceActivityVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },

  /* ------------------------------------------------------------------------- */
  /* SECTION 1 — HEADER                                                        */
  /* ------------------------------------------------------------------------- */
  headerSection: {
    marginBottom: 14,
    paddingTop: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIdentityCol: {
    flex: 1,
    marginRight: 12,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 3,
  },
  usernameText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  rankBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  titlePillText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  bulletDivider: {
    fontSize: 12,
  },
  xpText: {
    fontSize: 11,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileAvatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpProgressWrapper: {
    marginTop: 2,
  },

  /* ------------------------------------------------------------------------- */
  /* SECTION 2 — CHARACTER                                                     */
  /* ------------------------------------------------------------------------- */
  characterSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },

  /* ------------------------------------------------------------------------- */
  /* SECTION 3 — TODAY'S MISSION                                               */
  /* ------------------------------------------------------------------------- */
  missionSection: {
    marginVertical: 10,
  },
  missionCard: {
    padding: 16,
    borderRadius: 18,
  },
  missionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  missionStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  durationChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  missionTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  missionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 12,
  },
  ctaWrapper: {
    width: '100%',
  },

  /* ------------------------------------------------------------------------- */
  /* SECTION 4 — COMPACT PROGRESS STRIP                                        */
  /* ------------------------------------------------------------------------- */
  progressStripSection: {
    marginTop: 4,
    marginBottom: 12,
  },
  progressStripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  progressCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  progressColLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  progressValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  progressValueText: {
    fontSize: 18,
    fontWeight: '800',
  },
  progressUnitText: {
    fontSize: 10,
    fontWeight: '600',
  },
  stripDivider: {
    width: 1,
    height: 28,
    opacity: 0.7,
  },
  stepsCard: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  stepsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stepsValueText: {
    fontSize: 16,
    fontWeight: '800',
  },
  stepsGoalSubText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
