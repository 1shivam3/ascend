'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useStore } from '@/lib/store';
import { X, Scale, History, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { getLocalTodayStr, round1 } from '@/lib/formatters';
import { useTranslation } from '@/lib/i18n';

interface BodyMetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface BodyMetricsFormInput {
  weight: string;
  height: string;
  bodyFat: string;
  chest: string;
  waist: string;
  hips: string;
  unit: 'kg' | 'lbs';
}

export type BodyMetricsField = 'weight' | 'height' | 'bodyFat' | 'chest' | 'waist' | 'hips';

export interface BodyMetricsFormResult {
  errors: Partial<Record<BodyMetricsField, string>>;
  values?: {
    weightKg: number;
    heightCm?: number;
    bodyFatPct?: number;
    chestIn?: number;
    waistIn?: number;
    hipsIn?: number;
  };
}

/**
 * QA4-025: validate the measurement form. Previously every invalid
 * value failed SILENTLY — an out-of-range weight was a no-op, an
 * out-of-range height was quietly replaced with the profile height,
 * and body fat ≥70% was dropped without a word. Now every entered
 * value is either accepted or produces a visible field error; blank
 * optional fields stay valid (they mean "not measured").
 * Weight bounds match onboarding/EditProfile: 30–300 kg.
 */
export function validateBodyMetricsForm(input: BodyMetricsFormInput): BodyMetricsFormResult {
  const errors: Partial<Record<BodyMetricsField, string>> = {};
  const { unit } = input;

  const parsedWeight = parseFloat(input.weight);
  const weightKg = unit === 'lbs' ? parsedWeight * 0.453592 : parsedWeight;
  if (isNaN(parsedWeight) || weightKg < 30 || weightKg > 300) {
    errors.weight =
      unit === 'lbs'
        ? 'Please enter a realistic bodyweight between 66 lbs and 660 lbs.'
        : 'Please enter a realistic bodyweight between 30 kg and 300 kg.';
  }

  let heightCm: number | undefined;
  if (input.height.trim() !== '') {
    const cm = unit === 'lbs' ? parseFloat(input.height) * 2.54 : parseFloat(input.height);
    if (isNaN(cm) || cm < 100 || cm > 250) {
      errors.height =
        unit === 'lbs'
          ? 'Height must be between 39 and 98 inches.'
          : 'Height must be between 100 cm and 250 cm.';
    } else {
      heightCm = Math.round(cm);
    }
  }

  let bodyFatPct: number | undefined;
  if (input.bodyFat.trim() !== '') {
    const fat = parseFloat(input.bodyFat);
    if (isNaN(fat) || fat <= 0 || fat >= 70) {
      errors.bodyFat = 'Body fat must be greater than 0% and below 70%.';
    } else {
      bodyFatPct = fat;
    }
  }

  const circumference = (
    raw: string,
    field: 'chest' | 'waist' | 'hips',
    label: string
  ): number | undefined => {
    if (raw.trim() === '') return undefined;
    const parsed = parseFloat(raw);
    const inches = unit === 'kg' ? parsed / 2.54 : parsed;
    if (isNaN(parsed) || inches <= 0 || inches > 100) {
      errors[field] = `${label} looks off — check the value or leave it blank.`;
      return undefined;
    }
    return inches;
  };
  const chestIn = circumference(input.chest, 'chest', 'Chest');
  const waistIn = circumference(input.waist, 'waist', 'Waist');
  const hipsIn = circumference(input.hips, 'hips', 'Hips');

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    values: { weightKg, heightCm, bodyFatPct, chestIn, waistIn, hipsIn },
  };
}

export default function BodyMetricsModal({ isOpen, onClose }: BodyMetricsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t } = useTranslation();
  const profile = useStore((state) => state.profile);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const updateBodyMetrics = useStore((state) => state.updateBodyMetrics);
  const deleteBodyMetric = useStore((state) => state.deleteBodyMetric);

  const preferredUnit = profile?.unit || 'kg';
  const currentWeightKg = profile?.bodyweightKg || 75;

  const [weightInput, setWeightInput] = useState<string>('');
  const [heightInput, setHeightInput] = useState<string>('');
  const [bodyFatInput, setBodyFatInput] = useState<string>('');
  const [chestInput, setChestInput] = useState<string>('');
  const [waistInput, setWaistInput] = useState<string>('');
  const [hipsInput, setHipsInput] = useState<string>('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(preferredUnit);
  const [dateInput, setDateInput] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errors, setErrors] = useState<Partial<Record<BodyMetricsField, string>>>({});

  useEffect(() => {
    if (isOpen) {
      const displayWeight =
        unit === 'lbs'
          ? (currentWeightKg * 2.20462).toFixed(1)
          : currentWeightKg.toFixed(1);
      setWeightInput(displayWeight);
      setHeightInput(
        profile?.heightCm
          ? unit === 'lbs'
            ? round1(profile.heightCm / 2.54).toFixed(1)
            : String(round1(profile.heightCm))
          : ''
      );
      setDateInput(getLocalTodayStr());
      setSuccessMsg('');
      setErrors({});

      const latest = bodyMetrics && bodyMetrics.length > 0
        ? [...bodyMetrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;

      if (latest) {
        setBodyFatInput(latest.bodyFatPct !== undefined ? String(round1(latest.bodyFatPct)) : '');
        if (latest.chestIn !== undefined) {
          setChestInput(unit === 'lbs' ? String(round1(latest.chestIn)) : (round1(latest.chestIn) * 2.54).toFixed(1));
        }
        if (latest.waistIn !== undefined) {
          setWaistInput(unit === 'lbs' ? String(round1(latest.waistIn)) : (round1(latest.waistIn) * 2.54).toFixed(1));
        }
        if (latest.hipsIn !== undefined) {
          setHipsInput(unit === 'lbs' ? String(round1(latest.hipsIn)) : (round1(latest.hipsIn) * 2.54).toFixed(1));
        }
      }
    }
  }, [isOpen, currentWeightKg, unit, profile?.heightCm, bodyMetrics]);

  if (!isOpen) return null;

  const handleUnitToggle = (newUnit: 'kg' | 'lbs') => {
    if (newUnit === unit) return;
    const currentVal = parseFloat(weightInput);
    if (!isNaN(currentVal) && currentVal > 0) {
      if (newUnit === 'lbs') {
        setWeightInput((currentVal * 2.20462).toFixed(1));
      } else {
        setWeightInput((currentVal / 2.20462).toFixed(1));
      }
    }
    // Convert circumference inputs
    const cVal = parseFloat(chestInput);
    if (!isNaN(cVal) && cVal > 0) {
      setChestInput(newUnit === 'lbs' ? (cVal / 2.54).toFixed(1) : (cVal * 2.54).toFixed(1));
    }
    const wVal = parseFloat(waistInput);
    if (!isNaN(wVal) && wVal > 0) {
      setWaistInput(newUnit === 'lbs' ? (wVal / 2.54).toFixed(1) : (wVal * 2.54).toFixed(1));
    }
    const hVal = parseFloat(hipsInput);
    if (!isNaN(hVal) && hVal > 0) {
      setHipsInput(newUnit === 'lbs' ? (hVal / 2.54).toFixed(1) : (hVal * 2.54).toFixed(1));
    }
    // Convert height input too
    const htVal = parseFloat(heightInput);
    if (!isNaN(htVal) && htVal > 0) {
      setHeightInput(newUnit === 'lbs' ? (htVal / 2.54).toFixed(1) : (htVal * 2.54).toFixed(1));
    }
    setUnit(newUnit);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // QA4-025: no silent failure paths — invalid input shows a field
    // error and nothing is saved until the form validates.
    const { errors: formErrors, values } = validateBodyMetricsForm({
      weight: weightInput,
      height: heightInput,
      bodyFat: bodyFatInput,
      chest: chestInput,
      waist: waistInput,
      hips: hipsInput,
      unit,
    });
    setErrors(formErrors);
    if (!values) return;

    updateBodyMetrics(
      values.weightKg,
      // A blank height field means "unchanged" — keep the profile height.
      values.heightCm ?? profile?.heightCm,
      values.bodyFatPct,
      values.chestIn,
      values.waistIn,
      values.hipsIn
    );
    setSuccessMsg(t('bodyMetrics.savedMsg'));
    setTimeout(() => {
      setSuccessMsg('');
      onClose();
    }, 700);
  };

  // Sort history newest first
  const sortedMetrics = [...bodyMetrics].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-5 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-text-primary leading-tight">
                {t('progress.logMeasurement')}
              </h2>
              <p className="text-2xs text-text-muted font-mono">{t('bodyMetrics.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* Weight Field */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="modal-weight-input" className="section-title text-2xs font-mono uppercase text-text-muted">
                {t('bodyMetrics.bodyweight')}
              </label>
              <div className="flex rounded-md bg-bg-secondary p-0.5 border border-border/80">
                <button
                  type="button"
                  onClick={() => handleUnitToggle('kg')}
                  className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all cursor-pointer ${
                    unit === 'kg'
                      ? 'bg-accent text-bg-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  KG
                </button>
                <button
                  type="button"
                  onClick={() => handleUnitToggle('lbs')}
                  className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all cursor-pointer ${
                    unit === 'lbs'
                      ? 'bg-accent text-bg-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  LBS
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                id="modal-weight-input"
                type="number"
                step="0.1"
                min={unit === 'kg' ? 30 : 66}
                max={unit === 'kg' ? 300 : 660}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder={unit === 'kg' ? '75.0' : '165.0'}
                className="w-full text-lg font-mono font-bold pl-3 pr-12 py-2.5 rounded-xl bg-bg-secondary border border-border/80 text-text-primary focus:outline-none focus:border-accent"
                required
                autoFocus
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted uppercase">
                {unit}
              </span>
            </div>
            {errors.weight && <p className="text-danger text-xs mt-1.5 font-medium">{errors.weight}</p>}
          </div>

          {/* Height Field */}
          <div>
            <label htmlFor="modal-height-input" className="section-title text-2xs font-mono uppercase text-text-muted block mb-1">
              {unit === 'lbs' ? t('bodyMetrics.heightIn') : t('bodyMetrics.heightCm')}
            </label>
            <div className="relative">
              <input
                id="modal-height-input"
                type="number"
                step="1"
                min="100"
                max="250"
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                placeholder="175"
                className="w-full text-sm font-mono font-bold pl-3 pr-12 py-2.5 rounded-xl bg-bg-secondary border border-border/80 text-text-primary focus:outline-none focus:border-accent"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted uppercase">
                CM
              </span>
            </div>
            <p className="text-3xs text-text-muted mt-1 font-mono">
              {t('bodyMetrics.heightHint')}
            </p>
            {errors.height && <p className="text-danger text-xs mt-1.5 font-medium">{errors.height}</p>}
          </div>

          {/* Circumference & Body Fat Fields (Optional) */}
          <div className="pt-2 border-t border-border/50 space-y-3">
            <span className="section-title text-2xs font-mono uppercase text-text-muted block">
              {t('bodyMetrics.measurementsOptional')}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="modal-fat-input" className="text-3xs font-mono text-text-muted uppercase block mb-1">
                  {t('bodyMetrics.bodyFatPct')}
                </label>
                <input
                  id="modal-fat-input"
                  type="number"
                  step="0.1"
                  min="3"
                  max="60"
                  value={bodyFatInput}
                  onChange={(e) => setBodyFatInput(e.target.value)}
                  placeholder="12.5"
                  className="w-full text-xs font-mono font-bold py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 text-text-primary focus:outline-none focus:border-accent"
                />
                {errors.bodyFat && <p className="text-danger text-xs mt-1 font-medium">{errors.bodyFat}</p>}
              </div>
              <div>
                <label htmlFor="modal-chest-input" className="text-3xs font-mono text-text-muted uppercase block mb-1">
                  {t('bodyMetrics.chestUnit', { unit: unit === 'lbs' ? 'IN' : 'CM' })}
                </label>
                <input
                  id="modal-chest-input"
                  type="number"
                  step="0.5"
                  min="20"
                  max="200"
                  value={chestInput}
                  onChange={(e) => setChestInput(e.target.value)}
                  placeholder={unit === 'lbs' ? '42' : '107'}
                  className="w-full text-xs font-mono font-bold py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 text-text-primary focus:outline-none focus:border-accent"
                />
                {errors.chest && <p className="text-danger text-xs mt-1 font-medium">{errors.chest}</p>}
              </div>
              <div>
                <label htmlFor="modal-waist-input" className="text-3xs font-mono text-text-muted uppercase block mb-1">
                  {t('bodyMetrics.waistUnit', { unit: unit === 'lbs' ? 'IN' : 'CM' })}
                </label>
                <input
                  id="modal-waist-input"
                  type="number"
                  step="0.5"
                  min="20"
                  max="200"
                  value={waistInput}
                  onChange={(e) => setWaistInput(e.target.value)}
                  placeholder={unit === 'lbs' ? '32' : '81'}
                  className="w-full text-xs font-mono font-bold py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 text-text-primary focus:outline-none focus:border-accent"
                />
                {errors.waist && <p className="text-danger text-xs mt-1 font-medium">{errors.waist}</p>}
              </div>
              <div>
                <label htmlFor="modal-hips-input" className="text-3xs font-mono text-text-muted uppercase block mb-1">
                  {t('bodyMetrics.hipsUnit', { unit: unit === 'lbs' ? 'IN' : 'CM' })}
                </label>
                <input
                  id="modal-hips-input"
                  type="number"
                  step="0.5"
                  min="20"
                  max="200"
                  value={hipsInput}
                  onChange={(e) => setHipsInput(e.target.value)}
                  placeholder={unit === 'lbs' ? '38' : '96'}
                  className="w-full text-xs font-mono font-bold py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 text-text-primary focus:outline-none focus:border-accent"
                />
                {errors.hips && <p className="text-danger text-xs mt-1 font-medium">{errors.hips}</p>}
              </div>
            </div>
          </div>

          {/* Date Field */}
          <div>
            <label htmlFor="modal-date-input" className="section-title text-2xs font-mono uppercase text-text-muted block mb-1">
              {t('bodyMetrics.entryDate')}
            </label>
            <div className="relative">
              <input
                id="modal-date-input"
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full text-sm font-mono py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('bodyMetrics.save')}</span>
          </button>
        </form>

        {/* History Log Section */}
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-mono uppercase font-bold text-text-muted flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-accent" />
              {t('bodyMetrics.historyTitle')}
            </span>
            <span className="text-2xs font-mono text-text-muted">
              {t('bodyMetrics.entries', { count: sortedMetrics.length })}
            </span>
          </div>

          {sortedMetrics.length === 0 ? (
            <p className="text-2xs text-text-muted font-mono italic text-center py-3 bg-bg-secondary/40 rounded-xl">
              {t('bodyMetrics.noEntries')}
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {sortedMetrics.map((entry, idx) => {
                const prev = sortedMetrics[idx + 1];
                const diffKg = prev ? entry.weightKg - prev.weightKg : null;
                const displayWeight =
                  preferredUnit === 'lbs'
                    ? `${Math.round(entry.weightKg * 2.20462 * 10) / 10} lbs`
                    : `${entry.weightKg} kg`;

                const diffFormatted =
                  diffKg !== null
                    ? diffKg > 0
                      ? `+${preferredUnit === 'lbs' ? (diffKg * 2.20462).toFixed(1) : diffKg.toFixed(1)}`
                      : `${preferredUnit === 'lbs' ? (diffKg * 2.20462).toFixed(1) : diffKg.toFixed(1)}`
                    : null;

                return (
                  <div
                    key={entry.id}
                    className="p-2.5 rounded-lg bg-bg-secondary border border-border/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-text-primary text-sm">
                          {displayWeight}
                        </span>
                        {diffFormatted && (
                          <span
                            className={`text-2xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                              diffKg && diffKg > 0
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {diffFormatted} {preferredUnit}
                          </span>
                        )}
                      </div>
                      <span className="text-2xs font-mono text-text-muted block mt-0.5">
                        {entry.date}
                        {entry.source === 'health-connect' && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold">
                            Health Connect
                          </span>
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteBodyMetric(entry.id)}
                      className="p-1 text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
                      title={t('bodyMetrics.deleteRecord')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
