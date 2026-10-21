import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { syncEngine } from '../src/lib/supabase/sync';
import { useStore } from '../src/lib/store';
import { resetRateLimitStoreForTests } from '../src/lib/rate-limit';
import {
  createDeletionToken,
  verifyDeletionToken,
  consumeDeletionNonce,
  resetConsumedNoncesForTests,
} from '../src/lib/deletion-token';
import {
  sendDeletionVerificationEmail,
  isEmailDeliveryConfigured,
} from '../src/lib/deletion-mailer';
import { redactSecrets } from '../src/lib/server-security';
import { DeleteAccountView } from '../src/components/DeleteAccountView';

const ENV = process.env as Record<string, string | undefined>;

// In-memory durable database mock to test cross-instance replay & recovery
const mockDurableNonces = new Map<string, any>();

// Shared mock Supabase client that all tests can configure
const { mockSupabase } = vi.hoisted(() => {
  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      }),
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        listUsers: vi.fn().mockResolvedValue({
          data: {
            users: [
              { id: 'user-123', email: 'test@example.com' },
              { id: 'user-456', email: 'external@example.com' },
            ],
          },
          error: null,
        }),
      },
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token', user: { id: 'user-123', email: 'test@example.com' } } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({
      data: { allowed: true, count: 1, reset_ms: 60000 },
      error: null,
    }),
  };

  return { mockSupabase: mockClient };
});

// Mock @supabase/supabase-js so both the route and syncEngine get our mock
vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: vi.fn(() => mockSupabase),
  };
});

class MockStorage implements Storage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

function setupLocalStorage() {
  const storage = new MockStorage();
  const replaceStateMock = vi.fn();
  global.window = {
    ...(global.window || {}),
    localStorage: storage,
    location: { search: '', pathname: '/delete-account' } as any,
    history: { replaceState: replaceStateMock } as any,
  } as unknown as (Window & typeof globalThis);
  if (global.fetch) {
    global.window.fetch = global.fetch;
  }
  global.localStorage = storage;
  return { storage, replaceStateMock };
}

function resetMocks() {
  mockDurableNonces.clear();

  mockSupabase.auth.getUser.mockReset();
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-123', email: 'test@example.com' } },
    error: null,
  });
  mockSupabase.auth.admin.deleteUser.mockReset();
  mockSupabase.auth.admin.deleteUser.mockResolvedValue({ error: null });
  mockSupabase.auth.admin.listUsers.mockReset();
  mockSupabase.auth.admin.listUsers.mockResolvedValue({
    data: {
      users: [
        { id: 'user-123', email: 'test@example.com' },
        { id: 'user-456', email: 'external@example.com' },
      ],
    },
    error: null,
  });
  mockSupabase.auth.getSession.mockReset();
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-token', user: { id: 'user-123', email: 'test@example.com' } } },
    error: null,
  });
  mockSupabase.auth.signOut.mockReset();
  mockSupabase.auth.signOut.mockResolvedValue({ error: null });

  mockSupabase.from.mockReset();
  mockSupabase.from.mockImplementation((tableName: string) => {
    if (tableName === 'consumed_deletion_nonces') {
      return {
        // Chained-eq builder mirroring real PostgREST: the route's
        // recovery lookup chains .eq('email', …).eq('status', 'partial'),
        // so eq() must return a builder that supports further eq() calls
        // as well as maybeSingle().
        select: vi.fn((_cols: string) => {
          const filters: Record<string, string> = {};
          const builder: any = {
            eq: vi.fn((col: string, val: string) => {
              filters[col] = val;
              return builder;
            }),
            maybeSingle: vi.fn().mockImplementation(async () => {
              if (filters.jti) {
                const record = mockDurableNonces.get(filters.jti);
                return { data: record || null, error: null };
              }
              for (const row of mockDurableNonces.values()) {
                if (filters.email && row.email !== filters.email) continue;
                if (filters.status && row.status !== filters.status) continue;
                if (filters.email || filters.status) return { data: row, error: null };
              }
              return { data: null, error: null };
            }),
          };
          return builder;
        }),
        upsert: vi.fn().mockImplementation(async (record: any) => {
          mockDurableNonces.set(record.jti, record);
          return { error: null };
        }),
      };
    }

    // Default tables
    return {
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn((col: string, val: string) => ({
          maybeSingle: vi.fn().mockImplementation(async () => {
            if (col === 'email' && (val === 'test@example.com' || val === 'external@example.com')) {
              return { data: { id: 'user-123', email: val }, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
    };
  });
}

describe('Account Deletion & Data Safety Specification', () => {
  let mockStorage: MockStorage;
  let replaceStateMock: any;

  beforeEach(() => {
    ENV.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
    ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key-123456789012345';
    ENV.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-9876543210';
    ENV.NODE_ENV = 'test';

    const setup = setupLocalStorage();
    mockStorage = setup.storage;
    replaceStateMock = setup.replaceStateMock;
    useStore.getState().clearAllData();
    resetMocks();
    resetRateLimitStoreForTests();
    resetConsumedNoncesForTests();
  });

  afterEach(() => {
    resetMocks();
    resetRateLimitStoreForTests();
    resetConsumedNoncesForTests();
    delete ENV.NEXT_PUBLIC_SUPABASE_URL;
    delete ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete ENV.SUPABASE_SERVICE_ROLE_KEY;
    delete ENV.RESEND_API_KEY;
    delete ENV.NODE_ENV;
    delete ENV.VERCEL_ENV;
  });

  // -------------------------------------------------------------------------
  // 1. Signed-in Deletion Flow (Supabase Bearer Token)
  // -------------------------------------------------------------------------
  it('purges all local storage keys and resets store during deleteAccount()', async () => {
    mockStorage.setItem(
      'ascend_store',
      JSON.stringify({
        state: {
          profile: { id: 'user-123', name: 'Test Athlete', gender: 'male', bodyweightKg: 80, unit: 'kg' },
          prs: [{ id: 'pr-1', exercise: 'Bench Press', weightKg: 100, reps: 5, oneRepMax: 116.6 }],
        },
      })
    );
    mockStorage.setItem('ascend_emergency_snapshot', JSON.stringify({ prCount: 1 }));
    mockStorage.setItem('ascend_notification_prefs', JSON.stringify({ enabled: true }));
    mockStorage.setItem('sb-test-auth-token', 'secret-supabase-token');

    useStore.setState({
      profile: {
        id: 'user-123',
        name: 'Test Athlete',
        gender: 'male',
        bodyweightKg: 80,
        bodyweightLbs: 176.37,
        unit: 'kg',
        createdAt: '2026-01-01',
      },
      hasCompletedOnboarding: true,
    });
    expect(useStore.getState().profile?.name).toBe('Test Athlete');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cloudDeleted: true,
        authPurged: true,
        message: 'Your ASCEND account and all associated cloud data have been permanently deleted.',
        timestamp: new Date().toISOString(),
      }),
    });

    const result = await syncEngine.deleteAccount();

    expect(result.success).toBe(true);
    expect(useStore.getState().profile).toBeNull();
    expect(useStore.getState().hasCompletedOnboarding).toBe(false);

    expect(mockStorage.getItem('ascend_store')).toBeNull();
    expect(mockStorage.getItem('ascend_emergency_snapshot')).toBeNull();
    expect(mockStorage.getItem('ascend_notification_prefs')).toBeNull();
    expect(mockStorage.getItem('sb-test-auth-token')).toBeNull();
    expect(mockStorage.getItem('ascend_logged_out')).toBe('true');
  });

  it('successfully deletes account via valid Supabase Bearer token', async () => {
    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-token',
      },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    const data = await res.json();
    expect(data.cloudDeleted).toBe(true);
    expect(data.authPurged).toBe(true);
    expect(data.audit.method).toBe('Bearer token validated');
    expect(data.userId).toBe('user-123');
  });

  // -------------------------------------------------------------------------
  // 2. External Deletion Flow (Verification Link & Email Delivery)
  // -------------------------------------------------------------------------
  it('requests deletion verification token with anti-enumeration protection', async () => {
    const route = await import('../src/app/api/auth/delete-account/route');

    // Case A: User exists
    const reqExisting = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_verification', email: 'external@example.com' }),
    });

    const resExisting = await route.POST(reqExisting);
    expect(resExisting.status).toBe(200);
    expect(resExisting.headers.get('Cache-Control')).toContain('no-store');
    const dataExisting = await resExisting.json();
    expect(dataExisting.success).toBe(true);
    expect(dataExisting.message).toContain('If an account is associated with this email');
    expect(dataExisting.debugToken).toBeDefined();

    // Case B: User does NOT exist — exact same message is returned to prevent enumeration
    const reqUnknown = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_verification', email: 'nonexistent@example.com' }),
    });

    const resUnknown = await route.POST(reqUnknown);
    expect(resUnknown.status).toBe(200);
    const dataUnknown = await resUnknown.json();
    expect(dataUnknown.success).toBe(true);
    expect(dataUnknown.message).toBe(dataExisting.message);
    expect(dataUnknown.debugToken).toBeUndefined();
  });

  it('handles email delivery when provider is configured and dispatches single-use link', async () => {
    ENV.RESEND_API_KEY = 're_test_key_12345';
    expect(isEmailDeliveryConfigured()).toBe(true);

    const originalFetch = global.fetch;
    const mockEmailFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-msg-999' }),
    });
    global.fetch = mockEmailFetch;

    const emailRes = await sendDeletionVerificationEmail({
      recipientEmail: 'external@example.com',
      token: 'del_test_token_123',
      appOrigin: 'https://ascendtonext.vercel.app',
    });

    expect(emailRes.success).toBe(true);
    expect(emailRes.deliveryConfigured).toBe(true);
    expect(emailRes.messageId).toBe('email-msg-999');

    // Verify request payload
    expect(mockEmailFetch).toHaveBeenCalled();
    const fetchArgs = mockEmailFetch.mock.calls[0];
    expect(fetchArgs[0]).toBe('https://api.resend.com/emails');
    const parsedBody = JSON.parse(fetchArgs[1].body);
    expect(parsedBody.to).toEqual(['external@example.com']);
    expect(parsedBody.html).toContain('del_test_token_123');
    expect(parsedBody.html).toContain('single-use');
    expect(parsedBody.html).toContain('15 minutes');

    global.fetch = originalFetch;
  });

  it('handles email delivery failure gracefully without exposing secrets or breaking anti-enumeration', async () => {
    ENV.RESEND_API_KEY = 're_test_key_12345';

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Resend API rate limit exceeded re_test_key_12345' }),
    });

    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_verification', email: 'external@example.com' }),
    });

    const res = await route.POST(req);
    // Anti-enumeration must remain 200 OK
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('If an account is associated with this email');

    global.fetch = originalFetch;
  });

  it('successfully deletes account using a valid single-use verification token', async () => {
    const validToken = createDeletionToken('user-456', 'external@example.com', 15 * 60 * 1000);

    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'external@example.com',
        token: validToken,
      }),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cloudDeleted).toBe(true);
    expect(data.authPurged).toBe(true);
    expect(data.audit.method).toBe('Verification token validated');
    expect(data.userId).toBe('user-456');
  });

  // -------------------------------------------------------------------------
  // 3. Security Hardening: Expired, Reused & Durable Replay Protection
  // -------------------------------------------------------------------------
  it('rejects expired verification tokens with 401 TOKEN_EXPIRED', async () => {
    const expiredToken = createDeletionToken('user-456', 'external@example.com', -5000);

    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'external@example.com',
        token: expiredToken,
      }),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('TOKEN_EXPIRED');
    expect(data.message).toContain('expired');
  });

  it('rejects reused verification tokens with 401 TOKEN_ALREADY_USED (Replay Protection)', async () => {
    const singleUseToken = createDeletionToken('user-456', 'external@example.com', 15 * 60 * 1000);

    const route = await import('../src/app/api/auth/delete-account/route');

    // First attempt: succeeds and consumes nonce
    const reqFirst = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'external@example.com',
        token: singleUseToken,
      }),
    });

    const resFirst = await route.POST(reqFirst);
    expect(resFirst.status).toBe(200);

    // Second attempt (replay attack): rejected with TOKEN_ALREADY_USED
    const reqReplay = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'external@example.com',
        token: singleUseToken,
      }),
    });

    const resReplay = await route.POST(reqReplay);
    expect(resReplay.status).toBe(401);
    const dataReplay = await resReplay.json();
    expect(dataReplay.error).toBe('TOKEN_ALREADY_USED');
    expect(dataReplay.message).toContain('already been used');
  });

  it('durable replay prevention: blocks replay across serverless restarts when memory is reset', async () => {
    const token = createDeletionToken('user-456', 'external@example.com', 15 * 60 * 1000);
    const route = await import('../src/app/api/auth/delete-account/route');

    // Initial deletion: persists to durable ledger
    const req1 = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token }),
    });
    const res1 = await route.POST(req1);
    expect(res1.status).toBe(200);

    // Simulate complete process crash / new serverless instance:
    // clear in-process memory ledger
    resetConsumedNoncesForTests();

    // Replay attempt against new instance: must query database ledger and reject
    const req2 = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token }),
    });
    const res2 = await route.POST(req2);
    expect(res2.status).toBe(401);
    const data2 = await res2.json();
    expect(data2.error).toBe('TOKEN_ALREADY_USED');
  });

  // -------------------------------------------------------------------------
  // 4. Partial Deletion Recovery & Retry Capabilities
  // -------------------------------------------------------------------------
  it('partial deletion recovery: allows retry with same token when table cleanup failed, then completes on retry', async () => {
    const token = createDeletionToken('user-456', 'external@example.com', 15 * 60 * 1000);
    const route = await import('../src/app/api/auth/delete-account/route');

    // Run 1: workouts table fails; Auth user deleted
    mockSupabase.from.mockImplementation((tableName: string) => {
      if (tableName === 'workouts') {
        return {
          delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: { message: 'Lock contention' } })) })),
        };
      }
      if (tableName === 'consumed_deletion_nonces') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                if (col === 'jti') return { data: mockDurableNonces.get(val) || null, error: null };
                return { data: null, error: null };
              }),
            })),
          })),
          upsert: vi.fn().mockImplementation(async (record: any) => {
            mockDurableNonces.set(record.jti, record);
            return { error: null };
          }),
        };
      }
      return {
        delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      };
    });

    const req1 = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token }),
    });
    const res1 = await route.POST(req1);
    expect(res1.status).toBe(207);
    const data1 = await res1.json();
    expect(data1.cloudDeleted).toBe(false);
    expect(data1.authPurged).toBe(true);

    // Run 2: Retry with SAME token after database lock clears
    // Note: auth.admin.deleteUser returns 404 because user was already deleted in Run 1
    mockSupabase.auth.admin.deleteUser.mockResolvedValue({
      error: { message: 'User not found', status: 404 } as any,
    });
    // Table workouts now succeeds
    mockSupabase.from.mockImplementation((tableName: string) => {
      if (tableName === 'consumed_deletion_nonces') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                if (col === 'jti') return { data: mockDurableNonces.get(val) || null, error: null };
                return { data: null, error: null };
              }),
            })),
          })),
          upsert: vi.fn().mockImplementation(async (record: any) => {
            mockDurableNonces.set(record.jti, record);
            return { error: null };
          }),
        };
      }
      return {
        delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      };
    });

    const req2 = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token }),
    });
    const res2 = await route.POST(req2);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.cloudDeleted).toBe(true);
    expect(data2.authPurged).toBe(true);

    // Run 3: Once fully completed, subsequent retry must now be rejected as consumed
    const req3 = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token }),
    });
    const res3 = await route.POST(req3);
    expect(res3.status).toBe(401);
  });

  it('failed cleanup after Auth deletion: returns 207 Multi-Status if tables continue to fail', async () => {
    const token = createDeletionToken('user-456', 'external@example.com', 15 * 60 * 1000);
    const route = await import('../src/app/api/auth/delete-account/route');

    mockSupabase.auth.admin.deleteUser.mockResolvedValue({
      error: { message: 'User not found', status: 404 } as any,
    });
    mockSupabase.from.mockImplementation((tableName: string) => {
      if (tableName === 'consumed_deletion_nonces') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                if (col === 'jti') return { data: mockDurableNonces.get(val) || null, error: null };
                return { data: null, error: null };
              }),
            })),
          })),
          upsert: vi.fn().mockImplementation(async (record: any) => {
            mockDurableNonces.set(record.jti, record);
            return { error: null };
          }),
        };
      }
      if (tableName === 'meals') {
        return {
          delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: { message: 'Table error' } })) })),
        };
      }
      return {
        delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      };
    });

    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token }),
    });
    const res = await route.POST(req);
    expect(res.status).toBe(207);
    const data = await res.json();
    expect(data.cloudDeleted).toBe(false);
    expect(data.authPurged).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Unauthorized Requests & Defense-in-Depth
  // -------------------------------------------------------------------------
  it('rejects deletion with email alone (no Bearer or verification token) with 401 UNAUTHORIZED', async () => {
    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('UNAUTHORIZED');
  });

  it('rejects tampered or forged verification tokens with 401 INVALID_TOKEN', async () => {
    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'external@example.com',
        token: 'del_eyJhbGciOiJIUzI1NiJ9.forged_signature_here',
      }),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('INVALID_TOKEN');
  });

  it('rejects email mismatch between token and request with 403 FORBIDDEN', async () => {
    const token = createDeletionToken('user-456', 'external@example.com');

    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'victim@example.com',
        token,
      }),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('FORBIDDEN');
  });

  it('fails closed with 503 CONFIGURATION_ERROR in Production when Supabase is missing', async () => {
    const origNodeEnv = ENV.NODE_ENV;
    const origVercelEnv = ENV.VERCEL_ENV;
    ENV.NODE_ENV = 'production';
    ENV.VERCEL_ENV = 'production';

    delete ENV.NEXT_PUBLIC_SUPABASE_URL;
    delete ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete ENV.SUPABASE_SERVICE_ROLE_KEY;

    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({}),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('CONFIGURATION_ERROR');

    if (origNodeEnv) ENV.NODE_ENV = origNodeEnv;
    if (origVercelEnv) ENV.VERCEL_ENV = origVercelEnv;
  });

  it('redacts tokens and keys from error messages and logs', () => {
    const sensitive = 'Error with del_eyJhbGciOiJIUzI1NiJ9.sig123 and Bearer eyJhbGciOiJIUzI1NiJ9.jwt';
    const redacted = redactSecrets(sensitive);
    expect(redacted).not.toContain('del_eyJhbGciOiJIUzI1NiJ9.sig123');
    expect(redacted).toContain('[REDACTED_TOKEN]');
    expect(redacted).toContain('Bearer [REDACTED]');
  });

  // -------------------------------------------------------------------------
  // 6. Frontend Component Rendering & Token Privacy
  // -------------------------------------------------------------------------
  it('renders DeleteAccountPage component with data safety policy and methods', () => {
    const html = renderToStaticMarkup(React.createElement(DeleteAccountView));
    expect(html).toContain('ACCOUNT &amp; DATA DELETION');
    expect(html).toContain('Google Play Store Data Safety');
    expect(html).toContain('zero-retention policy');
    expect(html).toContain('Method 1: Direct In-App Deletion');
    expect(html).toContain('Method 2: External Web Deletion Request Form');
    expect(html).toContain('Send Deletion Verification Link');
  });

  it('renders signed-in state with authenticated badge and pre-authorized prompt', () => {
    const html = renderToStaticMarkup(
      React.createElement(DeleteAccountView, {
        initialSessionUser: { email: 'signedin@example.com', accessToken: 'token-123' },
      })
    );
    expect(html).toContain('signedin@example.com');
    expect(html).toContain('Authenticated as');
    expect(html).toContain('Deletion is pre-authorized');
    expect(html).not.toContain('Step 1: Request Single-Use Verification Link');
  });

  it('renders external deletion mode with prefilled verification token from link', () => {
    const html = renderToStaticMarkup(
      React.createElement(DeleteAccountView, {
        initialEmail: 'external@example.com',
        initialVerificationToken: 'del_eyJhbGciOiJIUzI1NiJ9.sig_sample',
        initialSessionUser: null,
      })
    );
    expect(html).toContain('external@example.com');
    expect(html).toContain('del_eyJhbGciOiJIUzI1NiJ9.sig_sample');
    expect(html).toContain('Type &quot;DELETE&quot; to Confirm');
  });

  it('renders COMPLETE deletion state accurately with green success confirmation', () => {
    const html = renderToStaticMarkup(
      React.createElement(DeleteAccountView, {
        initialStatus: 'complete',
        initialStatusDetails: 'Your ASCEND cloud account and all data have been purged.',
      })
    );
    expect(html).toContain('data-testid="status-complete"');
    expect(html).toContain('Account &amp; Cloud Data Permanently Purged');
    expect(html).toContain('Return to Home');
  });

  it('renders PARTIAL deletion state accurately with retry action and never claims complete success', () => {
    const html = renderToStaticMarkup(
      React.createElement(DeleteAccountView, {
        initialStatus: 'partial',
        initialStatusDetails:
          'Partial deletion: Your login credentials were removed, but some tables failed.',
      })
    );
    expect(html).toContain('data-testid="status-partial"');
    expect(html).toContain('Partial Deletion (207 Multi-Status)');
    expect(html).toContain('data-testid="retry-cleanup-btn"');
    expect(html).toContain('shivamvats744@gmail.com');
    expect(html).not.toContain('Account &amp; Cloud Data Permanently Purged');
  });

  it('renders SKIPPED deletion state accurately in offline environment', () => {
    const html = renderToStaticMarkup(
      React.createElement(DeleteAccountView, {
        initialStatus: 'skipped',
        initialStatusDetails: 'Cloud deletion skipped: Supabase cloud is not configured.',
      })
    );
    expect(html).toContain('data-testid="status-skipped"');
    expect(html).toContain('Cloud Deletion Skipped (Offline Environment)');
    expect(html).not.toContain('Account &amp; Cloud Data Permanently Purged');
  });

  it('renders ERROR state accurately with sanitized failure message', () => {
    const html = renderToStaticMarkup(
      React.createElement(DeleteAccountView, {
        initialStatus: 'error',
        initialErrorMessage: 'Verification token has expired. Please request a new verification link.',
      })
    );
    expect(html).toContain('data-testid="deletion-error"');
    expect(html).toContain('Verification token has expired');
    expect(html).not.toContain('Account &amp; Cloud Data Permanently Purged');
  });

  // -------------------------------------------------------------------------
  // 7. Token Expiry Recovery, Concurrency & Rate Limiting
  // -------------------------------------------------------------------------
  it('recovers partial deletion after original 15-minute token expires via fresh verification link', async () => {
    const route = await import('../src/app/api/auth/delete-account/route');

    // 1. First run experienced partial deletion and recorded partial status
    mockDurableNonces.set('old-jti-123', {
      jti: 'old-jti-123',
      user_id: 'user-456',
      email: 'external@example.com',
      status: 'partial',
      consumed_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });

    // 2. Old token expired 5 minutes ago: direct retry is rejected
    const expiredToken = createDeletionToken('user-456', 'external@example.com', -5000);
    const reqExpired = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token: expiredToken }),
    });
    const resExpired = await route.POST(reqExpired);
    expect(resExpired.status).toBe(401);
    const dataExpired = await resExpired.json();
    expect(dataExpired.error).toBe('TOKEN_EXPIRED');

    // 3. User requests a fresh verification link
    // Auth user is already purged, profiles table has no user, but recovery finds partial record
    mockSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    });
    const reqRequestFresh = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_verification', email: 'external@example.com' }),
    });
    const resRequestFresh = await route.POST(reqRequestFresh);
    expect(resRequestFresh.status).toBe(200);
    const dataRequestFresh = await resRequestFresh.json();
    expect(dataRequestFresh.debugToken).toBeDefined();

    // 4. Submit with the fresh token — now completes deletion and updates partial record
    mockSupabase.auth.admin.deleteUser.mockResolvedValue({
      error: { message: 'User not found', status: 404 } as any,
    });
    const reqComplete = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'external@example.com', token: dataRequestFresh.debugToken }),
    });
    const resComplete = await route.POST(reqComplete);
    expect(resComplete.status).toBe(200);
    const dataComplete = await resComplete.json();
    expect(dataComplete.cloudDeleted).toBe(true);
    expect(dataComplete.authPurged).toBe(true);
  });

  it('safely handles concurrent token submissions without double-purge corruption', async () => {
    const token = createDeletionToken('user-456', 'external@example.com', 15 * 60 * 1000);
    const route = await import('../src/app/api/auth/delete-account/route');

    const makeRequest = () =>
      new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'external@example.com', token }),
      });

    // Fire two deletion requests concurrently
    const [resA, resB] = await Promise.all([
      route.POST(makeRequest()),
      route.POST(makeRequest()),
    ]);

    const statuses = [resA.status, resB.status];
    // At least one must succeed with 200, and no 500 error should occur
    expect(statuses).toContain(200);
    statuses.forEach((s) => expect([200, 401]).toContain(s));
  });

  it('enforces rate limiting on verification requests (blocks after 5 attempts)', async () => {
    const route = await import('../src/app/api/auth/delete-account/route');
    // Ensure rate limiter runs in-memory sliding window
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error('RPC unavailable') });

    const makeReq = () =>
      new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.195',
        },
        body: JSON.stringify({ action: 'request_verification', email: 'external@example.com' }),
      });

    // 5 requests allowed
    for (let i = 0; i < 5; i++) {
      const res = await route.POST(makeReq());
      expect(res.status).toBe(200);
    }

    // 6th request must be rate limited with 429 Too Many Requests
    const resBlocked = await route.POST(makeReq());
    expect(resBlocked.status).toBe(429);
    expect(resBlocked.headers.get('Retry-After')).toBeDefined();
    const dataBlocked = await resBlocked.json();
    expect(dataBlocked.error).toBe('RATE_LIMIT_EXCEEDED');
  });

  // -------------------------------------------------------------------------
  // 8. PII Anonymization & URL Fragment Privacy Verification
  // -------------------------------------------------------------------------
  it('anonymizes personal identifiers (email, user_id) in durable ledger upon complete deletion while preserving them during partial deletion', async () => {
    const route = await import('../src/app/api/auth/delete-account/route');

    // Case 1: Partial deletion retains identifiers so the user can recover
    const tokenPartial = createDeletionToken('user-pii-1', 'athlete@example.com', 15 * 60 * 1000);
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'workouts') {
        return { delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: { message: 'DB Timeout' } })) })) };
      }
      if (table === 'consumed_deletion_nonces') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                if (col === 'jti') return { data: mockDurableNonces.get(val) || null, error: null };
                return { data: null, error: null };
              }),
            })),
          })),
          upsert: vi.fn().mockImplementation(async (record: any) => {
            mockDurableNonces.set(record.jti, record);
            return { error: null };
          }),
        };
      }
      return { delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })) };
    });

    const reqPartial = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'athlete@example.com', token: tokenPartial }),
    });
    const resPartial = await route.POST(reqPartial);
    expect(resPartial.status).toBe(207);

    // Verify partial record retains identifiers for recovery
    const payloadPartial = JSON.parse(Buffer.from(tokenPartial.slice(4).split('.')[0], 'base64url').toString());
    const storedPartial = mockDurableNonces.get(payloadPartial.jti);
    expect(storedPartial).toBeDefined();
    expect(storedPartial?.status).toBe('partial');
    expect(storedPartial?.user_id).toBe('user-pii-1');
    expect(storedPartial?.email).toBe('athlete@example.com');

    // Case 2: Complete deletion scrubs email and user_id to NULL
    resetMocks();
    const tokenComplete = createDeletionToken('user-pii-2', 'athlete2@example.com', 15 * 60 * 1000);
    const reqComplete = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'athlete2@example.com', token: tokenComplete }),
    });
    const resComplete = await route.POST(reqComplete);
    expect(resComplete.status).toBe(200);

    const payloadComplete = JSON.parse(Buffer.from(tokenComplete.slice(4).split('.')[0], 'base64url').toString());
    const storedComplete = mockDurableNonces.get(payloadComplete.jti);
    expect(storedComplete).toBeDefined();
    expect(storedComplete?.status).toBe('consumed');
    expect(storedComplete?.user_id).toBeNull();
    expect(storedComplete?.email).toBeNull();
  });
});
