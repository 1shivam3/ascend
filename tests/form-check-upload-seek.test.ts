import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  RepCounter,
  runSet,
  type FormFrame,
  type LiftId,
  type PoseLandmark,
  type SetSummary,
} from '@/lib/form-check';
import {
  UPLOAD_ANALYSIS_MAX_STEPS,
  UPLOAD_ANALYSIS_STEP_S,
  computeUploadStepTimes,
  estimateUploadAnalysisSeconds,
  nextAnalysisTimestamp,
  seekVideoTo,
  waitForMetadata,
  type MetadataVideo,
  type SeekableVideo,
} from '@/lib/upload-analysis';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';
import { translate } from '@/lib/i18n';

/**
 * Seek-based offline analysis for video uploads: a recorded file is
 * NOT a live stream, so the section pauses it and steps through it
 * (seek → detect → repeat) instead of racing real-time playback.
 * On a slow phone real-time playback samples ~1.5 fps and the
 * counter's taint rule + 2-frame confirms turn that into 0 reps,
 * even when the model reads every frame perfectly (proven on the
 * user's own 16.2 s squat clip). Stepping decouples analysis from
 * playback speed: slower phones take longer, but still see every
 * stepped frame, so reps count.
 *
 * Pure helpers are tested directly; section wiring is pinned with
 * the static harness (the section needs video + landmarker); the
 * counter behavior on stepped sequences is pinned with pure counter
 * tests (there is no second counting implementation).
 *
 * Conventions mirror tests/form-check-upload.test.ts: left side
 * exact, right side = left x + 0.02 (a side view), visibility 1
 * unless overridden.
 */

const LM_IDX = {
  shoulder: 11,
  elbow: 13,
  wrist: 15,
  hip: 23,
  knee: 25,
  ankle: 27,
} as const;

type Joints = {
  shoulder: [number, number];
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
  elbow: [number, number];
  wrist: [number, number];
};

function landmarks(j: Joints, vis = 1, rightDx = 0.02): PoseLandmark[] {
  const out: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));
  (Object.keys(j) as (keyof Joints)[]).forEach((key) => {
    const [x, y] = j[key];
    const left = LM_IDX[key];
    out[left] = { x, y, visibility: vis };
    out[left + 1] = { x: x + rightDx, y, visibility: vis };
  });
  return out;
}

function lerpJoints(a: Joints, b: Joints, f: number): Joints {
  const out = {} as Joints;
  (Object.keys(a) as (keyof Joints)[]).forEach((key) => {
    out[key] = [
      a[key][0] + (b[key][0] - a[key][0]) * f,
      a[key][1] + (b[key][1] - a[key][1]) * f,
    ];
  });
  return out;
}

/** Squat: knee 180 standing / ~95 deep. */
const SQUAT_TOP: Joints = {
  shoulder: [0.5, 0.2], hip: [0.5, 0.5], knee: [0.5, 0.8], ankle: [0.5, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
const SQUAT_DEEP: Joints = {
  shoulder: [0.45, 0.2], hip: [0.4, 0.5], knee: [0.6, 0.8], ankle: [0.35, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};

/**
 * One squat rep at 100 ms stepped spacing, mirroring a real rep's
 * phase structure: top hold, 8-frame descent, 6-frame bottom hold,
 * 8-frame ascent, top hold. Three reps back to back share the top
 * holds between them (the phase machine re-arms at the top).
 */
function steppedSquatSet(reps: number): FormFrame[] {
  const frames: FormFrame[] = [];
  let t = 0;
  const push = (j: Joints): void => {
    frames.push({ landmarks: landmarks(j), timestampMs: t });
    t += 100;
  };
  for (let i = 0; i < 5; i++) push(SQUAT_TOP);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < 8; i++) push(lerpJoints(SQUAT_TOP, SQUAT_DEEP, (i + 1) / 8));
    for (let i = 0; i < 6; i++) push(SQUAT_DEEP);
    for (let i = 0; i < 8; i++) push(lerpJoints(SQUAT_DEEP, SQUAT_TOP, (i + 1) / 8));
    for (let i = 0; i < 5; i++) push(SQUAT_TOP);
  }
  return frames;
}

/** Minimal fake video for the seek/metadata helpers. */
class FakeVideo {
  currentTime = 0;
  readyState = 0;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
  }

  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  fire(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
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

describe('computeUploadStepTimes', () => {
  it('steps a 16.2 s video at 100 ms with a tail sample', () => {
    const times = computeUploadStepTimes(16.2);
    expect(times.length).toBe(163);
    expect(times[0]).toBe(0);
    for (let i = 1; i < 162; i++) {
      expect(times[i] - times[i - 1]).toBeCloseTo(UPLOAD_ANALYSIS_STEP_S, 2);
    }
    expect(times[161]).toBeCloseTo(16.1, 2);
    expect(times[162]).toBeCloseTo(16.18, 2);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it('caps long videos at MAX_STEPS by coarsening the step', () => {
    const times = computeUploadStepTimes(60);
    expect(times.length).toBeLessThanOrEqual(UPLOAD_ANALYSIS_MAX_STEPS);
    expect(times.length).toBe(200);
    expect(times[1] - times[0]).toBeCloseTo(0.3, 2);
    expect(times[times.length - 1]).toBeCloseTo(59.7, 2);
  });

  it('handles short and invalid durations', () => {
    expect(computeUploadStepTimes(5).length).toBe(51);
    expect(computeUploadStepTimes(0)).toEqual([]);
    expect(computeUploadStepTimes(-3)).toEqual([]);
    expect(computeUploadStepTimes(NaN)).toEqual([]);
    expect(computeUploadStepTimes(Infinity)).toEqual([]);
  });
});

describe('estimateUploadAnalysisSeconds (time bound)', () => {
  it('bounds the worst case and sizes the 16.2 s clip', () => {
    // Worst case: 200 steps on a slow phone (~700 ms detect).
    expect(estimateUploadAnalysisSeconds(200, 700)).toBeCloseTo(170, 0);
    // The user's clip: 163 steps at slow-phone speed ≈ 2.3 min.
    expect(estimateUploadAnalysisSeconds(163, 700)).toBeCloseTo(138.6, 0);
    // Same clip on a fast phone (~30 ms/frame) ≈ half a minute.
    expect(estimateUploadAnalysisSeconds(163, 30)).toBeCloseTo(29.3, 0);
  });
});

describe('nextAnalysisTimestamp', () => {
  it('follows video time within a run and never goes backwards across runs', () => {
    expect(nextAnalysisTimestamp(100000, 0, 0)).toBe(100000);
    expect(nextAnalysisTimestamp(100000, 100, 100000)).toBe(100100);
    expect(nextAnalysisTimestamp(100000, 200, 100100)).toBe(100200);
    // Second run with an earlier base: still strictly increasing.
    expect(nextAnalysisTimestamp(50000, 0, 100200)).toBe(100201);
    expect(nextAnalysisTimestamp(50000, 100, 100201)).toBe(100202);
  });
});

describe('seekVideoTo', () => {
  it('resolves immediately when already at the target', async () => {
    const video = new FakeVideo();
    video.currentTime = 0.5;
    await seekVideoTo(video as unknown as SeekableVideo, 0.5);
    expect(video.listenerCount('seeked')).toBe(0);
    expect(video.listenerCount('error')).toBe(0);
  });

  it('sets currentTime and resolves on seeked, removing listeners', async () => {
    const video = new FakeVideo();
    const p = seekVideoTo(video as unknown as SeekableVideo, 2.0);
    expect(video.currentTime).toBe(2.0);
    video.fire('seeked');
    await p;
    expect(video.listenerCount('seeked')).toBe(0);
    expect(video.listenerCount('error')).toBe(0);
  });

  it('rejects on timeout and on video error, removing listeners', async () => {
    const timeoutVideo = new FakeVideo();
    await expect(
      seekVideoTo(timeoutVideo as unknown as SeekableVideo, 1.0, 10)
    ).rejects.toThrow(/timed out/);
    expect(timeoutVideo.listenerCount('seeked')).toBe(0);
    expect(timeoutVideo.listenerCount('error')).toBe(0);

    const errorVideo = new FakeVideo();
    const p = seekVideoTo(errorVideo as unknown as SeekableVideo, 1.0);
    errorVideo.fire('error');
    await expect(p).rejects.toThrow(/video error/);
    expect(errorVideo.listenerCount('seeked')).toBe(0);
    expect(errorVideo.listenerCount('error')).toBe(0);
  });
});

describe('waitForMetadata', () => {
  it('resolves immediately when metadata is already loaded', async () => {
    const video = new FakeVideo();
    video.readyState = 1;
    await waitForMetadata(video as unknown as MetadataVideo);
  });

  it('resolves on loadedmetadata and rejects on timeout', async () => {
    const video = new FakeVideo();
    const p = waitForMetadata(video as unknown as MetadataVideo, 1000);
    video.fire('loadedmetadata');
    await p;

    const stuck = new FakeVideo();
    await expect(
      waitForMetadata(stuck as unknown as MetadataVideo, 10)
    ).rejects.toThrow(/timed out/);
  });
});

describe('stepped counter behavior (the fix, at the counter level)', () => {
  it('counts all 3 squats from a 100 ms stepped sequence', () => {
    const { counter, summary } = runSet('squat', steppedSquatSet(3));
    expect(counter.repCount).toBe(3);
    expect(summary.repCount).toBe(3);
    expect(summary.depthGoodCount).toBe(3);
    expect(summary.depthConsistencyPct).toBe(100);
  });

  it('sparse ~700 ms sampling of the same reps undercounts (the old failure mode)', () => {
    const dense = steppedSquatSet(3);
    const sparse = dense.filter((_, i) => i % 7 === 0);
    const { summary } = runSet('squat', sparse);
    expect(summary.repCount).toBeLessThan(3);
  });
});

describe('SetSummary carries detection instrumentation', () => {
  it('accepts framesProcessed / avgDetectMs attached by the section', () => {
    const c = new RepCounter('squat' as LiftId);
    const base = c.endSet('completed', 10000);
    const withStats: SetSummary = {
      ...base,
      framesProcessed: 163,
      avgDetectMs: 42,
    };
    expect(withStats.framesProcessed).toBe(163);
    expect(withStats.avgDetectMs).toBe(42);
  });
});

describe('seek i18n parity (en + hi, real copy)', () => {
  const keys = [
    'formcheck.analyzingVideo',
    'formcheck.cancelAnalysis',
    'formcheck.errSeekTitle',
    'formcheck.errSeekMessage',
    'formcheck.errSeekTry',
    'formcheck.debugFrames',
    'formcheck.debugAvgDetect',
    'formcheck.summaryAnalysis',
  ] as const;
  const devanagari = /[\u0900-\u097F]/;
  for (const key of keys) {
    it(`${key} exists in en and hi with real, differing copy`, () => {
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(hi[key], `hi missing ${key}`).toBeTruthy();
      expect(translate('hi', key), `hi ${key} fell back to raw key`).not.toBe(key);
      expect(translate('hi', key), `hi ${key} has no Devanagari`).toMatch(devanagari);
      expect(translate('hi', key), `hi ${key} identical to en`).not.toBe(
        translate('en', key)
      );
    });
  }
});

describe('seek section contract (static-rendering harness)', () => {
  it('upload analysis shows honest progress and a cancel button', () => {
    expect(SECTION).toContain('formcheck.analyzingVideo');
    expect(SECTION).toContain('analysisProgress');
    expect(SECTION).toContain('formcheck.cancelAnalysis');
    expect(SECTION).toContain('cancelAnalysis()');
  });

  it('cancellation invalidates the in-flight loop and returns to idle', () => {
    const cancel = region(SECTION, 'const cancelAnalysis', 'const switchCamera');
    expect(cancel).toContain('analysisTokenRef.current += 1');
    expect(cancel).toContain('revokeUpload()');
    expect(cancel).toContain("setPhase('idle')");
    // The stepping loop checks the token every step and exits clean.
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('token !== analysisTokenRef.current');
  });

  it('per-seek timeout surfaces a dedicated error, never a hang', () => {
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('seekVideoTo');
    expect(analysis).toContain('formcheck.errSeekTitle');
    expect(analysis).toContain('formcheck.errSeekMessage');
    expect(analysis).toContain('formcheck.errSeekTry');
  });

  it('instrumentation reaches the debug readout and the summary', () => {
    expect(SECTION).toContain('formcheck.debugFrames');
    expect(SECTION).toContain('formcheck.debugAvgDetect');
    expect(SECTION).toContain('formcheck.summaryAnalysis');
    const endSet = region(SECTION, 'const endSet', 'const analyzeUpload');
    expect(endSet).toContain('framesProcessed');
    expect(endSet).toContain('avgDetectMs');
    expect(endSet).toContain('detectStatsRef');
  });

  it('live camera path is untouched: still the rAF loop', () => {
    const camera = region(SECTION, 'const start = ', 'const startUpload');
    expect(camera).toContain('requestAnimationFrame(loop)');
    expect(camera).toContain('getUserMedia');
  });
});
