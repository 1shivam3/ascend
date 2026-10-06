'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  ArrowRight,
  RotateCcw,
  Upload,
  Check,
  Shield,
  Zap,
  Target,
  Clock,
  Sparkles,
} from 'lucide-react';
import { calculateOneRepMax } from '@/lib/strength-standards';
import { PersonalRecord, AthleteGoal, PlannedWorkout } from '@/lib/types';
import { getGoalAdaptiveSplitTemplates } from '@/lib/workout-engine';
import { calculateRecommendedMacroGoals } from '@/lib/macros';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

interface GoalOption {
  id: AthleteGoal;
  title: string;
  tagline: string;
  focus: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'build_muscle',
    title: 'Build Muscle',
    tagline: 'Hypertrophy volume & progressive overload',
    focus: '8–12 rep hypertrophy, muscular tension, structural volume',
  },
  {
    id: 'get_stronger',
    title: 'Get Stronger',
    tagline: 'Heavy compound strength & RPE autoregulation',
    focus: '4–6 rep heavy compounds, neurological adaptations, PR progression',
  },
  {
    id: 'lose_fat',
    title: 'Lose Fat',
    tagline: 'Preserve muscle & optimize lean body mass',
    focus: 'Lean tissue retention, energy balance, steady progression',
  },
  {
    id: 'stamina',
    title: 'Improve Fitness',
    tagline: 'Work capacity, stamina & cardiovascular base',
    focus: 'Higher work capacity, short rests, muscular endurance',
  },
  {
    id: 'general_fitness',
    title: 'General Fitness',
    tagline: 'Balanced functional strength, joint health & longevity',
    focus: 'Total-body balance, functional movement patterns, joint resilience',
  },
];

type EquipmentChoice = 'full_gym' | 'barbell_only' | 'home_dumbbells' | 'bodyweight_only';

interface EquipmentOption {
  id: EquipmentChoice;
  title: string;
  desc: string;
}

const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  {
    id: 'full_gym',
    title: 'Commercial Gym',
    desc: 'Barbells, dumbbells, cables, selectorized machines, leg press',
  },
  {
    id: 'barbell_only',
    title: 'Home Gym / Barbell',
    desc: 'Power rack, Olympic barbell, weight plates, flat/incline bench',
  },
  {
    id: 'home_dumbbells',
    title: 'Dumbbells & Bench',
    desc: 'Adjustable dumbbells, flat bench, pull-up bar',
  },
  {
    id: 'bodyweight_only',
    title: 'Bodyweight & Calisthenics',
    desc: 'Pull-up bar, dip bars, resistance bands, floor work',
  },
];

export default function OnboardingScreen() {
  const toast = useToast();
  // Step 0: Goal & Name
  // Step 1: Experience
  // Step 2: Training Days
  // Step 3: Equipment
  // Step 4: Optional Bio Profile (Sex, BW, Height, Age, optional lifts)
  // Step 5: Ready to Train (Day 1 Preview & Launch)
  const [step, setStep] = useState<number>(0);

  // Profile fields
  const [name, setName] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<AthleteGoal>('build_muscle');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [equipment, setEquipment] = useState<EquipmentChoice>('full_gym');

  // Bio fields
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyweight, setBodyweight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const [heightCm, setHeightCm] = useState('');
  const [age, setAge] = useState('24');

  // Optional baseline lifts (only shown for advanced / experienced or upon request)
  const [showOptionalLifts, setShowOptionalLifts] = useState(false);
  const [benchWeight, setBenchWeight] = useState('');
  const [benchReps, setBenchReps] = useState('5');
  const [squatWeight, setSquatWeight] = useState('');
  const [squatReps, setSquatReps] = useState('5');
  const [deadliftWeight, setDeadliftWeight] = useState('');
  const [deadliftReps, setDeadliftReps] = useState('5');
  const [ohpWeight, setOhpWeight] = useState('');
  const [ohpReps, setOhpReps] = useState('5');

  // Emergency snapshot detection & restore
  const [backupSnapshot, setBackupSnapshot] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const snap = localStorage.getItem('ascend_emergency_snapshot');
        if (snap) {
          const parsed = JSON.parse(snap);
          if (parsed?.profile?.name || (Array.isArray(parsed?.prs) && parsed.prs.length > 0)) {
            setBackupSnapshot(parsed);
          }
        }
      } catch {}
    }
  }, []);

  const {
    setProfile,
    setGoals,
    setUserMode,
    setTrainingProfile,
    addMultiplePRs,
    addBodyMetric,
    importAllData,
    setPlannedWorkouts,
    setMacroGoals,
  } = useStore();

  // Generated split based on selected goal and unit
  const generatedSplit = useMemo<PlannedWorkout[]>(() => {
    return getGoalAdaptiveSplitTemplates(primaryGoal, unit);
  }, [primaryGoal, unit]);

  const dayOneWorkout = useMemo(() => {
    return generatedSplit[0] || null;
  }, [generatedSplit]);

  const handleFinish = (skipLifts = true) => {
    const bw = parseFloat(bodyweight) || (unit === 'lbs' ? 160 : 72);
    const athleteName = name.trim() || 'Athlete';

    const bodyweightKg = unit === 'lbs' ? bw * 0.453592 : bw;
    const bodyweightLbs = unit === 'kg' ? bw * 2.20462 : bw;
    const parsedHeight = parseFloat(heightCm);
    const validHeight = !isNaN(parsedHeight) && parsedHeight > 50 && parsedHeight < 260 ? parsedHeight : undefined;
    const parsedAge = parseInt(age, 10);
    const validAge = !isNaN(parsedAge) && parsedAge >= 14 && parsedAge <= 90 ? parsedAge : 24;

    const profileData = {
      id: crypto.randomUUID(),
      name: athleteName,
      gender,
      bodyweightKg: Math.round(bodyweightKg * 10) / 10,
      bodyweightLbs: Math.round(bodyweightLbs * 10) / 10,
      heightCm: validHeight,
      age: validAge,
      unit,
      createdAt: new Date().toISOString(),
      goals: [primaryGoal],
    };

    setProfile(profileData);
    setGoals([primaryGoal]);
    setUserMode(experienceLevel === 'beginner' ? 'beginner' : 'advanced');

    setTrainingProfile({
      goal: primaryGoal === 'get_stronger'
        ? 'strength'
        : primaryGoal === 'build_muscle'
        ? 'muscle_gain'
        : primaryGoal === 'lose_fat'
        ? 'fat_loss'
        : 'general_fitness',
      experience: experienceLevel,
      daysPerWeek,
      preferredDurationMin: 45,
      equipment,
      preferredSplit: daysPerWeek >= 5 ? 'push_pull_legs' : daysPerWeek === 4 ? 'upper_lower' : 'full_body',
      dislikedExercises: [],
      injuriesOrLimitations: [],
      coachingStyle: 'balanced',
    });

    // 1. Initialize split routine tailored to athlete's primary goal & weight unit
    setPlannedWorkouts(generatedSplit);

    // 2. Initialize calibrated nutritional baseline with zero Atwater drift
    const initialMacros = calculateRecommendedMacroGoals(bodyweightKg, primaryGoal, gender, validHeight, validAge);
    setMacroGoals(initialMacros);

    const today = new Date().toISOString().split('T')[0];

    // Log initial body metric entry
    addBodyMetric({
      id: crypto.randomUUID(),
      date: today,
      weightKg: Math.round(bodyweightKg * 10) / 10,
      heightCm: validHeight,
      notes: 'Initial Onboarding Calibration',
    });

    // Optional lifts
    if (!skipLifts) {
      const initialPRs: PersonalRecord[] = [];

      const checkAndAdd = (exercise: string, wStr: string, rStr: string) => {
        const w = parseFloat(wStr);
        const r = parseInt(rStr, 10) || 1;
        if (!isNaN(w) && w > 0) {
          const wKg = unit === 'lbs' ? w * 0.453592 : w;
          const wLbs = unit === 'kg' ? w * 2.20462 : w;
          const oneRepMaxKg = calculateOneRepMax(wKg, r);

          initialPRs.push({
            id: crypto.randomUUID(),
            exercise,
            weightKg: Math.round(wKg * 10) / 10,
            weightLbs: Math.round(wLbs * 10) / 10,
            reps: r,
            oneRepMax: Math.round(oneRepMaxKg * 10) / 10,
            date: today,
            notes: 'Baseline calibration (entered)',
            isBaseline: true,
          });
        }
      };

      checkAndAdd('Bench Press', benchWeight, benchReps);
      checkAndAdd('Squat', squatWeight, squatReps);
      checkAndAdd('Deadlift', deadliftWeight, deadliftReps);
      checkAndAdd('Overhead Press', ohpWeight, ohpReps);

      if (initialPRs.length > 0) {
        addMultiplePRs(initialPRs);
      }
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-4 py-8 text-text-primary">
      <div className="w-full max-w-sm space-y-5">
        {/* Brand Instrument Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-bg-secondary border border-border/80 text-accent mb-1 shadow-xs">
            <Dumbbell className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-black tracking-tight font-sans text-text-primary">
            ASCEND
          </h1>
          <p className="text-text-muted text-xs">
            Precision training that adapts to you.
          </p>
        </div>

        {/* Auto-detected Backup Notification */}
        {backupSnapshot && (
          <Card variant="default" padding="sm" className="border-accent/40 bg-accent/10 space-y-2">
            <div className="flex items-center gap-1.5 text-accent font-bold text-xs">
              <RotateCcw className="w-4 h-4" />
              <span>Previous Profile Detected</span>
            </div>
            <p className="text-2xs text-text-secondary leading-snug">
              Found profile for <strong className="text-text-primary">{backupSnapshot.profile?.name || 'Athlete'}</strong> ({backupSnapshot.workouts?.length || 0} workouts logged).
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() => {
                  const ok = importAllData(backupSnapshot);
                  if (ok) {
                    toast.success('Restored athlete profile and records!', 'Restored');
                  }
                }}
              >
                Restore (1-Tap)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('ascend_emergency_snapshot');
                  }
                  setBackupSnapshot(null);
                }}
              >
                Start Fresh
              </Button>
            </div>
          </Card>
        )}

        {/* ── STEP 0: WELCOME & PRIMARY GOAL ── */}
        {step === 0 && (
          <div className="space-y-4 animate-fade-in">
            <div className="space-y-1.5">
              <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                WHAT IS YOUR MAIN TRAINING GOAL?
              </label>
              <div className="space-y-2">
                {GOAL_OPTIONS.map((g) => {
                  const isSelected = primaryGoal === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setPrimaryGoal(g.id)}
                      className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent/30'
                          : 'border-border/80 bg-bg-card hover:border-border hover:bg-bg-secondary/40'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-accent bg-accent text-white' : 'border-border bg-bg-secondary'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm font-bold block ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                          {g.title}
                        </span>
                        <p className="text-2xs text-text-muted mt-0.5 leading-snug">{g.tagline}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                WHAT SHOULD WE CALL YOU?
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Athlete name"
                className="w-full text-sm font-semibold py-2.5 px-3.5 rounded-xl bg-bg-card border border-border/80 outline-none focus:border-accent text-text-primary placeholder:text-text-muted/60"
                maxLength={24}
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => setStep(1)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Continue
            </Button>

            {/* Restore from JSON */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-2xs text-text-muted hover:text-accent inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>Restore from backup JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    try {
                      const content = event.target?.result as string;
                      const parsed = JSON.parse(content);
                      const ok = importAllData(parsed);
                      if (ok) {
                        toast.success('Backup file restored successfully!', 'Restored');
                      }
                    } catch {
                      toast.error('Could not parse JSON backup file.', 'Invalid file');
                    }
                  };
                  reader.readAsText(file);
                }}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* ── STEP 1: EXPERIENCE LEVEL ── */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                EXPERIENCE LEVEL
              </span>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="text-2xs text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-snug">
              ASCEND adapts its interface and metrics to your background.
            </p>

            <div className="space-y-2.5">
              {[
                {
                  id: 'beginner' as const,
                  title: 'Beginner / Casual Gym-Goer',
                  badge: 'Guided & Clear',
                  desc: 'Simple 1-tap logging, guided weights, and plain-language effort prompts. No technical formulas or clutter.',
                },
                {
                  id: 'intermediate' as const,
                  title: 'Intermediate Trainee',
                  badge: 'Balanced',
                  desc: 'Consistent lifter. Multi-set progress, progressive overload suggestions, and recovery awareness.',
                },
                {
                  id: 'advanced' as const,
                  title: 'Advanced / Strength Trainee',
                  badge: 'Full Precision',
                  desc: 'Experienced lifter. Full RPE/RIR tracking, e1RM curves, fatigue ledger, plate loader, and warm-up ramp.',
                },
              ].map((exp) => {
                const isSelected = experienceLevel === exp.id;
                return (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => setExperienceLevel(exp.id)}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent/30'
                        : 'border-border/80 bg-bg-card hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                        {exp.title}
                      </span>
                      <Badge variant={isSelected ? 'brand' : 'neutral'} size="xs">
                        {exp.badge}
                      </Badge>
                    </div>
                    <p className="text-2xs text-text-muted leading-relaxed">{exp.desc}</p>
                  </button>
                );
              })}
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => setStep(2)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Continue to Schedule
            </Button>
          </div>
        )}

        {/* ── STEP 2: TRAINING DAYS ── */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                TRAINING SCHEDULE
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-2xs text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-snug">
              How many days per week can you realistically commit to training?
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { days: 3, label: '3 Days / wk', split: 'Full Body (3×)', badge: 'Time Efficient' },
                { days: 4, label: '4 Days / wk', split: 'Upper / Lower (2×)', badge: 'Recommended' },
                { days: 5, label: '5 Days / wk', split: 'PPL + Upper / Lower', badge: 'High Frequency' },
                { days: 6, label: '6 Days / wk', split: 'Push / Pull / Legs (2×)', badge: 'Dedicated' },
              ].map((s) => {
                const isSelected = daysPerWeek === s.days;
                return (
                  <button
                    key={s.days}
                    type="button"
                    onClick={() => setDaysPerWeek(s.days)}
                    className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/15 text-text-primary shadow-xs ring-1 ring-accent/30'
                        : 'border-border/80 bg-bg-card hover:border-border text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-base font-black font-display tracking-tight ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                        {s.label}
                      </span>
                    </div>
                    <span className="text-3xs text-text-muted font-mono block leading-snug">
                      {s.split}
                    </span>
                    {s.badge === 'Recommended' && (
                      <span className="inline-flex items-center gap-1 mt-2 text-[9px] font-mono font-bold text-accent uppercase tracking-wider">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Recommended</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => setStep(3)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Continue to Equipment
            </Button>
          </div>
        )}

        {/* ── STEP 3: EQUIPMENT ── */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                EQUIPMENT ACCESS
              </span>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-2xs text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-snug">
              What equipment will you be using for workouts?
            </p>

            <div className="space-y-2">
              {EQUIPMENT_OPTIONS.map((eq) => {
                const isSelected = equipment === eq.id;
                return (
                  <button
                    key={eq.id}
                    type="button"
                    onClick={() => setEquipment(eq.id)}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent/30'
                        : 'border-border/80 bg-bg-card hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                        {eq.title}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent stroke-[3]" />}
                    </div>
                    <p className="text-2xs text-text-muted leading-relaxed">{eq.desc}</p>
                  </button>
                );
              })}
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => setStep(4)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Continue to Profile
            </Button>
          </div>
        )}

        {/* ── STEP 4: OPTIONAL PROFILE & BODY METRICS ── */}
        {step === 4 && (
          <div className="space-y-4 animate-fade-in max-h-[78vh] overflow-y-auto pr-0.5">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                PROFILE &amp; METRICS (OPTIONAL)
              </span>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-2xs text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-snug">
              Helps calibrate nutrition targets and strength ratios. You can change these anytime in Settings.
            </p>

            {/* Sex & Unit Selector */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-3xs text-text-muted font-mono uppercase tracking-wider block">Sex</label>
                <SegmentedControl
                  value={gender}
                  onChange={(v) => setGender(v as 'male' | 'female')}
                  size="sm"
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                  ]}
                />
              </div>

              <div className="space-y-1">
                <label className="text-3xs text-text-muted font-mono uppercase tracking-wider block">Weight Unit</label>
                <SegmentedControl
                  value={unit}
                  onChange={(v) => setUnit(v as 'kg' | 'lbs')}
                  size="sm"
                  options={[
                    { value: 'kg', label: 'KG' },
                    { value: 'lbs', label: 'LBS' },
                  ]}
                />
              </div>
            </div>

            {/* Bodyweight */}
            <div className="space-y-1">
              <label className="text-3xs text-text-muted font-mono uppercase tracking-wider block">
                Current Bodyweight
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={bodyweight}
                  onChange={(e) => setBodyweight(e.target.value)}
                  placeholder={unit === 'kg' ? '72' : '160'}
                  className="w-full text-base font-bold font-mono py-2.5 px-3.5 rounded-xl bg-bg-card border border-border/80 outline-none focus:border-accent"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-text-muted">
                  {unit}
                </span>
              </div>
            </div>

            {/* Height & Age in one row */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-3xs text-text-muted font-mono uppercase tracking-wider block">
                  Height (cm)
                </label>
                <input
                  type="number"
                  min="100"
                  max="240"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="175"
                  className="w-full text-sm font-mono py-2 px-3 rounded-xl bg-bg-card border border-border/80 outline-none focus:border-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-3xs text-text-muted font-mono uppercase tracking-wider block">
                  Age
                </label>
                <input
                  type="number"
                  min="14"
                  max="90"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="24"
                  className="w-full text-sm font-mono py-2 px-3 rounded-xl bg-bg-card border border-border/80 outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Optional known lifts toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowOptionalLifts(!showOptionalLifts)}
                className="w-full py-2 px-3 rounded-xl border border-border/70 bg-bg-secondary/40 text-left flex items-center justify-between text-xs text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <span>Enter known lift weights (Optional)</span>
                <span className="text-accent font-bold text-xs">{showOptionalLifts ? '− Hide' : '+ Enter'}</span>
              </button>

              {showOptionalLifts && (
                <div className="mt-2 space-y-2 p-3 rounded-2xl bg-bg-card border border-border/80 animate-fade-in">
                  <p className="text-3xs text-text-muted leading-relaxed">
                    Leave blank if unsure. ASCEND will suggest weights automatically from Day 1.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-3xs text-text-muted block mb-0.5">Bench Press ({unit})</label>
                      <input
                        type="number"
                        step="2.5"
                        placeholder={unit === 'kg' ? '70' : '155'}
                        value={benchWeight}
                        onChange={(e) => setBenchWeight(e.target.value)}
                        className="text-xs font-mono py-1.5 px-2.5 rounded-lg bg-bg-secondary border border-border w-full outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-3xs text-text-muted block mb-0.5">Squat ({unit})</label>
                      <input
                        type="number"
                        step="2.5"
                        placeholder={unit === 'kg' ? '90' : '200'}
                        value={squatWeight}
                        onChange={(e) => setSquatWeight(e.target.value)}
                        className="text-xs font-mono py-1.5 px-2.5 rounded-lg bg-bg-secondary border border-border w-full outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-3xs text-text-muted block mb-0.5">Deadlift ({unit})</label>
                      <input
                        type="number"
                        step="2.5"
                        placeholder={unit === 'kg' ? '110' : '245'}
                        value={deadliftWeight}
                        onChange={(e) => setDeadliftWeight(e.target.value)}
                        className="text-xs font-mono py-1.5 px-2.5 rounded-lg bg-bg-secondary border border-border w-full outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-3xs text-text-muted block mb-0.5">Overhead Press ({unit})</label>
                      <input
                        type="number"
                        step="2.5"
                        placeholder={unit === 'kg' ? '40' : '90'}
                        value={ohpWeight}
                        onChange={(e) => setOhpWeight(e.target.value)}
                        className="text-xs font-mono py-1.5 px-2.5 rounded-lg bg-bg-secondary border border-border w-full outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => setStep(5)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Generate My Routine
            </Button>
          </div>
        )}

        {/* ── STEP 5: READY TO TRAIN (Day 1 Preview) ── */}
        {step === 5 && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-center space-y-1">
              <Badge variant="brand" size="sm">
                PROGRAM CREATED
              </Badge>
              <h2 className="text-xl font-black font-sans text-text-primary">
                Your Day 1 Workout Is Ready
              </h2>
              <p className="text-xs text-text-secondary">
                Calibrated for {GOAL_OPTIONS.find((g) => g.id === primaryGoal)?.title} &bull; {daysPerWeek} days/week
              </p>
            </div>

            {/* Day 1 Workout Card */}
            <Card variant="default" padding="md" className="space-y-3 border-accent/40">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <div>
                  <span className="text-3xs font-mono uppercase text-accent font-bold block">
                    SESSION 1 OF {daysPerWeek}
                  </span>
                  <span className="text-base font-bold text-text-primary block font-display">
                    {dayOneWorkout?.name || 'Foundation Workout'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-2xs text-text-muted font-mono">
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  <span>~45 min</span>
                </div>
              </div>

              {/* Planned Exercises */}
              <div className="space-y-2 pt-1">
                {dayOneWorkout?.exercises.slice(0, 4).map((ex, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-bg-secondary/60"
                  >
                    <span className="font-semibold text-text-primary">{ex.name}</span>
                    <span className="font-mono text-3xs text-text-muted font-medium">
                      {ex.targetSets} sets × {ex.targetReps} reps
                    </span>
                  </div>
                ))}
                {(dayOneWorkout?.exercises.length || 0) > 4 && (
                  <span className="text-3xs text-text-muted font-mono block text-center">
                    + {(dayOneWorkout?.exercises.length || 0) - 4} more accessory movements
                  </span>
                )}
              </div>
            </Card>

            <div className="pt-1 space-y-2">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => handleFinish(!showOptionalLifts)}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Start Training
              </Button>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={() => setStep(4)}
              >
                Adjust Profile Settings
              </Button>
            </div>
          </div>
        )}

        {/* 6 Step Progress Indicators */}
        <div className="flex justify-center gap-1.5 pt-1">
          {[0, 1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-6 bg-accent'
                  : s < step
                  ? 'w-2 bg-accent/40'
                  : 'w-2 bg-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
