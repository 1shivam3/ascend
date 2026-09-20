import { describe, it, expect } from 'vitest';
import { DeterministicWorkoutGenerator } from '../DeterministicWorkoutGenerator';
import { GenerationInput } from '../schemas';
import { STARTER_EXERCISES } from '../../../constants/exercises';

const baseInput: GenerationInput = {
  goal: 'GET_STRONGER',
  age: 26,
  height: 180,
  weight: 80,
  experience: 'INTERMEDIATE',
  days_per_week: 4,
  session_duration: 60,
  equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT', 'KETTLEBELL'],
  training_location: 'COMMERCIAL_GYM',
  preferred_exercises: [],
  excluded_exercises: [],
  limitations: [],
};

describe('Goal-Specific Programming (DeterministicWorkoutGenerator)', () => {
  // ─── Per-Goal Programming Tests ───────────────────────────────────────────

  it('GET_STRONGER: produces strength-oriented programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'GET_STRONGER' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate strength / compound focus
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('STRENGTH') || splitUpper.includes('COMPOUND')
    ).toBe(true);

    // Rep schemes should include low-rep strength ranges
    const allReps = plan.days.flatMap(d => d.exercises.map(e => e.target_reps));
    const hasStrengthReps = allReps.some(
      r => typeof r === 'string' && (r.includes('3-5') || r.includes('4-6'))
    );
    expect(hasStrengthReps).toBe(true);

    // Compound exercises should have long rest periods (>= 150s)
    const compoundExercises = plan.days.flatMap(d =>
      d.exercises.filter(e => {
        const catalogEntry = STARTER_EXERCISES.find(c => c.id === e.exercise_id);
        return catalogEntry?.tier === 'COMPOUND_PRIMARY' || catalogEntry?.tier === 'COMPOUND_SECONDARY';
      })
    );
    for (const ex of compoundExercises) {
      expect(ex.rest_seconds).toBeGreaterThanOrEqual(150);
    }
  });

  it('BUILD_MUSCLE: produces hypertrophy-oriented programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'BUILD_MUSCLE' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate hypertrophy
    const splitUpper = plan.split_type.toUpperCase();
    expect(splitUpper.includes('HYPERTROPHY')).toBe(true);

    // Rep schemes should include 8-12
    const allReps = plan.days.flatMap(d => d.exercises.map(e => e.target_reps));
    const hasHypertrophyReps = allReps.some(
      r => typeof r === 'string' && r.includes('8-12')
    );
    expect(hasHypertrophyReps).toBe(true);
  });

  it('ATHLETIC_PERFORMANCE: produces athletic / power / speed programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'ATHLETIC_PERFORMANCE' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate athletic, power, or speed
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('ATHLETIC') || splitUpper.includes('POWER') || splitUpper.includes('SPEED')
    ).toBe(true);

    // Template patterns include CARRY – the generator requests CARRY movements.
    // Even if no CARRY exercise exists in catalog, the template itself targets it,
    // so we verify the split templates were applied by checking day names/focus for
    // athletic keywords, or that the plan has exercises from the athletic template.
    const allPatternKeywords = plan.days.flatMap(d => [d.name, d.focus].join(' ').toUpperCase());
    const hasAthleticFocus = allPatternKeywords.some(
      kw => kw.includes('POWER') || kw.includes('KINETIC') || kw.includes('AGILITY') || kw.includes('SPEED')
    );
    expect(hasAthleticFocus).toBe(true);
  });

  it('ENDURANCE: produces aerobic / work capacity programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'ENDURANCE' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate aerobic or work capacity
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('AEROBIC') || splitUpper.includes('WORK CAPACITY')
    ).toBe(true);

    // Exercises should include CARDIO movement pattern or have target_distance_meters set
    const allExercises = plan.days.flatMap(d => d.exercises);
    const hasCardioOrDistance = allExercises.some(e => {
      const catalogEntry = STARTER_EXERCISES.find(c => c.id === e.exercise_id);
      return catalogEntry?.movementPattern === 'CARDIO' || (e.target_distance_meters != null && e.target_distance_meters > 0);
    });
    expect(hasCardioOrDistance).toBe(true);
  });

  it('CALISTHENICS: produces bodyweight mastery programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'CALISTHENICS' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate bodyweight or mastery
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('BODYWEIGHT') || splitUpper.includes('MASTERY')
    ).toBe(true);

    // Majority of exercises should come from the BODYWEIGHT equipment pool
    const allExercises = plan.days.flatMap(d => d.exercises);
    const bodyweightCount = allExercises.filter(e => {
      const catalogEntry = STARTER_EXERCISES.find(c => c.id === e.exercise_id);
      return catalogEntry?.equipment === 'BODYWEIGHT';
    }).length;
    expect(bodyweightCount).toBeGreaterThan(allExercises.length / 2);
  });

  it('LOSE_FAT: produces metabolic / conditioning programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'LOSE_FAT' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate metabolic or conditioning
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('METABOLIC') || splitUpper.includes('CONDITIONING')
    ).toBe(true);

    // Non-compound exercises should have short rest (≤ 60s)
    const nonCompoundExercises = plan.days.flatMap(d =>
      d.exercises.filter(e => {
        const catalogEntry = STARTER_EXERCISES.find(c => c.id === e.exercise_id);
        return catalogEntry?.tier !== 'COMPOUND_PRIMARY' && catalogEntry?.tier !== 'COMPOUND_SECONDARY';
      })
    );
    for (const ex of nonCompoundExercises) {
      expect(ex.rest_seconds).toBeLessThanOrEqual(60);
    }
  });

  it('SPORT_PERFORMANCE: produces sport-specific programming', () => {
    const input: GenerationInput = {
      ...baseInput,
      primary_goal: 'SPORT_PERFORMANCE',
      sport_name: 'BASKETBALL',
    };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate sport or performance
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('SPORT') || splitUpper.includes('PERFORMANCE')
    ).toBe(true);

    // Plan name should reference sport
    const nameUpper = plan.name.toUpperCase();
    expect(nameUpper.includes('SPORT') || nameUpper.includes('PERFORMANCE')).toBe(true);
  });

  it('GENERAL_FITNESS: produces balanced / general / conditioning programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'GENERAL_FITNESS' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate balanced, general, or conditioning
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('BALANCED') || splitUpper.includes('GENERAL') || splitUpper.includes('CONDITIONING')
    ).toBe(true);
  });

  it('CUSTOM: produces custom programming', () => {
    const input: GenerationInput = { ...baseInput, primary_goal: 'CUSTOM' };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Split type should indicate custom
    const splitUpper = plan.split_type.toUpperCase();
    expect(splitUpper.includes('CUSTOM')).toBe(true);
  });

  // ─── Structural Tests ────────────────────────────────────────────────────

  it('generates correct number of days for varying days_per_week', () => {
    for (const daysPerWeek of [1, 2, 3, 4]) {
      const input: GenerationInput = { ...baseInput, days_per_week: daysPerWeek };
      const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);
      expect(plan.days.length).toBe(daysPerWeek);
    }
  });

  it('never produces empty exercise lists for any goal', () => {
    const goals = [
      'BUILD_MUSCLE',
      'GET_STRONGER',
      'ATHLETIC_PERFORMANCE',
      'LOSE_FAT',
      'ENDURANCE',
      'GENERAL_FITNESS',
      'SPORT_PERFORMANCE',
      'CALISTHENICS',
      'CUSTOM',
    ] as const;

    for (const goal of goals) {
      const input: GenerationInput = { ...baseInput, primary_goal: goal };
      const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

      for (const day of plan.days) {
        expect(day.exercises.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('progression_suggestions differ across all 9 goals', () => {
    const goals = [
      'BUILD_MUSCLE',
      'GET_STRONGER',
      'ATHLETIC_PERFORMANCE',
      'LOSE_FAT',
      'ENDURANCE',
      'GENERAL_FITNESS',
      'SPORT_PERFORMANCE',
      'CALISTHENICS',
      'CUSTOM',
    ] as const;

    const progressionSuggestions = goals.map(goal => {
      const input: GenerationInput = { ...baseInput, primary_goal: goal };
      const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);
      return plan.progression_suggestions;
    });

    // All 9 progression suggestions should be unique strings
    const uniqueSuggestions = new Set(progressionSuggestions);
    expect(uniqueSuggestions.size).toBe(goals.length);
  });

  it('legacy goal normalization: BUILD_STRENGTH maps to strength-style programming', () => {
    // Pass legacy `goal: 'BUILD_STRENGTH'` without primary_goal
    const input: GenerationInput = {
      ...baseInput,
      goal: 'BUILD_STRENGTH',
      primary_goal: undefined,
    };
    const plan = DeterministicWorkoutGenerator.generate(input, STARTER_EXERCISES);

    // Should normalize to GET_STRONGER and produce strength split
    const splitUpper = plan.split_type.toUpperCase();
    expect(
      splitUpper.includes('STRENGTH') || splitUpper.includes('COMPOUND')
    ).toBe(true);
  });
});
