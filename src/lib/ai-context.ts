import { AppState } from './store';
import { AITrainingProfile } from './types';
import { toLocalDateString, calculateHydrationTarget, getCreatineStats } from './habits';
import { getVolumeComparison, getConsecutiveWorkoutDays, getDaysSinceLastWorkout } from './ai-coach';

export const DEFAULT_AI_TRAINING_PROFILE: AITrainingProfile = {
  goal: 'muscle_gain',
  experience: 'intermediate',
  daysPerWeek: 4,
  preferredDurationMin: 55,
  equipment: 'full_gym',
  preferredSplit: 'upper_lower',
  dislikedExercises: [],
  injuriesOrLimitations: [],
  coachingStyle: 'concise',
};

/**
 * Builds a compact, high-signal, token-efficient user context string.
 * Keeps payloads tiny, deterministic, and tightly grounded in actual workout/habit history.
 */
export function buildCompactUserContext(state: AppState): string {
  const profile = state.profile;
  const trainingProfile = state.trainingProfile || DEFAULT_AI_TRAINING_PROFILE;
  const bw = profile?.bodyweightKg || 75;
  const unit = profile?.unit || 'kg';
  const todayStr = toLocalDateString(new Date());

  // 1. User & Goals Summary
  const userLines: string[] = [
    `USER: Name=${profile?.name || 'Lifter'} Gender=${profile?.gender || 'male'} BW=${bw}${unit}`,
    `TRAINING PROFILE: Goal=${trainingProfile.goal} Experience=${trainingProfile.experience} Days/Week=${trainingProfile.daysPerWeek} SessionDuration=${trainingProfile.preferredDurationMin}m Split=${trainingProfile.preferredSplit} Equipment=${trainingProfile.equipment}`,
  ];

  if (trainingProfile.dislikedExercises.length > 0) {
    userLines.push(`DISLIKED/EXCLUDED EXERCISES: ${trainingProfile.dislikedExercises.join(', ')}`);
  }
  if (trainingProfile.injuriesOrLimitations.length > 0) {
    userLines.push(`LIMITATIONS/INJURIES: ${trainingProfile.injuriesOrLimitations.join(', ')}`);
  }

  // 2. Recent Workout History (Last 5 sessions)
  const recentWorkouts = (state.workouts || []).slice(0, 5);
  const workoutLines: string[] = [];
  if (recentWorkouts.length === 0) {
    workoutLines.push('RECENT WORKOUTS: None logged yet. Brand new training cycle.');
  } else {
    workoutLines.push('RECENT WORKOUTS:');
    for (const w of recentWorkouts) {
      const exSummaries = w.exercises.map((e) => {
        const topSet = e.sets.reduce((max, s) => (s.weight > max.weight ? s : max), e.sets[0] || { weight: 0, reps: 0, unit });
        return `${e.name}: ${e.sets.length} sets (top ${topSet.weight}${topSet.unit || unit}×${topSet.reps})`;
      });
      workoutLines.push(`- [${w.date}] ${exSummaries.slice(0, 4).join('; ')}`);
    }
  }

  // 3. Lift Trends (Key Benchmarks: Bench, Squat, Deadlift, OHP, Row, Pull-up)
  const keyExercises = [
    'Bench Press',
    'Squat',
    'Deadlift',
    'Overhead Press',
    'Barbell Row',
    'Pull-ups',
    'Incline Dumbbell Press',
    'Romanian Deadlift'
  ];

  const trendLines: string[] = ['PERFORMANCE TRENDS:'];
  for (const exName of keyExercises) {
    // Find all sessions containing this exercise
    const entries: { date: string; weight: number; reps: number }[] = [];
    for (const w of state.workouts || []) {
      const match = w.exercises.find((e) => e.name.toLowerCase().includes(exName.toLowerCase()));
      if (match && match.sets.length > 0) {
        const top = match.sets.reduce((m, s) => (s.weight > m.weight ? s : m), match.sets[0]);
        entries.push({ date: w.date, weight: top.weight, reps: top.reps });
      }
    }

    if (entries.length > 0) {
      const recent = entries.slice(0, 3);
      const recentHistory = recent.map((r) => `${r.weight}${unit}×${r.reps}`).join(' -> ');
      const pr = state.prs.find((p) => p.exercise.toLowerCase().includes(exName.toLowerCase()));
      const prText = pr ? ` (PR: ${pr.weightKg}${unit}×${pr.reps})` : '';
      trendLines.push(`- ${exName}: ${recentHistory}${prText}`);
    }
  }

  // 4. Volume & Recovery State
  const volume = getVolumeComparison(state.workouts, bw);
  const consecutiveDays = getConsecutiveWorkoutDays(state.workouts);
  const daysSinceLast = getDaysSinceLastWorkout(state.workouts);

  const recoveryLines = [
    `VOLUME & FATIGUE: ThisWeek=${volume.thisWeekKg}kg LastWeek=${volume.lastWeekKg}kg Shift=${volume.diffPercent >= 0 ? '+' : ''}${volume.diffPercent}% ConsecutiveDays=${consecutiveDays} DaysSinceLast=${daysSinceLast}`,
  ];

  // 5. Daily Essentials & Habit Context
  const waterToday = state.waterLogs[todayStr] || 0;
  const waterTarget = calculateHydrationTarget({
    bodyweightKg: bw,
    isTrainingDay: state.workouts.some((w) => w.date && w.date.startsWith(todayStr)),
    customTargetMl: state.hydrationConfig?.dailyTargetMl,
    isCustomTarget: state.hydrationConfig?.isCustomTarget,
  });

  // Calculate 7-day water average
  let totalWater7 = 0;
  let loggedDaysWater7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = toLocalDateString(d);
    if (state.waterLogs[dStr] !== undefined) {
      totalWater7 += state.waterLogs[dStr];
      loggedDaysWater7++;
    }
  }
  const avgWaterL = loggedDaysWater7 > 0 ? (totalWater7 / loggedDaysWater7 / 1000).toFixed(1) : '0';

  const creatineStats = getCreatineStats(state.creatineLogs, new Date(), state.creatineConfig?.dailyTargetG || 5);

  const habitLines = [
    `HABITS: WaterToday=${(waterToday / 1000).toFixed(1)}L/${(waterTarget / 1000).toFixed(1)}L 7dAvg=${avgWaterL}L/day; CreatineToday=${creatineStats.takenToday ? 'YES' : 'NO'} 30dConsistency=${creatineStats.consistencyPct}% Streak=${creatineStats.currentStreak}d Saturation=${creatineStats.saturationLevel}`,
  ];

  return [
    ...userLines,
    ...workoutLines,
    ...trendLines,
    ...recoveryLines,
    ...habitLines,
  ].join('\n');
}
