import { ExerciseLog } from '../../types/domain.types';

export interface SupersetGroup {
  supersetId: string | null;
  exercises: ExerciseLog[];
}

export interface NextSupersetTarget {
  nextExerciseLogId: string;
  nextSetNumber: number;
  isRoundComplete: boolean;
  roundNumber: number;
}

export class SupersetEngine {
  /**
   * Generates a clean identifier for a new superset grouping (e.g. SS-1, SS-2).
   */
  static generateSupersetId(existingSupersetIds: (string | null | undefined)[]): string {
    const validIds = existingSupersetIds.filter(Boolean) as string[];
    let counter = 1;
    while (validIds.includes(`SS-${counter}`)) {
      counter++;
    }
    return `SS-${counter}`;
  }

  /**
   * Formats a human-readable badge label for an exercise inside a superset (e.g., 'A1', 'A2', 'B1').
   */
  static getSupersetBadgeLabel(supersetId: string, indexInGroup: number): string {
    // Extract number from SS-1 -> 1
    const match = supersetId.match(/\d+/);
    const groupNum = match ? parseInt(match[0], 10) : 1;
    // Group 1 -> 'A', Group 2 -> 'B', Group 3 -> 'C'
    const charCode = 65 + ((groupNum - 1) % 26);
    const letter = String.fromCharCode(charCode);
    return `${letter}${indexInGroup + 1}`;
  }

  /**
   * Groups a sequence of workout exercise logs into Superset clusters or standalone movements.
   */
  static groupExercises(exercises: ExerciseLog[]): SupersetGroup[] {
    const groups: SupersetGroup[] = [];
    let currentGroup: SupersetGroup | null = null;

    for (const ex of exercises) {
      if (ex.supersetId) {
        if (currentGroup && currentGroup.supersetId === ex.supersetId) {
          currentGroup.exercises.push(ex);
        } else {
          currentGroup = {
            supersetId: ex.supersetId,
            exercises: [ex],
          };
          groups.push(currentGroup);
        }
      } else {
        currentGroup = null;
        groups.push({
          supersetId: null,
          exercises: [ex],
        });
      }
    }

    return groups;
  }

  /**
   * Calculates the next exercise and set number when a set is completed inside a superset.
   * If the completed set was the last exercise of the round, indicates isRoundComplete = true.
   */
  static getNextTarget(
    currentExerciseLogId: string,
    currentSetNumber: number,
    exercises: ExerciseLog[]
  ): NextSupersetTarget | null {
    const currentEx = exercises.find(e => e.id === currentExerciseLogId);
    if (!currentEx || !currentEx.supersetId) {
      return null;
    }

    const ssId = currentEx.supersetId;
    const pairedExercises = exercises
      .filter(e => e.supersetId === ssId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (pairedExercises.length <= 1) {
      return null;
    }

    const currentIndex = pairedExercises.findIndex(e => e.id === currentExerciseLogId);
    if (currentIndex === -1) return null;

    // If not the last exercise in the superset round:
    if (currentIndex < pairedExercises.length - 1) {
      const nextEx = pairedExercises[currentIndex + 1];
      return {
        nextExerciseLogId: nextEx.id,
        nextSetNumber: currentSetNumber,
        isRoundComplete: false,
        roundNumber: currentSetNumber,
      };
    }

    // Otherwise, last exercise in the round -> completes round!
    const firstEx = pairedExercises[0];
    return {
      nextExerciseLogId: firstEx.id,
      nextSetNumber: currentSetNumber + 1,
      isRoundComplete: true,
      roundNumber: currentSetNumber,
    };
  }

  /**
   * Checks if all sets in a superset group have been completed.
   */
  static isGroupFullyCompleted(supersetId: string, exercises: ExerciseLog[]): boolean {
    const group = exercises.filter(e => e.supersetId === supersetId);
    if (group.length === 0) return true;

    for (const ex of group) {
      const uncompletedSets = ex.sets.filter(s => !s.completed && !s.isSkipped);
      if (uncompletedSets.length > 0) return false;
    }

    return true;
  }
}
