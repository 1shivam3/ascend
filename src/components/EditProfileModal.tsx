'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Check, Scale, Ruler } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Gender, Unit } from '@/lib/types';
import { useAppNavigation } from '@/lib/navigation';

export interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const storeProfile = useStore((state) => state.profile);
  const profile = storeProfile ?? useStore.getState().profile;
  const setProfile = useStore((state) => state.setProfile);
  const updateBodyMetrics = useStore((state) => state.updateBodyMetrics);
  const toast = useToast();
  const { registerBackHandler } = useAppNavigation();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState<string>('');
  const [unit, setUnit] = useState<Unit>('lbs');
  const [weight, setWeight] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 130);
  }, [isOpen, onClose, registerBackHandler]);

  useEffect(() => {
    if (isOpen && profile) {
      setName(profile.name || '');
      setGender(profile.gender || 'male');
      setAge(profile.age ? String(profile.age) : '');
      setUnit(profile.unit || 'lbs');

      if (profile.unit === 'lbs') {
        const lbsVal = profile.bodyweightLbs || Math.round(profile.bodyweightKg * 2.20462);
        setWeight(String(lbsVal));
      } else {
        setWeight(String(profile.bodyweightKg));
      }

      if (profile.heightCm) {
        if (profile.unit === 'lbs') {
          // Height in inches
          setHeight((profile.heightCm / 2.54).toFixed(1));
        } else {
          setHeight(String(profile.heightCm));
        }
      } else {
        setHeight('');
      }

      setErrors({});
    }
  }, [isOpen, profile]);

  if (!isOpen || !profile) return null;

  const handleUnitToggle = (nextUnit: Unit) => {
    if (nextUnit === unit) return;
    const currentWeight = parseFloat(weight);
    if (!isNaN(currentWeight) && currentWeight > 0) {
      if (nextUnit === 'lbs') {
        setWeight((currentWeight * 2.20462).toFixed(1));
      } else {
        setWeight((currentWeight / 2.20462).toFixed(1));
      }
    }

    const currentHeight = parseFloat(height);
    if (!isNaN(currentHeight) && currentHeight > 0) {
      if (nextUnit === 'lbs') {
        setHeight((currentHeight / 2.54).toFixed(1));
      } else {
        setHeight((currentHeight * 2.54).toFixed(1));
      }
    }
    setUnit(nextUnit);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Full name is required';
    }

    const parsedWeight = parseFloat(weight);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      newErrors.weight = 'Valid bodyweight is required';
    }

    let parsedAge: number | undefined = undefined;
    if (age.trim()) {
      parsedAge = parseInt(age, 10);
      if (isNaN(parsedAge) || parsedAge < 13 || parsedAge > 120) {
        newErrors.age = 'Age must be between 13 and 120';
      }
    }

    let parsedHeightCm: number | undefined = undefined;
    if (height.trim()) {
      const val = parseFloat(height);
      if (!isNaN(val) && val > 0) {
        parsedHeightCm = unit === 'lbs' ? Math.round(val * 2.54) : Math.round(val);
        if (parsedHeightCm < 50 || parsedHeightCm > 260) {
          newErrors.height = 'Height out of valid range';
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const weightKg = unit === 'lbs' ? Math.round((parsedWeight * 0.453592) * 10) / 10 : Math.round(parsedWeight * 10) / 10;
    const weightLbs = unit === 'lbs' ? Math.round(parsedWeight * 10) / 10 : Math.round((parsedWeight * 2.20462) * 10) / 10;

    setProfile({
      ...profile,
      name: trimmedName,
      gender,
      age: parsedAge,
      unit,
      bodyweightKg: weightKg,
      bodyweightLbs: weightLbs,
      heightCm: parsedHeightCm || profile.heightCm,
    });

    // Also update body metrics entry
    updateBodyMetrics(weightKg, parsedHeightCm);

    toast.success('Profile details saved successfully!', 'Profile Updated');
    onClose();
  };

  return (
    <div
      className="modal-overlay z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-content max-w-md w-full p-5 sm:p-6 space-y-5 rounded-2xl bg-bg-card border border-border shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary leading-tight font-sans">
                Edit Profile
              </h2>
              <p className="text-2xs text-text-muted font-mono">Calibrate Personal Athlete Details</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-text-primary transition-colors flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary font-sans">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="Your name"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border focus:border-accent text-sm text-text-primary outline-none transition-colors"
            />
            {errors.name && <p className="text-2xs text-accent mt-0.5">{errors.name}</p>}
          </div>

          {/* Gender Selection (Supports Male, Female, Other) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary font-sans">Gender Identity</label>
            <div className="grid grid-cols-3 gap-2">
              {(['male', 'female', 'other'] as Gender[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold font-sans transition-all capitalize border cursor-pointer ${
                    gender === g
                      ? 'bg-accent text-white border-accent shadow-xs'
                      : 'bg-bg-secondary text-text-muted border-border hover:text-text-primary'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Unit & Age */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary font-sans">Units</label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border">
                <button
                  type="button"
                  onClick={() => handleUnitToggle('lbs')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    unit === 'lbs'
                      ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  LBS / IN
                </button>
                <button
                  type="button"
                  onClick={() => handleUnitToggle('kg')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    unit === 'kg'
                      ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  KG / CM
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary font-sans">Age (years)</label>
              <input
                type="number"
                value={age}
                onChange={(e) => {
                  setAge(e.target.value);
                  if (errors.age) setErrors((prev) => ({ ...prev, age: '' }));
                }}
                placeholder="e.g. 28"
                min={13}
                max={120}
                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border focus:border-accent text-sm text-text-primary outline-none transition-colors"
              />
              {errors.age && <p className="text-2xs text-accent mt-0.5">{errors.age}</p>}
            </div>
          </div>

          {/* Weight & Height */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary font-sans flex items-center justify-between">
                <span>Bodyweight</span>
                <span className="text-2xs font-mono text-text-muted uppercase">{unit}</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  if (errors.weight) setErrors((prev) => ({ ...prev, weight: '' }));
                }}
                placeholder={unit === 'lbs' ? '175.0' : '79.5'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border focus:border-accent text-sm text-text-primary outline-none transition-colors"
              />
              {errors.weight && <p className="text-2xs text-accent mt-0.5">{errors.weight}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary font-sans flex items-center justify-between">
                <span>Height</span>
                <span className="text-2xs font-mono text-text-muted uppercase">
                  {unit === 'lbs' ? 'inches' : 'cm'}
                </span>
              </label>
              <input
                type="number"
                step="0.1"
                value={height}
                onChange={(e) => {
                  setHeight(e.target.value);
                  if (errors.height) setErrors((prev) => ({ ...prev, height: '' }));
                }}
                placeholder={unit === 'lbs' ? '70.0' : '178'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border focus:border-accent text-sm text-text-primary outline-none transition-colors"
              />
              {errors.height && <p className="text-2xs text-accent mt-0.5">{errors.height}</p>}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border/80 text-xs font-bold text-text-primary transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-dim text-white text-xs font-bold transition-all shadow-sm shadow-accent/20 cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
