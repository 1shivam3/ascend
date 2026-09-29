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

  // Water target
  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    isTrainingDay: currentDayType === 'training',
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  const waterToday = waterLogs[todayStr] || 0;
  const creatineToday = creatineLogs[todayStr];

  // Protein today
  const todayMeals = meals.filter((m) => m.date && m.date.startsWith(todayStr));
  const proteinToday = todayMeals.reduce((acc, m) => {
    return acc + (m.foods?.reduce((p, f) => p + (f.proteinG || 0), 0) || 0);
  }, 0);
  const proteinTargetG = macroGoals?.proteinG || (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140);

  // Weight today
  const todayWeight = bodyMetrics.find((b) => b.date && b.date.startsWith(todayStr)) || null;

  // Calculate daily summary
  const summary = getDailyObjectives({
    dateStr: todayStr,
    dayType: currentDayType,
    workouts,
    waterMl: waterToday,
    waterTargetMl,
    creatineLog: creatineToday,
    proteinG: proteinToday,
    proteinTargetG,
    weightEntry: todayWeight,
    profileUnit: profile?.unit || 'kg',
  });

  const toggleDayMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextType: DayType = currentDayType === 'training' ? 'rest' : 'training';
    setDayType(todayStr, nextType);
  };

  return (
    <section className="card p-4 sm:p-5 bg-bg-card border border-border space-y-3.5 shadow-xs">
      {/* Top Header & Day Mode Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="section-title text-[11px] block">DAILY ESSENTIALS</span>
          <h2 className="text-lg font-black text-text-primary tracking-tight font-sans mt-0.5">
            {summary.statusMessage}
          </h2>
        </div>

        {/* Dynamic Day Toggle Pill */}
        <button
          type="button"
          onClick={toggleDayMode}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all border shadow-xs ${
            currentDayType === 'training'
              ? 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/15'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/15'
          }`}
          title="Tap to toggle between Training Day and Rest Day"
        >
          {currentDayType === 'training' ? (
            <>
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Training Day</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 fill-current" />
              <span>Rest Day</span>
            </>
          )}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="h-2 w-full bg-bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              summary.allDone ? 'bg-emerald-500' : 'bg-accent'
            }`}
            style={{ width: `${summary.pct}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[11px] text-text-muted">
          <span>{summary.completedCount} of {summary.totalCount} completed</span>
          <span className="font-bold text-accent">{summary.pct}%</span>
        </div>
      </div>

      {/* Checklist Grid */}
      <div className="space-y-1.5 pt-1">
        {summary.objectives.map((obj) => {
          let Icon = Circle;
          let onClick = () => {};

          if (obj.id === 'workout') {
            Icon = Dumbbell;
            onClick = onNavigateWorkout;
          } else if (obj.id === 'recovery') {
            Icon = Moon;
            onClick = () => {};
          } else if (obj.id === 'water') {
            Icon = Droplet;
            onClick = onOpenHydrationModal;
          } else if (obj.id === 'creatine') {
            Icon = Sparkles;
            onClick = () => toggleCreatine(todayStr);
          } else if (obj.id === 'protein') {
            Icon = UtensilsCrossed;
            onClick = onNavigateMeals;
          } else if (obj.id === 'weight') {
            Icon = Scale;
            onClick = onOpenWeightModal;
          }

          return (
            <div
              key={obj.id}
              onClick={onClick}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                obj.done
                  ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/35'
                  : 'bg-bg-secondary/60 border-border/80 hover:border-accent/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                    obj.done
                      ? 'bg-emerald-500 text-white'
                      : 'bg-bg-card text-text-muted border border-border'
                  }`}
                >
                  {obj.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                <div>
                  <span
                    className={`text-xs font-semibold block leading-tight ${
                      obj.done ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {obj.title}
                  </span>
                  <span className="text-[10px] text-text-muted font-medium">
                    {obj.metricLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                    obj.done
                      ? 'text-emerald-600 bg-emerald-500/10'
                      : 'text-text-muted bg-bg-card border border-border'
                  }`}
                >
                  {obj.done ? 'DONE' : 'PENDING'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic Training vs Rest Day Mantra Banner */}
      <div className="py-1.5 px-3 rounded-xl bg-bg-secondary text-center text-[10px] font-mono tracking-wider text-text-muted font-semibold">
        {currentDayType === 'training'
          ? 'TRAIN • HYDRATE • FUEL • RECOVER'
          : 'RECOVER • HYDRATE • FUEL • MOBILITY'}
      </div>
    </section>
  );
}
