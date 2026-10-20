import { describe, it, expect } from 'vitest';
import {
  computeMuscleVolume,
  computeMuscleRecovery,
  countWorkingSets,
  mondayOfWeekStr,
  recoveryStatusFor,
} from '../src/lib/muscle-volume';
import type { WorkoutEntry, WorkoutSet } from '../src/lib/types';

function set(partial: Partial<WorkoutSet> = {}): WorkoutSet {
  return { reps: 8, weight: 60, unit: 'kg', completed: true, ...partial };
}

function workout(date: string, exercises: WorkoutEntry['exercises']): WorkoutEntry {
  return { id: `w-${date}-${Math.random()}`, date, exercises };
}

// Reference week: Mon 2026-10-19 .. Sun 2026-10-25 (2026-10-20 is a Tuesday).
const MON = '2026-10-19';
const SUN = '2026-10-25';

describe('mondayOfWeekStr', () => {
  it('maps every day of the week to the same Monday', () => {
    for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']) {
      expect(mondayOfWeekStr(d)).toBe(MON);
    }
  });

  it('Sunday belongs to the week that started the previous Monday', () => {
    expect(mondayOfWeekStr('2026-10-18')).toBe('2026-10-12');
    expect(mondayOfWeekStr('2026-10-26')).toBe('2026-10-26');
  });
});

describe('countWorkingSets', () => {
  it('counts completed non-warmup sets by primary muscle only', () => {
    const w = workout('2026-10-20', [
      { name: 'Barbell Bench Press', sets: [set(), set(), set({ isWarmup: true }), set({ completed: false, status: 'skipped' })] },
      { name: 'Squat', sets: [set(), set()] },
      { name: 'Running', sets: [set()] }, // Conditioning — excluded
    ]);
    const counts = countWorkingSets([w], MON, SUN);
    expect(counts['Chest']).toBe(2);
    expect(counts['Legs']).toBe(2);
    expect(counts['Back']).toBe(0);
  });

  it('respects explicit set status over the completed flag', () => {
    const w = workout('2026-10-20', [
      { name: 'Deadlift', sets: [set({ status: 'completed', completed: false }), set({ status: 'pending', completed: true })] },
    ]);
    expect(countWorkingSets([w], MON, SUN)['Back']).toBe(1);
  });

  it('excludes workouts outside the range, includes both boundaries', () => {
    const workouts = [
      workout('2026-10-18', [{ name: 'Squat', sets: [set()] }]), // Sunday before
      workout(MON, [{ name: 'Squat', sets: [set()] }]),
      workout(SUN, [{ name: 'Squat', sets: [set()] }]),
      workout('2026-10-26', [{ name: 'Squat', sets: [set()] }]), // next Monday
    ];
    expect(countWorkingSets(workouts, MON, SUN)['Legs']).toBe(2);
  });
});

describe('computeMuscleVolume', () => {
  it('compares current Mon–Sun week against the previous week', () => {
    const workouts = [
      workout('2026-10-13', [{ name: 'Barbell Bench Press', sets: [set(), set(), set()] }]), // prev week
      workout('2026-10-20', [{ name: 'Barbell Bench Press', sets: [set(), set(), set(), set(), set()] }]),
      workout('2026-10-25', [{ name: 'Barbell Bench Press', sets: [set()] }]), // Sunday counts
      workout('2026-10-26', [{ name: 'Barbell Bench Press', sets: [set(), set()] }]), // next week — excluded
    ];
    const res = computeMuscleVolume(workouts, '2026-10-21');
    expect(res.weekStart).toBe(MON);
    expect(res.weekEnd).toBe(SUN);
    const chest = res.rows.find((r) => r.muscle === 'Chest')!;
    expect(chest.sets).toBe(6);
    expect(chest.prevSets).toBe(3);
    expect(chest.delta).toBe(3);
    expect(res.totalSets).toBe(6);
  });

  it('handles a reference date that is itself a Monday or a Sunday', () => {
    const workouts = [workout('2026-10-19', [{ name: 'Squat', sets: [set()] }])];
    expect(computeMuscleVolume(workouts, '2026-10-19').rows.find((r) => r.muscle === 'Legs')?.sets).toBe(1);
    expect(computeMuscleVolume(workouts, '2026-10-25').rows.find((r) => r.muscle === 'Legs')?.sets).toBe(1);
    expect(computeMuscleVolume(workouts, '2026-10-26').rows.find((r) => r.muscle === 'Legs')?.sets).toBe(0);
  });

  it('returns zeroed rows for empty history', () => {
    const res = computeMuscleVolume([], '2026-10-20');
    expect(res.totalSets).toBe(0);
    expect(res.rows).toHaveLength(6);
    expect(res.rows.every((r) => r.sets === 0 && r.prevSets === 0)).toBe(true);
  });
});

describe('computeMuscleRecovery', () => {
  const TODAY = '2026-10-20';

  it('marks a heavily trained muscle fatigued (8+ sets in 48h)', () => {
    const eight = Array.from({ length: 8 }, () => set());
    const workouts = [workout('2026-10-19', [{ name: 'Squat', sets: eight }])];
    const legs = computeMuscleRecovery(workouts, TODAY).find((r) => r.muscle === 'Legs')!;
    expect(legs.setsLast48h).toBe(8);
    expect(legs.status).toBe('fatigued');
    expect(legs.daysSince).toBe(1);
  });

  it('recent within 4 days, fresh after 5+', () => {
    const workouts = [
      workout('2026-10-17', [{ name: 'Deadlift', sets: [set(), set()] }]), // 3 days ago
      workout('2026-10-14', [{ name: 'Overhead Press', sets: [set()] }]), // 6 days ago
    ];
    const rows = computeMuscleRecovery(workouts, TODAY);
    expect(rows.find((r) => r.muscle === 'Back')?.status).toBe('recent');
    expect(rows.find((r) => r.muscle === 'Shoulders')?.status).toBe('fresh');
    expect(rows.find((r) => r.muscle === 'Arms')?.status).toBe('never');
    expect(rows.find((r) => r.muscle === 'Arms')?.lastTrainedDate).toBeNull();
  });

  it('ignores future-dated workouts and zero-set exercises for last-trained', () => {
    const workouts = [
      workout('2026-10-21', [{ name: 'Squat', sets: [set()] }]),
      workout('2026-10-15', [{ name: 'Squat', sets: [set({ completed: false, status: 'skipped' })] }]),
    ];
    const legs = computeMuscleRecovery(workouts, TODAY).find((r) => r.muscle === 'Legs')!;
    expect(legs.status).toBe('never');
  });

  it('tracks the most recent training date per muscle', () => {
    const workouts = [
      workout('2026-10-10', [{ name: 'Barbell Bench Press', sets: [set()] }]),
      workout('2026-10-18', [{ name: 'Barbell Bench Press', sets: [set()] }]),
    ];
    const chest = computeMuscleRecovery(workouts, TODAY).find((r) => r.muscle === 'Chest')!;
    expect(chest.lastTrainedDate).toBe('2026-10-18');
    expect(chest.daysSince).toBe(2);
  });
});

describe('recoveryStatusFor', () => {
  it('applies the documented thresholds', () => {
    expect(recoveryStatusFor(null, 0)).toBe('never');
    expect(recoveryStatusFor(0, 8)).toBe('fatigued');
    expect(recoveryStatusFor(4, 0)).toBe('recent');
    expect(recoveryStatusFor(5, 0)).toBe('fresh');
  });
});
