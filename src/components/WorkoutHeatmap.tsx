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
  Check,
  Plus,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { WorkoutEntry } from '@/lib/types';

interface WorkoutHeatmapProps {
  onNavigate?: (tab: 'home' | 'prs' | 'meals' | 'workout') => void;
}

// Format local date YYYY-MM-DD safely without UTC offset shift
function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function WorkoutHeatmap({ onNavigate }: WorkoutHeatmapProps) {
  const workouts = useStore((state) => state.workouts);
  const addWorkout = useStore((state) => state.addWorkout);
  const deleteWorkout = useStore((state) => state.deleteWorkout);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalDateString(today), [today]);

  // Current month being viewed
  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);

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

  // Check if today is logged
  const todayWorkouts = useMemo(() => workoutMap.get(todayStr) || [], [workoutMap, todayStr]);
  const isTodayLogged = todayWorkouts.length > 0;

  // Streak calculation
  const currentStreak = useMemo(() => {
    let streak = 0;
    const checkDate = new Date(today);
    
    // If not worked out today, check if yesterday was logged to preserve streak
    if (!workoutMap.has(toLocalDateString(checkDate))) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
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

  // Monthly stats
  const { monthName, yearNum, daysInMonth, monthWorkoutsCount, leadingBlanks } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const name = currentDate.toLocaleDateString('en-US', { month: 'long' });
    const totalDays = new Date(year, month + 1, 0).getDate();

    // First day of month (0 = Sun, 1 = Mon ... 6 = Sat)
    // Convert to Monday-first (0 = Mon, 6 = Sun)
    const firstDayIndex = new Date(year, month, 1).getDay();
    const blanks = (firstDayIndex + 6) % 7;

    // Count workouts in this viewed month
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
      leadingBlanks: blanks
    };
  }, [currentDate, workoutMap]);

  // Handlers for month navigation
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

  // Toggle or add workout for a specific date
  const handleQuickHitGym = (targetDateStr: string = todayStr) => {
    const existing = workoutMap.get(targetDateStr) || [];
    if (existing.length > 0) {
      // If already logged today, remove it if tapped directly from button or show notice
      return;
    }

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `w_${Date.now()}`;
    addWorkout({
      id: newId,
      date: targetDateStr,
      exercises: [
        {
          name: 'Gym Session',
          sets: [{ reps: 1, weight: 0, unit: 'kg' }]
        }
      ]
    });
  };

  const handleRemoveWorkout = (id: string) => {
    deleteWorkout(id);
  };

  const selectedWorkouts = selectedDate ? workoutMap.get(selectedDate) || [] : [];
  const isSelectedDateFuture = selectedDate ? selectedDate > todayStr : false;

  return (
    <div className="card space-y-4">
      {/* Header with Title and Useful Activity Summary (Item 10) */}
      <div className="flex items-start justify-between">
        <div>
          <span className="section-title text-[11px] block">{monthName} Activity</span>
          <div className="mt-1">
            <span className="text-2xl font-black text-text-primary block font-sans">
              {monthWorkoutsCount} {monthWorkoutsCount === 1 ? 'day' : 'days'} trained
            </span>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5 font-medium">
              <Flame className="w-3.5 h-3.5 text-accent fill-accent" />
              <span>Current streak: <strong>{currentStreak} {currentStreak === 1 ? 'day' : 'days'}</strong></span>
            </p>
          </div>
        </div>

        {/* Quick Month Navigation */}
        <div className="flex items-center gap-1 pt-1">
          {(currentDate.getMonth() !== today.getMonth() || currentDate.getFullYear() !== today.getFullYear()) && (
            <button
              type="button"
              onClick={resetToToday}
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5 mr-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Today</span>
            </button>
          )}
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors active:scale-95"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors active:scale-95"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* "I Hit Gym Today" Primary Action Button */}
      <div className="pt-1">
        {isTodayLogged ? (
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary leading-tight">Gym Hit Today</p>
                <p className="text-2xs text-emerald-500/80 font-mono">
                  {todayWorkouts.length} session{todayWorkouts.length > 1 ? 's' : ''} recorded for today
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('workout')}
                  className="px-2.5 py-1.5 rounded-lg bg-bg-card border border-border text-xs font-medium text-text-primary hover:border-accent/50 transition-colors"
                >
                  Log Details
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleQuickHitGym(todayStr)}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-full font-semibold text-sm transition-all duration-200 shadow-sm active:scale-[0.98] bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/20"
          >
            <Dumbbell className="w-4 h-4 stroke-[2.2]" />
            <span>I Hit Gym Today</span>
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border/60 pt-1" />

      {/* Monthly Calendar Grid */}
      <div className="space-y-1.5">
        {/* Day-of-week Headers (Mon - Sun) */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-2xs text-text-muted font-medium">
          <span>Mo</span>
          <span>Tu</span>
          <span>We</span>
          <span>Th</span>
          <span>Fr</span>
          <span>Sa</span>
          <span>Su</span>
        </div>

        {/* Days Matrix */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* Leading blank slots */}
          {Array.from({ length: leadingBlanks }).map((_, idx) => (
            <div key={`blank-${idx}`} className="aspect-square rounded-lg opacity-10" />
          ))}

          {/* Days of the month */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const dateStr = `${yearNum}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = selectedDate === dateStr;
            const isFuture = dateStr > todayStr;
            const dayWorkouts = workoutMap.get(dateStr) || [];
            const hasWorkout = dayWorkouts.length > 0;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-mono transition-all duration-150 relative select-none ${
                  hasWorkout
                    ? 'bg-emerald-500 text-white font-bold shadow-sm shadow-emerald-500/30 hover:bg-emerald-400'
                    : isFuture
                    ? 'bg-bg-secondary/40 text-text-muted/40 cursor-default'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-elevated border border-border/50'
                } ${
                  isToday
                    ? hasWorkout
                      ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-card'
                      : 'border-2 border-accent text-accent font-bold ring-1 ring-accent/30'
                    : ''
                } ${
                  isSelected ? 'scale-105 z-10 ring-2 ring-white/80 shadow-md' : ''
                }`}
              >
                <span>{dayNum}</span>
                {hasWorkout && (
                  <span className="w-1 h-1 rounded-full bg-white mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details & Direct Action Drawer */}
      {selectedDate && (
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-border/70 animate-fade-in text-xs space-y-2">
          <div className="flex justify-between items-center font-mono">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-text-primary text-sm">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
              {selectedDate === todayStr && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/15 text-accent font-semibold">
                  TODAY
                </span>
              )}
            </div>

            <span className="text-text-muted text-2xs">
              {selectedWorkouts.length === 0
                ? isSelectedDateFuture
                  ? 'Upcoming'
                  : 'Rest Day'
                : `${selectedWorkouts.length} Workout${selectedWorkouts.length > 1 ? 's' : ''}`}
            </span>
          </div>

          {selectedWorkouts.length > 0 ? (
            <div className="space-y-2 pt-1">
              {selectedWorkouts.map((w) => {
                const exerciseSummary = w.exercises
                  .map((e) => e.name)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-bg-card border border-border"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-text-primary font-medium truncate">
                        {exerciseSummary || 'Gym Session'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveWorkout(w.id)}
                      className="text-text-muted hover:text-danger p-1 rounded transition-colors"
                      title="Remove this workout session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            !isSelectedDateFuture && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-text-muted text-[11px]">No workout recorded for this date.</p>
                <button
                  type="button"
                  onClick={() => handleQuickHitGym(selectedDate)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-elevated border border-border text-text-primary hover:border-emerald-500/50 hover:text-emerald-400 font-medium text-xs transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Mark as Gym Day</span>
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
