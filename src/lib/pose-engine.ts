/**
 * pose-engine.ts — MediaPipe PoseLandmarker loader (LIVE FORM CHECK v1).
 *
 * Thin, DOM-free loader around @mediapipe/tasks-vision's PoseLandmarker.
 * It deliberately does NOT import the npm package: `npm install` is
 * blocked in this sandbox (EPERM on the symlinked node_modules), and a
 * literal package import would fail the Next build until the dep is
 * installed. Instead the engine is loaded at runtime from the official
 * MediaPipe CDN pattern (pinned 0.10.10, the version used by Google's
 * own web examples), via a webpackIgnore dynamic import so the
 * bundler leaves it alone. Everything still runs on-device: the WASM
 * runtime + model download to the phone, pose runs locally, and no
 * video or landmark ever leaves the device.
 *
 * If the project later prefers the npm package, replace the CDN import
 * below with `await import('@mediapipe/tasks-vision')` after running
 * `npm install @mediapipe/tasks-vision` — the rest of this module's
 * interface (PoseLandmarkerLike) stays the same.
 *
 * CSP: the production headers in next.config.js must allow this —
 * script-src https://cdn.jsdelivr.net (the ESM import) +
 * 'wasm-unsafe-eval' (WebAssembly compilation), and connect-src
 * https://cdn.jsdelivr.net + https://storage.googleapis.com (WASM
 * binary + model download). Without those, loading fails and the UI
 * shows the engine-unavailable state instead of crashing.
 *
 * Model choice: pose_landmarker_full (float16) — switched from lite
 * 2026-10-24 after a phone audit proved lite scores the near side
 * below the 0.5 gate on real side-view squats (deep squat, loose
 * clothing, indoor evening light): lite's visibility values were the
 * bottleneck, not the gate. Full is the same API and the same pinned
 * CDN/WASM sources, only a larger, more precise model (~9.4 MB vs
 * lite's ~5.8 MB). The 0.5 visibility gate is UNTOUCHED — full is
 * honesty-neutral; it earns higher visibility values instead of
 * lowering the bar. Cost, stated plainly: a bigger first download
 * and slower per-frame inference + more heat on low-end phones (the
 * section already surfaces a slow note when the 30-frame average
 * detect time exceeds 120 ms).
 */

import type { PoseLandmark } from './form-check';

/** Minimal surface of PoseLandmarker that the UI needs. */
export interface PoseLandmarkerLike {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number
  ): { landmarks?: Array<Array<{ x: number; y: number; z: number; visibility?: number }>> };
  close(): void;
}

export type PoseEngineFailure = 'engine-unavailable' | 'model-download-failed';

export class PoseEngineError extends Error {
  readonly kind: PoseEngineFailure;
  constructor(kind: PoseEngineFailure) {
    super(
      kind === 'engine-unavailable'
        ? 'Pose engine could not be loaded.'
        : 'Pose model download failed.'
    );
    this.kind = kind;
  }
}

const TASKS_VISION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.10';
const WASM_URL = `${TASKS_VISION_CDN}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

/** Shape of the runtime-loaded tasks-vision module (CDN import). */
interface VisionModule {
  FilesetResolver: { forVisionTasks: (wasmUrl: string) => Promise<unknown> };
  PoseLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: Record<string, unknown>
    ) => Promise<PoseLandmarkerLike>;
  };
}

/**
 * Load timeout: the CDN ESM import, the WASM fetch, and the
 * createFromOptions call can each hang forever on some mobile
 * browsers/GPUs without ever rejecting — and a never-settling load
 * left the UI stuck on "loading" (video only, no reps/angle/cues)
 * with no error and no retry. Racing the whole load against this
 * timeout turns that silence into the visible engine-unavailable
 * error state (with retry) instead.
 *
 * Value 45s (raised from 30s with the full-model switch): the model
 * download grew 5.8 MB → 9.4 MB (+62%) while the WASM/ESM portions
 * are unchanged, so the increase is sized to the model delta. On a
 * ~2 Mbps connection 9.4 MB alone takes ~38s — over the old 30s, a
 * false engine-unavailable on a load that would have succeeded.
 * 45s covers ~2 Mbps and up while still bounding a genuine hang to
 * under a minute, far better than the previous never-settling
 * silence.
 */
const LOAD_TIMEOUT_MS = 45000;

export interface PoseEngineLoadOptions {
  /** Test seam: override the CDN import (production uses the real import). */
  importVision?: () => Promise<VisionModule>;
  /** Test seam: load timeout in ms (production: LOAD_TIMEOUT_MS). */
  timeoutMs?: number;
}

async function loadWithFallback(
  importVision: () => Promise<VisionModule>
): Promise<PoseLandmarkerLike> {
  let visionModule: VisionModule;
  try {
    // webpackIgnore: this must stay a runtime browser import. The
    // bundler cannot resolve a CDN URL, and the npm package is not
    // (yet) installed — see the header note.
    visionModule = await importVision();
  } catch {
    throw new PoseEngineError('engine-unavailable');
  }
  let vision: unknown;
  try {
    vision = await visionModule.FilesetResolver.forVisionTasks(WASM_URL);
  } catch {
    throw new PoseEngineError('model-download-failed');
  }
  const optionsFor = (delegate: string) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  try {
    return await visionModule.PoseLandmarker.createFromOptions(
      vision,
      optionsFor('GPU')
    );
  } catch {
    // The GPU delegate can fail on some mobile GPUs; one CPU retry
    // before surfacing the error. (A GPU call that hangs rather than
    // rejects is bounded by the caller's timeout instead.)
    try {
      return await visionModule.PoseLandmarker.createFromOptions(
        vision,
        optionsFor('CPU')
      );
    } catch {
      throw new PoseEngineError('model-download-failed');
    }
  }
}

/**
 * Load and create a PoseLandmarker in VIDEO mode.
 * Throws PoseEngineError — never returns a half-built engine, and
 * never hangs silently: the whole load is bounded by LOAD_TIMEOUT_MS.
 */
export async function loadPoseLandmarker(
  opts?: PoseEngineLoadOptions
): Promise<PoseLandmarkerLike> {
  const importVision =
    opts?.importVision ??
    (() => import(/* webpackIgnore: true */ TASKS_VISION_CDN));
  const timeoutMs = opts?.timeoutMs ?? LOAD_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new PoseEngineError('engine-unavailable')),
      timeoutMs
    );
  });
  try {
    return await Promise.race([loadWithFallback(importVision), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Map a detectForVideo result to the form-check landmark shape. */
export function toPoseLandmarks(
  result: { landmarks?: Array<Array<{ x: number; y: number; z: number; visibility?: number }>> }
): PoseLandmark[] | null {
  const first = result.landmarks?.[0];
  if (!first || first.length === 0) return null;
  return first.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility,
  }));
}

/** A 33-point "nobody in frame" placeholder: every landmark untrusted,
 *  so the form-check gate fails it as unclear instead of guessing. */
export function emptyLandmarks(): PoseLandmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
}
