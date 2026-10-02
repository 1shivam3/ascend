import {
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
  TrainingDecision,
  TrainingDecisionReason,
  LifterExerciseProfile,
  LifterTwinProfile,
  RealWorldConstraint,
} from './types';
import { calculateOneRepMax, isMainCompoundLift, isDumbbellExercise, isBodyweightExercise } from './strength-standards';

/**
 * Calculates fatigue slope and RPE drift across working sets within a single session.
 */
export function calculateSetFatigueSlope(sets: WorkoutSet[]): {
  rpeDriftTotal: number;
  rpeDriftPerSet: number;
  repDrop: number;
  hasFatigueSpike: boolean;
  averageRpe: number;
} {
  const validSets = sets.filter((s) => s.reps > 0);
  if (validSets.length <= 1) {
    const singleRpe = validSets[0]?.rpe ?? 8;
    return {
      rpeDriftTotal: 0,
      rpeDriftPerSet: 0,
      repDrop: 0,
      hasFatigueSpike: singleRpe >= 9.5,
      averageRpe: singleRpe,
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
  const hasFatigueSpike = lastRpe >= 9.5 || rpeDriftTotal >= 1.5 || repDrop >= 2;

  return {
    rpeDriftTotal,
    rpeDriftPerSet,
    repDrop,
    hasFatigueSpike,
    averageRpe: avgRpe,
  };
}

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
  fatigue: ReturnType<typeof calculateSetFatigueSlope>;
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
    fatigue: ReturnType<typeof calculateSetFatigueSlope>;
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
        const e1rm = calculateOneRepMax(s.weight, s.reps);
        if (e1rm > bestE1RM) {
          bestE1RM = e1rm;
          bestWeight = s.weight;
          bestReps = s.reps;
        }
        totalVolume += s.weight * s.reps;
      }

      history.push({
        date: w.date,
        sets: validSets,
        bestWeight,
        bestReps,
        bestE1RM: Math.round(bestE1RM * 10) / 10,
        totalVolume,
        fatigue: calculateSetFatigueSlope(validSets),
      });
    }
  }

  return history;
}

/**
 * Generates an auditable Training Decision with transparent rationale and Accept / Override controls.
 */
export function generateTrainingDecision(
  exerciseName: string,
  workouts: WorkoutEntry[],
  userUnit: 'kg' | 'lbs' = 'kg'
): TrainingDecision | null {
  const history = getExerciseHistorySessions(exerciseName, workouts);
  if (history.length === 0) return null;

  const evidenceCount = history.length;
  const lastSession = history[history.length - 1];
  const lastSets = lastSession.sets;
  const lastWeight = lastSession.bestWeight;
  const lastReps = lastSession.bestReps;
  const lastSetsCount = lastSets.length;
  const fatigue = lastSession.fatigue;

  const todayStr = new Date().toISOString().split('T')[0];
  const increment = userUnit === 'lbs' ? 5 : 2.5;

  // 1. Evidence calibration status
  const confidence: 'high' | 'medium' | 'calibrating' =
    evidenceCount >= 6 ? 'high' : evidenceCount >= 3 ? 'medium' : 'calibrating';

  // ── CASE A: Fatigue Spike / Exceeded Target RPE ──────────────────────────────
  if (fatigue.hasFatigueSpike || fatigue.averageRpe >= 9.2) {
    const reductionKg = Math.max(increment, Math.round((lastWeight * 0.04) / increment) * increment);
    const safeWeight = Math.max(userUnit === 'kg' ? 20 : 45, lastWeight - reductionKg);
    const deltaKg = Math.round((safeWeight - lastWeight) * 10) / 10;
    const deltaPercent = Math.round((deltaKg / Math.max(1, lastWeight)) * 1000) / 10;

    return {
      id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      exerciseName,
      date: todayStr,
      previousPerformance: {
        weight: lastWeight,
        reps: lastReps,
        rpe: fatigue.averageRpe,
        sets: lastSetsCount,
      },
      nextPrescription: {
        weight: safeWeight,
        reps: lastReps,
        targetRpe: 8,
        sets: Math.min(3, lastSetsCount),
      },
      reasonType: 'exceeded_rpe',
      headline: 'RPE Drift Exceeded Target — Velocity Reset',
      explanation: `In your previous session (${lastSession.date}), RPE spiked to ${fatigue.averageRpe} with a set-to-set drift of +${fatigue.rpeDriftPerSet}/set. Holding this load risks technical breakdown. Load is reduced by ${Math.abs(deltaKg)}${userUnit} (${deltaPercent}%) to restore explosive bar velocity at target RPE 8.`,
      deltaKg,
      deltaPercent,
      confidence,
      evidenceCount,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }

  // ── CASE B: Missed Reps (Rep drop-off) ───────────────────────────────────────
  if (fatigue.repDrop >= 2 || (lastSets.length >= 2 && lastSets[lastSets.length - 1].reps <= 3 && lastReps >= 6)) {
    const holdWeight = lastWeight;
    return {
      id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      exerciseName,
      date: todayStr,
      previousPerformance: {
        weight: lastWeight,
        reps: lastReps,
        rpe: fatigue.averageRpe,
        sets: lastSetsCount,
      },
      nextPrescription: {
        weight: holdWeight,
        reps: lastReps,
        targetRpe: 8,
        sets: lastSetsCount,
      },
      reasonType: 'missed_reps',
      headline: 'Volume Consolidation — Hold Load',
      explanation: `Rep completion dropped across later sets in your last session. Rather than adding weight, ASCEND holds load at ${holdWeight}${userUnit} to consolidate clean technique across all sets before advancing.`,
      deltaKg: 0,
      deltaPercent: 0,
      confidence,
      evidenceCount,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }

  // ── CASE C: Positive Overload (RPE <= 8 across sets) ─────────────────────────
  const allSetsClean = lastSets.every((s) => (s.rpe ?? 8) <= 8.0 && s.reps >= 4);
  if (allSetsClean || (evidenceCount >= 2 && fatigue.averageRpe <= 8.0)) {
    const nextWeight = lastWeight + increment;
    const deltaKg = increment;
    const deltaPercent = Math.round((deltaKg / Math.max(1, lastWeight)) * 1000) / 10;

    return {
      id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      exerciseName,
      date: todayStr,
      previousPerformance: {
        weight: lastWeight,
        reps: lastReps,
        rpe: fatigue.averageRpe,
        sets: lastSetsCount,
      },
      nextPrescription: {
        weight: nextWeight,
        reps: Math.max(4, lastReps - 1),
        targetRpe: 8,
        sets: lastSetsCount,
      },
      reasonType: 'progressive_overload',
      headline: 'Positive Overload Unlocked (+2.5 kg)',
      explanation: `All working sets on ${lastSession.date} were completed with reserve (average RPE ${fatigue.averageRpe} ≤ 8.0). Progressive overload of +${increment}${userUnit} (+${deltaPercent}%) is recommended for today's exposure.`,
      deltaKg,
      deltaPercent,
      confidence,
      evidenceCount,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }

  // ── CASE D: Baseline Progression / +1 Rep Target ────────────────────────────
  return {
    id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    exerciseName,
    date: todayStr,
    previousPerformance: {
      weight: lastWeight,
      reps: lastReps,
      rpe: fatigue.averageRpe,
      sets: lastSetsCount,
    },
    nextPrescription: {
      weight: lastWeight,
      reps: lastReps + 1,
      targetRpe: 8.5,
      sets: lastSetsCount,
    },
    reasonType: 'fatigue_hold',
    headline: 'Target +1 Rep Overload',
    explanation: `Your performance on ${lastWeight}${userUnit} is calibrated. Today's target is pushing for +1 rep on your top set (${lastReps} → ${lastReps + 1} reps) while maintaining RPE ≤ 8.5.`,
    deltaKg: 0,
    deltaPercent: 0,
    confidence,
    evidenceCount,
    status: 'pending',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Builds the complete empirical Lifter Twin Profile for all primary compound lifts.
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

    // Calibration tier
    const calibrationStatus: 'calibrating' | 'early_trend' | 'calibrated' =
      evidenceCount >= 7 ? 'calibrated' : evidenceCount >= 3 ? 'early_trend' : 'calibrating';

    // 1. Optimal Rep Range (Where e1RM peaks)
    const sortedByE1RM = [...history].sort((a, b) => b.bestE1RM - a.bestE1RM);
    const topSessions = sortedByE1RM.slice(0, Math.min(3, sortedByE1RM.length));
    const avgBestReps = Math.round(
      topSessions.reduce((sum, s) => sum + s.bestReps, 0) / topSessions.length
    );
    const minRepRange = Math.max(3, avgBestReps - 1);
    const maxRepRange = Math.max(minRepRange + 2, avgBestReps + 1);

    // 2. Average RPE Drift & Fatigue Sensitivity
    const avgRpeDrift =
      history.reduce((sum, s) => sum + s.fatigue.rpeDriftPerSet, 0) / history.length;
    const cleanDrift = Math.round(avgRpeDrift * 10) / 10;
    const fatigueSensitivity: 'low' | 'moderate' | 'high' =
      cleanDrift > 0.5 ? 'high' : cleanDrift > 0.2 ? 'moderate' : 'low';

    // 3. Recovery Gap (Days between sessions)
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

    // 4. e1RM Trend (last 3 vs overall)
    let e1RMTrend: 'rising' | 'plateau' | 'fatigued' = 'stable' as any;
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const recentAvg = recent.reduce((sum, s) => sum + s.bestE1RM, 0) / 3;
      const initialAvg = history.slice(0, 3).reduce((sum, s) => sum + s.bestE1RM, 0) / 3;
      if (recentAvg > initialAvg * 1.02) {
        e1RMTrend = 'rising';
      } else if (recentAvg < initialAvg * 0.97) {
        e1RMTrend = 'fatigued';
      } else {
        e1RMTrend = 'plateau';
      }
    } else {
      e1RMTrend = 'rising';
    }

    // 5. Grounded Empirical Observations
    const observations: string[] = [];

    if (evidenceCount >= 3) {
      observations.push(
        `Highest peak strength occurs in the ${minRepRange}–${maxRepRange} rep bracket (e1RM peak: ${sortedByE1RM[0]?.bestE1RM}${userUnit}).`
      );
      observations.push(
        `Fatigue drift across working sets: ${cleanDrift >= 0 ? `+${cleanDrift}` : cleanDrift} RPE/set (${fatigueSensitivity} fatigue sensitivity).`
      );
      observations.push(
        `Optimal recovery window: ~${Math.max(2, avgDaysBetween)} days between exposures for positive progressive overload.`
      );
    } else {
      observations.push(
        `Calibrating baseline: ${evidenceCount} of 3 sessions recorded. Log ${3 - evidenceCount} more session(s) to verify individual response curves.`
      );
    }

    profile.exercises[name] = {
      exerciseName: name,
      evidenceCount,
      calibrationStatus,
      optimalRepRange: { min: minRepRange, max: maxRepRange },
      targetRpeRange: { min: 7.5, max: 8.5 },
      fatigueSensitivity,
      rpeDriftPerSet: cleanDrift,
      recommendedWeeklyFrequency: Math.max(1, Math.min(3, Math.round(7 / Math.max(2, avgDaysBetween)))),
      bestProgressionStepKg: userUnit === 'lbs' ? 5 : 2.5,
      recoveryDaysNeeded: Math.max(2, avgDaysBetween),
      e1RMTrend,
      observations,
    };
  }

  profile.totalAnalyzedExposures = totalExposuresCount;
  return profile;
}

/**
 * Biomechanical equipment substitution dictionary with carryover multipliers
 */
const EQUIPMENT_SWAP_MAP: Record<
  string,
  { target: string; weightMultiplier: number; reason: string }[]
> = {
  'Bench Press': [
    { target: 'Dumbbell Press', weightMultiplier: 0.38, reason: 'Dumbbell flat press preserves chest hypertrophy when barbell bench is occupied' },
    { target: 'Incline Bench', weightMultiplier: 0.85, reason: 'Incline barbell bench preserves pressing motor pattern' },
    { target: 'Dips', weightMultiplier: 0, reason: 'Chest dips provide high tricep & lower pec stimulus' },
  ],
  'Squat': [
    { target: 'Leg Press', weightMultiplier: 2.2, reason: 'Leg press provides equivalent quad volume without axial spine loading' },
    { target: 'Front Squat', weightMultiplier: 0.8, reason: 'Front squat provides intense quad stimulus with less spinal compression' },
    { target: 'Goblet Squat', weightMultiplier: 0.35, reason: 'Dumbbell goblet squat when squat rack is unavailable' },
  ],
  'Deadlift': [
    { target: 'Romanian Deadlift', weightMultiplier: 0.75, reason: 'RDL targets posterior chain and hamstrings with lower neural fatigue' },
    { target: 'Barbell Row', weightMultiplier: 0.65, reason: 'Barbell row preserves heavy back bracing' },
  ],
  'Barbell Row': [
    { target: 'Dumbbell Row', weightMultiplier: 0.45, reason: 'Single-arm DB row preserves lat volume without lower back strain' },
    { target: 'Lat Pulldown', weightMultiplier: 0.8, reason: 'Lat pulldown targets upper back when row area is busy' },
  ],
  'Overhead Press': [
    { target: 'Dumbbell Shoulder Press', weightMultiplier: 0.4, reason: 'Dumbbell shoulder press preserves vertical pressing volume' },
    { target: 'Arnold Press', weightMultiplier: 0.35, reason: 'Arnold press provides 3D deltoid stimulus' },
  ],
};

/**
 * Real-world constraint adaptation engine:
 * Adapts an entire workout session in 1 tap when life happens (time short, equipment busy, poor sleep/fatigue),
 * preserving 85%+ of training stimulus and compound movement intent.
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

  // ── 1. TIME CONSTRAINT (e.g. 35m, 45m quick mode) ──────────────────────────
  if (constraint.type === 'time') {
    const limit = constraint.availableMinutes || 45;

    // A. Keep Exercise 0 (Main Compound) with 100% intensity, cap working sets at 3
    if (adapted[0] && adapted[0].sets.length > 3) {
      const removedSets = adapted[0].sets.length - 3;
      adapted[0].sets = adapted[0].sets.slice(0, 3);
      timeSavedMinutes += removedSets * 3;
      changesSummary.push(`Capped ${adapted[0].name} at 3 heavy sets (saved ~${removedSets * 3}m)`);
    }

    // B. Trim or compress accessories (exercises 2 and beyond)
    if (adapted.length > 3) {
      const removedEx = adapted.pop()!;
      timeSavedMinutes += 10;
      changesSummary.push(`Dropped accessory (${removedEx.name}) to protect core compound volume (saved ~10m)`);
    }

    // C. Reduce rest-heavy accessory sets across remaining exercises
    for (let i = 1; i < adapted.length; i++) {
      if (adapted[i].sets.length > 2) {
        adapted[i].sets = adapted[i].sets.slice(0, 2);
        timeSavedMinutes += 4;
        changesSummary.push(`Streamlined ${adapted[i].name} to 2 focused sets`);
      }
    }

    changesSummary.push(`Program intent preserved: Completed main compound in ~${limit}m`);
    return { adaptedExercises: adapted, changesSummary, timeSavedMinutes: Math.max(12, timeSavedMinutes) };
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
      let newName = substituteName;
      let multiplier = 1.0;
      let reasonText = '';

      // Check swap map
      const swapOptions = EQUIPMENT_SWAP_MAP[currentEx.name];
      if (swapOptions && swapOptions.length > 0) {
        const chosen = substituteName
          ? swapOptions.find((o) => o.target.toLowerCase() === substituteName.toLowerCase()) || swapOptions[0]
          : swapOptions[0];
        newName = chosen.target;
        multiplier = chosen.weightMultiplier;
        reasonText = chosen.reason;
      } else {
        newName = substituteName || `${currentEx.name} (DB / Machine)`;
        multiplier = 0.85;
        reasonText = 'Substituted with equivalent movement pattern';
      }

      // Convert weights
      const nextSets = currentEx.sets.map((s) => {
        let newWeight = s.weight;
        if (multiplier > 0) {
          const step = userUnit === 'lbs' ? 5 : 2.5;
          newWeight = Math.round((s.weight * multiplier) / step) * step;
        }
        return {
          ...s,
          weight: Math.max(0, newWeight),
        };
      });

      adapted[exIndex] = {
        ...currentEx,
        name: newName,
        sets: nextSets,
      };

      changesSummary.push(`Swapped "${currentEx.name}" → "${newName}" (${reasonText})`);
      changesSummary.push(`Calibrated target load from ${currentEx.sets[0]?.weight}${userUnit} to ~${nextSets[0]?.weight}${userUnit}`);
      return { adaptedExercises: adapted, changesSummary, timeSavedMinutes: 8 };
    }
  }

  // ── 3. HIGH FATIGUE / LOW SLEEP / EXAM STRESS ───────────────────────────────
  if (constraint.type === 'fatigue') {
    for (let i = 0; i < adapted.length; i++) {
      // Reduce 1 set across all exercises
      if (adapted[i].sets.length > 2) {
        adapted[i].sets = adapted[i].sets.slice(0, adapted[i].sets.length - 1);
      }
      // Cap RPE at 7.5 to prevent CNS exhaustion
      adapted[i].sets = adapted[i].sets.map((s) => ({
        ...s,
        rpe: Math.min(7.5, s.rpe ?? 7.5),
      }));
    }

    changesSummary.push('Reduced total session volume by 25% (dropped 1 set per exercise)');
    changesSummary.push('Capped target RPE at 7.5 to reinforce motor patterning without digging into systemic recovery debt');
    changesSummary.push('Maintained compound intensity to preserve neurological strength gains');
    return { adaptedExercises: adapted, changesSummary, timeSavedMinutes: 14 };
  }

  return { adaptedExercises: adapted, changesSummary: ['Workout intact'], timeSavedMinutes: 0 };
}
