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
import WeeklyHabitMatrix from '@/components/WeeklyHabitMatrix';
import { useTranslation } from '@/lib/i18n';
import { weekdayNames } from '@/lib/i18n';
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
  const { t, language } = useTranslation();
  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const meals = useStore((state) => state.meals || []);
  const macroGoals = useStore((state) => state.macroGoals);
  const hydrationConfig = useStore((state) => state.hydrationConfig);
  const deleteWorkout = useStore((state) => state.deleteWorkout);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalDateString(today), [today]);

  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);
  const [activeFilter, setActiveFilter] = useState<HabitFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  // Matrix view shows ONE week (Mon–Sun) — defaults to the current week.
  const [matrixWeekStart, setMatrixWeekStart] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  });

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
          <span className="section-title text-[0.6875rem] block">{t('heat.matrix', { month: monthName })}</span>
          <div className="mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-text-primary block font-sans">
              {t(monthWorkoutsCount === 1 ? 'heat.dayTrained' : 'heat.daysTrained', { count: monthWorkoutsCount })}
            </span>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5 font-medium">
              <Flame className="w-3.5 h-3.5 text-accent fill-accent" />
              <span>{t(currentStreak === 1 ? 'heat.streakOne' : 'heat.streak', { count: currentStreak })}</span>
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
              title={t('heat.calendarGrid')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`p-1 rounded-md transition-colors ${
                viewMode === 'matrix' ? 'bg-bg-card text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title={t('heat.multiHabit')}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              aria-label={t('homeMatrix.prevMonth')}
              className="p-1 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label={t('homeMatrix.nextMonth')}
              className="p-1 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Habit Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
            activeFilter === 'all'
              ? 'bg-accent text-accent-on shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('heat.allHabits')}
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('gym')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
            activeFilter === 'gym'
              ? 'bg-[#FF6A1A] text-black shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          <Dumbbell className="w-3 h-3" />
          <span>{t('heat.gym')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('water')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
            activeFilter === 'water'
              ? 'bg-sky-600 text-black shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          <Droplet className="w-3 h-3" />
          <span>{t('heat.water')}</span>
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
          <span>{t('heat.creatine')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('protein')}
          className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
            activeFilter === 'protein'
              ? 'bg-[#22C55E] text-black shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          <UtensilsCrossed className="w-3 h-3" />
          <span>{t('heat.protein')}</span>
        </button>
      </div>

      {/* ── View Mode: Calendar Grid ────────────────────────────────────────── */}
      {viewMode === 'calendar' ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[0.625rem] text-text-muted font-bold">
            {weekdayNames(language, 'short').map((d) => (
              <span key={d}>{d}</span>
            ))}
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
                  aria-label={t('heat.cellSummary', { date: dateStr, done: totalHabitsDone })}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-between p-1 text-xs font-mono transition-all duration-150 relative select-none border ${
                    activeFilter !== 'all'
                      ? isHabitDone
                        ? 'bg-emerald-500 text-black font-bold border-transparent'
                        : isFuture
                        ? 'bg-bg-secondary/40 text-text-muted/40 border-transparent'
                        : 'bg-bg-secondary text-text-secondary border-border/50'
                      : totalHabitsDone >= 3
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-text-primary font-bold'
                      : totalHabitsDone >= 1
                      ? 'bg-bg-secondary text-text-primary border-border/70'
                      : isFuture
                      ? 'bg-bg-secondary/30 text-text-muted/40 border-transparent'
                      : 'bg-bg-secondary/70 text-slate-700 dark:text-slate-200 border-border/60 hover:border-border-hover'
                  } ${
                    isToday
                      ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg-card font-black'
                      : ''
                  } ${
                    isSelected ? 'scale-105 z-10 ring-2 ring-text-primary shadow-md' : ''
                  }`}
                >
                  <span className="text-[0.6875rem] leading-none font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                    {dayNum}
                  </span>

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

          {/* Gauntlet UX-20: legend for the four habit dots (the
              filter chips above only hint at the mapping once the
              user connects them; this row states it outright). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-2xs text-text-muted">
            {(
              [
                ['#FF6A1A', t('heat.gym')],
                ['#38BDF8', t('heat.water')],
                ['#F5B301', t('heat.creatine')],
                ['#22C55E', t('heat.protein')],
              ] as const
            ).map(([color, label]) => (
              <span key={label} className="inline-flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        /* ── View Mode: One-Week Habit Matrix (Mon–Sun, prev/next week nav) ── */
        <div className="py-1">
          <WeeklyHabitMatrix
            workouts={workouts}
            waterLogs={waterLogs}
            creatineLogs={creatineLogs}
            meals={meals}
            waterTargetMl={waterTargetMl}
            proteinTargetG={proteinTargetG}
            weekStart={matrixWeekStart}
            onWeekChange={(dir) =>
              setMatrixWeekStart((prev) => {
                const d = new Date(prev);
                d.setDate(d.getDate() + dir * 7);
                return d;
              })
            }
            onSelectDate={(dStr) => setSelectedDate(dStr)}
          />
        </div>
      )}

      {/* Selected Day Details Drawer */}
      {selectedDate && (
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-border animate-fade-in text-xs space-y-2.5">
          <div className="flex justify-between items-center font-mono">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-text-primary text-sm">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              {selectedDate === todayStr && (
                <span className="px-1.5 py-0.5 rounded text-[0.625rem] bg-accent/15 text-accent-text font-bold">
                  {t('sched.today')}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-text-muted hover:text-text-primary text-xs"
            >
              {t('common.close')}
            </button>
          </div>

          {/* 4 Habit Snapshot */}
          <div className="grid grid-cols-2 gap-2">
            {/* Gym */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                <span className="font-semibold text-text-primary">{t('heat.gymSession')}</span>
              </div>
              {(() => {
                const status = selectedWorkouts.length > 0
                  ? { text: t('heat.done', { count: selectedWorkouts.length }), cls: 'bg-emerald-500/10 text-emerald-500' }
                  : selectedDate === todayStr
                  ? { text: t('heat.planned'), cls: 'bg-accent/15 text-accent font-bold' }
                  : selectedDate > todayStr
                  ? { text: t('heat.notPlanned'), cls: 'text-text-muted' }
                  : { text: t('heat.rest'), cls: 'text-text-muted' };

                return (
                  <span className={`font-bold text-[0.625rem] px-1.5 py-0.5 rounded ${status.cls}`}>
                    {status.text}
                  </span>
                );
              })()}
            </div>

            {/* Water */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-sky-500" />
                <span className="font-semibold text-text-primary">{t('heat.hydration')}</span>
              </div>
              <span className="font-bold text-[0.625rem] text-sky-600">
                {formatWaterLiters(selectedWater)}
              </span>
            </div>

            {/* Creatine */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-semibold text-text-primary">{t('heat.creatine')}</span>
              </div>
              <span
                className={`font-bold text-[0.625rem] px-1.5 py-0.5 rounded ${
                  selectedCreatine?.taken
                    ? 'bg-amber-500/10 text-amber-600'
                    : 'text-text-muted'
                }`}
              >
                {selectedCreatine?.taken ? t('heat.taken', { amount: selectedCreatine.amountG || 5 }) : t('heat.pending')}
              </span>
            </div>

            {/* Protein */}
            <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500" />
                <span className="font-semibold text-text-primary">{t('heat.protein')}</span>
              </div>
              <span className="font-bold text-[0.625rem] text-orange-600">
                {selectedProtein}g / {proteinTargetG}g
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
