import { RankTier } from '../types/domain.types';

export interface RankDefinition {
  tier: RankTier;
  title: string;
  minLevel: number;
  maxLevel: number;
  color: string;
  description: string;
}

export const RANKS: Record<RankTier, RankDefinition> = {
  INITIATE: {
    tier: 'INITIATE',
    title: 'Initiate',
    minLevel: 1,
    maxLevel: 19,
    color: '#94A3B8', // Steel
    description: 'The foundation of discipline. Awakening physical potential.',
  },
  ADEPT: {
    tier: 'ADEPT',
    title: 'Adept',
    minLevel: 20,
    maxLevel: 39,
    color: '#10B981', // Matrix Emerald
    description: 'Consistent execution. Biomechanical precision emerging.',
  },
  VANGUARD: {
    tier: 'VANGUARD',
    title: 'Vanguard',
    minLevel: 40,
    maxLevel: 59,
    color: '#00F0FF', // Electric Cyan
    description: 'Frontline iron capability. Demonstrates dominant power and work capacity.',
  },
  CENTURION: {
    tier: 'CENTURION',
    title: 'Centurion',
    minLevel: 60,
    maxLevel: 79,
    color: '#8B5CF6', // Hyper Violet
    description: 'Master of the physical vessel. Elite volume resistance and progressive overload.',
  },
  SOVEREIGN: {
    tier: 'SOVEREIGN',
    title: 'Sovereign',
    minLevel: 80,
    maxLevel: 99,
    color: '#FFB800', // Solar Amber
    description: 'Unmatched strength and athletic fortitude. A living apex performer.',
  },
  ASCENDANT: {
    tier: 'ASCENDANT',
    title: 'Ascendant',
    minLevel: 100,
    maxLevel: 999,
    color: '#FF3366', // Celestial Crimson
    description: 'Transcendence of mortal limits. Real-world athletic mastery achieved.',
  },
};

export const MASTERY_TIERS = [
  { minLevel: 1, maxLevel: 19, title: 'Novice', color: '#94A3B8' },
  { minLevel: 20, maxLevel: 39, title: 'Apprentice', color: '#10B981' },
  { minLevel: 40, maxLevel: 59, title: 'Specialist', color: '#00F0FF' },
  { minLevel: 60, maxLevel: 79, title: 'Master', color: '#8B5CF6' },
  { minLevel: 80, maxLevel: 99, title: 'Grandmaster', color: '#FFB800' },
  { minLevel: 100, maxLevel: 999, title: 'Paragon', color: '#FF3366' },
] as const;

export function getRankForLevel(level: number): { tier: RankTier; division: number; definition: RankDefinition } {
  const safeLevel = Math.max(1, Math.floor(level));
  
  let tier: RankTier = 'INITIATE';
  if (safeLevel >= 100) tier = 'ASCENDANT';
  else if (safeLevel >= 80) tier = 'SOVEREIGN';
  else if (safeLevel >= 60) tier = 'CENTURION';
  else if (safeLevel >= 40) tier = 'VANGUARD';
  else if (safeLevel >= 20) tier = 'ADEPT';
  
  const def = RANKS[tier];
  
  if (tier === 'ASCENDANT') {
    return { tier, division: 1, definition: def };
  }
  
  // Calculate division IV, III, II, I (5 levels per division)
  const offset = safeLevel - def.minLevel; // 0 to 19
  const divIndex = Math.floor(offset / 5); // 0, 1, 2, 3
  const division = 4 - divIndex; // 4, 3, 2, 1
  
  return { tier, division, definition: def };
}

export function getMasteryTierForLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(level));
  const found = MASTERY_TIERS.find(t => safeLevel >= t.minLevel && safeLevel <= t.maxLevel);
  return found || MASTERY_TIERS[MASTERY_TIERS.length - 1];
}
