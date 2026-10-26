'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { calculateRecommendedMacroGoals, normalizeCalorieDelta } from '@/lib/macros';
import { resolvePrimaryGoal } from '@/lib/types';

/**
 * Progressive prompt (simplified onboarding, track A).
 *
 * Activity / weight / height are no longer asked during onboarding —
 * they are asked HERE, as a dismissible card on the first Fuel visit,
 * because that is the first moment they matter (macro targets). Saving
 * writes the profile + trainingProfile activity level and recalculates
 * the macro goals from the real numbers, replacing the onboarding
 * estimates. Dismissing keeps the estimates and never blocks Fuel:
 * the card simply goes away and the flag is set.
 *
 * Activity labels reuse the old ScheduleScreen wording verbatim (that
 * screen was never localized either); i18n for these four labels is a
 * known gap, flagged in the review report.
 */

const ACTIVITY_OPTIONS = [
  { id: 'sedentary', title: 'Desk job' },
  { id: 'light', title: 'Lightly active' },
  { id: 'active', title: 'Active' },
  { id: 'very_active', title: 'Very active' },
] as const;

interface FuelPrefsPromptProps {
  /** Called after save AND after dismiss — the caller hides the card. */
  onDone: () => void;
}

export default function FuelPrefsPrompt({ onDone }: FuelPrefsPromptProps) {
  const { t } = useTranslation();
  const profile = useStore((state) => state.profile);
  const setProfile = useStore((state) => state.setProfile);
  const trainingProfile = useStore((state) => state.trainingProfile);
  const setTrainingProfile = useStore((state) => state.setTrainingProfile);
  const setMacroGoals = useStore((state) => state.setMacroGoals);
  const updateBodyMetrics = useStore((state) => state.updateBodyMetrics);

  const unit = profile?.unit || 'kg';
  const [activity, setActivity] = useState<string>(trainingProfile?.activityLevel || 'light');
  const [weight, setWeight] = useState<string>(() => {
    if (!profile) return '';
    const w = unit === 'lbs' ? profile.bodyweightLbs : profile.bodyweightKg;
    // Onboarding defaults (70 kg) are estimates, not answers — show them
    // as the starting value so the user corrects rather than types fresh.
    return w ? String(Math.round(w * 10) / 10) : '';
  });
  const [height, setHeight] = useState<string>(() => {
    if (!profile?.heightCm) return '';
    return unit === 'lbs'
      ? String(Math.round((profile.heightCm / 2.54) * 10) / 10)
      : String(profile.heightCm);
  });
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (isNaN(w) || w < 30 || w > 300) {
      setError(unit === 'lbs' ? 'Weight must be between 66 and 660 lbs.' : 'Weight must be between 30 and 300 kg.');
      return;
    }
    if (isNaN(h) || (unit === 'lbs' ? h < 39 || h > 98 : h < 100 || h > 250)) {
      setError(unit === 'lbs' ? 'Height must be between 39 and 98 inches.' : 'Height must be between 100 and 250 cm.');
      return;
    }
    if (!profile) {
      onDone();
      return;
    }
    const weightKg = unit === 'lbs' ? Math.round(w * 0.453592 * 10) / 10 : Math.round(w * 10) / 10;
    const weightLbs = unit === 'lbs' ? Math.round(w * 10) / 10 : Math.round(w * 2.20462 * 10) / 10;
    const heightCm = Math.round(unit === 'lbs' ? h * 2.54 : h);

    setProfile({ ...profile, bodyweightKg: weightKg, bodyweightLbs: weightLbs, heightCm });
    setTrainingProfile({ activityLevel: activity as 'sedentary' | 'light' | 'active' | 'very_active' });
    updateBodyMetrics(weightKg, heightCm);

    // Recalculate macro goals from the real numbers (same shape as the
    // goals modal's save path), replacing the onboarding estimates.
    const primaryGoal = resolvePrimaryGoal(profile.goals);
    const rec = calculateRecommendedMacroGoals(
      weightKg,
      primaryGoal,
      profile.gender || 'male',
      heightCm,
      profile.age,
      activity as 'sedentary' | 'light' | 'active' | 'very_active'
    );
    setMacroGoals({ ...rec, calorieDelta: normalizeCalorieDelta(rec.calories - (rec.maintenanceCalories as number)) });
    onDone();
  };

  return (
    <section className="card p-4 bg-bg-card border border-border/80 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-text-primary">{t('fuelPrefs.title')}</p>
          <p className="text-xs text-text-muted leading-relaxed mt-0.5">{t('fuelPrefs.hint')}</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label={t('common.close')}
          className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p className="text-2xs text-accent">{error}</p>
      )}

      <div className="space-y-2">
        <span className="text-xs font-semibold text-text-secondary font-sans">Activity</span>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setActivity(opt.id)}
              className={`px-3 py-2 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                activity === opt.id
                  ? 'bg-accent border-accent text-accent-on'
                  : 'bg-bg-card border-border text-text-primary'
              }`}
            >
              {opt.title}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="fuel-prefs-weight" className="text-xs font-semibold text-text-secondary font-sans">
            Weight ({unit})
          </label>
          <input
            id="fuel-prefs-weight"
            type="number"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-bg-secondary border border-border focus:border-accent text-sm text-text-primary outline-none transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="fuel-prefs-height" className="text-xs font-semibold text-text-secondary font-sans">
            Height ({unit === 'lbs' ? 'in' : 'cm'})
          </label>
          <input
            id="fuel-prefs-height"
            type="number"
            step="0.1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-bg-secondary border border-border focus:border-accent text-sm text-text-primary outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-3 px-4 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all cursor-pointer text-center"
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 py-3 px-4 rounded-xl bg-bg-card hover:bg-bg-primary/60 active:scale-[0.99] text-text-primary border border-text-primary/20 font-semibold text-sm transition-all cursor-pointer text-center"
        >
          {t('fuelPrefs.skip')}
        </button>
      </div>
    </section>
  );
}
