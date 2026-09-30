'use client';

import React, { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import {
  Flame,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Droplet,
  Sparkles,
  UtensilsCrossed,
  Check,
  RotateCcw,
  LayoutGrid,
  List,
} from 'lucide-react';
import { WorkoutEntry } from '@/lib/types';
import {
  toLocalDateString,
  calculateHydrationTarget,
  formatWaterLiters,
} from '@/lib/habits';

interface WorkoutHeatmapProps {
  onNavigate?: (tab: 'home' | 'prs' | 'meals' | 'workout') => void;
  onOpenHydrationModal?: () => void;
  onOpenCreatineModal?: () => void;
}

type HabitFilter = 'all' | 'gym' | 'water' | 'creatine' | 'protein';
type ViewMode = 'calendar' | 'matrix';

export default function WorkoutHeatmap({
  onNavigate,
  onOpenHydrationModal,
  onOpenCreatineModal,
}: WorkoutHeatmapProps) {
  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const meals = useStore((state) => state.meals || []);
  const macroGoals = useStore((state) => state.macroGoals);
  const hydrationConfig = useStore((state) => state.hydrationConfig);
  const addWorkout = useStore((state) => state.addWorkout);
  const deleteWorkout = useStore((state) => state.deleteWorkout);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalDateString(today), [today]);

  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);
  const [activeFilter, setActiveFilter] = useState<HabitFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');

  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });
  const proteinTargetG = macroGoals?.proteinG || (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140);

  // Group workouts by date (YYYY-MM-DD)
  const workoutMap = useMemo(() => {
    const map = new Map<string, WorkoutEntry[]>();
    for (const w of workouts) {
      if (!w.date) continue;
      const d = w.date.split('T')[0];
      const list = map.get(d) || [];
      list.push(w);
      map.set(d, list);
    }
    return map;
  }, [workouts]);

  // Protein by date map
  const proteinMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meals) {
      if (!m.date) continue;
      const d = m.date.split('T')[0];
      const p = m.foods?.reduce((acc, f) => acc + (f.proteinG || 0), 0) || 0;
      map.set(d, (map.get(d) || 0) + p);
    }
    return map;
  }, [meals]);

  // Streak calculation (Multi-habit or gym)
  const currentStreak = useMemo(() => {
    let streak = 0;
    const checkDate = new Date(today);
    const todayCheck = toLocalDateString(checkDate);

    // If today hasn't trained, allow checking yesterday so streak doesn't drop to 0 mid-day
    if (!workoutMap.has(todayCheck)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (streak < 365) {
      const dStr = toLocalDateString(checkDate);
      if (workoutMap.has(dStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [workoutMap, today]);

  // Month metadata
  const { monthName, yearNum, daysInMonth, monthWorkoutsCount, leadingBlanks } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const name = currentDate.toLocaleDateString('en-US', { month: 'long' });
    const totalDays = new Date(year, month + 1, 0).getDate();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const blanks = (firstDayIndex + 6) % 7; // Monday-first

    let count = 0;
    for (let day = 1; day <= totalDays; day++) {
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (workoutMap.has(dStr)) {
        count++;
      }
    }

    return {
      monthName: name,
      yearNum: year,
      daysInMonth: totalDays,
      monthWorkoutsCount: count,
      leadingBlanks: blanks,
    };
  }, [currentDate, workoutMap]);

  const prevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  const resetToToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayStr);
  };

  const handleQuickHitGym = (targetDateStr: string = todayStr) => {
    const existing = workoutMap.get(targetDateStr) || [];
    if (existing.length > 0) return;

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `w_${Date.now()}`;
    addWorkout({
      id: newId,
      date: targetDateStr,
      exercises: [
        {
          name: 'Gym Session',
          sets: [{ reps: 1, weight: 0, unit: 'kg' }],
        },
      ],
    });
  };

  // Selected Day Details
  const selectedWorkouts = selectedDate ? workoutMap.get(selectedDate) || [] : [];
  const selectedWater = selectedDate ? waterLogs[selectedDate] || 0 : 0;
  const selectedCreatine = selectedDate ? creatineLogs[selectedDate] : undefined;
  const selectedProtein = selectedDate ? Math.round(proteinMap.get(selectedDate) || 0) : 0;

  return (
    <div className="card p-4 space-y-3.5 bg-bg-card border border-border shadow-xs">
      {/* Header with Title and Month Navigation */}
      <div className="flex items-start justify-between">
        <div>
          <span className="section-title text-[11px] block">{monthName} Habit Matrix</span>
          <div className="mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-text-primary block font-sans">
              {monthWorkoutsCount} {monthWorkoutsCount === 1 ? 'day' : 'days'} trained
            </span>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5 font-medium">
              <Flame className="w-3.5 h-3.5 text-accent fill-accent" />
              <span>Streak: <strong>{currentStreak} {currentStreak === 1 ? 'day' : 'days'}</strong></span>
            </p>
          </div>
        </div>

        {/* View mode toggle & Month navigation */}
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg bg-bg-secondary p-0.5 border border-border">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`p-1 rounded-md transition-colors ${
                viewMode === 'calendar' ? 'bg-bg-card text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title="Calendar Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`p-1 rounded-md transition-colors ${
                viewMode === 'matrix' ? 'bg-bg-card text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title="Multi-Habit Rows"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Habit Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
            activeFilter === 'all'
              ? 'bg-accent text-white shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          All Habits
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('gym')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
            activeFilter === 'gym'
              ? 'bg-[#FF6A1A] text-white shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          <Dumbbell className="w-3 h-3" />
          <span>Gym</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('water')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
            activeFilter === 'water'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          <Droplet className="w-3 h-3" />
          <span>Water</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('creatine')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
            activeFilter === 'creatine'
              ? 'bg-[#F5B301] text-black shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Creatine</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('protein')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
            activeFilter === 'protein'
              ? 'bg-[#22C55E] text-white shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          <UtensilsCrossed className="w-3 h-3" />
          <span>Protein</span>
        </button>
      </div>

      {/* ── View Mode: Calendar Grid ────────────────────────────────────────── */}
      {viewMode === 'calendar' ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-text-muted font-bold">
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
            <span>Su</span>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {/* Blanks */}
            {Array.from({ length: leadingBlanks }).map((_, idx) => (
              <div key={`blank-${idx}`} className="aspect-square rounded-lg opacity-10" />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateStr = `${yearNum}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const isSelected = selectedDate === dateStr;
              const isFuture = dateStr > todayStr;

              const hasGym = (workoutMap.get(dateStr) || []).length > 0;
              const hasWater = (waterLogs[dateStr] || 0) >= waterTargetMl * 0.85;
              const hasCreatine = !!creatineLogs[dateStr]?.taken;
              const hasProtein = (proteinMap.get(dateStr) || 0) >= proteinTargetG * 0.85;

              // Filter check for single-habit focus
              let isHabitDone = false;
              if (activeFilter === 'gym') isHabitDone = hasGym;
              else if (activeFilter === 'water') isHabitDone = hasWater;
              else if (activeFilter === 'creatine') isHabitDone = hasCreatine;
              else if (activeFilter === 'protein') isHabitDone = hasProtein;

              const totalHabitsDone = (hasGym ? 1 : 0) + (hasWater ? 1 : 0) + (hasCreatine ? 1 : 0) + (hasProtein ? 1 : 0);

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-between p-1 text-xs font-mono transition-all duration-150 relative select-none border ${
                    activeFilter !== 'all'
                      ? isHabitDone
                        ? 'bg-emerald-500 text-white font-bold border-transparent'
                        : isFuture
                        ? 'bg-bg-secondary/40 text-text-muted/40 border-transparent'
                        : 'bg-bg-secondary text-text-secondary border-border/50'
                      : totalHabitsDone >= 3
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-text-primary font-bold'
                      : totalHabitsDone >= 1
                      ? 'bg-bg-secondary text-text-primary border-border/70'
                      : isFuture
                      ? 'bg-bg-secondary/40 text-text-muted/40 border-transparent'
                      : 'bg-bg-secondary/60 text-text-muted border-border/40'
                  } ${
                    isToday
                      ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg-card font-black'
                      : ''
                  } ${
                    isSelected ? 'scale-105 z-10 ring-2 ring-text-primary shadow-md' : ''
                  }`}
                >
                  <span className="text-[11px] leading-none">{dayNum}</span>

                  {/* Multi-habit indicators */}
                  {activeFilter === 'all' && !isFuture && (
                    <div className="flex items-center gap-0.5 justify-center w-full mt-auto">
                      <span className={`w-1 h-1 rounded-full ${hasGym ? 'bg-[#FF6A1A]' : 'bg-border'}`} />
                      <span className={`w-1 h-1 rounded-full ${hasWater ? 'bg-[#38BDF8]' : 'bg-border'}`} />
                      <span className={`w-1 h-1 rounded-full ${hasCreatine ? 'bg-[#F5B301]' : 'bg-border'}`} />
                      <span className={`w-1 h-1 rounded-full ${hasProtein ? 'bg-[#22C55E]' : 'bg-border'}`} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── View Mode: Multi-Habit Row Matrix (User item 4) ────────────────── */
        <div className="space-y-2 py-1 overflow-x-auto no-scrollbar">
          <div className="min-w-[320px] space-y-1.5 text-xs font-mono">
            {/* Days header strip */}
            <div className="flex items-center gap-1 pl-16">
              {Array.from({ length: Math.min(14, daysInMonth) }).map((_, i) => (
                <div key={i} className="w-4 text-center text-[9px] text-text-muted">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Gym Row */}
            <div className="flex items-center gap-1.5">
              <span className="w-14 text-[10px] uppercase font-bold text-[#FF6A1A]">GYM</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(14, daysInMonth) }).map((_, i) => {
                  const dayNum = i + 1;
                  const dStr = `${yearNum}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const done = (workoutMap.get(dStr) || []).length > 0;
                  return (
                    <span
                      key={i}
                      onClick={() => setSelectedDate(dStr)}
                      className={`w-4 h-4 rounded cursor-pointer ${
                        done ? 'bg-[#FF6A1A]' : 'bg-bg-secondary border border-border/40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Water Row */}
            <div className="flex items-center gap-1.5">
              <span className="w-14 text-[10px] uppercase font-bold text-[#38BDF8]">WATER</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(14, daysInMonth) }).map((_, i) => {
                  const dayNum = i + 1;
                  const dStr = `${yearNum}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const done = (waterLogs[dStr] || 0) >= waterTargetMl * 0.85;
                  return (
                    <span
                      key={i}
                      onClick={() => setSelectedDate(dStr)}
                      className={`w-4 h-4 rounded cursor-pointer ${
                        done ? 'bg-[#38BDF8]' : 'bg-bg-secondary border border-border/40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Creatine Row */}
            <div className="flex items-center gap-1.5">
              <span className="w-14 text-[10px] uppercase font-bold text-[#F5B301]">CREAT</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(14, daysInMonth) }).map((_, i) => {
                  const dayNum = i + 1;
                  const dStr = `${yearNum}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const done = !!creatineLogs[dStr]?.taken;
                  return (
                    <span
                      key={i}
                      onClick={() => setSelectedDate(dStr)}
                      className={`w-4 h-4 rounded cursor-pointer ${
                        done ? 'bg-[#F5B301]' : 'bg-bg-secondary border border-border/40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Protein Row */}
            <div className="flex items-center gap-1.5">
              <span className="w-14 text-[10px] uppercase font-bold text-[#22C55E]">PROT</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(14, daysInMonth) }).map((_, i) => {
                  const dayNum = i + 1;
                  const dStr = `${yearNum}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const done = (proteinMap.get(dStr) || 0) >= proteinTargetG * 0.85;
                  return (
                    <span
                      key={i}
                      onClick={() => setSelectedDate(dStr)}
                      className={`w-4 h-4 rounded cursor-pointer ${
                        done ? 'bg-[#22C55E]' : 'bg-bg-secondary border border-border/40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Day Details Drawer */}
      {selectedDate && (
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-border animate-fade-in text-xs space-y-2.5">
          <div className="flex justify-between items-center font-mono">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-text-primary text-sm">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              {selectedDate === todayStr && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/15 text-accent font-bold">
                  TODAY
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-text-muted hover:text-text-primary text-xs"
            >
              Close
            </button>
          </div>

          {/* 4 Habit Snapshot */}
          <div className="grid grid-cols-2 gap-2">
            {/* Gym */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                <span className="font-semibold text-text-primary">Gym Session</span>
              </div>
              {(() => {
                const status = selectedWorkouts.length > 0
                  ? { text: `${selectedWorkouts.length} Done`, cls: 'bg-emerald-500/10 text-emerald-500' }
                  : selectedDate === todayStr
                  ? { text: 'Planned', cls: 'bg-accent/15 text-accent font-bold' }
                  : selectedDate > todayStr
                  ? { text: 'Not planned', cls: 'text-text-muted' }
                  : { text: 'Rest', cls: 'text-text-muted' };

                return (
                  <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${status.cls}`}>
                    {status.text}
                  </span>
                );
              })()}
            </div>

            {/* Water */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-sky-500" />
                <span className="font-semibold text-text-primary">Hydration</span>
              </div>
              <span className="font-bold text-[10px] text-sky-600">
                {formatWaterLiters(selectedWater)}
              </span>
            </div>

            {/* Creatine */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-semibold text-text-primary">Creatine</span>
              </div>
              <span
                className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                  selectedCreatine?.taken
                    ? 'bg-amber-500/10 text-amber-600'
                    : 'text-text-muted'
                }`}
              >
                {selectedCreatine?.taken ? `${selectedCreatine.amountG || 5}g Taken` : 'Pending'}
              </span>
            </div>

            {/* Protein */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500" />
                <span className="font-semibold text-text-primary">Protein</span>
              </div>
              <span className="font-bold text-[10px] text-orange-600">
                {selectedProtein}g / {proteinTargetG}g
              </span>
            </div>
          </div>

          {/* If selected is today and not worked out: quick button */}
          {selectedDate === todayStr && selectedWorkouts.length === 0 && (
            <button
              type="button"
              onClick={() => handleQuickHitGym(todayStr)}
              className="w-full py-2 rounded-xl bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-600 active:scale-[0.98] transition-all"
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>Mark Workout Complete For Today</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
