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
  // No exerciseName prop on purpose: the only analyzer is the Barbell Back
  // Squat, and every session is stamped with that canonical identity by the
  // analyzer itself. Callers must not imply another exercise was analyzed.
  workoutId?: string;
  setIndex?: number;
  workoutName?: string;
}

export default function FormCoachModal({
  isOpen,
  onClose,
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
    error,
    videoRef,
    latestLandmarksRef,
    repCount,
    currentPhase,
    activeCue,
    currentKneeAngleDeg,
    minKneeAngleDeg,
    detectedSide,
    isReady,
    analyzeVideo,
    completeAnalysis,
    reset,
    cleanup,
  } = useFormCoach({
    exerciseId: 'squat',
    workoutId,
    setIndex,
  });

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
        <div className={state === 'analyzing' ? 'relative w-full aspect-video bg-black rounded-t-2xl overflow-hidden' : 'hidden'}>
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
              <span>{repCount} Reps</span>
            </span>
            {currentKneeAngleDeg !== null && (
              <span className="px-2.5 py-1 rounded-full text-2xs font-mono font-bold bg-black/70 backdrop-blur-md text-sky-400 border border-sky-400/30">
                {Math.round(currentKneeAngleDeg)}° Knee
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full text-2xs font-mono capitalize bg-black/70 backdrop-blur-md text-text-primary border border-border-subtle">
              {currentPhase}
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
                  <h2 className="text-lg font-bold text-text-primary">ASCEND Form Coach</h2>
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
                  SQ
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">Barbell Back Squat</span>
                    <span className="px-1.5 py-0.5 rounded text-2xs font-mono uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Active
                    </span>
                  </div>
                  <p className="text-2xs text-text-muted">Squats only — Form Coach analyzes the barbell back squat, filmed from the side. It cannot grade deadlifts or other lifts yet, and a video of another exercise will not produce a report.</p>
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
              <p className="text-xs text-text-secondary mt-1 max-w-xs">
                Drag and drop your exercise video here, or <span className="text-accent-text font-medium underline">browse files</span>
              </p>
              <span className="text-2xs text-text-muted mt-2 font-mono">
                Supports MP4, MOV, or WebM
              </span>
            </div>

            {/* Privacy & Recording Tips */}
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5 text-xs text-emerald-400">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-2xs leading-relaxed text-text-secondary">
                  <span className="font-semibold text-emerald-400 block">100% On-Device & Private</span>
                  Video frames are analyzed locally in your browser using WebAssembly. Your video is never uploaded to any cloud server.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-elevated border border-border-subtle flex items-start gap-2.5 text-2xs text-text-secondary">
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-text-primary block">Filming Recommendation</span>
                  Film from a side-profile angle at hip height. Ensure your head, hips, knees, and feet remain in frame throughout the set.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-2xs text-text-secondary">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-400 block">Lift Safely</span>
                  Stop the set if you feel pain or discomfort. Form Coach gives technique feedback from video measurements — it is not medical advice. If pain persists, see a qualified professional.
                </div>
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
                Analyzing Squat Mechanics…
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
                <span className="text-2xs uppercase font-mono text-text-muted block">Reps Found</span>
                <span className="text-xl font-bold font-mono text-text-primary">{repCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-elevated border border-border-subtle">
                <span className="text-2xs uppercase font-mono text-text-muted block">Min Knee Angle</span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {minKneeAngleDeg !== null ? `${Math.round(minKneeAngleDeg)}°` : '--'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-elevated border border-border-subtle">
                <span className="text-2xs uppercase font-mono text-text-muted block">Tracking</span>
                <span className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1 mt-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Active
                </span>
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

        {/* ── State 5: Not A Squat (D6) ─────────────────────────────────── */}
        {state === 'not-squat' && (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-text-primary">This Doesn’t Look Like a Squat</h3>
                <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
                  Form Coach tracked your movement, but the pattern is a hip hinge — the hips fold
                  deeply while the knees stay comparatively straight — like a deadlift, not a squat.
                  Form Coach currently analyzes barbell back squats only, so no report was generated
                  and nothing was saved.
                </p>
              </div>
            </div>

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
