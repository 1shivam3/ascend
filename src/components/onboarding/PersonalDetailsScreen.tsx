'use client';

import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Gender, Unit, MAX_ATHLETE_NAME_LENGTH } from '@/lib/types';
import StepProgressBar from './StepProgressBar';
import SegmentedControl from '@/components/ui/SegmentedControl';
import DobPicker from '@/components/DobPicker';
import { useTranslation } from '@/lib/i18n';
import { calculateAgeFromDob, dobPickerBounds, dobPreviewAge, isValidDob } from '@/lib/age';
import { validateBodyStats, toStoredBodyStats } from '@/lib/body-stats';
import { kgToLbs, lbsToKg } from '@/lib/units';

/**
 * Details-lite (simplified onboarding, step 2 of 2).
 *
 * What first-run genuinely needs: name, gender, date of birth
 * (age is calculated from it), the single optional injury dropdown,
 * and — since Phase-1 Task 1.1 — weight & height, because the daily
 * food target is computed from them and must never again come from
 * silent placeholders (skippable only via the explicit "I'll add this
 * later" button). Everything else (diet, experience, equipment, days,
 * activity) is deferred to contextual prompts later and written with
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
  /**
   * Phase-1 Task 1.1: the user's REAL weight/height in canonical
   * stored units, or null when they explicitly tapped "I'll add this
   * later". Null is a deliberate choice, never an omission — Continue
   * is blocked until the user either enters both values or taps the
   * skip button, so a calorie target is never again computed from
   * silently seeded placeholders.
   */
  bodyStats: { bodyweightKg: number; heightCm: number; unit: Unit } | null;
}

interface PersonalDetailsScreenProps {
  initialName?: string;
  initialGender?: Gender;
  initialDob?: string;
  initialLimitations?: string[];
  /** Previously entered body stats (back-navigation), display units. */
  initialUnit?: Unit;
  initialWeight?: string;
  initialHeight?: string;
  initialBodyStatsSkipped?: boolean;
  onContinue: (details: PersonalDetailsData) => void;
  onBack: () => void;
  loading?: boolean;
}

export default function PersonalDetailsScreen({
  initialName = '',
  initialGender = 'male',
  initialDob = '',
  initialLimitations = [],
  initialUnit = 'kg',
  initialWeight = '',
  initialHeight = '',
  initialBodyStatsSkipped = false,
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
  // Body stats (Task 1.1): typed in the chosen unit; skipped is an
  // explicit state, distinct from "not yet answered".
  const [statsUnit, setStatsUnit] = useState<Unit>(initialUnit);
  const [weightInput, setWeightInput] = useState(initialWeight);
  const [heightInput, setHeightInput] = useState(initialHeight);
  const [statsSkipped, setStatsSkipped] = useState(initialBodyStatsSkipped);

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
      setError(t('onboarding.errNameRequired'));
      return;
    }
    if (athleteName.length > MAX_ATHLETE_NAME_LENGTH) {
      setError(t('onboarding.errNameTooLong', { max: MAX_ATHLETE_NAME_LENGTH }));
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

    // Body stats (Task 1.1): three honest states — entered (validate
    // with the Body Metrics ranges), explicitly skipped, or
    // unanswered. Unanswered blocks: a silent default is exactly the
    // failure this step exists to remove.
    let bodyStats: PersonalDetailsData['bodyStats'] = null;
    if (!statsSkipped) {
      const w = parseFloat(weightInput);
      const h = parseFloat(heightInput);
      if (weightInput.trim() === '' && heightInput.trim() === '') {
        setError(t('onboarding.bodyStatsPending'));
        return;
      }
      const badField = validateBodyStats(w, h, statsUnit);
      if (badField === 'weight') {
        setError(t(statsUnit === 'lbs' ? 'onboarding.errWeightRangeLbs' : 'onboarding.errWeightRangeKg'));
        return;
      }
      if (badField === 'height') {
        setError(t(statsUnit === 'lbs' ? 'onboarding.errHeightRangeIn' : 'onboarding.errHeightRangeCm'));
        return;
      }
      const stored = toStoredBodyStats(w, h, statsUnit);
      bodyStats = { bodyweightKg: stored.bodyweightKg, heightCm: stored.heightCm, unit: statsUnit };
    }

    onContinue({
      name: athleteName,
      gender: genderSelection,
      dateOfBirth: dob,
      limitations,
      bodyStats,
    });
  };

  // Switching the entry unit converts whatever is typed, mirroring the
  // Body Metrics modal — the numbers on screen never change meaning.
  const switchStatsUnit = (next: Unit) => {
    if (next === statsUnit) return;
    const w = parseFloat(weightInput);
    const h = parseFloat(heightInput);
    if (!Number.isNaN(w)) {
      setWeightInput(String(Math.round((next === 'lbs' ? kgToLbs(w) : lbsToKg(w)) * 10) / 10));
    }
    if (!Number.isNaN(h)) {
      setHeightInput(String(Math.round((next === 'lbs' ? h / 2.54 : h * 2.54) * 10) / 10));
    }
    setStatsUnit(next);
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
            {t('onboarding.detailsSubtitle')}
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-start gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* F2 (certification): noValidate — the native `required` on the
            name input used to pre-empt this submit handler, so the
            designed errNameRequired banner never rendered and the user
            got the browser's bubble instead. All validation lives in
            handleSubmit; nothing in this form relies on native checks
            (the DOB selects carry no required attribute). */}
        <form id="personal-details-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Athlete Name */}
          <div className="p-4 rounded-2xl bg-bg-card border border-border shadow-2xs space-y-1.5">
            <label htmlFor="details-name" className="block text-xs font-semibold text-text-primary">
              {t('onboarding.athleteNameLabel')}
            </label>
            <input
              id="details-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('onboarding.namePlaceholder')}
              aria-required="true"
              maxLength={MAX_ATHLETE_NAME_LENGTH}
              className="w-full px-3 py-2 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary outline-none transition"
            />
          </div>

          {/* Gender Segmented Control: Male, Female, Other */}
          <div className="p-4 rounded-2xl bg-bg-card border border-border shadow-2xs space-y-2">
            <span className="block text-xs font-semibold text-text-primary">
              {t('onboarding.gender')}
            </span>
            {/* Phase 4 (Task 4.1): gender renders through the ONE
                SegmentedControl. */}
            <SegmentedControl
              ariaLabel={t('onboarding.gender')}
              value={genderSelection}
              options={(['male', 'female', 'other'] as const).map((g) => ({
                value: g,
                label: t(g === 'male' ? 'editProfile.genderMale' : g === 'female' ? 'editProfile.genderFemale' : 'editProfile.genderOther'),
              }))}
              onChange={(v) => setGenderSelection(v)}
            />
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
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent-text text-xs font-bold">
                  {t('profile.age')} {previewAge}
                </span>
              )}
            </div>
            <span className="block text-2xs text-text-muted">
              {t('onboarding.dateOfBirthHint')}
            </span>
            <DobPicker id="details-dob" value={dob} onChange={setDob} min={bounds.min} max={bounds.max} />
          </div>

          {/* Weight & height (Task 1.1) — asked here because the food
              target is computed from them; the only way past without
              them is the explicit skip button below. */}
          <div className="p-4 rounded-2xl bg-bg-card border border-border shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="block text-xs font-semibold text-text-primary">
                {t('onboarding.bodyStatsTitle')}
              </span>
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-bg-primary border border-border shrink-0">
                {(['kg', 'lbs'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => switchStatsUnit(u)}
                    className={`py-1 px-2.5 rounded-md text-2xs font-bold transition-all cursor-pointer ${
                      statsUnit === u
                        ? 'bg-bg-card text-text-primary shadow-2xs border border-border'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {t(u === 'kg' ? 'onboarding.unitKgCm' : 'onboarding.unitLbsIn')}
                  </button>
                ))}
              </div>
            </div>
            <span className="block text-2xs text-text-muted">{t('onboarding.bodyStatsHint')}</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="details-weight" className="text-2xs font-semibold text-text-secondary">
                  {t('onboarding.weightLabel')} ({statsUnit})
                </label>
                <input
                  id="details-weight"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={weightInput}
                  onChange={(e) => {
                    setWeightInput(e.target.value);
                    setStatsSkipped(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary outline-none transition"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="details-height" className="text-2xs font-semibold text-text-secondary">
                  {t('onboarding.heightLabel')} ({statsUnit === 'lbs' ? 'in' : 'cm'})
                </label>
                <input
                  id="details-height"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={heightInput}
                  onChange={(e) => {
                    setHeightInput(e.target.value);
                    setStatsSkipped(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary outline-none transition"
                />
              </div>
            </div>
            {statsSkipped ? (
              <p className="text-2xs text-text-muted">{t('onboarding.bodyStatsLaterNote')}</p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStatsSkipped(true);
                  setWeightInput('');
                  setHeightInput('');
                  setError(null);
                }}
                className="text-xs font-semibold text-accent-text hover:underline cursor-pointer"
              >
                {t('onboarding.addLater')}
              </button>
            )}
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
          className="w-full py-4 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:bg-bg-secondary disabled:text-text-muted disabled:border-border disabled:shadow-none disabled:opacity-100"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>{t('onboarding.calibrating')}</span>
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
