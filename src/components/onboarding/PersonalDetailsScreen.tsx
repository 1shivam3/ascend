'use client';

import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Gender, MAX_ATHLETE_NAME_LENGTH } from '@/lib/types';
import StepProgressBar from './StepProgressBar';
import DobPicker from '@/components/DobPicker';
import { useTranslation } from '@/lib/i18n';
import { calculateAgeFromDob, dobPickerBounds, dobPreviewAge, isValidDob } from '@/lib/age';

/**
 * Details-lite (simplified onboarding, step 2 of 2).
 *
 * Only what first-run Today genuinely needs: name, gender, date of birth
 * (age is calculated from it), and the single optional injury dropdown.
 * Everything else (weight, height, diet, experience, equipment, days,
 * activity, unit) is deferred to contextual prompts later and written with
 * safe defaults at finish time — never left undefined.
 *
 * Injury control moved VERBATIM from ScheduleScreen: same <select>,
 * same option strings (consumers regex-match them), same chip removal,
 * same string[] shape written to trainingProfile.injuriesOrLimitations.
 */

const INJURY_AREA_OPTIONS = ['Lower back', 'Knees', 'Shoulders', 'Wrists'];

export interface PersonalDetailsData {
  name: string;
  gender: Gender;
  dateOfBirth: string;
  limitations: string[];
}

interface PersonalDetailsScreenProps {
  initialName?: string;
  initialGender?: Gender;
  initialDob?: string;
  initialLimitations?: string[];
  onContinue: (details: PersonalDetailsData) => void;
  onBack: () => void;
  loading?: boolean;
}

export default function PersonalDetailsScreen({
  initialName = '',
  initialGender = 'male',
  initialDob = '',
  initialLimitations = [],
  onContinue,
  onBack,
  loading = false,
}: PersonalDetailsScreenProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [genderSelection, setGenderSelection] = useState<'male' | 'female' | 'other'>(
    initialGender || 'male'
  );
  // O3 (audit): DOB used to initialise to '' unconditionally, so backing
  // into this screen from plan-offer/summary (a remount) wiped the typed
  // date while name/gender/limitations survived via their initial* props.
  const [dob, setDob] = useState(initialDob || '');
  const [limitations, setLimitations] = useState<string[]>(initialLimitations || []);

  const [error, setError] = useState<string | null>(null);

  const addLimitation = (opt: string) =>
    setLimitations((prev) => (opt && !prev.includes(opt) ? [...prev, opt] : prev));

  const removeLimitation = (opt: string) =>
    setLimitations((prev) => prev.filter((l) => l !== opt));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const athleteName = name.trim();
    if (!athleteName) {
      setError('Please enter your name or athlete nickname.');
      return;
    }
    if (athleteName.length > MAX_ATHLETE_NAME_LENGTH) {
      setError(`Please keep your name under ${MAX_ATHLETE_NAME_LENGTH} characters.`);
      return;
    }

    // Date of birth -> age. Same 13–120 rules the old age input enforced.
    if (!dob || !isValidDob(dob)) {
      setError(t('onboarding.errDobInvalid'));
      return;
    }
    const age = calculateAgeFromDob(dob);
    if (age === null) {
      // Valid calendar date but in the future (calculateAgeFromDob
      // returns null for future dates; unparseable input is caught above).
      setError(t('onboarding.errDobFuture'));
      return;
    }
    if (age < 13) {
      // Minimum-age guard: ASCEND is 13+. Nothing is stored in this case —
      // onContinue is never called, so no profile data is created.
      setError(t('onboarding.errDobUnder13'));
      return;
    }
    if (age > 120) {
      setError(t('onboarding.errDobRange'));
      return;
    }

    onContinue({
      name: athleteName,
      gender: genderSelection,
      dateOfBirth: dob,
      limitations,
    });
  };

  const bounds = dobPickerBounds();
  // Age chip: only for a date that passes the submit rules exactly.
  const previewAge = dobPreviewAge(dob);

  return (
    <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between pb-8 animate-fade-in">
      <StepProgressBar currentStep={2} totalSteps={2} onBack={onBack} />

      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        <div className="text-left space-y-1">
          <h1 className="page-title">
            {t('onboarding.detailsTitle')}
          </h1>
          <p className="text-sm text-text-muted">
            This helps us calculate your strength standards, nutrition targets, and workout progression.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        <form id="personal-details-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Athlete Name */}
          <div className="p-4 rounded-2xl bg-bg-card border border-border shadow-2xs space-y-1.5">
            <label htmlFor="details-name" className="block text-xs font-semibold text-text-primary">
              Athlete Name
            </label>
            <input
              id="details-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              required
              maxLength={MAX_ATHLETE_NAME_LENGTH}
              className="w-full px-3 py-2 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary outline-none transition"
            />
          </div>

          {/* Gender Segmented Control: Male, Female, Other */}
          <div className="p-4 rounded-2xl bg-bg-card border border-border shadow-2xs space-y-2">
            <span className="block text-xs font-semibold text-text-primary">
              Gender
            </span>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-bg-primary border border-border">
              {(['male', 'female', 'other'] as const).map((g) => {
                const isActive = genderSelection === g;
                const label = g.charAt(0).toUpperCase() + g.slice(1);

                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenderSelection(g)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                      isActive
                        ? 'bg-bg-card text-text-primary shadow-2xs border border-border'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date of birth — age is calculated from this, never typed.
              Custom picker (three plain selects) instead of the native
              date input, whose popup is browser UI and could not be
              driven by keyboard users or automation. Value contract is
              unchanged (YYYY-MM-DD string, '' = no date yet), so the
              age chip, Continue gating, and error messages below work
              untouched. All three selects start unselected — never
              prefilled. */}
          <div className="p-4 rounded-2xl bg-bg-card border border-border shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="block text-xs font-semibold text-text-primary">
                {t('onboarding.dateOfBirth')}
              </span>
              {previewAge !== null && (
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-bold">
                  {t('profile.age')} {previewAge}
                </span>
              )}
            </div>
            <span className="block text-2xs text-text-muted">
              {t('onboarding.dateOfBirthHint')}
            </span>
            <DobPicker id="details-dob" value={dob} onChange={setDob} min={bounds.min} max={bounds.max} />
          </div>

          {/* Injury — single optional dropdown, verbatim from ScheduleScreen.
              Empty selection ([]) is the normal, valid state. */}
          <div className="p-4 rounded-2xl bg-bg-card border border-border shadow-2xs space-y-3">
            <label htmlFor="injury-select" className="text-xs font-semibold block">
              {t('onboarding.injuriesTitle')}
            </label>
            <p className="text-2xs text-text-muted -mt-1.5">{t('onboarding.injuriesHint')}</p>
            <select
              id="injury-select"
              aria-label={t('onboarding.injuriesTitle')}
              value=""
              onChange={(e) => addLimitation(e.target.value)}
              className="w-full p-3 rounded-xl bg-bg-card border border-border text-sm font-bold cursor-pointer"
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
                    className="px-4 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer border bg-accent border-accent text-accent-on"
                  >
                    {opt} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>

      <div className="w-full max-w-md mx-auto px-6 pt-4 space-y-3">
        <button
          type="submit"
          form="personal-details-form"
          disabled={loading}
          className="w-full py-4 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Calibrating Program...</span>
            </>
          ) : (
            t('common.continue')
          )}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 px-6 rounded-xl bg-bg-card hover:bg-bg-primary/60 active:scale-[0.99] text-text-primary border border-text-primary/20 font-semibold text-sm transition-all shadow-2xs cursor-pointer text-center"
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
