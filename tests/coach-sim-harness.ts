/**
 * Coach simulation harness — drives the REAL app store (useAppStore) and the
 * REAL coach engine functions with synthetic lifter personas over 12 weeks.
 *
 * Nothing in here reimplements coaching logic. The driver only:
 *   - seeds the store the way existing store tests do,
 *   - proposes/approves blocks through the store's own actions,
 *   - builds WorkoutEntry logs from the CURRENT plan targets (the way the
 *     workout logger stamps prescribed* fields on sets),
 *   - lets persona performance models decide the ACTUAL reps/RPE logged,
 *   - applies progression decisions through the store's own
 *     applyPolicyDecisionToFuturePrescription (the "athlete confirmed" path),
 *   - calls the same read models the app calls (calculateReadiness as the
 *     digest does, detectMissedSessions, detectStalls, generateCoachTake,
 *     adjustNextTargets as useCoachDigest does).
 *
 * Time is controlled with vitest fake timers: every engine anchor
 * (getLocalTodayStr) follows the simulated calendar, so runs are fully
 * deterministic regardless of the real date.
 */
import { vi } from 'vitest';
import { useAppStore } from '@/lib/store';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import {
  adjustNextTargets,
  calculateReadiness,
  detectMissedSessions,
  detectStalls,
  generateCoachTake,
  type ManualCheckin,
  type PlannedSession,
  type ReadinessResult,
  type TargetAdjustment,
} from '@/lib/coach-engine';
import { getMovementFamily } from '@/lib/workout-engine';
import { canonicalizeExerciseName } from '@/lib/workout-outcome-evidence';
import type { BlockIntake } from '@/lib/block-intake';
import type {
  DayOfWeek,
  PlannedExercise,
  PlannedWorkout,
  WeeklySchedule,
  WorkoutEntry,
  WorkoutSet,
} from '@/lib/types';
import type { TrainingDecisionRecord } from '@/lib/training-decision-policy';
import type { PlateauProposal } from '@/lib/block-engine';
import type { StallFlag } from '@/lib/coach-engine';

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

export const SIM_EPOCH_MONDAY = '2026-01-05'; // a Monday
export const SIM_WEEKS = 12;

const WEEKDAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function isoAdd(iso: string, days: number): string {
  const d = new Date(`${iso}T08:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIdx(iso: string): number {
  const dow = new Date(`${iso}T08:00:00.000Z`).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}

export function weekdayOf(iso: string): DayOfWeek {
  return WEEKDAYS[weekdayIdx(iso)];
}

function setSimTime(iso: string): void {
  vi.setSystemTime(new Date(`${iso}T08:00:00.000Z`));
}

/** mulberry32 — tiny deterministic PRNG. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Trace types
// ---------------------------------------------------------------------------

export interface SessionExerciseTrace {
  name: string;
  family: string;
  targetBefore: { weight?: number; reps: number; sets: number };
  decision: {
    actionCategory: string;
    ruleId: string;
    deltaWeight: number;
    deltaReps: number;
    applied: boolean;
    applyError?: string;
  } | null;
  adjustNext: { action: string; reason: string } | null;
}

export interface SessionTrace {
  date: string;
  week: number;
  weekday: DayOfWeek;
  planId: string;
  planName: string;
  weekType: string;
  exercises: SessionExerciseTrace[];
  readiness: ReadinessResult;
  coachTake: string | null;
}

export interface WeekTrace {
  week: number;
  monday: string;
  missedDetected: number;
  stallFlags: { exercise: string; sessionsStalled: number; suggestion: string }[];
  plateauProposalsCreated: {
    exercise: string;
    suggestion: string;
    changeType: string;
    outcome: string; // proposal status after the engaged-user apply attempt
  }[];
  /** active plans' exercises after the Sunday plateau pass */
  planSnapshot: { planName: string; exercises: { name: string; weight?: number; reps: number; sets: number }[] }[];
  review: {
    sessionsPlanned: number;
    sessionsCompleted: number;
    painEscalation: string | null;
    coachLines: string[];
    focusHeadline: string;
  } | null;
}

export interface BlockTrace {
  blockIndex: number;
  proposedOn: string;
  weeks: { index: number; type: string }[];
  planDays: { weekday: DayOfWeek; planName: string; exercises: string[] }[];
  allExerciseNames: string[];
  warnings: string[];
  summary: string;
  focusReason: string;
  whyTexts: string[];
}

export interface SimTrace {
  personaId: string;
  blocks: BlockTrace[];
  sessions: SessionTrace[];
  weeks: WeekTrace[];
  /** every plan exercise name ever materialized, in order seen */
  allPlanExerciseNames: string[];
}

// ---------------------------------------------------------------------------
// Persona model
// ---------------------------------------------------------------------------

export interface PerformCtx {
  exercise: PlannedExercise;
  week: number;
  date: string;
  /** how many times this persona has already performed this exercise (0-based) */
  sessionCountForExercise: number;
  rng: () => number;
  /** persona scratch state (e.g. working weights for unprescribed lifts) */
  scratch: Map<string, number>;
}

export interface PerformedExercise {
  sets: WorkoutSet[];
  reportsPain?: boolean;
  painfulExerciseName?: string;
}

export interface PersonaDef {
  id: string;
  seed: number;
  bodyweightKg: number;
  intake: BlockIntake;
  /** intake for blocks after the first; defaults to intake with topLifts: [] */
  nextBlockIntake?: BlockIntake;
  trainsOn: (week: number, weekday: DayOfWeek, scheduled: DayOfWeek[]) => boolean;
  perform: (ctx: PerformCtx) => PerformedExercise;
  checkin: (week: number, date: string) => ManualCheckin;
}

/** Build the set list the workout logger would produce for a performed exercise. */
export function performedSets(
  target: PlannedExercise,
  opts: {
    reps: number | ((setIdx: number) => number);
    rpe: number;
    weightKg?: number; // actual weight lifted when it differs from target
  }
): WorkoutSet[] {
  const sets: WorkoutSet[] = [];
  const n = target.targetSets ?? 3;
  for (let i = 0; i < n; i++) {
    const reps = typeof opts.reps === 'function' ? opts.reps(i) : opts.reps;
    const set: WorkoutSet = {
      reps,
      weight: opts.weightKg ?? target.targetWeight,
      unit: 'kg',
      rpe: opts.rpe,
      status: 'completed',
      completed: true,
    };
    if (target.targetWeight !== undefined) set.prescribedWeight = target.targetWeight;
    if (target.targetReps !== undefined) set.prescribedReps = target.targetReps;
    if (target.targetRpe !== undefined) set.prescribedRpe = target.targetRpe;
    set.prescribedUnit = 'kg';
    sets.push(set);
  }
  return sets;
}

/** Deterministic fallback working weight for lifts the plan leaves unweighted. */
export function fallbackWeight(name: string, scratch: Map<string, number>): number {
  const key = canonicalizeExerciseName(name);
  const existing = scratch.get(key);
  if (existing !== undefined) return existing;
  let w = 25;
  if (/curl/i.test(name)) w = 12.5;
  else if (/raise|fly/i.test(name)) w = 7.5;
  else if (/calf/i.test(name)) w = 40;
  else if (/press/i.test(name)) w = 30;
  else if (/row/i.test(name)) w = 35;
  scratch.set(key, w);
  return w;
}

// ---------------------------------------------------------------------------
// Store seeding (mirrors tests/store-decision-ledger.test.ts)
// ---------------------------------------------------------------------------

const REST_SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

function seedStore(persona: PersonaDef): void {
  const s = useAppStore.getState();
  s.clearAllData();
  useAppStore.setState({
    profile: {
      id: `sim-${persona.id}`,
      name: `Sim ${persona.id}`,
      gender: 'male',
      bodyweightKg: persona.bodyweightKg,
      bodyweightLbs: Math.round(persona.bodyweightKg * 2.20462),
      unit: 'kg',
      createdAt: '2026-01-01T00:00:00.000Z',
    } as never,
    workouts: [],
    plannedWorkouts: [],
    weeklySchedule: { ...REST_SCHEDULE },
    coachBlocks: getInitialCoachBlocksState(),
    athleteModel: null,
    prs: [],
    policyDecisionRecords: {},
    policyDecisionsLedgerHistory: [],
    weeklyReviews: [],
    dailyCheckins: {},
  } as never);
}

// ---------------------------------------------------------------------------
// The simulation driver
// ---------------------------------------------------------------------------

export function runSimulation(persona: PersonaDef): SimTrace {
  vi.useFakeTimers();
  try {
    return runSimulationInner(persona);
  } finally {
    vi.useRealTimers();
  }
}

function runSimulationInner(persona: PersonaDef): SimTrace {
  const rng = seededRng(persona.seed);
  const scratch = new Map<string, number>();
  const exerciseCounts = new Map<string, number>();
  const trace: SimTrace = {
    personaId: persona.id,
    blocks: [],
    sessions: [],
    weeks: [],
    allPlanExerciseNames: [],
  };

  seedStore(persona);

  const proposeAndApprove = (intake: BlockIntake, blockIndex: number, onDate: string) => {
    setSimTime(onDate);
    const store = useAppStore.getState();
    const proposal = store.proposeCoachBlock(intake);
    const bt: BlockTrace = {
      blockIndex,
      proposedOn: onDate,
      weeks: proposal.weeks.map((w) => ({ index: w.index, type: w.type })),
      planDays: proposal.days.map((d) => ({
        weekday: d.weekday,
        planName: d.planName,
        exercises: d.exercises.map((e) => e.name),
      })),
      allExerciseNames: proposal.days.flatMap((d) => d.exercises.map((e) => e.name)),
      warnings: [...proposal.warnings],
      summary: proposal.summary,
      focusReason: proposal.focusReason,
      whyTexts: proposal.days.flatMap((d) => Object.values(d.whyByExercise)),
    };
    trace.blocks.push(bt);
    const ok = useAppStore.getState().approveBlockProposal();
    if (!ok) throw new Error(`block proposal refused for persona ${persona.id}`);
    for (const n of bt.allExerciseNames) {
      if (!trace.allPlanExerciseNames.includes(n)) trace.allPlanExerciseNames.push(n);
    }
  };

  proposeAndApprove(persona.intake, 1, SIM_EPOCH_MONDAY);
  let blocksStarted = 1;

  for (let week = 1; week <= SIM_WEEKS; week++) {
    const monday = isoAdd(SIM_EPOCH_MONDAY, (week - 1) * 7);
    const sunday = isoAdd(monday, 6);

    // Monday morning: the app rebuilds last week's review on mount.
    setSimTime(monday);
    useAppStore.getState().refreshWeeklyReview();

    // Block rollover: previous block's weeks are exhausted -> propose the next
    // block exactly as a returning user would (previous is archived by the
    // store's approve action).
    {
      const ab = useAppStore.getState().coachBlocks.activeBlock;
      if (ab) {
        const startOffset = Math.round(
          (new Date(`${monday}T08:00:00Z`).getTime() -
            new Date(`${ab.startMonday}T08:00:00Z`).getTime()) /
            86400000
        );
        const weekIdx = Math.floor(startOffset / 7);
        if (weekIdx >= ab.weeks.length) {
          blocksStarted += 1;
          const intake =
            persona.nextBlockIntake ?? { ...persona.intake, topLifts: [] };
          proposeAndApprove(intake, blocksStarted, monday);
        }
      }
    }

    const state0 = useAppStore.getState();
    const activeBlock = state0.coachBlocks.activeBlock;
    const scheduledPlanByWeekday = new Map<DayOfWeek, PlannedWorkout>();
    if (activeBlock) {
      for (const planId of activeBlock.planIds) {
        const plan = state0.plannedWorkouts.find((p) => p.id === planId);
        if (!plan) continue;
        // The weekday a plan belongs to comes from the weekly schedule.
        for (const wd of WEEKDAYS) {
          if (state0.weeklySchedule[wd]?.workoutPlanId === planId) {
            scheduledPlanByWeekday.set(wd, plan);
          }
        }
      }
    }
    const scheduledWeekdays = [...scheduledPlanByWeekday.keys()];

    for (let offset = 0; offset < 7; offset++) {
      const date = isoAdd(monday, offset);
      const weekday = weekdayOf(date);
      setSimTime(date);
      const plan = scheduledPlanByWeekday.get(weekday);
      if (!plan) continue;
      if (!persona.trainsOn(week, weekday, scheduledWeekdays)) continue;

      const st = useAppStore.getState();
      const livePlan = st.plannedWorkouts.find((p) => p.id === plan.id) ?? plan;
      const weekType = activeBlock
        ? // weekTypeForDate equivalent via the block calendar
          (() => {
            const days = Math.round(
              (new Date(`${date}T08:00:00Z`).getTime() -
                new Date(`${activeBlock.startMonday}T08:00:00Z`).getTime()) /
                86400000
            );
            const idx = Math.floor(days / 7);
            return idx >= 0 && idx < activeBlock.weeks.length
              ? activeBlock.weeks[idx].type
              : 'build';
          })()
        : 'build';

      // Persona performs the session against the CURRENT plan targets.
      const performedByName = new Map<string, PerformedExercise>();
      const workoutExercises: WorkoutEntry['exercises'] = [];
      let anyPain = false;
      for (const ex of livePlan.exercises) {
        const key = canonicalizeExerciseName(ex.name);
        const count = exerciseCounts.get(key) ?? 0;
        exerciseCounts.set(key, count + 1);
        const performed = persona.perform({
          exercise: ex,
          week,
          date,
          sessionCountForExercise: count,
          rng,
          scratch,
        });
        performedByName.set(ex.name, performed);
        if (performed.reportsPain) anyPain = true;
        workoutExercises.push({
          name: ex.name,
          ...(ex.id ? { planExerciseId: ex.id } : {}),
          sets: performed.sets,
          ...(performed.reportsPain
            ? { reportsPain: true, painfulExerciseName: performed.painfulExerciseName }
            : {}),
        });
      }

      const workout: WorkoutEntry = {
        id: `sim-${persona.id}-${date}-${livePlan.id}`,
        date,
        name: livePlan.name,
        planId: livePlan.id,
        exercises: workoutExercises,
        ...(anyPain ? { reportsPain: true } : {}),
      };

      const checkin = persona.checkin(week, date);
      const withCheckin = {
        ...(useAppStore.getState().dailyCheckins ?? {}),
        [date]: checkin,
      };
      useAppStore.setState({ dailyCheckins: withCheckin } as never);

      const recordKeysBefore = new Set(
        Object.keys(useAppStore.getState().policyDecisionRecords ?? {})
      );
      useAppStore.getState().addWorkout(workout);
      const after = useAppStore.getState();

      const newDecisions: TrainingDecisionRecord[] = Object.values(
        after.policyDecisionRecords ?? {}
      ).filter((d) => !recordKeysBefore.has(d.id));

      // Engaged user: confirm every progression the coach proposes. The
      // decision card applies with an explicit exercise index (the row the
      // card sits under), so correlate decisions to workout exercises in
      // order and pass that index — the same resolution the UI uses.
      const claimed = new Set<string>();
      const decisionByIndex = new Map<number, SessionExerciseTrace['decision']>();
      livePlan.exercises.forEach((planEx, idx) => {
        const key = canonicalizeExerciseName(planEx.name);
        const d = newDecisions.find(
          (x) => !claimed.has(x.id) && canonicalizeExerciseName(x.exerciseName) === key
        );
        if (!d) return;
        claimed.add(d.id);
        const isProgression =
          d.actionCategory === 'candidate_rep_progression' ||
          d.actionCategory === 'candidate_load_progression';
        // The engaged user also confirms the block deload cut when the
        // coach proposes one — same decision-card flow (accept, then
        // apply to the future prescription), never automatic.
        const isDeload = d.actionCategory === 'candidate_load_reduction';
        let applied = false;
        let applyError: string | undefined;
        if (isProgression || isDeload) {
          // The app's real flow: the athlete accepts the recommendation on
          // the decision card, then applies it to the future prescription.
          useAppStore.getState().acceptPolicyDecision(d.id);
          const res = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
            decisionId: d.id,
            targetPlanId: livePlan.id,
            targetExerciseIndex: idx,
          });
          applied = res.success;
          if (!res.success) applyError = res.error ?? res.message;
        }
        decisionByIndex.set(idx, {
          actionCategory: d.actionCategory,
          ruleId: d.ruleId,
          deltaWeight: d.proposedPrescription.deltaWeight,
          deltaReps: d.proposedPrescription.deltaReps,
          applied,
          ...(applyError ? { applyError } : {}),
        });
      });
      // Decisions that matched no plan exercise (e.g. the pain-swap second
      // evaluation for the original lift) are kept on the first exercise
      // with the same canonical name if it has none yet.
      for (const d of newDecisions) {
        if (claimed.has(d.id)) continue;
        const key = canonicalizeExerciseName(d.exerciseName);
        const idx = livePlan.exercises.findIndex(
          (e) => canonicalizeExerciseName(e.name) === key
        );
        if (idx >= 0 && !decisionByIndex.has(idx)) {
          decisionByIndex.set(idx, {
            actionCategory: d.actionCategory,
            ruleId: d.ruleId,
            deltaWeight: d.proposedPrescription.deltaWeight,
            deltaReps: d.proposedPrescription.deltaReps,
            applied: false,
          });
        }
      }

      // Digest layer: adjustNextTargets over the (possibly updated) plan, the
      // same inputs useCoachDigest passes.
      const planAfter =
        useAppStore.getState().plannedWorkouts.find((p) => p.id === livePlan.id) ??
        livePlan;
      const adjustments: TargetAdjustment[] = adjustNextTargets(
        workout,
        planAfter.exercises.map((e) => ({
          exercise: e.name,
          weight: e.targetWeight ?? 0,
          reps: e.targetReps ?? 0,
          sets: e.targetSets,
          unit: 'kg' as const,
        }))
      );
      const adjByExercise = new Map(adjustments.map((a) => [a.exercise, a]));

      const readiness = calculateReadiness(after.workouts, [], checkin);
      const isVeryFirstSession = trace.sessions.length === 0;
      const coachTake = isVeryFirstSession
        ? generateCoachTake(workout, [])
        : null;

      trace.sessions.push({
        date,
        week,
        weekday,
        planId: livePlan.id,
        planName: livePlan.name,
        weekType,
        exercises: livePlan.exercises.map((ex, idx) => ({
          name: ex.name,
          family: getMovementFamily(ex.name),
          targetBefore: {
            weight: ex.targetWeight,
            reps: ex.targetReps ?? 0,
            sets: ex.targetSets ?? 3,
          },
          decision: decisionByIndex.get(idx) ?? null,
          adjustNext: adjByExercise.has(ex.name)
            ? {
                action: adjByExercise.get(ex.name)!.action,
                reason: adjByExercise.get(ex.name)!.reason,
              }
            : null,
        })),
        readiness,
        coachTake,
      });
    }

    // End of week (Sunday): missed-session detection + plateau pipeline,
    // exactly the store's refresh flow; the engaged user applies proposals.
    setSimTime(sunday);
    const stSun = useAppStore.getState();
    const plannedSessions: PlannedSession[] = [...scheduledPlanByWeekday.entries()].map(
      ([wd, plan]) => ({
        weekday: WEEKDAYS.indexOf(wd),
        name: plan.name,
        planId: plan.id,
      })
    );
    const missed = detectMissedSessions(plannedSessions, stSun.workouts, {
      start: monday,
      end: sunday,
    });
    const proposalsBefore = new Set(
      stSun.coachBlocks.plateauProposals.map((p) => p.id)
    );
    useAppStore.getState().refreshPlateauProposals();
    const freshProposals: PlateauProposal[] = useAppStore
      .getState()
      .coachBlocks.plateauProposals.filter((p) => !proposalsBefore.has(p.id));
    const created: WeekTrace['plateauProposalsCreated'] = [];
    for (const p of freshProposals) {
      useAppStore.getState().applyPlateauProposal(p.id);
      const afterApply = useAppStore
        .getState()
        .coachBlocks.plateauProposals.find((x) => x.id === p.id);
      created.push({
        exercise: p.displayName,
        suggestion: p.suggestion,
        changeType: p.change.type,
        outcome: afterApply?.status ?? 'missing',
      });
    }
    const stallsNow: StallFlag[] = detectStalls(useAppStore.getState().workouts);
    const snapState = useAppStore.getState();
    const planSnapshot = (snapState.coachBlocks.activeBlock?.planIds ?? [])
      .map((pid) => snapState.plannedWorkouts.find((p) => p.id === pid))
      .filter((p): p is PlannedWorkout => Boolean(p))
      .map((p) => ({
        planName: p.name,
        exercises: p.exercises.map((e) => ({
          name: e.name,
          weight: e.targetWeight,
          reps: e.targetReps ?? 0,
          sets: e.targetSets ?? 3,
        })),
      }));

    // The review for THIS week is built next Monday by refreshWeeklyReview;
    // capture it lazily at the start of the next iteration — except the
    // final week, handled after the loop.
    trace.weeks.push({
      week,
      monday,
      missedDetected: missed.length,
      stallFlags: stallsNow.map((f) => ({
        exercise: f.exercise,
        sessionsStalled: f.sessionsStalled,
        suggestion: f.suggestion,
      })),
      plateauProposalsCreated: created,
      planSnapshot,
      review: null,
    });
  }

  // Final review (for week 12) — built on the Monday after, as in the app.
  const finalMonday = isoAdd(SIM_EPOCH_MONDAY, SIM_WEEKS * 7);
  setSimTime(finalMonday);
  useAppStore.getState().refreshWeeklyReview();

  // Backfill weekly reviews: each stored review covers its weekMonday.
  const reviews = useAppStore.getState().weeklyReviews ?? [];
  for (const wt of trace.weeks) {
    const r = reviews.find((x) => x.weekMonday === wt.monday);
    if (r) {
      wt.review = {
        sessionsPlanned: r.sessionsPlanned,
        sessionsCompleted: r.sessionsCompleted,
        painEscalation: r.painEscalation,
        coachLines: r.coachLines,
        focusHeadline: r.focus.headline,
      };
    }
  }

  return trace;
}
