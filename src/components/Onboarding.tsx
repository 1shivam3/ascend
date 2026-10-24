'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import type { AuthUser } from '@/lib/supabase/sync';
import { AthleteGoal, Gender, Unit, UserMode, DietPreference, AITrainingProfile, resolvePrimaryGoal, MAX_ATHLETE_NAME_LENGTH } from '@/lib/types';
import { useAppNavigation } from '@/lib/navigation';
import { safeRandomId, getLocalTodayStr, sanitizeAthleteName } from '@/lib/formatters';
import { getOrCreateGuestId } from '@/lib/storage';
import { estimateSessionMinutes } from '@/lib/workout-engine';
import { canContinueFromGoalStep } from '@/lib/onboarding';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/components/ui/Toast';
import { Loader2 } from 'lucide-react';

import SplashScreen from './onboarding/SplashScreen';
import WelcomeScreen from './onboarding/WelcomeScreen';
import CreateAccountScreen from './onboarding/CreateAccountScreen';
import LoginScreen from './onboarding/LoginScreen';
import FitnessGoalsScreen from './onboarding/FitnessGoalsScreen';
import ExperienceLevelScreen from './onboarding/ExperienceLevelScreen';
import PersonalDetailsScreen from './onboarding/PersonalDetailsScreen';
import ScheduleScreen from './onboarding/ScheduleScreen';
import StepProgressBar from './onboarding/StepProgressBar';

type OnboardingScreenId =
  | 'splash'
  | 'welcome'
  | 'create_account'
  | 'login'
  | 'goals'
  | 'experience'
  | 'schedule'
  | 'details'
  | 'plan_offer';

export default function Onboarding() {
  const { t } = useTranslation();
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
  const [equipmentChoice, setEquipmentChoice] = useState<AITrainingProfile['equipment']>('full_gym');
  const [limitations, setLimitations] = useState<string[]>([]);
  const [activityChoice, setActivityChoice] = useState<'sedentary' | 'light' | 'active' | 'very_active'>('light');
  const [dietPreference, setDietPreference] = useState<DietPreference>('non_vegetarian');

  const [isFinishing, setIsFinishing] = useState(false);

  // Pending generated plans — shown on the plan_offer screen for user
  // confirmation BEFORE any plans are added. Never auto-add without asking.
  const [pendingPlans, setPendingPlans] = useState<any[] | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<any | null>(null);
  // The profile itself is also deferred on the offer path: page.tsx unmounts
  // Onboarding the moment a profile exists, so calling setProfile before the
  // user answers the offer makes the offer screen unreachable. The pending
  // profile is applied by handleAcceptPlans/handleDeclinePlans instead.
  const [pendingProfile, setPendingProfile] = useState<any | null>(null);
  const [savedFirstName, setSavedFirstName] = useState('Athlete');

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
    setCreatineConfig,
  } = useStore();
  const currentMacroGoals = useStore((s) => s.macroGoals);

  // Detect Google auth session or local snapshots on-demand
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check for direct screen navigation or OAuth error in URL hash or search params
    const searchParams = new URLSearchParams(window.location.search);
    const screenParam = searchParams.get('screen') as OnboardingScreenId;
    if (
      screenParam &&
      ['splash', 'welcome', 'create_account', 'login', 'goals', 'experience', 'schedule', 'details', 'plan_offer'].includes(
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
      toast.error(cleanMsg, t('toast.titleSignInFailed'));
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
              toast.error(error, t('toast.titleSyncError'));
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
          toast.info(t('toast.keepOneGoal'), t('toast.titleGoalRequired'));
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
    dietPreference?: DietPreference;
  }) => {
    // Never silently fall back to a default goal: the athlete must choose.
    if (selectedGoals.length === 0) {
      toast.error(t('toast.chooseGoal'), t('toast.titleGoalRequired'));
      return;
    }

    setIsFinishing(true);

    const nameToSave = sanitizeAthleteName(details.name.trim() || athleteName.trim() || 'Athlete', MAX_ATHLETE_NAME_LENGTH);
    const bodyweightKg =
      details.unit === 'lbs' ? details.weight * 0.453592 : details.weight;
    const bodyweightLbs =
      details.unit === 'kg' ? details.weight * 2.20462 : details.weight;

    const finalGoals = [...selectedGoals];
    // QA4-019: the details step now asks diet preference explicitly —
    // prefer the value from the form over the ( previously silent )
    // state default, and keep the state in sync for any later reads.
    const chosenDiet = details.dietPreference ?? dietPreference;
    setDietPreference(chosenDiet);
    const profileData = {
      id: authUser?.id || getOrCreateGuestId(),
      name: nameToSave,
      gender: details.gender,
      bodyweightKg: Math.round(bodyweightKg * 10) / 10,
      bodyweightLbs: Math.round(bodyweightLbs * 10) / 10,
      heightCm: details.heightCm,
      age: details.age,
      unit: details.unit,
      dietPreference: chosenDiet,
      createdAt: new Date().toISOString(),
      goals: finalGoals,
      userMode: experienceLevel,
    };

    // NOTE: setProfile is intentionally NOT called here yet. On the plan-offer
    // path the profile is staged in pendingProfile and applied when the user
    // accepts/declines — calling setProfile now would unmount Onboarding via
    // the page.tsx gate and the offer screen would never render.
    setGoals(finalGoals);
    setUserMode(experienceLevel);

    const [
      { getGoalAdaptiveSplitTemplates, prepareGeneratedPlans },
      { buildDefaultWeeklySchedule, generateSplitWeeklySchedule, limitPlansToDays },
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
      generatedSplit = getGoalAdaptiveSplitTemplates(primaryGoal, details.unit, {
        bodyweightKg,
        experience: experienceLevel,
      });
    }

    // Every path gets the same treatment (previously only the 4-day path did):
    //  1. first-exposure loads scaled to bodyweight + experience,
    //  2. exercises the user cannot do with their equipment swapped out,
    //  3. beginners get pull-ups regressed to a learnable variant,
    //  4. exclusion + injury history from BEFORE this onboarding (a
    //     re-onboarding must never silently resurrect a painful lift).
    const priorTrainingProfile = useStore.getState().trainingProfile;
    const priorExclusions = priorTrainingProfile?.dislikedExercises || [];
    const priorLimitations = priorTrainingProfile?.injuriesOrLimitations || [];
    const allLimitations = Array.from(new Set([...priorLimitations, ...limitations]));
    if (generatedSplit) {
      generatedSplit = prepareGeneratedPlans(generatedSplit, {
        unit: details.unit,
        bodyweightKg,
        experience: experienceLevel,
        ageYears: details.age,
        equipment: equipmentChoice,
        exclusions: priorExclusions,
        limitations: allLimitations,
      });
      // Offer exactly the days the user will train (a 2-day user was
      // being offered 3 full-body workouts).
      generatedSplit = limitPlansToDays(generatedSplit, daysPerWeek);
    }

    setTrainingProfile({
      goal: primaryGoal,
      experience: experienceLevel,
      daysPerWeek: daysPerWeek,
      preferredDurationMin: 45,
      equipment: equipmentChoice,
      activityLevel: activityChoice,
      preferredSplit: preferredSplit,
      // PRESERVE prior exclusions/limitations — overwriting them here
      // silently re-prescribed exercises the user had flagged as painful.
      dislikedExercises: priorExclusions,
      injuriesOrLimitations: allLimitations,
      coachingStyle: 'balanced',
    });

    // Preserve the athlete's existing plans/targets when re-onboarding after
    // a logout — only offer generated ones for a truly fresh profile.
    // NEVER auto-add plans: the user must explicitly accept on the plan_offer screen.
    const { plannedWorkouts: existingPlans, macroGoals: existingGoals } = useStore.getState();
    if (!existingPlans || existingPlans.length === 0) {
      setPendingPlans(generatedSplit);
      setPendingSchedule(buildDefaultWeeklySchedule(generatedSplit, daysPerWeek));
    } else {
      // User already has plans — skip the offer, complete directly.
      setPendingPlans(null);
      setPendingSchedule(null);
    }
    if (!existingGoals) {
      setMacroGoals(
        calculateRecommendedMacroGoals(
          bodyweightKg,
          primaryGoal,
          details.gender,
          details.heightCm,
          details.age,
          activityChoice
        )
      );
    }

    // Baseline bodyweight is written exactly once, with the stable id
    // `initial_bw_<profileId>`, by setProfile's backfill above. Do NOT add a
    // second entry here (previously caused duplicate log entries).

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ascend_logged_out');
      } catch {}
    }

    setIsFinishing(false);
    setSavedFirstName(nameToSave.split(' ')[0] || 'Athlete');

    // If we generated plans, ask the user BEFORE adding them.
    // If they already had plans, complete directly.
    // Note: use generatedSplit directly — setPendingPlans hasn't applied yet.
    const hasNewPlans = !existingPlans || existingPlans.length === 0;
    if (hasNewPlans && generatedSplit && generatedSplit.length > 0) {
      // Stage the profile — applied when the user answers the offer.
      setPendingProfile(profileData);
      setCurrentScreen('plan_offer');
    } else {
      applyProfileWithAgeGuards(profileData);
      completeOnboarding();
    }
  };

  const completeOnboarding = () => {
    toast.success(t('toast.welcome', { name: savedFirstName }), pendingPlans ? t('toast.titleTrainingReady') : t('toast.titleAllSet'));
    try {
      navigate('home', { clearHistory: true });
    } catch {}
  };

  const applyProfileWithAgeGuards = (profileData: any) => {
    setProfile(profileData);
    // Minors: creatine tracking starts disabled (not recommended under
    // 18). The Meals row, habit matrix and daily objectives also gate
    // on age, so this is belt-and-braces at the config level.
    if (typeof profileData?.age === 'number' && profileData.age < 18) {
      setCreatineConfig({ enabled: false });
    }
  };

  const applyPendingProfile = () => {
    if (pendingProfile) {
      applyProfileWithAgeGuards(pendingProfile);
      setPendingProfile(null);
    }
  };

  const handleAcceptPlans = () => {
    applyPendingProfile();
    if (pendingPlans && pendingPlans.length > 0) {
      setPlannedWorkouts(pendingPlans);
      if (pendingSchedule) {
        setWeeklySchedule(pendingSchedule);
      }
    }
    setPendingPlans(null);
    setPendingSchedule(null);
    completeOnboarding();
  };

  const handleDeclinePlans = () => {
    applyPendingProfile();
    setPendingPlans(null);
    setPendingSchedule(null);
    completeOnboarding();
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
          toast.success(t('toast.backupRestored'), t('toast.titleBackupRestored'));
          window.location.reload();
        } else {
          toast.error(t('toast.invalidBackup'), t('toast.titleRestoreError'));
        }
      } catch {
        toast.error(t('toast.backupParseFailed'), t('toast.titleFileError'));
      }
    };
    reader.readAsText(file);
  };

  // If restoring account from OAuth callback
  if (isRestoringAccount) {
    return (
      <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-bg-card border border-border flex items-center justify-center shadow-xl">
          <Loader2 className="w-7 h-7 text-accent animate-spin" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Restoring Account
          </h2>
          <p className="text-xs text-text-muted max-w-xs">
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
                toast.success(t('toast.profileRestored'), t('toast.titleRestored'));
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
        onContinue={() => {
          if (!canContinueFromGoalStep(selectedGoals)) {
            toast.error(t('toast.chooseGoal'), t('toast.titleGoalRequired'));
            return;
          }
          setCurrentScreen('experience');
        }}
        onSkip={() => {
          setSelectedGoals(['general_fitness']);
          toast.info(t('toast.defaultGoalSet'), t('toast.titleGoalSet'));
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

  // ── SCREEN 6: EXPERIENCE LEVEL (Step 2 of 4) ──────────────────────────────
  if (currentScreen === 'experience') {
    return (
      <ExperienceLevelScreen
        selectedLevel={experienceLevel}
        onSelectLevel={(level) => setExperienceLevel(level)}
        onContinue={() => setCurrentScreen('schedule')}
        onBack={() => setCurrentScreen('goals')}
      />
    );
  }

  // ── SCREEN 7: SCHEDULE + EQUIPMENT (Step 3 of 4) ─────────────────────────
  // Asks the two questions that define a user's week: how many days, and what
  // equipment. Fixes the dead daysPerWeek state and hardcoded full_gym.
  if (currentScreen === 'schedule') {
    return (
      <ScheduleScreen
        initialDays={daysPerWeek}
        initialEquipment={equipmentChoice}
        initialActivity={activityChoice}
        initialLimitations={limitations}
        onContinue={(days, equipment, activity, chosenLimitations) => {
          setDaysPerWeek(days);
          setEquipmentChoice(equipment);
          setActivityChoice(activity);
          setLimitations(chosenLimitations);
          setCurrentScreen('details');
        }}
        onBack={() => setCurrentScreen('experience')}
      />
    );
  }

  // ── SCREEN 8: PERSONAL DETAILS (Step 4 of 4) ─────────────────────────────
  if (currentScreen === 'details') {
    return (
      <PersonalDetailsScreen
        initialName={athleteName}
        initialGender={gender}
        initialUnit={unit}
        initialAge={age}
        initialWeight={weight}
        initialHeightCm={heightCm}
        initialDietPreference={dietPreference}
        onContinue={handleFinishCalibration}
        onBack={() => setCurrentScreen('schedule')}
        loading={isFinishing}
      />
    );
  }

  // ── SCREEN 9: PLAN OFFER — ask BEFORE adding any generated plans ──────────
  if (currentScreen === 'plan_offer') {
    const planCount = pendingPlans?.length || 0;
    const planNames = (pendingPlans || []).slice(0, 4).map((p: any) => p.name || 'Workout').join(', ');
    return (
      <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between pb-8 animate-fade-in">
        <StepProgressBar currentStep={4} onBack={() => setCurrentScreen('details')} />
        <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
          <div className="text-left space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('onboarding.planOfferTitle')}
            </h1>
            <p className="text-sm text-text-primary/70">
              Based on your goals, I put together {planCount} workouts{planNames ? ` (${planNames}${planCount > 4 ? ', …' : ''})` : ''}. Add {planCount === 1 ? 'it' : 'them'} to your training, or skip and build your own.
            </p>
          </div>
          {/* Preview what's inside — never ask for blind acceptance. */}
          {(pendingPlans || []).length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {(pendingPlans || []).map((plan: any, i: number) => {
                const exNames = (plan.exercises || []).map((e: any) => e.name);
                const estMin = estimateSessionMinutes(plan);
                return (
                  <div key={plan.id || i} className="bg-bg-card border border-border rounded-2xl px-4 py-3 shadow-2xs">
                    <p className="text-sm font-bold">
                      {plan.name} <span className="text-text-muted font-medium">· ~{estMin} min · {exNames.length} exercises</span>
                    </p>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                      {exNames.slice(0, 6).join(' · ')}{exNames.length > 6 ? ` · +${exNames.length - 6} more` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {/* Your daily food target — explained, never set silently.
              A fat-loss user previously got a lower number with no
              idea why; a diabetic got no safety framing at all. */}
          {currentMacroGoals && currentMacroGoals.maintenanceCalories ? (
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3 shadow-2xs space-y-1">
              <p className="text-sm font-bold">Your daily food target: {currentMacroGoals.calories.toLocaleString()} kcal</p>
              <p className="text-xs text-text-primary/70 leading-relaxed">
                Your body burns about {currentMacroGoals.maintenanceCalories.toLocaleString()} kcal a day.
                {typeof currentMacroGoals.calorieDelta === 'number' && currentMacroGoals.calorieDelta < 0
                  ? ` To lose fat steadily and safely, your target is ${Math.abs(currentMacroGoals.calorieDelta)} kcal less — never below the safe minimum for your body.`
                  : typeof currentMacroGoals.calorieDelta === 'number' && currentMacroGoals.calorieDelta > 0
                    ? ` To build muscle, your target adds ${currentMacroGoals.calorieDelta} kcal on top.`
                    : ' Your target matches what you burn, to maintain your weight.'}{' '}
                Protein {currentMacroGoals.proteinG}g · Carbs {currentMacroGoals.carbsG}g · Fat {currentMacroGoals.fatG}g.
                You can change this any time in Meals. If you have a medical condition like diabetes, check with your doctor before following a calorie target.
              </p>
            </div>
          ) : null}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleAcceptPlans}
              className="w-full py-4 px-6 rounded-2xl bg-text-primary text-bg-primary font-bold text-base active:scale-[0.98] transition-transform"
            >
              {t('onboarding.acceptPlan')}
            </button>
            <button
              type="button"
              onClick={handleDeclinePlans}
              className="w-full py-4 px-6 rounded-2xl bg-transparent border-2 border-text-primary/20 text-text-primary font-semibold text-base active:scale-[0.98] transition-transform"
            >
              {t('onboarding.declinePlan')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
