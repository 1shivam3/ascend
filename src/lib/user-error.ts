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
 */

export type UserErrorContext = 'scan' | 'image' | 'generic';

const FALLBACKS: Record<UserErrorContext, string> = {
  scan: 'Could not analyze this photo. Please try again, or use manual food search or the offline estimate below.',
  image: 'Failed to process this photo. Please try again.',
  generic: 'Something went wrong. Please try again.',
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
  if (log && typeof console !== 'undefined') {
    // Full detail stays on the console side for support/diagnostics.
    console.error('[ascend] user-facing error (sanitized):', err);
  }

  const raw = rawMessageOf(err);
  const lower = raw.toLowerCase();
  const code = codeOf(err);
  const name = nameOf(err);

  // Cancelled by the user / superseded request — not an error at all.
  if (name === 'AbortError' || lower.includes('abort')) {
    return 'Cancelled.';
  }

  // Device memory / storage pressure (image pipeline).
  if (
    name === 'QuotaExceededError' ||
    lower.includes('memory') ||
    lower.includes('quota') ||
    lower.includes('out of memory')
  ) {
    return 'Your device is low on memory or storage. Try closing background apps, then try again.';
  }

  // Connectivity.
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('offline') ||
    code === 'NETWORK_ERROR'
  ) {
    return 'No connection right now. Check your internet and try again — or use the offline options below.';
  }

  // Timeouts.
  if (name === 'TimeoutError' || lower.includes('timed out') || lower.includes('timeout')) {
    return 'That took too long and timed out. Please try again.';
  }

  // AI provider unconfigured / unavailable (keys, provider names, 503s).
  // The copy must not name the provider or mention keys.
  if (
    code === 'NO_API_KEY' ||
    code === '503' ||
    PROVIDER_OR_CONFIG_PATTERN.test(raw)
  ) {
    return context === 'scan'
      ? 'Meal photo recognition is temporarily unavailable. You can use manual food search or the offline estimate below.'
      : 'This feature is temporarily unavailable. Please try again later.';
  }

  // Rate limiting — status kept server-side; user gets the action.
  if (code === '429' || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many requests right now. Please wait a moment and try again.';
  }

  // Bad image input.
  if (
    lower.includes('image') &&
    (lower.includes('too large') || lower.includes('unsupported') || lower.includes('invalid'))
  ) {
    return 'That photo could not be read. Try a different photo (JPEG or PNG works best).';
  }

  // Anything that still looks like internals → generic fallback.
  if (!raw || URL_OR_CODE_PATTERN.test(raw) || PROVIDER_OR_CONFIG_PATTERN.test(raw)) {
    return FALLBACKS[context];
  }

  // Short, plain-language messages from our own code are safe to show:
  // single sentence, no internals (checked above), reasonable length.
  if (raw.length <= 120 && !raw.includes('\n') && !RAW_EXCEPTION_PATTERN.test(raw)) {
    return raw;
  }

  return FALLBACKS[context];
}
