import { WorkoutEntry, WorkoutExercise, WorkoutSet, PlannedWorkout, PlannedExercise, AthleteGoal, ATHLETE_GOAL_CONFIGS, Unit, WeeklySchedule } from './types';
import { getEquipmentType, isMainCompoundLift, calculateOneRepMax } from './strength-standards';
import { getTodayDayOfWeek, getWorkoutBodyParts } from './workout-schedule';

/**
 * Finds the most recent performance of a given exercise across past workouts.
 */
export function getLastExercisePerformance(
  exerciseName: string,
  workouts: WorkoutEntry[]
): {
  date: string;
  sets: WorkoutSet[];
  summary: string;
  bestWeight: number;
  bestReps: number;
  bestE1RM: number;
} | null {
  if (!exerciseName || !workouts || workouts.length === 0) return null;

  const targetLower = exerciseName.trim().toLowerCase();

  // Search through workouts newest first
  for (const w of workouts) {
    const match = w.exercises.find((e) => e.name.trim().toLowerCase() === targetLower);
    if (match && match.sets.length > 0) {
      const validSets = match.sets.filter((s) => s.reps > 0);
      if (validSets.length === 0) continue;

      const summary = validSets.map((s) => `${s.weight > 0 ? `${s.weight}kg × ` : ''}${s.reps}`).join(', ');

      let bestWeight = 0;
      let bestReps = 0;
      let bestE1RM = 0;

      for (const s of validSets) {
        const e1rm = calculateOneRepMax(s.weight, s.reps);
        if (e1rm > bestE1RM) {
          bestE1RM = e1rm;
          bestWeight = s.weight;
          bestReps = s.reps;
        }
      }

      return {
        date: w.date,
        sets: validSets,
        summary,
        bestWeight,
        bestReps,
        bestE1RM: Math.round(bestE1RM * 10) / 10,
      };
    }
  }

  return null;
}

/**
 * Smart progression recommendation & plateau detector based on recent performance history.
 */
export interface ProgressionTarget {
  targetWeight: number;
  targetReps: number;
  targetSetsCount: number;
  targetSummary: string;
  rationale: string;
  isPlateau: boolean;
  plateauSessionsCount?: number;
  plateauSuggestion?: string;
}

export function getProgressionRecommendation(
  exerciseName: string,
  workouts: WorkoutEntry[],
  userUnit: 'kg' | 'lbs' = 'kg',
  goal: AthleteGoal = 'build_muscle'
): ProgressionTarget | null {
  if (!exerciseName || !workouts || workouts.length === 0) return null;

  const targetLower = exerciseName.trim().toLowerCase();
  const sessions: { date: string; sets: WorkoutSet[]; bestE1RM: number }[] = [];

  for (const w of workouts) {
    const match = w.exercises.find((e) => e.name.trim().toLowerCase() === targetLower);
    if (match && match.sets.length > 0) {
      const validSets = match.sets.filter((s) => s.reps > 0);
      if (validSets.length > 0) {
        const bestE1RM = Math.max(...validSets.map((s) => calculateOneRepMax(s.weight, s.reps)));
        sessions.push({ date: w.date, sets: validSets, bestE1RM });
        if (sessions.length >= 5) break;
      }
    }
  }

  if (sessions.length === 0) return null;

  const lastSession = sessions[0];
  const lastSets = lastSession.sets;
  const lastWeight = lastSets[0]?.weight || 0;
  const lastReps = lastSets[0]?.reps || 8;
  const lastSetsCount = lastSets.length;

  const isStrength = goal === 'get_stronger';
  const isStamina = goal === 'stamina';
  const isFatLoss = goal === 'lose_fat';
  const isMuscle = goal === 'build_muscle';
  const isFitness = goal === 'general_fitness';

  const minTargetReps = isStrength ? 4 : isStamina ? 12 : isFatLoss ? 6 : 8;

  // 1. Two consecutive misses in a row -> Suggest a 10% deload
  if (sessions.length >= 2) {
    const s0 = sessions[0];
    const s1 = sessions[1];
    const s0TotalReps = s0.sets.reduce((sum, s) => sum + s.reps, 0);
    const s1TotalReps = s1.sets.reduce((sum, s) => sum + s.reps, 0);

    // Miss criteria: high strain failure (RPE >= 10) or reps dropping below goal baseline
    const missThreshold = isStrength ? 3 : isStamina ? 10 : 5;
    const s0Missed = s0.sets.some((s) => (s.rpe && s.rpe >= 10 && s.reps < minTargetReps) || s.reps < missThreshold);
    const s1Missed = s1.sets.some((s) => (s.rpe && s.rpe >= 10 && s.reps < minTargetReps) || s.reps < missThreshold) || s0TotalReps < s1TotalReps;

    if (s0Missed && s1Missed) {
      const deloadWeight = Math.max(userUnit === 'lbs' ? 45 : 20, Math.round((lastWeight * 0.90) / 2.5) * 2.5);
      const deloadReps = isStrength ? 5 : isStamina ? 12 : Math.min(10, lastReps + 2);
      const dropAmount = Math.round(lastWeight - deloadWeight);

      let deloadRationale = `Two consecutive misses detected. 10% deload recommended (-${dropAmount}${userUnit}) to dissipate systemic fatigue and reset adaptation.`;
      if (isFatLoss) {
        deloadRationale = `Two consecutive sessions hit high strain. In a fat-loss phase, systemic recovery is reduced; a 10% deload (-${dropAmount}${userUnit}) prevents burnout, protects lean tissue, and restores clean bar speed.`;
      } else if (isStrength) {
        deloadRationale = `Two consecutive misses detected under heavy load. A planned 10% deload (-${dropAmount}${userUnit}) dissipates accumulated neural fatigue so you can rebuild towards heavier targets with crisp velocity.`;
      } else if (isStamina) {
        deloadRationale = `Two consecutive sessions missed the high-rep endurance threshold. Reducing load by 10% (-${dropAmount}${userUnit}) lets you hit the 12–15 rep bracket with full range of motion.`;
      } else if (isFitness) {
        deloadRationale = `Two consecutive sessions approached muscular failure. A 10% deload (-${dropAmount}${userUnit}) protects joint longevity and resets clean movement quality.`;
      }

      return {
        targetWeight: deloadWeight,
        targetReps: deloadReps,
        targetSetsCount: lastSetsCount,
        targetSummary: `${deloadWeight}${userUnit} × ${deloadReps} reps (-10% deload)`,
        rationale: deloadRationale,
        isPlateau: true,
        plateauSessionsCount: 2,
        plateauSuggestion: `Deload to ${deloadWeight}${userUnit} for 1 session to flush fatigue, then step back up with clean form.`,
      };
    }
  }

  // 2. Check 4+ session plateau stall
  if (sessions.length >= 4) {
    const e1rms = sessions.map((s) => s.bestE1RM);
    const maxE1RM = Math.max(...e1rms);
    const minE1RM = Math.min(...e1rms);
    const variation = maxE1RM > 0 ? (maxE1RM - minE1RM) / maxE1RM : 0;

    if (variation < 0.02) {
      const deloadWeight = Math.round((lastWeight * 0.90) / 2.5) * 2.5;
      const targetPlateauReps = isStrength ? 5 : isStamina ? 15 : Math.min(12, lastReps + 2);

      let plateauRationale = `Plateau detected: your performance has stalled at ~${Math.round(lastSession.bestE1RM)}${userUnit} across ${sessions.length} sessions.`;
      if (isStrength) {
        plateauRationale = `Strength plateau detected: estimated 1RM has plateaued at ~${Math.round(lastSession.bestE1RM)}${userUnit} across ${sessions.length} sessions. Deload to ${deloadWeight}${userUnit} or introduce a close variation to break through.`;
      } else if (isMuscle) {
        plateauRationale = `Hypertrophy stimulus plateaued at ~${Math.round(lastSession.bestE1RM)}${userUnit}. A brief 10% reset to ${deloadWeight}${userUnit} targeting ${targetPlateauReps} reps stimulates fresh motor unit recruitment.`;
      } else if (isFatLoss) {
        plateauRationale = `Performance has held steady at ~${Math.round(lastSession.bestE1RM)}${userUnit} across ${sessions.length} sessions. Holding strength in a deficit is excellent; a light deload to ${deloadWeight}${userUnit} keeps movement sharp.`;
      }

      return {
        targetWeight: deloadWeight,
        targetReps: targetPlateauReps,
        targetSetsCount: lastSetsCount,
        targetSummary: `${deloadWeight}${userUnit} × ${targetPlateauReps} reps`,
        rationale: plateauRationale,
        isPlateau: true,
        plateauSessionsCount: sessions.length,
        plateauSuggestion: isStrength
          ? `Deload 10% to ${deloadWeight}${userUnit} for 1 week, or switch to a paused/deficit variation to stimulate new neural drive.`
          : `Deload 10% to ${deloadWeight}${userUnit} for higher reps, or switch variation for 2 weeks to trigger new hypertrophy.`,
      };
    }
  }

  // 3. Smart Progression Rule:
  // If all reps were hit at RPE 8 or below (or hit target reps cleanly) -> Suggest +2.5 kg (or +5 lbs)
  const hasRPE = lastSets.some((s) => s.rpe !== undefined);
  const allRpeAtOrBelow8 = hasRPE ? lastSets.every((s) => (s.rpe ?? 8) <= 8) : false;
  const allSetsCompletedTargetReps = lastSets.every((s) => s.reps >= minTargetReps && s.weight >= lastWeight);

  if (allRpeAtOrBelow8 || (allSetsCompletedTargetReps && lastSets.length >= 2)) {
    const increment = userUnit === 'lbs' ? 5 : 2.5;
    const nextWeight = lastWeight + increment;

    // Reps target tailored to goal
    let targetReps = Math.max(minTargetReps, lastReps - 1);
    if (isStrength) {
      targetReps = Math.max(4, Math.min(5, lastReps));
    } else if (isStamina) {
      targetReps = Math.max(12, Math.min(15, lastReps));
    } else if (isMuscle) {
      targetReps = Math.max(8, Math.min(10, lastReps));
    } else if (isFatLoss) {
      targetReps = Math.max(5, Math.min(6, lastReps));
    }

    let rationale = allRpeAtOrBelow8
      ? `All reps hit at RPE ≤ 8 (solid reserve left in the tank). Overload recommendation: +${increment}${userUnit}!`
      : `Target reps hit across all sets. Progressive overload recommendation: +${increment}${userUnit}!`;

    if (isStrength) {
      rationale = `All sets completed with reserve (RPE ≤ 8.0). Progressive overload of +${increment}${userUnit} recommended, targeting ${targetReps} reps for maximal neural strength adaptation.`;
    } else if (isMuscle) {
      rationale = `Hypertrophy volume completed cleanly with reserve. Adding +${increment}${userUnit} targeting ${targetReps} reps to progressively overload mechanical tension.`;
    } else if (isFatLoss) {
      rationale = `Clean reps completed with reserve. Adding +${increment}${userUnit} maintains heavy mechanical tension to signal muscle retention in a caloric deficit.`;
    } else if (isStamina) {
      rationale = `All ${lastReps} reps completed with good endurance reserve. Progressive overload of +${increment}${userUnit} prescribed to drive stamina and work capacity.`;
    } else if (isFitness) {
      rationale = `Consistent form and clean effort across all sets. Adding +${increment}${userUnit} builds functional strength while maintaining balanced joint health.`;
    }

    return {
      targetWeight: nextWeight,
      targetReps,
      targetSetsCount: lastSetsCount,
      targetSummary: `${nextWeight}${userUnit} × ${targetReps} reps (+${increment}${userUnit})`,
      rationale,
      isPlateau: false,
    };
  }

  // 4. Default: Aim to add +1 rep on current weight
  const repList = lastSets.map((s) => s.reps);
  const nextTargetReps = [...repList];
  const minRepIndex = nextTargetReps.lastIndexOf(Math.min(...nextTargetReps));
  nextTargetReps[minRepIndex] = (nextTargetReps[minRepIndex] || minTargetReps) + 1;

  let repRationale = `Target +1 rep compared to last session (${repList.join(', ')} → ${nextTargetReps.join(', ')}).`;
  if (isStrength) {
    repRationale = `Weight was challenging on final set. Hold load steady at ${lastWeight}${userUnit} and aim for +1 rep (${lastReps} → ${lastReps + 1} reps) to consolidate technical bar speed before increasing weight.`;
  } else if (isMuscle) {
    repRationale = `Solid effort at ${lastWeight}${userUnit}. Accumulate volume by adding +1 rep (${lastReps} → ${lastReps + 1} reps) to maximize muscle fiber stimulation before increasing the load.`;
  } else if (isFatLoss) {
    repRationale = `Maintain ${lastWeight}${userUnit} today and focus on hitting +1 clean rep (${lastReps} → ${lastReps + 1} reps). Controlled volume progression preserves contractile tissue without generating excess systemic fatigue.`;
  } else if (isStamina) {
    repRationale = `Hold ${lastWeight}${userUnit} and aim for +1 extra rep (${lastReps} → ${lastReps + 1} reps) to build local muscular endurance and lactate tolerance.`;
  } else if (isFitness) {
    repRationale = `Keep load at ${lastWeight}${userUnit} and target +1 rep (${lastReps} → ${lastReps + 1} reps) with smooth control and full range of motion.`;
  }

  return {
    targetWeight: lastWeight,
    targetReps: nextTargetReps[0] || lastReps,
    targetSetsCount: lastSetsCount,
    targetSummary: `${lastWeight}${userUnit} × ${nextTargetReps.join(', ')}`,
    rationale: repRationale,
    isPlateau: false,
  };
}

/**
 * Instant 1-tap exercise substitutes based on movement pattern and gym availability.
 */
export interface ExerciseSubstitute {
  name: string;
  equipment: string;
  reason: string;
  rationale?: string;
}

const SUBSTITUTION_MAP: Record<string, ExerciseSubstitute[]> = {
  'bench press': [
    { name: 'Dumbbell Bench Press', equipment: 'dumbbell', reason: 'Better shoulder freedom & stabilizer engagement' },
    { name: 'Incline Barbell Bench', equipment: 'barbell', reason: 'Upper chest emphasis with barbell power' },
    { name: 'Chest Press Machine', equipment: 'machine', reason: 'Controlled path when spotter/barbell unavailable' },
  ],
  'dumbbell bench press': [
    { name: 'Barbell Bench Press', equipment: 'barbell', reason: 'Heavier overload potential' },
    { name: 'Incline Dumbbell Press', equipment: 'dumbbell', reason: 'Upper clavicular chest focus' },
    { name: 'Dips', equipment: 'bodyweight', reason: 'High tricep and lower chest mass builder' },
  ],
  'incline dumbbell press': [
    { name: 'Incline Barbell Bench', equipment: 'barbell', reason: 'Direct barbell compound substitute' },
    { name: 'Low-to-High Cable Fly', equipment: 'cable', reason: 'Continuous tension on upper chest' },
    { name: 'Landmine Press', equipment: 'barbell', reason: 'Very shoulder-friendly clavicular press' },
  ],
  'squat': [
    { name: 'Leg Press', equipment: 'machine', reason: 'Heavy quad loading without spinal compression' },
    { name: 'Hack Squat', equipment: 'machine', reason: 'Deep quad stretch with fixed lumbar support' },
    { name: 'Goblet Squat', equipment: 'dumbbell', reason: 'Great upright posture & hip mobility' },
  ],
  'leg press': [
    { name: 'Hack Squat', equipment: 'machine', reason: 'Same quad-dominant loading angle' },
    { name: 'Barbell Squat', equipment: 'barbell', reason: 'Full systemic core & leg builder' },
    { name: 'Bulgarian Split Squat', equipment: 'dumbbell', reason: 'Unilateral quad and glute focus' },
  ],
  'leg extension': [
    { name: 'Hack Squat', equipment: 'machine', reason: 'Heavy quad focus when extension machine is taken' },
    { name: 'Sissy Squat', equipment: 'bodyweight', reason: 'Intense rectus femoris isolation' },
    { name: 'Walking Lunges', equipment: 'dumbbell', reason: 'Quad pump and active stabilizer work' },
  ],
  'deadlift': [
    { name: 'Romanian Deadlift', equipment: 'barbell', reason: 'Pure hamstring & glute tension without floor reset' },
    { name: 'Trap Bar Deadlift', equipment: 'barbell', reason: 'More quad engagement, lower lumbar strain' },
    { name: 'Barbell Row', equipment: 'barbell', reason: 'Posterior chain loading with back thickness focus' },
  ],
  'romanian deadlift': [
    { name: 'Dumbbell Romanian Deadlift', equipment: 'dumbbell', reason: 'Easier grip setup & natural hip hinge' },
    { name: 'Seated Leg Curl', equipment: 'machine', reason: 'Isolated knee flexion hamstring work' },
    { name: 'Good Mornings', equipment: 'barbell', reason: 'Hamstring and lower back erector loading' },
  ],
  'overhead press': [
    { name: 'Dumbbell Shoulder Press', equipment: 'dumbbell', reason: 'Greater range of motion & wrist comfort' },
    { name: 'Arnold Press', equipment: 'dumbbell', reason: 'Rotational delt recruitment' },
    { name: 'Pike Push-ups', equipment: 'bodyweight', reason: 'Bodyweight overhead pressing movement' },
  ],
  'dumbbell shoulder press': [
    { name: 'Barbell Overhead Press', equipment: 'barbell', reason: 'Raw progressive overload strength builder' },
    { name: 'Machine Shoulder Press', equipment: 'machine', reason: 'Stable deltoid burnout' },
    { name: 'Lateral Raises', equipment: 'dumbbell', reason: 'Direct side deltoid hypertrophy' },
  ],
  'barbell row': [
    { name: 'Chest Supported Row', equipment: 'machine', reason: 'Zero lower back fatigue, pure upper back' },
    { name: 'One-Arm Dumbbell Row', equipment: 'dumbbell', reason: 'Huge stretch on lats with unilateral focus' },
    { name: 'Cable Seated Row', equipment: 'cable', reason: 'Constant cable tension through entire stroke' },
  ],
  'pull-ups': [
    { name: 'Lat Pulldown', equipment: 'cable', reason: 'Micro-adjustable weight for precise rep targets' },
    { name: 'Underhand Chin-ups', equipment: 'bodyweight', reason: 'Higher bicep leverage' },
    { name: 'Straight Arm Pulldown', equipment: 'cable', reason: 'Pure lat isolation without arm fatigue' },
  ],
  'lat pulldown': [
    { name: 'Pull-ups', equipment: 'bodyweight', reason: 'The gold standard vertical pulling movement' },
    { name: 'Underhand Cable Pulldown', equipment: 'cable', reason: 'Closer grip for lower lat sweep' },
    { name: 'One-Arm Cable Pulldown', equipment: 'cable', reason: 'Deep lateral flexion and full stretch' },
  ],
  'dumbbell curl': [
    { name: 'Incline Dumbbell Curl', equipment: 'dumbbell', reason: 'Maximum stretch on the long head of biceps' },
    { name: 'Barbell Bicep Curl', equipment: 'barbell', reason: 'Heavy bilateral bicep overload' },
    { name: 'Hammer Curl', equipment: 'dumbbell', reason: 'Brachialis and forearm thickness' },
  ],
  'tricep pushdown': [
    { name: 'Overhead Cable Tricep Extension', equipment: 'cable', reason: 'Target long head of triceps in stretched position' },
    { name: 'Skull Crushers', equipment: 'barbell', reason: 'Heavy mass builder for tricep belly' },
    { name: 'Dips', equipment: 'bodyweight', reason: 'Compound tricep press with bodyweight' },
  ],
};

export function getQuickSubstitutes(exerciseName: string): ExerciseSubstitute[] {
  if (!exerciseName) return [];
  const clean = exerciseName.trim().toLowerCase();

  // Direct match
  if (SUBSTITUTION_MAP[clean]) {
    return SUBSTITUTION_MAP[clean];
  }

  // Partial match
  for (const key of Object.keys(SUBSTITUTION_MAP)) {
    if (clean.includes(key) || key.includes(clean)) {
      return SUBSTITUTION_MAP[key];
    }
  }

  // Fallback by movement category
  const eq = getEquipmentType(exerciseName);
  if (eq === 'dumbbell') {
    return [
      { name: 'Barbell equivalent', equipment: 'barbell', reason: 'Heavier bilateral overload' },
      { name: 'Cable variation', equipment: 'cable', reason: 'Smooth resistance curve' },
    ];
  }
  return [
    { name: 'Dumbbell alternative', equipment: 'dumbbell', reason: 'Independent arm freedom' },
    { name: 'Machine alternative', equipment: 'machine', reason: 'High stability and controlled path' },
  ];
}

/**
 * "Make Today's Workout Shorter":
 * Compresses a workout routine into 30m, 45m, or 60m:
 * - 30 min: Keep only top 2-3 compound exercises, reduce sets to 2-3 heavy work sets.
 * - 45 min: Keep 4 exercises, reduce accessory volume by 1 set.
 * - 60 min: Standard full plan.
 */
export function compressWorkout(
  exercises: WorkoutExercise[],
  targetMinutes: 30 | 45 | 60
): WorkoutExercise[] {
  if (!exercises || exercises.length === 0) return exercises;

  // Score exercises: compound movements first, then accessories
  const scored = exercises.map((ex, idx) => {
    const isCompound = isMainCompoundLift(ex.name);
    const score = (isCompound ? 100 : 50) - idx;
    return { ex, score };
  });

  // Sort compounds first
  scored.sort((a, b) => b.score - a.score);

  if (targetMinutes === 30) {
    // Keep max 3 exercises, clamp sets to max 3
    const selected = scored.slice(0, 3).map((item) => item.ex);
    return selected.map((ex) => ({
      ...ex,
      sets: ex.sets.slice(0, Math.min(3, Math.max(2, ex.sets.length))),
    }));
  }

  if (targetMinutes === 45) {
    // Keep max 4-5 exercises, clamp sets to max 3
    const selected = scored.slice(0, 4).map((item) => item.ex);
    return selected.map((ex) => ({
      ...ex,
      sets: ex.sets.slice(0, Math.min(3, ex.sets.length)),
    }));
  }

  // 60 minutes: full plan
  return exercises;
}

/**
 * Voice quick logging parser:
 * e.g. "Bench 70 for 8 8 7" -> { exerciseName: "Bench Press", sets: [{ weight: 70, reps: 8 }, ...] }
 * e.g. "Squat 100 for 5 reps 3 sets" -> 3 sets of 100kg x 5 reps
 */
export function parseVoiceWorkout(
  speechText: string,
  availableExercises: string[] = []
): { exerciseName: string; sets: WorkoutSet[] } | null {
  if (!speechText || !speechText.trim()) return null;
  const raw = speechText.trim().toLowerCase();

  // 1. Identify exercise name
  let matchedExercise = '';
  let bestScore = 0;

  for (const ex of availableExercises) {
    const exLower = ex.toLowerCase();
    if (raw.includes(exLower)) {
      if (exLower.length > bestScore) {
        matchedExercise = ex;
        bestScore = exLower.length;
      }
    }
  }

  // Fallback common name aliases
  if (!matchedExercise) {
    if (raw.includes('bench')) matchedExercise = 'Bench Press';
    else if (raw.includes('squat')) matchedExercise = 'Squat';
    else if (raw.includes('deadlift')) matchedExercise = 'Deadlift';
    else if (raw.includes('ohp') || raw.includes('overhead')) matchedExercise = 'Overhead Press';
    else if (raw.includes('curl')) matchedExercise = 'Dumbbell Curl';
    else if (raw.includes('pullup') || raw.includes('pull up')) matchedExercise = 'Pull-ups';
    else if (raw.includes('row')) matchedExercise = 'Barbell Row';
    else if (raw.includes('press')) matchedExercise = 'Leg Press';
  }

  if (!matchedExercise) {
    // Extract first word or words before number as exercise name
    const wordsBeforeNum = raw.match(/^([a-zA-Z\s]+?)(?=\s+\d)/);
    matchedExercise = wordsBeforeNum ? wordsBeforeNum[1].trim() : 'Custom Exercise';
    // Capitalize words
    matchedExercise = matchedExercise
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // 2. Extract weight & reps
  // Pattern A: "Bench 70 for 8 8 7" or "70kg 8 8 8"
  const weightMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos|lbs|pound)?/);
  const weight = weightMatch ? parseFloat(weightMatch[1]) : 0;

  // Find remaining numbers for reps
  const afterWeight = raw.replace(weightMatch ? weightMatch[0] : '', '');
  const repNumbers = afterWeight.match(/\b\d+\b/g);

  const sets: WorkoutSet[] = [];

  if (repNumbers && repNumbers.length > 0) {
    // Check if user said "X sets of Y"
    const setsOfMatch = raw.match(/(\d+)\s*(?:sets?)\s*(?:of)?\s*(\d+)/);
    if (setsOfMatch) {
      const setCount = parseInt(setsOfMatch[1], 10);
      const repCount = parseInt(setsOfMatch[2], 10);
      for (let i = 0; i < setCount; i++) {
        sets.push({ weight, reps: repCount, unit: 'kg' });
      }
    } else {
      for (const r of repNumbers) {
        const parsedReps = parseInt(r, 10);
        if (parsedReps > 0 && parsedReps <= 100) {
          sets.push({ weight, reps: parsedReps, unit: 'kg' });
        }
      }
    }
  }

  // Fallback: If no reps found, default to 3 sets of 8
  if (sets.length === 0) {
    sets.push({ weight, reps: 8, unit: 'kg' });
    sets.push({ weight, reps: 8, unit: 'kg' });
    sets.push({ weight, reps: 8, unit: 'kg' });
  }

  return {
    exerciseName: matchedExercise,
    sets,
  };
}

export type TodaySessionStatus = 'in_progress' | 'completed' | 'planned' | 'none';

export interface TodaySessionInfo {
  status: TodaySessionStatus;
  title: string;
  subtitle: string;
  exercises: string[];
  firstExerciseLoadHint?: string;
  primaryActionLabel: string;
  isDraft: boolean;
  isDone: boolean;
  totalSets?: number;
  volumeKg?: number;
  durationMin?: number;
  prCount?: number;
  isRestDay?: boolean;
  scheduledDay?: string;
  bodyParts?: string[];
  plannedWorkoutId?: string;
}

/**
 * Single source of truth for today's workout state across Home, Workouts, and Consistency.
 */
export function getTodaySessionState(
  todayStr: string,
  workouts: WorkoutEntry[],
  plannedWorkouts: { id: string; name: string; exercises: { name: string }[] }[],
  activeDraft: { exercises: { name: string }[]; startedFromPlan?: string | null; name?: string } | null,
  userUnit: 'kg' | 'lbs' = 'kg',
  weeklySchedule?: WeeklySchedule
): TodaySessionInfo {
  // 1. In-progress draft takes highest priority
  if (activeDraft && activeDraft.exercises && activeDraft.exercises.length > 0) {
    const validEx = activeDraft.exercises.filter((e) => e.name && e.name.trim());
    return {
      status: 'in_progress',
      title: activeDraft.startedFromPlan || activeDraft.name || 'Workout in Progress',
      subtitle: `${validEx.length} exercise${validEx.length === 1 ? '' : 's'} active • Tap to resume`,
      exercises: validEx.map((e) => e.name),
      primaryActionLabel: 'Resume Session',
      isDraft: true,
      isDone: false,
    };
  }

  // 2. Completed workout for today
  const todayWorkouts = workouts.filter((w) => w.date && w.date.startsWith(todayStr));
  if (todayWorkouts.length > 0) {
    const w = todayWorkouts[0];
    let vol = 0;
    let sets = 0;
    for (const tw of todayWorkouts) {
      for (const ex of tw.exercises) {
        for (const s of ex.sets) {
          if (s.weight > 0 && s.reps > 0) {
            const wKg = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
            vol += wKg * s.reps;
          }
          if (s.reps > 0) sets++;
        }
      }
    }

    const exList = w.exercises.map((e) => e.name);
    return {
      status: 'completed',
      title: w.name || 'Gym Session Completed',
      subtitle: exList.slice(0, 4).join(', ') || 'Workout logged',
      exercises: exList,
      primaryActionLabel: 'Log Additional Session',
      isDraft: false,
      isDone: true,
      totalSets: sets,
      volumeKg: Math.round(vol),
      durationMin: w.durationMinutes || 0,
    };
  }

  // 3. User has a weekly schedule or planned routine
  if (weeklySchedule) {
    const todayDay = getTodayDayOfWeek(todayStr);
    const dayConfig = weeklySchedule[todayDay];

    if (dayConfig) {
      if (dayConfig.workoutPlanId === 'rest') {
        return {
          status: 'planned',
          title: dayConfig.customTitle || 'Rest & Recovery',
          subtitle: 'Scheduled Rest Day • Hydrate, sleep, and hit your protein target',
          exercises: [],
          primaryActionLabel: 'Start Workout Anyway',
          isDraft: false,
          isDone: false,
          isRestDay: true,
          scheduledDay: todayDay,
          bodyParts: [],
        };
      }

      const matchedPlan = plannedWorkouts.find(
        (p) => p.id === dayConfig.workoutPlanId || p.name.toLowerCase() === dayConfig.workoutPlanId?.toLowerCase()
      );

      if (matchedPlan) {
        const exNames = matchedPlan.exercises.map((e) => e.name);
        const firstEx = matchedPlan.exercises[0];
        let loadHint: string | undefined = undefined;
        if (firstEx) {
          const pastPerf = getLastExercisePerformance(firstEx.name, workouts);
          if (pastPerf && pastPerf.bestWeight > 0) {
            loadHint = `Last: ${pastPerf.bestWeight}${userUnit} × ${pastPerf.bestReps}`;
          }
        }

        const bodyParts =
          dayConfig.bodyParts && dayConfig.bodyParts.length > 0
            ? dayConfig.bodyParts
            : getWorkoutBodyParts(matchedPlan.exercises);

        return {
          status: 'planned',
          title: matchedPlan.name,
          subtitle: bodyParts.length > 0 ? bodyParts.join(' • ') : exNames.slice(0, 4).join(', '),
          exercises: exNames,
          firstExerciseLoadHint: loadHint,
          primaryActionLabel: `Start: ${matchedPlan.name}`,
          isDraft: false,
          isDone: false,
          isRestDay: false,
          scheduledDay: todayDay,
          bodyParts,
          plannedWorkoutId: matchedPlan.id,
        };
      }
    }
  }

  // Fallback to first plan if schedule didn't match
  if (plannedWorkouts && plannedWorkouts.length > 0) {
    const plan = plannedWorkouts[0];
    const exNames = plan.exercises.map((e) => e.name);
    const firstEx = plan.exercises[0];
    let loadHint: string | undefined = undefined;
    if (firstEx) {
      const pastPerf = getLastExercisePerformance(firstEx.name, workouts);
      if (pastPerf && pastPerf.bestWeight > 0) {
        loadHint = `Last: ${pastPerf.bestWeight}${userUnit} × ${pastPerf.bestReps}`;
      }
    }

    const bodyParts = getWorkoutBodyParts(plan.exercises);

    return {
      status: 'planned',
      title: plan.name,
      subtitle: bodyParts.length > 0 ? bodyParts.join(' • ') : exNames.slice(0, 4).join(', '),
      exercises: exNames,
      firstExerciseLoadHint: loadHint,
      primaryActionLabel: `Start: ${plan.name}`,
      isDraft: false,
      isDone: false,
      isRestDay: false,
      bodyParts,
      plannedWorkoutId: plan.id,
    };
  }

  // 4. No planned routine
  return {
    status: 'none',
    title: 'No Session Scheduled',
    subtitle: 'Start an empty workout or select a training routine',
    exercises: [],
    primaryActionLabel: 'Start Workout',
    isDraft: false,
    isDone: false,
  };
}

/**
 * Generates goal-adapted split templates (Upper A, Lower A, Upper B, Lower B)
 * calibrated to the athlete's specific training goal, rep brackets, and unit system.
 */
export function getGoalAdaptiveSplitTemplates(
  goal: AthleteGoal = 'build_muscle',
  unit: Unit = 'kg'
): PlannedWorkout[] {
  const isLbs = unit === 'lbs';

  if (goal === 'get_stronger') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Upper A',
        createdAt: '2026-01-01',
        description: 'Heavy compound strength focus with strict mechanical tension (4–5 reps)',
        goalTag: 'Strength (4–5 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 165 : 75, targetUnit: unit },
          { name: 'Barbell Row', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 145 : 65, targetUnit: unit },
          { name: 'Overhead Press', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 100 : 45, targetUnit: unit },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
          { name: 'Dumbbell Curl', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 30 : 14, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Lower A',
        createdAt: '2026-01-01',
        description: 'Primary squat strength day with posterior chain compound loading',
        goalTag: 'Strength (4–5 reps)',
        exercises: [
          { name: 'Squat', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 245 : 110, targetUnit: unit },
          { name: 'Romanian Deadlift', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 200 : 90, targetUnit: unit },
          { name: 'Leg Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 400 : 180, targetUnit: unit },
          { name: 'Calf Raise', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Upper B',
        createdAt: '2026-01-01',
        description: 'Upper body power & shoulder stability with vertical pull progression',
        goalTag: 'Strength (4–5 reps)',
        exercises: [
          { name: 'Incline Bench', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 145 : 65, targetUnit: unit },
          { name: 'Pull-ups', targetSets: 3, targetReps: 5, targetWeight: 0, targetUnit: unit },
          { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 50 : 24, targetUnit: unit },
          { name: 'Lateral Raise', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 22 : 10, targetUnit: unit },
          { name: 'Tricep Extension', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 60 : 28, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Lower B',
        createdAt: '2026-01-01',
        description: 'Maximal deadlift neural drive and quad anterior chain reinforcement',
        goalTag: 'Strength (3–5 reps)',
        exercises: [
          { name: 'Deadlift', targetSets: 4, targetReps: 4, targetWeight: isLbs ? 285 : 130, targetUnit: unit },
          { name: 'Front Squat', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 165 : 75, targetUnit: unit },
          { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 40 : 18, targetUnit: unit },
          { name: 'Hamstring Curl', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
        ],
      },
    ];
  }

  if (goal === 'lose_fat') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Upper A',
        createdAt: '2026-01-01',
        description: 'Muscle-sparing compound mechanical tension with higher training density',
        goalTag: 'Fat Loss (6–8 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 160 : 72.5, targetUnit: unit },
          { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
          { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 95 : 42.5, targetUnit: unit },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 120 : 55, targetUnit: unit },
          { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 30 : 14, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Lower A',
        createdAt: '2026-01-01',
        description: 'Calorie-burning quad and hip hinge loading with controlled rest intervals',
        goalTag: 'Fat Loss (6–8 reps)',
        exercises: [
          { name: 'Squat', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 225 : 100, targetUnit: unit },
          { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 175 : 80, targetUnit: unit },
          { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: unit },
          { name: 'Calf Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Upper B',
        createdAt: '2026-01-01',
        description: 'Upper torso muscle retention with steady metabolic work rate',
        goalTag: 'Fat Loss (6–8 reps)',
        exercises: [
          { name: 'Incline Bench', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 140 : 62.5, targetUnit: unit },
          { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: unit },
          { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 50 : 22, targetUnit: unit },
          { name: 'Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: unit },
          { name: 'Tricep Extension', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 55 : 25, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Lower B',
        createdAt: '2026-01-01',
        description: 'Heavy deadlift tension signal paired with active knee flexion density',
        goalTag: 'Fat Loss (5–8 reps)',
        exercises: [
          { name: 'Deadlift', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 265 : 120, targetUnit: unit },
          { name: 'Front Squat', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 155 : 70, targetUnit: unit },
          { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 35 : 16, targetUnit: unit },
          { name: 'Hamstring Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 100 : 45, targetUnit: unit },
        ],
      },
    ];
  }

  if (goal === 'stamina') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Upper A',
        createdAt: '2026-01-01',
        description: 'High-density upper conditioning with elevated work capacity (12–15 reps)',
        goalTag: 'Stamina (12–15 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 120 : 55, targetUnit: unit },
          { name: 'Barbell Row', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
          { name: 'Overhead Press', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 65 : 30, targetUnit: unit },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 100 : 45, targetUnit: unit },
          { name: 'Dumbbell Curl', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 22 : 10, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Lower A',
        createdAt: '2026-01-01',
        description: 'High-volume leg conditioning and lactate tolerance threshold work',
        goalTag: 'Stamina (12–15 reps)',
        exercises: [
          { name: 'Squat', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 165 : 75, targetUnit: unit },
          { name: 'Romanian Deadlift', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
          { name: 'Leg Press', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 265 : 120, targetUnit: unit },
          { name: 'Calf Raise', targetSets: 4, targetReps: 20, targetWeight: isLbs ? 90 : 40, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Upper B',
        createdAt: '2026-01-01',
        description: 'Rapid-paced shoulder and back stamina with high-rep contractions',
        goalTag: 'Stamina (12–15 reps)',
        exercises: [
          { name: 'Incline Bench', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
          { name: 'Pull-ups', targetSets: 3, targetReps: 12, targetWeight: 0, targetUnit: unit },
          { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 35 : 16, targetUnit: unit },
          { name: 'Lateral Raise', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 18 : 8, targetUnit: unit },
          { name: 'Tricep Extension', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 45 : 20, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Lower B',
        createdAt: '2026-01-01',
        description: 'Continuous posterior chain conditioning and single-leg endurance',
        goalTag: 'Stamina (10–15 reps)',
        exercises: [
          { name: 'Deadlift', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 200 : 90, targetUnit: unit },
          { name: 'Front Squat', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
          { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 25 : 12, targetUnit: unit },
          { name: 'Hamstring Curl', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 75 : 35, targetUnit: unit },
        ],
      },
    ];
  }

  if (goal === 'general_fitness') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Upper A',
        createdAt: '2026-01-01',
        description: 'Balanced athletic upper body routine for strength, mobility, and joint health',
        goalTag: 'Fitness (8–10 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 145 : 65, targetUnit: unit },
          { name: 'Barbell Row', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 120 : 55, targetUnit: unit },
          { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 75 : 35, targetUnit: unit },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
          { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 25 : 12, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Lower A',
        createdAt: '2026-01-01',
        description: 'Functional lower body strength and hinge fundamentals',
        goalTag: 'Fitness (8–10 reps)',
        exercises: [
          { name: 'Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 185 : 85, targetUnit: unit },
          { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: unit },
          { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 310 : 140, targetUnit: unit },
          { name: 'Calf Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 100 : 45, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Upper B',
        createdAt: '2026-01-01',
        description: 'Balanced pressing, pulling, and deltoid stability',
        goalTag: 'Fitness (8–10 reps)',
        exercises: [
          { name: 'Incline Bench', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 120 : 55, targetUnit: unit },
          { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: unit },
          { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 40 : 18, targetUnit: unit },
          { name: 'Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 18 : 8, targetUnit: unit },
          { name: 'Tricep Extension', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 50 : 22, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Lower B',
        createdAt: '2026-01-01',
        description: 'Core posterior strength and unilateral stability',
        goalTag: 'Fitness (6–10 reps)',
        exercises: [
          { name: 'Deadlift', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 230 : 105, targetUnit: unit },
          { name: 'Front Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 130 : 60, targetUnit: unit },
          { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 30 : 14, targetUnit: unit },
          { name: 'Hamstring Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 90 : 40, targetUnit: unit },
        ],
      },
    ];
  }

  // Default: 'build_muscle' (Hypertrophy)
  return [
    {
      id: 'builtin_upper_a',
      name: 'Upper A',
      createdAt: '2026-01-01',
      description: 'Hypertrophy volume targeting chest, upper back, and biceps (8–12 reps)',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: unit },
        { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
        { name: 'Overhead Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 90 : 40, targetUnit: unit },
        { name: 'Lat Pulldown', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 120 : 55, targetUnit: unit },
        { name: 'Dumbbell Curl', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 30 : 14, targetUnit: unit },
      ],
    },
    {
      id: 'builtin_lower_a',
      name: 'Lower A',
      createdAt: '2026-01-01',
      description: 'Quad and hamstring mass development with progressive volume',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Squat', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 210 : 95, targetUnit: unit },
        { name: 'Romanian Deadlift', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 175 : 80, targetUnit: unit },
        { name: 'Leg Press', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 350 : 160, targetUnit: unit },
        { name: 'Calf Raise', targetSets: 4, targetReps: 15, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
      ],
    },
    {
      id: 'builtin_upper_b',
      name: 'Upper B',
      createdAt: '2026-01-01',
      description: 'Incline chest and lateral deltoid emphasis with vertical pulling',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Incline Bench', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
        { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: unit },
        { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 45 : 22, targetUnit: unit },
        { name: 'Lateral Raise', targetSets: 4, targetReps: 15, targetWeight: isLbs ? 20 : 10, targetUnit: unit },
        { name: 'Tricep Extension', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 55 : 25, targetUnit: unit },
      ],
    },
    {
      id: 'builtin_lower_b',
      name: 'Lower B',
      createdAt: '2026-01-01',
      description: 'Posterior chain density with unilateral quad hypertrophy',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 255 : 115, targetUnit: unit },
        { name: 'Front Squat', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 145 : 65, targetUnit: unit },
        { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 35 : 16, targetUnit: unit },
        { name: 'Hamstring Curl', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 100 : 45, targetUnit: unit },
      ],
    },
  ];
}

