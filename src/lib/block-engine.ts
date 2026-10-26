/**
 * block-engine.ts — the coach's block planner (PR-B, COACH_DESIGN §4).
 *
 * Pure + deterministic (D1): same inputs → identical proposal. The
 * generator starts from the existing goal-adaptive split templates,
 * then does what a coach does on top of a skeleton:
 *   - fits the split + weekdays to the athlete's days, session length
 *     and measured recovery (PR-A), not to a generic calendar;
 *   - removes/replaces anything in an injury-banned or pain-flagged
 *     movement family (D6), saying what was left out and why;
 *   - adds weak-point work where the athlete's own log is flattest,
 *     with the numbers quoted;
 *   - prescribes real rep ranges, RPE targets and starting loads from
 *     estimated 1RMs where they exist (conservative defaults, labelled,
 *     where they do not);
 *   - writes a per-lift progression scheme (double progression, the
 *     athlete's own observed increment when known) that Policy v0
 *     consumes for coach-managed lifts only (D2).
 *
 * Nothing here touches the store. A proposal is inert until the user
 * approves it (D3) and the store materializes it.
 */
import type {
  AthleteGoal,
  DayOfWeek,
  PersonalRecord,
  PlannedExercise,
  PlannedWorkout,
  Unit,
  WeeklySchedule,
  WorkoutEntry,
} from './types';
import {
  adaptSplitForEquipment,
  estimateSessionMinutes,
  getFilteredSubstitutes,
  getGoalAdaptiveSplitTemplates,
  getInjuryBannedFamilies,
  getPlanBannedJoints,
  getMovementFamily,
  isExerciseJointBanned,
  isPlaceholderSubstitute,
  normalizeExerciseKey,
  type EquipmentAccess,
} from './workout-engine';
import {
  EXERCISE_LIBRARY,
  findLibraryExercise,
  getExerciseMuscle,
  getExerciseSecondaryMuscles,
  resolveExerciseMuscle,
  type MovementFamily,
  type MuscleGroup,
} from './exercise-library';
import { estimateE1rmKg, mainCompoundKey, roundToLoadable } from './percent-1rm';
import { canonicalizeExerciseName } from './workout-outcome-evidence';
import { getMondayOfWeek, parseLocalDate } from './formatters';
import { getWorkoutBodyParts } from './workout-schedule';
import type { AthleteModel } from './athlete-model';
import type { StallFlag } from './coach-engine';
import type { BlockIntake } from './block-intake';

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

export type BlockFocus = 'strength' | 'hypertrophy' | 'fat_loss' | 'maintenance';
export type BlockWeekType = 'build' | 'deload' | 'test';
export type NutritionPhase = 'deficit' | 'surplus' | 'maintenance';

export interface ProgressionScheme {
  /** Evidence-layer canonical key (trim + lowercase). */
  exerciseKey: string;
  displayName: string;
  kind: 'double_progression' | 'bodyweight';
  repMin: number;
  repMax: number;
  /** Load step in kg (per hand for dumbbells). Null for bodyweight work. */
  incrementKg: number | null;
  incrementSource: 'athlete' | 'equipment_default' | null;
  /** The assumption, in plain English, with its numbers (D4). */
  assumption: string;
  /** Plateau deload: dates < holdUntil + 7d evaluate as a deload week. */
  holdUntil?: string;
}

export interface BlockDayProposal {
  weekday: DayOfWeek;
  label: string;
  planId: string;
  planName: string;
  exercises: PlannedExercise[];
  /** Why each exercise is here — keyed by canonical exercise key. */
  whyByExercise: Record<string, string>;
  estimatedMinutes: number;
}

export interface BlockProposal {
  id: string;
  name: string;
  focus: BlockFocus;
  focusReason: string;
  summary: string;
  weeks: { index: number; type: BlockWeekType }[];
  days: BlockDayProposal[];
  schemes: ProgressionScheme[];
  startMonday: string;
  intake: BlockIntake;
  warnings: string[];
}

export interface ActiveCoachBlock {
  proposalId: string;
  name: string;
  focus: BlockFocus;
  planIds: string[];
  startMonday: string;
  weeks: { index: number; type: BlockWeekType }[];
  schemes: ProgressionScheme[];
  intake: BlockIntake;
  status: 'active' | 'completed';
  createdOn: string;
}

export interface AdoptedPlanState {
  planId: string;
  adoptedOn: string;
  schemes: ProgressionScheme[];
}

export type PlateauChange =
  | { type: 'variation'; newName: string; sets: number; reps: number }
  | { type: 'rep_scheme'; repMin: number; repMax: number }
  | { type: 'deload_lift'; weeks: 1 }
  | { type: 'technique_reset'; loadFactor: 0.9 };

export interface PlateauProposal {
  id: string;
  exerciseKey: string;
  displayName: string;
  planId: string;
  suggestion: StallFlag['suggestion'];
  /** Stall evidence with the real numbers (D4). */
  evidence: string;
  change: PlateauChange;
  changeText: string;
  /** Snapshot for the stale-check at apply time. */
  expected: { targetWeight?: number; targetReps?: number };
  status: 'pending' | 'applied' | 'dismissed';
  createdOn: string;
}

export interface CoachBlocksState {
  pendingProposal: BlockProposal | null;
  activeBlock: ActiveCoachBlock | null;
  pastBlocks: ActiveCoachBlock[];
  adoptedPlans: Record<string, AdoptedPlanState>;
  plateauProposals: PlateauProposal[];
}

export function getInitialCoachBlocksState(): CoachBlocksState {
  return {
    pendingProposal: null,
    activeBlock: null,
    pastBlocks: [],
    adoptedPlans: {},
    plateauProposals: [],
  };
}

export interface BlockEngineInput {
  intake: BlockIntake;
  athleteModel: AthleteModel | null;
  prs: PersonalRecord[];
  workouts: WorkoutEntry[];
  existingPlans: PlannedWorkout[];
  unit: Unit;
  todayStr: string;
  nutritionPhase?: NutritionPhase | null;
  bodyweightKg?: number;
  ageYears?: number;
  dislikedExercises?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Small deterministic helpers
// ─────────────────────────────────────────────────────────────────────────────

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function dateStrOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function addDaysStr(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return dateStrOf(d);
}

function daysBetweenStr(from: string, to: string): number {
  const a = parseLocalDate(from).getTime();
  const b = parseLocalDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

function mondayOfStr(dateStr: string): string {
  return dateStrOf(getMondayOfWeek(parseLocalDate(dateStr)));
}

/** The Monday this block starts on: today if today is Monday, else next Monday. */
export function blockStartMonday(todayStr: string): string {
  const monday = mondayOfStr(todayStr);
  return monday === todayStr ? todayStr : addDaysStr(monday, 7);
}

const WEEKDAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const FOCUS_LABEL: Record<BlockFocus, string> = {
  strength: 'Strength',
  hypertrophy: 'Muscle',
  fat_loss: 'Fat-Loss',
  maintenance: 'Maintenance',
};

// ─────────────────────────────────────────────────────────────────────────────
// Focus, structure, split
// ─────────────────────────────────────────────────────────────────────────────

function resolveFocus(
  goal: AthleteGoal,
  nutritionPhase: NutritionPhase | null | undefined
): { focus: BlockFocus; reason: string } {
  switch (goal) {
    case 'get_stronger':
      return {
        focus: 'strength',
        reason: 'Your goal is strength, so the block is built around heavy main lifts with a test week to prove the progress.',
      };
    case 'build_muscle':
      // NOTE: a build_muscle+deficit branch used to live here, but the
      // store only ever passes nutritionPhase for lose_fat — the branch
      // was unreachable dead code. Deleted rather than kept "just in
      // case": a branch that cannot fire is a branch nobody tests.
      return {
        focus: 'hypertrophy',
        reason: 'Your goal is muscle, so the block runs moderate loads in the 6–15 rep ranges where your logged progress has come from.',
      };
    case 'lose_fat':
      return {
        focus: 'fat_loss',
        reason: 'Your goal is fat loss, so the block keeps heavy compounds to protect muscle and trims accessory volume you cannot recover from in a deficit.',
      };
    case 'stamina':
      return {
        focus: 'maintenance',
        reason: 'Your goal is stamina, so strength work is held at maintenance while the conditioning pieces in your week do the progressing.',
      };
    default:
      return {
        focus: 'maintenance',
        reason: 'Your goal is general fitness, so the block balances strength and muscle work without chasing one number.',
      };
  }
}

function blockWeeks(daysPerWeek: number, experience: string): BlockWeekType[] {
  if (experience === 'beginner' || daysPerWeek <= 2) {
    return ['build', 'build', 'build', 'deload', 'test'];
  }
  return ['build', 'build', 'build', 'build', 'deload', 'test'];
}

interface SkeletonDay {
  label: string;
  exercises: PlannedExercise[];
}

function dedupeExercises(exercises: PlannedExercise[]): PlannedExercise[] {
  const seen = new Set<string>();
  const out: PlannedExercise[] = [];
  for (const ex of exercises) {
    const key = normalizeExerciseKey(ex.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ex);
  }
  return out;
}

function mergeFullBody(a: PlannedExercise[], b: PlannedExercise[]): PlannedExercise[] {
  const all = [...a, ...b];
  const mains = all.filter((e) => mainCompoundKey(e.name));
  const rest = all.filter((e) => !mainCompoundKey(e.name));
  return dedupeExercises([...mains, ...rest]);
}

function classifyForPpl(ex: PlannedExercise): 'push' | 'pull' | 'legs' {
  const family = getMovementFamily(ex.name);
  if (family === 'horizontal_push' || family === 'vertical_push') return 'push';
  if (family === 'horizontal_pull' || family === 'vertical_pull') return 'pull';
  if (family === 'squat' || family === 'hinge' || family === 'carry' || family === 'core') {
    return 'legs';
  }
  const muscle = getExerciseMuscle(ex.name);
  if (muscle === 'Back') return 'pull';
  if (muscle === 'Legs' || muscle === 'Core' || muscle === 'Conditioning') return 'legs';
  if (muscle === 'Arms') return /curl|pull|row/i.test(ex.name) ? 'pull' : 'push';
  return 'push'; // Chest / Shoulders
}

/** Compose the week's day skeletons from the goal templates (§4.2). */
function composeSkeletons(templates: PlannedWorkout[], daysPerWeek: number): SkeletonDay[] {
  const byIndex = (i: number): PlannedExercise[] => templates[i]?.exercises ?? [];
  const nameOf = (i: number, fallback: string) => templates[i]?.name ?? fallback;
  switch (daysPerWeek) {
    case 2:
      return [
        { label: 'Full Body A', exercises: mergeFullBody(byIndex(0), byIndex(1)) },
        { label: 'Full Body B', exercises: mergeFullBody(byIndex(2), byIndex(3)) },
      ];
    case 3:
      return [
        { label: 'Full Body', exercises: mergeFullBody(byIndex(0), byIndex(1)) },
        { label: nameOf(2, 'Upper B'), exercises: byIndex(2) },
        { label: nameOf(3, 'Lower B'), exercises: byIndex(3) },
      ];
    case 5:
      return [
        { label: nameOf(0, 'Upper A'), exercises: byIndex(0) },
        { label: nameOf(1, 'Lower A'), exercises: byIndex(1) },
        { label: nameOf(2, 'Upper B'), exercises: byIndex(2) },
        { label: nameOf(3, 'Lower B'), exercises: byIndex(3) },
        { label: 'Weak Points', exercises: [] }, // filled by the weak-point pass
      ];
    case 6: {
      const buckets: Record<'push' | 'pull' | 'legs', PlannedExercise[][]> = {
        push: [[], []],
        pull: [[], []],
        legs: [[], []],
      };
      templates.forEach((plan, pi) => {
        // A-variants are templates 0–1 (Upper A / Lower A); B-variants 2–3.
        const variant = pi >= 2 ? 1 : 0;
        for (const ex of plan.exercises ?? []) {
          buckets[classifyForPpl(ex)][variant].push(ex);
        }
      });
      return [
        { label: 'Push A', exercises: dedupeExercises(buckets.push[0]) },
        { label: 'Pull A', exercises: dedupeExercises(buckets.pull[0]) },
        { label: 'Legs A', exercises: dedupeExercises(buckets.legs[0]) },
        { label: 'Push B', exercises: dedupeExercises(buckets.push[1]) },
        { label: 'Pull B', exercises: dedupeExercises(buckets.pull[1]) },
        { label: 'Legs B', exercises: dedupeExercises(buckets.legs[1]) },
      ];
    }
    default: // 4
      return [
        { label: nameOf(0, 'Upper A'), exercises: byIndex(0) },
        { label: nameOf(1, 'Lower A'), exercises: byIndex(1) },
        { label: nameOf(2, 'Upper B'), exercises: byIndex(2) },
        { label: nameOf(3, 'Lower B'), exercises: byIndex(3) },
      ];
  }
}

const WEEKDAY_CANDIDATES: Record<number, DayOfWeek[][]> = {
  2: [
    ['monday', 'thursday'],
    ['tuesday', 'friday'],
    ['monday', 'friday'],
    ['wednesday', 'saturday'],
  ],
  3: [
    ['monday', 'wednesday', 'friday'],
    ['tuesday', 'thursday', 'saturday'],
    ['monday', 'wednesday', 'saturday'],
  ],
  4: [
    ['monday', 'tuesday', 'thursday', 'friday'],
    ['monday', 'wednesday', 'thursday', 'saturday'],
    ['tuesday', 'wednesday', 'friday', 'saturday'],
  ],
  5: [
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    ['monday', 'tuesday', 'thursday', 'friday', 'saturday'],
  ],
  6: [['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']],
};

/**
 * Pick weekdays that respect measured recovery: days training the same
 * primary muscle should sit at least that muscle's recoveryDays apart
 * (wrapping around the week). The athlete's most-skipped day is avoided
 * when adherence data actually knows it. Deterministic: first best.
 */
function chooseWeekdays(
  dayMuscles: Set<MuscleGroup>[],
  athleteModel: AthleteModel | null
): { weekdays: DayOfWeek[]; reason: string } {
  const candidates = WEEKDAY_CANDIDATES[dayMuscles.length] ?? WEEKDAY_CANDIDATES[4];
  const recoveryByMuscle = new Map<MuscleGroup, number>();
  for (const row of athleteModel?.recovery ?? []) {
    recoveryByMuscle.set(row.muscle, row.recoveryDays.value);
  }
  const skipped = athleteModel?.adherence.mostSkippedDay ?? null;
  const skippedPenaltyApplies =
    !!athleteModel && athleteModel.adherence.plannedSessions >= 8 && !!skipped;

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const cand of candidates) {
    let score = 0;
    const idx = cand.map((d) => WEEKDAYS.indexOf(d));
    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        const shared = [...dayMuscles[i]].filter((m) => dayMuscles[j].has(m));
        if (shared.length === 0) continue;
        const gap = Math.min(idx[j] - idx[i], 7 - (idx[j] - idx[i]));
        for (const m of shared) {
          const need = recoveryByMuscle.get(m) ?? 2;
          if (gap < need) score += (need - gap) * 2;
        }
      }
    }
    if (skippedPenaltyApplies && skipped && cand.includes(skipped)) score += 3;
    if (score < bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  const measured = [...recoveryByMuscle.entries()].find(
    ([, v]) => v !== 2
  );
  const reason = measured
    ? `Days are spaced around your measured recovery — your ${measured[0].toLowerCase()} work historically needs about ${measured[1]} days before you are back at your best.`
    : 'Days are spread across the week so the same muscles are not trained on back-to-back days.';
  return { weekdays: best, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prescription normalization + schemes
// ─────────────────────────────────────────────────────────────────────────────

type ExerciseRole = 'main' | 'secondary' | 'accessory';

function roleOf(name: string): ExerciseRole {
  if (mainCompoundKey(name)) return 'main';
  const item = findLibraryExercise(name);
  if (item && (item.defaultReps ?? 99) >= 12) return 'accessory';
  if (/lateral raise|front raise|rear delt|face pull|curl|kickback|pushdown|extension|skull|calf|fly|shrug/i.test(name)) {
    return 'accessory';
  }
  return 'secondary';
}

const REP_RANGES: Record<BlockFocus, Record<ExerciseRole, { min: number; max: number }>> = {
  strength: { main: { min: 4, max: 6 }, secondary: { min: 6, max: 8 }, accessory: { min: 10, max: 15 } },
  hypertrophy: { main: { min: 6, max: 10 }, secondary: { min: 8, max: 12 }, accessory: { min: 10, max: 15 } },
  fat_loss: { main: { min: 5, max: 8 }, secondary: { min: 8, max: 12 }, accessory: { min: 12, max: 15 } },
  maintenance: { main: { min: 5, max: 8 }, secondary: { min: 8, max: 12 }, accessory: { min: 10, max: 15 } },
};

const MAIN_LOAD_PCT: Record<BlockFocus, number> = {
  strength: 0.76,
  hypertrophy: 0.72,
  fat_loss: 0.72,
  maintenance: 0.7,
};

const EQUIPMENT_INCREMENT_KG = 2.5;

function incrementFor(
  name: string,
  athleteModel: AthleteModel | null
): { incrementKg: number | null; source: 'athlete' | 'equipment_default' | null; liftNote: string | null } {
  const item = findLibraryExercise(name);
  const isBodyweight = item?.isBodyweight === true || item?.equipment === 'Bodyweight';
  if (isBodyweight) return { incrementKg: null, source: null, liftNote: null };
  const lift = athleteModel?.lifts.find(
    (l) => l.key === canonicalizeExerciseName(name)
  );
  const typical = lift?.typicalIncrementKg;
  if (typical && typical.tier !== 'prior' && typeof typical.value === 'number' && typical.value > 0) {
    return {
      incrementKg: Math.round(typical.value * 2) / 2,
      source: 'athlete',
      liftNote: `you have added about ${typical.value} kg between good sessions on this lift across ${typical.n} sessions`,
    };
  }
  return { incrementKg: EQUIPMENT_INCREMENT_KG, source: 'equipment_default', liftNote: null };
}

function buildScheme(
  name: string,
  role: ExerciseRole,
  focus: BlockFocus,
  athleteModel: AthleteModel | null
): ProgressionScheme {
  const range = REP_RANGES[focus][role];
  const item = findLibraryExercise(name);
  const isBodyweight = item?.isBodyweight === true || item?.equipment === 'Bodyweight';
  const inc = incrementFor(name, athleteModel);
  const assumption = isBodyweight
    ? 'Bodyweight work progresses by reps first, then by a harder variation — no load step applies.'
    : inc.source === 'athlete'
      ? `Double progression in the ${range.min}–${range.max} rep range; when every set reaches ${range.max}, add ${inc.incrementKg} kg — ${inc.liftNote}.`
      : `Double progression in the ${range.min}–${range.max} rep range; when every set reaches ${range.max}, add ${inc.incrementKg} kg (the standard step — revised as your sessions come in).`;
  return {
    exerciseKey: canonicalizeExerciseName(name),
    displayName: name,
    kind: isBodyweight ? 'bodyweight' : 'double_progression',
    repMin: range.min,
    repMax: range.max,
    incrementKg: inc.incrementKg,
    incrementSource: inc.source,
    assumption,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Weak points
// ─────────────────────────────────────────────────────────────────────────────

interface WeakMuscle {
  muscle: MuscleGroup;
  weeklySets: number;
  avgSlope: number | null;
  why: string;
}

function weeklySetsByMuscle(days: { exercises: PlannedExercise[] }[]): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>();
  for (const day of days) {
    for (const ex of day.exercises) {
      const primary = getExerciseMuscle(ex.name);
      counts.set(primary, (counts.get(primary) ?? 0) + (ex.targetSets || 0));
      for (const sec of getExerciseSecondaryMuscles(ex.name)) {
        counts.set(sec, (counts.get(sec) ?? 0) + (ex.targetSets || 0) * 0.5);
      }
    }
  }
  return counts;
}

function rankWeakMuscles(
  days: { exercises: PlannedExercise[] }[],
  athleteModel: AthleteModel | null
): WeakMuscle[] {
  const counts = weeklySetsByMuscle(days);
  const slopeByMuscle = new Map<MuscleGroup, number[]>();
  for (const lift of athleteModel?.lifts ?? []) {
    const muscle = resolveExerciseMuscle(lift.displayName);
    if (!muscle || muscle === 'Conditioning') continue;
    const slope = lift.slopeKgPerWeek.value;
    if (typeof slope === 'number') {
      const arr = slopeByMuscle.get(muscle) ?? [];
      arr.push(slope);
      slopeByMuscle.set(muscle, arr);
    }
  }
  const muscles: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
  return muscles
    .map((muscle) => {
      const slopes = slopeByMuscle.get(muscle) ?? [];
      const avgSlope =
        slopes.length > 0 ? slopes.reduce((a, b) => a + b, 0) / slopes.length : null;
      const weeklySets = counts.get(muscle) ?? 0;
      const why =
        avgSlope !== null
          ? `your ${muscle.toLowerCase()} lifts are progressing slowest in your log (about ${avgSlope.toFixed(1)} kg/week)`
          : `your ${muscle.toLowerCase()} work is the lightest in this week (${Math.round(weeklySets)} sets)`;
      return { muscle, weeklySets, avgSlope, why };
    })
    .sort((a, b) => {
      const scoreA = a.weeklySets - (a.avgSlope ?? 0) * 10;
      const scoreB = b.weeklySets - (b.avgSlope ?? 0) * 10;
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.muscle.localeCompare(b.muscle);
    });
}

/** Pick library exercises for a muscle that survive the athlete's constraints. */
function pickExercisesForMuscle(
  muscle: MuscleGroup,
  count: number,
  ctx: {
    equipment: EquipmentAccess;
    unit: Unit;
    experience: BlockIntake['experience'];
    limitations: string[];
    disliked: string[];
    bannedFamilies: Set<MovementFamily>;
    usedKeys: Set<string>;
  }
): PlannedExercise[] {
  const banned = getInjuryBannedFamilies(ctx.limitations);
  ctx.bannedFamilies.forEach((f) => banned.add(f));
  // Joint-aware filter (SIM-P1-01): a limitation bans every exercise
  // flagging that joint, not just its movement family. Plan-scoped:
  // lower_back excluded per ARJUN-1 (see getPlanBannedJoints).
  const bannedJoints = getPlanBannedJoints(ctx.limitations);
  const candidates = EXERCISE_LIBRARY.filter((item) => {
    if (item.muscle !== muscle && !item.secondaryMuscles.includes(muscle)) return false;
    if (ctx.usedKeys.has(normalizeExerciseKey(item.name))) return false;
    if (banned.has(item.movementPattern)) return false;
    if (isExerciseJointBanned(item.name, bannedJoints)) return false;
    if (ctx.experience === 'beginner' && item.difficulty === 'advanced') return false;
    return true;
  }).sort((a, b) => {
    const mainA = mainCompoundKey(a.name) ? 0 : 1;
    const mainB = mainCompoundKey(b.name) ? 0 : 1;
    if (mainA !== mainB) return mainA - mainB;
    return a.name.localeCompare(b.name);
  });

  const picked: PlannedExercise[] = [];
  const usedFamilies = new Set<MovementFamily>();
  for (const item of candidates) {
    if (picked.length >= count) break;
    if (picked.length > 0 && usedFamilies.has(item.movementPattern)) continue;
    // Survivability under the athlete's equipment, via the same adapter
    // the split goes through — a pick the adapter drops is not a pick.
    const probe: PlannedWorkout = {
      id: 'probe',
      name: 'probe',
      createdAt: '2026-01-01',
      exercises: [
        {
          name: item.name,
          targetSets: 3,
          targetReps: item.defaultReps ?? 10,
          targetWeight: item.defaultWeightKg,
          targetUnit: ctx.unit,
        },
      ],
    };
    const adapted = adaptSplitForEquipment([probe], ctx.equipment, ctx.unit, ctx.experience, ctx.disliked, {
      limitations: ctx.limitations,
    });
    const survivor = adapted[0]?.exercises[0];
    if (!survivor) continue;
    picked.push(survivor);
    usedFamilies.add(item.movementPattern);
  }
  return picked;
}

/** Pattern of a day, for the fill pass: the label when it names one
 *  (Push/Pull/Legs/Upper/Lower), otherwise the majority pattern of what
 *  survived on the day, otherwise full-body. */
function dayPatternForFill(
  label: string,
  exercises: PlannedExercise[]
): 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full' {
  const lower = label.toLowerCase();
  if (lower.startsWith('push')) return 'push';
  if (lower.startsWith('pull')) return 'pull';
  if (lower.startsWith('legs')) return 'legs';
  if (lower.startsWith('lower')) return 'lower';
  if (lower.startsWith('upper')) return 'upper';
  const counts = { push: 0, pull: 0, legs: 0 };
  for (const ex of exercises) counts[classifyForPpl(ex)]++;
  if (counts.push > 0 && counts.push >= counts.pull && counts.push >= counts.legs) return 'push';
  if (counts.pull > 0 && counts.pull >= counts.legs) return 'pull';
  if (counts.legs > 0) return 'legs';
  return 'full';
}

const FILL_MUSCLES: Record<
  'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full',
  MuscleGroup[]
> = {
  push: ['Chest', 'Shoulders', 'Arms'],
  pull: ['Back', 'Arms'],
  legs: ['Legs', 'Core'],
  upper: ['Chest', 'Back', 'Shoulders', 'Arms'],
  lower: ['Legs', 'Core'],
  full: ['Chest', 'Back', 'Legs', 'Shoulders', 'Core', 'Arms'],
};

// ─────────────────────────────────────────────────────────────────────────────
// The generator
// ─────────────────────────────────────────────────────────────────────────────

export function generateBlockProposal(input: BlockEngineInput): BlockProposal {
  const { intake, athleteModel, unit, todayStr } = input;
  const disliked = input.dislikedExercises ?? [];
  const warnings: string[] = [];
  const { focus, reason: focusReason } = resolveFocus(intake.goal, input.nutritionPhase);
  const weekTypes = blockWeeks(intake.daysPerWeek, intake.experience);
  const startMonday = blockStartMonday(todayStr);

  // 1) Skeleton from the existing goal templates, scaled to the athlete.
  const templates = getGoalAdaptiveSplitTemplates(intake.goal, unit, {
    bodyweightKg: input.bodyweightKg,
    experience: intake.experience,
    ageYears: input.ageYears,
  });
  let skeletons = composeSkeletons(templates, intake.daysPerWeek);

  // 2) Equipment + declared-limitation adaptation (existing machinery).
  const asPlans: PlannedWorkout[] = skeletons.map((s, i) => ({
    id: `skeleton_${i}`,
    name: s.label,
    createdAt: '2026-01-01',
    exercises: s.exercises,
  }));
  const adapted = adaptSplitForEquipment(asPlans, intake.equipment, unit, intake.experience, disliked, {
    limitations: intake.limitations,
  });
  skeletons = skeletons.map((s, i) => ({ label: s.label, exercises: adapted[i]?.exercises ?? [] }));

  // 3) Pain-flagged families (D6) + single recent reports (SIM-P1-03):
  //    nothing in a flagged family is programmed, even when no
  //    limitation string bans it — and a single deliberate "Hurts"
  //    report in the last 28 days keeps that exact lift out of the
  //    block too. Previously only a ≥2-day pattern did, so one bad
  //    session was re-programmed at held load. 'other'-family pain
  //    (e.g. lateral raises) is handled by the exact-key path, since
  //    flaggedFamilies excludes 'other' by construction.
  const flaggedFamilies = new Set<MovementFamily>(athleteModel?.pain.flaggedFamilies ?? []);
  const recentPainKeys = new Set<string>(athleteModel?.pain.recentPainExerciseKeys ?? []);
  const injuryBanned = getInjuryBannedFamilies(intake.limitations);
  if (flaggedFamilies.size > 0 || recentPainKeys.size > 0) {
    const bannedUnion = new Set<MovementFamily>([...injuryBanned, ...flaggedFamilies]);
    skeletons = skeletons.map((day) => {
      const kept: PlannedExercise[] = [];
      for (const ex of day.exercises) {
        const family = getMovementFamily(ex.name);
        const isFlagged = flaggedFamilies.has(family) && !injuryBanned.has(family);
        const isRecentPain = recentPainKeys.has(canonicalizeExerciseName(ex.name));
        if (!isFlagged && !isRecentPain) {
          kept.push(ex);
          continue;
        }
        const sub = getFilteredSubstitutes(ex.name, {
          equipment: intake.equipment,
          exclusions: disliked,
          avoidSameFamilyAs: ex.name,
          avoidJointsOf: ex.name,
        }).find((s) => !bannedUnion.has(getMovementFamily(s.name)) && !isPlaceholderSubstitute(s.name));
        if (sub) {
          kept.push({
            ...ex,
            name: sub.name,
            notes: `${ex.notes ? ex.notes + ' · ' : ''}Swapped from ${ex.name} — you have reported pain on this movement recently`,
          });
        } else {
          warnings.push(
            isFlagged
              ? `${ex.name} was left out — you have reported pain on ${family.replace('_', ' ')} movements recently and no safe alternative fits your equipment. Worth getting it checked if it keeps happening.`
              : `${ex.name} was left out — you reported pain on it recently and no safe alternative fits your equipment. Worth getting it checked if it keeps happening.`
          );
        }
      }
      return { label: day.label, exercises: kept };
    });
  }

  // 4) Weak-point work. The 5-day split gets a dedicated day; other
  //    splits get one accessory on the weakest muscle's day when it fits.
  const weak = rankWeakMuscles(skeletons, athleteModel);
  const weakWhy = new Map<string, string>(); // canonical key -> why
  const usedKeys = new Set<string>();
  for (const d of skeletons) for (const e of d.exercises) usedKeys.add(normalizeExerciseKey(e.name));
  const pickCtx = {
    equipment: intake.equipment,
    unit,
    experience: intake.experience,
    limitations: intake.limitations,
    disliked,
    bannedFamilies: flaggedFamilies,
    usedKeys,
  };
  if (intake.daysPerWeek === 5) {
    const day = skeletons[4];
    for (const w of weak.slice(0, 2)) {
      const picks = pickExercisesForMuscle(w.muscle, 2, pickCtx);
      for (const p of picks) {
        day.exercises.push(p);
        usedKeys.add(normalizeExerciseKey(p.name));
        weakWhy.set(
          canonicalizeExerciseName(p.name),
          `Weak-point work: ${w.why}, so this day gives it direct attention.`
        );
      }
    }
  } else if (weak.length > 0 && weak[0].weeklySets < 6) {
    const w = weak[0];
    const targetDay = skeletons.find((d) =>
      d.exercises.some((e) => getExerciseMuscle(e.name) === w.muscle)
    );
    if (targetDay) {
      const picks = pickExercisesForMuscle(w.muscle, 1, pickCtx);
      if (picks.length > 0) {
        const p = picks[0];
        const probe = { exercises: [...targetDay.exercises, p] };
        if (estimateSessionMinutes(probe) <= intake.sessionMinutes + 10) {
          targetDay.exercises.push(p);
          weakWhy.set(
            canonicalizeExerciseName(p.name),
            `Weak-point work: ${w.why}.`
          );
        }
      }
    }
  }

  // 5) Session-length budget — sets first, exercises last, never below
  //    the floor. The old code deleted accessories first, which is how
  //    a 5-exercise Upper A became 3 mains: the day kept its heavy
  //    lifts and lost everything that balanced it. Cutting a set saves
  //    ~2–4 minutes and keeps the movement; only when sets alone cannot
  //    fit the session does an exercise go — and never a main lift, a
  //    weak-point pick, or anything below the 4-exercise floor.
  const MIN_DAY_EXERCISES = 4;
  skeletons = skeletons.map((day) => {
    let exercises = [...day.exercises];
    const over = () => estimateSessionMinutes({ exercises }) > intake.sessionMinutes;
    if (over()) {
      const cutRole = (role: ExerciseRole) => {
        exercises = exercises.map((ex) =>
          roleOf(ex.name) === role && (ex.targetSets || 3) > 2
            ? { ...ex, targetSets: (ex.targetSets || 3) - 1 }
            : ex
        );
      };
      cutRole('accessory');
      if (over()) cutRole('secondary');
      if (over()) cutRole('main');
    }
    while (exercises.length > MIN_DAY_EXERCISES && over()) {
      const idx = [...exercises]
        .map((e, i) => ({ e, i }))
        .reverse()
        .find(
          ({ e }) =>
            !mainCompoundKey(e.name) && !weakWhy.has(canonicalizeExerciseName(e.name))
        )?.i;
      if (idx === undefined) break;
      exercises.splice(idx, 1);
    }
    return { label: day.label, exercises };
  });

  // 5b) Fill pass: any day below the floor gets pattern-matched work
  //    through the same filters as the weak-point pass (equipment probe,
  //    injury families + joints, beginner exclusion, disliked, no
  //    week-wide duplicates). This is what repairs the old 2-exercise
  //    days: PPL bucketing, adapter collisions, and pain swaps all
  //    shrink days, and nothing used to put anything back.
  const fillWhy = new Map<string, string>();
  skeletons = skeletons.map((day) => {
    if (day.exercises.length >= MIN_DAY_EXERCISES) return day;
    const pattern = dayPatternForFill(day.label, day.exercises);
    const muscles = FILL_MUSCLES[pattern];
    const exercises = [...day.exercises];
    let rotations = 0;
    while (exercises.length < MIN_DAY_EXERCISES && rotations < muscles.length * 2) {
      const muscle = muscles[rotations % muscles.length];
      rotations++;
      const picks = pickExercisesForMuscle(muscle, 1, pickCtx);
      if (picks.length === 0) continue;
      const p = picks[0];
      exercises.push(p);
      pickCtx.usedKeys.add(normalizeExerciseKey(p.name));
      fillWhy.set(
        canonicalizeExerciseName(p.name),
        `Added to round out this ${pattern} day — ${muscle.toLowerCase()} work that fits your equipment and limits.`
      );
    }
    if (exercises.length < MIN_DAY_EXERCISES) {
      warnings.push(
        exercises.length === 0
          ? `${day.label} came out empty after injuries, equipment, and session limits — it was left out of the block rather than programmed with work you cannot do.`
          : `${day.label} has only ${exercises.length} exercises after injuries, equipment, and session limits — fewer than the ${MIN_DAY_EXERCISES}-exercise floor. Add a movement you like, or widen the session length.`
      );
    }
    return { label: day.label, exercises };
  });

  // 5c) Still over budget at the floor: warn, don't gut the day.
  for (const day of skeletons) {
    const mins = estimateSessionMinutes({ exercises: day.exercises });
    if (day.exercises.length > 0 && mins > intake.sessionMinutes + 10) {
      warnings.push(
        `${day.label} runs about ${mins} minutes at your loads — longer than your ${intake.sessionMinutes}-minute session. The main lifts stay; trim accessories on the day if you are short on time.`
      );
    }
  }

  // 6) Weekdays fitted to recovery + adherence.
  const dayMuscles = skeletons.map(
    (d) => new Set(d.exercises.map((e) => getExerciseMuscle(e.name)))
  );
  const { weekdays, reason: weekdayReason } = chooseWeekdays(dayMuscles, athleteModel);

  // 7) Prescriptions + schemes + per-exercise rationale.
  // Entered top lifts (intake) outrank history estimates: they are the
  // athlete's own statement of current strength (§4.1).
  const topLiftByCompound = new Map<string, number>();
  for (const tl of intake.topLifts) {
    const compound = mainCompoundKey(tl.name);
    if (compound && tl.e1rmKg > 0) topLiftByCompound.set(compound, tl.e1rmKg);
  }
  const schemes: ProgressionScheme[] = [];
  const schemeByKey = new Map<string, ProgressionScheme>();
  const days: BlockDayProposal[] = skeletons.map((day, i) => {
    const whyByExercise: Record<string, string> = {};
    const exercises = day.exercises.map((ex) => {
      const role = roleOf(ex.name);
      const range = REP_RANGES[focus][role];
      const scheme = buildScheme(ex.name, role, focus, athleteModel);
      if (!schemeByKey.has(scheme.exerciseKey)) {
        schemeByKey.set(scheme.exerciseKey, scheme);
        schemes.push(scheme);
      }
      const compoundKey = mainCompoundKey(ex.name);
      const e1rm =
        (compoundKey ? topLiftByCompound.get(compoundKey) : undefined) ??
        estimateE1rmKg(ex.name, input.prs, input.workouts) ??
        (() => {
          const lift = athleteModel?.lifts.find(
            (l) => l.key === canonicalizeExerciseName(ex.name)
          );
          return lift && lift.bestE1rmKg > 0 ? lift.bestE1rmKg : null;
        })();
      let targetWeight = ex.targetWeight;
      if (e1rm && role !== 'accessory') {
        const pct = role === 'main' ? MAIN_LOAD_PCT[focus] : 0.68;
        const kg = e1rm * pct;
        targetWeight = roundToLoadable(unit === 'lbs' ? kg * 2.20462 : kg, unit);
      }
      const targetReps = Math.min(range.max, Math.max(range.min, ex.targetReps || range.min + 1));
      // Strength blocks run mains at 5 sets — the old flat 4-set cap
      // undercut the one goal whose whole point is heavy main-lift
      // volume. Other focuses keep 4; accessories/secondary keep 3.
      // Note: this caps but never raises — a trim-pass cut to 2 stays 2.
      const targetSets = Math.min(
        role === 'main' ? (focus === 'strength' ? 5 : 4) : 3,
        Math.max(2, ex.targetSets || 3)
      );
      const next: PlannedExercise = {
        ...ex,
        targetSets,
        targetReps,
        targetWeight,
        targetUnit: unit,
        targetRpe: 8,
      };
      const key = canonicalizeExerciseName(ex.name);
      const swapNote = /swapped from/i.test(ex.notes ?? '')
        ? (ex.notes ?? '').split('·').map((s) => s.trim()).find((s) => /swapped from/i.test(s))
        : undefined;
      if (weakWhy.has(key)) {
        whyByExercise[key] = weakWhy.get(key)!;
      } else if (fillWhy.has(key)) {
        whyByExercise[key] = fillWhy.get(key)!;
      } else if (swapNote) {
        whyByExercise[key] = `${swapNote} — it trains the same pattern within your limits.`;
      } else if (role === 'main') {
        whyByExercise[key] = e1rm
          ? `Main lift for your ${getExerciseMuscle(ex.name).toLowerCase()}. The load is set from your estimated 1RM of about ${Math.round(e1rm)} kg.`
          : `Main lift for your ${getExerciseMuscle(ex.name).toLowerCase()}. The starting load is a conservative default — week 1 calibrates it.`;
      } else {
        whyByExercise[key] = `${getExerciseMuscle(ex.name)} work to balance the day — ${targetSets} sets in the ${range.min}–${range.max} rep range.`;
      }
      return next;
    });
    return {
      weekday: weekdays[i],
      label: day.label,
      planId: '',
      planName: '',
      exercises,
      whyByExercise,
      estimatedMinutes: estimateSessionMinutes({ exercises }),
    };
  });

  // 8) Names (collision-safe) + ids.
  const blockName = `${FOCUS_LABEL[focus]} Block`;
  const existingNames = new Set(input.existingPlans.map((p) => p.name.trim().toLowerCase()));
  const proposalId = `block_${fnv1a(
    JSON.stringify({ intake, todayStr, focus })
  )}`;
  for (const day of days) {
    let planName = `${blockName} · ${day.label}`;
    let n = 2;
    while (existingNames.has(planName.trim().toLowerCase())) {
      planName = `${blockName} · ${day.label} (${n})`;
      n++;
    }
    existingNames.add(planName.trim().toLowerCase());
    day.planName = planName;
    day.planId = `${proposalId}_${day.weekday}`;
  }

  const weekWord = weekTypes.length;
  const summary =
    `${weekWord}-week ${FOCUS_LABEL[focus].toLowerCase()} block, ${intake.daysPerWeek} days a week. ` +
    `${focusReason} ${weekdayReason} ` +
    `Weeks 1–${weekTypes.indexOf('deload')} build, week ${weekTypes.indexOf('deload') + 1} is a deload, and the final week tests your main lifts. ` +
    (weak.length > 0 ? `Extra attention goes to your ${weak[0].muscle.toLowerCase()} — ${weak[0].why}.` : '');

  return {
    id: proposalId,
    name: blockName,
    focus,
    focusReason,
    summary,
    weeks: weekTypes.map((type, index) => ({ index: index + 1, type })),
    days,
    schemes,
    startMonday,
    intake,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Materialization (§4.3)
// ─────────────────────────────────────────────────────────────────────────────

export function materializeProposal(
  proposal: BlockProposal,
  existingPlans: PlannedWorkout[],
  schedule: WeeklySchedule,
  todayStr: string
): { plans: PlannedWorkout[]; schedule: WeeklySchedule; activeBlock: ActiveCoachBlock } {
  const liveDays = proposal.days.filter((day) => day.exercises.length > 0);
  const newPlans: PlannedWorkout[] = liveDays.map((day) => ({
    id: day.planId,
    name: day.planName,
    exercises: day.exercises,
    createdAt: `${todayStr}T12:00:00.000Z`,
    description: `Coach block · ${proposal.focus.replace('_', ' ')} · ${proposal.weeks.length} weeks`,
    goalTag: `${FOCUS_LABEL[proposal.focus]} Block`,
    coachBlockId: proposal.id,
  }));
  const nextSchedule: WeeklySchedule = { ...schedule };
  for (const day of liveDays) {
    nextSchedule[day.weekday] = {
      workoutPlanId: day.planId,
      bodyParts: getWorkoutBodyParts(day.exercises),
    };
  }
  const activeBlock: ActiveCoachBlock = {
    proposalId: proposal.id,
    name: proposal.name,
    focus: proposal.focus,
    planIds: newPlans.map((p) => p.id),
    startMonday: proposal.startMonday,
    weeks: proposal.weeks,
    schemes: proposal.schemes,
    intake: proposal.intake,
    status: 'active',
    createdOn: todayStr,
  };
  return { plans: [...existingPlans, ...newPlans], schedule: nextSchedule, activeBlock };
}

// ─────────────────────────────────────────────────────────────────────────────
// Managed-policy resolution (§4.5) + week types
// ─────────────────────────────────────────────────────────────────────────────

export function weekTypeForDate(
  block: Pick<ActiveCoachBlock, 'startMonday' | 'weeks'>,
  dateStr: string
): BlockWeekType {
  const days = daysBetweenStr(block.startMonday, dateStr);
  if (days < 0) return 'build';
  const idx = Math.floor(days / 7);
  if (idx >= block.weeks.length) return 'build'; // expired block: PR-C debrief closes it
  return block.weeks[idx].type;
}

export interface ManagedPolicyResolution {
  scheme: ProgressionScheme;
  weekType: BlockWeekType;
  origin: 'block' | 'adopted';
}

/**
 * The single lookup the store's Policy v0 wiring uses. Returns null for
 * anything not coach-managed — unmanaged lifts keep today's behaviour
 * byte-for-byte (D2).
 */
export function resolveManagedPolicy(
  blocks: CoachBlocksState,
  planId: string | null | undefined,
  exerciseName: string,
  dateStr: string
): ManagedPolicyResolution | null {
  if (!planId || !blocks) return null;
  const key = canonicalizeExerciseName(exerciseName);
  let schemes: ProgressionScheme[] | null = null;
  let weekType: BlockWeekType = 'build';
  let origin: 'block' | 'adopted' = 'adopted';

  const active = blocks.activeBlock;
  if (active && active.status === 'active' && active.planIds.includes(planId)) {
    schemes = active.schemes;
    weekType = weekTypeForDate(active, dateStr);
    origin = 'block';
  } else if (blocks.adoptedPlans && blocks.adoptedPlans[planId]) {
    schemes = blocks.adoptedPlans[planId].schemes;
    origin = 'adopted';
  }
  if (!schemes) return null;
  const scheme = schemes.find((s) => s.exerciseKey === key);
  if (!scheme) return null;
  // A plateau deload (holdUntil) turns this lift's week into a deload
  // week until the 7 days are up, whatever the block calendar says.
  if (scheme.holdUntil) {
    const until = daysBetweenStr(scheme.holdUntil, dateStr);
    if (until >= 0 && until < 7) weekType = 'deload';
  }
  return { scheme, weekType, origin };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adoption (§4.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive per-exercise schemes for an existing user plan WITHOUT changing
 * a single prescribed number: the rep range grows upward from the plan's
 * own target reps, and increments come from the athlete's history or the
 * equipment default — exactly the generator's rules, anchored to the
 * plan instead of a template.
 */
export function deriveAdoptionSchemes(
  plan: PlannedWorkout,
  athleteModel: AthleteModel | null
): ProgressionScheme[] {
  const out: ProgressionScheme[] = [];
  const seen = new Set<string>();
  for (const ex of plan.exercises ?? []) {
    const key = canonicalizeExerciseName(ex.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const isMain = !!mainCompoundKey(ex.name);
    const role: ExerciseRole = isMain ? 'main' : roleOf(ex.name);
    const base = buildScheme(ex.name, role, 'maintenance', athleteModel);
    const targetReps = ex.targetReps || base.repMin;
    const repMin = Math.max(1, targetReps);
    const repMax = Math.max(repMin, targetReps + (isMain ? 1 : 3));
    out.push({
      ...base,
      repMin,
      repMax,
      assumption:
        base.kind === 'bodyweight'
          ? base.assumption
          : `Adopted from your plan unchanged — progression runs ${repMin}–${repMax} reps from your current target, then adds ${base.incrementKg} kg. ${base.assumption}`,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plateau proposals (§4.6)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPlateauProposals(input: {
  stalls: StallFlag[];
  blocks: CoachBlocksState;
  /** planId per canonical exercise key for managed lifts. */
  planIdByExerciseKey: Record<string, string>;
  acknowledgedKeys: Set<string>;
  todayStr: string;
}): PlateauProposal[] {
  const { stalls, blocks, planIdByExerciseKey, acknowledgedKeys, todayStr } = input;
  const out: PlateauProposal[] = [];
  const existing = blocks.plateauProposals ?? [];
  for (const flag of stalls) {
    const key = canonicalizeExerciseName(flag.exercise);
    const planId = planIdByExerciseKey[key];
    if (!planId) continue; // unmanaged — the existing digest flow owns it
    if (acknowledgedKeys.has(key)) continue;
    const prior = existing.filter((p) => p.exerciseKey === key);
    if (prior.some((p) => p.status === 'pending')) continue; // one live proposal per lift
    if (prior.some((p) => p.status === 'dismissed' && p.suggestion === flag.suggestion)) {
      continue; // dismissal is remembered — never re-nag the same change (D3/§6.6)
    }
    let change: PlateauChange;
    let changeText: string;
    switch (flag.suggestion) {
      case 'variation':
        change = {
          type: 'variation',
          newName: flag.variationName ?? flag.exercise,
          sets: flag.variationSets ?? 3,
          reps: flag.variationReps ?? 8,
        };
        changeText = `Swap ${flag.exercise} for ${change.newName} (${change.sets}×${change.reps}) for the rest of this block.`;
        break;
      case 'rep_scheme':
        change = { type: 'rep_scheme', repMin: 8, repMax: 12 };
        changeText = `Move ${flag.exercise} to an 8–12 rep scheme at the same load — the stimulus changes without chasing weight.`;
        break;
      case 'deload':
        change = { type: 'deload_lift', weeks: 1 };
        changeText = `Give ${flag.exercise} one deload week — progression holds while the fatigue clears.`;
        break;
      default:
        change = { type: 'technique_reset', loadFactor: 0.9 };
        changeText = `Drop ${flag.exercise} by about 10% and rebuild clean reps — the reps have been inconsistent at this load.`;
    }
    out.push({
      id: `plateau_${fnv1a(`${key}|${flag.suggestion}|${todayStr}`)}`,
      exerciseKey: key,
      displayName: flag.exercise,
      planId,
      suggestion: flag.suggestion,
      evidence: `${flag.exercise} has not moved in ${flag.sessionsStalled} of the last ${flag.sessionsAnalyzed} sessions — best e1RM is holding at about ${Math.round(flag.peakE1rmKg)} kg (latest about ${Math.round(flag.lastE1rmKg)} kg). ${flag.explanation}`,
      change,
      changeText,
      expected: {},
      status: 'pending',
      createdOn: todayStr,
    });
  }
  return out;
}

/** Fill the stale-check snapshot from the plan as it stands right now. */
export function snapshotPlateauExpectations(
  proposals: PlateauProposal[],
  plans: PlannedWorkout[]
): PlateauProposal[] {
  return proposals.map((p) => {
    if (p.change.type !== 'variation' && p.change.type !== 'technique_reset') return p;
    const plan = plans.find((pl) => pl.id === p.planId);
    const ex = plan?.exercises.find((e) => canonicalizeExerciseName(e.name) === p.exerciseKey);
    if (!ex) return p;
    return { ...p, expected: { targetWeight: ex.targetWeight, targetReps: ex.targetReps } };
  });
}

/**
 * Apply an approved plateau proposal. Guarded like
 * validatePolicyDecisionApplication: identity resolution + a stale-check
 * against the snapshot — if the plan moved on since the proposal, the
 * proposal is stale and nothing is edited.
 */
export function applyPlateauProposalToPlan(
  plan: PlannedWorkout,
  schemes: ProgressionScheme[],
  proposal: PlateauProposal,
  todayStr: string
): { plan: PlannedWorkout; schemes: ProgressionScheme[] } | { error: string } {
  const idx = (plan.exercises ?? []).findIndex(
    (e) => canonicalizeExerciseName(e.name) === proposal.exerciseKey
  );
  if (idx < 0) return { error: 'exercise_not_found' };
  const ex = plan.exercises[idx];
  if (
    (proposal.change.type === 'variation' || proposal.change.type === 'technique_reset') &&
    (ex.targetWeight !== proposal.expected.targetWeight ||
      ex.targetReps !== proposal.expected.targetReps)
  ) {
    return { error: 'stale' };
  }
  const nextSchemes = schemes.map((s) => ({ ...s }));
  const schemeIdx = nextSchemes.findIndex((s) => s.exerciseKey === proposal.exerciseKey);
  const nextExercises = [...plan.exercises];

  switch (proposal.change.type) {
    case 'variation': {
      nextExercises[idx] = {
        ...ex,
        name: proposal.change.newName,
        targetSets: proposal.change.sets,
        targetReps: proposal.change.reps,
        targetWeight: undefined,
        notes: `${ex.notes ? ex.notes + ' · ' : ''}Coach plateau swap from ${ex.name} — new movement, start light and calibrate`,
      };
      if (schemeIdx >= 0) {
        const old = nextSchemes[schemeIdx];
        nextSchemes[schemeIdx] = {
          ...old,
          exerciseKey: canonicalizeExerciseName(proposal.change.newName),
          displayName: proposal.change.newName,
          repMin: Math.max(1, proposal.change.reps - 2),
          repMax: proposal.change.reps + 2,
        };
      }
      break;
    }
    case 'rep_scheme': {
      if (schemeIdx >= 0) {
        nextSchemes[schemeIdx] = {
          ...nextSchemes[schemeIdx],
          repMin: proposal.change.repMin,
          repMax: proposal.change.repMax,
        };
      }
      break;
    }
    case 'deload_lift': {
      if (schemeIdx >= 0) {
        nextSchemes[schemeIdx] = {
          ...nextSchemes[schemeIdx],
          holdUntil: mondayOfStr(todayStr) === todayStr ? todayStr : addDaysStr(mondayOfStr(todayStr), 7),
        };
      }
      break;
    }
    case 'technique_reset': {
      const w = ex.targetWeight;
      if (typeof w === 'number' && w > 0) {
        nextExercises[idx] = {
          ...ex,
          targetWeight: roundToLoadable(w * proposal.change.loadFactor, ex.targetUnit ?? 'kg'),
        };
      }
      if (schemeIdx >= 0) {
        const reps = ex.targetReps || nextSchemes[schemeIdx].repMin;
        nextSchemes[schemeIdx] = { ...nextSchemes[schemeIdx], repMin: reps, repMax: reps + 2 };
      }
      break;
    }
  }
  return { plan: { ...plan, exercises: nextExercises }, schemes: nextSchemes };
}

/** Map of canonical exercise key → owning planId for every managed lift. */
export function managedPlanIdByExerciseKey(
  blocks: CoachBlocksState,
  plans: PlannedWorkout[]
): Record<string, string> {
  const out: Record<string, string> = {};
  const planIds = new Set(plans.map((p) => p.id));
  const active = blocks.activeBlock;
  if (active && active.status === 'active') {
    for (const planId of active.planIds) {
      if (!planIds.has(planId)) continue;
      for (const s of active.schemes) out[s.exerciseKey] = planId;
    }
  }
  for (const [planId, adopted] of Object.entries(blocks.adoptedPlans ?? {})) {
    if (!planIds.has(planId)) continue;
    for (const s of adopted.schemes) {
      if (!(s.exerciseKey in out)) out[s.exerciseKey] = planId;
    }
  }
  return out;
}
