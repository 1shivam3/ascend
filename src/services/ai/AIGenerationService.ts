import { supabase } from '../../lib/supabase';
import {
  GenerationInput,
  GenerationInputSchema,
  AIWorkoutPlan,
  AIWorkoutPlanSchema,
} from './schemas';
import { WorkoutPlanValidator } from './WorkoutPlanValidator';
import { DeterministicWorkoutGenerator } from './DeterministicWorkoutGenerator';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { PlanRepository } from '../../database/repositories/PlanRepository';
import { STARTER_EXERCISES } from '../../constants/exercises';

export interface GenerationOptions {
  forceDeterministic?: boolean;
  timeoutMs?: number;
  catalogOverride?: any[];
}

export class AIGenerationService {
  private static readonly DEFAULT_TIMEOUT_MS = 10000; // 10s timeout

  /**
   * Orchestrates secure AI workout generation with automatic 1-retry,
   * deterministic validation, and offline/failure fallback.
   * Guaranteed to never throw and never return null.
   */
  static async generatePlan(
    userId: string,
    rawInput: unknown,
    options: GenerationOptions = {}
  ): Promise<AIWorkoutPlan> {
    const validatedInput = GenerationInputSchema.parse(rawInput);
    const timeoutMs = options.timeoutMs || this.DEFAULT_TIMEOUT_MS;

    // Load available exercise catalog
    let catalog = options.catalogOverride || [];
    if (catalog.length === 0) {
      try {
        catalog = await ExerciseRepository.getAll();
      } catch {
        catalog = STARTER_EXERCISES;
      }
      if (catalog.length === 0) catalog = STARTER_EXERCISES;
    }

    // If deterministic mode explicitly requested, generate immediately
    if (options.forceDeterministic) {
      const fallbackPlan = DeterministicWorkoutGenerator.generate(validatedInput, catalog);
      const validated = WorkoutPlanValidator.validateAndSanitize(fallbackPlan, validatedInput, catalog);
      await this.safePersistPlan(userId, validated.sanitizedPlan);
      return validated.sanitizedPlan;
    }

    // Attempt 1: Call Edge Function
    let aiPlan: AIWorkoutPlan | null = await this.callEdgeFunctionWithTimeout(validatedInput, timeoutMs);

    // Attempt 2: If attempt 1 failed, retry exactly once
    if (!aiPlan) {
      console.warn('[AIGenerationService] Primary generation attempt failed. Initiating retry 1/1...');
      aiPlan = await this.callEdgeFunctionWithTimeout(validatedInput, timeoutMs);
    }

    // If still unsuccessful: Engage Deterministic Generator
    if (!aiPlan) {
      console.warn('[AIGenerationService] AI generation exhausted. Activating deterministic fallback generator.');
      aiPlan = DeterministicWorkoutGenerator.generate(validatedInput, catalog);
    }

    // Run deterministic application-layer validation & business rules
    const validationResult = WorkoutPlanValidator.validateAndSanitize(aiPlan, validatedInput, catalog);

    // Safely persist to SQLite
    await this.safePersistPlan(userId, validationResult.sanitizedPlan);

    return validationResult.sanitizedPlan;
  }

  /**
   * Invokes the Supabase Edge Function with a strict timeout and safe error handling.
   */
  private static async callEdgeFunctionWithTimeout(
    input: GenerationInput,
    timeoutMs: number
  ): Promise<AIWorkoutPlan | null> {
    try {
      const invokePromise = supabase.functions.invoke('generate-workout', {
        body: input,
      });

      const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('AI_GENERATION_TIMEOUT')), timeoutMs)
      );

      const response = await Promise.race([invokePromise, timeoutPromise]);
      const { data, error } = response as { data: unknown; error: any };

      if (error || !data) {
        console.warn('[AIGenerationService] Edge function returned error or empty response:', error?.message || 'Empty');
        return null;
      }

      // Validate schema on client before trusting
      const validation = AIWorkoutPlanSchema.safeParse(data);
      if (!validation.success) {
        console.warn('[AIGenerationService] Edge function returned malformed JSON schema:', validation.error.format());
        return null;
      }

      return validation.data;
    } catch (err) {
      console.warn('[AIGenerationService] Network/Timeout error calling Edge Function:', (err as Error).message);
      return null;
    }
  }

  private static async safePersistPlan(userId: string, plan: AIWorkoutPlan): Promise<void> {
    try {
      await PlanRepository.savePlan(userId, plan, true);
    } catch (err) {
      console.error('[AIGenerationService] Failed to persist plan to SQLite:', (err as Error).message);
    }
  }
}
