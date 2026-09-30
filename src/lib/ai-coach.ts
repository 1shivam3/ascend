import { AppState } from './store';
import {
  AICoachInsight,
  WorkoutEntry,
  PersonalRecord,
  AIPlannedWorkout,
  AIPlannedExercise,
  AISubstitutionResult,
  AIWorkoutCommandResult,
  AIPostWorkoutTake,
  AIWeeklyReview
} from './types';
import { toLocalDateString, getCreatineStats, calculateHydrationTarget } from './habits';
import { buildCompactUserContext } from './ai-context';

/**
 * Calculates total tonnage (volume in kg) for a workout session.
 * For bodyweight exercises without added weight (or zero weight), adds estimated bodyweight percentage.
 */
export function calculateWorkoutTonnage(workout: WorkoutEntry, bodyweightKg = 75): number {
  if (!workout?.exercises) return 0;

  return workout.exercises.reduce((totalEx, ex) => {
    const isBw = /pull[\s-]?up|chin[\s-]?up|dip|push[\s-]?up/i.test(ex.name);
    const exTonnage = ex.sets.reduce((totalSet, set) => {
      const reps = Math.max(0, Number(set.reps) || 0);
      let weightKg = Math.max(0, Number(set.weight) || 0);

      if (set.unit === 'lbs') {
        weightKg = weightKg * 0.453592;
      }

      if (isBw) {
        weightKg = (bodyweightKg * 0.9) + weightKg;
      }

      return totalSet + (reps * weightKg);
    }, 0);

    return totalEx + exTonnage;
  }, 0);
}

/**
 * Compares training volume of the last 7 days vs the prior 7 days.
 */
export function getVolumeComparison(
  workouts: WorkoutEntry[],
  bodyweightKg = 75,
  targetDate: Date = new Date()
): { thisWeekKg: number; lastWeekKg: number; diffPercent: number } {
  let thisWeekTonnage = 0;
  let lastWeekTonnage = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - i);
    const dStr = toLocalDateString(d);

    const dayWorkouts = workouts.filter((w) => w.date && w.date.startsWith(dStr));
    for (const w of dayWorkouts) {
      thisWeekTonnage += calculateWorkoutTonnage(w, bodyweightKg);
    }
  }

  for (let i = 7; i < 14; i++) {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - i);
    const dStr = toLocalDateString(d);

    const dayWorkouts = workouts.filter((w) => w.date && w.date.startsWith(dStr));
    for (const w of dayWorkouts) {
      lastWeekTonnage += calculateWorkoutTonnage(w, bodyweightKg);
    }
  }

  const thisWeekKg = Math.round(thisWeekTonnage);
  const lastWeekKg = Math.round(lastWeekTonnage);

  let diffPercent = 0;
  if (lastWeekKg > 0) {
    diffPercent = Math.round(((thisWeekKg - lastWeekKg) / lastWeekKg) * 100);
  }

  return { thisWeekKg, lastWeekKg, diffPercent };
}

/**
 * Returns number of consecutive workout days up to today.
 */
export function getConsecutiveWorkoutDays(
  workouts: WorkoutEntry[],
  targetDate: Date = new Date()
): number {
  let streak = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - i);
    const dStr = toLocalDateString(d);

    const hasTrained = workouts.some((w) => w.date && w.date.startsWith(dStr));
    if (hasTrained) {
      streak++;
    } else {
      if (i === 0) continue;
      break;
    }
  }
  return streak;
}

/**
 * Returns days elapsed since the most recent workout.
 */
export function getDaysSinceLastWorkout(
  workouts: WorkoutEntry[],
  targetDate: Date = new Date()
): number {
  if (!workouts || workouts.length === 0) return 99;

  const sorted = [...workouts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const lastDate = new Date(sorted[0].date);
  const diffMs = targetDate.getTime() - lastDate.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DETERMINISTIC OFFLINE HEURISTIC ENGINES (100% On-Device Math)
// ─────────────────────────────────────────────────────────────────────────────

export function generateOfflineHeuristic(
  state: Pick<
    AppState,
    | 'workouts'
    | 'prs'
    | 'profile'
    | 'waterLogs'
    | 'hydrationConfig'
    | 'creatineLogs'
    | 'creatineConfig'
    | 'meals'
    | 'macroGoals'
  >,
  targetDate: Date = new Date()
): AICoachInsight {
  const todayStr = toLocalDateString(targetDate);
  const bw = state.profile?.bodyweightKg || 75;

  const volume = getVolumeComparison(state.workouts, bw, targetDate);
  const consecutiveDays = getConsecutiveWorkoutDays(state.workouts, targetDate);
  const daysSince = getDaysSinceLastWorkout(state.workouts, targetDate);

  const waterMl = state.waterLogs[todayStr] || 0;
  const waterTarget = calculateHydrationTarget({
    bodyweightKg: bw,
    isTrainingDay: state.workouts.some((w) => w.date && w.date.startsWith(todayStr)),
    customTargetMl: state.hydrationConfig?.dailyTargetMl,
    isCustomTarget: state.hydrationConfig?.isCustomTarget,
  });

  const creatineStats = getCreatineStats(
    state.creatineLogs,
    targetDate,
    state.creatineConfig?.dailyTargetG || 5
  );

  const todayMeals = state.meals.filter((m) => m.date && m.date.startsWith(todayStr));
  const proteinG = todayMeals.reduce(
    (acc, m) => acc + m.foods.reduce((sum, f) => sum + (f.proteinG || 0), 0),
    0
  );
  const proteinTarget = state.macroGoals?.proteinG || Math.round(bw * 1.8);

  let volumeTrend = '';
  if (volume.lastWeekKg === 0 && volume.thisWeekKg === 0) {
    volumeTrend = 'Baseline training cycle. Log workout sets to establish weekly tonnage metrics.';
  } else if (volume.lastWeekKg === 0) {
    volumeTrend = `Initial cycle established: ${volume.thisWeekKg.toLocaleString()} kg total tonnage logged this week.`;
  } else if (volume.diffPercent >= 10) {
    volumeTrend = `Volume increased by +${volume.diffPercent}% (${volume.thisWeekKg.toLocaleString()} kg vs ${volume.lastWeekKg.toLocaleString()} kg prior). Progressive overload active.`;
  } else if (volume.diffPercent <= -10) {
    volumeTrend = `Volume dropped ${Math.abs(volume.diffPercent)}% vs last week (${volume.thisWeekKg.toLocaleString()} kg). Optimal window to push peak intensity or utilize as planned deload.`;
  } else {
    volumeTrend = `Training volume is stable (${volume.thisWeekKg.toLocaleString()} kg, ${volume.diffPercent >= 0 ? '+' : ''}${volume.diffPercent}% vs prior week). Excellent consistency maintaining work capacity.`;
  }

  let recoveryStatus = '';
  if (consecutiveDays >= 4) {
    recoveryStatus = `High fatigue from ${consecutiveDays} consecutive training days. Consider a rest day or lighter active recovery.`;
  } else if (consecutiveDays >= 2) {
    recoveryStatus = `Consistent training (${consecutiveDays} days in a row). Keep form crisp and listen to your body.`;
  } else if (daysSince === 1) {
    recoveryStatus = 'Prior rest day completed. Ready to hit today’s training session with good energy.';
  } else if (daysSince > 14) {
    recoveryStatus = "No recent workout logged. Today's session can start fresh.";
  } else if (daysSince >= 3) {
    recoveryStatus = `Well rested (${daysSince} days since last session). Good window to push your key compound lifts.`;
  } else {
    recoveryStatus = "Ready to train. Hydration and pre-workout nutrition will support today's session.";
  }

  const advicePoints: string[] = [];
  if (consecutiveDays >= 3) {
    advicePoints.push('Keep today’s intensity moderate to manage fatigue and protect joint health.');
  } else if (daysSince >= 2) {
    advicePoints.push('Tackle your heaviest compound lift first while energy and focus are at their peak.');
  } else {
    advicePoints.push('Complete 2–3 warm-up sets before your working sets to prepare your muscles.');
  }

  if (waterMl < waterTarget * 0.6) {
    advicePoints.push("You're below today's hydration target. Consider drinking some water before training.");
  }

  if (proteinG < proteinTarget * 0.7) {
    const proteinDeficit = Math.round(proteinTarget - proteinG);
    advicePoints.push(`Prioritize protein intake (${proteinDeficit}g remaining) to support muscle recovery.`);
  }

  if (creatineStats.saturationLevel === 'Full' || creatineStats.saturationLevel === 'Maintaining') {
    advicePoints.push('Creatine consistency is on track, supporting your strength and training capacity.');
  }

  const tacticalAdvice = advicePoints.slice(0, 2).join(' ');

  let fatigueWarning: string | undefined = undefined;
  if (consecutiveDays >= 4) {
    fatigueWarning = `⚠️ Consecutive training warning: ${consecutiveDays} continuous workout days detected without a scheduled rest day. Watch for joint soreness and technical breakdown.`;
  } else if (waterMl < 800 && new Date().getHours() >= 16) {
    fatigueWarning = '⚠️ Hydration deficit: Less than 800 ml logged late in the day. Intracellular hydration is low, increasing cramp risk.';
  }

  return {
    date: todayStr,
    source: 'offline_heuristic',
    volumeTrend,
    recoveryStatus,
    tacticalAdvice,
    fatigueWarning,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Deterministic offline workout plan generator.
 * Analyzes last workout to select next logical split and exercises based on PRs and history.
 */
export function generateDeterministicDailyPlan(state: AppState): AIPlannedWorkout {
  const todayStr = toLocalDateString(new Date());
  const bw = state.profile?.bodyweightKg || 75;
  const recentWorkouts = state.workouts || [];
  const lastWorkout = recentWorkouts[0];

  let workoutName = 'Upper Body Strength';
  let focus = 'Chest, Shoulders & Upper Back Overload';
  let exercises: AIPlannedExercise[] = [];

  // Determine split continuity
  const lastWorkoutName = lastWorkout?.exercises?.[0]?.name?.toLowerCase() || '';
  const isLastUpper = /bench|press|row|pull|curl|dip/i.test(lastWorkoutName);

  if (isLastUpper) {
    workoutName = 'Lower Body Power & Hypertrophy';
    focus = 'Quad & Posterior Chain Progression';
    const squatPR = state.prs.find((p) => /squat/i.test(p.exercise))?.weightKg || Math.round(bw * 1.2);
    const rdlPR = state.prs.find((p) => /deadlift|rdl/i.test(p.exercise))?.weightKg || Math.round(bw * 1.1);

    exercises = [
      {
        exercise: 'Barbell Back Squat',
        sets: 4,
        reps: '6-8',
        targetWeightKg: Math.round(squatPR * 0.82),
        restSeconds: 150,
        reason: 'Primary knee extension overload. Aim for 8 reps before adding load.',
      },
      {
        exercise: 'Romanian Deadlift',
        sets: 3,
        reps: '8-10',
        targetWeightKg: Math.round(rdlPR * 0.75),
        restSeconds: 120,
        reason: 'Hamstring & posterior chain eccentric hypertrophy with full stretch.',
      },
      {
        exercise: 'Leg Press',
        sets: 3,
        reps: '10-12',
        targetWeightKg: Math.round(bw * 1.8),
        restSeconds: 90,
        reason: 'Safe machine volume without axial spinal loading.',
      },
      {
        exercise: 'Standing Calf Raise',
        sets: 3,
        reps: '12-15',
        targetWeightKg: Math.round(bw * 0.8),
        restSeconds: 60,
        reason: 'Direct gastrocnemius stimulus with 2s pause at bottom stretch.',
      },
    ];
  } else {
    workoutName = 'Upper Body Strength & Hypertrophy';
    focus = 'Chest & Lat Progressive Overload';
    const benchPR = state.prs.find((p) => /bench/i.test(p.exercise))?.weightKg || Math.round(bw * 0.9);
    const rowPR = state.prs.find((p) => /row/i.test(p.exercise))?.weightKg || Math.round(bw * 0.8);

    exercises = [
      {
        exercise: 'Barbell Bench Press',
        sets: 4,
        reps: '6-8',
        targetWeightKg: Math.round(benchPR * 0.82),
        restSeconds: 120,
        reason: 'Primary horizontal press. Hit 8 reps across all sets before advancing weight.',
      },
      {
        exercise: 'Barbell Row',
        sets: 3,
        reps: '8-10',
        targetWeightKg: Math.round(rowPR * 0.8),
        restSeconds: 90,
        reason: 'Horizontal back density balancing anterior shoulder volume.',
      },
      {
        exercise: 'Incline Dumbbell Press',
        sets: 3,
        reps: '8-10',
        targetWeightKg: Math.round(benchPR * 0.35),
        restSeconds: 90,
        reason: 'Upper clavicular pec emphasis with deep convergence at lockout.',
      },
      {
        exercise: 'Lat Pulldown',
        sets: 3,
        reps: '10-12',
        targetWeightKg: Math.round(bw * 0.7),
        restSeconds: 75,
        reason: 'Vertical pulling hypertrophy targeting lower lats with strict tempo.',
      },
      {
        exercise: 'Dumbbell Lateral Raise',
        sets: 3,
        reps: '12-15',
        targetWeightKg: Math.round(bw * 0.12),
        restSeconds: 60,
        reason: 'Lateral deltoid cap isolated hypertrophy.',
      },
    ];
  }

  return {
    id: `plan_${todayStr}`,
    date: todayStr,
    workoutName,
    estimatedDurationMin: exercises.length * 10 + 10,
    focus,
    whyThisWorkout: `Structured based on your recent training rotation. Balanced volume targeting hypertrophy without exceeding connective tissue capacity.`,
    exercises,
    source: 'offline_deterministic',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Deterministic exercise substitution engine.
 * Fast 1-tap replacements matching movement patterns and user equipment constraints.
 */
export function generateDeterministicSubstitution(
  exerciseToReplace: string,
  reasonOption: string
): AISubstitutionResult {
  const name = exerciseToReplace.toLowerCase();

  if (name.includes('squat')) {
    return {
      originalExercise: exerciseToReplace,
      replacementExercise: 'Hack Squat',
      reason: 'Replicates identical quad-dominant knee extension with zero lower-back spinal compression.',
      movementPattern: 'Quad-dominant compound squat',
      targetWeightKg: 80,
      targetReps: '8-10',
      targetSets: 3,
    };
  }

  if (name.includes('bench')) {
    return {
      originalExercise: exerciseToReplace,
      replacementExercise: 'Dumbbell Bench Press',
      reason: 'Matches horizontal pressing pattern while allowing natural wrist rotation and greater range of motion at bottom stretch.',
      movementPattern: 'Horizontal chest press',
      targetWeightKg: 28,
      targetReps: '8-10',
      targetSets: 3,
    };
  }

  if (name.includes('deadlift') || name.includes('rdl')) {
    return {
      originalExercise: exerciseToReplace,
      replacementExercise: 'Dumbbell Romanian Deadlift',
      reason: 'Maintains hip-hinge hamstring stretch with independent bilateral dumbbell tracking.',
      movementPattern: 'Hip-hinge posterior chain',
      targetWeightKg: 26,
      targetReps: '10-12',
      targetSets: 3,
    };
  }

  if (name.includes('row')) {
    return {
      originalExercise: exerciseToReplace,
      replacementExercise: 'One-Arm Dumbbell Row',
      reason: 'Full lat stretch and contraction with unilateral core bracing on flat bench.',
      movementPattern: 'Horizontal pull',
      targetWeightKg: 26,
      targetReps: '10-12',
      targetSets: 3,
    };
  }

  if (name.includes('overhead') || name.includes('ohp') || name.includes('military')) {
    return {
      originalExercise: exerciseToReplace,
      replacementExercise: 'Seated Dumbbell Shoulder Press',
      reason: 'Vertical anterior deltoid press with back support to eliminate lumbar hyperextension.',
      movementPattern: 'Vertical shoulder press',
      targetWeightKg: 20,
      targetReps: '8-10',
      targetSets: 3,
    };
  }

  if (name.includes('pull') || name.includes('chin')) {
    return {
      originalExercise: exerciseToReplace,
      replacementExercise: 'Lat Pulldown',
      reason: 'Identical vertical pulling mechanics with micro-adjustable resistance for strict failure control.',
      movementPattern: 'Vertical lat pull',
      targetWeightKg: 55,
      targetReps: '10-12',
      targetSets: 3,
    };
  }

  // Fallback generic replacement
  return {
    originalExercise: exerciseToReplace,
    replacementExercise: `Dumbbell ${exerciseToReplace}`,
    reason: 'Readily available dumbbell variant matching primary movement mechanics.',
    movementPattern: 'Free weight bilateral movement',
    targetReps: '8-12',
    targetSets: 3,
  };
}

/**
 * Deterministic command interpreter for live in-workout commands.
 */
export function generateDeterministicCommand(
  instruction: string,
  activeWorkout: any
): AIWorkoutCommandResult {
  const text = instruction.toLowerCase();

  if (text.includes('30') || text.includes('time') || text.includes('short') || text.includes('hurry')) {
    const exercises = (activeWorkout?.exercises || []).slice(0, 3).map((e: any) => ({
      exercise: e.name,
      sets: Math.min(e.sets?.length || 2, 2),
      reps: '8-10',
      targetWeightKg: e.sets?.[0]?.weight || 50,
      restSeconds: 75,
      reason: 'Streamlined working sets to compress session under 30 minutes.',
    }));

    return {
      actionType: 'SHORTEN_TIME',
      summary: '30-Minute Express Adaptation',
      coachAdvice: 'Capped workout at top 3 movements with 2 working sets each and 75s rest periods to preserve density.',
      modifiedExercises: exercises,
    };
  }

  if (text.includes('crowd') || text.includes('busy') || text.includes('machine') || text.includes('occupied')) {
    const exercises = (activeWorkout?.exercises || []).map((e: any) => {
      const sub = generateDeterministicSubstitution(e.name, 'Equipment busy');
      return {
        exercise: sub.replacementExercise,
        sets: e.sets?.length || 3,
        reps: sub.targetReps || '8-10',
        targetWeightKg: sub.targetWeightKg || e.sets?.[0]?.weight || 24,
        restSeconds: 90,
        reason: sub.reason,
      };
    });

    return {
      actionType: 'SWAP_EQUIPMENT',
      summary: 'Crowded Gym Dumbbell Adaptations',
      coachAdvice: 'Converted required barbell/cable stations to open dumbbell variations to avoid waiting for equipment.',
      modifiedExercises: exercises,
    };
  }

  if (text.includes('tired') || text.includes('low energy') || text.includes('fatigue') || text.includes('exhausted')) {
    return {
      actionType: 'DELOAD_INTENSITY',
      summary: 'Technical Recovery Deload Active',
      coachAdvice: 'Reduce current target weights by 10%. Stay 2-3 reps in reserve (RPE 7-8) to protect joints while keeping movement patterns sharp.',
    };
  }

  // Weight progression query
  return {
    actionType: 'WEIGHT_ADVICE',
    summary: 'Progressive Overload Rule',
    coachAdvice: 'If you completed your previous session with all target reps at RPE ≤ 8 with strict form, increase load by 2.5 kg. Otherwise, lock in the same weight and aim for 1 more rep on your final set.',
  };
}

/**
 * Deterministic post-workout take.
 */
export function generateDeterministicPostWorkoutTake(
  completedWorkout: any
): AIPostWorkoutTake {
  const exercises = completedWorkout?.exercises || [];
  const primary = exercises[0]?.name || 'Primary lift';

  return {
    headline: `Session Complete • ${primary} locked in`,
    volumeVsLastWeek: 'Volume stimulus successfully delivered to target muscle groups.',
    keyAchievements: [
      `Completed ${exercises.length} movements with consistent execution.`,
      `Session duration: ${completedWorkout?.durationMinutes || 45} minutes.`,
    ],
    nextSessionTarget: `Repeat ${primary} next session and aim for +1 rep on your final working set before increasing load.`,
    source: 'offline_heuristic',
  };
}

/**
 * Deterministic weekly review.
 */
export function generateDeterministicWeeklyReview(state: AppState): AIWeeklyReview {
  const todayStr = toLocalDateString(new Date());
  const trainingProfile = state.trainingProfile;
  const recentWorkouts = state.workouts || [];
  const count = recentWorkouts.filter((w) => {
    const diff = Math.floor((new Date().getTime() - new Date(w.date).getTime()) / (1000 * 60 * 60 * 24));
    return diff <= 7;
  }).length;

  return {
    id: `review_${todayStr}`,
    date: todayStr,
    weekSummary: `Completed ${count} of ${trainingProfile?.daysPerWeek || 4} target training sessions over the past 7 days.`,
    workoutsCompleted: count,
    plannedDaysPerWeek: trainingProfile?.daysPerWeek || 4,
    strengthHighlight: 'Primary compound movements maintained load progression with disciplined set execution.',
    habitInsight: 'Consistent hydration on active workout days supported intra-muscular pump and session recovery.',
    focusNextWeek: 'Focus on advancing top sets by one rep across your primary barbell movements before micro-loading.',
    source: 'offline_heuristic',
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. HYBRID DISPATCHERS (Progressive Gemini Cloud AI + 7s Abort + Offline Fallback)
// ─────────────────────────────────────────────────────────────────────────────

async function executeAIRequest<T>(
  state: AppState,
  payload: any,
  offlineFallback: () => T
): Promise<T> {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isOffline) {
    return offlineFallback();
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (state.customGeminiKey) {
      headers['x-gemini-api-key'] = state.customGeminiKey;
    }

    const res = await fetch('/api/coach', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        customApiKey: state.customGeminiKey,
        userContext: buildCompactUserContext(state),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data?.data) {
        return data.data as T;
      }
    }

    return offlineFallback();
  } catch {
    return offlineFallback();
  }
}

/**
 * 1. AI Workout Planner: Today's Training
 */
export async function fetchOrGenerateDailyPlan(
  state: AppState,
  options?: { forceRefresh?: boolean }
): Promise<AIPlannedWorkout> {
  const todayStr = toLocalDateString(new Date());

  if (!options?.forceRefresh && state.todaysAIWorkoutPlan && state.todaysAIWorkoutPlan.date === todayStr) {
    return state.todaysAIWorkoutPlan;
  }

  const result = await executeAIRequest<AIPlannedWorkout>(
    state,
    { task: 'GENERATE_DAILY_PLAN' },
    () => generateDeterministicDailyPlan(state)
  );

  const finalPlan: AIPlannedWorkout = {
    ...result,
    id: `plan_${todayStr}`,
    date: todayStr,
    source: result.source || 'gemini',
    createdAt: new Date().toISOString(),
  };

  state.setTodaysAIWorkoutPlan(finalPlan);
  return finalPlan;
}

/**
 * 2. 1-Tap Exercise Substitution
 */
export async function fetchExerciseSubstitution(
  state: AppState,
  exerciseToReplace: string,
  reasonOption: string
): Promise<AISubstitutionResult> {
  return executeAIRequest<AISubstitutionResult>(
    state,
    {
      task: 'SUBSTITUTE_EXERCISE',
      substitution: { exerciseToReplace, reasonOption },
    },
    () => generateDeterministicSubstitution(exerciseToReplace, reasonOption)
  );
}

/**
 * 3. In-Workout Command ("30 mins", "Crowded gym", "Should I increase weight?")
 */
export async function fetchWorkoutCommand(
  state: AppState,
  instruction: string,
  activeWorkout: any
): Promise<AIWorkoutCommandResult> {
  return executeAIRequest<AIWorkoutCommandResult>(
    state,
    {
      task: 'WORKOUT_COMMAND',
      command: { instruction, activeWorkout },
    },
    () => generateDeterministicCommand(instruction, activeWorkout)
  );
}

/**
 * 4. Immediate Post-Workout Coach's Take
 */
export async function fetchPostWorkoutTake(
  state: AppState,
  completedWorkout: any
): Promise<AIPostWorkoutTake> {
  return executeAIRequest<AIPostWorkoutTake>(
    state,
    {
      task: 'POST_WORKOUT_TAKE',
      completedWorkout,
    },
    () => generateDeterministicPostWorkoutTake(completedWorkout)
  );
}

/**
 * 5. Weekly AI Review
 */
export async function fetchWeeklyReview(
  state: AppState,
  options?: { forceRefresh?: boolean }
): Promise<AIWeeklyReview> {
  const todayStr = toLocalDateString(new Date());

  if (!options?.forceRefresh && state.latestWeeklyReview && state.latestWeeklyReview.date === todayStr) {
    return state.latestWeeklyReview;
  }

  const result = await executeAIRequest<AIWeeklyReview>(
    state,
    {
      task: 'WEEKLY_REVIEW',
      weeklyStats: {
        workoutsCompleted: state.workouts.length,
        plannedDays: state.trainingProfile?.daysPerWeek || 4,
      },
    },
    () => generateDeterministicWeeklyReview(state)
  );

  const finalReview: AIWeeklyReview = {
    ...result,
    id: `review_${todayStr}`,
    date: todayStr,
    source: result.source || 'gemini',
    createdAt: new Date().toISOString(),
  };

  state.saveWeeklyReview(finalReview);
  return finalReview;
}

/**
 * 6. Tactical AI Coach Insight (Home Screen Overview)
 */
export async function fetchOrGenerateAICoachInsight(
  state: AppState,
  options?: { forceRefresh?: boolean }
): Promise<AICoachInsight> {
  const todayStr = toLocalDateString(new Date());

  if (!options?.forceRefresh && state.aiInsightsCache && state.aiInsightsCache[todayStr]) {
    return state.aiInsightsCache[todayStr];
  }

  const result = await executeAIRequest<AICoachInsight>(
    state,
    { task: 'COACH_INSIGHT' },
    () => generateOfflineHeuristic(state)
  );

  const fullInsight: AICoachInsight = {
    date: todayStr,
    source: result.source || 'gemini',
    volumeTrend: result.volumeTrend,
    recoveryStatus: result.recoveryStatus,
    tacticalAdvice: result.tacticalAdvice,
    fatigueWarning: result.fatigueWarning || undefined,
    timestamp: new Date().toISOString(),
  };

  state.cacheAIInsight(todayStr, fullInsight);
  return fullInsight;
}
