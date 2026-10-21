import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import { ToastItem, type ToastMessage } from '../src/components/ui/Toast';
import { useStore } from '../src/lib/store';
import type { MealEntry, PlannedWorkout } from '../src/lib/types';

/**
 * QA4-014 — ToastMessage had no action field, so Undo was
 * inexpressible. Tests: (1) the toast renders its action when present
 * (and not otherwise); (2) the store restore actions used by the Undo
 * handlers in MealsPage / WorkoutPage put data back exactly.
 */

const food = (name: string) => ({ name, calories: 100, proteinG: 5, carbsG: 10, fatG: 2 } as never);
const meal = (id: string, foods: string[]): MealEntry =>
  ({ id, date: '2026-10-21', name: `Meal ${id}`, foods: foods.map(food) } as MealEntry);

describe('Toast action support (QA4-014)', () => {
  it('renders the action button with its label when an action is set', () => {
    const toast: ToastMessage = {
      id: 't1',
      type: 'info',
      message: 'Deleted Rice',
      action: { label: 'Undo', onAction: () => {} },
    };
    const html = renderToStaticMarkup(<ToastItem toast={toast} onClose={() => {}} />);
    expect(html).toContain('Deleted Rice');
    expect(html).toContain('data-toast-action="Undo"');
    expect(html).toContain('>Undo<');
  });

  it('renders no action button for a plain toast', () => {
    const toast: ToastMessage = { id: 't2', type: 'success', message: 'Saved' };
    const html = renderToStaticMarkup(<ToastItem toast={toast} onClose={() => {}} />);
    expect(html).toContain('Saved');
    expect(html).not.toContain('data-toast-action');
  });
});

describe('Undo restore actions (QA4-014)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
    useStore.setState({ meals: [], plannedWorkouts: [], deletedPlanIds: [] });
  });

  it('food delete + undo restores the food at its original index', () => {
    const m1 = meal('m1', ['A', 'B', 'C']);
    useStore.setState({ meals: [m1] });
    useStore.getState().deleteFoodFromMeal('m1', 1);
    expect(useStore.getState().meals[0].foods.map((f) => f.name)).toEqual(['A', 'C']);

    useStore.getState().restoreFoodToMeal(m1, 0, 1);
    expect(useStore.getState().meals[0].foods.map((f) => f.name)).toEqual(['A', 'B', 'C']);
  });

  it('deleting the last food removes the meal; undo restores the whole meal in place', () => {
    const m1 = meal('m1', ['A']);
    const m2 = meal('m2', ['X']);
    const m3 = meal('m3', ['Y']);
    useStore.setState({ meals: [m1, m2, m3] });

    useStore.getState().deleteFoodFromMeal('m2', 0);
    expect(useStore.getState().meals.map((m) => m.id)).toEqual(['m1', 'm3']);

    useStore.getState().restoreFoodToMeal(m2, 1, 0);
    expect(useStore.getState().meals.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(useStore.getState().meals[1].foods.map((f) => f.name)).toEqual(['X']);
  });

  it('meal delete + undo re-inserts at the original index; double-undo is a no-op', () => {
    const m1 = meal('m1', ['A']);
    const m2 = meal('m2', ['B']);
    useStore.setState({ meals: [m1, m2] });

    useStore.getState().deleteMeal('m1');
    expect(useStore.getState().meals.map((m) => m.id)).toEqual(['m2']);

    useStore.getState().insertMealAt(m1, 0);
    useStore.getState().insertMealAt(m1, 0); // second undo tap must not duplicate
    expect(useStore.getState().meals.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('plan delete + undo restores plan, schedule and tombstones', () => {
    const planA = { id: 'pa', name: 'A', createdAt: new Date().toISOString(), exercises: [] } as unknown as PlannedWorkout;
    const planB = { id: 'pb', name: 'B', createdAt: new Date().toISOString(), exercises: [] } as unknown as PlannedWorkout;
    const store = useStore.getState();
    store.addPlannedWorkout(planA);
    store.addPlannedWorkout(planB);
    store.setDaySchedule('monday', { workoutPlanId: 'pa', customTitle: 'A', bodyParts: [] });

    const before = useStore.getState();
    const planIndex = before.plannedWorkouts.findIndex((p) => p.id === 'pa');
    const prevSchedule = before.weeklySchedule;
    const prevTombstones = [...before.deletedPlanIds];

    useStore.getState().deletePlannedWorkout('pa');
    const deleted = useStore.getState();
    expect(deleted.plannedWorkouts.map((p) => p.id)).toEqual(['pb']);
    expect(deleted.deletedPlanIds).toContain('pa');
    expect(deleted.weeklySchedule.monday.workoutPlanId).toBe('pb'); // rewired by delete

    useStore.getState().restorePlannedWorkout(planA, planIndex, prevSchedule, prevTombstones);
    const restored = useStore.getState();
    // addPlannedWorkout prepends, so the pre-delete order was [pb, pa]
    // and planIndex pointed at slot 1 — undo restores exactly that.
    expect(restored.plannedWorkouts.map((p) => p.id)).toEqual(['pb', 'pa']);
    expect(restored.deletedPlanIds).toEqual(prevTombstones);
    expect(restored.weeklySchedule.monday.workoutPlanId).toBe('pa');
  });
});
