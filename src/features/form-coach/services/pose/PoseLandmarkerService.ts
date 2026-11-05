/**
 * ASCEND Form Coach — Pose Landmarker Service
 *
 * Orchestrates worker-based inference with automatic fallback to direct processing,
 * GPU-to-CPU delegate failover, strict single-frame-in-flight queueing,
 * idempotent initialization guards, self-healing graph recovery,
 * monotonic timestamp enforcement, and frame-rate throttling (~12-15 FPS).
 */

import { FilesetResolver, PoseLandmarker, PoseLandmarkerOptions } from '@mediapipe/tasks-vision';
import { NormalizedLandmark } from '../../models/pose.types';

export interface PoseInferenceResult {
  landmarks: NormalizedLandmark[] | null;
  worldLandmarks: NormalizedLandmark[] | null;
  /**
   * Every detected person this frame (pose order as MediaPipe returns
   * them). `landmarks` stays the compatibility alias of poses[0]; callers
   * that need the actual lifter among multiple people (a spotter standing
   * closer to the camera, a gym-mate walking by) must run these candidates
   * through subject selection (deep-audit commit 2) instead of trusting
   * pose [0].
   */
  poses: NormalizedLandmark[][] | null;
  timestampMs: number;
}

export type PoseServiceStatus =
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'error';

export interface PoseServiceConfig {
  wasmPath?: string;
  modelPath?: string;
  targetFps?: number; // e.g. 12 to 15 FPS
  useWorker?: boolean;
}

export class PoseLandmarkerService {
  private status: PoseServiceStatus = 'uninitialized';
  private errorMessage: string | null = null;

  private directLandmarker: PoseLandmarker | null = null;
  private directVision: any = null;
  private directOptions: PoseLandmarkerOptions | null = null;

  private worker: Worker | null = null;
  private isWorkerActive = false;

  private initPromise: Promise<void> | null = null;
  private currentFrameCallback: ((result: PoseInferenceResult) => void) | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private isInferenceInFlight = false;
  private lastInferenceTimeMs = 0;
  private lastSentTimestamp = 0;
  private minIntervalMs = 75; // ~13.3 FPS

  private config: Required<PoseServiceConfig>;

  constructor(config: PoseServiceConfig = {}) {
    this.config = {
      wasmPath: config.wasmPath ?? '/mediapipe/wasm',
      modelPath: config.modelPath ?? '/mediapipe/models/pose_landmarker_full.task',
      targetFps: config.targetFps ?? 14,
      useWorker: config.useWorker ?? true,
    };
    this.minIntervalMs = Math.round(1000 / this.config.targetFps);
  }

  getStatus(): PoseServiceStatus {
    return this.status;
  }

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  isUsingWorker(): boolean {
    return this.isWorkerActive;
  }

  /**
   * Initializes the pose detection engine idempotently.
   * Attempts Web Worker first; falls back to direct main-thread inference if Worker fails.
   */
  async initialize(): Promise<void> {
    if (this.status === 'ready') return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.status = 'loading';
      this.errorMessage = null;

      if (typeof window === 'undefined') {
        this.status = 'error';
        this.errorMessage = 'Window is not defined (SSR context).';
        return;
      }

      // Resolve absolute URLs to eliminate relative path ambiguity in workers
      const resolvedWasmPath = new URL(this.config.wasmPath, window.location.origin).href;
      const resolvedModelPath = new URL(this.config.modelPath, window.location.origin).href;

      // 1. Try Worker-based inference first
      if (this.config.useWorker && typeof Worker !== 'undefined') {
        try {
          const workerReady = await this.initWorker(resolvedWasmPath, resolvedModelPath);
          if (workerReady) {
            this.isWorkerActive = true;
            this.status = 'ready';
            this.lastSentTimestamp = 0;
            return;
          }
        } catch (workerErr: any) {
          console.warn('[FormCoach] Web Worker init failed, falling back to direct inference:', workerErr?.message || workerErr);
        }
      }

      // 2. Direct main-thread inference fallback
      try {
        this.directVision = await FilesetResolver.forVisionTasks(resolvedWasmPath);

        const optionsGPU: PoseLandmarkerOptions = {
          baseOptions: {
            modelAssetPath: resolvedModelPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 2, // deep audit: detect up to 2 people so subject selection can reject a spotter standing closer to camera (was 1)
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };

        const optionsCPU: PoseLandmarkerOptions = {
          baseOptions: {
            modelAssetPath: resolvedModelPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 2, // deep audit: detect up to 2 people so subject selection can reject a spotter standing closer to camera (was 1)
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };

        // Attempt GPU delegate first, fallback to CPU delegate if WebGL fails
        try {
          this.directLandmarker = await PoseLandmarker.createFromOptions(this.directVision, optionsGPU);
          this.directOptions = optionsGPU;
        } catch (gpuErr: any) {
          console.warn('[FormCoach] Direct GPU delegate failed, falling back to CPU:', gpuErr?.message || gpuErr);
          this.directLandmarker = await PoseLandmarker.createFromOptions(this.directVision, optionsCPU);
          this.directOptions = optionsCPU;
        }

        this.isWorkerActive = false;
        this.status = 'ready';
        this.lastSentTimestamp = 0;
      } catch (directErr: any) {
        this.status = 'error';
        this.errorMessage = directErr?.message || 'Failed to initialize MediaPipe Pose Landmarker.';
        throw directErr;
      }
    })();

    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    } finally {
      if ((this.status as PoseServiceStatus) !== 'ready') {
        this.initPromise = null;
      }
    }
  }

  private initWorker(wasmPath: string, modelPath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), {
          type: 'module',
        });

        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Pose worker initialization timed out (15s).'));
        }, 15000);

        worker.onmessage = (event) => {
          const { type, payload, error } = event.data;

          if (type === 'INIT_SUCCESS') {
            clearTimeout(timeout);
            this.worker = worker;
            resolve(true);
          } else if (type === 'INIT_ERROR') {
            clearTimeout(timeout);
            worker.terminate();
            reject(new Error(error || 'Worker initialization failed.'));
          } else if (type === 'FRAME_RESULT') {
            this.isInferenceInFlight = false;
            this.clearWatchdog();
            if (this.currentFrameCallback) {
              this.currentFrameCallback({
                landmarks: payload.landmarks,
                worldLandmarks: payload.worldLandmarks,
                poses:
                  payload.poses ??
                  (payload.landmarks ? [payload.landmarks] : null),
                timestampMs: payload.timestampMs,
              });
            }
          } else if (type === 'PROCESS_ERROR') {
            this.isInferenceInFlight = false;
            this.clearWatchdog();
            console.warn('[FormCoach Worker] Inference error:', error);
          }
        };

        worker.onerror = (err) => {
          this.isInferenceInFlight = false;
          this.clearWatchdog();
          clearTimeout(timeout);
          worker.terminate();
          reject(err);
        };

        worker.postMessage({
          type: 'INIT',
          payload: {
            wasmPath,
            modelPath,
          },
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private startWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      if (this.isInferenceInFlight) {
        console.warn('[FormCoach] Frame inference watchdog timed out (1s); resetting pipeline gate.');
        this.isInferenceInFlight = false;
      }
    }, 1000);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Processes a video frame.
   * Drops the frame if:
   * 1. An inference is currently in flight.
   * 2. The minimum time interval has not elapsed (rate throttling).
   */
  async processVideoFrame(
    videoElement: HTMLVideoElement,
    timestampMs: number,
    onResult: (result: PoseInferenceResult) => void
  ): Promise<boolean> {
    if (this.status !== 'ready') return false;
    const minReadyState = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.HAVE_CURRENT_DATA : 2;
    if (videoElement.readyState < minReadyState) return false;

    // Check throttle and single-frame-in-flight gate
    if (this.isInferenceInFlight) {
      return false; // Drop frame
    }

    const elapsed = timestampMs - this.lastInferenceTimeMs;
    if (elapsed < 0) {
      // Clock source reset or jitter: accept frame and realign throttle baseline
      this.lastInferenceTimeMs = timestampMs;
    } else if (elapsed < this.minIntervalMs) {
      return false; // Throttle frame
    }

    this.isInferenceInFlight = true;
    this.lastInferenceTimeMs = timestampMs;

    // Strictly enforce monotonic positive integer timestamps (>= 1, > lastSentTimestamp)
    const rawTime = Math.round(timestampMs);
    const safeTimestamp = Math.max(this.lastSentTimestamp + 1, rawTime > 0 ? rawTime : 1);
    this.lastSentTimestamp = safeTimestamp;

    // Route to Worker
    if (this.isWorkerActive && this.worker) {
      try {
        if (typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(videoElement);
          this.currentFrameCallback = onResult;
          this.startWatchdog();
          this.worker.postMessage(
            {
              type: 'PROCESS_FRAME',
              payload: {
                imageBitmap: bitmap,
                timestampMs: safeTimestamp,
              },
            },
            [bitmap]
          );
          return true;
        }
      } catch {
        this.isInferenceInFlight = false;
        this.clearWatchdog();
      }
    }

    // Direct inference fallback
    if (this.directLandmarker) {
      try {
        const detection = this.directLandmarker.detectForVideo(videoElement, safeTimestamp);
        this.isInferenceInFlight = false;

        onResult({
          landmarks: (detection.landmarks?.[0] as NormalizedLandmark[]) ?? null,
          worldLandmarks: (detection.worldLandmarks?.[0] as NormalizedLandmark[]) ?? null,
          poses: (detection.landmarks as NormalizedLandmark[][] | undefined) ?? null,
          timestampMs: safeTimestamp,
        });
        return true;
      } catch (err: any) {
        this.isInferenceInFlight = false;
        console.warn('[FormCoach] Direct inference error; re-instantiating graph:', err?.message || err);

        // Re-create direct landmarker to recover from poisoned graph state
        try {
          if (this.directLandmarker) {
            this.directLandmarker.close();
            this.directLandmarker = null;
          }
          if (this.directVision && this.directOptions) {
            this.directLandmarker = await PoseLandmarker.createFromOptions(this.directVision, this.directOptions);
            this.lastSentTimestamp = 0;
          }
        } catch (reinitErr) {
          console.error('[FormCoach] Failed to reinitialize direct landmarker:', reinitErr);
        }

        return false;
      }
    }

    this.isInferenceInFlight = false;
    return false;
  }

  destroy(): void {
    this.clearWatchdog();
    this.initPromise = null;
    this.currentFrameCallback = null;
    this.lastSentTimestamp = 0;

    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'CLEANUP' });
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }

    if (this.directLandmarker) {
      try {
        this.directLandmarker.close();
      } catch {
        // ignore
      }
      this.directLandmarker = null;
    }

    this.directVision = null;
    this.directOptions = null;
    this.status = 'uninitialized';
    this.isInferenceInFlight = false;
    this.isWorkerActive = false;
  }
}
