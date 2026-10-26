'use client';

import { useState, useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { Home, Dumbbell, TrendingUp, UtensilsCrossed, User } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import { applyTextScale } from '@/lib/text-scale';
import { resolveAccentVariant, accentVariantToCssVars, applyAccentVars } from '@/lib/accent-themes';
import OnboardingScreen from '@/components/Onboarding';
import HowToUseGuide from '@/components/HowToUseGuide';
import { HOWTO_SEEN_KEY } from '@/lib/howto-guide';
import { calculateAgeFromDob, isValidDob } from '@/lib/age';
import HistoryForkScreen from '@/components/HistoryForkScreen';
import { hasRetainedHistory, retainedHistoryCounts } from '@/lib/history-fork';
import SplashScreen from '@/components/onboarding/SplashScreen';
import SegmentedControl from '@/components/ui/SegmentedControl';

import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import OfflineState from '@/components/OfflineState';

import HomePage from '@/components/HomePage';
import TabSkeleton from '@/components/TabSkeleton';
import TabGuardBanner from '@/components/ui/TabGuardBanner';

// Non-home tabs are code-split: on a 2 GB phone the old single chunk
// (~1.1 MB) paid the full parse cost for screens the user may never
// open. Home stays static for first paint; the rest load on first tap
// with the tab skeleton as fallback.
const ProgressPage = dynamic(() => import('@/components/ProgressPage'), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const WorkoutPage = dynamic(() => import('@/components/WorkoutPage'), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const MealsPage = dynamic(() => import('@/components/MealsPage'), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const ProfileView = dynamic(() => import('@/components/ProfileView'), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const SettingsView = dynamic(() => import('@/components/SettingsView'), {
  ssr: false,
  loading: () => <TabSkeleton />,
});

const ImportProgramModal = dynamic(() => import('@/components/ImportProgramModal'), {
  ssr: false,
});
import { decodeProgramFromHash, DecodedProgram } from '@/lib/program-sharing';
import { PlannedWorkout } from '@/lib/types';
import { useAppNavigation, TabId } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';

const tabs = [
  { id: 'home', labelKey: 'nav.today', icon: Home, target: 'home' },
  { id: 'workout', labelKey: 'nav.train', icon: Dumbbell, target: 'workout' },
  { id: 'progress', labelKey: 'nav.progress', icon: TrendingUp, target: 'progress' },
  { id: 'meals', labelKey: 'nav.fuel', icon: UtensilsCrossed, target: 'meals' },
  // UX redesign Stage 2: "You" is a PRESENTATION grouping over the
  // profile/settings TabIds — routes and TabIds do not change. Tapping
  // You lands on Profile; the segmented bar above the view switches
  // between Profile and Settings.
  { id: 'you', labelKey: 'nav.you', icon: User, target: 'profile' },
] as const;

export default function AppPage() {
  const {
    activeTab,
    progressInitialTab,
    navigate,
    registerBackHandler,
  } = useAppNavigation();

  const { t } = useTranslation();

  const [sharedProgram, setSharedProgram] = useState<DecodedProgram | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pendingStartPlan, setPendingStartPlan] = useState<PlannedWorkout | null>(null);
  const { profile, theme, hasCustomTheme, setTheme, _hasHydrated, activeWorkoutDraft, uiPreferences, workouts, meals, plannedWorkouts, prs, bodyMetrics, prTargets, macroGoals, startFreshFromRetainedHistory, hasCompletedOnboarding } = useStore();
  // FND-06: the fork decision lives only for this session — closing
  // the app undecided re-shows the fork, which is the safe default.
  const [forkResolved, setForkResolved] = useState(false);

  // True zustand-persist hydration (distinct from the _hasHydrated splash
  // fallback, which can fire before the persisted state is merged). Theme
  // effects must wait for this, otherwise a slow rehydration lets the
  // device-theme sync overwrite the athlete's saved theme with the OS theme.
  const [persistHydrated, setPersistHydrated] = useState(
    () => typeof window !== 'undefined' && useStore.persist.hasHydrated()
  );
  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setPersistHydrated(true);
      return;
    }
    const unsub = useStore.persist.onFinishHydration(() => setPersistHydrated(true));
    return unsub;
  }, []);

  // Birthday refresh: a stored date of birth ages the profile once a
  // year, on the birthday itself. Stored `age` goes stale otherwise —
  // every consumer (macros, minor gates, training loads) reads
  // profile.age, so recompute it from DOB after hydration and whenever
  // the stored DOB changes. Runs only when the computed age differs,
  // so it never loops; profiles without a DOB are untouched (their
  // typed age keeps working exactly as before).
  useEffect(() => {
    if (typeof window === 'undefined' || !_hasHydrated || !persistHydrated) return;
    const state = useStore.getState();
    const prof = state.profile;
    const dob = prof?.dateOfBirth;
    if (!prof || !dob || !isValidDob(dob)) return;
    const computed = calculateAgeFromDob(dob);
    if (computed !== null && prof.age !== computed) {
      state.setProfile({ ...prof, age: computed });
    }
  }, [_hasHydrated, persistHydrated, profile?.dateOfBirth]);

  // First-run how-to-use guide: shown once, over Today, after the
  // profile gate (onboarding complete + a profile exist). Dismissing —
  // via the button, the X, backdrop, or Android back — writes the seen
  // flag, so it never reappears; Settings re-opens it on demand.
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !_hasHydrated || !persistHydrated) return;
    if (!hasCompletedOnboarding || !profile) return;
    if (activeTab !== 'home') return;
    try {
      if (!window.localStorage.getItem(HOWTO_SEEN_KEY)) setShowGuide(true);
    } catch {}
  }, [_hasHydrated, persistHydrated, hasCompletedOnboarding, profile, activeTab]);
  const closeGuide = () => {
    try {
      window.localStorage.setItem(HOWTO_SEEN_KEY, '1');
    } catch {}
    setShowGuide(false);
  };

  // Dynamic device theme synchronization (when not manually overridden in Settings)
  useEffect(() => {
    if (typeof window === 'undefined' || !_hasHydrated || !persistHydrated) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // Initial check if user has not set a custom theme
    if (!hasCustomTheme) {
      const deviceTheme = mediaQuery.matches ? 'dark' : 'light';
      if (theme !== deviceTheme) {
        setTheme(deviceTheme, false);
      }
    }

    const handleDeviceChange = (e: MediaQueryListEvent) => {
      const storeState = useStore.getState();
      if (!storeState.hasCustomTheme) {
        storeState.setTheme(e.matches ? 'dark' : 'light', false);
      }
    };

    mediaQuery.addEventListener('change', handleDeviceChange);
    return () => mediaQuery.removeEventListener('change', handleDeviceChange);
  }, [_hasHydrated, persistHydrated, hasCustomTheme, theme, setTheme]);

  // Listen for shared program links (#plan=...) in URL
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkHash = () => {
      const hash = window.location.hash;
      if (hash && (hash.includes('plan=') || hash.startsWith('#v1_'))) {
        const decoded = decodeProgramFromHash(hash);
        if (decoded) {
          setSharedProgram(decoded);
          setIsImportModalOpen(true);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Listen for service worker push notification clicks
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NAVIGATE_TAB' && event.data.tab) {
        navigate(event.data.tab as TabId);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [navigate]);

  const handleStartSharedWorkout = (plan: PlannedWorkout) => {
    setPendingStartPlan(plan);
    navigate('workout');
    setTimeout(() => setPendingStartPlan(null), 800);
  };

  useEffect(() => {
    if (typeof document === 'undefined' || !_hasHydrated || !persistHydrated) return;
    const activeTheme = theme || 'dark';
    if (activeTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [theme, _hasHydrated, persistHydrated]);

  // UX redesign Stage 6 — apply the selected accent theme (preset or custom)
  // as CSS vars on <html>. This is NOT a theme-mode pick: it never touches
  // hasCustomTheme or the light/dark class above. Re-applied when the accent
  // selection or the mode changes (every preset has light + dark variants).
  useEffect(() => {
    if (typeof document === 'undefined' || !_hasHydrated || !persistHydrated) return;
    const variant = resolveAccentVariant(
      uiPreferences?.accentTheme ?? 'vermilion',
      uiPreferences?.customAccentHex ?? null,
      theme === 'dark' ? 'dark' : 'light',
    );
    applyAccentVars(accentVariantToCssVars(variant));
  }, [uiPreferences?.accentTheme, uiPreferences?.customAccentHex, theme, _hasHydrated, persistHydrated]);

  // SIM-P1-08: apply the saved text size on load and whenever it
  // changes in Settings. Root font-size scaling covers all rem text.
  useEffect(() => {
    if (!_hasHydrated || !persistHydrated) return;
    applyTextScale(uiPreferences?.textScale);
  }, [uiPreferences?.textScale, _hasHydrated, persistHydrated]);

  // SIM-P2-02: keep <html lang> in sync with the active language so
  // screen readers pronounce Hindi UI as Hindi, not English. (The
  // static layout hardcodes lang="en"; this runtime effect corrects it
  // once the persisted preference hydrates.)
  useEffect(() => {
    if (!_hasHydrated || !persistHydrated) return;
    document.documentElement.lang = uiPreferences?.language === 'hi' ? 'hi' : 'en';
  }, [uiPreferences?.language, _hasHydrated, persistHydrated]);

  // Dismiss root modals when Back is pressed
  useEffect(() => {
    if (!isImportModalOpen) return;
    return registerBackHandler(() => {
      setIsImportModalOpen(false);
      return true;
    }, 100);
  }, [isImportModalOpen, registerBackHandler]);

  const [mounted, setMounted] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [forcedState, setForcedState] = useState<'error' | 'loading' | 'offline' | null>(null);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const offlineModalRef = useRef<HTMLDivElement>(null); const { dialogProps: offlineDialogProps } = useModalA11y(offlineModalRef, showOfflineModal, () => setShowOfflineModal(false));

  // Check for test/debug states in URL (?state=error | loading | offline)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get('state');
    if (stateParam === 'error' || stateParam === 'loading' || stateParam === 'offline') {
      setForcedState(stateParam);
    }
  }, []);

  useEffect(() => {
    if (!showOfflineModal) return;
    return registerBackHandler(() => {
      setShowOfflineModal(false);
      return true;
    }, 100);
  }, [showOfflineModal, registerBackHandler]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    setMounted(true);
    // Initialize background Supabase sync on root mount to handle OAuth callbacks and token refreshes
    if (typeof window !== 'undefined') {
      import('@/lib/supabase/sync').then(({ syncEngine }) => {
        syncEngine.init();
      });
      // Native-only: schedule on-device reminders — web push cannot reach
      // the Android WebView when the app is closed. No-op in browsers.
      import('@/lib/local-notifications').then(({ initLocalNotifications }) => {
        initLocalNotifications();
      });
      // Native-only: Health Connect foreground sync (consent-gated in
      // Settings; no-op on web and until the user connects).
      import('@/lib/health-sync').then(({ initHealthConnectSync }) => {
        initHealthConnectSync();
      });
    }
    // Safety fallback: if Zustand storage rehydration takes longer than 600ms, unlock
    const timer = setTimeout(() => {
      if (!useStore.getState()._hasHydrated) {
        useStore.getState().setHasHydrated(true);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Forced visual test states for Screen 25 (Error), Screen 26 (Loading), Screen 27 (Offline)
  if (forcedState === 'error') {
    return (
      <main id="main-content" className="w-full min-h-[100dvh]">
        <ErrorState
          onHome={() => {
            window.location.href = '/';
          }}
          reset={() => {
            window.location.href = '/';
          }}
        />
      </main>
    );
  }

  if (forcedState === 'loading') {
    return (
      <main id="main-content" className="w-full min-h-[100dvh]">
        <LoadingState fullScreen />
      </main>
    );
  }

  if (forcedState === 'offline') {
    return (
      <main id="main-content" className="w-full min-h-[100dvh]">
        <OfflineState
          onContinueOffline={() => {
            window.location.href = '/';
          }}
        />
      </main>
    );
  }

  // Branded splash/skeleton during SSR & storage hydration to prevent flashing the login screen to existing athletes
  if (!mounted || !_hasHydrated) {
    return (
      <main id="main-content" className="w-full min-h-[100dvh]">
        <SplashScreen isHydrating />
      </main>
    );
  }

  // If hydrated and no athlete profile exists, render the onboarding & sign-in screen
  if (!profile) {
    // FND-06: retained local history with no profile must never
    // silently attach to the next profile. Offer the explicit fork
    // first; Start fresh archives (never deletes) and only then shows
    // onboarding over empty state.
    const retainedInput = { workouts, meals, plannedWorkouts, prs, bodyMetrics, prTargets, macroGoals };
    if (!forkResolved && hasRetainedHistory(retainedInput)) {
      return (
        <main id="main-content" className="w-full min-h-[100dvh]">
          <TabGuardBanner />
          <HistoryForkScreen
            counts={retainedHistoryCounts(retainedInput)}
            onContinue={() => setForkResolved(true)}
            onStartFresh={() => {
              // Start fresh now lands on Today with a default profile
              // (store action). Navigate home explicitly: the
              // saved-navigation restore may otherwise reopen the tab
              // the user was last on (e.g. Settings, where logout
              // lives). On archive-write failure the action returns
              // false and the fork stays, so the user can retry or
              // Continue.
              if (startFreshFromRetainedHistory()) {
                setForkResolved(true);
                navigate('home', { clearHistory: true });
              }
            }}
          />
        </main>
      );
    }
    return (
      <main id="main-content" className="w-full min-h-[100dvh]">
        <TabGuardBanner />
        <OnboardingScreen />
      </main>
    );
  }

  // UX redesign Stage 2 — navigation chrome rules:
  // - 5 destinations: Today / Train / Progress / Fuel / You ("You" is a
  //   presentation grouping over the profile/settings TabIds).
  // - During an active workout the perform surface is fullscreen on the
  //   workout tab (chrome hidden, as before); from any other tab the
  //   chrome stays visible with a persistent Resume affordance, so the
  //   session is never hidden behind navigation.
  // - Desktop ≥1024px: left rail (232px) with the same destinations;
  //   content is offset beside it. The bottom bar is mobile-only.
  const isYouTab = activeTab === 'profile' || activeTab === 'settings';
  const showResumeBar = !!activeWorkoutDraft && activeTab !== 'workout';
  const showChrome = !activeWorkoutDraft || activeTab !== 'workout';
  const isNavActive = (id: string) =>
    id === 'progress'
      ? activeTab === 'progress' || activeTab === 'prs'
      : id === 'you'
        ? isYouTab
        : activeTab === id;
  const goTab = (entry: (typeof tabs)[number]) => {
    // UX #9: do NOT force progressTab 'overview' here. navigate() keeps
    // the last Progress section when no sub-tab is given, so tapping
    // Progress returns the user to where they were (PRs, body, …)
    // instead of yanking them back to overview every time.
    navigate(entry.target as TabId);
  };

  return (
    <div className="min-h-[100dvh] bg-bg-primary text-text-primary relative selection:bg-accent/20">
      <TabGuardBanner />
            {showChrome && (
              <nav
                aria-label="Main Navigation"
                className="fixed bottom-0 left-0 top-0 z-40 hidden w-[232px] flex-col border-r border-border bg-bg-primary px-3 py-4 lg:flex"
              >
                <div className="font-display px-2 pb-5 text-[28px] font-semibold leading-none tracking-wide">
                  ASCEND
                </div>
                {tabs.map((entry) => {
                  const Icon = entry.icon;
                  const active = isNavActive(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      aria-label={t(entry.labelKey as StringKey)}
                      onClick={() => goTab(entry)}
                      className={`pressable mb-1 flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium ${
                        active ? 'bg-accent-subtle text-accent' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2.2 : 1.75} />
                      <span className={active ? 'font-semibold' : ''}>{t(entry.labelKey as StringKey)}</span>
                    </button>
                  );
                })}
                <div className="mt-auto">
                  {showResumeBar && (
                    <button type="button" onClick={() => navigate('workout')} className="btn-primary w-full">
                      {t('home.resumeWorkout')}
                    </button>
                  )}
                </div>
              </nav>
            )}
            <div className="lg:ml-[232px]">
              {isOffline && (
                <aside
                  role="status"
                  aria-live="polite"
                  onClick={() => setShowOfflineModal(true)}
                  className="sticky top-0 z-50 flex cursor-pointer items-center justify-center border-b border-amber-500/30 bg-amber-950/70 px-3 py-1.5 text-center text-xs text-amber-200 backdrop-blur transition-colors hover:bg-amber-950/90"
                >
                  <span className="mr-2 h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span>Offline Gym Mode Active &bull; Tap for details</span>
                </aside>
              )}
              <main id="main-content" className="w-full">
                {isYouTab && (
                  <div className="sticky top-0 z-30 mx-auto w-full max-w-md bg-bg-primary/95 px-5 pt-3 backdrop-blur">
                    <SegmentedControl
                      ariaLabel={t('nav.you')}
                      value={activeTab === 'settings' ? 'settings' : 'profile'}
                      options={[
                        { value: 'profile', label: t('profile.title') },
                        { value: 'settings', label: t('settings.title') },
                      ]}
                      onChange={(v) => navigate(v as TabId)}
                    />
                  </div>
                )}
                {/* Keyed by tab: every tab switch replays one consistent enter
                    animation (fade + rise). Pages already mount/unmount per tab,
                    so this adds motion without changing mount behavior. */}
                <div key={activeTab} className="animate-tab-enter">
                {activeTab === 'home' && (
                  <HomePage
                    onNavigate={(tab) => {
                      navigate(tab as TabId);
                    }}
                  />
                )}
                {activeTab === 'workout' && (
                  <WorkoutPage
                    startPlanOnMount={pendingStartPlan}
                    onNavigate={(tab) => {
                      navigate(tab as TabId);
                    }}
                  />
                )}
                {(activeTab === 'progress' || activeTab === 'prs') && (
                  <ProgressPage
                    initialTab={progressInitialTab}
                    onNavigate={(tab) => {
                      navigate(tab as TabId);
                    }}
                  />
                )}
                {activeTab === 'meals' && (
                  <MealsPage
                    onNavigate={(tab) => {
                      navigate(tab as TabId);
                    }}
                  />
                )}
                {activeTab === 'profile' && (
                  <ProfileView
                    onNavigate={(tab) => {
                      navigate(tab as TabId);
                    }}
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsView
                    onNavigate={(tab) => {
                      navigate(tab as TabId);
                    }}
                  />
                )}
                </div>
                <HowToUseGuide isOpen={showGuide} onClose={closeGuide} />
                {showResumeBar && <div aria-hidden className="h-16 lg:hidden" />}
              </main>

              {/* Mobile bottom chrome: 5 destinations + Resume affordance */}
              {showChrome && (
                <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
                  {showResumeBar && (
                    <div className="bg-bg-primary/95 px-3 py-2 backdrop-blur-xl">
                      <button type="button" onClick={() => navigate('workout')} className="btn-primary w-full">
                        {t('home.resumeWorkout')}
                      </button>
                    </div>
                  )}
                  <nav className="native-tab-bar" aria-label="Main Navigation">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = isNavActive(tab.id);
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={t(tab.labelKey as StringKey)}
                          onClick={() => goTab(tab)}
                          className={`native-tab-item ${isActive ? 'active' : ''}`}
                        >
                          {isActive && <div className="native-tab-indicator" />}
                          <Icon size={20} strokeWidth={isActive ? 2.2 : 1.75} className={isActive ? 'text-accent' : 'text-text-muted'} />
                          <span className={`mt-1 text-[12px] ${isActive ? 'font-semibold text-accent' : 'font-normal text-text-muted'}`}>
                            {t(tab.labelKey as StringKey)}
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}
            </div>

      {/* Shared Program Import Modal (Distribution Loop) */}
      <ImportProgramModal
        program={sharedProgram}
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onStartWorkout={handleStartSharedWorkout}
      />

      {/* Screen 27: Offline Gym Mode Details Modal */}
      {showOfflineModal && (
        <div ref={offlineModalRef} {...offlineDialogProps} className="fixed inset-0 z-50 bg-bg-primary/95 backdrop-blur-md flex items-center justify-center p-4">
          <OfflineState
            fullScreen={false}
            onContinueOffline={() => setShowOfflineModal(false)}
          />
        </div>
      )}
    </div>
  );
}
