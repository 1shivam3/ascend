import { describe, it, expect } from 'vitest';
import { QuestEngine } from '../QuestEngine';
import { UserQuestProgress, Quest } from '../../../types/quest.types';
import { WorkoutSession, ExerciseLog, SetLog, Exercise } from '../../../types/domain.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestProgress(quest: Quest, currentProgress = 0): UserQuestProgress {
  return {
    id: `uqp-${quest.id}`,
    userId: 'user-1',
    questId: quest.id,
    currentProgress,
    targetValue: quest.targetValue,
    completed: false,
    completedAt: null,
    lastResetDate: new Date().toISOString(),
    quest,
  };
}

function makeWorkout(exercises: ExerciseLog[]): WorkoutSession {
  const totalVolume = exercises.reduce(
    (acc, ex) =>
      acc +
      ex.sets.reduce(
        (s, set) =>
          s + (set.completed && !set.isSkipped ? set.weightKg * set.reps : 0),
        0,
      ),
    0,
  );
  return {
    id: 'w-1',
    userId: 'user-1',
    title: 'Test Workout',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationSeconds: 3600,
    totalVolumeKg: totalVolume,
    totalReps: 0,
    totalSets: 0,
    status: 'COMPLETED',
    xpEarned: 0,
    exercises,
  };
}

function makeExerciseLog(
  exercise: Exercise,
  sets: Partial<SetLog>[],
): ExerciseLog {
  return {
    id: `elog-${exercise.id}`,
    workoutId: 'w-1',
    exerciseId: exercise.id,
    userId: 'user-1',
    orderIndex: 0,
    exercise,
    sets: sets.map((s, i) => ({
      id: `set-${i}`,
      exerciseLogId: `elog-${exercise.id}`,
      userId: 'user-1',
      setNumber: i + 1,
      setType: 'NORMAL' as const,
      weightKg: 0,
      reps: 0,
      rpe: null,
      estimated1RmKg: 0,
      isPr: false,
      completed: true,
      completedAt: new Date().toISOString(),
      isSkipped: false,
      ...s,
    })),
  };
}

// ---------------------------------------------------------------------------
// Test exercises
// ---------------------------------------------------------------------------

const squat: Exercise = {
  id: 'ex-squat',
  name: 'Back Squat',
  slug: 'back-squat',
  primaryMuscle: 'Quads',
  secondaryMuscles: ['Glutes'],
  equipment: 'BARBELL',
  movementPattern: 'SQUAT',
  tier: 'COMPOUND_PRIMARY',
  isCustom: false,
  isBodyweight: false,
};

const pullUp: Exercise = {
  id: 'ex-pullup',
  name: 'Pull-Up',
  slug: 'pull-up',
  primaryMuscle: 'Back',
  secondaryMuscles: ['Biceps'],
  equipment: 'BODYWEIGHT',
  movementPattern: 'PULL_VERTICAL',
  tier: 'COMPOUND_PRIMARY',
  isCustom: false,
  isBodyweight: true,
};

const kettlebellSwing: Exercise = {
  id: 'ex-kb-swing',
  name: 'Kettlebell Swing',
  slug: 'kettlebell-swing',
  primaryMuscle: 'Posterior Chain',
  secondaryMuscles: ['Glutes'],
  equipment: 'KETTLEBELL',
  movementPattern: 'ATHLETIC',
  tier: 'COMPOUND_SECONDARY',
  isCustom: false,
  isBodyweight: false,
};

const running: Exercise = {
  id: 'ex-running',
  name: 'Running',
  slug: 'running',
  primaryMuscle: 'Cardiovascular',
  secondaryMuscles: ['Quads', 'Calves'],
  equipment: 'BODYWEIGHT',
  movementPattern: 'CARDIO',
  tier: 'COMPOUND_PRIMARY',
  isCustom: false,
  isBodyweight: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Goal-Specific Quest Evaluation (QuestEngine)', () => {
  // 1. HEAVY_COMPOUND quest
  it('HEAVY_COMPOUND quest increments progress for low-rep compound sets', () => {
    const quest: Quest = {
      id: 'q-heavy',
      title: 'Heavy Lifter',
      description: 'Complete heavy compound sets',
      type: 'DAILY',
      category: 'HEAVY_COMPOUND',
      targetValue: 10,
      unit: 'sets',
      xpReward: 200,
      badgeVariant: 'amber',
    };

    const progress = makeQuestProgress(quest, 0);
    const workout = makeWorkout([
      makeExerciseLog(squat, [
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
      ]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].currentProgress).toBe(4);
  });

  // 2. HEAVY_COMPOUND ignores high-rep sets
  it('HEAVY_COMPOUND ignores sets with more than 6 reps', () => {
    const quest: Quest = {
      id: 'q-heavy',
      title: 'Heavy Lifter',
      description: 'Complete heavy compound sets',
      type: 'DAILY',
      category: 'HEAVY_COMPOUND',
      targetValue: 10,
      unit: 'sets',
      xpReward: 200,
      badgeVariant: 'amber',
    };

    const progress = makeQuestProgress(quest, 0);
    const workout = makeWorkout([
      makeExerciseLog(squat, [
        { weightKg: 60, reps: 12 },
        { weightKg: 60, reps: 12 },
        { weightKg: 60, reps: 12 },
        { weightKg: 60, reps: 12 },
      ]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].currentProgress).toBe(0);
  });

  // 3. TARGET_DISTANCE quest
  it('TARGET_DISTANCE quest increments progress by distance meters', () => {
    const quest: Quest = {
      id: 'q-distance',
      title: 'Distance Runner',
      description: 'Cover target distance',
      type: 'WEEKLY',
      category: 'TARGET_DISTANCE',
      targetValue: 10000,
      unit: 'meters',
      xpReward: 300,
      badgeVariant: 'emerald',
    };

    const progress = makeQuestProgress(quest, 0);
    const workout = makeWorkout([
      makeExerciseLog(running, [{ distanceMeters: 5000 }]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].currentProgress).toBe(5000);
  });

  // 4. TARGET_DISTANCE quest completes and caps at targetValue
  it('TARGET_DISTANCE quest completes and caps progress at targetValue', () => {
    const quest: Quest = {
      id: 'q-distance',
      title: 'Distance Runner',
      description: 'Cover target distance',
      type: 'WEEKLY',
      category: 'TARGET_DISTANCE',
      targetValue: 10000,
      unit: 'meters',
      xpReward: 300,
      badgeVariant: 'emerald',
    };

    const progress = makeQuestProgress(quest, 7000);
    const workout = makeWorkout([
      makeExerciseLog(running, [{ distanceMeters: 5000 }]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].completed).toBe(true);
    expect(result.updatedQuests[0].currentProgress).toBe(10000);
  });

  // 5. POWER_CONDITIONING quest
  it('POWER_CONDITIONING quest increments progress for athletic/kettlebell sets', () => {
    const quest: Quest = {
      id: 'q-power',
      title: 'Power Up',
      description: 'Complete power conditioning sets',
      type: 'DAILY',
      category: 'POWER_CONDITIONING',
      targetValue: 20,
      unit: 'sets',
      xpReward: 250,
      badgeVariant: 'violet',
    };

    const progress = makeQuestProgress(quest, 0);
    const workout = makeWorkout([
      makeExerciseLog(kettlebellSwing, [
        { weightKg: 24, reps: 15 },
        { weightKg: 24, reps: 15 },
        { weightKg: 24, reps: 15 },
      ]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].currentProgress).toBe(3);
  });

  // 6. CALISTHENICS_REPS quest
  it('CALISTHENICS_REPS quest increments progress by bodyweight reps', () => {
    const quest: Quest = {
      id: 'q-cali',
      title: 'Bodyweight Master',
      description: 'Complete calisthenics reps',
      type: 'WEEKLY',
      category: 'CALISTHENICS_REPS',
      targetValue: 200,
      unit: 'reps',
      xpReward: 350,
      badgeVariant: 'cyan',
    };

    const progress = makeQuestProgress(quest, 0);
    const workout = makeWorkout([
      makeExerciseLog(pullUp, [
        { reps: 10 },
        { reps: 8 },
        { reps: 12 },
      ]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].currentProgress).toBe(30);
  });

  // 7. CALISTHENICS_REPS ignores weighted exercises
  it('CALISTHENICS_REPS ignores non-bodyweight exercises', () => {
    const quest: Quest = {
      id: 'q-cali',
      title: 'Bodyweight Master',
      description: 'Complete calisthenics reps',
      type: 'WEEKLY',
      category: 'CALISTHENICS_REPS',
      targetValue: 200,
      unit: 'reps',
      xpReward: 350,
      badgeVariant: 'cyan',
    };

    const progress = makeQuestProgress(quest, 0);
    const workout = makeWorkout([
      makeExerciseLog(squat, [
        { weightKg: 100, reps: 10 },
        { weightKg: 100, reps: 8 },
        { weightKg: 100, reps: 12 },
      ]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].currentProgress).toBe(0);
  });

  // 8. TARGET_VOLUME quest
  it('TARGET_VOLUME quest increments progress by workout totalVolumeKg', () => {
    const quest: Quest = {
      id: 'q-volume',
      title: 'Volume King',
      description: 'Accumulate volume',
      type: 'WEEKLY',
      category: 'TARGET_VOLUME',
      targetValue: 50000,
      unit: 'kg',
      xpReward: 400,
      badgeVariant: 'amber',
    };

    const progress = makeQuestProgress(quest, 0);
    // 4 sets × 8 reps × 100kg = 3200kg
    const workout = makeWorkout([
      makeExerciseLog(squat, [
        { weightKg: 100, reps: 8 },
        { weightKg: 100, reps: 8 },
        { weightKg: 100, reps: 8 },
        { weightKg: 100, reps: 8 },
      ]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].currentProgress).toBe(3200);
  });

  // 9. Multiple goal quests in a single workout
  it('evaluates multiple goal quests independently in a single workout', () => {
    const heavyQuest: Quest = {
      id: 'q-heavy',
      title: 'Heavy Lifter',
      description: 'Heavy compound sets',
      type: 'DAILY',
      category: 'HEAVY_COMPOUND',
      targetValue: 5,
      unit: 'sets',
      xpReward: 200,
      badgeVariant: 'amber',
    };
    const caliQuest: Quest = {
      id: 'q-cali',
      title: 'Bodyweight Master',
      description: 'Calisthenics reps',
      type: 'WEEKLY',
      category: 'CALISTHENICS_REPS',
      targetValue: 50,
      unit: 'reps',
      xpReward: 350,
      badgeVariant: 'cyan',
    };
    const distanceQuest: Quest = {
      id: 'q-distance',
      title: 'Distance Runner',
      description: 'Cover distance',
      type: 'WEEKLY',
      category: 'TARGET_DISTANCE',
      targetValue: 5000,
      unit: 'meters',
      xpReward: 300,
      badgeVariant: 'emerald',
    };

    const quests = [
      makeQuestProgress(heavyQuest, 0),
      makeQuestProgress(caliQuest, 0),
      makeQuestProgress(distanceQuest, 0),
    ];

    const workout = makeWorkout([
      makeExerciseLog(squat, [
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
      ]),
      makeExerciseLog(pullUp, [
        { reps: 10 },
        { reps: 10 },
        { reps: 10 },
      ]),
      makeExerciseLog(running, [{ distanceMeters: 3000 }]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, quests);

    const heavyResult = result.updatedQuests.find(
      (q) => q.questId === 'q-heavy',
    )!;
    const caliResult = result.updatedQuests.find(
      (q) => q.questId === 'q-cali',
    )!;
    const distanceResult = result.updatedQuests.find(
      (q) => q.questId === 'q-distance',
    )!;

    expect(heavyResult.currentProgress).toBe(4);
    expect(caliResult.currentProgress).toBe(30);
    expect(distanceResult.currentProgress).toBe(3000);
  });

  // 10. Already completed quests are not re-evaluated
  it('does not re-evaluate already completed quests', () => {
    const quest: Quest = {
      id: 'q-done',
      title: 'Completed Quest',
      description: 'Already done',
      type: 'DAILY',
      category: 'HEAVY_COMPOUND',
      targetValue: 5,
      unit: 'sets',
      xpReward: 200,
      badgeVariant: 'amber',
    };

    const progress: UserQuestProgress = {
      ...makeQuestProgress(quest, 5),
      completed: true,
      completedAt: new Date().toISOString(),
    };

    const workout = makeWorkout([
      makeExerciseLog(squat, [
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
      ]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.updatedQuests[0].completed).toBe(true);
    expect(result.updatedQuests[0].currentProgress).toBe(5);
    expect(result.newlyCompletedQuests).toHaveLength(0);
  });

  // 11. Quest completion awards XP bonus
  it('awards XP bonus when a quest is completed', () => {
    const quest: Quest = {
      id: 'q-xp',
      title: 'XP Quest',
      description: 'Almost done',
      type: 'DAILY',
      category: 'HEAVY_COMPOUND',
      targetValue: 5,
      unit: 'sets',
      xpReward: 500,
      badgeVariant: 'violet',
    };

    const progress = makeQuestProgress(quest, 4);
    const workout = makeWorkout([
      makeExerciseLog(squat, [{ weightKg: 140, reps: 3 }]),
    ]);

    const result = QuestEngine.evaluateWorkoutForQuests(workout, [progress]);

    expect(result.totalQuestXpBonus).toBe(500);
    expect(result.newlyCompletedQuests).toHaveLength(1);
    expect(result.newlyCompletedQuests[0].questId).toBe('q-xp');
    expect(result.updatedQuests[0].completed).toBe(true);
    expect(result.updatedQuests[0].currentProgress).toBe(5);
  });
});
