import { describe, it, expect, beforeEach } from 'vitest';
import { FormSessionRepository } from '@/features/form-coach/repositories/FormSessionRepository';
import { FormSessionSummary } from '@/features/form-coach/models/form-session.types';
import { useStore } from '@/lib/store';

// In-memory mock storage for Node environment
class MemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

describe('FormSessionRepository', () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
    useStore.setState({
      activeWorkoutDraft: {
        id: 'draft-1',
        name: 'Leg Day',
        date: '2026-11-03',
        savedAt: new Date().toISOString(),
        exercises: [
          {
            name: 'Barbell Back Squat',
            sets: [
              { reps: 0, weight: 100, unit: 'kg', completed: false },
              { reps: 0, weight: 100, unit: 'kg', completed: false },
            ],
          },
        ],
      },
    });
  });

  const mockSession: FormSessionSummary = {
    id: 'session-abc-123',
    workoutId: 'workout-test',
    setIndex: 0,
    exerciseId: 'squat',
    exerciseName: 'Barbell Back Squat',
    analyzerVersion: '1.0.0',
    cameraView: 'left',
    startedAt: 1000,
    endedAt: 25000,
    durationSeconds: 24,
    totalDetectedReps: 5,
    totalValidReps: 5,
    analysedRepCount: 5,
    averageTrackingConfidence: 0.92,
    averageRepDurationSeconds: 3.2,
    reps: [],
    observations: [],
    savedToWorkout: false,
  };

  it('saves and retrieves sessions from local storage', () => {
    FormSessionRepository.saveSession(mockSession);
    const sessions = FormSessionRepository.getAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('session-abc-123');

    const single = FormSessionRepository.getSessionById('session-abc-123');
    expect(single?.exerciseName).toBe('Barbell Back Squat');
  });

  it('filters sessions by workoutId correctly', () => {
    FormSessionRepository.saveSession(mockSession);
    FormSessionRepository.saveSession({
      ...mockSession,
      id: 'session-other',
      workoutId: 'other-workout',
    });

    const matches = FormSessionRepository.getSessionsForWorkout('workout-test');
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe('session-abc-123');
  });

  it('applies completed form session reps to active workout draft', () => {
    const success = FormSessionRepository.applyToActiveWorkout(
      mockSession,
      'Barbell Back Squat',
      0,
      6 // User corrected reps to 6
    );

    expect(success).toBe(true);

    const draft = useStore.getState().activeWorkoutDraft;
    expect(draft).not.toBeNull();
    const squatEx = draft?.exercises.find((e) => e.name === 'Barbell Back Squat');
    expect(squatEx?.sets[0].completed).toBe(true);
    expect(squatEx?.sets[0].reps).toBe(6);
    expect(squatEx?.notes).toContain('Form Coach: 5 valid reps');
  });

  it('returns false and changes nothing when no draft exercise matches', () => {
    // Draft contains only Bench Press — the squat session cannot apply.
    useStore.setState({
      activeWorkoutDraft: {
        id: 'draft-2',
        name: 'Upper Day',
        date: '2026-11-03',
        savedAt: new Date().toISOString(),
        exercises: [
          {
            name: 'Bench Press',
            sets: [{ reps: 0, weight: 60, unit: 'kg', completed: false }],
          },
        ],
      } as any,
    });

    const success = FormSessionRepository.applyToActiveWorkout(
      mockSession,
      'Barbell Back Squat',
      0,
      6
    );

    expect(success).toBe(false);

    // Draft untouched: no set completed, no Form Coach note appended.
    const draft = useStore.getState().activeWorkoutDraft;
    const bench = draft?.exercises.find((e) => e.name === 'Bench Press');
    expect(bench?.sets[0].completed).toBe(false);
    expect(bench?.sets[0].reps).toBe(0);
    expect(bench?.notes).toBeUndefined();

    // Session must NOT be persisted as saved-to-workout.
    const stored = FormSessionRepository.getSessionById('session-abc-123');
    expect(stored).toBeNull();
  });

  it('returns false when there is no active workout draft', () => {
    useStore.setState({ activeWorkoutDraft: null });

    const success = FormSessionRepository.applyToActiveWorkout(
      mockSession,
      'Barbell Back Squat',
      0
    );

    expect(success).toBe(false);
  });
});
