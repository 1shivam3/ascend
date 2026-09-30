import {
  UserProfile,
  PersonalRecord,
  WorkoutEntry,
  MealEntry,
  BodyMetricEntry,
  MacroGoals,
  PlannedWorkout,
  DayType,
  HydrationConfig,
  WaterLogBatch,
  CreatineLog,
  CreatineConfig,
  CreatineSupply,
  DailyTimelineEvent
} from './types';

export type { DayType };

// Helper: safe local date string YYYY-MM-DD
export function toLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── 1. Hydration Target Calculation ──────────────────────────────────────────
export function calculateHydrationTarget(params: {
  bodyweightKg?: number;
  customTargetMl?: number;
  isCustomTarget?: boolean;
  isTrainingDay?: boolean;
  climateHeat?: boolean;
}): number {
  if (params.isCustomTarget && params.customTargetMl && params.customTargetMl > 0) {
    return params.customTargetMl;
  }

  const bw = params.bodyweightKg && params.bodyweightKg > 0 ? params.bodyweightKg : 75;
  // Standard guideline: ~35 ml / kg bodyweight
  // Fixed baseline so all screens (Home, Nutrition, Essentials, AI) show the exact same target
  let target = Math.round(bw * 35);

  // Round to nearest 50ml for clean numbers (e.g. 72kg * 35 = 2520 -> 2500ml = 2.5L)
  target = Math.round(target / 50) * 50;

  return Math.max(1500, target);
}

export function formatWaterLiters(ml: number): string {
  const val = (ml || 0) / 1000;
  return `${val.toFixed(1)} L`;
}

// ── 2. Creatine Consistency & Saturation ─────────────────────────────────────
export interface CreatineStats {
  takenToday: boolean;
  todayDoseG: number;
  takenCount30: number;
  totalDays30: number;
  consistencyPct: number;
  currentStreak: number;
  message: string;
  saturationLevel: 'Full' | 'Maintaining' | 'Building' | 'Low';
}

export function getCreatineStats(
  creatineLogs: Record<string, CreatineLog> = {},
  todayDate: Date = new Date(),
  targetDoseG = 5
): CreatineStats {
  const todayStr = toLocalDateString(todayDate);
  const todayLog = creatineLogs[todayStr];
  const takenToday = !!todayLog?.taken;
  const todayDoseG = todayLog?.amountG || targetDoseG;

  // 30 days consistency
  let takenCount30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const dStr = toLocalDateString(d);
    if (creatineLogs[dStr]?.taken) {
      takenCount30++;
    }
  }

  // Non-punishing streak calculation:
  // If not taken today yet, check yesterday to avoid dropping streak to 0 in the morning
  let streak = 0;
  const checkDate = new Date(todayDate);
  if (!takenToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (streak < 365) {
    const dStr = toLocalDateString(checkDate);
    if (creatineLogs[dStr]?.taken) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  const consistencyPct = Math.round((takenCount30 / 30) * 100);

  let saturationLevel: 'Full' | 'Maintaining' | 'Building' | 'Low' = 'Low';
  if (takenCount30 >= 25) saturationLevel = 'Full';
  else if (takenCount30 >= 18) saturationLevel = 'Maintaining';
  else if (takenCount30 >= 8) saturationLevel = 'Building';

  let message = 'Start building your streak today.';
  if (takenCount30 >= 28) {
    message = `${takenCount30} / 30 days. Cellular saturation optimal.`;
  } else if (takenCount30 >= 20) {
    message = `${takenCount30} / 30 days. Solid consistency, journey continues.`;
  } else if (streak >= 5) {
    message = `${streak}-day streak! Keep muscles saturated.`;
  }

  return {
    takenToday,
    todayDoseG,
    takenCount30,
    totalDays30: 30,
    consistencyPct,
    currentStreak: streak,
    message,
    saturationLevel,
  };
}

// ── 3. Day Type (Training vs Rest) ───────────────────────────────────────────
export function getDayType(
  dateStr: string,
  workouts: WorkoutEntry[] = [],
  dayTypeOverrides: Record<string, DayType> = {}
): DayType {
  // If explicit override set by user, honor it
  if (dayTypeOverrides[dateStr]) {
    return dayTypeOverrides[dateStr];
  }

  // If a workout is logged for this date, it's a training day
  const hasWorkout = workouts.some((w) => w.date && w.date.startsWith(dateStr));
  if (hasWorkout) {
    return 'training';
  }

  // Default to training
  return 'training';
}

// ── 4. Daily Objectives System ───────────────────────────────────────────────
export interface DailyObjectiveItem {
  id: 'workout' | 'recovery' | 'water' | 'creatine' | 'protein' | 'weight';
  title: string;
  metricLabel: string;
  done: boolean;
  isRestBonus?: boolean;
}

export interface DailyObjectivesSummary {
  dayType: DayType;
  completedCount: number;
  totalCount: number;
  pct: number;
  allDone: boolean;
  statusMessage: string;
  objectives: DailyObjectiveItem[];
}

export function getDailyObjectives(params: {
  dateStr: string;
  dayType: DayType;
  workouts: WorkoutEntry[];
  waterMl: number;
  waterTargetMl: number;
  creatineLog?: CreatineLog;
  proteinG: number;
  proteinTargetG: number;
  weightEntry?: BodyMetricEntry | null;
  profileUnit?: 'kg' | 'lbs';
}): DailyObjectivesSummary {
  const {
    dateStr,
    dayType,
    workouts,
    waterMl,
    waterTargetMl,
    creatineLog,
    proteinG,
    proteinTargetG,
    weightEntry,
    profileUnit = 'kg',
  } = params;

  const hasWorkout = workouts.some((w) => w.date && w.date.startsWith(dateStr));
  const isRest = dayType === 'rest';

  const objectives: DailyObjectiveItem[] = [];

  // 1. Training or Recovery
  if (isRest) {
    objectives.push({
      id: 'recovery',
      title: 'Active Recovery & Mobility',
      metricLabel: 'Recovery Planned ✓',
      done: true,
      isRestBonus: true,
    });
  } else {
    objectives.push({
      id: 'workout',
      title: 'Planned Training Session',
      metricLabel: hasWorkout ? 'Session Complete ✓' : 'Pending',
      done: hasWorkout,
    });
  }

  // 2. Hydration
  const waterDone = waterMl >= waterTargetMl;
  objectives.push({
    id: 'water',
    title: 'Hydration Target',
    metricLabel: `${formatWaterLiters(waterMl)} / ${formatWaterLiters(waterTargetMl)}`,
    done: waterDone,
  });

  // 3. Creatine
  const creatineDone = !!creatineLog?.taken;
  objectives.push({
    id: 'creatine',
    title: 'Creatine Daily Dose',
    metricLabel: creatineDone ? `${creatineLog.amountG || 5}g Taken ✓` : 'Not Logged',
    done: creatineDone,
  });

  // 4. Protein Target
  const proteinDone = proteinTargetG > 0 ? proteinG >= proteinTargetG : proteinG >= 100;
  objectives.push({
    id: 'protein',
    title: 'Protein Intake',
    metricLabel: `${Math.round(proteinG)} / ${Math.round(proteinTargetG)} g`,
    done: proteinDone,
  });

  // 5. Bodyweight
  const weightDone = !!weightEntry;
  const displayBw = weightEntry
    ? profileUnit === 'lbs'
      ? `${Math.round(weightEntry.weightKg * 2.20462)} lbs`
      : `${Math.round(weightEntry.weightKg)} kg`
    : 'Log Today';
  objectives.push({
    id: 'weight',
    title: 'Log Morning Weight',
    metricLabel: weightDone ? `${displayBw} ✓` : 'Pending',
    done: weightDone,
  });

  const completedCount = objectives.filter((o) => o.done).length;
  const totalCount = objectives.length;
  const pct = Math.round((completedCount / totalCount) * 100);
  const allDone = completedCount === totalCount;

  let statusMessage = `${completedCount}/${totalCount} DAILY OBJECTIVES COMPLETE`;
  if (allDone) {
    statusMessage = isRest
      ? 'REST DAY ESSENTIALS 100% COMPLETE'
      : 'ALL DAILY OBJECTIVES COMPLETE';
  }

  return {
    dayType,
    completedCount,
    totalCount,
    pct,
    allDone,
    statusMessage,
    objectives,
  };
}

// ── 5. Next Best Action ──────────────────────────────────────────────────────
export type ActionType =
  | 'DRINK_WATER'
  | 'TAKE_CREATINE'
  | 'START_WORKOUT'
  | 'LOG_WEIGHT'
  | 'LOG_MEAL'
  | 'LOG_PROTEIN'
  | 'ALL_COMPLETE';

export interface NextBestActionInfo {
  type: ActionType;
  title: string;
  description: string;
  buttonLabel: string;
  amountMl?: number;
  proteinShortG?: number;
}

export function getNextBestAction(params: {
  nowHour?: number;
  dayType: DayType;
  hasTrainedToday: boolean;
  waterMl: number;
  waterTargetMl: number;
  creatineTaken: boolean;
  creatineTargetG: number;
  proteinG: number;
  proteinTargetG: number;
  hasLoggedWeight: boolean;
  activePlanName?: string;
  mealsCount?: number;
}): NextBestActionInfo {
  const {
    nowHour = new Date().getHours(),
    dayType,
    hasTrainedToday,
    waterMl,
    waterTargetMl,
    creatineTaken,
    proteinG,
    proteinTargetG,
    hasLoggedWeight,
    activePlanName,
    mealsCount = 0,
  } = params;

  // 1. Morning weight (early morning priority before eating)
  if (!hasLoggedWeight && nowHour < 12) {
    return {
      type: 'LOG_WEIGHT',
      title: 'Log Morning Weight',
      description: 'Track bodyweight under consistent morning conditions.',
      buttonLabel: 'LOG WEIGHT',
    };
  }

  // 2. Training Session (if scheduled training day and not yet logged)
  if (dayType === 'training' && !hasTrainedToday) {
    return {
      type: 'START_WORKOUT',
      title: activePlanName ? `Today's Workout: ${activePlanName}` : "Start Today's Workout",
      description: 'Hit the gym and push your compound progression.',
      buttonLabel: 'START WORKOUT',
    };
  }

  // 3. Post-workout nutrition / meal logging
  if (hasTrainedToday && mealsCount === 0) {
    return {
      type: 'LOG_MEAL',
      title: "Log Today's Meal",
      description: 'Scan or log your meal to fuel recovery and muscle protein synthesis.',
      buttonLabel: 'LOG MEAL',
    };
  }

  // 4. Creatine consistency
  if (!creatineTaken) {
    return {
      type: 'TAKE_CREATINE',
      title: 'Log Creatine',
      description: 'Daily consistency sustains muscle phosphocreatine stores.',
      buttonLabel: 'LOG CREATINE',
    };
  }

  // 5. Hydration check (if water is behind target)
  const remainingMl = Math.max(0, waterTargetMl - waterMl);
  if (remainingMl > 250) {
    const quickDrink = remainingMl >= 500 ? 500 : 250;
    return {
      type: 'DRINK_WATER',
      title: `Drink ${quickDrink} ml water`,
      description: `${formatWaterLiters(waterMl)} / ${formatWaterLiters(waterTargetMl)} (${formatWaterLiters(remainingMl)} remaining)`,
      buttonLabel: `+${quickDrink} ML`,
      amountMl: quickDrink,
    };
  }

  // 6. Protein shortfall
  const proteinShort = Math.round(proteinTargetG - proteinG);
  if (proteinShort > 20) {
    return {
      type: 'LOG_PROTEIN',
      title: `Fuel up: ${proteinShort}g protein remaining`,
      description: `Target ${Math.round(proteinTargetG)}g protein for optimal recovery.`,
      buttonLabel: 'LOG FOOD',
      proteinShortG: proteinShort,
    };
  }

  // 7. Everything completed!
  return {
    type: 'ALL_COMPLETE',
    title: "Review Today's Progress",
    description: 'All core essentials complete for today. Rest up for tomorrow.',
    buttonLabel: 'VIEW PROGRESS',
  };
}

// ── 6. Weekly Consistency Breakdown ──────────────────────────────────────────
export interface WeeklyHabitsConsistency {
  workoutScore: { done: number; total: number };
  hydrationScore: { done: number; total: number };
  creatineScore: { done: number; total: number };
  proteinScore: { done: number; total: number };
  overallConsistencyPct: number;
}

export function getWeeklyHabitsConsistency(params: {
  todayDate?: Date;
  workouts: WorkoutEntry[];
  waterLogs: Record<string, number>;
  waterTargetMl: number;
  creatineLogs: Record<string, CreatineLog>;
  meals: MealEntry[];
  proteinTargetG: number;
  plannedDaysPerWeek?: number;
}): WeeklyHabitsConsistency {
  const {
    todayDate = new Date(),
    workouts,
    waterLogs,
    waterTargetMl,
    creatineLogs,
    meals,
    proteinTargetG = 140,
    plannedDaysPerWeek = 4,
  } = params;

  let workoutDone = 0;
  let hydrationDone = 0;
  let creatineDone = 0;
  let proteinDone = 0;

  // Evaluate the last 7 calendar days
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const dStr = toLocalDateString(d);

    if (workouts.some((w) => w.date && w.date.startsWith(dStr))) {
      workoutDone++;
    }
    if ((waterLogs[dStr] || 0) >= waterTargetMl * 0.85) {
      hydrationDone++;
    }
    if (creatineLogs[dStr]?.taken) {
      creatineDone++;
    }

    const dayMeals = meals.filter((m) => m.date && m.date.startsWith(dStr));
    const dayProtein = dayMeals.reduce((acc, m) => {
      return acc + (m.foods?.reduce((p, f) => p + (f.proteinG || 0), 0) || 0);
    }, 0);
    if (dayProtein >= proteinTargetG * 0.85) {
      proteinDone++;
    }
  }

  // Weighted overall consistency percentage
  const workoutRatio = Math.min(1, workoutDone / Math.max(1, plannedDaysPerWeek));
  const hydRatio = hydrationDone / 7;
  const creatRatio = creatineDone / 7;
  const protRatio = proteinDone / 7;

  const overall = Math.round(
    ((workoutRatio * 0.35 + hydRatio * 0.25 + creatRatio * 0.2 + protRatio * 0.2) * 100)
  );

  return {
    workoutScore: { done: Math.min(workoutDone, plannedDaysPerWeek), total: plannedDaysPerWeek },
    hydrationScore: { done: hydrationDone, total: 7 },
    creatineScore: { done: creatineDone, total: 7 },
    proteinScore: { done: proteinDone, total: 7 },
    overallConsistencyPct: Math.min(100, overall),
  };
}

// ── 7. Monthly Ascension Report ──────────────────────────────────────────────
export interface MonthlyAscensionReport {
  monthName: string;
  year: number;
  totalWorkouts: number;
  prsBrokenCount: number;
  totalVolumeTonnes: number;
  waterGoalPct: number;
  creatineAdherenceStr: string;
  bestStreakDays: number;
  strongerLifts: { exercise: string; deltaKg: number }[];
  shareableSummary: string;
}

export type MonthlyProgressReport = MonthlyAscensionReport;
export const getMonthlyProgressReport = getMonthlyAscensionReport;

export function getMonthlyAscensionReport(params: {
  year: number;
  month: number; // 0-11
  workouts: WorkoutEntry[];
  prs: PersonalRecord[];
  waterLogs: Record<string, number>;
  waterTargetMl: number;
  creatineLogs: Record<string, CreatineLog>;
}): MonthlyAscensionReport {
  const { year, month, workouts, prs, waterLogs, waterTargetMl, creatineLogs } = params;

  const dateObj = new Date(year, month, 1);
  const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Workouts in this month
  const monthWorkouts = workouts.filter((w) => w.date && w.date.startsWith(monthPrefix));
  const totalWorkouts = monthWorkouts.length;

  // PRs broken in this month
  const monthPRs = prs.filter((p) => p.date && p.date.startsWith(monthPrefix));
  const prsBrokenCount = monthPRs.length;

  // Total volume lifted (Tonnes)
  let totalVolumeKg = 0;
  for (const w of monthWorkouts) {
    for (const ex of w.exercises || []) {
      for (const s of ex.sets || []) {
        const wtKg = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
        totalVolumeKg += wtKg * (s.reps || 0);
      }
    }
  }
  const totalVolumeTonnes = Number((totalVolumeKg / 1000).toFixed(1));

  // Water goal %
  let waterDaysHit = 0;
  let creatineDaysTaken = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    if ((waterLogs[dStr] || 0) >= waterTargetMl * 0.85) {
      waterDaysHit++;
    }
    if (creatineLogs[dStr]?.taken) {
      creatineDaysTaken++;
    }
  }
  const waterGoalPct = Math.round((waterDaysHit / daysInMonth) * 100);
  const creatineAdherenceStr = `${creatineDaysTaken} / ${daysInMonth}`;

  // Calculate top lift gains in this month
  const exerciseGains: Record<string, { min: number; max: number }> = {};
  for (const pr of monthPRs) {
    const ex = pr.exercise;
    if (!exerciseGains[ex]) {
      exerciseGains[ex] = { min: pr.oneRepMax, max: pr.oneRepMax };
    } else {
      if (pr.oneRepMax < exerciseGains[ex].min) exerciseGains[ex].min = pr.oneRepMax;
      if (pr.oneRepMax > exerciseGains[ex].max) exerciseGains[ex].max = pr.oneRepMax;
    }
  }

  const strongerLifts = Object.entries(exerciseGains)
    .map(([exercise, g]) => ({
      exercise,
      deltaKg: Math.round(g.max - g.min),
    }))
    .filter((l) => l.deltaKg > 0)
    .slice(0, 3);

  // Generate shareable markdown text
  const shareableSummary = `⚡ ASCEND ${monthName.toUpperCase()} REPORT
━━━━━━━━━━━━━━━━━━
🏋️ Workouts: ${totalWorkouts} sessions
🏆 PRs Set: ${prsBrokenCount} records
📊 Volume: ${totalVolumeTonnes} Tonnes
💧 Hydration Goal: ${waterGoalPct}%
🥤 Creatine: ${creatineAdherenceStr} days
${strongerLifts.map((l) => `📈 ${l.exercise}: +${l.deltaKg} kg 1RM`).join('\n')}
━━━━━━━━━━━━━━━━━━
Built with discipline on ASCEND.`;

  return {
    monthName,
    year,
    totalWorkouts,
    prsBrokenCount,
    totalVolumeTonnes,
    waterGoalPct,
    creatineAdherenceStr,
    bestStreakDays: Math.min(daysInMonth, creatineDaysTaken),
    strongerLifts,
    shareableSummary,
  };
}

// ── 8. Daily Timeline Generator ──────────────────────────────────────────────
export function buildDailyTimeline(params: {
  dateStr: string;
  workouts: WorkoutEntry[];
  waterBatches: WaterLogBatch[];
  creatineLog?: CreatineLog;
  meals: MealEntry[];
  weightEntry?: BodyMetricEntry | null;
  profileUnit?: 'kg' | 'lbs';
}): DailyTimelineEvent[] {
  const {
    dateStr,
    workouts,
    waterBatches,
    creatineLog,
    meals,
    weightEntry,
    profileUnit = 'kg',
  } = params;

  const events: DailyTimelineEvent[] = [];

  // Morning bodyweight
  if (weightEntry) {
    const disp =
      profileUnit === 'lbs'
        ? `${Math.round(weightEntry.weightKg * 2.20462)} lbs`
        : `${Math.round(weightEntry.weightKg)} kg`;
    events.push({
      id: `weight_${weightEntry.id}`,
      time: '07:30',
      type: 'weight',
      title: 'Bodyweight Logged',
      detail: `${disp} recorded`,
      completed: true,
    });
  }

  // Creatine
  if (creatineLog?.taken) {
    let tStr = '08:15';
    if (creatineLog.timestamp) {
      try {
        const d = new Date(creatineLog.timestamp);
        tStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {}
    }
    events.push({
      id: `creatine_${dateStr}`,
      time: tStr,
      type: 'creatine',
      title: 'Creatine Intake',
      detail: `${creatineLog.amountG || 5}g logged`,
      completed: true,
    });
  }

  // Water batches
  for (const b of waterBatches || []) {
    let tStr = '10:00';
    if (b.timestamp) {
      try {
        const d = new Date(b.timestamp);
        tStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {}
    }
    events.push({
      id: b.id,
      time: tStr,
      type: 'water',
      title: `Hydration +${b.amountMl} ml`,
      detail: `${b.amountMl} ml water consumed`,
      completed: true,
    });
  }

  // Workouts
  const dayWorkouts = workouts.filter((w) => w.date && w.date.startsWith(dateStr));
  for (const w of dayWorkouts) {
    events.push({
      id: w.id,
      time: '11:30',
      type: 'workout',
      title: 'Workout Completed',
      detail: `${w.exercises?.length || 0} exercises completed`,
      completed: true,
    });
  }

  // Meals
  const dayMeals = meals.filter((m) => m.date && m.date.startsWith(dateStr));
  for (const m of dayMeals) {
    const mealProtein = Math.round(
      m.foods?.reduce((p, f) => p + (f.proteinG || 0), 0) || 0
    );
    events.push({
      id: m.id,
      time: '13:00',
      type: 'meal',
      title: m.name || 'Meal Logged',
      detail: `${mealProtein}g protein`,
      completed: true,
    });
  }

  // Sort by time ascending
  events.sort((a, b) => a.time.localeCompare(b.time));

  return events;
}
