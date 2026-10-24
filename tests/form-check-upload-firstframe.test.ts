import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  computeUploadStepTimes,
  seekVideoTo,
  type SeekableVideo,
} from '@/lib/upload-analysis';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';
import { translate } from '@/lib/i18n';

/**
 * First-frame stall hardening for seek-based upload analysis.
 *
 * The user's screenshot showed the new build frozen at "Analyzing
 * video… 0 of 163 frames (0%)" with no error box. Audit result:
 * the seek path cannot hang that way (already-at-target resolves
 * immediately, every real seek has a 5 s timeout that surfaces a
 * seek error), but the DETECTION path can: the tasks-vision
 * detectForVideo API is synchronous, so the first detection —
 * which pays the delegate/shader-init cost and can block the main
 * thread for seconds on a slow phone — freezes the screen at 0%
 * with no error and no progress update, indistinguishable from a
 * hang. A Promise.race "detection timeout" would be theater here:
 * no timer can fire while the main thread is blocked inside a
 * synchronous call. So the hardening is, instead: (1) the
 * loading-phase warm-up pays the first-inference cost before
 * analysis starts, (2) the UI names the frame in flight, (3) a
 * paint yield guarantees "Working on frame 1" renders before the
 * first detection, and (4) a compositor pulse proves the page is
 * alive even while JS is blocked.
 *
 * Pure helpers are tested directly; section wiring is pinned with
 * the static harness (same convention as
 * tests/form-check-upload-seek.test.ts).
 */

class FakeVideo {
  currentTime = 0;
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const SECTION = readFileSync(
  join(process.cwd(), 'src/components/FormCheckSection.tsx'),
  'utf8'
);

function region(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  expect(start, `anchor not found: ${from}`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(to, start + from.length);
  expect(end, `anchor not found: ${to}`).toBeGreaterThan(0);
  return src.slice(start, end);
}

describe('first step cannot hang on a seeked event', () => {
  it('the first step time is 0 for the user clip (16.2 s → 163 steps)', () => {
    const times = computeUploadStepTimes(16.2);
    expect(times.length).toBe(163);
    expect(times[0]).toBe(0);
  });

  it('seeking to the already-current time resolves immediately, no listeners', async () => {
    const video = new FakeVideo();
    video.currentTime = 0;
    await seekVideoTo(video as unknown as SeekableVideo, 0);
    expect(video.listenerCount('seeked')).toBe(0);
    expect(video.listenerCount('error')).toBe(0);
  });

  it('seeking within epsilon of the current time also resolves immediately', async () => {
    const video = new FakeVideo();
    video.currentTime = 0.005;
    await seekVideoTo(video as unknown as SeekableVideo, 0);
    expect(video.listenerCount('seeked')).toBe(0);
    expect(video.listenerCount('error')).toBe(0);
  });
});

describe('first-frame i18n parity (en + hi, real copy)', () => {
  it('formcheck.analyzingFrame exists in en and hi with real, differing copy', () => {
    const key = 'formcheck.analyzingFrame';
    const devanagari = /[\u0900-\u097F]/;
    expect(en[key], `en missing ${key}`).toBeTruthy();
    expect(hi[key], `hi missing ${key}`).toBeTruthy();
    expect(translate('hi', key), `hi ${key} fell back to raw key`).not.toBe(key);
    expect(translate('hi', key), `hi ${key} has no Devanagari`).toMatch(devanagari);
    expect(translate('hi', key), `hi ${key} identical to en`).not.toBe(
      translate('en', key)
    );
  });
});

describe('first-frame section contract (static-rendering harness)', () => {
  it('analysis progress names the frame in flight, not just finished frames', () => {
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('current: 1');
    expect(analysis).toContain('current: i + 1');
  });

  it('progress UI renders the in-flight frame line and a compositor pulse', () => {
    const progress = region(
      SECTION,
      'formcheck.analyzingVideo',
      'formcheck.reps'
    );
    expect(progress).toContain('formcheck.analyzingFrame');
    // CSS animation: the compositor keeps it animating even while
    // JS is blocked inside a synchronous detection.
    expect(progress).toContain('animate-pulse');
  });

  it('the first detection is preceded by a yield to paint', () => {
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('requestAnimationFrame');
    expect(analysis).toContain('i === 0');
  });

  it('startUpload warms up the landmarker during loading, never feeding the counter', () => {
    const upload = region(SECTION, 'const startUpload', 'const cancelAnalysis');
    expect(upload).toContain('detectForVideo');
    expect(upload).toContain('Warm-up is best-effort only.');
    expect(upload).toContain('readyState >= 2');
    expect(upload).not.toContain('handleCounterFrame');
  });

  it('a throwing detection is skipped and eventually surfaces a tracking error, never a hang', () => {
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('detectErrorStreakRef.current += 1');
    expect(analysis).toContain('formcheck.errTrackingTitle');
  });

  it('existing seek-timeout and cancellation behavior is intact', () => {
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('seekVideoTo');
    expect(analysis).toContain('formcheck.errSeekTitle');
    const cancel = region(SECTION, 'const cancelAnalysis', 'const switchCamera');
    expect(cancel).toContain('analysisTokenRef.current += 1');
    expect(cancel).toContain("setPhase('idle')");
  });

  it('live camera path is untouched by the warm-up (no warm-up detect in camera start)', () => {
    const camera = region(SECTION, 'const start = ', 'const analyzeUpload');
    expect(camera).not.toContain('Warm-up is best-effort only.');
  });
});
