/**
 * upload-analysis.ts — SEEK-BASED OFFLINE ANALYSIS for uploaded videos.
 *
 * A recorded file is NOT a live stream, so racing it through real-time
 * playback is the wrong shape: on a slow phone the full pose model
 * takes ~700 ms per frame, so a 16 s video playing in real time yields
 * only ~23 detections, and the counter's taint rule + 2-frame confirms
 * turn that sparse sampling into 0 reps — even though the same model
 * reads the same video perfectly frame by frame (proven on the user's
 * own 16.2 s squat clip: 507/617 frames clear, all 3 reps countable).
 *
 * The fix: PAUSE the video and step through it. Seek to a time, await
 * the seeked event, detect that exact frame, repeat. Analysis time is
 * then decoupled from playback speed — a slow phone takes longer, but
 * it still sees every stepped frame, so reps count. The trade-off is
 * stated plainly: analysis takes minutes on a slow phone (see the
 * bound below), which is why progress is shown honestly instead of
 * a spinner. The live camera path is untouched — it still uses the
 * real-time loop, because a live stream cannot be stepped.
 *
 * No DOM, no network in this module except the minimal video
 * interfaces below (structural subsets, so tests can use fakes).
 * Thresholds, gating, and counting live in form-check.ts and are NOT
 * touched here — this module only decides WHICH frames get fed to the
 * counter, in order, with monotonic timestamps.
 */

/** Base sampling step: 10 fps. A squat bottom lasts ~0.5–1 s, so 5–10
 *  samples land in the bottom window — plenty for the counter's
 *  2-frame confirms, and dense enough that the deepest angle is
 *  measured, not stepped over. */
export const UPLOAD_ANALYSIS_STEP_S = 0.1;

/**
 * Cap on stepped frames: bounds total analysis time regardless of
 * video length. Longer videos get a coarser step, never more frames:
 * step = max(0.1 s, duration / 200), so the stepped count is at most
 * 200 for any video. At a slow-phone ~700 ms detect + ~150 ms seek
 * overhead per step, the worst case is ~200 × 0.85 s ≈ 170 s (~2.8
 * min); the user's 16.2 s clip steps 163 times ≈ 139 s (~2.3 min) at
 * that speed, ~29 s on a fast phone (~30 ms/frame). A 10 fps sample
 * is still fine at the coarser steps: even at 0.3 s spacing (a 60 s
 * video), a 0.5 s bottom window yields 1–2 samples, and the 2-frame
 * confirm holds on the descent/ascent shoulders around it — the cap
 * trades a little bottom resolution on very long videos for a bounded
 * wait, and the progress UI says exactly how long is left.
 */
export const UPLOAD_ANALYSIS_MAX_STEPS = 200;

/** Planning figure for seek overhead on a local file (ms). Local seeks
 *  are fast (no network); 150 ms is a conservative planning number,
 *  not a measured guarantee — the progress UI reports real frames. */
export const UPLOAD_SEEK_OVERHEAD_MS = 150;

/** Per-seek timeout: a seek that never settles surfaces a clear error
 *  instead of hanging the analysis forever. */
export const UPLOAD_SEEK_TIMEOUT_MS = 5000;

/** Metadata wait timeout: a file that never reports its duration is
 *  unusable for stepping and surfaces the upload error box. */
export const UPLOAD_METADATA_TIMEOUT_MS = 10000;

/**
 * The times (seconds) to step through for a video of this duration.
 * Starts at 0, advances by the step, and — unless the step grid already
 * covers the end — adds one final sample just before the end (seeking
 * to exactly `duration` is unreliable in browsers, and the tail can
 * hold a rep's top-confirmation). Returns [] for a missing/invalid
 * duration. Always strictly increasing, at most MAX_STEPS entries.
 */
export function computeUploadStepTimes(durationSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const step = Math.max(
    UPLOAD_ANALYSIS_STEP_S,
    durationSec / UPLOAD_ANALYSIS_MAX_STEPS
  );
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  // Arithmetic count, NOT float accumulation: stepping t += step
  // drifts (0.1 × 162 lands on 16.2000…), which pushed a rounded
  // endpoint equal to the duration (an unreliable seek target) and
  // broke the MAX_STEPS cap (201 steps for a 60 s video). i × step
  // with i < ceil(duration / step) stays strictly below duration.
  const count = Math.min(
    Math.ceil(durationSec / step),
    UPLOAD_ANALYSIS_MAX_STEPS
  );
  const times: number[] = [];
  for (let i = 0; i < count; i++) times.push(round2(i * step));
  const last = times[times.length - 1];
  if (
    times.length < UPLOAD_ANALYSIS_MAX_STEPS &&
    (times.length === 0 || last < durationSec - step / 2)
  ) {
    const tail = Math.max(0, durationSec - 0.02);
    if (times.length === 0 || tail - last > 0.01) times.push(round2(tail));
  }
  return times;
}

/**
 * Planning estimate (seconds) for stepping `stepCount` frames at this
 * average detect time. Used by tests to pin the time bound, and by
 * the report — the UI reports real progress, never this estimate.
 */
export function estimateUploadAnalysisSeconds(
  stepCount: number,
  avgDetectMs: number,
  seekOverheadMs: number = UPLOAD_SEEK_OVERHEAD_MS
): number {
  return (stepCount * (avgDetectMs + seekOverheadMs)) / 1000;
}

/**
 * Monotonic timestamp for a stepped detection. MediaPipe VIDEO mode
 * requires strictly increasing timestamps per landmarker instance,
 * and the landmarker is cached across runs — so a second run's
 * video-time clock (0, 100, 200…) would go BACKWARDS against the
 * first run's last timestamp. max() with last+1 keeps it monotonic
 * forever. The counter only ever uses timestamp DIFFERENCES (rep
 * durations, set duration), so the base offset cancels exactly.
 */
export function nextAnalysisTimestamp(
  baseMs: number,
  videoTimeMs: number,
  lastTimestampMs: number
): number {
  return Math.max(baseMs + videoTimeMs, lastTimestampMs + 1);
}

/** Minimal video surface the stepping helpers need (real video
 *  elements satisfy it; tests use fakes). */
export interface SeekableVideo {
  currentTime: number;
  addEventListener(type: 'seeked' | 'error', listener: () => void): void;
  removeEventListener(type: 'seeked' | 'error', listener: () => void): void;
}

export interface MetadataVideo extends SeekableVideo {
  readonly readyState: number;
  addEventListener(
    type: 'seeked' | 'error' | 'loadedmetadata',
    listener: () => void
  ): void;
  removeEventListener(
    type: 'seeked' | 'error' | 'loadedmetadata',
    listener: () => void
  ): void;
}

/**
 * Seek to `targetSec` and resolve when the frame is shown. Resolves
 * immediately when already there (the first step, or a duplicate
 * time) — no 'seeked' event will fire then, and none is needed.
 * Rejects on timeout or video error, so a stuck seek surfaces an
 * error instead of hanging the analysis. Listeners are removed on
 * every settle path (no listener leak across hundreds of steps).
 */
export function seekVideoTo(
  video: SeekableVideo,
  targetSec: number,
  timeoutMs: number = UPLOAD_SEEK_TIMEOUT_MS
): Promise<void> {
  if (Math.abs(video.currentTime - targetSec) < 0.01) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('video error during seek'));
    };
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`seek to ${targetSec}s timed out`));
    }, timeoutMs);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = targetSec;
  });
}

/**
 * Resolve when the video reports its metadata (duration available).
 * Resolves immediately if metadata is already loaded. Rejects on
 * timeout or video error — a file that never reports metadata cannot
 * be stepped and surfaces the upload error box.
 */
export function waitForMetadata(
  video: MetadataVideo,
  timeoutMs: number = UPLOAD_METADATA_TIMEOUT_MS
): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    const onLoaded = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('video error while loading metadata'));
    };
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('video metadata timed out'));
    }, timeoutMs);
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
  });
}
