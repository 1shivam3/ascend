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
  { id: 'meals', label: 'Meals', icon: UtensilsCrossed },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function AppPage() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const { profile, _hasHydrated } = useStore();

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-text-muted text-sm tracking-widest uppercase font-mono">
          ASCEND
        </div>
      </div>
    );
  }

  if (!profile) {
    return <OnboardingScreen />;
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <main>
        {activeTab === 'home' && <HomePage onNavigate={(tab) => setActiveTab(tab as TabId)} />}
        {activeTab === 'prs' && <PRsPage />}
        {activeTab === 'workout' && <WorkoutPage />}
        {activeTab === 'meals' && <MealsPage />}
      </main>

      <nav className="bottom-nav">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.5} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
