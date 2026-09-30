import { WorkoutEntry, WorkoutExercise, WorkoutSet } from './types';
import { getEquipmentType, isMainCompoundLift, calculateOneRepMax } from './strength-standards';

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
  userUnit: 'kg' | 'lbs' = 'kg'
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

  // Check Plateau: estimated 1RM has not improved within 1.5% across 4 or more sessions
  if (sessions.length >= 4) {
    const e1rms = sessions.map((s) => s.bestE1RM);
    const maxE1RM = Math.max(...e1rms);
    const minE1RM = Math.min(...e1rms);
    const variation = maxE1RM > 0 ? (maxE1RM - minE1RM) / maxE1RM : 0;

    if (variation < 0.02) {
      // Stalled across 4+ sessions
      const deloadWeight = Math.round((lastWeight * 0.85) / 2.5) * 2.5;
      return {
        targetWeight: deloadWeight,
        targetReps: Math.min(12, lastReps + 2),
        targetSetsCount: lastSetsCount,
        targetSummary: `${deloadWeight}${userUnit} × ${Math.min(12, lastReps + 2)} reps`,
        rationale: `Plateau detected: your strength has stalled at ~${Math.round(lastSession.bestE1RM)}${userUnit} across ${sessions.length} sessions.`,
        isPlateau: true,
        plateauSessionsCount: sessions.length,
        plateauSuggestion: `Deload to ${deloadWeight}${userUnit} for higher reps (10-12), or switch movement variation for 2 weeks to trigger new hypertrophy.`,
      };
    }
  }

  // Double Progression Rule:
  // If user completed high reps (>= 8-10) across all sets last time -> Increase weight by 2.5kg (or 5lbs)
  const allSetsCompletedTargetReps = lastSets.every((s) => s.reps >= 8 && s.weight >= lastWeight);

  if (allSetsCompletedTargetReps && lastSets.length >= 3) {
    const increment = userUnit === 'lbs' ? 5 : 2.5;
    const nextWeight = lastWeight + increment;
    return {
      targetWeight: nextWeight,
      targetReps: Math.max(6, lastReps - 2),
      targetSetsCount: lastSetsCount,
      targetSummary: `${nextWeight}${userUnit} × ${Math.max(6, lastReps - 2)} reps`,
      rationale: `You hit target reps across all sets last session! Increase load by +${increment}${userUnit} for progressive overload.`,
      isPlateau: false,
    };
  }

  // Otherwise: Aim to add +1 rep on at least one set
  const repList = lastSets.map((s) => s.reps);
  const nextTargetReps = [...repList];
  // Increase rep on the first set that had fewer reps or the last set
  const minRepIndex = nextTargetReps.lastIndexOf(Math.min(...nextTargetReps));
  nextTargetReps[minRepIndex] = (nextTargetReps[minRepIndex] || 8) + 1;

  return {
    targetWeight: lastWeight,
    targetReps: nextTargetReps[0] || lastReps,
    targetSetsCount: lastSetsCount,
    targetSummary: `${lastWeight}${userUnit} × ${nextTargetReps.join(', ')}`,
    rationale: `Target +1 rep compared to last session (${repList.join(', ')} → ${nextTargetReps.join(', ')}).`,
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
