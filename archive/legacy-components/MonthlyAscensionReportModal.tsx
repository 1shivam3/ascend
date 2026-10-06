'use client';

import React, { useState } from 'react';
import {
  X,
  Trophy,
  Dumbbell,
  Droplet,
  Sparkles,
  Share2,
  Copy,
  Check,
  TrendingUp,
  Flame,
  Award,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  calculateHydrationTarget,
  getMonthlyAscensionReport,
} from '@/lib/habits';

interface MonthlyAscensionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MonthlyAscensionReportModal({
  isOpen,
  onClose,
}: MonthlyAscensionReportModalProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const prs = useStore((state) => state.prs);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const hydrationConfig = useStore((state) => state.hydrationConfig);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  const report = getMonthlyAscensionReport({
    year,
    month,
    workouts,
    prs,
    waterLogs,
    waterTargetMl,
    creatineLogs,
  });

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.shareableSummary);
      setCopied(true);
      toast.success('Monthly Progress Report copied to clipboard!', 'Copied');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Unable to copy to clipboard', 'Error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-accent">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-text-primary leading-tight font-sans">
                {report.monthName.toUpperCase()} PROGRESS
              </h2>
              <p className="text-xs text-text-muted">Monthly Progress &amp; Consistency</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hero Metrics 6-Grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* Workouts */}
          <div className="p-3 rounded-xl bg-bg-secondary border border-border text-center">
            <Dumbbell className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <span className="text-[10px] text-text-muted font-bold block uppercase">Workouts</span>
            <span className="text-lg font-black text-text-primary">{report.totalWorkouts}</span>
          </div>

          {/* PRs */}
          <div className="p-3 rounded-xl bg-bg-secondary border border-border text-center">
            <Trophy className="w-4 h-4 text-accent mx-auto mb-1" />
            <span className="text-[10px] text-text-muted font-bold block uppercase">PRs Set</span>
            <span className="text-lg font-black text-accent">{report.prsBrokenCount}</span>
          </div>

          {/* Volume */}
          <div className="p-3 rounded-xl bg-bg-secondary border border-border text-center">
            <TrendingUp className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
            <span className="text-[10px] text-text-muted font-bold block uppercase">Volume</span>
            <span className="text-lg font-black text-text-primary">
              {report.totalVolumeTonnes}
              <span className="text-[10px] font-normal text-text-muted ml-0.5">T</span>
            </span>
          </div>

          {/* Water Goal */}
          <div className="p-3 rounded-xl bg-bg-secondary border border-border text-center">
            <Droplet className="w-4 h-4 text-sky-500 mx-auto mb-1" />
            <span className="text-[10px] text-text-muted font-bold block uppercase">Water Goal</span>
            <span className="text-lg font-black text-sky-600">{report.waterGoalPct}%</span>
          </div>

          {/* Creatine */}
          <div className="p-3 rounded-xl bg-bg-secondary border border-border text-center">
            <Sparkles className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <span className="text-[10px] text-text-muted font-bold block uppercase">Creatine</span>
            <span className="text-sm font-black text-text-primary mt-1 block">
              {report.creatineAdherenceStr}
            </span>
          </div>

          {/* Streak */}
          <div className="p-3 rounded-xl bg-bg-secondary border border-border text-center">
            <Flame className="w-4 h-4 text-red-500 mx-auto mb-1" />
            <span className="text-[10px] text-text-muted font-bold block uppercase">Streak</span>
            <span className="text-lg font-black text-red-500">{report.bestStreakDays}d</span>
          </div>
        </div>

        {/* Lift Progression Section */}
        {report.strongerLifts.length > 0 && (
          <div className="card p-3.5 bg-bg-card border border-border space-y-2">
            <span className="section-title text-[10px] block mb-0">STRONGER THIS MONTH</span>
            <div className="space-y-1.5 pt-1">
              {report.strongerLifts.map((l) => (
                <div
                  key={l.exercise}
                  className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary text-xs"
                >
                  <span className="font-semibold text-text-primary capitalize">{l.exercise}</span>
                  <span className="font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
                    +{l.deltaKg} kg e1RM
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shareable Card Box */}
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-dashed border-border/80 space-y-2 font-mono text-xs">
          <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block">
            PREVIEW SHARE CARD
          </span>
          <pre className="text-text-secondary whitespace-pre-wrap text-[11px] leading-relaxed select-all">
            {report.shareableSummary}
          </pre>
        </div>

        {/* Copy / Share CTA */}
        <button
          type="button"
          onClick={handleCopy}
          className="btn-primary w-full py-3 text-xs font-bold shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>COPIED TO CLIPBOARD!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>COPY SHAREABLE REPORT</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
