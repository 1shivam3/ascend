/**
 * Deletion-link URL parsing (gauntlet SEC-06).
 *
 * Fragment-only, by design: the verification email puts the token in
 * the URL fragment (#token=...), which browsers never send to the
 * server — so the token cannot land in access logs. Query strings
 * (?token=...) ARE sent to the server, so they are never read here,
 * even as a fallback: a query-carrying link simply yields no token.
 * Pure function, unit-tested.
 */
export function parseDeletionUrl(url: string): { token: string | null; email: string | null } {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return { token: null, email: null };
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  return { token: params.get('token'), email: params.get('email') };
}
