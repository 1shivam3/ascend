import { PROGRESSION_CONFIG, RankTier } from '../../config/progression.config';
import { SetLog, ExerciseMastery, Exercise } from '../../types/domain.types';
import { MasteryLevelInfo } from '../../types/progression.types';
import { getMasteryTierForLevel, getExerciseRankFromLevel } from '../../constants/ranks';
import { calculateEstimated1RM, calculateRelativeStrength } from '../../utils/1rm';
import { AntiExploitEngine } from './AntiExploitEngine';

export class MasteryEngine {
  /**
   * Incremental Exercise Mastery XP needed to advance from lift level L to L + 1.
   * Curve: round(100 * L^1.25) configured via PROGRESSION_CONFIG.mastery
   */
  static getXpForNextLevel(currentLevel: number): number {
    return PROGRESSION_CONFIG.mastery.getXpForNextLevel(currentLevel);
  }

  /**
   * Alias for getXpForNextLevel as requested by the Lift Mastery specification.
   */
  static getXPRequiredForLevel(level: number): number {
    return this.getXpForNextLevel(level);
  }

  /**
   * Computes exercise level (1 to 100) deterministically from cumulative Exercise XP.
   */
  static getExerciseLevelFromXP(xp: number): number {
    const safeXp = Math.max(0, Math.floor(xp));
    let level = 1;
    let accumulatedXp = 0;

    while (level < PROGRESSION_CONFIG.mastery.maxLevel) {
      const xpNeeded = this.getXpForNextLevel(level);
      if (accumulatedXp + xpNeeded > safeXp) {
        return level;
      }
      accumulatedXp += xpNeeded;
      level++;
    }

    return PROGRESSION_CONFIG.mastery.maxLevel;
  }

  /**
   * Returns deterministic Exercise Rank (E to SSS) and color from exercise level.
   * E: 1-10, D: 11-20, C: 21-30, B: 31-40, A: 41-50, S: 51-60, SS: 61-80, SSS: 81-100
   */
  static getExerciseRankFromLevel(level: number): {
    tier: RankTier;
    color: string;
    title: string;
  } {
    return getExerciseRankFromLevel(level);
  }

  /**
   * Computes current exercise progression status including level, rank, current level XP,
   * XP needed for next level, and progress percent.
   */
  static getExerciseProgress(totalXp: number): {
    level: number;
    rank: RankTier;
    currentLevelXp: number;
    xpRequiredForNextLevel: number;
    progressPercent: number;
  } {
    const safeXp = Math.max(0, Math.floor(totalXp));
    let level = 1;
    let accumulatedXp = 0;

    while (level < PROGRESSION_CONFIG.mastery.maxLevel) {
      const xpNeeded = this.getXpForNextLevel(level);
      if (accumulatedXp + xpNeeded > safeXp) {
        const currentLevelXp = safeXp - accumulatedXp;
        const progressPercent = Math.min(100, Math.round((currentLevelXp / xpNeeded) * 100));
        const rankInfo = this.getExerciseRankFromLevel(level);
        return {
          level,
          rank: rankInfo.tier,
          currentLevelXp,
          xpRequiredForNextLevel: xpNeeded,
          progressPercent,
        };
      }
      accumulatedXp += xpNeeded;
      level++;
    }

    const rankInfo = this.getExerciseRankFromLevel(PROGRESSION_CONFIG.mastery.maxLevel);
    return {
      level: PROGRESSION_CONFIG.mastery.maxLevel,
      rank: rankInfo.tier,
      currentLevelXp: safeXp - accumulatedXp,
      xpRequiredForNextLevel: 0,
      progressPercent: 100,
    };
  }

  /**
   * Computes current lift level, tier title, and progress percentage given cumulative Mastery XP.
   * Backwards-compatible with previous mastery engine calls.
   */
  static getMasteryLevelInfo(totalMasteryXp: number): MasteryLevelInfo {
    const progress = this.getExerciseProgress(totalMasteryXp);
    const tier = getMasteryTierForLevel(progress.level);
    return {
      level: progress.level,
      masteryTierTitle: tier.title,
      currentLevelXp: progress.currentLevelXp,
      xpRequiredForNextLevel: progress.xpRequiredForNextLevel,
      xpToNextLevel: progress.xpRequiredForNextLevel,
      progressPercent: progress.progressPercent,
    };
  }

  /**
   * Calculates Exercise XP for an individual completed set using deterministic auditable rules:
   * - Strength: base (20) + heavy bonus (8 if >=80% 1RM) + volume bonus (weight*reps/100) + PR (50)
   * - Bodyweight: base (20) + reps bonus (reps * 1.5) + weighted volume bonus + PR (50)
   * - Cardio: base (20) + distance bonus (meters / 100) + duration bonus (seconds / 30) + PR (50)
   * - Athletic: base (20) + reps bonus + duration bonus + PR (50)
   * Anti-exploit: uncompleted sets yield 0 XP.
   */
  static calculateExerciseXP(
    set: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed' | 'distanceMeters' | 'durationSeconds'>,
    baseline1RmKg: number = 0,
    isPr: boolean = false,
    exercise?: Pick<Exercise, 'progressionType' | 'isBodyweight' | 'movementPattern'>
  ): number {
    if (!set.completed) return 0;

    const isCardio = exercise?.progressionType === 'CARDIO' || exercise?.movementPattern === 'CARDIO';
    const isBodyweight = exercise?.isBodyweight || exercise?.progressionType === 'BODYWEIGHT';
    const isAthletic = exercise?.progressionType === 'ATHLETIC' || exercise?.movementPattern === 'ATHLETIC';

    const isWarmup = set.setType === 'WARMUP';
    const base = isWarmup
      ? Math.round(PROGRESSION_CONFIG.mastery.baseSetXp * PROGRESSION_CONFIG.mastery.warmupMultiplier)
      : PROGRESSION_CONFIG.mastery.baseSetXp;

    let bonus = 0;

    if (isCardio) {
      const dist = set.distanceMeters || 0;
      const dur = set.durationSeconds || 0;
      if (dist <= 0 && dur <= 0 && set.reps <= 0) return 0;

      // Distance bonus: +1 XP per 100 meters (e.g. +50 XP for 5km)
      const distBonus = Math.round(dist / 100);
      // Duration bonus: +1 XP per 30 seconds
      const durBonus = Math.round(dur / 30);
      bonus = distBonus + durBonus;
    } else if (isBodyweight) {
      if (set.reps <= 0) return 0;
      // Rep bonus: 1.5 XP per rep for bodyweight movements
      const repBonus = Math.round(set.reps * 1.5);
      // Weighted bodyweight volume bonus
      const weightBonus = set.weightKg > 0 ? Math.round((set.weightKg * set.reps) / PROGRESSION_CONFIG.mastery.volumeDivisor) : 0;
      bonus = repBonus + weightBonus;
    } else if (isAthletic) {
      if (set.reps <= 0 && (!set.durationSeconds || set.durationSeconds <= 0)) return 0;
      const repBonus = Math.round(set.reps * 1.2);
      const durBonus = Math.round((set.durationSeconds || 0) / 30);
      bonus = repBonus + durBonus;
    } else {
      // Standard strength / barbell / dumbbell / machine
      if (set.reps <= 0 || set.weightKg <= 0) return 0;

      let heavyBonus = 0;
      if (
        !isWarmup &&
        baseline1RmKg > 0 &&
        set.weightKg >= PROGRESSION_CONFIG.mastery.heavySetThresholdRatio * baseline1RmKg
      ) {
        heavyBonus = PROGRESSION_CONFIG.mastery.heavySetBonus;
      }

      const volumeBonus = isWarmup
        ? 0
        : Math.round((set.weightKg * set.reps) / PROGRESSION_CONFIG.mastery.volumeDivisor);

      bonus = heavyBonus + volumeBonus;
    }

    const prBonus = isPr ? PROGRESSION_CONFIG.mastery.prBonus : 0;
    let total = base + bonus + prBonus;

    // Apply failure / drop multipliers if applicable
    if (set.setType === 'FAILURE') {
      total = Math.round(total * PROGRESSION_CONFIG.mastery.failureMultiplier);
    } else if (set.setType === 'DROP') {
      total = Math.round(total * PROGRESSION_CONFIG.mastery.dropMultiplier);
    }

    const cappedXp = Math.min(total, PROGRESSION_CONFIG.antiExploit.maxSingleSetMasteryXp);
    return Math.max(1, cappedXp);
  }

  /**
   * Backwards compatible alias for calculateExerciseXP.
   */
  static calculateSetMasteryXp(
    set: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed' | 'distanceMeters' | 'durationSeconds'>,
    baseline1RmKg: number = 0,
    exercise?: Pick<Exercise, 'progressionType' | 'isBodyweight' | 'movementPattern'>
  ): number {
    return this.calculateExerciseXP(set, baseline1RmKg, false, exercise);
  }

  /**
   * Analyzes completed sets to identify any newly established Personal Records.
   * Supports strength PRs, bodyweight max reps, and cardio distance/pace PRs.
   */
  static detectPersonalRecords(
    existingPrs: Record<string, number>,
    sets: SetLog[],
    exercise?: Pick<Exercise, 'progressionType' | 'isBodyweight' | 'movementPattern' | 'supports1Rm'>
  ): {
    prType: 'MAX_WEIGHT' | 'MAX_REPS' | 'MAX_VOLUME' | 'MAX_ESTIMATED_1RM' | 'BEST_DISTANCE' | 'BEST_PACE';
    value: number;
    setLogId: string;
  }[] {
    const validSets = sets.filter(s => s.completed && s.setType !== 'WARMUP');
    const newPrs: {
      prType: 'MAX_WEIGHT' | 'MAX_REPS' | 'MAX_VOLUME' | 'MAX_ESTIMATED_1RM' | 'BEST_DISTANCE' | 'BEST_PACE';
      value: number;
      setLogId: string;
    }[] = [];

    const isCardio = exercise?.progressionType === 'CARDIO' || exercise?.movementPattern === 'CARDIO';
    const isBodyweight = exercise?.isBodyweight || exercise?.progressionType === 'BODYWEIGHT';
    const supports1Rm = exercise?.supports1Rm !== false && !isCardio && !isBodyweight;

    let currentBestWeight = existingPrs['MAX_WEIGHT'] || 0;
    let currentBestReps = existingPrs['MAX_REPS'] || 0;
    let currentBestVolume = existingPrs['MAX_VOLUME'] || 0;
    let currentBest1Rm = existingPrs['MAX_ESTIMATED_1RM'] || 0;
    let currentBestDistance = existingPrs['BEST_DISTANCE'] || 0;
    let currentBestPace = existingPrs['BEST_PACE'] || 0;

    for (const set of validSets) {
      // 1. Cardio PRs
      if (isCardio) {
        if (set.distanceMeters && set.distanceMeters > currentBestDistance) {
          currentBestDistance = set.distanceMeters;
          newPrs.push({ prType: 'BEST_DISTANCE', value: set.distanceMeters, setLogId: set.id });
        }
        if (set.paceSecondsPerKm && set.paceSecondsPerKm > 0) {
          if (currentBestPace === 0 || set.paceSecondsPerKm < currentBestPace) {
            currentBestPace = set.paceSecondsPerKm;
            newPrs.push({ prType: 'BEST_PACE', value: set.paceSecondsPerKm, setLogId: set.id });
          }
        }
        continue;
      }

      // 2. Reps PR
      if (set.reps > currentBestReps) {
        currentBestReps = set.reps;
        newPrs.push({ prType: 'MAX_REPS', value: set.reps, setLogId: set.id });
      }

      // 3. Weight PR (if weight lifted or added)
      if (set.weightKg > currentBestWeight) {
        currentBestWeight = set.weightKg;
        newPrs.push({ prType: 'MAX_WEIGHT', value: set.weightKg, setLogId: set.id });
      }

      // 4. Volume PR
      const setVolume = set.weightKg * set.reps;
      if (setVolume > currentBestVolume && setVolume > 0) {
        currentBestVolume = setVolume;
        newPrs.push({ prType: 'MAX_VOLUME', value: setVolume, setLogId: set.id });
      }

      // 5. Estimated 1RM PR (strictly for exercises that support 1RM and reps <= 10)
      const maxRepsFor1Rm = PROGRESSION_CONFIG.dataReliability.maxRepsForEstimated1RM;
      if (supports1Rm && set.weightKg > 0 && set.reps > 0 && set.reps <= maxRepsFor1Rm) {
        const e1rm = calculateEstimated1RM(set.weightKg, set.reps);
        if (e1rm > currentBest1Rm) {
          currentBest1Rm = e1rm;
          newPrs.push({ prType: 'MAX_ESTIMATED_1RM', value: e1rm, setLogId: set.id });
        }
      }
    }

    return newPrs;
  }

  /**
   * Evaluates workout sets for an exercise, returning updated mastery state and XP delta.
   * Performs deduplication and anti-exploit filtering.
   */
  static evaluateMasteryUpdate(
    currentMastery: ExerciseMastery | null,
    exerciseId: string,
    userId: string,
    sets: SetLog[],
    consecutiveWeeksTrained: number = 0,
    athleteBodyweightKg?: number,
    exercise?: Exercise
  ) {
    const baseline1Rm = currentMastery ? (currentMastery.estimated1RmKg || currentMastery.estimated_1rm || 0) : 0;

    const isCardio = exercise?.progressionType === 'CARDIO' || exercise?.movementPattern === 'CARDIO';
    const isBodyweight = exercise?.isBodyweight || exercise?.progressionType === 'BODYWEIGHT';
    const supports1Rm = exercise?.supports1Rm !== false && !isCardio && !isBodyweight;
    const maxRepsFor1Rm = PROGRESSION_CONFIG.dataReliability.maxRepsForEstimated1RM;

    // Deduplicate rapid duplicate clicks
    const { validSets } = AntiExploitEngine.deduplicateSets(sets);

    let setsXp = 0;
    let sessionVolume = 0;
    let sessionReps = 0;
    let sessionSetsCount = 0;
    let bestSetWeight = 0;
    let bestSetReps = 0;
    let bestSetVolume = 0;
    let peakSession1Rm = 0;
    let sessionDistance = 0;
    let sessionDuration = 0;
    let bestSetDistance = 0;
    let bestSetDuration = 0;
    let bestSetPace = 0;

    for (const set of validSets) {
      const hasWork =
        (set.reps && set.reps > 0) ||
        (set.distanceMeters && set.distanceMeters > 0) ||
        (set.durationSeconds && set.durationSeconds > 0);
      if (!set.completed || !hasWork) continue;

      sessionSetsCount++;
      sessionReps += set.reps || 0;
      const volume = (set.weightKg || 0) * (set.reps || 0);
      sessionVolume += volume;

      if (set.distanceMeters && set.distanceMeters > 0) {
        sessionDistance += set.distanceMeters;
        if (set.distanceMeters > bestSetDistance) bestSetDistance = set.distanceMeters;
      }
      if (set.durationSeconds && set.durationSeconds > 0) {
        sessionDuration += set.durationSeconds;
        if (set.durationSeconds > bestSetDuration) bestSetDuration = set.durationSeconds;
      }
      if (set.paceSecondsPerKm && set.paceSecondsPerKm > 0) {
        if (bestSetPace === 0 || set.paceSecondsPerKm < bestSetPace) {
          bestSetPace = set.paceSecondsPerKm;
        }
      }

      const setXp = this.calculateExerciseXP(set, baseline1Rm, set.isPr, exercise);
      setsXp += setXp;

      if (set.setType !== 'WARMUP') {
        if (set.weightKg > bestSetWeight) bestSetWeight = set.weightKg;
        if (set.reps > bestSetReps) bestSetReps = set.reps;
        if (volume > bestSetVolume) bestSetVolume = volume;
        if (supports1Rm && set.weightKg > 0 && set.reps > 0 && set.reps <= maxRepsFor1Rm) {
          const e1rm = calculateEstimated1RM(set.weightKg, set.reps);
          if (e1rm > peakSession1Rm) peakSession1Rm = e1rm;
        }
      }
    }

    // Existing stats
    const existingXp = currentMastery ? (currentMastery.masteryXp ?? currentMastery.mastery_xp ?? 0) : 0;
    const existingSessions = currentMastery ? (currentMastery.totalSessions ?? currentMastery.total_sessions ?? 0) : 0;
    const existingSets = currentMastery ? currentMastery.totalSets : 0;
    const existingReps = currentMastery ? currentMastery.totalReps : 0;
    const existingVolume = currentMastery ? (currentMastery.totalVolumeKg ?? currentMastery.total_volume ?? 0) : 0;
    const existingBestWeight = currentMastery ? (currentMastery.bestWeightKg ?? currentMastery.best_weight ?? 0) : 0;
    const existingBestReps = currentMastery ? (currentMastery.bestReps ?? currentMastery.best_reps ?? 0) : 0;
    const existingBestVolume = currentMastery ? (currentMastery.bestVolumeKg ?? currentMastery.best_volume ?? 0) : 0;
    const existing1Rm = currentMastery ? (currentMastery.estimated1RmKg ?? currentMastery.estimated_1rm ?? 0) : 0;
    const existingPrCount = currentMastery ? (currentMastery.personalRecordsCount ?? currentMastery.personal_records_count ?? 0) : 0;
    const existingMilestoneCount = currentMastery ? (currentMastery.milestonesUnlockedCount ?? currentMastery.milestones_unlocked ?? 0) : 0;
    const existingBestDistance = currentMastery ? (currentMastery.bestDistanceMeters ?? currentMastery.best_distance_meters ?? 0) : 0;
    const existingBestDuration = currentMastery ? (currentMastery.bestDurationSeconds ?? currentMastery.best_duration_seconds ?? 0) : 0;
    const existingBestPace = currentMastery ? (currentMastery.bestPaceSecondsPerKm ?? currentMastery.best_pace_seconds_per_km ?? 0) : 0;
    const existingTotalDistance = currentMastery ? (currentMastery.totalDistanceMeters ?? currentMastery.total_distance_meters ?? 0) : 0;
    const existingTotalDuration = currentMastery ? (currentMastery.totalDurationSeconds ?? currentMastery.total_duration_seconds ?? 0) : 0;

    // Detect PRs
    const existingPrMap: Record<string, number> = {
      MAX_WEIGHT: existingBestWeight,
      MAX_REPS: existingBestReps,
      MAX_VOLUME: existingBestVolume,
      MAX_ESTIMATED_1RM: existing1Rm,
      BEST_DISTANCE: existingBestDistance,
      BEST_PACE: existingBestPace,
    };
    const newPrs = this.detectPersonalRecords(existingPrMap, validSets, exercise);

    // PR Bonus & Consistency Bonus
    const prBonus = newPrs.length > 0 ? PROGRESSION_CONFIG.mastery.prEventBonusXp : 0;
    const consistencyBonus = Math.min(
      consecutiveWeeksTrained * PROGRESSION_CONFIG.mastery.consecutiveWeeksBonusPerWeek,
      PROGRESSION_CONFIG.mastery.maxConsecutiveWeeksBonus
    );
    const totalXpEarned = setsXp + prBonus + consistencyBonus;

    const newTotalXp = existingXp + totalXpEarned;
    const oldLevelInfo = this.getMasteryLevelInfo(existingXp);
    const newLevelInfo = this.getMasteryLevelInfo(newTotalXp);

    const oldRankInfo = this.getExerciseRankFromLevel(oldLevelInfo.level);
    const newRankInfo = this.getExerciseRankFromLevel(newLevelInfo.level);
    const didRankUp = newRankInfo.tier !== oldRankInfo.tier && newLevelInfo.level > oldLevelInfo.level;

    const nowIso = new Date().toISOString();
    const newEstimated1Rm = Math.max(existing1Rm, peakSession1Rm);
    const newBestWeight = Math.max(existingBestWeight, bestSetWeight);
    const newBestReps = Math.max(existingBestReps, bestSetReps);
    const newBestVolume = Math.max(existingBestVolume, bestSetVolume);
    const newTotalSessions = existingSessions + (sessionSetsCount > 0 ? 1 : 0);
    const newTotalVolume = existingVolume + sessionVolume;
    const newPrCount = existingPrCount + newPrs.length;

    const newBestDistance = Math.max(existingBestDistance, bestSetDistance);
    const newBestDuration = Math.max(existingBestDuration, bestSetDuration);
    let newBestPace = existingBestPace;
    if (bestSetPace > 0) {
      newBestPace = existingBestPace === 0 ? bestSetPace : Math.min(existingBestPace, bestSetPace);
    }
    const newTotalDistance = existingTotalDistance + sessionDistance;
    const newTotalDuration = existingTotalDuration + sessionDuration;

    // Trend calculation
    let trend: 'IMPROVING' | 'MAINTAINING' | 'REGRESSING' | 'NEW' = 'NEW';
    const hasHistory = existingSessions > 0 || (currentMastery?.recentPerformance && currentMastery.recentPerformance.length > 0);

    if (!hasHistory || sessionSetsCount === 0) {
      trend = sessionSetsCount === 0 && currentMastery?.trend ? currentMastery.trend : 'NEW';
    } else if (newPrs.length > 0) {
      trend = 'IMPROVING';
    } else if (isCardio) {
      const improvedPace = bestSetPace > 0 && existingBestPace > 0 && bestSetPace < existingBestPace;
      const regressedPace = bestSetPace > 0 && existingBestPace > 0 && bestSetPace > existingBestPace * 1.15;
      if (improvedPace || bestSetDistance > existingBestDistance) {
        trend = 'IMPROVING';
      } else if (regressedPace) {
        trend = 'REGRESSING';
      } else {
        trend = 'MAINTAINING';
      }
    } else if (isBodyweight) {
      if (bestSetReps > existingBestReps || bestSetWeight > existingBestWeight) {
        trend = 'IMPROVING';
      } else if (existingBestReps > 0 && bestSetReps < existingBestReps * 0.8 && bestSetWeight <= existingBestWeight) {
        trend = 'REGRESSING';
      } else {
        trend = 'MAINTAINING';
      }
    } else {
      // Standard / Strength
      if (peakSession1Rm > existing1Rm || bestSetWeight > existingBestWeight) {
        trend = 'IMPROVING';
      } else if (existing1Rm > 0 && peakSession1Rm > 0 && peakSession1Rm < existing1Rm * 0.9) {
        trend = 'REGRESSING';
      } else {
        trend = 'MAINTAINING';
      }
    }

    // Relative strength calculation
    let relativeStrength: number | null = null;
    if (athleteBodyweightKg && athleteBodyweightKg > 0 && exercise?.supportsRelativeStrength !== false && supports1Rm) {
      relativeStrength = calculateRelativeStrength(newEstimated1Rm, athleteBodyweightKg);
    } else if (currentMastery?.relativeStrength !== undefined) {
      relativeStrength = currentMastery.relativeStrength;
    }

    const updatedMastery: ExerciseMastery = {
      id: currentMastery?.id || `em-${userId}-${exerciseId}`,
      userId,
      exerciseId,
      masteryLevel: newLevelInfo.level,
      masteryXp: newTotalXp,
      rank: newRankInfo.tier,
      estimated1RmKg: newEstimated1Rm,
      bestWeightKg: newBestWeight,
      bestReps: newBestReps,
      bestVolumeKg: newBestVolume,
      relativeStrength,
      totalSessions: newTotalSessions,
      totalSets: existingSets + sessionSetsCount,
      totalReps: existingReps + sessionReps,
      totalVolumeKg: newTotalVolume,
      personalRecordsCount: newPrCount,
      milestonesUnlockedCount: existingMilestoneCount,
      trend,
      xpToNextLevel: newLevelInfo.xpToNextLevel,
      bestDistanceMeters: newBestDistance,
      bestDurationSeconds: newBestDuration,
      bestPaceSecondsPerKm: newBestPace,
      totalDistanceMeters: newTotalDistance,
      totalDurationSeconds: newTotalDuration,
      recentPerformance: [
        ...(currentMastery?.recentPerformance || []).slice(-9),
        {
          date: nowIso.split('T')[0],
          weightKg: bestSetWeight,
          reps: bestSetReps,
          estimated1RmKg: peakSession1Rm,
          distanceMeters: bestSetDistance,
          durationSeconds: bestSetDuration,
        },
      ],
      lastTrainedAt: nowIso,

      // Schema aliases requested by prompt
      user_id: userId,
      exercise_id: exerciseId,
      mastery_level: newLevelInfo.level,
      mastery_xp: newTotalXp,
      xp_to_next_level: newLevelInfo.xpToNextLevel,
      estimated_1rm: newEstimated1Rm,
      best_weight: newBestWeight,
      best_reps: newBestReps,
      best_volume: newBestVolume,
      relative_strength: relativeStrength,
      total_volume: newTotalVolume,
      total_sessions: newTotalSessions,
      personal_records_count: newPrCount,
      milestones_unlocked: existingMilestoneCount,
      last_performed_at: nowIso,
      best_distance_meters: newBestDistance,
      best_duration_seconds: newBestDuration,
      best_pace_seconds_per_km: newBestPace,
      total_distance_meters: newTotalDistance,
      total_duration_seconds: newTotalDuration,
    };

    return {
      updatedMastery,
      xpEarned: totalXpEarned,
      oldLevel: oldLevelInfo.level,
      newLevel: newLevelInfo.level,
      didLevelUp: newLevelInfo.level > oldLevelInfo.level,
      oldRank: oldRankInfo.tier,
      newRank: newRankInfo.tier,
      didRankUp,
      newPrs,
    };
  }
}
