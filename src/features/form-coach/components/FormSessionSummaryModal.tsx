/**
 * ASCEND Form Coach — Post-Set Movement Summary
 *
 * Grounded report presenting verified measurements, depth consistency,
 * rep-by-rep timing, evidence-based observations, and manual rep correction.
 * Adheres strictly to the NO arbitrary 0-100 form score policy.
 */

import React, { useState } from 'react';
import { FormSessionSummary, SquatDepthClassification, getRepStatus, isValidRep } from '../models/form-session.types';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { FormSessionRepository } from '../repositories/FormSessionRepository';
import { useToast } from '@/components/ui/Toast';

/** UI-string map for the depth classification enum (P1-1): the raw
 * values ('below_parallel', …) never render — not even with the
 * underscores swapped for spaces. */
const DEPTH_LABEL_KEYS: Record<SquatDepthClassification, StringKey> = {
  below_parallel: 'formCoach.depthBelowParallel',
  parallel: 'formCoach.depthParallel',
  above_parallel: 'formCoach.depthAboveParallel',
  unknown: 'formCoach.depthUnknown',
};

interface FormSessionSummaryModalProps {
  summary: FormSessionSummary;
  workoutName?: string;
  /** How the exercise was chosen, e.g. "Detected: Conventional
   * Deadlift" — composed by the caller (already localized). */
  detectionNote?: string | null;
  /** Correction options for the "Wrong exercise? Change" picker —
   * one per other supported exercise (label = the exercise's name),
   * present only when detection chose the exercise. */
  rerunOptions?: { id: string; label: string }[];
  onRerunAs?: (id: string) => void;
  onClose: () => void;
  onSavedToWorkout?: () => void;
  onAnalyzeAnother?: () => void;
}

export default function FormSessionSummaryModal({
  summary,
  detectionNote,
  rerunOptions,
  onRerunAs,
  onClose,
  onSavedToWorkout,
  onAnalyzeAnother,
}: FormSessionSummaryModalProps) {
  const toast = useToast();
  const { t } = useTranslation();
  const [correctedReps, setCorrectedReps] = useState<number>(summary.totalValidReps);
  const [isEditingReps, setIsEditingReps] = useState(false);
  const [showRepDetails, setShowRepDetails] = useState(false);
  const [showRerunPicker, setShowRerunPicker] = useState(false);
  const [isSaved, setIsSaved] = useState(summary.savedToWorkout);

  const handleSaveToWorkout = () => {
    const success = FormSessionRepository.applyToActiveWorkout(
      summary,
      summary.exerciseName,
      summary.setIndex,
      correctedReps
    );

    if (success) {
      setIsSaved(true);
      toast.success('Form Coach results applied to workout!');
      onSavedToWorkout?.();
    } else {
      // Standalone session saved locally
      FormSessionRepository.saveSession({
        ...summary,
        userCorrectedReps: correctedReps,
      });
      toast.info('Session saved to Form Coach history');
      onClose();
    }
  };

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto p-4 justify-between animate-fade-in text-text-primary overflow-y-auto">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div>
            <span className="text-2xs font-mono uppercase tracking-wider text-accent-text">
              Post-Set Analysis
            </span>
            <h2 className="text-xl font-bold tracking-tight">{summary.exerciseName}</h2>
            {detectionNote && (
              <div className="mt-1 space-y-1.5">
                <span className="text-2xs font-medium text-text-secondary block">{detectionNote}</span>
                {onRerunAs && rerunOptions && rerunOptions.length > 0 && (
                  <div>
                    {/* P1-1: ONE clear correction control instead of
                        a cluster of tiny underlined links. The picker
                        rows are full-width, ≥44px touch targets. */}
                    <button
                      type="button"
                      onClick={() => setShowRerunPicker((prev) => !prev)}
                      aria-expanded={showRerunPicker}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl border border-border-subtle bg-surface-elevated text-xs font-semibold text-accent-text cursor-pointer"
                    >
                      {t('formCoach.wrongExercise')}
                      {showRerunPicker ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {showRerunPicker && (
                      <div className="mt-1.5 rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
                        <span className="block px-3 pt-2.5 text-2xs font-mono uppercase tracking-wider text-text-muted">
                          {t('formCoach.rerunPickerTitle')}
                        </span>
                        {rerunOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onRerunAs(opt.id)}
                            className="w-full min-h-[44px] px-3 py-2.5 flex items-center text-left text-sm font-medium text-text-primary hover:bg-surface-highlight transition-colors cursor-pointer"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-text-muted hover:text-text-primary"
            aria-label="Close summary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rep & Timing Overview Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Reps — or, for a plank session, the hold itself: a hold
              has no reps, and showing "0 valid reps" for a good hold
              would misreport what was measured. */}
          {summary.holdDurationSeconds !== undefined ? (
            <div className="p-3 rounded-2xl bg-surface-elevated border border-border-subtle flex flex-col items-center justify-center text-center">
              <span className="text-2xs uppercase font-mono text-text-muted">Hold</span>
              <span className="text-2xl font-black text-text-primary my-1">
                {summary.holdDurationSeconds}s
              </span>
              <span className="text-2xs text-text-secondary">
                In line {summary.alignedHoldPercent ?? 0}% of the hold
              </span>
            </div>
          ) : (
          <div className="p-3 rounded-2xl bg-surface-elevated border border-border-subtle flex flex-col items-center justify-center text-center">
            <span className="text-2xs uppercase font-mono text-text-muted">Valid Reps</span>
            {isEditingReps ? (
              <div className="flex items-center space-x-1 my-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={correctedReps}
                  onChange={(e) => setCorrectedReps(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-14 text-center font-bold text-xl bg-surface border-accent rounded-lg text-text-primary py-0.5"
                />
              </div>
            ) : (
              <div className="flex items-center space-x-1 my-1">
                <span className="text-2xl font-black text-text-primary">{correctedReps}</span>
                <button
                  type="button"
                  onClick={() => setIsEditingReps(true)}
                  aria-label="Edit rep count"
                  className="text-text-muted hover:text-accent p-0.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* P0-3: the tile reads "X valid, Y unverified of Z
                detected" — the big number is the (user-correctable)
                valid count, the caption carries the unverified and
                detected counts so an unjudgeable rep is never
                silently lumped in with failures. */}
            <span className="text-2xs text-text-secondary">
              {(summary.totalUnverifiedReps ?? 0) > 0
                ? t('formCoach.unverifiedOfDetected', {
                    unverified: summary.totalUnverifiedReps ?? 0,
                    detected: summary.totalDetectedReps,
                  })
                : t('formCoach.detectedLine', { detected: summary.totalDetectedReps })}
            </span>
          </div>
          )}

          {/* Set Duration */}
          <div className="p-3 rounded-2xl bg-surface-elevated border border-border-subtle flex flex-col items-center justify-center text-center">
            <span className="text-2xs uppercase font-mono text-text-muted">Duration</span>
            <span className="text-2xl font-black text-text-primary my-1">{summary.durationSeconds}s</span>
            <span className="text-2xs text-text-secondary">Total set</span>
          </div>

          {/* Tempo — the report's one per-rep time figure: the mean
              per-rep duration from the reps' own timestamps when it
              reconstructs the set, "Tempo unavailable" when it does
              not (P0-3; see services/analysis/tempo.ts). */}
          <div className="p-3 rounded-2xl bg-surface-elevated border border-border-subtle flex flex-col items-center justify-center text-center">
            <span className="text-2xs uppercase font-mono text-text-muted">Tempo</span>
            <span className="text-2xl font-black text-text-primary my-1">
              {summary.tempoSeconds != null ? `${summary.tempoSeconds}s` : '—'}
            </span>
            <span className="text-2xs text-text-secondary">
              {summary.tempoSeconds != null
                ? t('formCoach.avgPerRep')
                : t('formCoach.tempoUnavailable')}
            </span>
          </div>
        </div>

        {/* Movement Observations */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Technique & Camera Observations
            </h3>
            <span className="text-2xs text-text-muted">Evidence-based</span>
          </div>

          {summary.observations.length === 0 ? (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-start space-x-2.5 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Consistent Technique</span>
                <p className="text-text-secondary text-2xs mt-0.5">
                  {summary.exerciseId === 'deadlift'
                    ? 'Full body was tracked reliably with consistent lockouts throughout the set.'
                    : summary.exerciseId === 'squat'
                      ? 'Full body was tracked reliably with consistent depth throughout the set.'
                      : summary.exerciseId === 'plank'
                        ? 'Your body was tracked reliably throughout the hold.'
                        : 'Full body was tracked reliably throughout the set.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {summary.observations.map((obs) => (
                <div
                  key={obs.id}
                  className="p-3 rounded-xl bg-surface-elevated border border-border-subtle flex items-start space-x-2.5 text-xs"
                >
                  {obs.severity === 'alert' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  ) : obs.severity === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-text-primary">{obs.title}</span>
                      {obs.count > 1 && (
                        <span className="px-1.5 py-0.5 rounded text-2xs bg-surface-highlight font-mono text-text-muted">
                          x{obs.count}
                        </span>
                      )}
                    </div>
                    <p className="text-text-secondary text-2xs leading-relaxed">{obs.message}</p>
                    {obs.evidence && (
                      <p className="text-text-muted text-2xs font-mono bg-surface-highlight/60 px-2 py-1 rounded">
                        Evidence: {obs.evidence}
                      </p>
                    )}
                    {obs.limitation && (
                      <p className="text-text-muted text-2xs italic">Note: {obs.limitation}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rep-by-Rep Breakdown (Collapsible) */}
        {summary.reps.length > 0 && (
          <div className="border border-border-subtle rounded-2xl overflow-hidden bg-surface-elevated">
            <button
              type="button"
              onClick={() => setShowRepDetails((prev) => !prev)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-surface-highlight/50 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-text-primary">Rep-by-Rep Data</span>
                <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-surface-highlight text-text-muted">
                  {t(summary.reps.length === 1 ? 'formCoach.repOne' : 'formCoach.repOther', {
                    count: summary.reps.length,
                  })}
                </span>
              </div>
              {showRepDetails ? (
                <ChevronUp className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              )}
            </button>

            {showRepDetails && (
              <div className="p-3 pt-0 space-y-2 border-t border-border-subtle/50">
                {summary.reps.map((rep) => (
                  <div
                    key={rep.repNumber}
                    className="p-2.5 rounded-xl bg-surface-highlight flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="font-mono font-bold text-accent-text w-5">
                        #{rep.repNumber}
                      </span>
                      {summary.exerciseId === 'deadlift' ? (
                        <div>
                          <span className="font-medium text-text-primary">
                            Hip: {rep.minHipAngleDeg ?? '—'}°
                          </span>
                          <span className="text-2xs text-text-muted block">
                            Lockout:{' '}
                            {getRepStatus(rep) === 'unverified'
                              ? t('formCoach.lockoutUnverifiedShort')
                              : rep.lockoutAchieved
                                ? 'Full'
                                : 'Not reached'}
                          </span>
                        </div>
                      ) : summary.exerciseId === 'squat' ? (
                        <div>
                          <span className="font-medium text-text-primary">
                            Knee: {rep.minKneeAngleDeg}°
                          </span>
                          <span className="text-2xs text-text-muted block">
                            Depth: {t(DEPTH_LABEL_KEYS[rep.estimatedDepth])}
                          </span>
                        </div>
                      ) : summary.exerciseId === 'lunge' ? (
                        <div>
                          <span className="font-medium text-text-primary">
                            Knee: {rep.minKneeAngleDeg}°
                          </span>
                          <span className="text-2xs text-text-muted block">
                            Torso lean: {rep.maxTorsoInclinationDeg}°
                          </span>
                        </div>
                      ) : summary.exerciseId === 'lateral-raise' ? (
                        <div>
                          <span className="font-medium text-text-primary">
                            Peak:{' '}
                            {(rep.peakWristHeightRatio ?? -1) >= -0.15
                              ? 'shoulder height'
                              : (rep.peakWristHeightRatio ?? -1) >= -0.5
                                ? 'near shoulder'
                                : 'below shoulder'}
                          </span>
                          <span className="text-2xs text-text-muted block">
                            {isValidRep(rep) ? 'Complete' : (rep.invalidReason ?? 'Incomplete')}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="font-medium text-text-primary">
                            Elbow: {rep.minElbowAngleDeg ?? '—'}°
                          </span>
                          <span className="text-2xs text-text-muted block">
                            {rep.lockoutAchieved !== undefined
                              ? `Lockout: ${rep.lockoutAchieved ? 'Full' : 'Not reached'}`
                              : isValidRep(rep)
                                ? 'Complete'
                                : (rep.invalidReason ?? 'Incomplete')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-text-secondary">{rep.durationSeconds}s</span>
                      <span className="text-2xs text-text-muted block">
                        ↓{rep.descentDurationSeconds}s ↑{rep.ascentDurationSeconds}s
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Safety & scope note — technique feedback only, never medical advice */}
      <p className="pt-3 text-2xs leading-relaxed text-text-muted flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" />
        <span>
          Technique feedback from camera measurements — not medical advice. Stop if you feel pain or
          discomfort; if pain persists, see a qualified professional.
        </span>
      </p>

      {/* Action Footer */}
      <div className="pt-4 flex items-center space-x-2.5 border-t border-border-subtle mt-4">
        {onAnalyzeAnother && (
          <button
            type="button"
            onClick={onAnalyzeAnother}
            className="flex-1 py-3 px-3 rounded-xl border border-border-subtle bg-surface-elevated text-text-secondary font-medium text-xs sm:text-sm hover:bg-surface transition-colors text-center"
          >
            Another Video
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 px-3 rounded-xl border border-border-subtle bg-surface-elevated text-text-secondary font-medium text-xs sm:text-sm hover:bg-surface transition-colors text-center"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleSaveToWorkout}
          className="flex-1 py-3 px-3 rounded-xl bg-accent text-accent-on font-semibold text-xs sm:text-sm flex items-center justify-center space-x-1.5 shadow-lg shadow-accent/20 hover:opacity-95 transition-opacity"
        >
          <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{isSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>
    </div>
  );
}
