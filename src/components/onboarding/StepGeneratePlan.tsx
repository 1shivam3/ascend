import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { AIGenerationService } from '../../services/ai/AIGenerationService';
import { AIWorkoutPlan } from '../../services/ai/schemas';
import { useAuthStore } from '../../store/useAuthStore';

interface Props {
  goal: string;
  experience: string;
  daysPerWeek: number;
  durationMin: number;
  onNext: () => void;
  onBack: () => void;
}

export function StepGeneratePlan({ goal, experience, daysPerWeek, durationMin, onNext, onBack }: Props) {
  const [isSynthesizing, setIsSynthesizing] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [generatedPlan, setGeneratedPlan] = useState<AIWorkoutPlan | null>(null);

  const steps = [
    'PARSING BIOMETRICS & MECHANICAL LEVERS...',
    'FILTERING ORTHOPEDIC CONTRAINDICATIONS...',
    'SYNTHESIZING OPTIMAL VOLUME & REST CADENCE...',
    'FINALIZING TACTICAL PROTOCOL ARCHITECTURE...',
  ];

  useEffect(() => {
    let isMounted = true;

    // Step ticker for tactical HUD feedback
    const timer = setInterval(() => {
      setStepIndex(prev => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 500);

    // Call AI Generation Service with deterministic fallback guarantee
    const activeUserId = useAuthStore.getState().userId || 'operative';
    AIGenerationService.generatePlan(activeUserId, {
      goal,
      experience,
      days_per_week: daysPerWeek,
      session_duration: durationMin,
      equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
      training_location: 'COMMERCIAL_GYM',
      preferred_exercises: [],
      excluded_exercises: [],
      limitations: [],
    })
      .then(plan => {
        if (isMounted) {
          setGeneratedPlan(plan);
          setIsSynthesizing(false);
          clearInterval(timer);
        }
      })
      .catch(err => {
        console.error('Plan generation failed in onboarding:', err);
        if (isMounted) {
          setIsSynthesizing(false);
          clearInterval(timer);
        }
      });

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [goal, experience, daysPerWeek, durationMin]);

  const planTitle = generatedPlan?.name || `${daysPerWeek}-DAY ${goal === 'BUILD_STRENGTH' ? 'STRENGTH VANGUARD' : 'HYPERTROPHY FORGE'}`;
  const splitType = generatedPlan?.split_type || (daysPerWeek >= 4 ? 'UPPER / LOWER HYBRID' : 'FULL BODY COMPOUND');

  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>PROGRAM COMPILATION</Heading>
        <Caption style={styles.sub}>
          Synthesizing your personalized athletic training split from your biometrics and goals.
        </Caption>

        {isSynthesizing ? (
          <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.synthesizingCard}>
            <ActivityIndicator size="large" color={THEME.colors.cyan} style={{ marginBottom: 16 }} />
            <MonoText color={THEME.colors.cyan} style={styles.telemetryText}>
              {steps[stepIndex]}
            </MonoText>
            <Caption style={{ marginTop: 8 }}>NEURAL CALIBRATION IN PROGRESS</Caption>
          </Card>
        ) : (
          <Card variant="glass" accentBorder={THEME.colors.emerald} style={styles.resultCard}>
            <View style={styles.resultTop}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Heading level={2} color={THEME.colors.cyan} style={styles.planTitle}>
                  {planTitle}
                </Heading>
                <Caption upper color={THEME.colors.emerald} style={styles.planBadge}>
                  ✓ COMPILED & ACTIVE
                </Caption>
              </View>
              <Badge label={splitType} variant="cyan" size="sm" />
            </View>

            <Text color={THEME.colors.textSecondary} style={styles.planDesc}>
              {generatedPlan?.weekly_structure ||
                `A high-yield ${daysPerWeek}-day periodized routine balancing primary compound strength progressions with targeted accessory volume over ${durationMin} minutes per session.`}
            </Text>

            <View style={styles.metricGrid}>
              <View style={styles.metricBox}>
                <Caption upper>CADENCE</Caption>
                <MonoText style={styles.metricVal}>{daysPerWeek} DAYS/WK</MonoText>
              </View>
              <View style={styles.metricBox}>
                <Caption upper>TARGET DURATION</Caption>
                <MonoText style={styles.metricVal}>~{durationMin} MIN</MonoText>
              </View>
              <View style={styles.metricBox}>
                <Caption upper>EXPERIENCE</Caption>
                <MonoText style={styles.metricVal}>{experience}</MonoText>
              </View>
            </View>
          </Card>
        )}
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} disabled={isSynthesizing} style={{ flex: 1 }} />
        <Button
          title="PROCEED TO CHARACTER INIT →"
          variant="primary"
          onPress={onNext}
          disabled={isSynthesizing}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.sm,
  },
  header: {
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sub: {
    marginBottom: THEME.spacing.md,
    lineHeight: 18,
  },
  synthesizingCard: {
    padding: THEME.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  telemetryText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
  },
  resultCard: {
    padding: THEME.spacing.md,
  },
  resultTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  planTitle: {
    fontSize: 16,
    letterSpacing: 1,
  },
  planBadge: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  planDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    padding: 8,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.cyan,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
