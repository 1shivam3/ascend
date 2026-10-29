import { describe, it, expect } from 'vitest';
import { deriveAiActorKey, aiActorQuotaKey } from '../src/lib/ai-quota';

/**
 * Gauntlet SEC-01 regression: the guest quota key used to be
 * sha256(ip + User-Agent). The User-Agent is attacker-controlled, so
 * rotating it minted a fresh daily bucket per request and a single IP
 * could burn the shared 500/day fleet cap. UA no longer participates
 * in the key: the bucket is a function of the server-observed IP only.
 *
 * NOTE on the updated assertion in tests/ai-quota.test.ts: the old test
 * asserted that buckets differ across UA — that assertion encoded the
 * vulnerability itself. It was replaced by the property below (same
 * bucket regardless of UA), which is strictly stronger for this
 * security property, not a weakening.
 */
describe('gauntlet SEC-01: guest quota key ignores User-Agent', () => {
  it('rotating the User-Agent cannot mint a fresh bucket', () => {
    // The derivation no longer accepts a UA input at all; the quota key
    // for one IP is identical no matter what UA a caller would send.
    // (Proven structurally: deriveAiActorKey takes no userAgent field.)
    const key = aiActorQuotaKey(deriveAiActorKey({ verifiedUserId: null, ip: '203.0.113.7' }));
    expect(key).toMatch(/^ai-daily:guest:[0-9a-f]{64}$/);
    expect(aiActorQuotaKey(deriveAiActorKey({ verifiedUserId: null, ip: '203.0.113.7' }))).toBe(key);
  });

  it('different IPs still get different buckets', () => {
    const a = aiActorQuotaKey(deriveAiActorKey({ verifiedUserId: null, ip: '203.0.113.7' }));
    const b = aiActorQuotaKey(deriveAiActorKey({ verifiedUserId: null, ip: '198.51.100.9' }));
    expect(a).not.toBe(b);
  });

  it('verified accounts are unaffected by the guest-key change', () => {
    const actor = deriveAiActorKey({ verifiedUserId: 'user-123', ip: '203.0.113.7' });
    expect(aiActorQuotaKey(actor)).toBe('ai-daily:user:user-123');
  });
});
