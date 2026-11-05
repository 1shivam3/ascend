/**
 * ASCEND Form Coach — Dedicated Pose Inference Web Worker
 *
 * Runs MediaPipe Pose Landmarker off the main browser thread to guarantee
 * 60 FPS UI rendering without main-thread jank.
 * Includes automatic GPU-to-CPU delegate fallback and self-healing graph recovery
 * with strict monotonic timestamp enforcement.
 */

import { FilesetResolver, PoseLandmarker, PoseLandmarkerOptions } from '@mediapipe/tasks-vision';

let landmarker: PoseLandmarker | null = null;
let isInitializing = false;
let lastProcessedTimestamp = 0;

let cachedVision: any = null;
let cachedOptions: PoseLandmarkerOptions | null = null;

async function createLandmarkerInstance(vision: any, wasmPath: string, modelPath: string): Promise<PoseLandmarker> {
  const baseOptionsGPU: PoseLandmarkerOptions = {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 2, // deep audit: detect up to 2 people for subject selection (was 1)
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };

  const baseOptionsCPU: PoseLandmarkerOptions = {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numPoses: 2, // deep audit: detect up to 2 people for subject selection (was 1)
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };

  try {
    const instance = await PoseLandmarker.createFromOptions(vision, baseOptionsGPU);
    cachedOptions = baseOptionsGPU;
    return instance;
  } catch (gpuErr: any) {
    console.warn(
      '[pose.worker] GPU delegate failed in worker, falling back to CPU delegate:',
      gpuErr?.message || gpuErr
    );
    const instance = await PoseLandmarker.createFromOptions(vision, baseOptionsCPU);
    cachedOptions = baseOptionsCPU;
    return instance;
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'INIT') {
    if (landmarker) {
      self.postMessage({ type: 'INIT_SUCCESS' });
      return;
    }
    if (isInitializing) return;

    try {
      isInitializing = true;
      const { wasmPath, modelPath } = payload;

      cachedVision = await FilesetResolver.forVisionTasks(wasmPath);
      landmarker = await createLandmarkerInstance(cachedVision, wasmPath, modelPath);
      lastProcessedTimestamp = 0;

      isInitializing = false;
      self.postMessage({ type: 'INIT_SUCCESS' });
    } catch (err: any) {
      isInitializing = false;
      self.postMessage({
        type: 'INIT_ERROR',
        error: err?.message || 'Failed to initialize Pose Landmarker in worker.',
      });
    }
    return;
  }

  if (type === 'PROCESS_FRAME') {
    const { imageBitmap, timestampMs } = payload;
    if (!landmarker) {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }
      self.postMessage({
        type: 'PROCESS_ERROR',
        error: 'PoseLandmarker is not ready in worker.',
      });
      return;
    }

    // Enforce strictly monotonically increasing integer timestamps (> lastProcessedTimestamp)
    const rawTime = Math.round(timestampMs);
    const safeTimestamp = Math.max(lastProcessedTimestamp + 1, rawTime > 0 ? rawTime : 1);
    lastProcessedTimestamp = safeTimestamp;

    try {
      const result = landmarker.detectForVideo(imageBitmap, safeTimestamp);

      // Close the transferred ImageBitmap to free GPU/memory immediately
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }

      const landmarks = result.landmarks?.[0] ?? null;
      const worldLandmarks = result.worldLandmarks?.[0] ?? null;

      self.postMessage({
        type: 'FRAME_RESULT',
        payload: {
          landmarks,
          worldLandmarks,
          // All detected people — the main thread picks the lifter among
          // them (subject selection, deep-audit commit 2).
          poses: result.landmarks ?? null,
          timestampMs: safeTimestamp,
        },
      });
    } catch (err: any) {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }

      console.warn('[pose.worker] detectForVideo failed; recovering calculator graph:', err?.message || err);

      // MediaPipe calculator graphs cannot recover from stream packet errors without recreation.
      // Re-create the landmarker instance so future frames succeed instead of perpetually failing.
      try {
        if (landmarker) {
          landmarker.close();
          landmarker = null;
        }
        if (cachedVision && cachedOptions) {
          landmarker = await PoseLandmarker.createFromOptions(cachedVision, cachedOptions);
          lastProcessedTimestamp = 0;
        }
      } catch (reinitErr: any) {
        console.error('[pose.worker] Failed to recreate landmarker after error:', reinitErr?.message || reinitErr);
      }

      self.postMessage({
        type: 'PROCESS_ERROR',
        error: err?.message || 'Error processing frame in worker.',
      });
    }
    return;
  }

  if (type === 'CLEANUP') {
    if (landmarker) {
      try {
        landmarker.close();
      } catch {
        // ignore
      }
      landmarker = null;
    }
    cachedVision = null;
    cachedOptions = null;
    lastProcessedTimestamp = 0;
    isInitializing = false;
    self.postMessage({ type: 'CLEANUP_SUCCESS' });
  }
};
