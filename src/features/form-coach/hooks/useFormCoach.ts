/**
 * ASCEND Form Coach — Video Form Check Hook
 *
 * Streamlined on-device biomechanical video analysis.
 * User uploads a recorded workout video -> automated frame analysis -> instant form report.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { PoseLandmarkerService } from '../services/pose/PoseLandmarkerService';
import { PoseLandmarksSmoother } from '../services/analysis/LandmarkSmoothing';
import { SquatAnalyzer } from '../analyzers/SquatAnalyzer';
import { ExerciseAnalyzer } from '../analyzers/ExerciseAnalyzer';
import { NormalizedLandmark, DetectedSide } from '../models/pose.types';
import { FormCue, MovementPhase } from '../models/form-feedback.types';
import { FormSessionSummary, FormCoachConfig } from '../models/form-session.types';
import { FormSessionRepository } from '../repositories/FormSessionRepository';

export type FormCoachState = 'select' | 'analyzing' | 'report' | 'error';

export interface UseFormCoachOptions {
  exerciseId?: string;
  workoutId?: string;
  setIndex?: number;
  initialConfig?: Partial<FormCoachConfig>;
  onRepCompleted?: (repCount: number) => void;
}

export function useFormCoach({
  exerciseId = 'squat',
  workoutId,
  setIndex,
  initialConfig,
  onRepCompleted,
}: UseFormCoachOptions = {}) {
  const [state, setState] = useState<FormCoachState>('select');
  const [selectedExerciseId, setSelectedExerciseId] = useState(exerciseId);
  const [progressPercent, setProgressPercent] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [summary, setSummary] = useState<FormSessionSummary | null>(null);

  // Live telemetry during analysis / replay
  const [repCount, setRepCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<MovementPhase>('standing');
  const [activeCue, setActiveCue] = useState<FormCue | null>(null);
  const [currentKneeAngleDeg, setCurrentKneeAngleDeg] = useState<number | null>(null);
  const [minKneeAngleDeg, setMinKneeAngleDeg] = useState<number | null>(null);
  const [torsoInclinationDeg, setTorsoInclinationDeg] = useState<number | null>(null);
  const [detectedSide, setDetectedSide] = useState<DetectedSide>('unknown');
  const [trackingConfidence, setTrackingConfidence] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [readinessReason, setReadinessReason] = useState<string | undefined>();

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseServiceRef = useRef<PoseLandmarkerService>(new PoseLandmarkerService());
  const smootherRef = useRef<PoseLandmarksSmoother>(new PoseLandmarksSmoother());
  const analyzerRef = useRef<ExerciseAnalyzer>(new SquatAnalyzer(initialConfig));

  const animFrameRef = useRef<number | null>(null);
  const uploadedVideoUrlRef = useRef<string | null>(null);
  const latestLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const isAnalyzingRef = useRef<boolean>(false);

  /**
   * Resets the analyzer to select state.
   */
  const reset = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    isAnalyzingRef.current = false;
    if (uploadedVideoUrlRef.current) {
      URL.revokeObjectURL(uploadedVideoUrlRef.current);
      uploadedVideoUrlRef.current = null;
    }
    setVideoUrl(null);
    setVideoFileName(null);
    setProgressPercent(0);
    setRepCount(0);
    setCurrentPhase('standing');
    setActiveCue(null);
    setCurrentKneeAngleDeg(null);
    setMinKneeAngleDeg(null);
    setTorsoInclinationDeg(null);
    setSummary(null);
    setError(null);
    setState('select');
  }, []);

  /**
   * Analyzes an uploaded video file.
   */
  const analyzeVideo = useCallback(
    async (file: File) => {
      setError(null);
      setProgressPercent(0);
      setRepCount(0);
      setActiveCue(null);
      setSummary(null);

      try {
        if (uploadedVideoUrlRef.current) {
          URL.revokeObjectURL(uploadedVideoUrlRef.current);
          uploadedVideoUrlRef.current = null;
        }

        const objectUrl = URL.createObjectURL(file);
        uploadedVideoUrlRef.current = objectUrl;
        setVideoUrl(objectUrl);
        setVideoFileName(file.name);
        setState('analyzing');
        isAnalyzingRef.current = true;

        // Initialize Pose Model in background
        await poseServiceRef.current.initialize();

        const video = videoRef.current;
        if (!video) {
          throw new Error('Video player element not mounted.');
        }

        video.srcObject = null;
        video.src = objectUrl;
        video.playsInline = true;
        video.muted = true;
        video.loop = false;
        video.playbackRate = 1.0;

        // Wait for video metadata
        await new Promise<void>((resolve, reject) => {
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            setVideoDuration(video.duration || 0);
            return resolve();
          }
          video.onloadedmetadata = () => {
            setVideoDuration(video.duration || 0);
            resolve();
          };
          video.onerror = () => {
            reject(new Error('Failed to decode video file. Please check file format.'));
          };
        });

        // Reset analyzers for new set
        analyzerRef.current.reset();
        smootherRef.current.reset();

        // Start video playback for analysis
        video.currentTime = 0;
        await video.play().catch(() => {});
      } catch (err: any) {
        console.error('[VideoFormCheck] Analysis failed to start:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setState('error');
        isAnalyzingRef.current = false;
      }
    },
    []
  );

  /**
   * Cleanly stops animation loops and releases resources.
   */
  const cleanup = useCallback(() => {
    isAnalyzingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (uploadedVideoUrlRef.current) {
      URL.revokeObjectURL(uploadedVideoUrlRef.current);
      uploadedVideoUrlRef.current = null;
    }
    poseServiceRef.current.destroy();
    analyzerRef.current.cleanup();
    latestLandmarksRef.current = null;
  }, []);

  // Frame processing loop
  useEffect(() => {
    let isRunning = true;

    const frameLoop = (timestamp: number) => {
      if (!isRunning) return;

      const video = videoRef.current;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const frameTimeMs = Math.round(timestamp || performance.now());
        const aspectRatio =
          video.videoWidth > 0 && video.videoHeight > 0
            ? video.videoWidth / video.videoHeight
            : 1.0;

        // Process frame if video is actively playing
        if (!video.paused && !video.ended) {
          // Update progress percentage
          if (video.duration > 0) {
            const pct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
            setProgressPercent(pct);
            setVideoCurrentTime(video.currentTime);
          }

          poseServiceRef.current.processVideoFrame(video, frameTimeMs, (inferenceResult) => {
            let landmarks = inferenceResult.landmarks;

            if (landmarks && landmarks.length > 0) {
              landmarks = smootherRef.current.smooth(landmarks, frameTimeMs);
            }

            latestLandmarksRef.current = landmarks;

            // Run movement analysis
            const result = analyzerRef.current.processFrame(landmarks, frameTimeMs, aspectRatio);

            setIsReady(result.readiness.isReady);
            setReadinessReason(result.readiness.reason);
            setDetectedSide(result.detectedSide);
            setTrackingConfidence(result.trackingConfidence);
            setCurrentKneeAngleDeg(result.currentKneeAngleDeg);
            setMinKneeAngleDeg(result.minKneeAngleDeg);
            setTorsoInclinationDeg(result.torsoInclinationDeg);

            if (isAnalyzingRef.current) {
              setCurrentPhase(result.phase);
              if (result.activeCue) {
                setActiveCue(result.activeCue);
              }
              if (result.completedRep) {
                setRepCount((prev) => {
                  const next = prev + 1;
                  onRepCompleted?.(next);
                  return next;
                });
              }
            }
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(frameLoop);
    };

    animFrameRef.current = requestAnimationFrame(frameLoop);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [onRepCompleted]);

  // Video completion listener
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      if (isAnalyzingRef.current) {
        isAnalyzingRef.current = false;
        setProgressPercent(100);

        // Generate and save report
        const sessionSummary = analyzerRef.current.finishSet(workoutId, setIndex);
        FormSessionRepository.saveSession(sessionSummary);

        setSummary(sessionSummary);
        setState('report');
      }
    };

    const handleTimeUpdate = () => {
      setVideoCurrentTime(video.currentTime);
      if (video.duration > 0 && isAnalyzingRef.current) {
        const pct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
        setProgressPercent(pct);
        if (video.currentTime >= video.duration - 0.08) {
          handleEnded();
        }
      }
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [workoutId, setIndex]);

  /**
   * Immediately finishes analysis and generates report on frames processed so far.
   */
  const completeAnalysis = useCallback(() => {
    if (isAnalyzingRef.current) {
      isAnalyzingRef.current = false;
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
      setProgressPercent(100);
      const sessionSummary = analyzerRef.current.finishSet(workoutId, setIndex);
      FormSessionRepository.saveSession(sessionSummary);
      setSummary(sessionSummary);
      setState('report');
    }
  }, [workoutId, setIndex]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    setState,
    selectedExerciseId,
    setSelectedExerciseId,
    progressPercent,
    videoUrl,
    videoFileName,
    videoDuration,
    videoCurrentTime,
    error,
    summary,
    videoRef,
    canvasRef,
    latestLandmarksRef,
    // Live metrics
    repCount,
    currentPhase,
    activeCue,
    currentKneeAngleDeg,
    minKneeAngleDeg,
    torsoInclinationDeg,
    detectedSide,
    trackingConfidence,
    isReady,
    readinessReason,
    // Actions
    analyzeVideo,
    completeAnalysis,
    reset,
    cleanup,
  };
}
