/**
 * QA4-007 / QA4A-002 regression tests.
 *
 * The external deletion-verification lookup used to call
 * auth.admin.listUsers() with no pagination (Supabase returns only the
 * first 50 accounts), so every account past position 50 silently failed
 * to get a deletion link — while the polite anti-enumeration 200 hid the
 * failure. Its profiles-table fallback queried profiles.email, a column
 * that does not exist in production, so it was dead code.
 *
 * These tests pin: paginated lookup finds users past position 50, the
 * consumed_deletion_nonces partial-recovery fallback still works, the
 * dead profiles.email fallback is gone, and unknown emails still get
 * the identical anti-enumeration 200.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resetRateLimitStoreForTests } from '../src/lib/rate-limit';
import { resetConsumedNoncesForTests } from '../src/lib/deletion-token';

const ENV = process.env as Record<string, string | undefined>;

// 200 accounts; the interesting target lives past both the old
// 50-user default page and the route's 100-user page.
const ALL_USERS = Array.from({ length: 200 }, (_, i) => ({
  id: `user-${i + 1}`,
  email: `user${i + 1}@example.com`,
}));
const TARGET = ALL_USERS[174]; // position 175 (index 174)
const PARTIAL_EMAIL = 'partial@example.com';

const { mockSupabase } = vi.hoisted(() => {
  const mockClient = {
    auth: {
      getUser: vi.fn(),
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        listUsers: vi.fn(),
      },
      getSession: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({
      data: { allowed: true, count: 1, reset_ms: 60000 },
      error: null,
    }),
  };
  return { mockSupabase: mockClient };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: vi.fn(() => mockSupabase) };
});

function setupMocks() {
  // Paginating listUsers mock: honours page/perPage exactly like Supabase.
  mockSupabase.auth.admin.listUsers.mockReset();
  mockSupabase.auth.admin.listUsers.mockImplementation(
    async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) => {
      const start = (page - 1) * perPage;
      return {
        data: { users: ALL_USERS.slice(start, start + perPage) },
        error: null,
      };
    }
  );
  mockSupabase.auth.admin.deleteUser.mockReset();
  mockSupabase.auth.admin.deleteUser.mockResolvedValue({ error: null });
  mockSupabase.auth.getUser.mockReset();
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

  mockSupabase.from.mockReset();
  mockSupabase.from.mockImplementation((tableName: string) => {
    if (tableName === 'consumed_deletion_nonces') {
      const filters: Record<string, string> = {};
      const builder: any = {
        eq: vi.fn((col: string, val: string) => {
          filters[col] = val;
          return builder;
        }),
        maybeSingle: vi.fn(async () => {
          if (filters.email === PARTIAL_EMAIL && filters.status === 'partial') {
            return {
              data: { user_id: 'user-partial', email: PARTIAL_EMAIL },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
      };
      return { select: vi.fn(() => builder) };
    }
    if (tableName === 'profiles') {
      // If the route ever queries profiles again, record it so the
      // dead-fallback test below can fail loudly.
      return {
        select: vi.fn(() => {
          (globalThis as any).__profilesQueried = true;
          return {
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: { message: 'column profiles.email does not exist' },
              })),
            })),
          };
        }),
        delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      };
    }
    return {
      delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      })),
    };
  });
  (globalThis as any).__profilesQueried = false;
}

async function requestVerification(email: string) {
  const route = await import('../src/app/api/auth/delete-account/route');
  const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'request_verification', email }),
  });
  return route.POST(req);
}

function tokenSubject(debugToken: string): string {
  const payload = JSON.parse(
    Buffer.from(debugToken.slice(4).split('.')[0], 'base64url').toString('utf8')
  );
  return payload.sub;
}

describe('QA4-007 deletion lookup pagination', () => {
  beforeEach(() => {
    ENV.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
    ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key-123456789012345';
    ENV.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-9876543210';
    ENV.NODE_ENV = 'test';
    // Gauntlet SEC-04: the debug payload now needs this explicit opt-in.
    ENV.ALLOW_DELETION_DEBUG_TOKEN = 'true';
    setupMocks();
    resetRateLimitStoreForTests();
    resetConsumedNoncesForTests();
  });

  afterEach(() => {
    resetRateLimitStoreForTests();
    resetConsumedNoncesForTests();
    delete ENV.NEXT_PUBLIC_SUPABASE_URL;
    delete ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete ENV.SUPABASE_SERVICE_ROLE_KEY;
    delete ENV.NODE_ENV;
    delete ENV.ALLOW_DELETION_DEBUG_TOKEN;
  });

  it('finds a user at position 175 (past the old 50-user first page)', async () => {
    const res = await requestVerification(TARGET.email);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // A token was actually generated for the right account — before the
    // fix this was silently undefined for anyone past position 50.
    expect(data.debugToken).toBeDefined();
    expect(tokenSubject(data.debugToken)).toBe(TARGET.id);
    // Pagination really happened: more than one page was fetched, and
    // every call carried explicit page/perPage arguments.
    const calls = mockSupabase.auth.admin.listUsers.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const [args] of calls) {
      expect(args).toMatchObject({ page: expect.any(Number), perPage: expect.any(Number) });
    }
  });

  it('still finds a user on the first page', async () => {
    const res = await requestVerification(ALL_USERS[0].email);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.debugToken).toBeDefined();
    expect(tokenSubject(data.debugToken)).toBe(ALL_USERS[0].id);
  });

  it('unknown email still gets the identical anti-enumeration 200, with no token', async () => {
    const resKnown = await requestVerification(TARGET.email);
    const knownData = await resKnown.json();

    resetRateLimitStoreForTests();
    const resUnknown = await requestVerification('ghost@example.com');
    expect(resUnknown.status).toBe(200);
    const data = await resUnknown.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe(knownData.message);
    expect(data.message).toContain('If an account is associated with this email');
    expect(data.debugToken).toBeUndefined();
    // Lookup exhausted all pages before giving up (200 users = two
    // full pages + one empty page at the route's perPage).
    expect(mockSupabase.auth.admin.listUsers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('partial-deletion recovery via consumed_deletion_nonces still works', async () => {
    const res = await requestVerification(PARTIAL_EMAIL);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.debugToken).toBeDefined();
    expect(tokenSubject(data.debugToken)).toBe('user-partial');
  });

  it('never queries the profiles table for an email fallback (column does not exist)', async () => {
    await requestVerification('ghost@example.com');
    expect((globalThis as any).__profilesQueried).toBe(false);

    const routeSource = fs.readFileSync(
      path.resolve(__dirname, '../src/app/api/auth/delete-account/route.ts'),
      'utf8'
    );
    // The dead fallback selected id+email from profiles; the legitimate
    // profiles entry in TABLES_TO_DELETE (delete by id) must remain.
    expect(routeSource).not.toContain("select('id, email')");
    expect(routeSource).not.toContain('select("id, email")');
    expect(routeSource).toContain("{ table: 'profiles', idCol: 'id' }");
  });
});
