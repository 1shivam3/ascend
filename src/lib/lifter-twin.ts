import {
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
  TrainingDecision,
  TrainingDecisionReason,
  LifterExerciseProfile,
  LifterTwinProfile,
  RealWorldConstraint,
  LifterConfidenceTier,
  AthleteGoal,
  ATHLETE_GOAL_CONFIGS,
} from './types';
import {
  calculateOneRepMax,
  isMainCompoundLift,
  normalizeExerciseName,
  getEquipmentType,
  isBodyweightExercise,
  isDumbbellExercise,
} from './strength-standards';

/**
 * Calculates within-session effort drift and rep drop across comparable working sets.
 */
export function calculateSetEffortDrift(sets: WorkoutSet[]): {
  rpeDriftTotal: number;
  rpeDriftPerSet: number;
  repDrop: number;
  hasEffortSpike: boolean;
  averageRpe: number;
  withinSessionEffortTrend: 'low' | 'moderate' | 'high';
} {
  const validSets = sets.filter((s) => s.reps > 0);
  if (validSets.length <= 1) {
    const singleRpe = validSets[0]?.rpe ?? 8;
    return {
      rpeDriftTotal: 0,
      rpeDriftPerSet: 0,
      repDrop: 0,
      hasEffortSpike: singleRpe >= 9.5,
      averageRpe: singleRpe,
      withinSessionEffortTrend: singleRpe >= 9 ? 'high' : singleRpe >= 8 ? 'moderate' : 'low',
    };
  }

  const rpes = validSets.map((s) => s.rpe ?? 8);
  const firstRpe = rpes[0];
  const lastRpe = rpes[rpes.length - 1];
  const rpeDriftTotal = Math.round((lastRpe - firstRpe) * 10) / 10;
  const rpeDriftPerSet = Math.round((rpeDriftTotal / (validSets.length - 1)) * 10) / 10;

  const firstReps = validSets[0].reps;
  const lastReps = validSets[validSets.length - 1].reps;
  const repDrop = Math.max(0, firstReps - lastReps);

  const avgRpe = Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
  const hasEffortSpike = lastRpe >= 9.5 || rpeDriftTotal >= 1.5 || repDrop >= 2;

  const withinSessionEffortTrend: 'low' | 'moderate' | 'high' =
    rpeDriftPerSet > 0.4 ? 'high' : rpeDriftPerSet > 0.15 ? 'moderate' : 'low';

  return {
    rpeDriftTotal,
    rpeDriftPerSet,
    repDrop,
    hasEffortSpike,
    averageRpe: avgRpe,
    withinSessionEffortTrend,
  };
}

// Backward-compatible alias
export const calculateSetFatigueSlope = calculateSetEffortDrift;

/**
 * Extracts and chronologically sorts past sessions for a specific exercise.
 */
export function getExerciseHistorySessions(
  exerciseName: string,
  workouts: WorkoutEntry[]
): {
  date: string;
  sets: WorkoutSet[];
  bestWeight: number;
  bestReps: number;
  bestE1RM: number;
  totalVolume: number;
  fatigue: ReturnType<typeof calculateSetEffortDrift>;
}[] {
  if (!exerciseName || !workouts || workouts.length === 0) return [];

  const targetLower = exerciseName.trim().toLowerCase();
  const history: {
    date: string;
    sets: WorkoutSet[];
    bestWeight: number;
    bestReps: number;
    bestE1RM: number;
    totalVolume: number;
    fatigue: ReturnType<typeof calculateSetEffortDrift>;
  }[] = [];

  // Sort workouts oldest first for longitudinal progression analysis
  const sorted = [...workouts].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const w of sorted) {
    const match = w.exercises.find((e) => {
      const nameLower = e.name.trim().toLowerCase();
      return nameLower === targetLower || nameLower.includes(targetLower) || targetLower.includes(nameLower);
    });

    if (match && match.sets.length > 0) {
      const validSets = match.sets.filter((s) => s.reps > 0);
      if (validSets.length === 0) continue;

      let bestWeight = 0;
      let bestReps = 0;
      let bestE1RM = 0;
      let totalVolume = 0;

      for (const s of validSets) {
        const wKg = s.weight;
        const e1rm = calculateOneRepMax(wKg, s.reps);
        totalVolume += wKg * s.reps;
        if (e1rm > bestE1RM) {
          bestE1RM = Math.round(e1rm * 10) / 10;
          bestWeight = s.weight;
          bestReps = s.reps;
        }
      }

      history.push({
        date: w.date,
        sets: validSets,
        bestWeight,
        bestReps,
        bestE1RM,
        totalVolume: Math.round(totalVolume),
        fatigue: calculateSetEffortDrift(validSets),
      });
    }
  }

  return history;
}

/**
 * Determines feature-specific confidence tier based on verified comparable exposures.
 */
export function getConfidenceTier(evidenceCount: number): LifterConfidenceTier {
  if (evidenceCount >= 20) return 'high_confidence';
  if (evidenceCount >= 10) return 'established';
  if (evidenceCount >= 5) return 'early_signal';
  return 'calibrating';
}

/**
 * Generates an auditable training prescription decision with prediction tracking.
 */
export function generateTrainingDecision(
  exerciseName: string,
  workouts: WorkoutEntry[],
  userUnit: 'kg' | 'lbs' = 'kg',
  targetRpe: number = 8.0,
  goals?: AthleteGoal[]
): TrainingDecision | null {
  const history = getExerciseHistorySessions(exerciseName, workouts);
  if (history.length === 0) return null;

  const activeGoals: AthleteGoal[] = goals && goals.length > 0 ? goals : ['get_stronger', 'build_muscle'];
  const hasStrength = activeGoals.includes('get_stronger');
  const hasMuscle = activeGoals.includes('build_muscle');
  const hasFatLoss = activeGoals.includes('lose_fat');
  const hasStamina = activeGoals.includes('stamina');
  const isPowerbuilding = hasStrength && hasMuscle;
  const goalsLabel = activeGoals.map((g) => ATHLETE_GOAL_CONFIGS[g]?.label || g).join(' + ');

  const evidenceCount = history.length;
  const lastSession = history[history.length - 1];
  const lastSets = lastSession.sets;
  const lastWeight = lastSession.bestWeight;
  const lastReps = lastSession.bestReps;
  const lastSetsCount = lastSets.length;
  const effort = lastSession.fatigue;

  const todayStr = new Date().toISOString().split('T')[0];
  const increment = userUnit === 'lbs' ? 5 : 2.5;

  const confidenceTier = getConfidenceTier(evidenceCount);
  const confidence =
    confidenceTier === 'high_confidence'
      ? 'high'
      : confidenceTier === 'established'
      ? 'established'
      : confidenceTier === 'early_signal'
      ? 'early_signal'
      : 'calibrating';

  // ── CASE A: Exceeded Target RPE / Elevated Effort Drift ─────────────────────
  if (effort.hasEffortSpike || effort.averageRpe >= 9.2) {
    const reductionKg = Math.max(increment, Math.round((lastWeight * 0.035) / increment) * increment);
    const safeWeight = Math.max(userUnit === 'kg' ? 20 : 45, lastWeight - reductionKg);
    const deltaKg = Math.round((safeWeight - lastWeight) * 10) / 10;
    const deltaPercent = Math.round((deltaKg / Math.max(1, lastWeight)) * 1000) / 10;

    const deficitNote = hasFatLoss
      ? ` Under your active goal of Fat Loss, managing systemic fatigue is vital.`
      : '';

    return {
      id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      exerciseName,
      date: todayStr,
      programIntent: 'readiness_adaptation',
      previousPerformance: {
        weight: lastWeight,
        reps: lastReps,
        rpe: effort.averageRpe,
        sets: lastSetsCount,
      },
      nextPrescription: {
        weight: safeWeight,
        reps: lastReps,
        targetRpe: 8.0,
        sets: Math.min(3, lastSetsCount),
      },
      expectedRpe: 8.0,
      reasonType: 'exceeded_rpe',
      headline: 'Target RPE Exceeded — Load Adjusted',
      explanation: `In your previous session (${lastSession.date}), effort spiked to RPE ${effort.averageRpe} with a within-session drift of +${effort.rpeDriftPerSet} RPE/set.${deficitNote} Load is adjusted by ${deltaKg}${userUnit} (${deltaPercent}%) to restore clean bar velocity at target RPE 8.0 across comparable exposures.`,
      deltaKg,
      deltaPercent,
      confidence,
      evidenceCount,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }

  // ── CASE B: Missed Reps (Rep drop-off) ───────────────────────────────────────
  if (effort.repDrop >= 2 || (lastSets.length >= 2 && lastSets[lastSets.length - 1].reps <= 3 && lastReps >= 6)) {
    const holdWeight = lastWeight;
    const isHypertrophyFocus = hasMuscle && !hasStrength;

    return {
      id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      exerciseName,
      date: todayStr,
      programIntent: isHypertrophyFocus ? 'hypertrophy' : 'technique',
      previousPerformance: {
        weight: lastWeight,
        reps: lastReps,
        rpe: effort.averageRpe,
        sets: lastSetsCount,
      },
      nextPrescription: {
        weight: holdWeight,
        reps: lastReps,
        targetRpe: 8.0,
        sets: lastSetsCount,
      },
      expectedRpe: 8.0,
      reasonType: 'missed_reps',
      headline: isHypertrophyFocus ? 'Volume Consolidation (Hypertrophy)' : 'Rep Drop Detected — Volume Consolidation',
      explanation: `Reps dropped across later sets in your last exposure (${lastSets[0].reps} → ${lastSets[lastSets.length - 1].reps}). Load is held at ${holdWeight}${userUnit} to consolidate repeatable technical execution and quality mechanical tension across all working sets.`,
      deltaKg: 0,
      deltaPercent: 0,
      confidence,
      evidenceCount,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }

  // ── CASE C: Positive Overload (Reserve confirmed) ───────────────────────────
  const allSetsClean = lastSets.every((s) => (s.rpe ?? 8) <= 8.0 && s.reps >= 4);
  if (allSetsClean || (evidenceCount >= 2 && effort.averageRpe <= 8.0)) {
    const nextWeight = lastWeight + increment;
    const deltaKg = increment;
    const deltaPercent = Math.round((deltaKg / Math.max(1, lastWeight)) * 1000) / 10;

    // Reps & sets targets tailored to athlete's active goals
    let targetRepPrescription = Math.max(4, lastReps - 1);
    let targetSetsPrescription = lastSetsCount;
    let intent: 'progressive_overload' | 'strength' | 'hypertrophy' = 'progressive_overload';

    if (isPowerbuilding) {
      targetRepPrescription = Math.max(4, Math.min(6, lastReps - 1));
      targetSetsPrescription = Math.min(4, Math.max(3, lastSetsCount));
      intent = 'progressive_overload';
    } else if (hasStrength) {
      targetRepPrescription = Math.max(3, Math.min(5, lastReps - 1));
      targetSetsPrescription = Math.min(4, Math.max(3, lastSetsCount));
      intent = 'strength';
    } else if (hasMuscle) {
      targetRepPrescription = Math.max(8, Math.min(12, lastReps - 1));
      targetSetsPrescription = Math.min(4, Math.max(3, lastSetsCount));
      intent = 'hypertrophy';
    } else if (hasStamina) {
      targetRepPrescription = Math.max(12, Math.min(15, lastReps - 1));
      targetSetsPrescription = lastSetsCount;
      intent = 'progressive_overload';
    } else if (hasFatLoss) {
      targetRepPrescription = Math.max(5, Math.min(8, lastReps - 1));
      targetSetsPrescription = Math.min(3, lastSetsCount); // Capped to avoid excess fatigue in deficit
      intent = 'strength';
    }

    const headline = isPowerbuilding
      ? `Powerbuilding Overload Prescribed (+${increment} ${userUnit})`
      : hasMuscle && !hasStrength
      ? `Hypertrophy Overload Prescribed (+${increment} ${userUnit})`
      : hasStrength
      ? `Strength Overload Prescribed (+${increment} ${userUnit})`
      : hasFatLoss
      ? `Tension-Sparing Overload Prescribed (+${increment} ${userUnit})`
      : hasStamina
      ? `Work Capacity Overload Prescribed (+${increment} ${userUnit})`
      : `Progressive Overload Prescribed (+${increment} ${userUnit})`;

    let goalExplanation = `All working sets on ${lastSession.date} were completed with reserve (average RPE ${effort.averageRpe} ≤ 8.0). Progressive overload of +${increment}${userUnit} (+${deltaPercent}%) is recommended, targeting ${targetRepPrescription} reps tailored to your ${goalsLabel} focus.`;
    if (hasStrength && !isPowerbuilding) {
      goalExplanation = `All working sets on ${lastSession.date} were completed with clean bar velocity (average RPE ${effort.averageRpe} ≤ 8.0). Adding +${increment}${userUnit} (+${deltaPercent}%) targeting ${targetRepPrescription} reps drives high-threshold motor unit recruitment and peak neurological strength adaptation.`;
    } else if (hasMuscle && !hasStrength) {
      goalExplanation = `Working sets on ${lastSession.date} were completed with reserve (average RPE ${effort.averageRpe} ≤ 8.0). Overloading with +${increment}${userUnit} (+${deltaPercent}%) targeting ${targetRepPrescription} reps delivers the progressive mechanical tension needed for sustained myofibrillar hypertrophy.`;
    } else if (hasFatLoss) {
      goalExplanation = `Sets completed with solid technical reserve (average RPE ${effort.averageRpe} ≤ 8.0). Progressive overload of +${increment}${userUnit} (+${deltaPercent}%) targeting ${targetRepPrescription} reps maintains high contractile tension to signal muscle retention while in a caloric deficit.`;
    } else if (hasStamina) {
      goalExplanation = `Endurance threshold was maintained cleanly (average RPE ${effort.averageRpe} ≤ 8.0). Incrementing load by +${increment}${userUnit} (+${deltaPercent}%) for ${targetRepPrescription} reps builds muscular stamina and expands your lactate threshold under load.`;
    }

    return {
      id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      exerciseName,
      date: todayStr,
      programIntent: intent,
      previousPerformance: {
        weight: lastWeight,
        reps: lastReps,
        rpe: effort.averageRpe,
        sets: lastSetsCount,
      },
      nextPrescription: {
        weight: nextWeight,
        reps: targetRepPrescription,
        targetRpe: 8.0,
        sets: targetSetsPrescription,
      },
      expectedRpe: 8.0,
      reasonType: 'progressive_overload',
      headline,
      explanation: goalExplanation,
      deltaKg,
      deltaPercent,
      confidence,
      evidenceCount,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }

  // ── CASE D: Baseline Progression (+1 Rep Target) ───────────────────────────
  const isHyper = hasMuscle && !hasStrength;

  let caseDExplanation = `Your performance on ${lastWeight}${userUnit} is calibrated. Today's target is pushing for +1 rep on your top set (${lastReps} → ${lastReps + 1} reps) while maintaining RPE ≤ 8.5, building work capacity for your ${goalsLabel} goal.`;
  if (hasStrength && !isPowerbuilding) {
    caseDExplanation = `Your previous top set was ${lastWeight}${userUnit} × ${lastReps}. Pushing for +1 rep (${lastReps} → ${lastReps + 1} reps) today demonstrates repeatable bar control before stepping up to the next weight milestone.`;
  } else if (hasMuscle && !hasStrength) {
    caseDExplanation = `Target +1 rep volume overload (${lastReps} → ${lastReps + 1} reps) at ${lastWeight}${userUnit}. Squeezing out one more high-quality rep near failure accumulates effective hypertrophic volume with zero joint penalty.`;
  } else if (hasFatLoss) {
    caseDExplanation = `Hold ${lastWeight}${userUnit} and aim for +1 clean rep (${lastReps} → ${lastReps + 1} reps). Controlled volume progression preserves contractile tissue without generating excessive systemic fatigue.`;
  } else if (hasStamina) {
    caseDExplanation = `Maintain ${lastWeight}${userUnit} and push the set ceiling by +1 rep (${lastReps} → ${lastReps + 1} reps) to condition your muscular endurance and aerobic recovery.`;
  }

  return {
    id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    exerciseName,
    date: todayStr,
    programIntent: isHyper ? 'hypertrophy' : 'strength',
    previousPerformance: {
      weight: lastWeight,
      reps: lastReps,
      rpe: effort.averageRpe,
      sets: lastSetsCount,
    },
    nextPrescription: {
      weight: lastWeight,
      reps: lastReps + 1,
      targetRpe: 8.5,
      sets: lastSetsCount,
    },
    expectedRpe: 8.5,
    reasonType: 'fatigue_hold',
    headline: `Target +1 Rep Overload (${lastReps} → ${lastReps + 1})`,
    explanation: caseDExplanation,
    deltaKg: 0,
    deltaPercent: 0,
    confidence,
    evidenceCount,
    status: 'pending',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Builds the empirical Lifter Training Response Profile grounded in verified gym exposures.
 */
export function generateLifterTwinProfile(
  workouts: WorkoutEntry[],
  userUnit: 'kg' | 'lbs' = 'kg'
): LifterTwinProfile {
  const profile: LifterTwinProfile = {
    totalAnalyzedExposures: 0,
    exercises: {},
    lastUpdated: new Date().toISOString(),
  };

  if (!workouts || workouts.length === 0) return profile;

  // Track all unique exercise names
  const exerciseNames = new Set<string>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      if (e.name && e.sets.some((s) => s.reps > 0)) {
        exerciseNames.add(e.name.trim());
      }
    }
  }

  let totalExposuresCount = 0;

  for (const name of exerciseNames) {
    const history = getExerciseHistorySessions(name, workouts);
    if (history.length === 0) continue;

    totalExposuresCount += history.length;
    const evidenceCount = history.length;
    const confidenceTier = getConfidenceTier(evidenceCount);

    // 1. Best-Supported Rep Range (Evidence statement where top-set performance was most consistent)
    const sortedByE1RM = [...history].sort((a, b) => b.bestE1RM - a.bestE1RM);
    const topSessions = sortedByE1RM.slice(0, Math.min(3, sortedByE1RM.length));
    const avgBestReps = Math.round(
      topSessions.reduce((sum, s) => sum + s.bestReps, 0) / topSessions.length
    );
    const minRepRange = Math.max(3, avgBestReps - 1);
    const maxRepRange = Math.max(minRepRange + 2, avgBestReps + 1);

    // 2. Within-Session Effort Drift
    const avgRpeDrift =
      history.reduce((sum, s) => sum + s.fatigue.rpeDriftPerSet, 0) / history.length;
    const cleanDrift = Math.round(avgRpeDrift * 10) / 10;
    const withinSessionEffortDrift: 'low' | 'moderate' | 'high' =
      cleanDrift > 0.4 ? 'high' : cleanDrift > 0.15 ? 'moderate' : 'low';

    // 3. Observed Successful Recovery Interval (Days between sessions)
    let avgDaysBetween = 3;
    if (history.length >= 2) {
      const dayDiffs: number[] = [];
      for (let i = 1; i < history.length; i++) {
        const d1 = new Date(history[i - 1].date).getTime();
        const d2 = new Date(history[i].date).getTime();
        const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
        if (diffDays >= 1 && diffDays <= 14) {
          dayDiffs.push(diffDays);
        }
      }
      if (dayDiffs.length > 0) {
        avgDaysBetween = Math.round(dayDiffs.reduce((a, b) => a + b, 0) / dayDiffs.length);
      }
    }

    const minRecoveryDays = Math.max(2, avgDaysBetween - 1);
    const maxRecoveryDays = Math.max(minRecoveryDays + 1, avgDaysBetween + 1);

    // 4. Observed Frequency Range (No fake decimals)
    const minWeeklyFreq = Math.max(1, Math.floor(7 / Math.max(3, maxRecoveryDays)));
    const maxWeeklyFreq = Math.max(minWeeklyFreq, Math.min(3, Math.ceil(7 / Math.max(2, minRecoveryDays))));

    // 5. e1RM Trend
    let e1RMTrend: 'rising' | 'stable' | 'fatigued' = 'stable';
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const recentAvg = recent.reduce((sum, s) => sum + s.bestE1RM, 0) / 3;
      const initialAvg = history.slice(0, 3).reduce((sum, s) => sum + s.bestE1RM, 0) / 3;
      if (recentAvg > initialAvg * 1.02) {
        e1RMTrend = 'rising';
      } else if (recentAvg < initialAvg * 0.97) {
        e1RMTrend = 'fatigued';
      } else {
        e1RMTrend = 'stable';
      }
    } else {
      e1RMTrend = 'rising';
    }

    // 6. Grounded Empirical Observations
    const observations: string[] = [];

    if (evidenceCount >= 5) {
      observations.push(
        `${minRepRange}–${maxRepRange} reps produced your most consistent top-set performance across ${evidenceCount} comparable exposures.`
      );
      observations.push(
        `Within-session effort drift averages ${cleanDrift >= 0 ? `+${cleanDrift}` : cleanDrift} RPE/set across working sets (${withinSessionEffortDrift} effort drift).`
      );
      observations.push(
        `Performance has been most consistent when heavy exposures are separated by ${minRecoveryDays}–${maxRecoveryDays} days.`
      );
      observations.push(
        `Observed training frequency: ${minWeeklyFreq === maxWeeklyFreq ? `${minWeeklyFreq}×` : `${minWeeklyFreq}–${maxWeeklyFreq}×`} / week.`
      );
    } else {
      observations.push(
        `Calibrating baseline: ${evidenceCount} of 5 comparable sessions recorded. Log ${5 - evidenceCount} more session(s) to verify individual response patterns.`
      );
    }

    profile.exercises[name] = {
      exerciseName: name,
      evidenceCount,
      confidenceTier,
      calibrationStatus: evidenceCount >= 10 ? 'calibrated' : evidenceCount >= 5 ? 'early_trend' : 'calibrating',
      bestSupportedRepRange: { min: minRepRange, max: maxRepRange },
      optimalRepRange: { min: minRepRange, max: maxRepRange },
      targetRpeRange: { min: 7.5, max: 8.5 },
      withinSessionEffortDrift,
      fatigueSensitivity: withinSessionEffortDrift,
      rpeDriftPerSet: cleanDrift,
      observedWeeklyFrequencyRange: { min: minWeeklyFreq, max: maxWeeklyFreq },
      recommendedWeeklyFrequency: maxWeeklyFreq,
      bestProgressionStepKg: userUnit === 'lbs' ? 5 : 2.5,
      observedRecoveryIntervalDays: { min: minRecoveryDays, max: maxRecoveryDays },
      recoveryDaysNeeded: avgDaysBetween,
      e1RMTrend,
      observations,
    };
  }

  profile.totalAnalyzedExposures = totalExposuresCount;
  return profile;
}

/**
 * Stimulus-Preserving Substitution Dictionary:
 * Matches movement patterns & target effort brackets WITHOUT fake numerical load multipliers.
 */
export interface StimulusPreservingSwap {
  target: string;
  targetSets: number;
  targetReps: number;
  targetRpe: number;
  stimulusReason: string;
}

export const STIMULUS_PRESERVING_SWAPS: Record<string, StimulusPreservingSwap[]> = {
  'Bench Press': [
    { target: 'Dumbbell Press', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Preserves horizontal chest press stimulus; athlete selects dumbbell load to hit target RPE 8' },
    { target: 'Chest Press Machine', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'High stability machine compound press when bench station is occupied' },
    { target: 'Dips', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Bodyweight or weighted compound push preserving pectoral and tricep stimulus' },
    { target: 'Push-ups', targetSets: 3, targetReps: 15, targetRpe: 8, stimulusReason: 'Bodyweight horizontal pressing alternative without requiring equipment' },
  ],
  'Incline Bench': [
    { target: 'Incline Dumbbell Press', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Independent arm movement with deep stretch on clavicular fibers' },
    { target: 'Barbell Bench Press', targetSets: 3, targetReps: 6, targetRpe: 8, stimulusReason: 'Compound bilateral pressing overload' },
    { target: 'Chest Press Machine', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Safe, stable upper chest path' },
  ],
  'Dumbbell Press': [
    { target: 'Barbell Bench Press', targetSets: 3, targetReps: 6, targetRpe: 8, stimulusReason: 'Bilateral heavy compound chest driver' },
    { target: 'Incline Dumbbell Press', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Upper chest emphasis with dumbbell stretch' },
    { target: 'Dips', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Bodyweight compound push builder' },
  ],
  'Squat': [
    { target: 'Leg Press', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Preserves quad mechanical tension without axial spine loading; select machine pin load to match RPE 8' },
    { target: 'Hack Squat', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Deep quad knee flexion with fixed lumbar support' },
    { target: 'Front Squat', targetSets: 3, targetReps: 6, targetRpe: 8, stimulusReason: 'Barbell quad driver with upright torso mechanics' },
    { target: 'Goblet Squat', targetSets: 3, targetReps: 12, targetRpe: 8, stimulusReason: 'Preserves knee flexion and quad stimulus when rack is unavailable' },
  ],
  'Leg Press': [
    { target: 'Hack Squat', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Continuous quad tension with lumbar support' },
    { target: 'Barbell Squat', targetSets: 3, targetReps: 6, targetRpe: 8, stimulusReason: 'Full systemic leg & core driver' },
    { target: 'Bulgarian Split Squat', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Unilateral quad and glute focus' },
  ],
  'Deadlift': [
    { target: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Preserves hip hinge and posterior chain recruitment with reduced systemic fatigue' },
    { target: 'Trap Bar Deadlift', targetSets: 3, targetReps: 6, targetRpe: 8, stimulusReason: 'Lower lumbar shear with great quad and trap drive' },
    { target: 'Barbell Row', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Preserves spinal erector bracing and posterior back tension' },
  ],
  'Romanian Deadlift': [
    { target: 'Dumbbell Romanian Deadlift', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Natural hip hinge with dumbbell positioning' },
    { target: 'Seated Leg Curl', targetSets: 3, targetReps: 12, targetRpe: 8, stimulusReason: 'Isolated knee flexion hamstring work' },
    { target: 'Good Mornings', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Posterior chain hip hinge loading' },
  ],
  'Barbell Row': [
    { target: 'Dumbbell Row', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Preserves lat and upper back stimulus without lower back fatigue' },
    { target: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Preserves vertical pulling volume when row station is busy' },
    { target: 'Cable Seated Row', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Smooth cable resistance across full range of motion' },
  ],
  'Pull-ups': [
    { target: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Vertical pulling volume with micro-adjustable resistance' },
    { target: 'Underhand Chin-ups', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Higher bicep leverage vertical pull' },
    { target: 'Straight Arm Pulldown', targetSets: 3, targetReps: 12, targetRpe: 8, stimulusReason: 'Pure lat isolation without arm fatigue' },
  ],
  'Lat Pulldown': [
    { target: 'Pull-ups', targetSets: 3, targetReps: 6, targetRpe: 8, stimulusReason: 'Bodyweight vertical pulling gold standard' },
    { target: 'Underhand Cable Pulldown', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Closer grip targeting lower lat fibers' },
    { target: 'Cable Seated Row', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Horizontal pulling volume when pulldown tower is busy' },
  ],
  'Overhead Press': [
    { target: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Preserves vertical pressing stimulus; athlete selects dumbbell weight to hit target RPE 8' },
    { target: 'Arnold Press', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Full 3D deltoid rotation and hypertrophy stimulus' },
    { target: 'Machine Shoulder Press', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Stable overhead burnout without core stabilization fatigue' },
  ],
  'Dumbbell Shoulder Press': [
    { target: 'Barbell Overhead Press', targetSets: 3, targetReps: 6, targetRpe: 8, stimulusReason: 'Heavy bilateral strength builder' },
    { target: 'Machine Shoulder Press', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Fixed deltoid path' },
    { target: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12, targetRpe: 8, stimulusReason: 'Direct side deltoid hypertrophy' },
  ],
  'Dumbbell Curl': [
    { target: 'Incline Dumbbell Curl', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Maximum stretch on long head of biceps' },
    { target: 'Barbell Bicep Curl', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Heavy bilateral overload' },
    { target: 'Hammer Curl', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Brachialis and forearm thickness focus' },
  ],
  'Tricep Pushdown': [
    { target: 'Overhead Cable Tricep Extension', targetSets: 3, targetReps: 12, targetRpe: 8, stimulusReason: 'Long head tricep stretch' },
    { target: 'Skull Crushers', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Heavy compound tricep builder' },
    { target: 'Dips', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Compound tricep press with bodyweight' },
  ],
  'Dips': [
    { target: 'Close Grip Bench', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Heavy tricep compound pressing' },
    { target: 'Tricep Pushdown', targetSets: 3, targetReps: 12, targetRpe: 8, stimulusReason: 'Isolated cable elbow extension' },
    { target: 'Dumbbell Press', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Chest & tricep pressing' },
  ],
};

export function getStimulusPreservingSwaps(exerciseName: string): StimulusPreservingSwap[] {
  if (!exerciseName) return [];
  const norm = normalizeExerciseName(exerciseName);

  if (STIMULUS_PRESERVING_SWAPS[norm]) {
    return STIMULUS_PRESERVING_SWAPS[norm];
  }

  const lower = exerciseName.trim().toLowerCase();
  for (const [key, swaps] of Object.entries(STIMULUS_PRESERVING_SWAPS)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return swaps;
    }
  }

  const eq = getEquipmentType(exerciseName);
  if (eq === 'dumbbell') {
    return [
      { target: 'Barbell equivalent', targetSets: 3, targetReps: 8, targetRpe: 8, stimulusReason: 'Heavier bilateral loading to preserve motor recruitment' },
      { target: 'Cable variation', targetSets: 3, targetReps: 12, targetRpe: 8, stimulusReason: 'Continuous resistance curve and joint comfort' },
    ];
  }
  return [
    { target: 'Dumbbell alternative', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'Independent limb freedom and stabilizer recruitment' },
    { target: 'Machine alternative', targetSets: 3, targetReps: 10, targetRpe: 8, stimulusReason: 'High stability and controlled path when free weights are busy' },
  ];
}

/**
 * Real-world constraint adaptation engine:
 * Adapts workout session when life happens (time short, equipment busy, low readiness),
 * preserving training intent without fake biomechanical load conversions.
 */
export function adaptWorkoutForConstraints(
  exercises: WorkoutExercise[],
  constraint: RealWorldConstraint,
  userUnit: 'kg' | 'lbs' = 'kg'
): {
  adaptedExercises: WorkoutExercise[];
  changesSummary: string[];
  timeSavedMinutes: number;
} {
  if (!exercises || exercises.length === 0) {
    return { adaptedExercises: [], changesSummary: [], timeSavedMinutes: 0 };
  }

  const adapted: WorkoutExercise[] = JSON.parse(JSON.stringify(exercises));
  const changesSummary: string[] = [];
  let timeSavedMinutes = 0;

  // ── 1. TIME CONSTRAINT (e.g. 30m, 45m quick mode) ──────────────────────────
  if (constraint.type === 'time') {
    const limit = constraint.availableMinutes || 45;

    // A. Keep Exercise 0 (Main Compound) with full intensity, cap working sets at 3
    if (adapted[0] && adapted[0].sets.length > 3) {
      const removedSets = adapted[0].sets.length - 3;
      adapted[0].sets = adapted[0].sets.slice(0, 3);
      timeSavedMinutes += removedSets * 3;
      changesSummary.push(`Capped ${adapted[0].name} at 3 primary sets (saved ~${removedSets * 3}m)`);
    }

    // B. Trim lowest-priority accessory if session is long
    if (adapted.length > 3) {
      const removedEx = adapted.pop()!;
      timeSavedMinutes += 10;
      changesSummary.push(`Dropped accessory (${removedEx.name}) to protect core compound volume (saved ~10m)`);
    }

    // C. Streamline remaining accessories to 2 focused sets, protect compound lifts
    for (let i = 1; i < adapted.length; i++) {
      const isCompound = isMainCompoundLift(adapted[i].name);
      const capSets = isCompound ? 3 : 2;
      if (adapted[i].sets.length > capSets) {
        const removed = adapted[i].sets.length - capSets;
        adapted[i].sets = adapted[i].sets.slice(0, capSets);
        timeSavedMinutes += removed * 2.5;
        changesSummary.push(`Streamlined ${adapted[i].name} to ${capSets} focused sets (saved ~${Math.round(removed * 2.5)}m)`);
      }
    }

    changesSummary.push(`Session adjusted to fit within ~${limit}m`);
    return { adaptedExercises: adapted, changesSummary, timeSavedMinutes: Math.max(8, Math.round(timeSavedMinutes)) };
  }

  // ── 2. EQUIPMENT OCCUPIED / UNAVAILABLE ──────────────────────────────────────
  if (constraint.type === 'equipment') {
    const targetExName = constraint.targetExerciseName || adapted[0]?.name;
    const substituteName = constraint.substituteExerciseName;

    const exIndex = adapted.findIndex(
      (e) => e.name.toLowerCase() === targetExName.toLowerCase()
    );

    if (exIndex !== -1) {
      const currentEx = adapted[exIndex];
      const swapOptions = getStimulusPreservingSwaps(currentEx.name);

      let newName = substituteName;
      let targetSets = currentEx.sets.length > 0 ? currentEx.sets.length : 3;
      let targetReps = currentEx.sets[0]?.reps || 8;
      let targetRpe = 8.0;
      let stimulusReason = 'Preserved primary movement stimulus on alternative apparatus';

      if (swapOptions && swapOptions.length > 0) {
        const chosen = substituteName
          ? swapOptions.find((o) => o.target.toLowerCase() === substituteName.toLowerCase()) || swapOptions[0]
          : swapOptions[0];
        newName = chosen.target;
        targetSets = currentEx.sets.length > 0 ? currentEx.sets.length : chosen.targetSets;
        targetReps = chosen.targetReps;
        targetRpe = chosen.targetRpe;
        stimulusReason = chosen.stimulusReason;
      } else {
        newName = substituteName || `${currentEx.name} (DB / Machine)`;
      }

      // Safe, evidence-based load handling:
      // Do NOT copy a 100kg barbell load onto dumbbells or bodyweight movements!
      const isNewBodyweight = isBodyweightExercise(newName);
      const isNewDumbbell = isDumbbellExercise(newName);
      const isOldDumbbell = isDumbbellExercise(currentEx.name);

      let targetWeight = currentEx.sets[0]?.weight || 0;
      if (isNewBodyweight) {
        targetWeight = 0; // Pure bodyweight baseline
      } else if (isNewDumbbell && !isOldDumbbell) {
        // Barbell to dumbbell conversion without personal history:
        // Set safe exploratory calibration weight (~35% of barbell weight per hand)
        targetWeight = Math.max(userUnit === 'kg' ? 12 : 25, Math.round(targetWeight * 0.35));
      }

      const nextSets: WorkoutSet[] = Array.from({ length: targetSets }, () => ({
        weight: targetWeight,
        reps: targetReps,
        rpe: targetRpe,
        unit: currentEx.sets[0]?.unit || userUnit,
        completed: false,
      }));

      adapted[exIndex] = {
        ...currentEx,
        name: newName,
        sets: nextSets,
      };

      changesSummary.push(`Swapped "${currentEx.name}" → "${newName}" (${stimulusReason})`);
      changesSummary.push(`Prescribed: ${targetSets} sets × ${targetReps} reps @ target RPE ${targetRpe}. Select working load by feel on the new apparatus.`);
      return { adaptedExercises: adapted, changesSummary, timeSavedMinutes: 8 };
    }
  }

  // ── 3. LOW READINESS / POOR SLEEP ADJUSTMENT ─────────────────────────────────
  if (constraint.type === 'readiness' || constraint.type === 'fatigue') {
    let trimmedSets = 0;
    for (let i = 0; i < adapted.length; i++) {
      // Reduce 1 set across secondary exercises
      if (i > 0 && adapted[i].sets.length > 2) {
        adapted[i].sets = adapted[i].sets.slice(0, adapted[i].sets.length - 1);
        trimmedSets++;
      }
      // Cap RPE at 7.5 to preserve movement pattern without excessive fatigue
      adapted[i].sets = adapted[i].sets.map((s) => ({
        ...s,
        rpe: Math.min(7.5, s.rpe ?? 7.5),
      }));
    }

    const calculatedTimeSaved = Math.max(5, Math.round(trimmedSets * 2.5));
    changesSummary.push('Low Readiness Adaptation applied (poor sleep / elevated stress)');
    changesSummary.push(`Trimmed ${trimmedSets} secondary set${trimmedSets === 1 ? '' : 's'} to manage fatigue accumulation`);
    changesSummary.push('Capped target RPE at ≤ 7.5 across sets to preserve technique without excessive fatigue');
    return { adaptedExercises: adapted, changesSummary, timeSavedMinutes: calculatedTimeSaved };
  }

  return { adaptedExercises: adapted, changesSummary: ['Workout intact'], timeSavedMinutes: 0 };
}
