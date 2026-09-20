import { PROGRESSION_CONFIG, RankTier, RankDefinition } from '../config/progression.config';

export type { RankTier, RankDefinition };

export const RANKS = PROGRESSION_CONFIG.ranks;

export const MASTERY_TIERS = [
  { minLevel: 1, maxLevel: 19, title: 'Novice', color: '#94A3B8' },
  { minLevel: 20, maxLevel: 39, title: 'Apprentice', color: '#10B981' },
  { minLevel: 40, maxLevel: 59, title: 'Specialist', color: '#00F0FF' },
  { minLevel: 60, maxLevel: 79, title: 'Master', color: '#8B5CF6' },
  { minLevel: 80, maxLevel: 99, title: 'Grandmaster', color: '#FFB800' },
  { minLevel: 100, maxLevel: 999, title: 'Paragon', color: '#FF3366' },
] as const;

/**
 * Deterministically determines Rank Tier (E, D, C, B, A, S, SS, SSS) and Division (IV, III, II, I)
 * from explicit configurable thresholds in PROGRESSION_CONFIG.
 */
export function getRankForLevel(level: number): {
  tier: RankTier;
  division: number;
  definition: RankDefinition;
} {
  const safeLevel = Math.max(1, Math.floor(level));

  const rankEntries = Object.values(PROGRESSION_CONFIG.ranks) as RankDefinition[];
  let matchedRank = rankEntries.find(r => safeLevel >= r.minLevel && safeLevel <= r.maxLevel);

  if (!matchedRank) {
    if (safeLevel >= 100) {
      matchedRank = PROGRESSION_CONFIG.ranks.SSS;
    } else {
      matchedRank = PROGRESSION_CONFIG.ranks.E;
    }
  }

  // SSS-Rank represents ultimate ascension (single division)
  if (matchedRank.tier === 'SSS') {
    return { tier: matchedRank.tier, division: 1, definition: matchedRank };
  }

  // Calculate division IV, III, II, I across tier level span
  const span = Math.max(1, matchedRank.maxLevel - matchedRank.minLevel + 1);
  const offset = safeLevel - matchedRank.minLevel;
  const step = Math.max(1, Math.ceil(span / 4));
  const divIndex = Math.min(3, Math.floor(offset / step));
  const division = 4 - divIndex;

  return { tier: matchedRank.tier, division, definition: matchedRank };
}

export function getMasteryTierForLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(level));
  const found = MASTERY_TIERS.find(t => safeLevel >= t.minLevel && safeLevel <= t.maxLevel);
  return found || MASTERY_TIERS[MASTERY_TIERS.length - 1];
}

export function getExerciseRankFromLevel(level: number): {
  tier: RankTier;
  color: string;
  title: string;
} {
  const safeLevel = Math.max(1, Math.floor(level));
  const ranks = PROGRESSION_CONFIG.mastery.exerciseRanks;

  if (safeLevel <= 10) return ranks.E;
  if (safeLevel <= 20) return ranks.D;
  if (safeLevel <= 30) return ranks.C;
  if (safeLevel <= 40) return ranks.B;
  if (safeLevel <= 50) return ranks.A;
  if (safeLevel <= 60) return ranks.S;
  if (safeLevel <= 80) return ranks.SS;
  return ranks.SSS;
}

