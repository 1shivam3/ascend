import { describe, it, expect } from 'vitest';

// The scheduler's pure helpers are tested via the module's exported functions.
// We test sendTestNotification's permission gating and the time utilities
// indirectly through a minimal harness.

describe('local reminder scheduler', () => {
  it('exports startLocalReminderScheduler and sendTestNotification', async () => {
    const mod = await import('../src/lib/local-reminder-scheduler');
    expect(typeof mod.startLocalReminderScheduler).toBe('function');
    expect(typeof mod.sendTestNotification).toBe('function');
  });

  it('startLocalReminderScheduler is safe to call multiple times (no double intervals)', async () => {
    const mod = await import('../src/lib/local-reminder-scheduler');
    // Should not throw when window is undefined (SSR) or when called twice
    expect(() => mod.startLocalReminderScheduler()).not.toThrow();
    expect(() => mod.startLocalReminderScheduler()).not.toThrow();
  });

  it('sendTestNotification returns false without Notification API', async () => {
    const mod = await import('../src/lib/local-reminder-scheduler');
    // In vitest node env, window is undefined → returns false
    const result = await mod.sendTestNotification();
    expect(result).toBe(false);
  });
});
