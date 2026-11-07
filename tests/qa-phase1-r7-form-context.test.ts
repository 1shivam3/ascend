import { describe, it, expect } from 'vitest';
import {
  serializeFormChecks,
  buildCoachChatContext,
  buildCoachChatSystemPrompt,
} from '@/lib/coach-chat';
import { buildWeeklyReview, type WeeklyReviewInput } from '@/lib/weekly-review';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { WeeklySchedule } from '@/lib/types';
import type {
  FormRep,
  FormSessionSummary,
} from '@/features/form-coach/models/form-session.types';

/**
 * QA-hardening R7: the coach must not cite unreliable Form Coach
 * findings. Reps with status 'unverified' (the camera could not
 * judge the deciding criterion — e.g. deadlift lockout landmarks
 * not visible) carry placeholder values, not measurements. They
 * are excluded from every metric and denominator the coach
 * context (and the weekly review) builds, and reported only as a
 * labelled count.
 */

function rep(over: Partial<FormRep> = {}): FormRep {
  return {
    repNumber: 1,
    startTime: 0,
    endTime: 2000,
    durationSeconds: 2,
    descentDurationSeconds: 1,
    ascentDurationSeconds: 1,
    minKneeAngleDeg: 80,
    estimatedDepth: 'below_parallel',
    maxTorsoInclinationDeg: 15,
    trackingConfidence: 1,
    observations: [],
    isValid: true,
    status: 'valid',
    ...over,
  };
}

function session(over: Partial<FormSessionSummary> = {}): FormSessionSummary {
  return {
    id: 's1',
    exerciseId: 'squat',
    exerciseName: 'Squat',
    analyzerVersion: '1.0.0',
    cameraView: 'left',
    startedAt: new Date('2026-11-05T12:00:00Z').getTime(),
    endedAt: new Date('2026-11-05T12:01:00Z').getTime(),
    durationSeconds: 30,
    totalDetectedReps: 3,
    totalValidReps: 3,
    totalUnverifiedReps: 0,
    analysedRepCount: 3,
    averageTrackingConfidence: 1,
    averageRepDurationSeconds: 2,
    reps: [],
    observations: [],
    savedToWorkout: false,
    ...over,
  };
}

describe('R7: verified sessions serialize exactly as before', () => {
  it('an all-valid squat session carries no unverified label', () => {
    const s = session({
      reps: [
        rep({ repNumber: 1, estimatedDepth: 'below_parallel' }),
        rep({ repNumber: 2, estimatedDepth: 'below_parallel' }),
        rep({ repNumber: 3, estimatedDepth: 'parallel' }),
      ],
    });
    const { lines, evidenceLine } = serializeFormChecks([s]);
    expect(lines[0]).toContain('depth below parallel 2 of 3, parallel 1, above 0');
    expect(lines[0]).not.toContain('unverified');
    expect(evidenceLine).toContain('below parallel on 2 of 3 reps (camera-measured)');
  });
});

describe('R7: unverified reps are excluded and labelled (deadlift)', () => {
  const mixed = session({
    id: 'd1',
    exerciseId: 'deadlift',
    exerciseName: 'Deadlift',
    totalDetectedReps: 4,
    totalValidReps: 1,
    totalUnverifiedReps: 2,
    analysedRepCount: 4,
    reps: [
      rep({ repNumber: 1, status: 'valid', isValid: true, lockoutAchieved: true, minHipAngleDeg: 170 }),
      rep({ repNumber: 2, status: 'failed', isValid: false, lockoutAchieved: false, minHipAngleDeg: 175 }),
      // Unverified: placeholders that would poison the hip range and
      // the lockout count if they were treated as measurements.
      rep({ repNumber: 3, status: 'unverified', isValid: false, lockoutAchieved: false, minHipAngleDeg: 5, maxTorsoInclinationDeg: 89 }),
      rep({ repNumber: 4, status: 'unverified', isValid: false, lockoutAchieved: true, minHipAngleDeg: 179, maxTorsoInclinationDeg: 88 }),
    ],
  });

  it('metrics and denominators count verified reps only', () => {
    const { lines, evidenceLine } = serializeFormChecks([mixed]);
    expect(lines[0]).toContain('full lockout on 1 of 2 reps');
    expect(lines[0]).toContain('min hip angle 170–175°');
    expect(lines[0]).toContain('max torso lean 15°');
    expect(lines[0]).not.toContain('of 4 reps');
    expect(evidenceLine).toContain('full lockout on 1 of 2 reps (camera-measured)');
  });

  it('the unverified reps appear only as a labelled count', () => {
    const { lines } = serializeFormChecks([mixed]);
    expect(lines[0]).toContain('plus 2 unverified reps the camera could not judge (not measured)');
  });
});

describe('R7: an unverified-only session yields no citable measurements', () => {
  it('says so plainly, with no camera-measured claim', () => {
    const s = session({
      id: 'd2',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      totalDetectedReps: 2,
      totalValidReps: 0,
      totalUnverifiedReps: 2,
      analysedRepCount: 2,
      reps: [
        rep({ repNumber: 1, status: 'unverified', isValid: false, minHipAngleDeg: 40 }),
        rep({ repNumber: 2, status: 'unverified', isValid: false, minHipAngleDeg: 42 }),
      ],
    });
    const { lines, evidenceLine } = serializeFormChecks([s]);
    expect(lines[0]).toContain('no verified measurements');
    expect(lines[0]).toContain('2 unverified reps the camera could not judge');
    expect(evidenceLine).toContain('no verified measurements');
    expect(evidenceLine).not.toContain('(camera-measured)');
    expect(lines[0]).not.toContain('40–42');
  });
});

describe('R7: the built coach context + system prompt carry the rule', () => {
  it('context section labels unverified reps; the prompt forbids citing them', () => {
    const s = session({
      id: 'd3',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      totalDetectedReps: 2,
      totalValidReps: 1,
      totalUnverifiedReps: 1,
      analysedRepCount: 2,
      reps: [
        rep({ repNumber: 1, status: 'valid', lockoutAchieved: true, minHipAngleDeg: 172 }),
        rep({ repNumber: 2, status: 'unverified', isValid: false, lockoutAchieved: false, minHipAngleDeg: 3 }),
      ],
    });
    const ctx = buildCoachChatContext(
      {
        userName: null,
        bodyweightKg: null,
        unit: 'kg',
        goal: null,
        experience: null,
        daysPerWeek: null,
        athleteFacts: [],
        lifts: [],
        painEpisodes: [],
        flaggedFamilies: [],
        activeBlock: null,
        adoptedPlanNames: [],
        todaySession: null,
        recentWorkouts: [],
        prs: [],
        readiness: null,
        perMuscle: [],
        weeklyReviews: [],
        mealsToday: null,
        macroGoals: null,
        bodyMetricsLatest: null,
        checkinToday: null,
      },
      [s]
    );
    const text = ctx.contextText;
    expect(text).toContain('FORM CHECKS');
    expect(text).toContain('plus 1 unverified rep the camera could not judge (not measured)');
    expect(text).not.toContain('min hip angle 3–');

    const prompt = buildCoachChatSystemPrompt({ language: 'en', hasData: true });
    expect(prompt).toContain('those reps were NOT measured');
    expect(prompt).toContain('never count them as good or bad reps');
  });
});

describe('R7: weekly review form line excludes unverified reps', () => {
  const SCHEDULE: WeeklySchedule = {
    monday: { workoutPlanId: 'p1' },
    tuesday: { workoutPlanId: 'rest' },
    wednesday: { workoutPlanId: 'p1' },
    thursday: { workoutPlanId: 'rest' },
    friday: { workoutPlanId: 'p1' },
    saturday: { workoutPlanId: 'rest' },
    sunday: { workoutPlanId: 'rest' },
  };

  it('squat depth counts verified reps only', () => {
    const inWeek = session({
      id: 'w1',
      startedAt: new Date('2026-10-14T12:00:00Z').getTime(),
      endedAt: new Date('2026-10-14T12:01:00Z').getTime(),
      totalDetectedReps: 3,
      totalValidReps: 2,
      totalUnverifiedReps: 1,
      reps: [
        rep({ repNumber: 1, status: 'valid', estimatedDepth: 'below_parallel' }),
        rep({ repNumber: 2, status: 'valid', estimatedDepth: 'parallel' }),
        rep({ repNumber: 3, status: 'unverified', isValid: false, estimatedDepth: 'below_parallel' }),
      ],
    });
    // Add a batch exercise so the per-exercise composition runs.
    const press = session({
      id: 'w2',
      exerciseId: 'overhead-press',
      exerciseName: 'Overhead Press',
      startedAt: new Date('2026-10-15T12:00:00Z').getTime(),
      endedAt: new Date('2026-10-15T12:01:00Z').getTime(),
      reps: [rep({ repNumber: 1, status: 'valid', lockoutAchieved: true, minElbowAngleDeg: 95 })],
    });
    const input: WeeklyReviewInput = {
      anyDateInWeek: '2026-10-14',
      workouts: [],
      plannedWorkouts: [],
      weeklySchedule: SCHEDULE,
      athleteModel: null,
      coachBlocks: getInitialCoachBlocksState(),
      prs: [],
      dailyCheckins: {},
      policyRecords: [],
      stalls: [],
      unit: 'kg',
      todayStr: '2026-10-19',
      formSessions: [inWeek, press],
    };
    const review = buildWeeklyReview(input);
    const formLine = review.coachLines.find((l) => l.startsWith('Form checks:'));
    expect(formLine).toBeTruthy();
    expect(formLine).toContain('depth below parallel on 1 of 2 squat reps');
    expect(formLine).not.toContain('of 3 squat reps');
  });
});
