/**
 * User-facing error sanitizer (QA4-016).
 *
 * Raw provider/SDK errors leak internals to users: URLs, HTTP status
 * codes, provider names, API-key hints, JSON payloads and stack text.
 * ScanMealModal used to render `err.message` verbatim for anything that
 * wasn't a provider-named error, so a fetch failure surfaced as e.g.
 * "POST https://api.groq.com/openai/v1/chat/completions 429 {...}".
 *
 * `toUserMessage` maps ANY thrown value to safe, actionable copy:
 * - known error classes (offline, timeout/abort, low memory/quota,
 *   unconfigured AI provider, rate limit, image too large / bad type)
 *   get specific, helpful messages;
 * - everything else gets a generic fallback for the calling surface.
 *
 * The full original error is logged to the console (dev diagnostics) —
 * never returned. The returned string NEVER contains a URL, a status
 * code, a provider name, or raw exception text. Pattern checks run on
 * the raw message internally only; nothing raw is echoed back.
 *
 * Localization (item-4, 2026-11-05): every fixed message also carries
 * a `LocalizedSentence` key (`userError.*`) via
 * `toUserMessageLocalized`, so client callers can render it through
 * coach-i18n's renderLocalizedSentence in the UI language. The one
 * exception is the pass-through branch: short plain-language messages
 * written by our own code are returned as-is (they are already in
 * whatever language the throwing code produced) with no struct.
 * All callers are client components — no server route calls this.
 */
import { renderLocalizedSentence } from './coach-i18n';
import type { LocalizedSentence } from './coach-i18n';
import type { Language, StringKey } from './i18n/en';

export type UserErrorContext = 'scan' | 'image' | 'generic';

export interface UserMessage {
  /** Safe English copy (identical to what toUserMessage returns). */
  text: string;
  /** Localizable struct for the same copy, when the copy is one of
   *  this module's fixed messages. Absent for pass-through messages. */
  i18n?: LocalizedSentence;
}

const FALLBACKS: Record<UserErrorContext, string> = {
  scan: 'Could not analyze this photo. Please try again, or use manual food search or the offline estimate below.',
  image: 'Failed to process this photo. Please try again.',
  generic: 'Something went wrong. Please try again.',
};

const FALLBACK_KEYS: Record<UserErrorContext, StringKey> = {
  scan: 'userError.fallbackScan',
  image: 'userError.fallbackImage',
  generic: 'userError.fallbackGeneric',
};

/** Provider / config vocabulary that must never reach the UI. Detection
 *  only — matched text is replaced, never echoed. */
const PROVIDER_OR_CONFIG_PATTERN =
  /api[\s_-]?key|gemini|groq|openrouter|openai|anthropic|supabase|no_api_key|unconfigured|key configured|all vision ai providers failed/i;

const URL_OR_CODE_PATTERN = /https?:\/\/|\b[45]\d{2}\b|[{[]|at\s+\w+\s+\(/;

/** Raw JS/SDK exception phrasing that must never be echoed either. */
const RAW_EXCEPTION_PATTERN =
  /unexpected|is not a function|is not defined|cannot read propert|typeerror|referenceerror|syntaxerror|json\.parse/i;

function rawMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message || '';
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

function codeOf(err: unknown): string {
  if (err && typeof err === 'object') {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') return c;
    const s = (err as { status?: unknown }).status;
    if (typeof s === 'number') return String(s);
  }
  return '';
}

function nameOf(err: unknown): string {
  return err instanceof Error ? err.name : '';
}

/**
 * Map any thrown value to a safe user-facing message.
 *
 * @param err      The caught value (Error, string, SDK error object, …).
 * @param context  Which surface is showing it — picks the fallback copy.
 * @param log      Set false in tests / hot paths to skip the console log.
 */
export function toUserMessage(
  err: unknown,
  context: UserErrorContext = 'generic',
  log = true,
): string {
  return toUserMessageLocalized(err, context, log).text;
}

/**
 * Same mapping as toUserMessage, but also returns the localizable
 * struct for fixed copy so callers can render in the UI language.
 */
export function toUserMessageLocalized(
  err: unknown,
  context: UserErrorContext = 'generic',
  log = true,
): UserMessage {
  if (log && typeof console !== 'undefined') {
    // Full detail stays on the console side for support/diagnostics.
    console.error('[ascend] user-facing error (sanitized):', err);
  }

  const raw = rawMessageOf(err);
  const lower = raw.toLowerCase();
  const code = codeOf(err);
  const name = nameOf(err);
  const fixed = (text: string, key: StringKey): UserMessage => ({ text, i18n: { key } });

  // Cancelled by the user / superseded request — not an error at all.
  if (name === 'AbortError' || lower.includes('abort')) {
    return fixed('Canceled.', 'userError.cancelled');
  }

  // AI daily quota / fleet cap (server codes AI_QUOTA_EXCEEDED /
  // AI_DAILY_CAP). Must precede the storage branch below: its generic
  // 'quota' match is about DEVICE storage, while the remedy here is
  // waiting for the window reset (and, for guests, signing in raises
  // the limit). Before Task 2.3 these codes fell through to the
  // generic fallback and the remedy was lost.
  if (code === 'AI_QUOTA_EXCEEDED' || code === 'AI_DAILY_CAP') {
    return context === 'scan'
      ? fixed("You've reached today's AI scan limit — it resets tomorrow, and signing in raises the limit. Manual food search and the offline estimate still work.", 'userError.quotaScan')
      : fixed("You've reached today's AI limit — it resets tomorrow, and signing in raises the limit.", 'userError.quotaGeneric');
  }

  // Device memory / storage pressure (image pipeline).
  if (
    name === 'QuotaExceededError' ||
    lower.includes('memory') ||
    lower.includes('quota') ||
    lower.includes('out of memory')
  ) {
    return fixed('Your device is low on memory or storage. Try closing background apps, then try again.', 'userError.lowMemory');
  }

  // Connectivity.
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('offline') ||
    code === 'NETWORK_ERROR'
  ) {
    return fixed('No connection right now. Check your internet and try again — or use the offline options below.', 'userError.noConnection');
  }

  // Timeouts.
  if (name === 'TimeoutError' || lower.includes('timed out') || lower.includes('timeout')) {
    return fixed('That took too long and timed out. Please try again.', 'userError.timeout');
  }

  // AI provider unconfigured / unavailable (keys, provider names, 503s).
  // The copy must not name the provider or mention keys.
  if (
    code === 'NO_API_KEY' ||
    code === '503' ||
    PROVIDER_OR_CONFIG_PATTERN.test(raw)
  ) {
    return context === 'scan'
      ? fixed('Meal photo recognition is temporarily unavailable. You can use manual food search or the offline estimate below.', 'userError.unavailableScan')
      : fixed('This feature is temporarily unavailable. Please try again later.', 'userError.unavailableGeneric');
  }

  // Rate limiting — status kept server-side; user gets the action.
  if (code === '429' || lower.includes('rate limit') || lower.includes('too many requests')) {
    return fixed('Too many requests right now. Please wait a moment and try again.', 'userError.rateLimit');
  }

  // Bad image input.
  if (
    lower.includes('image') &&
    (lower.includes('too large') || lower.includes('unsupported') || lower.includes('invalid'))
  ) {
    return fixed('That photo could not be read. Try a different photo (JPEG or PNG works best).', 'userError.badImage');
  }

  // Anything that still looks like internals → generic fallback.
  if (!raw || URL_OR_CODE_PATTERN.test(raw) || PROVIDER_OR_CONFIG_PATTERN.test(raw)) {
    return fixed(FALLBACKS[context], FALLBACK_KEYS[context]);
  }

  // Short, plain-language messages from our own code are safe to show:
  // single sentence, no internals (checked above), reasonable length.
  // No struct: the message is app-authored copy, shown as written.
  if (raw.length <= 120 && !raw.includes('\n') && !RAW_EXCEPTION_PATTERN.test(raw)) {
    return { text: raw };
  }

  return fixed(FALLBACKS[context], FALLBACK_KEYS[context]);
}

/**
 * One-call convenience for client callers: sanitize + render in the
 * UI language. Falls back to the English text for pass-through
 * messages (no struct) and whenever the language is English.
 */
export function localizedUserMessage(
  t: (key: StringKey, params?: Record<string, string | number>) => string,
  language: Language,
  err: unknown,
  context: UserErrorContext = 'generic',
  log = true,
): string {
  const m = toUserMessageLocalized(err, context, log);
  return renderLocalizedSentence(t, language, m.i18n, m.text);
}
