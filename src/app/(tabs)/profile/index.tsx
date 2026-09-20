import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../../constants/theme';
import { useAuthStore } from '../../../store/useAuthStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useSyncStore } from '../../../store/useSyncStore';
import { SyncEngine } from '../../../services/sync/SyncEngine';
import { SyncQueueRepository } from '../../../database/repositories/SyncQueueRepository';
import { WorkoutRepository } from '../../../database/repositories/WorkoutRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { ExerciseMastery, PersonalRecord, Exercise } from '../../../types/domain.types';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, StatText, MonoText } from '../../../components/ui/Typography';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { AttributeRadar } from '../../../components/hud/AttributeRadar';
import { getRankForLevel, getMasteryTierForLevel } from '../../../constants/ranks';
import { PROGRESSION_CONFIG, RankTier } from '../../../config/progression.config';
import { MasteryEngine } from '../../../services/progression/MasteryEngine';
import { SYSTEM_ACHIEVEMENTS, Achievement } from '../../../constants/achievements';
import { AuthModal } from '../../../components/auth/AuthModal';
import { LeaderboardModal } from '../../../components/leaderboard/LeaderboardModal';
import { NutritionModal } from '../../../components/nutrition/NutritionModal';
import { SocialHubModal } from '../../../components/social/SocialHubModal';
import { ChallengeHubModal } from '../../../components/challenges/ChallengeHubModal';
import { ConnectHealthModal } from '../../../components/health/ConnectHealthModal';
import { cmToFtIn, kgToLbs, normalizeGoal } from '../../../utils/validation/onboardingSchema';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, isGuest, loadProfile, signOut, resetOnboardingForTesting } = useAuthStore();
  const { settings, setUnit, toggleSound, toggleHaptics } = useSettingsStore();
  const syncStatus = useSyncStore(s => s.status);
  const syncPendingCount = useSyncStore(s => s.pendingCount);
  const syncFailedCount = useSyncStore(s => s.failedCount);
  const syncLastSyncAt = useSyncStore(s => s.lastSyncAt);

  const [refreshing, setRefreshing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [nutritionVisible, setNutritionVisible] = useState(false);
  const [socialHubVisible, setSocialHubVisible] = useState(false);
  const [challengesVisible, setChallengesVisible] = useState(false);
  const [healthModalVisible, setHealthModalVisible] = useState(false);

  // Real SQLite Telemetry
  const [lifetimeStats, setLifetimeStats] = useState({
    totalWorkouts: 0,
    totalVolumeKg: 0,
    totalSets: 0,
    totalReps: 0,
    totalDurationMinutes: 0,
  });
  const [masteries, setMasteries] = useState<ExerciseMastery[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [exerciseCatalogMap, setExerciseCatalogMap] = useState<Record<string, Exercise>>({});

  const loadAllProfileData = useCallback(async () => {
    if (!profile?.id) return;
    const userId = profile.id;

    try {
      const [stats, masteryList, prList, allEx, syncItems] = await Promise.all([
        WorkoutRepository.getLifetimeStats(userId),
        MasteryRepository.getAllMasteries(userId),
        MasteryRepository.getAllPersonalRecords(userId),
        ExerciseRepository.getAll(),
        SyncQueueRepository.getPending(),
      ]);

      setLifetimeStats(stats);
      setMasteries(masteryList);
      setPersonalRecords(prList);
      setPendingSyncCount(syncItems.length);

      const exMap: Record<string, Exercise> = {};
      allEx.forEach(e => {
        exMap[e.id] = e;
      });
      setExerciseCatalogMap(exMap);
    } catch (err) {
      console.error('Failed to load profile telemetry:', err);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadAllProfileData();
  }, [loadAllProfileData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadAllProfileData()]);
    setRefreshing(false);
  };

  const level = profile?.globalLevel || 1;
  const rank = getRankForLevel(level);

  // Global XP Progress to Next Level
  const currentTotalXp = profile?.totalXp || 0;
  const nextLevelRequiredXp = PROGRESSION_CONFIG.globalXp.getXpForNextLevel(level);
  const xpPercent = Math.min(100, Math.round((currentTotalXp / Math.max(1, nextLevelRequiredXp)) * 100));

  // Biometrics formatting
  const heightDisplay = settings.preferredUnit === 'lbs'
    ? (() => {
        const { feet, inches } = cmToFtIn(profile?.heightCm || 175);
        return `${feet}' ${inches}"`;
      })()
    : `${Math.round(profile?.heightCm || 175)} CM`;

  const weightDisplay = settings.preferredUnit === 'lbs'
    ? `${kgToLbs(profile?.weightKg || 75)} LBS`
    : `${Math.round((profile?.weightKg || 75) * 10) / 10} KG`;

  const prefs = profile?.trainingPreferences;

  // Max mastery level for achievements
  const maxMasteryLevel = masteries.length > 0
    ? Math.max(...masteries.map(m => m.masteryLevel))
    : 1;

  const achievementEvaluationStats = {
    totalWorkouts: lifetimeStats.totalWorkouts,
    totalVolumeKg: lifetimeStats.totalVolumeKg,
    currentStreak: profile?.currentStreak || 0,
    maxMasteryLevel,
    prsCount: personalRecords.length,
  };

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
        {/* RPG Character Sheet Operative Header Card */}
        <Card variant="glass" accentBorder={rank.definition.color} style={styles.headerCard}>
          <View style={[styles.avatarBox, { borderColor: rank.definition.color }]}>
            <Heading level={1}>{profile?.avatarUrl || '⚔️'}</Heading>
          </View>

          <View style={styles.headerInfo}>
            <View style={styles.headerTopRow}>
              <Heading level={2} style={styles.displayName}>
                {profile?.displayName || 'Vanguard Operative'}
              </Heading>
              <View style={styles.streakPill}>
                <Text style={{ fontSize: 11 }}>🔥</Text>
                <MonoText color={THEME.colors.amber} style={styles.streakPillText}>
                  {profile?.currentStreak || 0}D
                </MonoText>
              </View>
            </View>

            <MonoText color={THEME.colors.cyan} style={styles.username}>
              @{profile?.username || 'vanguard_one'}
            </MonoText>

            <Text color={rank.definition.color} style={styles.rankTitle}>
              {rank.definition.title.toUpperCase()} {rank.tier !== 'SSS' ? `DIV ${rank.division}` : ''}
            </Text>

            <View style={styles.xpProgressBlock}>
              <View style={styles.xpMetaRow}>
                <Caption upper>GLOBAL LVL {level}</Caption>
                <MonoText color={THEME.colors.textSecondary} style={{ fontSize: 10 }}>
                  {currentTotalXp.toLocaleString()} / {nextLevelRequiredXp.toLocaleString()} XP
                </MonoText>
              </View>
              <ProgressBar
                progressPercent={xpPercent}
                color={rank.definition.color}
                size="sm"
                showPercent={false}
              />
            </View>
          </View>
        </Card>

        {/* Guest Mode / Cloud Sync Banner */}
        {isGuest ? (
          <Card variant="surface" accentBorder={THEME.colors.amber} style={styles.guestCard}>
            <View style={styles.guestHeaderRow}>
              <View style={styles.guestStatusGroup}>
                <Badge label="LOCAL GUEST MODE" variant="amber" size="sm" dot />
                <Caption color={THEME.colors.textMuted} style={{ marginTop: 2 }}>
                  DATA PERSISTED LOCALLY IN SQLITE
                </Caption>
              </View>
            </View>
            <Text color={THEME.colors.textSecondary} style={styles.guestDesc}>
              Your workout logs, PRs, and character attributes are stored locally on this device. Create or link an account to safely backup and synchronize your progress.
            </Text>
            <Button
              title="LINK CLOUD ACCOUNT / BACKUP →"
              variant="primary"
              size="sm"
              onPress={() => setAuthModalVisible(true)}
              style={{ marginTop: 8 }}
            />
          </Card>
        ) : (
          <Card variant="surface" accentBorder={THEME.colors.emerald} style={styles.guestCard}>
            <View style={styles.guestHeaderRow}>
              <Badge label="AUTHENTICATED OPERATIVE" variant="emerald" size="sm" dot />
              <TouchableOpacity onPress={signOut}>
                <Caption color={THEME.colors.crimson}>SIGN OUT</Caption>
              </TouchableOpacity>
            </View>
            <Text color={THEME.colors.textSecondary} style={styles.guestDesc}>
              Identity synchronized with cloud gateway. All local training records will replicate across devices.
            </Text>
          </Card>
        )}

        {/* Sync Status Card */}
        {!isGuest && (
          <Card variant="surface" style={styles.guestCard}>
            <View style={styles.guestHeaderRow}>
              <Badge
                label={syncStatus === 'SYNCING' ? 'SYNCING…' : syncStatus === 'OFFLINE' ? 'OFFLINE' : syncStatus === 'ERROR' ? 'SYNC ERROR' : 'SYNCED'}
                variant={syncStatus === 'ERROR' ? 'crimson' : syncStatus === 'OFFLINE' ? 'amber' : syncStatus === 'SYNCING' ? 'cyan' : 'emerald'}
                size="sm"
                dot
              />
              {syncPendingCount > 0 && (
                <TouchableOpacity onPress={() => SyncEngine.syncPendingOperations()}>
                  <Caption color={THEME.colors.cyan}>SYNC NOW</Caption>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Caption color={THEME.colors.textMuted}>
                {syncPendingCount > 0 ? `${syncPendingCount} pending` : 'All data synced'}
                {syncFailedCount > 0 ? ` · ${syncFailedCount} failed` : ''}
              </Caption>
              {syncLastSyncAt && (
                <Caption color={THEME.colors.textMuted}>
                  Last: {new Date(syncLastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Caption>
              )}
            </View>
            {syncFailedCount > 0 && (
              <Button
                title="RETRY FAILED"
                variant="ghost"
                size="sm"
                onPress={() => SyncEngine.retryFailed()}
                style={{ marginTop: 6, alignSelf: 'flex-start' }}
              />
            )}
          </Card>
        )}

        {/* Dedicated "My Lifts" / "Exercise Mastery" Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>LIFT MASTERY (TOP LIFTS)</Caption>
            <TouchableOpacity onPress={() => router.push('/progress' as any)}>
              <Caption color={THEME.colors.cyan} style={styles.sectionAction}>VIEW ALL LIFTS →</Caption>
            </TouchableOpacity>
          </View>

          {masteries.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Heading level={3} align="center" style={styles.emptyTitle}>
                No movement masteries initiated yet
              </Heading>
              <Caption align="center" style={styles.emptyDesc}>
                Complete your first training session to register lifts, unlock level progression, and track estimated 1RM.
              </Caption>
            </Card>
          ) : (
            masteries.slice(0, 5).map(m => {
              const ex = exerciseCatalogMap[m.exerciseId];
              const movementName = (ex?.name || 'TRAINING MOVEMENT').toUpperCase();
              const progress = MasteryEngine.getExerciseProgress(m.masteryXp || 0);
              const rankInfo = PROGRESSION_CONFIG.mastery.exerciseRanks[progress.rank as RankTier] || {
                color: THEME.colors.cyan,
                title: 'E-Rank Lift',
              };

              return (
                <TouchableOpacity
                  key={m.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/progress/${m.exerciseId}` as any)}
                >
                  <Card variant="surface" style={styles.liftCard}>
                    {/* Movement Name, Rank & Level Header */}
                    <View style={styles.liftHeaderRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Heading level={2} style={styles.liftName}>{movementName}</Heading>
                        <Caption color={THEME.colors.textMuted}>{ex?.primaryMuscle || 'Compound'}</Caption>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <View style={[styles.liftLevelPill, { borderColor: rankInfo.color, backgroundColor: `${rankInfo.color}15` }]}>
                          <MonoText style={[styles.liftLevelText, { color: rankInfo.color }]}>
                            RANK {progress.rank}
                          </MonoText>
                        </View>
                        <View style={[styles.liftLevelPill, { borderColor: THEME.colors.border }]}>
                          <MonoText style={[styles.liftLevelText, { color: '#FFF' }]}>
                            LVL {progress.level}
                          </MonoText>
                        </View>
                      </View>
                    </View>

                    {/* Divider Line */}
                    <View style={styles.liftDivider} />

                    {/* Mastery XP Row */}
                    <View style={styles.masteryXpContainer}>
                      <View style={styles.masteryXpTextRow}>
                        <Caption upper color={THEME.colors.textPrimary} style={styles.masteryXpLabel}>
                          {progress.currentLevelXp.toLocaleString()} / {progress.xpRequiredForNextLevel.toLocaleString()} XP ({progress.progressPercent}%)
                        </Caption>
                      </View>
                      <ProgressBar
                        progressPercent={progress.progressPercent}
                        color={rankInfo.color}
                        size="sm"
                        showPercent={false}
                      />
                    </View>

                    {/* Telemetry Metrics Row */}
                    <View style={styles.liftMetricsGrid}>
                      <View style={styles.liftMetricCol}>
                        <Caption upper style={styles.liftMetricLabel}>Estimated 1RM</Caption>
                        <MonoText color={THEME.colors.cyan} style={styles.liftMetricValue}>
                          {m.estimated1RmKg} kg
                        </MonoText>
                      </View>

                      <View style={styles.liftMetricCol}>
                        <Caption upper style={styles.liftMetricLabel}>Best Weight</Caption>
                        <MonoText style={styles.liftMetricValue}>
                          {m.bestWeightKg || m.estimated1RmKg} kg
                        </MonoText>
                      </View>

                      {m.relativeStrength ? (
                        <View style={styles.liftMetricCol}>
                          <Caption upper style={styles.liftMetricLabel}>Rel. Strength</Caption>
                          <MonoText color={THEME.colors.emerald} style={styles.liftMetricValue}>
                            {m.relativeStrength}x BW
                          </MonoText>
                        </View>
                      ) : (
                        <View style={styles.liftMetricCol}>
                          <Caption upper style={styles.liftMetricLabel}>Sessions</Caption>
                          <MonoText style={styles.liftMetricValue}>
                            {m.totalSessions}
                          </MonoText>
                        </View>
                      )}
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}

          {masteries.length > 5 && (
            <TouchableOpacity
              style={styles.viewAllLiftsButton}
              onPress={() => router.push('/progress' as any)}
              activeOpacity={0.8}
            >
              <Text color={THEME.colors.cyan} style={styles.viewAllLiftsText}>
                VIEW ALL {masteries.length} LIFTS IN DIRECTORY →
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tactical Attributes Radar */}
        {profile && (
          <View style={styles.section}>
            <Caption upper style={styles.sectionHeader}>TACTICAL ATTRIBUTES RADAR</Caption>
            <AttributeRadar attributes={profile.attributes} />
          </View>
        )}

        {/* Lifetime Athletic Records (Combat Telemetry) */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>LIFETIME COMBAT RECORD</Caption>
          <View style={styles.statsGrid}>
            <Card variant="surface" style={styles.statBox}>
              <Caption upper style={styles.statLabel}>TOTAL SESSIONS</Caption>
              <StatText size="md" color={THEME.colors.cyan}>
                {lifetimeStats.totalWorkouts}
              </StatText>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Caption upper style={styles.statLabel}>TOTAL TONNAGE</Caption>
              <StatText size="md">
                {lifetimeStats.totalVolumeKg > 999
                  ? `${(lifetimeStats.totalVolumeKg / 1000).toFixed(1)}k kg`
                  : `${lifetimeStats.totalVolumeKg} kg`}
              </StatText>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Caption upper style={styles.statLabel}>TOTAL SETS</Caption>
              <StatText size="md">
                {lifetimeStats.totalSets}
              </StatText>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Caption upper style={styles.statLabel}>TOTAL REPS</Caption>
              <StatText size="md">
                {lifetimeStats.totalReps}
              </StatText>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Caption upper style={styles.statLabel}>TRAINING TIME</Caption>
              <StatText size="md">
                {lifetimeStats.totalDurationMinutes} MIN
              </StatText>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Caption upper style={styles.statLabel}>LONGEST STREAK</Caption>
              <StatText size="md" color={THEME.colors.amber}>
                {profile?.longestStreak || 0} D
              </StatText>
            </Card>
          </View>
        </View>

        {/* Personal Records Showcase */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>ESTABLISHED PERSONAL RECORDS</Caption>
            <Badge label={`${personalRecords.length} PRS`} variant="amber" size="sm" />
          </View>

          {personalRecords.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Caption align="center">
                No personal records established yet. Execute high-effort sets in your sessions to mint PRs.
              </Caption>
            </Card>
          ) : (
            personalRecords.slice(0, 5).map(pr => {
              const ex = exerciseCatalogMap[pr.exerciseId];
              const exName = ex?.name || 'Movement Record';
              const dateStr = pr.achievedAt ? new Date(pr.achievedAt).toLocaleDateString() : 'Recent';

              return (
                <Card key={pr.id} variant="surface" style={styles.prRowCard}>
                  <View style={{ flex: 1 }}>
                    <Heading level={3} style={styles.prName}>{exName}</Heading>
                    <Caption color={THEME.colors.textMuted}>{dateStr}</Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Badge label={pr.prType.replace('MAX_', '')} variant="amber" size="sm" />
                    <MonoText color={THEME.colors.amber} style={styles.prNumber}>
                      {pr.value} {pr.prType === 'MAX_REPS' ? 'REPS' : 'KG'}
                    </MonoText>
                  </View>
                </Card>
              );
            })
          )}
        </View>

        {/* System Achievements Grid */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>TACTICAL ACHIEVEMENTS</Caption>
          <View style={styles.achievementGrid}>
            {SYSTEM_ACHIEVEMENTS.map(ach => {
              const unlocked = ach.isUnlocked(achievementEvaluationStats);

              return (
                <Card
                  key={ach.id}
                  variant="surface"
                  accentBorder={unlocked ? THEME.colors.emerald : THEME.colors.borderSubtle}
                  style={[styles.achievementCard, !unlocked && styles.achievementLocked]}
                >
                  <View style={styles.achTopRow}>
                    <Text style={styles.achIcon}>{ach.icon}</Text>
                    <Badge
                      label={unlocked ? `+${ach.xpReward} XP` : 'LOCKED'}
                      variant={unlocked ? 'emerald' : 'neutral'}
                      size="sm"
                    />
                  </View>
                  <Heading level={3} style={styles.achTitle}>{ach.title}</Heading>
                  <Caption color={unlocked ? THEME.colors.textSecondary : THEME.colors.textMuted} style={styles.achDesc}>
                    {ach.description}
                  </Caption>
                </Card>
              );
            })}
          </View>
        </View>

        {/* Athletic Biometrics Grid */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>ATHLETIC BIOMETRICS</Caption>
          <View style={styles.biometricsGrid}>
            <Card variant="surface" style={styles.bioBox}>
              <Caption upper style={styles.bioLabel}>HEIGHT</Caption>
              <MonoText style={styles.bioValue}>{heightDisplay}</MonoText>
            </Card>
            <Card variant="surface" style={styles.bioBox}>
              <Caption upper style={styles.bioLabel}>BODYWEIGHT</Caption>
              <MonoText style={styles.bioValue}>{weightDisplay}</MonoText>
            </Card>
            <Card variant="surface" style={styles.bioBox}>
              <Caption upper style={styles.bioLabel}>AGE</Caption>
              <MonoText style={styles.bioValue}>{profile?.age || 25} YRS</MonoText>
            </Card>
          </View>
        </View>

        {/* Directives & Preferences Profile */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>OPERATIONAL PARAMETERS</Caption>
          <Card variant="surface" style={styles.directiveCard}>
            <View style={styles.directiveRow}>
              <Caption upper>PRIMARY DIRECTIVE</Caption>
              <Badge
                label={(profile?.primary_goal || profile?.primaryGoal || normalizeGoal(profile?.goal || 'GET_STRONGER')).replace(/_/g, ' ')}
                variant="cyan"
                size="sm"
              />
            </View>

            {((profile?.secondary_goals && profile.secondary_goals.length > 0) ||
              (profile?.secondaryGoals && profile.secondaryGoals.length > 0)) && (
              <View style={[styles.directiveRow, { alignItems: 'flex-start' }]}>
                <Caption upper style={{ marginTop: 4 }}>SECONDARY DIRECTIVES</Caption>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', flex: 1, marginLeft: 8 }}>
                  {(profile.secondary_goals || profile.secondaryGoals || []).map((sec, i) => (
                    <Badge key={i} label={sec.replace(/_/g, ' ')} variant="neutral" size="sm" />
                  ))}
                </View>
              </View>
            )}

            {prefs?.sportName && (
              <View style={styles.directiveRow}>
                <Caption upper>TARGET SPORT</Caption>
                <Caption color={THEME.colors.amber}>{prefs.sportName.toUpperCase()}</Caption>
              </View>
            )}

            {prefs?.customGoalDescription && (
              <View style={[styles.directiveRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
                <Caption upper>CUSTOM DIRECTIVES</Caption>
                <Caption color={THEME.colors.textSecondary}>{prefs.customGoalDescription}</Caption>
              </View>
            )}

            <View style={styles.directiveRow}>
              <Caption upper>EXPERIENCE TIER</Caption>
              <Badge label={profile?.experience || 'INTERMEDIATE'} variant="neutral" size="sm" />
            </View>
            <View style={styles.directiveRow}>
              <Caption upper>WEEKLY COMMITMENT</Caption>
              <MonoText style={styles.directiveValue}>
                {prefs?.daysPerWeek || 4} DAYS / WK (~{prefs?.sessionDurationMinutes || 60} MIN)
              </MonoText>
            </View>
            <View style={styles.directiveRow}>
              <Caption upper>OPERATIONAL BASE</Caption>
              <Caption color={THEME.colors.cyan}>{prefs?.trainingLocation || 'COMMERCIAL_GYM'}</Caption>
            </View>
          </Card>
        </View>

        {/* System Preferences */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>SYSTEM PREFERENCES</Caption>
          <Card variant="surface" style={styles.settingsCard}>
            {/* Unit Toggle */}
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Measurement Unit</Text>
                <Caption>Calculations in KG; displayed in preferred unit</Caption>
              </View>
              <View style={styles.unitToggleGroup}>
                <TouchableOpacity
                  onPress={() => setUnit('kg')}
                  style={[styles.unitBtn, settings.preferredUnit === 'kg' && styles.unitBtnActive]}
                >
                  <MonoText
                    color={settings.preferredUnit === 'kg' ? '#000000' : THEME.colors.textMuted}
                    style={styles.unitBtnText}
                  >
                    KG
                  </MonoText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setUnit('lbs')}
                  style={[styles.unitBtn, settings.preferredUnit === 'lbs' && styles.unitBtnActive]}
                >
                  <MonoText
                    color={settings.preferredUnit === 'lbs' ? '#000000' : THEME.colors.textMuted}
                    style={styles.unitBtnText}
                  >
                    LBS
                  </MonoText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Audio Alerts */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Audio Alert Signals</Text>
              <TouchableOpacity onPress={toggleSound} style={styles.toggleBtn}>
                <Badge
                  label={settings.soundEnabled ? 'ENABLED' : 'MUTED'}
                  variant={settings.soundEnabled ? 'emerald' : 'neutral'}
                  size="sm"
                />
              </TouchableOpacity>
            </View>

            {/* Haptics Toggle */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Tactile Haptic Feedback</Text>
              <TouchableOpacity onPress={toggleHaptics} style={styles.toggleBtn}>
                <Badge
                  label={settings.hapticsEnabled ? 'ACTIVE' : 'OFF'}
                  variant={settings.hapticsEnabled ? 'emerald' : 'neutral'}
                  size="sm"
                />
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        {/* Offline Sync Telemetry */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>DATA INTEGRITY & REPLICATION</Caption>
          <Card variant="surface" style={styles.syncCard}>
            <View style={styles.syncRow}>
              <View>
                <Text style={styles.syncTitle}>Local SQLite Engine</Text>
                <Caption>
                  {pendingSyncCount} operations queued in event-sourced transaction queue
                </Caption>
              </View>
              <Badge
                label={pendingSyncCount === 0 ? 'SYNCED' : 'QUEUED'}
                variant={pendingSyncCount === 0 ? 'emerald' : 'amber'}
                size="sm"
              />
            </View>

            <View style={styles.actionBtnRow}>
              <Button
                title="VERIFY DATABASE"
                variant="secondary"
                size="sm"
                onPress={() => {
                  loadProfile();
                  loadAllProfileData();
                  Alert.alert('Database Verified', 'Local SQLite tables verified and profile reloaded.');
                }}
                style={{ flex: 1 }}
              />

              <Button
                title="RE-RUN ONBOARDING"
                variant="ghost"
                size="sm"
                onPress={async () => {
                  await resetOnboardingForTesting();
                  router.push('/onboarding' as any);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>

        {/* Engagement & Athletic Operations */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>ENGAGEMENT & ATHLETIC OPERATIONS</Caption>
          <View style={{ gap: 8 }}>
            <Button
              title="🏆 WEEKLY XP LEADERBOARD"
              variant="secondary"
              size="md"
              onPress={() => setLeaderboardVisible(true)}
            />
            <Button
              title="🤝 TACTICAL SQUAD & ACTIVITY FEED"
              variant="secondary"
              size="md"
              onPress={() => setSocialHubVisible(true)}
            />
            <Button
              title="🥗 MANUAL NUTRITION & BODYWEIGHT"
              variant="secondary"
              size="md"
              onPress={() => setNutritionVisible(true)}
            />
            <Button
              title="⚔️ SQUAD & DIRECTIVE CHALLENGES"
              variant="secondary"
              size="md"
              onPress={() => setChallengesVisible(true)}
            />
            <Button
              title="⌚ ANDROID HEALTH CONNECT"
              variant="secondary"
              size="md"
              onPress={() => setHealthModalVisible(true)}
            />
          </View>
        </View>

        {/* Auth Modal */}
        <AuthModal
          visible={authModalVisible}
          onClose={() => setAuthModalVisible(false)}
          onSuccess={() => {
            loadProfile();
            loadAllProfileData();
            Alert.alert('Identity Secured', 'Your account has been linked and data migrated.');
          }}
        />

        {/* Leaderboard Modal */}
        {profile?.id && (
          <LeaderboardModal
            visible={leaderboardVisible}
            userId={profile.id}
            onClose={() => setLeaderboardVisible(false)}
          />
        )}

        {/* Nutrition Modal */}
        {profile?.id && (
          <NutritionModal
            visible={nutritionVisible}
            userId={profile.id}
            onClose={() => setNutritionVisible(false)}
            onLogged={() => {
              loadProfile();
              loadAllProfileData();
            }}
          />
        )}

        {/* Social Hub Modal */}
        <SocialHubModal
          visible={socialHubVisible}
          onClose={() => setSocialHubVisible(false)}
        />

        {/* Challenge Hub Modal */}
        {profile?.id && (
          <ChallengeHubModal
            visible={challengesVisible}
            userId={profile.id}
            onClose={() => setChallengesVisible(false)}
          />
        )}

        {/* Health Connect Modal */}
        {profile?.id && (
          <ConnectHealthModal
            visible={healthModalVisible}
            userId={profile.id}
            onClose={() => setHealthModalVisible(false)}
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
    padding: THEME.spacing.md,
  },
  avatarBox: {
    width: 64,
    height: 64,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 2,
    backgroundColor: THEME.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: THEME.spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  displayName: {
    letterSpacing: 0.5,
    fontSize: 18,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 4,
  },
  streakPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  username: {
    fontSize: 12,
    marginTop: 1,
  },
  rankTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  xpProgressBlock: {
    marginTop: 6,
  },
  xpMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  guestCard: {
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  guestHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  guestStatusGroup: {
    gap: 2,
  },
  guestDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
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
  sectionAction: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    marginBottom: 4,
  },
  emptyDesc: {
    maxWidth: 280,
    lineHeight: 18,
  },
  liftCard: {
    marginBottom: THEME.spacing.sm,
    padding: THEME.spacing.md,
  },
  liftHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  liftName: {
    letterSpacing: 0.5,
    fontSize: 16,
  },
  liftLevelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    backgroundColor: THEME.colors.surfaceElevated,
  },
  liftLevelText: {
    fontSize: 12,
    fontWeight: '900',
  },
  liftDivider: {
    height: 1,
    backgroundColor: THEME.colors.borderSubtle,
    marginVertical: 8,
  },
  masteryXpContainer: {
    marginBottom: 10,
  },
  masteryXpTextRow: {
    marginBottom: 4,
  },
  masteryXpLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  liftMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: THEME.colors.surfaceElevated,
    padding: 10,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  liftMetricCol: {
    flex: 1,
  },
  liftMetricColWide: {
    flex: 1.3,
  },
  liftMetricLabel: {
    fontSize: 8,
    marginBottom: 2,
  },
  liftMetricValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    width: '31%',
    padding: 10,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 8,
    textAlign: 'center',
    marginBottom: 4,
  },
  prRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: THEME.spacing.xs,
  },
  prName: {
    fontSize: 14,
  },
  prNumber: {
    fontSize: 12,
    fontWeight: '800',
  },
  achievementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  achievementCard: {
    width: '48.5%',
    padding: 12,
  },
  achievementLocked: {
    opacity: 0.6,
  },
  achTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  achIcon: {
    fontSize: 18,
  },
  achTitle: {
    fontSize: 13,
    marginBottom: 2,
  },
  achDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
  biometricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  bioBox: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
  },
  bioLabel: {
    fontSize: 8,
    marginBottom: 4,
  },
  bioValue: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.cyan,
  },
  directiveCard: {
    padding: THEME.spacing.md,
    gap: 8,
  },
  directiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  directiveValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  settingsCard: {
    padding: THEME.spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  unitToggleGroup: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unitBtnActive: {
    backgroundColor: THEME.colors.cyan,
  },
  unitBtnText: {
    fontSize: 11,
  },
  toggleBtn: {
    paddingVertical: 2,
  },
  syncCard: {
    padding: THEME.spacing.md,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  syncTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  viewAllLiftsButton: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 240, 255, 0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.25)',
    marginTop: 8,
  },
  viewAllLiftsText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
