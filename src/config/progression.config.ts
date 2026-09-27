export type RankTier = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface DimensionalRequirements {
  strength: number;
  endurance: number;
  mobility: number;
  consistency: number;
  minRelativeStrength?: number; // Relative strength to bodyweight ratio (e.g. 1.25x BW)
}

export interface RankDefinition {
  tier: RankTier;
  title: string;
  minLevel: number;
  maxLevel: number;
  color: string;
  badgeGlyph: string;
  description: string;
  minRequirements: DimensionalRequirements;
}

export const PROGRESSION_CONFIG = {
  // Global Character XP & Level Curve
  globalXp: {
    baseMultiplier: 500,
    exponent: 1.25,
    getXpForNextLevel: (level: number): number => {
      const safeLevel = Math.max(1, Math.floor(level));
      return Math.round(
        PROGRESSION_CONFIG.globalXp.baseMultiplier *
          Math.pow(safeLevel, PROGRESSION_CONFIG.globalXp.exponent)
      );
    },
    baseSetXp: 15,
    failureSetBonus: 10,
    dropSetBonus: 5,
    warmupSetMultiplier: 0.2,
    rpeBonusPerPoint: 2, // Extra XP for RPE >= 6: (rpe - 5) * 2
    sessionBaseXp: 120,
    sessionVolumeDivisor: 500, // +10 XP per 500kg volume
    sessionDurationDivisor: 10, // +8 XP per 10 min duration
    maxSessionXpCap: 500,
  },

  // Ranks (E, D, C, B, A, S, SS, SSS) with explicit configurable level & dimensional thresholds
  ranks: {
    E: {
      tier: 'E',
      title: 'E-Rank Initiate',
      minLevel: 1,
      maxLevel: 9,
      color: '#94A3B8', // Steel Gray
      badgeGlyph: '🔰',
      description: 'Foundational awakening. Muscular adaptation and movement recruitment initiating.',
      minRequirements: {
        strength: 10,
        endurance: 10,
        mobility: 10,
        consistency: 10,
        minRelativeStrength: 0.5,
      },
    },
    D: {
      tier: 'D',
      title: 'D-Rank Novice',
      minLevel: 10,
      maxLevel: 24,
      color: '#10B981', // Matrix Emerald
      badgeGlyph: '⚔️',
      description: 'Disciplined practitioner. Solid command of barbell, dumbbell, and bodyweight fundamentals.',
      minRequirements: {
        strength: 20,
        endurance: 18,
        mobility: 15,
        consistency: 25,
        minRelativeStrength: 0.75,
      },
    },
    C: {
      tier: 'C',
      title: 'C-Rank Adept',
      minLevel: 25,
      maxLevel: 44,
      color: '#0EA5E9', // Sapphire Sky
      badgeGlyph: '🛡️',
      description: 'Hardened iron lifter. Substantial progressive overload, volume capacity, and movement control.',
      minRequirements: {
        strength: 35,
        endurance: 30,
        mobility: 25,
        consistency: 40,
        minRelativeStrength: 1.0,
      },
    },
    B: {
      tier: 'B',
      title: 'B-Rank Skilled',
      minLevel: 45,
      maxLevel: 64,
      color: '#2563EB', // Cobalt Royal Blue
      badgeGlyph: '⚡',
      description: 'Veteran operator. Advanced periodization, high work capacity, and consistent compound mastery.',
      minRequirements: {
        strength: 50,
        endurance: 45,
        mobility: 35,
        consistency: 55,
        minRelativeStrength: 1.25,
      },
    },
    A: {
      tier: 'A',
      title: 'A-Rank Elite',
      minLevel: 65,
      maxLevel: 79,
      color: '#8B5CF6', // Hyper Violet
      badgeGlyph: '🦅',
      description: 'Apex lifter. Elite neuromuscular efficiency, exceptional relative strength, and rapid recovery.',
      minRequirements: {
        strength: 65,
        endurance: 60,
        mobility: 50,
        consistency: 70,
        minRelativeStrength: 1.6,
      },
    },
    S: {
      tier: 'S',
      title: 'S-Rank Master',
      minLevel: 80,
      maxLevel: 89,
      color: '#F59E0B', // Solar Amber
      badgeGlyph: '👑',
      description: 'National-class athletic force. Supreme physical dominance, resilience, and conditioning.',
      minRequirements: {
        strength: 80,
        endurance: 75,
        mobility: 65,
        consistency: 80,
        minRelativeStrength: 2.0,
      },
    },
    SS: {
      tier: 'SS',
      title: 'SS-Rank Grandmaster',
      minLevel: 90,
      maxLevel: 99,
      color: '#EF4444', // Berserk Crimson
      badgeGlyph: '🔥',
      description: 'Legendary physical power. Operating near human physiological peak with total athletic balance.',
      minRequirements: {
        strength: 90,
        endurance: 85,
        mobility: 75,
        consistency: 90,
        minRelativeStrength: 2.3,
      },
    },
    SSS: {
      tier: 'SSS',
      title: 'SSS-Rank Mythic',
      minLevel: 100,
      maxLevel: 999,
      color: '#E11D48', // Deep Rose Ruby
      badgeGlyph: '🌌',
      description: 'Transcendence of limits. Absolute athletic mastery, strength-to-weight dominance, and dedication.',
      minRequirements: {
        strength: 95,
        endurance: 90,
        mobility: 85,
        consistency: 95,
        minRelativeStrength: 2.6,
      },
    },
  } as Record<RankTier, RankDefinition>,

  // 4-Core Attributes Contribution Rules (Strength, Endurance, Mobility, Consistency)
  attributes: {
    minAttributeScore: 10,
    maxAttributeScore: 100,
    strength: {
      logDivisor: 25000,
      volumeMultiplier: 28,
      wilksScale: 2.5,
      wilksMultiplier: 14,
      relativeStrengthMultiplier: 20,
    },
    endurance: {
      repsDivisor: 2000,
      repsMultiplier: 30,
      densityDivisor: 120, // kg per minute
      densityMultiplier: 20,
    },
    mobility: {
      mobilitySessionMultiplier: 25,
      warmupMobilityMultiplier: 15,
      unilateralRatioMultiplier: 25,
      activeRecoveryBonus: 20,
    },
    agility: {
      bodyweightRatioMultiplier: 40,
      unilateralRatioMultiplier: 30,
    },
    consistency: {
      streakDaysDivisor: 30,
      streakMultiplier: 45,
      baseAdherenceBonus: 30,
    },
  },

  // Data Reliability, Classification & Anti-Spike Safeguards
  dataReliability: {
    minVerifiedSessionsForConfirmedRank: 3, // <= 2 sessions is PROVISIONAL
    maxRepsForEstimated1RM: 10,            // sets > 10 reps cannot estimate 1RM
    maxPlausibleSingleSetWeightKg: 500,    // Hard cap for weight input
    maxRelativeStrengthMultiplierUpper: 3.5, // e.g. Bench/OHP > 3.5x BW is outlier
    maxRelativeStrengthMultiplierLower: 4.5, // e.g. Squat/Deadlift > 4.5x BW is outlier
    maxSingleSession1RmJumpPercent: 30,     // Jump > 30% in single session is suspicious
    maxSingleSession1RmJumpKg: 40,          // AND leap > 40kg
  },

  // Exercise Mastery Curves & Multipliers
  mastery: {
    baseMultiplier: 100,
    exponent: 1.25,
    baseOffset: 0,
    getXpForNextLevel: (level: number): number => {
      const safeLevel = Math.max(1, Math.floor(level));
      return Math.round(
        PROGRESSION_CONFIG.mastery.baseMultiplier *
          Math.pow(safeLevel, PROGRESSION_CONFIG.mastery.exponent)
      );
    },
    maxLevel: 999,
    baseSetXp: 20,
    heavySetBonus: 8,
    heavySetThresholdRatio: 0.8, // >= 80% baseline 1RM
    volumeDivisor: 100, // +1 XP per 100 kg volume lifted
    prBonus: 50, // PR bonus XP
    prEventBonusXp: 50,
    repsMultiplier: 12,
    minNormalizerKg: 20, // Default bar weight if athlete baseline 1RM is unknown
    failureMultiplier: 1.25,
    dropMultiplier: 0.85,
    warmupMultiplier: 0.2,
    normalMultiplier: 1.0,
    consecutiveWeeksBonusPerWeek: 50,
    maxConsecutiveWeeksBonus: 200, // Capped at 4 weeks
    exerciseRanks: {
      E: { tier: 'E', minLevel: 1, maxLevel: 10, color: '#94A3B8', title: 'E-Rank Lift' },
      D: { tier: 'D', minLevel: 11, maxLevel: 20, color: '#10B981', title: 'D-Rank Lift' },
      C: { tier: 'C', minLevel: 21, maxLevel: 30, color: '#0EA5E9', title: 'C-Rank Lift' },
      B: { tier: 'B', minLevel: 31, maxLevel: 40, color: '#2563EB', title: 'B-Rank Lift' },
      A: { tier: 'A', minLevel: 41, maxLevel: 50, color: '#8B5CF6', title: 'A-Rank Lift' },
      S: { tier: 'S', minLevel: 51, maxLevel: 60, color: '#F59E0B', title: 'S-Rank Lift' },
      SS: { tier: 'SS', minLevel: 61, maxLevel: 80, color: '#EF4444', title: 'SS-Rank Lift' },
      SSS: { tier: 'SSS', minLevel: 81, maxLevel: 999, color: '#E11D48', title: 'SSS-Rank Lift' },
    } as Record<RankTier, { tier: RankTier; minLevel: number; maxLevel: number; color: string; title: string }>,
  },

  // Anti-Exploit Constraints
  antiExploit: {
    minSessionDurationSeconds: 180, // Minimum 3 minutes for valid session XP
    minSetsRequired: 1, // Must contain at least 1 completed non-warmup set
    minVolumeKg: 1.0, // Cannot be 0 kg volume
    duplicateSetWindowSeconds: 30, // Identical sets logged within 30s are ignored
    minWorkoutIntervalSeconds: 900, // 15 minutes cooldown between awarded workouts
    maxDailyAwardedWorkouts: 4, // Max sessions per day that can award XP
    maxSingleSetWeightKg: 500, // Sanity cap for weight input
    maxSingleSetReps: 100, // Sanity cap for reps
    maxSingleSetMasteryXp: 150, // Per-set cap to prevent giant spikes
  },

  // Streak Configuration
  streak: {
    bonusMultiplierPerDay: 0.02, // +2% XP per day
    maxStreakMultiplier: 1.3, // Up to +30% boost
    daysPerFreezeTokenEarned: 14, // Earn 1 freeze token every 14 streak days
    maxFreezeTokensHeld: 2,
    qualifyingSetTypes: ['NORMAL', 'DROP', 'FAILURE'],
  },
} as const;
