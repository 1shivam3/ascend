'use client';

import React from 'react';
import { Dumbbell, Droplet, Sparkles, UtensilsCrossed, TrendingUp } from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  toLocalDateString,
  calculateHydrationTarget,
  getWeeklyHabitsConsistency,
} from '@/lib/habits';

export default function WeeklyConsistencyCard() {
  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const meals = useStore((state) => state.meals || []);
  const macroGoals = useStore((state) => state.macroGoals);
  const hydrationConfig = useStore((state) => state.hydrationConfig);

  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  const proteinTargetG =
    macroGoals?.proteinG ||
    (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140);

  const weekly = getWeeklyHabitsConsistency({
    todayDate: new Date(),
    workouts,
    waterLogs,
    waterTargetMl,
    creatineLogs,
    meals,
    proteinTargetG,
    plannedDaysPerWeek: 4,
  });

  return (
    <div className="card p-4 bg-bg-card border border-border space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <span className="section-title text-[10px] block mb-0">WEEKLY CONSISTENCY</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black text-text-primary font-sans">
              {weekly.overallConsistencyPct}%
            </span>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              7-Day Adherence
            </span>
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
          <TrendingUp className="w-5 h-5 stroke-[2.2]" />
        </div>
      </div>

      {/* 4 Pillars Breakdown (User Item 12) */}
      <div className="grid grid-cols-4 gap-2 pt-1 text-center font-sans">
        {/* Workout */}
        <div className="p-2 rounded-xl bg-bg-secondary border border-border/60">
          <Dumbbell className="w-3.5 h-3.5 text-emerald-500 mx-auto mb-1" />
          <span className="text-[10px] text-text-muted font-bold block uppercase">Gym</span>
          <span className="font-extrabold text-xs text-text-primary">
            {weekly.workoutScore.done}/{weekly.workoutScore.total}
          </span>
        </div>

        {/* Water */}
        <div className="p-2 rounded-xl bg-bg-secondary border border-border/60">
          <Droplet className="w-3.5 h-3.5 text-sky-500 mx-auto mb-1" />
          <span className="text-[10px] text-text-muted font-bold block uppercase">Water</span>
          <span className="font-extrabold text-xs text-text-primary">
            {weekly.hydrationScore.done}/{weekly.hydrationScore.total}
          </span>
        </div>

        {/* Creatine */}
        <div className="p-2 rounded-xl bg-bg-secondary border border-border/60">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 mx-auto mb-1" />
          <span className="text-[10px] text-text-muted font-bold block uppercase">Creat</span>
          <span className="font-extrabold text-xs text-text-primary">
            {weekly.creatineScore.done}/{weekly.creatineScore.total}
          </span>
        </div>

        {/* Protein */}
        <div className="p-2 rounded-xl bg-bg-secondary border border-border/60">
          <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500 mx-auto mb-1" />
          <span className="text-[10px] text-text-muted font-bold block uppercase">Protein</span>
          <span className="font-extrabold text-xs text-text-primary">
            {weekly.proteinScore.done}/{weekly.proteinScore.total}
          </span>
        </div>
      </div>
    </div>
  );
}
