/**
 * Auth Admin email→user lookup for the account-deletion verification
 * flow (Flow A). Extracted from the delete-account route so the lookup
 * policy is unit-testable without a live Supabase client.
 *
 * Gauntlet SEC-07: the old code paged through Auth Admin listUsers at
 * 100/page up to 100 pages (10,000 accounts) per unauthenticated
 * verification request — a 100x privileged-API amplification, plus a
 * timing oracle (matched emails also generate a token and send an
 * email). The cap is now 20 pages (2,000 accounts): far above the
 * app's user base, far below the old amplification. Accounts past
 * the cap cannot use email-link deletion recovery and must delete
 * while signed in; that trade-off is documented, not hidden. The
 * route additionally delays the unmatched path to narrow the timing
 * gap; timing oracles are rarely fully closable, and the 5/15 min
 * rate limit remains the primary control.
 *
 * The partial-recovery ledger fallback is preserved: an account whose
 * deletion previously ended partial can still be found by email even
 * though it no longer appears in Auth Admin.
 */

export const DELETION_LOOKUP_PER_PAGE = 100;
export const DELETION_LOOKUP_MAX_PAGES = 20;

export interface AdminUserLookup {
  id: string;
  email: string;
}

/** Minimal structural shape the lookup needs; real client and test fakes both satisfy it. */
export interface AdminLookupClient {
  auth: {
    admin: {
      listUsers: (opts: { page: number; perPage: number }) => Promise<{
        data?: { users?: Array<{ id: string; email?: string | null }> } | null;
      }>;
    };
  };
  from: (table: string) => any;
}

export async function findUserByEmail(
  adminClient: AdminLookupClient,
  email: string,
): Promise<AdminUserLookup | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  for (let page = 1; page <= DELETION_LOOKUP_MAX_PAGES; page++) {
    let users: Array<{ id: string; email?: string | null }> = [];
    try {
      const { data } = await adminClient.auth.admin.listUsers({
        page,
        perPage: DELETION_LOOKUP_PER_PAGE,
      });
      users = data?.users ?? [];
    } catch {
      // Swallow lookup error to prevent timing and enumeration attacks.
      users = [];
    }
    const match = users.find((u) => u.email?.trim().toLowerCase() === normalized);
    if (match) {
      return { id: match.id, email: match.email || email };
    }
    if (users.length < DELETION_LOOKUP_PER_PAGE) break;
  }

  // Fallback: partial deletion recovery ledger.
  try {
    const { data: partialRow } = await adminClient
      .from('consumed_deletion_nonces')
      .select('user_id, email')
      .eq('email', normalized)
      .eq('status', 'partial')
      .maybeSingle();
    if (partialRow) {
      return { id: partialRow.user_id, email: partialRow.email || email };
    }
  } catch {
    // Swallow lookup error to prevent timing and enumeration attacks.
  }

  return null;
}
