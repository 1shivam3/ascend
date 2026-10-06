'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { Dumbbell, Droplet, UtensilsCrossed, Sparkles, ChevronRight, Check } from 'lucide-react';
import { calculateHydrationTarget, toLocalDateString } from '@/lib/habits';

interface DayHabitStats {
  dateStr: string;
  dayName: string;
  dayNum: number;
  isToday: boolean;
  isFuture: boolean;
  hasGym: boolean;
  waterMl: number;
  waterTargetMl: number;
  hitWater: boolean;
  proteinG: number;
  proteinTargetG: number;
  hitProtein: boolean;
  hasCreatine: boolean;
  totalCompleted: number;
}

interface HomeActivityHeatmapProps {
  onNavigateProgress?: () => void;
}

export default function HomeActivityHeatmap({ onNavigateProgress }: HomeActivityHeatmapProps) {
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayKey = toLocalDateString(today);

  const profile = useStore((s) => s.profile);
  const workouts = useStore((s) => s.workouts);
  const meals = useStore((s) => s.meals);
  const waterLogs = useStore((s) => s.waterLogs);
  const creatineLogs = useStore((s) => s.creatineLogs);
  const gymLogs = useStore((s) => s.gymLogs);
  const macroGoals = useStore((s) => s.macroGoals);
  const hydrationConfig = useStore((s) => s.hydrationConfig);

  const bw = profile?.bodyweightKg || 75;
  const baseProteinTarget = macroGoals?.proteinG || Math.round(bw * 1.8);
  const baseWaterTarget = calculateHydrationTarget({
    bodyweightKg: bw,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  // Calculate 7 days for current week (Mon -> Sun)
  const weekDays = useMemo<DayHabitStats[]>(() => {
    const now = new Date();
    const currentDayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - currentDayOfWeek);
    monday.setHours(0, 0, 0, 0);

    const days: DayHabitStats[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = toLocalDateString(d);

      const isToday = dStr === todayKey;
      const isFuture = dStr > todayKey;

      // Check gym
      const hasWorkout = workouts.some((w) => w.date && w.date.startsWith(dStr));
      const hasManualGym = !!gymLogs[dStr];
      const hasGym = hasWorkout || hasManualGym;

      // Check water
      const waterMl = waterLogs[dStr] || 0;
      const hitWater = waterMl >= baseWaterTarget && waterMl > 0;

      // Check protein
      const dayMeals = meals.filter((m) => m.date && m.date.startsWith(dStr));
      const proteinG = Math.round(
        dayMeals.reduce((acc, m) => acc + m.foods.reduce((sum, f) => sum + (f.proteinG || 0), 0), 0)
      );
      const hitProtein = proteinG >= baseProteinTarget && proteinG > 0;

      // Check creatine
      const hasCreatine = !!creatineLogs[dStr]?.taken;

      const totalCompleted = (hasGym ? 1 : 0) + (hitProtein ? 1 : 0) + (hitWater ? 1 : 0) + (hasCreatine ? 1 : 0);

      days.push({
        dateStr: dStr,
        dayName: dayNames[i],
        dayNum: d.getDate(),
        isToday,
        isFuture,
        hasGym,
        waterMl,
        waterTargetMl: baseWaterTarget,
        hitWater,
        proteinG,
        proteinTargetG: baseProteinTarget,
        hitProtein,
        hasCreatine,
        totalCompleted,
      });
    }

    return days;
  }, [todayKey, workouts, gymLogs, waterLogs, meals, creatineLogs, baseProteinTarget, baseWaterTarget]);

  const selectedStats = selectedDayKey ? weekDays.find((d) => d.dateStr === selectedDayKey) : null;

  return (
    <div className="card p-3.5 sm:p-4 bg-bg-card border border-border shadow-xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <div>
          <span className="text-label font-bold text-text-muted">
            Weekly consistency
          </span>
          <p className="text-2xs text-text-secondary mt-0.5">
            {weekDays[0].dayName} {weekDays[0].dayNum} – {weekDays[6].dayName} {weekDays[6].dayNum}
          </p>
        </div>

        {onNavigateProgress && (
          <button
            type="button"
            onClick={onNavigateProgress}
            className="text-label font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center gap-0.5"
          >
            <span>Full matrix</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 7-Day Strip */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
        {weekDays.map((day) => {
          const isSelected = selectedDayKey === day.dateStr;

          return (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => setSelectedDayKey(isSelected ? null : day.dateStr)}
              className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-between transition-all select-none active:scale-95 ${
                day.isToday
                  ? 'border-accent/80 bg-accent/5 ring-1 ring-accent'
                  : isSelected
                  ? 'border-text-primary bg-bg-secondary shadow-sm'
                  : day.isFuture
                  ? 'border-border/40 bg-bg-secondary/30 opacity-60'
                  : day.totalCompleted >= 3
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-border/70 bg-bg-secondary/60 hover:border-border'
              }`}
            >
              <span className={`text-[10px] font-bold block ${day.isToday ? 'text-accent' : 'text-text-muted'}`}>
                {day.dayName}
              </span>
              <span className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                {day.dayNum}
              </span>

              {/* Habit indicator dots */}
              <div className="flex items-center gap-0.5 justify-center w-full mt-1.5 h-2">
                {!day.isFuture ? (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${day.hasGym ? 'bg-accent' : 'bg-border/60'}`} title="Gym" />
                    <span className={`w-1.5 h-1.5 rounded-full ${day.hitProtein ? 'bg-[#22C55E]' : 'bg-border/60'}`} title="Protein" />
                    <span className={`w-1.5 h-1.5 rounded-full ${day.hitWater ? 'bg-[#38BDF8]' : 'bg-border/60'}`} title="Water" />
                    <span className={`w-1.5 h-1.5 rounded-full ${day.hasCreatine ? 'bg-[#F5B301]' : 'bg-border/60'}`} title="Creatine" />
                  </>
                ) : (
                  <span className="w-1 h-1 rounded-full bg-border/40" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Day Details Drawer */}
      {selectedStats && (
        <div className="p-3 rounded-xl bg-bg-secondary/80 border border-border animate-fade-in text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-text-primary">
              {selectedStats.dayName}, {selectedStats.dayNum} {today.toLocaleString('en-US', { month: 'short' })}
              {selectedStats.isToday && <span className="text-accent ml-1.5 text-2xs font-semibold">(Today)</span>}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDayKey(null)}
              className="text-2xs text-text-muted hover:text-text-primary"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-2xs">
            <div className="p-2 rounded-lg bg-bg-card border border-border/70 flex items-center justify-between">
              <span className="text-text-muted flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-accent" />
                <span>Training</span>
              </span>
              <span className={`font-bold ${selectedStats.hasGym ? 'text-emerald-500' : 'text-text-muted'}`}>
                {selectedStats.hasGym ? 'Done ✓' : 'Rest'}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-bg-card border border-border/70 flex items-center justify-between">
              <span className="text-text-muted flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Protein</span>
              </span>
              <span className="font-bold text-text-primary tabular-nums">
                {selectedStats.proteinG}/{selectedStats.proteinTargetG}g
              </span>
            </div>

            <div className="p-2 rounded-lg bg-bg-card border border-border/70 flex items-center justify-between">
              <span className="text-text-muted flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Water</span>
              </span>
              <span className="font-bold text-text-primary tabular-nums">
                {(selectedStats.waterMl / 1000).toFixed(1)}/{(selectedStats.waterTargetMl / 1000).toFixed(1)}L
              </span>
            </div>

            <div className="p-2 rounded-lg bg-bg-card border border-border/70 flex items-center justify-between">
              <span className="text-text-muted flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#F5B301]" />
                <span>Creatine</span>
              </span>
              <span className={`font-bold ${selectedStats.hasCreatine ? 'text-amber-500' : 'text-text-muted'}`}>
                {selectedStats.hasCreatine ? 'Taken ✓' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
