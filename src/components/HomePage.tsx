'use client';

import React, { useMemo } from 'react';
import { Trophy, Dumbbell, UtensilsCrossed, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { getDailyQuote } from '@/lib/quotes';
import { getLiftLevel, getOverallLevel } from '@/lib/strength-standards';
import ThemeToggle from '@/components/ui/ThemeToggle';
import RankBadge from '@/components/ui/RankBadge';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';

interface HomePageProps {
  onNavigate: (tab: 'home' | 'prs' | 'workout' | 'meals') => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { profile, prs } = useStore();
  const quote = getDailyQuote();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
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

    const lifts = Array.from(prsByExercise.values()).map((pr) => {
      const levelInfo = getLiftLevel(
        pr.exercise,
        pr.oneRepMax,
        profile.bodyweightKg,
        profile.gender
      );
      return {
        ...pr,
        levelInfo,
      };
    });

    lifts.sort((a, b) => (b.levelInfo?.level || 0) - (a.levelInfo?.level || 0));

    const top = lifts.slice(0, 5);
    const overall = getOverallLevel(lifts.map((l) => l.levelInfo));

    return { topLifts: top, overallLevel: overall };
  }, [prs, profile]);

  const displayWeight = (weightKg: number) => {
    if (profile?.unit === 'lbs') {
      return `${Math.round(weightKg * 2.20462)} lbs`;
    }
    return `${Math.round(weightKg)} kg`;
  };

  return (
    <div className="page animate-fade-in space-y-5">
      {/* Header */}
      <header className="flex justify-between items-center pt-1">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">
            Hey, {profile?.name || 'Athlete'}
          </h1>
          <p className="text-xs text-text-muted font-mono">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Quote of the Day */}
      <section className="card border-l-2 border-accent p-4 bg-gradient-to-r from-bg-card to-bg-secondary/40">
        <p className="italic text-text-secondary text-sm leading-relaxed mb-2 font-serif">
          &quot;{quote.text}&quot;
        </p>
        <p className="text-xs text-text-muted text-right font-mono tracking-wide">
          — {quote.author}
        </p>
      </section>

      {/* Overall Level */}
      <section>
        {prs && prs.length > 0 && overallLevel ? (
          <div className="card space-y-3 bg-gradient-to-br from-bg-card via-bg-card to-bg-secondary border border-border">
            <div className="flex justify-between items-start">
              <div>
                <span className="section-title">OVERALL STRENGTH</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-accent font-mono">
                    LV.{overallLevel.level}
                  </span>
                  <span className="text-base font-bold text-text-primary font-mono tracking-wide">
                    {overallLevel.title}
                  </span>
                </div>
              </div>

              <div className="flex items-center">
                <RankBadge
                  rank={
                    overallLevel.level <= 15
                      ? 'FOUNDATION'
                      : overallLevel.level <= 30
                      ? 'TRAINED'
                      : overallLevel.level <= 45
                      ? 'SKILLED'
                      : overallLevel.level <= 65
                      ? 'ADVANCED'
                      : overallLevel.level <= 80
                      ? 'ELITE'
                      : overallLevel.level <= 95
                      ? 'MASTER'
                      : 'GRANDMASTER'
                  }
                  size="sm"
                />
              </div>
            </div>

            <div className="level-bar">
              <div
                className="level-bar-fill"
                style={{ width: `${Math.min(100, Math.max(2, overallLevel.level || 0))}%` }}
              />
            </div>

            <div className="flex justify-between text-2xs text-text-muted font-mono">
              <span>{topLifts.length} Core Lifts Evaluated</span>
              <span>Ratio: {overallLevel.averageRatio}x BW</span>
            </div>
          </div>
        ) : (
          <div className="card p-5 border border-border/70 text-center space-y-2">
            <p className="text-sm font-medium text-text-secondary">
              No lifts recorded yet
            </p>
            <p className="text-xs text-text-muted">
              Add your first PR to unlock your calibrated strength level and title.
            </p>
            <button
              onClick={() => onNavigate('prs')}
              className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
            >
              <Trophy size={14} />
              Set First PR
            </button>
          </div>
        )}
      </section>

      {/* Quick Action CTA Cards */}
      <section className="grid grid-cols-3 gap-2.5">
        <button
          onClick={() => onNavigate('prs')}
          className="card p-3 flex flex-col items-center justify-center gap-1.5 border border-accent/30 hover:border-accent/60 bg-accent/5 hover:bg-accent/10 transition-all text-center min-h-[76px]"
        >
          <Trophy className="w-5 h-5 text-accent" />
          <span className="text-xs font-semibold text-text-primary">New PR</span>
        </button>
        <button
          onClick={() => onNavigate('workout')}
          className="card p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-bg-elevated transition-all text-center min-h-[76px]"
        >
          <Dumbbell className="w-5 h-5 text-text-secondary" />
          <span className="text-xs font-medium text-text-secondary">Log Lift</span>
        </button>
        <button
          onClick={() => onNavigate('meals')}
          className="card p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-bg-elevated transition-all text-center min-h-[76px]"
        >
          <UtensilsCrossed className="w-5 h-5 text-text-secondary" />
          <span className="text-xs font-medium text-text-secondary">Add Meal</span>
        </button>
      </section>

      {/* Monthly Gym Activity Calendar */}
      <WorkoutHeatmap onNavigate={onNavigate} />

      {/* Top Lifts Showcase */}
      {topLifts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">TOP LIFTS</h2>
            <button
              onClick={() => onNavigate('prs')}
              className="text-2xs font-mono text-accent hover:underline flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight size={12} />
            </button>
          </div>

          <div className="space-y-2.5">
            {topLifts.map((lift, idx) => (
              <div
                key={`${lift.exercise}-${idx}`}
                onClick={() => onNavigate('prs')}
                className="card p-3.5 flex items-center justify-between cursor-pointer hover:border-border-hover transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-sm text-text-primary capitalize">
                    {lift.exercise}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-mono font-bold text-accent">
                      LV.{lift.levelInfo?.level || 0}
                    </span>
                    <RankBadge rank={lift.levelInfo?.rank || 'FOUNDATION'} size="sm" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-text-primary text-sm">
                    {displayWeight(lift.oneRepMax)}
                  </span>
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
