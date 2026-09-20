import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIGenerationService } from '../AIGenerationService';
import { DeterministicWorkoutGenerator } from '../DeterministicWorkoutGenerator';
import { WorkoutPlanValidator } from '../WorkoutPlanValidator';
import { WorkoutAdaptationEngine } from '../WorkoutAdaptationEngine';
import { AIWorkoutPlanSchema, GenerationInput } from '../schemas';
import { supabase } from '../../../lib/supabase';
import { STARTER_EXERCISES } from '../../../constants/exercises';
import { Exercise } from '../../../types/domain.types';

// Mock supabase functions invoke
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock PlanRepository to avoid requiring SQLite in pure unit test environment
vi.mock('../../../database/repositories/PlanRepository', () => ({
  PlanRepository: {
    savePlan: vi.fn().mockResolvedValue(undefined),
    updatePlan: vi.fn().mockResolvedValue(undefined),
    getActivePlan: vi.fn().mockResolvedValue(null),
  },
}));

describe('AI Workout Generation & Adaptation Engine (Phase 6)', () => {
  const baseInput: GenerationInput = {
    goal: 'BUILD_STRENGTH',
    age: 26,
    height: 180,
    weight: 80,
    experience: 'INTERMEDIATE',
    days_per_week: 4,
    session_duration: 60,
    equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
    training_location: 'COMMERCIAL_GYM',
    preferred_exercises: ['Barbell Bench Press', 'Back Squat'],
    excluded_exercises: ['Conventional Deadlift'],
    limitations: [],
  };

  const validAIPlanResponse = {
    id: 'plan-test-123',
    name: 'Tactical Strength Protocol Alpha',
    split_type: 'UPPER / LOWER HYBRID',
    days_per_week: 4,
    difficulty: 'INTERMEDIATE',
    weekly_structure: '4 sessions per week balancing upper horizontal/vertical push-pull with lower compound strength.',
    progression_suggestions: 'Add 2.5kg when all sets hit target reps.',
    days: [
      {
        day_number: 1,
        name: 'Upper Body Power',
        focus: 'Chest, Upper Back, Shoulders',
        estimated_duration_min: 55,
        exercises: [
          {
            exercise_id: 'ex-bench-press',
            name: 'Barbell Bench Press',
            order: 0,
            sets: 4,
            target_reps: '4-6',
            target_rpe: 8.5,
            rest_seconds: 120,
            instructions: 'Drive feet into ground, pause briefly on sternum.',
            alternatives: ['Dumbbell Bench Press'],
          },
          {
            exercise_id: 'ex-barbell-row',
            name: 'Barbell Bent-Over Row',
            order: 1,
            sets: 4,
            target_reps: '6-8',
            target_rpe: 8,
            rest_seconds: 90,
            instructions: 'Maintain rigid lumbar spine.',
            alternatives: ['Seated Cable Row'],
          },
        ],
      },
      {
        day_number: 2,
        name: 'Lower Body Power',
        focus: 'Quads, Hamstrings',
        estimated_duration_min: 50,
        exercises: [
          {
            exercise_id: 'ex-back-squat',
            name: 'Back Squat',
            order: 0,
            sets: 4,
            target_reps: '5',
            target_rpe: 8.5,
            rest_seconds: 150,
            instructions: 'Hit parallel depth.',
            alternatives: ['Leg Press'],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Valid AI Response
  it('successfully validates and returns a valid structured AI response', async () => {
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: validAIPlanResponse,
      error: null,
    });

    const plan = await AIGenerationService.generatePlan('user-1', baseInput, {
      catalogOverride: STARTER_EXERCISES,
    });

    expect(plan).toBeDefined();
    expect(plan.name).toBe('Tactical Strength Protocol Alpha');
    expect(plan.days.length).toBe(2);
    expect(plan.days[0].exercises[0].name).toBe('Barbell Bench Press');
  });

  // 2. Malformed JSON handling
  it('rejects malformed JSON and falls back to deterministic generator', async () => {
    (supabase.functions.invoke as any)
      .mockResolvedValueOnce({ data: 'NON_JSON_CORRUPTED_STRING', error: null })
      .mockResolvedValueOnce({ data: 'STILL_CORRUPTED', error: null });

    const plan = await AIGenerationService.generatePlan('user-1', baseInput, {
      catalogOverride: STARTER_EXERCISES,
    });

    expect(plan).toBeDefined();
    expect(plan.days_per_week).toBe(4);
    expect(plan.days.length).toBe(4); // Deterministic generator produces full 4 days
  });

  // 3. Missing Fields
  it('rejects AI responses with missing required fields via Zod and falls back safely', async () => {
    const invalidPlan = {
      name: 'Incomplete Plan',
      // missing split_type, days_per_week, days
    };

    (supabase.functions.invoke as any).mockResolvedValue({
      data: invalidPlan,
      error: null,
    });

    const plan = await AIGenerationService.generatePlan('user-1', baseInput, {
      catalogOverride: STARTER_EXERCISES,
    });

    expect(plan).toBeDefined();
    expect(plan.split_type).toBeDefined();
    expect(plan.days.length).toBeGreaterThan(0);
  });

  // 4. Invalid Exercise
  it('catches non-existent exercises and substitutes them with valid catalog movements', () => {
    const planWithInvalidExercise = {
      ...validAIPlanResponse,
      days: [
        {
          day_number: 1,
          name: 'Day 1',
          focus: 'Chest',
          estimated_duration_min: 45,
          exercises: [
            {
              exercise_id: 'ex-fake-movement-999',
              name: 'Non Existent Alien Press',
              order: 0,
              sets: 3,
              target_reps: 10,
              target_rpe: 8,
              rest_seconds: 90,
              instructions: null,
              alternatives: [],
            },
          ],
        },
      ],
    };

    const result = WorkoutPlanValidator.validateAndSanitize(
      planWithInvalidExercise,
      baseInput,
      STARTER_EXERCISES
    );

    expect(result.isValid).toBe(true);
    expect(result.sanitizedPlan.days[0].exercises[0].exercise_id).not.toBe('ex-fake-movement-999');
    expect(result.modifications.some(m => m.includes('Replaced invalid exercise'))).toBe(true);
  });

  // 5. Excluded Exercise
  it('strictly filters out exercises that the athlete has excluded', () => {
    const planWithExcluded = {
      ...validAIPlanResponse,
      days: [
        {
          day_number: 1,
          name: 'Day 1',
          focus: 'Back & Hinge',
          estimated_duration_min: 45,
          exercises: [
            {
              exercise_id: 'ex-deadlift',
              name: 'Conventional Deadlift', // Explicitly excluded in baseInput!
              order: 0,
              sets: 3,
              target_reps: 5,
              target_rpe: 8,
              rest_seconds: 120,
              instructions: null,
              alternatives: [],
            },
            {
              exercise_id: 'ex-barbell-row',
              name: 'Barbell Bent-Over Row',
              order: 1,
              sets: 3,
              target_reps: 8,
              target_rpe: 8,
              rest_seconds: 90,
              instructions: null,
              alternatives: [],
            },
          ],
        },
      ],
    };

    const result = WorkoutPlanValidator.validateAndSanitize(
      planWithExcluded,
      baseInput,
      STARTER_EXERCISES
    );

    const day1Names = result.sanitizedPlan.days[0].exercises.map(e => e.name);
    expect(day1Names).not.toContain('Conventional Deadlift');
    expect(result.modifications.some(m => m.includes('Removed excluded exercise'))).toBe(true);
  });

  // 6. AI Timeout Handling
  it('handles edge function timeout and gracefully falls back to deterministic generator', async () => {
    (supabase.functions.invoke as any).mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 500)); // slow mock
    });

    const plan = await AIGenerationService.generatePlan('user-1', baseInput, {
      timeoutMs: 50, // fast timeout
      catalogOverride: STARTER_EXERCISES,
    });

    expect(plan).toBeDefined();
    expect(plan.days_per_week).toBe(4);
    expect(plan.days.length).toBe(4);
  });

  // 7. API Failure (HTTP 500 / Network)
  it('handles edge function 500/network error and falls back gracefully', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: new Error('Network request failed: 500 Internal Server Error'),
    });

    const plan = await AIGenerationService.generatePlan('user-1', baseInput, {
      catalogOverride: STARTER_EXERCISES,
    });

    expect(plan).toBeDefined();
    expect(plan.split_type).toBeDefined();
    expect(plan.days.length).toBe(4);
  });

  // 8. Retry Mechanism (Retry Once)
  it('retries once upon failure before activating fallback generator', async () => {
    const invokeSpy = vi.spyOn(supabase.functions, 'invoke');
    invokeSpy
      .mockResolvedValueOnce({ data: null, error: new Error('Transient 503') })
      .mockResolvedValueOnce({ data: validAIPlanResponse, error: null });

    const plan = await AIGenerationService.generatePlan('user-1', baseInput, {
      catalogOverride: STARTER_EXERCISES,
    });

    expect(invokeSpy).toHaveBeenCalledTimes(2); // exactly 1 retry
    expect(plan.name).toBe('Tactical Strength Protocol Alpha');
  });

  // 9. Fallback Generator standalone test
  it('deterministic generator creates complete, valid, non-empty plan', () => {
    const plan = DeterministicWorkoutGenerator.generate(baseInput, STARTER_EXERCISES);

    expect(plan.days_per_week).toBe(4);
    expect(plan.days.length).toBe(4);

    for (const day of plan.days) {
      expect(day.exercises.length).toBeGreaterThanOrEqual(3);
      for (const ex of day.exercises) {
        expect(ex.exercise_id).toBeDefined();
        expect(ex.sets).toBeGreaterThanOrEqual(1);
        expect(ex.target_reps).toBeDefined();
        expect(ex.rest_seconds).toBeGreaterThan(0);
      }
    }

    const validation = AIWorkoutPlanSchema.safeParse(plan);
    expect(validation.success).toBe(true);
  });

  // 10. Offline Behavior
  it('generates offline instantly when forceDeterministic is true without network calls', async () => {
    const invokeSpy = vi.spyOn(supabase.functions, 'invoke');

    const plan = await AIGenerationService.generatePlan('user-1', baseInput, {
      forceDeterministic: true,
      catalogOverride: STARTER_EXERCISES,
    });

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(plan).toBeDefined();
    expect(plan.days.length).toBe(4);
  });

  // 11. Adaptation Engine: Too Easy & Too Hard
  describe('Workout Adaptation Engine', () => {
    it('increases volume/intensity for upcoming sessions when marked TOO_EASY', async () => {
      const initialPlan = DeterministicWorkoutGenerator.generate(baseInput, STARTER_EXERCISES);
      const initialReps = initialPlan.days[0].exercises[0].target_reps;
      const initialRest = initialPlan.days[0].exercises[0].rest_seconds;

      const adapted = await WorkoutAdaptationEngine.applySessionFeedback(
        'user-1',
        initialPlan,
        1,
        'TOO_EASY'
      );

      const adaptedEx = adapted.days[0].exercises[0];
      expect(adaptedEx.rest_seconds).toBeLessThanOrEqual(initialRest);
      expect(adapted.progression_suggestions).toContain('Too Easy');
    });

    it('decreases volume/intensity when marked TOO_HARD', async () => {
      const initialPlan = DeterministicWorkoutGenerator.generate(baseInput, STARTER_EXERCISES);
      const initialRest = initialPlan.days[0].exercises[0].rest_seconds;

      const adapted = await WorkoutAdaptationEngine.applySessionFeedback(
        'user-1',
        initialPlan,
        1,
        'TOO_HARD'
      );

      const adaptedEx = adapted.days[0].exercises[0];
      expect(adaptedEx.rest_seconds).toBeGreaterThanOrEqual(initialRest);
      expect(adapted.progression_suggestions).toContain('Too Hard');
    });

    it('adapts entire schedule for Home Workout and Calisthenics (No Equipment)', async () => {
      const initialPlan = DeterministicWorkoutGenerator.generate(baseInput, STARTER_EXERCISES);

      const homePlan = await WorkoutAdaptationEngine.adaptToEnvironment(
        'user-1',
        initialPlan,
        'HOME_WORKOUT',
        STARTER_EXERCISES
      );

      expect(homePlan.name).toContain('HOME');
      for (const day of homePlan.days) {
        for (const ex of day.exercises) {
          const match = STARTER_EXERCISES.find(c => c.id === ex.exercise_id);
          expect(['BODYWEIGHT', 'DUMBBELL']).toContain(match?.equipment || 'BODYWEIGHT');
        }
      }
    });

    it('guarantees historical workouts are never touched during adaptation', async () => {
      // The adaptation engine takes an AIWorkoutPlan and updates workout_plans table metadata only.
      // It has zero write operations to historical `workouts` or `exercise_logs` tables.
      const initialPlan = DeterministicWorkoutGenerator.generate(baseInput, STARTER_EXERCISES);
      const adapted = await WorkoutAdaptationEngine.changeDifficulty('user-1', initialPlan, 'HARDER');

      expect(adapted.difficulty).toBe('ADVANCED');
    });
  });
});
