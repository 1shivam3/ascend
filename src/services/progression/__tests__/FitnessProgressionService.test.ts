import { describe, it, expect } from 'vitest';
import { FitnessProgressionService } from '../FitnessProgressionService';
import { ReliableDataEngine } from '../ReliableDataEngine';
import { AttributeEngine } from '../AttributeEngine';
import { XpEngine } from '../XpEngine';
import { PROGRESSION_CONFIG } from '../../../config/progression.config';
import { CharacterAttributes, SetLog, WorkoutSession } from '../../../types/domain.types';

describe('ASCEND — Unified Fitness Progression System', () => {
  const baseAttributes: CharacterAttributes = {
    strength: 25,
    endurance: 22,
    mobility: 20,
    consistency: 30,
    agility: 20,
    stamina: 22,
    discipline: 30,
    vitality: 25,
  };

  describe('1. Unified Level and Rank Architecture', () => {
    it('correctly qualifies an athlete for D-Rank Novice when level and dimensional criteria are met', () => {
      // Level 12 (D-Rank is levels 10-24)
      const totalXp = XpEngine.getXpRequiredForLevel(12);

      const status = FitnessProgressionService.evaluateUnifiedProgression({
        totalXp,
        attributes: {
          ...baseAttributes,
          strength: 25, // D requires 20
          endurance: 20, // D requires 18
          mobility: 18, // D requires 15
          consistency: 28, // D requires 25
        },
        verifiedSessionsCount: 5,
        athleteBodyweightKg: 75,
        maxRelativeCompoundRatio: 0.9, // D requires 0.75x BW
      });

      expect(status.currentLevel).toBe(12);
      expect(status.effectiveRank.tier).toBe('D');
      expect(status.effectiveRank.title).toBe('D-Rank Novice');
      expect(status.ascensionBlocked).toBe(false);
      expect(status.confirmationStatus).toBe('CONFIRMED');
    });

    it('prevents premature rank ascension when an athlete grinds level through consistency without physical performance (Ascension Gate)', () => {
      // Level 65 (Normally qualifies for Rank A Elite on level alone)
      const totalXp = XpEngine.getXpRequiredForLevel(65);

      // But athlete has low strength, low mobility, low relative strength
      const laggingAttributes: CharacterAttributes = {
        strength: 38, // Rank A requires 65; Rank B requires 50; Rank C requires 35
        endurance: 35, // Rank A requires 60; Rank B requires 45; Rank C requires 30
        mobility: 22, // Rank A requires 50; Rank B requires 35; Rank C requires 25 (fails C mobility!)
        consistency: 90, // Massive consistency grind!
        agility: 22,
        stamina: 35,
        discipline: 90,
        vitality: 60,
      };

      const status = FitnessProgressionService.evaluateUnifiedProgression({
        totalXp,
        attributes: laggingAttributes,
        verifiedSessionsCount: 50,
        athleteBodyweightKg: 75,
        maxRelativeCompoundRatio: 0.8, // Rank A requires 1.6x BW
      });

      expect(status.currentLevel).toBe(65);
      expect(status.nominalRank.tier).toBe('A'); // Level alone would be A
      expect(status.effectiveRank.tier).toBe('D'); // Held back because Mobility 22 < 25 required for C!
      expect(status.ascensionBlocked).toBe(true);
      expect(status.blockedReasons.length).toBeGreaterThan(0);
      expect(status.blockedReasons[0]).toContain('Mobility');
    });

    it('promotes athlete to B-Rank Skilled once both level and physical criteria are achieved', () => {
      const totalXp = XpEngine.getXpRequiredForLevel(48);

      const status = FitnessProgressionService.evaluateUnifiedProgression({
        totalXp,
        attributes: {
          strength: 55, // B requires 50
          endurance: 50, // B requires 45
          mobility: 40, // B requires 35
          consistency: 60, // B requires 55
          agility: 40,
          stamina: 50,
          discipline: 60,
          vitality: 55,
        },
        verifiedSessionsCount: 20,
        athleteBodyweightKg: 75,
        maxRelativeCompoundRatio: 1.35, // B requires 1.25x BW
      });

      expect(status.currentLevel).toBe(48);
      expect(status.effectiveRank.tier).toBe('B');
      expect(status.effectiveRank.title).toBe('B-Rank Skilled');
      expect(status.ascensionBlocked).toBe(false);
    });
  });

  describe('2. Strict Login Rule (Zero XP on Visiting or Opening App)', () => {
    it('guarantees 0 XP is awarded when calculating workout session with empty sets or 0 duration', () => {
      const emptyWorkout: Partial<WorkoutSession> = {
        status: 'ACTIVE',
        durationSeconds: 0,
        exercises: [],
      };

      const evalResult = XpEngine.evaluateWorkoutSessionXp(emptyWorkout, 0);
      expect(evalResult.xpEarned).toBe(0);
      expect(evalResult.qualifying).toBe(false);
    });

    it('asserts that uncompleted sets yield strictly 0 XP', () => {
      const uncompletedSet: Pick<SetLog, 'setType' | 'rpe' | 'completed' | 'reps' | 'weightKg'> = {
        setType: 'NORMAL',
        rpe: 8,
        completed: false,
        reps: 10,
        weightKg: 100,
      };

      expect(XpEngine.calculateSetXp(uncompletedSet)).toBe(0);
    });
  });

  describe('3. Multi-Dimensional Fitness Model & Attribute Engine', () => {
    it('independently computes Mobility alongside Strength, Endurance, and Consistency', () => {
      const mobilityWorkout: WorkoutSession = {
        id: 'w-mob-1',
        userId: 'test-user',
        title: 'Full Body Mobility & Range of Motion',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationSeconds: 1200,
        totalVolumeKg: 500,
        totalReps: 40,
        totalSets: 4,
        xpEarned: 150,
        exercises: [
          {
            id: 'el-1',
            workoutId: 'w-mob-1',
            exerciseId: 'ex-stretch',
            userId: 'test-user',
            orderIndex: 0,
            sets: [
              {
                id: 's-1',
                exerciseLogId: 'el-1',
                userId: 'test-user',
                setNumber: 1,
                setType: 'WARMUP',
                weightKg: 0,
                reps: 15,
                rpe: 6,
                estimated1RmKg: 0,
                isPr: false,
                completed: true,
                completedAt: new Date().toISOString(),
              },
              {
                id: 's-2',
                exerciseLogId: 'el-1',
                userId: 'test-user',
                setNumber: 2,
                setType: 'NORMAL',
                weightKg: 20,
                reps: 12,
                rpe: 7,
                estimated1RmKg: 0,
                isPr: false,
                completed: true,
                completedAt: new Date().toISOString(),
              },
            ],
            exercise: {
              id: 'ex-stretch',
              name: 'Thoracic Mobility & Deep Squat Stretch',
              slug: 'thoracic-mobility-deep-squat-stretch',
              primaryMuscle: 'Core',
              secondaryMuscles: [],
              progressionType: 'MOBILITY',
              movementPattern: 'SQUAT',
              tier: 'ACCESSORY',
              difficulty: 'BEGINNER',
              equipment: 'BODYWEIGHT',
              isCustom: false,
            },
          },
        ],
      };

      const computed = AttributeEngine.computeAttributes(
        baseAttributes,
        [mobilityWorkout],
        5,
        1,
        1,
        75
      );

      expect(computed.mobility).toBeGreaterThan(baseAttributes.mobility!);
      expect(computed.consistency).toBeGreaterThanOrEqual(baseAttributes.consistency);
      expect(computed.strength).toBeDefined();
      expect(computed.endurance).toBeDefined();
    });

    it('identifies top strengths and targeted areas for improvement', () => {
      const attributes: CharacterAttributes = {
        strength: 75,
        endurance: 40,
        mobility: 15,
        consistency: 85,
        agility: 20,
        stamina: 40,
        discipline: 85,
        vitality: 50,
      };

      const { topStrength, areaForImprovement } =
        FitnessProgressionService.analyzeStrengthsAndWeaknesses(attributes, []);

      expect(topStrength.dimension).toBe('consistency');
      expect(topStrength.score).toBe(85);
      expect(areaForImprovement.dimension).toBe('mobility');
      expect(areaForImprovement.score).toBe(15);
      expect(areaForImprovement.actionRecommendation).toContain('mobility');
    });
  });

  describe('4. Data Classification (Tested 1RM vs Estimated 1RM vs Working Sets)', () => {
    it('classifies a single repetition at high RPE as TESTED_1RM', () => {
      const set: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed'> = {
        weightKg: 140,
        reps: 1,
        rpe: 9.5,
        setType: 'NORMAL',
        completed: true,
      };

      const result = ReliableDataEngine.classifySetPerformance(set, { supports1Rm: true });
      expect(result.metricType).toBe('TESTED_1RM');
      expect(result.valueKg).toBe(140);
      expect(result.is1RmEligible).toBe(true);
    });

    it('classifies submaximal sets up to 10 reps as ESTIMATED_1RM', () => {
      const set: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed'> = {
        weightKg: 100,
        reps: 5,
        rpe: 8,
        setType: 'NORMAL',
        completed: true,
      };

      const result = ReliableDataEngine.classifySetPerformance(set, { supports1Rm: true });
      expect(result.metricType).toBe('ESTIMATED_1RM');
      // Epley: 100 * (1 + 5/30) = 116.7
      expect(result.valueKg).toBe(116.7);
      expect(result.is1RmEligible).toBe(true);
    });

    it('excludes sets with > 10 reps from 1RM estimation to avoid fatigue distortions', () => {
      const highRepSet: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed'> = {
        weightKg: 60,
        reps: 20,
        rpe: 9,
        setType: 'NORMAL',
        completed: true,
      };

      const result = ReliableDataEngine.classifySetPerformance(highRepSet, { supports1Rm: true });
      expect(result.metricType).toBe('ENDURANCE_SET');
      expect(result.is1RmEligible).toBe(false);
      expect(result.explanation).toContain('High-repetition volume set');
    });
  });

  describe('5. Outlier Detection & Anti-Spike Protection', () => {
    it('flags impossible loads exceeding 500kg', () => {
      const check = ReliableDataEngine.detectAnomalousOutlier(750, 1, 80);
      expect(check.isOutlier).toBe(true);
      expect(check.reason).toContain('physiological threshold');
      expect(check.sanitizedWeightKg).toBe(500);
    });

    it('flags extreme impossible relative strength loads (>3.5x BW for upper body)', () => {
      // 70kg athlete logging 280kg bench press (4.0x BW)
      const check = ReliableDataEngine.detectAnomalousOutlier(
        280,
        1,
        70,
        { movementPattern: 'PUSH_HORIZONTAL', tier: 'COMPOUND_PRIMARY' }
      );
      expect(check.isOutlier).toBe(true);
      expect(check.reason).toContain('extreme relative strength ratio');
    });

    it('flags sudden single-session 1RM spikes over established baseline (>30% and >40kg)', () => {
      // Established bench 1RM is 100kg. User suddenly logs 160kg x 3 (e1RM ~ 176kg -> +76kg / +76%)
      const check = ReliableDataEngine.detectAnomalousOutlier(
        160,
        3,
        80,
        { movementPattern: 'PUSH_HORIZONTAL', tier: 'COMPOUND_PRIMARY' },
        100
      );
      expect(check.isOutlier).toBe(true);
      expect(check.reason).toContain('exceeds anomaly threshold');
    });

    it('allows natural progressive overload increments (+5kg)', () => {
      // Established bench 1RM is 100kg. User logs 102.5kg x 1
      const check = ReliableDataEngine.detectAnomalousOutlier(
        102.5,
        1,
        80,
        { movementPattern: 'PUSH_HORIZONTAL', tier: 'COMPOUND_PRIMARY' },
        100
      );
      expect(check.isOutlier).toBe(false);
    });
  });

  describe('6. Provisional Rank Handling', () => {
    it('marks athlete with < 3 verified sessions as PROVISIONAL', () => {
      const check = ReliableDataEngine.getVerificationStatus(2);
      expect(check.status).toBe('PROVISIONAL');
      expect(check.isProvisional).toBe(true);
      expect(check.sessionsRemaining).toBe(1);
      expect(check.message).toContain('Provisional');
    });

    it('marks athlete with >= 3 verified sessions as CONFIRMED', () => {
      const check = ReliableDataEngine.getVerificationStatus(3);
      expect(check.status).toBe('CONFIRMED');
      expect(check.isProvisional).toBe(false);
      expect(check.sessionsRemaining).toBe(0);
      expect(check.message).toContain('Confirmed');
    });
  });

  describe('7. Creative RPG Rank Structure & Configurable Thresholds', () => {
    it('verifies the 8 canonical rank titles match the requested structure', () => {
      const ranks = PROGRESSION_CONFIG.ranks;

      expect(ranks.E.title).toBe('E-Rank Initiate');
      expect(ranks.D.title).toBe('D-Rank Novice');
      expect(ranks.C.title).toBe('C-Rank Adept');
      expect(ranks.B.title).toBe('B-Rank Skilled');
      expect(ranks.A.title).toBe('A-Rank Elite');
      expect(ranks.S.title).toBe('S-Rank Master');
      expect(ranks.SS.title).toBe('SS-Rank Grandmaster');
      expect(ranks.SSS.title).toBe('SSS-Rank Mythic');
    });

    it('computes exact next milestone roadmap requirements toward the next rank', () => {
      const milestone = FitnessProgressionService.getNextMilestoneRequirements(
        15,
        'D',
        {
          strength: 25,
          endurance: 22,
          mobility: 18,
          consistency: 30,
          agility: 18,
          stamina: 22,
          discipline: 30,
          vitality: 25,
        },
        0.85
      );

      expect(milestone.nextRankTier).toBe('C');
      expect(milestone.nextRankTitle).toBe('C-Rank Adept');
      expect(milestone.levelProgress.required).toBe(25);
      expect(milestone.dimensions.length).toBe(4);
      expect(milestone.summaryMessage).toBeDefined();
    });
  });
});
