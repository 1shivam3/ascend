import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { getTodaySessionState } from '@/lib/workout-engine';
import { getCurrentLanguage, useTranslation } from '@/lib/i18n';
import {
  buildCoachChatContext,
  type CoachChatUserData,
} from '@/lib/coach-chat';
import { getAiAuthHeaders } from '@/lib/ai-client-auth';
import TextInput from '@/components/ui/TextInput';
import { displayDatesInText, formatDate } from '@/lib/formatters';
import { scrubHealthClaims } from '@/lib/health-claims';
import { toLocalDateString } from '@/lib/habits';
import {
  useCoachChatStore,
  currentDailyLeft,
  type CoachChatMessage,
} from '@/lib/coach-chat-store';
import { validateCoachAction } from '@/lib/coach-actions';
import { weightIsReal } from '@/lib/body-stats';
import { isMinorAge } from '@/lib/minor-targets';
import { settlePendingActions } from '@/lib/coach-action-executor';
import CoachActionCard from '@/components/CoachActionCard';
import AiNoticeBanner from '@/components/AiNoticeBanner';
import CoachMarkdown from '@/components/CoachMarkdown';
import { FormSessionRepository } from '@/features/form-coach/repositories/FormSessionRepository';

/**
 * Build the assistant message for one chat response (Slice B).
 * The route already validated any action server-side; the client
 * RE-validates before a card may render (two-layer validation, per
 * the design brief) — an action that fails here is dropped silently
 * and the plain reply is shown, never an error. Static safety/topic
 * replies carry no action field at all, so they take the same path.
 */
export function assistantMessageFromResponse(
  data: unknown,
  now: number,
  fallbackText: string
): CoachChatMessage {
  const rec = (data && typeof data === 'object' ? data : {}) as {
    reply?: unknown;
    evidence?: unknown;
    action?: unknown;
  };
  const action = validateCoachAction(rec.action);
  const base = {
    role: 'assistant' as const,
    content: typeof rec.reply === 'string' ? rec.reply : fallbackText,
    evidence: Array.isArray(rec.evidence) ? rec.evidence : [],
    ts: now,
  };
  // §28: the two message variants are built explicitly — an action
  // always lands beside its 'pending' state, never optionally.
  return action ? { ...base, action, actionState: 'pending' as const } : base;
}

/** Empty-state suggestion chips (Slice B): fixed, allowlisted
 * starters — each is sent verbatim as a user message. */
const CHIP_KEYS = [
  'coachChat.chipBuildWeek',
  'coachChat.chipRaiseProtein',
  'coachChat.chipPlanDays',
  'coachChat.chipSquatStall',
] as const;

/** Wall clock for event handlers (send/settle paths) — kept out of
 * render bodies on purpose. */
const epochNow = () => Date.now();

/**
 * T3 (bug program Phase 4): a settled action card from a previous
 * day renders collapsed — one line saying when it settled, with the
 * full card one tap away. Old threads used to stack full receipt
 * cards forever, burying the current conversation. Display-only:
 * the stored message is never rewritten.
 */
function OldActionCard({
  message,
  onPatch,
  dateLabel,
}: {
  message: CoachChatMessage;
  onPatch: (patch: Partial<CoachChatMessage>) => void;
  dateLabel: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!expanded) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-secondary/60 px-3 py-2">
        <p className="text-2xs text-text-secondary">{t('coachChat.oldActionNote', { date: dateLabel })}</p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-2xs font-bold text-accent-text cursor-pointer shrink-0"
        >
          {t('coachChat.showAction')}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <CoachActionCard message={message} onPatch={onPatch} />
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="text-2xs font-bold text-text-muted cursor-pointer"
      >
        {t('coachChat.hideAction')}
      </button>
    </div>
  );
}

function weekIndexOf(startMonday: string, todayStr: string, weekCount: number): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).getTime();
  };
  const diffDays = Math.floor((parse(todayStr) - parse(startMonday)) / 86_400_000);
  if (diffDays < 0) return 1;
  return Math.min(weekCount, Math.floor(diffDays / 7) + 1);
}

/**
 * Conversational coach — a Coach-area SECTION in the Train tab.
 *
 * This is deliberately NOT the removed 'Ask Coach' drawer: no drawer, no
 * modal, no resurrection of that component. Text chat only, inline.
 *
 * Personalization contract: every message carries a context slice built
 * from THIS user's stores (never a generic prompt). The server answers
 * only from that slice and cites it; the evidence lines are shown under
 * each reply so the user can see exactly what the answer was based on.
 */
export default function CoachChatSection() {
  const { t } = useTranslation();
  const profile = useStore((s) => s.profile);
  const trainingProfile = useStore((s) => s.trainingProfile);
  const athleteModel = useStore((s) => s.athleteModel);
  const coachBlocks = useStore((s) => s.coachBlocks);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const workouts = useStore((s) => s.workouts);
  const prs = useStore((s) => s.prs);
  const meals = useStore((s) => s.meals);
  const macroGoals = useStore((s) => s.macroGoals);
  const bodyMetrics = useStore((s) => s.bodyMetrics);
  const dailyCheckins = useStore((s) => s.dailyCheckins);
  const plannedWorkouts = useStore((s) => s.plannedWorkouts);
  const weeklySchedule = useStore((s) => s.weeklySchedule);
  const activeWorkoutDraft = useStore((s) => s.activeWorkoutDraft);
  const readinessHistory = useStore((s) => s.coach?.readinessHistory ?? []);

  // FE-06 (audit-3): the conversation and the daily-left counter live
  // in a persisted store, not useState — this section unmounts on
  // every tab switch, which used to wipe the thread and made users
  // re-ask (burning another of the day's messages) for an answer
  // they already had. Input/sending/error stay local: they are
  // ephemeral typing state and SHOULD reset on remount.
  const messages = useCoachChatStore((s) => s.messages);
  const setMessages = useCoachChatStore((s) => s.setMessages);
  const clearCoachChat = useCoachChatStore((s) => s.clearCoachChat);
  // T3: "New chat" is a two-tap action — clearing a thread is the
  // one destructive act here with no Undo, so the first tap arms it.
  const [confirmClear, setConfirmClear] = useState(false);
  const storedDailyLeft = useCoachChatStore((s) => s.dailyLeft);
  const storedDailyLeftDate = useCoachChatStore((s) => s.dailyLeftDate);
  const setDailyLeftRaw = useCoachChatStore((s) => s.setDailyLeft);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<'generic' | 'cap' | 'rate' | null>(null);
  const dailyLeft = currentDailyLeft(
    { dailyLeft: storedDailyLeft, dailyLeftDate: storedDailyLeftDate },
    toLocalDateString(new Date())
  );
  // T3 (bug program Phase 4): day model for the thread — a separator
  // per local day and a past-day flag for collapsing settled action
  // cards, so a weeks-old answer can never read as today's advice.
  // Legacy messages without a timestamp get no separator: their day
  // is unknown and is never fabricated. (Plain body computation, not
  // a memo: the react-hooks purity rules reject Date reads and the
  // running-day mutation inside memo callbacks.)
  const threadToday = toLocalDateString(new Date());
  const threadYesterday = toLocalDateString(new Date(epochNow() - 86_400_000));
  const threadDays: Array<{
    day: string | null;
    showSeparator: boolean;
    isToday: boolean;
    isYesterday: boolean;
    isPastDay: boolean;
  }> = [];
  {
    let last: string | null = null;
    for (const m of messages) {
      const day = typeof m.ts === 'number' ? toLocalDateString(new Date(m.ts)) : null;
      const showSeparator = day !== null && day !== last;
      if (day) last = day;
      threadDays.push({
        day,
        showSeparator,
        isToday: day === threadToday,
        isYesterday: day === threadYesterday,
        isPastDay: day !== null && day < threadToday,
      });
    }
  }
  const listRef = useRef<HTMLDivElement | null>(null);
  // Scroll discipline (Slice B): auto-scroll only while the user is
  // already near the bottom — a new coach message must never yank a
  // scrolled-up reader down to it.
  const stickRef = useRef(true);

  // Settle persisted pending cards on mount: expired drafts and
  // superseded duplicates resolve even if the user never sends again.
  useEffect(() => {
    const cur = useCoachChatStore.getState().messages;
    const settled = settlePendingActions(cur, Date.now(), useStore.getState().macroGoals);
    if (settled !== cur) setMessages(settled);
  }, [setMessages]);

  useEffect(() => {
    if (!stickRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages, sending]);

  const patchMessage = useCallback(
    (index: number, patch: Partial<CoachChatMessage>) => {
      const cur = useCoachChatStore.getState().messages;
      if (!cur[index]) return;
      // The patch producers (CoachActionCard helpers) only ever
      // produce valid action-field combinations (§28 union).
      setMessages(cur.map((m, i) => (i === index ? ({ ...m, ...patch } as CoachChatMessage) : m)));
    },
    [setMessages]
  );

  const userData: CoachChatUserData = useMemo(() => {
    const todayStr = toLocalDateString(new Date());
    const sortedWorkouts = [...(workouts ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    const sortedPrs = [...(prs ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    const sortedMetrics = [...(bodyMetrics ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    const sortedReviews = [...(weeklyReviews ?? [])].sort((a, b) =>
      a.weekMonday < b.weekMonday ? 1 : -1
    );
    const todayMeals = (meals ?? []).filter((m) => m.date === todayStr);
    const mealsToday =
      todayMeals.length > 0
        ? {
            calories: todayMeals.reduce(
              (sum, m) => sum + m.foods.reduce((s, f) => s + (f.calories || 0), 0),
              0
            ),
            proteinG: todayMeals.reduce(
              (sum, m) => sum + m.foods.reduce((s, f) => s + (f.proteinG || 0), 0),
              0
            ),
            carbsG: todayMeals.reduce(
              (sum, m) => sum + m.foods.reduce((s, f) => s + (f.carbsG || 0), 0),
              0
            ),
            fatG: todayMeals.reduce(
              (sum, m) => sum + m.foods.reduce((s, f) => s + (f.fatG || 0), 0),
              0
            ),
            items: todayMeals.reduce((sum, m) => sum + m.foods.length, 0),
          }
        : null;
    const latestMetric = sortedMetrics[0];
    const checkin = dailyCheckins?.[todayStr];
    // Today's session from the SAME resolver the Home screen uses, so
    // the coach can never disagree with the app about today's workout
    // (live-test catch 2026-10-29: the context had plans and reviews
    // but no today resolution, so the coach said it had no workout
    // for today while Home showed one).
    const sessionInfo = getTodaySessionState(
      todayStr,
      workouts ?? [],
      plannedWorkouts ?? [],
      activeWorkoutDraft ?? null,
      profile?.unit ?? 'kg',
      weeklySchedule ?? undefined
    );
    const todaySession: CoachChatUserData['todaySession'] =
      sessionInfo.status === 'in_progress'
        ? { state: 'in_progress', title: sessionInfo.title, exercises: sessionInfo.exercises ?? [], date: todayStr }
        : sessionInfo.status === 'completed'
          ? { state: 'completed', title: sessionInfo.title, exercises: sessionInfo.exercises ?? [], date: todayStr }
          : sessionInfo.status === 'planned' || sessionInfo.status === 'rest'
            ? {
                // §16: rest is its own status now (was: planned + the
                // isRestDay side flag, re-derived here).
                state: sessionInfo.status === 'rest' ? 'rest' : 'planned',
                title: sessionInfo.title,
                exercises: sessionInfo.exercises ?? [],
                date: todayStr,
              }
            : null;
    const active = coachBlocks?.activeBlock ?? null;
    // Master has no per-muscle readiness-band source (the athlete model
    // carries recovery curves, not bands), so no bands are passed: the
    // context builder simply omits the caution section rather than
    // inventing readiness the app never measured.
    const perMuscle: CoachChatUserData['perMuscle'] = [];
    const latestReadiness = readinessHistory[readinessHistory.length - 1];

    return {
      todayStr,
      userName: profile?.name ?? null,
      // Phase 3 (Task 3.1): the coach sees the user's age as data;
      // the same field drives the MINOR ATHLETE prompt rule below.
      ageYears: profile?.age ?? null,
      // Task 1.1: a placeholder bodyweight the user never entered is
      // NOT context — the coach must see "not logged" and work without
      // it, never compute nutrition advice from a seeded default.
      bodyweightKg: weightIsReal(profile) ? (profile?.bodyweightKg ?? null) : null,
      unit: profile?.unit ?? 'kg',
      goal: trainingProfile?.goal ?? null,
      experience: trainingProfile?.experience ?? null,
      daysPerWeek: trainingProfile?.daysPerWeek ?? null,
      athleteFacts: (athleteModel?.topFacts ?? []).map((f) => f.text),
      lifts: [...(athleteModel?.lifts ?? [])]
        .sort((a, b) => b.bestE1rmKg - a.bestE1rmKg)
        .map((l) => ({
          name: l.displayName,
          bestE1rmKg: l.bestE1rmKg,
          slopeKgPerWeek: l.slopeKgPerWeek?.value ?? null,
          exposures: l.exposures,
        })),
      painEpisodes: (athleteModel?.pain?.episodes ?? []).map((e) => ({
        exerciseName: e.exerciseName,
        date: e.date,
      })),
      flaggedFamilies: athleteModel?.pain?.flaggedFamilies ?? [],
      activeBlock: active
        ? {
            name: active.name,
            focus: active.focus,
            startMonday: active.startMonday,
            weekIndex: weekIndexOf(active.startMonday, todayStr, active.weeks.length),
            weekCount: active.weeks.length,
            status: active.status,
          }
        : null,
      adoptedPlanNames: Object.keys(coachBlocks?.adoptedPlans ?? {}).map(
        (planId) => plannedWorkouts?.find((p) => p.id === planId)?.name ?? planId
      ),
      todaySession,
      recentWorkouts: sortedWorkouts.slice(0, 5).map((w) => ({
        date: w.date,
        name: w.name ?? 'Workout',
        lifts: w.exercises.map((e) => e.name),
      })),
      prs: sortedPrs.slice(0, 5).map((p) => ({
        exercise: p.exercise,
        oneRepMax: p.oneRepMax,
        date: p.date,
      })),
      readiness: latestReadiness
        ? { score: latestReadiness.score, band: latestReadiness.band }
        : null,
      perMuscle,
      weeklyReviews: sortedReviews.slice(0, 2).map((r) => ({
        weekMonday: r.weekMonday,
        focusHeadline: r.focus.headline,
        sessionsCompleted: r.sessionsCompleted,
        sessionsPlanned: r.sessionsPlanned,
      })),
      mealsToday,
      macroGoals: macroGoals
        ? {
            calories: macroGoals.calories,
            proteinG: macroGoals.proteinG,
            carbsG: macroGoals.carbsG,
            fatG: macroGoals.fatG,
          }
        : null,
      bodyMetricsLatest: latestMetric
        ? {
            date: latestMetric.date,
            weightKg: latestMetric.weightKg ?? null,
            waistIn: latestMetric.waistIn ?? null,
          }
        : null,
      checkinToday: checkin
        ? {
            sleep: checkin.sleep ?? null,
            soreness: checkin.soreness ?? null,
            energy: checkin.energy ?? null,
            // UX-18: the free-text notes typed in today's guided
            // check-in are the user's own words — part of their slice.
            notes: Object.values(checkin.notes ?? {}).filter(
              (n): n is string => typeof n === 'string' && n.trim().length > 0
            ),
          }
        : null,
    };
  }, [
    profile,
    trainingProfile,
    athleteModel,
    coachBlocks,
    weeklyReviews,
    workouts,
    prs,
    meals,
    macroGoals,
    bodyMetrics,
    dailyCheckins,
    plannedWorkouts,
    weeklySchedule,
    activeWorkoutDraft,
    readinessHistory,
  ]);

  // Form-check bridge (B2): stored form sessions live in localStorage,
  // not the zustand store, so they are read on mount. This section
  // remounts on every tab switch (see FE-06 note above), which is also
  // when a just-finished form analysis would first be asked about.
  const formSessions = useMemo(() => FormSessionRepository.getRecentSessions(25), []);
  const context = useMemo(
    () => buildCoachChatContext(userData, formSessions),
    [userData, formSessions]
  );

  const send = async (presetText?: string) => {
    const text = (presetText ?? input).trim();
    if (!text || sending) return;
    setError(null);
    setInput('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const nextMessages: CoachChatMessage[] = [
      ...messages,
      { role: 'user', content: text, ts: epochNow() },
    ];
    setMessages(nextMessages);
    setSending(true);
    try {
      const res = await fetch('/api/ai/coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAiAuthHeaders()) },
        body: JSON.stringify({
          message: text,
          history,
          language: getCurrentLanguage(),
          context: {
            contextText: context.contextText,
            evidence: context.evidence,
            hasData: context.hasData,
            // Phase 3 (Task 3.1): 13–17 → the route adds the MINOR
            // ATHLETE rule to the system prompt.
            minor: isMinorAge(profile?.age),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError(data?.error === 'RATE_LIMIT' ? 'rate' : 'cap');
        } else {
          setError('generic');
        }
        return;
      }
      if (typeof data?.dailyRemaining === 'number') {
        setDailyLeftRaw(data.dailyRemaining, toLocalDateString(new Date()));
      }
      // Settle on append: the new pending action supersedes any older
      // pending one of the same type, and long-expired drafts settle.
      setMessages(
        settlePendingActions(
          [...nextMessages, assistantMessageFromResponse(data, epochNow(), t('coachChat.errorGeneric'))],
          epochNow(),
          useStore.getState().macroGoals
        )
      );
    } catch {
      setError('generic');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      // QA-hardening R10: with a conversation going, the section is a
      // bounded chat column — the thread takes the available height
      // (flex-1, the ONE scroll region), and the input row pins to
      // the section's bottom instead of floating mid-page under a
      // max-h-80 thread nested in the page scroll. Empty state keeps
      // its natural height.
      className={
        messages.length > 0 ? 'flex flex-col gap-2.5 h-[min(78dvh,46rem)]' : 'space-y-2.5'
      }
      aria-label={t('coachChat.sectionAria')}
    >
      <div className="flex items-center gap-2">
        <h2 className="section-title text-[0.6875rem] mb-0">{t('coachChat.title')}</h2>
        {messages.length > 0 && (
          <button
            type="button"
            className="ml-auto text-2xs font-bold text-accent-text cursor-pointer"
            onClick={() => {
              if (confirmClear) {
                clearCoachChat();
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
                window.setTimeout(() => setConfirmClear(false), 3000);
              }
            }}
          >
            {t(confirmClear ? 'coachChat.newChatConfirm' : 'coachChat.newChat')}
          </button>
        )}
      </div>
      <p className="text-2xs text-text-muted">{t('coachChat.subtitle')}</p>

      {/* Task 1.2: first-use AI disclosure (once, local, non-blocking) */}
      <AiNoticeBanner feature="coach-chat" />

      {!context.hasData && (
        <p className="card p-3 text-xs text-text-secondary">{t('coachChat.coldStart')}</p>
      )}

      {messages.length === 0 ? (
        /* Empty state: an intro, NOT a stored message — it names what
           the coach can do and the confirmation promise (nothing
           changes until Apply), plus suggestion chips that send
           through the normal path. Plain text, no transcript card:
           the card renders only once a conversation exists (the
           2026-11-01 duplicate-input spot-check still applies). */
        <div className="space-y-2.5 px-1">
          <p className="text-xs text-text-secondary">{t('coachChat.introCapabilities')}</p>
          <p className="text-xs text-text-muted">{t('coachChat.introPromise')}</p>
          <div className="flex flex-wrap gap-1.5">
            {CHIP_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void send(t(key))}
                className="px-3 py-1.5 rounded-full border border-border bg-bg-secondary text-xs font-bold text-text-primary cursor-pointer"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={listRef}
          aria-live="polite"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="card p-3 space-y-3 flex-1 min-h-0 overflow-y-auto"
        >
          {messages.map((m, i) => (
            <div key={i} className="space-y-1">
              {threadDays[i]?.showSeparator && (
                <div className="flex justify-center py-1">
                  <span className="text-[0.625rem] font-bold text-text-muted bg-bg-secondary border border-border/60 rounded-full px-2 py-0.5">
                    {threadDays[i].isToday
                      ? t('common.today')
                      : threadDays[i].isYesterday
                        ? t('coachChat.yesterday')
                        : formatDate(threadDays[i].day!)}
                  </span>
                </div>
              )}
              <p className="text-2xs font-bold text-text-secondary">
                {m.role === 'user' ? t('coachChat.you') : t('coachChat.coach')}
              </p>
              {m.role === 'assistant' ? (
                // N4: model prose leaks ISO dates ("2026-11-06") into
                // sentences — display them in the one date format.
                // M2: health claims are scrubbed at display too, so
                // stored history is covered, not just new replies.
                // Display-time only; the stored message is untouched.
                <CoachMarkdown text={displayDatesInText(scrubHealthClaims(m.content))} />
              ) : (
                <p className="text-sm text-text-primary whitespace-pre-wrap">{m.content}</p>
              )}
              {m.role === 'assistant' && m.action && (
                threadDays[i]?.isPastDay &&
                (m.actionState === 'applied' || m.actionState === 'undone') ? (
                  <OldActionCard
                    message={m}
                    onPatch={(patch) => patchMessage(i, patch)}
                    dateLabel={formatDate(threadDays[i].day!)}
                  />
                ) : (
                  <CoachActionCard message={m} onPatch={(patch) => patchMessage(i, patch)} />
                )
              )}
              {m.role === 'assistant' && m.evidence && m.evidence.length > 0 && (
                <div className="text-2xs text-text-muted">
                  <p className="font-bold">{t('coachChat.basedOn')}</p>
                  <ul className="list-disc list-inside">
                    {m.evidence.slice(0, 4).map((e, j) => (
                      // T3: stored evidence can carry ISO dates from
                      // older builds — render them in the one format.
                      <li key={j}>{displayDatesInText(e)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="space-y-1">
              <p className="text-2xs font-bold text-text-secondary">{t('coachChat.coach')}</p>
              <div className="flex items-center gap-2" role="status">
                <span className="flex items-end gap-1" aria-hidden="true">
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="text-xs text-text-muted">{t('coachChat.thinking')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {error === 'generic' && <p role="alert" className="text-xs text-red-500">{t('coachChat.errorGeneric')}</p>}
      {error === 'cap' && <p role="alert" className="text-xs text-red-500">{t('coachChat.errorCap')}</p>}
      {error === 'rate' && <p role="alert" className="text-xs text-red-500">{t('coachChat.errorRateLimit')}</p>}
      {dailyLeft !== null && (
        <p className="text-2xs text-text-muted">{t('coachChat.dailyLeft', { n: dailyLeft })}</p>
      )}

      <div className="flex gap-2">
        <TextInput
          value={input}
          onChange={setInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder={t('coachChat.placeholder')}
          maxLength={2000}
          className="flex-1 min-w-0 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
          aria-label={t('coachChat.placeholder')}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || input.trim().length === 0}
          className="btn-primary px-4 py-2 text-sm font-bold shrink-0 cursor-pointer"
        >
          {t('coachChat.send')}
        </button>
      </div>
    </section>
  );
}
