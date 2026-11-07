'use client';

import React, { useMemo } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalDateString } from '@/lib/habits';
import { formatDateShort, getLocalTodayStr } from '@/lib/formatters';
import { useToday } from '@/lib/use-today';
import type { WorkoutEntry, MealEntry, CreatineLog } from '@/lib/types';
import { useTranslation, weekdayNames } from '@/lib/i18n';
import { HABIT_FILL, HABIT_LABEL_CLASS, HABIT_ON_FILL, type HabitId } from '@/lib/habit-tokens';

interface WeeklyHabitMatrixProps {
  workouts: WorkoutEntry[];
  waterLogs: Record<string, number>;
  creatineLogs: Record<string, CreatineLog>;
  meals: MealEntry[];
  waterTargetMl: number;
  proteinTargetG: number | null;
  /** Monday of the week to display. */
  weekStart: Date;
  /** When provided, renders prev/next week navigation. */
  onWeekChange?: (direction: -1 | 1) => void;
  onSelectDate?: (dateStr: string) => void;
  /** Compact: no navigation, tighter cells (Home card). */
  compact?: boolean;
  /** Simple density (Home card): show only today's column. */
  todayOnly?: boolean;
  /** Hide the creatine row (minors, or creatine tracking disabled) —
   *  an always-empty CREAT row reads as a daily failure. */
  showCreatine?: boolean;
}

const DAY_LETTERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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
  todayOnly = false,
  showCreatine = true,
}: WeeklyHabitMatrixProps) {
  const { t, language } = useTranslation();
  const todayStr = useToday();

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return { date: d, dateStr: toLocalDateString(d), letter: weekdayNames(language, 'short')[i] };
    });
    // Simple density renders only today's column; the week strip and
    // rows filter to the same single day so header and cells align.
    // (Falls back to the full week if today is outside this week.)
    const filtered = todayOnly ? all.filter((d) => d.dateStr === todayStr) : all;
    return filtered.length ? filtered : all;
  }, [weekStart, language, todayOnly, todayStr]);

  // Live-fix L2: a single day stretched flex-1 across the card reads as
  // a progress bar, not a day cell — cap single-day cells to a fixed
  // width so the Simple view reads as one day, honestly.
  const singleDay = days.length === 1;

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

  // Phase 4, Task 4.4 (P2-3): rows key into the shared habit tokens
  // (src/lib/habit-tokens.ts) — fills and label classes come from
  // there, not a local hex table. Gauntlet A11Y-04 still holds: label
  // TEXT uses the per-theme .matrix-row-label-* classes, never the
  // bright fill colour.
  const rows: { id: HabitId; label: string; done: (dateStr: string) => boolean }[] = [
    { id: 'workout', label: t('habit.gym'), done: (d) => workoutDays.has(d) },
    { id: 'water', label: t('habit.water'), done: (d) => (waterLogs[d] || 0) >= waterTargetMl * 0.85 },
    ...(showCreatine
      ? [{ id: 'creatine' as HabitId, label: t('habit.creatine'), done: (d: string) => !!creatineLogs[d]?.taken }]
      : []),
    { id: 'protein', label: t('habit.protein'), done: (d) => proteinTargetG !== null && (proteinMap.get(d) || 0) >= proteinTargetG * 0.85 },
  ];

  const rangeLabel = `${formatDateShort(getLocalTodayStr(days[0].date), language === 'hi' ? 'hi-IN' : 'en-US')} – ${formatDateShort(getLocalTodayStr(days[days.length - 1].date), language === 'hi' ? 'hi-IN' : 'en-US')}`;

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
        <span className="w-16 shrink-0" aria-hidden="true" />
        <div className="flex items-center gap-1 flex-1">
          {days.map((d) => (
            <div
              key={d.dateStr}
              className={`${singleDay ? 'w-10 shrink-0' : 'flex-1'} text-center text-[0.5625rem] ${d.dateStr === todayStr ? 'text-accent-text font-bold' : 'text-text-muted'}`}
            >
              {d.letter} {d.date.getDate()}
            </div>
          ))}
        </div>
      </div>

      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-1.5">
          <span
            className={`w-16 shrink-0 text-2xs font-sans uppercase font-bold ${HABIT_LABEL_CLASS[row.id]}`}
          >
            {row.label}
          </span>
          <div className="flex items-center gap-1 flex-1">
            {days.map((d) => {
              const done = row.done(d.dateStr);
              const isToday = d.dateStr === todayStr;
              const cellClass = `${compact ? 'h-5' : 'h-6'} ${singleDay ? 'w-10 shrink-0' : 'flex-1'} rounded flex items-center justify-center ${
                onSelectDate ? 'cursor-pointer' : ''
              } ${done ? '' : 'bg-bg-secondary border border-border/40'} ${isToday && !done ? 'ring-1 ring-accent/60' : ''}`;
              // Phase 4, Task 4.4: done is not colour alone — a check
              // glyph rides the fill, and the accessible name states it.
              const glyph = done ? (
                <Check className="w-3 h-3" strokeWidth={3.5} style={{ color: HABIT_ON_FILL[row.id] }} aria-hidden="true" />
              ) : null;
              // Gauntlet A11Y-01: date cells were mouse-only <span
              // onClick> — invisible to keyboard and screen-reader users.
              // Clickable cells are real buttons now (with an accessible
              // name); non-clickable cells stay plain spans.
              return onSelectDate ? (
                <button
                  key={d.dateStr}
                  type="button"
                  onClick={() => onSelectDate(d.dateStr)}
                  aria-label={`${row.label} — ${d.dateStr}${done ? ` — ${t('habit.done')}` : ''}`}
                  title={`${row.label} — ${d.dateStr}`}
                  className={cellClass}
                  style={done ? { backgroundColor: HABIT_FILL[row.id] } : undefined}
                >
                  {glyph}
                </button>
              ) : (
                <span
                  key={d.dateStr}
                  className={cellClass}
                  style={done ? { backgroundColor: HABIT_FILL[row.id] } : undefined}
                  title={`${row.label} — ${d.dateStr}`}
                >
                  {glyph}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
