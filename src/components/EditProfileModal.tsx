'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, User, Check, Scale, Ruler, Camera, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Gender, Unit, MAX_ATHLETE_NAME_LENGTH } from '@/lib/types';
import { round1, sanitizeAthleteName } from '@/lib/formatters';
import { useAppNavigation } from '@/lib/navigation';
import { useEscapeToClose } from '@/lib/use-escape-to-close';
import { resizeAndCompressImage } from '@/lib/image-processing';

export interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  useEscapeToClose(isOpen, onClose);
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
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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
        setWeight(String(round1(lbsVal)));
      } else {
        setWeight(String(round1(profile.bodyweightKg)));
      }

      if (profile.heightCm) {
        if (profile.unit === 'lbs') {
          // Height in inches
          setHeight(round1(profile.heightCm / 2.54).toFixed(1));
        } else {
          setHeight(String(round1(profile.heightCm)));
        }
      } else {
        setHeight('');
      }

      setAvatar(profile.avatar);
      setErrors({});
    }
  }, [isOpen, profile]);

  if (!isOpen || !profile) return null;

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const processed = await resizeAndCompressImage(file, {
        maxDimension: 256,
        quality: 0.7,
        format: 'image/jpeg',
      });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the photo.'));
        reader.readAsDataURL(processed.blob);
      });
      setAvatar(dataUrl);
      // Save immediately — don't wait for the modal's Save button. The toast
      // says "Photo Set", so the photo must actually be set, even if the user
      // closes the modal without saving other fields.
      setProfile({ ...profile, avatar: dataUrl });
      toast.success('Profile photo updated.', 'Photo Set');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not set the photo.', 'Upload Failed');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

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

    const trimmedName = sanitizeAthleteName(name.trim(), MAX_ATHLETE_NAME_LENGTH);
    if (!trimmedName) {
      newErrors.name = 'Full name is required';
    } else if (trimmedName.length > MAX_ATHLETE_NAME_LENGTH) {
      newErrors.name = `Please keep your name under ${MAX_ATHLETE_NAME_LENGTH} characters`;
    }

    const parsedWeight = parseFloat(weight);
    const parsedWeightKg = unit === 'lbs' ? parsedWeight * 0.453592 : parsedWeight;
    if (isNaN(parsedWeight) || parsedWeightKg < 30 || parsedWeightKg > 300) {
      newErrors.weight =
        unit === 'kg'
          ? 'Please enter a realistic bodyweight between 30 kg and 300 kg.'
          : 'Please enter a realistic bodyweight between 66 lbs and 660 lbs.';
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
      const valCm = unit === 'lbs' ? val * 2.54 : val;
      // Same bounds as onboarding — never silently keep the old value.
      if (isNaN(val) || valCm < 100 || valCm > 250) {
        newErrors.height =
          unit === 'lbs'
            ? 'Please enter a valid height between 39 in and 98 in.'
            : 'Please enter a valid height between 100 cm and 250 cm.';
      } else {
        parsedHeightCm = Math.round(valCm);
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
      avatar,
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
          {/* Profile Photo */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt="Profile"
                  className="w-16 h-16 rounded-full object-cover border-2 border-accent/40"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-accent/15 border-2 border-accent/40 flex items-center justify-center font-bold text-accent text-2xl font-mono">
                  {(name || profile.name || 'A').trim().charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center shadow-md active:scale-90 transition-all cursor-pointer"
                title="Change profile photo"
                aria-label="Change profile photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="text-xs font-bold text-accent hover:underline text-left cursor-pointer disabled:opacity-50"
              >
                {isUploadingAvatar ? 'Uploading…' : avatar ? 'Change photo' : 'Add photo'}
              </button>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(undefined)}
                  className="text-2xs font-semibold text-text-muted hover:text-danger flex items-center gap-1 text-left cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove photo
                </button>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
              aria-label="Profile photo picker"
            />
          </div>

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
              maxLength={MAX_ATHLETE_NAME_LENGTH}
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
