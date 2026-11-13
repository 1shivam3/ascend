/**
 * ASCEND Form Coach — Video Form Check Modal
 *
 * Streamlined, privacy-first movement analysis workflow:
 * User uploads workout video -> on-device MediaPipe pose detection runs ->
 * instant comprehensive biomechanical form report (reps, depth, cadence, observations).
 *
 * 100% on-device WebAssembly inference. No live camera permissions or video cloud uploads.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useAppNavigation } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';
import { useFormCoach } from '../hooks/useFormCoach';
import {
  FormExerciseId,
  FORM_EXERCISE_IDS,
  FORM_EXERCISE_NAMES,
} from '../analyzers/ExerciseAnalyzer';
import type { StringKey } from '@/lib/i18n/en';
import type { MovementPhase } from '../models/form-feedback.types';
import PoseOverlay from './PoseOverlay';
import FormSessionSummaryModal from './FormSessionSummaryModal';
import {
  Upload,
  Video,
  VideoOff,
  ShieldCheck,
  AlertCircle,
  X,
  RefreshCw,
  FileVideo,
  Activity,
  CheckCircle,
  ChevronRight,
  Info,
} from 'lucide-react';

interface FormCoachModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Optional preset from an in-workout entry: the exercise the user is
  // performing. When set, that exercise's analyzer grades the video
  // (with a detection-mismatch choice if the video clearly shows a
  // different exercise). When unset (generic entries), the movement is
  // auto-detected. Either way the session's canonical exercise
  // identity ("Barbell Back Squat", "Conventional Deadlift", …) is
  // stamped by the analyzer itself — callers never name what was
  // analyzed.
  presetExerciseId?: FormExerciseId;
  workoutId?: string;
  setIndex?: number;
  workoutName?: string;
}

const EXERCISE_NAMES = FORM_EXERCISE_NAMES;

/** Two-letter card badge per exercise. */
const EXERCISE_INITIALS: Record<FormExerciseId, string> = {
  squat: 'SQ',
  deadlift: 'DL',
  'overhead-press': 'OP',
  'bent-over-row': 'BR',
  'bicep-curl': 'BC',
  lunge: 'LU',
  'push-up': 'PU',
  'lateral-raise': 'LR',
  plank: 'PL',
  'bench-press': 'BP',
};

/** UI-string map for the engine's MovementPhase values (P1-1): the
 * raw enum ('tracking_lost', 'lockout', …) must never reach
 * the screen — every phase renders through this map, en+hi. */
const PHASE_LABEL_KEYS: Record<MovementPhase, StringKey> = {
  standing: 'formCoach.phaseStanding',
  descending: 'formCoach.phaseDescending',
  bottom: 'formCoach.phaseBottom',
  ascending: 'formCoach.phaseAscending',
  lockout: 'formCoach.phaseLockout',
  tracking_lost: 'formCoach.phaseTrackingLost',
};

/** Scope line shown on the select card for a preset exercise. */
const EXERCISE_SCOPE_KEYS: Record<FormExerciseId, StringKey> = {
  squat: 'formCoach.squatScope',
  deadlift: 'formCoach.deadliftScope',
  'overhead-press': 'formCoach.pressScope',
  'bent-over-row': 'formCoach.rowScope',
  'bicep-curl': 'formCoach.curlScope',
  lunge: 'formCoach.lungeScope',
  'push-up': 'formCoach.pushUpScope',
  'lateral-raise': 'formCoach.raiseScope',
  plank: 'formCoach.plankScope',
  'bench-press': 'formCoach.benchScope',
};

export default function FormCoachModal({
  isOpen,
  onClose,
  presetExerciseId,
  workoutId,
  setIndex,
  workoutName,
}: FormCoachModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { registerBackHandler } = useAppNavigation();
  const { t } = useTranslation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    state,
    progressPercent,
    videoFileName,
    summary,
    detection,
    unsupportedInfo,
    leaningExerciseId,
    error,
    videoRef,
    latestLandmarksRef,
    repCount,
    currentPhase,
    activeCue,
    currentKneeAngleDeg,
    minKneeAngleDeg,
    minHipAngleDeg,
    detectedSide,
    isReady,
    analyzeVideo,
    completeAnalysis,
    rerunAs,
    acceptPreset,
    reset,
    cleanup,
  } = useFormCoach({
    presetExerciseId,
    workoutId,
    setIndex,
  });

  // The report header's detection line and the correction control:
  // when detection chose the exercise, the user can re-run the same
  // video as any other supported exercise if the pick was wrong.
  const detectionNote = detection
    ? detection.source === 'detected'
      ? t('formCoach.detected', { exercise: detection.exerciseName })
      : detection.source === 'preset'
        ? t('formCoach.presetNote', { exercise: detection.exerciseName })
        : t('formCoach.correctedNote', { exercise: detection.exerciseName })
    : null;
  const rerunOptions: FormExerciseId[] =
    detection && detection.source === 'detected'
      ? FORM_EXERCISE_IDS.filter((id) => id !== detection.exerciseId)
      : [];

  // Which analyzer the live HUD is following (preset, or the current
  // detection leaning in auto mode) — decides the min-angle tile.
  const hudExerciseId: FormExerciseId =
    presetExerciseId ?? leaningExerciseId ?? 'squat';

  // The live counter tallies movement cycles the followed analyzer has
  // closed so far — attempts, not validated reps (validation happens
  // in finishSet: e.g. deadlift pulls that never lock out are counted
  // here live but land as incomplete attempts in the report). The
  // label must say so: deadlift attempts are "pulls" (the word its
  // report uses); every other exercise gets the neutral "Detected",
  // matching the report's "Detected: N" line.
  //
  // Why the live count and the report's final count can differ
  // (P0-3): (1) the live count includes attempts the report splits
  // into valid / failed / unverified — it is a "detected" tally, not
  // a valid tally; (2) in auto mode the HUD follows the classifier's
  // current leaning, which can switch mid-stream, so cycles closed by
  // a previously-followed analyzer were counted live but belong to a
  // different exercise's tally; (3) finishing early ("View Report
  // Now") discards any cycle still in flight. The report is built
  // solely from the winning analyzer's finishSet counts, and it is
  // the only count the report shows.
  const hudCountLabel =
    hudExerciseId === 'deadlift'
      ? t('formCoach.livePullsDetected')
      : t('formCoach.liveDetected');
  const hudCountNoun =
    hudExerciseId === 'deadlift' ? t('formCoach.livePulls') : t('formCoach.liveDetected');

  // Overlay badge count, pluralized (P1-1): "1 pull", "2 pulls".
  // The non-deadlift tally is labelled with the adjective "Detected"
  // ("3 Detected"), which does not inflect.
  const hudBadgeCount =
    hudExerciseId === 'deadlift'
      ? t(repCount === 1 ? 'formCoach.pullOne' : 'formCoach.pullOther', { count: repCount })
      : `${repCount} ${hudCountNoun}`;

  // Angle tile (P1-1): "Joint angle" until the exercise is actually
  // known (preset chosen, or the classifier is leaning somewhere);
  // after that, the metric that drives the exercise — hip for the
  // hinge pattern, knee for the squat pattern. A deadlift can never
  // be labelled "Min Knee Angle" again: before detection the HUD
  // silently followed the squat analyzer, which is how the audit's
  // deadlift got a knee-angle tile.
  const hudExerciseKnown = presetExerciseId != null || leaningExerciseId != null;
  const hudAngleMetric: 'hip' | 'knee' | 'joint' = !hudExerciseKnown
    ? 'joint'
    : hudExerciseId === 'deadlift'
      ? 'hip'
      : hudExerciseId === 'squat' || hudExerciseId === 'lunge'
        ? 'knee'
        : 'joint';
  const hudAngleLabel =
    hudAngleMetric === 'hip'
      ? t('formCoach.minHipAngle')
      : hudAngleMetric === 'knee'
        ? t('formCoach.minKneeAngle')
        : t('formCoach.jointAngle');
  const hudAngleValue =
    hudAngleMetric === 'hip'
      ? minHipAngleDeg
      : hudAngleMetric === 'knee'
        ? minKneeAngleDeg
        : (minKneeAngleDeg ?? minHipAngleDeg);

  // Tracking tile and overlay phase badge read the SAME state
  // (currentPhase) — the audit caught the badge saying
  // "Tracking_lost" while this tile claimed "Active", because the
  // tile was a hard-coded string. Lost tracking now shows on both.
  const hudTrackingLost = currentPhase === 'tracking_lost';

  // Video preview sizing (P1-1): the analyzing container takes the
  // video's own aspect ratio once metadata lands, capped by height,
  // so a vertical video is not pillarboxed inside a wide black box.
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoAspect(video.videoWidth / video.videoHeight);
      }
    };
    update();
    video.addEventListener('loadedmetadata', update);
    return () => video.removeEventListener('loadedmetadata', update);
  }, [videoRef, state]);

  // Touch devices have no drag-and-drop (P2-5): the upload prompt
  // says "Choose a video" on a coarse pointer and keeps the
  // drag-and-drop wording only where a fine pointer exists. Read
  // once at first render (client-only modal; guarded for SSR).
  const [isCoarsePointer] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
  );

  // Handle hardware / browser back button safely
  useEffect(() => {
    if (!isOpen) return;

    return registerBackHandler(() => {
      if (state === 'analyzing') {
        reset();
        return true;
      }
      handleSafeClose();
      return true;
    }, 120);
  }, [isOpen, state, registerBackHandler, reset]);

  const handleSafeClose = useCallback(() => {
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|webm|m4v)$/i)) {
        alert('Please select a valid video file (.mp4, .mov, or .webm).');
        return;
      }
      await analyzeVideo(file);
    },
    [analyzeVideo]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      {...dialogProps}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden animate-fade-in"
    >
      <div className="bg-surface sm:bg-surface-elevated border border-border-subtle rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl relative max-h-[92vh]">
        {/* Hidden persistent video element for reliable MediaPipe frame pipeline */}
        <div
          className={
            state === 'analyzing'
              ? 'relative mx-auto w-full bg-black rounded-t-2xl overflow-hidden'
              : 'hidden'
          }
          style={
            state === 'analyzing'
              ? {
                  aspectRatio: videoAspect ?? 16 / 9,
                  // Cap the height; the width follows from the aspect
                  // ratio so vertical videos render at their own
                  // shape instead of inside a wide black box.
                  maxWidth: videoAspect ? `calc(58vh * ${videoAspect})` : undefined,
                }
              : undefined
          }
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          <PoseOverlay
            landmarksRef={latestLandmarksRef}
            videoRef={videoRef}
            detectedSide={detectedSide}
            isReady={isReady}
            currentKneeAngleDeg={currentKneeAngleDeg}
          />

          {/* Floating Live Telemetry Badges during analysis */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
            <span className="px-2.5 py-1 rounded-full text-2xs font-mono font-bold bg-black/70 backdrop-blur-md text-accent border border-accent/30 flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-accent" />
              <span>{hudBadgeCount}</span>
            </span>
            {currentKneeAngleDeg !== null && (
              <span className="px-2.5 py-1 rounded-full text-2xs font-mono font-bold bg-black/70 backdrop-blur-md text-sky-400 border border-sky-400/30">
                {Math.round(currentKneeAngleDeg)}° Knee
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full text-2xs font-mono bg-black/70 backdrop-blur-md text-text-primary border border-border-subtle">
              {t(PHASE_LABEL_KEYS[currentPhase])}
            </span>
          </div>
        </div>

        {/* ── State 1: Select & Upload Video ───────────────────────────────── */}
        {state === 'select' && (
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-text-primary">{t('tools.formCoachTitle')}</h2>
                  <p className="text-2xs text-text-secondary">On-device video movement & rep analysis</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSafeClose}
                className="w-8 h-8 rounded-full bg-surface-elevated hover:bg-surface flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Exercise Selection Card */}
            <div className="p-3.5 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold text-xs font-mono">
                  {presetExerciseId ? EXERCISE_INITIALS[presetExerciseId] : 'AD'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {presetExerciseId
                        ? EXERCISE_NAMES[presetExerciseId]
                        : t('formCoach.autoCardTitle')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-2xs font-mono uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {presetExerciseId ? 'Active' : t('formCoach.autoCardBadge')}
                    </span>
                  </div>
                  <p className="text-2xs text-text-muted">
                    {presetExerciseId
                      ? t(EXERCISE_SCOPE_KEYS[presetExerciseId])
                      : t('formCoach.autoScope')}
                  </p>
                </div>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`p-7 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer group ${
                isDragOver
                  ? 'border-accent bg-accent/10 scale-[1.01]'
                  : 'border-border-subtle hover:border-accent/60 bg-surface/60 hover:bg-surface-elevated/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*"
                onChange={handleInputChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-accent/15 group-hover:bg-accent/25 text-accent flex items-center justify-center mb-3 transition-colors">
                <Upload className="w-6 h-6 group-hover:-translate-y-0.5 transition-transform" />
              </div>
              <h3 className="text-sm font-bold text-text-primary">Upload Workout Video</h3>
              {isCoarsePointer ? (
                <p className="text-xs font-semibold text-accent-text mt-1">
                  {t('formCoach.chooseVideo')}
                </p>
              ) : (
                <p className="text-xs text-text-secondary mt-1 max-w-xs">
                  {t('formCoach.dragDropPrefix')}{' '}
                  <span className="text-accent-text font-medium underline">
                    {t('formCoach.browseFiles')}
                  </span>
                </p>
              )}
              <span className="text-2xs text-text-muted mt-2 font-mono">
                Supports MP4, MOV, or WebM
              </span>
            </div>

            {/* Privacy, filming, safety — ONE neutral card (P2-5).
                Same content as the previous three stacked colored
                callouts, without the three competing colors. The
                privacy line no longer names the tech (WebAssembly):
                it says what the user cares about — the video is
                analyzed on their phone and never uploaded. */}
            <div className="p-3.5 rounded-xl bg-surface-elevated border border-border-subtle space-y-2.5 text-2xs text-text-secondary">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-text-secondary" />
                <p className="leading-relaxed">
                  <span className="font-semibold text-text-primary">
                    {t('formCoach.privacyLead')}
                  </span>{' '}
                  {t('formCoach.privacyLine')}
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-text-secondary" />
                <p className="leading-relaxed">
                  <span className="font-semibold text-text-primary">
                    {t('formCoach.filmingLead')}
                  </span>{' '}
                  {t('formCoach.filmingLine')}
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-text-secondary" />
                <p className="leading-relaxed">
                  <span className="font-semibold text-text-primary">
                    {t('formCoach.safetyLead')}
                  </span>{' '}
                  {t('formCoach.safetyLine')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── State 2: Video Analyzing Progress ────────────────────────────── */}
        {state === 'analyzing' && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="space-y-1.5 text-center">
              <span className="text-2xs font-mono uppercase tracking-wider text-accent-text">
                Biomechanics Processing
              </span>
              <h3 className="text-base font-bold text-text-primary">
                {t('formCoach.analyzingTitle')}
              </h3>
              <p className="text-xs text-text-secondary">
                Tracking joint angles, depth transitions, and rep duration
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-2xs font-mono">
                <span className="text-text-muted">{videoFileName || 'Processing video…'}</span>
                <span className="font-bold text-accent-text">{progressPercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-surface-highlight border border-border-subtle overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-sky-400 transition-all duration-150 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Telemetry Preview Card */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2.5 rounded-xl bg-surface-elevated border border-border-subtle">
                <span className="text-2xs uppercase font-mono text-text-muted block">{hudCountLabel}</span>
                <span className="text-xl font-bold font-mono text-text-primary">{repCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-elevated border border-border-subtle">
                <span className="text-2xs uppercase font-mono text-text-muted block">
                  {hudAngleLabel}
                </span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {hudAngleValue !== null ? `${Math.round(hudAngleValue)}°` : '--'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-elevated border border-border-subtle">
                <span className="text-2xs uppercase font-mono text-text-muted block">
                  {t('formCoach.tracking')}
                </span>
                {hudTrackingLost ? (
                  <span className="text-xs font-semibold text-amber-400 flex items-center justify-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t('formCoach.phaseTrackingLost')}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1 mt-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('formCoach.trackingActive')}
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-2.5 px-4 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface text-text-secondary text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={completeAnalysis}
                className="flex-1 py-2.5 px-4 rounded-xl bg-accent text-accent-on text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer shadow-md shadow-accent/20"
              >
                View Report Now
              </button>
            </div>
          </div>
        )}

        {/* ── State 3: Post-Set Movement Summary Report ─────────────────────── */}
        {state === 'report' && summary && (
          <FormSessionSummaryModal
            summary={summary}
            workoutName={workoutName}
            detectionNote={detectionNote}
            rerunOptions={rerunOptions.map((id) => ({
              id,
              // Picker rows show the exercise name itself; the
              // "Wrong exercise? Change" button above them carries
              // the action wording (P1-1).
              label: EXERCISE_NAMES[id],
            }))}
            onRerunAs={(id) => rerunAs(id as FormExerciseId)}
            onClose={handleSafeClose}
            onSavedToWorkout={handleSafeClose}
            onAnalyzeAnother={reset}
          />
        )}

        {/* ── State 4: No Tracking (D4) ─────────────────────────────────── */}
        {state === 'no-tracking' && (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                <VideoOff className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-text-primary">Couldn’t Track Your Movement</h3>
                <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
                  Form Coach never found a trackable body position in this video, so there is no report to show. Refilming with the setup below usually fixes it:
                </p>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-text-secondary max-w-sm mx-auto list-disc list-inside">
              <li>Keep your whole body in frame, head to feet, for the entire set</li>
              <li>Film from the side at about hip height</li>
              <li>Use good, even light — avoid a bright window behind you</li>
              <li>Prop the phone steady and keep your feet visible the whole time</li>
            </ul>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSafeClose}
                className="py-2.5 px-5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface text-text-secondary text-xs font-medium cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={reset}
                className="py-2.5 px-5 rounded-xl bg-accent text-accent-on text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Another Video</span>
              </button>
            </div>
          </div>
        )}

        {/* ── State 5: Unsupported / Mismatch (auto-detect decline) ─────── */}
        {state === 'unsupported' && unsupportedInfo && (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-text-primary">
                  {unsupportedInfo.reason === 'mismatch'
                    ? t('formCoach.mismatchTitle', {
                        exercise: EXERCISE_NAMES[unsupportedInfo.detectedExerciseId],
                      })
                    : unsupportedInfo.reason === 'unknown'
                      ? t('formCoach.unsupportedUnknownTitle')
                      : t('formCoach.unsupportedInsufficientTitle')}
                </h3>
                <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
                  {unsupportedInfo.reason === 'mismatch'
                    ? t('formCoach.mismatchBody', {
                        preset: EXERCISE_NAMES[unsupportedInfo.presetExerciseId],
                        detected: EXERCISE_NAMES[unsupportedInfo.detectedExerciseId],
                      })
                    : unsupportedInfo.reason === 'unknown'
                      ? t('formCoach.unsupportedUnknownBody')
                      : t('formCoach.unsupportedInsufficientBody')}
                </p>
              </div>
            </div>

            <div className="pt-1 flex flex-col items-center gap-2.5">
              {unsupportedInfo.reason === 'mismatch' ? (
                <>
                  <button
                    type="button"
                    onClick={() => rerunAs(unsupportedInfo.detectedExerciseId)}
                    className="py-2.5 px-5 rounded-xl bg-accent text-accent-on text-xs font-semibold cursor-pointer"
                  >
                    {t('formCoach.analyseAs', {
                      exercise: EXERCISE_NAMES[unsupportedInfo.detectedExerciseId],
                    })}
                  </button>
                  <button
                    type="button"
                    onClick={acceptPreset}
                    className="py-2.5 px-5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface text-text-secondary text-xs font-medium cursor-pointer"
                  >
                    {t('formCoach.analyseAnyway', {
                      exercise: EXERCISE_NAMES[unsupportedInfo.presetExerciseId],
                    })}
                  </button>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm">
                  {FORM_EXERCISE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => rerunAs(id)}
                      className="py-2 px-3.5 rounded-xl bg-accent text-accent-on text-xs font-semibold cursor-pointer"
                    >
                      {t('formCoach.analyseAs', { exercise: EXERCISE_NAMES[id] })}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSafeClose}
                  className="py-2.5 px-5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface text-text-secondary text-xs font-medium cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="py-2.5 px-5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface text-text-secondary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Another Video</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── State 6: Error State ─────────────────────────────────────────── */}
        {state === 'error' && (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-text-primary">Unable to Process Video</h3>
              <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
                {error?.message || 'The video could not be decoded. Please make sure the file is a standard MP4, MOV, or WebM video.'}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSafeClose}
                className="py-2.5 px-5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface text-text-secondary text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reset}
                className="py-2.5 px-5 rounded-xl bg-accent text-accent-on text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Another Video</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
