'use client';

import React from 'react';
import {
  Droplet,
  Sparkles,
  Dumbbell,
  Scale,
  UtensilsCrossed,
  CheckCircle2,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  toLocalDateString,
  getDayType,
  calculateHydrationTarget,
  getNextBestAction,
  DayType,
} from '@/lib/habits';

interface NextBestActionBannerProps {
  onNavigateWorkout: () => void;
  onNavigateMeals: () => void;
  onOpenWeightModal: () => void;
  onOpenHydrationModal: () => void;
  onOpenCreatineModal: () => void;
}

export default function NextBestActionBanner({
  onNavigateWorkout,
  onNavigateMeals,
  onOpenWeightModal,
  onOpenHydrationModal,
  onOpenCreatineModal,
}: NextBestActionBannerProps) {
  const toast = useToast();
  const todayStr = toLocalDateString(new Date());

  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const meals = useStore((state) => state.meals || []);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const macroGoals = useStore((state) => state.macroGoals);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts || []);
  const hydrationConfig = useStore((state) => state.hydrationConfig);
  const creatineConfig = useStore((state) => state.creatineConfig);
  const dayTypeOverrides = useStore((state) => state.dayTypeOverrides || {});

  const logWater = useStore((state) => state.logWater);
  const toggleCreatine = useStore((state) => state.toggleCreatine);
  const logQuickProtein = useStore((state) => state.logQuickProtein);

  const currentDayType: DayType = getDayType(todayStr, workouts, dayTypeOverrides);
  const hasTrainedToday = workouts.some((w) => w.date && w.date.startsWith(todayStr));
  const waterToday = waterLogs[todayStr] || 0;
  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  const creatineToday = creatineLogs[todayStr];
  const creatineTaken = !!creatineToday?.taken;

  const todayMeals = meals.filter((m) => m.date && m.date.startsWith(todayStr));
  const proteinToday = todayMeals.reduce((acc, m) => {
    return acc + (m.foods?.reduce((p, f) => p + (f.proteinG || 0), 0) || 0);
  }, 0);
  const proteinTargetG = macroGoals?.proteinG || (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140);

  const hasLoggedWeight = bodyMetrics.some((b) => b.date && b.date.startsWith(todayStr));
  const activePlan = plannedWorkouts?.[0];

  const nba = getNextBestAction({
    nowHour: new Date().getHours(),
    dayType: currentDayType,
    hasTrainedToday,
    waterMl: waterToday,
    waterTargetMl,
    creatineTaken,
    creatineTargetG: creatineConfig?.dailyTargetG || 5,
    proteinG: proteinToday,
    proteinTargetG,
    hasLoggedWeight,
    activePlanName: activePlan?.name,
    mealsCount: todayMeals.length,
  });

  const handleActionClick = () => {
    if (nba.type === 'DRINK_WATER') {
      const amt = nba.amountMl || 500;
      logWater(amt, todayStr);
      toast.success(`+${amt} ml logged! Keep hydrating.`, 'Hydration');
    } else if (nba.type === 'TAKE_CREATINE') {
      toggleCreatine(todayStr);
      toast.success(`${creatineConfig?.dailyTargetG || 5}g creatine logged!`, 'Creatine');
    } else if (nba.type === 'START_WORKOUT') {
      onNavigateWorkout();
    } else if (nba.type === 'LOG_WEIGHT') {
      onOpenWeightModal();
    } else if (nba.type === 'LOG_MEAL') {
      onNavigateMeals();
    } else if (nba.type === 'LOG_PROTEIN') {
      onNavigateMeals();
    } else {
      onOpenHydrationModal();
    }
  };

  // Icon & color styling per action
  let Icon = Sparkles;
  let iconBg = 'bg-accent/15 text-accent';

  if (nba.type === 'DRINK_WATER') {
    Icon = Droplet;
    iconBg = 'bg-sky-500/15 text-sky-500';
  } else if (nba.type === 'TAKE_CREATINE') {
    Icon = Sparkles;
    iconBg = 'bg-amber-500/15 text-amber-500';
  } else if (nba.type === 'START_WORKOUT') {
    Icon = Dumbbell;
    iconBg = 'bg-accent/15 text-accent';
  } else if (nba.type === 'LOG_WEIGHT') {
    Icon = Scale;
    iconBg = 'bg-purple-500/15 text-purple-500';
  } else if (nba.type === 'LOG_MEAL' || nba.type === 'LOG_PROTEIN') {
    Icon = UtensilsCrossed;
    iconBg = 'bg-orange-500/15 text-orange-500';
  } else if (nba.type === 'ALL_COMPLETE') {
    Icon = CheckCircle2;
    iconBg = 'bg-emerald-500/15 text-emerald-600';
  }

  return (
    <div className="card p-4 bg-gradient-to-r from-bg-card via-bg-card to-accent/5 border border-accent/30 shadow-sm transition-all hover:border-accent/50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="section-title text-[10px] tracking-wider mb-0 text-accent font-bold">
            NEXT BEST ACTION
          </span>
        </div>
        <span className="text-[10px] font-mono text-text-muted font-semibold">1-TAP PROGRESS</span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-text-primary leading-tight">
              {nba.title}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5 leading-snug">
              {nba.description}
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleActionClick}
        className="btn-primary w-full py-2.5 text-xs font-bold shadow-sm shadow-accent/20 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
      >
        <span>{nba.buttonLabel}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
