import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../../constants/theme';
import { useWorkoutStore } from '../../../store/useWorkoutStore';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { TacticalButton } from '../../../components/ui/TacticalButton';
import { TacticalCard } from '../../../components/ui/TacticalCard';
import { TacticalBadge } from '../../../components/ui/TacticalBadge';

interface RoutineTemplate {
  id: string;
  title: string;
  split: string;
  durationMin: number;
  exerciseSlugs: string[];
  description: string;
}

const TEMPLATES: RoutineTemplate[] = [
  {
    id: 'push-a',
    title: 'Push Heavy Compound',
    split: 'PUSH',
    durationMin: 60,
    exerciseSlugs: [
      'barbell-bench-press',
      'incline-dumbbell-press',
      'overhead-press',
      'dumbbell-lateral-raise',
      'triceps-cable-rope-pushdown',
    ],
    description: 'Pectoral, anterior deltoid, and tricep power foundation.',
  },
  {
    id: 'pull-a',
    title: 'Pull Hypertrophy & Hinge',
    split: 'PULL',
    durationMin: 65,
    exerciseSlugs: [
      'conventional-barbell-deadlift',
      'pull-up',
      'barbell-bent-over-row',
      'cable-face-pull',
      'barbell-bicep-curl',
    ],
    description: 'Posterior chain, lat sweep, and elbow flexor development.',
  },
  {
    id: 'legs-a',
    title: 'Legs Quad & Hamstring Focus',
    split: 'LEGS',
    durationMin: 70,
    exerciseSlugs: [
      'barbell-back-squat',
      'romanian-deadlift',
      '45-leg-press',
      'lying-leg-curl',
      'standing-calf-raise',
    ],
    description: 'Knee flexion, hip hinge, and lower body work capacity.',
  },
  {
    id: 'upper-a',
    title: 'Upper Body Tactical Hybrid',
    split: 'UPPER',
    durationMin: 60,
    exerciseSlugs: [
      'barbell-bench-press',
      'pull-up',
      'seated-dumbbell-shoulder-press',
      'seated-cable-row',
      'barbell-skull-crusher',
    ],
    description: 'High-density antagonist superset framework.',
  },
];

export default function WorkoutsScreen() {
  const router = useRouter();
  const { startWorkout, addExercise } = useWorkoutStore();

  const handleStartTemplate = async (template: RoutineTemplate) => {
    await startWorkout(template.title);

    // Fetch exercises by slug and add to active workout
    for (const slug of template.exerciseSlugs) {
      const results = await ExerciseRepository.search(slug);
      const ex = results.find(e => e.slug === slug);
      if (ex) {
        await addExercise(ex);
      }
    }

    router.push('/modals/active-workout' as any);
  };

  const handleStartCustom = async () => {
    await startWorkout('Custom Field Session');
    router.push('/modals/active-workout' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>TACTICAL ROUTINES</Text>
          <Text style={styles.headerSubtitle}>Select a mission template or launch a free-form session</Text>
        </View>

        <TacticalButton
          title="+ START EMPTY SESSION"
          size="md"
          onPress={handleStartCustom}
          style={styles.customBtn}
        />

        <View style={styles.templatesSection}>
          <Text style={styles.sectionHeader}>STANDARD PROTOCOLS</Text>

          {TEMPLATES.map(t => (
            <TouchableOpacity
              key={t.id}
              activeOpacity={0.85}
              onPress={() => handleStartTemplate(t)}
            >
              <TacticalCard style={styles.templateCard} accentColor={THEME.colors.border}>
                <View style={styles.templateTopRow}>
                  <Text style={styles.templateTitle}>{t.title}</Text>
                  <TacticalBadge label={t.split} size="sm" color={THEME.colors.cyan} />
                </View>

                <Text style={styles.templateDesc}>{t.description}</Text>

                <View style={styles.templateMetaRow}>
                  <Text style={styles.metaText}>⏱️ ~{t.durationMin} min</Text>
                  <Text style={styles.metaText}>⚔️ {t.exerciseSlugs.length} Movements</Text>
                  <Text style={styles.launchText}>START PROTOCOL →</Text>
                </View>
              </TacticalCard>
            </TouchableOpacity>
          ))}
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
  headerTitle: {
    color: THEME.colors.cyan,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerSubtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  customBtn: {
    marginBottom: THEME.spacing.lg,
  },
  templatesSection: {
    gap: THEME.spacing.sm,
  },
  sectionHeader: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: THEME.spacing.xs,
  },
  templateCard: {
    marginBottom: THEME.spacing.sm,
  },
  templateTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  templateTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  templateDesc: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  templateMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  metaText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  launchText: {
    color: THEME.colors.cyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
