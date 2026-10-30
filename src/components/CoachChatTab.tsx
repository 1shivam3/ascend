'use client';

/**
 * CoachChatTab — the Coach tab inside Train, and the single home for
 * everything coach: the daily chat, the training block, and the weekly
 * review link. (Block management moved here from Plans on 2026-10-26:
 * with a dedicated Coach tab, building a block in Plans was the wrong
 * home for it. Plans is now only user plans.)
 *
 * The chat is a real conversation, not a form:
 * - The coach asks ONE question at a time; the user answers with chips.
 *   Each answer appears as a user bubble, then the next question comes.
 * - Missed sessions open the thread ("building, not behind").
 * - The session card is the coach's final answer, with a one-line
 *   reason and "Why this session?" behind a tap.
 * - "Same as usual — go" fills the whole transcript at once, so most
 *   days are 0–1 taps. "Edit check-in" rewinds to the first question.
 *
 * Readiness scoring, missed sessions, stalls, and weekly reviews come
 * from the existing coach engine via useCoachDigest — this tab only
 * adds the session adjustment (coach-session.ts) and the chat surface.
 * Pain is deterministic, never diagnosed: any flagged pain area stops
 * the session and refers out. "Train around it" is the user's explicit
 * override, and it excludes (never trains) those areas.
 * Progress is untouched: it stays a top-level tab. This tab lives
 * inside Train, next to Plans and History.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useCoachDigest } from '@/lib/use-coach-digest';
import { getScheduledPlanEntries } from '@/lib/scheduled-days';
import { getLocalTodayStr, getWeekDateStrings, getWeekRange, parseLocalDate } from '@/lib/formatters';
import {
  adjustSession,
  checkinSteps,
  proteinTargetG,
  weeklySuggestion,
} from '@/lib/coach-session';
import type { CheckinStep } from '@/lib/coach-session';
import type { ManualCheckin } from '@/lib/coach-engine';
import { useTranslation, type StringKey } from '@/lib/i18n';
import { RESISTANCE_MUSCLE_GROUPS } from '@/lib/exercise-library';
import type { MuscleGroup } from '@/lib/exercise-library';
import { weekTypeForDate } from '@/lib/block-engine';
import { isBlockEnded } from '@/lib/weekly-review';
import { useToast } from '@/components/ui/Toast';
import type { PlannedWorkout } from '@/lib/store';

interface CoachChatTabProps {
  onStartPlan: (plan: PlannedWorkout) => void;
  onBuildBlock: () => void;
  onReviewBlock: () => void;
  onOpenWeeklyReview: () => void;
  onOpenDebrief: () => void;
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

function CoachBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-bg-secondary px-3 py-2 text-sm text-text-primary">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm font-bold text-accent-on">
        {children}
      </div>
    </div>
  );
}

export default function CoachChatTab({
  onStartPlan,
  onBuildBlock,
  onReviewBlock,
  onOpenWeeklyReview,
  onOpenDebrief,
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
  const coachBlocks = useStore((s) => s.coachBlocks);
  const coachEnabled = useStore((s) => s.uiPreferences?.coachEnabled ?? true);
  const setUiPreferences = useStore((s) => s.setUiPreferences);
  const applyPlateauProposal = useStore((s) => s.applyPlateauProposal);
  const dismissPlateauProposal = useStore((s) => s.dismissPlateauProposal);
  const toast = useToast();
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
  const [painYes, setPainYes] = useState<boolean>(false);
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
  // UX-18: free-text notes per question, typed alongside the chips.
  const [notes, setNotes] = useState<Partial<Record<CheckinStep, string>>>(
    () => ({ ...(seed?.notes ?? {}) })
  );
  const [noteDraft, setNoteDraft] = useState('');
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [showWhy, setShowWhy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = checkinSteps(soreness);
  const done = stepIndex >= steps.length;
  const currentStep: CheckinStep | undefined = steps[stepIndex];

  /** Every answer saves immediately, so readiness visibly responds. */
  const saveCheckin = (patch: Partial<ManualCheckin>) => {
    const next: ManualCheckin = {
      sleep,
      soreness,
      energy,
      soreAreas,
      painAreas,
      notes,
      ...patch,
    };
    setDailyCheckin(todayStr, next);
  };

  /** A fresh draft per question — a note never leaks across steps. */
  useEffect(() => {
    setNoteDraft('');
  }, [stepIndex]);

  /**
   * UX-18: send the typed note for the CURRENT question. The note is
   * attached to that question's answer on the check-in record and
   * shown in the thread; the structured chip flow is untouched (the
   * note never answers a question by itself, and the session card
   * still builds from the structured answers only).
   */
  const submitNote = () => {
    if (!currentStep) return;
    const text = noteDraft.trim().slice(0, 500);
    if (!text) return;
    const next = { ...notes, [currentStep]: text };
    setNotes(next);
    saveCheckin({ notes: next });
    setNoteDraft('');
  };
  const toggleArea = (list: MuscleGroup[], area: MuscleGroup): MuscleGroup[] =>
    list.includes(area) ? list.filter((a) => a !== area) : [...list, area];

  /** Answer the current question and move to the next one. */
  const answer = (patch: Partial<ManualCheckin>, apply: () => void) => {
    apply();
    saveCheckin(patch);
    setStepIndex((i) => i + 1);
  };

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
    const weekDates = getWeekDateStrings(new Date());
    const planned = scheduled.length;
    const doneDates = new Set(
      (workouts || [])
        .map((w) => (w.date || '').split('T')[0])
        .filter((d) => d >= week.start && d <= todayStr)
    );
    const doneCount = doneDates.size;
    // FE-02 (audit-3): the verdict judges only the elapsed part of
    // the week — scheduled days strictly before today (a session is
    // not "missed" until its day is over) — and the displayed count
    // is capped at the plan, so extra unscheduled sessions can no
    // longer render as "7 of 4 sessions done".
    const dueCount = scheduled.filter((e) => weekDates[e.weekday] < todayStr).length;
    return {
      planned,
      done: Math.min(doneCount, planned),
      suggestion: weeklySuggestion(planned, doneCount, dueCount),
    };
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
    setNotes({ ...(next.notes ?? {}) });
    setPainYes((next.painAreas ?? []).length > 0);
    setTrainAroundPain(false);
    saveCheckin(next);
    setStepIndex(checkinSteps(next.soreness).length);
  };

  const startSession = () => {
    if (!adjustedPlan) return;
    saveCheckin({ sleep, soreness, energy, soreAreas, painAreas });
    onStartPlan(adjustedPlan);
  };

  const questionKey = (step: CheckinStep): StringKey =>
    step === 'sleep'
      ? 'coachChat.chatSleepQ'
      : step === 'freshness'
        ? 'coachChat.chatFreshQ'
        : step === 'areas'
          ? 'coachChat.chatAreasQ'
          : step === 'energy'
            ? 'coachChat.chatEnergyQ'
            : step === 'minutes'
              ? 'coachChat.chatMinutesQ'
              : step === 'location'
                ? 'coachChat.chatLocationQ'
                : 'coachChat.chatPainQ';

  const answerText = (step: CheckinStep): React.ReactNode => {
    switch (step) {
      case 'sleep':
        return `${sleep}`;
      case 'freshness':
        return `${soreness}`;
      case 'areas':
        return soreAreas.length > 0 ? soreAreas.join(', ') : t('coachChat.chatAreasNone');
      case 'energy':
        return `${energy}`;
      case 'minutes':
        return `${minutes} ${t('coachChat.chatMinutesShort')}`;
      case 'location':
        return location === 'gym' ? t('coachChat.locationGym') : t('coachChat.locationHome');
      case 'pain':
        return painAreas.length > 0 ? painAreas.join(', ') : t('coachChat.chatPainNo');
    }
  };

  /** Chips for the current question (multi-select steps get a Done button). */
  const currentReplies = () => {
    if (!currentStep) return null;
    const num = (value: number, set: (v: number) => void, key: 'sleep' | 'soreness' | 'energy') => (
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 4, 5].map((v) => (
          <Chip
            key={v}
            active={
              key === 'sleep' ? sleep === v : key === 'soreness' ? soreness === v : energy === v
            }
            onClick={() =>
              answer({ [key]: v } as Partial<ManualCheckin>, () => set(v))
            }
          >
            {v}
          </Chip>
        ))}
      </div>
    );
    switch (currentStep) {
      case 'sleep':
        return num(sleep, setSleep, 'sleep');
      case 'freshness':
        return num(soreness, setSoreness, 'soreness');
      case 'areas':
        return (
          <div className="space-y-2">
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
            <button
              type="button"
              onClick={() => {
                saveCheckin({ soreAreas });
                setStepIndex((i) => i + 1);
              }}
              className="px-4 py-2 rounded-full bg-accent text-accent-on text-sm font-bold cursor-pointer"
            >
              {t('coachChat.chatAreasDone')}
            </button>
          </div>
        );
      case 'energy':
        return num(energy, setEnergy, 'energy');
      case 'minutes':
        return (
          <div className="flex gap-2 flex-wrap">
            {MINUTES_OPTIONS.map((m) => (
              <Chip
                key={m}
                active={minutes === m}
                onClick={() => answer({} as Partial<ManualCheckin>, () => setMinutes(m))}
              >
                {m}
              </Chip>
            ))}
          </div>
        );
      case 'location':
        return (
          <div className="flex gap-2 flex-wrap">
            <Chip
              active={location === 'gym'}
              onClick={() => answer({} as Partial<ManualCheckin>, () => setLocation('gym'))}
            >
              {t('coachChat.locationGym')}
            </Chip>
            <Chip
              active={location === 'home'}
              onClick={() => answer({} as Partial<ManualCheckin>, () => setLocation('home'))}
            >
              {t('coachChat.locationHome')}
            </Chip>
          </div>
        );
      case 'pain': {
        const showAreas = painYes || painAreas.length > 0;
        return (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Chip
                active={painAreas.length === 0 && !painYes}
                onClick={() => {
                  setPainAreas([]);
                  setPainYes(false);
                  setTrainAroundPain(false);
                  answer({ painAreas: [] }, () => {});
                }}
              >
                {t('coachChat.chatPainNo')}
              </Chip>
              <Chip active={showAreas} onClick={() => setPainYes(true)}>
                {t('coachChat.chatPainYes')}
              </Chip>
            </div>
            {showAreas && (
              <>
                <div className="flex gap-2 flex-wrap">
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
                <button
                  type="button"
                  onClick={() => {
                    saveCheckin({ painAreas });
                    setStepIndex((i) => i + 1);
                  }}
                  className="px-4 py-2 rounded-full bg-accent text-accent-on text-sm font-bold cursor-pointer"
                >
                  {t('coachChat.chatAreasDone')}
                </button>
              </>
            )}
          </div>
        );
      }
    }
  };

  const hasBlock = Boolean(coachBlocks.activeBlock) || Boolean(coachBlocks.pendingProposal);
  if (plannedWorkouts.length === 0 && !hasBlock) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-sm text-text-secondary">{t('coachChat.intro')}</p>
        <div className="card p-4 space-y-3">
          <p className="text-sm font-bold text-text-primary">{t('coachChat.noPlanTitle')}</p>
          <p className="text-sm text-text-secondary">{t('coachChat.noPlanBody')}</p>
          <button
            type="button"
            onClick={onBuildBlock}
            className="px-4 py-2 rounded-full bg-accent text-accent-on text-sm font-bold cursor-pointer"
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

      {/* ── Your training block (moved here from Plans) ── */}
      <section className="space-y-2.5" aria-label={t('coachBlock.sectionTitle')}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h2 className="section-title text-[0.6875rem] mb-0">{t('coachBlock.sectionTitle').toUpperCase()}</h2>
          {coachEnabled && (
            <button
              type="button"
              onClick={() => {
                setUiPreferences({ coachEnabled: false });
                toast.info(t('coachBlock.tipsOff'), t('toast.titleDismissed'));
              }}
              className="ml-auto text-2xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
            >
              {t('coachBlock.turnOffTips')}
            </button>
          )}
        </div>

        {coachBlocks.pendingProposal ? (
          <div className="card p-4 flex items-center justify-between gap-3 border-accent/40">
            <div className="min-w-0">
              <p className="text-xs font-bold text-text-primary">
                {t('coachBlock.pendingTitle', { name: coachBlocks.pendingProposal.name })}
              </p>
              <p className="text-2xs text-text-muted">{t('coachBlock.pendingHint')}</p>
            </div>
            <button
              type="button"
              onClick={onReviewBlock}
              className="btn-primary py-1.5 px-3 text-xs font-bold shrink-0 cursor-pointer"
            >
              {t('coachBlock.reviewButton')}
            </button>
          </div>
        ) : (
          <div className="card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {coachBlocks.activeBlock && coachBlocks.activeBlock.status === 'active' ? (
                <>
                  <p className="text-xs font-bold text-text-primary">
                    {coachBlocks.activeBlock.name} ·{' '}
                    {t('coachBlock.weekOf', {
                      n: Math.min(
                        coachBlocks.activeBlock.weeks.length,
                        Math.max(
                          1,
                          Math.floor(
                            (parseLocalDate(getLocalTodayStr()).getTime() -
                              parseLocalDate(coachBlocks.activeBlock.startMonday).getTime()) /
                              (7 * 86_400_000)
                          ) + 1
                        )
                      ),
                      total: coachBlocks.activeBlock.weeks.length,
                    })}
                  </p>
                  <p className="text-2xs text-text-muted">
                    {t('coachBlock.activeHint', {
                      type: t(`coachBlock.week_${weekTypeForDate(coachBlocks.activeBlock, getLocalTodayStr())}` as 'coachBlock.week_build'),
                    })}
                  </p>
                  <p className="text-2xs text-text-muted leading-relaxed">
                    {t(`coachBlock.weekExplain_${weekTypeForDate(coachBlocks.activeBlock, getLocalTodayStr())}` as 'coachBlock.weekExplain_build')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-text-primary">{t('coachBlock.buildTitle')}</p>
                  <p className="text-2xs text-text-muted">{t('coachBlock.buildHint')}</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onBuildBlock}
              className="btn-primary py-1.5 px-3 text-xs font-bold shrink-0 cursor-pointer"
            >
              {coachBlocks.activeBlock ? t('coachBlock.buildNext') : t('coachBlock.buildButton')}
            </button>
          </div>
        )}

        {coachBlocks.plateauProposals
          .filter((p) => p.status === 'pending')
          .map((p) => (
            <div key={p.id} className="card p-4 space-y-2 border-warning/40">
              <p className="text-xs font-bold text-text-primary">
                {t('coachBlock.plateauTitle', { name: p.displayName })}
              </p>
              <p className="text-2xs text-text-muted">{p.evidence}</p>
              <p className="text-2xs text-text-primary font-semibold">{p.changeText}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => applyPlateauProposal(p.id)}
                  className="btn-primary py-1.5 px-3 text-xs font-bold cursor-pointer"
                >
                  {t('coachBlock.plateauApply')}
                </button>
                <button
                  type="button"
                  onClick={() => dismissPlateauProposal(p.id)}
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold cursor-pointer"
                >
                  {t('coachBlock.plateauDismiss')}
                </button>
              </div>
            </div>
          ))}

        {coachBlocks.activeBlock &&
          coachBlocks.activeBlock.status === 'active' &&
          isBlockEnded(coachBlocks.activeBlock, getLocalTodayStr()) && (
            <div className="card p-4 flex items-center justify-between gap-3 border-accent/40">
              <div className="min-w-0">
                <p className="text-xs font-bold text-text-primary">
                  {t('weeklyReview.debriefCardTitle', { name: coachBlocks.activeBlock.name })}
                </p>
                <p className="text-2xs text-text-muted">{t('weeklyReview.debriefCardHint')}</p>
              </div>
              <button
                type="button"
                onClick={onOpenDebrief}
                className="btn-primary py-1.5 px-3 text-xs font-bold shrink-0 cursor-pointer"
              >
                {t('weeklyReview.debriefOpen')}
              </button>
            </div>
          )}
      </section>

      {/* Plan picker */}
      {plannedWorkouts.length > 0 && (
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
      )}

      {/* ── The chat: one question at a time ── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-text-primary">{t('coachChat.checkinTitle')}</h2>
          {done ? (
            <button
              type="button"
              onClick={() => setStepIndex(0)}
              className="text-xs font-bold text-accent-text cursor-pointer"
            >
              {t('coachChat.chatEdit')}
            </button>
          ) : (
            <button
              type="button"
              onClick={applyUsual}
              className="text-xs font-bold text-accent-text cursor-pointer"
            >
              {t('coachChat.sameAsUsual')}
            </button>
          )}
        </div>

        {/* Missed session opens the thread */}
        {missed && (
          <CoachBubble>
            <p className="font-bold">{t('coachChat.missedTitle')}</p>
            <p className="text-text-secondary text-xs mt-1">
              {t('coachChat.missedBody', { name: missed.name })}
            </p>
            {missedPlan && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPlanId(missedPlan.id);
                  setSwaps({});
                }}
                className="text-xs font-bold text-accent-text cursor-pointer mt-1"
              >
                {t('coachChat.doItToday')}
              </button>
            )}
          </CoachBubble>
        )}

        {/* Completed Q&A pairs */}
        {steps.slice(0, stepIndex).map((step, i) => (
          <React.Fragment key={`${step}-${i}`}>
            <CoachBubble>{t(questionKey(step))}</CoachBubble>
            <UserBubble>{answerText(step)}</UserBubble>
            {notes[step] && <UserBubble>{notes[step]}</UserBubble>}
          </React.Fragment>
        ))}

        {/* Current question + replies */}
        {!done && currentStep && (
          <>
            <CoachBubble>{t(questionKey(currentStep))}</CoachBubble>
            {notes[currentStep] && <UserBubble>{notes[currentStep]}</UserBubble>}
            <div className="pl-1">{currentReplies()}</div>
            {/* UX-18: typing box alongside the chips — a note attached
                to the current question, never a replacement answer. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitNote();
              }}
              className="flex gap-2 pl-1"
            >
              <input
                type="text"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
                maxLength={500}
                placeholder={t('coachChat.notePlaceholder')}
                aria-label={t('coachChat.notePlaceholder')}
                className="flex-1 min-w-0 rounded-full border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
              />
              <button
                type="submit"
                disabled={!noteDraft.trim()}
                className="px-4 py-2 rounded-full bg-accent text-accent-on text-sm font-bold cursor-pointer disabled:opacity-50 shrink-0"
              >
                {t('coachChat.noteSend')}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Pain stop card — deterministic, never a diagnosis */}
      {done && session?.stopForPain && !restedToday && (
        <div className="card p-4 space-y-3 border border-danger/40">
          <p className="text-sm font-bold text-danger">{t('coachChat.painStopTitle')}</p>
          <p className="text-sm text-text-secondary">{t('coachChat.painStopBody')}</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setRestedToday(true)}
              className="px-4 py-2 rounded-full bg-accent text-accent-on text-sm font-bold cursor-pointer"
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

      {done && restedToday && (
        <div className="card p-4">
          <p className="text-sm text-text-secondary">{t('coachChat.restNote')}</p>
        </div>
      )}

      {/* Today's session card — the coach's answer */}
      {done && session && !session.stopForPain && !restedToday && selectedPlan && (
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
            className="px-4 py-2 rounded-full bg-accent text-accent-on text-sm font-bold cursor-pointer disabled:opacity-50"
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
            className="text-sm font-bold text-accent-text cursor-pointer"
          >
            {t('coachChat.openFullReview')}
          </button>
        )}
      </div>

      <p className="text-xs text-text-secondary px-1">{t('coachChat.safetyNote')}</p>
    </div>
  );
}
