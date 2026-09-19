import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { THEME } from '../../../constants/theme';
import { TacticalCard } from '../../../components/ui/TacticalCard';
import { TacticalBadge } from '../../../components/ui/TacticalBadge';

export default function QuestsScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>TACTICAL DIRECTIVES</Text>
          <Text style={styles.subtitle}>Daily objectives, weekly feats, and ascension campaigns</Text>
        </View>

        {/* Daily Directives */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>DAILY DIRECTIVES</Text>
            <Text style={styles.resetTimer}>RESETS IN 09:24:12</Text>
          </View>

          <TacticalCard style={styles.questCard}>
            <View style={styles.questTopRow}>
              <Text style={styles.questTitle}>Field Deployment</Text>
              <TacticalBadge label="+75 XP" color={THEME.colors.cyan} size="sm" />
            </View>
            <Text style={styles.questDesc}>Complete and record any active workout session today.</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '0%' }]} />
              </View>
              <Text style={styles.progressText}>0 / 1</Text>
            </View>
          </TacticalCard>

          <TacticalCard style={styles.questCard}>
            <View style={styles.questTopRow}>
              <Text style={styles.questTitle}>Tonnage Threshold</Text>
              <TacticalBadge label="+75 XP" color={THEME.colors.cyan} size="sm" />
            </View>
            <Text style={styles.questDesc}>Accumulate at least 4,000 kg total volume in a single session.</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '0%' }]} />
              </View>
              <Text style={styles.progressText}>0 / 4,000 kg</Text>
            </View>
          </TacticalCard>

          <TacticalCard style={styles.questCard}>
            <View style={styles.questTopRow}>
              <Text style={styles.questTitle}>Limit Exertion</Text>
              <TacticalBadge label="+75 XP" color={THEME.colors.amber} size="sm" />
            </View>
            <Text style={styles.questDesc}>Log at least 1 set taken to true technical failure (Type: F).</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '0%' }]} />
              </View>
              <Text style={styles.progressText}>0 / 1 Set</Text>
            </View>
          </TacticalCard>
        </View>

        {/* Weekly Feats */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>WEEKLY FEATS</Text>

          <TacticalCard style={styles.questCard}>
            <View style={styles.questTopRow}>
              <Text style={styles.questTitle}>Iron Consistency</Text>
              <TacticalBadge label="+250 XP" color={THEME.colors.emerald} size="sm" />
            </View>
            <Text style={styles.questDesc}>Complete 4 scheduled workouts this calendar week.</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '25%' }]} />
              </View>
              <Text style={styles.progressText}>1 / 4 Days</Text>
            </View>
          </TacticalCard>

          <TacticalCard style={styles.questCard}>
            <View style={styles.questTopRow}>
              <Text style={styles.questTitle}>Compound Domination</Text>
              <TacticalBadge label="+250 XP" color={THEME.colors.emerald} size="sm" />
            </View>
            <Text style={styles.questDesc}>Log 20 total sets across primary compound lifts (Squat/Bench/Deadlift).</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '40%' }]} />
              </View>
              <Text style={styles.progressText}>8 / 20 Sets</Text>
            </View>
          </TacticalCard>
        </View>

        {/* Campaign Ascension Milestones */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ASCENSION CAMPAIGN MILESTONES</Text>

          <TacticalCard style={styles.questCard} accentColor={THEME.colors.violet}>
            <View style={styles.questTopRow}>
              <Text style={styles.questTitle}>The Big Three Mastery</Text>
              <TacticalBadge label="+500 XP" color={THEME.colors.violet} size="sm" />
            </View>
            <Text style={styles.questDesc}>Reach Lift Level 10 on Bench Press, Back Squat, and Conventional Deadlift.</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '33%', backgroundColor: THEME.colors.violet }]} />
              </View>
              <Text style={styles.progressText}>1 / 3 Movements</Text>
            </View>
          </TacticalCard>
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
    marginBottom: THEME.spacing.md,
    marginTop: THEME.spacing.sm,
  },
  title: {
    color: THEME.colors.cyan,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
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
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: THEME.spacing.xs,
  },
  resetTimer: {
    color: THEME.colors.cyan,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  questCard: {
    marginBottom: THEME.spacing.xs,
  },
  questTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  questTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  questDesc: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.colors.cyan,
    borderRadius: THEME.borderRadius.full,
  },
  progressText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
});
