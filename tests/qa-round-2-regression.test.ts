import { describe, it, expect, beforeEach } from 'vitest';
import {
  isJunkMealParse,
  getAbsurdQuantityWarning,
  scaleFoodByQuantity,
  calculateMaintenanceCalories,
} from '../src/lib/macros';
import { applyExerciseEffortRating } from '../src/lib/workout-engine';
import { MAX_PR_WEIGHT_KG } from '../src/lib/strength-standards';
import { MAX_ATHLETE_NAME_LENGTH, MAX_PLAN_NAME_LENGTH } from '../src/lib/types';
import {
  round1,
  round2,
  plural,
  formatWaterMl,
  getTimeGreeting,
  formatHeightImperial,
  sanitizeAthleteName,
} from '../src/lib/formatters';
import { FoodItem } from '../src/lib/types';

describe('P0#2 — exercise difficulty rating never overwrites logged per-set RPE', () => {
  const baseExercise: any = {
    name: 'Bench Press',
    sets: [
      { reps: 8, weight: 60, rpe: 9, completed: true },
      { reps: 8, weight: 60, rpe: 8.5, completed: true },
      { reps: 8, weight: 60, rpe: 10, completed: true },
    ],
  };

  it('keeps logged per-set RPEs when a difficulty rating is applied', () => {
    const out = applyExerciseEffortRating(baseExercise, 8, 'good');
    expect(out.sets.map((s: any) => s.rpe)).toEqual([9, 8.5, 10]);
  });

  it('stores the difficulty rating as a separate field', () => {
    const out = applyExerciseEffortRating(baseExercise, 8, 'good');
    expect(out.effortRating).toEqual({ rpe: 8, label: 'good' });
  });

  it('backfills only sets that have no logged RPE', () => {
    const ex: any = {
      name: 'Squat',
      sets: [
        { reps: 5, weight: 100, rpe: 9.5, completed: true },
        { reps: 5, weight: 100, completed: true },
      ],
    };
    const out = applyExerciseEffortRating(ex, 7, 'easy');
    expect(out.sets[0].rpe).toBe(9.5);
    expect(out.sets[1].rpe).toBe(7);
  });
});

describe('P0#3 — manual meal builder scales by quantity', () => {
  it('doubles calories/macros when quantity doubles', () => {
    const item: FoodItem = { name: 'Chicken Breast', quantity: 100, unit: 'g',
      calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
    };
    const out = scaleFoodByQuantity(item, 200);
    expect(out.quantity).toBe(200);
    expect(out.calories).toBe(330);
    expect(out.proteinG).toBe(62);
    expect(out.fatG).toBe(7.2);
  });

  it('is a no-op without a valid previous quantity', () => {
    const item: FoodItem = { name: 'Chicken', quantity: 0, unit: 'g',
      calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
    };
    expect(scaleFoodByQuantity(item, 200)).toBe(item);
  });
});

describe('P1#4 — gibberish meal input is rejected, never silently logged', () => {
  it('flags all-unmatched zero-calorie parses as junk', () => {
    const junk: FoodItem[] = [
      { name: 'asdfgh', quantity: 1, unit: 'serving', calories: 0, proteinG: 0, carbsG: 0, fatG: 0, isUnmatched: true },
      { name: 'jkl', quantity: 1, unit: 'serving', calories: 0, proteinG: 0, carbsG: 0, fatG: 0, isUnmatched: true },
    ];
    expect(isJunkMealParse(junk)).toBe(true);
  });

  it('flags empty parses as junk', () => {
    expect(isJunkMealParse([])).toBe(true);
  });

  it('accepts a parse with recognized food', () => {
    const ok: FoodItem[] = [
      { name: 'Roti', quantity: 2, unit: 'piece', calories: 240, proteinG: 6, carbsG: 50, fatG: 1 },
    ];
    expect(isJunkMealParse(ok)).toBe(false);
  });

  it('accepts a partially matched parse with calories', () => {
    const partial: FoodItem[] = [
      { name: 'Mystery curry', quantity: 1, unit: 'bowl', calories: 300, proteinG: 10, carbsG: 20, fatG: 15, isUnmatched: true },
    ];
    expect(isJunkMealParse(partial)).toBe(false);
  });
});

describe('P1#5 — absurd quantities are flagged', () => {
  it('flags 100 rotis / 12,000 kcal', () => {
    const w = getAbsurdQuantityWarning({ name: 'Roti', calories: 12000, quantity: 100, unit: 'piece' });
    expect(w).toBeTruthy();
  });

  it('flags 5 kg sugar', () => {
    const w = getAbsurdQuantityWarning({ name: 'Sugar', calories: 20000, quantity: 5, unit: 'kg' });
    expect(w).toBeTruthy();
  });

  it('flags >2500 g/ml', () => {
    expect(getAbsurdQuantityWarning({ name: 'Milk', calories: 1500, quantity: 3000, unit: 'ml' })).toBeTruthy();
  });

  it('accepts sane quantities', () => {
    expect(getAbsurdQuantityWarning({ name: 'Roti', calories: 240, quantity: 2, unit: 'piece' })).toBeNull();
    expect(getAbsurdQuantityWarning({ name: 'Chicken', calories: 330, quantity: 200, unit: 'g' })).toBeNull();
  });
});

describe('P1#6 — maintenance calories are a single source of truth', () => {
  it('computes maintenance deterministically', () => {
    const m1 = calculateMaintenanceCalories(80, 'male', 175, 30);
    const m2 = calculateMaintenanceCalories(80, 'male', 175, 30);
    expect(m1).toBe(m2);
    expect(m1).toBeGreaterThan(1500);
    expect(m1).toBeLessThan(4000);
  });

  it('scales with body weight', () => {
    const light = calculateMaintenanceCalories(60, 'male', 170, 30);
    const heavy = calculateMaintenanceCalories(100, 'male', 170, 30);
    expect(heavy).toBeGreaterThan(light);
  });
});

describe('P1#8 — PR weight has a sane upper bound', () => {
  it('caps at 500 kg', () => {
    expect(MAX_PR_WEIGHT_KG).toBe(500);
  });
});

describe('P2 — display rounding kills float artifacts', () => {
  it('round1 trims float noise', () => {
    expect(round1(154.3000030517578)).toBe(154.3);
    expect(round1(81.30000305175781)).toBe(81.3);
    expect(round1(1.100000023841858)).toBe(1.1);
  });

  it('round2 trims float noise', () => {
    expect(round2(87.499999)).toBe(87.5);
  });
});

describe('P2 — grammar helpers', () => {
  it('pluralizes correctly', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(2, 'item')).toBe('2 items');
    expect(plural(0, 'day')).toBe('0 days');
    expect(plural(1, 'active target goal')).toBe('1 active target goal');
    expect(plural(3, 'active target goal')).toBe('3 active target goals');
  });
});

describe('P2 — water display', () => {
  it('shows ml under 1 L', () => {
    expect(formatWaterMl(250)).toBe('250 ml');
    expect(formatWaterMl(999)).toBe('999 ml');
  });

  it('shows L at/above 1 L', () => {
    expect(formatWaterMl(1500)).toBe('1.5 L');
    expect(formatWaterMl(3000)).toBe('3 L');
  });
});

describe('P2 — time-of-day greeting', () => {
  it('never says Good morning at midnight', () => {
    const midnight = new Date(2026, 9, 19, 0, 30);
    expect(getTimeGreeting(midnight)).toBe('Good night,');
  });

  it('says Good morning in the morning', () => {
    expect(getTimeGreeting(new Date(2026, 9, 19, 9, 0))).toBe('Good morning,');
  });
});

describe('P2 — height display conversion', () => {
  it('converts 175 cm to ~5\'9"', () => {
    const s = formatHeightImperial(175);
    expect(s).toContain("5'");
    expect(s).toContain('9"');
  });
});

describe('P2 — name handling', () => {
  it('strips HTML from names', () => {
    const clean = sanitizeAthleteName('<script>alert(1)</script>Aarav');
    expect(clean).not.toContain('<');
    expect(clean).not.toContain('>');
    expect(clean).toContain('Aarav');
  });

  it('enforces the name length cap constant', () => {
    expect(MAX_ATHLETE_NAME_LENGTH).toBe(50);
    expect(MAX_PLAN_NAME_LENGTH).toBe(60);
  });
});

describe('P0#1 — guest identity persists across reloads', () => {
  // vitest runs in node (no DOM): stub localStorage.
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };

  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = localStorageStub;
    (globalThis as any).window = {};
  });

  it('returns the same id on repeated calls (simulated reloads)', async () => {
    const { getOrCreateGuestId } = await import('../src/lib/storage');
    const first = getOrCreateGuestId();
    const second = getOrCreateGuestId();
    expect(first).toBe(second);
    expect(first).toMatch(/^guest_/);
  });

  it('survives a fresh module evaluation reading the same localStorage', async () => {
    const mod = await import('../src/lib/storage');
    const id = mod.getOrCreateGuestId();
    // Simulate what a reload does: read the raw stored value directly.
    expect(store.get('ascend_guest_id')).toBe(id);
  });
});
