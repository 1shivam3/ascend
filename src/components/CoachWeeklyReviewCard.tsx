"use client";

/**
 * CoachWeeklyReviewCard — PR-C (§5). Home surface for the weekly
 * review: appears when a review exists for the last completed week,
 * with an unseen marker until opened. Generates the review lazily on
 * mount (the store action is idempotent per week). The full review
 * lives in CoachWeeklyReviewModal — this card is only the door.
 */
import React, { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { renderLocalizedSentence } from '@/lib/coach-i18n';
import CoachWeeklyReviewModal from '@/components/CoachWeeklyReviewModal';
import { CalendarRange, ChevronRight } from 'lucide-react';

export default function CoachWeeklyReviewCard() {
  const { t, language } = useTranslation();
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const refreshWeeklyReview = useStore((s) => s.refreshWeeklyReview);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    refreshWeeklyReview();
  }, [refreshWeeklyReview]);

  const review = weeklyReviews[weeklyReviews.length - 1] ?? null;
  if (!review) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="card w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
        aria-label={t('weeklyReview.title')}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              {t('weeklyReview.cardTitle')}
              {!review.seen && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-label="New" />
              )}
            </p>
            <p className="text-2xs text-text-muted truncate">{renderLocalizedSentence(t, language, review.focus.headlineI18n, review.focus.headline)}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
      </button>
      <CoachWeeklyReviewModal isOpen={isOpen} onClose={() => setIsOpen(false)} review={review} />
    </>
  );
}
