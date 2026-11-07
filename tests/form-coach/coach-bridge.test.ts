import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCoachChatContext,
  buildCoachChatSystemPrompt,
  serializeFormChecks,
  type CoachChatUserData,
} from '@/lib/coach-chat';
import { buildWeeklyReview, type WeeklyReviewInput } from '@/lib/weekly-review';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { WeeklySchedule } from '@/lib/types';
import { FormSessionRepository } from '@/features/form-coach/repositories/FormSessionRepository';
import type {
  FormRep,
  FormSessionSummary,
} from '@/features/form-coach/models/form-session.types';

// ── Fixtures ──────────────────────────────────────────────────────────────

function rep(over: Partial<FormRep> = {}): FormRep {
  return {
    repNumber: 1,
    startTime: 0,
    endTime: 2300,
    durationSeconds: 2.3,
    descentDurationSeconds: 1.2,
    ascentDurationSeconds: 1.1,
    minKneeAngleDeg: 48,
    estimatedDepth: 'below_parallel',
    maxTorsoInclinationDeg: 36,
    trackingConfidence: 1,
    observations: [],
    isValid: true,
    ...over,
  };
}

function session(over: Partial<FormSessionSummary> = {}): FormSessionSummary {
  return {
    id: 's1',
    exerciseId: 'squat',
    exerciseName: 'Barbell Back Squat',
    analyzerVersion: '1.0.0',
    cameraView: 'left',
    startedAt: new Date('2026-10-13T12:00:00Z').getTime(),
    endedAt: new Date('2026-10-13T12:01:00Z').getTime(),
    durationSeconds: 16,
    totalDetectedReps: 3,
    totalValidReps: 3,
    analysedRepCount: 3,
    averageTrackingConfidence: 1,
    averageRepDurationSeconds: 2.3,
    reps: [
      rep({ repNumber: 1, minKneeAngleDeg: 46, maxTorsoInclinationDeg: 34 }),
      rep({ repNumber: 2, minKneeAngleDeg: 50, maxTorsoInclinationDeg: 38 }),
      rep({ repNumber: 3, minKneeAngleDeg: 48, maxTorsoInclinationDeg: 38 }),
    ],
    observations: [
      {
        id: 'rule-depth-good',
        ruleId: 'rule-depth-good',
        title: 'Target Depth Reached',
        message: 'Good depth',
        severity: 'info',
        count: 3,
        repsTriggered: [1, 2, 3],
      },
    ],
    depthTargetDeg: 90,
    savedToWorkout: false,
    ...over,
  };
}

/** Older session: 2026-10-13, 3 deep reps, tempo 2.3. */
const sessionA = session();
/** Newer session: 2026-10-15, 2 below parallel + 1 parallel, tempo 2.5. */
const sessionB = session({
  id: 's2',
  startedAt: new Date('2026-10-15T12:00:00Z').getTime(),
  endedAt: new Date('2026-10-15T12:01:00Z').getTime(),
  averageRepDurationSeconds: 2.5,
  reps: [
    rep({ repNumber: 1, minKneeAngleDeg: 55, maxTorsoInclinationDeg: 36 }),
    rep({ repNumber: 2, minKneeAngleDeg: 58, maxTorsoInclinationDeg: 40 }),
    rep({ repNumber: 3, minKneeAngleDeg: 88, estimatedDepth: 'parallel', maxTorsoInclinationDeg: 33 }),
  ],
  observations: [
    {
      id: 'rule-depth-good',
      ruleId: 'rule-depth-good',
      title: 'Target Depth Reached',
      message: 'Good depth',
      severity: 'info',
      count: 2,
      repsTriggered: [1, 2],
    },
    {
      id: 'rule-torso-inclination',
      ruleId: 'rule-torso-inclination',
      title: 'Torso Inclination',
      message: 'Lean',
      severity: 'info',
      count: 1,
      repsTriggered: [2],
    },
  ],
});

function emptyUser(): CoachChatUserData {
  return {
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
  };
}

// ── B2/B3: deadlift sessions through the same bridges ────────────────────

function deadliftRep(over: Partial<FormRep> = {}): FormRep {
  return rep({
    durationSeconds: 3.1,
    descentDurationSeconds: 1.6,
    ascentDurationSeconds: 1.5,
    minKneeAngleDeg: 105,
    estimatedDepth: 'unknown',
    maxTorsoInclinationDeg: 52,
    minHipAngleDeg: 64,
    lockoutAchieved: true,
    ...over,
  });
}

function deadliftSession(over: Partial<FormSessionSummary> = {}): FormSessionSummary {
  return session({
    id: 'd1',
    exerciseId: 'deadlift',
    exerciseName: 'Conventional Deadlift',
    startedAt: new Date('2026-10-14T12:00:00Z').getTime(),
    endedAt: new Date('2026-10-14T12:01:00Z').getTime(),
    durationSeconds: 26,
    totalDetectedReps: 4,
    totalValidReps: 3,
    analysedRepCount: 4,
    averageRepDurationSeconds: 3.1,
    reps: [
      deadliftRep({ repNumber: 1, minHipAngleDeg: 62 }),
      deadliftRep({ repNumber: 2, minHipAngleDeg: 66 }),
      deadliftRep({ repNumber: 3, minHipAngleDeg: 70 }),
      deadliftRep({ repNumber: 4, minHipAngleDeg: 68, lockoutAchieved: false, isValid: false, invalidReason: 'Lockout not reached' }),
    ],
    observations: [
      {
        id: 'rule-deadlift-lockout',
        ruleId: 'rule-deadlift-lockout',
        title: 'Lockout Reached',
        message: 'Full lockout',
        severity: 'info',
        count: 3,
        repsTriggered: [1, 2, 3],
      },
    ],
    depthTargetDeg: undefined,
    ...over,
  });
}

/** Older deadlift session: 2026-10-14, 3 lockouts of 4 attempts, tempo 3.1. */
const deadliftA = deadliftSession();
/** Newer deadlift session: 2026-10-16, 3 lockouts of 3, tempo 2.9. */
const deadliftB = deadliftSession({
  id: 'd2',
  startedAt: new Date('2026-10-16T12:00:00Z').getTime(),
  endedAt: new Date('2026-10-16T12:01:00Z').getTime(),
  totalDetectedReps: 3,
  totalValidReps: 3,
  analysedRepCount: 3,
  averageRepDurationSeconds: 2.9,
  reps: [
    deadliftRep({ repNumber: 1, minHipAngleDeg: 60 }),
    deadliftRep({ repNumber: 2, minHipAngleDeg: 63 }),
    deadliftRep({ repNumber: 3, minHipAngleDeg: 66 }),
  ],
});

describe('B2 — deadlift form checks in the coach-chat context', () => {
  it('serializes lockout and hip-angle metrics — never squat depth classes', () => {
    const { lines, evidenceLine } = serializeFormChecks([deadliftA, deadliftB]);
    expect(lines[0]).toBe(
      'Conventional Deadlift — latest Fri, Oct 16, 2026: 3 valid reps; ' +
        'full lockout on 3 of 3 reps; ' +
        'min hip angle 60–66°; max torso lean 52°; avg tempo 2.9s/rep; ' +
        'observations: Lockout Reached'
    );
    expect(lines[1]).toBe(
      'Conventional Deadlift — last 2 checks: full lockout on 6 of 7 reps; avg tempo 3s/rep'
    );
    expect(evidenceLine).toBe(
      'Latest form check: Conventional Deadlift on Fri, Oct 16, 2026 — 3 valid reps, full lockout on 3 of 3 reps (camera-measured)'
    );
    expect(lines.join(' ')).not.toContain('below parallel');
    expect(lines.join(' ')).not.toContain('min knee angle');
  });
});

describe('B3 — deadlift and mixed form-check lines in the weekly review', () => {
  it('deadlift-only week: lockout wording with the deadlift scope label', () => {
    const review = buildWeeklyReview(reviewInput({ formSessions: [deadliftA, deadliftB] }));
    const formLines = review.coachLines.filter((l) => l.startsWith('Form checks:'));
    expect(formLines).toEqual([
      'Form checks: 2 deadlift sessions · full lockout on 6 of 7 reps · avg tempo 3s/rep',
    ]);
  });

  it('mixed week: each exercise counted in its own metric only', () => {
    const review = buildWeeklyReview(reviewInput({ formSessions: [sessionB, deadliftA] }));
    const formLines = review.coachLines.filter((l) => l.startsWith('Form checks:'));
    expect(formLines).toEqual([
      'Form checks: 2 sessions · depth below parallel on 2 of 3 squat reps · full lockout on 3 of 4 deadlift reps · avg tempo 2.8s/rep',
    ]);
  });
});

// ── B1: repository read API ───────────────────────────────────────────────

class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

describe('B1 — FormSessionRepository coach-bridge reads', () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
    // Stored newest-first, as saveSession maintains.
    FormSessionRepository.saveSession(sessionA);
    FormSessionRepository.saveSession(sessionB);
  });

  it('getRecentSessions returns newest first, bounded by the limit', () => {
    const recent = FormSessionRepository.getRecentSessions(5);
    expect(recent.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(FormSessionRepository.getRecentSessions(1).map((s) => s.id)).toEqual(['s2']);
  });

  it('getLatestSessionPerExercise keys the newest session per exercise', () => {
    const latest = FormSessionRepository.getLatestSessionPerExercise();
    expect(latest.get('squat')?.id).toBe('s2');
  });
});

// ── B2: coach-chat context ────────────────────────────────────────────────

describe('B2 — form checks in the coach-chat context', () => {
  it('serializes the latest session with its measured numbers, plus a trend line', () => {
    // Passed oldest-first on purpose: the serializer sorts.
    const { lines, evidenceLine } = serializeFormChecks([sessionA, sessionB]);
    expect(lines[0]).toBe(
      'Barbell Back Squat — latest Thu, Oct 15, 2026: 3 valid reps; ' +
        'depth below parallel 2 of 3, parallel 1, above 0; ' +
        'min knee angle 55–88°; max torso lean 40°; avg tempo 2.5s/rep; ' +
        'observations: Target Depth Reached, Torso Inclination'
    );
    expect(lines[1]).toBe(
      'Barbell Back Squat — last 2 checks: below parallel on 5 of 6 reps; avg tempo 2.4s/rep'
    );
    expect(evidenceLine).toBe(
      'Latest form check: Barbell Back Squat on Thu, Oct 15, 2026 — 3 valid reps, below parallel on 2 of 3 reps (camera-measured)'
    );
  });

  it('adds a FORM CHECKS section and evidence when sessions exist', () => {
    const ctx = buildCoachChatContext(emptyUser(), [sessionA, sessionB]);
    expect(ctx.contextText).toContain('FORM CHECKS (on-device camera measurements');
    expect(ctx.contextText).toContain('below parallel 2 of 3');
    expect(ctx.contextText).toContain('min knee angle 55–88°');
    expect(ctx.evidence.join(' ')).toContain('Latest form check: Barbell Back Squat on Thu, Oct 15, 2026');
    // Form data alone is real personal data: not a cold start.
    expect(ctx.hasData).toBe(true);
    expect(ctx.contextText).not.toContain('NO USER HISTORY YET');
  });

  it('is byte-identical to the pre-bridge output when no sessions exist', () => {
    const user = emptyUser();
    const baseline = buildCoachChatContext(user);
    const explicitEmpty = buildCoachChatContext(user, []);
    expect(explicitEmpty.contextText).toBe(baseline.contextText);
    expect(explicitEmpty.hasData).toBe(baseline.hasData);
    expect(explicitEmpty.evidence).toEqual(baseline.evidence);
    expect(explicitEmpty.missingAreas).toEqual(baseline.missingAreas);
    expect(baseline.contextText).not.toContain('FORM CHECKS');
    expect(baseline.hasData).toBe(false);
  });

  it('prompt guidance allows citing form measurements and forbids diagnosing from them', () => {
    const prompt = buildCoachChatSystemPrompt({ language: 'en', hasData: true });
    expect(prompt).toContain('FORM CHECK DATA');
    expect(prompt).toContain('never diagnose');
    expect(prompt).toContain('never invent form data');
  });
});

// ── B3: weekly review line ────────────────────────────────────────────────

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

describe('B3 — form-check line in the weekly review', () => {
  it('adds ONE measured line aggregating the week’s in-week sessions', () => {
    const review = buildWeeklyReview(reviewInput({ formSessions: [sessionA, sessionB] }));
    const formLines = review.coachLines.filter((l) => l.startsWith('Form checks:'));
    expect(formLines).toEqual([
      'Form checks: 2 squat sessions · depth below parallel on 5 of 6 reps · avg tempo 2.4s/rep',
    ]);
    // Body content only: the focus headline is untouched by form data.
    expect(review.focus.headline).not.toContain('Form');
  });

  it('ignores sessions outside the review week', () => {
    const outside = session({
      id: 's3',
      startedAt: new Date('2026-10-20T12:00:00Z').getTime(),
      endedAt: new Date('2026-10-20T12:01:00Z').getTime(),
    });
    const review = buildWeeklyReview(reviewInput({ formSessions: [outside] }));
    expect(review.coachLines.filter((l) => l.startsWith('Form checks:'))).toEqual([]);
  });

  it('adds nothing when the input carries no form sessions at all', () => {
    const withField = buildWeeklyReview(reviewInput({ formSessions: [] }));
    const withoutField = buildWeeklyReview(reviewInput());
    expect(withField.coachLines).toEqual(withoutField.coachLines);
  });
});
