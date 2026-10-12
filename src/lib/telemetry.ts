/**
 * ASCEND Privacy & Telemetry Utilities
 * Manages environment-driven telemetry configuration and user consent gating.
 */

export type TelemetryConsent = 'accepted' | 'declined' | null;

export const TELEMETRY_CONSENT_KEY = 'ascend_telemetry_consent';
export const TELEMETRY_CONSENT_EVENT = 'ascend_telemetry_consent_changed';

/**
 * Resolves Google Analytics 4 Measurement ID from environment or verified project fallback.
 */
export function getGaMeasurementId(): string | undefined {
  const envId = process.env.NEXT_PUBLIC_GA_ID?.trim();
  return envId || 'G-DV7VT2H5LP';
}

/**
 * Resolves Microsoft Clarity Project ID from environment or verified project fallback.
 */
export function getClarityProjectId(): string | undefined {
  const envId = process.env.NEXT_PUBLIC_CLARITY_ID?.trim();
  return envId || 'ywdt5rqnzv';
}

/**
 * Resolves Sentry Browser CDN loader URL from environment or verified DSN key.
 */
export function getSentryLoaderUrl(): string | undefined {
  const customScriptUrl = process.env.NEXT_PUBLIC_SENTRY_SCRIPT_URL?.trim();
  if (customScriptUrl) return customScriptUrl;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (dsn) {
    const match = dsn.match(/https:\/\/([a-f0-9]+)@/i);
    if (match && match[1]) {
      return `https://js.sentry-cdn.com/${match[1]}.min.js`;
    }
  }
  return 'https://js.sentry-cdn.com/5943361d29069b1cc12e20ca7d6e2f90.min.js';
}

/**
 * Checks whether at least one telemetry provider is actively configured.
 */
export function hasConfiguredTelemetry(): boolean {
  return Boolean(getGaMeasurementId() || getClarityProjectId() || getSentryLoaderUrl());
}

/**
 * Returns the athlete's current telemetry consent status from localStorage.
 */
export function getTelemetryConsent(): TelemetryConsent {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(TELEMETRY_CONSENT_KEY);
    if (val === 'accepted' || val === 'declined') {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persists the athlete's consent choice and broadcasts a change event.
 */
export function setTelemetryConsent(consent: 'accepted' | 'declined') {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TELEMETRY_CONSENT_KEY, consent);
    window.dispatchEvent(new CustomEvent(TELEMETRY_CONSENT_EVENT, { detail: { consent } }));

    if (consent === 'declined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
      });
    }
  } catch {}
}

/**
 * Tracks allowlisted, non-sensitive UI events only when consent is granted.
 * Strict privacy guard: NEVER transmits workout sets, reps, weights, meals, macros, or private messages.
 */
export function trackSafeEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  if (getTelemetryConsent() !== 'accepted') return;

  const gtag = (window as any).gtag;
  if (typeof gtag !== 'function') return;

  const sanitizedParams: Record<string, string | number | boolean> = {};
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      const lower = key.toLowerCase();
      // Block sensitive keywords
      if (
        lower.includes('weight') ||
        lower.includes('rep') ||
        lower.includes('exercise') ||
        lower.includes('calorie') ||
        lower.includes('macro') ||
        lower.includes('email') ||
        lower.includes('name') ||
        lower.includes('note') ||
        lower.includes('food') ||
        lower.includes('message')
      ) {
        continue;
      }
      sanitizedParams[key] = val;
    }
  }

  try {
    gtag('event', eventName, sanitizedParams);
  } catch {}
}
