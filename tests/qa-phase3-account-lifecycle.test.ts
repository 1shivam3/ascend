/**
 * QA-hardening Phase 3 — Check 6: account lifecycle (guest → email).
 *
 * STUBBED AUTH ONLY. The Supabase client is a vi.mock double (the
 * auth-login-flow.test.ts pattern) — no real provider, no production
 * project, no real accounts are ever touched.
 *
 * (a) A guest's local data survives the upgrade path:
 *  - Decision level: the merge choice is offered exactly when BOTH
 *    the device (guest history) and the account (cloud data) hold
 *    something to lose (shouldOfferMergeChoice), and the engine's
 *    sign-in gate (evaluateSignInMergeGate) gates the canonical
 *    guest case and stands down once the choice is resolved.
 *  - 'merge' mechanics: the pull-merge the engine runs for the
 *    guest-migration branch (mergeRemoteRecords, used for workouts,
 *    meals, plans, PRs and body metrics) is a UNION — every local
 *    guest record survives, account-only records are added, and
 *    tombstoned records are never resurrected.
 *  - 'keep' mechanics (store level, real store): the keep path
 *    archives the guest history FIRST (startFreshFromRetainedHistory
 *    → archive under ascend_archived_history, restorable from
 *    Settings → Data & Account) and only then resets the live
 *    collections — the data is never destroyed by the choice.
 *  - A merge resolution is bound to the data it covered:
 *    mergeChoiceDataSignature changes when the id sets change.
 *
 * (b) Wrong-password errors never leak account existence (F-10):
 *  - Engine boundary (stubbed provider): signInWithPassword surfaces
 *    the provider's raw message in its RESULT object — that string
 *    is internal. Two different provider failures (wrong password vs
 *    unconfirmed email) produce two different raw strings here,
 *    which is exactly why the UI must never render it.
 *  - UI level (the level the code controls): AuthModal, LoginScreen
 *    and CreateAccountScreen assign ONLY the generic key
 *    (auth.signInFailed / auth.createFailed) to rendered form-error
 *    state on every failure path — no setError/setFormError call
 *    anywhere in these files receives err?.message, res.error or
 *    error.message.
 *  - The generic copy itself contains no enumeration wording.
 *
 * NOT TESTED (needs the real provider / a live backend — stated
 * plainly, not simulated): the actual Supabase Auth round-trip
 * (credential acceptance/rejection by the provider), email
 * verification delivery, OAuth/OTP sign-in, the rendered
 * MergeChoiceModal drive against a stubbed backend, and
 * cross-device convergence of the merged data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shouldOfferMergeChoice } from '../src/lib/auth-flow';
import {
  evaluateSignInMergeGate,
  mergeChoiceDataSignature,
} from '../src/lib/supabase/sync';
import { mergeRemoteRecords } from '../src/lib/supabase/reconcile';
import { hasRetainedHistory, ARCHIVED_HISTORY_KEY } from '../src/lib/history-fork';
import { useStore } from '../src/lib/store';
import { en } from '../src/lib/i18n/en';

// ── Stubbed storage (same pattern as the existing suites) ──────────
class MockStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}
const mockStorage = new MockStorage();

beforeEach(() => {
  mockStorage.clear();
  Object.defineProperty(global, 'localStorage', {
    value: mockStorage, writable: true, configurable: true,
  });
  Object.defineProperty(global, 'window', {
    value: {
      localStorage: mockStorage,
      location: { origin: 'http://localhost:3000', hash: '', search: '' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    writable: true, configurable: true,
  });
});

// ── (a) The merge choice is offered exactly for the two-sided case ─
describe('Check 6a — merge-choice decision level', () => {
  it('offers the choice only when guest device AND account both hold data', () => {
    expect(shouldOfferMergeChoice(true, true)).toBe(true);
    expect(shouldOfferMergeChoice(true, false)).toBe(false);
    expect(shouldOfferMergeChoice(false, true)).toBe(false);
    expect(shouldOfferMergeChoice(false, false)).toBe(false);
  });

  it('the sign-in gate gates the canonical guest-upgrade case', () => {
    const now = Date.now();
    const base = {
      intentAt: now - 1_000,
      now,
      isAnonymous: false,
      profileId: 'guest_abc123',
      userId: 'account-user-1',
      localHasData: true,
      cloudHasData: true,
      resolvedMarker: null,
      dataSignature: 'w1||||',
    };
    expect(evaluateSignInMergeGate(base)).toBe('gate');
    // One-sided cases proceed without a choice.
    expect(evaluateSignInMergeGate({ ...base, cloudHasData: false })).toBe('proceed');
    expect(evaluateSignInMergeGate({ ...base, localHasData: false })).toBe('proceed');
    // Device already linked to THIS account: a normal sync.
    expect(evaluateSignInMergeGate({ ...base, profileId: 'account-user-1' })).toBe('proceed');
    // No fresh sign-in intent: never gate.
    expect(evaluateSignInMergeGate({ ...base, intentAt: null })).toBe('proceed');
  });

  it('a recorded resolution stands the gate down for the SAME data only', () => {
    const now = Date.now();
    const signature = mergeChoiceDataSignature({
      workouts: [{ id: 'w1' }],
      meals: [{ id: 'm1' }],
    });
    const base = {
      intentAt: now - 1_000,
      now,
      isAnonymous: false,
      profileId: 'guest_abc123',
      userId: 'account-user-1',
      localHasData: true,
      cloudHasData: true,
      resolvedMarker: `account-user-1:${signature}`,
      dataSignature: signature,
    };
    expect(evaluateSignInMergeGate(base)).toBe('proceed');
    // Different data afterwards is NOT covered by the resolution.
    const otherSignature = mergeChoiceDataSignature({
      workouts: [{ id: 'w1' }, { id: 'w2' }],
      meals: [{ id: 'm1' }],
    });
    expect(otherSignature).not.toBe(signature);
    expect(evaluateSignInMergeGate({ ...base, dataSignature: otherSignature })).toBe('gate');
  });

  it('the data signature is id-set based and order-insensitive', () => {
    const a = mergeChoiceDataSignature({ workouts: [{ id: 'w2' }, { id: 'w1' }] });
    const b = mergeChoiceDataSignature({ workouts: [{ id: 'w1' }, { id: 'w2' }] });
    expect(a).toBe(b);
    expect(
      mergeChoiceDataSignature({ workouts: [{ id: 'w1' }], meals: [{ id: 'm1' }] }),
    ).not.toBe(mergeChoiceDataSignature({ workouts: [{ id: 'w1' }] }));
  });
});

// ── (a) 'merge': the guest-migration pull-merge is a union ─────────
describe("Check 6a — 'merge' mechanics (mergeRemoteRecords)", () => {
  const guest = [{ id: 'w1', note: 'guest squat' }, { id: 'w2', note: 'guest bench' }];
  const account = [{ id: 'w2', note: 'account bench (copy)' }, { id: 'w3', note: 'account row' }];

  it('every guest record survives; account-only records are added; local wins collisions', () => {
    const { merged, changed } = mergeRemoteRecords(guest, account);
    expect(merged.map((r) => r.id).sort()).toEqual(['w1', 'w2', 'w3']);
    expect(merged.find((r) => r.id === 'w2')?.note).toBe('guest bench');
    expect(changed).toBe(true);
  });

  it('an empty account changes nothing — the guest data is byte-identical', () => {
    const { merged, changed } = mergeRemoteRecords(guest, []);
    expect(merged).toEqual(guest);
    expect(changed).toBe(false);
  });

  it('tombstoned account records are never resurrected into the guest data', () => {
    const { merged } = mergeRemoteRecords(guest, account, ['w3']);
    expect(merged.map((r) => r.id).sort()).toEqual(['w1', 'w2']);
  });
});

// ── (a) 'keep': archive-first at store level ───────────────────────
describe("Check 6a — 'keep' mechanics (store archive)", () => {
  const guestState = {
    profile: { id: 'guest_abc123', name: 'Guest' } as never,
    workouts: [{ id: 'w1' }, { id: 'w2' }] as never,
    meals: [{ id: 'm1' }] as never,
    plannedWorkouts: [{ id: 'p1' }] as never,
    prs: [{ id: 'pr1' }] as never,
    bodyMetrics: [{ id: 'b1' }] as never,
  };

  it('start-fresh archives every guest record before resetting the live collections', () => {
    useStore.setState(guestState);
    expect(hasRetainedHistory(useStore.getState())).toBe(true);

    const ok = useStore.getState().startFreshFromRetainedHistory();
    expect(ok).toBe(true);

    // The live collections are reset (the account's data will land)…
    const after = useStore.getState();
    expect(after.workouts).toEqual([]);
    expect(after.meals).toEqual([]);
    expect(after.plannedWorkouts).toEqual([]);
    expect(after.prs).toEqual([]);
    // Body metrics: the guest's rows are gone; start-fresh seeds ONE
    // baseline entry for the new default profile (70 kg placeholder,
    // flagged default — the documented start-fresh behavior), so the
    // assertion is that no GUEST row survives live.
    expect(after.bodyMetrics.map((r: { id: string }) => r.id)).not.toContain('b1');

    // …but nothing was destroyed: the archive holds the full guest
    // history, restorable from Settings → Data & Account.
    const raw = mockStorage.getItem(ARCHIVED_HISTORY_KEY);
    expect(raw).toBeTruthy();
    // §12: the key holds the generation list; the newest generation
    // is the archive this Start-fresh just wrote.
    const archive = JSON.parse(raw!).archives[0];
    expect(archive.workouts.map((r: { id: string }) => r.id).sort()).toEqual(['w1', 'w2']);
    expect(archive.meals.map((r: { id: string }) => r.id)).toEqual(['m1']);
    expect(archive.plannedWorkouts.map((r: { id: string }) => r.id)).toEqual(['p1']);
    expect(archive.prs.map((r: { id: string }) => r.id)).toEqual(['pr1']);
    expect(archive.bodyMetrics.map((r: { id: string }) => r.id)).toEqual(['b1']);
  });
});

// ── (b) Wrong-password generic errors ──────────────────────────────
// Stubbed provider: the supabase-js client factory returns a double
// whose auth.signInWithPassword fails the way the real provider does
// (the auth-login-flow.test.ts pattern — no network, no real project).
const { mockSupabase } = vi.hoisted(() => {
  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  };
  return { mockSupabase: mockClient };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: vi.fn(() => mockSupabase) };
});

describe('Check 6b — engine boundary with the stubbed provider', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_testing_1234567890';
  });

  it('two different provider failures surface two different RAW strings at the engine boundary — the UI generic key is the only safe render', async () => {
    const { syncEngine } = await import('../src/lib/supabase/sync');

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });
    const wrongPassword = await syncEngine.signInWithPassword('guest@example.com', 'wrong-password');
    expect(wrongPassword.user).toBeUndefined();
    expect(wrongPassword.error).toBe('Invalid login credentials');

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Email not confirmed' },
    });
    const unconfirmed = await syncEngine.signInWithPassword('ghost@example.com', 'whatever123');
    expect(unconfirmed.error).toBe('Email not confirmed');

    // The two raw strings DIFFER (one of them reveals the account
    // exists but is unconfirmed) — proof that rendering res.error
    // would leak existence, and the generic UI key is load-bearing.
    expect(wrongPassword.error).not.toBe(unconfirmed.error);
  });
});

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('Check 6b — auth surfaces render only the generic failure key (F-10)', () => {
  const surfaces = [
    { file: 'src/components/AuthModal.tsx', keys: ["t('auth.signInFailed')", "t('auth.createFailed')"] },
    { file: 'src/components/onboarding/LoginScreen.tsx', keys: ["t('auth.signInFailed')"] },
    { file: 'src/components/onboarding/CreateAccountScreen.tsx', keys: ["t('auth.createFailed')"] },
  ];

  for (const { file, keys } of surfaces) {
    it(`${file}: no raw error string reaches form-error state`, () => {
      const src = read(file);
      expect(src).not.toMatch(/set(Form)?Error\(\s*(err|error|res)\??\.?(error|message)/);
      expect(src).not.toMatch(/set(Form)?Error\([^)]*\.message/);
      for (const key of keys) {
        expect(src).toContain(key);
      }
    });
  }

  it('the generic copy carries no account-existence wording', () => {
    for (const key of ['auth.signInFailed', 'auth.createFailed'] as const) {
      expect(en[key]).not.toMatch(/not found|no account|does not exist|wrong password|invalid password|unknown email/i);
    }
    expect(en['auth.signInFailed']).toBe('Could not sign in');
  });
});
