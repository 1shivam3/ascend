'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { ChevronLeft, ChevronRight, Sparkles, CheckCircle2, Dumbbell, Droplet, Flame, Pill } from 'lucide-react';
import { calculateHydrationTarget, toLocalDateString } from '@/lib/habits';

interface DayHabitStats {
  hasGym: boolean;
  waterMl: number;
  waterTargetMl: number;
  hitWater: boolean;
  proteinG: number;
  proteinTargetG: number;
  hitProtein: boolean;
  hasCreatine: boolean;
}

export default function HomeActivityHeatmap() {
  const store = useStore();
  const [activeDate, setActiveDate] = useState<Date>(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayKey = toLocalDateString(today);

  const profile = store.profile;
  const workouts = store.workouts;
  const meals = store.meals;
  const waterLogs = store.waterLogs;
  const creatineLogs = store.creatineLogs;
  const gymLogs = store.gymLogs;
  const macroGoals = store.macroGoals;
  const hydrationConfig = store.hydrationConfig;

  const bw = profile?.bodyweightKg || 75;
  const baseProteinTarget = macroGoals?.proteinG || Math.round(bw * 1.8);
  const baseWaterTarget = calculateHydrationTarget({
    bodyweightKg: bw,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });

  const year = activeDate.getFullYear();
  const month = activeDate.getMonth();

  // Days in month
  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  // First day offset (0 = Mon, 6 = Sun)
  const firstDayOffset = useMemo(() => {
    const day = new Date(year, month, 1).getDay();
    return (day + 6) % 7;
  }, [year, month]);

  // Build habit stats dictionary for all days in month
  const monthStats = useMemo(() => {
    const stats: Record<string, DayHabitStats> = {};
    const wList = workouts || [];
    const mList = meals || [];
    const waterMap = waterLogs || {};
    const creatineMap = creatineLogs || {};
    const gymMap = gymLogs || {};

    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Gym
      const hasWorkout = wList.some((w) => w.date && w.date.startsWith(dStr));
      const hasManualGym = !!gymMap[dStr];
      const hasGym = hasWorkout || hasManualGym;

      // Water
      const waterMl = waterMap[dStr] || 0;
      const hitWater = waterMl >= baseWaterTarget && waterMl > 0;

      // Protein
      const dayMeals = mList.filter((m) => m.date && m.date.startsWith(dStr));
      const proteinG = Math.round(
        dayMeals.reduce((acc, m) => acc + m.foods.reduce((sum, f) => sum + (f.proteinG || 0), 0), 0)
      );
      const hitProtein = proteinG >= baseProteinTarget && proteinG > 0;

      // Creatine
      const hasCreatine = !!creatineMap[dStr]?.taken;

      stats[dStr] = {
        hasGym,
        waterMl,
        waterTargetMl: baseWaterTarget,
        hitWater,
        proteinG,
        proteinTargetG: baseProteinTarget,
        hitProtein,
        hasCreatine,
      };
    }

    return stats;
  }, [year, month, daysInMonth, workouts, gymLogs, waterLogs, meals, creatineLogs, baseProteinTarget, baseWaterTarget]);

  const handlePrevMonth = () => {
    setActiveDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDayKey(null);
  };

  const handleNextMonth = () => {
    setActiveDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDayKey(null);
  };

  const monthName = activeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Selected day detail
  const selectedStats = selectedDayKey ? monthStats[selectedDayKey] : null;

  return (
    <div className="card p-3.5 sm:p-4 bg-bg-card border border-border shadow-xs space-y-3">
      {/* Header with Month Navigation */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider font-mono block">
            ACTIVITY HEATMAP
          </span>
          <h3 className="text-sm sm:text-base font-bold text-text-primary leading-tight font-sans">
            {monthName}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg border border-border bg-bg-secondary/60 text-text-secondary hover:text-text-primary hover:border-accent/40 active:scale-90 transition-all"
            title="Previous Month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveDate(new Date());
              setSelectedDayKey(todayKey);
            }}
            className="px-2 py-1 rounded-lg border border-border bg-bg-secondary/60 text-2xs font-semibold text-text-primary hover:border-accent/40 active:scale-95 transition-all"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg border border-border bg-bg-secondary/60 text-text-secondary hover:text-text-primary hover:border-accent/40 active:scale-90 transition-all"
            title="Next Month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Calendar Grid (M, T, W, T, F, S, S) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
          <span key={`${day}-${idx}`} className="text-[10px] font-mono font-bold text-text-muted">
            {day}
          </span>
        ))}

        {/* Empty padding cells for start of month */}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Days of month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const stat = monthStats[dStr];
          const isToday = dStr === todayKey;
          const isSelected = dStr === selectedDayKey;

          const dots = [
            { active: stat?.hasGym, color: 'bg-accent shadow-xs shadow-accent/40' },
            { active: stat?.hitWater, color: 'bg-[#4CC2FF] shadow-xs shadow-[#4CC2FF]/40' },
            { active: stat?.hitProtein, color: 'bg-[#3DDC97] shadow-xs shadow-[#3DDC97]/40' },
            { active: stat?.hasCreatine, color: 'bg-[#FFC23D] shadow-xs shadow-[#FFC23D]/40' },
          ].filter((d) => d.active);

          return (
            <button
              key={dStr}
              type="button"
              onClick={() => setSelectedDayKey(selectedDayKey === dStr ? null : dStr)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all select-none relative ${
                isToday
                  ? 'border-2 border-accent bg-accent/10 shadow-xs'
                  : isSelected
                  ? 'border-2 border-text-primary bg-bg-secondary'
                  : 'bg-bg-secondary/40 border border-border/60 hover:border-accent/40 hover:bg-bg-secondary'
              }`}
            >
              <span
                className={`text-[11px] font-mono leading-none ${
                  isToday ? 'font-bold text-accent' : isSelected ? 'font-bold text-text-primary' : 'text-text-secondary'
                }`}
              >
                {dayNum}
              </span>

              {/* Dots row */}
              <div className="flex items-center justify-center gap-0.5 h-1.5">
                {dots.length > 0 ? (
                  dots.map((d, dIdx) => (
                    <span key={dIdx} className={`w-1.5 h-1.5 rounded-full ${d.color}`} />
                  ))
                ) : (
                  <span className="w-1 h-1 rounded-full bg-border/40" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Day Popout Details */}
      {selectedDayKey && selectedStats && (
        <div className="p-3 rounded-xl bg-bg-secondary border border-accent/40 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-text-primary font-mono">
              {new Date(selectedDayKey + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDayKey(null)}
              className="text-text-muted hover:text-text-primary text-[11px]"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs font-mono">
            <div className={`p-2 rounded-lg border ${selectedStats.hasGym ? 'bg-accent/10 border-accent/40 text-accent font-bold' : 'bg-bg-card border-border text-text-muted'}`}>
              <div className="flex items-center gap-1">
                <Dumbbell className="w-3 h-3" />
                <span>Gym: {selectedStats.hasGym ? 'Complete ✓' : 'Rest Day'}</span>
              </div>
            </div>

            <div className={`p-2 rounded-lg border ${selectedStats.hitWater ? 'bg-[#4CC2FF]/10 border-[#4CC2FF]/40 text-[#4CC2FF] font-bold' : 'bg-bg-card border-border text-text-muted'}`}>
              <div className="flex items-center gap-1">
                <Droplet className="w-3 h-3" />
                <span>Water: {selectedStats.waterMl} / {selectedStats.waterTargetMl}ml</span>
              </div>
            </div>

            <div className={`p-2 rounded-lg border ${selectedStats.hitProtein ? 'bg-[#3DDC97]/10 border-[#3DDC97]/40 text-[#3DDC97] font-bold' : 'bg-bg-card border-border text-text-muted'}`}>
              <div className="flex items-center gap-1">
                <Flame className="w-3 h-3" />
                <span>Protein: {selectedStats.proteinG} / {selectedStats.proteinTargetG}g</span>
              </div>
            </div>

            <div className={`p-2 rounded-lg border ${selectedStats.hasCreatine ? 'bg-[#FFC23D]/10 border-[#FFC23D]/40 text-[#FFC23D] font-bold' : 'bg-bg-card border-border text-text-muted'}`}>
              <div className="flex items-center gap-1">
                <Pill className="w-3 h-3" />
                <span>Creatine: {selectedStats.hasCreatine ? 'Taken ✓' : 'Missed'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[10px] font-mono text-text-muted px-0.5">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span>Gym</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#4CC2FF]" />
          <span>Water</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#3DDC97]" />
          <span>Protein</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#FFC23D]" />
          <span>Creatine</span>
        </span>
      </div>
    </div>
  );
}
