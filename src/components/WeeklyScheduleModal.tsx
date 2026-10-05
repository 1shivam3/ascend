'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Sparkles,
  Check,
  Dumbbell,
  Coffee,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import {
  DayOfWeek,
  DayScheduleConfig,
  WeeklySchedule,
  PlannedWorkout,
} from '@/lib/types';
import {
  DAYS_OF_WEEK,
  DAY_DISPLAY_INFO,
  AVAILABLE_BODY_PARTS,
  getWorkoutBodyParts,
  buildDefaultWeeklySchedule,
  getTodayDayOfWeek,
} from '@/lib/workout-schedule';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

interface WeeklyScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  plannedWorkouts: PlannedWorkout[];
  initialDay?: DayOfWeek;
}

export default function WeeklyScheduleModal({
  isOpen,
  onClose,
  plannedWorkouts,
  initialDay,
}: WeeklyScheduleModalProps) {
  const toast = useToast();
  const currentWeeklySchedule = useStore((state) => state.weeklySchedule);
  const setWeeklySchedule = useStore((state) => state.setWeeklySchedule);
  const trainingProfile = useStore((state) => state.trainingProfile);

  const [draft, setDraft] = useState<WeeklySchedule>(() => {
    if (
      currentWeeklySchedule &&
      Object.keys(currentWeeklySchedule).length > 0 &&
      Object.values(currentWeeklySchedule).some((d) => d.workoutPlanId)
    ) {
      return currentWeeklySchedule;
    }
    return buildDefaultWeeklySchedule(plannedWorkouts, trainingProfile?.daysPerWeek || 4);
  });

  const todayDay = getTodayDayOfWeek();

  // Keep draft updated when modal opens
  useEffect(() => {
    if (isOpen) {
      if (
        currentWeeklySchedule &&
        Object.keys(currentWeeklySchedule).length > 0 &&
        Object.values(currentWeeklySchedule).some((d) => d.workoutPlanId)
      ) {
        setDraft(currentWeeklySchedule);
      } else {
        setDraft(buildDefaultWeeklySchedule(plannedWorkouts, trainingProfile?.daysPerWeek || 4));
      }
    }
  }, [isOpen, currentWeeklySchedule, plannedWorkouts, trainingProfile?.daysPerWeek]);

  if (!isOpen) return null;

  const handleDayPlanSelect = (day: DayOfWeek, planId: string) => {
    if (planId === 'rest') {
      setDraft((prev) => ({
        ...prev,
        [day]: {
          workoutPlanId: 'rest',
          customTitle: 'Rest Day',
          bodyParts: [],
        },
      }));
      return;
    }

    const matched = plannedWorkouts.find((p) => p.id === planId);
    const bodyParts = matched ? getWorkoutBodyParts(matched.exercises) : [];

    setDraft((prev) => ({
      ...prev,
      [day]: {
        workoutPlanId: planId,
        customTitle: matched?.name || 'Workout',
        bodyParts,
      },
    }));
  };

  const handleToggleBodyPart = (day: DayOfWeek, part: string) => {
    setDraft((prev) => {
      const currentDay = prev[day] || { workoutPlanId: 'rest', bodyParts: [] };
      const currentParts = currentDay.bodyParts || [];
      const exists = currentParts.includes(part);
      const nextParts = exists
        ? currentParts.filter((p) => p !== part)
        : [...currentParts, part];

      return {
        ...prev,
        [day]: {
          ...currentDay,
          bodyParts: nextParts,
        },
      };
    });
  };

  const applyPreset = (daysCount: number) => {
    const newSched = buildDefaultWeeklySchedule(plannedWorkouts, daysCount);
    setDraft(newSched);
    toast.info(`Applied ${daysCount}-day schedule preset!`, 'Preset Loaded');
  };

  const handleSave = () => {
    setWeeklySchedule(draft);
    toast.success('Your weekly training schedule has been saved!', 'Schedule Updated');
    onClose();
  };

  // Count active training days in draft
  const activeTrainingDays = Object.values(draft).filter(
    (d) => d.workoutPlanId && d.workoutPlanId !== 'rest'
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-xl max-h-[90vh] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="p-4 sm:p-5 border-b border-border flex items-center justify-between shrink-0 bg-bg-card">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
                Weekly Training Schedule
              </h2>
              <p className="text-2xs sm:text-xs text-text-muted">
                Choose which day of the week you train which body parts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Schedule Presets bar */}
        <div className="px-4 py-2.5 bg-bg-secondary/60 border-b border-border/60 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted shrink-0">
            PRESETS:
          </span>
          {[
            { label: '3-Day Full Body', days: 3 },
            { label: '4-Day Upper/Lower', days: 4 },
            { label: '5-Day Split', days: 5 },
            { label: '6-Day PPL', days: 6 },
          ].map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => applyPreset(p.days)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${
                activeTrainingDays === p.days
                  ? 'bg-accent text-white border-accent shadow-xs'
                  : 'bg-bg-card text-text-secondary border-border/80 hover:border-accent/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Days List (Monday to Sunday) */}
        <main className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
          {DAYS_OF_WEEK.map((day) => {
            const info = DAY_DISPLAY_INFO[day];
            const dayConfig = draft[day] || { workoutPlanId: 'rest', bodyParts: [] };
            const isRest = !dayConfig.workoutPlanId || dayConfig.workoutPlanId === 'rest';
            const isToday = day === todayDay;

            return (
              <div
                key={day}
                className={`p-3.5 rounded-xl border transition-all ${
                  day === initialDay
                    ? 'border-accent bg-accent/10 ring-2 ring-accent shadow-md'
                    : isToday
                    ? 'border-accent bg-accent/5 shadow-xs'
                    : isRest
                    ? 'border-border/60 bg-bg-secondary/30'
                    : 'border-border/80 bg-bg-secondary/60'
                }`}
              >
                {/* Day Row Header */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black font-mono uppercase tracking-wider text-text-primary">
                      {info.label}
                    </span>
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded-md bg-accent text-white text-3xs font-bold font-mono">
                        TODAY
                      </span>
                    )}
                  </div>

                  {/* Quick Toggle: Train vs Rest */}
                  <div className="flex items-center bg-bg-card rounded-lg border border-border/80 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const fallbackPlan = plannedWorkouts[0]?.id || 'custom';
                        handleDayPlanSelect(day, fallbackPlan);
                      }}
                      className={`px-2 py-0.5 rounded text-2xs font-bold transition-all flex items-center gap-1 ${
                        !isRest
                          ? 'bg-accent text-white shadow-xs'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      <Dumbbell className="w-3 h-3" />
                      <span>Train</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDayPlanSelect(day, 'rest')}
                      className={`px-2 py-0.5 rounded text-2xs font-bold transition-all flex items-center gap-1 ${
                        isRest
                          ? 'bg-bg-secondary text-text-primary font-bold shadow-xs'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      <Coffee className="w-3 h-3" />
                      <span>Rest</span>
                    </button>
                  </div>
                </div>

                {/* Training Day Details */}
                {!isRest ? (
                  <div className="space-y-2.5 pt-1 border-t border-border/40">
                    {/* Workout plan dropdown */}
                    <div className="flex items-center gap-2">
                      <span className="text-3xs font-mono font-bold uppercase text-text-muted shrink-0">
                        ROUTINE:
                      </span>
                      <div className="relative flex-1">
                        <select
                          value={dayConfig.workoutPlanId || ''}
                          onChange={(e) => handleDayPlanSelect(day, e.target.value)}
                          className="w-full text-xs font-semibold py-1.5 px-3 rounded-lg bg-bg-card border border-border/80 text-text-primary outline-none focus:border-accent appearance-none pr-8 cursor-pointer"
                        >
                          {plannedWorkouts.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name} ({plan.exercises.length} exercises)
                            </option>
                          ))}
                          {plannedWorkouts.length === 0 && (
                            <option value="custom">Custom Workout</option>
                          )}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    {/* Body Parts selector chips */}
                    <div className="space-y-1">
                      <span className="text-3xs font-mono font-bold uppercase text-text-muted block">
                        TARGET BODY PARTS:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {AVAILABLE_BODY_PARTS.map((part) => {
                          const isSelected = dayConfig.bodyParts?.includes(part);
                          return (
                            <button
                              key={part}
                              type="button"
                              onClick={() => handleToggleBodyPart(day, part)}
                              className={`px-2 py-0.5 rounded-full text-3xs font-semibold border transition-all ${
                                isSelected
                                  ? 'bg-accent/15 border-accent text-accent'
                                  : 'bg-bg-card border-border/70 text-text-muted hover:border-border'
                              }`}
                            >
                              {part}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-2xs text-text-muted pt-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-border" />
                    <span>Scheduled rest day for systemic recovery and protein synthesis</span>
                  </div>
                )}
              </div>
            );
          })}
        </main>

        {/* Footer */}
        <footer className="p-4 border-t border-border bg-bg-card flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-text-secondary">
            <span className="font-bold text-accent">{activeTrainingDays} days</span> scheduled
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary py-2 px-3 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-accent/20"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Save Schedule</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
