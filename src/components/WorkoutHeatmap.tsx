'use client';

import React, { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { Flame, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';

export default function WorkoutHeatmap() {
  const workouts = useStore((state) => state.workouts);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Group workouts by date (YYYY-MM-DD)
  const workoutMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workouts) {
      if (!w.date) continue;
      const d = w.date.split('T')[0];
      map.set(d, (map.get(d) || 0) + 1);
    }
    return map;
  }, [workouts]);

  // Compute current streak and total active days this year
  const { currentStreak, activeDaysYear, weeks } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    let activeCount = 0;

    for (const [dateStr, count] of workoutMap.entries()) {
      if (count > 0 && dateStr.startsWith(`${currentYear}`)) {
        activeCount++;
      }
    }

    // Calculate current streak
    let streak = 0;
    const checkDate = new Date();
    const todayStr = checkDate.toISOString().split('T')[0];
    const hasWorkoutToday = (workoutMap.get(todayStr) || 0) > 0;

    if (!hasWorkoutToday) {
      // Check if trained yesterday to keep streak alive
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const dStr = checkDate.toISOString().split('T')[0];
      if ((workoutMap.get(dStr) || 0) > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Generate past 16 weeks of day cells (112 days)
    // Ending on the upcoming Saturday
    const daysToShow = 16 * 7;
    const endDate = new Date(now);
    const dayOfWeek = endDate.getDay(); // 0 is Sun, 6 is Sat
    endDate.setDate(endDate.getDate() + (6 - dayOfWeek));

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - daysToShow + 1);

    const generatedWeeks: Array<Array<{ date: string; dayNum: number; count: number; isFuture: boolean; isToday: boolean }>> = [];
    let currentWeek: Array<{ date: string; dayNum: number; count: number; isFuture: boolean; isToday: boolean }> = [];

    const iter = new Date(startDate);
    const todayFormatted = now.toISOString().split('T')[0];

    while (iter <= endDate) {
      const iterStr = iter.toISOString().split('T')[0];
      const count = workoutMap.get(iterStr) || 0;
      const isFuture = iter > now;
      const isToday = iterStr === todayFormatted;

      currentWeek.push({
        date: iterStr,
        dayNum: iter.getDate(),
        count,
        isFuture,
        isToday
      });

      if (currentWeek.length === 7) {
        generatedWeeks.push(currentWeek);
        currentWeek = [];
      }

      iter.setDate(iter.getDate() + 1);
    }

    return {
      currentStreak: streak,
      activeDaysYear: activeCount,
      weeks: generatedWeeks
    };
  }, [workoutMap]);

  const selectedWorkouts = useMemo(() => {
    if (!selectedDate) return [];
    return workouts.filter((w) => w.date.split('T')[0] === selectedDate);
  }, [selectedDate, workouts]);

  return (
    <div className="card space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-accent" />
          <h2 className="section-title mb-0">ACTIVITY HEATMAP</h2>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1 text-emerald-500 font-semibold">
            <Flame className="w-3.5 h-3.5 fill-emerald-500" />
            <span>{currentStreak}d streak</span>
          </div>
          <span className="text-text-muted">•</span>
          <span className="text-text-secondary">{activeDaysYear} sessions</span>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
        <div className="inline-flex flex-col gap-1 min-w-full">
          <div className="flex gap-1.5">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1.5">
                {week.map((day) => {
                  const hasWorkout = day.count > 0;
                  const isSelected = selectedDate === day.date;

                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={day.isFuture}
                      onClick={() => setSelectedDate(isSelected ? null : day.date)}
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm transition-all relative ${
                        day.isFuture
                          ? 'opacity-20 bg-bg-secondary cursor-default'
                          : hasWorkout
                          ? day.count > 1
                            ? 'bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.35)]'
                            : 'bg-emerald-600 hover:bg-emerald-500'
                          : 'bg-bg-secondary hover:bg-bg-elevated border border-border/40'
                      } ${isSelected ? 'ring-2 ring-accent scale-125 z-10' : ''} ${
                        day.isToday && !hasWorkout ? 'border-accent/80 ring-1 ring-accent/30' : ''
                      }`}
                      title={`${day.date}: ${day.count} workout${day.count === 1 ? '' : 's'}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Days label & legend */}
          <div className="flex items-center justify-between text-2xs text-text-muted font-mono pt-1">
            <span>Last 16 weeks</span>
            <div className="flex items-center gap-1.5">
              <span>Less</span>
              <div className="w-2.5 h-2.5 rounded-sm bg-bg-secondary border border-border/50" />
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm" />
              <span>More</span>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Day Details Popup/Card */}
      {selectedDate && (
        <div className="p-3 rounded-lg bg-bg-secondary border border-border animate-fade-in text-xs">
          <div className="flex justify-between items-center mb-1.5 font-mono">
            <span className="font-semibold text-text-primary">
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </span>
            <span className="text-text-muted">
              {selectedWorkouts.length === 0 ? 'Rest Day' : `${selectedWorkouts.length} workout(s)`}
            </span>
          </div>

          {selectedWorkouts.length > 0 ? (
            <div className="space-y-1">
              {selectedWorkouts.map((w) => (
                <div key={w.id} className="flex items-center gap-1.5 text-text-secondary">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="truncate">
                    {w.exercises.map((e) => e.name).filter(Boolean).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-[11px]">No workouts logged on this day.</p>
          )}
        </div>
      )}
    </div>
  );
}
