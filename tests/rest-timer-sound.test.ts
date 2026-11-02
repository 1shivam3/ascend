import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Rest-timer sound fix — the owner reported on a real phone that the
 * rest-finish chime never sounded. Root cause: ActiveWorkoutScreen
 * built a NEW AudioContext at finish time; Android starts gesture-less
 * AudioContexts suspended, so the notes were scheduled into silence.
 *
 * These tests pin the fix:
 *  1. lib/rest-chime keeps ONE shared context and resumes it before
 *     scheduling (unit, stubbed AudioContext).
 *  2. lib/local-notifications schedules/cancels the one-shot
 *     locked-screen rest alert with a fixed id, native + permission
 *     gated (unit, mocked Capacitor plugins).
 *  3. ActiveWorkoutScreen wires unlock + schedule/cancel into every
 *     rest start/pause/resume/adjust/skip/finish path (source pins).
 */

// ─── Capacitor plugin mocks (for the local-notifications unit tests) ─────────

const h = vi.hoisted(() => ({
  native: true,
  display: 'granted' as string,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => h.native,
    getPlatform: () => 'android',
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: h.display })),
    requestPermissions: vi.fn(async () => ({ display: h.display })),
    schedule: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    getPending: vi.fn(async () => ({ notifications: [] })),
  },
}));

import { LocalNotifications } from '@capacitor/local-notifications';
import {
  REST_TIMER_NOTIFICATION_ID,
  cancelRestDoneNotification,
  scheduleRestDoneNotification,
} from '@/lib/local-notifications';
import {
  REST_CHIME_FREQUENCIES,
  REST_CHIME_PEAK_GAIN,
  __resetRestChimeForTests,
  getSharedRestAudioContext,
  playRestDoneChime,
  unlockRestAudio,
} from '@/lib/rest-chime';

// ─── Fake Web Audio ──────────────────────────────────────────────────────────

class FakeParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeOscillator {
  type = '';
  frequency = new FakeParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

const scheduleMock = vi.mocked(LocalNotifications.schedule);
const cancelMock = vi.mocked(LocalNotifications.cancel);

// ─── 1. rest-chime unit tests ────────────────────────────────────────────────

describe('rest-chime shared AudioContext', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    __resetRestChimeForTests();
    (globalThis as { window?: unknown }).window = {
      AudioContext: FakeAudioContext,
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    __resetRestChimeForTests();
  });

  it('reuses ONE context across unlock and play calls (no per-call construction)', () => {
    unlockRestAudio();
    playRestDoneChime();
    playRestDoneChime();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(getSharedRestAudioContext()).toBe(FakeAudioContext.instances[0]);
  });

  it('resumes a suspended context before scheduling notes', () => {
    const ctx = getSharedRestAudioContext() as unknown as FakeAudioContext;
    expect(ctx.state).toBe('suspended'); // fresh contexts start suspended, like Android
    playRestDoneChime();
    expect(ctx.resume).toHaveBeenCalled();
    // Three notes were actually scheduled on the shared context.
    expect(ctx.oscillators).toHaveLength(3);
    for (const osc of ctx.oscillators) {
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
    }
  });

  it('unlock is idempotent — one context, resume only while suspended', () => {
    unlockRestAudio();
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    // The (mocked) resume flipped state to running; further unlocks no-op.
    unlockRestAudio();
    unlockRestAudio();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('schedules the stronger three-note motif at the new peak gain', () => {
    playRestDoneChime();
    const ctx = FakeAudioContext.instances[0];
    const frequencies = ctx.oscillators.map(
      (osc) => osc.frequency.setValueAtTime.mock.calls[0][0] as number
    );
    expect(frequencies).toEqual([...REST_CHIME_FREQUENCIES]);
    expect(frequencies.slice(0, 2)).toEqual([587.33, 880]); // original motif
    for (const gain of ctx.gains) {
      expect(gain.gain.setValueAtTime.mock.calls[0][0]).toBe(
        REST_CHIME_PEAK_GAIN
      );
    }
    expect(REST_CHIME_PEAK_GAIN).toBeGreaterThan(0.12); // louder than the old chime
  });

  it('no-ops silently when Web Audio is unavailable', () => {
    (globalThis as { window?: unknown }).window = {};
    __resetRestChimeForTests();
    expect(getSharedRestAudioContext()).toBeNull();
    expect(() => unlockRestAudio()).not.toThrow();
    expect(() => playRestDoneChime()).not.toThrow();
  });
});

// ─── 2. local-notifications rest alert unit tests ────────────────────────────

describe('rest-done local notification', () => {
  const future = () => new Date(Date.now() + 90_000);

  beforeEach(() => {
    h.native = true;
    h.display = 'granted';
    scheduleMock.mockClear();
    cancelMock.mockClear();
  });

  it('schedules one notification with the fixed rest id at the exact end time', async () => {
    const at = future();
    const ok = await scheduleRestDoneNotification(at, 'SET READY', 'Rest over');
    expect(ok).toBe(true);
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    const arg = scheduleMock.mock.calls[0][0] as {
      notifications: Array<{
        id: number;
        title: string;
        body: string;
        schedule: { at: Date; allowWhileIdle: boolean };
      }>;
    };
    expect(arg.notifications).toHaveLength(1);
    expect(arg.notifications[0].id).toBe(REST_TIMER_NOTIFICATION_ID);
    expect(arg.notifications[0].title).toBe('SET READY');
    expect(arg.notifications[0].schedule.at).toBe(at);
    expect(arg.notifications[0].schedule.allowWhileIdle).toBe(true);
    // Replace semantics: the same fixed id is cancelled before scheduling.
    expect(cancelMock).toHaveBeenCalledWith({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });
  });

  it('is a no-op on web', async () => {
    h.native = false;
    await expect(
      scheduleRestDoneNotification(future(), 'SET READY', 'Rest over')
    ).resolves.toBe(false);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('is a no-op when notification permission is absent (never prompts)', async () => {
    h.display = 'denied';
    await expect(
      scheduleRestDoneNotification(future(), 'SET READY', 'Rest over')
    ).resolves.toBe(false);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('is a no-op for a past end time', async () => {
    await expect(
      scheduleRestDoneNotification(
        new Date(Date.now() - 1000),
        'SET READY',
        'Rest over'
      )
    ).resolves.toBe(false);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('cancel targets only the rest notification id', async () => {
    await cancelRestDoneNotification();
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });
  });

  it('cancel is a no-op on web', async () => {
    h.native = false;
    await cancelRestDoneNotification();
    expect(cancelMock).not.toHaveBeenCalled();
  });
});

// ─── 3. ActiveWorkoutScreen wiring (source pins) ─────────────────────────────

describe('ActiveWorkoutScreen rest-alert wiring', () => {
  const screen = fs.readFileSync(
    path.join(process.cwd(), 'src/components/ActiveWorkoutScreen.tsx'),
    'utf8'
  );

  it('imports the chime from the shared module — the per-call AudioContext bug pattern is gone', () => {
    expect(screen).toContain(
      "import { playRestDoneChime, unlockRestAudio } from '@/lib/rest-chime';"
    );
    expect(screen).not.toContain('new AudioCtx(');
    expect(screen).not.toContain('webkitAudioContext');
  });

  it('scheduleRestAlert reuses the existing set-ready copy keys (EN + HI)', () => {
    expect(screen).toContain("t('toast.titleSetReady')");
    expect(screen).toContain("t('toast.restReady')");
    expect(screen).toContain('void scheduleRestDoneNotification(');
  });

  it('startTimer unlocks audio and schedules the alert (gesture path)', () => {
    const start = screen.indexOf('const startTimer');
    const body = screen.slice(start, screen.indexOf('const togglePauseTimer'));
    expect(body).toContain('unlockRestAudio();');
    expect(body).toContain('scheduleRestAlert(endTime);');
  });

  it('pause, resume, skip and both overlay dismissals cancel/reschedule correctly', () => {
    // Pause branch cancels; resume branch unlocks + reschedules.
    const toggle = screen.slice(screen.indexOf('const togglePauseTimer'));
    const toggleBody = toggle.slice(0, toggle.indexOf('const adjustTimer'));
    expect(toggleBody).toContain('cancelRestAlert();');
    expect(toggleBody).toContain('unlockRestAudio();');
    expect(toggleBody).toContain('scheduleRestAlert(endTime);');
    // Skip cancels.
    const skip = screen.slice(screen.indexOf('const skipTimer'));
    expect(skip.slice(0, skip.indexOf('};'))).toContain('cancelRestAlert();');
    // Both dismiss-to-pause paths cancel.
    expect(screen.split('cancelRestAlert();').length - 1).toBeGreaterThanOrEqual(5);
  });

  it('adjust reschedules the alert on the shifted end time while running', () => {
    const adjust = screen.slice(screen.indexOf('const adjustTimer'));
    const body = adjust.slice(0, adjust.indexOf('const skipTimer'));
    expect(body).toContain('scheduleRestAlert(shiftedEnd);');
    expect(body).toContain('restTargetEndTimeRef.current += delta * 1000;');
  });

  it('foreground finish cancels the scheduled alert after the chime + haptic', () => {
    const finish = screen.indexOf("triggerHaptic('rest_done');");
    expect(finish).toBeGreaterThan(-1);
    expect(screen.slice(finish, finish + 200)).toContain('cancelRestAlert();');
  });

  it('both set-complete auto-start paths unlock + schedule', () => {
    expect(screen.split('unlockRestAudio();').length - 1).toBeGreaterThanOrEqual(4);
    expect(
      screen.split('scheduleRestAlert(Date.now() + restDuration * 1000);').length - 1
    ).toBe(2);
  });

  it('unmount cancels any pending rest alert', () => {
    expect(screen).toContain('void cancelRestDoneNotification();');
  });
});
