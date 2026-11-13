import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitizeWorkoutSetUpdate, sanitizeWorkoutUpdate } from '../src/lib/update-sanitize';
import {
  computeSessionBest,
  gateSessionOutcome,
  planPRChangesAfterSetEdit,
} from '../src/lib/pr-reevaluation';
import { calculateWorkoutVolumeKg } from '../src/lib/volume';
import { useStore } from '../src/lib/store';
import type { PersonalRecord, WorkoutEntry, WorkoutSet } from '../src/lib/types';

const mkSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  reps: 5,
  weight: 100,
  unit: 'kg',
  completed: true,
  status: 'completed',
  ...over,
});

const mkWorkout = (sets: WorkoutSet[], over: Partial<WorkoutEntry> = {}): WorkoutEntry => ({
  id: 'wk1',
  date: '2026-11-02',
  name: 'Upper A',
  exercises: [{ name: 'Bench Press', sets }],
  ...over,
});

const mkPR = (over: Partial<PersonalRecord> = {}): PersonalRecord => ({
  id: 'pr1',
  exercise: 'Bench Press',
  weightKg: 100,
  weightLbs: 220.5,
  reps: 5,
  oneRepMax: 116.7,
  date: '2026-11-02',
  notes: 'All-Time 1RM PR',
  prType: '1rm',
  ...over,
});

describe('sanitizeWorkoutSetUpdate — set numbers at the store boundary (F3)', () => {
  it('clamps weight to the same 0–500 kg ceiling as the save path, unit-aware', () => {
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ weight: 9999 })).weight).toBe(500);
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ weight: -5 })).weight).toBe(0);
    // 2000 lbs = 907 kg → capped at 500 kg → expressed back in lbs.
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ weight: 2000, unit: 'lbs' })).weight).toBe(1102.3);
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ weight: 100 })).weight).toBe(100);
  });

  it('clamps reps to an integer 0–100 and RPE to 1–10', () => {
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ reps: 250 })).reps).toBe(100);
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ reps: 3.9 as any })).reps).toBe(3);
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ rpe: 12 })).rpe).toBe(10);
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ rpe: 0 })).rpe).toBe(1);
  });

  it('keeps the existing value for non-finite numbers; explicit rpe undefined clears', () => {
    const existing = mkSet({ weight: 80, rpe: 8 });
    expect(sanitizeWorkoutSetUpdate(existing, mkSet({ weight: NaN })).weight).toBe(80);
    expect(sanitizeWorkoutSetUpdate(existing, mkSet({ rpe: NaN })).rpe).toBe(8);
    const cleared = sanitizeWorkoutSetUpdate(existing, { ...mkSet({ rpe: 8 }), rpe: undefined });
    expect('rpe' in cleared && cleared.rpe !== undefined).toBe(false);
  });

  it('preserves bodyweight representation and every non-numeric field verbatim', () => {
    const bw = mkSet({ weight: undefined, status: 'completed', prescribedWeight: 17.5, isWarmup: true });
    const out = sanitizeWorkoutSetUpdate(undefined, bw);
    expect(out.weight).toBeUndefined();
    expect(out.prescribedWeight).toBe(17.5);
    expect(out.isWarmup).toBe(true);
    expect(out.status).toBe('completed');
    // A numeric string weight (pre-finalize shape) is parsed, like addWorkout does.
    expect(sanitizeWorkoutSetUpdate(undefined, mkSet({ weight: '80' as any })).weight).toBe(80);
  });

  it('sanitizeWorkoutUpdate sanitizes exercises only when they are part of the update', () => {
    const base = mkWorkout([mkSet({ weight: 9999 })]);
    const untouched = sanitizeWorkoutUpdate(base, { name: 'Renamed' });
    expect(untouched.exercises[0].sets[0].weight).toBe(9999);
    const edited = sanitizeWorkoutUpdate(base, {
      exercises: [{ name: 'Bench Press', sets: [mkSet({ weight: 9999 })] }],
    });
    expect(edited.exercises[0].sets[0].weight).toBe(500);
  });
});

describe('computeSessionBest / gateSessionOutcome — finish detection, mirrored', () => {
  it('picks the top set by dampened-Epley e1RM and ignores warmups and uncompleted sets', () => {
    const best = computeSessionBest(
      'Bench Press',
      [mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 120, reps: 1, isWarmup: true }), mkSet({ weight: 200, reps: 1, status: 'skipped', completed: false })],
      [],
      70,
    );
    expect(best.topSet).toEqual({ weightKg: 100, reps: 5, e1RMKg: 116.7 });
  });

  it('converts lbs sets to kg and applies the 500 kg cap', () => {
    const best = computeSessionBest('Bench Press', [mkSet({ weight: 220, unit: 'lbs', reps: 5 })], [], 70);
    expect(best.topSet).toEqual({ weightKg: 99.8, reps: 5, e1RMKg: 116.4 });
    const capped = computeSessionBest('Bench Press', [mkSet({ weight: 600, reps: 1 })], [], 70);
    expect(capped.topSet).toBeNull();
  });

  it('finds a rep PR against history at the same load', () => {
    const history = [mkWorkout([mkSet({ weight: 60, reps: 8 })], { id: 'wk0', date: '2026-10-20' })];
    const best = computeSessionBest('Bench Press', [mkSet({ weight: 60, reps: 10 })], history, 70);
    expect(best.bestRepPR).toMatchObject({ weightKg: 60, reps: 10, prevReps: 8 });
    const outcome = gateSessionOutcome(best, 100);
    expect(outcome).toMatchObject({ kind: 'reps', reps: 10, prevReps: 8, oneRepMax: 80 });
  });

  it('gates: 1RM outcome beats rep outcome; neither → null', () => {
    const best = computeSessionBest('Bench Press', [mkSet({ weight: 100, reps: 5 })], [], 70);
    expect(gateSessionOutcome(best, 50)).toMatchObject({ kind: '1rm', oneRepMax: 116.7 });
    expect(gateSessionOutcome({ topSet: null, bestRepPR: null }, 0)).toBeNull();
  });
});

describe('planPRChangesAfterSetEdit — the honest PR bookkeeping', () => {
  const baseArgs = {
    exerciseName: 'Bench Press',
    workoutDate: '2026-11-02',
    editedWorkoutId: 'wk1',
    bodyweightKg: 70,
    userUnit: 'kg' as const,
  };

  it('corrected DOWN: the session PR record is updated to the corrected performance', () => {
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 100 })],
      newSets: [mkSet({ weight: 10 })],
      prs: [mkPR()],
      allWorkouts: [mkWorkout([mkSet({ weight: 10 })])],
    });
    expect(plan.deleteId).toBeUndefined();
    expect(plan.create).toBeUndefined();
    expect(plan.update?.id).toBe('pr1');
    expect(plan.update?.fields).toMatchObject({ weightKg: 10, oneRepMax: 11.7, reps: 5, prType: '1rm' });
    // The session is the only Bench evidence left → baseline wording.
    expect(plan.update?.fields.notes).toBe('Baseline established from first session');
  });

  it('corrected DOWN to the next-best set: the record follows that set', () => {
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 100 }), mkSet({ weight: 90 })],
      newSets: [mkSet({ weight: 80 }), mkSet({ weight: 90 })],
      prs: [mkPR()],
      allWorkouts: [mkWorkout([mkSet({ weight: 80 }), mkSet({ weight: 90 })])],
    });
    expect(plan.update?.fields).toMatchObject({ weightKg: 90, weightLbs: 198.4, oneRepMax: 105 });
  });

  it('corrected DOWN past every record: a PR whose set no longer exists is deleted', () => {
    const older = mkPR({ id: 'pr0', weightKg: 60, weightLbs: 132.3, oneRepMax: 70, date: '2026-10-01' });
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 100 })],
      newSets: [mkSet({ weight: 0 })],
      prs: [older, mkPR()],
      allWorkouts: [mkWorkout([mkSet({ weight: 0 })])],
    });
    expect(plan.deleteId).toBe('pr1');
    expect(plan.create).toBeUndefined();
    expect(plan.update).toBeUndefined();
  });

  it('corrected UP: a PR is created for a session that originally earned none', () => {
    const older = mkPR({ id: 'pr0', weightKg: 60, weightLbs: 132.3, oneRepMax: 70, date: '2026-10-01' });
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 50 })],
      newSets: [mkSet({ weight: 100 })],
      prs: [older],
      allWorkouts: [mkWorkout([mkSet({ weight: 100 })])],
    });
    expect(plan.create).toMatchObject({
      exercise: 'Bench Press',
      weightKg: 100,
      weightLbs: 220.5,
      reps: 5,
      oneRepMax: 116.7,
      date: '2026-11-02',
      notes: 'All-Time 1RM PR',
      prType: '1rm',
    });
  });

  it('corrected UP: the session PR record is raised in place', () => {
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 100 })],
      newSets: [mkSet({ weight: 110 })],
      prs: [mkPR()],
      allWorkouts: [mkWorkout([mkSet({ weight: 110 })])],
    });
    expect(plan.update?.fields).toMatchObject({ weightKg: 110, weightLbs: 242.5, oneRepMax: 128.3 });
  });

  it('editing a non-PR set changes nothing', () => {
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 100 }), mkSet({ weight: 60 })],
      newSets: [mkSet({ weight: 100 }), mkSet({ weight: 62 })],
      prs: [mkPR()],
      allWorkouts: [mkWorkout([mkSet({ weight: 100 }), mkSet({ weight: 62 })])],
    });
    expect(plan).toEqual({});
  });

  it('a manually-added PR is never attributed, updated, or deleted', () => {
    const manual = mkPR({ id: 'prm', notes: 'Hit it at the meet — judged' });
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 100 })],
      newSets: [mkSet({ weight: 10 })],
      prs: [manual],
      allWorkouts: [mkWorkout([mkSet({ weight: 10 })])],
    });
    expect(plan).toEqual({});
  });

  it('rep-PR outcome: correcting reps up creates a rep PR dated on the workout', () => {
    const history = mkWorkout([mkSet({ weight: 60, reps: 8 })], { id: 'wk0', date: '2026-10-20' });
    const bigPR = mkPR({ id: 'pr0', weightKg: 100, weightLbs: 220.5, reps: 1, oneRepMax: 100, date: '2026-10-01' });
    const plan = planPRChangesAfterSetEdit({
      ...baseArgs,
      oldSets: [mkSet({ weight: 60, reps: 8 })],
      newSets: [mkSet({ weight: 60, reps: 10 })],
      prs: [bigPR],
      allWorkouts: [history, mkWorkout([mkSet({ weight: 60, reps: 10 })])],
    });
    expect(plan.create).toMatchObject({ prType: 'reps', reps: 10, weightKg: 60, date: '2026-11-02' });
    expect(plan.create?.notes).toBe('Rep PR: +2 reps at 60 kg');
  });
});

describe('store end-to-end — edit a completed set through the real actions', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('the corrected value persists sanitized, volume follows, and the stale PR is re-based', () => {
    const store = useStore.getState();
    store.addWorkout(mkWorkout([mkSet({ weight: 100, reps: 5 })]));
    store.addPR(mkPR());
    expect(calculateWorkoutVolumeKg(useStore.getState().workouts[0])).toBe(500);

    // Exactly what HistorySetChip does on Save:
    const st = useStore.getState();
    const fresh = st.workouts.find((w) => w.id === 'wk1')!;
    const newExercises = [{ name: 'Bench Press', sets: [mkSet({ weight: 10, reps: 5 })] }];
    st.updateWorkout('wk1', { exercises: newExercises });
    const plan = planPRChangesAfterSetEdit({
      exerciseName: 'Bench Press',
      workoutDate: fresh.date,
      editedWorkoutId: 'wk1',
      oldSets: fresh.exercises[0].sets,
      newSets: newExercises[0].sets,
      prs: st.prs,
      allWorkouts: st.workouts,
      bodyweightKg: 70,
      userUnit: 'kg',
    });
    if (plan.deleteId) st.deletePR(plan.deleteId);
    if (plan.update) st.updatePR(plan.update.id, plan.update.fields);
    if (plan.create) st.addPR({ id: 'pr-new', ...plan.create });

    const after = useStore.getState();
    expect(after.workouts[0].exercises[0].sets[0].weight).toBe(10);
    expect(calculateWorkoutVolumeKg(after.workouts[0])).toBe(50);
    expect(after.prs).toHaveLength(1);
    // §23 (Phase 3.1): the re-base now happens INSIDE updateWorkout —
    // the store reconciles derived records from the one replay, so
    // the stale record is replaced by the replay's deterministic-id
    // record before the page planner (computed from the pre-update
    // snapshot) even runs; its update arm lands on a gone id and
    // no-ops. Content and count are what the flow guarantees.
    expect(after.prs[0]).toMatchObject({
      id: 'pr-auto-bench-press-2026-11-02-1rm-10-5',
      weightKg: 10,
      oneRepMax: 11.7,
      isBaseline: true,
    });
  });

  it('updateWorkout clamps an out-of-range set weight at the boundary', () => {
    const store = useStore.getState();
    store.addWorkout(mkWorkout([mkSet({ weight: 100 })]));
    store.updateWorkout('wk1', {
      exercises: [{ name: 'Bench Press', sets: [mkSet({ weight: 9999 })] }],
    });
    expect(useStore.getState().workouts[0].exercises[0].sets[0].weight).toBe(500);
  });
});

describe('edit surfaces (source pins)', () => {
  const workoutPage = readFileSync('src/components/WorkoutPage.tsx', 'utf8');
  const activeScreen = readFileSync('src/components/ActiveWorkoutScreen.tsx', 'utf8');

  it('History renders the set editor and re-evaluates PRs on save', () => {
    expect(workoutPage).toContain('function HistorySetChip');
    expect(workoutPage).toContain('planPRChangesAfterSetEdit({');
    expect(workoutPage).toContain("workout.kind === 'run' && <RunDistanceRow workout={workout} />");
  });

  it('the active session labels logged-set editing and guards pre-fill sync', () => {
    expect(activeScreen).toContain("t('workout.editingLoggedSet'");
    expect(activeScreen).toContain('sourceCompleted');
  });
});
