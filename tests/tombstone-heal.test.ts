import { describe, it, expect } from 'vitest';
import { dropTombstonedRows, type HealInput } from '@/lib/tombstone-heal';

/**
 * Audit R4 regression: a row that is BOTH local and tombstoned is a
 * contradiction produced only by resurrection artifacts (R1/R1b/R2).
 * The heal must drop the row and keep the tombstone (deletion wins).
 */

type Row = { id: string };

type TestInput = HealInput<Row, Row, Row, Row, Row>;

function input(overrides: Partial<TestInput> = {}): TestInput {
  return {
    workouts: [],
    meals: [],
    prs: [],
    bodyMetrics: [],
    plannedWorkouts: [],
    deletedWorkoutIds: [],
    deletedMealIds: [],
    deletedPrIds: [],
    deletedBodyMetricIds: [],
    deletedPlanIds: [],
    ...overrides,
  };
}

describe('dropTombstonedRows', () => {
  it('drops poisoned rows and keeps the tombstone (deletion wins)', () => {
    const out = dropTombstonedRows(
      input({
        workouts: [{ id: 'w1' }, { id: 'w2' }],
        deletedWorkoutIds: ['w1'],
      }),
    );
    expect(out.slices.workouts).toEqual([{ id: 'w2' }]);
    expect(out.dropped.workouts).toBe(1);
    expect(out.droppedTotal).toBe(1);
  });

  it('heals every slice independently', () => {
    const out = dropTombstonedRows(
      input({
        meals: [{ id: 'm1' }],
        prs: [{ id: 'p1' }, { id: 'p2' }],
        deletedMealIds: ['m1'],
        deletedPrIds: ['p2'],
      }),
    );
    expect(out.slices.meals).toEqual([]);
    expect(out.slices.prs).toEqual([{ id: 'p1' }]);
    expect(out.droppedTotal).toBe(2);
  });

  it('clean state is untouched (no slices returned, no drops)', () => {
    const out = dropTombstonedRows(
      input({
        workouts: [{ id: 'w1' }],
        deletedWorkoutIds: ['wX'],
      }),
    );
    expect(out.slices).toEqual({});
    expect(out.droppedTotal).toBe(0);
  });

  it('tolerates missing arrays', () => {
    const out = dropTombstonedRows(input());
    expect(out.droppedTotal).toBe(0);
  });
});
