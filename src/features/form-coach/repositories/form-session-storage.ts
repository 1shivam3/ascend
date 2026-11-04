/**
 * ASCEND Form Coach — Session Storage (leaf module)
 *
 * The raw localStorage read/write for form-coach sessions, split out of
 * FormSessionRepository so that consumers which must not import the
 * store (e.g. src/lib/store.ts itself, for the weekly review) can read
 * sessions without a store ↔ repository import cycle. The repository
 * delegates here; this module imports nothing but the types.
 */

import { FormSessionSummary } from '../models/form-session.types';

export const FORM_SESSIONS_STORAGE_KEY = 'ascend_form_coach_sessions';
export const MAX_STORED_SESSIONS = 50;

export function getFormSessionStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

/** All stored sessions, newest first (the order saveSession maintains). */
export function readFormSessions(): FormSessionSummary[] {
  const storage = getFormSessionStorage();
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

export function writeFormSessions(sessions: FormSessionSummary[]): void {
  const storage = getFormSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(
      FORM_SESSIONS_STORAGE_KEY,
      JSON.stringify(sessions.slice(0, MAX_STORED_SESSIONS))
    );
  } catch (err) {
    console.error('[FormSessionRepository] Failed to write sessions:', err);
  }
}
