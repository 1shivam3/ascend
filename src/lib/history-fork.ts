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
 * of the older history. Restore reads the main slot (unchanged).
 *
 * Phase 1.8 (§12): the two-key rotation was not atomic — the PREV
 * write was silently best-effort, so its failure lost the older
 * generation without a signal — and the readers disagreed (restore
 * and the summary read only the current slot; sync's macro-goal
 * restore fell back to PREV; absent/corrupt/foreign all read as the
 * same null). The archive now lives as ONE versioned list under
 * ARCHIVED_HISTORY_KEY ({version: 2, archives: [newest, previous]}):
 * rotation is a single setItem. The helpers below are the only
 * readers/writers; they accept the legacy two-key shape
 * (backward-compatible reads) and migrate it into the list on the
 * next write. ARCHIVED_HISTORY_PREV_KEY remains only as the legacy
 * read/migration source — nothing writes it anymore. */
export const ARCHIVED_HISTORY_KEY = 'ascend_archived_history';
export const ARCHIVED_HISTORY_PREV_KEY = 'ascend_archived_history_prev';

/** The list format version stored under ARCHIVED_HISTORY_KEY. */
export const ARCHIVE_LIST_VERSION = 2;
/** Generations kept — the same two the two-key rotation kept. */
const MAX_ARCHIVE_GENERATIONS = 2;

export type ArchiveReadResult =
  | {
      kind: 'found';
      archive: Record<string, unknown>;
      slot: 'current' | 'previous';
      format: 'list' | 'legacy';
    }
  | { kind: 'absent' }
  | { kind: 'corrupt' };

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/**
 * One STORED generation slot: `archive` is null when something is
 * stored in that slot but it is not a readable ASCEND backup — the
 * distinction the discriminated read is built on.
 */
interface StoredArchiveEntry {
  archive: Record<string, unknown> | null;
  format: 'list' | 'legacy';
}

function toStoredEntry(value: unknown, format: 'list' | 'legacy'): StoredArchiveEntry {
  return {
    archive: isRecognizedBackupData(value) ? (value as Record<string, unknown>) : null,
    format,
  };
}

/**
 * The stored generation slots, newest first, across the list format
 * and the legacy two-key shape. At most MAX_ARCHIVE_GENERATIONS
 * slots: the list's entries, or a legacy bare backup (one slot),
 * with the legacy PREV key filling any remaining slot.
 */
function readStoredArchiveEntries(): StoredArchiveEntry[] {
  const entries: StoredArchiveEntry[] = [];
  if (!storageAvailable()) return entries;
  try {
    const mainRaw = localStorage.getItem(ARCHIVED_HISTORY_KEY);
    if (mainRaw !== null) {
      let parsed: unknown = null;
      let parseOk = true;
      try {
        parsed = JSON.parse(mainRaw);
      } catch {
        parseOk = false;
      }
      if (
        parseOk &&
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { archives?: unknown }).archives)
      ) {
        for (const entry of (parsed as { archives: unknown[] }).archives) {
          entries.push(toStoredEntry(entry, 'list'));
        }
      } else {
        entries.push(
          parseOk ? toStoredEntry(parsed, 'legacy') : { archive: null, format: 'legacy' },
        );
      }
    }
    if (entries.length < MAX_ARCHIVE_GENERATIONS) {
      const prevRaw = localStorage.getItem(ARCHIVED_HISTORY_PREV_KEY);
      if (prevRaw !== null) {
        try {
          entries.push(toStoredEntry(JSON.parse(prevRaw), 'legacy'));
        } catch {
          entries.push({ archive: null, format: 'legacy' });
        }
      }
    }
  } catch {
    // Storage read failure: report the slots gathered so far.
  }
  return entries.slice(0, MAX_ARCHIVE_GENERATIONS);
}

/** Every readable archive generation, newest first (either format). */
export function readArchiveGenerations(): Record<string, unknown>[] {
  return readStoredArchiveEntries()
    .filter((e): e is StoredArchiveEntry & { archive: Record<string, unknown> } => e.archive !== null)
    .map((e) => e.archive);
}

/**
 * The §12 discriminated read — the ONE read path for the archive.
 * The unified fallback rule: the newest READABLE generation wins,
 * whichever slot it occupies; 'absent' (nothing stored) and
 * 'corrupt' (stored but nothing readable) are distinct outcomes,
 * never conflated into a bare null.
 */
export function readArchiveResult(): ArchiveReadResult {
  const entries = readStoredArchiveEntries();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.archive !== null) {
      return {
        kind: 'found',
        archive: entry.archive,
        slot: i === 0 ? 'current' : 'previous',
        format: entry.format,
      };
    }
  }
  return entries.length > 0 ? { kind: 'corrupt' } : { kind: 'absent' };
}

/**
 * Append one generation — the §12 single-key list write. Rotation
 * is ONE setItem of the whole list, so it cannot half-happen the
 * way the two-key rotation could. Legacy generations are carried
 * into the list (migration) and the legacy PREV key is removed.
 * Returns false when the write fails; the caller must then NOT
 * clear live state (the archive may be the only copy).
 */
export function appendArchive(archive: Record<string, unknown>): boolean {
  if (!storageAvailable()) return false;
  try {
    const next = [archive, ...readArchiveGenerations()].slice(0, MAX_ARCHIVE_GENERATIONS);
    localStorage.setItem(
      ARCHIVED_HISTORY_KEY,
      JSON.stringify({ version: ARCHIVE_LIST_VERSION, archives: next }),
    );
    try {
      localStorage.removeItem(ARCHIVED_HISTORY_PREV_KEY);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

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
 *
 * §12: built on the shared discriminated read — the summary now
 * follows the same unified fallback as every other reader (a
 * corrupt newest generation no longer hides a healthy previous
 * one). The outward shape is unchanged: null when nothing readable
 * exists, whether the underlying result was 'absent' or 'corrupt'.
 */
export function readArchivedHistory(): ArchivedHistorySummary | null {
  const result = readArchiveResult();
  if (result.kind !== 'found') return null;
  const parsed = result.archive;
  return {
    counts: retainedHistoryCounts({
      workouts: parsed.workouts as unknown[] | undefined,
      meals: parsed.meals as unknown[] | undefined,
      plannedWorkouts: parsed.plannedWorkouts as unknown[] | undefined,
      prs: parsed.prs as unknown[] | undefined,
      bodyMetrics: parsed.bodyMetrics as unknown[] | undefined,
      prTargets: parsed.prTargets as Record<string, unknown> | undefined,
      macroGoals: parsed.macroGoals,
    }),
    archivedAt: typeof parsed.archivedAt === 'string' ? parsed.archivedAt : undefined,
  };
}
