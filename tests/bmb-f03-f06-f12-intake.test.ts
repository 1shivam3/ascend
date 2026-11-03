/**
 * Regression tests for the Build-my-block audit — PR B
 * (F-03 + F-06 + F-12, intake correctness).
 *
 *  F-03: the intake's 1RM rows used to be "entered lifts OR the four
 *        defaults" — typing the first number made the other three
 *        fields vanish. The row list is now a pure helper the modal
 *        renders from; see topLiftRowNames.
 *  F-06: clearing a prefilled 1RM wrote e1rmKg 0, the engine skipped
 *        the zero entry and fell back to the very PR the user had
 *        just cleared (squat load stayed at the PR-driven weight).
 *  F-12: buildIntakePrefill's provenance notes were computed but
 *        never rendered, and the days note quoted the CLAMPED day
 *        count as the user's own rhythm (7-day trainer told "You
 *        currently train 6 days a week").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/lib/store';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import {
  buildIntakePrefill,
  topLiftRowNames,
  type BlockIntake,
} from '@/lib/block-intake';
import type { WeeklySchedule } from '@/lib/types';

const NULL_SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

const BASE_INTAKE: BlockIntake = {
  goal: 'build_muscle',
  daysPerWeek: 4,
  sessionMinutes: 75,
  equipment: 'full_gym',
  limitations: [],
  experience: 'intermediate',
  topLifts: [],
};

function seedBase(extra: Record<string, unknown> = {}) {
  useStore.setState({
    plannedWorkouts: [],
    weeklySchedule: { ...NULL_SCHEDULE },
    coachBlocks: getInitialCoachBlocksState(),
    athleteModel: null,
    prs: [],
    workouts: [],
    profile: null,
    trainingProfile: null,
    ...extra,
  } as never);
}

beforeEach(() => seedBase());

const squatWeight = (proposal: { days: { exercises: { name: string; targetWeight?: number }[] }[] }) =>
  proposal.days.flatMap((d) => d.exercises).find((e) => e.name === 'Squat')?.targetWeight;

describe('F-03: the four main-lift 1RM rows always render', () => {
  it('no entries yet -> the four main lifts', () => {
    expect(topLiftRowNames([])).toEqual([
      'Squat',
      'Bench Press',
      'Deadlift',
      'Overhead Press',
    ]);
  });

  it('one entered lift -> still all four rows (the F-03 vanishing bug)', () => {
    expect(
      topLiftRowNames([{ name: 'Squat', e1rmKg: 140, source: 'entered' }])
    ).toEqual(['Squat', 'Bench Press', 'Deadlift', 'Overhead Press']);
  });

  it('an extra prefilled lift is appended after the four mains', () => {
    expect(
      topLiftRowNames([
        { name: 'Barbell Row', e1rmKg: 90, source: 'pr' },
        { name: 'squat', e1rmKg: 140, source: 'pr' },
      ])
    ).toEqual(['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row']);
  });
});

describe('F-06: clearing a prefilled 1RM is honored', () => {
  const PRS = [
    {
      id: 'pr1',
      exercise: 'Squat',
      weightKg: 140,
      reps: 1,
      oneRepMax: 140,
      date: '2026-10-01',
      unit: 'kg',
    } as never,
  ];

  function prefillWithPr() {
    seedBase({ prs: PRS });
    return buildIntakePrefill({
      profile: null,
      trainingProfile: null,
      athleteModel: null,
      prs: useStore.getState().prs,
      workouts: [],
    }).intake;
  }

  it('untouched prefill still drives loads from the PR (baseline)', () => {
    const intake = prefillWithPr();
    expect(intake.topLifts).toContainEqual(
      expect.objectContaining({ name: 'Squat', e1rmKg: 140 })
    );
    const s = useStore.getState();
    const withPr = squatWeight(s.proposeCoachBlock(intake));
    seedBase(); // no PRs at all
    const noHistory = squatWeight(s.proposeCoachBlock(BASE_INTAKE));
    expect(withPr).toBeDefined();
    expect(noHistory).toBeDefined();
    expect(withPr).not.toBe(noHistory);
  });

  it('cleared field falls back to the conservative no-history default, NOT the cleared PR', () => {
    const intake = prefillWithPr();
    const s = useStore.getState();
    const prWeight = squatWeight(s.proposeCoachBlock(intake));
    const cleared: BlockIntake = {
      ...intake,
      topLifts: intake.topLifts.map((l) => ({ ...l, e1rmKg: 0, source: 'entered' as const })),
    };
    const clearedWeight = squatWeight(s.proposeCoachBlock(cleared));
    seedBase();
    const noHistory = squatWeight(s.proposeCoachBlock(BASE_INTAKE));
    expect(clearedWeight).toBeDefined();
    expect(clearedWeight).not.toBe(prWeight);
    expect(clearedWeight).toBe(noHistory);
  });

  it('typing a different value still drives the load from the typed value', () => {
    const intake = prefillWithPr();
    const s = useStore.getState();
    const prWeight = squatWeight(s.proposeCoachBlock(intake));
    const typed: BlockIntake = {
      ...intake,
      topLifts: intake.topLifts.map((l) => ({ ...l, e1rmKg: 100, source: 'entered' as const })),
    };
    const typedWeight = squatWeight(s.proposeCoachBlock(typed));
    expect(typedWeight).toBeDefined();
    expect(typedWeight).not.toBe(prWeight);
    expect(typedWeight as number).toBeLessThan(prWeight as number);
  });
});

describe('F-12: prefill notes state the truth', () => {
  const prefillFor = (daysPerWeek: number) =>
    buildIntakePrefill({
      profile: null,
      trainingProfile: { daysPerWeek } as never,
      athleteModel: null,
      prs: [],
      workouts: [],
    });

  it('7-day trainer: note names the real 7 days and the 6-day cap', () => {
    const prefill = prefillFor(7);
    expect(prefill.intake.daysPerWeek).toBe(6);
    const note = prefill.notes.find((n) => n.field === 'daysPerWeek');
    expect(note).toBeDefined();
    expect(note!.text).toContain('7 days a week');
    expect(note!.text).toContain('at most 6');
    expect(note!.text).not.toContain('You currently train 6 days a week');
  });

  it('4-day trainer: note unchanged (keeps that rhythm)', () => {
    const prefill = prefillFor(4);
    const note = prefill.notes.find((n) => n.field === 'daysPerWeek');
    expect(note!.text).toBe(
      'You currently train 4 days a week — the block keeps that rhythm.'
    );
  });

  it('notes exist for days and lifts always, and for goal when it came from the profile', () => {
    const bare = buildIntakePrefill({
      profile: null,
      trainingProfile: null,
      athleteModel: null,
      prs: [],
      workouts: [],
    });
    expect(bare.notes.map((n) => n.field)).toEqual(
      expect.arrayContaining(['daysPerWeek', 'topLifts'])
    );
    const withGoals = buildIntakePrefill({
      profile: { goals: ['Build muscle'] } as never,
      trainingProfile: null,
      athleteModel: null,
      prs: [],
      workouts: [],
    });
    expect(withGoals.notes.map((n) => n.field)).toContain('goal');
  });

  it('a pain-flagged family with no covering chip produces a limitations note', () => {
    const prefill = buildIntakePrefill({
      profile: null,
      trainingProfile: null,
      athleteModel: {
        pain: {
          flaggedFamilies: ['horizontal_push'],
          episodesLast28dByFamily: { horizontal_push: 3 },
        },
      } as never,
      prs: [],
      workouts: [],
    });
    const note = prefill.notes.find((n) => n.field === 'limitations');
    expect(note).toBeDefined();
    expect(note!.text).toContain('excluded from this block');
  });
});
