'use client';

import { useTranslation } from '@/lib/i18n';

/**
 * UX redesign Stage 7 — onboarding summary screen, shown after the plan
 * offer (or directly after details when no plan was generated) and before
 * the tabs. Presentational: every row restates a choice the user already
 * made — goal, level, training days, diet, injuries — from the stored
 * profile/training profile, never invented. Edits happen afterward in
 * You → Settings → Training Preferences (the edit button finishes
 * onboarding and lands there); there is no back button by design.
 */

export interface SummaryScreenProps {
  goal: string;
  level: string;
  daysPerWeek: number;
  diet: string;
  injuries: string[];
  onContinue: () => void;
  onEdit: () => void;
}

export default function SummaryScreen({
  goal,
  level,
  daysPerWeek,
  diet,
  injuries,
  onContinue,
  onEdit,
}: SummaryScreenProps) {
  const { t } = useTranslation();

  const rows: { label: string; value: string }[] = [
    { label: t('onboarding.summaryGoal'), value: goal },
    { label: t('onboarding.summaryLevel'), value: level },
    { label: t('onboarding.summaryDays'), value: t('onboarding.summaryDaysValue', { days: daysPerWeek }) },
    { label: t('onboarding.summaryDiet'), value: diet },
    {
      label: t('onboarding.summaryInjuries'),
      value: injuries.length > 0 ? injuries.join(', ') : t('onboarding.summaryNoInjuries'),
    },
  ];

  return (
    <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between pb-8 animate-fade-in">
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        <div className="text-left space-y-1">
          <h1 className="page-title">{t('onboarding.summaryTitle')}</h1>
          <p className="text-sm text-text-primary/70">{t('onboarding.summarySubtitle')}</p>
        </div>
        <div className="bg-bg-card border border-border rounded-2xl shadow-2xs divide-y divide-border/60">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted shrink-0">
                {row.label}
              </span>
              <span className="text-sm font-bold text-right">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <button
            type="button"
            onClick={onContinue}
            className="w-full py-4 px-6 rounded-2xl bg-accent hover:bg-accent-dim active:scale-[0.98] text-accent-on font-bold text-base transition-all cursor-pointer"
          >
            {t('onboarding.summaryContinue')}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="w-full py-3 px-6 rounded-2xl bg-bg-card border border-border text-text-primary font-semibold text-sm active:scale-[0.98] transition-transform cursor-pointer"
          >
            {t('onboarding.summaryEdit')}
          </button>
        </div>
      </div>
    </div>
  );
}
