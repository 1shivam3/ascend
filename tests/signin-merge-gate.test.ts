import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * S4 — OAuth / email-OTP sign-ins route through the Phase 1 merge
 * choice. Three layers:
 *  1. evaluateSignInMergeGate — the pure verdict matrix.
 *  2. The intent/marker persistence helpers.
 *  3. An engine-level flow against a mocked Supabase client: a fresh
 *     Google-style sign-in with guest data on the device AND cloud
 *     data on the account pauses sync (pendingMergeChoice) until
 *     resolveMergeChoice runs it; a failed archive keeps the pause
 *     and does NOT sync (AuthModal Task 1.4 semantics).
 *  4. Source wiring (house style, cf. auth-flow.test.ts).
 */

const mockChain = () => {
  const o: any = {
    eq: () => o,
    select: () => o,
    order: () => o,
    limit: () => o,
    in: () => o,
    range: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: mockProfileRow, error: null }),
    upsert: async () => ({ error: null }),
    delete: () => o,
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return o;
};
let mockProfileRow: any = { id: 'user-gate-1' };
const mockClient = {
  from: () => mockChain(),
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: 'user-gate-1',
          email: 'gate@example.com',
          user_metadata: {},
          app_metadata: { provider: 'google' },
          is_anonymous: false,
        },
      },
    }),
    getSession: async () => ({ data: { session: null } }),
  },
};

vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => mockClient }));

import {
  syncEngine,
  evaluateSignInMergeGate,
  mergeChoiceDataSignature,
  writeSignInIntent,
  readSignInIntentAt,
  clearSignInIntent,
  readMergeChoiceResolved,
  writeMergeChoiceResolved,
  SIGN_IN_INTENT_MAX_AGE_MS,
} from '@/lib/supabase/sync';
import { useStore } from '@/lib/store';
import { ARCHIVED_HISTORY_KEY } from '@/lib/history-fork';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  failOnKeys = new Set<string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failOnKeys.has(key)) throw new Error('QuotaExceededError');
    this.store.set(key, String(value));
  }
}

const NOW = 1_799_000_000_000;

function gateArgs(overrides: Record<string, unknown> = {}) {
  return {
    intentAt: NOW - 1000,
    now: NOW,
    isAnonymous: false,
    profileId: 'guest_0123456789abcdef',
    userId: 'user-1',
    localHasData: true,
    cloudHasData: true,
    resolvedMarker: null,
    dataSignature: 'sig',
    ...overrides,
  } as any;
}

describe('evaluateSignInMergeGate', () => {
  it('gates when a fresh intent meets guest data + cloud data', () => {
    expect(evaluateSignInMergeGate(gateArgs())).toBe('gate');
  });

  it('proceeds without an intent (ordinary session sync)', () => {
    expect(evaluateSignInMergeGate(gateArgs({ intentAt: null }))).toBe('proceed');
  });

  it('proceeds when the intent is stale', () => {
    expect(
      evaluateSignInMergeGate(gateArgs({ intentAt: NOW - SIGN_IN_INTENT_MAX_AGE_MS - 1 })),
    ).toBe('proceed');
  });

  it('proceeds for anonymous users', () => {
    expect(evaluateSignInMergeGate(gateArgs({ isAnonymous: true }))).toBe('proceed');
  });

  it('one-sided cases proceed as before (no guest data / empty account)', () => {
    expect(evaluateSignInMergeGate(gateArgs({ localHasData: false }))).toBe('proceed');
    expect(evaluateSignInMergeGate(gateArgs({ cloudHasData: false }))).toBe('proceed');
  });

  it('a matching resolution marker proceeds; a different data signature gates again', () => {
    expect(
      evaluateSignInMergeGate(gateArgs({ resolvedMarker: 'user-1:sig' })),
    ).toBe('proceed');
    expect(
      evaluateSignInMergeGate(gateArgs({ resolvedMarker: 'user-1:other-data' })),
    ).toBe('gate');
    expect(
      evaluateSignInMergeGate(gateArgs({ resolvedMarker: 'user-2:sig' })),
    ).toBe('gate');
  });

  it('a profile belonging to a different account proceeds (cross-account semantics)', () => {
    expect(
      evaluateSignInMergeGate(gateArgs({ profileId: 'some-other-account-id' })),
    ).toBe('proceed');
  });

  it('an already-linked profile proceeds; a missing profile with data gates', () => {
    expect(evaluateSignInMergeGate(gateArgs({ profileId: 'user-1' }))).toBe('proceed');
    expect(evaluateSignInMergeGate(gateArgs({ profileId: null }))).toBe('gate');
    expect(evaluateSignInMergeGate(gateArgs({ profileId: 'user_legacy_guest' }))).toBe('gate');
  });
});

describe('intent + resolution persistence', () => {
  let storage: MockStorage;
  beforeEach(() => {
    storage = new MockStorage();
    Object.defineProperty(global, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
    (global as any).window = global;
  });

  it('intent round-trips and clears', () => {
    expect(readSignInIntentAt()).toBeNull();
    writeSignInIntent();
    const at = readSignInIntentAt();
    expect(typeof at).toBe('number');
    expect(Math.abs(Date.now() - (at as number))).toBeLessThan(5000);
    clearSignInIntent();
    expect(readSignInIntentAt()).toBeNull();
  });

  it('resolution marker round-trips as userId:signature', () => {
    writeMergeChoiceResolved('user-1', 'sig');
    expect(readMergeChoiceResolved()).toBe('user-1:sig');
  });

  it('data signatures are stable per data set and change with the data', () => {
    const a = mergeChoiceDataSignature({ workouts: [{ id: 'w2' }, { id: 'w1' }] });
    const b = mergeChoiceDataSignature({ workouts: [{ id: 'w1' }, { id: 'w2' }] });
    const c = mergeChoiceDataSignature({ workouts: [{ id: 'w1' }] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('engine flow — gate, resolve, archive-failure', () => {
  let storage: MockStorage;
  beforeEach(() => {
    vi.clearAllMocks();
    storage = new MockStorage();
    Object.defineProperty(global, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
    (global as any).window = global;
    // The test environment reports offline; the engine (correctly)
    // refuses to sync at all until it believes it is online.
    Object.defineProperty(global.navigator, 'onLine', {
      get: () => true,
      configurable: true,
    });
    mockProfileRow = { id: 'user-gate-1' };
    useStore.getState().clearAllData();
    (syncEngine as any).pendingMergeChoiceFor = null;
    (syncEngine as any).mergeGateEvaluatedKey = null;
    // A guest profile with one workout on the device.
    useStore.setState({
      profile: { id: 'guest_0123456789abcdef', name: 'Guest' } as any,
      workouts: [{ id: 'w1', name: 'W', date: '2026-11-01', exercises: [] } as any],
    });
  });

  it('a fresh sign-in with data on both sides pauses sync until the choice', async () => {
    writeSignInIntent();
    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(true);
    expect(syncEngine.getStatus().status).toBe('idle');
    // The guest data is untouched while paused.
    expect(useStore.getState().workouts.map((w) => w.id)).toEqual(['w1']);

    const res = await syncEngine.resolveMergeChoice('merge');
    expect(res).toEqual({});
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(false);
    expect(readMergeChoiceResolved()).toContain('user-gate-1:');
    expect(readSignInIntentAt()).toBeNull();
  });

  it('one-sided (account has no cloud data) proceeds without gating', async () => {
    mockProfileRow = null; // profiles probe finds nothing…
    // …and every collection probe returns [] via the chain default.
    writeSignInIntent();
    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(false);
  });

  it('archive resolution archives the device data, then syncs', async () => {
    writeSignInIntent();
    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(true);
    const res = await syncEngine.resolveMergeChoice('archive');
    expect(res).toEqual({});
    expect(storage.getItem(ARCHIVED_HISTORY_KEY)).toBeTruthy();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(false);
  });

  it('a failed archive keeps the pause and does NOT sync or record a resolution', async () => {
    storage.failOnKeys.add(ARCHIVED_HISTORY_KEY);
    writeSignInIntent();
    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(true);
    const res = await syncEngine.resolveMergeChoice('archive');
    expect(res.error).toBe('archive_failed');
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(true);
    expect(readMergeChoiceResolved()).toBeNull();
    // Device data still in place — nothing was merged or wiped.
    expect(useStore.getState().workouts.map((w) => w.id)).toEqual(['w1']);
  });
});

describe('source wiring', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('the OAuth/OTP entry points write the intent flag', () => {
    const sync = read('src/lib/supabase/sync.ts');
    const google = sync.slice(
      sync.indexOf('public async signInWithGoogle'),
      sync.indexOf('public async signInWithApple'),
    );
    const otp = sync.slice(
      sync.indexOf('public async sendEmailOtp'),
      sync.indexOf('public async verifyEmailOtp'),
    );
    expect(google).toContain('writeSignInIntent()');
    expect(otp).toContain('writeSignInIntent()');
  });

  it('the gate sits inside the sync path and pushLocalData refuses while pending', () => {
    const sync = read('src/lib/supabase/sync.ts');
    expect(sync).toContain('await this.shouldGateForMergeChoice(user)');
    const push = sync.slice(sync.indexOf('private async pushLocalData'));
    expect(push.slice(0, 900)).toContain('pendingMergeChoiceFor');
  });

  it('MergeChoiceModal reuses the Phase 1 strings and the engine resolution', () => {
    const modal = read('src/components/MergeChoiceModal.tsx');
    for (const key of ['auth.mergeTitle', 'auth.mergeBody', 'auth.mergeDeviceBtn', 'auth.keepAccountBtn', 'auth.mergeDone', 'auth.archiveDone']) {
      expect(modal).toContain(key);
    }
    expect(modal).toContain('resolveMergeChoice');
    expect(modal).toContain('pendingMergeChoice');
  });

  it('page.tsx mounts the modal and AuthModal records its own resolutions', () => {
    const page = read('src/app/page.tsx');
    expect(page).toContain('<MergeChoiceModal />');
    const authModal = read('src/components/AuthModal.tsx');
    expect(authModal).toContain('suppressMergeGateFor');
  });
});
