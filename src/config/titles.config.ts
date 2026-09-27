import { TitleDefinition } from '../types/title.types';

/**
 * ASCEND DATA-DRIVEN TITLES CATALOG
 *
 * Rules:
 * 1. Non-exclusive: anyone who meets the requirement unlocks the title.
 * 2. Every title has an unambiguous unlock condition and clear, understandable name.
 * 3. NO TITLES are awarded for app opens, logins, or visits. Every title demands
 *    tangible, verified athletic commitment.
 */
export const TITLES_CATALOG: TitleDefinition[] = [
  // 1. CONSISTENCY & DISCIPLINE
  {
    id: 'title-iron-discipline',
    name: 'Iron Discipline',
    description: 'Forged in unwavering dedication through sustained training streaks.',
    unlockConditionText: 'Maintain a 14-day training consistency streak.',
    category: 'CONSISTENCY',
    rarity: 'EPIC',
    icon: 'flame-outline',
    requirementType: 'STREAK_DAYS',
    requirementThreshold: 14,
  },
  {
    id: 'title-consistency-keeper',
    name: 'Consistency Keeper',
    description: 'A steadfast athlete whose presence at the iron is dependable and habitual.',
    unlockConditionText: 'Complete 20 verified workout sessions.',
    category: 'CONSISTENCY',
    rarity: 'COMMON',
    icon: 'calendar-outline',
    requirementType: 'WORKOUT_COUNT',
    requirementThreshold: 20,
  },
  {
    id: 'title-dedicated-regular',
    name: 'Dedicated Regular',
    description: 'The foundation of mastery is simply showing up week after week.',
    unlockConditionText: 'Complete 50 verified workout sessions.',
    category: 'CONSISTENCY',
    rarity: 'RARE',
    icon: 'shield-outline',
    requirementType: 'WORKOUT_COUNT',
    requirementThreshold: 50,
  },

  // 2. STRENGTH & FORCE PRODUCTION
  {
    id: 'title-strength-seeker',
    name: 'Strength Seeker',
    description: 'Always pushing boundaries under heavy resistance load.',
    unlockConditionText: 'Achieve a 1.25x bodyweight compound strength milestone.',
    category: 'STRENGTH',
    rarity: 'RARE',
    icon: 'barbell-outline',
    requirementType: 'STRENGTH_RATIO',
    requirementThreshold: 1.25,
  },
  {
    id: 'title-power-builder',
    name: 'Power Builder',
    description: 'A master of cumulative tonnage and structural hypertrophy.',
    unlockConditionText: 'Accumulate 50,000 kg total lifetime training volume.',
    category: 'STRENGTH',
    rarity: 'RARE',
    icon: 'layers-outline',
    requirementType: 'LIFETIME_VOLUME_KG',
    requirementThreshold: 50000,
  },
  {
    id: 'title-heavy-lifter',
    name: 'Heavy Lifter',
    description: 'Commands formidable force production relative to personal mass.',
    unlockConditionText: 'Achieve a 1.5x bodyweight compound strength milestone.',
    category: 'STRENGTH',
    rarity: 'EPIC',
    icon: 'hardware-chip-outline',
    requirementType: 'STRENGTH_RATIO',
    requirementThreshold: 1.5,
  },

  // 3. CHALLENGES & DIRECTIVES
  {
    id: 'title-the-challenger',
    name: 'The Challenger',
    description: 'Steps up whenever a tactical directive or community challenge is declared.',
    unlockConditionText: 'Successfully complete 3 squad or solo fitness challenges.',
    category: 'CHALLENGE',
    rarity: 'RARE',
    icon: 'trophy-outline',
    requirementType: 'CHALLENGES_COMPLETED',
    requirementThreshold: 3,
  },
  {
    id: 'title-directive-champion',
    name: 'Directive Champion',
    description: 'Dominates the field across multiple diverse athletic directives.',
    unlockConditionText: 'Successfully complete 10 fitness challenges.',
    category: 'CHALLENGE',
    rarity: 'LEGENDARY',
    icon: 'ribbon-outline',
    requirementType: 'CHALLENGES_COMPLETED',
    requirementThreshold: 10,
  },

  // 4. MOBILITY & FUNCTIONAL BALANCE
  {
    id: 'title-movement-master',
    name: 'Movement Master',
    description: 'Exemplifies grace, joint integrity, and balanced kinematic health.',
    unlockConditionText: 'Achieve a mobility score of 60+ and complete 5 warmup/mobility protocols.',
    category: 'MOBILITY',
    rarity: 'EPIC',
    icon: 'body-outline',
    requirementType: 'MOBILITY_SCORE',
    requirementThreshold: 60,
  },
  {
    id: 'title-supple-athlete',
    name: 'Supple Athlete',
    description: 'Understands that injury resilience and joint freedom unlock longevity.',
    unlockConditionText: 'Complete 10 warmup or mobility protocols.',
    category: 'MOBILITY',
    rarity: 'COMMON',
    icon: 'pulse-outline',
    requirementType: 'MOBILITY_WORKOUTS',
    requirementThreshold: 10,
  },

  // 5. PROGRESSION & ASCENSION
  {
    id: 'title-initiate-of-ascend',
    name: 'Initiate of Ascend',
    description: 'Has taken the first steps on the path of self-overcoming.',
    unlockConditionText: 'Reach Level 5 and complete 5 verified workout sessions.',
    category: 'PROGRESSION',
    rarity: 'COMMON',
    icon: 'sparkles-outline',
    requirementType: 'LEVEL_REACHED',
    requirementThreshold: 5,
  },
  {
    id: 'title-unyielding-will',
    name: 'Unyielding Will',
    description: 'Ascended past novice boundaries into confirmed adept standing.',
    unlockConditionText: 'Ascend to Rank C Adept in the unified progression system.',
    category: 'PROGRESSION',
    rarity: 'EPIC',
    icon: 'shield-checkmark-outline',
    requirementType: 'RANK_TIER',
    requirementThreshold: 3, // Corresponds to Rank C (0: E, 1: D, 2: C, etc.)
    requirementMeta: {
      minRankTier: 'C',
    },
  },
  {
    id: 'title-grandmaster',
    name: 'Grandmaster of the Iron',
    description: 'A mythical standard of physical fitness, mastery, and consistency.',
    unlockConditionText: 'Ascend to Rank S Master in the unified progression system.',
    category: 'PROGRESSION',
    rarity: 'LEGENDARY',
    icon: 'diamond-outline',
    requirementType: 'RANK_TIER',
    requirementThreshold: 5, // Corresponds to Rank S
    requirementMeta: {
      minRankTier: 'S',
    },
  },
];

export function getTitleById(titleId: string): TitleDefinition | undefined {
  return TITLES_CATALOG.find((t) => t.id === titleId);
}
