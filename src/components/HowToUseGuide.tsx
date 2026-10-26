'use client';

import React from 'react';
import { Home, Dumbbell, UtensilsCrossed, TrendingUp, User, SlidersHorizontal } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { useTranslation } from '@/lib/i18n';

/**
 * How-to-use guide for first-time users (simplified onboarding, track C).
 *
 * A Sheet over HomePage — never a blocking screen, never new permanent
 * chrome. Shown once after the profile gate (the app sets
 * `ascend_howto_seen_v1` when it is dismissed); re-openable from the
 * Settings row "How to use ASCEND". Six cards, one per area that matters:
 * Today, Train + plan building, Fuel + meal scan, Progress, You/Settings,
 * Customize. Card titles reuse the tab labels so no new vocabulary is
 * needed in Hindi; bodies are short token-reuse compositions there.
 */

const CARDS = [
  { icon: Home, titleKey: 'nav.today', bodyKey: 'guide.cardToday' },
  { icon: Dumbbell, titleKey: 'nav.train', bodyKey: 'guide.cardTrain' },
  { icon: UtensilsCrossed, titleKey: 'nav.fuel', bodyKey: 'guide.cardFuel' },
  { icon: TrendingUp, titleKey: 'nav.progress', bodyKey: 'guide.cardProgress' },
  { icon: User, titleKey: 'nav.you', bodyKey: 'guide.cardYou' },
  { icon: SlidersHorizontal, titleKey: 'customize.today', bodyKey: 'guide.cardCustomize' },
] as const;

interface HowToUseGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HowToUseGuide({ isOpen, onClose }: HowToUseGuideProps) {
  const { t } = useTranslation();

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('guide.title')}
      ariaLabel={t('guide.title')}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all cursor-pointer text-center"
        >
          {t('common.close')}
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-muted leading-relaxed">{t('guide.subtitle')}</p>
        {CARDS.map(({ icon: Icon, titleKey, bodyKey }) => (
          <div
            key={titleKey}
            className="flex items-start gap-3 p-3.5 rounded-2xl bg-bg-secondary border border-border"
          >
            <div className="w-10 h-10 shrink-0 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">{t(titleKey)}</p>
              <p className="text-xs text-text-muted leading-relaxed mt-0.5">{t(bodyKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
