'use client';

import { useState, useEffect } from 'react';
import { Home, Dumbbell, Trophy, UtensilsCrossed } from 'lucide-react';
import { useStore } from '@/lib/store';
import OnboardingScreen from '@/components/Onboarding';
import HomePage from '@/components/HomePage';
import PRsPage from '@/components/PRsPage';
import WorkoutPage from '@/components/WorkoutPage';
import MealsPage from '@/components/MealsPage';

const tabs = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'prs', label: 'PRs', icon: Trophy },
  { id: 'workout', label: 'Workout', icon: Dumbbell },
  { id: 'meals', label: 'Nutrition', icon: UtensilsCrossed },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function AppPage() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const { profile, theme, _hasHydrated } = useStore();

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
    <div className="min-h-[100dvh] bg-bg-primary text-text-primary relative selection:bg-accent/30">
      <main className="w-full">
        {activeTab === 'home' && <HomePage onNavigate={(tab) => setActiveTab(tab as TabId)} />}
        {activeTab === 'prs' && <PRsPage onNavigate={(tab) => setActiveTab(tab as TabId)} />}
        {activeTab === 'workout' && <WorkoutPage onNavigate={(tab) => setActiveTab(tab as TabId)} />}
        {activeTab === 'meals' && <MealsPage onNavigate={(tab) => setActiveTab(tab as TabId)} />}
      </main>

      {/* Floating Pill Bottom Navigation */}
      <nav className="floating-pill-nav" aria-label="Bottom Navigation">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pill-nav-item ${
                isActive
                  ? 'active text-accent bg-bg-elevated/90 dark:bg-white/10 shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Icon
                size={19}
                strokeWidth={isActive ? 2.3 : 1.7}
                className={isActive ? 'text-accent' : 'text-text-muted'}
              />
              <span className="text-[10px] mt-0.5 tracking-tight font-medium">
                {tab.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-accent mt-0.5 shadow-xs" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
