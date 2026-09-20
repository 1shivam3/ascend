import { PROGRESSION_CONFIG } from '../../config/progression.config';
import { SetLog, WorkoutSession } from '../../types/domain.types';
import { LevelInfo } from '../../types/progression.types';
import { AntiExploitEngine } from './AntiExploitEngine';

export class XpEngine {
  /**
   * Incremental XP needed to advance from level L to level L + 1.
   * Formula: round(500 * level ^ 1.25) configured via PROGRESSION_CONFIG.globalXp
   */
  static getXpForNextLevel(currentLevel: number): number {
    return PROGRESSION_CONFIG.globalXp.getXpForNextLevel(currentLevel);
  }

  /**
   * Cumulative XP required to reach global character level N.
   */
  static getXpRequiredForLevel(level: number): number {
    const safeLevel = Math.max(1, Math.floor(level));
    if (safeLevel <= 1) return 0;

    let total = 0;
    for (let i = 1; i < safeLevel; i++) {
      total += PROGRESSION_CONFIG.globalXp.getXpForNextLevel(i);
    }
    return total;
  }

  /**
   * Computes current character level and progress bar percentage given cumulative total XP.
   */
  static getLevelInfo(totalXp: number): LevelInfo {
    const safeXp = Math.max(0, Math.floor(totalXp));
    let level = 1;
    let accumulatedXp = 0;

    while (level < 999) {
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
    }

    return {
      level: 999,
      currentLevelXp: 0,
      xpRequiredForNextLevel: 100000,
      progressPercent: 100,
    };
  }

  /**
   * Calculates XP earned for completing a single set.
   * Anti-exploit: Returns 0 for uncompleted sets or invalid sets.
   */
  static calculateSetXp(set: Pick<SetLog, 'setType' | 'rpe' | 'completed' | 'reps' | 'weightKg'>): number {
    if (!set.completed) return 0;
    if (set.reps !== undefined && set.reps <= 0) return 0;

    let base: number = PROGRESSION_CONFIG.globalXp.baseSetXp;

    // RPE bonus: effort scaling for RPE >= 6
    if (set.rpe && set.rpe >= 6) {
      base += Math.round((set.rpe - 5) * PROGRESSION_CONFIG.globalXp.rpeBonusPerPoint);
    }

    if (set.setType === 'FAILURE') {
      base += PROGRESSION_CONFIG.globalXp.failureSetBonus;
    } else if (set.setType === 'DROP') {
      base += PROGRESSION_CONFIG.globalXp.dropSetBonus;
    } else if (set.setType === 'WARMUP') {
      base = Math.max(3, Math.round(base * PROGRESSION_CONFIG.globalXp.warmupSetMultiplier));
    }

    return base;
  }

  /**
   * Calculates session completion base XP based on volume and duration.
   * Enforces anti-exploit qualification checks and maximum session XP cap.
   */
  static calculateSessionXp(
    totalVolumeKg: number,
    durationMinutes: number,
    isQualifying: boolean = true
  ): number {
    if (!isQualifying) return 0;

    const volumeBonus = Math.floor(
      (totalVolumeKg / PROGRESSION_CONFIG.globalXp.sessionVolumeDivisor) * 10
    );
    const durationBonus = Math.floor(
      (durationMinutes / PROGRESSION_CONFIG.globalXp.sessionDurationDivisor) * 8
    );

    const rawTotal = PROGRESSION_CONFIG.globalXp.sessionBaseXp + volumeBonus + durationBonus;
    return Math.min(
      PROGRESSION_CONFIG.globalXp.maxSessionXpCap,
      Math.max(PROGRESSION_CONFIG.globalXp.sessionBaseXp, rawTotal)
    );
  }

  /**
   * Calculates streak multiplier (up to max configured cap, e.g. +30% boost).
   */
  static calculateStreakMultiplier(streakDays: number): number {
    if (streakDays <= 0) return 1.0;
    const bonus = Math.min(
      PROGRESSION_CONFIG.streak.maxStreakMultiplier - 1.0,
      streakDays * PROGRESSION_CONFIG.streak.bonusMultiplierPerDay
    );
    return Math.round((1.0 + bonus) * 100) / 100;
  }

  /**
   * Evaluates a full workout session to award global character XP.
   * Enforces zero XP for cancelled, empty, 0 kg/0 rep, or uncompleted sessions.
   */
  static evaluateWorkoutSessionXp(
    workout: Partial<WorkoutSession>,
    streakDays: number = 0
  ): { xpEarned: number; qualifying: boolean; reason?: string } {
    const validation = AntiExploitEngine.validateWorkoutQualification(workout);
    if (!validation.isValid) {
      return { xpEarned: 0, qualifying: false, reason: validation.reason };
    }

    // Tally sets XP with deduplication
    let setsXp = 0;
    const allSets: SetLog[] = [];
    for (const ex of workout.exercises || []) {
      for (const s of ex.sets || []) {
        allSets.push(s);
      }
    }

    const { validSets } = AntiExploitEngine.deduplicateSets(allSets);
    for (const set of validSets) {
      setsXp += this.calculateSetXp(set);
    }

    const durationMinutes = Math.max(1, Math.round((workout.durationSeconds || 0) / 60));
    const sessionBaseXp = this.calculateSessionXp(workout.totalVolumeKg || 0, durationMinutes, true);

    const rawTotalXp = setsXp + sessionBaseXp;
    const streakMultiplier = this.calculateStreakMultiplier(streakDays);
    const finalXp = Math.round(rawTotalXp * streakMultiplier);

    return {
      xpEarned: finalXp,
      qualifying: true,
    };
  }
}
