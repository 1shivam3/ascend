'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import {
  Dumbbell,
  ArrowRight,
  ChevronLeft,
  Check,
  RotateCcw,
  Upload,
  AlertTriangle,
  Loader2,
  Zap,
  Shield,
  Flame,
  User,
} from 'lucide-react';
import { AthleteGoal, DietPreference } from '@/lib/types';
import { getGoalAdaptiveSplitTemplates } from '@/lib/workout-engine';
import { buildDefaultWeeklySchedule } from '@/lib/workout-schedule';
import { calculateRecommendedMacroGoals } from '@/lib/macros';
import { safeRandomId, getLocalTodayStr } from '@/lib/formatters';
import { importFullBackupJSON } from '@/lib/storage';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

function GoogleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

interface GoalOption {
  id: AthleteGoal;
  title: string;
  icon: React.ReactNode;
  tagline: string;
}

const GOALS: GoalOption[] = [
  {
    id: 'build_muscle',
    title: 'Build Muscle',
    icon: <Zap className="w-4 h-4 text-accent" />,
    tagline: 'Hypertrophy & progressive overload',
  },
  {
    id: 'get_stronger',
    title: 'Get Stronger',
    icon: <Shield className="w-4 h-4 text-emerald-400" />,
    tagline: 'Heavy compound lifts & raw strength',
  },
  {
    id: 'lose_fat',
    title: 'Lose Fat',
    icon: <Flame className="w-4 h-4 text-rose-400" />,
    tagline: 'Muscle retention & calorie deficit',
  },
];

export default function OnboardingScreen() {
  const toast = useToast();
  const { user, signInWithGoogle } = useSupabaseSync();

  // Step 0: Auth choice (Google vs Guest)
  // Step 1: Quick basic details (Name, Goal, Sex, Bodyweight)
  const [step, setStep] = useState<0 | 1>(0);
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Quick Calibration Fields
  const [name, setName] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<AthleteGoal>('build_muscle');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyweight, setBodyweight] = useState('70');
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');

  // Emergency snapshot detection & restore
  const [backupSnapshot, setBackupSnapshot] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect Google auth session or local snapshots
  useEffect(() => {
    if (user && !user.isAnonymous) {
      if (user.name) {
        setName((prev) => prev || user.name || '');
      }
      setStep(1);
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const snap = localStorage.getItem('ascend_emergency_snapshot');
        if (snap) {
          const parsed = JSON.parse(snap);
          const stateData = parsed?.state || parsed;
          if (
            stateData?.profile?.name ||
            (Array.isArray(stateData?.prs) && stateData.prs.length > 0) ||
            (Array.isArray(stateData?.workouts) && stateData.workouts.length > 0)
          ) {
            setBackupSnapshot(stateData);
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
    addBodyMetric,
    importAllData,
    setPlannedWorkouts,
    setWeeklySchedule,
    setMacroGoals,
  } = useStore();

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error, 'Sign-In Failed');
        setIsSigningIn(false);
      }
    } catch {
      toast.error('Could not initiate Google Sign-In', 'Sign-In Error');
      setIsSigningIn(false);
    }
  };

  const handleGuestSelect = () => {
    setShowGuestWarning(true);
  };

  const handleConfirmGuest = () => {
    setShowGuestWarning(false);
    setStep(1);
  };

  const handleFinish = () => {
    const bw = parseFloat(bodyweight) || (unit === 'lbs' ? 154 : 70);
    const athleteName = name.trim() || (user?.name || 'Athlete');

    const bodyweightKg = unit === 'lbs' ? bw * 0.453592 : bw;
    const bodyweightLbs = unit === 'kg' ? bw * 2.20462 : bw;

    const profileData = {
      id: user?.id || safeRandomId('user'),
      name: athleteName,
      gender,
      bodyweightKg: Math.round(bodyweightKg * 10) / 10,
      bodyweightLbs: Math.round(bodyweightLbs * 10) / 10,
      unit,
      dietPreference: 'non_vegetarian' as DietPreference,
      createdAt: new Date().toISOString(),
      goals: [primaryGoal],
    };

    setProfile(profileData);
    setGoals([primaryGoal]);
    setUserMode('beginner');

    const daysPerWeek = 4;
    const generatedSplit = getGoalAdaptiveSplitTemplates(primaryGoal, unit);

    setTrainingProfile({
      goal: primaryGoal === 'get_stronger'
        ? 'strength'
        : primaryGoal === 'build_muscle'
        ? 'muscle_gain'
        : primaryGoal === 'lose_fat'
        ? 'fat_loss'
        : 'general_fitness',
      experience: 'beginner',
      daysPerWeek,
      preferredDurationMin: 45,
      equipment: 'full_gym',
      preferredSplit: 'upper_lower',
      dislikedExercises: [],
      injuriesOrLimitations: [],
      coachingStyle: 'balanced',
    });

    setPlannedWorkouts(generatedSplit);
    setWeeklySchedule(buildDefaultWeeklySchedule(generatedSplit, daysPerWeek));

    const initialMacros = calculateRecommendedMacroGoals(bodyweightKg, primaryGoal, gender);
    setMacroGoals(initialMacros);

    const today = getLocalTodayStr();
    addBodyMetric({
      id: safeRandomId('bm'),
      date: today,
      weightKg: Math.round(bodyweightKg * 10) / 10,
      notes: 'Initial Calibration',
    });

    toast.success(`Welcome to ASCEND, ${athleteName.split(' ')[0]}!`, 'Training Calibrated');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const success = importFullBackupJSON(text);
        if (success) {
          toast.success('Successfully restored your profile and data!', 'Backup Restored');
          window.location.reload();
        } else {
          toast.error('The file does not appear to be a valid ASCEND backup.', 'Restore Error');
        }
      } catch {
        toast.error('Could not parse the backup file.', 'File Error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-4 py-8 text-text-primary">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-bg-secondary border border-border/80 text-accent mb-1 shadow-sm">
            <Dumbbell className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight font-sans text-text-primary">
            ASCEND
          </h1>
          <p className="text-text-muted text-xs font-medium">
            Evidence-Based Training &amp; Nutrition System
          </p>
        </div>

        {/* Existing Backup Detected Card */}
        {backupSnapshot && step === 0 && (
          <Card variant="default" padding="sm" className="border-accent/40 bg-accent/10 space-y-2">
            <div className="flex items-center gap-1.5 text-accent font-bold text-xs">
              <RotateCcw className="w-4 h-4" />
              <span>Previous Data Found on Device</span>
            </div>
            <p className="text-2xs text-text-secondary leading-snug">
              Found data for <strong className="text-text-primary">{backupSnapshot.profile?.name || 'Athlete'}</strong> ({backupSnapshot.workouts?.length || 0} workouts saved).
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() => {
                  const ok = importAllData(backupSnapshot);
                  if (ok) {
                    toast.success('Restored profile and data!', 'Restored');
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
                Dismiss
              </Button>
            </div>
          </Card>
        )}

        {/* ── STEP 0: SIGN-IN CHOICES (Google or Guest) ────────────────────── */}
        {step === 0 && (
          <div className="space-y-4 animate-fade-in">
            <Card variant="default" padding="md" className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-sm font-bold text-text-primary">Get Started</h2>
                <p className="text-2xs text-text-muted">Choose how you want to use the app</p>
              </div>

              {/* Primary Option: Google OAuth */}
              <div className="space-y-2">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  leftIcon={isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon className="w-4 h-4" />}
                  className="h-12 text-sm font-bold shadow-sm cursor-pointer"
                >
                  {isSigningIn ? 'Connecting to Google...' : 'Continue with Google'}
                </Button>
                <p className="text-3xs text-center text-text-muted">
                  Recommended &bull; Automatic cloud backup across all your devices
                </p>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-border/70" />
                <span className="flex-shrink mx-3 text-3xs font-mono text-text-muted uppercase">or</span>
                <div className="flex-grow border-t border-border/70" />
              </div>

              {/* Secondary Option: Guest Mode */}
              <div className="space-y-1.5">
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={handleGuestSelect}
                  leftIcon={<User className="w-4 h-4 text-text-muted" />}
                  className="h-11 text-xs font-semibold cursor-pointer"
                >
                  Continue as Guest
                </Button>
                <p className="text-3xs text-center text-text-muted">
                  No account required &bull; 100% offline &bull; Data stays on this device
                </p>
              </div>
            </Card>

            {/* Offline JSON Restore link */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-2xs text-text-muted hover:text-accent transition-colors underline cursor-pointer"
              >
                Have a backup file? Restore JSON backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleRestoreFile}
              />
            </div>
          </div>
        )}

        {/* ── GUEST MODE WARNING MODAL ────────────────────────────────────── */}
        {showGuestWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-bg-card border border-amber-500/40 p-5 shadow-2xl space-y-4 animate-scale-in">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-text-primary">Guest Mode Notice</h3>
                  <p className="text-xs text-amber-200/90 font-medium">
                    Your data will NOT be saved to the cloud.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 text-2xs text-text-secondary leading-relaxed space-y-2">
                <p>
                  In Guest Mode, your workout logs, personal records, and meal history are saved <strong>only inside this device&apos;s browser memory</strong>.
                </p>
                <p className="text-amber-300/80">
                  ⚠️ If you clear your browser cookies/cache, use Private/Incognito browsing, or switch to a different phone, <strong>your data will be permanently lost</strong>.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={handleGoogleSignIn}
                  leftIcon={<GoogleIcon className="w-4 h-4" />}
                  className="text-xs font-semibold cursor-pointer"
                >
                  Use Google Instead (Safe Cloud Backup)
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={handleConfirmGuest}
                  className="text-xs text-text-muted hover:text-text-primary cursor-pointer border-border"
                >
                  I Understand, Proceed as Guest
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: QUICK CALIBRATION (Frictionless, 4 Basic Details) ───── */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            {/* Top Navigation */}
            <div className="flex items-center justify-between pb-1">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex items-center gap-1 text-2xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <span className="text-3xs font-mono font-bold uppercase tracking-wider text-accent">
                {user && !user.isAnonymous ? 'Google Account Connected' : 'Guest Profile'}
              </span>
            </div>

            <Card variant="default" padding="md" className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-text-primary tracking-tight">Quick Calibration</h2>
                <p className="text-2xs text-text-muted mt-0.5">
                  Calibrate your strength standards &amp; recommended macros
                </p>
              </div>

              {/* 1. Name */}
              <div className="space-y-1.5">
                <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                  1. Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full text-xs font-semibold py-2.5 px-3.5 rounded-xl bg-bg-secondary border border-border/80 outline-none focus:border-accent text-text-primary placeholder:text-text-muted/60"
                  maxLength={24}
                />
              </div>

              {/* 2. Primary Goal */}
              <div className="space-y-1.5">
                <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                  2. Primary Focus
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {GOALS.map((g) => {
                    const isSelected = primaryGoal === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setPrimaryGoal(g.id)}
                        className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'border-accent bg-accent/15 ring-1 ring-accent text-text-primary'
                            : 'border-border/80 bg-bg-secondary hover:border-border text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {g.icon}
                        <span className="text-2xs font-bold block leading-tight">{g.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Biological Sex */}
              <div className="space-y-1.5">
                <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                  3. Biological Sex
                </label>
                <SegmentedControl
                  value={gender}
                  onChange={(val) => setGender(val as 'male' | 'female')}
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                  ]}
                  size="sm"
                  fullWidth
                />
              </div>

              {/* 4. Current Bodyweight */}
              <div className="space-y-1.5">
                <label className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted block">
                  4. Current Bodyweight
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={bodyweight}
                    onChange={(e) => setBodyweight(e.target.value)}
                    placeholder={unit === 'kg' ? '70' : '154'}
                    className="flex-1 text-sm font-semibold py-2 px-3 rounded-xl bg-bg-secondary border border-border/80 outline-none focus:border-accent text-text-primary"
                  />
                  <div className="w-24 shrink-0">
                    <SegmentedControl
                      value={unit}
                      onChange={(val) => {
                        const nextUnit = val as 'kg' | 'lbs';
                        const currentVal = parseFloat(bodyweight);
                        if (!isNaN(currentVal) && currentVal > 0) {
                          if (nextUnit === 'lbs' && unit === 'kg') {
                            setBodyweight(String(Math.round(currentVal * 2.20462 * 10) / 10));
                          } else if (nextUnit === 'kg' && unit === 'lbs') {
                            setBodyweight(String(Math.round(currentVal * 0.453592 * 10) / 10));
                          }
                        } else {
                          setBodyweight(nextUnit === 'kg' ? '70' : '154');
                        }
                        setUnit(nextUnit);
                      }}
                      options={[
                        { value: 'kg', label: 'kg' },
                        { value: 'lbs', label: 'lbs' },
                      ]}
                      size="sm"
                      fullWidth
                    />
                  </div>
                </div>
              </div>

              {/* Launch CTA */}
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleFinish}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                  className="h-12 text-sm font-bold shadow-md cursor-pointer"
                >
                  Start Training
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
