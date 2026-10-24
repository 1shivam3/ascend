import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getSupabaseCredentials, saveCustomSupabaseCredentials } from '../src/lib/supabase/config';
import { syncEngine } from '../src/lib/supabase/sync';
import { useStore } from '../src/lib/store';

// Mock storage for tests
class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return Array.from(this.store.keys())[index] || null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

const mockStorage = new MockStorage();

// Shared mock Supabase client
const { mockSupabase } = vi.hoisted(() => {
  let authListener: ((event: string, session: any) => void) | null = null;
  const mockClient = {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn((cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn(),
    _triggerAuthChange: (event: string, session: any) => {
      if (authListener) authListener(event, session);
    },
  };
  return { mockSupabase: mockClient };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: vi.fn(() => mockSupabase),
  };
});

describe('Authentication & Login Recovery Flow', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'window', {
      value: {
        localStorage: mockStorage,
        location: { origin: 'http://localhost:3000', hash: '', search: '' },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_testing_1234567890';

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'usr_default', email: 'default@example.com' } },
      error: null,
    });
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'usr_default', email: 'default@example.com' } } },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          then: vi.fn().mockImplementation((fn) => Promise.resolve({ data: [] }).then(fn)),
          catch: vi.fn().mockResolvedValue({ data: [] }),
        }),
        then: vi.fn().mockImplementation((fn) => Promise.resolve({ data: [] }).then(fn)),
        catch: vi.fn().mockResolvedValue({ data: [] }),
      }),
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Supabase Credentials Fallback', () => {
    it('uses environment variables when present', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://env-project.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.env_key_for_testing_1234567890';
      mockStorage.setItem('ascend_supabase_url', 'https://local-project.supabase.co');
      mockStorage.setItem('ascend_supabase_anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.local_key_for_testing_1234567890');

      const creds = getSupabaseCredentials();
      expect(creds.url).toBe('https://env-project.supabase.co');
      expect(creds.anonKey).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.env_key_for_testing_1234567890');
      expect(creds.isConfigured).toBe(true);
    });

    it('falls back to localStorage credentials when env vars are missing outside production', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      (process.env as any).NODE_ENV = 'development';

      saveCustomSupabaseCredentials(
        'https://preview-staging.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.staging_key_for_testing_1234567890'
      );

      const creds = getSupabaseCredentials();
      expect(creds.url).toBe('https://preview-staging.supabase.co');
      expect(creds.isConfigured).toBe(true);
    });

    it('QA4-034: ignores localStorage credentials in production (env-only)', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      (process.env as any).NODE_ENV = 'production';

      saveCustomSupabaseCredentials(
        'https://preview-staging.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.staging_key_for_testing_1234567890'
      );

      const creds = getSupabaseCredentials();
      expect(creds.url).toBeFalsy();
      expect(creds.isConfigured).toBe(false);
    });

    it('rejects invalid or non-supabase domains in credentials', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      saveCustomSupabaseCredentials(
        'https://malicious-domain.com',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake_key_12345678901234567890'
      );

      const creds = getSupabaseCredentials();
      expect(creds.isConfigured).toBe(false);
    });
  });

  describe('Post-Logout and Post-Deletion Login Recovery', () => {
    it('clears ascend_logged_out when onAuthStateChange fires with an active session', async () => {
      mockStorage.setItem('ascend_logged_out', 'true');
      expect(mockStorage.getItem('ascend_logged_out')).toBe('true');

      syncEngine.init();

      // Trigger auth state change simulating returning from Google OAuth
      const fakeUser = {
        id: 'usr_return_123',
        email: 'athlete@example.com',
        user_metadata: { full_name: 'Returning Athlete' },
      };
      (mockSupabase as any)._triggerAuthChange('SIGNED_IN', { user: fakeUser });

      expect(mockStorage.getItem('ascend_logged_out')).toBeNull();
      expect(syncEngine.getCurrentUser()?.id).toBe('usr_return_123');
    });

    it('clears ascend_logged_out in signInWithGoogle, sendEmailOtp, and verifyEmailOtp', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({ error: null });
      mockSupabase.auth.signInWithOtp.mockResolvedValue({ error: null });
      mockSupabase.auth.verifyOtp.mockResolvedValue({
        data: { user: { id: 'usr_otp', email: 'otp@example.com' } },
        error: null,
      });

      // Test Google
      mockStorage.setItem('ascend_logged_out', 'true');
      await syncEngine.signInWithGoogle();
      expect(mockStorage.getItem('ascend_logged_out')).toBeNull();

      // Test OTP Send
      mockStorage.setItem('ascend_logged_out', 'true');
      await syncEngine.sendEmailOtp('otp@example.com');
      expect(mockStorage.getItem('ascend_logged_out')).toBeNull();

      // Test OTP Verify
      mockStorage.setItem('ascend_logged_out', 'true');
      await syncEngine.verifyEmailOtp('otp@example.com', '123456');
      expect(mockStorage.getItem('ascend_logged_out')).toBeNull();
    });

    it('recovers from stale ascend_logged_out flag in triggerSyncNow if Supabase has an active session', async () => {
      mockStorage.setItem('ascend_logged_out', 'true');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'usr_active', email: 'active@example.com' } } },
        error: null,
      });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'usr_active', email: 'active@example.com' } },
        error: null,
      });

      await syncEngine.triggerSyncNow();

      expect(mockStorage.getItem('ascend_logged_out')).toBeNull();
      expect(syncEngine.getCurrentUser()?.id).toBe('usr_active');
    });

    it('aborts triggerSyncNow if ascend_logged_out is true and no Supabase session exists', async () => {
      mockStorage.setItem('ascend_logged_out', 'true');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await syncEngine.triggerSyncNow();

      expect(mockStorage.getItem('ascend_logged_out')).toBe('true');
      expect(syncEngine.getCurrentUser()).toBeNull();
      expect(syncEngine.getSyncStatus()).toBe('unconfigured');
    });

    it('synthesizes an athlete profile when returning user has remote workouts but profiles row was missing', async () => {
      mockStorage.clear();
      useStore.setState({ profile: null, prs: [], workouts: [], meals: [], hasCompletedOnboarding: false });

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'usr_returning_hero', email: 'hero@ascend.app', user_metadata: { full_name: 'Iron Hero' } } } },
        error: null,
      });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'usr_returning_hero', email: 'hero@ascend.app', user_metadata: { full_name: 'Iron Hero' } } },
        error: null,
      });

      // Mock remote responses: profiles row is null, but workouts table has 1 existing workout
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'workouts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(Promise.resolve({
                data: [
                  {
                    id: 'w_1',
                    name: 'Heavy Leg Day',
                    date: '2026-10-15',
                    exercises: [{ name: 'Barbell Squat', sets: [{ reps: 5, weight: 140, unit: 'kg' }] }],
                  },
                ],
                error: null,
              })),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      await syncEngine.triggerSyncNow();

      const state = useStore.getState();
      expect(state.profile).not.toBeNull();
      expect(state.profile?.id).toBe('usr_returning_hero');
      expect(state.profile?.name).toBe('Iron Hero');
      expect(state.hasCompletedOnboarding).toBe(true);
      expect(state.workouts.length).toBe(1);
    });

    it('returns a neutral error code (never raw provider/config text) when Supabase is not configured', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      mockStorage.clear();

      const result = await syncEngine.signInWithGoogle();
      expect(result.error).toBe('google_signin_incomplete');
    });

    it('maps provider OAuth errors to the same neutral code, never the raw message', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        error: { message: 'Provider "google" is not enabled for this project (see https://supabase.com/docs)' },
      });

      const result = await syncEngine.signInWithGoogle();
      expect(result.error).toBe('google_signin_incomplete');
      expect(result.error).not.toContain('supabase.com');
      expect(result.error).not.toContain('Provider');
    });
  });
});

