'use client';

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import {
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  ArrowRight,
  RotateCcw,
  Upload,
  Ruler,
  Check,
  Flame,
  Zap,
  Target,
  Sparkles,
} from 'lucide-react';
import { calculateOneRepMax } from '@/lib/strength-standards';
import { PersonalRecord, AthleteGoal } from '@/lib/types';
import { getGoalAdaptiveSplitTemplates } from '@/lib/workout-engine';
import { calculateRecommendedMacroGoals } from '@/lib/macros';
import { useToast } from '@/components/ui/Toast';

export default function OnboardingScreen() {
  const toast = useToast();
  const [step, setStep] = useState(0);

  // Profile fields
  const [name, setName] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<AthleteGoal[]>(['build_muscle']);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyweight, setBodyweight] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [age, setAge] = useState('24');
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);

  // Optional major lift baselines
  const [benchWeight, setBenchWeight] = useState('');
  const [benchReps, setBenchReps] = useState('1');
  const [squatWeight, setSquatWeight] = useState('');
  const [squatReps, setSquatReps] = useState('1');
  const [deadliftWeight, setDeadliftWeight] = useState('');
  const [deadliftReps, setDeadliftReps] = useState('1');
  const [ohpWeight, setOhpWeight] = useState('');
  const [ohpReps, setOhpReps] = useState('1');

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
    setTrainingProfile,
    addMultiplePRs,
    addBodyMetric,
    importAllData,
    setPlannedWorkouts,
    setMacroGoals,
  } = useStore();

  const handleFinish = (skipLifts = false) => {
    const bw = parseFloat(bodyweight) || 72;
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
      goals: selectedGoals,
    };

    setProfile(profileData);
    setGoals(selectedGoals);

    const primaryGoal: AthleteGoal = selectedGoals[0] || 'build_muscle';

    setTrainingProfile({
      goal: selectedGoals.includes('get_stronger')
        ? 'strength'
        : selectedGoals.includes('build_muscle')
        ? 'muscle_gain'
        : selectedGoals.includes('lose_fat')
        ? 'fat_loss'
        : 'general_fitness',
      daysPerWeek,
      preferredSplit: daysPerWeek >= 5 ? 'push_pull_legs' : daysPerWeek === 4 ? 'upper_lower' : 'full_body',
    });

    // 1. Initialize split routine tailored to athlete's primary goal & weight unit
    const initialSplit = getGoalAdaptiveSplitTemplates(primaryGoal, unit);
    setPlannedWorkouts(initialSplit);

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
        {/* Clean Brand Header */}
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-bg-secondary text-accent mb-2.5 shadow-sm">
            <Dumbbell className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight font-sans">
            Let&apos;s build your training plan
          </h1>
          <p className="text-text-muted text-xs mt-1">
            Personalized to your goals, body, and schedule.
          </p>
        </div>

        {/* Auto-detected Backup */}
        {backupSnapshot && (
          <div className="p-3.5 rounded-2xl border border-accent/40 bg-accent/10 space-y-2 animate-fade-in">
            <div className="flex items-center gap-1.5 text-accent font-bold text-xs">
              <RotateCcw className="w-4 h-4" />
              <span>Backup Detected</span>
            </div>
            <p className="text-2xs text-text-secondary leading-snug">
              Found previous profile for <strong className="text-text-primary">{backupSnapshot.profile?.name || 'Athlete'}</strong> ({backupSnapshot.workouts?.length || 0} workouts).
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const ok = importAllData(backupSnapshot);
                  if (ok) {
                    toast.success('Restored athlete profile and records!', 'Restored');
                  }
                }}
                className="btn-primary flex-1 py-1.5 text-xs font-bold"
              >
                Restore (1-Tap)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('ascend_emergency_snapshot');
                  }
                  setBackupSnapshot(null);
                }}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                Start Fresh
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 0: What are you training for? + Athlete Name ── */}
        {step === 0 && (
          <div className="space-y-4 animate-fade-in">
            <div className="space-y-1">
              <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                WHAT ARE YOU TRAINING FOR?
              </label>
              <div className="space-y-2">
                {[
                  {
                    id: 'build_muscle' as AthleteGoal,
                    title: 'Build Muscle',
                    desc: 'Hypertrophy volume, exercise selection, progressive overload',
                  },
                  {
                    id: 'get_stronger' as AthleteGoal,
                    title: 'Get Stronger',
                    desc: 'Heavy compound lifts, RPE autoregulation, and PRs',
                  },
                  {
                    id: 'lose_fat' as AthleteGoal,
                    title: 'Lose Fat',
                    desc: 'Preserve muscle mass and strength in a caloric deficit',
                  },
                  {
                    id: 'stamina' as AthleteGoal,
                    title: 'Improve Fitness',
                    desc: 'Conditioning, work capacity, and cardiovascular base',
                  },
                  {
                    id: 'general_fitness' as AthleteGoal,
                    title: 'General Fitness',
                    desc: 'Balanced strength, mobility, and healthy habits',
                  },
                ].map((g) => {
                  const isSelected = selectedGoals.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedGoals([g.id])}
                      className={`w-full p-3 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-accent bg-accent/10 shadow-xs'
                          : 'border-border/60 bg-bg-secondary/60 hover:border-border'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-accent bg-accent text-white' : 'border-border bg-bg-surface'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <span className={`text-sm font-bold block ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                          {g.title}
                        </span>
                        <p className="text-2xs text-text-muted mt-0.5 leading-snug">{g.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Athlete Name */}
            <div className="pt-1 space-y-1">
              <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                WHAT SHOULD WE CALL YOU?
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full text-sm font-semibold py-2.5 px-3.5 rounded-xl bg-bg-secondary border border-border/80 outline-none focus:border-accent"
                maxLength={24}
              />
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-accent/20"
            >
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Restore from file option */}
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-2xs text-text-muted hover:text-accent inline-flex items-center gap-1.5 transition-colors"
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

        {/* ── STEP 1: Body Metrics ── */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                YOUR BODY
              </span>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="text-2xs text-text-muted hover:text-text-primary flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            </div>

            {/* Sex */}
            <div className="space-y-1.5">
              <label className="text-2xs text-text-muted font-medium block">
                Sex (for strength standard benchmarks)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['male', 'female'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                      gender === g
                        ? 'border-accent bg-accent/15 text-accent shadow-xs'
                        : 'border-border/60 bg-bg-secondary text-text-secondary hover:border-border'
                    }`}
                  >
                    {g === 'male' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bodyweight */}
            <div className="space-y-1.5">
              <label className="text-2xs text-text-muted font-medium block">
                Bodyweight
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={bodyweight}
                  onChange={(e) => setBodyweight(e.target.value)}
                  placeholder={unit === 'kg' ? '72' : '160'}
                  className="flex-1 text-base font-bold font-mono py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 outline-none focus:border-accent"
                />
                <div className="flex bg-bg-secondary rounded-xl border border-border/80 overflow-hidden">
                  {(['kg', 'lbs'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`px-3.5 py-2 text-xs font-bold font-mono transition-colors ${
                        unit === u ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Age */}
            <div className="space-y-1.5">
              <label className="text-2xs text-text-muted font-medium block">
                Age (for metabolic rate &amp; energy calculations)
              </label>
              <input
                type="number"
                min="14"
                max="90"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="24"
                className="w-full text-sm font-mono font-bold py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 outline-none focus:border-accent"
              />
            </div>

            {/* Height (Optional) */}
            <div className="space-y-1.5">
              <label className="text-2xs text-text-muted font-medium block">
                Height in cm (Optional)
              </label>
              <input
                type="number"
                min="100"
                max="240"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g. 175"
                className="w-full text-sm font-mono py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 outline-none focus:border-accent"
              />
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-accent/20"
            >
              <span>Continue to Schedule</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── STEP 2: Training Schedule ── */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                TRAINING SCHEDULE
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-2xs text-text-muted hover:text-text-primary flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-snug">
              How many days per week do you want to train?
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { days: 3, name: '3 Days', split: 'Full Body (3x/wk)' },
                { days: 4, name: '4 Days', split: 'Upper / Lower (Recommended)' },
                { days: 5, name: '5 Days', split: 'PPL + Upper / Lower' },
                { days: 6, name: '6 Days', split: 'Push / Pull / Legs (2x/wk)' },
              ].map((s) => (
                <button
                  key={s.days}
                  type="button"
                  onClick={() => setDaysPerWeek(s.days)}
                  className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                    daysPerWeek === s.days
                      ? 'border-accent bg-accent/15 text-text-primary shadow-xs'
                      : 'border-border/60 bg-bg-secondary text-text-secondary hover:border-border'
                  }`}
                >
                  <span className={`text-sm font-black block font-sans ${daysPerWeek === s.days ? 'text-accent' : 'text-text-primary'}`}>
                    {s.name}
                  </span>
                  <span className="text-3xs text-text-muted block mt-1">
                    {s.split}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-accent/20"
            >
              <span>Continue to Lift Baseline</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── STEP 3: Optional Lift Baseline ── */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                STRENGTH BASELINE (OPTIONAL)
              </span>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-2xs text-text-muted hover:text-text-primary flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-snug">
              Enter any recent working sets or 1RMs to calibrate your starting weights. If unsure, you can skip this.
            </p>

            {/* Bench Press */}
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/60 space-y-2">
              <span className="text-xs font-bold text-text-primary font-sans block">BENCH PRESS</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Weight ({unit})</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'kg' ? '75' : '165'}
                    value={benchWeight}
                    onChange={(e) => setBenchWeight(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Reps</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={benchReps}
                    onChange={(e) => setBenchReps(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>

            {/* Squat */}
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/60 space-y-2">
              <span className="text-xs font-bold text-text-primary font-sans block">SQUAT</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Weight ({unit})</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'kg' ? '100' : '225'}
                    value={squatWeight}
                    onChange={(e) => setSquatWeight(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Reps</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={squatReps}
                    onChange={(e) => setSquatReps(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>

            {/* Deadlift */}
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/60 space-y-2">
              <span className="text-xs font-bold text-text-primary font-sans block">DEADLIFT</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Weight ({unit})</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'kg' ? '120' : '265'}
                    value={deadliftWeight}
                    onChange={(e) => setDeadliftWeight(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Reps</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={deadliftReps}
                    onChange={(e) => setDeadliftReps(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>

            {/* Overhead Press */}
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/60 space-y-2">
              <span className="text-xs font-bold text-text-primary font-sans block">OVERHEAD PRESS</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Weight ({unit})</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'kg' ? '45' : '100'}
                    value={ohpWeight}
                    onChange={(e) => setOhpWeight(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-3xs text-text-muted block mb-1">Reps</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={ohpReps}
                    onChange={(e) => setOhpReps(e.target.value)}
                    className="text-xs font-mono font-bold py-1.5 px-2.5 rounded-lg bg-bg-surface border border-border/80 w-full outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => handleFinish(false)}
                className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-accent/20"
              >
                <span>Save Baseline &amp; Start Training</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleFinish(true)}
                className="w-full py-2.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                Skip for now &amp; use smart estimates
              </button>
            </div>
          </div>
        )}

        {/* 4 Step indicators */}
        <div className="flex justify-center gap-1.5 pt-2">
          {[0, 1, 2, 3].map((s) => (
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
