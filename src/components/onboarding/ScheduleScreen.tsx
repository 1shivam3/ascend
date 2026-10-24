'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import StepProgressBar from './StepProgressBar';
import { useTranslation } from '@/lib/i18n';
import { AITrainingProfile } from '@/lib/types';
import type { ActivityLevel } from '@/lib/macros';

export type EquipmentChoice = AITrainingProfile['equipment'];

interface ScheduleScreenProps {
  initialDays: number;
  initialEquipment: EquipmentChoice;
  initialActivity: ActivityLevel;
  initialLimitations?: string[];
  onContinue: (
    daysPerWeek: number,
    equipment: EquipmentChoice,
    activity: ActivityLevel,
    limitations: string[]
  ) => void;
  onBack: () => void;
}

const INJURY_AREA_OPTIONS = ['Lower back', 'Knees', 'Shoulders', 'Wrists'];

const DAY_OPTIONS = [2, 3, 4, 5, 6];

const EQUIPMENT_OPTIONS: { id: EquipmentChoice; title: string; description: string }[] = [
  { id: 'full_gym', title: 'Full gym', description: 'Barbells, machines, cables — the works' },
  { id: 'home_dumbbells', title: 'Home — dumbbells', description: 'Dumbbells and a mat, no machines' },
  { id: 'bodyweight_only', title: 'Bodyweight only', description: 'No equipment at all' },
];

const ACTIVITY_OPTIONS: { id: ActivityLevel; title: string; description: string }[] = [
  { id: 'sedentary', title: 'Desk job', description: 'Mostly sitting, few steps outside workouts' },
  { id: 'light', title: 'On my feet sometimes', description: 'Errands, light walking, mixed days' },
  { id: 'active', title: 'Active day', description: 'Lots of walking or a physical job' },
  { id: 'very_active', title: 'Very physical', description: 'Heavy manual work or training twice a day' },
];

export default function ScheduleScreen({ initialDays, initialEquipment, initialActivity, initialLimitations, onContinue, onBack }: ScheduleScreenProps) {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(initialDays);
  const [equipment, setEquipment] = useState<EquipmentChoice>(initialEquipment);
  const [activity, setActivity] = useState<ActivityLevel>(initialActivity);
  const [limitations, setLimitations] = useState<string[]>(initialLimitations || []);

  const addLimitation = (opt: string) =>
    setLimitations((prev) => (opt && !prev.includes(opt) ? [...prev, opt] : prev));

  const removeLimitation = (opt: string) =>
    setLimitations((prev) => prev.filter((l) => l !== opt));

  return (
    <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between pb-8 animate-fade-in">
      <StepProgressBar currentStep={3} onBack={onBack} />
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        <div className="text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Your week, your setup
          </h1>
          <p className="text-sm text-text-muted">
            Two quick things so your plan actually fits your life.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold">{t('onboarding.scheduleDaysTitle')}</p>
          <p className="text-xs text-text-muted -mt-1.5">These are your weight-training days — runs, walks and cardio can happen on any day.</p>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Training days per week">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={`py-3.5 rounded-xl font-bold text-lg transition-all shadow-2xs cursor-pointer border ${
                  days === d
                    ? 'bg-accent border-accent text-white'
                    : 'bg-bg-card border-border text-text-primary hover:border-border-hover/40'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            {days <= 2 && 'Full-body sessions — perfect for a busy week.'}
            {days === 3 && 'Full-body sessions, Monday / Wednesday / Friday style.'}
            {days === 4 && 'Upper / lower split — the classic balanced week.'}
            {days === 5 && 'A 5-day split with a dedicated arm day.'}
            {days >= 6 && 'Push / pull / legs, twice through.'}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold">{t('onboarding.equipmentTitle')}</p>
          <div className="space-y-2.5" role="radiogroup" aria-label="Available equipment">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={equipment === opt.id}
                onClick={() => setEquipment(opt.id)}
                className={`w-full text-left p-4 rounded-2xl bg-bg-card border transition-all flex items-center justify-between cursor-pointer shadow-2xs ${
                  equipment === opt.id
                    ? 'border-accent ring-1 ring-accent bg-accent/[0.02]'
                    : 'border-border hover:border-border-hover/40'
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-text-primary leading-snug">{opt.title}</p>
                  <p className="text-2xs text-text-muted leading-snug mt-0.5">{opt.description}</p>
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                    equipment === opt.id
                      ? 'bg-accent border-accent text-white'
                      : 'border-border bg-transparent'
                  }`}
                  aria-hidden="true"
                >
                  {equipment === opt.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label htmlFor="injury-select" className="text-sm font-bold block">
            {t('onboarding.injuriesTitle')}
          </label>
          <p className="text-xs text-text-muted -mt-1.5">{t('onboarding.injuriesHint')}</p>
          <select
            id="injury-select"
            aria-label={t('onboarding.injuriesTitle')}
            value=""
            onChange={(e) => addLimitation(e.target.value)}
            className="w-full p-4 rounded-2xl bg-bg-card border border-border text-sm font-bold cursor-pointer"
          >
            <option value="">
              {limitations.length === 0
                ? t('onboarding.injuriesNone')
                : t('onboarding.injuriesAdd')}
            </option>
            {INJURY_AREA_OPTIONS.filter((opt) => !limitations.includes(opt)).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {limitations.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('onboarding.injuriesTitle')}>
              {limitations.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => removeLimitation(opt)}
                  aria-label={t('onboarding.injuriesRemove', { area: opt })}
                  title={t('onboarding.injuriesRemove', { area: opt })}
                  className="px-4 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer border bg-accent border-accent text-white"
                >
                  {opt} ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold">How active is your day outside workouts?</p>
          <p className="text-xs text-text-muted -mt-1.5">This sets your calorie target — a desk day burns far less than a physical one.</p>
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Daily activity level">
            {ACTIVITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={activity === opt.id}
                onClick={() => setActivity(opt.id)}
                className={`text-left p-4 rounded-2xl bg-bg-card border transition-all cursor-pointer shadow-2xs ${
                  activity === opt.id
                    ? 'border-accent ring-1 ring-accent bg-accent/[0.02]'
                    : 'border-border hover:border-border-hover/40'
                }`}
              >
                <p className="text-sm font-bold text-text-primary leading-snug">{opt.title}</p>
                <p className="text-2xs text-text-muted leading-snug mt-0.5">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="w-full max-w-md mx-auto px-6 pt-4 space-y-3">
        <button
          type="button"
          onClick={() => onContinue(days, equipment, activity, limitations)}
          className="w-full py-4 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-md cursor-pointer text-center"
        >
          {t('common.continue')}
        </button>
      </div>
    </div>
  );
}
