/**
 * Client-side AI auth headers (audit F-02, brief option A).
 *
 * The server grants a higher daily AI quota to verified signed-in
 * users and a lower one to guests. That only works if the client sends
 * its session token when one exists: this helper reads the current
 * Supabase session (via the app's shared browser client) and returns
 * an Authorization header, or an empty object for guests (and for
 * SSR/tests, where no browser client exists). No token is ever
 * fabricated, stored, or logged here — a missing session simply means
 * the guest quota, exactly as before.
 */

import { getSupabase } from './supabase/client';

export async function getAiAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = getSupabase();
    if (!supabase) return {};
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
