import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/lib/store';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import type { WeeklySchedule } from '@/lib/types';
import {
  calculateAgeFromDob,
  dobPickerBounds,
  isValidDob,
  parseDob,
} from '@/lib/age';
import { CANONICAL_DELETION_ORIGIN, resolveDeletionOrigin } from '@/lib/deletion-mailer';
import { getClientIp } from '@/lib/rate-limit';
import { createDeletionToken } from '@/lib/deletion-token';
import { DEFAULT_AI_DAILY_GLOBAL_CAP } from '@/lib/ai-provider';

/**
 * Combined review round 2026-10-26 (branch review/onboarding-security-ux).
 *
 * Track E simulation + regression tests for tracks A (DOB), B (minimal
 * onboarding chain), D (coach per goal) and F (security fixes). The
 * simulation runs at store level: onboarding UI components need a DOM and
 * this suite runs in node, so the chain asserted here is minimal profile
 * (name + gender + DOB-derived age + defaults) -> coach block proposal ->
 * approve -> log workout + meal. The component flow itself is verified
 * by the parent's live preview check, not claimed here.
 */

const NULL_SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

function seedBase() {
  useStore.setState({
    plannedWorkouts: [],
    weeklySchedule: { ...NULL_SCHEDULE },
    coachBlocks: getInitialCoachBlocksState(),
    athleteModel: null,
    prs: [],
    workouts: [],
    meals: [],
    profile: null,
  } as never);
}

/** Minimal profile the new onboarding produces: name, gender, DOB only. */
function seedMinimalProfile() {
  const dob = '2001-05-15';
  const age = calculateAgeFromDob(dob, new Date(2026, 9, 26));
  expect(age).toBe(25);
  useStore.setState({
    profile: {
      name: 'Sim User',
      gender: 'male',
      dateOfBirth: dob,
      age,
      unit: 'kg',
      weight: 70,
      heightCm: 175,
    },
  } as never);
}

beforeEach(seedBase);

describe('Track A/B: DOB -> age calculation', () => {
  it('calculates age from DOB on the birthday and the day before', () => {
    expect(calculateAgeFromDob('2001-10-26', new Date(2026, 9, 26))).toBe(25);
    expect(calculateAgeFromDob('2001-10-27', new Date(2026, 9, 26))).toBe(24);
  });

  it('Feb 29 birthdays roll to Mar 1 in non-leap years', () => {
    expect(calculateAgeFromDob('2000-02-29', new Date(2026, 1, 28))).toBe(25);
    expect(calculateAgeFromDob('2000-02-29', new Date(2026, 2, 1))).toBe(26);
    expect(calculateAgeFromDob('2000-02-29', new Date(2024, 1, 29))).toBe(24);
  });

  it('rejects future, impossible, and malformed DOBs', () => {
    expect(calculateAgeFromDob('2030-01-01', new Date(2026, 9, 26))).toBeNull();
    expect(calculateAgeFromDob('2026-10-27', new Date(2026, 9, 26))).toBeNull();
    expect(calculateAgeFromDob('2023-02-30', new Date(2026, 9, 26))).toBeNull();
    expect(calculateAgeFromDob('2001-13-01', new Date(2026, 9, 26))).toBeNull();
    expect(calculateAgeFromDob('not-a-date', new Date(2026, 9, 26))).toBeNull();
    expect(calculateAgeFromDob('', new Date(2026, 9, 26))).toBeNull();
    expect(parseDob('2023-02-30')).toBeNull();
    expect(isValidDob('2001-05-15')).toBe(true);
    expect(isValidDob('2023-02-30')).toBe(false);
  });

  it('picker bounds mirror the old 13-120 age rule', () => {
    expect(dobPickerBounds(new Date(2026, 9, 26))).toEqual({
      min: '1906-10-26',
      max: '2013-10-26',
    });
    // Onboarding blocks: under 13 and over 120.
    expect(calculateAgeFromDob('2014-10-26', new Date(2026, 9, 26))).toBe(12);
    expect(calculateAgeFromDob('1905-10-26', new Date(2026, 9, 26))).toBe(121);
  });
});

describe('Track E: per-goal simulation (minimal onboarding -> coach block -> Today)', () => {
  const GOALS = [
    'build_muscle',
    'get_stronger',
    'lose_fat',
    'stamina',
    'general_fitness',
  ] as const;

  for (const goal of GOALS) {
    it(`${goal}: proposal has 4 full days, approves to plans, workout + meal log`, () => {
      seedMinimalProfile();
      const intake: BlockIntake = {
        goal,
        daysPerWeek: 4,
        sessionMinutes: 60,
        equipment: 'full_gym',
        limitations: [],
        experience: 'intermediate',
        topLifts: [],
      };
      const s = useStore.getState();
      const proposal = s.proposeCoachBlock(intake);
      // Old shape was ~2 exercises/day after trimming; the new floor is 4.
      expect(proposal.days).toHaveLength(4);
      for (const day of proposal.days) {
        expect(day.exercises.length).toBeGreaterThanOrEqual(4);
        expect(day.estimatedMinutes).toBeGreaterThan(0);
      }
      expect(proposal.warnings).toHaveLength(0);

      const approved = useStore.getState().approveBlockProposal();
      expect(approved).toBe(true);
      const after = useStore.getState();
      expect(after.plannedWorkouts.length).toBeGreaterThanOrEqual(4);
      expect(
        Object.values(after.weeklySchedule).some((v) => v.workoutPlanId !== 'rest'),
      ).toBe(true);

      after.addWorkout({
        id: `w-sim-${goal}`,
        name: after.plannedWorkouts[0].name,
        planId: after.plannedWorkouts[0].id,
        date: '2026-10-26',
        duration: 60,
        exercises: [],
      } as never);
      after.addMeal({
        id: `m-sim-${goal}`,
        name: 'Sim Meal',
        date: '2026-10-26',
        foods: [{ name: 'Rice', calories: 300, proteinG: 6, carbsG: 65, fatG: 1 }],
      } as never);
      const final = useStore.getState();
      expect(final.workouts).toHaveLength(1);
      expect(final.meals).toHaveLength(1);
    });
  }

  it('goal rep schemes differ: strength stays low-rep, stamina high-rep', () => {
    const mk = (goal: BlockIntake['goal']) => {
      seedBase();
      const p = useStore.getState().proposeCoachBlock({
        goal,
        daysPerWeek: 4,
        sessionMinutes: 60,
        equipment: 'full_gym',
        limitations: [],
        experience: 'intermediate',
        topLifts: [],
      });
      return p.days.flatMap((d) => d.exercises.map((e) => e.targetReps));
    };
    const strengthReps = mk('get_stronger');
    const staminaReps = mk('stamina');
    expect(Math.min(...strengthReps)).toBeLessThanOrEqual(6);
    expect(Math.max(...staminaReps)).toBeGreaterThanOrEqual(12);
  });

  it('approving an empty proposal creates nothing and returns false', () => {
    seedBase();
    // No proposal pending at all: approve must refuse, not crash.
    const s = useStore.getState();
    expect(s.approveBlockProposal()).toBe(false);
    expect(useStore.getState().plannedWorkouts).toHaveLength(0);
  });
});

describe('Track F: security regressions', () => {
  const SAVED_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it('deletion origin allowlist: canonical passes, lookalikes fall back', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    expect(resolveDeletionOrigin('https://ascendtonext.vercel.app')).toBe(
      CANONICAL_DELETION_ORIGIN,
    );
    expect(resolveDeletionOrigin('https://ascendtonext.vercel.app.evil.com')).toBe(
      CANONICAL_DELETION_ORIGIN,
    );
    expect(resolveDeletionOrigin('http://ascendtonext.vercel.app')).toBe(
      CANONICAL_DELETION_ORIGIN,
    );
    expect(resolveDeletionOrigin('not a url')).toBe(CANONICAL_DELETION_ORIGIN);
    expect(resolveDeletionOrigin(undefined)).toBe(CANONICAL_DELETION_ORIGIN);
  });

  it('client IP: XFF first entry only; spoofed CDN headers ignored', () => {
    const req = new Request('http://x/', {
      headers: {
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        'cf-connecting-ip': '198.51.100.99',
        'x-real-ip': '198.51.100.98',
      },
    });
    expect(getClientIp(req)).toBe('203.0.113.7');

    const spoofed = new Request('http://x/', {
      headers: { 'cf-connecting-ip': '198.51.100.99', 'x-real-ip': '198.51.100.98' },
    });
    expect(getClientIp(spoofed)).toBe('127.0.0.1');

    const garbage = new Request('http://x/', {
      headers: { 'x-forwarded-for': 'not-an-ip' },
    });
    expect(getClientIp(garbage)).toBe('127.0.0.1');
  });

  it('deletion tokens refuse to sign without a configured secret', () => {
    delete process.env.SUPABASE_DELETION_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.CRON_SECRET;
    delete process.env.APP_SECRET;
    expect(() => createDeletionToken('u1', 'a@b.c')).toThrow(/not configured/);
  });

  it('AI global daily cap default is 500, not 2000', () => {
    expect(DEFAULT_AI_DAILY_GLOBAL_CAP).toBe(500);
  });
});
