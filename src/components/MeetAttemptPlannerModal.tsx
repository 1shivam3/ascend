'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { X, Trophy, Sparkles, ChevronRight, Dumbbell, Award, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import { calculateDOTS } from '@/lib/dots';
import { calculatePlates } from '@/lib/plate-calculator';

interface MeetAttemptPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MeetAttemptPlannerModal({ isOpen, onClose }: MeetAttemptPlannerModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { profile, prs } = useStore();
  const userUnit = profile?.unit || 'kg';

  // PR oneRepMax values are canonical KG, but everything in this modal is
  // displayed and edited in the user's unit. Seeding kg numbers under an
  // "lbs" label (and feeding the mixed total to DOTS) produced attempts
  // that were wrong by 2.2× for lbs users.
  const toUserUnit = (kg: number) =>
    userUnit === 'lbs' ? Math.round(kg * 2.20462 * 10) / 10 : kg;

  // Find user's best 1RMs for Squat, Bench, Deadlift
  const defaultSquat = useMemo(() => {
    const match = prs.filter((p) => p.exercise.toLowerCase().includes('squat'));
    return match.length > 0 ? toUserUnit(Math.max(...match.map((p) => p.oneRepMax))) : userUnit === 'lbs' ? 315 : 140;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prs, userUnit]);

  const defaultBench = useMemo(() => {
    const match = prs.filter((p) => p.exercise.toLowerCase().includes('bench'));
    return match.length > 0 ? toUserUnit(Math.max(...match.map((p) => p.oneRepMax))) : userUnit === 'lbs' ? 225 : 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prs, userUnit]);

  const defaultDeadlift = useMemo(() => {
    const match = prs.filter((p) => p.exercise.toLowerCase().includes('deadlift'));
    return match.length > 0 ? toUserUnit(Math.max(...match.map((p) => p.oneRepMax))) : userUnit === 'lbs' ? 405 : 180;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prs, userUnit]);

  const [squatMax, setSquatMax] = useState<number>(defaultSquat);
  const [benchMax, setBenchMax] = useState<number>(defaultBench);
  const [deadliftMax, setDeadliftMax] = useState<number>(defaultDeadlift);
  const [thirdAttemptPercent, setThirdAttemptPercent] = useState<number>(100);

  // Plate-loadable steps differ by unit: 2.5 kg vs 5 lb.
  const stepSize = userUnit === 'lbs' ? 5 : 2.5;
  const roundToStep = (num: number) => Math.round(num / stepSize) * stepSize;

  const plan = useMemo(() => {
    const calculateAttempts = (projectedMax: number) => {
      const opener = roundToStep(projectedMax * 0.90);
      const second = roundToStep(projectedMax * 0.95);
      const third = roundToStep(projectedMax * (thirdAttemptPercent / 100));
      return { opener, second, third };
    };

    const squat = calculateAttempts(squatMax);
    const bench = calculateAttempts(benchMax);
    const deadlift = calculateAttempts(deadliftMax);

    const projectedTotal = squat.third + bench.third + deadlift.third;
    const bodyweightKg = profile?.bodyweightKg || 75;
    const gender = profile?.gender || 'male';
    // DOTS is defined on kilograms — convert the user-unit total back.
    const projectedTotalKg = userUnit === 'lbs' ? projectedTotal * 0.453592 : projectedTotal;
    const projectedDots = calculateDOTS(bodyweightKg, projectedTotalKg, gender);

    return {
      squat,
      bench,
      deadlift,
      projectedTotal,
      projectedDots,
    };
  }, [squatMax, benchMax, deadliftMax, thirdAttemptPercent, profile]);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-bg-card z-10">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-extrabold text-text-primary text-base">Powerlifting Meet Attempt Planner</h3>
              <p className="text-3xs text-text-muted font-mono">Calibrated 90% • 95% • {thirdAttemptPercent}% Game Plan</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Strategy Tip */}
          <div className="card p-3 bg-accent/10 border border-accent/25 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
              <Sparkles className="w-3.5 h-3.5" />
              <span>THE 9-FOR-9 MEET STRATEGY</span>
            </div>
            <p className="text-2xs text-text-secondary leading-relaxed">
              • <strong>1st Attempt (90%)</strong>: An effortless triple. Guarantees a total on the board.<br />
              • <strong>2nd Attempt (95%)</strong>: Smooth build-up that sets up your competition PR.<br />
              • <strong>3rd Attempt ({thirdAttemptPercent}%)</strong>: Your peak target or match-day PR attempt.
            </p>
          </div>

          {/* Third Attempt Aggression Selector */}
          <div className="flex items-center justify-between px-1">
            <span className="text-2xs font-mono text-text-muted">3RD ATTEMPT STRATEGY:</span>
            <div className="flex gap-1.5">
              {[100, 102.5].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setThirdAttemptPercent(pct)}
                  className={`px-2.5 py-1 rounded-lg text-2xs font-mono font-bold transition-all border ${
                    thirdAttemptPercent === pct
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-muted border-border hover:text-text-primary'
                  }`}
                >
                  {pct === 100 ? 'Conservative (100%)' : 'Aggressive PR (102.5%)'}
                </button>
              ))}
            </div>
          </div>

          {/* Squat Plan Card */}
          <div className="card p-3.5 bg-bg-card border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black font-mono text-accent">1. SQUAT</span>
              <div className="flex items-center gap-1.5 text-2xs">
                <span className="text-text-muted">Max:</span>
                <input
                  type="number"
                  step={stepSize}
                  value={squatMax}
                  onChange={(e) => setSquatMax(Math.max(20, Number(e.target.value)))}
                  className="w-16 bg-bg-secondary border border-border rounded-lg px-2 py-1 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
                />
                <span className="font-mono text-text-muted">{userUnit}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-bg-secondary border border-border">
                <span className="text-3xs font-mono text-text-muted block">OPENER (90%)</span>
                <span className="text-sm font-black font-mono text-text-primary block mt-0.5">
                  {plan.squat.opener} {userUnit}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-bg-secondary border border-border">
                <span className="text-3xs font-mono text-text-muted block">2ND (95%)</span>
                <span className="text-sm font-black font-mono text-text-primary block mt-0.5">
                  {plan.squat.second} {userUnit}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-accent/15 border border-accent/30">
                <span className="text-3xs font-mono text-accent font-bold block">3RD ({thirdAttemptPercent}%)</span>
                <span className="text-sm font-black font-mono text-accent block mt-0.5">
                  {plan.squat.third} {userUnit}
                </span>
              </div>
            </div>
          </div>

          {/* Bench Plan Card */}
          <div className="card p-3.5 bg-bg-card border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black font-mono text-[#38BDF8]">2. BENCH PRESS</span>
              <div className="flex items-center gap-1.5 text-2xs">
                <span className="text-text-muted">Max:</span>
                <input
                  type="number"
                  step={stepSize}
                  value={benchMax}
                  onChange={(e) => setBenchMax(Math.max(20, Number(e.target.value)))}
                  className="w-16 bg-bg-secondary border border-border rounded-lg px-2 py-1 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
                />
                <span className="font-mono text-text-muted">{userUnit}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-bg-secondary border border-border">
                <span className="text-3xs font-mono text-text-muted block">OPENER (90%)</span>
                <span className="text-sm font-black font-mono text-text-primary block mt-0.5">
                  {plan.bench.opener} {userUnit}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-bg-secondary border border-border">
                <span className="text-3xs font-mono text-text-muted block">2ND (95%)</span>
                <span className="text-sm font-black font-mono text-text-primary block mt-0.5">
                  {plan.bench.second} {userUnit}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/30">
                <span className="text-3xs font-mono text-[#38BDF8] font-bold block">3RD ({thirdAttemptPercent}%)</span>
                <span className="text-sm font-black font-mono text-[#38BDF8] block mt-0.5">
                  {plan.bench.third} {userUnit}
                </span>
              </div>
            </div>
          </div>

          {/* Deadlift Plan Card */}
          <div className="card p-3.5 bg-bg-card border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black font-mono text-[#22C55E]">3. DEADLIFT</span>
              <div className="flex items-center gap-1.5 text-2xs">
                <span className="text-text-muted">Max:</span>
                <input
                  type="number"
                  step={stepSize}
                  value={deadliftMax}
                  onChange={(e) => setDeadliftMax(Math.max(20, Number(e.target.value)))}
                  className="w-16 bg-bg-secondary border border-border rounded-lg px-2 py-1 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
                />
                <span className="font-mono text-text-muted">{userUnit}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-bg-secondary border border-border">
                <span className="text-3xs font-mono text-text-muted block">OPENER (90%)</span>
                <span className="text-sm font-black font-mono text-text-primary block mt-0.5">
                  {plan.deadlift.opener} {userUnit}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-bg-secondary border border-border">
                <span className="text-3xs font-mono text-text-muted block">2ND (95%)</span>
                <span className="text-sm font-black font-mono text-text-primary block mt-0.5">
                  {plan.deadlift.second} {userUnit}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30">
                <span className="text-3xs font-mono text-[#22C55E] font-bold block">3RD ({thirdAttemptPercent}%)</span>
                <span className="text-sm font-black font-mono text-[#22C55E] block mt-0.5">
                  {plan.deadlift.third} {userUnit}
                </span>
              </div>
            </div>
          </div>

          {/* Projected Total & DOTS Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-accent/20 via-bg-card to-accent/10 border border-accent/40 flex items-center justify-between">
            <div>
              <span className="text-3xs font-mono uppercase font-bold text-accent block">
                PROJECTED COMPETITION TOTAL
              </span>
              <span className="text-2xl font-black font-mono text-text-primary mt-0.5 block">
                {plan.projectedTotal} {userUnit}
              </span>
            </div>
            <div className="text-right">
              <span className="text-3xs font-mono uppercase font-bold text-text-muted block">
                PROJECTED DOTS
              </span>
              <span className="text-2xl font-black font-mono text-accent mt-0.5 block">
                {plan.projectedDots}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-primary w-full py-2.5 text-xs font-bold shadow-md shadow-accent/25"
          >
            Close Planner
          </button>
        </div>
      </div>
    </div>
  );
}
