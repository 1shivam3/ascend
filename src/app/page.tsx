'use client';

import { useState, useEffect } from 'react';
import { Home, Dumbbell, TrendingUp, UtensilsCrossed, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import OnboardingScreen from '@/components/Onboarding';

function TabLoadingFallback({ label }: { label: string }) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-8 animate-fade-in text-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-text-muted font-mono">{label}</span>
    </div>
  );
}

const HomePage = dynamic(() => import('@/components/HomePage'), {
  loading: () => <TabLoadingFallback label="Loading dashboard..." />,
  ssr: false,
});

const ProgressPage = dynamic(() => import('@/components/ProgressPage'), {
  loading: () => <TabLoadingFallback label="Loading analytics & PRs..." />,
  ssr: false,
});

const WorkoutPage = dynamic(() => import('@/components/WorkoutPage'), {
  loading: () => <TabLoadingFallback label="Loading training engine..." />,
  ssr: false,
});

const MealsPage = dynamic(() => import('@/components/MealsPage'), {
  loading: () => <TabLoadingFallback label="Loading nutrition & macros..." />,
  ssr: false,
});

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

  // Dynamic device theme synchronization (when not manually overridden in Settings)
  useEffect(() => {
    if (typeof window === 'undefined' || !_hasHydrated) return;

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
  }, [_hasHydrated, hasCustomTheme, theme, setTheme]);

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
    if (typeof document === 'undefined' || !_hasHydrated) return;
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
  }, [theme, _hasHydrated]);

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
    // Safety fallback: if Zustand storage rehydration takes longer than 600ms, unlock
    const timer = setTimeout(() => {
      if (!useStore.getState()._hasHydrated) {
        useStore.getState().setHasHydrated(true);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Branded splash/skeleton during SSR & storage hydration to prevent flashing the login screen to existing athletes
  if (!mounted || !_hasHydrated) {
    return (
      <main id="main-content" className="w-full min-h-[100dvh] flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center shadow-lg">
            <Dumbbell className="w-6 h-6 text-accent" />
          </div>
          <span className="text-xs font-mono font-bold tracking-widest text-text-muted uppercase">ASCEND</span>
        </div>
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
    <div className="app-workspace min-h-[100dvh] bg-bg-primary text-text-primary relative selection:bg-accent/20">
      {isOffline && (
        <aside role="status" aria-live="polite" className="offline-gym-banner text-xs flex items-center justify-center text-center sticky top-0 z-50">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-300 mr-2" />
          <span>Offline gym mode · Workouts and meals remain saved on this device</span>
        </aside>
      )}

      {/* Desktop workspace navigation; mobile keeps the familiar bottom tabs. */}
      <aside className="desktop-rail hidden lg:flex" aria-label="Workspace navigation">
        <div className="desktop-brand-lockup">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>
            <span className="desktop-brand-word">ASCEND</span>
            <span className="desktop-brand-subtitle">Strength systems</span>
          </span>
        </div>
        <span className="desktop-rail-label">Workspace</span>
        <nav className="desktop-nav" aria-label="Main navigation">
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
                onClick={() => navigate(tab.id, { progressTab: tab.id === 'progress' ? 'overview' : undefined })}
                className={`desktop-nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="desktop-rail-footer">
          <div className="desktop-privacy-note">
            <span className="privacy-dot" aria-hidden="true" />
            <span>Local-first by default. Your training stays yours.</span>
          </div>
          <button type="button" className="desktop-quick-action" onClick={() => setIsQuickActionOpen(true)}>
            <Plus size={16} strokeWidth={2.5} />
            <span>Quick action</span>
          </button>
          <div className="flex items-center gap-3 px-2 pt-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary text-sm font-bold text-text-primary border border-border">
              {(profile?.name || 'A').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-text-primary">{profile?.name || 'Athlete'}</span>
              <span className="block text-[10px] text-text-muted">Training profile</span>
            </div>
            <button type="button" onClick={() => setIsSettingsOpen(true)} className="btn-circle" aria-label="Open settings" title="Settings">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="desktop-content min-w-0 lg:ml-[248px]">
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
      </main>

      {/* Native-Feel 4-Destination Bottom Navigation */}
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
                  isActive ? 'active text-accent' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.7} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <span className={`text-[11px] mt-1 ${isActive ? 'text-accent font-semibold' : 'text-text-muted font-medium'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Floating Action Button for Quick Actions */}
      {!activeWorkoutDraft && (
        <button
          type="button"
          onClick={() => setIsQuickActionOpen(true)}
          className="fixed right-4 bottom-20 z-40 w-11 h-11 rounded-xl bg-accent text-stone-950 font-bold hover:brightness-110 active:scale-95 flex items-center justify-center transition-all cursor-pointer border border-accent/40 lg:hidden"
          title="Quick Actions"
          aria-label="Quick Actions"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
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
      </div>
    </div>
  );
}
