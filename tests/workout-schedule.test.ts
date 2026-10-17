import { describe, it, expect } from 'vitest';
import {
  buildDefaultWeeklySchedule,
  generateSplitWeeklySchedule,
  getScheduledWorkoutForDay,
} from '../src/lib/workout-schedule';
import { PlannedWorkout } from '../src/lib/types';

describe('Workout Schedule & Frequency Invariants', () => {
  const dummy4Plans: PlannedWorkout[] = [
    { id: 'upper_a', name: 'Upper A', createdAt: '2026-01-01', exercises: [{ name: 'Bench Press', targetSets: 4, targetReps: 8 }] },
    { id: 'lower_a', name: 'Lower A', createdAt: '2026-01-01', exercises: [{ name: 'Squat', targetSets: 4, targetReps: 8 }] },
    { id: 'upper_b', name: 'Upper B', createdAt: '2026-01-01', exercises: [{ name: 'Incline Bench', targetSets: 4, targetReps: 8 }] },
    { id: 'lower_b', name: 'Lower B', createdAt: '2026-01-01', exercises: [{ name: 'Deadlift', targetSets: 4, targetReps: 8 }] },
  ];

  it('strictly respects 6-day frequency even when plans.length === 4', () => {
    const schedule = buildDefaultWeeklySchedule(dummy4Plans, 6);
    const activeDays = Object.values(schedule).filter((d) => d.workoutPlanId && d.workoutPlanId !== 'rest');
    expect(activeDays.length).toBe(6);
    expect(schedule.sunday.workoutPlanId).toBe('rest');
    expect(schedule.monday.workoutPlanId).toBe('upper_a');
    expect(schedule.tuesday.workoutPlanId).toBe('lower_a');
    expect(schedule.wednesday.workoutPlanId).toBe('upper_b');
    expect(schedule.thursday.workoutPlanId).toBe('lower_b');
    expect(schedule.friday.workoutPlanId).toBe('upper_a');
    expect(schedule.saturday.workoutPlanId).toBe('lower_a');
  });

  it('strictly respects 5-day frequency even when plans.length === 4', () => {
    const schedule = buildDefaultWeeklySchedule(dummy4Plans, 5);
    const activeDays = Object.values(schedule).filter((d) => d.workoutPlanId && d.workoutPlanId !== 'rest');
    expect(activeDays.length).toBe(5);
    expect(schedule.saturday.workoutPlanId).toBe('rest');
    expect(schedule.sunday.workoutPlanId).toBe('rest');
  });

  it('strictly respects 3-day frequency even when plans.length === 4', () => {
    const schedule = buildDefaultWeeklySchedule(dummy4Plans, 3);
    const activeDays = Object.values(schedule).filter((d) => d.workoutPlanId && d.workoutPlanId !== 'rest');
    expect(activeDays.length).toBe(3);
    expect(schedule.monday.workoutPlanId).toBe('upper_a');
    expect(schedule.wednesday.workoutPlanId).toBe('lower_a');
    expect(schedule.friday.workoutPlanId).toBe('upper_b');
    expect(schedule.tuesday.workoutPlanId).toBe('rest');
    expect(schedule.thursday.workoutPlanId).toBe('rest');
    expect(schedule.saturday.workoutPlanId).toBe('rest');
    expect(schedule.sunday.workoutPlanId).toBe('rest');
  });

  it('properly generates a 3-day Full Body split via generateSplitWeeklySchedule', () => {
    const fullBodySplit = generateSplitWeeklySchedule('full_body', 'kg');
    expect(fullBodySplit.daysPerWeek).toBe(3);
    expect(fullBodySplit.splitName).toBe('Full Body (3-Day)');
    expect(fullBodySplit.plans.length).toBe(3);
    expect(fullBodySplit.schedule.monday.workoutPlanId).toBe('plan_full_body_a');
    expect(fullBodySplit.schedule.tuesday.workoutPlanId).toBe('rest');
    expect(fullBodySplit.schedule.wednesday.workoutPlanId).toBe('plan_full_body_b');
    expect(fullBodySplit.schedule.thursday.workoutPlanId).toBe('rest');
    expect(fullBodySplit.schedule.friday.workoutPlanId).toBe('plan_full_body_c');
    expect(fullBodySplit.schedule.saturday.workoutPlanId).toBe('rest');
    expect(fullBodySplit.schedule.sunday.workoutPlanId).toBe('rest');
  });

  it('properly generates a 6-day PPL split via generateSplitWeeklySchedule', () => {
    const pplSplit = generateSplitWeeklySchedule('ppl', 'kg');
    expect(pplSplit.daysPerWeek).toBe(6);
    expect(pplSplit.plans.length).toBe(3);
    const activeDays = Object.values(pplSplit.schedule).filter((d) => d.workoutPlanId && d.workoutPlanId !== 'rest');
    expect(activeDays.length).toBe(6);
    expect(pplSplit.schedule.sunday.workoutPlanId).toBe('rest');
  });

  it('properly generates a 5-day Bro Split via generateSplitWeeklySchedule', () => {
    const broSplit = generateSplitWeeklySchedule('bro_split', 'kg');
    expect(broSplit.daysPerWeek).toBe(5);
    expect(broSplit.plans.length).toBe(5);
    const activeDays = Object.values(broSplit.schedule).filter((d) => d.workoutPlanId && d.workoutPlanId !== 'rest');
    expect(activeDays.length).toBe(5);
  });

  it('resolves scheduled workout for active and rest days via getScheduledWorkoutForDay', () => {
    const schedule = buildDefaultWeeklySchedule(dummy4Plans, 4);
    const mondayRes = getScheduledWorkoutForDay(schedule, 'monday', dummy4Plans);
    expect(mondayRes.isRest).toBe(false);
    expect(mondayRes.plan?.id).toBe('upper_a');

    const wednesdayRes = getScheduledWorkoutForDay(schedule, 'wednesday', dummy4Plans);
    expect(wednesdayRes.isRest).toBe(true);
    expect(wednesdayRes.plan).toBeNull();
  });
});
