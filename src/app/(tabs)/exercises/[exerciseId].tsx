import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { THEME } from '../../../constants/theme';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { useAuthStore } from '../../../store/useAuthStore';
import { Exercise, ExerciseMastery, PersonalRecord } from '../../../types/domain.types';
import { MasteryEngine } from '../../../services/progression/MasteryEngine';
import { TacticalCard } from '../../../components/ui/TacticalCard';
import { TacticalBadge } from '../../../components/ui/TacticalBadge';
import { getMasteryTierForLevel } from '../../../constants/ranks';

export default function ExerciseDetailScreen() {
  const router = useRouter();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const userId = useAuthStore(s => s.userId);

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [mastery, setMastery] = useState<ExerciseMastery | null>(null);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);

  useEffect(() => {
    if (exerciseId) {
      ExerciseRepository.getById(exerciseId).then(setExercise);
      if (userId) {
        MasteryRepository.getMastery(userId, exerciseId).then(setMastery);
        MasteryRepository.getPersonalRecords(userId, exerciseId).then(setPrs);
      }
    }
  }, [exerciseId, userId]);

  if (!exercise) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>LOADING MOVEMENT DOSSIER...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const levelInfo = MasteryEngine.getMasteryLevelInfo(mastery?.masteryXp || 0);
  const tier = getMasteryTierForLevel(levelInfo.level);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Navigation */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← RETURN TO CATALOG</Text>
        </TouchableOpacity>

        {/* Title & Classification */}
        <View style={styles.titleSection}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <View style={styles.tagsRow}>
            <TacticalBadge label={exercise.primaryMuscle} color={THEME.colors.cyan} />
            <TacticalBadge label={exercise.equipment} color={THEME.colors.textSecondary} />
            <TacticalBadge label={exercise.tier.replace('_', ' ')} color={THEME.colors.amber} />
          </View>
        </View>

        {/* Lift Level Hero Card */}
        <TacticalCard style={styles.levelCard} accentColor={tier.color} glow>
          <View style={styles.levelHeaderRow}>
            <View>
              <Text style={styles.levelLabel}>EXERCISE MASTERY LEVEL</Text>
              <Text style={[styles.levelNumber, { color: tier.color }]}>
                LEVEL {levelInfo.level}
              </Text>
              <Text style={styles.tierTitle}>{levelInfo.masteryTierTitle} Tier</Text>
            </View>

            <View style={styles.xpCircle}>
              <Text style={styles.totalXpVal}>{mastery?.masteryXp || 0}</Text>
              <Text style={styles.totalXpLabel}>TOTAL MXP</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${levelInfo.progressPercent}%`, backgroundColor: tier.color },
              ]}
            />
          </View>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressText}>
              {levelInfo.currentLevelXp} / {levelInfo.xpRequiredForNextLevel} MXP to Level {levelInfo.level + 1}
            </Text>
            <Text style={styles.progressPercent}>{levelInfo.progressPercent}%</Text>
          </View>
        </TacticalCard>

        {/* Biomechanical Telemetry Grid */}
        <Text style={styles.sectionHeader}>BIOMECHANICAL TELEMETRY</Text>
        <View style={styles.statsGrid}>
          <TacticalCard style={styles.statBox}>
            <Text style={styles.statLabel}>ESTIMATED 1RM</Text>
            <Text style={[styles.statValue, { color: THEME.colors.cyan }]}>
              {mastery?.estimated1RmKg || 0} kg
            </Text>
          </TacticalCard>

          <TacticalCard style={styles.statBox}>
            <Text style={styles.statLabel}>BEST WORKING SET</Text>
            <Text style={[styles.statValue, { color: THEME.colors.amber }]}>
              {mastery?.bestWeightKg || 0} kg × {mastery?.bestReps || 0}
            </Text>
          </TacticalCard>

          <TacticalCard style={styles.statBox}>
            <Text style={styles.statLabel}>LIFETIME TONNAGE</Text>
            <Text style={styles.statValue}>
              {Math.round(mastery?.totalVolumeKg || 0).toLocaleString()} kg
            </Text>
          </TacticalCard>

          <TacticalCard style={styles.statBox}>
            <Text style={styles.statLabel}>WORK VOLUME</Text>
            <Text style={styles.statValue}>
              {mastery?.totalSets || 0} Sets • {mastery?.totalReps || 0} Reps
            </Text>
          </TacticalCard>
        </View>

        {/* Personal Records Table */}
        <Text style={styles.sectionHeader}>PERSONAL RECORDS BENCHMARK</Text>
        {prs.length === 0 ? (
          <TacticalCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No verified PRs yet for this movement.</Text>
          </TacticalCard>
        ) : (
          prs.map(pr => (
            <TacticalCard key={pr.id} style={styles.prCard}>
              <View style={styles.prRow}>
                <Text style={styles.prType}>{pr.prType.replace('MAX_', '')}</Text>
                <Text style={styles.prValue}>{pr.value} kg</Text>
              </View>
              <Text style={styles.prDate}>{new Date(pr.achievedAt).toLocaleDateString()}</Text>
            </TacticalCard>
          ))
        )}

        {/* Movement Instructions */}
        {exercise.instructions && (
          <View style={styles.instructionsSection}>
            <Text style={styles.sectionHeader}>TACTICAL EXECUTION PROTOCOL</Text>
            <TacticalCard>
              <Text style={styles.instructionsText}>{exercise.instructions}</Text>
            </TacticalCard>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContent: {
    padding: THEME.spacing.md,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: THEME.colors.cyan,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  backBtn: {
    marginBottom: THEME.spacing.sm,
    paddingVertical: 4,
  },
  backText: {
    color: THEME.colors.cyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  titleSection: {
    marginBottom: THEME.spacing.md,
  },
  exerciseName: {
    color: THEME.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  levelCard: {
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  levelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  levelLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  levelNumber: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  tierTitle: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  xpCircle: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.md,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  totalXpVal: {
    color: THEME.colors.cyan,
    fontSize: 18,
    fontWeight: '900',
  },
  totalXpLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.full,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: THEME.borderRadius.full,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
  },
  progressPercent: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeader: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: THEME.spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: THEME.spacing.lg,
  },
  statBox: {
    width: '48%',
    padding: 12,
    marginVertical: 0,
  },
  statLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: THEME.spacing.md,
  },
  emptyText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  prCard: {
    marginBottom: THEME.spacing.xs,
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prType: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  prValue: {
    color: THEME.colors.amber,
    fontSize: 16,
    fontWeight: '900',
  },
  prDate: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  instructionsSection: {
    marginTop: THEME.spacing.md,
  },
  instructionsText: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
