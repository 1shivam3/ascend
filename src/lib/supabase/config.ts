/**
 * Supabase Configuration & Credentials Provider
 * Supports both environment variables (.env.local) and in-app fallback settings.
 */

export function getSupabaseCredentials() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  let localUrl = '';
  let localKey = '';

  if (typeof window !== 'undefined') {
    try {
      localUrl = window.localStorage.getItem('ascend_supabase_url')?.trim() || '';
      localKey = window.localStorage.getItem('ascend_supabase_anon_key')?.trim() || '';
    } catch {}
  }

  const url = envUrl || localUrl;
  const anonKey = envKey || localKey;

  const isValidUrl = Boolean(url && url.startsWith('http') && url.includes('supabase.co'));
  const isValidKey = Boolean(anonKey && anonKey.length > 20);

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
