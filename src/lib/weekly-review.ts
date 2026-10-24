/**
 * weekly-review.ts — the coach's weekly review + debriefs (PR-C,
 * COACH_DESIGN §5). Pure + deterministic (D1).
 *
 * Three surfaces, one module:
 *   1. buildWeeklyReview — Mon–Sun aggregation of the week that just
 *      ended: adherence vs the schedule, tonnage vs the prior week,
 *      per-muscle volume, PRs, recovery vs the athlete's own baselines
 *      (PR-A), what the coach changed and why, ONE focus for next
 *      week (rule priority: safety → adherence → stall → progression
 *      → consistency), and next-week revisions AS PROPOSALS (D3).
 *   2. buildSessionDebrief — "Vs your block" lines for the post-
 *      workout modal: what changed vs plan and why + one cue.
 *   3. buildBlockDebrief — at block end: completion vs plan, per-main-
 *      lift e1RM change (first week vs test week), what the coach
 *      learned, and the hand-off to the next block.
 *
 * Honesty rules: an empty week produces a short, truthful review —
 * never filler; bodyweight tonnage uses the profile's bodyweight and
 * is skipped entirely without one (never a silent default); every
 * number quoted is computed from the inputs.
 */
import type {
  DayOfWeek,
  PersonalRecord,
  PlannedWorkout,
  Unit,
  WeeklySchedule,
  WorkoutEntry,
} from './types';
import { getMondayOfWeek, parseLocalDate } from './formatters';
import { getExerciseMuscle, getExerciseSecondaryMuscles } from './exercise-library';
import { calculateOneRepMax } from './strength-standards';
import { canonicalizeExerciseName } from './workout-outcome-evidence';
import { isSetCompleted } from './types';
import type { AthleteModel } from './athlete-model';
import type { ManualCheckin, StallFlag } from './coach-engine';
import type { LocalizedSentence } from './coach-i18n';
import type { TrainingDecisionRecord } from './training-decision-policy';
import {
  resolveManagedPolicy,
  weekTypeForDate,
  type ActiveCoachBlock,
  type CoachBlocksState,
} from './block-engine';
import { mainCompoundKey } from './percent-1rm';

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewFocusKind = 'safety' | 'adherence' | 'stall' | 'progression' | 'consistency';

export type RevisionProposal =
  | { kind: 'next_week_type'; text: string }
  | { kind: 'stall_change'; exerciseKey: string; text: string }
  | {
      kind: 'schedule_move';
      fromDay: DayOfWeek;
      toDay: DayOfWeek;
      planId: string;
      text: string;
      applied?: boolean;
    };

export interface WeeklyReview {
  weekMonday: string;
  weekSunday: string;
  sessionsPlanned: number;
  sessionsCompleted: number;
  missedDays: DayOfWeek[];
  tonnageKg: number;
  tonnageDeltaPct: number | null;
  volumeHighlights: { muscle: string; sets: number; deltaSets: number }[];
  prs: { exercise: string; detail: string }[];
  recoveryLines: string[];
  coachLines: string[];
  painEscalation: string | null;
  /** LIVE-P1-03: same escalation as a localizable struct (family ids, not display text). */
  painEscalationI18n?: LocalizedSentence | null;
  focus: {
    kind: ReviewFocusKind;
    headline: string;
    detail: string;
    /** LIVE-P1-03: same focus as localizable structs (rendered via coach-i18n). */
    headlineI18n?: LocalizedSentence;
    detailI18n?: LocalizedSentence;
  };
  revisions: RevisionProposal[];
  seen: boolean;
}

export interface WeeklyReviewInput {
  /** Any date inside the week to review (its Mon–Sun is used). */
  anyDateInWeek: string;
  workouts: WorkoutEntry[];
  plannedWorkouts: PlannedWorkout[];
  weeklySchedule: WeeklySchedule;
  athleteModel: AthleteModel | null;
  coachBlocks: CoachBlocksState;
  prs: PersonalRecord[];
  dailyCheckins: Record<string, ManualCheckin>;
  policyRecords: TrainingDecisionRecord[];
  stalls: StallFlag[];
  unit: Unit;
  bodyweightKg?: number;
  todayStr: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (Mon–Sun, D8)
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

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

function mondayOfStr(dateStr: string): string {
  return dateStrOf(getMondayOfWeek(parseLocalDate(dateStr)));
}

function weekdayOf(dateStr: string): DayOfWeek {
  const dow = parseLocalDate(dateStr).getDay(); // 0 = Sunday
  return WEEKDAYS[(dow + 6) % 7];
}

function inWeek(dateStr: string, monday: string): boolean {
  return dateStr >= monday && dateStr <= addDaysStr(monday, 6);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────────────────────────────────────

function weekTonnageKg(
  workouts: WorkoutEntry[],
  monday: string,
  bodyweightKg: number | undefined
): number {
  let total = 0;
  for (const w of workouts) {
    if (!inWeek(w.date, monday)) continue;
    for (const ex of w.exercises ?? []) {
      for (const s of ex.sets ?? []) {
        if (!isSetCompleted(s) || s.isWarmup) continue;
        if (!(s.reps > 0)) continue;
        let kg = 0;
        if (typeof s.weight === 'number' && s.weight > 0) {
          kg = s.unit === 'lbs' ? s.weight / 2.20462 : s.weight;
        } else if (bodyweightKg && bodyweightKg > 0) {
          kg = bodyweightKg;
        }
        total += kg * s.reps;
      }
    }
  }
  return Math.round(total);
}

function weekMuscleSets(
  workouts: WorkoutEntry[],
  monday: string
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    if (!inWeek(w.date, monday)) continue;
    for (const ex of w.exercises ?? []) {
      const completed = (ex.sets ?? []).filter((s) => isSetCompleted(s) && !s.isWarmup).length;
      if (completed === 0) continue;
      const primary = getExerciseMuscle(ex.name);
      counts.set(primary, (counts.get(primary) ?? 0) + completed);
      for (const sec of getExerciseSecondaryMuscles(ex.name)) {
        counts.set(sec, (counts.get(sec) ?? 0) + completed * 0.5);
      }
    }
  }
  return counts;
}

function bestE1rmInWindow(
  workouts: WorkoutEntry[],
  compoundKey: string,
  fromDate: string,
  toDate: string
): number | null {
  let best = 0;
  for (const w of workouts) {
    if (w.date < fromDate || w.date > toDate) continue;
    for (const ex of w.exercises ?? []) {
      if (mainCompoundKey(ex.name) !== compoundKey) continue;
      for (const s of ex.sets ?? []) {
        if (!isSetCompleted(s) || s.isWarmup) continue;
        if (typeof s.weight !== 'number' || !(s.weight > 0) || !(s.reps > 0)) continue;
        const kg = s.unit === 'lbs' ? s.weight / 2.20462 : s.weight;
        best = Math.max(best, calculateOneRepMax(kg, s.reps));
      }
    }
  }
  return best > 0 ? round1(best) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The weekly review
// ─────────────────────────────────────────────────────────────────────────────

export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const monday = mondayOfStr(input.anyDateInWeek);
  const sunday = addDaysStr(monday, 6);
  const priorMonday = addDaysStr(monday, -7);
  const { workouts, weeklySchedule } = input;

  // Adherence: scheduled days vs days actually trained.
  const scheduledDays = WEEKDAYS.filter(
    (d) => weeklySchedule[d] && weeklySchedule[d].workoutPlanId !== 'rest'
  );
  const trainedDays = new Set(
    workouts.filter((w) => inWeek(w.date, monday)).map((w) => weekdayOf(w.date))
  );
  const missedDays = scheduledDays.filter((d) => !trainedDays.has(d));
  const sessionsCompleted = scheduledDays.filter((d) => trainedDays.has(d)).length;

  // Tonnage vs prior week.
  const tonnageKg = weekTonnageKg(workouts, monday, input.bodyweightKg);
  const priorTonnage = weekTonnageKg(workouts, priorMonday, input.bodyweightKg);
  const tonnageDeltaPct =
    priorTonnage > 0 ? Math.round(((tonnageKg - priorTonnage) / priorTonnage) * 100) : null;

  // Per-muscle volume highlights (top 3 by sets, with prior-week delta).
  const setsNow = weekMuscleSets(workouts, monday);
  const setsPrior = weekMuscleSets(workouts, priorMonday);
  const volumeHighlights = [...setsNow.entries()]
    .map(([muscle, sets]) => ({
      muscle,
      sets: Math.round(sets * 2) / 2,
      deltaSets: Math.round((sets - (setsPrior.get(muscle) ?? 0)) * 2) / 2,
    }))
    .filter((v) => v.sets > 0)
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle))
    .slice(0, 3);

  // PRs set this week.
  const prs = input.prs
    .filter((pr) => inWeek(pr.date, monday))
    .map((pr) => ({
      exercise: pr.exercise,
      detail:
        pr.oneRepMax > 0
          ? `estimated 1RM ${Math.round(pr.oneRepMax)} kg`
          : `${Math.round(pr.weightKg)} kg × ${pr.reps}`,
    }));

  // Recovery vs the athlete's own baselines (PR-A check-in means, 1–5).
  const recoveryLines: string[] = [];
  const model = input.athleteModel;
  const weekCheckins = Object.entries(input.dailyCheckins)
    .filter(([date]) => inWeek(date, monday))
    .map(([, c]) => c);
  if (model && weekCheckins.length >= 2) {
    const dims: { key: 'sleep' | 'soreness' | 'energy'; label: string }[] = [
      { key: 'sleep', label: 'Sleep' },
      { key: 'soreness', label: 'Soreness score' },
      { key: 'energy', label: 'Energy' },
    ];
    for (const dim of dims) {
      const baseline = model.checkinBaselines[dim.key];
      const values = weekCheckins
        .map((c) => c[dim.key])
        .filter((v): v is number => typeof v === 'number');
      // tier 'prior' = no real check-in history (value is the 3/5
      // stand-in) — never present it as the athlete's baseline (D5).
      if (!baseline || baseline.tier === 'prior' || values.length < 2) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const delta = mean - baseline.value;
      if (Math.abs(delta) >= 0.4) {
        recoveryLines.push(
          `${dim.label} averaged ${round1(mean)} this week — ${delta > 0 ? 'above' : 'below'} your usual ${round1(baseline.value)} across the last 8 weeks.`
        );
      }
    }
  }
  if (recoveryLines.length === 0 && weekCheckins.length > 0) {
    recoveryLines.push('Check-ins this week sat close to your usual baselines — no recovery flags.');
  }

  // What the coach changed this week, and why (from the policy ledger +
  // plateau proposals applied in the window).
  const coachLines: string[] = [];
  const weekDecisions = input.policyRecords.filter((r) =>
    inWeek((r.createdAt || '').slice(0, 10), monday)
  );
  const progressions = weekDecisions.filter(
    (r) => r.ruleId === 'LOAD-PROG-01' || r.ruleId === 'REP-PROG-01'
  );
  for (const d of progressions.slice(0, 3)) {
    coachLines.push(
      d.ruleId === 'LOAD-PROG-01'
        ? `${d.exerciseName}: load progression approved by the policy — the lift hit the top of its rep range with effort to spare.`
        : `${d.exerciseName}: rep progression — the load stays, the target rep goes up by one.`
    );
  }
  const safetyHolds = weekDecisions.filter((r) => r.ruleId === 'SAFETY-01');
  if (safetyHolds.length > 0) {
    coachLines.push(
      `Progression was locked on ${safetyHolds[0].exerciseName} after a pain report (SAFETY-01) — safety rules outrank progression, always.`
    );
  }
  for (const p of input.coachBlocks.plateauProposals ?? []) {
    if (p.status === 'applied' && inWeek(p.createdOn, monday)) {
      coachLines.push(`Plateau change applied: ${p.changeText}`);
    }
  }

  // Pain escalation (D6).
  let painEscalation: string | null = null;
  let painEscalationI18n: LocalizedSentence | null = null;
  if (model && model.pain.flaggedFamilies.length > 0) {
    const fams = model.pain.flaggedFamilies.map((f) => f.replace('_', ' ')).join(', ');
    painEscalation = `Pain pattern flagged on ${fams} movements (2+ reports in 28 days). Those patterns stay out of new plans — if it keeps happening, get it checked by a professional.`;
    // Raw family ids — the renderer localizes each one (see coach-i18n).
    painEscalationI18n = { key: 'weeklyReview.painEscalation', params: { fams: model.pain.flaggedFamilies.join(', ') } };
  }

  // ONE focus, by rule priority.
  const managedKeys = new Set<string>();
  const active = input.coachBlocks.activeBlock;
  if (active && active.status === 'active') {
    for (const s of active.schemes) managedKeys.add(s.exerciseKey);
  }
  for (const adopted of Object.values(input.coachBlocks.adoptedPlans ?? {})) {
    for (const s of adopted.schemes) managedKeys.add(s.exerciseKey);
  }
  const managedStall = input.stalls.find((s) =>
    managedKeys.has(canonicalizeExerciseName(s.exercise))
  );

  let focus: WeeklyReview['focus'];
  if (painEscalation) {
    focus = {
      kind: 'safety',
      headline: 'Look after the pain pattern first',
      detail: painEscalation,
      headlineI18n: { key: 'weeklyReview.focusSafetyHeadline' },
      detailI18n: painEscalationI18n ?? undefined,
    };
  } else if (scheduledDays.length > 0 && sessionsCompleted / scheduledDays.length < 0.75 && missedDays.length > 0) {
    const day = missedDays[0];
    focus = {
      kind: 'adherence',
      headline: `Protect your ${day} session`,
      detail: `You completed ${sessionsCompleted} of ${scheduledDays.length} planned sessions, and ${day} was missed. One protected session beats a perfect plan that keeps slipping — the revision below can move it.`,
      headlineI18n: { key: 'weeklyReview.focusAdherenceHeadline', params: { day } },
      detailI18n: {
        key: 'weeklyReview.focusAdherenceDetail',
        params: { day, completed: sessionsCompleted, planned: scheduledDays.length },
      },
    };
  } else if (managedStall) {
    focus = {
      kind: 'stall',
      headline: `Break the ${managedStall.exercise} plateau`,
      detail: `${managedStall.exercise} has not moved in ${managedStall.sessionsStalled} of the last ${managedStall.sessionsAnalyzed} sessions. A stimulus change is proposed — approve it in Train when you are ready.`,
      headlineI18n: { key: 'weeklyReview.focusStallHeadline', params: { exercise: managedStall.exercise } },
      detailI18n: {
        key: 'weeklyReview.focusStallDetail',
        params: {
          exercise: managedStall.exercise,
          stalled: managedStall.sessionsStalled,
          analyzed: managedStall.sessionsAnalyzed,
        },
      },
    };
  } else if (progressions.length > 0) {
    focus = {
      kind: 'progression',
      headline: 'Progression is working — keep the rhythm',
      detail: `${progressions[0].exerciseName} earned a progression this week. The block is doing its job; next week, same plan, executed the same way.`,
      headlineI18n: { key: 'weeklyReview.focusProgressHeadline' },
      detailI18n: {
        key: 'weeklyReview.focusProgressDetail',
        params: { exercise: progressions[0].exerciseName },
      },
    };
  } else if (sessionsCompleted > 0) {
    focus = {
      kind: 'consistency',
      headline: 'Consistency is the win this week',
      detail: `You showed up for ${sessionsCompleted} session${sessionsCompleted === 1 ? '' : 's'}. No stalls, no flags — stacking weeks like this is exactly how the numbers move.`,
      headlineI18n: { key: 'weeklyReview.focusConsistencyHeadline' },
      detailI18n: {
        key:
          sessionsCompleted === 1
            ? 'weeklyReview.focusConsistencyDetailOne'
            : 'weeklyReview.focusConsistencyDetailMany',
        params: { count: sessionsCompleted },
      },
    };
  } else {
    focus = {
      kind: 'consistency',
      headline: 'A quiet week — no judgement, just a restart',
      detail: 'No sessions were logged this week, so there is nothing to analyse and nothing to fix. The plan is still there; the next session is the only target.',
      headlineI18n: { key: 'weeklyReview.focusQuietHeadline' },
      detailI18n: { key: 'weeklyReview.focusQuietDetail' },
    };
  }

  // Revision proposals for next week (proposals only — D3).
  const revisions: RevisionProposal[] = [];
  const nextMonday = addDaysStr(monday, 7);
  if (active && active.status === 'active') {
    const nextType = weekTypeForDate(active, nextMonday);
    const weekNo = Math.floor(
      (parseLocalDate(nextMonday).getTime() - parseLocalDate(active.startMonday).getTime()) /
        (7 * 86_400_000)
    ) + 1;
    if (weekNo >= 1 && weekNo <= active.weeks.length) {
      revisions.push({
        kind: 'next_week_type',
        text:
          nextType === 'deload'
            ? `Next week is week ${weekNo} of your block — a deload. Loads hold or ease; that is the block working, not a step back.`
            : nextType === 'test'
              ? `Next week is week ${weekNo} — test week. Main lifts get measured; progressions pause so the numbers are honest.`
              : `Next week is week ${weekNo} of your block — a build week. Same plan, progression rules live.`,
      });
    }
  }
  if (managedStall) {
    revisions.push({
      kind: 'stall_change',
      exerciseKey: canonicalizeExerciseName(managedStall.exercise),
      text: `A plateau change for ${managedStall.exercise} is waiting in Train → Your Coach.`,
    });
  }
  // Schedule realism: the athlete-model's most-skipped day was ALSO
  // missed this week → propose moving that day to the nearest free day.
  const mostSkipped = model?.adherence.mostSkippedDay ?? null;
  if (
    mostSkipped &&
    missedDays.includes(mostSkipped) &&
    (model?.adherence.plannedSessions ?? 0) >= 8
  ) {
    const fromIdx = WEEKDAYS.indexOf(mostSkipped);
    const planId = weeklySchedule[mostSkipped]?.workoutPlanId;
    const freeDay = WEEKDAYS.find(
      (d, i) =>
        Math.abs(i - fromIdx) === 1 &&
        (!weeklySchedule[d] || weeklySchedule[d].workoutPlanId === 'rest')
    );
    if (planId && planId !== 'rest' && freeDay) {
      revisions.push({
        kind: 'schedule_move',
        fromDay: mostSkipped,
        toDay: freeDay,
        planId,
        text: `${mostSkipped} keeps getting skipped — it is your most-missed day across the last 8 weeks too. Move this session to ${freeDay}? The plan itself does not change.`,
      });
    }
  }

  return {
    weekMonday: monday,
    weekSunday: sunday,
    sessionsPlanned: scheduledDays.length,
    sessionsCompleted,
    missedDays,
    tonnageKg,
    tonnageDeltaPct,
    volumeHighlights,
    prs,
    recoveryLines,
    coachLines,
    painEscalation,
    painEscalationI18n,
    focus,
    revisions,
    seen: false,
  };
}

/** The Monday of the most recent COMPLETED week, relative to today. */
export function lastCompletedWeekMonday(todayStr: string): string {
  return addDaysStr(mondayOfStr(todayStr), -7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session debrief — "Vs your block"
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionDebrief {
  lines: string[];
  cue: string;
}

export interface CompletedExerciseShape {
  name: string;
  sets: { reps: number; weight?: number; unit?: string; completed?: boolean; status?: string; rpe?: number }[];
}

export function buildSessionDebrief(input: {
  workoutName: string;
  exercises: CompletedExerciseShape[];
  plannedWorkouts: PlannedWorkout[];
  coachBlocks: CoachBlocksState;
  dateStr: string;
  unit: Unit;
}): SessionDebrief | null {
  const plan =
    input.plannedWorkouts.find(
      (p) => p.name.trim().toLowerCase() === input.workoutName.trim().toLowerCase()
    ) ?? null;
  if (!plan) return null;

  const lines: string[] = [];
  let cue: string | null = null;
  let weekType: string | null = null;
  let anyManaged = false;

  for (const ex of input.exercises) {
    const resolved = resolveManagedPolicy(input.coachBlocks, plan.id, ex.name, input.dateStr);
    if (!resolved) continue;
    anyManaged = true;
    if (!weekType) weekType = resolved.weekType;
    const planEx = plan.exercises.find(
      (pe) => canonicalizeExerciseName(pe.name) === canonicalizeExerciseName(ex.name)
    );
    const done = ex.sets.filter((s) => s.completed === true || s.status === 'completed');
    const working = done.filter((s) => s.reps > 0);
    if (!planEx || working.length === 0) continue;
    const topReps = Math.max(...working.map((s) => s.reps));
    const scheme = resolved.scheme;

    if (scheme.kind !== 'bodyweight' && topReps >= scheme.repMax && working.length >= (planEx.targetSets || 1)) {
      const inc =
        scheme.incrementKg != null
          ? input.unit === 'lbs'
            ? `${Math.round(scheme.incrementKg * 2.20462 * 2) / 2} lbs`
            : `${scheme.incrementKg} kg`
          : '';
      lines.push(
        `${ex.name} hit the top of its ${scheme.repMin}–${scheme.repMax} range on every set — next session adds ${inc}. That is the scheme working exactly as written.`
      );
      if (!cue) cue = `Next time on ${ex.name}: take the ${inc} jump — you earned it today.`;
    } else if (working.length < (planEx.targetSets || 0) || topReps < (planEx.targetReps || 0)) {
      lines.push(
        `${ex.name}: ${working.length} of ${planEx.targetSets} sets landed, top set ${topReps} reps vs the ${planEx.targetReps}-rep target. The load holds — repeatability comes before weight.`
      );
      if (!cue) cue = `Next time, protect ${ex.name} first — full sets before anything else.`;
    }
  }

  if (!anyManaged) return null;

  if (weekType === 'deload') {
    lines.unshift('Deload week: today was supposed to feel easier. Loads held by design — the fatigue clearing now is what the test week measures.');
  } else if (weekType === 'test') {
    lines.unshift('Test week: today measured what the block built. Whatever the top sets said, that is the new baseline for the next block.');
  }

  if (lines.length === 0) {
    lines.push('Everything landed as planned — no misses, no ceilings hit. Weeks like this are the block working quietly.');
  }
  return { lines: lines.slice(0, 3), cue: cue ?? 'Same plan next session — consistency is the cue this week.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block debrief
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockDebrief {
  blockName: string;
  completionLine: string;
  /** LIVE-P1-03: same line as a localizable struct. */
  completionI18n?: LocalizedSentence;
  liftChanges: { name: string; fromKg: number | null; toKg: number | null; line: string }[];
  learned: string[];
  endDate: string;
}

/** True when the block's final Sunday has passed. */
export function isBlockEnded(block: ActiveCoachBlock, todayStr: string): boolean {
  const end = addDaysStr(block.startMonday, block.weeks.length * 7 - 1);
  return todayStr > end;
}

export function buildBlockDebrief(input: {
  block: ActiveCoachBlock;
  workouts: WorkoutEntry[];
  plannedWorkouts: PlannedWorkout[];
  weeklySchedule: WeeklySchedule;
  athleteModel: AthleteModel | null;
}): BlockDebrief {
  const { block, workouts } = input;
  const endDate = addDaysStr(block.startMonday, block.weeks.length * 7 - 1);
  const testMonday = addDaysStr(block.startMonday, (block.weeks.length - 1) * 7);

  // Completion: scheduled block sessions vs days trained in the window.
  const blockPlans = input.plannedWorkouts.filter((p) => block.planIds.includes(p.id));
  const planDays = WEEKDAYS.filter((d) => {
    const pid = input.weeklySchedule[d]?.workoutPlanId;
    return pid && block.planIds.includes(pid);
  });
  const plannedPerWeek = planDays.length || blockPlans.length;
  const plannedTotal = plannedPerWeek * block.weeks.length;
  let completedTotal = 0;
  for (let w = 0; w < block.weeks.length; w++) {
    const wMonday = addDaysStr(block.startMonday, w * 7);
    const trained = new Set(
      workouts.filter((x) => inWeek(x.date, wMonday)).map((x) => weekdayOf(x.date))
    );
    completedTotal += planDays.filter((d) => trained.has(d)).length;
  }
  const pct = plannedTotal > 0 ? Math.round((completedTotal / plannedTotal) * 100) : 0;
  const completionLine =
    plannedTotal > 0
      ? `You completed ${completedTotal} of ${plannedTotal} planned block sessions (${pct}%).`
      : 'The block ran its course.';

  // Per-main-lift e1RM: first week vs test week.
  const liftChanges: BlockDebrief['liftChanges'] = [];
  const seenCompounds = new Set<string>();
  for (const scheme of block.schemes) {
    const compound = mainCompoundKey(scheme.displayName);
    if (!compound || seenCompounds.has(compound)) continue;
    seenCompounds.add(compound);
    const fromKg = bestE1rmInWindow(workouts, compound, block.startMonday, addDaysStr(block.startMonday, 6));
    const toKg = bestE1rmInWindow(workouts, compound, testMonday, endDate);
    if (fromKg === null && toKg === null) continue;
    const line =
      fromKg !== null && toKg !== null
        ? toKg > fromKg
          ? `${scheme.displayName}: estimated 1RM ${fromKg} → ${toKg} kg (+${round1(toKg - fromKg)} kg across the block).`
          : `${scheme.displayName}: estimated 1RM held at about ${toKg} kg — no gain this block, which the next block's focus takes into account.`
        : `${scheme.displayName}: estimated 1RM now about ${toKg ?? fromKg} kg.`;
    liftChanges.push({ name: scheme.displayName, fromKg, toKg, line });
  }

  const learned = (input.athleteModel?.topFacts ?? [])
    .filter((f) => f && typeof f.text === 'string' && f.text.length > 0)
    .slice(0, 3)
    .map((f) => f.text);

  return {
    blockName: block.name,
    completionLine,
    completionI18n:
      plannedTotal > 0
        ? {
            key: 'weeklyReview.debriefCompletion',
            params: { completed: completedTotal, planned: plannedTotal, pct },
          }
        : { key: 'weeklyReview.debriefNoPlan' },
    liftChanges,
    learned,
    endDate,
  };
}
