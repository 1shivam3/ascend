import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildCoachChatContext,
  serializeFormChecks,
  replaceIsoDatesInReply,
} from '@/lib/coach-chat';
import { formatDate } from '@/lib/formatters';
import * as enModule from '@/lib/i18n/en';
import * as hiModule from '@/lib/i18n/hi';
import type { FormSessionSummary } from '@/features/form-coach/models/form-session.types';

const en = ((enModule as any).en ?? enModule) as Record<string, string>;
const hi = ((hiModule as any).hi ?? hiModule) as Record<string, string>;

/**
 * QA-hardening R11: (a) the block start line duplicated the weekday
 * ("Starts Monday Mon, Nov 9, 2026") because the copy hard-coded
 * "Monday" and formatDate ALSO renders the weekday — the copy now
 * lets the one shared format source carry the weekday. (b) Dates
 * reach the model in display format, and a post-check rewrites any
 * ISO date in model output to the display format.
 */

describe('R11a: no duplicated weekday in the block start line', () => {
  it('the copy no longer hard-codes a weekday (en + hi)', () => {
    expect(en['coachBlock.startsOnShort']).toBe('Starts {date}');
    expect(en['coachBlock.startsOn']).not.toContain('Monday {date}');
    expect(hi['coachBlock.startsOnShort']).toBe('{date} से शुरू');
    expect(hi['coachBlock.startsOn']).not.toContain('सोमवार {date}');
  });

  it('the composed line names the weekday exactly once', () => {
    const line = en['coachBlock.startsOnShort'].replace('{date}', formatDate('2026-11-09'));
    // Re-pinned for QA-hardening R12: formatDate is day-first now.
    expect(line).toBe('Starts Mon, 9 Nov 2026');
    expect(line.match(/mon/gi)).toHaveLength(1);
  });
});

describe('R11b: dates reach the model in display format', () => {
  it("the context renders session/workout/PR/week dates via formatDate", () => {
    const ctx = buildCoachChatContext({
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
      todaySession: { state: 'planned', title: 'Upper A', exercises: ['Bench Press'], date: '2026-10-23' },
      recentWorkouts: [{ date: '2026-10-22', name: 'Upper A', lifts: ['Bench Press'] }],
      prs: [{ exercise: 'Squat', oneRepMax: 100, date: '2026-10-20' }],
      readiness: null,
      perMuscle: [],
      weeklyReviews: [
        { weekMonday: '2026-10-12', focusHeadline: 'Consistency', sessionsCompleted: 4, sessionsPlanned: 4 },
      ],
      mealsToday: null,
      macroGoals: null,
      bodyMetricsLatest: { date: '2026-10-21', weightKg: 80 },
      checkinToday: null,
    } as any);
    // Re-pinned for QA-hardening R12: formatDate is day-first now.
    expect(ctx.contextText).toContain("TODAY'S SESSION (Fri, 23 Oct 2026)");
    expect(ctx.contextText).toContain('Thu, 22 Oct 2026: Upper A');
    expect(ctx.contextText).toContain('Week of Mon, 12 Oct 2026');
    expect(ctx.contextText).not.toContain('2026-10-23');
    expect(ctx.contextText).not.toContain('2026-10-22');
    expect(ctx.contextText).not.toContain('2026-10-12');
  });

  it('form-check lines carry display dates, not ISO', () => {
    const s = {
      id: 'f1',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      analyzerVersion: '1.0.0',
      cameraView: 'left',
      startedAt: new Date('2026-11-05T12:00:00Z').getTime(),
      endedAt: new Date('2026-11-05T12:01:00Z').getTime(),
      durationSeconds: 30,
      totalDetectedReps: 1,
      totalValidReps: 1,
      totalUnverifiedReps: 0,
      analysedRepCount: 1,
      averageTrackingConfidence: 1,
      averageRepDurationSeconds: 2,
      reps: [
        {
          repNumber: 1, startTime: 0, endTime: 2000, durationSeconds: 2,
          descentDurationSeconds: 1, ascentDurationSeconds: 1,
          minKneeAngleDeg: 80, estimatedDepth: 'below_parallel',
          maxTorsoInclinationDeg: 15, trackingConfidence: 1,
          observations: [], isValid: true, status: 'valid',
        },
      ],
      observations: [],
      savedToWorkout: false,
    } as unknown as FormSessionSummary;
    const { lines, evidenceLine } = serializeFormChecks([s]);
    expect(lines[0]).toContain('latest Thu, 5 Nov 2026');
    expect(lines[0]).not.toContain('2026-11-05');
    expect(evidenceLine).toContain('on Thu, 5 Nov 2026');
  });
});

describe('R11b: the reply post-check rewrites ISO dates', () => {
  it('a fixture reply with ISO dates comes out in display format', () => {
    const reply = 'Your next session is 2026-11-09. Compare with 2026-11-02 — same plan.';
    const out = replaceIsoDatesInReply(reply);
    expect(out).toBe('Your next session is Mon, 9 Nov 2026. Compare with Mon, 2 Nov 2026 — same plan.');
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('non-dates and impossible dates are untouched', () => {
    expect(replaceIsoDatesInReply('Set 2026-13-40 aside; aim for 3 sets of 8-12 reps.')).toBe(
      'Set 2026-13-40 aside; aim for 3 sets of 8-12 reps.'
    );
    expect(replaceIsoDatesInReply('No dates here.')).toBe('No dates here.');
  });

  it('the route applies the post-check to model replies', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/ai/coach-chat/route.ts'),
      'utf8'
    );
    expect(route).toContain('reply = replaceIsoDatesInReply(reply);');
  });
});
