'use client';

import React from 'react';
import {
  CheckCircle2,
  Circle,
  Dumbbell,
  Droplet,
  Sparkles,
  UtensilsCrossed,
  Scale,
  Moon,
  Zap,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  toLocalDateString,
  getDayType,
  calculateHydrationTarget,
  getDailyObjectives,
  DayType,
} from '@/lib/habits';

interface DailyEssentialsCardProps {
  onOpenHydrationModal: () => void;
  onOpenCreatineModal: () => void;
  onOpenWeightModal: () => void;
  onNavigateMeals: () => void;
  onNavigateWorkout: () => void;
}

export default function DailyEssentialsCard({
  onOpenHydrationModal,
  onOpenCreatineModal,
  onOpenWeightModal,
  onNavigateMeals,
  onNavigateWorkout,
}: DailyEssentialsCardProps) {
  const todayStr = toLocalDateString(new Date());

  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const meals = useStore((state) => state.meals || []);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const macroGoals = useStore((state) => state.macroGoals);
  const hydrationConfig = useStore((state) => state.hydrationConfig);
  const creatineConfig = useStore((state) => state.creatineConfig);
  const dayTypeOverrides = useStore((state) => state.dayTypeOverrides || {});
  const setDayType = useStore((state) => state.setDayType);
  const toggleCreatine = useStore((state) => state.toggleCreatine);

  // Day Type
  const currentDayType: DayType = getDayType(todayStr, workouts, dayTypeOverrides);

  // Water target (unified calculation)
  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  const waterToday = waterLogs[todayStr] || 0;
  const creatineToday = creatineLogs[todayStr];
  const creatineTaken = !!creatineToday?.taken;

  // Protein today
  const todayMeals = meals.filter((m) => m.date && m.date.startsWith(todayStr));
  const proteinToday = todayMeals.reduce((acc, m) => {
    return acc + (m.foods?.reduce((p, f) => p + (f.proteinG || 0), 0) || 0);
  }, 0);
  const proteinTargetG = macroGoals?.proteinG || (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140);

  // Weight today
  const todayWeight = bodyMetrics.find((b) => b.date && b.date.startsWith(todayStr)) || null;
  const hasWorkout = workouts.some((w) => w.date && w.date.startsWith(todayStr));

  const toggleDayMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextType: DayType = currentDayType === 'training' ? 'rest' : 'training';
    setDayType(todayStr, nextType);
  };

  const displayWeight = (weightKg: number) => {
    if (profile?.unit === 'lbs') {
      return `${Math.round(weightKg * 2.20462)} lbs`;
    }
    return `${Math.round(weightKg)} kg`;
  };

  return (
    <section className="card p-4 sm:p-5 bg-bg-card border border-border space-y-3 shadow-xs">
      {/* Top Header & Day Mode Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="section-title text-[10px] block">TODAY&apos;S ESSENTIALS</span>
          <h2 className="text-base font-bold text-text-primary tracking-tight font-sans mt-0.5">
            Daily Habits &amp; Nutrition
          </h2>
        </div>

        {/* Dynamic Day Toggle Pill */}
        <button
          type="button"
          onClick={toggleDayMode}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border shadow-xs ${
            currentDayType === 'training'
              ? 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/15'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/15'
          }`}
          title="Tap to toggle between Training Day and Rest Day"
        >
          {currentDayType === 'training' ? (
            <>
              <Zap className="w-3 h-3 fill-current" />
              <span>Training</span>
            </>
          ) : (
            <>
              <Moon className="w-3 h-3 fill-current" />
              <span>Rest Day</span>
            </>
          )}
        </button>
      </div>

      {/* Essentials Rows */}
      <div className="divide-y divide-border/60">
        {/* 1. Training */}
        <div
          onClick={onNavigateWorkout}
          className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${hasWorkout ? 'bg-emerald-500/15 text-emerald-600' : 'bg-bg-secondary text-text-muted'}`}>
              <Dumbbell className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-text-primary">Training</span>
          </div>
          <span className={`text-xs font-semibold ${hasWorkout ? 'text-emerald-600' : 'text-text-muted'}`}>
            {hasWorkout ? 'Complete ✓' : currentDayType === 'rest' ? 'Rest Planned' : 'Pending'}
          </span>
        </div>

        {/* 2. Water */}
        <div
          onClick={onOpenHydrationModal}
          className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${waterToday >= waterTargetMl ? 'bg-emerald-500/15 text-emerald-600' : 'bg-bg-secondary text-sky-500'}`}>
              <Droplet className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-text-primary">Water</span>
          </div>
          <span className="text-xs font-mono font-medium text-text-secondary">
            {(waterToday / 1000).toFixed(1)} / {(waterTargetMl / 1000).toFixed(1)} L
            {waterToday >= waterTargetMl && <span className="text-emerald-600 ml-1">✓</span>}
          </span>
        </div>

        {/* 3. Creatine */}
        <div
          onClick={() => toggleCreatine(todayStr)}
          className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${creatineTaken ? 'bg-emerald-500/15 text-emerald-600' : 'bg-bg-secondary text-amber-500'}`}>
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-text-primary">Creatine</span>
          </div>
          <span className={`text-xs font-semibold ${creatineTaken ? 'text-emerald-600' : 'text-text-muted'}`}>
            {creatineTaken ? `${creatineToday?.amountG || 5}g Taken ✓` : 'Not logged'}
          </span>
        </div>

        {/* 4. Protein */}
        <div
          onClick={onNavigateMeals}
          className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${proteinToday >= proteinTargetG ? 'bg-emerald-500/15 text-emerald-600' : 'bg-bg-secondary text-orange-500'}`}>
              <UtensilsCrossed className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-text-primary">Protein</span>
          </div>
          <span className="text-xs font-mono font-medium text-text-secondary">
            {Math.round(proteinToday)} / {proteinTargetG} g
            {proteinToday >= proteinTargetG && <span className="text-emerald-600 ml-1">✓</span>}
          </span>
        </div>

        {/* 5. Weight */}
        <div
          onClick={onOpenWeightModal}
          className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${todayWeight ? 'bg-emerald-500/15 text-emerald-600' : 'bg-bg-secondary text-purple-500'}`}>
              <Scale className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-text-primary">Weight</span>
          </div>
          <span className={`text-xs font-semibold ${todayWeight ? 'text-emerald-600 font-mono' : 'text-text-muted'}`}>
            {todayWeight ? `${displayWeight(todayWeight.weightKg)} ✓` : 'Pending'}
          </span>
        </div>
      </div>
    </section>
  );
}
