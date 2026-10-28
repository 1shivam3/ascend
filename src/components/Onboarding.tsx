'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import type { AuthUser } from '@/lib/supabase/sync';
import { AthleteGoal, Gender, Unit, UserMode, DietPreference, AITrainingProfile, ATHLETE_GOAL_CONFIGS, resolvePrimaryGoal, MAX_ATHLETE_NAME_LENGTH } from '@/lib/types';
import { useAppNavigation } from '@/lib/navigation';
import { safeRandomId, getLocalTodayStr, sanitizeAthleteName } from '@/lib/formatters';
import { getOrCreateGuestId } from '@/lib/storage';
import { estimateSessionMinutes } from '@/lib/workout-engine';
import { canContinueFromGoalStep } from '@/lib/onboarding';
import { calculateAgeFromDob } from '@/lib/age';
import { clearHowToSeenFlag } from '@/lib/howto-guide';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/components/ui/Toast';
import { Loader2 } from 'lucide-react';

import SplashScreen from './onboarding/SplashScreen';
import WelcomeScreen from './onboarding/WelcomeScreen';
import CreateAccountScreen from './onboarding/CreateAccountScreen';
import LoginScreen from './onboarding/LoginScreen';
import FitnessGoalsScreen from './onboarding/FitnessGoalsScreen';
import PersonalDetailsScreen from './onboarding/PersonalDetailsScreen';
import SummaryScreen from './onboarding/SummaryScreen';
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
  | 'plan_offer'
  | 'summary';

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
  const [dob, setDob] = useState('');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<AthleteGoal[]>([]);
  // Simplified onboarding: these are DEFAULTS, not answers — the user is
  // no longer asked for them upfront. They are asked later, contextually
  // (experience/equipment/days at the first plan build; activity/weight/
  // height/diet on the first Fuel visit), and edited in Settings after that.
  // Kept as plain constants (not state) so nothing can drift them.
  // Object (not bare consts): property access widens literal types, so
  // the branch code below (unit/days variants) still type-checks even
  // though every value here is the fixed onboarding default.
  const ONBOARDING_DEFAULTS = {
    experienceLevel: 'beginner' as UserMode,
    gender: 'male' as Gender,
    unit: 'kg' as Unit,
    weight: 70,
    heightCm: 175,
    daysPerWeek: 4,
    equipment: 'full_gym' as AITrainingProfile['equipment'],
    activity: 'light' as 'sedentary' | 'light' | 'active' | 'very_active',
    diet: 'non_vegetarian' as DietPreference,
  };
  const experienceLevel = ONBOARDING_DEFAULTS.experienceLevel;
  const gender = ONBOARDING_DEFAULTS.gender;
  const unit = ONBOARDING_DEFAULTS.unit;
  const weight = ONBOARDING_DEFAULTS.weight;
  const heightCm = ONBOARDING_DEFAULTS.heightCm;
  const daysPerWeek = ONBOARDING_DEFAULTS.daysPerWeek;
  const equipmentChoice = ONBOARDING_DEFAULTS.equipment;
  const activityChoice = ONBOARDING_DEFAULTS.activity;
  const dietPreference = ONBOARDING_DEFAULTS.diet;

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
  const profile = useStore((s) => s.profile);
  const trainingProfile = useStore((s) => s.trainingProfile);

  // Detect Google auth session or local snapshots on-demand
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check for direct screen navigation or OAuth error in URL hash or search params
    const searchParams = new URLSearchParams(window.location.search);
    const screenParam = searchParams.get('screen') as OnboardingScreenId;
    if (
      screenParam &&
      ['splash', 'welcome', 'create_account', 'login', 'goals', 'experience', 'schedule', 'details', 'plan_offer', 'summary'].includes(
        screenParam
      )
    ) {
      // Simplified onboarding removed the experience/schedule steps; old
      // deep links to them land on details-lite instead of a dead screen.
      setCurrentScreen(
        screenParam === 'experience' || screenParam === 'schedule' ? 'details' : screenParam
      );
    }
    const hashClean = (window.location.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hashClean);
    const oauthError =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');

    if (oauthError) {
      // Provider redirect errors used to render verbatim (provider
      // wordings, URLs) — show neutral copy instead. The raw value is
      // still cleared from the URL below.
      toast.error(t('auth.googleSignInIncomplete'), t('auth.signInError'));
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
    dateOfBirth: string;
    limitations: string[];
  }) => {
    // O3 (audit): hold the typed DOB in the parent FIRST, before any
    // validation return — backing into the details screen remounts it,
    // and without this the date was lost while name/gender survived.
    setDob(details.dateOfBirth);
    // Never silently fall back to a default goal: the athlete must choose.
    if (selectedGoals.length === 0) {
      toast.error(t('toast.chooseGoal'), t('toast.titleGoalRequired'));
      return;
    }

    setIsFinishing(true);

    // Simplified onboarding: only name/gender/DOB/injury are asked upfront.
    // Age is calculated from DOB (the details screen already validated
    // 13–120); weight, height, unit, and diet keep the state defaults and
    // are asked later — weight/height/diet on the first Fuel visit.
    const age = calculateAgeFromDob(details.dateOfBirth) ?? 25;
    const nameToSave = sanitizeAthleteName(details.name.trim() || athleteName.trim() || 'Athlete', MAX_ATHLETE_NAME_LENGTH);
    const bodyweightKg =
      unit === 'lbs' ? weight * 0.453592 : weight;
    const bodyweightLbs =
      unit === 'kg' ? weight * 2.20462 : weight;

    const finalGoals = [...selectedGoals];
    // Diet is deferred to the first Fuel visit; the state default
    // (non_vegetarian) applies until the user answers there.
    const chosenDiet = dietPreference;
    const profileData = {
      id: authUser?.id || getOrCreateGuestId(),
      name: nameToSave,
      gender: details.gender,
      bodyweightKg: Math.round(bodyweightKg * 10) / 10,
      bodyweightLbs: Math.round(bodyweightLbs * 10) / 10,
      heightCm: heightCm,
      age,
      dateOfBirth: details.dateOfBirth,
      unit,
      dietPreference: chosenDiet,
      createdAt: new Date().toISOString(),
      goals: finalGoals,
      userMode: experienceLevel,
    };

    // NOTE: setProfile is intentionally NOT called here yet. On the plan-offer
    // path the profile is staged in pendingProfile and applied on the summary
    // screen's Continue/Edit buttons — calling setProfile now would unmount
    // Onboarding via the page.tsx gate and the offer screen would never render.
    // (Live-fix L1: Accept/Decline used to apply it too, which unmounted
    // Onboarding before the summary could paint — same gate, same fix.)
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
      generatedSplit = generateSplitWeeklySchedule('push_pull_legs', unit).plans;
    } else if (daysPerWeek === 5) {
      preferredSplit = 'bro_split';
      generatedSplit = generateSplitWeeklySchedule('bro_split', unit).plans;
    } else if (daysPerWeek <= 3) {
      preferredSplit = 'full_body';
      generatedSplit = generateSplitWeeklySchedule('full_body', unit).plans;
    } else {
      preferredSplit = 'upper_lower';
      generatedSplit = getGoalAdaptiveSplitTemplates(primaryGoal, unit, {
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
    const allLimitations = Array.from(new Set([...priorLimitations, ...details.limitations]));
    if (generatedSplit) {
      generatedSplit = prepareGeneratedPlans(generatedSplit, {
        unit,
        bodyweightKg,
        experience: experienceLevel,
        ageYears: age,
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
          heightCm,
          age,
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
    // If they already had plans, skip the offer and go to the summary —
    // the profile still applies on the summary's Continue, never here,
    // or the summary would never paint (live-fix L1).
    // Note: use generatedSplit directly — setPendingPlans hasn't applied yet.
    const hasNewPlans = !existingPlans || existingPlans.length === 0;
    if (hasNewPlans && generatedSplit && generatedSplit.length > 0) {
      // Stage the profile — applied on the summary's Continue/Edit.
      setPendingProfile(profileData);
      setCurrentScreen('plan_offer');
    } else {
      // No offer: stage the profile the same way and show the summary.
      setPendingProfile(profileData);
      setCurrentScreen('summary');
    }
  };

  const completeOnboarding = () => {
    // How-to-use guide once-flag lives in raw localStorage, outside the
    // store — so Start fresh / a previous dismissal leaves it set and
    // a later new user in this browser profile never sees the guide,
    // while Settings re-open (own local state) keeps working. Clear it
    // here, on the new profile's completion, before the profile lands:
    // the page.tsx trigger then reads it absent and shows the guide
    // once. Returning users never re-run this, so a dismissal sticks.
    clearHowToSeenFlag(typeof window !== 'undefined' ? window.localStorage : undefined);
    // Live-fix L1: the profile was staged, not applied, so the summary
    // could render (applying it earlier unmounts Onboarding via the
    // page.tsx gate). Apply it here, on the summary's Continue.
    applyPendingProfile();
    // pendingPlans was nulled at Accept/Decline, so judge the toast by
    // what actually landed in the store: plans added → Training Ready.
    const plansAdded = (useStore.getState().plannedWorkouts?.length ?? 0) > 0;
    toast.success(t('toast.welcome', { name: savedFirstName }), plansAdded ? t('toast.titleTrainingReady') : t('toast.titleAllSet'));
    try {
      navigate('home', { clearHistory: true });
    } catch {}
  };

  // Summary edit link (FND-05): apply the staged profile, finish
  // onboarding, and land on You → Settings, scrolled to the Training
  // Preferences section. The button label names that real destination.
  const handleSummaryEdit = () => {
    // Same new-profile moment as completeOnboarding (this path lands
    // on Settings instead of Home): clear the stale guide flag so the
    // first later Home visit shows the guide once.
    clearHowToSeenFlag(typeof window !== 'undefined' ? window.localStorage : undefined);
    applyPendingProfile();
    toast.success(t('toast.welcome', { name: savedFirstName }), t('toast.titleAllSet'));
    try {
      sessionStorage.setItem('ascend_settings_section', 'training');
    } catch {}
    try {
      navigate('settings', { clearHistory: true });
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
    // NOTE (live-fix L1): do NOT apply the staged profile here. setProfile
    // unmounts Onboarding via the page.tsx gate (profile presence), so
    // applying it would skip the summary screen entirely — the summary
    // renders only because the profile stays staged until its Continue.
    if (pendingPlans && pendingPlans.length > 0) {
      setPlannedWorkouts(pendingPlans);
      if (pendingSchedule) {
        setWeeklySchedule(pendingSchedule);
      }
    }
    setPendingPlans(null);
    setPendingSchedule(null);
    setCurrentScreen('summary');
  };

  const handleDeclinePlans = () => {
    // Same staging rule as Accept (live-fix L1): profile applies on the
    // summary's Continue/Edit, not here, or the summary never paints.
    setPendingPlans(null);
    setPendingSchedule(null);
    setCurrentScreen('summary');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // F12 (audit): pre-read cap, same rationale as SettingsView's
    // restore — the parser's 50 MB cap only runs after the read.
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t('vault.tooLargeMsg'), t('vault.tooLargeTitle'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
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
          setCurrentScreen('details');
        }}
        onSkip={() => {
          setSelectedGoals(['general_fitness']);
          toast.info(t('toast.defaultGoalSet'), t('toast.titleGoalSet'));
          setCurrentScreen('details');
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

  // ── DETAILS-LITE (Step 2 of 2) ───────────────────────────────────────────
  // Simplified onboarding: only name, gender, date of birth, and the
  // optional injury dropdown. Experience, schedule, equipment, activity,
  // weight, height, diet, and unit are NOT asked here — they keep the
  // state defaults below and are asked later, contextually: experience /
  // equipment / days at the first plan build, activity / weight / height /
  // diet on the first Fuel visit. The old experience/schedule screens
  // still exist as components but are no longer forward steps.
  if (currentScreen === 'details') {
    return (
      <PersonalDetailsScreen
        initialName={athleteName}
        initialGender={gender}
        initialDob={dob}
        initialLimitations={trainingProfile?.injuriesOrLimitations || []}
        onContinue={handleFinishCalibration}
        onBack={() => setCurrentScreen('goals')}
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
        <StepProgressBar currentStep={2} totalSteps={2} onBack={() => setCurrentScreen('details')} />
        <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
          <div className="text-left space-y-1">
            <h1 className="page-title">
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
                These targets are estimated from default weight and height — add yours in Fuel for exact numbers.
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
              className="w-full py-4 px-6 rounded-2xl bg-bg-card border-2 border-border text-text-primary font-bold text-base active:scale-[0.98] transition-transform"
            >
              {t('onboarding.declinePlan')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SUMMARY SCREEN (UX redesign Stage 7) ─────────────────────────────────
  // Shown after the plan offer (or directly after details when no plan was
  // generated) and before the tabs. Rows restate stored choices only.
  if (currentScreen === 'summary') {
    // Live-fix L1: the store profile is NOT applied yet at this point
    // (it applies on Continue/Edit), so goal/diet read from the staged
    // pendingProfile first — otherwise the summary would restate stale
    // or default values. Level/days/injuries come from trainingProfile,
    // which handleFinishCalibration already wrote.
    const summaryGoal = resolvePrimaryGoal(pendingProfile?.goals ?? profile?.goals);
    const summaryLevelKey =
      trainingProfile?.experience === 'advanced'
        ? 'settings.modeAdvanced'
        : trainingProfile?.experience === 'intermediate'
          ? 'settings.modeIntermediate'
          : 'settings.modeBeginner';
    const summaryDiet = pendingProfile?.dietPreference ?? profile?.dietPreference ?? 'non_vegetarian';
    const summaryDietKey =
      summaryDiet === 'vegetarian'
        ? 'settings.dietVegetarian'
        : summaryDiet === 'eggitarian'
          ? 'settings.dietEggetarian'
          : summaryDiet === 'vegan'
            ? 'settings.dietVegan'
            : 'settings.dietNonVegetarian';
    return (
      <SummaryScreen
        goal={ATHLETE_GOAL_CONFIGS[summaryGoal].label}
        level={t(summaryLevelKey)}
        daysPerWeek={trainingProfile?.daysPerWeek ?? 4}
        diet={t(summaryDietKey)}
        injuries={trainingProfile?.injuriesOrLimitations ?? []}
        onContinue={completeOnboarding}
        onEdit={handleSummaryEdit}
      />
    );
  }

  return null;
}
