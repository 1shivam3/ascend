import { AppState } from './store';
import { AICoachInsight, WorkoutEntry, PersonalRecord } from './types';
import { toLocalDateString, getCreatineStats, calculateHydrationTarget } from './habits';

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
        // Effective load = bodyweight (or proportion) + added weight
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
      // If we haven't trained today yet, don't break the streak if yesterday had a workout
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

/**
 * Deterministic, offline heuristic strength & fatigue engine.
 * Runs instantly 100% on-device with zero network required.
 */
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

  // Daily Essentials status
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

  // 1. Volume Trend
  let volumeTrend = '';
  if (volume.lastWeekKg === 0 && volume.thisWeekKg === 0) {
    volumeTrend = 'Baseline training cycle. Log workout sets to establish weekly tonnage metrics.';
  } else if (volume.lastWeekKg === 0) {
    const formattedThis = volume.thisWeekKg.toLocaleString();
    volumeTrend = `Initial cycle established: ${formattedThis} kg total tonnage logged this week.`;
  } else if (volume.diffPercent >= 10) {
    volumeTrend = `Volume increased by +${volume.diffPercent}% (${volume.thisWeekKg.toLocaleString()} kg vs ${volume.lastWeekKg.toLocaleString()} kg prior). Progressive overload active.`;
  } else if (volume.diffPercent <= -10) {
    volumeTrend = `Volume dropped ${Math.abs(volume.diffPercent)}% vs last week (${volume.thisWeekKg.toLocaleString()} kg). Optimal window to push peak intensity or utilize as planned deload.`;
  } else {
    volumeTrend = `Training volume is stable (${volume.thisWeekKg.toLocaleString()} kg, ${volume.diffPercent >= 0 ? '+' : ''}${volume.diffPercent}% vs prior week). Excellent consistency maintaining work capacity.`;
  }

  // 2. Recovery Status
  let recoveryStatus = '';
  if (consecutiveDays >= 4) {
    recoveryStatus = `High systemic fatigue accumulated over ${consecutiveDays} consecutive training days. CNS and connective tissues require prioritized recovery.`;
  } else if (consecutiveDays >= 2) {
    recoveryStatus = `Moderate central fatigue after ${consecutiveDays} training days in a row. Muscle glycogen and neural drive remain balanced.`;
  } else if (daysSince === 1) {
    recoveryStatus = 'CNS readiness primed. Prior rest day allowed full replenishment of neuromuscular power and cellular hydration.';
  } else if (daysSince >= 3) {
    recoveryStatus = `Full physiological recovery detected (${daysSince} days since last session). Maximum motor unit recruitment available for heavy compound efforts.`;
  } else {
    recoveryStatus = 'Normal neuromuscular baseline. Hydration and nutritional replenishment dictate session quality.';
  }

  // 3. Tactical Advice
  const advicePoints: string[] = [];

  // Workout timing & intensity advice
  if (consecutiveDays >= 3) {
    advicePoints.push('Cap today’s session intensity at RPE 8 to preserve joint integrity and avoid accumulated overtraining.');
  } else if (daysSince >= 2) {
    advicePoints.push('Tackle your heaviest barbell compound lift first while neural drive and motor unit recruitment are at their peak.');
  } else {
    advicePoints.push('Ensure 2–3 ramp-up warm-up sets before your top working set to prime the neuromuscular groove.');
  }

  // Nutrition / Hydration tactical advice
  if (waterMl < waterTarget * 0.6) {
    const needed = Math.round(waterTarget - waterMl);
    advicePoints.push(`Hydration is trailing target by ${(needed / 1000).toFixed(1)} L. Consume 500 ml before exercise to maintain blood volume and prevent premature pump loss.`);
  }

  if (proteinG < proteinTarget * 0.7) {
    const proteinDeficit = Math.round(proteinTarget - proteinG);
    advicePoints.push(`Prioritize protein intake (${proteinDeficit}g remaining) to drive muscle protein synthesis during nocturnal recovery.`);
  }

  if (creatineStats.saturationLevel === 'Full' || creatineStats.saturationLevel === 'Maintaining') {
    advicePoints.push('Intra-muscular phosphocreatine stores are saturated, supporting maximum ATP resynthesis on 1–5 rep sets.');
  }

  const tacticalAdvice = advicePoints.slice(0, 2).join(' ');

  // 4. Fatigue Warning
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
 * Hybrid AI Coach Dispatcher:
 * 1. Checks cache for today.
 * 2. Checks browser connectivity (`navigator.onLine`). If offline, runs deterministic heuristics immediately.
 * 3. If online, calls `/api/ai/coach` with 7s timeout. If timeout or error, falls back to deterministic heuristics.
 */
export async function fetchOrGenerateAICoachInsight(
  state: AppState,
  options?: { forceRefresh?: boolean }
): Promise<AICoachInsight> {
  const todayStr = toLocalDateString(new Date());

  // 1. Check local cache
  if (!options?.forceRefresh && state.aiInsightsCache && state.aiInsightsCache[todayStr]) {
    return state.aiInsightsCache[todayStr];
  }

  // 2. Offline check
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isBrowserOffline) {
    const heuristic = generateOfflineHeuristic(state);
    state.cacheAIInsight(todayStr, heuristic);
    return heuristic;
  }

  // 3. Online AI Generation with 7-second timeout
  try {
    const bw = state.profile?.bodyweightKg || 75;
    const volumeMetrics = getVolumeComparison(state.workouts, bw);
    const consecutiveWorkoutDays = getConsecutiveWorkoutDays(state.workouts);
    const daysSinceLastWorkout = getDaysSinceLastWorkout(state.workouts);

    const waterMlToday = state.waterLogs[todayStr] || 0;
    const waterTargetMl = calculateHydrationTarget({
      bodyweightKg: bw,
      isTrainingDay: state.workouts.some((w) => w.date && w.date.startsWith(todayStr)),
      customTargetMl: state.hydrationConfig?.dailyTargetMl,
      isCustomTarget: state.hydrationConfig?.isCustomTarget,
    });

    const creatineStats = getCreatineStats(
      state.creatineLogs,
      new Date(),
      state.creatineConfig?.dailyTargetG || 5
    );

    const todayMeals = state.meals.filter((m) => m.date && m.date.startsWith(todayStr));
    const proteinGToday = todayMeals.reduce(
      (acc, m) => acc + m.foods.reduce((sum, f) => sum + (f.proteinG || 0), 0),
      0
    );
    const proteinTargetG = state.macroGoals?.proteinG || Math.round(bw * 1.8);

    const payload = {
      customApiKey: state.customGeminiKey,
      profile: {
        name: state.profile?.name,
        gender: state.profile?.gender,
        bodyweightKg: state.profile?.bodyweightKg,
        unit: state.profile?.unit,
      },
      metrics: {
        volumeThisWeekKg: volumeMetrics.thisWeekKg,
        volumeLastWeekKg: volumeMetrics.lastWeekKg,
        volumeDiffPercent: volumeMetrics.diffPercent,
        consecutiveWorkoutDays,
        daysSinceLastWorkout,
        waterMlToday,
        waterTargetMl,
        creatineTakenToday: creatineStats.takenToday,
        creatineStreakDays: creatineStats.currentStreak,
        proteinGToday,
        proteinTargetG,
      },
      recentWorkouts: (state.workouts || []).slice(0, 7),
      topPRs: (state.prs || []).slice(0, 5).map((p: PersonalRecord) => ({
        exercise: p.exercise,
        oneRepMax: p.oneRepMax,
      })),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (state.customGeminiKey) {
      headers['x-gemini-api-key'] = state.customGeminiKey;
    }

    const response = await fetch('/api/ai/coach', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data?.insight) {
        const fullInsight: AICoachInsight = {
          date: todayStr,
          source: 'gemini',
          volumeTrend: data.insight.volumeTrend,
          recoveryStatus: data.insight.recoveryStatus,
          tacticalAdvice: data.insight.tacticalAdvice,
          fatigueWarning: data.insight.fatigueWarning || undefined,
          timestamp: new Date().toISOString(),
        };
        state.cacheAIInsight(todayStr, fullInsight);
        return fullInsight;
      }
    }

    // Server error or non-200: fallback to offline heuristic
    const fallback = generateOfflineHeuristic(state);
    state.cacheAIInsight(todayStr, fallback);
    return fallback;
  } catch {
    // Timeout or network disconnect: fallback seamlessly to offline heuristic
    const fallback = generateOfflineHeuristic(state);
    state.cacheAIInsight(todayStr, fallback);
    return fallback;
  }
}
