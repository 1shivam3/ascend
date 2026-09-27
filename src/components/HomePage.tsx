import React, { useMemo } from 'react';
import { Trophy, Dumbbell, UtensilsCrossed, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { getDailyQuote } from '@/lib/quotes';
import { getLiftLevel, getOverallLevel } from '@/lib/strength-standards';

interface HomePageProps {
  onNavigate: (tab: string) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { profile, prs } = useStore();
  const quote = getDailyQuote();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const { topLifts, overallLevel } = useMemo(() => {
    if (!profile?.bodyweightKg || !profile?.gender || !prs?.length) {
      return { topLifts: [], overallLevel: null };
    }

    const prsByExercise = new Map();
    for (const pr of prs) {
      const existing = prsByExercise.get(pr.exercise);
      if (!existing || pr.oneRepMax > existing.oneRepMax) {
        prsByExercise.set(pr.exercise, pr);
      }
    }

    const lifts = Array.from(prsByExercise.values()).map(pr => {
      const levelInfo = getLiftLevel(
        pr.exercise,
        pr.oneRepMax,
        profile.bodyweightKg,
        profile.gender
      );
      return {
        ...pr,
        levelInfo
      };
    });

    lifts.sort((a, b) => (b.levelInfo?.level || 0) - (a.levelInfo?.level || 0));
    
    // Pass the calculated lift levels to getOverallLevel
    const top = lifts.slice(0, 5);
    const overall = getOverallLevel(lifts.map(l => l.levelInfo));

    return { topLifts: top, overallLevel: overall };
  }, [prs, profile]);

  const displayWeight = (weightKg: number) => {
    if (profile?.unit === 'lbs') {
      return `${Math.round(weightKg * 2.20462)} lbs`;
    }
    return `${Math.round(weightKg)} kg`;
  };

  return (
    <div className="page animate-fade-in space-y-6 pb-20">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-text-primary">
          Hey, {profile?.name || 'Athlete'}
        </h1>
        <p className="text-sm text-text-muted">{today}</p>
      </header>

      {/* Quote of the Day */}
      <section className="card border-l-2 border-accent p-4">
        <p className="italic text-text-secondary mb-2">&quot;{quote.text}&quot;</p>
        <p className="text-sm text-text-muted text-right">— {quote.author}</p>
      </section>

      {/* Overall Level */}
      <section>
        {prs && prs.length > 0 && overallLevel ? (
          <div className="card p-4 space-y-3">
            <div className="flex justify-between items-end mb-2">
              <h2 className="section-title mb-0">OVERALL LEVEL</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-accent">{overallLevel.level}</span>
                <span className="text-sm font-medium text-text-secondary">{overallLevel.title}</span>
              </div>
            </div>
            
            <div className="level-bar">
              <div 
                className="level-bar-fill" 
                style={{ width: `${Math.min(100, Math.max(0, overallLevel.level || 0))}%` }} 
              />
            </div>
          </div>
        ) : (
          <div className="card p-4 border border-border/50 text-center">
            <p className="text-sm text-text-muted">Set your first PR to see your level</p>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-3 gap-3">
        <button 
          onClick={() => onNavigate('prs')}
          className="card p-3 flex flex-col items-center gap-2 border border-accent/20 hover:border-accent/40 transition-colors bg-surface/50"
        >
          <Trophy className="w-5 h-5 text-accent" />
          <span className="text-xs font-medium text-text-primary text-center">Set New PR</span>
        </button>
        <button 
          onClick={() => onNavigate('workout')}
          className="card p-3 flex flex-col items-center gap-2 hover:bg-surface-highlight transition-colors"
        >
          <Dumbbell className="w-5 h-5 text-text-secondary" />
          <span className="text-xs font-medium text-text-secondary text-center">Log Workout</span>
        </button>
        <button 
          onClick={() => onNavigate('meals')}
          className="card p-3 flex flex-col items-center gap-2 hover:bg-surface-highlight transition-colors"
        >
          <UtensilsCrossed className="w-5 h-5 text-text-secondary" />
          <span className="text-xs font-medium text-text-secondary text-center">Add Meal</span>
        </button>
      </section>

      {/* Top Lifts */}
      {topLifts.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title px-1">YOUR LIFTS</h2>
          <div className="space-y-2">
            {topLifts.map((lift, idx) => (
              <div 
                key={`${lift.exercise}-${idx}`}
                onClick={() => onNavigate('prs')}
                className="card p-4 flex items-center justify-between cursor-pointer hover:border-border-hover transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-text-primary capitalize">{lift.exercise.replace(/-/g, ' ')}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-accent font-semibold px-1.5 py-0.5 rounded bg-accent/10">
                      Lv. {lift.levelInfo?.level || 0}
                    </span>
                    <span className="text-text-muted">{lift.levelInfo?.title || 'Beginner'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-text-primary">{displayWeight(lift.oneRepMax)}</span>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
