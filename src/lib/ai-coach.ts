import { AppState } from './store';
import { WorkoutEntry, AIPostWorkoutTake, isSetCompleted } from './types';
import { toLocalDateString } from './habits';
import { getWeekDateStrings } from './formatters';
import { calculateWorkoutVolumeKg } from './volume';
import { getExerciseMuscle } from './exercise-library';
import { buildCompactUserContext } from './ai-context';
import { getAiAuthHeaders } from './ai-client-auth';
import { getNextSessionTarget, exerciseHadPain } from './workout-engine';
import { DEFAULT_BODYWEIGHT_KG } from './defaults';

/**
 * Calculates total tonnage (volume in kg) for a workout session.
 *
 * Gauntlet DI-05: the set-by-set volume is the single canonical
 * definition in lib/volume (ALL completed sets including warmups;
 * bodyweight work at full body weight) — the same number the weekly
 * review and the monthly report show for the same session. On top of
 * that, a pure-conditioning session (a run, a ride) logs ~zero set
 * volume but is genuine training load, so readiness/ACWR additionally
 * credit a duration-based equivalent (minutes × bodyweight × 0.5).
 * That credit is a coach-load equivalent only; it is not part of the
 * displayed volume definition.
 */
export function calculateWorkoutTonnage(workout: WorkoutEntry, bodyweightKg = DEFAULT_BODYWEIGHT_KG): number {
  if (!workout?.exercises) return 0;

  let total = calculateWorkoutVolumeKg(workout, bodyweightKg);

  const allConditioning =
    workout.exercises.length > 0 &&
    workout.exercises.every((ex) => getExerciseMuscle(ex.name) === 'Conditioning');

  // Pure-cardio sessions (a run, a ride) log ~zero weighted tonnage but
  // are genuine training load. Credit a duration-based equivalent
  // (minutes × bodyweight × 0.5) so readiness/ACWR can see them.
  if (allConditioning && total < bodyweightKg * 10) {
    const minutes =
      typeof workout.durationMinutes === 'number' && workout.durationMinutes > 0
        ? workout.durationMinutes
        : workout.exercises.length * 10;
    total += minutes * bodyweightKg * 0.5;
  }

  return total;
}

/**
 * Compares training volume of the last 7 days vs the prior 7 days.
 */
export function getVolumeComparison(
  workouts: WorkoutEntry[],
  bodyweightKg = DEFAULT_BODYWEIGHT_KG,
  targetDate: Date = new Date()
): { thisWeekKg: number; lastWeekKg: number; diffPercent: number } {
  // Calendar weeks: this Mon–Sun vs last Mon–Sun.
  const thisWeekStrs = new Set(getWeekDateStrings(targetDate));
  const lastWeekAnchor = new Date(targetDate);
  lastWeekAnchor.setDate(lastWeekAnchor.getDate() - 7);
  const lastWeekStrs = new Set(getWeekDateStrings(lastWeekAnchor));

  let thisWeekTonnage = 0;
  let lastWeekTonnage = 0;

  for (const w of workouts) {
    if (!w.date) continue;
    const dStr = w.date.split('T')[0];
    const tonnage = calculateWorkoutTonnage(w, bodyweightKg);
    if (thisWeekStrs.has(dStr)) {
      thisWeekTonnage += tonnage;
    } else if (lastWeekStrs.has(dStr)) {
      lastWeekTonnage += tonnage;
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

  // Parse the date string as a LOCAL date, not UTC. A string like "2026-10-15"
  // would be interpreted as UTC midnight by `new Date("2026-10-15")`, but the
  // workout was logged in local time. Using local timezone parsing ensures
  // the day-diff calculation is consistent with how dates are stored.
  const lastDateStr = sorted[0].date;
  const parts = lastDateStr.split('-');
  const lastDate =
    parts.length === 3
      ? new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
      : new Date(lastDateStr);

  const diffMs = targetDate.getTime() - lastDate.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DETERMINISTIC OFFLINE HEURISTIC ENGINES (100% On-Device Math)
// ─────────────────────────────────────────────────────────────────────────────





/**
 * Deterministic post-workout take.
 */
export function generateDeterministicPostWorkoutTake(
  completedWorkout: any
): AIPostWorkoutTake {
  const exercises = completedWorkout?.exercises || [];
  const primary = exercises[0]?.name || 'Primary lift';

  // Next-session target from the canonical getNextSessionTarget() — the same
  // function the Training Adaptation Summary reads, so the two surfaces can
  // never contradict each other.
  const primarySets = ((exercises[0]?.sets || []) as any[])
    .filter((s) => isSetCompleted(s))
    .map((s) => ({
      weight: parseFloat(String(s.weight)) || 0,
      reps: parseInt(String(s.reps), 10) || 0,
      rpe: typeof s.rpe === 'number' ? s.rpe : undefined,
      unit: (s.unit as 'kg' | 'lbs' | undefined) || 'kg',
    }));
  const canonicalTarget = getNextSessionTarget(
    primary,
    primarySets,
    (primarySets[0]?.unit as 'kg' | 'lbs' | undefined) || 'kg',
    { hadPain: exerciseHadPain(completedWorkout, primary) }
  );
  const nextSessionTarget = canonicalTarget
    ? `NEXT SESSION TARGET: ${canonicalTarget.summaryText}`
    : `Repeat ${primary} next session and aim for +1 rep on your final working set before increasing load.`;

  // Measured facts only. This generator receives just the completed
  // workout — no prior-week data — so it reports this session's own
  // numbers. It never invents a comparison it cannot compute, and
  // never states a duration it was not given (the house rule the
  // quick-log path already follows: blank stays blank).
  let completedSetCount = 0;
  let totalVolumeKg = 0;
  for (const ex of exercises) {
    for (const s of (ex?.sets || []) as any[]) {
      if (!isSetCompleted(s)) continue;
      completedSetCount += 1;
      const w = parseFloat(String(s.weight)) || 0;
      const r = parseInt(String(s.reps), 10) || 0;
      totalVolumeKg += (s.unit === 'lbs' ? w * 0.453592 : w) * r;
    }
  }
  const roundedVolumeKg = Math.round(totalVolumeKg);

  const keyAchievements: string[] = [];
  if (exercises.length > 0) {
    keyAchievements.push(
      `Completed ${exercises.length} movements, ${completedSetCount} sets.`
    );
  }
  if (
    typeof completedWorkout?.durationMinutes === 'number' &&
    completedWorkout.durationMinutes > 0
  ) {
    keyAchievements.push(`Session duration: ${completedWorkout.durationMinutes} minutes.`);
  }
  if (keyAchievements.length === 0) {
    keyAchievements.push('No completed sets were recorded for this session.');
  }

  return {
    headline:
      exercises.length > 0 ? `Session Complete • ${primary} locked in` : 'Session Complete',
    // Legacy field name — the content is this session's measured total,
    // because no last-week figure reaches this generator.
    volumeVsLastWeek:
      roundedVolumeKg > 0
        ? `Total volume this session: ${roundedVolumeKg.toLocaleString()} kg across ${completedSetCount} completed sets.`
        : 'No weighted sets were recorded, so there is no volume total for this session.',
    keyAchievements,
    nextSessionTarget,
    source: 'offline_heuristic',
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
      // F-02 (audit): session token when signed in → higher per-account
      // daily AI quota; guests send nothing.
      ...(await getAiAuthHeaders()),
    };

    const res = await fetch('/api/coach', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        // Task 2.5: the route localizes its reply (guardrails +
        // safety refer-out) from this; it was never sent, so Hindi
        // users always got English Coach's Take output. Read from
        // the state already in scope — importing the i18n module
        // here would drag React hooks into shared module graphs.
        language: state.uiPreferences?.language === 'hi' ? 'hi' : 'en',
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


