export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  category: 'COMBAT' | 'VOLUME' | 'STREAK' | 'MASTERY';
  isUnlocked: (stats: {
    totalWorkouts: number;
    totalVolumeKg: number;
    currentStreak: number;
    maxMasteryLevel: number;
    prsCount: number;
  }) => boolean;
}

export const SYSTEM_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-first-blood',
    title: 'First Blood',
    description: 'Complete and record your first training protocol.',
    icon: '⚔️',
    xpReward: 100,
    category: 'COMBAT',
    isUnlocked: stats => stats.totalWorkouts >= 1,
  },
  {
    id: 'ach-breakthrough-operator',
    title: 'Breakthrough Operator',
    description: 'Establish your first Personal Record breakthrough.',
    icon: '⚡',
    xpReward: 150,
    category: 'MASTERY',
    isUnlocked: stats => stats.prsCount >= 1,
  },
  {
    id: 'ach-consistency-cadet',
    title: 'Consistency Cadet',
    description: 'Maintain an unbroken training streak of at least 3 days.',
    icon: '🔥',
    xpReward: 200,
    category: 'STREAK',
    isUnlocked: stats => stats.currentStreak >= 3,
  },
  {
    id: 'ach-iron-centurion',
    title: 'Iron Centurion',
    description: 'Accumulate at least 10,000 kg total volume across all lifts.',
    icon: '🛡️',
    xpReward: 250,
    category: 'VOLUME',
    isUnlocked: stats => stats.totalVolumeKg >= 10000,
  },
  {
    id: 'ach-specialist-rank',
    title: 'Movement Specialist',
    description: 'Elevate any movement to Lift Level 10 or higher.',
    icon: '🎯',
    xpReward: 300,
    category: 'MASTERY',
    isUnlocked: stats => stats.maxMasteryLevel >= 10,
  },
  {
    id: 'ach-titan-discipline',
    title: 'Titan Discipline',
    description: 'Complete 10 total documented training sessions.',
    icon: '👑',
    xpReward: 500,
    category: 'COMBAT',
    isUnlocked: stats => stats.totalWorkouts >= 10,
  },
];
