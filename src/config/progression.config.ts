export type RankTier = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface RankDefinition {
  tier: RankTier;
  title: string;
  minLevel: number;
  maxLevel: number;
  color: string;
  badgeGlyph: string;
  description: string;
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

  // Ranks (E, D, C, B, A, S, SS, SSS) with explicit configurable level thresholds
  ranks: {
    E: {
      tier: 'E',
      title: 'E-Rank Initiate',
      minLevel: 1,
      maxLevel: 9,
      color: '#94A3B8', // Steel Gray
      badgeGlyph: '🔰',
      description: 'Foundational awakening. Muscular adaptation and neural recruitment initiating.',
    },
    D: {
      tier: 'D',
      title: 'D-Rank Vanguard',
      minLevel: 10,
      maxLevel: 24,
      color: '#10B981', // Matrix Emerald
      badgeGlyph: '⚔️',
      description: 'Disciplined practitioner. Solid command of multi-joint barbell fundamentals.',
    },
    C: {
      tier: 'C',
      title: 'C-Rank Centurion',
      minLevel: 25,
      maxLevel: 44,
      color: '#00F0FF', // Electric Cyan
      badgeGlyph: '🛡️',
      description: 'Hardened iron lifter. Substantial progressive overload and tonnage capacity.',
    },
    B: {
      tier: 'B',
      title: 'B-Rank Veteran',
      minLevel: 45,
      maxLevel: 64,
      color: '#0070F3', // Deep Blue
      badgeGlyph: '⚡',
      description: 'Veteran operator. Advanced periodization and consistent compound mastery.',
    },
    A: {
      tier: 'A',
      title: 'A-Rank Commander',
      minLevel: 65,
      maxLevel: 79,
      color: '#8B5CF6', // Hyper Violet
      badgeGlyph: '🦅',
      description: 'Apex lifter. Elite neuromuscular efficiency, volume tolerance, and speed.',
    },
    S: {
      tier: 'S',
      title: 'S-Rank Sovereign',
      minLevel: 80,
      maxLevel: 89,
      color: '#F59E0B', // Solar Amber
      badgeGlyph: '👑',
      description: 'National-class athletic force. Supreme physical dominance and resilience.',
    },
    SS: {
      tier: 'SS',
      title: 'SS-Rank Overlord',
      minLevel: 90,
      maxLevel: 99,
      color: '#EF4444', // Berserk Crimson
      badgeGlyph: '🔥',
      description: 'Legendary power. Operating near human physiological threshold.',
    },
    SSS: {
      tier: 'SSS',
      title: 'SSS-Rank Ascendant',
      minLevel: 100,
      maxLevel: 999,
      color: '#FF0055', // Celestial Neon
      badgeGlyph: '🌌',
      description: 'Transcendence of limits. Absolute athletic mastery realized.',
    },
  } as Record<RankTier, RankDefinition>,

  // 4-Core Attributes Contribution Rules
  attributes: {
    minAttributeScore: 10,
    maxAttributeScore: 100,
    strength: {
      logDivisor: 25000,
      volumeMultiplier: 28,
      wilksScale: 2.5,
      wilksMultiplier: 14,
    },
    endurance: {
      repsDivisor: 2000,
      repsMultiplier: 30,
      densityDivisor: 120, // kg per minute
      densityMultiplier: 20,
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
      C: { tier: 'C', minLevel: 21, maxLevel: 30, color: '#00F0FF', title: 'C-Rank Lift' },
      B: { tier: 'B', minLevel: 31, maxLevel: 40, color: '#0070F3', title: 'B-Rank Lift' },
      A: { tier: 'A', minLevel: 41, maxLevel: 50, color: '#8B5CF6', title: 'A-Rank Lift' },
      S: { tier: 'S', minLevel: 51, maxLevel: 60, color: '#F59E0B', title: 'S-Rank Lift' },
      SS: { tier: 'SS', minLevel: 61, maxLevel: 80, color: '#EF4444', title: 'SS-Rank Lift' },
      SSS: { tier: 'SSS', minLevel: 81, maxLevel: 999, color: '#FF0055', title: 'SSS-Rank Lift' },
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
