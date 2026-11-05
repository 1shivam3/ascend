import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PoseLandmarkerService } from '../../src/features/form-coach/services/pose/PoseLandmarkerService';

describe('PoseLandmarkerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default config and uninitialized status', () => {
    const service = new PoseLandmarkerService();
    expect(service.getStatus()).toBe('uninitialized');
    expect(service.getErrorMessage()).toBeNull();
    expect(service.isUsingWorker()).toBe(false);
  });

  it('defaults to the self-hosted FULL pose model, and the asset ships', () => {
    // User decision 2026-11-05: the heavier model. The lite model never
    // detected the lifter behind the plate in the owner's front-view video
    // (WA0013 — spotter only on 115/115 frames), so subject selection had
    // nothing to select. Pin both the resolved path AND the file's
    // presence: a path pin alone would still 404 if the asset went missing.
    const service = new PoseLandmarkerService();
    const modelPath = (service as any).config.modelPath as string;
    expect(modelPath).toBe('/mediapipe/models/pose_landmarker_full.task');
    expect(existsSync(join(process.cwd(), 'public', modelPath))).toBe(true);
  });

  it('rejects in SSR context when window is undefined', async () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;

    const service = new PoseLandmarkerService();
    await service.initialize();

    expect(service.getStatus()).toBe('error');
    expect(service.getErrorMessage()).toContain('Window is not defined');

    global.window = originalWindow;
  });

  it('gates concurrent video frame processing (single frame in flight)', async () => {
    const service = new PoseLandmarkerService();
    (service as any).status = 'ready';

    const mockVideo = {
      readyState: 4, // HAVE_ENOUGH_DATA
      videoWidth: 640,
      videoHeight: 480,
    } as any;

    (service as any).isInferenceInFlight = true;

    const onResult = vi.fn();
    const processed = await service.processVideoFrame(mockVideo, 1000, onResult);

    expect(processed).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('throttles frames that arrive faster than minIntervalMs', async () => {
    const service = new PoseLandmarkerService({ targetFps: 10 }); // 100ms interval
    (service as any).status = 'ready';

    const mockVideo = {
      readyState: 4,
    } as any;

    (service as any).lastInferenceTimeMs = 1000;

    const onResult = vi.fn();
    // 50ms later (less than 100ms min interval)
    const processed = await service.processVideoFrame(mockVideo, 1050, onResult);

    expect(processed).toBe(false);
  });

  it('enforces strictly monotonic positive integer timestamps for inference', async () => {
    const service = new PoseLandmarkerService({ targetFps: 30 });
    (service as any).status = 'ready';

    const mockLandmarker = {
      detectForVideo: vi.fn().mockReturnValue({ landmarks: [], worldLandmarks: [] }),
      close: vi.fn(),
    };
    (service as any).directLandmarker = mockLandmarker;

    const mockVideo = {
      readyState: 4,
    } as any;

    // Call 1 with timestamp 100
    await service.processVideoFrame(mockVideo, 100, vi.fn());
    expect(mockLandmarker.detectForVideo).toHaveBeenCalledWith(mockVideo, 100);

    // Call 2: simulate clock jitter or duplicate timestamp 100 (elapsed time updated)
    (service as any).lastInferenceTimeMs = 0;
    await service.processVideoFrame(mockVideo, 100, vi.fn());
    // Must be incremented to at least 101 to satisfy MediaPipe strict monotonicity
    expect(mockLandmarker.detectForVideo).toHaveBeenCalledWith(mockVideo, 101);

    // Call 3: simulate zero/negative timestamp
    (service as any).lastInferenceTimeMs = -100;
    await service.processVideoFrame(mockVideo, 0, vi.fn());
    expect(mockLandmarker.detectForVideo).toHaveBeenCalledWith(mockVideo, 102);
  });

  it('cleans up worker, direct landmarker, and state on destroy()', () => {
    const service = new PoseLandmarkerService();
    const mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    const mockLandmarker = {
      close: vi.fn(),
    };

    (service as any).worker = mockWorker;
    (service as any).directLandmarker = mockLandmarker;
    (service as any).status = 'ready';
    (service as any).isWorkerActive = true;
    (service as any).isInferenceInFlight = true;

    service.destroy();

    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'CLEANUP' });
    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(mockLandmarker.close).toHaveBeenCalled();
    expect(service.getStatus()).toBe('uninitialized');
    expect((service as any).isInferenceInFlight).toBe(false);
    expect(service.isUsingWorker()).toBe(false);
  });
});
