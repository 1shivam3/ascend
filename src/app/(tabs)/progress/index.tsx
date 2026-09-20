import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, TextInput, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../../constants/theme';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { WorkoutRepository } from '../../../database/repositories/WorkoutRepository';
import { useAuthStore } from '../../../store/useAuthStore';
import { Exercise, ExerciseMastery, PersonalRecord, PrimaryGoal } from '../../../types/domain.types';
import { MasteryEngine } from '../../../services/progression/MasteryEngine';
import { normalizeGoal } from '../../../utils/validation/onboardingSchema';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, StatText, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { VolumeBarChart } from '../../../components/hud/VolumeBarChart';
import { TrendSparkline } from '../../../components/hud/TrendSparkline';
import { PROGRESSION_CONFIG } from '../../../config/progression.config';

const MUSCLE_FILTERS = ['ALL', 'Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Arms', 'Core'];
const EQUIPMENT_FILTERS = ['ALL', 'BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'];
type SortOption = 'HIGHEST_LEVEL' | 'RECENTLY_PERFORMED' | 'HIGHEST_1RM' | 'ALPHABETICAL';

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: 'HIGHEST_LEVEL', label: 'Highest Level' },
  { id: 'RECENTLY_PERFORMED', label: 'Recent' },
  { id: 'HIGHEST_1RM', label: 'Highest 1RM' },
  { id: 'ALPHABETICAL', label: 'A-Z' },
];

export default function ProgressScreen() {
  const router = useRouter();
  const profile = useAuthStore(s => s.profile);
  const userId = profile?.id;

  const [refreshing, setRefreshing] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [masteryMap, setMasteryMap] = useState<Record<string, ExerciseMastery>>({});
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [exerciseCatalogMap, setExerciseCatalogMap] = useState<Record<string, Exercise>>({});

  // Analytics Metrics
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [weeklyVolumeKg, setWeeklyVolumeKg] = useState(0);
  const [volumeHistory, setVolumeHistory] = useState<{ date: string; volumeKg: number }[]>([]);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('ALL');
  const [selectedEquipment, setSelectedEquipment] = useState('ALL');
  const [selectedSort, setSelectedSort] = useState<SortOption>('HIGHEST_LEVEL');

  const loadData = useCallback(async () => {
    try {
      const allEx = await ExerciseRepository.getAll();
      const exMap: Record<string, Exercise> = {};
      allEx.forEach(e => {
        exMap[e.id] = e;
      });
      setExerciseCatalogMap(exMap);

      const list = await ExerciseRepository.search(
        searchQuery,
        selectedMuscle === 'ALL' ? undefined : selectedMuscle,
        selectedEquipment === 'ALL' ? undefined : selectedEquipment
      );
      setExercises(list);

      if (userId) {
        const [masteries, prs, stats, history] = await Promise.all([
          MasteryRepository.getAllMasteries(userId),
          MasteryRepository.getAllPersonalRecords(userId),
          WorkoutRepository.getWeeklyMonthlyStats(userId),
          WorkoutRepository.getVolumeHistory(userId, 7),
        ]);

        const mMap: Record<string, ExerciseMastery> = {};
        masteries.forEach(m => {
          mMap[m.exerciseId] = m;
        });
        setMasteryMap(mMap);
        setPersonalRecords(prs);

        setWeeklyCount(stats.weeklyCount);
        setMonthlyCount(stats.monthlyCount);
        setWeeklyVolumeKg(stats.weeklyVolumeKg);
        setVolumeHistory(history);
      }
    } catch (err) {
      console.error('Failed to load progress telemetry:', err);
    }
  }, [searchQuery, selectedMuscle, selectedEquipment, userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Sort exercises based on selectedSort
  const sortedExercises = useMemo(() => {
    const list = [...exercises];
    return list.sort((a, b) => {
      const mA = masteryMap[a.id];
      const mB = masteryMap[b.id];

      switch (selectedSort) {
        case 'HIGHEST_LEVEL': {
          const lvlA = mA?.masteryLevel ?? 0;
          const lvlB = mB?.masteryLevel ?? 0;
          if (lvlA !== lvlB) return lvlB - lvlA;
          return (mB?.masteryXp ?? 0) - (mA?.masteryXp ?? 0);
        }
        case 'RECENTLY_PERFORMED': {
          const dateA = mA?.lastTrainedAt ? new Date(mA.lastTrainedAt).getTime() : 0;
          const dateB = mB?.lastTrainedAt ? new Date(mB.lastTrainedAt).getTime() : 0;
          return dateB - dateA;
        }
        case 'HIGHEST_1RM': {
          const rmA = mA?.estimated1RmKg ?? 0;
          const rmB = mB?.estimated1RmKg ?? 0;
          return rmB - rmA;
        }
        case 'ALPHABETICAL':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [exercises, masteryMap, selectedSort]);

  // Target days per week from profile preferences
  const targetDays = profile?.trainingPreferences?.daysPerWeek || 4;
  const consistencyPercent = Math.min(100, Math.round((weeklyCount / Math.max(1, targetDays)) * 100));

  const primaryGoal: PrimaryGoal = profile?.primary_goal
    ? normalizeGoal(profile.primary_goal)
    : profile?.primaryGoal
    ? normalizeGoal(profile.primaryGoal)
    : normalizeGoal(profile?.goal || 'GET_STRONGER');

  const totalDistanceMeters = useMemo(() => {
    return Object.values(masteryMap).reduce((acc, m) => acc + (m.totalDistanceMeters || 0), 0);
  }, [masteryMap]);

  const totalBodyweightReps = useMemo(() => {
    return Object.values(masteryMap).reduce((acc, m) => {
      const ex = exerciseCatalogMap[m.exerciseId];
      if (ex && (ex.equipment === 'BODYWEIGHT' || ex.isBodyweight)) {
        return acc + (m.totalReps || 0);
      }
      return acc;
    }, 0);
  }, [masteryMap, exerciseCatalogMap]);

  const totalPrCount = useMemo(() => personalRecords.length, [personalRecords]);

  // Transform volume history for VolumeBarChart
  const chartDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const chartData = volumeHistory.length > 0
    ? volumeHistory.map((h, i) => ({
        label: chartDays[i % chartDays.length] || 'D',
        value: h.volumeKg,
      }))
    : [
        { label: 'M', value: 0 },
        { label: 'T', value: 0 },
        { label: 'W', value: 0 },
        { label: 'T', value: 0 },
        { label: 'F', value: 0 },
        { label: 'S', value: 0 },
        { label: 'S', value: 0 },
      ];

  const strengthPoints = volumeHistory.length > 1
    ? volumeHistory.map(v => Math.max(20, Math.round(v.volumeKg / 50)))
    : [100, 105, 102, 110, 115];

  const currentWeight = profile?.weightKg || 75;
  const bodyweightPoints = [currentWeight - 0.4, currentWeight - 0.2, currentWeight, currentWeight + 0.1, currentWeight];

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
        {/* Header */}
        <View style={styles.header}>
          <Heading level={1} style={styles.title}>
            {primaryGoal === 'ENDURANCE'
              ? 'ENDURANCE TELEMETRY // MASTERY'
              : primaryGoal === 'CALISTHENICS'
              ? 'BODYWEIGHT TELEMETRY // MASTERY'
              : primaryGoal === 'ATHLETIC_PERFORMANCE' || primaryGoal === 'SPORT_PERFORMANCE'
              ? 'ATHLETIC TELEMETRY // MASTERY'
              : 'MY LIFTS // EXERCISE MASTERY'}
          </Heading>
          <Caption style={styles.subtitle}>
            Independent exercise levels (1-100+), rank tiers, performance telemetry, and personal records
          </Caption>
        </View>

        {/* Tactical KPI Metrics Grid */}
        <View style={styles.kpiGrid}>
          {primaryGoal === 'ENDURANCE' ? (
            <>
              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>TOTAL DISTANCE</Caption>
                <StatText size="md" color={THEME.colors.emerald}>
                  {(totalDistanceMeters / 1000).toFixed(1)} km
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>AEROBIC ACCUMULATION</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>WEEKLY SESSIONS</Caption>
                <StatText size="md" color={THEME.colors.cyan}>{weeklyCount} / {targetDays}</StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>TARGET: {targetDays} / WK</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>MONTHLY SESSIONS</Caption>
                <StatText size="md">{monthlyCount}</StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>THIS CALENDAR MO</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>CONSISTENCY</Caption>
                <StatText size="md" color={consistencyPercent >= 80 ? THEME.colors.emerald : THEME.colors.amber}>
                  {consistencyPercent}%
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>ADHERENCE INDEX</Caption>
              </Card>
            </>
          ) : primaryGoal === 'CALISTHENICS' ? (
            <>
              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>BODYWEIGHT REPS</Caption>
                <StatText size="md" color={THEME.colors.cyan}>
                  {totalBodyweightReps > 999 ? `${(totalBodyweightReps / 1000).toFixed(1)}k` : totalBodyweightReps}
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>STRICT GYMNASTIC REPS</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>WEEKLY SESSIONS</Caption>
                <StatText size="md" color={THEME.colors.cyan}>{weeklyCount} / {targetDays}</StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>TARGET: {targetDays} / WK</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>MASTERED SKILLS</Caption>
                <StatText size="md" color={THEME.colors.emerald}>
                  {Object.values(masteryMap).filter(m => m.masteryLevel >= 5).length}
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>LVL 5+ MOVEMENTS</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>CONSISTENCY</Caption>
                <StatText size="md" color={consistencyPercent >= 80 ? THEME.colors.emerald : THEME.colors.amber}>
                  {consistencyPercent}%
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>ADHERENCE INDEX</Caption>
              </Card>
            </>
          ) : primaryGoal === 'ATHLETIC_PERFORMANCE' || primaryGoal === 'SPORT_PERFORMANCE' ? (
            <>
              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>POWER BREAKTHROUGHS</Caption>
                <StatText size="md" color={THEME.colors.amber}>{totalPrCount}</StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>RECORDS SET</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>WEEKLY SESSIONS</Caption>
                <StatText size="md" color={THEME.colors.cyan}>{weeklyCount} / {targetDays}</StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>TARGET: {targetDays} / WK</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>WEEKLY WORK LOAD</Caption>
                <StatText size="md" color={THEME.colors.emerald}>
                  {weeklyVolumeKg > 999 ? `${(weeklyVolumeKg / 1000).toFixed(1)}k` : weeklyVolumeKg}
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>KG TONNAGE</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>CONSISTENCY</Caption>
                <StatText size="md" color={consistencyPercent >= 80 ? THEME.colors.emerald : THEME.colors.amber}>
                  {consistencyPercent}%
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>ADHERENCE INDEX</Caption>
              </Card>
            </>
          ) : (
            <>
              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>WEEKLY SESSIONS</Caption>
                <StatText size="md" color={THEME.colors.cyan}>{weeklyCount} / {targetDays}</StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>TARGET: {targetDays} / WK</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>MONTHLY SESSIONS</Caption>
                <StatText size="md">{monthlyCount}</StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>THIS CALENDAR MO</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>WEEKLY VOLUME</Caption>
                <StatText size="md" color={THEME.colors.emerald}>
                  {weeklyVolumeKg > 999 ? `${(weeklyVolumeKg / 1000).toFixed(1)}k` : weeklyVolumeKg}
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>KG TONNAGE</Caption>
              </Card>

              <Card variant="surface" style={styles.kpiCard}>
                <Caption upper style={styles.kpiLabel}>CONSISTENCY</Caption>
                <StatText size="md" color={consistencyPercent >= 80 ? THEME.colors.emerald : THEME.colors.amber}>
                  {consistencyPercent}%
                </StatText>
                <Caption color={THEME.colors.textMuted} style={styles.kpiSub}>ADHERENCE INDEX</Caption>
              </Card>
            </>
          )}
        </View>

        {/* Training Volume Bar Chart */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionHeader}>TRAINING VOLUME (RECENT SESSIONS)</Caption>
          <Card variant="surface" style={styles.chartCard}>
            <VolumeBarChart data={chartData} height={120} />
          </Card>
        </View>

        {/* Trends Row */}
        <View style={styles.section}>
          <View style={styles.trendRow}>
            <View style={{ flex: 1 }}>
              <TrendSparkline
                data={strengthPoints}
                label="STRENGTH OUTPUT"
                currentValue={`${strengthPoints[strengthPoints.length - 1]} pts`}
                delta="+5.2%"
                strokeColor={THEME.colors.cyan}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TrendSparkline
                data={bodyweightPoints}
                label="BODYWEIGHT"
                currentValue={`${currentWeight.toFixed(1)} kg`}
                delta="+0.3 kg"
                strokeColor={THEME.colors.violet}
              />
            </View>
          </View>
        </View>

        {/* Personal Records Breakthrough Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>PERSONAL RECORD BREAKTHROUGHS</Caption>
            <Badge label={`${personalRecords.length} PRS`} variant="amber" size="sm" />
          </View>

          {personalRecords.length === 0 ? (
            <Card variant="surface" style={styles.emptyPrCard}>
              <Caption align="center">
                No personal record breakthroughs logged yet. Train with progressive overload to set PR milestones.
              </Caption>
            </Card>
          ) : (
            personalRecords.slice(0, 4).map(pr => {
              const ex = exerciseCatalogMap[pr.exerciseId];
              const exName = ex?.name || 'Movement Telemetry';
              const dateStr = pr.achievedAt ? new Date(pr.achievedAt).toLocaleDateString() : 'Recent';

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
                  <View style={styles.prLeft}>
                    <Text style={styles.prIcon}>🏆</Text>
                    <View>
                      <Heading level={3} style={styles.prExName}>{exName}</Heading>
                      <Caption color={THEME.colors.textMuted}>{dateStr}</Caption>
                    </View>
                  </View>
                  <View style={styles.prRight}>
                    <Badge label={pr.prType.replace('MAX_', '').replace('BEST_', '')} variant="amber" size="sm" />
                    <MonoText color={THEME.colors.amber} style={styles.prValue}>
                      {formattedVal}
                    </MonoText>
                  </View>
                </Card>
              );
            })
          )}
        </View>

        {/* Lift Mastery Directory Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Caption upper style={styles.sectionHeader}>LIFT MASTERY DIRECTORY</Caption>
            <Caption color={THEME.colors.cyan}>{sortedExercises.length} MOVEMENTS</Caption>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search movements or muscles..."
              placeholderTextColor={THEME.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Caption color={THEME.colors.textMuted} style={styles.clearText}>✕</Caption>
              </TouchableOpacity>
            )}
          </View>

          {/* Sort Selector Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll}>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setSelectedSort(opt.id)}
                style={[
                  styles.sortPill,
                  selectedSort === opt.id && styles.sortPillActive,
                ]}
              >
                <Text
                  color={selectedSort === opt.id ? '#000' : THEME.colors.textSecondary}
                  style={styles.sortText}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Muscle Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {MUSCLE_FILTERS.map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setSelectedMuscle(m)}
                style={[
                  styles.filterPill,
                  selectedMuscle === m && styles.filterPillActive,
                ]}
              >
                <Text
                  color={selectedMuscle === m ? THEME.colors.cyan : THEME.colors.textSecondary}
                  style={styles.filterText}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Exercises List */}
          <View style={styles.directoryList}>
            {sortedExercises.map(ex => {
              const mastery = masteryMap[ex.id];
              const xp = mastery?.masteryXp ?? 0;
              const progress = MasteryEngine.getExerciseProgress(xp);
              const rankColor = PROGRESSION_CONFIG.mastery.exerciseRanks[progress.rank]?.color || THEME.colors.cyan;
              const isTrained = Boolean(mastery && mastery.totalSessions > 0);

              const isCardio = ex.progressionType === 'CARDIO' || ex.movementPattern === 'CARDIO';
              const isBodyweight = ex.isBodyweight || ex.progressionType === 'BODYWEIGHT';

              const trend = mastery?.trend || (isTrained ? 'MAINTAINING' : 'NEW');
              const trendConfig: Record<string, { label: string; color: string }> = {
                IMPROVING: { label: '▲ IMPROVING', color: THEME.colors.emerald },
                MAINTAINING: { label: '● MAINTAINING', color: THEME.colors.cyan },
                REGRESSING: { label: '▼ REGRESSING', color: THEME.colors.amber },
                NEW: { label: '★ NEW', color: THEME.colors.textMuted },
              };
              const trendInfo = trendConfig[trend] || trendConfig.NEW;

              return (
                <TouchableOpacity
                  key={ex.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/progress/${ex.id}` as any)}
                >
                  <Card variant="surface" style={styles.movementCard}>
                    {/* Top Row: Name, Progression Category, and Rank/Level/Trend Badges */}
                    <View style={styles.cardTopRow}>
                      <View style={styles.nameContainer}>
                        <Heading level={3} style={styles.exerciseName}>{ex.name}</Heading>
                        <View style={styles.badgeRow}>
                          <Badge label={ex.primaryMuscle} size="sm" variant="cyan" />
                          <Badge label={ex.equipment} size="sm" variant="neutral" />
                          {ex.progressionType && (
                            <Badge label={ex.progressionType.replace(/_/g, ' ')} size="sm" variant="neutral" />
                          )}
                        </View>
                      </View>

                      {/* Lift Level, Rank, and Trend Badges */}
                      <View style={styles.badgesCol}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <View style={[styles.rankPill, { borderColor: rankColor, backgroundColor: `${rankColor}15` }]}>
                            <Text style={[styles.rankPillText, { color: rankColor }]}>
                              RANK {progress.rank}
                            </Text>
                          </View>
                          <View style={styles.levelPill}>
                            <Text style={styles.levelPillText}>LVL {progress.level}</Text>
                          </View>
                        </View>
                        <View style={[styles.trendPill, { borderColor: trendInfo.color, backgroundColor: `${trendInfo.color}15` }]}>
                          <Text style={[styles.trendPillText, { color: trendInfo.color }]}>
                            {trendInfo.label}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* XP Progress Bar to next level */}
                    <View style={styles.xpProgressContainer}>
                      <ProgressBar
                        progressPercent={progress.progressPercent}
                        color={rankColor}
                        size="sm"
                        label={`${progress.currentLevelXp.toLocaleString()} / ${progress.xpRequiredForNextLevel.toLocaleString()} XP (${progress.progressPercent}%)`}
                      />
                    </View>

                    {/* Category-Tailored Stats Telemetry Grid */}
                    {isTrained ? (
                      <View style={styles.telemetryGrid}>
                        {isCardio ? (
                          <>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>BEST DIST</Caption>
                              <Text style={[styles.telemetryVal, { color: THEME.colors.cyan }]}>
                                {mastery.bestDistanceMeters && mastery.bestDistanceMeters >= 1000
                                  ? `${(mastery.bestDistanceMeters / 1000).toFixed(2)} km`
                                  : `${mastery.bestDistanceMeters || 0} m`}
                              </Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>BEST PACE</Caption>
                              <Text style={[styles.telemetryVal, { color: THEME.colors.emerald }]}>
                                {mastery.bestPaceSecondsPerKm && mastery.bestPaceSecondsPerKm > 0
                                  ? `${Math.floor(mastery.bestPaceSecondsPerKm / 60)}:${(Math.round(mastery.bestPaceSecondsPerKm) % 60).toString().padStart(2, '0')}/km`
                                  : '--:--'}
                              </Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>TOTAL TIME</Caption>
                              <Text style={styles.telemetryVal}>
                                {Math.round((mastery.totalDurationSeconds || 0) / 60)} min
                              </Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>SESSIONS</Caption>
                              <Text style={styles.telemetryVal}>{mastery.totalSessions}</Text>
                            </View>
                          </>
                        ) : isBodyweight ? (
                          <>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>BEST REPS</Caption>
                              <Text style={[styles.telemetryVal, { color: THEME.colors.cyan }]}>{mastery.bestReps} reps</Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>ADDED WT</Caption>
                              <Text style={styles.telemetryVal}>{mastery.bestWeightKg} kg</Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>TOTAL REPS</Caption>
                              <Text style={[styles.telemetryVal, { color: THEME.colors.emerald }]}>{mastery.totalReps}</Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>SESSIONS</Caption>
                              <Text style={styles.telemetryVal}>{mastery.totalSessions}</Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>EST. 1RM</Caption>
                              <Text style={[styles.telemetryVal, { color: THEME.colors.cyan }]}>
                                {mastery.estimated1RmKg} kg
                              </Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>BEST SET</Caption>
                              <Text style={styles.telemetryVal}>
                                {mastery.bestWeightKg}kg × {mastery.bestReps}
                              </Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>TOTAL VOL</Caption>
                              <Text style={[styles.telemetryVal, { color: THEME.colors.emerald }]}>
                                {mastery.totalVolumeKg > 999 ? `${(mastery.totalVolumeKg / 1000).toFixed(1)}k` : mastery.totalVolumeKg} kg
                              </Text>
                            </View>
                            <View style={styles.telemetryItem}>
                              <Caption style={styles.telemetryLabel}>SESSIONS</Caption>
                              <Text style={styles.telemetryVal}>{mastery.totalSessions}</Text>
                            </View>
                          </>
                        )}
                      </View>
                    ) : (
                      <View style={styles.untrainedContainer}>
                        <Caption style={styles.untrainedText}>
                          Unranked Initiate • Log completed sets to start earning lift XP
                        </Caption>
                      </View>
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    marginBottom: THEME.spacing.sm,
    marginTop: THEME.spacing.xs,
  },
  title: {
    letterSpacing: 1.5,
  },
  subtitle: {
    marginTop: 2,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: THEME.spacing.sm,
  },
  kpiCard: {
    width: '48.5%',
    padding: 10,
  },
  kpiLabel: {
    fontSize: 8,
    marginBottom: 4,
  },
  kpiSub: {
    fontSize: 9,
    marginTop: 2,
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
  chartCard: {
    padding: 12,
  },
  trendRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emptyPrCard: {
    padding: 16,
  },
  prCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: THEME.spacing.xs,
  },
  prLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  prIcon: {
    fontSize: 18,
  },
  prExName: {
    fontSize: 14,
  },
  prRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  prValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.xs,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 14,
  },
  clearText: {
    padding: 4,
    fontWeight: '700',
  },
  sortScroll: {
    flexDirection: 'row',
    marginBottom: THEME.spacing.xs,
  },
  sortPill: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 8,
  },
  sortPillActive: {
    backgroundColor: THEME.colors.cyan,
    borderColor: THEME.colors.cyan,
  },
  sortText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filterScroll: {
    flexDirection: 'row',
    marginBottom: THEME.spacing.xs,
  },
  filterPill: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 8,
  },
  filterPillActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: THEME.colors.cyanSubtle,
  },
  filterText: {
    fontSize: 11,
    fontWeight: '700',
  },
  directoryList: {
    marginTop: THEME.spacing.xs,
  },
  movementCard: {
    marginBottom: THEME.spacing.sm,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameContainer: {
    flex: 1,
    marginRight: 10,
  },
  exerciseName: {
    marginBottom: 4,
    fontSize: 15,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  badgesCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rankPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  rankPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  levelPill: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  levelPillText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  trendPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  trendPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  xpProgressContainer: {
    marginVertical: 10,
  },
  telemetryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  telemetryItem: {
    alignItems: 'center',
  },
  telemetryLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    marginBottom: 2,
  },
  telemetryVal: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  untrainedContainer: {
    paddingVertical: 4,
  },
  untrainedText: {
    fontStyle: 'italic',
    color: THEME.colors.textMuted,
  },
});
