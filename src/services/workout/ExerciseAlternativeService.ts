import { Exercise, EquipmentTier, MovementPattern } from '../../types/domain.types';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { STARTER_EXERCISES } from '../../constants/exercises';

export interface AlternativeFilterOptions {
  availableEquipment?: EquipmentTier[];
  limitations?: string[];
  maxResults?: number;
}

export class ExerciseAlternativeService {
  /**
   * Finds biomechanically suitable alternatives for a given exercise.
   * Alternatives are strictly selected based on physiological similarity:
   * - Primary target muscle
   * - Movement pattern (e.g. Horizontal Push, Vertical Pull, Hip Hinge, Squat)
   * - Biomechanical load profile & equipment compatibility
   * - Physical limitation avoidance
   * Never random.
   */
  static async getSuitableAlternatives(
    targetExercise: Exercise | string,
    options: AlternativeFilterOptions = {}
  ): Promise<Exercise[]> {
    const allExercises = await this.getAllExercises();
    
    // Resolve target exercise object
    const current = typeof targetExercise === 'string'
      ? allExercises.find(e => e.id === targetExercise) || STARTER_EXERCISES.find(e => e.id === targetExercise)
      : targetExercise;

    if (!current) return [];

    const maxResults = options.maxResults || 6;
    const availableEquipment = options.availableEquipment;
    const limitations = options.limitations?.map(l => l.toUpperCase()) || [];

    // 1. Check curated explicit alternatives
    const curatedIds = new Set(current.suitableAlternatives || []);
    const curatedMatches: Exercise[] = [];

    for (const id of curatedIds) {
      const match = allExercises.find(e => e.id === id);
      if (match && match.id !== current.id && this.passesLimitations(match, limitations)) {
        if (!availableEquipment || availableEquipment.includes(match.equipment)) {
          curatedMatches.push(match);
        }
      }
    }

    // 2. Score all other exercises for physiological and biomechanical similarity
    const candidates = allExercises.filter(e => 
      e.id !== current.id && 
      !curatedIds.has(e.id) &&
      this.passesLimitations(e, limitations) &&
      (!availableEquipment || availableEquipment.includes(e.equipment))
    );

    const scored = candidates.map(candidate => ({
      exercise: candidate,
      score: this.calculateSimilarityScore(current, candidate),
    }));

    // Sort by score descending, strictly prioritizing matching primary target muscle
    const sourcePrimary = current.primaryMuscle.toLowerCase();
    scored.sort((a, b) => {
      const aSameMuscle = a.exercise.primaryMuscle.toLowerCase() === sourcePrimary;
      const bSameMuscle = b.exercise.primaryMuscle.toLowerCase() === sourcePrimary;
      if (aSameMuscle && !bSameMuscle) return -1;
      if (!aSameMuscle && bSameMuscle) return 1;
      return b.score - a.score;
    });

    const dynamicMatches = scored
      .filter(item => {
        const itemPrimary = item.exercise.primaryMuscle.toLowerCase();
        // If we have same-muscle candidates, strictly require matching primary muscle
        if (scored.some(s => s.exercise.primaryMuscle.toLowerCase() === sourcePrimary && s.score >= 40)) {
          return itemPrimary === sourcePrimary && item.score >= 40;
        }
        return item.score >= 50;
      })
      .map(item => item.exercise);

    const combined = [...curatedMatches, ...dynamicMatches];
    // De-duplicate by ID
    const uniqueMap = new Map<string, Exercise>();
    for (const ex of combined) {
      if (!uniqueMap.has(ex.id)) {
        uniqueMap.set(ex.id, ex);
      }
    }
    return Array.from(uniqueMap.values()).slice(0, maxResults);
  }

  /**
   * Evaluates biomechanical similarity between two exercises (0 to 100).
   */
  static calculateSimilarityScore(source: Exercise, candidate: Exercise): number {
    let score = 0;

    // 1. Primary Muscle Match (40 pts)
    const sourcePrimary = source.primaryMuscle.toLowerCase();
    const candidatePrimary = candidate.primaryMuscle.toLowerCase();
    if (sourcePrimary === candidatePrimary) {
      score += 40;
    } else if (
      (sourcePrimary.includes('delt') && candidatePrimary.includes('delt')) ||
      (sourcePrimary === 'chest' && candidate.secondaryMuscles?.some(m => m.toLowerCase().includes('chest'))) ||
      (sourcePrimary === 'back' && candidatePrimary === 'lats') ||
      (sourcePrimary === 'lats' && candidatePrimary === 'upper back')
    ) {
      score += 25;
    }

    // 2. Movement Pattern Match (35 pts)
    if (source.movementPattern === candidate.movementPattern) {
      score += 35;
    } else if (
      (source.movementPattern === 'PUSH_HORIZONTAL' && candidate.movementPattern === 'PUSH_VERTICAL') ||
      (source.movementPattern === 'PULL_HORIZONTAL' && candidate.movementPattern === 'PULL_VERTICAL')
    ) {
      score += 15;
    }

    // 3. Secondary Muscle Overlap (up to 15 pts)
    const sourceSecondary = (source.secondaryMuscles || []).map(m => m.toLowerCase());
    const candidateSecondary = (candidate.secondaryMuscles || []).map(m => m.toLowerCase());
    let overlapCount = 0;
    for (const sm of sourceSecondary) {
      if (candidateSecondary.includes(sm) || candidatePrimary === sm) {
        overlapCount++;
      }
    }
    score += Math.min(15, overlapCount * 7.5);

    // 4. Exercise Tier / Compound Match (10 pts)
    if (source.tier === candidate.tier) {
      score += 10;
    } else if (
      (source.tier === 'COMPOUND_PRIMARY' && candidate.tier === 'COMPOUND_SECONDARY') ||
      (source.tier === 'COMPOUND_SECONDARY' && candidate.tier === 'COMPOUND_PRIMARY')
    ) {
      score += 7;
    }

    return score;
  }

  /**
   * Filters out exercises that contravene common orthopedic limitations.
   */
  private static passesLimitations(ex: Exercise, limitations: string[]): boolean {
    if (limitations.length === 0) return true;

    const name = ex.name.toLowerCase();
    const primary = ex.primaryMuscle.toLowerCase();
    const equipment = ex.equipment;

    // Lower Back / Spinal Loading Limitation
    if (limitations.some(l => l.includes('BACK') || l.includes('SPINE'))) {
      if (
        name.includes('deadlift') || 
        name.includes('back squat') || 
        name.includes('t-bar row') ||
        (name.includes('bent-over') && equipment === 'BARBELL')
      ) {
        return false;
      }
    }

    // Knee Pain / Patellofemoral Limitation
    if (limitations.some(l => l.includes('KNEE'))) {
      if (name.includes('leg extension') || name.includes('jump') || name.includes('sprint')) {
        return false;
      }
    }

    // Shoulder / Rotator Cuff Limitation
    if (limitations.some(l => l.includes('SHOULDER'))) {
      if (name.includes('dip') || name.includes('overhead press') || name.includes('behind')) {
        return false;
      }
    }

    // Wrist Limitation
    if (limitations.some(l => l.includes('WRIST'))) {
      if (equipment === 'BARBELL' && (name.includes('clean') || name.includes('front squat'))) {
        return false;
      }
    }

    return true;
  }

  private static async getAllExercises(): Promise<Exercise[]> {
    try {
      const list = await ExerciseRepository.getAll();
      if (list && list.length > 0) return list;
    } catch {
      // Fallback to static catalog
    }
    return STARTER_EXERCISES;
  }
}
