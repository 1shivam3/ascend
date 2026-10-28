import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { normalizeDateToLocalDay, getLocalDateOfTimestamp } from '../src/lib/formatters';

/**
 * Gauntlet DI-01: workout dates must be YYYY-MM-DD in the store.
 * The Log Past flow built `new Date(`${date}T12:00:00`).toISOString()`,
 * an ISO timestamp that `===` day comparisons (streaks) and
 * `<= todayStr` checks (athlete model, weekly reviews) silently miss,
 * even though WorkoutEntry.date documents YYYY-MM-DD.
 */
describe('gauntlet DI-01: workout date normalization', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('normalizes a Log Past-style ISO timestamp to its local day', () => {
    // Exactly what LogPastWorkoutModal builds for a picked date.
    const iso = new Date('2026-10-20T12:00:00').toISOString();
    expect(normalizeDateToLocalDay(iso)).toBe('2026-10-20');
  });

  it('passes YYYY-MM-DD through unchanged', () => {
    expect(normalizeDateToLocalDay('2026-10-20')).toBe('2026-10-20');
  });

  it('converts by LOCAL parts, not the UTC date part', () => {
    const iso = '2026-10-20T00:30:00.000Z';
    expect(normalizeDateToLocalDay(iso)).toBe(getLocalDateOfTimestamp(Date.parse(iso)));
  });

  it('passes an unparseable string through unchanged (no silent destruction)', () => {
    expect(normalizeDateToLocalDay('not-a-date')).toBe('not-a-date');
  });

  it('addWorkout stores the normalized day, so === day matching works', () => {
    const iso = new Date('2026-10-20T12:00:00').toISOString();
    useStore.getState().addWorkout({
      id: 'gauntlet-di01',
      date: iso,
      name: 'Past workout',
      exercises: [],
    } as never);
    const stored = useStore.getState().workouts.find((w) => w.id === 'gauntlet-di01');
    expect(stored).toBeDefined();
    expect(stored!.date).toBe('2026-10-20');
    // The exact comparison streaks and weekly reviews rely on.
    expect(stored!.date === '2026-10-20').toBe(true);
  });

  it('addWorkout leaves an already-correct date untouched', () => {
    useStore.getState().addWorkout({
      id: 'gauntlet-di01b',
      date: '2026-10-21',
      name: 'Normal workout',
      exercises: [],
    } as never);
    const stored = useStore.getState().workouts.find((w) => w.id === 'gauntlet-di01b');
    expect(stored!.date).toBe('2026-10-21');
  });
});
