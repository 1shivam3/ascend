/**
 * Task 2.4 — guest data-safety net: persistent-storage request,
 * last-backup tracking, and the two backup nudge milestones.
 *
 * Guest data lives ONLY in this browser's storage (IndexedDB +
 * localStorage). Browsers may evict it under storage pressure, and
 * iOS Safari clears site data for sites not visited for a while —
 * so a guest's whole history can vanish without any user action.
 * Three small defences:
 *
 *  1. `requestPersistentStorage()` — asks the browser to exempt our
 *     origin from automatic eviction (best-effort, never throws).
 *  2. `recordBackupExported()` / `getLastBackupAt()` — remembers
 *     when a backup file was last downloaded, so the Data Vault can
 *     show it and the nudges can stand down once the user is safe.
 *  3. `decideBackupNudge()` — pure milestone logic: nudge a guest
 *     after their first completed workout, then once more when they
 *     are established (~7 days since the first workout OR 10
 *     workouts). Each milestone shows once; a backup downloaded
 *     after the relevant point suppresses it.
 */

export const BACKUP_NUDGE_STATE_KEY = 'ascend_backup_nudge_v1';
export const LAST_BACKUP_AT_KEY = 'ascend_last_backup_at';

export type BackupNudgeMilestone = 'first-workout' | 'established';

export interface BackupNudgeSeen {
  first?: number | null;
  established?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Timestamp of the last backup download on this device, or null. */
export function getLastBackupAt(): number | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(LAST_BACKUP_AT_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  } catch {
    return null;
  }
}

/** Records that a backup file was just downloaded. Never throws. */
export function recordBackupExported(at: number = Date.now()): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(LAST_BACKUP_AT_KEY, String(at));
  } catch {
    /* storage full/blocked — the download itself still happened */
  }
}

export function getBackupNudgeSeen(): BackupNudgeSeen {
  const ls = safeLocalStorage();
  if (!ls) return {};
  try {
    const raw = ls.getItem(BACKUP_NUDGE_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BackupNudgeSeen;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Marks a milestone as shown (dismissed or acted on). Never throws. */
export function markBackupNudgeShown(
  milestone: BackupNudgeMilestone,
  at: number = Date.now()
): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const seen = getBackupNudgeSeen();
    if (milestone === 'first-workout') seen.first = at;
    else seen.established = at;
    ls.setItem(BACKUP_NUDGE_STATE_KEY, JSON.stringify(seen));
  } catch {
    /* ignore — worst case the nudge shows once more */
  }
}

/** Earliest workout timestamp from `YYYY-MM-DD` dates, or null. */
export function firstWorkoutTimestamp(
  workouts: Array<{ date?: string | null }>
): number | null {
  let earliest: number | null = null;
  for (const w of workouts) {
    if (!w?.date) continue;
    // Parse as a LOCAL date: `new Date('2026-01-05')` is UTC midnight,
    // which can read as the previous day west of Greenwich.
    const ts = new Date(`${w.date}T00:00:00`).getTime();
    if (!Number.isFinite(ts)) continue;
    if (earliest === null || ts < earliest) earliest = ts;
  }
  return earliest;
}

export interface BackupNudgeInput {
  /** True only for guests (no permanent account). Signed-in users
   *  sync to the cloud and are never nudged. */
  isGuest: boolean;
  workoutCount: number;
  firstWorkoutTs: number | null;
  lastBackupAt: number | null;
  seen: BackupNudgeSeen;
  now: number;
}

/**
 * Which nudge (if any) should be visible right now.
 *
 * - 'first-workout': guest with ≥1 completed workout who has not
 *   seen this milestone and has not backed up since that workout.
 * - 'established': the first nudge was seen, no backup since, and
 *   the user is now established (≥10 workouts OR ≥7 days since the
 *   first workout).
 */
export function decideBackupNudge(input: BackupNudgeInput): BackupNudgeMilestone | null {
  const { isGuest, workoutCount, firstWorkoutTs, lastBackupAt, seen, now } = input;
  if (!isGuest || workoutCount < 1 || firstWorkoutTs === null) return null;

  if (!seen.first) {
    // A backup taken after the first workout already covers it.
    if (lastBackupAt !== null && lastBackupAt >= firstWorkoutTs) return null;
    return 'first-workout';
  }

  if (!seen.established) {
    const established =
      workoutCount >= 10 || now - firstWorkoutTs >= 7 * DAY_MS;
    if (!established) return null;
    // A backup downloaded after the first nudge already covers it.
    if (lastBackupAt !== null && lastBackupAt > (seen.first ?? 0)) return null;
    return 'established';
  }

  return null;
}

export type PersistentStorageResult =
  | 'persisted' // already persistent
  | 'granted'
  | 'denied'
  | 'unsupported';

/**
 * Asks the browser to keep this origin's storage (protection against
 * automatic eviction). Safe to call on every app start; never throws.
 */
export async function requestPersistentStorage(): Promise<PersistentStorageResult> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) {
      return 'unsupported';
    }
    const storage = navigator.storage;
    if (typeof storage.persist !== 'function') return 'unsupported';
    if (typeof storage.persisted === 'function') {
      try {
        if (await storage.persisted()) return 'persisted';
      } catch {
        /* fall through and ask */
      }
    }
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
