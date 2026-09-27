'use client';

import React, { useMemo, useState } from 'react';
import {
  Trophy,
  Dumbbell,
  UtensilsCrossed,
  ChevronRight,
  Info,
  Scale,
  HardDrive,
  X
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { getDailyQuote } from '@/lib/quotes';
import { getLiftLevel, getOverallLevel } from '@/lib/strength-standards';
import ThemeToggle from '@/components/ui/ThemeToggle';
import RankBadge from '@/components/ui/RankBadge';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import DOTSCard from '@/components/DOTSCard';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import DataVaultModal from '@/components/DataVaultModal';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import InstallAppBanner from '@/components/InstallAppBanner';
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
  const [isBodyMetricsModalOpen, setIsBodyMetricsModalOpen] = useState(false);
  const [isDataVaultModalOpen, setIsDataVaultModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [showBwRatioInfo, setShowBwRatioInfo] = useState(false);

  return (
    <div className="page animate-fade-in space-y-4">
      {/* PWA Install Banner (Top Popup menu for mobile/desktop browsers) */}
      <InstallAppBanner />

      {/* Header with Clickable Logo */}
      <header className="flex justify-between items-center pt-1">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="text-left group transition-transform active:scale-95"
          title="ASCEND - Click to scroll to top"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent group-hover:bg-accent/25 transition-colors">
              <Dumbbell className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
            </div>
            <h1 className="text-2xl font-black text-text-primary tracking-tight group-hover:text-accent transition-colors font-mono">
              ASCEND
            </h1>
          </div>
          <p className="text-xs text-text-muted font-mono mt-0.5">{today}</p>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlateModalOpen(true)}
            className="btn-circle"
            title="Barbell Plate Calculator"
          >
            <Dumbbell className="w-4 h-4 text-accent" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* 2-Column Hero Grid */}
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

        {/* Right Card: Body Weight & Ratio (Tap to update & view history) */}
        <div
          onClick={() => setIsBodyMetricsModalOpen(true)}
          className="card p-4 flex flex-col justify-between select-none cursor-pointer hover:border-accent/40 active:scale-[0.99] transition-all group"
          title="Tap to update bodyweight & height"
        >
          <div className="flex items-center justify-between">
            <span className="section-title mb-0 flex items-center gap-1 group-hover:text-accent transition-colors">
              <Scale className="w-3 h-3 text-accent" />
              BODY WEIGHT
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-accent underline opacity-80 group-hover:opacity-100">
                Edit
              </span>
              <span className="text-xs text-accent font-mono font-semibold">
                {profile?.gender === 'female' ? '♀' : '♂'}
              </span>
            </div>
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
              {profile?.heightCm && (
                <span className="text-2xs font-mono text-text-muted ml-1">
                  • {Math.round(profile.heightCm)}cm
                </span>
              )}
            </div>

            {/* Clear Strength-to-Bodyweight Ratio with Info Icon */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowBwRatioInfo(true);
              }}
              className="mt-1 flex items-center gap-1 text-2xs text-text-muted hover:text-accent font-mono transition-colors"
              title="Click to learn what Strength-to-Bodyweight Ratio means"
            >
              <span>
                {overallLevel ? `${overallLevel.averageRatio}x BW Strength` : 'Calibrated'}
              </span>
              <Info className="w-3 h-3 text-text-muted hover:text-accent flex-shrink-0" />
            </div>
          </div>
        </div>
      </section>

      {/* Prominent Daily Motivation Quote */}
      <section className="card p-3.5 border-l-4 border-l-accent bg-bg-secondary/40 shadow-xs">
        <p className="text-xs text-text-primary italic leading-relaxed font-sans">
          &ldquo;{quote.text}&rdquo;
        </p>
        <p className="text-2xs text-text-muted font-mono text-right mt-1.5 font-semibold">
          — {quote.author}
        </p>
      </section>

      {/* Split Stat Banner */}
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

      {/* Footer Utility: Local Data Backup & Vault */}
      <div className="pt-2 pb-6 flex items-center justify-between text-2xs text-text-muted font-mono border-t border-border/40">
        <button
          type="button"
          onClick={() => setIsPrivacyModalOpen(true)}
          className="text-text-muted hover:text-text-primary underline transition-colors"
        >
          Privacy &amp; Terms
        </button>
        <button
          type="button"
          onClick={() => setIsDataVaultModalOpen(true)}
          className="text-accent hover:underline flex items-center gap-1 font-semibold"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Data Backup &amp; Reset</span>
        </button>
      </div>

      {/* Barbell Plate Loading Calculator Modal */}
      <PlateCalculatorModal
        isOpen={isPlateModalOpen}
        onClose={() => setIsPlateModalOpen(false)}
        initialUnit={profile?.unit || 'kg'}
      />

      {/* Bodyweight & Height Tracking Modal */}
      <BodyMetricsModal
        isOpen={isBodyMetricsModalOpen}
        onClose={() => setIsBodyMetricsModalOpen(false)}
      />

      {/* Local Vault Backup & Safeguarded Reset Modal */}
      <DataVaultModal
        isOpen={isDataVaultModalOpen}
        onClose={() => setIsDataVaultModalOpen(false)}
      />

      {/* Privacy Policy & Legal Terms Modal */}
      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      {/* BW Ratio Info Modal / Tooltip */}
      {showBwRatioInfo && (
        <div className="modal-overlay" onClick={() => setShowBwRatioInfo(false)}>
          <div
            className="modal-content p-5 space-y-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-accent">
                <Info className="w-5 h-5" />
                <h3 className="font-bold text-base text-text-primary">
                  What is BW Ratio?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBwRatioInfo(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed font-mono">
              <p>
                <strong className="text-text-primary">BW Ratio (Bodyweight Ratio)</strong> is your{' '}
                <strong className="text-accent">pound-for-pound strength multiplier</strong>.
              </p>
              <p>
                It is calculated by dividing your 1-Rep Max by your body weight across your tracked lifts.
              </p>
              <div className="p-2.5 rounded-lg bg-bg-secondary border border-border/70 space-y-1 text-2xs">
                <p>• <strong>0.75× – 1.0×:</strong> Foundation / Trained lifter</p>
                <p>• <strong>1.0× – 1.5×:</strong> Skilled / Intermediate lifter</p>
                <p>• <strong>1.5× – 2.0×:</strong> Advanced lifter</p>
                <p>• <strong>2.0× – 2.5×+:</strong> Elite / Master power lifter</p>
              </div>
              <p className="text-2xs text-text-muted">
                As your lifts go up or your body composition leans down, this multiplier increases!
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowBwRatioInfo(false)}
              className="btn-primary w-full py-2 text-xs font-bold"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
