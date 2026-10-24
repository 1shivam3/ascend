'use client';

import { Brain } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { renderLocalizedSentence } from '@/lib/coach-i18n';
import { Badge } from './ui/Badge';
import type { AthleteModelTier } from '@/lib/athlete-model';

const TIER_BADGE: Record<AthleteModelTier, { variant: 'neutral' | 'warning' | 'success'; key: 'coachModel.tierDefault' | 'coachModel.tierLearning' | 'coachModel.tierPersonal' }> = {
  prior: { variant: 'neutral', key: 'coachModel.tierDefault' },
  emerging: { variant: 'warning', key: 'coachModel.tierLearning' },
  established: { variant: 'success', key: 'coachModel.tierPersonal' },
};

/**
 * AthleteModelCard — "What your coach has learned".
 *
 * Renders the athlete model's top facts (src/lib/athlete-model.ts). Every
 * fact is a measurement from the user's own logged data and carries its
 * confidence tier: Default (population stand-in) / Learning / Personal.
 * Nothing here is decorative — if the model has nothing yet, the card
 * stays hidden until the first computation lands.
 */
export default function AthleteModelCard() {
  const { t, language } = useTranslation();
  const athleteModel = useStore((state) => state.athleteModel);

  // A persisted slice from an older build could be malformed — never let
  // a display card crash Home over a derived value.
  if (!athleteModel || !Array.isArray(athleteModel.topFacts) || athleteModel.topFacts.length === 0) return null;
  const facts = athleteModel.topFacts.filter((f) => f && typeof f.text === 'string' && f.text.length > 0);
  if (facts.length === 0) return null;

  return (
    <div className="bg-bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text-primary leading-tight">{t('coachModel.title')}</h2>
          <p className="text-3xs text-text-muted font-mono">{t('coachModel.subtitle')}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2.5">
        {facts.map((fact, i) => {
          const badge = TIER_BADGE[fact.tier] ?? TIER_BADGE.prior;
          // LIVE-P1-03: full-sentence facts render localized; the
          // adherence fact renders its (English) evidence plus the
          // localized suffix; everything else renders as stored.
          const factText = fact.textI18n
            ? renderLocalizedSentence(t, language, fact.textI18n, fact.text)
            : fact.suffixI18n && fact.baseText
              ? `${fact.baseText} ${renderLocalizedSentence(t, language, fact.suffixI18n, '')}`
              : fact.text;
          return (
            <li key={`${fact.kind}-${i}`} className="flex items-start gap-2">
              <p className="flex-1 text-xs leading-relaxed text-text-secondary">{factText}</p>
              <Badge variant={fact.kind === 'pain' ? 'danger' : badge.variant} size="xs" className="shrink-0 mt-0.5">
                {fact.kind === 'pain' ? t('coachModel.tierPain') : t(badge.key)}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
