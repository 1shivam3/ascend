import { describe, it, expect } from 'vitest';
import { XpEngine } from '../XpEngine';
import { MasteryEngine } from '../MasteryEngine';
import { AttributeEngine } from '../AttributeEngine';
import { getRankForLevel } from '../../../constants/ranks';
import { ExerciseMastery, SetLog, WorkoutSession } from '../../../types/domain.types';

describe('Decoupled RPG Progression — Multi-Dimensional Character Architecture', () => {
  it('demonstrates Global XP, Strength Attribute, Bench Mastery, Squat Mastery, and Deadlift Mastery on the same user and proves why they differ', () => {
    const userId = 'user-tactical-007';

    // -------------------------------------------------------------
    // SCENARIO:
    // Athlete is an avid bench press specialist who trains frequently,
    // squats occasionally, and rarely deadlifts.
    // -------------------------------------------------------------

    // 1. Initial State
    const initialAttributes = {
      strength: 10,
      endurance: 10,
      agility: 10,
      consistency: 10,
      stamina: 10,
      discipline: 10,
      vitality: 10,
    };

    // 2. Bench Press History (Heavy Specialization: 30 sessions, 120 sets, high tonnage)
    let benchMastery: ExerciseMastery | null = null;
    const benchSessions: WorkoutSession[] = [];
    let benchCumulativeSetsXp = 0;
    let benchCumulativeSessionXp = 0;

    for (let session = 1; session <= 30; session++) {
      const benchSets: SetLog[] = [
        {
          id: `bench-s1-${session}`,
          exerciseLogId: `el-bench-${session}`,
          userId,
          setNumber: 1,
          setType: 'NORMAL',
          weightKg: 100,
          reps: 6,
          rpe: 8,
          estimated1RmKg: 116,
          isPr: false,
          completed: true,
          completedAt: new Date(2026, 0, session).toISOString(),
        },
        {
          id: `bench-s2-${session}`,
          exerciseLogId: `el-bench-${session}`,
          userId,
          setNumber: 2,
          setType: 'NORMAL',
          weightKg: 105,
          reps: 5,
          rpe: 8.5,
          estimated1RmKg: 120,
          isPr: session % 10 === 0,
          completed: true,
          completedAt: new Date(2026, 0, session, 10, 5).toISOString(),
        },
        {
          id: `bench-s3-${session}`,
          exerciseLogId: `el-bench-${session}`,
          userId,
          setNumber: 3,
          setType: 'FAILURE',
          weightKg: 110,
          reps: 4,
          rpe: 10,
          estimated1RmKg: 121,
          isPr: session === 30,
          completed: true,
          completedAt: new Date(2026, 0, session, 10, 10).toISOString(),
        },
      ];

      const benchEval = MasteryEngine.evaluateMasteryUpdate(
        benchMastery,
        'ex-barbell-bench-press',
        userId,
        benchSets,
        session % 4
      );
      benchMastery = benchEval.updatedMastery;

      // Track global XP components
      for (const s of benchSets) {
        benchCumulativeSetsXp += XpEngine.calculateSetXp(s);
      }
      const sessionVol = benchSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
      benchCumulativeSessionXp += XpEngine.calculateSessionXp(sessionVol, 45, true);

      benchSessions.push({
        id: `w-bench-${session}`,
        userId,
        title: `Bench Focus #${session}`,
        startedAt: new Date(2026, 0, session, 9, 30).toISOString(),
        completedAt: new Date(2026, 0, session, 10, 15).toISOString(),
        durationSeconds: 2700,
        totalVolumeKg: sessionVol,
        totalReps: 15,
        totalSets: 3,
        status: 'COMPLETED',
        xpEarned: 250,
        exercises: [
          {
            id: `el-bench-${session}`,
            workoutId: `w-bench-${session}`,
            exerciseId: 'ex-barbell-bench-press',
            userId,
            orderIndex: 0,
            exercise: {
              id: 'ex-barbell-bench-press',
              name: 'Barbell Bench Press',
              slug: 'barbell-bench-press',
              primaryMuscle: 'Chest',
              secondaryMuscles: ['Triceps', 'Shoulders'],
              equipment: 'BARBELL',
              movementPattern: 'PUSH_HORIZONTAL',
              tier: 'COMPOUND_PRIMARY',
              isCustom: false,
            },
            sets: benchSets,
          },
        ],
      });
    }

    // 3. Squat History (Moderate Training: 6 sessions)
    let squatMastery: ExerciseMastery | null = null;
    const squatSessions: WorkoutSession[] = [];
    let squatCumulativeSetsXp = 0;
    let squatCumulativeSessionXp = 0;

    for (let session = 1; session <= 6; session++) {
      const squatSets: SetLog[] = [
        {
          id: `squat-s1-${session}`,
          exerciseLogId: `el-squat-${session}`,
          userId,
          setNumber: 1,
          setType: 'NORMAL',
          weightKg: 120,
          reps: 5,
          rpe: 7.5,
          estimated1RmKg: 138,
          isPr: false,
          completed: true,
          completedAt: new Date(2026, 1, session).toISOString(),
        },
        {
          id: `squat-s2-${session}`,
          exerciseLogId: `el-squat-${session}`,
          userId,
          setNumber: 2,
          setType: 'NORMAL',
          weightKg: 130,
          reps: 5,
          rpe: 8.5,
          estimated1RmKg: 146,
          isPr: session === 6,
          completed: true,
          completedAt: new Date(2026, 1, session, 10, 5).toISOString(),
        },
      ];

      const squatEval = MasteryEngine.evaluateMasteryUpdate(
        squatMastery,
        'ex-barbell-back-squat',
        userId,
        squatSets,
        1
      );
      squatMastery = squatEval.updatedMastery;

      for (const s of squatSets) {
        squatCumulativeSetsXp += XpEngine.calculateSetXp(s);
      }
      const sessionVol = squatSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
      squatCumulativeSessionXp += XpEngine.calculateSessionXp(sessionVol, 40, true);

      squatSessions.push({
        id: `w-squat-${session}`,
        userId,
        title: `Squat Day #${session}`,
        startedAt: new Date(2026, 1, session, 9, 30).toISOString(),
        completedAt: new Date(2026, 1, session, 10, 10).toISOString(),
        durationSeconds: 2400,
        totalVolumeKg: sessionVol,
        totalReps: 10,
        totalSets: 2,
        status: 'COMPLETED',
        xpEarned: 220,
        exercises: [
          {
            id: `el-squat-${session}`,
            workoutId: `w-squat-${session}`,
            exerciseId: 'ex-barbell-back-squat',
            userId,
            orderIndex: 0,
            exercise: {
              id: 'ex-barbell-back-squat',
              name: 'Barbell Back Squat',
              slug: 'barbell-back-squat',
              primaryMuscle: 'Quads',
              secondaryMuscles: ['Glutes'],
              equipment: 'BARBELL',
              movementPattern: 'SQUAT',
              tier: 'COMPOUND_PRIMARY',
              isCustom: false,
            },
            sets: squatSets,
          },
        ],
      });
    }

    // 4. Deadlift History (Neglected Movement: only 1 introductory session)
    let deadliftMastery: ExerciseMastery | null = null;
    const deadliftSets: SetLog[] = [
      {
        id: 'dl-s1',
        exerciseLogId: 'el-dl-1',
        userId,
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 80,
        reps: 5,
        rpe: 6,
        estimated1RmKg: 90,
        isPr: true,
        completed: true,
        completedAt: new Date(2026, 1, 15).toISOString(),
      },
    ];

    const deadliftEval = MasteryEngine.evaluateMasteryUpdate(
      deadliftMastery,
      'ex-barbell-deadlift',
      userId,
      deadliftSets,
      0
    );
    deadliftMastery = deadliftEval.updatedMastery;

    const deadliftSetsXp = XpEngine.calculateSetXp(deadliftSets[0]);
    const deadliftSessionXp = XpEngine.calculateSessionXp(400, 20, true);

    const deadliftSession: WorkoutSession = {
      id: 'w-dl-1',
      userId,
      title: 'Intro to Deadlift',
      startedAt: new Date(2026, 1, 15, 9, 30).toISOString(),
      completedAt: new Date(2026, 1, 15, 9, 50).toISOString(),
      durationSeconds: 1200,
      totalVolumeKg: 400,
      totalReps: 5,
      totalSets: 1,
      status: 'COMPLETED',
      xpEarned: 150,
      exercises: [
        {
          id: 'el-dl-1',
          workoutId: 'w-dl-1',
          exerciseId: 'ex-barbell-deadlift',
          userId,
          orderIndex: 0,
          exercise: {
            id: 'ex-barbell-deadlift',
            name: 'Barbell Conventional Deadlift',
            slug: 'barbell-deadlift',
            primaryMuscle: 'Hamstrings',
            secondaryMuscles: ['Back', 'Glutes'],
            equipment: 'BARBELL',
            movementPattern: 'HINGE',
            tier: 'COMPOUND_PRIMARY',
            isCustom: false,
          },
          sets: deadliftSets,
        },
      ],
    };

    // -------------------------------------------------------------
    // 5. EVALUATE GLOBAL XP, LEVEL & RANK
    // -------------------------------------------------------------
    const totalGlobalXp =
      benchCumulativeSetsXp +
      benchCumulativeSessionXp +
      squatCumulativeSetsXp +
      squatCumulativeSessionXp +
      deadliftSetsXp +
      deadliftSessionXp;

    const globalLevelInfo = XpEngine.getLevelInfo(totalGlobalXp);
    const globalRank = getRankForLevel(globalLevelInfo.level);

    // -------------------------------------------------------------
    // 6. EVALUATE STRENGTH ATTRIBUTE
    // -------------------------------------------------------------
    const allWorkouts = [...benchSessions, ...squatSessions, deadliftSession];
    const attributes = AttributeEngine.computeAttributes(initialAttributes, allWorkouts, 21);

    // -------------------------------------------------------------
    // 7. ASSERTIONS & DECOUPLING PROOFS
    // -------------------------------------------------------------

    expect(benchMastery).not.toBeNull();
    expect(squatMastery).not.toBeNull();
    expect(deadliftMastery).not.toBeNull();

    const bench = benchMastery!;
    const squat = squatMastery!;
    const deadlift = deadliftMastery!;

    // A. Global Level has ascended due to aggregate total tonnage across all 37 workouts
    expect(totalGlobalXp).toBeGreaterThan(6000);
    expect(globalLevelInfo.level).toBeGreaterThanOrEqual(5);
    expect(['E', 'D', 'C']).toContain(globalRank.tier);

    // B. Bench Mastery reflects intense movement specialization
    expect(bench.totalSessions).toBe(30);
    expect(bench.masteryLevel).toBeGreaterThanOrEqual(6);
    expect(bench.masteryXp).toBeGreaterThan(3000);
    expect(bench.estimated1RmKg).toBeCloseTo(124.7, 1);
    expect(bench.bestWeightKg).toBe(110);

    // C. Squat Mastery reflects moderate development
    expect(squat.totalSessions).toBe(6);
    expect(squat.masteryLevel).toBeGreaterThanOrEqual(2);
    expect(squat.masteryLevel).toBeLessThan(bench.masteryLevel);
    expect(squat.masteryXp).toBeLessThan(bench.masteryXp);

    // D. Deadlift Mastery reflects near-zero practice (independent isolated progression)
    expect(deadlift.totalSessions).toBe(1);
    expect(deadlift.masteryLevel).toBe(2); // Level 2 after first session (124 XP > 100 XP Level 1 requirement)
    expect(deadlift.masteryXp).toBeLessThan(400);

    // E. Decoupling Guarantee 1: Bench Mastery Level != Squat Mastery Level != Deadlift Mastery Level
    expect(bench.masteryLevel).not.toBe(squat.masteryLevel);
    expect(bench.masteryLevel).not.toBe(deadlift.masteryLevel);
    expect(squat.masteryLevel).not.toBe(deadlift.masteryLevel);
    expect(bench.masteryLevel).toBeGreaterThan(squat.masteryLevel);
    expect(squat.masteryLevel).toBeGreaterThan(deadlift.masteryLevel);

    // F. Decoupling Guarantee 2: Global Level != Any Individual Movement Mastery Level
    // Global Level advances from ANY workout/exercise, whereas Mastery Level is per-movement
    expect(globalLevelInfo.level).not.toBe(bench.masteryLevel);
    expect(globalLevelInfo.level).not.toBe(deadlift.masteryLevel);

    // G. Decoupling Guarantee 3: Strength Attribute != Global Level != Mastery Level
    // Strength is a continuous 10-100 rating based on rolling heavy compound tonnage and Wilks
    expect(attributes.strength).toBeGreaterThan(initialAttributes.strength);
    expect(attributes.strength).toBeGreaterThanOrEqual(25);
    expect(attributes.strength).not.toBe(globalLevelInfo.level);
    expect(attributes.strength).not.toBe(bench.masteryLevel);

    // H. SQLite schema aliases verified on all masteries
    expect(bench.user_id).toBe(userId);
    expect(bench.exercise_id).toBe('ex-barbell-bench-press');
    expect(bench.mastery_level).toBe(bench.masteryLevel);
    expect(bench.estimated_1rm).toBe(bench.estimated1RmKg);
    expect(bench.total_sessions).toBe(30);
    expect(bench.last_performed_at).toBeDefined();

    expect(deadlift.user_id).toBe(userId);
    expect(deadlift.exercise_id).toBe('ex-barbell-deadlift');
    expect(deadlift.mastery_level).toBe(deadlift.masteryLevel);
    expect(deadlift.total_sessions).toBe(1);
  });
});
