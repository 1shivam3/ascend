import { describe, it, expect } from 'vitest';
import { parseWorkoutCSV } from '../src/lib/workout-import';

// Strong CSV format: includes a Weight Unit column and an RPE column.
const STRONG_CSV = [
  'Date,Workout Name,Duration (sec),Exercise Name,Set Order,Weight,Reps,Distance,RPE,Weight Unit,Notes',
  '"2026-10-15 08:00:00","Morning","3600","Barbell Bench Press",1,225,8,0,9,lb,',
  '"2026-10-15 08:00:00","Morning","3600","Barbell Bench Press",2,225,8,0,9.5,lb,',
  '"2026-10-15 08:00:00","Morning","3600","Barbell Row",1,185,10,0,8,lb,',
].join('\n');

const KG_CSV = [
  'Date,Exercise,Weight (kg),Reps',
  '2026-10-15,Squat,100,5',
  '2026-10-15,Squat,100,5',
].join('\n');

describe('CSV import units (persona: Rohan ex-Strong user)', () => {
  it('reads Strong lbs via the Weight Unit column instead of hardcoding kg', () => {
    const result = parseWorkoutCSV(STRONG_CSV);
    expect(result.workoutsImported).toBe(1);
    const bench = result.workouts[0].exercises.find((e) => e.name.includes('Bench'));
    expect(bench).toBeDefined();
    expect(bench!.sets[0].unit).toBe('lbs');
    expect(bench!.sets[0].weight).toBe(225);
  });

  it('preserves per-set RPE so auto-regulation has history to work with', () => {
    const result = parseWorkoutCSV(STRONG_CSV);
    const bench = result.workouts[0].exercises.find((e) => e.name.includes('Bench'));
    expect(bench!.sets[0].rpe).toBe(9);
    expect(bench!.sets[1].rpe).toBe(9.5);
  });

  it('keeps PR calibration in kg when sets are lbs', () => {
    const result = parseWorkoutCSV(STRONG_CSV);
    const benchPR = result.newPRs.find((p) => p.exercise.includes('Bench'));
    expect(benchPR).toBeDefined();
    // 225 lbs = 102.1 kg — must not record 225 as kg.
    expect(benchPR!.weightKg).toBeCloseTo(102.1, 0);
  });

  it('respects a kg header', () => {
    const result = parseWorkoutCSV(KG_CSV);
    const squat = result.workouts[0].exercises[0];
    expect(squat.sets[0].unit).toBe('kg');
  });

  it('falls back to the caller-provided unit when the CSV carries no unit', () => {
    const csv = ['Date,Exercise,Weight,Reps', '2026-10-15,Squat,100,5'].join('\n');
    const result = parseWorkoutCSV(csv, { fallbackUnit: 'lbs' });
    expect(result.workouts[0].exercises[0].sets[0].unit).toBe('lbs');
  });
});
