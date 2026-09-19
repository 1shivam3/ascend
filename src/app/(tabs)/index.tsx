import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { WorkoutRepository } from '../../database/repositories/WorkoutRepository';
import { WorkoutSession } from '../../types/domain.types';
import { LevelOrb } from '../../components/hud/LevelOrb';
import { AttributeRadar } from '../../components/hud/AttributeRadar';
import { TacticalButton } from '../../components/ui/TacticalButton';
import { TacticalCard } from '../../components/ui/TacticalCard';
import { TacticalBadge } from '../../components/ui/TacticalBadge';

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore(s => s.profile);
  const { isActive, activeWorkout, elapsedSeconds, startWorkout } = useWorkoutStore();
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    if (profile?.id) {
      WorkoutRepository.getRecentWorkouts(profile.id, 5).then(setRecentWorkouts);
    }
  }, [profile?.id, isActive]);

  const handleStartWorkout = async () => {
    if (!isActive) {
      await startWorkout('Command Training Session');
    }
    router.push('/modals/active-workout' as any);
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedDuration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>ASCEND</Text>
            <Text style={styles.greeting}>
              Welcome, {profile?.displayName || 'Vanguard'}
            </Text>
          </View>

          {/* Streak Flame Counter */}
          <View style={styles.streakBadge}>
            <Text style={styles.streakFlame}>🔥</Text>
            <Text style={styles.streakText}>{profile?.currentStreak || 0} D</Text>
          </View>
        </View>

        {/* Active Workout Sticky Banner */}
        {isActive && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => router.push('/modals/active-workout' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.activeBannerLeft}>
              <View style={styles.pulseDot} />
              <View>
                <Text style={styles.activeBannerTitle}>TRAINING SESSION ACTIVE</Text>
                <Text style={styles.activeBannerTime}>{formattedDuration} • {activeWorkout?.exercises.length || 0} Movements</Text>
              </View>
            </View>
            <TacticalBadge label="RESUME" color={THEME.colors.cyan} size="sm" />
          </TouchableOpacity>
        )}

        {/* Level & Rank Orb */}
        <View style={styles.section}>
          <LevelOrb totalXp={profile?.totalXp || 0} />
        </View>

        {/* Primary CTA */}
        {!isActive && (
          <TacticalButton
            title="START TRAINING SESSION"
            size="lg"
            onPress={handleStartWorkout}
            style={styles.ctaButton}
          />
        )}

        {/* 5 Core Attributes Radar */}
        {profile && (
          <AttributeRadar attributes={profile.attributes} />
        )}

        {/* Recent Workouts Log */}
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>RECENT MISSIONS</Text>
          {recentWorkouts.length === 0 ? (
            <TacticalCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>No recent sessions recorded.</Text>
              <Text style={styles.emptySubtext}>Initiate a training session to mint character progression.</Text>
            </TacticalCard>
          ) : (
            recentWorkouts.map(w => (
              <TacticalCard key={w.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>{w.title}</Text>
                  <Text style={styles.historyXp}>+{w.xpEarned} XP</Text>
                </View>
                <View style={styles.historyMetaRow}>
                  <Text style={styles.historyMetaText}>
                    {w.completedAt ? new Date(w.completedAt).toLocaleDateString() : 'Today'}
                  </Text>
                  <Text style={styles.historyMetaText}>
                    {Math.round(w.totalVolumeKg)} kg • {w.totalSets} Sets • {Math.round(w.durationSeconds / 60)} min
                  </Text>
                </View>
              </TacticalCard>
            ))
          )}
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
    marginTop: THEME.spacing.sm,
  },
  appTitle: {
    color: THEME.colors.cyan,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  greeting: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    borderColor: THEME.colors.amber,
  },
  streakFlame: {
    fontSize: 14,
    marginRight: 4,
  },
  streakText: {
    color: THEME.colors.amber,
    fontSize: 13,
    fontWeight: '900',
  },
  activeBanner: {
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cyan,
    padding: THEME.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  activeBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.colors.cyan,
  },
  activeBannerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  activeBannerTime: {
    color: THEME.colors.cyan,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  section: {
    marginBottom: THEME.spacing.sm,
  },
  ctaButton: {
    marginVertical: THEME.spacing.sm,
  },
  recentSection: {
    marginTop: THEME.spacing.md,
  },
  sectionTitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: THEME.spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtext: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
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
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  historyXp: {
    color: THEME.colors.emerald,
    fontSize: 13,
    fontWeight: '800',
  },
  historyMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyMetaText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
});
