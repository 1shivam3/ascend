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
  Video,
} from 'lucide-react';
import {
  LIFT_CONFIGS,
  LIFT_ORDER,
  RepCounter,
  type IssueCode,
  type JointGroup,
  type LiftId,
  type SetSummary,
  type UnclearDetail,
  type UnclearReason,
} from '@/lib/form-check';
import {
  emptyLandmarks,
  loadPoseLandmarker,
  PoseEngineError,
  toPoseLandmarks,
  type PoseLandmarkerLike,
} from '@/lib/pose-engine';

type UiPhase = 'idle' | 'loading' | 'active' | 'summary' | 'error';
type CameraFacing = 'user' | 'environment';

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
  const [slowNote, setSlowNote] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerLike | null>(null);
  const counterRef = useRef<RepCounter | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastLiveRef = useRef<string>('');
  const detectMsRef = useRef<number[]>([]);
  const detectErrorStreakRef = useRef(0);
  const phaseRef = useRef<UiPhase>('idle');
  phaseRef.current = phase;

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
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
        const frameResult = counter.processFrame({ landmarks: marks, timestampMs: t0 });
        detectErrorStreakRef.current = 0;
        const dt = performance.now() - t0;
        detectMsRef.current.push(dt);
        if (detectMsRef.current.length > 30) detectMsRef.current.shift();
        if (detectMsRef.current.length === 30) {
          const avg =
            detectMsRef.current.reduce((s, v) => s + v, 0) / detectMsRef.current.length;
          setSlowNote((prev) => (avg > 120 ? true : prev));
        }
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
  }, [stopLoop, stopTracks]);

  const start = useCallback(async () => {
    setError(null);
    setSummary(null);
    setSlowNote(false);
    setLive({ reps: 0, cueCode: null, unclear: false, unclearReason: null, unclearDetail: null, noPerson: false, phase: 'top', angleDeg: null });
    lastLiveRef.current = '';
    detectMsRef.current = [];
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
  }, [attachStream, facing, lift, loop, stopLoop, stopTracks]);

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

  const endSet = useCallback(
    (pain: boolean) => {
      const counter = counterRef.current;
      stopLoop();
      stopTracks();
      const result = counter
        ? pain
          ? counter.requestPainStop(performance.now())
          : counter.endSet('completed', performance.now())
        : null;
      setSummary(result);
      setPhase('summary');
    },
    [stopLoop, stopTracks]
  );

  // Unmount: never leave the camera or the model running.
  useEffect(
    () => () => {
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
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
  const mirrored = facing === 'user';

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
          <p className="text-xs text-text-secondary">{t('formcheck.loading')}</p>
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

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void switchCamera()}
                className="py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
              >
                <SwitchCamera className="w-4 h-4" /> {t('formcheck.switchCamera')}
              </button>
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
              <button
                type="button"
                onClick={() => void start()}
                className="btn-primary py-1.5 px-3 text-xs font-bold cursor-pointer flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> {t('formcheck.retry')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
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
