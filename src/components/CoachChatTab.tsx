'use client';

/**
 * CoachChatTab — the Coach tab inside Train.
 *
 * A simple coach chat that designs today's workout from the user's
 * condition. It is NOT a free-text chatbot and NOT a form check:
 * - One question at a time, answered with chips (sleep, freshness,
 *   energy, minutes, location). Areas are asked only when they change
 *   the session (freshness ≤ 2, or the pain toggle).
 * - The plan card comes first; the reason is one line; details sit
 *   behind "Why this session?". Most days are 0–1 taps: "Same as
 *   usual" reuses the most recent check-in.
 * - Readiness scoring, missed sessions, and weekly reviews come from
 *   the existing coach engine via useCoachDigest — this tab only adds
 *   the session adjustment (coach-session.ts) and the chat surface.
 * - Pain is deterministic, never diagnosed: any flagged pain area
 *   stops the session and refers out. "Train around it" is the user's
 *   explicit override, and it excludes (never trains) those areas.
 * - Progress is untouched: it stays a top-level tab. This tab lives
 *   inside Train, next to Plans and History.
 */

import React, { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useCoachDigest } from '@/lib/use-coach-digest';
import { getScheduledPlanEntries } from '@/lib/scheduled-days';
import { getLocalTodayStr, getWeekRange } from '@/lib/formatters';
import {
  adjustSession,
  proteinTargetG,
  weeklySuggestion,
} from '@/lib/coach-session';
import type { ManualCheckin } from '@/lib/coach-engine';
import { useTranslation, type StringKey } from '@/lib/i18n';
import { RESISTANCE_MUSCLE_GROUPS } from '@/lib/exercise-library';
import type { MuscleGroup } from '@/lib/exercise-library';
import type { PlannedWorkout } from '@/lib/store';

interface CoachChatTabProps {
  onStartPlan: (plan: PlannedWorkout) => void;
  onOpenBlockModal: () => void;
  onOpenWeeklyReview: () => void;
}

const MINUTES_OPTIONS = [15, 30, 45, 60];

/** Monday-based weekday (0 = Monday … 6 = Sunday) for a Date. */
const mondayWeekday = (d: Date): number => (d.getDay() + 6) % 7;

/** Most recent saved check-in on or before today, if any. */
function mostRecentCheckin(
  dailyCheckins: Record<string, ManualCheckin> | undefined,
  todayStr: string
): ManualCheckin | null {
  if (!dailyCheckins) return null;
  const dates = Object.keys(dailyCheckins).filter((d) => d <= todayStr).sort();
  if (dates.length === 0) return null;
  return dailyCheckins[dates[dates.length - 1]] ?? null;
}

function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors cursor-pointer ${
        active
          ? 'bg-accent/15 border-accent text-text-primary'
          : 'border-border text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

export default function CoachChatTab({
  onStartPlan,
  onOpenBlockModal,
  onOpenWeeklyReview,
}: CoachChatTabProps) {
  const { t } = useTranslation();
  const profile = useStore((s) => s.profile);
  const trainingProfile = useStore((s) => s.trainingProfile);
  const plannedWorkouts = useStore((s) => s.plannedWorkouts);
  const weeklySchedule = useStore((s) => s.weeklySchedule);
  const workouts = useStore((s) => s.workouts);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const dailyCheckins = useStore((s) => s.dailyCheckins);
  const setDailyCheckin = useStore((s) => s.setDailyCheckin);
  const digest = useCoachDigest();

  const todayStr = getLocalTodayStr();
  const scheduled = useMemo(
    () => getScheduledPlanEntries(weeklySchedule, plannedWorkouts),
    [weeklySchedule, plannedWorkouts]
  );
  const todayEntry = scheduled.find((e) => e.weekday === mondayWeekday(new Date()));

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    () => todayEntry?.planId ?? plannedWorkouts[0]?.id ?? null
  );
  const selectedPlan =
    plannedWorkouts.find((p) => p.id === selectedPlanId) ?? plannedWorkouts[0] ?? null;

  // Check-in state, seeded from the most recent saved check-in.
  const seed = useMemo(
    () => mostRecentCheckin(dailyCheckins, todayStr),
    // Seed once per mount; later saves flow through the digest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [sleep, setSleep] = useState<number>(seed?.sleep ?? 3);
  const [soreness, setSoreness] = useState<number>(seed?.soreness ?? 3);
  const [energy, setEnergy] = useState<number>(seed?.energy ?? 3);
  const [soreAreas, setSoreAreas] = useState<MuscleGroup[]>(seed?.soreAreas ?? []);
  const [painAreas, setPainAreas] = useState<MuscleGroup[]>(seed?.painAreas ?? []);
  const [painAsked, setPainAsked] = useState<boolean>((seed?.painAreas ?? []).length > 0);
  const [minutes, setMinutes] = useState<number>(
    trainingProfile?.preferredDurationMin ?? 45
  );
  const [location, setLocation] = useState<'gym' | 'home'>(() =>
    trainingProfile?.equipment === 'bodyweight_only' ||
    trainingProfile?.equipment === 'home_dumbbells'
      ? 'home'
      : 'gym'
  );
  const [trainAroundPain, setTrainAroundPain] = useState(false);
  const [restedToday, setRestedToday] = useState(false);
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [showWhy, setShowWhy] = useState(false);

  /** Every chip change saves immediately, so readiness visibly responds. */
  const saveCheckin = (patch: Partial<ManualCheckin>) => {
    const next: ManualCheckin = {
      sleep,
      soreness,
      energy,
      soreAreas,
      painAreas,
      ...patch,
    };
    setDailyCheckin(todayStr, next);
  };
  const toggleArea = (list: MuscleGroup[], area: MuscleGroup): MuscleGroup[] =>
    list.includes(area) ? list.filter((a) => a !== area) : [...list, area];

  const session = useMemo(() => {
    if (!selectedPlan) return null;
    return adjustSession(selectedPlan, {
      band: digest.readiness.band,
      soreness,
      soreAreas,
      painAreas,
      trainAroundPain,
      minutes,
      location,
    });
  }, [
    selectedPlan,
    digest.readiness.band,
    soreness,
    soreAreas,
    painAreas,
    trainAroundPain,
    minutes,
    location,
  ]);

  // Apply user swaps (keyed by original name so they survive re-adjusts).
  const sessionExercises = useMemo(() => {
    if (!session) return [];
    return session.exercises.map((se) => {
      const replacement = swaps[se.exercise.name];
      if (!replacement) return se;
      return {
        ...se,
        exercise: { ...se.exercise, name: replacement, targetWeight: undefined, notes: undefined },
        needsGym: false,
        substitutes: [],
      };
    });
  }, [session, swaps]);

  const adjustedPlan: PlannedWorkout | null = useMemo(() => {
    if (!selectedPlan || !session) return null;
    return { ...selectedPlan, exercises: sessionExercises.map((se) => se.exercise) };
  }, [selectedPlan, session, sessionExercises]);

  const missed = digest.checkIn?.sessions?.[0] ?? null;
  const missedPlan = missed?.planId
    ? plannedWorkouts.find((p) => p.id === missed.planId) ?? null
    : null;

  const protein = proteinTargetG(profile?.bodyweightKg);

  const weekAdherence = useMemo(() => {
    const week = getWeekRange(new Date());
    const planned = scheduled.length;
    const doneDates = new Set(
      (workouts || [])
        .map((w) => (w.date || '').split('T')[0])
        .filter((d) => d >= week.start && d <= todayStr)
    );
    const done = doneDates.size;
    return { planned, done, suggestion: weeklySuggestion(planned, done) };
  }, [scheduled, workouts, todayStr]);

  const reasonKey: StringKey =
    digest.readiness.band === 'primed'
      ? 'coachChat.reasonPrimed'
      : digest.readiness.band === 'ready'
        ? 'coachChat.reasonReady'
        : digest.readiness.band === 'caution'
          ? 'coachChat.reasonCaution'
          : 'coachChat.reasonRest';

  const applyUsual = () => {
    const usual = mostRecentCheckin(dailyCheckins, todayStr);
    const fallback: ManualCheckin = {
      sleep: 3,
      soreness: 3,
      energy: 3,
      soreAreas: [],
      painAreas: [],
    };
    const next = usual ?? fallback;
    setSleep(next.sleep);
    setSoreness(next.soreness);
    if (typeof next.energy === 'number') setEnergy(next.energy);
    setSoreAreas(next.soreAreas ?? []);
    setPainAreas(next.painAreas ?? []);
    setPainAsked((next.painAreas ?? []).length > 0);
    setTrainAroundPain(false);
    saveCheckin(next);
  };

  const startSession = () => {
    if (!adjustedPlan) return;
    saveCheckin({ sleep, soreness, energy, soreAreas, painAreas });
    onStartPlan(adjustedPlan);
  };

  if (plannedWorkouts.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-sm text-text-secondary">{t('coachChat.intro')}</p>
        <div className="card p-4 space-y-3">
          <p className="text-sm font-bold text-text-primary">{t('coachChat.noPlanTitle')}</p>
          <p className="text-sm text-text-secondary">{t('coachChat.noPlanBody')}</p>
          <button
            type="button"
            onClick={onOpenBlockModal}
            className="px-4 py-2 rounded-full bg-accent text-white text-sm font-bold cursor-pointer"
          >
            {t('coachChat.buildBlock')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <p className="text-sm text-text-secondary">{t('coachChat.intro')}</p>

      {/* Plan picker */}
      <div className="flex gap-2 flex-wrap">
        {plannedWorkouts.map((p) => (
          <Chip
            key={p.id}
            active={selectedPlan?.id === p.id}
            onClick={() => {
              setSelectedPlanId(p.id);
              setSwaps({});
              setTrainAroundPain(false);
            }}
            label={p.name}
          >
            {p.name}
          </Chip>
        ))}
      </div>

      {/* Missed session — building, not behind */}
      {missed && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-bold text-text-primary">{t('coachChat.missedTitle')}</p>
          <p className="text-sm text-text-secondary">
            {t('coachChat.missedBody', { name: missed.name })}
          </p>
          {missedPlan && (
            <button
              type="button"
              onClick={() => {
                setSelectedPlanId(missedPlan.id);
                setSwaps({});
              }}
              className="text-sm font-bold text-accent cursor-pointer"
            >
              {t('coachChat.doItToday')}
            </button>
          )}
        </div>
      )}

      {/* Check-in — one question at a time, chips only */}
      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-text-primary">{t('coachChat.checkinTitle')}</h2>
          <button
            type="button"
            onClick={applyUsual}
            className="text-xs font-bold text-accent cursor-pointer"
          >
            {t('coachChat.sameAsUsual')}
          </button>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-2">{t('coachChat.sleepLabel')}</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map((v) => (
              <Chip
                key={v}
                active={sleep === v}
                onClick={() => {
                  setSleep(v);
                  saveCheckin({ sleep: v });
                }}
              >
                {v}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-2">{t('coachChat.freshnessLabel')}</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map((v) => (
              <Chip
                key={v}
                active={soreness === v}
                onClick={() => {
                  setSoreness(v);
                  saveCheckin({ soreness: v });
                }}
              >
                {v}
              </Chip>
            ))}
          </div>
        </div>

        {soreness <= 2 && (
          <div>
            <p className="text-xs text-text-secondary mb-2">{t('coachChat.soreAreasLabel')}</p>
            <div className="flex gap-2 flex-wrap">
              {RESISTANCE_MUSCLE_GROUPS.map((area) => (
                <Chip
                  key={area}
                  active={soreAreas.includes(area)}
                  onClick={() => {
                    const next = toggleArea(soreAreas, area);
                    setSoreAreas(next);
                    saveCheckin({ soreAreas: next });
                  }}
                >
                  {area}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-text-secondary mb-2">{t('coachChat.energyLabel')}</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map((v) => (
              <Chip
                key={v}
                active={energy === v}
                onClick={() => {
                  setEnergy(v);
                  saveCheckin({ energy: v });
                }}
              >
                {v}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-2">{t('coachChat.minutesLabel')}</p>
          <div className="flex gap-2 flex-wrap">
            {MINUTES_OPTIONS.map((m) => (
              <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>
                {m}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-2">{t('coachChat.locationLabel')}</p>
          <div className="flex gap-2 flex-wrap">
            <Chip active={location === 'gym'} onClick={() => setLocation('gym')}>
              {t('coachChat.locationGym')}
            </Chip>
            <Chip active={location === 'home'} onClick={() => setLocation('home')}>
              {t('coachChat.locationHome')}
            </Chip>
          </div>
        </div>

        <div>
          <button
            type="button"
            aria-pressed={painAsked}
            onClick={() => {
              const next = !painAsked;
              setPainAsked(next);
              if (!next) {
                setPainAreas([]);
                setTrainAroundPain(false);
                saveCheckin({ painAreas: [] });
              }
            }}
            className="text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
          >
            {t('coachChat.painToggle')}
          </button>
          {painAsked && (
            <div className="flex gap-2 flex-wrap mt-2">
              {RESISTANCE_MUSCLE_GROUPS.map((area) => (
                <Chip
                  key={area}
                  active={painAreas.includes(area)}
                  onClick={() => {
                    const next = toggleArea(painAreas, area);
                    setPainAreas(next);
                    setTrainAroundPain(false);
                    saveCheckin({ painAreas: next });
                  }}
                >
                  {area}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pain stop card — deterministic, never a diagnosis */}
      {session?.stopForPain && !restedToday && (
        <div className="card p-4 space-y-3 border border-danger/40">
          <p className="text-sm font-bold text-danger">{t('coachChat.painStopTitle')}</p>
          <p className="text-sm text-text-secondary">{t('coachChat.painStopBody')}</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setRestedToday(true)}
              className="px-4 py-2 rounded-full bg-accent text-white text-sm font-bold cursor-pointer"
            >
              {t('coachChat.restToday')}
            </button>
            <button
              type="button"
              onClick={() => setTrainAroundPain(true)}
              className="px-4 py-2 rounded-full border border-border text-sm font-bold text-text-primary cursor-pointer"
            >
              {t('coachChat.trainAroundIt')}
            </button>
          </div>
        </div>
      )}

      {restedToday && (
        <div className="card p-4">
          <p className="text-sm text-text-secondary">{t('coachChat.restNote')}</p>
        </div>
      )}

      {/* Today's session card */}
      {session && !session.stopForPain && !restedToday && selectedPlan && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-text-primary">{selectedPlan.name}</h2>
            <span className="text-xs text-text-secondary">
              {t('coachChat.upToMinutes', { minutes: session.estimatedMin })}
            </span>
          </div>
          <p className="text-sm text-text-secondary">{t(reasonKey)}</p>
          {session.droppedForSoreness > 0 && (
            <p className="text-xs text-text-secondary">
              {t('coachChat.droppedSore', { count: session.droppedForSoreness })}
            </p>
          )}
          {session.droppedForTime > 0 && (
            <p className="text-xs text-text-secondary">
              {t('coachChat.droppedTime', { count: session.droppedForTime })}
            </p>
          )}
          {session.setsCut && (
            <p className="text-xs text-text-secondary">{t('coachChat.setsCut')}</p>
          )}
          <ul className="space-y-2">
            {sessionExercises.map((se, i) => (
              <li key={`${se.exercise.name}-${i}`} className="text-sm">
                <span className="font-bold text-text-primary">{se.exercise.name}</span>
                <span className="text-text-secondary">
                  {' '}
                  · {se.exercise.targetSets} × {se.exercise.targetReps}
                  {typeof se.exercise.targetWeight === 'number' &&
                    se.exercise.targetWeight > 0 &&
                    ` · ${se.exercise.targetWeight}${se.exercise.targetUnit ?? ''}`}
                </span>
                {se.needsGym && se.substitutes.length > 0 && (
                  <span className="block text-xs text-text-secondary mt-1">
                    {t('coachChat.needsGym')}{' '}
                    {se.substitutes.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() =>
                          setSwaps((prev) => ({ ...prev, [se.exercise.name]: sub }))
                        }
                        className="font-bold text-accent cursor-pointer mr-2"
                      >
                        {t('coachChat.swapTo', { name: sub })}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {sessionExercises.length === 0 && (
            <p className="text-sm text-text-secondary">{t('coachChat.emptySession')}</p>
          )}
          <button
            type="button"
            onClick={startSession}
            disabled={sessionExercises.length === 0}
            className="px-4 py-2 rounded-full bg-accent text-white text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {t('coachChat.startSession')}
          </button>
          <div>
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              className="text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
            >
              {t('coachChat.whyThis')}
            </button>
            {showWhy && digest.readiness.factors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {digest.readiness.factors.map((f, i) => (
                  <li key={i} className="text-xs text-text-secondary">
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Protein guidance — targets only, never full food logging */}
      {protein && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-bold text-text-primary">
            {t('coachChat.proteinTitle', { min: protein.min, max: protein.max })}
          </p>
          <p className="text-xs text-text-secondary">{t('coachChat.proteinExamples')}</p>
        </div>
      )}

      {/* Weekly review — exactly one change */}
      <div className="card p-4 space-y-2">
        <p className="text-sm font-bold text-text-primary">{t('coachChat.weeklyTitle')}</p>
        <p className="text-sm text-text-secondary">
          {t('coachChat.weeklyAdherence', {
            done: weekAdherence.done,
            planned: weekAdherence.planned,
          })}
        </p>
        <p className="text-sm text-text-secondary">
          {weekAdherence.suggestion.kind === 'shrink'
            ? t('coachChat.weeklyShrink')
            : weekAdherence.suggestion.kind === 'progress'
              ? t('coachChat.weeklyProgress')
              : t('coachChat.weeklyHold')}
        </p>
        {weeklyReviews.length > 0 && (
          <button
            type="button"
            onClick={onOpenWeeklyReview}
            className="text-sm font-bold text-accent cursor-pointer"
          >
            {t('coachChat.openFullReview')}
          </button>
        )}
      </div>

      <p className="text-xs text-text-secondary px-1">{t('coachChat.safetyNote')}</p>
    </div>
  );
}
