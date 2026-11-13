/**
 * Phase 4.7 — §36 permissions.
 *
 * Health Connect: per-type grants with a derived state, replacing
 * the every() collapse. Notifications: the request API returns
 * the full outcome instead of a boolean. The native bridges can't
 * run here, so the pure derivations are tested directly and the
 * bridge functions via their unsupported paths + source guards.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  healthGrantsFromAuthorized,
  invalidateHealthGrants,
  checkHealthAuthorization,
  HEALTH_READ_TYPES,
} from '@/lib/health-connect';
import { requestLocalNotificationPermission } from '@/lib/local-notifications';

describe('§36 health grants derivation', () => {
  it('all granted → all, nothing missing', () => {
    const g = healthGrantsFromAuthorized(['steps', 'sleep', 'weight']);
    expect(g.state).toBe('all');
    expect(g.missing).toEqual([]);
    expect(g.granted).toEqual([...HEALTH_READ_TYPES]);
  });

  it('a subset → partial, naming exactly the missing types', () => {
    const g = healthGrantsFromAuthorized(['steps', 'sleep']);
    expect(g.state).toBe('partial');
    expect(g.granted).toEqual(['steps', 'sleep']);
    expect(g.missing).toEqual(['weight']);
  });

  it('none granted → none, everything missing', () => {
    const g = healthGrantsFromAuthorized([]);
    expect(g.state).toBe('none');
    expect(g.missing).toEqual([...HEALTH_READ_TYPES]);
  });

  it('bridge silence (null/undefined) → unknown, no invented missing list', () => {
    expect(healthGrantsFromAuthorized(null).state).toBe('unknown');
    expect(healthGrantsFromAuthorized(undefined).state).toBe('unknown');
  });

  it('extra/unknown types from the bridge are ignored', () => {
    const g = healthGrantsFromAuthorized(['steps', 'sleep', 'weight', 'heartRate']);
    expect(g.state).toBe('all');
    expect(g.granted).toEqual([...HEALTH_READ_TYPES]);
  });

  it('off-native, the check resolves unknown (and the cache invalidates cleanly)', async () => {
    invalidateHealthGrants();
    const g = await checkHealthAuthorization();
    expect(g.state).toBe('unknown');
  });
});

describe('§36 notification request states', () => {
  it('on web (not native) the request reports unsupported-web, not false', async () => {
    await expect(requestLocalNotificationPermission()).resolves.toBe('unsupported-web');
  });
});

describe('§36 wiring (source guards)', () => {
  it('health-sync gates on the derived state and invalidates on resume', () => {
    const src = readFileSync('src/lib/health-sync.ts', 'utf8');
    expect(src).toContain("auth.state !== 'all'");
    expect(src).toContain('invalidateHealthGrants()');
    const hc = readFileSync('src/lib/health-connect.ts', 'utf8');
    expect(hc).not.toContain("? 'granted' : 'denied'");
  });

  it('Settings names the missing types; the reminder modal branches on the full state', () => {
    const settings = readFileSync('src/components/SettingsView.tsx', 'utf8');
    expect(settings).toContain('health.partialMissing');
    expect(settings).toContain('auth.missing');
    const modal = readFileSync('src/components/ReminderCenterModal.tsx', 'utf8');
    expect(modal).toContain("result === 'dismissed'");
    const ln = readFileSync('src/lib/local-notifications.ts', 'utf8');
    expect(ln).toContain("Promise<LocalNotificationRequestResult>");
    expect(ln).not.toContain('Promise<boolean> {\n  if (!isNativeApp()) return false;\n  try {\n    const plugin = await loadPlugin();\n    const status = await plugin.requestPermissions();');
  });
});
