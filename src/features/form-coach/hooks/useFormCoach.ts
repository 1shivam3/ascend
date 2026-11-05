/**
 * ASCEND Form Coach — Video Form Check Hook
 *
 * Streamlined on-device biomechanical video analysis.
 * User uploads a recorded workout video -> automated frame analysis -> instant form report.
 *
 * Auto-detect: the tracked landmark stream feeds a MovementClassifier
 * alongside the exercise analyzers. A generic upload is routed at the
 * end of the stream to the analyzer the classifier positively
 * identified (squat or deadlift); when the movement matches neither —
 * or too little of it was measurable — the outcome is the honest
 * 'unsupported' state and nothing is saved. An in-workout entry may
 * preset the exercise; if detection confidently contradicts the
 * preset, the user chooses which lift to grade (mismatch), and any
 * report can be re-run as the other exercise (the correction path).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { PoseLandmarkerService } from '../services/pose/PoseLandmarkerService';
import { PoseLandmarksSmoother } from '../services/analysis/LandmarkSmoothing';
import { PoseSubjectTracker } from '../services/pose/PoseSubjectTracker';
import { SquatAnalyzer } from '../analyzers/SquatAnalyzer';
import { DeadliftAnalyzer } from '../analyzers/DeadliftAnalyzer';
import {
  ExerciseAnalyzer,
  FormExerciseId,
  MovementSignature,
} from '../analyzers/ExerciseAnalyzer';
import {
  MovementClassifier,
  DetectedExercise,
} from '../services/analysis/MovementClassifier';
import { NormalizedLandmark, DetectedSide } from '../models/pose.types';
import { FormCue, MovementPhase } from '../models/form-feedback.types';
import { FormSessionSummary, FormCoachConfig } from '../models/form-session.types';
import { FormSessionRepository } from '../repositories/FormSessionRepository';

export type FormCoachState = 'select' | 'analyzing' | 'report' | 'no-tracking' | 'unsupported' | 'error';

/**
 * D4: decides what the end of an analysis means. When pose tracking
 * never found the lifter — zero tracked frames, or tracking present on
 * a negligible share of a long stream — there is no honest summary to
 * show: the UI must say tracking failed and how to refilm, instead of
 * sitting in the analyzing state or rendering an empty report. When
 * tracking worked but no rep was valid, the summary (0 valid reps) IS
 * the honest result and renders as a report.
 *
 * D6: when tracking worked but the movement signature is positively
 * NOT the graded exercise (a hip hinge fed to the squat analyzer), the
 * honest outcome is 'not-squat' — no squat summary is built or saved.
 * Tracking failure takes precedence: a stream that was never tracked
 * cannot be judged as any movement.
 *
 * Retained as the D6 routing contract; the hook's end-of-analysis
 * routing now goes through resolveDetectionOutcome below, which
 * generalizes this to both supported exercises.
 */
export function resolveAnalysisOutcome(
  stats: {
    framesProcessed: number;
    framesTracked: number;
  },
  movementSignature?: MovementSignature
): 'report' | 'no-tracking' | 'not-squat' {
  if (stats.framesTracked === 0) return 'no-tracking';
  if (stats.framesProcessed >= 30 && stats.framesTracked / stats.framesProcessed < 0.02) {
    return 'no-tracking';
  }
  if (movementSignature === 'not_squat') return 'not-squat';
  return 'report';
}

/** How the analyzer for a run is chosen. */
export type AnalyzerMode =
  | { type: 'auto' }
  | { type: 'preset'; exerciseId: FormExerciseId }
  | { type: 'forced'; exerciseId: FormExerciseId };

export type DetectionOutcome =
  | { kind: 'report'; exerciseId: FormExerciseId }
  | { kind: 'no-tracking' }
  | { kind: 'unsupported'; reason: 'unknown' | 'insufficient_evidence' }
  | { kind: 'mismatch'; detectedExerciseId: FormExerciseId };

/**
 * End-of-analysis routing for auto-detect. Tracking failure takes
 * precedence (a stream that was never tracked cannot be judged as any
 * movement). A forced run (the user's correction) always reports as
 * the chosen exercise. A preset run reports as the preset unless
 * detection confidently names the OTHER supported exercise — then the
 * user decides (mismatch). An auto run reports as the detected
 * exercise, and declines — saving nothing — when detection is
 * 'unknown' or 'insufficient_evidence': an analyzer is never forced
 * on an unidentified movement.
 */
export function resolveDetectionOutcome(args: {
  stats: { framesProcessed: number; framesTracked: number };
  mode: AnalyzerMode;
  detection: DetectedExercise;
}): DetectionOutcome {
  const { stats, mode, detection } = args;
  if (stats.framesTracked === 0) return { kind: 'no-tracking' };
  if (stats.framesProcessed >= 30 && stats.framesTracked / stats.framesProcessed < 0.02) {
    return { kind: 'no-tracking' };
  }
  if (mode.type === 'forced') {
    return { kind: 'report', exerciseId: mode.exerciseId };
  }
  if (mode.type === 'preset') {
    if (
      (detection === 'squat' || detection === 'deadlift') &&
      detection !== mode.exerciseId
    ) {
      return { kind: 'mismatch', detectedExerciseId: detection };
    }
    return { kind: 'report', exerciseId: mode.exerciseId };
  }
  if (detection === 'squat' || detection === 'deadlift') {
    return { kind: 'report', exerciseId: detection };
  }
  return { kind: 'unsupported', reason: detection };
}

/** What produced the report on screen, and how it was chosen. */
export interface FormCoachDetection {
  exerciseId: FormExerciseId;
  exerciseName: string;
  source: 'detected' | 'preset' | 'corrected';
}

export type UnsupportedInfo =
  | { reason: 'unknown' | 'insufficient_evidence' }
  | {
      reason: 'mismatch';
      detectedExerciseId: FormExerciseId;
      presetExerciseId: FormExerciseId;
    };

export interface UseFormCoachOptions {
  /** In-workout entries preset the exercise being performed. Generic
   * entries leave this unset and the movement is auto-detected. */
  presetExerciseId?: FormExerciseId;
  workoutId?: string;
  setIndex?: number;
  initialConfig?: Partial<FormCoachConfig>;
  onRepCompleted?: (repCount: number) => void;
}

export function useFormCoach({
  presetExerciseId,
  workoutId,
  setIndex,
  initialConfig,
  onRepCompleted,
}: UseFormCoachOptions = {}) {
  const [state, setState] = useState<FormCoachState>('select');
  const [progressPercent, setProgressPercent] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [summary, setSummary] = useState<FormSessionSummary | null>(null);
  const [detection, setDetection] = useState<FormCoachDetection | null>(null);
  const [unsupportedInfo, setUnsupportedInfo] = useState<UnsupportedInfo | null>(null);
  const [leaningExerciseId, setLeaningExerciseId] = useState<FormExerciseId | null>(null);

  // Live telemetry during analysis / replay
  const [repCount, setRepCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<MovementPhase>('standing');
  const [activeCue, setActiveCue] = useState<FormCue | null>(null);
  const [currentKneeAngleDeg, setCurrentKneeAngleDeg] = useState<number | null>(null);
  const [minKneeAngleDeg, setMinKneeAngleDeg] = useState<number | null>(null);
  const [currentHipAngleDeg, setCurrentHipAngleDeg] = useState<number | null>(null);
  const [minHipAngleDeg, setMinHipAngleDeg] = useState<number | null>(null);
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
  // Deep audit: picks the lifter among detected people (a spotter standing
  // closer to the camera must not become the analyzed subject).
  const subjectTrackerRef = useRef<PoseSubjectTracker>(new PoseSubjectTracker());
  const squatAnalyzerRef = useRef<ExerciseAnalyzer>(new SquatAnalyzer(initialConfig));
  const deadliftAnalyzerRef = useRef<ExerciseAnalyzer>(new DeadliftAnalyzer());
  const classifierRef = useRef<MovementClassifier>(new MovementClassifier());
  /** The user's correction: re-run the same video as this exercise. */
  const forcedExerciseRef = useRef<FormExerciseId | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const presetRef = useRef<FormExerciseId | undefined>(presetExerciseId);
  presetRef.current = presetExerciseId;

  const animFrameRef = useRef<number | null>(null);
  const uploadedVideoUrlRef = useRef<string | null>(null);
  const latestLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const isAnalyzingRef = useRef<boolean>(false);

  const analyzerFor = useCallback((exerciseId: FormExerciseId): ExerciseAnalyzer => {
    return exerciseId === 'deadlift' ? deadliftAnalyzerRef.current : squatAnalyzerRef.current;
  }, []);

  const getMode = useCallback((): AnalyzerMode => {
    if (forcedExerciseRef.current) {
      return { type: 'forced', exerciseId: forcedExerciseRef.current };
    }
    if (presetRef.current) {
      return { type: 'preset', exerciseId: presetRef.current };
    }
    return { type: 'auto' };
  }, []);

  /**
   * Resets the analyzer to select state.
   */
  const reset = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    isAnalyzingRef.current = false;
    subjectTrackerRef.current.reset();
    forcedExerciseRef.current = null;
    lastFileRef.current = null;
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
    setCurrentHipAngleDeg(null);
    setMinHipAngleDeg(null);
    setTorsoInclinationDeg(null);
    setSummary(null);
    setDetection(null);
    setUnsupportedInfo(null);
    setLeaningExerciseId(null);
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
      setDetection(null);
      setUnsupportedInfo(null);
      setLeaningExerciseId(null);
      lastFileRef.current = file;

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
        squatAnalyzerRef.current.reset();
        deadliftAnalyzerRef.current.reset();
        classifierRef.current.reset();
        smootherRef.current.reset();
        subjectTrackerRef.current.reset();

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
   * Correction path: re-run the same video forced as the given
   * exercise, regardless of what detection concluded.
   */
  const rerunAs = useCallback(
    (exerciseId: FormExerciseId) => {
      const file = lastFileRef.current;
      if (!file) return;
      forcedExerciseRef.current = exerciseId;
      void analyzeVideo(file);
    },
    [analyzeVideo]
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
    squatAnalyzerRef.current.cleanup();
    deadliftAnalyzerRef.current.cleanup();
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
            // Subject selection: among all detected people, analyze the
            // one whose hips actually travel (the lifter), not pose [0] —
            // in the owner's front-view video pose [0] was the spotter,
            // standing still in front of the lifter.
            const candidates =
              inferenceResult.poses && inferenceResult.poses.length > 0
                ? inferenceResult.poses
                : inferenceResult.landmarks
                  ? [inferenceResult.landmarks]
                  : [];
            const selection = subjectTrackerRef.current.select(candidates);
            let landmarks = selection?.landmarks ?? null;

            if (landmarks && landmarks.length > 0) {
              // A subject flip must not smear the previous person's
              // landmarks into the new subject's stream.
              if (selection?.subjectSwitched) smootherRef.current.reset();
              landmarks = smootherRef.current.smooth(landmarks, frameTimeMs);
            }

            latestLandmarksRef.current = landmarks;

            // Auto-detect evidence accumulates over the same tracked
            // stream the analyzers consume.
            classifierRef.current.processFrame(landmarks, aspectRatio);
            const leaning = classifierRef.current.classify().exercise;
            const leaningId: FormExerciseId | null =
              leaning === 'squat' || leaning === 'deadlift' ? leaning : null;
            setLeaningExerciseId(leaningId);

            // Run movement analysis. In auto mode BOTH analyzers track
            // the stream (their per-frame math is cheap; pose inference
            // is the expensive part and runs once) and the classifier's
            // verdict at the end decides whose summary is kept. In
            // preset/forced mode only the chosen analyzer runs. The HUD
            // follows the chosen — or currently leaning — analyzer.
            const mode = getMode();
            const sourceId: FormExerciseId =
              mode.type === 'auto' ? (leaningId ?? 'squat') : mode.exerciseId;
            const feedIds: FormExerciseId[] =
              mode.type === 'auto' ? ['squat', 'deadlift'] : [mode.exerciseId];

            let result: ReturnType<ExerciseAnalyzer['processFrame']> | null = null;
            for (const id of feedIds) {
              const r = analyzerFor(id).processFrame(landmarks, frameTimeMs, aspectRatio);
              if (id === sourceId) result = r;
            }
            if (!result) return;

            setIsReady(result.readiness.isReady);
            setReadinessReason(result.readiness.reason);
            setDetectedSide(result.detectedSide);
            setTrackingConfidence(result.trackingConfidence);
            setCurrentKneeAngleDeg(result.currentKneeAngleDeg);
            setMinKneeAngleDeg(result.minKneeAngleDeg);
            setCurrentHipAngleDeg(result.currentHipAngleDeg);
            setMinHipAngleDeg(result.minHipAngleDeg);
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
  }, [onRepCompleted, analyzerFor, getMode]);

  /**
   * Shared finish path for playback end and "View Report Now": routes
   * by the detection outcome — a saved report for the identified (or
   * preset/forced) exercise, the no-tracking state when the lifter
   * was never tracked, and the unsupported state — saving nothing —
   * when the movement cannot be confidently identified.
   */
  const finishAnalysis = useCallback(() => {
    const stats = classifierRef.current.getTrackingStats();
    const detectionResult = classifierRef.current.classify();
    const mode = getMode();
    const outcome = resolveDetectionOutcome({
      stats,
      mode,
      detection: detectionResult.exercise,
    });

    if (outcome.kind === 'no-tracking') {
      setSummary(null);
      setState('no-tracking');
      return;
    }
    if (outcome.kind === 'unsupported') {
      setSummary(null);
      setUnsupportedInfo({ reason: outcome.reason });
      setState('unsupported');
      return;
    }
    if (outcome.kind === 'mismatch') {
      setSummary(null);
      setUnsupportedInfo({
        reason: 'mismatch',
        detectedExerciseId: outcome.detectedExerciseId,
        presetExerciseId: mode.type === 'preset' ? mode.exerciseId : outcome.detectedExerciseId,
      });
      setState('unsupported');
      return;
    }
    const sessionSummary = analyzerFor(outcome.exerciseId).finishSet(workoutId, setIndex);
    FormSessionRepository.saveSession(sessionSummary);
    setSummary(sessionSummary);
    setDetection({
      exerciseId: outcome.exerciseId,
      exerciseName: sessionSummary.exerciseName,
      source: mode.type === 'forced' ? 'corrected' : mode.type === 'preset' ? 'preset' : 'detected',
    });
    setState('report');
  }, [workoutId, setIndex, analyzerFor, getMode]);

  /**
   * Mismatch resolution: the user keeps the workout's preset exercise
   * even though detection named the other lift. The preset analyzer
   * tracked the whole stream, so its summary can be built now.
   */
  const acceptPreset = useCallback(() => {
    if (unsupportedInfo?.reason !== 'mismatch') return;
    const presetId = unsupportedInfo.presetExerciseId;
    const sessionSummary = analyzerFor(presetId).finishSet(workoutId, setIndex);
    FormSessionRepository.saveSession(sessionSummary);
    setSummary(sessionSummary);
    setDetection({
      exerciseId: presetId,
      exerciseName: sessionSummary.exerciseName,
      source: 'preset',
    });
    setUnsupportedInfo(null);
    setState('report');
  }, [unsupportedInfo, workoutId, setIndex, analyzerFor]);

  // Video completion listener
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      if (isAnalyzingRef.current) {
        isAnalyzingRef.current = false;
        setProgressPercent(100);
        finishAnalysis();
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
  }, [finishAnalysis]);

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
      finishAnalysis();
    }
  }, [finishAnalysis]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    setState,
    presetExerciseId,
    progressPercent,
    videoUrl,
    videoFileName,
    videoDuration,
    videoCurrentTime,
    error,
    summary,
    detection,
    unsupportedInfo,
    leaningExerciseId,
    videoRef,
    canvasRef,
    latestLandmarksRef,
    // Live metrics
    repCount,
    currentPhase,
    activeCue,
    currentKneeAngleDeg,
    minKneeAngleDeg,
    currentHipAngleDeg,
    minHipAngleDeg,
    torsoInclinationDeg,
    detectedSide,
    trackingConfidence,
    isReady,
    readinessReason,
    // Actions
    analyzeVideo,
    completeAnalysis,
    rerunAs,
    acceptPreset,
    reset,
    cleanup,
  };
}
