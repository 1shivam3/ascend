/**
 * Monthly Challenges — opt-in, time-boxed, rewarding.
 *
 * Anti-irritation rules:
 * - Always opt-in (banner is dismissible, never forced)
 * - No punishment for not participating or not finishing
 * - Progress tracked automatically (no manual logging)
 * - One active challenge at a time
 * - Rewards: XP bonus + badge (never paywalled)
 */

export interface Challenge {
  id: string;
  title: string;
  description: string;
  month: string; // YYYY-MM
  goalType: 'workouts' | 'meals' | 'streak' | 'prs' | 'water';
  target: number;
  xpReward: number;
  badgeIcon: string; // emoji or image path
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface ChallengeProgress {
  challengeId: string;
  current: number;
  target: number;
  completed: boolean;
  completedAt: string | null;
  optedIn: boolean;
  dismissed: boolean;
}

// v1: Hardcoded monthly challenges. Future: fetch from server.
export function getCurrentMonthChallenge(now: Date = new Date()): Challenge | null {
  const month = now.toISOString().slice(0, 7); // YYYY-MM
  const year = now.getFullYear();
  const monthNum = now.getMonth() + 1;
  const lastDay = new Date(year, monthNum, 0).getDate();

  const challenges: Record<string, Omit<Challenge, 'month' | 'startDate' | 'endDate'>> = {
    // Rotate through a set of challenges by month
    '0': {
      id: 'new-year-strength',
      title: 'New Year Strength',
      description: 'Log 12 workouts this month',
      goalType: 'workouts',
      target: 12,
      xpReward: 200,
      badgeIcon: '💪',
    },
    '1': {
      id: 'consistency-king',
      title: 'Consistency King',
      description: 'Train 3x per week for the whole month',
      goalType: 'workouts',
      target: 12,
      xpReward: 200,
      badgeIcon: '👑',
    },
    '2': {
      id: 'fuel-right',
      title: 'Fuel Right',
      description: 'Log 50 meals this month',
      goalType: 'meals',
      target: 50,
      xpReward: 200,
      badgeIcon: '🍎',
    },
  };

  const template = challenges[String(now.getMonth() % 3)];
  if (!template) return null;

  return {
    ...template,
    month,
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function calculateChallengeProgress(
  challenge: Challenge,
  stats: { workouts: number; meals: number; streakDays: number; prs: number; waterLogs: number }
): number {
  switch (challenge.goalType) {
    case 'workouts':
      return Math.min(stats.workouts, challenge.target);
    case 'meals':
      return Math.min(stats.meals, challenge.target);
    case 'streak':
      return Math.min(stats.streakDays, challenge.target);
    case 'prs':
      return Math.min(stats.prs, challenge.target);
    case 'water':
      return Math.min(stats.waterLogs, challenge.target);
    default:
      return 0;
  }
}
