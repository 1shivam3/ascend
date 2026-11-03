/**
 * ASCEND Form Coach — Local Persistence Repository
 *
 * Persists completed form analysis sessions in local storage, integrates
 * with active workout drafts and history, and ensures offline availability.
 */

import { FormSessionSummary } from '../models/form-session.types';
import { useStore } from '@/lib/store';

const FORM_SESSIONS_STORAGE_KEY = 'ascend_form_coach_sessions';
const MAX_STORED_SESSIONS = 50;

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

export class FormSessionRepository {
  static getAllSessions(): FormSessionSummary[] {
    const storage = getStorage();
    if (!storage) return [];
    try {
      const raw = storage.getItem(FORM_SESSIONS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[FormSessionRepository] Failed to read sessions:', err);
      return [];
    }
  }

  static getSessionById(id: string): FormSessionSummary | null {
    const sessions = this.getAllSessions();
    return sessions.find((s) => s.id === id) ?? null;
  }

  static getSessionsForWorkout(workoutId: string): FormSessionSummary[] {
    const sessions = this.getAllSessions();
    return sessions.filter((s) => s.workoutId === workoutId);
  }

  static saveSession(session: FormSessionSummary): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      const sessions = this.getAllSessions();
      const existingIdx = sessions.findIndex((s) => s.id === session.id);
      if (existingIdx >= 0) {
        sessions[existingIdx] = session;
      } else {
        sessions.unshift(session);
      }

      const trimmed = sessions.slice(0, MAX_STORED_SESSIONS);
      storage.setItem(FORM_SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.error('[FormSessionRepository] Failed to save session:', err);
    }
  }

  static deleteSession(id: string): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      const sessions = this.getAllSessions().filter((s) => s.id !== id);
      storage.setItem(FORM_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch (err) {
      console.error('[FormSessionRepository] Failed to delete session:', err);
    }
  }

  /**
   * Applies the completed Form Coach session reps to the active workout draft.
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

    const updatedExercises = draft.exercises.map((ex) => {
      if (ex.name.toLowerCase() !== exerciseName.toLowerCase()) {
        return ex;
      }

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
          ? `${ex.notes}\n[Form Coach: ${session.totalValidReps} valid reps, avg ${session.averageRepDurationSeconds}s/rep]`
          : `[Form Coach: ${session.totalValidReps} valid reps, avg ${session.averageRepDurationSeconds}s/rep]`,
      };
    });

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
