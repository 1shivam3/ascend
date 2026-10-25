import { isRecognizedBackupData } from './storage';

/**
 * FND-06 — the "first load with retained local data" fork.
 *
 * After a logout (clearLocalData: false) the profile is gone but the
 * history arrays stay in the persisted blob, so a fresh profile used
 * to silently inherit them. These pure helpers decide whether retained
 * history exists and describe it — the fork screen shows COUNTS, not
 * a name, because logout also wipes the profile (and the
 * ascend_profile key): no name survives to show as "Continue as
 * [name]". Counts are the honest identifier that does survive.
 *
 * This module never touches the store (no import cycle): the store
 * actions that archive/clear/restore live in store.ts.
 */

/** Single-slot archive key: the latest Start-fresh archive wins. */
export const ARCHIVED_HISTORY_KEY = 'ascend_archived_history';

export interface RetainedHistoryInput {
  workouts?: unknown[] | null;
  meals?: unknown[] | null;
  plannedWorkouts?: unknown[] | null;
  prs?: unknown[] | null;
  bodyMetrics?: unknown[] | null;
  prTargets?: Record<string, unknown> | null;
  macroGoals?: unknown;
}

export interface RetainedHistoryCounts {
  sessions: number;
  meals: number;
  plans: number;
  targets: number;
}

export function retainedHistoryCounts(input: RetainedHistoryInput): RetainedHistoryCounts {
  return {
    sessions: Array.isArray(input.workouts) ? input.workouts.length : 0,
    meals: Array.isArray(input.meals) ? input.meals.length : 0,
    plans: Array.isArray(input.plannedWorkouts) ? input.plannedWorkouts.length : 0,
    targets:
      (input.prTargets ? Object.keys(input.prTargets).length : 0) +
      (input.macroGoals ? 1 : 0),
  };
}

export function hasRetainedHistory(input: RetainedHistoryInput): boolean {
  const c = retainedHistoryCounts(input);
  return (
    c.sessions > 0 ||
    c.meals > 0 ||
    c.plans > 0 ||
    (Array.isArray(input.prs) && input.prs.length > 0) ||
    (Array.isArray(input.bodyMetrics) && input.bodyMetrics.length > 0) ||
    c.targets > 0
  );
}

export interface ArchivedHistorySummary {
  counts: RetainedHistoryCounts;
  archivedAt?: string;
}

/**
 * Read + validate the Start-fresh archive (null when absent or not
 * ASCEND data). The archive is a full backup (storage.ts shape), so
 * its fields count exactly like live state.
 */
export function readArchivedHistory(): ArchivedHistorySummary | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ARCHIVED_HISTORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isRecognizedBackupData(parsed)) return null;
    return {
      counts: retainedHistoryCounts({
        workouts: parsed.workouts,
        meals: parsed.meals,
        plannedWorkouts: parsed.plannedWorkouts,
        prs: parsed.prs,
        bodyMetrics: parsed.bodyMetrics,
        prTargets: parsed.prTargets,
        macroGoals: parsed.macroGoals,
      }),
      archivedAt: typeof parsed.archivedAt === 'string' ? parsed.archivedAt : undefined,
    };
  } catch {
    return null;
  }
}
