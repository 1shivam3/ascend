import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncEngine } from '../src/lib/supabase/sync';
import { useStore } from '../src/lib/store';

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

describe('Account Deletion & Data Safety (Task 1)', () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    (global as any).window = { localStorage: mockStorage };
    (global as any).localStorage = mockStorage;
    useStore.getState().clearAllData();
  });

  it('purges all local storage keys and resets store during deleteAccount()', async () => {
    // Populate dummy local data
    mockStorage.setItem('ascend_store', JSON.stringify({ state: { profile: { name: 'Test Athlete' } } }));
    mockStorage.setItem('ascend_emergency_snapshot', JSON.stringify({ prs: [] }));
    mockStorage.setItem('ascend_notification_prefs', JSON.stringify({ enabled: true }));
    mockStorage.setItem('sb-test-auth-token', 'token-12345');

    // Populate Zustand store
    useStore.getState().setProfile({
      id: 'athlete-1',
      name: 'Test Athlete',
      gender: 'male',
      bodyweightKg: 80,
      unit: 'kg',
      createdAt: new Date().toISOString(),
    });
    expect(useStore.getState().profile?.name).toBe('Test Athlete');

    // Mock global fetch for offline/test environment
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Account deleted' }),
    });

    const result = await syncEngine.deleteAccount();

    expect(result.success).toBe(true);
    expect(useStore.getState().profile).toBeNull();
    expect(useStore.getState().hasCompletedOnboarding).toBe(false);

    // Verify localStorage wipe
    expect(mockStorage.getItem('ascend_store')).toBeNull();
    expect(mockStorage.getItem('ascend_emergency_snapshot')).toBeNull();
    expect(mockStorage.getItem('ascend_notification_prefs')).toBeNull();
    expect(mockStorage.getItem('sb-test-auth-token')).toBeNull();
    expect(mockStorage.getItem('ascend_logged_out')).toBe('true');
  });

  it('verifies offline fallback when Supabase is not configured', async () => {
    const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mock).toBe(true);
    expect(data.success).toBe(true);

    if (origUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey;
  });

  it('verifies 401 UNAUTHORIZED when Supabase is configured but credentials missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';

    const route = await import('../src/app/api/auth/delete-account/route');
    const req = new Request('https://ascendtonext.vercel.app/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await route.POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('UNAUTHORIZED');

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });
});
