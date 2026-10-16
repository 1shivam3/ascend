/**
 * Supabase Configuration & Credentials Provider
 * Supports both environment variables (.env.local) and in-app fallback settings.
 *
 * Security note: In production, only environment variables are used for credential
 * resolution. The localStorage fallback is available only in development to support
 * local testing with custom Supabase instances.
 */

export function getSupabaseCredentials() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  let localUrl = '';
  let localKey = '';

  // Only allow localStorage override in dev to prevent XSS from exfiltrating
  // the anon key in production deployments.
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    try {
      localUrl = window.localStorage.getItem('ascend_supabase_url')?.trim() || '';
      localKey = window.localStorage.getItem('ascend_supabase_anon_key')?.trim() || '';
    } catch {}
  }

  const url = envUrl || localUrl;
  const anonKey = envKey || localKey;

  let isValidUrl = false;
  if (url) {
    try {
      const parsed = new URL(url);
      isValidUrl =
        (parsed.protocol === 'https:' && (parsed.hostname.endsWith('.supabase.co') || parsed.hostname === 'supabase.co')) ||
        (process.env.NODE_ENV !== 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'));
    } catch {
      isValidUrl = false;
    }
  }
  const isValidKey = Boolean(anonKey && anonKey.length > 20 && !anonKey.includes('\n'));

  return {
    url,
    anonKey,
    isConfigured: isValidUrl && isValidKey,
  };
}

export function saveCustomSupabaseCredentials(url: string, anonKey: string) {
  if (typeof window === 'undefined') return;
  try {
    if (url.trim()) {
      window.localStorage.setItem('ascend_supabase_url', url.trim());
    } else {
      window.localStorage.removeItem('ascend_supabase_url');
    }

    if (anonKey.trim()) {
      window.localStorage.setItem('ascend_supabase_anon_key', anonKey.trim());
    } else {
      window.localStorage.removeItem('ascend_supabase_anon_key');
    }
  } catch {}
}
