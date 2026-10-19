'use client';

import { useState, useEffect } from 'react';
import { Home, Dumbbell, TrendingUp, UtensilsCrossed, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import OnboardingScreen from '@/components/Onboarding';
import SplashScreen from '@/components/onboarding/SplashScreen';

import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import OfflineState from '@/components/OfflineState';

import HomePage from '@/components/HomePage';
import ProgressPage from '@/components/ProgressPage';
import WorkoutPage from '@/components/WorkoutPage';
import MealsPage from '@/components/MealsPage';
import ProfileView from '@/components/ProfileView';
import SettingsView from '@/components/SettingsView';
import TabSkeleton from '@/components/TabSkeleton';

const QuickActionSheetModal = dynamic(() => import('@/components/QuickActionSheetModal'), {
  ssr: false,
});

const ImportProgramModal = dynamic(() => import('@/components/ImportProgramModal'), {
  ssr: false,
});
import { decodeProgramFromHash, DecodedProgram } from '@/lib/program-sharing';
import { PlannedWorkout } from '@/lib/types';
import { useAppNavigation, TabId } from '@/lib/navigation';

const tabs = [
  { id: 'home', label: 'Today', icon: Home },
  { id: 'workout', label: 'Train', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'meals', label: 'Fuel', icon: UtensilsCrossed },
] as const;

export default function AppPage() {
  const {
    activeTab,
    progressInitialTab,
    navigate,
    registerBackHandler,
  } = useAppNavigation();

  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [sharedProgram, setSharedProgram] = useState<DecodedProgram | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pendingStartPlan, setPendingStartPlan] = useState<PlannedWorkout | null>(null);
  const { profile, theme, hasCustomTheme, setTheme, _hasHydrated, activeWorkoutDraft } = useStore();

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

  // Dismiss root modals when Back is pressed
  useEffect(() => {
    if (!isQuickActionOpen) return;
    return registerBackHandler(() => {
      setIsQuickActionOpen(false);
      return true;
    }, 100);
  }, [isQuickActionOpen, registerBackHandler]);

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
    return (
      <main id="main-content" className="w-full min-h-[100dvh]">
        <OnboardingScreen />
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-bg-primary text-text-primary relative selection:bg-accent/20">
      {isOffline && (
        <aside
          role="status"
          aria-live="polite"
          onClick={() => setShowOfflineModal(true)}
          className="bg-amber-950/70 border-b border-amber-500/30 text-amber-200 text-xs px-3 py-1.5 flex items-center justify-center text-center sticky top-0 z-50 backdrop-blur cursor-pointer hover:bg-amber-950/90 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-2" />
          <span>Offline Gym Mode Active &bull; Tap for details</span>
        </aside>
      )}
      <main id="main-content" className="w-full">
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
      </main>

      {/* Native 4-Destination Bottom Navigation (Part 5 Spec) */}
      {!activeWorkoutDraft && (
        <nav
          className="native-tab-bar"
          aria-label="Main Navigation"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === 'progress'
              ? (activeTab === 'progress' || activeTab === 'prs')
              : activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                onClick={() => {
                  navigate(tab.id, { progressTab: tab.id === 'progress' ? 'overview' : undefined });
                }}
                className={`native-tab-item ${
                  isActive ? 'active' : ''
                }`}
              >
                {isActive && <div className="native-tab-indicator" />}
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.75} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <span className={`text-[12px] mt-1 ${isActive ? 'text-accent font-semibold' : 'text-text-muted font-normal'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Quick Action Sheet Modal */}
      <QuickActionSheetModal
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        onNavigate={(tab) => {
          setIsQuickActionOpen(false);
          navigate(tab as TabId);
        }}
      />

      {/* Shared Program Import Modal (Distribution Loop) */}
      <ImportProgramModal
        program={sharedProgram}
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onStartWorkout={handleStartSharedWorkout}
      />

      {/* Screen 27: Offline Gym Mode Details Modal */}
      {showOfflineModal && (
        <div className="fixed inset-0 z-50 bg-bg-primary/95 backdrop-blur-md flex items-center justify-center p-4">
          <OfflineState
            fullScreen={false}
            onContinueOffline={() => setShowOfflineModal(false)}
          />
        </div>
      )}
    </div>
  );
}
