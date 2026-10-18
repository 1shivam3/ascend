'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import type { AuthUser } from '@/lib/supabase/sync';
import { AthleteGoal, Gender, Unit, UserMode, DietPreference, resolvePrimaryGoal } from '@/lib/types';
import { useAppNavigation } from '@/lib/navigation';
import { safeRandomId, getLocalTodayStr } from '@/lib/formatters';
import { getOrCreateGuestId } from '@/lib/storage';
import { useToast } from '@/components/ui/Toast';
import { Loader2 } from 'lucide-react';

import SplashScreen from './onboarding/SplashScreen';
import WelcomeScreen from './onboarding/WelcomeScreen';
import CreateAccountScreen from './onboarding/CreateAccountScreen';
import LoginScreen from './onboarding/LoginScreen';
import FitnessGoalsScreen from './onboarding/FitnessGoalsScreen';
import ExperienceLevelScreen from './onboarding/ExperienceLevelScreen';
import PersonalDetailsScreen from './onboarding/PersonalDetailsScreen';

type OnboardingScreenId =
  | 'splash'
  | 'welcome'
  | 'create_account'
  | 'login'
  | 'goals'
  | 'experience'
  | 'details';

export default function Onboarding() {
  const toast = useToast();
  const { navigate } = useAppNavigation();
  const [currentScreen, setCurrentScreen] = useState<OnboardingScreenId>('splash');
  const [authOrigin, setAuthOrigin] = useState<'welcome' | 'create_account'>('welcome');

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isRestoringAccount, setIsRestoringAccount] = useState(false);

  // Calibration Form State
  const [athleteName, setAthleteName] = useState('');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<AthleteGoal[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<UserMode>('beginner');
  const [gender, setGender] = useState<Gender>('male');
  const [unit, setUnit] = useState<Unit>('kg');
  const [age, setAge] = useState<number>(25);
  const [weight, setWeight] = useState<number>(70);
  const [heightCm, setHeightCm] = useState<number>(175);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [dietPreference, setDietPreference] = useState<DietPreference>('non_vegetarian');

  const [isFinishing, setIsFinishing] = useState(false);

  // Local device snapshot detection
  const [backupSnapshot, setBackupSnapshot] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Detect Google auth session or local snapshots on-demand
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check for direct screen navigation or OAuth error in URL hash or search params
    const searchParams = new URLSearchParams(window.location.search);
    const screenParam = searchParams.get('screen') as OnboardingScreenId;
    if (
      screenParam &&
      ['splash', 'welcome', 'create_account', 'login', 'goals', 'experience', 'details'].includes(
        screenParam
      )
    ) {
      setCurrentScreen(screenParam);
    }
    const hashClean = (window.location.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hashClean);
    const oauthError =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');

    if (oauthError) {
      const cleanMsg = decodeURIComponent(oauthError.replace(/\+/g, ' '));
      toast.error(cleanMsg, 'Sign-In Failed');
      window.history.replaceState(null, '', window.location.pathname);
      setIsRestoringAccount(false);
      setCurrentScreen('welcome');
      return;
    }

    const hasAuthCallback =
      hashClean.includes('access_token') || window.location.search.includes('code=');
    const hasExistingSession = Boolean(
      localStorage.getItem('sb-auth-token') ||
        Object.keys(localStorage).some(
          (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
        )
    );

    if (hasAuthCallback || hasExistingSession) {
      setIsRestoringAccount(true);
      import('@/lib/supabase/sync').then(({ syncEngine }) => {
        syncEngine.init();
        const currentUser = syncEngine.getCurrentUser();
        if (currentUser && !currentUser.isAnonymous) {
          setAuthUser(currentUser);
          if (currentUser.name) {
            setAthleteName((prev) => prev || currentUser.name || '');
          }
          if (currentUser.email) {
            setAthleteEmail((prev) => prev || currentUser.email || '');
          }
          if (
            useStore.getState().profile ||
            useStore.getState().hasCompletedOnboarding
          ) {
            setIsRestoringAccount(false);
            return;
          }
        }

        const unsub = syncEngine.subscribe((status, _l, error, user) => {
          if (user && !user.isAnonymous) {
            setAuthUser(user);
            if (user.name) {
              setAthleteName((prev) => prev || user.name || '');
            }
            if (user.email) {
              setAthleteEmail((prev) => prev || user.email || '');
            }
          }

          if (
            useStore.getState().profile ||
            useStore.getState().hasCompletedOnboarding
          ) {
            setIsRestoringAccount(false);
            return;
          }

          if (status === 'synced') {
            setIsRestoringAccount(false);
            if (!useStore.getState().profile) {
              setCurrentScreen('goals');
            }
          } else if (status === 'error') {
            setIsRestoringAccount(false);
            if (error) {
              toast.error(error, 'Sync Error');
            }
            if (!useStore.getState().profile) {
              setCurrentScreen('welcome');
            }
          }
        });
        return unsub;
      });
    }
  }, [toast]);

  // Check for previous device snapshot
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (localStorage.getItem('ascend_logged_out') === 'true') {
          return;
        }
        let snap = localStorage.getItem('ascend_emergency_snapshot');
        if (!snap) {
          snap = localStorage.getItem('ascend_store');
        }
        if (!snap && localStorage.getItem('ascend_profile')) {
          const profileStr = localStorage.getItem('ascend_profile');
          if (profileStr) {
            snap = JSON.stringify({ profile: JSON.parse(profileStr) });
          }
        }
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

  const handleToggleGoal = (goal: AthleteGoal) => {
    setSelectedGoals((prev) => {
      if (prev.includes(goal)) {
        if (prev.length <= 1) {
          toast.info('Keep at least one goal selected — ASCEND calibrates your plan around it.', 'Goal Required');
          return prev;
        }
        return prev.filter((g) => g !== goal);
      }
      return [...prev, goal];
    });
  };

  const handleFinishCalibration = async (details: {
    name: string;
    gender: Gender;
    age: number;
    weight: number;
    unit: Unit;
    heightCm: number;
  }) => {
    // Never silently fall back to a default goal: the athlete must choose.
    if (selectedGoals.length === 0) {
      toast.error('Please choose at least one training goal to continue — ASCEND calibrates your plan around it.', 'Goal Required');
      return;
    }

    setIsFinishing(true);

    const nameToSave = details.name.trim() || athleteName.trim() || 'Athlete';
    const bodyweightKg =
      details.unit === 'lbs' ? details.weight * 0.453592 : details.weight;
    const bodyweightLbs =
      details.unit === 'kg' ? details.weight * 2.20462 : details.weight;

    const finalGoals = [...selectedGoals];
    const profileData = {
      id: authUser?.id || getOrCreateGuestId(),
      name: nameToSave,
      gender: details.gender,
      bodyweightKg: Math.round(bodyweightKg * 10) / 10,
      bodyweightLbs: Math.round(bodyweightLbs * 10) / 10,
      heightCm: details.heightCm,
      age: details.age,
      unit: details.unit,
      dietPreference,
      createdAt: new Date().toISOString(),
      goals: finalGoals,
      userMode: experienceLevel,
    };

    setProfile(profileData);
    setGoals(finalGoals);
    setUserMode(experienceLevel);

    const [
      { getGoalAdaptiveSplitTemplates },
      { buildDefaultWeeklySchedule, generateSplitWeeklySchedule },
      { calculateRecommendedMacroGoals },
    ] = await Promise.all([
      import('@/lib/workout-engine'),
      import('@/lib/workout-schedule'),
      import('@/lib/macros'),
    ]);

    const primaryGoal = resolvePrimaryGoal(finalGoals);
    let preferredSplit: 'push_pull_legs' | 'bro_split' | 'upper_lower' | 'full_body' =
      'upper_lower';
    let generatedSplit;

    if (daysPerWeek === 6) {
      preferredSplit = 'push_pull_legs';
      generatedSplit = generateSplitWeeklySchedule('push_pull_legs', details.unit).plans;
    } else if (daysPerWeek === 5) {
      preferredSplit = 'bro_split';
      generatedSplit = generateSplitWeeklySchedule('bro_split', details.unit).plans;
    } else if (daysPerWeek <= 3) {
      preferredSplit = 'full_body';
      generatedSplit = generateSplitWeeklySchedule('full_body', details.unit).plans;
    } else {
      preferredSplit = 'upper_lower';
      // Scale first-exposure loads to the athlete's bodyweight and experience
      // so a light beginner is never prescribed an 85 kg lifter's weights.
      generatedSplit = getGoalAdaptiveSplitTemplates(primaryGoal, details.unit, {
        bodyweightKg,
        experience: experienceLevel,
      });
    }

    setTrainingProfile({
      goal: primaryGoal,
      experience: experienceLevel,
      daysPerWeek: daysPerWeek,
      preferredDurationMin: 45,
      equipment: 'full_gym',
      preferredSplit: preferredSplit,
      dislikedExercises: [],
      injuriesOrLimitations: [],
      coachingStyle: 'balanced',
    });

    setPlannedWorkouts(generatedSplit);
    setWeeklySchedule(buildDefaultWeeklySchedule(generatedSplit, daysPerWeek));

    const initialMacros = calculateRecommendedMacroGoals(
      bodyweightKg,
      primaryGoal,
      details.gender,
      details.heightCm,
      details.age
    );
    setMacroGoals(initialMacros);

    // Baseline bodyweight is written exactly once, with the stable id
    // `initial_bw_<profileId>`, by setProfile's backfill above. Do NOT add a
    // second entry here (previously caused duplicate log entries).

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ascend_logged_out');
      } catch {}
    }

    toast.success(
      `Welcome to ASCEND, ${nameToSave.split(' ')[0]}!`,
      'Training Program Ready'
    );
    // Land first-time athletes on the Today dashboard, not wherever the
    // persisted tab pointer was left by a previous session.
    try {
      navigate('home', { clearHistory: true });
    } catch {}
    setIsFinishing(false);
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const { importFullBackupJSON } = await import('@/lib/storage');
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

  // If restoring account from OAuth callback
  if (isRestoringAccount) {
    return (
      <div className="min-h-screen w-full bg-[#171916] text-[#F3F0E7] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#212420] border border-[#2C302B] flex items-center justify-center shadow-xl">
          <Loader2 className="w-7 h-7 text-[#E44427] animate-spin" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Restoring Account
          </h2>
          <p className="text-xs text-[#858076] max-w-xs">
            Connecting to cloud sync and loading your training records...
          </p>
        </div>
      </div>
    );
  }

  // Hidden file input for local JSON restore
  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={handleRestoreFile}
    />
  );

  // ── SCREEN 1: SPLASH SCREEN ──────────────────────────────────────────────
  if (currentScreen === 'splash') {
    return (
      <SplashScreen
        onContinue={() => {
          setCurrentScreen('welcome');
        }}
      />
    );
  }

  // ── SCREEN 2: WELCOME SCREEN ─────────────────────────────────────────────
  if (currentScreen === 'welcome') {
    return (
      <>
        {hiddenFileInput}
        <WelcomeScreen
          onGetStarted={() => {
            setAuthOrigin('welcome');
            setCurrentScreen('create_account');
          }}
          onLogin={() => {
            setCurrentScreen('login');
          }}
          onContinueAsGuest={() => {
            setAthleteName('Athlete');
            setAuthOrigin('welcome');
            setCurrentScreen('goals');
          }}
          backupFound={Boolean(backupSnapshot)}
          onRestoreBackup={() => {
            if (backupSnapshot) {
              const ok = importAllData(backupSnapshot);
              if (ok) {
                toast.success('Restored profile and data!', 'Restored');
              }
            } else {
              fileInputRef.current?.click();
            }
          }}
        />
      </>
    );
  }

  // ── SCREEN 3: CREATE ACCOUNT ─────────────────────────────────────────────
  if (currentScreen === 'create_account') {
    return (
      <CreateAccountScreen
        onBack={() => setCurrentScreen('welcome')}
        onSuccess={(name, email) => {
          setAthleteName(name);
          setAthleteEmail(email);
          setAuthOrigin('create_account');
          setCurrentScreen('goals');
        }}
        onNavigateToLogin={() => setCurrentScreen('login')}
      />
    );
  }

  // ── SCREEN 4: LOGIN ──────────────────────────────────────────────────────
  if (currentScreen === 'login') {
    return (
      <LoginScreen
        onBack={() => setCurrentScreen('welcome')}
        onSuccess={() => {
          // If login succeeds and user has profile, state will auto-route to Home
          if (!useStore.getState().profile) {
            setCurrentScreen('goals');
          }
        }}
        onNavigateToSignup={() => setCurrentScreen('create_account')}
      />
    );
  }

  // ── SCREEN 5: FITNESS GOALS (Step 1 of 3) ─────────────────────────────────
  if (currentScreen === 'goals') {
    return (
      <FitnessGoalsScreen
        selectedGoals={selectedGoals}
        onToggleGoal={handleToggleGoal}
        onContinue={() => setCurrentScreen('experience')}
        onSkip={() => {
          setSelectedGoals(['general_fitness']);
          setCurrentScreen('experience');
        }}
        onBack={() => {
          if (authOrigin === 'create_account') {
            setCurrentScreen('create_account');
          } else {
            setCurrentScreen('welcome');
          }
        }}
      />
    );
  }

  // ── SCREEN 6: EXPERIENCE LEVEL (Step 2 of 3) ──────────────────────────────
  if (currentScreen === 'experience') {
    return (
      <ExperienceLevelScreen
        selectedLevel={experienceLevel}
        onSelectLevel={(level) => setExperienceLevel(level)}
        onContinue={() => setCurrentScreen('details')}
        onBack={() => setCurrentScreen('goals')}
      />
    );
  }

  // ── SCREEN 7: PERSONAL DETAILS (Step 3 of 3) ──────────────────────────────
  if (currentScreen === 'details') {
    return (
      <PersonalDetailsScreen
        initialName={athleteName}
        initialGender={gender}
        initialUnit={unit}
        initialAge={age}
        initialWeight={weight}
        initialHeightCm={heightCm}
        onContinue={handleFinishCalibration}
        onBack={() => setCurrentScreen('experience')}
        loading={isFinishing}
      />
    );
  }

  return null;
}
