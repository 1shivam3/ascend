/**
 * Regression tests for the Build-my-block audit — PR E
 * (F-08 + F-09, honest numbers and copy).
 *
 *  F-08: estimateSessionMinutes returns a hardcoded 45 for an empty
 *        exercise list, so under a heavy-limitation intake the review
 *        showed empty days as "~45m" sessions — and the block
 *        summary still claimed "6 days a week" when 4 of the 6 days
 *        had no exercises at all. (estimateSessionMinutes itself is
 *        shared with other features and keeps its default; the block
 *        generator now reports 0 for empty days and counts LIVE days
 *        in the summary.)
 *  F-09: the review said "The block starts Monday {date}" while
 *        approving rewrote the CURRENT week's schedule immediately,
 *        and the Coach card clamped the pre-start label to
 *        "Week 1 of N". Copy now agrees with the behavior (the least
 *        product change): approval applies straight away; the first
 *        full week starts Monday.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/lib/store';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import { translate } from '@/lib/i18n';
import { formatDate } from '@/lib/formatters';
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

describe('F-08: empty days carry no phantom duration and the summary counts live days', () => {
  it('audit extreme case: 6 days requested, heavy limitations, bodyweight, 30 min', () => {
    const proposal = useStore.getState().proposeCoachBlock({
      ...BASE_INTAKE,
      daysPerWeek: 6,
      sessionMinutes: 30,
      equipment: 'bodyweight_only',
      limitations: ['Knee', 'Low back problems', 'Shoulder', 'Wrist'],
    });
    const emptyDays = proposal.days.filter((d) => d.exercises.length === 0);
    const liveDays = proposal.days.filter((d) => d.exercises.length > 0);
    // The audit observed 4 of 6 days empty on this intake; the exact
    // count may drift with the exercise library, but empties must
    // exist for this test to mean anything.
    expect(emptyDays.length).toBeGreaterThan(0);
    for (const day of emptyDays) {
      expect(day.estimatedMinutes).toBe(0);
    }
    for (const day of liveDays) {
      expect(day.estimatedMinutes).toBeGreaterThan(0);
    }
    expect(proposal.summary).toContain(`${liveDays.length} days a week`);
    if (liveDays.length !== 6) {
      expect(proposal.summary).not.toContain('6 days a week');
    }
  });

  it('ordinary intake: every day live, minutes positive, summary counts them', () => {
    const proposal = useStore.getState().proposeCoachBlock(BASE_INTAKE);
    const liveDays = proposal.days.filter((d) => d.exercises.length > 0);
    expect(liveDays.length).toBe(4);
    for (const day of liveDays) {
      expect(day.estimatedMinutes).toBeGreaterThan(0);
    }
    expect(proposal.summary).toContain('4 days a week');
  });
});

describe('F-09: copy agrees with the immediate-apply behavior', () => {
  it('startsOn says approval applies straight away, first full week Monday', () => {
    // Re-pinned for QA-hardening R11: the copy no longer hard-codes
    // the weekday (it duplicated formatDate's). The fixture passes
    // the date exactly as the real call site does — display format.
    const en = translate('en', 'coachBlock.startsOn', { date: formatDate('2026-11-09') });
    expect(en).toContain('straight away');
    // Re-pinned for QA-hardening R12: formatDate is day-first now.
    expect(en).toContain('first full week starts Mon, 9 Nov 2026');
    expect(en).not.toContain('The block starts Monday');
  });

  it('startsOn resolves in Hindi with the date substituted', () => {
    const hi = translate('hi', 'coachBlock.startsOn', { date: '2026-11-09' });
    expect(hi).not.toBe('coachBlock.startsOn');
    expect(hi).toContain('2026-11-09');
  });

  it('the Coach card pre-start label key resolves in both locales', () => {
    expect(translate('en', 'coachBlock.startsOnShort', { date: '2026-11-09' })).toContain(
      '2026-11-09'
    );
    const hi = translate('hi', 'coachBlock.startsOnShort', { date: '2026-11-09' });
    expect(hi).not.toBe('coachBlock.startsOnShort');
    expect(hi).toContain('2026-11-09');
  });
});
