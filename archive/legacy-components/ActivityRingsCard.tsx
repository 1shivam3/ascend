'use client';

import React from 'react';
import { Dumbbell, UtensilsCrossed, Droplet, Sparkles } from 'lucide-react';
import { useStore } from '@/lib/store';
import { toLocalDateString, calculateHydrationTarget } from '@/lib/habits';

interface ActivityRingsCardProps {
  onNavigateWorkout?: () => void;
  onNavigateMeals?: () => void;
  onOpenHydrationModal?: () => void;
  onOpenCreatineModal?: () => void;
}

export default function ActivityRingsCard({
  onNavigateWorkout,
  onNavigateMeals,
  onOpenHydrationModal,
  onOpenCreatineModal,
}: ActivityRingsCardProps) {
  const store = useStore();
  const todayStr = toLocalDateString(new Date());

  const profile = store.profile;
  const workouts = store.workouts || [];
  const meals = store.meals || [];
  const waterLogs = store.waterLogs || {};
  const creatineLogs = store.creatineLogs || {};
  const macroGoals = store.macroGoals;
  const hydrationConfig = store.hydrationConfig;

  const bw = profile?.bodyweightKg || 75;

  // Training Status
  const hasGymLogged = !!store.gymLogs?.[todayStr];
  const hasTrainedToday = hasGymLogged || workouts.some((w) => w.date && w.date.startsWith(todayStr));
  const trainingPct = hasTrainedToday ? 100 : 0;

  // Protein Status
  const todayMeals = meals.filter((m) => m.date && m.date.startsWith(todayStr));
  const proteinToday = Math.round(
    todayMeals.reduce((acc, m) => acc + m.foods.reduce((sum, f) => sum + (f.proteinG || 0), 0), 0)
  );
  const proteinTarget = macroGoals?.proteinG || Math.round(bw * 1.8);
  const proteinPct = Math.min(100, Math.round((proteinToday / proteinTarget) * 100));

  // Water Status
  const waterToday = waterLogs[todayStr] || 0;
  const waterTarget = calculateHydrationTarget({
    bodyweightKg: bw,
    isTrainingDay: hasTrainedToday,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });
  const waterPct = Math.min(100, Math.round((waterToday / waterTarget) * 100));

  // Creatine Status
  const creatineTaken = !!creatineLogs[todayStr]?.taken;

  // SVG Ring Helper
  const radius = 24;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="card p-4 bg-bg-card border border-border shadow-xs">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-label font-bold text-text-muted">
          Today&apos;s habit rings
        </span>
        <button
          type="button"
          onClick={onOpenCreatineModal}
          className={`text-label font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 transition-all ${
            creatineTaken
              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
              : 'bg-bg-secondary text-text-muted border border-border/60 hover:border-amber-500/30'
          }`}
          title="Creatine status"
        >
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>Creatine: {creatineTaken ? 'Taken ✓' : 'Pending'}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Ring 1: Training */}
        <button
          type="button"
          onClick={onNavigateWorkout}
          className="flex flex-col items-center p-1 transition-all text-center group active:scale-95 hover:opacity-90"
        >
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
              <circle
                cx="30"
                cy="30"
                r={radius}
                className="stroke-bg-secondary"
                strokeWidth="5"
                fill="none"
              />
              <circle
                cx="30"
                cy="30"
                r={radius}
                className="stroke-accent transition-all duration-700 ease-out"
                strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (trainingPct / 100) * circumference}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-accent">
              <Dumbbell className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xs font-bold text-text-primary mt-1.5 font-sans">Training</span>
          <span className="text-2xs text-text-muted font-medium">
            {hasTrainedToday ? 'Done ✓' : 'Planned'}
          </span>
        </button>

        {/* Ring 2: Protein */}
        <button
          type="button"
          onClick={onNavigateMeals}
          className="flex flex-col items-center p-1 transition-all text-center group active:scale-95 hover:opacity-90"
        >
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
              <circle
                cx="30"
                cy="30"
                r={radius}
                className="stroke-bg-secondary"
                strokeWidth="5"
                fill="none"
              />
              <circle
                cx="30"
                cy="30"
                r={radius}
                className="stroke-emerald-500 transition-all duration-700 ease-out"
                strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (proteinPct / 100) * circumference}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-emerald-500">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xs font-bold text-text-primary mt-1.5 font-sans">Protein</span>
          <span className="text-2xs text-text-muted font-medium tabular-nums">
            {proteinToday}/{proteinTarget}g
          </span>
        </button>

        {/* Ring 3: Water */}
        <button
          type="button"
          onClick={onOpenHydrationModal}
          className="flex flex-col items-center p-1 transition-all text-center group active:scale-95 hover:opacity-90"
        >
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
              <circle
                cx="30"
                cy="30"
                r={radius}
                className="stroke-bg-secondary"
                strokeWidth="5"
                fill="none"
              />
              <circle
                cx="30"
                cy="30"
                r={radius}
                className="stroke-sky-400 transition-all duration-700 ease-out"
                strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (waterPct / 100) * circumference}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sky-400">
              <Droplet className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xs font-bold text-text-primary mt-1.5 font-sans">Water</span>
          <span className="text-2xs text-text-muted font-medium tabular-nums">
            {(waterToday / 1000).toFixed(1)}/{(waterTarget / 1000).toFixed(1)}L
          </span>
        </button>
      </div>

      {/* Compact Secondary Quick Actions */}
      <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-2 text-2xs text-text-muted">
        <span className="text-3xs font-mono font-medium">Quick Habits:</span>
        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={() => {
              store.logWater(250, todayStr);
              if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            }}
            className="px-2 py-0.5 rounded-md bg-bg-secondary hover:bg-sky-500/10 hover:text-sky-400 border border-border text-text-secondary text-3xs font-bold transition-all active:scale-95"
            title="Log 250ml water"
          >
            +250ml
          </button>
          <button
            type="button"
            onClick={() => {
              store.logWater(500, todayStr);
              if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            }}
            className="px-2 py-0.5 rounded-md bg-bg-secondary hover:bg-sky-500/10 hover:text-sky-400 border border-border text-text-secondary text-3xs font-bold transition-all active:scale-95"
            title="Log 500ml water"
          >
            +500ml
          </button>
          <button
            type="button"
            onClick={() => {
              store.toggleCreatine(todayStr);
              if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            }}
            className={`px-2 py-0.5 rounded-md border text-3xs font-bold transition-all active:scale-95 ${
              creatineTaken
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                : 'bg-bg-secondary hover:bg-amber-500/10 hover:text-amber-400 border-border text-text-secondary'
            }`}
            title="Toggle Creatine"
          >
            {creatineTaken ? 'Creatine ✓' : '+ Creatine'}
          </button>
        </div>
      </div>
    </div>
  );
}
