'use client';

import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Gender, Unit, MAX_ATHLETE_NAME_LENGTH } from '@/lib/types';
import StepProgressBar from './StepProgressBar';

interface PersonalDetailsData {
  name: string;
  gender: Gender;
  age: number;
  weight: number;
  unit: Unit;
  heightCm: number;
}

interface PersonalDetailsScreenProps {
  initialName?: string;
  initialUnit?: Unit;
  initialGender?: Gender;
  initialAge?: number;
  initialWeight?: number;
  initialHeightCm?: number;
  onContinue: (details: PersonalDetailsData) => void;
  onBack: () => void;
  loading?: boolean;
}

export default function PersonalDetailsScreen({
  initialName = '',
  initialUnit = 'kg',
  initialGender = 'male',
  initialAge = 25,
  initialWeight = 70,
  initialHeightCm = 175,
  onContinue,
  onBack,
  loading = false,
}: PersonalDetailsScreenProps) {
  const [name, setName] = useState(initialName);
  const [genderSelection, setGenderSelection] = useState<'male' | 'female' | 'other'>(
    initialGender || 'male'
  );
  const [unit, setUnit] = useState<Unit>(initialUnit);
  const [age, setAge] = useState<string>(String(initialAge));

  // Weight entry state
  const [weightInput, setWeightInput] = useState<string>(
    initialUnit === 'lbs'
      ? String(Math.round(initialWeight * 2.20462))
      : String(initialWeight)
  );

  // Height entry state: either cm or ft/in
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>(
    initialUnit === 'lbs' ? 'ft' : 'cm'
  );
  const [heightCmInput, setHeightCmInput] = useState<string>(String(initialHeightCm));
  const [heightFt, setHeightFt] = useState<string>('5');
  const [heightIn, setHeightIn] = useState<string>('9');

  const [error, setError] = useState<string | null>(null);

  const handleUnitToggle = (newUnit: Unit) => {
    if (newUnit === unit) return;
    const currentVal = parseFloat(weightInput);
    if (!isNaN(currentVal) && currentVal > 0) {
      if (newUnit === 'lbs') {
        setWeightInput(String(Math.round(currentVal * 2.20462 * 10) / 10));
      } else {
        setWeightInput(String(Math.round(currentVal * 0.453592 * 10) / 10));
      }
    }
    setUnit(newUnit);
  };

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

    const parsedAge = parseInt(age, 10);
    if (!isNaN(parsedAge) && parsedAge < 13) {
      // Minimum-age guard: ASCEND is 13+. Nothing is stored in this case —
      // onContinue is never called, so no profile data is created.
      setError('ASCEND is designed for athletes aged 13 and older. If you are under 13, please do not create a profile — no information has been saved.');
      return;
    }
    if (isNaN(parsedAge) || parsedAge > 120) {
      setError('Please enter a valid age between 13 and 120.');
      return;
    }

    const parsedWeight = parseFloat(weightInput);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      setError('Please enter a valid bodyweight.');
      return;
    }

    // Convert to kg for internal standard
    const weightInKg = unit === 'lbs' ? parsedWeight * 0.453592 : parsedWeight;
    if (weightInKg < 30 || weightInKg > 300) {
      setError(
        unit === 'kg'
          ? 'Please enter a realistic bodyweight between 30 kg and 300 kg.'
          : 'Please enter a realistic bodyweight between 66 lbs and 660 lbs.'
      );
      return;
    }

    // Height calculation
    let calculatedHeightCm = 175;
    if (heightUnit === 'cm') {
      const parsedCm = parseFloat(heightCmInput);
      if (isNaN(parsedCm) || parsedCm < 100 || parsedCm > 250) {
        setError('Please enter a valid height between 100 cm and 250 cm.');
        return;
      }
      calculatedHeightCm = Math.round(parsedCm);
    } else {
      const ft = parseInt(heightFt, 10);
      const inch = parseInt(heightIn, 10);
      if (isNaN(ft) || isNaN(inch) || ft < 1 || ft > 8 || inch < 0 || inch >= 12) {
        setError('Please enter a valid height (e.g. 5 ft 9 in).');
        return;
      }
      const totalInches = ft * 12 + inch;
      const convertedCm = Math.round(totalInches * 2.54);
      if (convertedCm < 100 || convertedCm > 250) {
        setError('Please enter a realistic height.');
        return;
      }
      calculatedHeightCm = convertedCm;
    }

    onContinue({
      name: athleteName,
      gender: genderSelection,
      age: parsedAge,
      weight: Math.round(parsedWeight * 10) / 10,
      unit,
      heightCm: calculatedHeightCm,
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#F3F0E7] text-[#171916] flex flex-col justify-between pb-8 animate-fade-in">
      {/* Top 3-segment progress indicator (Step 3 of 3) */}
      <StepProgressBar currentStep={4} onBack={onBack} />

      {/* Main Content */}
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        {/* Header */}
        <div className="text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#171916] tracking-tight">
            Tell us about yourself
          </h1>
          <p className="text-sm text-[#858076]">
            This helps us calculate your strength standards, nutrition targets, and workout progression.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Details Form */}
        <form id="personal-details-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Athlete Name */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2DFD6] shadow-2xs space-y-1.5">
            <label htmlFor="details-name" className="block text-xs font-semibold text-[#171916]">
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
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] outline-none transition"
            />
          </div>

          {/* Gender Segmented Control: Male, Female, Other */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2DFD6] shadow-2xs space-y-2">
            <span className="block text-xs font-semibold text-[#171916]">
              Gender
            </span>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#F3F0E7] border border-[#E2DFD6]">
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
                        ? 'bg-white text-[#171916] shadow-2xs border border-[#E2DFD6]'
                        : 'text-[#858076] hover:text-[#171916]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Age & Bodyweight Row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Age */}
            <div className="p-4 rounded-2xl bg-white border border-[#E2DFD6] shadow-2xs space-y-1.5">
              <label htmlFor="details-age" className="block text-xs font-semibold text-[#171916]">
                Age
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="details-age"
                  type="number"
                  min={13}
                  max={100}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] outline-none transition font-medium"
                />
                <span className="text-xs text-[#858076] pr-1">yrs</span>
              </div>
            </div>

            {/* Weight with Unit Toggle */}
            <div className="p-4 rounded-2xl bg-white border border-[#E2DFD6] shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="details-weight" className="block text-xs font-semibold text-[#171916]">
                  Weight
                </label>
                <div className="flex items-center gap-0.5 rounded-lg bg-[#F3F0E7] p-0.5 border border-[#E2DFD6] text-3xs font-semibold">
                  <button
                    type="button"
                    onClick={() => handleUnitToggle('kg')}
                    className={`px-1.5 py-0.5 rounded transition ${
                      unit === 'kg' ? 'bg-white text-[#171916] shadow-xs' : 'text-[#858076]'
                    }`}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnitToggle('lbs')}
                    className={`px-1.5 py-0.5 rounded transition ${
                      unit === 'lbs' ? 'bg-white text-[#171916] shadow-xs' : 'text-[#858076]'
                    }`}
                  >
                    lbs
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  id="details-weight"
                  type="number"
                  step="0.5"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] outline-none transition font-medium"
                />
                <span className="text-xs text-[#858076] pr-1">{unit}</span>
              </div>
            </div>
          </div>

          {/* Height with cm / ft toggle */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2DFD6] shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="details-height-cm" className="block text-xs font-semibold text-[#171916]">
                Height
              </label>
              <div className="flex items-center gap-0.5 rounded-lg bg-[#F3F0E7] p-0.5 border border-[#E2DFD6] text-3xs font-semibold">
                <button
                  type="button"
                  onClick={() => setHeightUnit('cm')}
                  className={`px-1.5 py-0.5 rounded transition ${
                    heightUnit === 'cm' ? 'bg-white text-[#171916] shadow-xs' : 'text-[#858076]'
                  }`}
                >
                  cm
                </button>
                <button
                  type="button"
                  onClick={() => setHeightUnit('ft')}
                  className={`px-1.5 py-0.5 rounded transition ${
                    heightUnit === 'ft' ? 'bg-white text-[#171916] shadow-xs' : 'text-[#858076]'
                  }`}
                >
                  ft/in
                </button>
              </div>
            </div>

            {heightUnit === 'cm' ? (
              <div className="flex items-center gap-1.5">
                <input
                  id="details-height-cm"
                  type="number"
                  value={heightCmInput}
                  onChange={(e) => setHeightCmInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] outline-none transition font-medium"
                />
                <span className="text-xs text-[#858076] pr-1">cm</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <input
                    id="details-height-ft"
                    type="number"
                    value={heightFt}
                    onChange={(e) => setHeightFt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] outline-none transition font-medium"
                  />
                  <span className="text-xs text-[#858076] pr-1">ft</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    id="details-height-in"
                    type="number"
                    value={heightIn}
                    onChange={(e) => setHeightIn(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] outline-none transition font-medium"
                  />
                  <span className="text-xs text-[#858076] pr-1">in</span>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Bottom Actions */}
      <div className="w-full max-w-md mx-auto px-6 pt-4 space-y-3">
        <button
          type="submit"
          form="personal-details-form"
          disabled={loading}
          className="w-full py-4 px-6 rounded-xl bg-[#E44427] hover:bg-[#d03b20] active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Calibrating Program...</span>
            </>
          ) : (
            'Continue'
          )}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-[#F3F0E7]/60 active:scale-[0.99] text-[#171916] border border-[#171916]/20 font-semibold text-sm transition-all shadow-2xs cursor-pointer text-center"
        >
          Back
        </button>
      </div>
    </div>
  );
}
