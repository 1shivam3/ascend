'use client';

/**
 * FormCuesSheet — the single "Form cues" sheet for an exercise: the
 * animated demo (when one exists) plus the numbered how-to cues.
 *
 * Extracted from ActiveWorkoutScreen (declutter PR 1) so plan detail
 * can open the exact same sheet for a plan exercise — one surface,
 * one name ("Form cues"), no divergent copies. Surfaces render this
 * only for exercises that HAVE a form surface (cues and/or a demo);
 * check with `hasExerciseFormSurface` before offering the affordance.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';
import ExerciseDemo from '@/components/ExerciseDemo';
import { getExerciseFormCues, getExerciseHindiName } from '@/lib/exercise-library';
import { getDemoForExercise } from '@/lib/exercise-media';
import { useTranslation } from '@/lib/i18n';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useAppNavigation } from '@/lib/navigation';

/** True when the sheet would have anything to show for this exercise. */
export function hasExerciseFormSurface(name: string, language?: string): boolean {
  if (!name) return false;
  return getExerciseFormCues(name, language).length > 0 || getDemoForExercise(name) !== null;
}

export default function FormCuesSheet({
  exerciseName,
  onClose,
}: {
  exerciseName: string;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const { registerBackHandler } = useAppNavigation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(sheetRef, true, onClose);

  const formCues = useMemo(
    () => getExerciseFormCues(exerciseName, language),
    [exerciseName, language]
  );
  const demo = useMemo(() => getDemoForExercise(exerciseName), [exerciseName]);
  const hindiName = language === 'hi' ? getExerciseHindiName(exerciseName) : undefined;

  useEffect(() => {
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 110);
  }, [registerBackHandler, onClose]);

  return (
    <div ref={sheetRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-bold text-text-primary">{t('workout.formCuesHeading')}</h3>
              <p className="text-2xs text-text-muted">{exerciseName}</p>
              {/* Devanagari name in Hindi mode. */}
              {hindiName ? <p className="text-2xs text-text-secondary">{hindiName}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary"
            aria-label={t('workout.closeFormCues')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2.5">
          {demo && <ExerciseDemo name={exerciseName} />}
          {formCues.map((cue, idx) => (
            <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-bg-secondary border border-border/60">
              <span className="w-5 h-5 rounded-full bg-accent/15 text-accent-text text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5 font-mono">
                {idx + 1}
              </span>
              <p className="text-xs text-text-secondary leading-relaxed">{cue}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
