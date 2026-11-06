/**
 * ASCEND Form Coach — Local Persistence Repository
 *
 * Persists completed form analysis sessions in local storage, integrates
 * with active workout drafts and history, and ensures offline availability.
 */

import { FormSessionSummary } from '../models/form-session.types';
import { useStore } from '@/lib/store';
import {
  getFormSessionStorage,
  readFormSessions,
  writeFormSessions,
} from './form-session-storage';

export class FormSessionRepository {
  static getAllSessions(): FormSessionSummary[] {
    return readFormSessions();
  }

  static getSessionById(id: string): FormSessionSummary | null {
    const sessions = this.getAllSessions();
    return sessions.find((s) => s.id === id) ?? null;
  }

  static getSessionsForWorkout(workoutId: string): FormSessionSummary[] {
    const sessions = this.getAllSessions();
    return sessions.filter((s) => s.workoutId === workoutId);
  }

  /**
   * Coach bridge (B1): the most recent sessions, newest first — the read
   * the coach-chat context and the weekly review consume. Sessions are
   * stored newest-first, so this is a bounded slice, not a sort.
   */
  static getRecentSessions(limit = 5): FormSessionSummary[] {
    return this.getAllSessions().slice(0, Math.max(0, limit));
  }

  /**
   * Coach bridge (B1): the latest session per exercise id, keyed by
   * exerciseId — "where is this lift's form right now" for the coach.
   */
  static getLatestSessionPerExercise(): Map<string, FormSessionSummary> {
    const latest = new Map<string, FormSessionSummary>();
    for (const session of this.getAllSessions()) {
      if (!latest.has(session.exerciseId)) {
        latest.set(session.exerciseId, session);
      }
    }
    return latest;
  }

  static saveSession(session: FormSessionSummary): void {
    try {
      const sessions = this.getAllSessions();
      const existingIdx = sessions.findIndex((s) => s.id === session.id);
      if (existingIdx >= 0) {
        sessions[existingIdx] = session;
      } else {
        sessions.unshift(session);
      }
      writeFormSessions(sessions);
    } catch (err) {
      console.error('[FormSessionRepository] Failed to save session:', err);
    }
  }

  static deleteSession(id: string): void {
    if (!getFormSessionStorage()) return;
    writeFormSessions(this.getAllSessions().filter((s) => s.id !== id));
  }

  /**
   * Applies the completed Form Coach session reps to the active workout draft.
   * Returns true only when an exercise in the draft actually matched and was
   * updated; returns false (changing nothing) when there is no draft or no
   * exercise matches `exerciseName`.
   */
  static applyToActiveWorkout(
    session: FormSessionSummary,
    exerciseName: string,
    setIndex?: number,
    manualReps?: number
  ): boolean {
    const state = useStore.getState();
    const draft = state.activeWorkoutDraft;
    if (!draft || !draft.exercises) return false;

    const repCount = typeof manualReps === 'number' ? manualReps : session.totalValidReps;

    let applied = false;
    const updatedExercises = draft.exercises.map((ex) => {
      if (ex.name.toLowerCase() !== exerciseName.toLowerCase()) {
        return ex;
      }
      applied = true;

      const sets = [...ex.sets];
      const targetSetIdx =
        typeof setIndex === 'number' && setIndex >= 0 && setIndex < sets.length
          ? setIndex
          : sets.findIndex((s) => !s.completed);

      if (targetSetIdx >= 0) {
        sets[targetSetIdx] = {
          ...sets[targetSetIdx],
          reps: repCount,
          completed: true,
          status: 'completed',
        };
      }

      return {
        ...ex,
        sets,
        notes: ex.notes
          ? `${ex.notes}\n[Form Coach: ${session.totalValidReps} valid ${session.totalValidReps === 1 ? 'rep' : 'reps'}, avg ${session.averageRepDurationSeconds}s/rep]`
          : `[Form Coach: ${session.totalValidReps} valid ${session.totalValidReps === 1 ? 'rep' : 'reps'}, avg ${session.averageRepDurationSeconds}s/rep]`,
      };
    });

    // Nothing matched the target exercise: report failure honestly and
    // leave the draft and stored sessions untouched, so the caller can
    // fall back to a local-only save instead of claiming success.
    if (!applied) return false;

    state.saveWorkoutDraft({
      ...draft,
      exercises: updatedExercises,
      savedAt: new Date().toISOString(),
    });

    this.saveSession({
      ...session,
      savedToWorkout: true,
      userCorrectedReps: manualReps,
    });

    return true;
  }
}
