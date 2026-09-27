'use client';

import React, { useMemo, useState } from 'react';
import { Trophy, Dumbbell, UtensilsCrossed, ChevronRight, Settings } from 'lucide-react';
import { useStore } from '@/lib/store';
import { getDailyQuote } from '@/lib/quotes';
import { getLiftLevel, getOverallLevel } from '@/lib/strength-standards';
import ThemeToggle from '@/components/ui/ThemeToggle';
import RankBadge from '@/components/ui/RankBadge';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import DOTSCard from '@/components/DOTSCard';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import SettingsModal from '@/components/SettingsModal';
import CircularProgress from '@/components/ui/CircularProgress';
import { getBigThreeStats } from '@/lib/dots';

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

  const bigThreeStats = useMemo(() => getBigThreeStats(prs || []), [prs]);

  const displayWeight = (weightKg: number) => {
    if (profile?.unit === 'lbs') {
      return `${Math.round(weightKg * 2.20462)} lbs`;
    }
    return `${Math.round(weightKg)} kg`;
  };

  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  return (
    <div className="page animate-fade-in space-y-4">
      {/* Header */}
      <header className="flex justify-between items-center pt-1">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">
            ASCEND
          </h1>
          <p className="text-xs text-text-muted font-mono">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlateModalOpen(true)}
            className="btn-circle"
            title="Barbell Plate Calculator"
          >
            <Dumbbell className="w-4 h-4 text-accent" />
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="btn-circle"
            title="Settings & Data Vault"
          >
            <Settings className="w-4 h-4" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* 2-Column Hero Grid (Matching Reference Images 2 & 4) */}
      <section className="grid grid-cols-2 gap-3">
        {/* Left Card: Overall Strength Level with Circular Progress Ring */}
        <div
          onClick={() => onNavigate('prs')}
          className="card p-4 flex flex-col justify-between cursor-pointer hover:border-accent/40 transition-all select-none"
        >
          <div className="flex items-center justify-between">
            <CircularProgress
              value={overallLevel?.level || 0}
              size={52}
              strokeWidth={4.5}
              progressColor="var(--accent)"
            >
              <span className="text-xs font-bold text-text-primary">
                {overallLevel ? overallLevel.level : 0}
              </span>
            </CircularProgress>
            <RankBadge
              rank={
                !overallLevel
                  ? 'FOUNDATION'
                  : overallLevel.level <= 15
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

          <div className="mt-3">
            <h3 className="font-bold text-sm text-text-primary font-mono tracking-tight leading-tight">
              {overallLevel ? overallLevel.title : 'INITIATE'}
            </h3>
            <p className="text-2xs text-text-muted font-mono mt-0.5">Overall Strength</p>
          </div>
        </div>

        {/* Right Card: Body Weight & Ratio */}
        <div className="card p-4 flex flex-col justify-between select-none">
          <div className="flex items-center justify-between">
            <span className="section-title mb-0">BODY WEIGHT</span>
            <span className="text-xs text-accent font-mono font-semibold">
              {profile?.gender === 'female' ? '♀' : '♂'}
            </span>
          </div>

          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-text-primary font-mono tracking-tight">
                {profile?.unit === 'lbs'
                  ? Math.round((profile?.bodyweightKg || 75) * 2.20462)
                  : Math.round(profile?.bodyweightKg || 75)}
              </span>
              <span className="text-xs font-mono text-text-muted">
                {profile?.unit || 'kg'}
              </span>
            </div>
            <p className="text-2xs text-text-muted font-mono mt-0.5">
              {overallLevel ? `${overallLevel.averageRatio}x BW ratio` : 'Calibrated'}
            </p>
          </div>
        </div>
      </section>

      {/* Split Stat Banner (Matching Reference Images 2 & 4) */}
      <section className="card p-4 flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-text-primary block">
            Big 3 Powerlifting Total
          </span>
          <span className="text-2xs text-text-muted font-mono">Best Squat + Bench + Deadlift</span>
        </div>
        <div className="text-right font-mono border-l border-border/80 pl-4">
          <span className="text-2xl font-black text-text-primary block">
            {bigThreeStats.totalKg > 0 ? bigThreeStats.totalKg : '—'}{' '}
            <span className="text-xs font-normal text-text-muted">kg</span>
          </span>
        </div>
      </section>

      {/* Official Powerlifting DOTS Score */}
      <DOTSCard onNavigate={onNavigate} />

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
                className="card p-3.5 flex items-center justify-between cursor-pointer hover:border-accent/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CircularProgress
                    value={Math.min(100, Math.max(8, lift.levelInfo?.level || 0))}
                    size={42}
                    strokeWidth={3.5}
                    progressColor="var(--accent)"
                  >
                    <span className="text-[11px] font-bold text-text-primary">
                      {idx + 1}
                    </span>
                  </CircularProgress>
                  <div>
                    <span className="font-semibold text-sm text-text-primary capitalize block leading-tight">
                      {lift.exercise}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-2xs font-mono font-bold text-accent">
                        LV.{lift.levelInfo?.level || 0}
                      </span>
                      <RankBadge rank={lift.levelInfo?.rank || 'FOUNDATION'} size="sm" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-text-primary text-base">
                    {displayWeight(lift.oneRepMax)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Barbell Plate Loading Calculator Modal */}
      <PlateCalculatorModal
        isOpen={isPlateModalOpen}
        onClose={() => setIsPlateModalOpen(false)}
        initialUnit={profile?.unit || 'kg'}
      />

      {/* Local Vault Backup & PWA Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
}
