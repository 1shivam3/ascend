export type AchievementCategory = 'STREAK' | 'COMBAT' | 'QUEST' | 'PR' | 'VOLUME' | 'MASTERY';

export interface AchievementContext {
  totalWorkouts: number;
  totalVolumeKg: number;
  currentStreak: number;
  longestStreak: number;
  completedQuestsCount: number;
  personalRecordsCount: number;
  maxMasteryLevel: number;
}

export interface AchievementConfig {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  xpReward: number;
  condition: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS_CONFIG: AchievementConfig[] = [
  {
    id: 'ach-first-quest',
    code: 'FIRST_QUEST',
    title: 'First Quest',
    description: 'Complete and record your first tactical directive.',
    icon: '📜',
    category: 'QUEST',
    xpReward: 100,
    condition: ctx => ctx.completedQuestsCount >= 1,
  },
  {
    id: 'ach-unstoppable',
    code: 'UNSTOPPABLE',
    title: 'Unstoppable',
    description: 'Maintain an unbroken 7-day training streak.',
    icon: '⚡',
    category: 'STREAK',
    xpReward: 350,
    condition: ctx => ctx.currentStreak >= 7 || ctx.longestStreak >= 7,
  },
  {
    id: 'ach-iron-will',
    code: 'IRON_WILL',
    title: 'Iron Will',
    description: 'Achieve a legendary 30-day training streak.',
    icon: '🔥',
    category: 'STREAK',
    xpReward: 1000,
    condition: ctx => ctx.currentStreak >= 30 || ctx.longestStreak >= 30,
  },
  {
    id: 'ach-first-pr',
    code: 'FIRST_PR',
    title: 'First PR',
    description: 'Break through your limits and establish your first Personal Record.',
    icon: '🏆',
    category: 'PR',
    xpReward: 150,
    condition: ctx => ctx.personalRecordsCount >= 1,
  },
  {
    id: 'ach-first-blood',
    code: 'FIRST_BLOOD',
    title: 'First Blood',
    description: 'Complete your inaugural training protocol.',
    icon: '⚔️',
    category: 'COMBAT',
    xpReward: 100,
    condition: ctx => ctx.totalWorkouts >= 1,
  },
  {
    id: 'ach-warrior',
    code: 'WARRIOR',
    title: 'Warrior',
    description: 'Deploy and complete 50 documented training sessions.',
    icon: '🛡️',
    category: 'COMBAT',
    xpReward: 750,
    condition: ctx => ctx.totalWorkouts >= 50,
  },
  {
    id: 'ach-centurion',
    code: 'CENTURION',
    title: 'Centurion',
    description: 'Enter elite rank: 100 documented training sessions completed.',
    icon: '👑',
    category: 'COMBAT',
    xpReward: 1500,
    condition: ctx => ctx.totalWorkouts >= 100,
  },
  {
    id: 'ach-iron-centurion',
    code: 'IRON_CENTURION',
    title: 'Iron Centurion',
    description: 'Accumulate over 10,000 kg in total training tonnage.',
    icon: '🗿',
    category: 'VOLUME',
    xpReward: 300,
    condition: ctx => ctx.totalVolumeKg >= 10000,
  },
  {
    id: 'ach-movement-specialist',
    code: 'MOVEMENT_SPECIALIST',
    title: 'Movement Specialist',
    description: 'Advance any single exercise mastery to Level 10 or higher.',
    icon: '🎯',
    category: 'MASTERY',
    xpReward: 250,
    condition: ctx => ctx.maxMasteryLevel >= 10,
  },
];
