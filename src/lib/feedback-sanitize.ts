/**
 * Feedback submission sanitization (gauntlet R5 / SEC-13).
 *
 * The feedback route used to accept unauthenticated free-form
 * name/email plus an unvalidated `diagnostics` blob and insert all of
 * it (service-role) into the database and the email pipeline — so
 * anyone could paste third-party PII into diagnostics, and guest
 * rows with typo'd emails lingered past account deletion (the
 * deletion purge matches on the server-validated auth email, which
 * guest rows never had).
 *
 * Rules (pure functions, unit-tested):
 * - Message: required, 3–3000 chars; anything else is rejected.
 * - Category: allowlisted, default 'general'. Rating: 1–5 or absent.
 * - Title: truncated to 200 chars.
 * - Diagnostics: allowlisted to the 7 known fields, each truncated
 *   to 300 chars. Arbitrary extra keys are dropped, never stored.
 * - Signed-in (verified session): email is FORCED from the session
 *   (a caller cannot paste someone else's address); name comes from
 *   session metadata, else the client's own profile name (display
 *   name only, never an identity anchor).
 * - Guest (no/invalid token): no free-form identity at all — name
 *   and email are null (stored/emailed as Anonymous). Diagnostics
 *   are still accepted allowlist-filtered: they carry OS/browser
 *   shape, not PII. Guest rows therefore carry no email that could
 *   survive deletion unmatched.
 */

export type FeedbackCategory = 'bug' | 'feature' | 'review' | 'general';

export interface FeedbackDiagnostics {
  os?: string;
  browser?: string;
  screen?: string;
  deviceType?: string;
  appVersion?: string;
  url?: string;
  timestamp?: string;
}

export interface RawFeedbackInput {
  category?: unknown;
  rating?: unknown;
  title?: unknown;
  message?: unknown;
  userEmail?: unknown;
  userName?: unknown;
  diagnostics?: unknown;
}

export interface FeedbackSessionUser {
  email?: string | null;
  name?: string | null;
}

export interface SanitizedFeedback {
  category: FeedbackCategory;
  rating: number | undefined;
  title: string;
  message: string;
  userName: string | null;
  userEmail: string | null;
  diagnostics: FeedbackDiagnostics;
}

const DIAGNOSTIC_FIELDS: Array<keyof FeedbackDiagnostics> = [
  'os',
  'browser',
  'screen',
  'deviceType',
  'appVersion',
  'url',
  'timestamp',
];

const CATEGORIES: FeedbackCategory[] = ['bug', 'feature', 'review', 'general'];

export function sanitizeDiagnostics(raw: unknown): FeedbackDiagnostics {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FeedbackDiagnostics = {};
  for (const field of DIAGNOSTIC_FIELDS) {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.trim()) {
      out[field] = value.trim().slice(0, 300);
    }
  }
  return out;
}

function asTruncatedString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Returns the sanitized submission, or null when the message is
 * missing/too short (the route maps that to the existing 400).
 */
export function sanitizeFeedbackSubmission(
  body: RawFeedbackInput,
  sessionUser: FeedbackSessionUser | null,
): SanitizedFeedback | null {
  const category: FeedbackCategory =
    typeof body.category === 'string' && (CATEGORIES as string[]).includes(body.category)
      ? (body.category as FeedbackCategory)
      : 'general';

  const message = asTruncatedString(body.message, 3000);
  if (!message || message.length < 3) return null;

  const title = asTruncatedString(body.title, 200);
  const rating =
    typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5
      ? Math.round(body.rating)
      : undefined;

  const diagnostics = sanitizeDiagnostics(body.diagnostics);

  if (sessionUser) {
    return {
      category,
      rating,
      title,
      message,
      // Verified identity wins for email; name prefers session
      // metadata and falls back to the client's profile name.
      userEmail: sessionUser.email ? sessionUser.email.trim().slice(0, 150) : null,
      userName:
        (sessionUser.name ? sessionUser.name.trim().slice(0, 100) : '') ||
        asTruncatedString(body.userName, 100) ||
        null,
      diagnostics,
    };
  }

  // Guest: anonymous. No client-supplied name or email is stored.
  return {
    category,
    rating,
    title,
    message,
    userName: null,
    userEmail: null,
    diagnostics,
  };
}
