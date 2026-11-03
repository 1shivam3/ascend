/**
 * Regression tests for the Build-my-block audit — PR C (F-04,
 * limitation honesty).
 *
 * F-04: the "Other" limitation chip (and any free-text limitation the
 * ban tables don't know) mapped to zero banned families and zero
 * banned joints — it changed nothing about the generated block, while
 * the intake hint promised "Anything ticked here is kept out of the
 * block". The proposal must now carry a visible warning naming any
 * limitation that couldn't be auto-applied, and the hint copy no
 * longer overpromises. Named chips keep working exactly as before.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/lib/store';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import { translate } from '@/lib/i18n';
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

beforeEach(() => {
  useStore.setState({
    plannedWorkouts: [],
    weeklySchedule: { ...NULL_SCHEDULE },
    coachBlocks: getInitialCoachBlocksState(),
    athleteModel: null,
    prs: [],
    workouts: [],
    profile: null,
    trainingProfile: null,
  } as never);
});

const propose = (limitations: string[]) =>
  useStore.getState().proposeCoachBlock({ ...BASE_INTAKE, limitations });

const inertWarnings = (warnings: string[], name: string) =>
  warnings.filter((w) => w.includes(`"${name}"`) && w.includes("hasn't removed"));

describe('F-04: limitations that cannot be auto-applied are named, not silent', () => {
  it('"Other" produces a visible proposal warning naming it', () => {
    const proposal = propose(['Other']);
    const hits = proposal.warnings.filter(
      (w) => w.includes('"Other"') && w.includes("hasn't removed any exercises")
    );
    expect(hits.length).toBe(1);
  });

  it('an unmapped free-text limitation is flagged the same way', () => {
    const proposal = propose(['Tingling in my left pinky finger']);
    expect(
      proposal.warnings.some(
        (w) => w.includes('"Tingling in my left pinky finger"') && w.includes("hasn't removed")
      )
    ).toBe(true);
  });

  it('a named chip (Knee) produces NO inert warning — it really applies', () => {
    const proposal = propose(['Knee']);
    expect(inertWarnings(proposal.warnings, 'Knee')).toEqual([]);
  });

  it('mixed intake: only the inert one is flagged', () => {
    const proposal = propose(['Knee', 'Other', 'Low back problems']);
    const flagged = proposal.warnings.filter((w) => w.includes("hasn't removed"));
    expect(flagged.length).toBe(1);
    expect(flagged[0]).toContain('"Other"');
  });

  it('no limitations -> no inert warnings', () => {
    const proposal = propose([]);
    expect(proposal.warnings.filter((w) => w.includes("hasn't removed"))).toEqual([]);
  });

  it('the intake hint copy no longer promises "Other" is kept out', () => {
    const en = translate('en', 'coachBlock.limitationsHint');
    expect(en).toContain('"Other" can\'t be applied automatically');
    const hi = translate('hi', 'coachBlock.limitationsHint');
    expect(hi).not.toBe('coachBlock.limitationsHint'); // key resolves
    expect(hi.length).toBeGreaterThan(0);
  });
});
