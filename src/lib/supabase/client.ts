import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseCredentials } from './config';

let clientInstance: SupabaseClient | null = null;
let lastKnownUrl = '';
let lastKnownKey = '';

export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;

  const { url, anonKey, isConfigured } = getSupabaseCredentials();

  if (!isConfigured) {
    clientInstance = null;
    return null;
  }

  // Reuse existing instance if credentials haven't changed
  if (clientInstance && lastKnownUrl === url && lastKnownKey === anonKey) {
    return clientInstance;
  }

  try {
    clientInstance = createSupabaseClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    lastKnownUrl = url;
    lastKnownKey = anonKey;
    return clientInstance;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}
