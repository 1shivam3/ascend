/**
 * pose-engine-load.test.ts — the live form-check load path must never
 * hang silently. Regression tests for the "camera works, shows
 * nothing" symptom: a never-settling load used to leave the UI on
 * "loading" forever (video only, no reps/angle/cues, no error).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadPoseLandmarker,
  PoseEngineError,
  type PoseLandmarkerLike,
} from '../src/lib/pose-engine';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

afterEach(() => {
  vi.useRealTimers();
});

const fakeLandmarker: PoseLandmarkerLike = {
  detectForVideo: () => ({}),
  close: () => {},
};

function fakeModuleWith(
  createFromOptions: (
    vision: unknown,
    options: Record<string, unknown>
  ) => Promise<PoseLandmarkerLike>
) {
  return {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    PoseLandmarker: { createFromOptions },
  };
}

describe('loadPoseLandmarker timeout', () => {
  it('turns a never-settling load into the visible engine-unavailable error', async () => {
    vi.useFakeTimers();
    let caught: unknown;
    const done = loadPoseLandmarker({
      importVision: () => new Promise<never>(() => {}),
    }).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(45000);
    await done;
    expect(caught).toBeInstanceOf(PoseEngineError);
    expect((caught as PoseEngineError).kind).toBe('engine-unavailable');
  });

  it('turns a slow-but-finite load into the same error once the timeout passes', async () => {
    vi.useFakeTimers();
    const mod = fakeModuleWith(async () => fakeLandmarker);
    let caught: unknown;
    const done = loadPoseLandmarker({
      importVision: () =>
        new Promise((resolve) => {
          // Resolves only after the 45s timeout — too late by design.
          // (Resolves with a valid module so the orphaned inner load
          // fulfills rather than rejecting unobserved.)
          setTimeout(() => resolve(mod), 60000);
        }),
    }).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(45000);
    await done;
    expect(caught).toBeInstanceOf(PoseEngineError);
    expect((caught as PoseEngineError).kind).toBe('engine-unavailable');
  });
});

describe('loadPoseLandmarker model asset', () => {
  it('requests the full model, never lite, on the same pinned hosts', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const mod = fakeModuleWith(async (_vision, options) => {
      seen.push(options.baseOptions as Record<string, unknown>);
      return fakeLandmarker;
    });
    await loadPoseLandmarker({ importVision: async () => mod });
    expect(seen).toHaveLength(1);
    const asset = seen[0].modelAssetPath as string;
    expect(asset).toContain('pose_landmarker_full');
    expect(asset).not.toContain('lite');
    expect(asset).toBe(
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
    );
  });

  it('applies the GPU→CPU delegate fallback to the full model too', async () => {
    const assets: string[] = [];
    const delegates: string[] = [];
    const mod = fakeModuleWith(async (_vision, options) => {
      const base = options.baseOptions as {
        delegate?: string;
        modelAssetPath?: string;
      };
      delegates.push(base.delegate ?? '');
      assets.push(base.modelAssetPath ?? '');
      if (base.delegate === 'GPU') throw new Error('GPU delegate unavailable');
      return fakeLandmarker;
    });
    const result = await loadPoseLandmarker({ importVision: async () => mod });
    expect(result).toBe(fakeLandmarker);
    expect(delegates).toEqual(['GPU', 'CPU']);
    expect(assets).toEqual([
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    ]);
  });
});

describe('loadPoseLandmarker delegate fallback', () => {
  it('succeeds on GPU first try without a CPU call', async () => {
    const calls: string[] = [];
    const mod = fakeModuleWith(async (_vision, options) => {
      calls.push(
        (options.baseOptions as { delegate?: string }).delegate ?? ''
      );
      return fakeLandmarker;
    });
    const result = await loadPoseLandmarker({
      importVision: async () => mod,
    });
    expect(result).toBe(fakeLandmarker);
    expect(calls).toEqual(['GPU']);
  });

  it('retries once with CPU when the GPU delegate fails', async () => {
    const calls: string[] = [];
    const mod = fakeModuleWith(async (_vision, options) => {
      const delegate =
        (options.baseOptions as { delegate?: string }).delegate ?? '';
      calls.push(delegate);
      if (delegate === 'GPU') throw new Error('GPU delegate unavailable');
      return fakeLandmarker;
    });
    const result = await loadPoseLandmarker({
      importVision: async () => mod,
    });
    expect(result).toBe(fakeLandmarker);
    expect(calls).toEqual(['GPU', 'CPU']);
  });

  it('surfaces model-download-failed when CPU also fails', async () => {
    const mod = fakeModuleWith(async () => {
      throw new Error('no delegate works');
    });
    let caught: unknown;
    await loadPoseLandmarker({ importVision: async () => mod }).catch(
      (e) => {
        caught = e;
      }
    );
    expect(caught).toBeInstanceOf(PoseEngineError);
    expect((caught as PoseEngineError).kind).toBe('model-download-failed');
  });

  it('surfaces engine-unavailable when the CDN import itself fails', async () => {
    let caught: unknown;
    await loadPoseLandmarker({
      importVision: async () => {
        throw new Error('network down');
      },
    }).catch((e) => {
      caught = e;
    });
    expect(caught).toBeInstanceOf(PoseEngineError);
    expect((caught as PoseEngineError).kind).toBe('engine-unavailable');
  });
});

describe('formcheck loading copy', () => {
  it('sets the first-load expectation honestly in English and Hindi', () => {
    expect(en['formcheck.loading']).toContain('few seconds');
    expect(en['formcheck.loading']).toContain('MB');
    expect(hi['formcheck.loading']).toContain('कुछ सेकंड');
    expect(hi['formcheck.loading']).toContain('MB');
  });
});
