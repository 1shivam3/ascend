import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { PlannedWorkout } from '../src/lib/types';

function makePlan(id: string, name: string): PlannedWorkout {
  return {
    id,
    name,
    createdAt: new Date().toISOString(),
    exercises: [{ name: 'Bench Press', sets: [] } as any],
  };
}

describe('Plan deletion (Train tab)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('removes the plan and reassigns weekly schedule references', () => {
    const store = useStore.getState();
    const planA = makePlan('plan_a', 'Plan A');
    const planB = makePlan('plan_b', 'Plan B');
    store.addPlannedWorkout(planA);
    store.addPlannedWorkout(planB);

    // Point Monday at plan A
    store.setDaySchedule('monday', {
      workoutPlanId: 'plan_a',
      customTitle: 'Plan A',
      bodyParts: [],
    });

    useStore.getState().deletePlannedWorkout('plan_a');

    const after = useStore.getState();
    expect(after.plannedWorkouts.map((p) => p.id)).toEqual(['plan_b']);
    // Schedule reference must not dangle — reassigned to the remaining plan
    expect(after.weeklySchedule.monday.workoutPlanId).toBe('plan_b');
    expect(after.weeklySchedule.monday.customTitle).toBe('Plan B');
  });

  it('falls back to a rest day when the last plan referencing a day is deleted', () => {
    const store = useStore.getState();
    store.addPlannedWorkout(makePlan('only_plan', 'Only Plan'));
    store.setDaySchedule('tuesday', {
      workoutPlanId: 'only_plan',
      customTitle: 'Only Plan',
      bodyParts: [],
    });

    useStore.getState().deletePlannedWorkout('only_plan');

    const after = useStore.getState();
    expect(after.plannedWorkouts).toEqual([]);
    expect(after.weeklySchedule.tuesday.workoutPlanId).toBe('rest');
  });

  it('leaves unrelated schedule days untouched', () => {
    const store = useStore.getState();
    store.addPlannedWorkout(makePlan('plan_a', 'Plan A'));
    store.addPlannedWorkout(makePlan('plan_b', 'Plan B'));
    store.setDaySchedule('wednesday', {
      workoutPlanId: 'plan_b',
      customTitle: 'Plan B',
      bodyParts: [],
    });

    useStore.getState().deletePlannedWorkout('plan_a');

    expect(useStore.getState().weeklySchedule.wednesday.workoutPlanId).toBe('plan_b');
  });
});
