import { describe, it, expect } from 'vitest';
import { ExerciseAlternativeService } from '../ExerciseAlternativeService';
import { STARTER_EXERCISES } from '../../../constants/exercises';

describe('ExerciseAlternativeService', () => {
  it('returns chest horizontal press alternatives for Barbell Bench Press', async () => {
    const benchPress = STARTER_EXERCISES.find(e => e.id === 'ex-bench-press')!;
    const alternatives = await ExerciseAlternativeService.getSuitableAlternatives(benchPress);

    expect(alternatives.length).toBeGreaterThan(0);
    // None should be the target exercise itself
    expect(alternatives.some(a => a.id === 'ex-bench-press')).toBe(false);

    // Every alternative must have primary muscle Chest
    for (const alt of alternatives) {
      expect(alt.primaryMuscle).toBe('Chest');
    }

    // Top matches should be legitimate chest compound presses
    const altIds = alternatives.map(a => a.id);
    expect(altIds).toContain('ex-incline-db-press');
  });

  it('returns quad / squat alternatives for Barbell Back Squat', async () => {
    const squat = STARTER_EXERCISES.find(e => e.id === 'ex-barbell-back-squat')!;
    const alternatives = await ExerciseAlternativeService.getSuitableAlternatives(squat);

    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives.some(a => a.id === 'ex-barbell-back-squat')).toBe(false);

    // Should include front squat, leg press, or bulgarian split squat
    const altIds = alternatives.map(a => a.id);
    expect(altIds.some(id => id === 'ex-barbell-front-squat' || id === 'ex-leg-press')).toBe(true);

    // Should NOT contain arm or chest movements
    for (const alt of alternatives) {
      expect(alt.primaryMuscle).not.toBe('Biceps');
      expect(alt.primaryMuscle).not.toBe('Chest');
    }
  });

  it('respects equipment filter when looking for alternatives', async () => {
    const benchPress = STARTER_EXERCISES.find(e => e.id === 'ex-bench-press')!;
    // Only dumbbells available
    const alternatives = await ExerciseAlternativeService.getSuitableAlternatives(benchPress, {
      availableEquipment: ['DUMBBELL'],
    });

    expect(alternatives.length).toBeGreaterThan(0);
    for (const alt of alternatives) {
      expect(alt.equipment).toBe('DUMBBELL');
    }
    expect(alternatives.map(a => a.id)).toContain('ex-incline-db-press');
  });

  it('filters out heavy axial loading movements when user has lower back limitations', async () => {
    const deadlift = STARTER_EXERCISES.find(e => e.id === 'ex-barbell-deadlift')!;
    const alternatives = await ExerciseAlternativeService.getSuitableAlternatives(deadlift, {
      limitations: ['LOWER_BACK'],
    });

    const altNames = alternatives.map(a => a.name.toLowerCase());
    expect(altNames.some(n => n.includes('deadlift'))).toBe(false);
  });

  it('calculates high similarity score for biomechanically matched exercises', () => {
    const bench = STARTER_EXERCISES.find(e => e.id === 'ex-bench-press')!;
    const inclineDb = STARTER_EXERCISES.find(e => e.id === 'ex-incline-db-press')!;
    const curl = STARTER_EXERCISES.find(e => e.id === 'ex-barbell-bicep-curl')!;

    const pressScore = ExerciseAlternativeService.calculateSimilarityScore(bench, inclineDb);
    const curlScore = ExerciseAlternativeService.calculateSimilarityScore(bench, curl);

    expect(pressScore).toBeGreaterThan(60);
    expect(curlScore).toBeLessThan(20);
  });
});
