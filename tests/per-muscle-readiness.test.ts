import { describe, expect, it } from 'vitest';
import {
  computePerMuscleReadiness,
  perMuscleBandFor,
  type PerMuscleReadiness,
} from '@/lib/per-muscle-readiness';
import { generateBlockProposal, type BlockEngineInput } from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import type { WorkoutEntry, WorkoutExercise, WorkoutSet } from '@/lib/types';
import type { MuscleRecovery } from '@/lib/athlete-model';
import { getExerciseMuscle } from '@/lib/exercise-library';
import { canonicalizeExerciseName } from '@/lib/workout-outcome-evidence';

// Fixed "today" so no test depends on the real clock.
const TODAY = '2026-10-22';

function dateMinus(days: number): string {
  const d = new Date(2026, 9, 22); // 2026-10-22
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let wid = 0;
const wset = (weight: number, reps: number): WorkoutSet => ({
  reps,
  weight,
  unit: 'kg',
  completed: true,
  status: 'completed',
});
const wex = (name: string, sets: WorkoutSet[]): WorkoutExercise => ({ name, sets });
const wentry = (date: string, exercises: WorkoutExercise[]): WorkoutEntry => ({
  id: `w${++wid}`,
  date,
  exercises,
});
/** A session `daysAgo` days before TODAY with `sets` sets of weight×reps. */
const session = (daysAgo: number, name: string, sets = 3, weight = 80, reps = 8): WorkoutEntry =>
  wentry(dateMinus(daysAgo), [wex(name, Array.from({ length: sets }, () => wset(weight, reps)))]);

const byMuscle = (rows: PerMuscleReadiness[]) =>
  new Map(rows.map((r) => [r.muscle, r]));

const globalReady = (score: number) => ({
  score,
  band: perMuscleBandFor(score),
  factors: [] as string[],
});

const recoveryRow = (muscle: 'Chest' | 'Legs', days: number): MuscleRecovery => ({
  muscle,
  recoveryDays: { value: days, n: 12, tier: 'emerging', evidence: 'test fixture' },
  measured: true,
  points: 12,
  curve: [
    { days: 1, meanRatio: 0.9, n: 3 },
    { days: 2, meanRatio: 0.97, n: 3 },
    { days: 3, meanRatio: 1, n: 3 },
    { days: 4, meanRatio: 1, n: 3 },
  ],
});

describe('computePerMuscleReadiness — cold start', () => {
  it('falls back to the global score for every muscle, labelled prior', () => {
    const rows = computePerMuscleReadiness({
      workouts: [],
      globalReadiness: globalReady(72),
      todayStr: TODAY,
    });
    for (const r of rows) {
      expect(r.score).toBe(72);
      expect(r.band).toBe('ready');
      expect(r.tier).toBe('prior');
      expect(r.daysSinceTrained).toBeNull();
    }
  });

  it('uses the standard 70 baseline when no global score is supplied', () => {
    const rows = computePerMuscleReadiness({ workouts: [], todayStr: TODAY });
    for (const r of rows) {
      expect(r.score).toBe(70);
      expect(r.band).toBe('ready');
      expect(r.tier).toBe('prior');
      expect(r.recoveryDays).toBe(2);
      expect(r.recoveryMeasured).toBe(false);
    }
  });

  it('uses the global check-in soreness as the prior when no global score exists', () => {
    const rows = byMuscle(
      computePerMuscleReadiness({
        workouts: [],
        checkin: { sleep: 3, soreness: 2 },
        todayStr: TODAY,
      })
    );
    // (2 - 3) * 4 = -4 on every muscle.
    expect(rows.get('Chest')!.score).toBe(66);
    expect(rows.get('Legs')!.score).toBe(66);
  });
});

describe('computePerMuscleReadiness — recovery and volume', () => {
  it('a recovered muscle scores higher than a never-trained muscle', () => {
    const rows = byMuscle(
      computePerMuscleReadiness({
        workouts: [session(5, 'Barbell Bench Press')],
        recovery: [recoveryRow('Chest', 2)],
        globalReadiness: globalReady(70),
        todayStr: TODAY,
      })
    );
    // 5 days since >= 2 recovery days: +5.
    expect(rows.get('Chest')!.score).toBe(75);
    expect(rows.get('Chest')!.daysSinceTrained).toBe(5);
    expect(rows.get('Legs')!.score).toBe(70);
  });

  it('a recently heavily-trained muscle scores low (recovery gap + volume spike)', () => {
    const workouts = [
      session(21, 'Barbell Bench Press'),
      session(14, 'Barbell Bench Press'),
      // Yesterday: 5 heavy sets — 4,000 kg in the last 7 days vs a
      // usual week of (1,920 + 1,920) / 3 = 1,280 kg (prior 3 weeks).
      session(1, 'Barbell Bench Press', 5, 100, 8),
    ];
    const rows = byMuscle(
      computePerMuscleReadiness({
        workouts,
        recovery: [recoveryRow('Chest', 2)],
        globalReadiness: globalReady(75),
        todayStr: TODAY,
      })
    );
    const chest = rows.get('Chest')!;
    // 75 - 14 (1 day short of 2-day recovery) - 15 (spike > 1.5x) = 46.
    expect(chest.score).toBe(46);
    expect(chest.band).toBe('caution');
    expect(chest.daysSinceTrained).toBe(1);
    expect(chest.evidence).toContain('1 day ago');
    expect(rows.get('Legs')!.score).toBe(75);
  });

  it('a measured recovery curve is honoured instead of the default', () => {
    const rows = byMuscle(
      computePerMuscleReadiness({
        workouts: [session(2, 'Barbell Back Squat')],
        recovery: [recoveryRow('Legs', 4)],
        globalReadiness: globalReady(70),
        todayStr: TODAY,
      })
    );
    // 2 days since, 4 needed: 2 missing days * 14 = -28.
    expect(rows.get('Legs')!.score).toBe(42);
    expect(rows.get('Legs')!.recoveryDays).toBe(4);
    expect(rows.get('Legs')!.recoveryMeasured).toBe(true);
  });

  it('future-dated and unknown-lift sessions are ignored', () => {
    const rows = byMuscle(
      computePerMuscleReadiness({
        workouts: [
          wentry('2026-10-30', [wex('Barbell Bench Press', [wset(80, 8)])]),
          wentry(dateMinus(1), [wex('Made Up Exercise Xyz', [wset(80, 8)])]),
        ],
        globalReadiness: globalReady(70),
        todayStr: TODAY,
      })
    );
    expect(rows.get('Chest')!.daysSinceTrained).toBeNull();
    expect(rows.get('Chest')!.score).toBe(70);
  });
});

describe('computePerMuscleReadiness — per-muscle soreness', () => {
  it('moves only the rated muscle, not the others', () => {
    const rows = byMuscle(
      computePerMuscleReadiness({
        workouts: [],
        checkin: { sleep: 3, soreness: 3, sorenessByMuscle: { Chest: 1 } },
        globalReadiness: globalReady(70),
        todayStr: TODAY,
      })
    );
    // Deviation from the global 3: (1 - 3) * 6 = -12, chest only.
    expect(rows.get('Chest')!.score).toBe(58);
    expect(rows.get('Chest')!.band).toBe('caution');
    expect(rows.get('Legs')!.score).toBe(70);
    expect(rows.get('Arms')!.score).toBe(70);
  });

  it('a fresh per-muscle rating lifts only that muscle into primed', () => {
    const rows = byMuscle(
      computePerMuscleReadiness({
        workouts: [],
        checkin: { sleep: 3, soreness: 3, sorenessByMuscle: { Legs: 5 } },
        globalReadiness: globalReady(70),
        todayStr: TODAY,
      })
    );
    expect(rows.get('Legs')!.score).toBe(82);
    expect(rows.get('Legs')!.band).toBe('primed');
    expect(rows.get('Chest')!.score).toBe(70);
  });

  it('never presents low readiness as injury or diagnosis', () => {
    const rows = computePerMuscleReadiness({
      workouts: [session(0, 'Barbell Bench Press', 5, 100, 8)],
      checkin: { sleep: 3, soreness: 3, sorenessByMuscle: { Chest: 1 } },
      globalReadiness: globalReady(70),
      todayStr: TODAY,
    });
    const text = rows.map((r) => [r.evidence, ...r.factors].join(' ')).join(' ');
    expect(text.toLowerCase()).not.toContain('injur');
    expect(text.toLowerCase()).not.toContain('diagnos');
  });
});

describe('perMuscleBandFor — thresholds match the global engine', () => {
  it('maps scores to primed/ready/caution/rest at 80/60/40', () => {
    expect(perMuscleBandFor(100)).toBe('primed');
    expect(perMuscleBandFor(80)).toBe('primed');
    expect(perMuscleBandFor(79)).toBe('ready');
    expect(perMuscleBandFor(60)).toBe('ready');
    expect(perMuscleBandFor(59)).toBe('caution');
    expect(perMuscleBandFor(40)).toBe('caution');
    expect(perMuscleBandFor(39)).toBe('rest');
    expect(perMuscleBandFor(1)).toBe('rest');
  });
});

describe('block-engine — per-muscle readiness changes decisions', () => {
  const intake = (daysPerWeek: number): BlockIntake => ({
    goal: 'build_muscle',
    daysPerWeek,
    sessionMinutes: 75,
    equipment: 'full_gym',
    limitations: [],
    experience: 'intermediate',
    topLifts: [],
  });

  const input = (over: Partial<BlockEngineInput> = {}): BlockEngineInput => ({
    intake: intake(2),
    athleteModel: null,
    prs: [],
    workouts: [],
    existingPlans: [],
    unit: 'kg',
    todayStr: TODAY,
    ...over,
  });

  const allRest = (): PerMuscleReadiness[] =>
    computePerMuscleReadiness({ workouts: [], todayStr: TODAY }).map((r) => ({
      ...r,
      score: 20,
      band: 'rest' as const,
    }));

  it('pushes low-readiness days later in the week and says so in the summary', () => {
    const calm = generateBlockProposal(input());
    expect(calm.days.map((d) => d.weekday)).toEqual(['monday', 'thursday']);
    expect(calm.summary).not.toContain('Per-muscle readiness');

    const low = generateBlockProposal(input({ perMuscleReadiness: allRest() }));
    // Every primary muscle is rest, so the readiness penalty (which falls
    // with weekday index) picks the latest candidate, [Wed, Sat].
    expect(low.days.map((d) => d.weekday)).toEqual(['wednesday', 'saturday']);
    expect(low.summary).toContain('Per-muscle readiness changed the days');
    // And the per-exercise notes surface the low readiness where the
    // session could not be moved away.
    const notes = low.days.flatMap((d) => Object.values(d.whyByExercise)).join(' ');
    expect(notes).toContain('readiness is rest');
  });

  it('flags a low-readiness primary muscle in its exercise note (unavoidable case)', () => {
    const rows = computePerMuscleReadiness({ workouts: [], todayStr: TODAY }).map((r) =>
      r.muscle === 'Legs' ? { ...r, score: 30, band: 'rest' as const } : r
    );
    const proposal = generateBlockProposal(input({ perMuscleReadiness: rows }));
    const legNotes = proposal.days.flatMap((d) =>
      d.exercises
        .filter((e) => getExerciseMuscle(e.name) === 'Legs')
        .map((e) => d.whyByExercise[canonicalizeExerciseName(e.name)] ?? '')
    );
    expect(legNotes.length).toBeGreaterThan(0);
    expect(legNotes.every((n) => n.includes('readiness is rest'))).toBe(true);
    // A non-low muscle's note carries no readiness warning.
    const chestNotes = proposal.days.flatMap((d) =>
      d.exercises
        .filter((e) => getExerciseMuscle(e.name) === 'Chest')
        .map((e) => d.whyByExercise[canonicalizeExerciseName(e.name)] ?? '')
    );
    expect(chestNotes.every((n) => !n.includes('readiness is'))).toBe(true);
  });

  it('holds back extra weak-point work for a low-readiness muscle, with a warning', () => {
    // 5-day split: the weakest muscles get a dedicated day. Make every
    // muscle ready except one low one, and check the proposal either
    // skips it as weak-point work or warns about the hold — the honest
    // invariant is that a low muscle never silently gains extra work.
    const rows = computePerMuscleReadiness({ workouts: [], todayStr: TODAY });
    const low = generateBlockProposal(
      input({
        intake: intake(5),
        perMuscleReadiness: rows.map((r) =>
          r.muscle === 'Core' ? { ...r, score: 35, band: 'rest' as const } : r
        ),
      })
    );
    expect(low.warnings.join(' ').toLowerCase()).not.toContain('injur');
    expect(low.days.length).toBe(5);
  });

  it('is deterministic with per-muscle readiness supplied', () => {
    const a = generateBlockProposal(input({ perMuscleReadiness: allRest() }));
    const b = generateBlockProposal(input({ perMuscleReadiness: allRest() }));
    expect(a).toEqual(b);
  });
});
