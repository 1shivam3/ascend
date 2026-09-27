import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text as RNText } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../constants/theme';
import { BottomSheet } from '../ui/BottomSheet';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Divider } from '../ui/Divider';
import { BodyRegionId, BODY_REGIONS } from './types';
import { MasteryRepository } from '../../database/repositories/MasteryRepository';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { MilestoneRepository } from '../../database/repositories/MilestoneRepository';
import { ExerciseMastery, Exercise, ExerciseMilestone } from '../../types/domain.types';

export interface MuscleBottomSheetProps {
  visible: boolean;
  regionId: BodyRegionId | null;
  userId: string;
  onClose: () => void;
}

export const MuscleBottomSheet: React.FC<MuscleBottomSheetProps> = ({
  visible,
  regionId,
  userId,
  onClose,
}) => {
  const router = useRouter();
  const [exercises, setExercises] = useState<{ exercise: Exercise; mastery?: ExerciseMastery }[]>([]);
  const [muscleLevel, setMuscleLevel] = useState(1);
  const [muscleXp, setMuscleXp] = useState(0);
  const [xpToNext, setXpToNext] = useState(1000);
  const [milestone, setMilestone] = useState<{
    milestone: ExerciseMilestone;
    exerciseName: string;
    currentMetricValue: number;
    remaining: number;
    progressPercent: number;
  } | null>(null);

  const regionInfo = regionId ? BODY_REGIONS[regionId] : null;

  useEffect(() => {
    if (!visible || !regionId || !userId) return;

    async function loadData() {
      try {
        const [allMasteries, allExercises, closest] = await Promise.all([
          MasteryRepository.getAllMasteries(userId),
          ExerciseRepository.getAll(),
          MilestoneRepository.getClosestMilestone(userId),
        ]);

        const keywords = regionInfo?.relevantKeywords || [];
        const matched = allExercises.filter(ex => {
          const text = `${ex.name} ${ex.primaryMuscle || ''} ${(ex.secondaryMuscles || []).join(' ')} ${ex.movementPattern || ''}`.toLowerCase();
          return keywords.some(k => text.includes(k));
        });

        // Pair with mastery
        const paired = matched.map(ex => ({
          exercise: ex,
          mastery: allMasteries.find(m => m.exerciseId === ex.id),
        }));

        // Sort by mastery level descending
        paired.sort((a, b) => (b.mastery?.masteryLevel || 0) - (a.mastery?.masteryLevel || 0));
        setExercises(paired.slice(0, 5));

        // Aggregate Muscle Group Level from top exercises
        const topMasteries = paired.map(p => p.mastery).filter(Boolean) as ExerciseMastery[];
        if (topMasteries.length > 0) {
          const totalLvl = topMasteries.reduce((sum, m) => sum + m.masteryLevel, 0);
          const totalXp = topMasteries.reduce((sum, m) => sum + m.masteryXp, 0);
          const avgLevel = Math.max(1, Math.round(totalLvl / topMasteries.length));
          setMuscleLevel(avgLevel);
          setMuscleXp(totalXp % 1000);
          setXpToNext(1000);
        } else {
          setMuscleLevel(1);
          setMuscleXp(0);
          setXpToNext(1000);
        }

        setMilestone(closest);
      } catch (err) {
        console.error('Failed to load muscle region details:', err);
      }
    }

    loadData();
  }, [visible, regionId, userId]);

  if (!regionInfo) return null;

  const progressPercent = Math.min(100, Math.round((muscleXp / xpToNext) * 100));

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={regionInfo.name}
      maxHeight="82%"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Muscle Level & XP Progress */}
        <View style={styles.headerBlock}>
          <View style={styles.levelRow}>
            <View>
              <Caption upper color={THEME.colors.cyan} style={styles.groupLabel}>
                {regionInfo.muscleGroup} DISCIPLINE
              </Caption>
              <Heading level={1} style={styles.levelHeading}>
                LEVEL {muscleLevel}
              </Heading>
            </View>
            <View style={styles.xpBox}>
              <MonoText style={styles.xpText} color={THEME.colors.textPrimary}>
                {muscleXp.toLocaleString()} / {xpToNext.toLocaleString()} XP
              </MonoText>
            </View>
          </View>

          <ProgressBar
            progressPercent={progressPercent}
            color={THEME.colors.cyan}
            size="md"
            style={styles.progressBar}
          />
        </View>

        <Divider marginVertical={THEME.spacing.sm} />

        {/* Exercises List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Caption upper style={styles.sectionTitle}>
              KEY LIFT PROGRESSION ({exercises.length})
            </Caption>
          </View>

          {exercises.length === 0 ? (
            <Caption color={THEME.colors.textMuted} style={{ paddingVertical: 8 }}>
              No logged movements recorded for this region yet.
            </Caption>
          ) : (
            exercises.map((item, idx) => {
              const level = item.mastery?.masteryLevel || 1;
              const rank = item.mastery?.rank || 'E';
              const e1rm = item.mastery?.estimated1RmKg || 0;

              return (
                <View key={item.exercise.id} style={styles.exerciseRow}>
                  <View style={styles.exerciseLeft}>
                    <View style={styles.rankBadge}>
                      <RNText style={styles.rankText}>{rank}</RNText>
                    </View>
                    <View>
                      <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                      {e1rm > 0 && (
                        <Caption color={THEME.colors.textMuted}>
                          e1RM: {e1rm} kg • {item.mastery?.totalSessions || 0} sessions
                        </Caption>
                      )}
                    </View>
                  </View>

                  <View style={styles.exerciseRight}>
                    <MonoText color={THEME.colors.cyan} style={styles.levelNumber}>
                      LV {level}
                    </MonoText>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Divider marginVertical={THEME.spacing.sm} />

        {/* Next Milestone */}
        <View style={styles.section}>
          <Caption upper style={styles.sectionTitle}>
            NEXT TARGET MILESTONE
          </Caption>
          <View style={styles.milestoneBox}>
            <View>
              <Text style={styles.milestoneExercise}>
                {milestone ? milestone.exerciseName : `${regionInfo.name} Standard`}
              </Text>
              <Caption color={THEME.colors.textSecondary}>
                {milestone ? milestone.milestone.title : 'Advance 3 compound sets to level up'}
              </Caption>
            </View>
            <Badge label={milestone ? `${milestone.progressPercent}%` : 'LOCKED'} variant="cyan" size="sm" />
          </View>
        </View>

        {/* View Mastery CTA Button */}
        <View style={styles.footer}>
          <Button
            title="VIEW FULL MASTERY →"
            variant="primary"
            size="md"
            onPress={() => {
              onClose();
              router.push('/(tabs)/mastery' as any);
            }}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: THEME.spacing.xl,
  },
  headerBlock: {
    paddingVertical: THEME.spacing.xs,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  groupLabel: {
    letterSpacing: 1.4,
    fontWeight: '800',
    fontSize: 10,
    marginBottom: 2,
  },
  levelHeading: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  xpBox: {
    alignItems: 'flex-end',
  },
  xpText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBar: {
    marginTop: 4,
  },
  section: {
    marginVertical: THEME.spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: '800',
    letterSpacing: 1,
    color: THEME.colors.textMuted,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  exerciseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '900',
    color: THEME.colors.cyan,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  exerciseRight: {
    alignItems: 'flex-end',
  },
  levelNumber: {
    fontSize: 14,
    fontWeight: '800',
  },
  milestoneBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    marginTop: 6,
  },
  milestoneExercise: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  footer: {
    marginTop: THEME.spacing.lg,
  },
});
