/**
 * SEC-20 route-allowlist parity (regression for the coach-chat 404).
 *
 * The API middleware (src/middleware.ts) 404s every /api/* path that is
 * not in its hardcoded KNOWN_API_ROUTES set. When /api/ai/coach-chat was
 * added (PR #59) without a matching allowlist entry, the middleware
 * silently 404'd every chat request even though the route existed and
 * its own tests passed — the failure was only visible live. This test
 * derives the real route set from the filesystem and pins it to the
 * allowlist, in both directions, so the next new route cannot ship
 * unreachable.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function deriveApiRoutes(dir: string, prefix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...deriveApiRoutes(join(dir, entry.name), `${prefix}/${entry.name}`));
    } else if (entry.name === 'route.ts') {
      out.push(prefix);
    }
  }
  return out;
}

describe('SEC-20 middleware allowlist matches the real API routes', () => {
  const apiDir = join(process.cwd(), 'src/app/api');
  const realRoutes = deriveApiRoutes(apiDir, '/api').sort();

  const middlewareSource = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8');
  const setMatch = middlewareSource.match(/KNOWN_API_ROUTES = new Set\(\[([\s\S]*?)\]\)/);
  const allowlisted = [...(setMatch?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]).sort();

  it('finds the routes on disk (sanity)', () => {
    expect(realRoutes.length).toBeGreaterThanOrEqual(13);
    expect(realRoutes).toContain('/api/ai/coach-chat');
  });

  it('every real route is allowlisted (no route ships unreachable)', () => {
    for (const route of realRoutes) {
      expect(allowlisted, `middleware allowlist is missing ${route}`).toContain(route);
    }
  });

  it('no stale allowlist entries (set equality)', () => {
    expect(allowlisted).toEqual(realRoutes);
  });
});
