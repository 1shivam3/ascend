import { describe, it, expect } from 'vitest';
import {
  calculateMaintenanceCalories,
  calculateRecommendedMacroGoals,
} from '../src/lib/macros';

describe('activity-aware maintenance calories (persona: Priya desk worker)', () => {
  it('a sedentary desk worker gets a materially lower maintenance than the old hardcoded 1.4x', () => {
    const sedentary = calculateMaintenanceCalories(65, 'female', 162, 27, 'sedentary');
    const light = calculateMaintenanceCalories(65, 'female', 162, 27, 'light');
    expect(sedentary).toBeLessThan(light);
    // The old default would have been bmr*1.4 ≈ 1913; sedentary must be ~273 kcal lower.
    expect(light - sedentary).toBeGreaterThan(200);
  });

  it('multipliers ascend with activity level', () => {
    const levels = ['sedentary', 'light', 'active', 'very_active'] as const;
    const vals = levels.map((l) => calculateMaintenanceCalories(70, 'male', 175, 30, l));
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });

  it('recommended goals flow through the activity level for fat loss', () => {
    const sedentaryGoals = calculateRecommendedMacroGoals(65, 'lose_fat', 'female', 162, 27, 'sedentary');
    const lightGoals = calculateRecommendedMacroGoals(65, 'lose_fat', 'female', 162, 27, 'light');
    expect(sedentaryGoals.calories).toBeLessThan(lightGoals.calories);
    expect(sedentaryGoals.calories).toBeGreaterThan(1200); // sanity: sane deficit
  });
});
