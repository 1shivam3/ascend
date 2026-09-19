import { SetLog } from '../../types/domain.types';
import { LevelInfo } from '../../types/progression.types';

export class XpEngine {
  /**
   * Cumulative XP required to reach global character level N.
   * Curve: XP(N) = floor(240 * N^1.82 + 100)
   */
  static getXpRequiredForLevel(level: number): number {
    if (level <= 1) return 0;
    let total = 0;
    for (let i = 1; i < level; i++) {
      total += Math.floor(240 * Math.pow(i, 1.82) + 100);
    }
    return total;
  }

  /**
   * Incremental XP needed to advance from level L to level L + 1.
   */
  static getXpForNextLevel(currentLevel: number): number {
    return Math.floor(240 * Math.pow(currentLevel, 1.82) + 100);
  }

  /**
   * Computes current level and progress bar percentage given cumulative total XP.
   */
  static getLevelInfo(totalXp: number): LevelInfo {
    const safeXp = Math.max(0, Math.floor(totalXp));
    let level = 1;
    let accumulatedXp = 0;

    while (true) {
      const xpNeeded = this.getXpForNextLevel(level);
      if (accumulatedXp + xpNeeded > safeXp) {
        const currentLevelXp = safeXp - accumulatedXp;
        const progressPercent = Math.min(100, Math.round((currentLevelXp / xpNeeded) * 100));
        return {
          level,
          currentLevelXp,
          xpRequiredForNextLevel: xpNeeded,
          progressPercent,
        };
      }
      accumulatedXp += xpNeeded;
      level++;
      // Guard against unbounded loops
      if (level >= 999) {
        return {
          level: 999,
          currentLevelXp: 0,
          xpRequiredForNextLevel: 100000,
          progressPercent: 100,
        };
      }
    }
  }

  /**
   * Calculates XP earned for completing a single set.
   */
  static calculateSetXp(set: Pick<SetLog, 'setType' | 'rpe' | 'completed'>): number {
    if (!set.completed) return 0;

    let base = 15;
    if (set.rpe) {
      base += Math.round(set.rpe * 2);
    }
    if (set.setType === 'FAILURE') {
      base += 10;
    } else if (set.setType === 'WARMUP') {
      base = Math.max(5, Math.round(base * 0.3));
    } else if (set.setType === 'DROP') {
      base += 5;
    }

    return base;
  }

  /**
   * Calculates session completion base XP based on volume and duration.
   * Capped at 400 XP to prevent overtraining exploitation.
   */
  static calculateSessionXp(totalVolumeKg: number, durationMinutes: number): number {
    const volumeBonus = Math.floor((totalVolumeKg / 500) * 10);
    const durationBonus = Math.floor((durationMinutes / 10) * 8);
    const rawTotal = 120 + volumeBonus + durationBonus;
    return Math.min(400, Math.max(120, rawTotal));
  }

  /**
   * Calculates streak multiplier (up to +30% boost).
   * M = 1.0 + min(0.02 * streakDays, 0.30)
   */
  static calculateStreakMultiplier(streakDays: number): number {
    if (streakDays <= 0) return 1.0;
    const bonus = Math.min(0.30, streakDays * 0.02);
    return Math.round((1.0 + bonus) * 100) / 100;
  }
}
