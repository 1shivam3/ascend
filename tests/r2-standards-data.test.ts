/**
 * Round-2 persona regression tests — standards honesty + data integrity.
 *
 * ADITYA-2/3 (proxy standards, muscle classification), KAVYA-2 (plyo
 * classification), ROHAN-2/4/5 (import determinism, session grouping,
 * big-three purity), DEEPA-2/3/6 (share payload, unified backup,
 * import dedup), coach auto-regulation pain wiring.
 */
import { describe, it, expect } from 'vitest';
import {
  getExerciseMuscle,
  registerCustomExerciseMuscle,
} from '../src/lib/exercise-library';
import { getLiftLevel, getNextLevelInfo } from '../src/lib/strength-standards';
import { getBigThreeStats } from '../src/lib/dots';
import { parseWorkoutCSV } from '../src/lib/workout-import';
import {
  encodeProgramForSharing,
  decodeProgramFromHash,
  findDuplicateProgram,
  programContentSignature,
} from '../src/lib/program-sharing';
import { buildFullBackup } from '../src/lib/storage';
import { adjustNextTargets } from '../src/lib/coach-engine';
import type { PlannedWorkout, PersonalRecord, WorkoutEntry } from '../src/lib/types';

describe('muscle classification (ADITYA-3 / KAVYA-2)', () => {
  it('Olympic lifts are leg/hip power, not shoulders', () => {
    expect(getExerciseMuscle('Clean and Press')).toBe('Legs');
    expect(getExerciseMuscle('Power Clean')).toBe('Legs');
  });
  it('Nordic curls are hamstring work, not arms', () => {
    expect(getExerciseMuscle('Nordic Curl')).toBe('Legs');
  });
  it('glute work is legs, not the Chest fallthrough', () => {
    expect(getExerciseMuscle('Glute Bridge')).toBe('Legs');
  });
  it('plyometrics and sled work are legs, not chest', () => {
    expect(getExerciseMuscle('Box Jump')).toBe('Legs');
    expect(getExerciseMuscle('Depth Jump')).toBe('Legs');
    expect(getExerciseMuscle('Sled Push')).toBe('Legs');
  });
  it('the hop rule does not swallow woodchoppers', () => {
    expect(getExerciseMuscle('Woodchopper')).toBe('Core');
  });
  it('a user-declared custom muscle beats keyword guessing', () => {
    registerCustomExerciseMuscle('My Weird Curl', 'Legs');
    expect(getExerciseMuscle('My Weird Curl')).toBe('Legs');
  });
});

describe('strength standard honesty (ADITYA-2)', () => {
  it('a chest machine is estimated from a CHEST standard, never Leg Press', () => {
    const info = getNextLevelInfo('Pec Deck', 20, 80, 'male');
    expect(info.standardNote || '').toContain('Chest Fly');
    expect(info.isStandardUnavailable).toBeFalsy();
  });
  it('an exercise with no same-muscle standard is flagged unavailable', () => {
    const level = getLiftLevel('Russian Twist', 20, 80, 'male');
    expect(level.isStandardUnavailable).toBe(true);
    expect(level.standardNote).toBeTruthy();
  });
  it('known lifts with real standards are unaffected', () => {
    const level = getLiftLevel('Bench Press', 100, 80, 'male');
    expect(level.isStandardUnavailable).toBeFalsy();
    expect(level.level).toBeGreaterThan(1);
  });
});

describe('big-three purity (ROHAN-5)', () => {
  const pr = (exercise: string, oneRepMax: number): PersonalRecord => ({
    id: `pr_${exercise}`,
    exercise,
    weightKg: oneRepMax,
    weightLbs: oneRepMax * 2.20462,
    reps: 1,
    oneRepMax,
    date: '2026-10-01',
  });
  it('dumbbell and goblet variants never inflate the powerlifting total', () => {
    const stats = getBigThreeStats([
      pr('Dumbbell Bench Press', 60),
      pr('Goblet Squat', 70),
      pr('Barbell Bench Press', 100),
      pr('Back Squat', 140),
      pr('Deadlift', 180),
    ]);
    expect(stats.benchMax).toBe(100);
    expect(stats.squatMax).toBe(140);
    expect(stats.deadliftMax).toBe(180);
    expect(stats.totalKg).toBe(420);
    expect(stats.isComplete).toBe(true);
  });
});

const CSV = [
  'Date,Workout Name,Duration,Exercise,Weight,Reps,RPE',
  '2026-10-01 08:00:00,Morning Lift,1:05:00,Bench Press,100,5,8',
  '2026-10-01 08:00:00,Morning Lift,1:05:00,Bench Press,100,5,8',
  '2026-10-01 18:30:00,Evening Lift,45:00,Squat,140,3,',
].join('\n');

describe('CSV import integrity (ROHAN-2 / ROHAN-4)', () => {
  it('produces deterministic ids — re-importing the same file is a no-op', () => {
    const a = parseWorkoutCSV(CSV);
    const b = parseWorkoutCSV(CSV);
    expect(a.workouts.map((w) => w.id)).toEqual(b.workouts.map((w) => w.id));
    expect(a.newPRs.map((p) => p.id)).toEqual(b.newPRs.map((p) => p.id));
  });
  it('keeps AM and PM sessions separate and uses name + duration columns', () => {
    const result = parseWorkoutCSV(CSV);
    expect(result.workouts).toHaveLength(2);
    const morning = result.workouts.find((w) => w.name === 'Morning Lift');
    const evening = result.workouts.find((w) => w.name === 'Evening Lift');
    expect(morning?.durationMinutes).toBe(65);
    expect(evening?.durationMinutes).toBe(45);
  });
});

describe('program sharing completeness (DEEPA-2 / DEEPA-6)', () => {
  const sharedPlan: PlannedWorkout = {
    id: 'plan_x',
    name: 'Coach Week 3',
    createdAt: '2026-10-01T00:00:00.000Z',
    description: 'Deload next week',
    goalTag: 'strength',
    exercises: [
      {
        name: 'Bench Press',
        targetSets: 4,
        targetReps: 6,
        targetWeight: 80,
        targetUnit: 'kg',
        targetRpe: 8,
        notes: 'Pause 1s',
      },
    ],
  };
  it('round-trips RPE, description and goal tag instead of dropping them', () => {
    const decoded = decodeProgramFromHash(
      encodeProgramForSharing(sharedPlan, 'Coach D', 'Add weight only if clean')
    );
    expect(decoded).not.toBeNull();
    expect(decoded!.exercises[0].targetRpe).toBe(8);
    expect(decoded!.exercises[0].notes).toBe('Pause 1s');
    expect(decoded!.description).toBe('Deload next week');
    expect(decoded!.goalTag).toBe('strength');
    expect(decoded!.notes).toBe('Add weight only if clean');
  });
  it('detects a duplicate import by content, not by id', () => {
    const decoded = decodeProgramFromHash(encodeProgramForSharing(sharedPlan))!;
    const existing: PlannedWorkout = {
      ...sharedPlan,
      id: 'a_completely_different_id',
    };
    expect(findDuplicateProgram([existing], decoded)?.id).toBe('a_completely_different_id');
    expect(
      programContentSignature(existing.name, existing.exercises)
    ).toBe(programContentSignature(decoded.name, decoded.exercises));
  });
});

describe('unified backup (DEEPA-3)', () => {
  it('one builder carries schedule, prefs, training profile, logs and photos', () => {
    const backup = buildFullBackup(
      {
        profile: { id: 'u1' },
        workouts: [],
        weeklySchedule: { monday: { workoutPlanId: 'p1' } },
        uiPreferences: { coachEnabled: false },
        trainingProfile: { equipment: 'home_dumbbells' },
        waterLogs: { '2026-10-01': 1500 },
        creatineLogs: { '2026-10-01': true },
        customGeminiKey: 'should-never-ship',
      } as any,
      {
        customBarcodes: { '123': { name: 'Bar' } as any },
        progressPhotos: [{ id: 'ph1', date: '2026-10-01', dataUrl: 'data:image/jpeg;base64,x' }],
      }
    );
    expect((backup as any).weeklySchedule).toBeTruthy();
    expect((backup as any).uiPreferences?.coachEnabled).toBe(false);
    expect((backup as any).trainingProfile?.equipment).toBe('home_dumbbells');
    expect((backup as any).waterLogs).toBeTruthy();
    expect((backup as any).customBarcodes).toBeTruthy();
    expect(backup.progressPhotos).toHaveLength(1);
    expect((backup as any).customGeminiKey).toBeUndefined();
  });
});

describe('auto-regulation pain wiring (ROHAN-3)', () => {
  it('a pain swap holds the substitute target with the pain reason', () => {
    const last: WorkoutEntry = {
      id: 'w1',
      date: '2026-10-19',
      exercises: [
        {
          name: 'Barbell Row',
          painfulExerciseName: 'Deadlift',
          reportsPain: true,
          sets: [
            { reps: 8, weight: 50, unit: 'kg', completed: true, rpe: 6 },
            { reps: 8, weight: 50, unit: 'kg', completed: true, rpe: 6 },
          ],
        },
      ],
    };
    const [adj] = adjustNextTargets(last, [
      { exercise: 'Barbell Row', weight: 50, reps: 8, sets: 3, unit: 'kg' },
    ]);
    expect(adj).toBeTruthy();
    expect(adj.action).toBe('hold');
    expect(adj.newTarget.weight).toBe(50);
    expect(adj.reason).toContain('pain');
  });
});
