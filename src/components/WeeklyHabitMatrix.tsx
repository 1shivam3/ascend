'use client';

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalDateString } from '@/lib/habits';
import { useToday } from '@/lib/use-today';
import type { WorkoutEntry, MealEntry, CreatineLog } from '@/lib/types';
import { useTranslation, weekdayNames } from '@/lib/i18n';

interface WeeklyHabitMatrixProps {
  workouts: WorkoutEntry[];
  waterLogs: Record<string, number>;
  creatineLogs: Record<string, CreatineLog>;
  meals: MealEntry[];
  waterTargetMl: number;
  proteinTargetG: number;
  /** Monday of the week to display. */
  weekStart: Date;
  /** When provided, renders prev/next week navigation. */
  onWeekChange?: (direction: -1 | 1) => void;
  onSelectDate?: (dateStr: string) => void;
  /** Compact: no navigation, tighter cells (Home card). */
  compact?: boolean;
  /** Hide the creatine row (minors, or creatine tracking disabled) —
   *  an always-empty CREAT row reads as a daily failure. */
  showCreatine?: boolean;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * One-week habit matrix (Mon–Sun): Gym / Water / Creatine / Protein rows.
 * Replaces the old whole-month matrix whose columns overflowed the card —
 * a week always fits. Same done-rules as the calendar view: water and
 * protein count at >= 85% of target, creatine needs the day's log taken,
 * gym needs a logged workout.
 */
export default function WeeklyHabitMatrix({
  workouts,
  waterLogs,
  creatineLogs,
  meals,
  waterTargetMl,
  proteinTargetG,
  weekStart,
  onWeekChange,
  onSelectDate,
  compact = false,
  showCreatine = true,
}: WeeklyHabitMatrixProps) {
  const { t, language } = useTranslation();
  const todayStr = useToday();

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return { date: d, dateStr: toLocalDateString(d), letter: weekdayNames(language, 'short')[i] };
    });
  }, [weekStart, language]);

  const workoutDays = useMemo(() => {
    const set = new Set<string>();
    for (const w of workouts) {
      if (w.date) set.add(w.date.split('T')[0]);
    }
    return set;
  }, [workouts]);

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

  const rows: { label: string; color: string; done: (dateStr: string) => boolean }[] = [
    { label: t('habit.gym'), color: '#FF6A1A', done: (d) => workoutDays.has(d) },
    { label: t('habit.water'), color: '#38BDF8', done: (d) => (waterLogs[d] || 0) >= waterTargetMl * 0.85 },
    ...(showCreatine
      ? [{ label: t('habit.creatine'), color: '#F5B301', done: (d: string) => !!creatineLogs[d]?.taken }]
      : []),
    { label: t('habit.protein'), color: '#22C55E', done: (d) => (proteinMap.get(d) || 0) >= proteinTargetG * 0.85 },
  ];

  const rangeLabel = `${days[0].date.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', { month: 'short', day: 'numeric' })} – ${days[6].date.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <div className="space-y-1.5 text-xs font-mono">
      {!compact && (
        <div className="flex items-center justify-between px-0.5 pb-1">
          <button
            type="button"
            onClick={() => onWeekChange?.(-1)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label={t('habit.prevWeek')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-2xs font-bold text-text-secondary tabular-nums">{rangeLabel}</span>
          <button
            type="button"
            onClick={() => onWeekChange?.(1)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label={t('habit.nextWeek')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Days header strip */}
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0" aria-hidden="true" />
        <div className="flex items-center gap-1 flex-1">
          {days.map((d) => (
            <div
              key={d.dateStr}
              className={`flex-1 text-center text-[9px] ${d.dateStr === todayStr ? 'text-accent font-bold' : 'text-text-muted'}`}
            >
              {d.letter} {d.date.getDate()}
            </div>
          ))}
        </div>
      </div>

      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] uppercase font-bold" style={{ color: row.color }}>
            {row.label}
          </span>
          <div className="flex items-center gap-1 flex-1">
            {days.map((d) => {
              const done = row.done(d.dateStr);
              const isToday = d.dateStr === todayStr;
              const cellClass = `${compact ? 'h-5' : 'h-6'} flex-1 rounded ${
                onSelectDate ? 'cursor-pointer' : ''
              } ${done ? '' : 'bg-bg-secondary border border-border/40'} ${isToday && !done ? 'ring-1 ring-accent/60' : ''}`;
              return (
                <span
                  key={d.dateStr}
                  onClick={onSelectDate ? () => onSelectDate(d.dateStr) : undefined}
                  className={cellClass}
                  style={done ? { backgroundColor: row.color } : undefined}
                  title={`${row.label} — ${d.dateStr}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
