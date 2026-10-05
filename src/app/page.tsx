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

const tabs = [
  { id: 'home', label: 'Today', icon: Home },
  { id: 'workout', label: 'Train', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'meals', label: 'Fuel', icon: UtensilsCrossed },
] as const;

type TabId = (typeof tabs)[number]['id'] | 'prs';

export default function AppPage() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [progressInitialTab, setProgressInitialTab] = useState<'overview' | 'strength' | 'prs' | 'bodyweight' | 'training'>('overview');
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [sharedProgram, setSharedProgram] = useState<DecodedProgram | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pendingStartPlan, setPendingStartPlan] = useState<PlannedWorkout | null>(null);
  const { profile, theme, _hasHydrated, activeWorkoutDraft } = useStore();

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
    setActiveTab('workout');
    setTimeout(() => setPendingStartPlan(null), 800);
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const activeTheme = theme || 'light';
      if (activeTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    }
  }, [theme, _hasHydrated]);

  // Android/Browser back button: navigate to Home instead of exiting
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (activeTab !== 'home') {
        setActiveTab('home');
        // Re-push state so subsequent back presses also work
        window.history.pushState({ tab: 'home' }, '');
      }
      // If already on home, do nothing — let the OS handle exit naturally
    };

    // Push an initial state entry so we have something to pop to
    window.history.pushState({ tab: activeTab }, '');
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
    if (!_hasHydrated) {
      useStore.getState().setHasHydrated(true);
    }
  }, [_hasHydrated]);

  if (!_hasHydrated && !mounted) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-text-muted text-sm tracking-widest uppercase font-mono animate-pulse">
          ASCEND
        </div>
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
              if (tab === 'prs') {
                setProgressInitialTab('prs');
                setActiveTab('progress');
              } else {
                setActiveTab(tab as TabId);
              }
            }}
          />
        )}
        {activeTab === 'workout' && (
          <WorkoutPage
            startPlanOnMount={pendingStartPlan}
            onNavigate={(tab) => {
              if (tab === 'prs') {
                setProgressInitialTab('prs');
                setActiveTab('progress');
              } else {
                setActiveTab(tab as TabId);
              }
            }}
          />
        )}
        {(activeTab === 'progress' || activeTab === 'prs') && (
          <ProgressPage
            initialTab={progressInitialTab}
            onNavigate={(tab) => {
              if (tab === 'prs') {
                setProgressInitialTab('prs');
                setActiveTab('progress');
              } else {
                setActiveTab(tab as TabId);
              }
            }}
          />
        )}
        {activeTab === 'meals' && (
          <MealsPage
            onNavigate={(tab) => {
              if (tab === 'prs') {
                setProgressInitialTab('prs');
                setActiveTab('progress');
              } else {
                setActiveTab(tab as TabId);
              }
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
                  if (tab.id === 'progress') setProgressInitialTab('overview');
                  setActiveTab(tab.id);
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
          if (tab === 'prs') {
            setProgressInitialTab('prs');
            setActiveTab('progress');
          } else {
            setActiveTab(tab as TabId);
          }
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
