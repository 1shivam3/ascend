'use client';

import React, { useEffect, useState } from 'react';
import Sheet from '@/components/ui/Sheet';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';
import { useStore } from '@/lib/store';
import type { AITrainingProfile } from '@/lib/types';

/**
 * Progressive prompt (simplified onboarding, track A).
 *
 * Experience / equipment / days-per-week are no longer asked during
 * onboarding — they are asked HERE, the first time the user builds a
 * plan, because that is the first moment they matter. Answers are
 * written to trainingProfile (+ userMode for experience) so every
 * downstream builder (plan modal, coach block, suggested workouts)
 * reads them. Skipping is always allowed: the onboarding defaults
 * (beginner / full gym / 4 days) stand, the flag is still set, and
 * the plan modal opens either way — this prompt never blocks.
 */

const EQUIPMENT_OPTIONS: { value: AITrainingProfile['equipment']; labelKey: StringKey }[] = [
  { value: 'full_gym', labelKey: 'coachBlock.eqFullGym' },
  { value: 'barbell_only', labelKey: 'coachBlock.eqBarbell' },
  { value: 'home_dumbbells', labelKey: 'coachBlock.eqDumbbells' },
  { value: 'bodyweight_only', labelKey: 'coachBlock.eqBodyweight' },
];

interface PlanPrefsPromptProps {
  isOpen: boolean;
  /** Called after save AND after skip — the caller opens the plan modal. */
  onDone: () => void;
}

export default function PlanPrefsPrompt({ isOpen, onDone }: PlanPrefsPromptProps) {
  const { t } = useTranslation();
  const trainingProfile = useStore((state) => state.trainingProfile);
  const setTrainingProfile = useStore((state) => state.setTrainingProfile);
  const setUserMode = useStore((state) => state.setUserMode);

  const [experience, setExperience] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [equipment, setEquipment] = useState<AITrainingProfile['equipment']>('full_gym');
  const [days, setDays] = useState(4);

  // Prefill from whatever is already known — re-opening never resets.
  useEffect(() => {
    if (!isOpen) return;
    if (trainingProfile?.experience) setExperience(trainingProfile.experience);
    if (trainingProfile?.equipment) setEquipment(trainingProfile.equipment);
    if (trainingProfile?.daysPerWeek) setDays(trainingProfile.daysPerWeek);
  }, [isOpen, trainingProfile?.experience, trainingProfile?.equipment, trainingProfile?.daysPerWeek]);

  const handleSave = () => {
    setTrainingProfile({ experience, equipment, daysPerWeek: days });
    setUserMode(experience);
    onDone();
  };

  return (
    <Sheet isOpen={isOpen} onClose={onDone} title={t('planPrefs.title')} ariaLabel={t('planPrefs.title')}>
      <div className="space-y-5">
        <p className="text-sm text-text-muted leading-relaxed">{t('planPrefs.hint')}</p>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-text-secondary font-sans">{t('coachBlock.experience')}</span>
          <SegmentedControl
            ariaLabel={t('coachBlock.experience')}
            value={experience}
            options={[
              { value: 'beginner', label: t('coachBlock.exp_beginner') },
              { value: 'intermediate', label: t('coachBlock.exp_intermediate') },
              { value: 'advanced', label: t('coachBlock.exp_advanced') },
            ]}
            onChange={(v) => setExperience(v)}
          />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-text-secondary font-sans">{t('coachBlock.equipment')}</span>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEquipment(opt.value)}
                className={`px-4 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer border ${
                  equipment === opt.value
                    ? 'bg-accent border-accent text-accent-on'
                    : 'bg-bg-card border-border text-text-primary'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.weeklyWorkoutTarget')}</span>
          <div className="flex flex-wrap gap-2">
            {[2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-4 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer border ${
                  days === d
                    ? 'bg-accent border-accent text-accent-on'
                    : 'bg-bg-card border-border text-text-primary'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-3.5 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all cursor-pointer text-center"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="w-full py-3 px-6 rounded-xl bg-bg-card hover:bg-bg-primary/60 active:scale-[0.99] text-text-primary border border-text-primary/20 font-semibold text-sm transition-all cursor-pointer text-center"
          >
            {t('planPrefs.skip')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
