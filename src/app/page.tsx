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

const tabs = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'workout', label: 'Workout', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'meals', label: 'Nutrition', icon: UtensilsCrossed },
] as const;

type TabId = (typeof tabs)[number]['id'] | 'prs';

export default function AppPage() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [progressInitialTab, setProgressInitialTab] = useState<'overview' | 'strength' | 'prs' | 'bodyweight' | 'training'>('overview');
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const { profile, theme, _hasHydrated, activeWorkoutDraft } = useStore();

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

  if (!_hasHydrated) {
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

      {/* Floating 5-Slot Bottom Navigation with Centered Elevated [+] Button */}
      {!activeWorkoutDraft && (
        <nav
          className="floating-pill-nav"
          aria-label="Bottom Navigation"
        >
          {/* Slot 1: Home */}
          {(() => {
            const tab = tabs[0];
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pill-nav-item transition-all ${
                  isActive
                    ? 'active text-accent bg-accent/10 font-bold'
                    : 'text-text-muted hover:text-text-primary font-medium'
                }`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <span className={`text-[10px] mt-0.5 tracking-tight ${isActive ? 'text-accent font-bold' : 'text-text-muted'}`}>
                  {tab.label}
                </span>
                {isActive && <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />}
              </button>
            );
          })()}

          {/* Slot 2: Workout */}
          {(() => {
            const tab = tabs[1];
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pill-nav-item transition-all ${
                  isActive
                    ? 'active text-accent bg-accent/10 font-bold'
                    : 'text-text-muted hover:text-text-primary font-medium'
                }`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <span className={`text-[10px] mt-0.5 tracking-tight ${isActive ? 'text-accent font-bold' : 'text-text-muted'}`}>
                  {tab.label}
                </span>
                {isActive && <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />}
              </button>
            );
          })()}

          {/* Slot 3: Prominent Centered Elevated [+] Action Button */}
          <button
            type="button"
            onClick={() => setIsQuickActionOpen(true)}
            className="w-11 h-11 -mt-3 rounded-full bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/35 hover:scale-105 active:scale-90 transition-all border-2 border-bg-card shrink-0"
            title="Quick Action"
            aria-label="Quick Action"
          >
            <Plus size={22} strokeWidth={2.8} />
          </button>

          {/* Slot 4: Progress */}
          {(() => {
            const tab = tabs[2];
            const Icon = tab.icon;
            const isActive = activeTab === tab.id || activeTab === 'prs';
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setProgressInitialTab('overview');
                  setActiveTab(tab.id);
                }}
                className={`pill-nav-item transition-all ${
                  isActive
                    ? 'active text-accent bg-accent/10 font-bold'
                    : 'text-text-muted hover:text-text-primary font-medium'
                }`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <span className={`text-[10px] mt-0.5 tracking-tight ${isActive ? 'text-accent font-bold' : 'text-text-muted'}`}>
                  {tab.label}
                </span>
                {isActive && <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />}
              </button>
            );
          })()}

          {/* Slot 5: Nutrition */}
          {(() => {
            const tab = tabs[3];
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pill-nav-item transition-all ${
                  isActive
                    ? 'active text-accent bg-accent/10 font-bold'
                    : 'text-text-muted hover:text-text-primary font-medium'
                }`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <span className={`text-[10px] mt-0.5 tracking-tight ${isActive ? 'text-accent font-bold' : 'text-text-muted'}`}>
                  {tab.label}
                </span>
                {isActive && <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />}
              </button>
            );
          })()}
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
    </div>
  );
}
