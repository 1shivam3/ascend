/**
 * Phase 4.5 — §34 deletion flow machine.
 *
 * The guarantees the brief asked for: 'error' has an explicit
 * reset; 'error' is unreachable from terminal states; the
 * session check is one arm of the state, not a parallel pair;
 * terminal visibility comes from one predicate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  deletionFlowReducer,
  initialDeletionFlow,
  isTerminalStatus,
  deletionFormMode,
  type DeletionFlowState,
} from '@/lib/deletion-flow';

const run = (
  state: DeletionFlowState,
  ...events: Parameters<typeof deletionFlowReducer>[1][]
) => events.reduce(deletionFlowReducer, state);

describe('§34 session arm', () => {
  it('starts checking only when no session was supplied', () => {
    expect(initialDeletionFlow().session.kind).toBe('checking');
    expect(initialDeletionFlow({ sessionUser: null }).session.kind).toBe('signed-out');
    expect(
      initialDeletionFlow({
        sessionUser: { email: 'a@b.c', accessToken: 'tok' },
      }).session,
    ).toEqual({ kind: 'signed-in', email: 'a@b.c', accessToken: 'tok' });
    expect(deletionFormMode(initialDeletionFlow())).toBe('checking');
    expect(deletionFormMode(initialDeletionFlow({ sessionUser: null }))).toBe('token');
  });

  it('session-resolved fills the arm either way', () => {
    const s = run(initialDeletionFlow(), {
      type: 'session-resolved',
      user: { email: 'a@b.c', accessToken: 'tok' },
    });
    expect(deletionFormMode(s)).toBe('session');
    const s2 = run(s, { type: 'session-resolved', user: null });
    expect(s2.session.kind).toBe('signed-out');
  });
});

describe('§34 happy + failure paths', () => {
  it('request → sent; request → failed → error → RESET → idle, message cleared', () => {
    let s = run(initialDeletionFlow({ sessionUser: null }), { type: 'request-token' });
    expect(s.status).toBe('requesting_token');
    s = run(s, { type: 'request-failed', message: 'boom' });
    expect(s.status).toBe('error');
    expect(s.errorMessage).toBe('boom');
    s = run(s, { type: 'reset' });
    expect(s.status).toBe('idle');
    expect(s.errorMessage).toBeNull();
  });

  it('delete → complete; validation from the form lands in error', () => {
    let s = run(initialDeletionFlow({ sessionUser: null }), {
      type: 'invalid',
      message: 'type DELETE',
    });
    expect(s.status).toBe('error');
    s = run(s, { type: 'reset' }, { type: 'delete' });
    expect(s.status).toBe('deleting');
    s = run(s, { type: 'delete-complete', details: 'purged' });
    expect(s.status).toBe('complete');
    expect(s.statusDetails).toBe('purged');
  });
});

describe('§34 terminal protection', () => {
  it('error is unreachable from complete/skipped — every event is a no-op there', () => {
    for (const terminal of ['complete', 'skipped'] as const) {
      const s0 = { ...initialDeletionFlow({ sessionUser: null }), status: terminal };
      for (const ev of [
        { type: 'invalid', message: 'x' },
        { type: 'delete-failed', message: 'x' },
        { type: 'request-failed', message: 'x' },
        { type: 'reset' },
        { type: 'delete' },
        { type: 'request-token' },
      ] as const) {
        expect(deletionFlowReducer(s0, ev)).toBe(s0);
      }
    }
  });

  it("partial's retry: partial → deleting → failure returns to PARTIAL, never error", () => {
    let s: DeletionFlowState = {
      ...initialDeletionFlow({ sessionUser: null }),
      status: 'partial',
      statusDetails: 'half purged',
    };
    s = run(s, { type: 'delete' });
    expect(s.status).toBe('deleting');
    s = run(s, { type: 'delete-failed', message: 'still failing' });
    expect(s.status).toBe('partial');
    expect(s.statusDetails).toBe('still failing');
    // And a successful retry completes normally.
    s = run(s, { type: 'delete' }, { type: 'delete-complete', details: 'purged' });
    expect(s.status).toBe('complete');
  });

  it('isTerminalStatus names exactly the three outcome states', () => {
    expect(isTerminalStatus('complete')).toBe(true);
    expect(isTerminalStatus('partial')).toBe(true);
    expect(isTerminalStatus('skipped')).toBe(true);
    expect(isTerminalStatus('error')).toBe(false);
    expect(isTerminalStatus('idle')).toBe(false);
    expect(isTerminalStatus('deleting')).toBe(false);
  });
});

describe('§34 component wiring (source guards)', () => {
  const src = readFileSync('src/components/DeleteAccountView.tsx', 'utf8');
  it('the component runs on the reducer — no parallel session pair remains', () => {
    expect(src).toContain('deletionFlowReducer');
    expect(src).not.toContain('const [isCheckingSession');
    expect(src).not.toContain('setIsCheckingSession');
    expect(src).not.toContain('setSessionUser');
    expect(src).not.toContain('setStatus(');
    expect(src).toContain('isTerminalStatus(status)');
    expect(src).toContain("dispatch({ type: 'reset' })");
  });
});
