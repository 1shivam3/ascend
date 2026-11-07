/**
 * Batch A+B coach-bridge tests: the per-exercise serialization in
 * coach chat and the weekly review generalizes beyond squat and
 * deadlift — each exercise renders its own measured metrics, plank
 * renders its hold. Squat and deadlift rendering is pinned
 * byte-identical by coach-bridge.test.ts and is not repeated here.
 */
import { describe, it, expect } from 'vitest';
import { serializeFormChecks } from '@/lib/coach-chat';
import { buildWeeklyReview, type WeeklyReviewInput } from '@/lib/weekly-review';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { WeeklySchedule } from '@/lib/types';
import type {
  FormRep,
  FormSessionSummary,
} from '@/features/form-coach/models/form-session.types';

function rep(over: Partial<FormRep> = {}): FormRep {
  return {
    repNumber: 1,
    startTime: 0,
    endTime: 2000,
    durationSeconds: 2,
    descentDurationSeconds: 1,
    ascentDurationSeconds: 1,
    minKneeAngleDeg: 0,
    estimatedDepth: 'unknown',
    maxTorsoInclinationDeg: 10,
    trackingConfidence: 1,
    observations: [],
    isValid: true,
    ...over,
  };
}

function session(over: Partial<FormSessionSummary> = {}): FormSessionSummary {
  return {
    id: 'x1',
    exerciseId: 'overhead-press',
    exerciseName: 'Overhead Press',
    analyzerVersion: '1.0.0',
    cameraView: 'left',
    startedAt: new Date('2026-10-16T12:00:00Z').getTime(),
    endedAt: new Date('2026-10-16T12:01:00Z').getTime(),
    durationSeconds: 20,
    totalDetectedReps: 3,
    totalValidReps: 3,
    analysedRepCount: 3,
    averageTrackingConfidence: 1,
    averageRepDurationSeconds: 2,
    reps: [
      rep({ repNumber: 1, minElbowAngleDeg: 95, lockoutAchieved: true, maxTorsoInclinationDeg: 12 }),
      rep({ repNumber: 2, minElbowAngleDeg: 95, lockoutAchieved: true, maxTorsoInclinationDeg: 12 }),
      rep({ repNumber: 3, minElbowAngleDeg: 95, lockoutAchieved: true, maxTorsoInclinationDeg: 12 }),
    ],
    observations: [
      {
        id: 'rule-press-lockout',
        ruleId: 'rule-press-lockout',
        title: 'Lockout Reached',
        message: 'Full lockout',
        severity: 'info',
        count: 3,
        repsTriggered: [1, 2, 3],
      },
    ],
    savedToWorkout: false,
    ...over,
  };
}

const pressA = session();
const pressB = session({
  id: 'x2',
  startedAt: new Date('2026-10-14T12:00:00Z').getTime(),
  endedAt: new Date('2026-10-14T12:01:00Z').getTime(),
});

const plankSession = session({
  id: 'p1',
  exerciseId: 'plank',
  exerciseName: 'Plank',
  totalDetectedReps: 0,
  totalValidReps: 0,
  analysedRepCount: 0,
  averageRepDurationSeconds: 0,
  reps: [],
  holdDurationSeconds: 42,
  alignedHoldPercent: 86,
  observations: [
    {
      id: 'rule-plank-hold-measured',
      ruleId: 'rule-plank-hold-measured',
      title: 'Hold Measured',
      message: 'Held',
      severity: 'info',
      count: 1,
      repsTriggered: [],
    },
  ],
});

describe('batch bridge — coach-chat serialization', () => {
  it('overhead press renders lockout + elbow range, never squat vocabulary', () => {
    const { lines, evidenceLine } = serializeFormChecks([pressB, pressA]);
    expect(lines[0]).toBe(
      'Overhead Press — latest Fri, Oct 16, 2026: 3 valid reps; ' +
        'full lockout on 3 of 3 reps; min elbow angle 95–95°; ' +
        'max torso lean 12°; avg tempo 2s/rep; observations: Lockout Reached'
    );
    expect(lines[1]).toBe(
      'Overhead Press — last 2 checks: 6 valid reps of 6; avg tempo 2s/rep'
    );
    expect(evidenceLine).toBe(
      'Latest form check: Overhead Press on Fri, Oct 16, 2026 — 3 valid reps, full lockout on 3 of 3 reps (camera-measured)'
    );
    expect(lines.join(' ')).not.toContain('below parallel');
  });

  it('plank renders the hold itself — duration and alignment, no reps', () => {
    const { lines, evidenceLine } = serializeFormChecks([plankSession]);
    expect(lines[0]).toBe(
      'Plank — latest Fri, Oct 16, 2026: hold 42s; body line in line 86% of the hold; observations: Hold Measured'
    );
    expect(evidenceLine).toBe(
      'Latest form check: Plank on Fri, Oct 16, 2026 — 42s hold, body line in line 86% of the hold (camera-measured)'
    );
    expect(lines.join(' ')).not.toContain('valid reps');
  });

  it('plank trend reports longest and average hold', () => {
    const older = session({
      ...plankSession,
      id: 'p0',
      startedAt: new Date('2026-10-13T12:00:00Z').getTime(),
      endedAt: new Date('2026-10-13T12:01:00Z').getTime(),
      holdDurationSeconds: 35,
    });
    const { lines } = serializeFormChecks([older, plankSession]);
    expect(lines[1]).toBe('Plank — last 2 checks: longest hold 42s; avg hold 38.5s');
  });

  it('lateral raise renders peak wrist height as progress toward shoulder height', () => {
    const raise = session({
      id: 'r1',
      exerciseId: 'lateral-raise',
      exerciseName: 'Lateral Raise',
      averageRepDurationSeconds: 1.8,
      reps: [
        rep({ repNumber: 1, peakWristHeightRatio: -0.05, maxTorsoInclinationDeg: 8 }),
        rep({ repNumber: 2, peakWristHeightRatio: -0.12, maxTorsoInclinationDeg: 8 }),
        rep({ repNumber: 3, peakWristHeightRatio: 0.02, maxTorsoInclinationDeg: 8 }),
      ],
      observations: [],
    });
    const { lines } = serializeFormChecks([raise]);
    expect(lines[0]).toBe(
      'Lateral Raise — latest Fri, Oct 16, 2026: 3 valid reps; ' +
        'peak wrist height 88–102% of the way to shoulder height; ' +
        'max torso lean 8°; avg tempo 1.8s/rep; observations: none'
    );
  });

  it('a goblet squat session renders through the squat branch under its variant name', () => {
    const goblet = session({
      id: 'g1',
      exerciseId: 'squat',
      exerciseName: 'Goblet Squat',
      averageRepDurationSeconds: 2.4,
      reps: [
        rep({ repNumber: 1, minKneeAngleDeg: 70, estimatedDepth: 'below_parallel', maxTorsoInclinationDeg: 20 }),
        rep({ repNumber: 2, minKneeAngleDeg: 74, estimatedDepth: 'below_parallel', maxTorsoInclinationDeg: 22 }),
        rep({ repNumber: 3, minKneeAngleDeg: 80, estimatedDepth: 'parallel', maxTorsoInclinationDeg: 21 }),
      ],
      observations: [],
    });
    const { lines, evidenceLine } = serializeFormChecks([goblet]);
    expect(lines[0]).toContain('Goblet Squat — latest Fri, Oct 16, 2026: 3 valid reps; depth below parallel 2 of 3');
    expect(evidenceLine).toContain('Goblet Squat on Fri, Oct 16, 2026');
  });
});

// ── Weekly review ─────────────────────────────────────────────────

const SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'p1' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'p1' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'p1' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

function reviewInput(over: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    anyDateInWeek: '2026-10-14', // week Mon 2026-10-12 → Sun 2026-10-18
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
    ...over,
  };
}

const plankInWeek = session({
  ...plankSession,
  id: 'pw',
  startedAt: new Date('2026-10-14T12:00:00Z').getTime(),
  endedAt: new Date('2026-10-14T12:01:00Z').getTime(),
});

describe('batch bridge — weekly review lines', () => {
  it('plank-only week reports the longest hold instead of “no valid reps”', () => {
    const review = buildWeeklyReview(reviewInput({ formSessions: [plankInWeek] }));
    const formLines = review.coachLines.filter((l) => l.startsWith('Form checks:'));
    expect(formLines).toEqual(['Form checks: 1 plank session · longest hold 42s']);
    expect(
      (review.coachLinesI18n ?? []).some((l) => l?.key === 'weeklyReview.coachFormChecksPlank')
    ).toBe(true);
  });

  it('a week mixing squats with a batch exercise composes per-exercise segments', () => {
    const squat = session({
      id: 'sq',
      exerciseId: 'squat',
      exerciseName: 'Barbell Back Squat',
      startedAt: new Date('2026-10-13T12:00:00Z').getTime(),
      endedAt: new Date('2026-10-13T12:01:00Z').getTime(),
      averageRepDurationSeconds: 2.4,
      reps: [
        rep({ repNumber: 1, minKneeAngleDeg: 70, estimatedDepth: 'below_parallel' }),
        rep({ repNumber: 2, minKneeAngleDeg: 74, estimatedDepth: 'below_parallel' }),
        rep({ repNumber: 3, minKneeAngleDeg: 80, estimatedDepth: 'parallel' }),
      ],
      observations: [],
    });
    const press = session({
      id: 'pr',
      startedAt: new Date('2026-10-15T12:00:00Z').getTime(),
      endedAt: new Date('2026-10-15T12:01:00Z').getTime(),
    });
    const review = buildWeeklyReview(reviewInput({ formSessions: [squat, press] }));
    const formLines = review.coachLines.filter((l) => l.startsWith('Form checks:'));
    expect(formLines).toEqual([
      'Form checks: 2 sessions · depth below parallel on 2 of 3 squat reps · overhead-press: 3 valid of 3 reps · avg tempo 2.2s/rep',
    ]);
    expect(
      (review.coachLinesI18n ?? []).some((l) => l?.key === 'weeklyReview.coachFormChecksGeneric')
    ).toBe(true);
  });
});
