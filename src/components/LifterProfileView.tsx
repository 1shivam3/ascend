"use client";

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { LifterTwinProfile, LifterExerciseProfile, TrainingDecision } from '@/lib/types';
import { generateLifterTwinProfile } from '@/lib/lifter-twin';
import TrainingDecisionCard from './TrainingDecisionCard';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Dumbbell,
  Sparkles,
  Clock,
  Flame,
  Zap,
  Check,
  CheckCircle2,
  RotateCcw,
  Info,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface LifterProfileViewProps {
  onStartWorkoutForExercise?: (exerciseName: string) => void;
}

export default function LifterProfileView({ onStartWorkoutForExercise }: LifterProfileViewProps) {
  const workouts = useStore((state) => state.workouts || []);
  const profile = useStore((state) => state.profile);
  const userUnit = profile?.unit || 'kg';
  const lifterProfileFromStore = useStore((state) => state.lifterProfile);
  const refreshLifterProfile = useStore((state) => state.refreshLifterProfile);
  const decisionsLedgerHistory = useStore((state) => state.decisionsLedgerHistory || []);
  const trainingDecisions = useStore((state) => state.trainingDecisions || {});

  const [activeSubTab, setActiveSubTab] = useState<'fingerprint' | 'ledger'>('fingerprint');

  // Derive lifter profile dynamically or use cached store profile
  const lifterProfile: LifterTwinProfile = useMemo(() => {
    if (lifterProfileFromStore && lifterProfileFromStore.totalAnalyzedExposures > 0) {
      return lifterProfileFromStore;
    }
    return generateLifterTwinProfile(workouts, userUnit);
  }, [lifterProfileFromStore, workouts, userUnit]);

  const exerciseEntries = useMemo(() => {
    return Object.values(lifterProfile.exercises || {}).sort((a, b) => b.evidenceCount - a.evidenceCount);
  }, [lifterProfile]);

  const allDecisions = useMemo(() => {
    const list: TrainingDecision[] = [...decisionsLedgerHistory];
    // Add any active pending decisions not already in history
    Object.values(trainingDecisions).forEach((td) => {
      if (!list.some((item) => item.id === td.id)) {
        list.unshift(td);
      }
    });
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [decisionsLedgerHistory, trainingDecisions]);

  const lifterName = profile?.name ? profile.name.trim().toUpperCase() : 'ATHLETE';

  return (
    <div className="space-y-4 animate-fade-in font-sans">
      {/* ── 1. Top Lifter Twin Header & Longitudinal Badge ─────────────────── */}
      <div className="card p-4 sm:p-5 bg-gradient-to-br from-bg-card via-bg-card to-accent/10 border border-accent/30 space-y-3 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-3xs font-mono font-bold uppercase tracking-wider bg-accent/20 text-accent border border-accent/40">
                <Activity className="w-3 h-3 animate-pulse" />
                ASCEND LIFTER TWIN
              </span>
              <span className="text-3xs text-text-muted font-mono">
                Longitudinal Response Engine
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-text-primary tracking-tight font-mono">
              {lifterName} — TRAINING RESPONSE
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
              Learns how your physiology specifically responds to volume, load, and fatigue—and continuously audits why prescriptions change.
            </p>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-border/60 pt-2 sm:pt-0">
            <div className="text-right">
              <span className="text-2xl font-black text-accent font-mono tabular-nums block">
                {lifterProfile.totalAnalyzedExposures}
              </span>
              <span className="text-3xs text-text-muted font-mono uppercase tracking-wider block">
                Logged Exposures Analyzed
              </span>
            </div>
          </div>
        </div>

        {/* Verification Guarantee Pill */}
        <div className="pt-2 border-t border-border/60 flex items-center justify-between text-3xs text-text-muted font-mono">
          <span className="flex items-center gap-1.5 text-accent font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            100% Grounded in Your Performance Logs • 0% Generic Assumptions
          </span>
          <button
            type="button"
            onClick={() => refreshLifterProfile()}
            className="text-text-secondary hover:text-accent flex items-center gap-1 transition-colors"
            title="Recalculate profile metrics"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Recalculate</span>
          </button>
        </div>
      </div>

      {/* ── 2. Sub-Tab Switcher (Response Fingerprint vs Decisions Ledger) ──── */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('fingerprint')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
            activeSubTab === 'fingerprint'
              ? 'bg-accent text-white shadow-xs'
              : 'bg-bg-secondary text-text-muted hover:text-text-primary'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Response Fingerprint</span>
          {exerciseEntries.length > 0 && (
            <span className="text-3xs px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
              {exerciseEntries.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('ledger')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
            activeSubTab === 'ledger'
              ? 'bg-accent text-white shadow-xs'
              : 'bg-bg-secondary text-text-muted hover:text-text-primary'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Decisions Ledger</span>
          {allDecisions.length > 0 && (
            <span className="text-3xs px-1.5 py-0.2 rounded-full bg-accent/20 text-accent font-mono">
              {allDecisions.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: RESPONSE FINGERPRINT ────────────────────────────────────── */}
      {activeSubTab === 'fingerprint' && (
        <div className="space-y-4">
          {exerciseEntries.length === 0 ? (
            <div className="card p-8 bg-bg-card border border-border text-center space-y-4 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent mx-auto flex items-center justify-center">
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-bold text-text-primary font-mono">
                  Awaiting Baseline Training Exposures
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  The Lifter Twin does not generate generic template advice. It maps your real physiological response curve once you log workouts with sets and RPE.
                </p>
              </div>

              {/* Calibration Roadmap */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left max-w-lg mx-auto pt-2">
                <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70 space-y-1">
                  <span className="text-3xs font-mono font-bold text-accent uppercase">Tier 1 • Log Sets</span>
                  <p className="text-2xs text-text-muted">Record weight, reps, and RPE for working sets.</p>
                </div>
                <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70 space-y-1">
                  <span className="text-3xs font-mono font-bold text-amber-400 uppercase">Tier 2 • 3 Sessions</span>
                  <p className="text-2xs text-text-muted">Unlocks early fatigue drift &amp; optimal recovery gap.</p>
                </div>
                <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70 space-y-1">
                  <span className="text-3xs font-mono font-bold text-emerald-400 uppercase">Tier 3 • 7+ Sessions</span>
                  <p className="text-2xs text-text-muted">Verified individual response fingerprint unlocked.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {exerciseEntries.map((item: LifterExerciseProfile) => {
                const isCalibrated = item.calibrationStatus === 'calibrated';
                const isEarlyTrend = item.calibrationStatus === 'early_trend';

                return (
                  <div
                    key={item.exerciseName}
                    className="card p-4 sm:p-5 bg-bg-card border border-border/80 space-y-3.5 shadow-xs hover:border-accent/40 transition-colors"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base sm:text-lg font-black text-text-primary font-mono tracking-tight">
                            {item.exerciseName}
                          </h3>
                          {/* Trend pill */}
                          {item.e1RMTrend === 'rising' && (
                            <span className="inline-flex items-center gap-1 text-3xs font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                              <TrendingUp className="w-3 h-3" />
                              <span>Responding Well</span>
                            </span>
                          )}
                          {item.e1RMTrend === 'plateau' && (
                            <span className="inline-flex items-center gap-1 text-3xs font-bold font-mono text-text-muted bg-bg-secondary px-2 py-0.5 rounded-md border border-border">
                              <Minus className="w-3 h-3" />
                              <span>Stable Load</span>
                            </span>
                          )}
                          {item.e1RMTrend === 'fatigued' && (
                            <span className="inline-flex items-center gap-1 text-3xs font-bold font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30">
                              <TrendingDown className="w-3 h-3" />
                              <span>Fatigue Sensitive</span>
                            </span>
                          )}
                        </div>
                        <span className="text-3xs text-text-muted font-mono">
                          Based on {item.evidenceCount} verified gym exposures
                        </span>
                      </div>

                      {/* Calibration Status Badge */}
                      <span
                        className={`text-3xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                          isCalibrated
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : isEarlyTrend
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-bg-secondary text-text-muted border-border'
                        }`}
                      >
                        {isCalibrated
                          ? 'CALIBRATED PROFILE'
                          : isEarlyTrend
                          ? 'EARLY TREND DETECTED'
                          : `CALIBRATING (${item.evidenceCount}/3)`}
                      </span>
                    </div>

                    {/* 4 Core Physiological Fingerprint Tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                      {/* Optimal Reps */}
                      <div className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-0.5">
                        <span className="text-3xs text-text-muted block font-sans">OPTIMAL REP BRACKET</span>
                        <span className="text-sm font-bold text-text-primary block">
                          {item.optimalRepRange.min}–{item.optimalRepRange.max} reps
                        </span>
                        <span className="text-3xs text-text-muted/80 block">Where e1RM peaks</span>
                      </div>

                      {/* Fatigue Sensitivity */}
                      <div className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-0.5">
                        <span className="text-3xs text-text-muted block font-sans">FATIGUE SENSITIVITY</span>
                        <span
                          className={`text-sm font-bold block ${
                            item.fatigueSensitivity === 'high'
                              ? 'text-amber-400'
                              : item.fatigueSensitivity === 'moderate'
                              ? 'text-text-primary'
                              : 'text-emerald-400'
                          }`}
                        >
                          {item.fatigueSensitivity.toUpperCase()}
                        </span>
                        <span className="text-3xs text-text-muted/80 block">
                          {item.rpeDriftPerSet >= 0 ? `+${item.rpeDriftPerSet}` : item.rpeDriftPerSet} RPE/set
                        </span>
                      </div>

                      {/* Recovery Window */}
                      <div className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-0.5">
                        <span className="text-3xs text-text-muted block font-sans">RECOVERY WINDOW</span>
                        <span className="text-sm font-bold text-text-primary block">
                          ~{item.recoveryDaysNeeded} days
                        </span>
                        <span className="text-3xs text-text-muted/80 block">Between heavy exposures</span>
                      </div>

                      {/* Frequency & Step */}
                      <div className="p-2.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-0.5">
                        <span className="text-3xs text-text-muted block font-sans">OPTIMAL FREQUENCY</span>
                        <span className="text-sm font-bold text-accent block">
                          {item.recommendedWeeklyFrequency}× / week
                        </span>
                        <span className="text-3xs text-text-muted/80 block">
                          +{item.bestProgressionStepKg} {userUnit} step
                        </span>
                      </div>
                    </div>

                    {/* Empirical Observations */}
                    <div className="pt-2 border-t border-border/60 space-y-1.5">
                      <span className="text-3xs font-mono font-bold text-text-muted uppercase tracking-wider block">
                        Grounded Empirical Observations:
                      </span>
                      <ul className="space-y-1">
                        {item.observations.map((obs, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-text-secondary flex items-start gap-2 leading-relaxed"
                          >
                            <span className="text-accent text-3xs font-bold mt-1">▸</span>
                            <span>{obs}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: TRAINING DECISIONS LEDGER (Auditable Coach) ─────────────── */}
      {activeSubTab === 'ledger' && (
        <div className="space-y-4">
          {/* Explanation Banner */}
          <div className="card p-3.5 bg-bg-secondary/50 border border-border text-xs text-text-secondary space-y-1">
            <div className="flex items-center gap-1.5 text-text-primary font-bold">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <span>Auditable Training Decisions</span>
            </div>
            <p className="leading-relaxed text-2xs text-text-muted">
              Most AI apps make secret algorithm decisions. ASCEND is accountable: every load increase, deload, or fatigue adjustment explains the exact empirical trigger, and you retain complete override authority.
            </p>
          </div>

          {allDecisions.length === 0 ? (
            <div className="card p-8 bg-bg-card border border-border text-center space-y-3 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-bg-secondary text-text-muted mx-auto flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-text-primary font-mono">
                  No Decisions Recorded Yet
                </h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  As you log workouts where set RPE drifts, targets are exceeded, or volume exceeds recovery tolerance, ASCEND will log auditable prescription decisions here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {allDecisions.map((decision) => (
                <TrainingDecisionCard
                  key={decision.id}
                  decision={decision}
                  userUnit={userUnit}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
