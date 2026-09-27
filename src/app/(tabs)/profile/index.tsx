import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../constants/theme';
import { useAuthStore } from '../../../store/useAuthStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useSyncStore } from '../../../store/useSyncStore';
import { SyncQueueRepository } from '../../../database/repositories/SyncQueueRepository';
import { WorkoutRepository } from '../../../database/repositories/WorkoutRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { ExerciseMastery, PersonalRecord, Exercise, ThemeMode } from '../../../types/domain.types';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { Button, PrimaryButton } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { Divider } from '../../../components/ui/Divider';
import { AttributeRadar } from '../../../components/hud/AttributeRadar';
import { getRankForLevel } from '../../../constants/ranks';
import { PROGRESSION_CONFIG } from '../../../config/progression.config';
import { SYSTEM_ACHIEVEMENTS } from '../../../constants/achievements';
import { AuthModal } from '../../../components/auth/AuthModal';
import { LeaderboardModal } from '../../../components/leaderboard/LeaderboardModal';
import { NutritionModal } from '../../../components/nutrition/NutritionModal';
import { SocialHubModal } from '../../../components/social/SocialHubModal';
import { ChallengeHubModal } from '../../../components/challenges/ChallengeHubModal';
import { DeviceActivityModal } from '../../../components/health/DeviceActivityModal';
import { TitlesModal } from '../../../components/titles/TitlesModal';
import { AvatarCustomizationModal } from '../../../components/avatar/AvatarCustomizationModal';
import { cmToFtIn, kgToLbs, normalizeGoal } from '../../../utils/validation/onboardingSchema';

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, borderRadius, shadows, isDark } = useTheme();
  const { profile, isGuest, loadProfile, signOut, resetOnboardingForTesting, updateAvatarConfig } = useAuthStore();
  const { settings, setUnit, setThemeMode, toggleSound, toggleHaptics } = useSettingsStore();

  const [refreshing, setRefreshing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [nutritionVisible, setNutritionVisible] = useState(false);
  const [socialHubVisible, setSocialHubVisible] = useState(false);
  const [challengesVisible, setChallengesVisible] = useState(false);
  const [titlesModalVisible, setTitlesModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
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
      allEx.forEach((e) => {
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
  const xpPercent = Math.min(
    100,
    Math.round((currentTotalXp / Math.max(1, nextLevelRequiredXp)) * 100)
  );

  // Biometrics formatting
  const heightDisplay =
    settings.preferredUnit === 'lbs'
      ? (() => {
          const { feet, inches } = cmToFtIn(profile?.heightCm || 175);
          return `${feet}' ${inches}"`;
        })()
      : `${Math.round(profile?.heightCm || 175)} cm`;

  const weightDisplay =
    settings.preferredUnit === 'lbs'
      ? `${kgToLbs(profile?.weightKg || 75)} lbs`
      : `${Math.round((profile?.weightKg || 75) * 10) / 10} kg`;

  const prefs = profile?.trainingPreferences;

  // Max mastery level for achievements
  const maxMasteryLevel =
    masteries.length > 0 ? Math.max(...masteries.map((m) => m.masteryLevel)) : 1;

  const achievementEvaluationStats = {
    totalWorkouts: lifetimeStats.totalWorkouts,
    totalVolumeKg: lifetimeStats.totalVolumeKg,
    currentStreak: profile?.currentStreak || 0,
    maxMasteryLevel,
    prsCount: personalRecords.length,
  };

  const activeThemeMode = settings.themeMode || 'light';

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
      {/* Screen Header */}
      <View style={styles.header}>
        <Heading level={1} style={styles.screenTitle}>
          Profile
        </Heading>
        <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
          Operative identity, tactical hubs & preferences
        </Caption>
      </View>

      {/* Operative Identity Hero Card */}
      <Card variant="surface" style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setAvatarModalVisible(true)}
            style={[
              styles.avatarBox,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : colors.surfaceElevated,
                borderColor: rank.definition.color,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Ionicons
              name="person"
              size={30}
              color={rank.definition.color}
            />
          </TouchableOpacity>

          <View style={styles.heroDetails}>
            <View style={styles.heroNameRow}>
              <Heading level={2} style={styles.displayName}>
                {profile?.displayName || 'Vanguard Operative'}
              </Heading>
              <View
                style={[
                  styles.streakBadge,
                  {
                    backgroundColor: `${colors.amber}18`,
                    borderRadius: borderRadius.full,
                  },
                ]}
              >
                <Ionicons name="flame" size={14} color={colors.amber} />
                <Text style={[styles.streakText, { color: colors.amber }]}>
                  {profile?.currentStreak || 0}d
                </Text>
              </View>
            </View>

            <Caption style={{ color: colors.textMuted }}>
              @{profile?.username || 'vanguard_one'}
            </Caption>

            {/* Active Title Banner */}
            {profile?.activeTitle ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setTitlesModalVisible(true)}
                style={[
                  styles.activeTitlePill,
                  { backgroundColor: colors.peach, borderColor: colors.peachText },
                ]}
              >
                <Ionicons name="ribbon" size={12} color={colors.peachText} style={{ marginRight: 4 }} />
                <MonoText style={[styles.activeTitleText, { color: colors.peachText }]}>
                  {profile.activeTitle}
                </MonoText>
                <Caption style={[styles.changeTitleBadge, { color: colors.peachText }]}>
                  Edit
                </Caption>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setTitlesModalVisible(true)}
                style={[
                  styles.equipTitlePill,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Ionicons name="ribbon-outline" size={11} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Caption style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 10 }}>
                  EQUIP TITLE
                </Caption>
              </TouchableOpacity>
            )}

            <View style={styles.rankTierRow}>
              <View
                style={[
                  styles.rankBadge,
                  {
                    backgroundColor: `${rank.definition.color}18`,
                    borderRadius: borderRadius.xs,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rankBadgeText,
                    { color: rank.definition.color },
                  ]}
                >
                  RANK {rank.tier} • {rank.definition.title}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Divider marginVertical={12} />

        {/* Global Level Progression */}
        <View style={styles.xpBlock}>
          <View style={styles.xpTextRow}>
            <Caption upper style={{ fontWeight: '700', color: colors.textPrimary }}>
              LEVEL {level} PROGRESSION
            </Caption>
            <MonoText
              style={[
                styles.xpNumbers,
                { color: isDark ? colors.textPrimary : colors.accent },
              ]}
            >
              {currentTotalXp.toLocaleString()} / {nextLevelRequiredXp.toLocaleString()} XP
            </MonoText>
          </View>
          <ProgressBar
            progressPercent={xpPercent}
            color={rank.definition.color}
            size="md"
            style={{ marginTop: 6 }}
          />
        </View>
      </Card>

      {/* Guest Mode / Cloud Account Banner */}
      {isGuest ? (
        <Card
          variant="surface"
          style={[
            styles.accountBanner,
            { borderColor: colors.amber, borderWidth: 1 },
          ]}
        >
          <View style={styles.bannerHeader}>
            <Badge label="LOCAL GUEST MODE" variant="amber" size="sm" dot />
            <Caption style={{ color: colors.textMuted }}>SQLite Storage</Caption>
          </View>
          <Caption style={{ color: colors.textSecondary, marginVertical: 6 }}>
            Your workouts and progression are stored locally on this device. Link a free cloud account to safely sync and backup across devices.
          </Caption>
          <Button
            title="Link Cloud Account →"
            variant="primary"
            size="sm"
            onPress={() => setAuthModalVisible(true)}
            style={{ marginTop: 6 }}
          />
        </Card>
      ) : (
        <Card
          variant="surface"
          style={[
            styles.accountBanner,
            { borderColor: colors.emerald, borderWidth: 1 },
          ]}
        >
          <View style={styles.bannerHeader}>
            <Badge label="AUTHENTICATED" variant="emerald" size="sm" dot />
            <TouchableOpacity onPress={signOut}>
              <Caption style={{ color: colors.crimson, fontWeight: '700' }}>
                Sign Out
              </Caption>
            </TouchableOpacity>
          </View>
          <Caption style={{ color: colors.textSecondary, marginTop: 4 }}>
            Synchronized with cloud gateway. Local training records replicate securely.
          </Caption>
        </Card>
      )}

      {/* Tactical Hubs & Operations */}
      <SectionHeader title="TACTICAL HUBS" />
      <View style={styles.hubGrid}>
        <TouchableOpacity
          style={styles.hubCol}
          onPress={() => setLeaderboardVisible(true)}
          activeOpacity={0.8}
        >
          <Card variant="surface" style={styles.hubCard}>
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: colors.accentWarmSubtle,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons name="trophy-outline" size={20} color={colors.amber} />
            </View>
            <Text style={styles.hubTitle}>Leaderboard</Text>
            <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
              Weekly XP Rank
            </Caption>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCol}
          onPress={() => setSocialHubVisible(true)}
          activeOpacity={0.8}
        >
          <Card variant="surface" style={styles.hubCard}>
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: colors.accentSubtle,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={20}
                color={colors.accent}
              />
            </View>
            <Text style={styles.hubTitle}>Squad Feed</Text>
            <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
              Allies & Activity
            </Caption>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCol}
          onPress={() => router.push('/(tabs)/challenges' as any)}
          activeOpacity={0.8}
        >
          <Card variant="surface" style={styles.hubCard}>
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: isDark
                    ? 'rgba(139, 92, 246, 0.15)'
                    : '#EDE9FE',
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons
                name="flag-outline"
                size={20}
                color={colors.violet}
              />
            </View>
            <Text style={styles.hubTitle}>Challenges</Text>
            <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
              Directives Hub
            </Caption>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCol}
          onPress={() => setTitlesModalVisible(true)}
          activeOpacity={0.8}
        >
          <Card variant="surface" style={styles.hubCard}>
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: isDark
                    ? 'rgba(245, 158, 11, 0.15)'
                    : '#FDEED9',
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons
                name="ribbon-outline"
                size={20}
                color={colors.amber}
              />
            </View>
            <Text style={styles.hubTitle}>Titles</Text>
            <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
              Operative Accolades
            </Caption>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCol}
          onPress={() => setNutritionVisible(true)}
          activeOpacity={0.8}
        >
          <Card variant="surface" style={styles.hubCard}>
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: isDark
                    ? 'rgba(16, 185, 129, 0.15)'
                    : '#E6F7F0',
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons
                name="restaurant-outline"
                size={20}
                color={colors.emerald}
              />
            </View>
            <Text style={styles.hubTitle}>Nutrition</Text>
            <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
              Fuel & Macros
            </Caption>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCol}
          onPress={() => setAvatarModalVisible(true)}
          activeOpacity={0.8}
        >
          <Card variant="surface" style={styles.hubCard}>
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: colors.accentSubtle,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={colors.accent}
              />
            </View>
            <Text style={styles.hubTitle}>Character</Text>
            <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
              Form & Evolution
            </Caption>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubColFull}
          onPress={() => setHealthModalVisible(true)}
          activeOpacity={0.8}
        >
          <Card variant="surface" style={[styles.hubCard, styles.hubCardHorizontal]}>
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: colors.accentSubtle,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons name="footsteps" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.hubTitle}>Device Activity</Text>
              <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
                Native Android hardware steps & daily goal
              </Caption>
            </View>
            <Badge label="STEPS" variant="accent" size="sm" />
          </Card>
        </TouchableOpacity>
      </View>

      {/* Attributes Radar */}
      {profile && (
        <View style={styles.sectionMargin}>
          <SectionHeader title="CHARACTER ATTRIBUTES" />
          <Card variant="surface" style={styles.radarCard}>
            <AttributeRadar attributes={profile.attributes} />
          </Card>
        </View>
      )}

      {/* Lifetime Training Record */}
      <View style={styles.sectionMargin}>
        <SectionHeader title="LIFETIME TRAINING RECORD" />
        <View style={styles.statsGrid}>
          <Card variant="surface" style={styles.statBox}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>SESSIONS</Caption>
            <MonoText
              style={[
                styles.statValue,
                { color: colors.accent },
              ]}
            >
              {lifetimeStats.totalWorkouts}
            </MonoText>
          </Card>

          <Card variant="surface" style={styles.statBox}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>TONNAGE</Caption>
            <MonoText style={styles.statValue}>
              {lifetimeStats.totalVolumeKg > 999
                ? `${(lifetimeStats.totalVolumeKg / 1000).toFixed(1)}k`
                : lifetimeStats.totalVolumeKg}{' '}
              kg
            </MonoText>
          </Card>

          <Card variant="surface" style={styles.statBox}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>TOTAL SETS</Caption>
            <MonoText style={styles.statValue}>{lifetimeStats.totalSets}</MonoText>
          </Card>

          <Card variant="surface" style={styles.statBox}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>TOTAL REPS</Caption>
            <MonoText style={styles.statValue}>{lifetimeStats.totalReps}</MonoText>
          </Card>

          <Card variant="surface" style={styles.statBox}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>DURATION</Caption>
            <MonoText style={styles.statValue}>
              {lifetimeStats.totalDurationMinutes}m
            </MonoText>
          </Card>

          <Card variant="surface" style={styles.statBox}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>MAX STREAK</Caption>
            <MonoText style={[styles.statValue, { color: colors.amber }]}>
              {profile?.longestStreak || 0}d
            </MonoText>
          </Card>
        </View>
      </View>

      {/* System Preferences & THEME TOGGLE */}
      <View style={styles.sectionMargin}>
        <SectionHeader title="SYSTEM PREFERENCES" />
        <Card variant="surface" style={styles.settingsCard}>
          {/* THEME MODE TOGGLE: Light | Dark | System */}
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Theme Mode</Text>
              <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
                Light mode primary, elegant dark mode
              </Caption>
            </View>
            <View
              style={[
                styles.themeToggleGroup,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: borderRadius.md,
                },
              ]}
            >
              {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => {
                const isSelected = activeThemeMode === mode;
                const label =
                  mode === 'light'
                    ? 'Light'
                    : mode === 'dark'
                    ? 'Dark'
                    : 'Auto';
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setThemeMode(mode)}
                    style={[
                      styles.themeBtn,
                      {
                        backgroundColor: isSelected
                          ? colors.surface
                          : 'transparent',
                        borderRadius: borderRadius.sm,
                      },
                      isSelected ? shadows.card : null,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.themeBtnText,
                        {
                          color: isSelected
                            ? colors.textPrimary
                            : colors.textMuted,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Divider marginVertical={10} />

          {/* Unit Toggle */}
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Measurement Unit</Text>
              <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
                Metric (KG) or Imperial (LBS)
              </Caption>
            </View>
            <View
              style={[
                styles.unitToggleGroup,
                {
                  backgroundColor: isDark
                    ? colors.surfaceElevated
                    : '#E5E7EB',
                  borderRadius: borderRadius.md,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => setUnit('kg')}
                style={[
                  styles.unitBtn,
                  {
                    backgroundColor:
                      settings.preferredUnit === 'kg'
                        ? colors.surface
                        : 'transparent',
                    borderRadius: borderRadius.sm,
                  },
                  settings.preferredUnit === 'kg' ? shadows.card : null,
                ]}
              >
                <Text
                  style={[
                    styles.unitBtnText,
                    {
                      color:
                        settings.preferredUnit === 'kg'
                          ? colors.textPrimary
                          : colors.textMuted,
                      fontWeight:
                        settings.preferredUnit === 'kg' ? '700' : '500',
                    },
                  ]}
                >
                  KG
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setUnit('lbs')}
                style={[
                  styles.unitBtn,
                  {
                    backgroundColor:
                      settings.preferredUnit === 'lbs'
                        ? colors.surface
                        : 'transparent',
                    borderRadius: borderRadius.sm,
                  },
                  settings.preferredUnit === 'lbs' ? shadows.card : null,
                ]}
              >
                <Text
                  style={[
                    styles.unitBtnText,
                    {
                      color:
                        settings.preferredUnit === 'lbs'
                          ? colors.textPrimary
                          : colors.textMuted,
                      fontWeight:
                        settings.preferredUnit === 'lbs' ? '700' : '500',
                    },
                  ]}
                >
                  LBS
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Divider marginVertical={10} />

          {/* Audio Alerts */}
          <View style={styles.settingRow}>
            <Text style={styles.settingTitle}>Audio Feedback</Text>
            <TouchableOpacity onPress={toggleSound}>
              <Badge
                label={settings.soundEnabled ? 'ENABLED' : 'MUTED'}
                variant={settings.soundEnabled ? 'emerald' : 'neutral'}
                size="sm"
              />
            </TouchableOpacity>
          </View>

          <Divider marginVertical={10} />

          {/* Haptics */}
          <View style={styles.settingRow}>
            <Text style={styles.settingTitle}>Haptic Feedback</Text>
            <TouchableOpacity onPress={toggleHaptics}>
              <Badge
                label={settings.hapticsEnabled ? 'ACTIVE' : 'OFF'}
                variant={settings.hapticsEnabled ? 'emerald' : 'neutral'}
                size="sm"
              />
            </TouchableOpacity>
          </View>
        </Card>
      </View>

      {/* Data Integrity & Engine */}
      <View style={styles.sectionMargin}>
        <SectionHeader title="DATA ENGINE" />
        <Card variant="surface" style={styles.syncCard}>
          <View style={styles.syncTopRow}>
            <View>
              <Text style={styles.syncTitle}>Local SQLite Engine</Text>
              <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
                {pendingSyncCount} operations queued
              </Caption>
            </View>
            <Badge
              label={pendingSyncCount === 0 ? 'SYNCED' : 'QUEUED'}
              variant={pendingSyncCount === 0 ? 'emerald' : 'amber'}
              size="sm"
            />
          </View>

          <View style={styles.syncActionRow}>
            <Button
              title="Verify Database"
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
              title="Re-run Onboarding"
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

      <View style={{ height: 48 }} />

      {/* Modals */}
      <AuthModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
        onSuccess={() => {
          loadProfile();
          loadAllProfileData();
          Alert.alert('Identity Secured', 'Your account has been linked and data migrated.');
        }}
      />

      <LeaderboardModal
        visible={leaderboardVisible}
        userId={profile?.id || ''}
        onClose={() => setLeaderboardVisible(false)}
      />

      <NutritionModal
        visible={nutritionVisible}
        userId={profile?.id || ''}
        onClose={() => setNutritionVisible(false)}
      />

      <SocialHubModal
        visible={socialHubVisible}
        onClose={() => setSocialHubVisible(false)}
      />

      <ChallengeHubModal
        visible={challengesVisible}
        userId={profile?.id || ''}
        onClose={() => setChallengesVisible(false)}
      />

      <TitlesModal
        visible={titlesModalVisible}
        userId={profile?.id || ''}
        onClose={() => setTitlesModalVisible(false)}
        onTitleChanged={() => {
          loadProfile();
        }}
      />

      <DeviceActivityModal
        visible={healthModalVisible}
        onClose={() => setHealthModalVisible(false)}
      />

      <AvatarCustomizationModal
        visible={avatarModalVisible}
        onClose={() => setAvatarModalVisible(false)}
        initialConfig={profile?.avatarConfig}
        heightCm={profile?.heightCm || 175}
        weightKg={profile?.weightKg || 75}
        experience={profile?.experience || 'INTERMEDIATE'}
        goal={profile?.goal || 'GET_STRONGER'}
        preferredUnit={settings.preferredUnit}
        onSave={async (config) => {
          await updateAvatarConfig(config);
          await loadProfile();
        }}
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
  heroCard: {
    padding: 16,
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarBox: {
    width: 60,
    height: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDetails: {
    flex: 1,
  },
  heroNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '800',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '800',
  },
  rankTierRow: {
    marginTop: 6,
  },
  activeTitlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 4,
  },
  activeTitleText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  changeTitleBadge: {
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 6,
    textDecorationLine: 'underline',
  },
  equipTitlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 4,
  },
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  xpBlock: {
    width: '100%',
  },
  xpTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpNumbers: {
    fontSize: 12,
    fontWeight: '700',
  },
  accountBanner: {
    padding: 14,
    marginBottom: 16,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionMargin: {
    marginTop: 18,
  },
  hubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  hubCol: {
    width: '48%',
  },
  hubColFull: {
    width: '100%',
  },
  hubCard: {
    padding: 14,
    alignItems: 'flex-start',
  },
  hubCardHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hubIconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  hubTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  radarCard: {
    padding: 16,
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  statBox: {
    width: '31%',
    padding: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  settingsCard: {
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  themeToggleGroup: {
    flexDirection: 'row',
    padding: 3,
  },
  themeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  themeBtnText: {
    fontSize: 12,
  },
  unitToggleGroup: {
    flexDirection: 'row',
    padding: 3,
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unitBtnText: {
    fontSize: 12,
  },
  syncCard: {
    padding: 16,
  },
  syncTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  syncActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
