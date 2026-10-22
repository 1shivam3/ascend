import { describe, it, expect } from 'vitest';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  getQuickSubstitutes,
  compressWorkout,
  parseVoiceWorkout,
  getExercisePrescription,
} from '../src/lib/workout-engine';
import { WorkoutEntry, PersonalRecord } from '../src/lib/types';

describe('Workout Engine — Historical Performance & Extraction', () => {
  const mockWorkouts: WorkoutEntry[] = [
    {
      id: 'w1',
      date: '2026-09-28',
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 70, reps: 8, unit: 'kg', completed: true },
            { weight: 70, reps: 8, unit: 'kg', completed: true },
            { weight: 70, reps: 7, unit: 'kg', completed: true },
          ],
        },
        {
          name: 'Incline Dumbbell Press',
          sets: [{ weight: 26, reps: 10, unit: 'kg', completed: true }],
        },
      ],
    },
    {
      id: 'w2',
      date: '2026-09-24',
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 70, reps: 7, unit: 'kg', completed: true },
            { weight: 70, reps: 7, unit: 'kg', completed: true },
            { weight: 70, reps: 6, unit: 'kg', completed: true },
          ],
        },
      ],
    },
  ];

  it('extracts the most recent exercise performance and builds correct summary', () => {
    const lastBench = getLastExercisePerformance('Bench Press', mockWorkouts, 'kg');
    expect(lastBench).not.toBeNull();
    expect(lastBench?.summary).toBe('70kg × 8, 70kg × 8, 70kg × 7');
    expect(lastBench?.date).toBe('2026-09-28');
  });

  it('normalizes units when requested unit differs from logged unit', () => {
    // 70kg converted to lbs: 70 * 2.20462 = 154.3 lbs
    const lastBenchLbs = getLastExercisePerformance('Bench Press', mockWorkouts, 'lbs');
    expect(lastBenchLbs).not.toBeNull();
    expect(lastBenchLbs?.summary).toContain('154.3lbs');
  });

  it('returns null for unknown exercise or empty workout history', () => {
    expect(getLastExercisePerformance('Overhead Press', mockWorkouts, 'kg')).toBeNull();
    expect(getLastExercisePerformance('Bench Press', [], 'kg')).toBeNull();
  });
});

describe('Workout Engine — Progression Recommendations & Edge Cases', () => {
  it('recommends progressive overload (+2.5kg) when all sets hit target reps with reserve', () => {
    const cleanWorkouts: WorkoutEntry[] = [
      {
        id: 'w_clean',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Squat',
            sets: [
              { weight: 100, reps: 8, unit: 'kg', completed: true, rpe: 7.5 },
              { weight: 100, reps: 8, unit: 'kg', completed: true, rpe: 8.0 },
              { weight: 100, reps: 8, unit: 'kg', completed: true, rpe: 8.0 },
            ],
          },
        ],
      },
    ];

    const recommendation = getProgressionRecommendation('Squat', cleanWorkouts, 'kg', 'build_muscle');
    expect(recommendation).not.toBeNull();
    expect(recommendation?.targetWeight).toBe(102.5);
    expect(recommendation?.targetSummary).toContain('+2.5kg');
    expect(recommendation?.isPlateau).toBe(false);
  });

  it('recommends +5 lbs overload when user unit is lbs', () => {
    const cleanWorkoutsLbs: WorkoutEntry[] = [
      {
        id: 'w_lbs',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Squat',
            sets: [
              { weight: 225, reps: 8, unit: 'lbs', completed: true, rpe: 7.5 },
              { weight: 225, reps: 8, unit: 'lbs', completed: true, rpe: 8.0 },
            ],
          },
        ],
      },
    ];

    const recommendation = getProgressionRecommendation('Squat', cleanWorkoutsLbs, 'lbs', 'build_muscle');
    expect(recommendation).not.toBeNull();
    expect(recommendation?.targetWeight).toBe(230);
    expect(recommendation?.targetSummary).toContain('+5lbs');
  });

  it('generates consistent explanation agreeing with target for unequal repetitions ([8, 8, 7] → [8, 8, 8])', () => {
    const volumeWorkouts: WorkoutEntry[] = [
      {
        id: 'w_vol',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 70, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 70, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 70, reps: 7, unit: 'kg', completed: true, rpe: 9.5 },
            ],
          },
        ],
      },
    ];

    const recommendation = getProgressionRecommendation('Bench Press', volumeWorkouts, 'kg', 'build_muscle');
    expect(recommendation).not.toBeNull();
    // Mathematical target raises set 3 from 7 to 8 reps:
    expect(recommendation?.targetWeight).toBe(70);
    expect(recommendation?.targetSummary).toBe('70kg × 8, 8, 8');
    // Explanation MUST agree with target (8, 8, 7 → 8, 8, 8 reps) and must NOT claim 8 → 9 reps:
    expect(recommendation?.rationale).toContain('8, 8, 7 → 8, 8, 8 reps');
    expect(recommendation?.rationale).not.toContain('8 → 9');
  });

  it('handles all sets achieving the same repetitions without verbal contradiction', () => {
    // Multi-set identical repetitions below target threshold: [7, 7, 7]
    const equalSetsWorkouts: WorkoutEntry[] = [
      {
        id: 'w_equal',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 70, reps: 7, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 70, reps: 7, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 70, reps: 7, unit: 'kg', completed: true, rpe: 9.5 },
            ],
          },
        ],
      },
    ];

    const recommendation = getProgressionRecommendation('Bench Press', equalSetsWorkouts, 'kg', 'build_muscle');
    expect(recommendation).not.toBeNull();
    expect(recommendation?.targetWeight).toBe(70);
    expect(recommendation?.targetSummary).toBe('70kg × 7, 7, 8');
    expect(recommendation?.rationale).toContain('7, 7, 7 → 7, 7, 8 reps');

    // Single set: [7]
    const singleSetWorkouts: WorkoutEntry[] = [
      {
        id: 'w_single',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [{ weight: 50, reps: 7, unit: 'kg', completed: true, rpe: 9.0 }],
          },
        ],
      },
    ];

    const singleRec = getProgressionRecommendation('Overhead Press', singleSetWorkouts, 'kg', 'build_muscle');
    expect(singleRec).not.toBeNull();
    expect(singleRec?.targetSummary).toBe('50kg × 8');
    expect(singleRec?.rationale).toContain('7 → 8 reps');
  });

  it('identifies and progresses different minimum-repetition positions correctly', () => {
    // Minimum rep at first set: [6, 8, 8] -> [7, 8, 8]
    const minFirstWorkouts: WorkoutEntry[] = [
      {
        id: 'w_first',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Incline Bench',
            sets: [
              { weight: 60, reps: 6, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 60, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 60, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
            ],
          },
        ],
      },
    ];
    const recFirst = getProgressionRecommendation('Incline Bench', minFirstWorkouts, 'kg', 'build_muscle');
    expect(recFirst?.targetSummary).toBe('60kg × 7, 8, 8');
    expect(recFirst?.rationale).toContain('6, 8, 8 → 7, 8, 8 reps');

    // Minimum rep in middle set: [8, 6, 8] -> [8, 7, 8]
    const minMiddleWorkouts: WorkoutEntry[] = [
      {
        id: 'w_middle',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Incline Bench',
            sets: [
              { weight: 60, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 60, reps: 6, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 60, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
            ],
          },
        ],
      },
    ];
    const recMiddle = getProgressionRecommendation('Incline Bench', minMiddleWorkouts, 'kg', 'build_muscle');
    expect(recMiddle?.targetSummary).toBe('60kg × 8, 7, 8');
    expect(recMiddle?.rationale).toContain('8, 6, 8 → 8, 7, 8 reps');

    // Minimum rep in last set: [8, 8, 6] -> [8, 8, 7]
    const minLastWorkouts: WorkoutEntry[] = [
      {
        id: 'w_last',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Incline Bench',
            sets: [
              { weight: 60, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 60, reps: 8, unit: 'kg', completed: true, rpe: 9.0 },
              { weight: 60, reps: 6, unit: 'kg', completed: true, rpe: 9.0 },
            ],
          },
        ],
      },
    ];
    const recLast = getProgressionRecommendation('Incline Bench', minLastWorkouts, 'kg', 'build_muscle');
    expect(recLast?.targetSummary).toBe('60kg × 8, 8, 7');
    expect(recLast?.rationale).toContain('8, 8, 6 → 8, 8, 7 reps');
  });

  it('detects a plateau stall when e1RM remains flat across 4+ sessions', () => {
    // 4 sessions at identical 100kg x 8 reps
    const stallWorkouts: WorkoutEntry[] = ['2026-09-10', '2026-09-14', '2026-09-18', '2026-09-22'].map((date, idx) => ({
      id: `w_stall_${idx}`,
      date,
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ weight: 100, reps: 8, unit: 'kg', completed: true, rpe: 9.5 }],
        },
      ],
    }));

    const recommendation = getProgressionRecommendation('Bench Press', stallWorkouts, 'kg', 'build_muscle');
    expect(recommendation).not.toBeNull();
    expect(recommendation?.isPlateau).toBe(true);
    expect(recommendation?.plateauSessionsCount).toBe(4);
    expect(recommendation?.targetWeight).toBe(90); // 10% deload to 90kg
  });

  it('returns null for invalid inputs, missing history, or incomplete sets', () => {
    // Empty inputs
    expect(getProgressionRecommendation('', [], 'kg')).toBeNull();
    expect(getProgressionRecommendation('Bench Press', [], 'kg')).toBeNull();

    // Exercise not present
    const workouts: WorkoutEntry[] = [
      {
        id: 'w1',
        date: '2026-10-01',
        exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5, unit: 'kg', completed: true }] }],
      },
    ];
    expect(getProgressionRecommendation('Deadlift', workouts, 'kg')).toBeNull();

    // Sets all uncompleted or 0 reps
    const incompleteWorkouts: WorkoutEntry[] = [
      {
        id: 'w_inc',
        date: '2026-10-01',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 70, reps: 0, unit: 'kg', completed: true },
              { weight: 70, reps: 8, unit: 'kg', completed: false },
            ],
          },
        ],
      },
    ];
    expect(getProgressionRecommendation('Bench Press', incompleteWorkouts, 'kg')).toBeNull();
  });
});

describe('Workout Engine — Exercise Prescriptions & Substitutions', () => {
  it('generates introductory fallback prescription when no past workout exists', () => {
    const rx = getExercisePrescription('Bench Press', [], [], 'kg', 'build_muscle');
    expect(rx.repRange).toEqual({ min: 8, max: 12 });
    expect(rx.targetRpe).toBe(7.5);
    expect(rx.progressionModel).toBe('double_progression');
  });

  it('calibrates target RPE and load when athlete has a baseline PR', () => {
    const prs: PersonalRecord[] = [
      { id: 'pr1', exercise: 'Bench Press', weightKg: 100, weightLbs: 220, reps: 1, oneRepMax: 100, date: '2026-10-01' },
    ];
    // For strength goal with PR: targetRpe is 8.5
    const rxStrength = getExercisePrescription('Bench Press', [], prs, 'kg', 'get_stronger');
    expect(rxStrength.repRange).toEqual({ min: 3, max: 6 });
    expect(rxStrength.targetRpe).toBe(8.5);
    expect(rxStrength.whyThisWeight).toContain('baseline');

    // For hypertrophy goal with PR: targetRpe is 8.0
    const rxHypertrophy = getExercisePrescription('Bench Press', [], prs, 'kg', 'build_muscle');
    expect(rxHypertrophy.repRange).toEqual({ min: 8, max: 12 });
    expect(rxHypertrophy.targetRpe).toBe(8.0);
  });

  it('identifies conditioning exercises and provides interval prescription', () => {
    const rx = getExercisePrescription('Treadmill', [], [], 'kg', 'stamina');
    expect(rx.progressionModel).toBe('conditioning_interval');
    expect(rx.targetWeight).toBe(0);
  });

  it('provides quick exercise substitutes by biomechanical movement pattern', () => {
    const legExtSubs = getQuickSubstitutes('Leg Extension');
    expect(legExtSubs.length).toBeGreaterThanOrEqual(2);
    expect(legExtSubs.some((s) => s.name.includes('Squat') || s.name.includes('Lunge'))).toBe(true);

    // Empty input returns empty array
    expect(getQuickSubstitutes('')).toEqual([]);

    // PR-A2 contract: an exercise the library doesn't know gets NO
    // substitutes — never placeholder inventions ("Dumbbell alternative").
    const unknownSubs = getQuickSubstitutes('Unknown Lift');
    expect(unknownSubs).toEqual([]);
  });

  it('compresses workouts by prioritizing compound lifts for shorter durations', () => {
    const fullRoutine = [
      { name: 'Bench Press', sets: [{ weight: 70, reps: 8, unit: 'kg' as const }] },
      { name: 'Incline Dumbbell Press', sets: [{ weight: 26, reps: 10, unit: 'kg' as const }] },
      { name: 'Cable Fly', sets: [{ weight: 15, reps: 12, unit: 'kg' as const }] },
      { name: 'Tricep Pushdown', sets: [{ weight: 25, reps: 12, unit: 'kg' as const }] },
      { name: 'Overhead Tricep Extension', sets: [{ weight: 20, reps: 12, unit: 'kg' as const }] },
      { name: 'Lateral Raises', sets: [{ weight: 10, reps: 15, unit: 'kg' as const }] },
    ];

    // 30 minutes: trims to 3 exercises
    const comp30 = compressWorkout(fullRoutine, 30);
    expect(comp30.length).toBe(3);

    // 45 minutes: trims to 4 exercises
    const comp45 = compressWorkout(fullRoutine, 45);
    expect(comp45.length).toBe(4);

    // 60 minutes: preserves all 6 exercises
    const comp60 = compressWorkout(fullRoutine, 60);
    expect(comp60.length).toBe(6);
  });

  it('parses natural voice workout transcript into structured sets', () => {
    const parsed = parseVoiceWorkout('Bench 70 for 8 8 7', ['Bench Press', 'Squat']);
    expect(parsed).not.toBeNull();
    expect(parsed?.exerciseName).toBe('Bench Press');
    expect(parsed?.sets.length).toBe(3);
    expect(parsed?.sets[0].weight).toBe(70);
    expect(parsed?.sets[0].reps).toBe(8);
    expect(parsed?.sets[2].reps).toBe(7);
  });
});
