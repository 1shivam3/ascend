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

const LIMITATION_OPTIONS = ['Lower back', 'Knees', 'Shoulders', 'Wrists'];

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

  const toggleLimitation = (opt: string) =>
    setLimitations((prev) =>
      prev.includes(opt) ? prev.filter((l) => l !== opt) : [...prev, opt]
    );

  return (
    <div className="min-h-screen w-full bg-[#F3F0E7] text-[#171916] flex flex-col justify-between pb-8 animate-fade-in">
      <StepProgressBar currentStep={3} onBack={onBack} />
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        <div className="text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Your week, your setup
          </h1>
          <p className="text-sm text-[#858076]">
            Two quick things so your plan actually fits your life.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold">{t('onboarding.scheduleDaysTitle')}</p>
          <p className="text-xs text-[#858076] -mt-1.5">These are your weight-training days — runs, walks and cardio can happen on any day.</p>
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
                    ? 'bg-[#E44427] border-[#E44427] text-white'
                    : 'bg-white border-[#E2DFD6] text-[#171916] hover:border-[#858076]/40'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#858076]">
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
                className={`w-full text-left p-4 rounded-2xl bg-white border transition-all flex items-center justify-between cursor-pointer shadow-2xs ${
                  equipment === opt.id
                    ? 'border-[#E44427] ring-1 ring-[#E44427] bg-[#E44427]/[0.02]'
                    : 'border-[#E2DFD6] hover:border-[#858076]/40'
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-[#171916] leading-snug">{opt.title}</p>
                  <p className="text-2xs text-[#858076] leading-snug mt-0.5">{opt.description}</p>
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                    equipment === opt.id
                      ? 'bg-[#E44427] border-[#E44427] text-white'
                      : 'border-[#E2DFD6] bg-transparent'
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
          <p className="text-sm font-bold">Any injuries or sore joints we should plan around?</p>
          <p className="text-xs text-[#858076] -mt-1.5">
            Pick any that apply — your plan will avoid movements that load them. Leave empty if none.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Injuries or limitations">
            {LIMITATION_OPTIONS.map((opt) => {
              const active = limitations.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleLimitation(opt)}
                  className={`px-4 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer border ${
                    active
                      ? 'bg-[#E44427] border-[#E44427] text-white'
                      : 'bg-white border-[#E2DFD6] text-[#171916] hover:border-[#858076]/40'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold">How active is your day outside workouts?</p>
          <p className="text-xs text-[#858076] -mt-1.5">This sets your calorie target — a desk day burns far less than a physical one.</p>
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Daily activity level">
            {ACTIVITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={activity === opt.id}
                onClick={() => setActivity(opt.id)}
                className={`text-left p-4 rounded-2xl bg-white border transition-all cursor-pointer shadow-2xs ${
                  activity === opt.id
                    ? 'border-[#E44427] ring-1 ring-[#E44427] bg-[#E44427]/[0.02]'
                    : 'border-[#E2DFD6] hover:border-[#858076]/40'
                }`}
              >
                <p className="text-sm font-bold text-[#171916] leading-snug">{opt.title}</p>
                <p className="text-2xs text-[#858076] leading-snug mt-0.5">{opt.description}</p>
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
          className="w-full py-4 px-6 rounded-xl bg-[#E44427] hover:bg-[#d03b20] active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-md cursor-pointer text-center"
        >
          {t('common.continue')}
        </button>
      </div>
    </div>
  );
}
