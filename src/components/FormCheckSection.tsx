'use client';

/**
 * FormCheckSection — LIVE FORM CHECK v1 camera UI (Train tab, Coach area).
 *
 * A NEW section, not a drawer: the removed 'Ask Coach' drawer stays
 * removed. This section owns the camera lifecycle and renders the
 * pure RepCounter from form-check.ts; it contains no angle math and
 * no rep logic of its own.
 *
 * Privacy, stated in the UI and true by construction: the camera
 * stream is processed on-device by MediaPipe (WASM + model, loaded
 * once at start). No video frame, photo, or landmark is recorded,
 * uploaded, or sent anywhere — landmarks live in memory for one
 * frame and are then dropped. HTTPS on Vercel is sufficient; no
 * server round-trip is involved at all.
 *
 * Honesty wiring:
 *  - Frames are fed to the counter ONLY from real detections. When
 *    MediaPipe finds nobody, an all-visibility-0 frame is fed, which
 *    the gate fails as unclear — never a guessed pose — AND the UI
 *    renders the distinct "no person detected" box instead of the
 *    joint-unclear box, so a detection failure is never mistaken
 *    for a visibility failure.
 *  - No frames are fed while the camera is switching or the video is
 *    not ready, so a camera gap can neither count nor taint a rep.
 *  - The "I feel pain — stop" button ends the set immediately and
 *    shows the refer-out summary. Pain is never diagnosed, never
 *    explained away, and never used to suggest continuing.
 *  - All angle ranges are coaching heuristics, labelled as such in
 *    the UI — never medical-grade claims.
 *
 * Upload path (v1, seek-based since the slow-phone fix): next to the
 * camera option, the user can pick a recorded video file instead of
 * starting the camera. The file is loaded into the SAME video element
 * via an object URL and run through the SAME pose engine, counter,
 * gate, cues, and debug readout as live camera — but NOT through the
 * real-time loop: a file is not a live stream, so the video is PAUSED
 * and stepped through frame by frame (seek → detect → repeat), which
 * decouples analysis from playback speed. On a slow phone real-time
 * playback sampled ~1.5 fps and the counter's taint rule + 2-frame
 * confirms turned that into 0 reps; stepping sees every sampled
 * frame, so reps count at the cost of a longer (but progress-shown)
 * analysis. The file is decoded locally in the browser; no upload
 * request is ever made, so the video never leaves the device. The
 * camera path is untouched when upload is not used, and switching
 * back revokes the object URL. No camera permission is requested on
 * the upload path.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation, type StringKey } from '@/lib/i18n';
import {
  AlertTriangle,
  Camera,
  Play,
  RefreshCw,
  Square,
  SwitchCamera,
  Upload,
  Video,
} from 'lucide-react';
import {
  LIFT_CONFIGS,
  LIFT_ORDER,
  RepCounter,
  buildVisibilityDiagnostic,
  type IssueCode,
  type JointGroup,
  type LiftId,
  type PoseLandmark,
  type SetSummary,
  type UnclearDetail,
  type UnclearReason,
  type VisibilityDiagnostic,
} from '@/lib/form-check';
import {
  POSE_MODEL_VARIANT,
  emptyLandmarks,
  loadPoseLandmarker,
  PoseEngineError,
  toPoseLandmarks,
  type PoseLandmarkerLike,
} from '@/lib/pose-engine';
import {
  computeUploadStepTimes,
  nextAnalysisTimestamp,
  seekVideoTo,
  waitForMetadata,
} from '@/lib/upload-analysis';

type UiPhase = 'idle' | 'loading' | 'active' | 'summary' | 'error';
type CameraFacing = 'user' | 'environment';
type VideoSource = 'camera' | 'upload';

interface LiveState {
  reps: number;
  cueCode: IssueCode | 'unclear' | null;
  unclear: boolean;
  unclearReason: UnclearReason | null;
  unclearDetail: UnclearDetail | null;
  noPerson: boolean;
  phase: string;
  angleDeg: number | null;
}

interface UiError {
  titleKey: StringKey;
  messageKey: StringKey;
  tryThisKey: StringKey;
}

const UNCLEAR_HINT_KEYS: Record<UnclearReason, StringKey> = {
  'low-visibility': 'formcheck.unclearLowVisibility',
  occlusion: 'formcheck.unclearOcclusion',
  'camera-angle': 'formcheck.unclearCameraAngle',
};

const JOINT_LABEL_KEYS: Record<JointGroup, StringKey> = {
  shoulders: 'formcheck.jointShoulders',
  elbows: 'formcheck.jointElbows',
  wrists: 'formcheck.jointWrists',
  hips: 'formcheck.jointHips',
  knees: 'formcheck.jointKnees',
  ankles: 'formcheck.jointAnkles',
};

const PRIMARY_LABEL_KEYS: Record<string, StringKey> = {
  knee: 'formcheck.angleKnee',
  hip: 'formcheck.angleHip',
  elbow: 'formcheck.angleElbow',
};

const LIFT_NAME_KEYS: Record<LiftId, StringKey> = {
  squat: 'formcheck.liftSquat',
  bench: 'formcheck.liftBench',
  deadlift: 'formcheck.liftDeadlift',
  'overhead-press': 'formcheck.liftOverheadPress',
  'barbell-row': 'formcheck.liftBarbellRow',
};

const LIFT_HINT_KEYS: Record<LiftId, StringKey> = {
  squat: 'formcheck.hintSquat',
  bench: 'formcheck.hintBench',
  deadlift: 'formcheck.hintDeadlift',
  'overhead-press': 'formcheck.hintOverheadPress',
  'barbell-row': 'formcheck.hintBarbellRow',
};

const LIVE_CUE_KEYS: Record<IssueCode, StringKey> = {
  'torso-lean': 'formcheck.cueTorsoLean',
  'lean-back': 'formcheck.cueLeanBack',
  'hinge-lost': 'formcheck.cueHingeLost',
  'hips-first': 'formcheck.cueHipsFirst',
  'wrist-drift': 'formcheck.cueWristDrift',
  shallow: 'formcheck.issueShallow',
  'straight-leg-start': 'formcheck.issueStraightLegStart',
};

const ISSUE_KEYS: Record<IssueCode, StringKey> = {
  shallow: 'formcheck.issueShallow',
  'torso-lean': 'formcheck.issueTorsoLean',
  'hips-first': 'formcheck.issueHipsFirst',
  'wrist-drift': 'formcheck.issueWristDrift',
  'hinge-lost': 'formcheck.issueHingeLost',
  'lean-back': 'formcheck.issueLeanBack',
  'straight-leg-start': 'formcheck.issueStraightLegStart',
};

function mapError(err: unknown): UiError {
  if (err instanceof PoseEngineError) {
    return err.kind === 'model-download-failed'
      ? {
          titleKey: 'formcheck.errModelTitle',
          messageKey: 'formcheck.errModelMessage',
          tryThisKey: 'formcheck.errModelTry',
        }
      : {
          titleKey: 'formcheck.errEngineTitle',
          messageKey: 'formcheck.errEngineMessage',
          tryThisKey: 'formcheck.errEngineTry',
        };
  }
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return {
        titleKey: 'formcheck.errDeniedTitle',
        messageKey: 'formcheck.errDeniedMessage',
        tryThisKey: 'formcheck.errDeniedTry',
      };
    }
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      return {
        titleKey: 'formcheck.errNoCameraTitle',
        messageKey: 'formcheck.errNoCameraMessage',
        tryThisKey: 'formcheck.errNoCameraTry',
      };
    }
  }
  return {
    titleKey: 'formcheck.errStartTitle',
    messageKey: 'formcheck.errStartMessage',
    tryThisKey: 'formcheck.errStartTry',
  };
}

export default function FormCheckSection() {
  const { t } = useTranslation();
  const [lift, setLift] = useState<LiftId>('squat');
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [phase, setPhase] = useState<UiPhase>('idle');
  const [live, setLive] = useState<LiveState>({
    reps: 0,
    cueCode: null,
    unclear: false,
    unclearReason: null,
    unclearDetail: null,
    noPerson: false,
    phase: 'top',
    angleDeg: null,
  });
  const [summary, setSummary] = useState<SetSummary | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [uploadError, setUploadError] = useState(false);
  const [source, setSource] = useState<VideoSource>('camera');
  const [slowNote, setSlowNote] = useState(false);
  // Diagnostic readout: OFF by default. When on, the loop below only
  // ADDS a throttled display snapshot — it never touches detection,
  // gating, or counting (buildVisibilityDiagnostic is pure).
  const [showDebug, setShowDebug] = useState(false);
  const [diag, setDiag] = useState<VisibilityDiagnostic | null>(null);
  // Upload analysis progress (null = not analyzing). `done` counts
  // finished frames; `current` is the 1-based frame being worked on
  // RIGHT NOW (seeking to it or detecting it). That distinction is
  // the first-frame fix: a slow first detection used to leave the
  // screen frozen at "0 of N (0%)" with no sign of life, which looks
  // identical to a hang. With `current`, the UI always names the
  // frame in flight, and the pulse dot below animates on the
  // compositor thread even while JS is blocked inside a detection.
  const [analysisProgress, setAnalysisProgress] = useState<{
    done: number;
    total: number;
    current: number;
  } | null>(null);
  // Detection instrumentation for the debug readout + summary.
  const [detectStats, setDetectStats] = useState<{
    frames: number;
    avgMs: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadUrlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerLike | null>(null);
  const counterRef = useRef<RepCounter | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastLiveRef = useRef<string>('');
  const detectMsRef = useRef<number[]>([]);
  const detectErrorStreakRef = useRef(0);
  const detectStatsRef = useRef({ frames: 0, totalMs: 0 });
  // Generation counter for the upload analysis loop: starting a new
  // run, cancelling, ending, or unmounting invalidates any in-flight
  // loop, which checks this token every step and exits cleanly
  // without touching state or firing a stale summary.
  const analysisTokenRef = useRef(0);
  const lastAnalysisTsRef = useRef(0);
  const phaseRef = useRef<UiPhase>('idle');
  phaseRef.current = phase;
  const showDebugRef = useRef(false);
  showDebugRef.current = showDebug;
  const sourceRef = useRef<VideoSource>('camera');
  sourceRef.current = source;
  const lastDiagAtRef = useRef(0);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Drop the uploaded file's object URL and detach it from the video
  // element. Idempotent: safe to call when no upload is active (it
  // then does nothing). Never touches srcObject, so the camera path
  // is unaffected when this runs while leaving the upload path.
  const revokeUpload = useCallback(() => {
    if (uploadUrlRef.current) {
      URL.revokeObjectURL(uploadUrlRef.current);
      uploadUrlRef.current = null;
    }
    if (videoRef.current) videoRef.current.removeAttribute('src');
  }, []);

  const stopLoop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const attachStream = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
  }, []);

  // Book one detection's time: the 30-frame window behind the slow
  // note (live loop) AND the run totals behind the instrumentation
  // (debug readout + summary). The loop already tracked detectMs —
  // this wires the same timer through, it does not invent a second
  // one. detectMs here is frame-processing time (detect + counter),
  // measured the same way in both loops.
  const noteDetect = useCallback((dt: number) => {
    detectMsRef.current.push(dt);
    if (detectMsRef.current.length > 30) detectMsRef.current.shift();
    if (detectMsRef.current.length === 30) {
      const avg =
        detectMsRef.current.reduce((s, v) => s + v, 0) / detectMsRef.current.length;
      setSlowNote((prev) => (avg > 120 ? true : prev));
    }
    detectStatsRef.current.frames += 1;
    detectStatsRef.current.totalMs += dt;
  }, []);

  // Feed one detected frame through the counter and into the live
  // UI. Shared by the live rAF loop and the upload stepping loop —
  // there is exactly one counting path, so a stepped frame and a live
  // frame are judged identically. Display-only extras (live state,
  // throttled debug snapshot) live here too, never inside the counter.
  const handleCounterFrame = useCallback(
    (marks: PoseLandmark[], detected: PoseLandmark[] | null, timestampMs: number) => {
      const counter = counterRef.current;
      if (!counter) return;
      const frameResult = counter.processFrame({ landmarks: marks, timestampMs });
      const primary = counter.config.primaryAngle;
      const angleDeg =
        frameResult.angles && frameResult.angles[primary] !== null
          ? Math.round(frameResult.angles[primary] as number)
          : null;
      const next: LiveState = {
        reps: frameResult.repCount,
        cueCode: frameResult.liveCueCode,
        unclear: frameResult.status === 'unclear',
        unclearReason: frameResult.unclearReason,
        unclearDetail: frameResult.unclearDetail,
        noPerson: detected === null,
        phase: frameResult.phase,
        angleDeg,
      };
      const key = JSON.stringify(next);
      if (key !== lastLiveRef.current) {
        lastLiveRef.current = key;
        setLive(next);
      }
      // Diagnostic snapshot only: throttled to ~4/s so the readout
      // can never jank detection, and skipped entirely when the
      // toggle is off (zero extra work, zero behavior change).
      // Display-only — the counter already ran above.
      const now = performance.now();
      if (showDebugRef.current && now - lastDiagAtRef.current >= 250) {
        lastDiagAtRef.current = now;
        setDiag(
          buildVisibilityDiagnostic(counter.liftId, marks, frameResult, detected === null)
        );
        const st = detectStatsRef.current;
        setDetectStats(
          st.frames > 0
            ? { frames: st.frames, avgMs: Math.round(st.totalMs / st.frames) }
            : null
        );
      }
    },
    []
  );

  const loop = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const counter = counterRef.current;
    if (video && landmarker && counter && video.readyState >= 2 && video.videoWidth > 0) {
      const t0 = performance.now();
      try {
        const result = landmarker.detectForVideo(video, t0);
        const detected = toPoseLandmarks(result);
        const marks = detected ?? emptyLandmarks();
        handleCounterFrame(marks, detected, t0);
        detectErrorStreakRef.current = 0;
        noteDetect(performance.now() - t0);
      } catch {
        // A failed detection frame is skipped, never fabricated. If
        // detection keeps failing, surface a non-crash error state.
        detectErrorStreakRef.current += 1;
        if (detectErrorStreakRef.current > 30) {
          stopLoop();
          stopTracks();
          setError({
            titleKey: 'formcheck.errTrackingTitle',
            messageKey: 'formcheck.errTrackingMessage',
            tryThisKey: 'formcheck.errTrackingTry',
          });
          setPhase('error');
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [handleCounterFrame, noteDetect, stopLoop, stopTracks]);

  const start = useCallback(async () => {
    setError(null);
    setUploadError(false);
    revokeUpload();
    setSource('camera');
    setSummary(null);
    setSlowNote(false);
    setDiag(null);
    setDetectStats(null);
    setAnalysisProgress(null);
    analysisTokenRef.current += 1;
    lastDiagAtRef.current = 0;
    setLive({ reps: 0, cueCode: null, unclear: false, unclearReason: null, unclearDetail: null, noPerson: false, phase: 'top', angleDeg: null });
    lastLiveRef.current = '';
    detectMsRef.current = [];
    detectStatsRef.current = { frames: 0, totalMs: 0 };
    detectErrorStreakRef.current = 0;
    setPhase('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      await attachStream(stream);
      if (!landmarkerRef.current) {
        landmarkerRef.current = await loadPoseLandmarker();
      }
      counterRef.current = new RepCounter(lift);
      runningRef.current = true;
      setPhase('active');
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      stopLoop();
      stopTracks();
      setError(mapError(err));
      setPhase('error');
    }
  }, [attachStream, facing, lift, loop, revokeUpload, stopLoop, stopTracks]);

  const endSet = useCallback(
    (pain: boolean) => {
      const counter = counterRef.current;
      stopLoop();
      stopTracks();
      revokeUpload();
      setDiag(null);
      // Invalidate any in-flight upload analysis: it must not fire a
      // stale summary after the set already ended.
      analysisTokenRef.current += 1;
      const result = counter
        ? pain
          ? counter.requestPainStop(performance.now())
          : counter.endSet('completed', performance.now())
        : null;
      // Attach this run's detection instrumentation (never the
      // counter's business) so the summary reports it without
      // needing the debug toggle.
      const st = detectStatsRef.current;
      setSummary(
        result
          ? {
              ...result,
              framesProcessed: st.frames,
              avgDetectMs: st.frames > 0 ? Math.round(st.totalMs / st.frames) : null,
            }
          : null
      );
      setAnalysisProgress(null);
      setPhase('summary');
    },
    [revokeUpload, stopLoop, stopTracks]
  );

  // Seek-based offline analysis for uploads (upload path only; the
  // live camera path never calls this). Steps through the paused
  // video — seek to a time, await the seeked event, detect that exact
  // frame through the SAME counter as live — then shows the same
  // post-set summary when stepping completes. Analysis time is
  // decoupled from playback speed: a slow phone takes longer, but
  // still sees every stepped frame, so reps count. Progress is shown
  // honestly (frames done of total) because the run can take minutes
  // on a slow phone. A per-seek timeout surfaces a clear error
  // instead of hanging; cancelling invalidates the token, and this
  // loop then exits without touching state or firing a stale summary.
  // No per-detection timeout exists, deliberately: the tasks-vision
  // detectForVideo API is synchronous, so no timer can fire while it
  // blocks — a Promise.race "timeout" would never trip and would only
  // pretend to protect the run. The first-frame stall class is handled
  // instead by the loading-phase warm-up in startUpload (the
  // first-inference cost is paid before analysis starts), the
  // in-flight frame line above, and the compositor pulse.
  const analyzeUpload = useCallback(async () => {
    const token = analysisTokenRef.current;
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const counter = counterRef.current;
    if (!video || !landmarker || !counter) return;
    const times = computeUploadStepTimes(video.duration);
    if (times.length === 0) return;
    setAnalysisProgress({ done: 0, total: times.length, current: 1 });
    const baseTs = performance.now();
    lastAnalysisTsRef.current = 0;
    try {
      for (let i = 0; i < times.length; i++) {
        if (token !== analysisTokenRef.current || phaseRef.current !== 'active') return;
        const t = times[i];
        // Name the frame in flight BEFORE seeking to it, so the UI
        // never sits on a bare "0 of N" while a step is in progress.
        setAnalysisProgress({ done: i, total: times.length, current: i + 1 });
        // A stuck seek must surface, never hang: seekVideoTo rejects
        // on timeout (caught below as a seek error).
        await seekVideoTo(video, t);
        if (token !== analysisTokenRef.current || phaseRef.current !== 'active') return;
        // First frame only: yield to paint BEFORE the first
        // detection. The first detectForVideo on a landmarker pays
        // the delegate/shader-init cost and blocks the main thread,
        // so without this the "Working on frame 1" line above may
        // never paint before the block — leaving the screen frozen
        // at "0 of N (0%)", indistinguishable from a hang. rAF +
        // timer is the standard yield-to-paint; the 500 ms fallback
        // covers a backgrounded tab where rAF never fires.
        if (i === 0) {
          await new Promise<void>((resolve) => {
            const fallback = setTimeout(resolve, 500);
            requestAnimationFrame(() =>
              setTimeout(() => {
                clearTimeout(fallback);
                resolve();
              }, 0)
            );
          });
          if (token !== analysisTokenRef.current || phaseRef.current !== 'active') return;
        }
        const t0 = performance.now();
        try {
          // Monotonic timestamps: the landmarker is cached across
          // runs, so raw video time would go backwards on a second
          // run — nextAnalysisTimestamp keeps it strictly increasing
          // (counter durations use differences, so the offset cancels).
          const ts = nextAnalysisTimestamp(baseTs, t * 1000, lastAnalysisTsRef.current);
          lastAnalysisTsRef.current = ts;
          const result = landmarker.detectForVideo(video, ts);
          const detected = toPoseLandmarks(result);
          const marks = detected ?? emptyLandmarks();
          handleCounterFrame(marks, detected, ts);
          detectErrorStreakRef.current = 0;
          noteDetect(performance.now() - t0);
        } catch {
          // A single failed frame is skipped, never fabricated —
          // same rule as the live loop. The counter is NOT fed.
          detectErrorStreakRef.current += 1;
          if (detectErrorStreakRef.current > 30) {
            revokeUpload();
            setError({
              titleKey: 'formcheck.errTrackingTitle',
              messageKey: 'formcheck.errTrackingMessage',
              tryThisKey: 'formcheck.errTrackingTry',
            });
            setPhase('error');
            return;
          }
        }
        setAnalysisProgress({ done: i + 1, total: times.length, current: i + 1 });
        const st = detectStatsRef.current;
        if (st.frames > 0) {
          setDetectStats({ frames: st.frames, avgMs: Math.round(st.totalMs / st.frames) });
        }
      }
    } catch {
      // Seek failure (timeout or video error). A cancelled run exits
      // above before reaching here, so this is a genuine failure.
      if (token !== analysisTokenRef.current) return;
      revokeUpload();
      setError({
        titleKey: 'formcheck.errSeekTitle',
        messageKey: 'formcheck.errSeekMessage',
        tryThisKey: 'formcheck.errSeekTry',
      });
      setUploadError(true);
      setPhase('error');
      return;
    }
    if (token !== analysisTokenRef.current || phaseRef.current !== 'active') return;
    // Final instrumentation snapshot, then the same post-set summary
    // as live (endSet attaches the run's frame/detect stats).
    const st = detectStatsRef.current;
    if (st.frames > 0) {
      setDetectStats({ frames: st.frames, avgMs: Math.round(st.totalMs / st.frames) });
    }
    setAnalysisProgress(null);
    endSet(false);
  }, [endSet, handleCounterFrame, noteDetect, revokeUpload]);

  // Upload path: run the SAME counter over a recorded file — but NOT
  // through the real-time loop. A file is not a live stream: playing
  // it at normal speed on a slow phone samples ~1.5 fps, and the
  // counter's taint rule + 2-frame confirms turn that into 0 reps
  // even when the model reads every frame perfectly. So the video is
  // PAUSED and stepped through offline (see analyzeUpload below).
  // Never calls getUserMedia, so no camera permission is requested.
  // The video element mounts on the 'loading' render; the macrotask
  // wait below guarantees it exists before videoRef is touched
  // (same reason the camera path awaits getUserMedia first).
  const startUpload = useCallback(async (file: File) => {
    setError(null);
    setUploadError(false);
    revokeUpload();
    setSource('upload');
    setSummary(null);
    setSlowNote(false);
    setDiag(null);
    setDetectStats(null);
    setAnalysisProgress(null);
    analysisTokenRef.current += 1;
    lastDiagAtRef.current = 0;
    setLive({ reps: 0, cueCode: null, unclear: false, unclearReason: null, unclearDetail: null, noPerson: false, phase: 'top', angleDeg: null });
    lastLiveRef.current = '';
    detectMsRef.current = [];
    detectStatsRef.current = { frames: 0, totalMs: 0 };
    detectErrorStreakRef.current = 0;
    const url = URL.createObjectURL(file);
    uploadUrlRef.current = url;
    setPhase('loading');
    try {
      await new Promise((r) => setTimeout(r, 0));
      const video = videoRef.current;
      if (!video) throw new Error('video element missing');
      video.srcObject = null;
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      // Metadata first: stepping needs a duration, and a file that
      // never reports one cannot be analyzed. Then PAUSE — the
      // autoPlay attribute may have started playback, and the
      // analysis below drives currentTime itself, so playback must
      // not race it. No play() call exists on this path.
      await waitForMetadata(video);
      video.pause();
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error('video has no duration');
      }
      if (!landmarkerRef.current) {
        landmarkerRef.current = await loadPoseLandmarker();
      }
      // Best-effort warm-up: the FIRST detectForVideo on a landmarker
      // pays the delegate/shader-init cost and can block the main
      // thread for seconds on a slow phone. Doing it here, during
      // the loading phase (where "Loading your video and the pose
      // model…" already sets the expectation of waiting), keeps that
      // stall OUT of the analysis phase, where a frozen "0 of N"
      // looks identical to a hang. Discarded: never fed to the
      // counter, never touches progress or stats. Any failure is
      // ignored — the analysis loop surfaces real errors itself.
      // Timestamp note: this runs before analyzeUpload captures its
      // base timestamp, so analysis timestamps stay increasing.
      try {
        const lm = landmarkerRef.current;
        if (lm && video.readyState >= 2 && video.videoWidth > 0) {
          lm.detectForVideo(video, performance.now());
        }
      } catch {
        // Warm-up is best-effort only.
      }
      counterRef.current = new RepCounter(lift);
      setPhase('active');
      // NOTE: no rAF loop and no play() here — analyzeUpload owns
      // the run. runningRef stays false so the live loop never runs
      // over a stepped file.
      void analyzeUpload();
    } catch (err) {
      stopLoop();
      revokeUpload();
      // Engine failures keep their own box; anything else on this
      // path (corrupt/unsupported file, metadata failure) is an
      // upload failure — never a camera-permission prompt. Either
      // way the error came from the upload path, so the error
      // screen's primary action returns to idle (re-pick a file or
      // start the camera) instead of retrying the camera directly.
      setError(
        err instanceof PoseEngineError
          ? mapError(err)
          : {
              titleKey: 'formcheck.errUploadTitle',
              messageKey: 'formcheck.errUploadMessage',
              tryThisKey: 'formcheck.errUploadTry',
            }
      );
      setUploadError(true);
      setPhase('error');
    }
  }, [analyzeUpload, lift, revokeUpload, stopLoop]);


  // Cancel an in-flight upload analysis: invalidate the loop, drop
  // the file, return to idle. Partial results are DISCARDED — a
  // half-analyzed video's rep count is not a valid set result, so
  // cancelling shows no summary (unlike End set on a live set).
  const cancelAnalysis = useCallback(() => {
    analysisTokenRef.current += 1;
    stopLoop();
    stopTracks();
    revokeUpload();
    setDiag(null);
    setDetectStats(null);
    setAnalysisProgress(null);
    setSummary(null);
    setPhase('idle');
  }, [revokeUpload, stopLoop, stopTracks]);

  const switchCamera = useCallback(async () => {
    const next: CameraFacing = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    // Idle/summary: just remember the choice for the next start.
    if (phaseRef.current !== 'active') return;
    // Active: swap the stream only. No frames are fed during the gap,
    // so the switch can neither count nor taint a rep.
    stopTracks();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      await attachStream(stream);
    } catch (err) {
      stopLoop();
      stopTracks();
      setError(mapError(err));
      setPhase('error');
    }
  }, [attachStream, facing, stopLoop, stopTracks]);


  // Unmount: never leave the camera or the model running, and never
  // leak an uploaded file's object URL.
  useEffect(
    () => () => {
      runningRef.current = false;
      analysisTokenRef.current += 1;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
      if (uploadUrlRef.current) {
        URL.revokeObjectURL(uploadUrlRef.current);
        uploadUrlRef.current = null;
      }
      try {
        landmarkerRef.current?.close();
      } catch {
        // Closing is best-effort on unmount.
      }
    },
    []
  );

  const cfg = LIFT_CONFIGS[lift];
  const mirrored = source === 'camera' && facing === 'user';

  return (
    <section className="space-y-2.5" aria-label={t('formcheck.sectionAria')}>
      <div className="flex items-center gap-2">
        <Video className="w-4 h-4 text-accent" />
        <h2 className="section-title text-[11px] mb-0">{t('formcheck.title')}</h2>
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-xs text-text-secondary">{t('formcheck.intro')}</p>

        {/* Lift picker — locked during an active set so the counter can't
            be fed a different lift mid-set. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('formcheck.chooseLift')}>
          {LIFT_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              disabled={phase === 'active' || phase === 'loading'}
              onClick={() => {
                setLift(id);
                if (phase === 'summary') {
                  setSummary(null);
                  setPhase('idle');
                }
              }}
              className={`py-1.5 px-3 text-xs font-bold rounded-full cursor-pointer ${
                lift === id ? 'btn-primary' : 'card border border-border'
              }`}
            >
              {t(LIFT_NAME_KEYS[id])}
            </button>
          ))}
        </div>
        <p className="text-2xs text-text-muted">{t(LIFT_HINT_KEYS[lift])}</p>

        {phase === 'idle' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void start()}
              className="btn-primary py-2 px-4 text-xs font-bold cursor-pointer flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> {t('formcheck.startCamera')}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-2 px-4 text-xs font-bold cursor-pointer flex items-center gap-2 card border border-border"
            >
              <Upload className="w-4 h-4" /> {t('formcheck.uploadVideo')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              aria-label={t('formcheck.uploadVideo')}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Reset so the same file can be picked again after an
                // error (a file input otherwise ignores a repeat pick).
                e.target.value = '';
                if (f) void startUpload(f);
              }}
            />
            <p className="text-2xs text-text-muted">{t('formcheck.uploadHint')}</p>
            <button
              type="button"
              onClick={() => void switchCamera()}
              className="py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
            >
              <SwitchCamera className="w-4 h-4" />
              {facing === 'user' ? t('formcheck.frontCamera') : t('formcheck.backCamera')} {t('formcheck.tapToSwitch')}
            </button>
            <p className="text-2xs text-text-muted">{t('formcheck.heuristicsNote')}</p>
          </div>
        )}

        {phase === 'loading' && (
          <p className="text-xs text-text-secondary">
            {source === 'upload' ? t('formcheck.uploadLoading') : t('formcheck.loading')}
          </p>
        )}

        {(phase === 'active' || phase === 'loading') && (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-xl bg-black object-cover aspect-[9/16] max-h-[62vh]"
              style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
              // Upload source only: a file the element cannot decode
              // (corrupt/unsupported) surfaces here — never a camera
              // prompt. The guard keeps camera-path errors out, and
              // the phase guard makes re-entry after the error render
              // a no-op (same box, not a loop).
              onError={() => {
                if (sourceRef.current !== 'upload') return;
                if (phaseRef.current !== 'active' && phaseRef.current !== 'loading') return;
                stopLoop();
                revokeUpload();
                setError({
                  titleKey: 'formcheck.errUploadTitle',
                  messageKey: 'formcheck.errUploadMessage',
                  tryThisKey: 'formcheck.errUploadTry',
                });
                setUploadError(true);
                setPhase('error');
              }}
              // Upload source only: reaching the end of a recorded
              // file finishes the set exactly like End set on live.
              onEnded={() => {
                if (sourceRef.current === 'upload' && phaseRef.current === 'active') {
                  endSet(false);
                }
              }}
            />
            {/* Framing guide: corner brackets marking the full-body
                target (feet to head). Display-only CSS overlay — it
                never touches pose detection, which reads raw frames. */}
            <div aria-hidden="true" className="framing-guide pointer-events-none absolute inset-0">
              <span className="absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-white/60 rounded-tl-sm" />
              <span className="absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-white/60 rounded-tr-sm" />
              <span className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-white/60 rounded-bl-sm" />
              <span className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-white/60 rounded-br-sm" />
            </div>
          </div>
        )}

        {phase === 'active' && (
          <div className="space-y-2">
            {/* Upload analysis progress: honest frames-done-of-total
                (plus a bar) so a slow phone's minutes-long run reads
                as work in progress, not a hang. Live sets never show
                this — analysisProgress is null for the camera path. */}
            {analysisProgress && (
              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t('formcheck.analyzingVideo', {
                    done: analysisProgress.done,
                    total: analysisProgress.total,
                    pct: Math.round(
                      (analysisProgress.done / analysisProgress.total) * 100
                    ),
                  })}
                </p>
                {/* In-flight frame + compositor pulse: while a frame
                    is being detected the main thread may be blocked
                    inside the synchronous detectForVideo call, so no
                    React update can land — but this pulse is a CSS
                    animation, which the compositor keeps animating
                    during a JS block, proving the page is alive.
                    Together with the frame number, a screenshot can
                    no longer read as "dead at 0%". */}
                <p className="text-xs text-text-secondary flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse"
                  />
                  {t('formcheck.analyzingFrame', {
                    current: analysisProgress.current,
                    total: analysisProgress.total,
                  })}
                </p>
                <div
                  className="h-2 rounded-full bg-white/10 overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{
                      width: `${Math.round(
                        (analysisProgress.done / analysisProgress.total) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xs text-text-muted uppercase">{t('formcheck.reps')}</p>
                <p className="text-3xl font-bold text-text-primary">{live.reps}</p>
              </div>
              <div className="text-right">
                <p className="text-2xs text-text-muted">{t(PRIMARY_LABEL_KEYS[cfg.primaryAngle])}</p>
                <p className="text-lg font-bold text-text-primary">
                  {live.angleDeg !== null ? `${live.angleDeg}°` : '—'}
                </p>
              </div>
            </div>

            {live.noPerson ? (
              <div className="rounded-xl border border-warning/40 p-3">
                <p className="text-xs font-bold text-text-primary">{t('formcheck.noPerson')}</p>
                <p className="text-2xs text-text-secondary mt-1">
                  {t('formcheck.noPersonHint')}
                </p>
                <p className="text-2xs text-text-muted mt-1">
                  {t('formcheck.noRepWhileUnclear')}
                </p>
              </div>
            ) : live.unclear ? (
              <div className="rounded-xl border border-warning/40 p-3">
                <p className="text-xs font-bold text-text-primary">{t('formcheck.unclear')}</p>
                {live.unclearReason === 'camera-angle' ? (
                  <p className="text-2xs text-text-secondary mt-1">
                    {t('formcheck.unclearTurnSideways')}
                  </p>
                ) : (
                  <>
                    {live.unclearDetail && live.unclearDetail.outOfFrame.length > 0 && (
                      <p className="text-2xs text-text-secondary mt-1">
                        {t('formcheck.missingJoints', {
                          joints: live.unclearDetail.outOfFrame
                            .map((g) => t(JOINT_LABEL_KEYS[g]))
                            .join(', '),
                        })}
                      </p>
                    )}
                    {live.unclearDetail && live.unclearDetail.lowVisibility.length > 0 && (
                      <p className="text-2xs text-text-secondary mt-1">
                        {t('formcheck.lowVisibilityJoints', {
                          joints: live.unclearDetail.lowVisibility
                            .map((g) => t(JOINT_LABEL_KEYS[g]))
                            .join(', '),
                        })}
                      </p>
                    )}
                    {(!live.unclearDetail ||
                      (live.unclearDetail.outOfFrame.length === 0 &&
                        live.unclearDetail.lowVisibility.length === 0)) &&
                      live.unclearReason && (
                        <p className="text-2xs text-text-secondary mt-1">
                          {t(UNCLEAR_HINT_KEYS[live.unclearReason])}
                        </p>
                      )}
                  </>
                )}
                <p className="text-2xs text-text-muted mt-1">
                  {t('formcheck.noRepWhileUnclear')}
                </p>
              </div>
            ) : live.cueCode && live.cueCode !== 'unclear' ? (
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs font-bold text-text-primary">{t(LIVE_CUE_KEYS[live.cueCode])}</p>
              </div>
            ) : (
              <p className="text-2xs text-text-muted">
                {live.phase === 'top' ? t('formcheck.atTop') : t('formcheck.repInProgress')}
              </p>
            )}

            {slowNote && (
              <p className="text-2xs text-text-muted">{t('formcheck.slowNote')}</p>
            )}

            {/* TEMPORARY diagnostic readout: off by default, display-only.
                Shows the exact visibility values the gate consumes, so a
                phone test yields measurements instead of a binary box.
                Remove before any merge — PR #42 is review-only. */}
            {showDebug && diag && (
              <div className="rounded-xl border border-border p-3 font-mono text-2xs space-y-1">
                <p className="font-bold text-text-primary">
                  {t('formcheck.debugTitle')} ·{' '}
                  {t('formcheck.debugModel', { model: POSE_MODEL_VARIANT })}
                </p>
                <p className="text-text-secondary">
                  {diag.verdict === 'no-person'
                    ? t('formcheck.noPerson')
                    : diag.verdict === 'clear'
                      ? t('formcheck.debugVerdictClear')
                      : `${t('formcheck.debugVerdictUnclear')}${
                          diag.unclearReason ? ` (${diag.unclearReason})` : ''
                        }`}
                </p>
                {diag.groups.map((row) => (
                  <p key={row.group} className="text-text-secondary">
                    {t(JOINT_LABEL_KEYS[row.group])}: L{' '}
                    {row.left !== null ? row.left.toFixed(2) : '—'}{' '}
                    {row.leftTrusted ? '✓' : '✗'} · R{' '}
                    {row.right !== null ? row.right.toFixed(2) : '—'}{' '}
                    {row.rightTrusted ? '✓' : '✗'}
                  </p>
                ))}
                <p className="text-text-muted">
                  L {diag.leftTrustedCount}/{diag.groups.length} · R{' '}
                  {diag.rightTrustedCount}/{diag.groups.length} · better{' '}
                  {diag.betterSide === 'left' ? 'L' : 'R'} · {t('formcheck.reps')}:{' '}
                  {diag.repCount} · {t(PRIMARY_LABEL_KEYS[cfg.primaryAngle])}:{' '}
                  {diag.primaryAngleDeg !== null ? `${diag.primaryAngleDeg}°` : '—'} ·
                  gate ≥ 0.50
                </p>
                {/* TEMPORARY instrumentation: run totals from the same
                    detect timer (not a second timer). Shown here
                    during the run and, via the summary, after it —
                    so the next test reports them without the toggle. */}
                {detectStats && (
                  <p className="text-text-muted">
                    {t('formcheck.debugFrames', { n: detectStats.frames })} ·{' '}
                    {t('formcheck.debugAvgDetect', { ms: detectStats.avgMs })}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                aria-pressed={showDebug}
                onClick={() => {
                  if (showDebug) setDiag(null);
                  setShowDebug(!showDebug);
                }}
                className={`py-1.5 px-3 text-xs font-bold cursor-pointer ${
                  showDebug ? 'btn-primary' : 'card border border-border'
                }`}
              >
                {t('formcheck.debugToggle')}
              </button>
              {source === 'camera' && (
                <button
                  type="button"
                  onClick={() => void switchCamera()}
                  className="py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
                >
                  <SwitchCamera className="w-4 h-4" /> {t('formcheck.switchCamera')}
                </button>
              )}
              {analysisProgress ? (
                // During upload analysis there is no live set to end:
                // cancelling discards the partial run and returns to
                // idle (a half-analyzed video's count is not a valid
                // set result). Pain stop is meaningless for a file.
                <button
                  type="button"
                  onClick={() => cancelAnalysis()}
                  className="py-1.5 px-3 text-xs font-bold cursor-pointer card border border-border"
                >
                  {t('formcheck.cancelAnalysis')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => endSet(false)}
                    className="btn-primary py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
                  >
                    <Square className="w-4 h-4" /> {t('formcheck.endSet')}
                  </button>
                  <button
                    type="button"
                    onClick={() => endSet(true)}
                    className="py-2 px-4 text-xs font-bold cursor-pointer flex items-center gap-2 rounded-xl bg-red-600 text-white"
                    aria-label={t('formcheck.painStopAria')}
                  >
                    <AlertTriangle className="w-4 h-4" /> {t('formcheck.painStop')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {phase === 'error' && error && (
          <div className="space-y-2">
            <div className="rounded-xl border border-warning/40 p-3">
              <p className="text-xs font-bold text-text-primary">{t(error.titleKey)}</p>
              <p className="text-2xs text-text-secondary mt-1">{t(error.messageKey)}</p>
              <p className="text-2xs text-text-muted mt-1">{t(error.tryThisKey)}</p>
            </div>
            <div className="flex gap-2">
              {uploadError ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setUploadError(false);
                    setPhase('idle');
                  }}
                  className="btn-primary py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" /> {t('formcheck.chooseAnotherVideo')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void start()}
                  className="btn-primary py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> {t('formcheck.retry')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setUploadError(false);
                  setPhase('idle');
                }}
                className="py-1.5 px-3 text-xs font-bold cursor-pointer"
              >
                {t('formcheck.back')}
              </button>
            </div>
          </div>
        )}

        {phase === 'summary' && summary && (
          <div className="space-y-3">
            {summary.stoppedForPain ? (
              <div className="rounded-xl border border-red-500/50 p-3">
                <p className="text-xs font-bold text-text-primary">{t('formcheck.setStopped')}</p>
                <p className="text-xs text-text-secondary mt-1">{t('formcheck.painMessage')}</p>
              </div>
            ) : (
              <p className="text-xs font-bold text-text-primary">
                {summary.repCount === 1
                  ? t('formcheck.setCompleteOne')
                  : t('formcheck.setCompleteOther', { count: summary.repCount })}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="card p-2">
                <p className="text-lg font-bold text-text-primary">{summary.repCount}</p>
                <p className="text-2xs text-text-muted">{t('formcheck.reps')}</p>
              </div>
              <div className="card p-2">
                <p className="text-lg font-bold text-text-primary">
                  {summary.depthConsistencyPct}%
                </p>
                <p className="text-2xs text-text-muted">{t('formcheck.fullDepth')}</p>
              </div>
              <div className="card p-2">
                <p className="text-lg font-bold text-text-primary">
                  {summary.medianTempoSec !== null ? `${summary.medianTempoSec}s` : '—'}
                </p>
                <p className="text-2xs text-text-muted">{t('formcheck.medianRepTime')}</p>
              </div>
            </div>
            {/* TEMPORARY instrumentation: this run's detection totals,
                attached by endSet — reported here without needing the
                debug toggle. Remove with the debug readout before any
                merge. */}
            {summary.framesProcessed !== undefined && summary.framesProcessed > 0 && (
              <p className="text-2xs text-text-muted">
                {t('formcheck.summaryAnalysis', {
                  frames: summary.framesProcessed,
                  ms: summary.avgDetectMs ?? 0,
                })}
              </p>
            )}
            {summary.issues.length > 0 ? (
              <ul className="space-y-2">
                {summary.issues.map((issue) => (
                  <li key={issue.code} className="text-xs text-text-secondary">
                    <span className="font-bold text-text-primary">×{issue.count}</span>{' '}
                    {t(ISSUE_KEYS[issue.code])}
                  </li>
                ))}
              </ul>
            ) : (
              summary.repCount > 0 && (
                <p className="text-xs text-text-secondary">{t('formcheck.noFlags')}</p>
              )
            )}
            {summary.repCount === 0 && !summary.stoppedForPain && (
              <p className="text-2xs text-text-muted">{t('formcheck.noRepsCounted')}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setSummary(null);
                setPhase('idle');
              }}
              className="btn-primary py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> {t('formcheck.checkAnother')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
