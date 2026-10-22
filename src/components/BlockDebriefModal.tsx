"use client";

/**
 * BlockDebriefModal — PR-C (§5). Shown when a coach block has run its
 * course: completion vs plan, per-main-lift e1RM change from the
 * block's first week to its test week, what the coach learned, and the
 * hand-off — "Start next block" completes this block and opens the
 * PR-B intake (which prefills from everything the model now knows,
 * including the new weak points). Acknowledging with "Done" also
 * completes the block; closing with X leaves it open for later.
 */
import React, { useMemo, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { buildBlockDebrief, type BlockDebrief } from '@/lib/weekly-review';
import type { ActiveCoachBlock } from '@/lib/block-engine';
import { Flag, X } from 'lucide-react';

interface BlockDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: ActiveCoachBlock | null;
  onStartNextBlock: () => void;
}

export default function BlockDebriefModal({ isOpen, onClose, block, onStartNextBlock }: BlockDebriefModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t } = useTranslation();
  const workouts = useStore((s) => s.workouts);
  const plannedWorkouts = useStore((s) => s.plannedWorkouts);
  const weeklySchedule = useStore((s) => s.weeklySchedule);
  const athleteModel = useStore((s) => s.athleteModel);
  const completeActiveBlock = useStore((s) => s.completeActiveBlock);

  const debrief: BlockDebrief | null = useMemo(() => {
    if (!isOpen || !block) return null;
    return buildBlockDebrief({ block, workouts, plannedWorkouts, weeklySchedule, athleteModel });
  }, [isOpen, block, workouts, plannedWorkouts, weeklySchedule, athleteModel]);

  if (!isOpen || !block || !debrief) return null;

  const handleDone = () => {
    completeActiveBlock();
    onClose();
  };

  const handleNext = () => {
    completeActiveBlock();
    onClose();
    onStartNextBlock();
  };

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-lg w-full p-5 space-y-4 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Flag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-primary leading-tight">
                {t('weeklyReview.debriefTitle', { name: debrief.blockName })}
              </h3>
              <p className="text-2xs text-text-muted font-mono">
                {t('weeklyReview.debriefSubtitle', { date: debrief.endDate })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-text-primary font-semibold">{debrief.completionLine}</p>

        {debrief.liftChanges.length > 0 && (
          <div>
            <p className="text-3xs font-mono font-bold uppercase text-text-muted mb-1.5">
              {t('weeklyReview.debriefLiftsTitle')}
            </p>
            <div className="space-y-1">
              {debrief.liftChanges.map((l) => (
                <p key={l.name} className="text-xs text-text-secondary">
                  {l.line}
                </p>
              ))}
            </div>
          </div>
        )}

        {debrief.learned.length > 0 && (
          <div>
            <p className="text-3xs font-mono font-bold uppercase text-text-muted mb-1.5">
              {t('weeklyReview.debriefLearnedTitle')}
            </p>
            <div className="space-y-1">
              {debrief.learned.map((line, i) => (
                <p key={i} className="text-xs text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={handleNext} className="btn-primary flex-1 py-2.5 font-bold">
            {t('weeklyReview.debriefNextBlock')}
          </button>
          <button type="button" onClick={handleDone} className="btn-secondary px-4 py-2.5 font-semibold">
            {t('weeklyReview.debriefDone')}
          </button>
        </div>
      </div>
    </div>
  );
}
