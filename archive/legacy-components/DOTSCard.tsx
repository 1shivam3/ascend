'use client';

import React, { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { calculateDOTS, getDOTSClassification, getBigThreeStats } from '@/lib/dots';
import { Trophy, Dumbbell, ShieldCheck, ChevronRight, HelpCircle } from 'lucide-react';

interface DOTSCardProps {
  onNavigate?: (tab: 'home' | 'prs' | 'meals' | 'workout') => void;
}

export default function DOTSCard({ onNavigate }: DOTSCardProps) {
  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs);

  const stats = useMemo(() => getBigThreeStats(prs), [prs]);

  const dotsScore = useMemo(() => {
    if (!profile || !profile.bodyweightKg) return 0;
    return calculateDOTS(profile.bodyweightKg, stats.totalKg, profile.gender);
  }, [profile, stats.totalKg]);

  const classification = useMemo(() => getDOTSClassification(dotsScore), [dotsScore]);

  if (!profile) return null;

  return (
    <div className="card space-y-3.5 bg-gradient-to-br from-bg-card via-bg-card to-bg-secondary border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-accent" />
          <h2 className="section-title mb-0">POWERLIFTING DOTS SCORE</h2>
        </div>

        {stats.isComplete && (
          <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-accent/15 text-accent border border-accent/30">
            {classification.badge}
          </span>
        )}
      </div>

      {stats.isComplete ? (
        <>
          {/* Main DOTS Score Display */}
          <div className="flex items-baseline justify-between pt-0.5">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-accent font-mono tracking-tight">
                  {dotsScore}
                </span>
                <span className="text-sm sm:text-base font-bold text-text-primary font-mono tracking-wide">
                  {classification.tier}
                </span>
              </div>
              <p className="text-2xs text-text-muted mt-0.5">{classification.description}</p>
            </div>

            <div className="text-right font-mono">
              <span className="text-2xs uppercase text-text-muted block">Big 3 Total</span>
              <span className="text-lg font-bold text-text-primary">
                {stats.totalKg} <span className="text-xs text-text-muted">kg</span>
              </span>
            </div>
          </div>

          {/* Big 3 Individual Lifts Breakdown */}
          <div className="grid grid-cols-3 gap-2 py-3 px-3 rounded-2xl bg-bg-secondary/60 border border-border/60 text-center font-mono text-xs">
            <div>
              <span className="text-2xs text-text-muted uppercase block">Squat</span>
              <span className="font-bold text-text-primary text-sm sm:text-base">{stats.squatMax} kg</span>
            </div>
            <div className="border-l border-border/60">
              <span className="text-2xs text-text-muted uppercase block">Bench</span>
              <span className="font-bold text-text-primary text-sm sm:text-base">{stats.benchMax} kg</span>
            </div>
            <div className="border-l border-border/60">
              <span className="text-2xs text-text-muted uppercase block">Deadlift</span>
              <span className="font-bold text-text-primary text-sm sm:text-base">{stats.deadliftMax} kg</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-2xs text-text-muted font-mono pt-0.5">
            <span>Standardized @ {profile.bodyweightKg}kg BW ({profile.gender})</span>
            <span className="text-accent">{classification.percentile}</span>
          </div>
        </>
      ) : (
        /* Incomplete Big 3 Lifts State */
        <div className="space-y-3 py-1">
          <div className="p-3.5 rounded-2xl bg-bg-secondary border border-border/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-primary flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-accent" />
                Unlock Official DOTS Score
              </span>
              <span className="text-2xs font-mono text-accent font-semibold">
                {3 - stats.missingLifts.length} / 3 Lifts
              </span>
            </div>

            <p className="text-2xs text-text-muted leading-relaxed">
              DOTS measures pound-for-pound powerlifting strength across the Big 3. Log a PR for{' '}
              <strong className="text-text-primary">{stats.missingLifts.join(' and ')}</strong> to calculate your official score.
            </p>

            <div className="flex gap-1.5 pt-1">
              {['Squat', 'Bench Press', 'Deadlift'].map((lift) => {
                const isLogged = !stats.missingLifts.includes(lift);
                return (
                  <div
                    key={lift}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-2xs font-mono text-center border ${
                      isLogged
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold'
                        : 'bg-bg-card text-text-muted border-border'
                    }`}
                  >
                    {isLogged ? `✓ ${lift}` : `+ ${lift}`}
                  </div>
                );
              })}
            </div>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('prs')}
              className="w-full py-2.5 px-4 rounded-full bg-bg-elevated border border-border hover:border-accent/50 text-text-primary font-medium text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
            >
              <span>Set Missing Lift PRs</span>
              <ChevronRight className="w-3.5 h-3.5 text-accent" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
