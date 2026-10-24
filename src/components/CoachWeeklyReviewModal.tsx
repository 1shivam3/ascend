"use client";

/**
 * CoachWeeklyReviewModal — PR-C (§5). The coach's weekly review:
 * what happened (numbers with their comparisons), what the coach
 * changed and why, ONE focus for next week, and next-week revisions
 * presented as proposals. Applying the schedule-move revision is an
 * explicit tap here — nothing in this modal edits silently (D3).
 * WeeklyRecapModal is a share card and is deliberately untouched.
 */
import React, { useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { renderLocalizedSentence } from '@/lib/coach-i18n';
import type { WeeklyReview } from '@/lib/weekly-review';
import { CalendarRange, Check, TrendingUp, X } from 'lucide-react';

interface CoachWeeklyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  review: WeeklyReview | null;
}

export default function CoachWeeklyReviewModal({ isOpen, onClose, review }: CoachWeeklyReviewModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t, language } = useTranslation();
  const markWeeklyReviewSeen = useStore((s) => s.markWeeklyReviewSeen);
  const applyScheduleRevision = useStore((s) => s.applyScheduleRevision);

  const weekMonday = review?.weekMonday;
  useEffect(() => {
    if (isOpen && weekMonday) markWeeklyReviewSeen(weekMonday);
  }, [isOpen, weekMonday, markWeeklyReviewSeen]);

  if (!isOpen || !review) return null;

  const scheduleMove = review.revisions.find((r) => r.kind === 'schedule_move');

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-lg w-full p-5 space-y-4 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <CalendarRange className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-primary leading-tight">
                {t('weeklyReview.title')}
              </h3>
              <p className="text-2xs text-text-muted font-mono">
                {review.weekMonday} → {review.weekSunday}
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

        {/* The one focus */}
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/30">
          <p className="text-2xs font-mono font-bold uppercase text-accent">
            {t('weeklyReview.focusLabel')}
          </p>
          <p className="text-sm font-bold text-text-primary mt-0.5">{renderLocalizedSentence(t, language, review.focus.headlineI18n, review.focus.headline)}</p>
          <p className="text-xs text-text-secondary mt-1">{renderLocalizedSentence(t, language, review.focus.detailI18n, review.focus.detail)}</p>
        </div>

        {review.painEscalation && review.focus.kind !== 'safety' && (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/30">
            <p className="text-xs text-text-secondary">{renderLocalizedSentence(t, language, review.painEscalationI18n, review.painEscalation)}</p>
          </div>
        )}

        {/* The week in numbers */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-bg-secondary border border-border/70">
            <p className="text-2xs font-mono font-bold uppercase text-text-muted">
              {t('weeklyReview.sessions')}
            </p>
            <p className="text-lg font-black text-text-primary">
              {review.sessionsCompleted}
              <span className="text-text-muted text-sm font-semibold"> / {review.sessionsPlanned}</span>
            </p>
            {review.missedDays.length > 0 && (
              <p className="text-2xs text-text-muted">
                {t('weeklyReview.missed', { days: review.missedDays.join(', ') })}
              </p>
            )}
          </div>
          <div className="p-3 rounded-xl bg-bg-secondary border border-border/70">
            <p className="text-2xs font-mono font-bold uppercase text-text-muted">
              {t('weeklyReview.tonnage')}
            </p>
            <p className="text-lg font-black text-text-primary">
              {(review.tonnageKg / 1000).toFixed(1)}t
            </p>
            {review.tonnageDeltaPct !== null && (
              <p className="text-2xs text-text-muted flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {review.tonnageDeltaPct >= 0 ? '+' : ''}
                {review.tonnageDeltaPct}% {t('weeklyReview.vsLastWeek')}
              </p>
            )}
          </div>
        </div>

        {review.volumeHighlights.length > 0 && (
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-text-muted mb-1.5">
              {t('weeklyReview.volumeTitle')}
            </p>
            <div className="space-y-1">
              {review.volumeHighlights.map((v) => (
                <p key={v.muscle} className="text-xs text-text-secondary">
                  <strong className="text-text-primary">{v.muscle}</strong> — {v.sets}{' '}
                  {t('weeklyReview.sets')}
                  {v.deltaSets !== 0 && (
                    <span className="text-text-muted">
                      {' '}
                      ({v.deltaSets > 0 ? '+' : ''}
                      {v.deltaSets} {t('weeklyReview.vsLastWeek')})
                    </span>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}

        {review.prs.length > 0 && (
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-text-muted mb-1.5">
              {t('weeklyReview.prsTitle')}
            </p>
            <div className="space-y-1">
              {review.prs.map((pr, i) => (
                <p key={i} className="text-xs text-text-secondary">
                  <strong className="text-text-primary">{pr.exercise}</strong> — {pr.detail}
                </p>
              ))}
            </div>
          </div>
        )}

        {review.recoveryLines.length > 0 && (
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-text-muted mb-1.5">
              {t('weeklyReview.recoveryTitle')}
            </p>
            <div className="space-y-1">
              {review.recoveryLines.map((line, i) => (
                <p key={i} className="text-xs text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {review.coachLines.length > 0 && (
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-text-muted mb-1.5">
              {t('weeklyReview.coachChangedTitle')}
            </p>
            <div className="space-y-1">
              {review.coachLines.map((line, i) => (
                <p key={i} className="text-xs text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {review.revisions.length > 0 && (
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-text-muted mb-1.5">
              {t('weeklyReview.nextWeekTitle')}
            </p>
            <div className="space-y-2">
              {review.revisions.map((rev, i) => (
                <div key={i} className="p-3 rounded-xl bg-bg-secondary border border-border/70">
                  <p className="text-xs text-text-secondary">{rev.text}</p>
                  {rev.kind === 'schedule_move' &&
                    (rev.applied ? (
                      <p className="text-2xs text-accent font-semibold mt-1.5 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {t('weeklyReview.moveApplied')}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => applyScheduleRevision(review.weekMonday)}
                        className="btn-primary py-1.5 px-3 text-xs font-bold mt-2 cursor-pointer"
                      >
                        {t('weeklyReview.moveApply')}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {scheduleMove === undefined && review.revisions.length === 0 && (
          <p className="text-2xs text-text-muted">{t('weeklyReview.noRevisions')}</p>
        )}
      </div>
    </div>
  );
}
