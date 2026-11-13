import { describe, it, expect, beforeEach } from 'vitest';
import {
  consumeDeletionNonce,
  isNonceConsumed,
  verifyDeletionToken,
  resetConsumedNoncesForTests,
  type DeletionTokenPayload,
} from '@/lib/deletion-token';

/**
 * Phase 1.1 (§14) — the deletion-nonce ledger is a state machine
 * (none → partial → consumed) and 'consumed' is terminal.
 *
 * Before: consumeDeletionNonce upserted unconditionally, so a
 * 'partial' write after a completed deletion REGRESSED the ledger
 * row to partial — and verifyDeletionToken explicitly allows retry
 * on partial, reopening a spent token. isNonceConsumed swallowed
 * ledger read errors into `false` (fail-open), and a missing/garbage
 * status was coerced to 'consumed' in the cache while the check
 * itself let the token through.
 *
 * The fake client models the real table (verified live 2026-11-13:
 * jti text PK, status text NOT NULL, no CHECK constraint) with
 * insert-conflict (23505) semantics.
 */

interface Row {
  jti: string;
  user_id: string | null;
  email: string | null;
  status: string;
  consumed_at: string;
  expires_at: string;
}

function makeFakeDb() {
  const rows = new Map<string, Row>();
  const client: any = {
    from: (_table: string) => ({
      upsert: async (row: Row, opts?: { ignoreDuplicates?: boolean }) => {
        // Models PostgREST: ignoreDuplicates = ON CONFLICT DO NOTHING.
        if (opts?.ignoreDuplicates && rows.has(row.jti)) return { error: null };
        rows.set(row.jti, { ...row });
        return { error: null };
      },
      insert: async (row: Row) => {
        if (rows.has(row.jti)) {
          return { error: { code: '23505', message: 'duplicate key' } };
        }
        rows.set(row.jti, { ...row });
        return { error: null };
      },
      update: (patch: Partial<Row>) => {
        const filters: [string, unknown][] = [];
        const chain: any = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          then: (resolve: any) => {
            for (const row of rows.values()) {
              if (filters.every(([c, v]) => (row as any)[c] === v)) Object.assign(row, patch);
            }
            return resolve({ data: null, error: null });
          },
        };
        return chain;
      },
      select: (_cols: string) => {
        const chain: any = {
          eq: (col: string, val: unknown) => {
            chain._val = val;
            chain._col = col;
            return chain;
          },
          maybeSingle: async () => {
            for (const row of rows.values()) {
              if ((row as any)[chain._col] === chain._val) return { data: { ...row }, error: null };
            }
            return { data: null, error: null };
          },
        };
        return chain;
      },
    }),
  };
  return { client, rows };
}

const payload: DeletionTokenPayload = {
  sub: 'uid-1',
  email: 'a@example.com',
  jti: 'jti-1',
  exp: Date.now() + 15 * 60 * 1000,
  purpose: 'account_deletion',
};

beforeEach(() => {
  resetConsumedNoncesForTests();
});

describe('§14 nonce transition guard', () => {
  it('consumed is terminal: a later partial write cannot regress the ledger', async () => {
    const { client, rows } = makeFakeDb();
    await consumeDeletionNonce('jti-1', payload, 'consumed', client);
    expect(rows.get('jti-1')?.status).toBe('consumed');
    await consumeDeletionNonce('jti-1', payload, 'partial', client);
    expect(rows.get('jti-1')?.status).toBe('consumed');
    // …and verification still rejects the spent token.
    expect(await isNonceConsumed('jti-1', client)).toBe(true);
  });

  it('partial → consumed upgrade is legal; partial → partial is idempotent', async () => {
    const { client, rows } = makeFakeDb();
    await consumeDeletionNonce('jti-1', payload, 'partial', client);
    expect(rows.get('jti-1')?.status).toBe('partial');
    expect(rows.get('jti-1')?.user_id).toBe('uid-1'); // recovery info kept for partial
    await consumeDeletionNonce('jti-1', payload, 'partial', client);
    expect(rows.get('jti-1')?.status).toBe('partial');
    await consumeDeletionNonce('jti-1', payload, 'consumed', client);
    expect(rows.get('jti-1')?.status).toBe('consumed');
    expect(rows.get('jti-1')?.user_id).toBeNull(); // anonymized on full consumption
  });

  it('the in-memory record cannot regress either (no dbClient)', async () => {
    await consumeDeletionNonce('jti-1', payload, 'consumed', null);
    await consumeDeletionNonce('jti-1', payload, 'partial', null);
    expect(await isNonceConsumed('jti-1', null)).toBe(true);
  });
});

describe('§14 isNonceConsumed fails closed', () => {
  it('a ledger read error with a dbClient supplied counts as consumed', async () => {
    const brokenClient: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              throw new Error('ledger unreachable');
            },
          }),
        }),
      }),
    };
    expect(await isNonceConsumed('jti-x', brokenClient)).toBe(true);
  });

  it('a partial row reads as NOT consumed (retry stays possible)', async () => {
    const { client } = makeFakeDb();
    await consumeDeletionNonce('jti-1', payload, 'partial', client);
    resetConsumedNoncesForTests(); // force the DB path
    expect(await isNonceConsumed('jti-1', client)).toBe(false);
  });
});

describe('§14 verifyDeletionToken status validation', () => {
  it('a ledger row with a garbage status is treated as consumed (rejected), never as retryable', async () => {
    (process.env as Record<string, string | undefined>).SUPABASE_DELETION_SECRET =
      'phase1-test-secret';
    const { createDeletionToken } = await import('@/lib/deletion-token');
    const token = createDeletionToken('uid-1', 'a@example.com');
    // Recover the jti the signer minted, then plant a corrupted row.
    const first = await verifyDeletionToken(token, undefined, null);
    if (!first.valid) throw new Error(`expected a valid token, got ${first.error}`);
    const jti = first.payload.jti;
    const { client, rows } = makeFakeDb();
    rows.set(jti, {
      jti,
      user_id: 'uid-1',
      email: 'a@example.com',
      status: 'weird',
      consumed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    resetConsumedNoncesForTests(); // force the ledger path, not the memory cache
    const res = await verifyDeletionToken(token, undefined, client);
    if (res.valid) throw new Error('expected the corrupted-status token to be rejected');
    expect(res.error).toBe('TOKEN_ALREADY_USED');
    delete (process.env as Record<string, string | undefined>).SUPABASE_DELETION_SECRET;
  });
});
