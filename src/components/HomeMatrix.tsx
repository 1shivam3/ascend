'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation, weekdayNames } from '@/lib/i18n';
import { useToday } from '@/lib/use-today';
import SegmentedControl from '@/components/ui/SegmentedControl';
import {
  getDaySummary,
  mondayOfWeek,
  monthGrid,
  toDateStr,
  weekDays,
  type MatrixHabitId,
  type MatrixInputs,
} from '@/lib/home-matrix';

export type MatrixView = 'weekly' | 'monthly';

interface HomeMatrixProps extends MatrixInputs {
  /** Persisted default from Settings — what the widget opens as. */
  defaultView: MatrixView;
}

const ROW_COLORS: Record<MatrixHabitId, string> = {
  workout: '#FF6A1A',
  water: '#38BDF8',
  creatine: '#F5B301',
  protein: '#22C55E',
};

/**
 * Homepage habit + workout matrix. Quiet by design: no popups, no
 * badges, no forced choices. Tapping a date opens an inline detail
 * panel under the grid — not a route, not a history push — so the
 * back button and refresh are completely untouched by this widget.
 */
export default function HomeMatrix({
  workouts,
  meals,
  waterLogs,
  creatineLogs,
  waterTargetMl,
  proteinTargetG,
  showCreatine,
  defaultView,
}: HomeMatrixProps) {
  const { t, language } = useTranslation();
  const todayStr = useToday();
  const [view, setView] = useState<MatrixView>(defaultView);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeek(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);

  const inputs: MatrixInputs = useMemo(
    () => ({ workouts, meals, waterLogs, creatineLogs, waterTargetMl, proteinTargetG, showCreatine }),
    [workouts, meals, waterLogs, creatineLogs, waterTargetMl, proteinTargetG, showCreatine],
  );

  const rowIds: MatrixHabitId[] = useMemo(
    () => (showCreatine ? ['workout', 'water', 'creatine', 'protein'] : ['workout', 'water', 'protein']),
    [showCreatine],
  );
  const rowLabel: Record<MatrixHabitId, string> = {
    workout: t('homeMatrix.workout'),
    water: t('homeMatrix.water'),
    creatine: t('homeMatrix.creatine'),
    protein: t('homeMatrix.protein'),
  };

  const toggleDate = (dateStr: string) =>
    setSelected((prev) => (prev === dateStr ? null : dateStr));

  const summary = useMemo(
    () => (selected ? getDaySummary(selected, inputs) : null),
    [selected, inputs],
  );

  const week = useMemo(() => weekDays(weekStart), [weekStart]);
  const weeks = useMemo(() => monthGrid(monthAnchor.year, monthAnchor.month), [monthAnchor]);
  const locale = language === 'hi' ? 'hi-IN' : 'en-US';
  const dayLetters = weekdayNames(language, 'short');

  const goToday = () => {
    const now = new Date();
    setWeekStart(mondayOfWeek(now));
    setMonthAnchor({ year: now.getFullYear(), month: now.getMonth() });
  };

  const weekLabel = `${week[0].toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – ${week[6].toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`;
  const monthLabel = new Date(monthAnchor.year, monthAnchor.month, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  const detailTitle = selected
    ? new Date(`${selected}T00:00:00`).toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="space-y-3">
      {/* Header: title + Weekly/Monthly toggle (widget-local; the
          persisted default lives in Settings and decides the opener). */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-text-primary">{t('homeMatrix.title')}</span>
        <SegmentedControl
          ariaLabel={t('homeMatrix.title')}
          value={view}
          options={[
            { value: 'weekly', label: t('homeMatrix.weekly') },
            { value: 'monthly', label: t('homeMatrix.monthly') },
          ]}
          onChange={(v) => setView(v as MatrixView)}
        />
      </div>

      {/* Navigation: prev / label / next / Today */}
      <div className="flex items-center justify-between px-0.5">
        <button
          type="button"
          onClick={() => {
            if (view === 'weekly') {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d);
            } else {
              setMonthAnchor((a) => {
                const d = new Date(a.year, a.month - 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              });
            }
          }}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
          aria-label={view === 'weekly' ? t('homeMatrix.prevWeek') : t('homeMatrix.prevMonth')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-2xs font-bold text-text-secondary tabular-nums">
          {view === 'weekly' ? weekLabel : monthLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToday}
            className="px-2 py-1 rounded-lg text-2xs font-bold text-accent-text hover:bg-bg-secondary transition-colors cursor-pointer"
          >
            {t('homeMatrix.today')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (view === 'weekly') {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(d);
              } else {
                setMonthAnchor((a) => {
                  const d = new Date(a.year, a.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                });
              }
            }}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label={view === 'weekly' ? t('homeMatrix.nextWeek') : t('homeMatrix.nextMonth')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view === 'weekly' ? (
        <div className="space-y-1.5 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-14 shrink-0" aria-hidden="true" />
            <div className="flex items-center gap-1 flex-1">
              {week.map((d) => {
                const ds = toDateStr(d);
                const isToday = ds === todayStr;
                const isSelected = ds === selected;
                return (
                  <button
                    key={ds}
                    type="button"
                    onClick={() => toggleDate(ds)}
                    aria-pressed={isSelected}
                    className={`flex-1 text-center text-[0.5625rem] rounded py-0.5 cursor-pointer ${
                      isSelected
                        ? 'bg-accent/15 text-accent-text font-bold ring-1 ring-accent/60'
                        : isToday
                          ? 'text-accent-text font-bold'
                          : 'text-text-muted'
                    }`}
                  >
                    {dayLetters[(d.getDay() + 6) % 7]} {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
          {rowIds.map((id) => (
            <div key={id} className="flex items-center gap-1.5">
              <span className={`w-14 shrink-0 text-[0.625rem] uppercase font-bold matrix-row-label-${id}`}>
                {rowLabel[id]}
              </span>
              <div className="flex items-center gap-1 flex-1">
                {week.map((d) => {
                  const ds = toDateStr(d);
                  const done = getDaySummary(ds, inputs).habits.find((h) => h.id === id)?.done ?? false;
                  const isToday = ds === todayStr;
                  // Gauntlet UX-06: weekly-view day cells were h-5 (20px),
                  // below the 24px WCAG target-size minimum — now h-6.
                  return (
                    <button
                      key={ds}
                      type="button"
                      onClick={() => toggleDate(ds)}
                      aria-label={`${rowLabel[id]} — ${ds}`}
                      className={`h-6 flex-1 rounded cursor-pointer ${
                        done ? '' : 'bg-bg-secondary border border-border/40'
                      } ${isToday && !done ? 'ring-1 ring-accent/60' : ''} ${
                        ds === selected ? 'ring-1 ring-accent' : ''
                      }`}
                      style={done ? { backgroundColor: ROW_COLORS[id] } : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-7 gap-1">
            {dayLetters.map((letter, i) => (
              <div key={i} className="text-center text-[0.5625rem] text-text-muted font-mono">
                {letter}
              </div>
            ))}
          </div>
          {weeks.map((days, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {days.map((d, di) => {
                if (!d) return <span key={di} aria-hidden="true" />;
                const ds = toDateStr(d);
                const s = getDaySummary(ds, inputs);
                const isToday = ds === todayStr;
                const isSelected = ds === selected;
                return (
                  <button
                    key={ds}
                    type="button"
                    onClick={() => toggleDate(ds)}
                    aria-pressed={isSelected}
                    aria-label={ds}
                    className={`min-h-[44px] rounded-lg flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      isSelected
                        ? 'bg-accent/15 ring-1 ring-accent'
                        : isToday
                          ? 'ring-1 ring-accent/60'
                          : 'hover:bg-bg-secondary'
                    }`}
                  >
                    <span className={`text-xs font-mono ${isToday ? 'text-accent-text font-bold' : 'text-text-primary'}`}>
                      {d.getDate()}
                    </span>
                    <span className="flex gap-0.5" aria-hidden="true">
                      {s.habits
                        .filter((h) => h.done)
                        .map((h) => (
                          <span
                            key={h.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: ROW_COLORS[h.id] }}
                          />
                        ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Inline day detail — not a route, not a history entry. */}
      {summary && (
        <div className="rounded-xl border border-border/60 bg-bg-secondary/40 px-3 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-primary">{detailTitle}</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label={t('common.close')}
              className="p-1 min-h-[28px] min-w-[28px] inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {summary.empty ? (
            <p className="text-2xs text-text-muted">{t('homeMatrix.emptyDay')}</p>
          ) : (
            <>
              <div>
                <p className="text-2xs font-bold uppercase tracking-wide text-text-muted mb-1">
                  {t('homeMatrix.workouts')}
                </p>
                {summary.workouts.length === 0 ? (
                  <p className="text-2xs text-text-muted">{t('homeMatrix.noWorkout')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {summary.workouts.map((w) => (
                      <li key={w.id}>
                        <p className="text-xs font-semibold text-text-primary">{w.name || t('homeMatrix.workout')}</p>
                        <p className="text-2xs text-text-muted">
                          {(w.exercises ?? [])
                            .map((ex) => `${ex.name} · ${(ex.sets ?? []).length} sets`)
                            .join(' • ') || t('homeMatrix.noWorkout')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-2xs font-bold uppercase tracking-wide text-text-muted mb-1">
                  {t('homeMatrix.meals')}
                </p>
                {summary.meals.length === 0 ? (
                  <p className="text-2xs text-text-muted">{t('homeMatrix.noMeals')}</p>
                ) : (
                  <>
                    <ul className="space-y-1.5">
                      {summary.meals.map((m) => (
                        <li key={m.id}>
                          <p className="text-xs font-semibold text-text-primary">{m.name}</p>
                          <p className="text-2xs text-text-muted">
                            {(m.foods ?? []).map((f) => f.name).join(', ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="text-2xs font-mono text-text-secondary mt-1.5">
                      {Math.round(summary.macros.calories)} kcal · P {Math.round(summary.macros.proteinG)}g · C{' '}
                      {Math.round(summary.macros.carbsG)}g · F {Math.round(summary.macros.fatG)}g
                    </p>
                  </>
                )}
              </div>
              <div>
                <p className="text-2xs font-bold uppercase tracking-wide text-text-muted mb-1">
                  {t('homeMatrix.habits')}
                </p>
                <ul className="space-y-1">
                  {summary.habits.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 text-2xs">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: h.done ? ROW_COLORS[h.id] : 'transparent' }}
                      />
                      <span className={h.done ? 'text-text-primary font-semibold' : 'text-text-muted'}>
                        {rowLabel[h.id]}
                      </span>
                      <span className="text-text-muted ml-auto tabular-nums">
                        {h.id === 'water' && h.target !== null
                          ? `${h.value} / ${h.target} ml`
                          : h.id === 'protein' && h.target !== null
                            ? `${Math.round(h.value)} / ${h.target} g`
                            : h.id === 'workout'
                              ? `${h.value}`
                              : h.done
                                ? t('homeMatrix.done')
                                : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
