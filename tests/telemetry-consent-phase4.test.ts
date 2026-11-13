/**
 * Phase 4.8 — §37 telemetry consent.
 *
 * Before: the tri-state was smuggled through a nullable —
 * 'accepted' | 'declined' | null, where null meant 'unasked' AND
 * served as components' pre-hydration initial state. Now the
 * union names all three states; absence of the stored key IS
 * 'unasked' (the migration: stored values are unchanged).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  getTelemetryConsent,
  setTelemetryConsent,
  TELEMETRY_CONSENT_KEY,
} from '@/lib/telemetry';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let storage: MemStorage;

beforeEach(() => {
  storage = new MemStorage();
  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = storage;
});

describe('§37 consent reads', () => {
  it('no stored key reads unasked (the migrated meaning of absence)', () => {
    expect(getTelemetryConsent()).toBe('unasked');
  });

  it('stored choices read back exactly', () => {
    storage.setItem(TELEMETRY_CONSENT_KEY, 'accepted');
    expect(getTelemetryConsent()).toBe('accepted');
    storage.setItem(TELEMETRY_CONSENT_KEY, 'declined');
    expect(getTelemetryConsent()).toBe('declined');
  });

  it('garbage in the key reads unasked, never a phantom choice', () => {
    storage.setItem(TELEMETRY_CONSENT_KEY, 'yes');
    expect(getTelemetryConsent()).toBe('unasked');
    storage.setItem(TELEMETRY_CONSENT_KEY, '');
    expect(getTelemetryConsent()).toBe('unasked');
  });

  it('set → get round-trips both choices', () => {
    setTelemetryConsent('accepted');
    expect(getTelemetryConsent()).toBe('accepted');
    setTelemetryConsent('declined');
    expect(getTelemetryConsent()).toBe('declined');
  });
});

describe('§37 source guards', () => {
  it('the nullable tri-state is gone everywhere', () => {
    for (const f of [
      'src/lib/telemetry.ts',
      'src/components/TelemetryProvider.tsx',
      'src/components/TelemetryConsentBanner.tsx',
      'src/components/SettingsView.tsx',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain("'declined' | null");
      expect(src).not.toContain('TelemetryConsent>(null)');
      expect(src).not.toContain('getTelemetryConsent() === null');
    }
    expect(readFileSync('src/lib/telemetry.ts', 'utf8')).toContain(
      "export type TelemetryConsent = 'unasked' | 'accepted' | 'declined'"
    );
  });
});
