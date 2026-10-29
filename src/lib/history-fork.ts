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
 *
 * Gauntlet Cycle 2 (B-07 / TRIAGE-PA-01): the TRIGGER below counts
 * history records only — sessions, meals, plans, PRs, body metrics.
 * Targets (prTargets, macroGoals) are deliberately NOT a trigger, even
 * though retainedHistoryCounts still reports them for display. Two
 * reasons, both proven by the Part B run: (1) onboarding itself sets
 * macroGoals BEFORE the profile exists (Onboarding.tsx computes
 * recommended goals while the profile is still staged in
 * pendingProfile), so counting targets made the fork self-trigger
 * mid-onboarding and show "0 sessions • 0 meals • 0 plans •
 * 1 target" in place of the plan-offer/summary screens — and
 * unmounting onboarding destroyed the staged profile (TRIAGE-PA-01);
 * (2) onboarding deliberately PRESERVES existing targets on
 * re-onboarding after a logout, so targets-only state is not history
 * that must be fork-guarded. The same narrowing also stops a
 * targets-only logout from overwriting a previous good archive with a
 * sessions-empty one (the logout guard and the import guard share
 * this predicate, and both comments already state the "must not
 * clobber" rule).
 */

/** Archive keys (gauntlet DI-13): two slots. The latest Start-fresh
 * archive lives under ARCHIVED_HISTORY_KEY; archiving again first
 * rotates the current archive into ARCHIVED_HISTORY_PREV_KEY, so one
 * accidental second Start-fresh can no longer destroy the only copy
 * of the older history. Restore reads the main slot (unchanged). */
export const ARCHIVED_HISTORY_KEY = 'ascend_archived_history';
export const ARCHIVED_HISTORY_PREV_KEY = 'ascend_archived_history_prev';

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
  // Gauntlet Cycle 2: targets are NOT a trigger (see module comment).
  // Sessions, meals, plans, PRs, and body metrics are history records
  // that must never silently attach to the next profile; targets are
  // set by onboarding itself before any profile exists and are
  // deliberately preserved across re-onboarding.
  const c = retainedHistoryCounts(input);
  return (
    c.sessions > 0 ||
    c.meals > 0 ||
    c.plans > 0 ||
    (Array.isArray(input.prs) && input.prs.length > 0) ||
    (Array.isArray(input.bodyMetrics) && input.bodyMetrics.length > 0)
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
