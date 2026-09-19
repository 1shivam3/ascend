import { SetLog, ExerciseMastery, PersonalRecord } from '../../types/domain.types';
import { MasteryLevelInfo } from '../../types/progression.types';
import { getMasteryTierForLevel } from '../../constants/ranks';
import { calculateEstimated1RM } from '../../utils/1rm';

export class MasteryEngine {
  /**
   * Incremental Mastery XP needed to advance from lift level L to L + 1.
   * Curve: MXP(L) = floor(180 * L^1.65 + 60)
   */
  static getXpForNextLevel(currentLevel: number): number {
    return Math.floor(180 * Math.pow(currentLevel, 1.65) + 60);
  }

  /**
   * Computes current lift level, tier title, and progress percentage given cumulative Mastery XP.
   */
  static getMasteryLevelInfo(totalMasteryXp: number): MasteryLevelInfo {
    const safeXp = Math.max(0, Math.floor(totalMasteryXp));
    let level = 1;
    let accumulatedXp = 0;

    while (level < 100) {
      const xpNeeded = this.getXpForNextLevel(level);
      if (accumulatedXp + xpNeeded > safeXp) {
        const currentLevelXp = safeXp - accumulatedXp;
        const progressPercent = Math.min(100, Math.round((currentLevelXp / xpNeeded) * 100));
        const tier = getMasteryTierForLevel(level);
        return {
          level,
          masteryTierTitle: tier.title,
          currentLevelXp,
          xpRequiredForNextLevel: xpNeeded,
          progressPercent,
        };
      }
      accumulatedXp += xpNeeded;
      level++;
    }

    const tier = getMasteryTierForLevel(100);
    return {
      level: 100,
      masteryTierTitle: tier.title,
      currentLevelXp: safeXp - accumulatedXp,
      xpRequiredForNextLevel: 0,
      progressPercent: 100,
    };
  }

  /**
   * Calculates Mastery XP for an individual completed set.
   */
  static calculateSetMasteryXp(
    set: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed'>,
    baseline1RmKg: number = 0
  ): number {
    if (!set.completed || set.reps <= 0 || set.weightKg <= 0) return 0;

    // Normalizing denominator: higher of athlete's baseline 1RM or 20kg (bar weight)
    const normalizer = Math.max(baseline1RmKg, 20);
    const intensityRatio = set.weightKg / normalizer;

    // Base XP: reps * intensity * 12
    let base = set.reps * intensityRatio * 12;

    // Set Type Multiplier
    let typeMultiplier = 1.0;
    if (set.setType === 'FAILURE') typeMultiplier = 1.25;
    else if (set.setType === 'DROP') typeMultiplier = 0.85;
    else if (set.setType === 'WARMUP') typeMultiplier = 0.20;

    // RPE Multiplier
    let rpeMultiplier = 1.0;
    if (set.rpe && set.rpe >= 6 && set.rpe <= 10) {
      rpeMultiplier = 0.70 + (0.05 * set.rpe);
    }

    const totalSetXp = Math.round(base * typeMultiplier * rpeMultiplier);
    return Math.max(1, totalSetXp);
  }

  /**
   * Analyzes completed sets to identify any newly established Personal Records.
   */
  static detectPersonalRecords(
    existingPrs: Record<string, number>, // prType -> value
    sets: SetLog[]
  ): { prType: 'MAX_WEIGHT' | 'MAX_REPS' | 'MAX_VOLUME' | 'MAX_ESTIMATED_1RM'; value: number; setLogId: string }[] {
    const validSets = sets.filter(s => s.completed && s.setType !== 'WARMUP');
    const newPrs: { prType: 'MAX_WEIGHT' | 'MAX_REPS' | 'MAX_VOLUME' | 'MAX_ESTIMATED_1RM'; value: number; setLogId: string }[] = [];

    let currentBestWeight = existingPrs['MAX_WEIGHT'] || 0;
    let currentBestReps = existingPrs['MAX_REPS'] || 0;
    let currentBestVolume = existingPrs['MAX_VOLUME'] || 0;
    let currentBest1Rm = existingPrs['MAX_ESTIMATED_1RM'] || 0;

    for (const set of validSets) {
      const e1rm = calculateEstimated1RM(set.weightKg, set.reps);
      const setVolume = set.weightKg * set.reps;

      // 1. Max Weight PR
      if (set.weightKg > currentBestWeight) {
        currentBestWeight = set.weightKg;
        newPrs.push({ prType: 'MAX_WEIGHT', value: set.weightKg, setLogId: set.id });
      }

      // 2. Max Reps PR
      if (set.reps > currentBestReps) {
        currentBestReps = set.reps;
        newPrs.push({ prType: 'MAX_REPS', value: set.reps, setLogId: set.id });
      }

      // 3. Max Single Set Volume PR
      if (setVolume > currentBestVolume) {
        currentBestVolume = setVolume;
        newPrs.push({ prType: 'MAX_VOLUME', value: setVolume, setLogId: set.id });
      }

      // 4. Max Estimated 1RM PR
      if (e1rm > currentBest1Rm) {
        currentBest1Rm = e1rm;
        newPrs.push({ prType: 'MAX_ESTIMATED_1RM', value: e1rm, setLogId: set.id });
      }
    }

    return newPrs;
  }

  /**
   * Evaluates workout sets for an exercise, returning updated mastery state and XP delta.
   */
  static evaluateMasteryUpdate(
    currentMastery: ExerciseMastery | null,
    exerciseId: string,
    userId: string,
    sets: SetLog[],
    consecutiveWeeksTrained: number = 0
  ) {
    const baseline1Rm = currentMastery ? currentMastery.estimated1RmKg : 0;
    let setsXp = 0;
    let sessionVolume = 0;
    let sessionReps = 0;
    let sessionSetsCount = 0;
    let bestSetWeight = 0;
    let bestSetReps = 0;
    let bestSetVolume = 0;
    let peakSession1Rm = 0;

    for (const set of sets) {
      if (!set.completed) continue;
      sessionSetsCount++;
      sessionReps += set.reps;
      const volume = set.weightKg * set.reps;
      sessionVolume += volume;

      const setXp = this.calculateSetMasteryXp(set, baseline1Rm);
      setsXp += setXp;

      if (set.setType !== 'WARMUP') {
        if (set.weightKg > bestSetWeight) bestSetWeight = set.weightKg;
        if (set.reps > bestSetReps) bestSetReps = set.reps;
        if (volume > bestSetVolume) bestSetVolume = volume;
        const e1rm = calculateEstimated1RM(set.weightKg, set.reps);
        if (e1rm > peakSession1Rm) peakSession1Rm = e1rm;
      }
    }

    // Existing stats
    const existingXp = currentMastery ? currentMastery.masteryXp : 0;
    const existingSessions = currentMastery ? currentMastery.totalSessions : 0;
    const existingSets = currentMastery ? currentMastery.totalSets : 0;
    const existingReps = currentMastery ? currentMastery.totalReps : 0;
    const existingVolume = currentMastery ? currentMastery.totalVolumeKg : 0;
    const existingBestWeight = currentMastery ? currentMastery.bestWeightKg : 0;
    const existingBestReps = currentMastery ? currentMastery.bestReps : 0;
    const existingBestVolume = currentMastery ? currentMastery.bestVolumeKg : 0;
    const existing1Rm = currentMastery ? currentMastery.estimated1RmKg : 0;

    // Detect PRs
    const existingPrMap: Record<string, number> = {
      MAX_WEIGHT: existingBestWeight,
      MAX_REPS: existingBestReps,
      MAX_VOLUME: existingBestVolume,
      MAX_ESTIMATED_1RM: existing1Rm,
    };
    const newPrs = this.detectPersonalRecords(existingPrMap, sets);

    // PR Bonus & Consistency Bonus
    const prBonus = newPrs.length > 0 ? 150 : 0;
    const consistencyBonus = Math.min(consecutiveWeeksTrained, 4) * 50;
    const totalXpEarned = setsXp + prBonus + consistencyBonus;

    const newTotalXp = existingXp + totalXpEarned;
    const oldLevelInfo = this.getMasteryLevelInfo(existingXp);
    const newLevelInfo = this.getMasteryLevelInfo(newTotalXp);

    const updatedMastery: ExerciseMastery = {
      id: currentMastery?.id || '',
      userId,
      exerciseId,
      masteryLevel: newLevelInfo.level,
      masteryXp: newTotalXp,
      estimated1RmKg: Math.max(existing1Rm, peakSession1Rm),
      bestWeightKg: Math.max(existingBestWeight, bestSetWeight),
      bestReps: Math.max(existingBestReps, bestSetReps),
      bestVolumeKg: Math.max(existingBestVolume, bestSetVolume),
      totalSessions: existingSessions + 1,
      totalSets: existingSets + sessionSetsCount,
      totalReps: existingReps + sessionReps,
      totalVolumeKg: existingVolume + sessionVolume,
      recentPerformance: [
        ...(currentMastery?.recentPerformance || []).slice(-9),
        {
          date: new Date().toISOString().split('T')[0],
          weightKg: bestSetWeight,
          reps: bestSetReps,
          estimated1RmKg: peakSession1Rm,
        },
      ],
      lastTrainedAt: new Date().toISOString(),
    };

    return {
      updatedMastery,
      xpEarned: totalXpEarned,
      oldLevel: oldLevelInfo.level,
      newLevel: newLevelInfo.level,
      didLevelUp: newLevelInfo.level > oldLevelInfo.level,
      newPrs,
    };
  }
}
