import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { getTodaySessionState } from '@/lib/workout-engine';
import { getCurrentLanguage, useTranslation } from '@/lib/i18n';
import {
  buildCoachChatContext,
  type CoachChatUserData,
} from '@/lib/coach-chat';
import { getAiAuthHeaders } from '@/lib/ai-client-auth';
import { toLocalDateString } from '@/lib/habits';
import {
  useCoachChatStore,
  currentDailyLeft,
  type CoachChatMessage,
} from '@/lib/coach-chat-store';
import { validateCoachAction } from '@/lib/coach-actions';
import { settlePendingActions } from '@/lib/coach-action-executor';
import CoachActionCard from '@/components/CoachActionCard';
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
  return {
    role: 'assistant',
    content: typeof rec.reply === 'string' ? rec.reply : fallbackText,
    evidence: Array.isArray(rec.evidence) ? rec.evidence : [],
    ts: now,
    ...(action ? { action, actionState: 'pending' as const } : {}),
  };
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
  const listRef = useRef<HTMLDivElement | null>(null);
  // Scroll discipline (Slice B): auto-scroll only while the user is
  // already near the bottom — a new coach message must never yank a
  // scrolled-up reader down to it.
  const stickRef = useRef(true);

  // Settle persisted pending cards on mount: expired drafts and
  // superseded duplicates resolve even if the user never sends again.
  useEffect(() => {
    const cur = useCoachChatStore.getState().messages;
    const settled = settlePendingActions(cur, Date.now());
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
      setMessages(cur.map((m, i) => (i === index ? { ...m, ...patch } : m)));
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
          : sessionInfo.status === 'planned'
            ? {
                state: sessionInfo.isRestDay ? 'rest' : 'planned',
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
      userName: profile?.name ?? null,
      bodyweightKg: profile?.bodyweightKg ?? null,
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
          epochNow()
        )
      );
    } catch {
      setError('generic');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2.5" aria-label={t('coachChat.sectionAria')}>
      <div className="flex items-center gap-2">
        <h2 className="section-title text-[0.6875rem] mb-0">{t('coachChat.title')}</h2>
      </div>
      <p className="text-2xs text-text-muted">{t('coachChat.subtitle')}</p>

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
          className="card p-3 space-y-3 max-h-80 overflow-y-auto"
        >
          {messages.map((m, i) => (
            <div key={i} className="space-y-1">
              <p className="text-2xs font-bold text-text-secondary">
                {m.role === 'user' ? t('coachChat.you') : t('coachChat.coach')}
              </p>
              {m.role === 'assistant' ? (
                <CoachMarkdown text={m.content} />
              ) : (
                <p className="text-sm text-text-primary whitespace-pre-wrap">{m.content}</p>
              )}
              {m.role === 'assistant' && m.action && (
                <CoachActionCard message={m} onPatch={(patch) => patchMessage(i, patch)} />
              )}
              {m.role === 'assistant' && m.evidence && m.evidence.length > 0 && (
                <div className="text-2xs text-text-muted">
                  <p className="font-bold">{t('coachChat.basedOn')}</p>
                  <ul className="list-disc list-inside">
                    {m.evidence.slice(0, 4).map((e, j) => (
                      <li key={j}>{e}</li>
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
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
          className="btn-primary px-4 py-2 text-sm font-bold shrink-0 cursor-pointer disabled:opacity-50"
        >
          {t('coachChat.send')}
        </button>
      </div>
    </section>
  );
}
