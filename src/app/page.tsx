'use client';

import { useState, useEffect } from 'react';
import { Home, Dumbbell, TrendingUp, UtensilsCrossed, Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import OnboardingScreen from '@/components/Onboarding';
import HomePage from '@/components/HomePage';
import ProgressPage from '@/components/ProgressPage';
import WorkoutPage from '@/components/WorkoutPage';
import MealsPage from '@/components/MealsPage';
import QuickActionSheetModal from '@/components/QuickActionSheetModal';
import ImportProgramModal from '@/components/ImportProgramModal';
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
    if (typeof window === 'undefined') return;

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
  }, [hasCustomTheme, theme, setTheme]);

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

  const handleStartSharedWorkout = (plan: PlannedWorkout) => {
    setPendingStartPlan(plan);
    navigate('workout');
    setTimeout(() => setPendingStartPlan(null), 800);
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const activeTheme = theme || 'dark';
      if (activeTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
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

  // Hydration barrier: Never render OnboardingScreen or app until mounted AND Zustand has rehydrated
  if (!mounted || !_hasHydrated) {
    return (
      <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center gap-3">
        <div className="text-accent text-lg tracking-widest uppercase font-mono font-bold animate-pulse">
          ASCEND
        </div>
        <span className="text-2xs text-text-muted font-mono">Restoring athlete data &amp; records...</span>
      </div>
    );
  }

  if (!profile) {
    return <OnboardingScreen />;
  }

  return (
    <div className="min-h-[100dvh] bg-bg-primary text-text-primary relative selection:bg-accent/20">
      {isOffline && (
        <aside
          role="status"
          aria-live="polite"
          className="bg-amber-950/70 border-b border-amber-500/30 text-amber-200 text-xs px-3 py-1.5 flex items-center justify-center text-center sticky top-0 z-50 backdrop-blur"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-2" />
          <span>Offline Gym Mode Active &bull; All workouts, PRs, and meals are safely saved locally</span>
        </aside>
      )}
      <main className="w-full">
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
  );
}
