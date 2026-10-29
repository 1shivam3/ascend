import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { getTodaySessionState } from '@/lib/workout-engine';
import { getCurrentLanguage, useTranslation } from '@/lib/i18n';
import {
  buildCoachChatContext,
  type CoachChatUserData,
} from '@/lib/coach-chat';
import { getAiAuthHeaders } from '@/lib/ai-client-auth';
import { toLocalDateString } from '@/lib/habits';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  evidence?: string[];
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<'generic' | 'cap' | 'rate' | null>(null);
  const [dailyLeft, setDailyLeft] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

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
      macroGoals: macroGoals ? { calories: macroGoals.calories, proteinG: macroGoals.proteinG } : null,
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

  const context = useMemo(() => buildCoachChatContext(userData), [userData]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
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
      if (typeof data?.dailyRemaining === 'number') setDailyLeft(data.dailyRemaining);
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: typeof data?.reply === 'string' ? data.reply : t('coachChat.errorGeneric'),
          evidence: Array.isArray(data?.evidence) ? data.evidence : [],
        },
      ]);
    } catch {
      setError('generic');
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
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

      <div ref={listRef} className="card p-3 space-y-3 max-h-80 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-text-muted">{t('coachChat.placeholder')}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="space-y-1">
            <p className="text-2xs font-bold text-text-secondary">
              {m.role === 'user' ? t('coachChat.you') : t('coachChat.coach')}
            </p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{m.content}</p>
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
        {sending && <p className="text-xs text-text-muted">{t('coachChat.sending')}</p>}
      </div>

      {error === 'generic' && <p className="text-xs text-red-500">{t('coachChat.errorGeneric')}</p>}
      {error === 'cap' && <p className="text-xs text-red-500">{t('coachChat.errorCap')}</p>}
      {error === 'rate' && <p className="text-xs text-red-500">{t('coachChat.errorRateLimit')}</p>}
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
