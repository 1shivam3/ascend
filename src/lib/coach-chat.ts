/**
 * Conversational coach (Phase 4) — pure logic.
 *
 * HARD RULE (user's condition, 2026-10-24): this is NOT a generic fitness
 * chatbot. Every answer must be grounded in the individual user's own data.
 * The client assembles a compact slice of THAT user's stores and sends it
 * with every message; the model is instructed to answer only from it, to
 * cite the data points it relies on, and to say plainly when the data is
 * not there instead of inventing anything. Nothing here is generic advice
 * dressed up as personalization.
 *
 * Text chat only, v1. No voice, no image analysis. No paywall — free like
 * everything else currently free. Week starts Monday.
 *
 * Privacy: prompts/responses are never logged with user identifiers. The
 * server route must not log message content at all.
 */

// ── Caps (defined in code, enforced server-side) ──────────────────────────
/** Max reply length the server will ever return (chars). */
export const COACH_CHAT_MAX_REPLY_CHARS = 1500;
/** Word budget the model is instructed to stay within. */
export const COACH_CHAT_MAX_REPLY_WORDS = 150;
/** Max user message length (chars). */
export const COACH_CHAT_MAX_MESSAGE_CHARS = 2000;
/** Max conversation turns sent to the model (user + assistant pairs). */
export const COACH_CHAT_MAX_HISTORY_TURNS = 10;
/** Per-IP burst limit: messages per minute. */
export const COACH_CHAT_MINUTE_CAP = 10;
/** Per-IP daily limit: messages per 24h. This IS the per-user cap as far as
 *  the server can identify a user: guest mode has no account identity, so
 *  the client IP is the user key (same pattern as the other AI routes). */
export const COACH_CHAT_DAILY_CAP = 30;
/** Request body cap (bytes) — same as the existing coach route. */
export const COACH_CHAT_BODY_LIMIT = 64 * 1024;
/** Provider wall-clock timeout (ms) — same as the existing coach route. */
export const COACH_CHAT_PROVIDER_TIMEOUT_MS = 15000;

// ── Safety ─────────────────────────────────────────────────────────────────
/**
 * Hard-stop signals: pain / injury / red-flag language. A match means the
 * server answers with the refer-out copy WITHOUT calling the model — never
 * a diagnosis, never advice to continue. Deliberately narrow: ordinary
 * training soreness ("sore", "soreness", "tired", "fatigued") is NOT a
 * stop signal; it is normal training data the coach may discuss.
 */
const PAIN_PATTERNS: RegExp[] = [
  /\bpain\b/i,
  /\bhurts?\b/i,
  /\bhurting\b/i,
  /\binjur(ed|y|ies)\b/i,
  /\bsprain\b/i,
  /\btear\b/i,
  /\btorn\b/i,
  /\bbroken\b/i,
  /\bfracture\b/i,
  /\bnumb\b/i,
  /\btingling\b/i,
  /\bdizz(y|iness)\b/i,
  /\bchest pain\b/i,
  /\bswell(ing|en)\b/i,
  /\bsharp pain\b/i,
  /\bpopped\b/i,
];

/**
 * Disordered-eating / extreme-restriction signals. Same hard-stop handling
 * with a different refer-out: encouragement toward a balanced approach and
 * professional guidance, never a diet plan.
 */
const RESTRICTION_PATTERNS: RegExp[] = [
  /\bpurge\b/i,
  /\bpurging\b/i,
  /\bvomit\b/i,
  /\blaxative\b/i,
  /\bstarv(e|ing)\b/i,
  /\banorexia\b/i,
  /\bbulimia\b/i,
  /\bthrow(ing)? up\b/i,
  /\beat nothing\b/i,
  /\bstop eating\b/i,
];

export type CoachChatSafetyStop = 'pain' | 'restriction' | null;

/** Pure scan: returns the stop reason, or null when the message is safe to answer. */
export function detectSafetyStop(message: string): CoachChatSafetyStop {
  if (PAIN_PATTERNS.some((re) => re.test(message))) return 'pain';
  if (RESTRICTION_PATTERNS.some((re) => re.test(message))) return 'restriction';
  return null;
}

/** Refer-out copy, bilingual. The server returns this verbatim on a safety stop. */
export const COACH_CHAT_REFER_OUT: Record<
  Exclude<CoachChatSafetyStop, null>,
  { en: string; hi: string }
> = {
  pain: {
    en: "Let's stop here — I can't diagnose pain or tell you whether it's safe to keep training. Rest, and if it persists or worries you, talk to a physiotherapist or coach in person.",
    hi: 'यहीं रुकते हैं — मैं दर्द का निदान नहीं कर सकता और न ही यह बता सकता हूँ कि ट्रेनिंग जारी रखना सुरक्षित है या नहीं। आराम करें, और अगर दर्द बना रहे या चिंता हो, तो किसी फ़िज़ियोथेरेपिस्ट या कोच से व्यक्तिगत रूप से बात करें।',
  },
  restriction: {
    en: "I can't help with extreme restriction or purging — those can seriously harm your health. Training needs enough food to recover. A balanced approach, and a doctor or registered dietitian if you want a plan, is the safe way forward.",
    hi: 'मैं अत्यधिक परहेज़ या उल्टी जैसे व्यवहारों में मदद नहीं कर सकता — ये आपकी सेहत को गंभीर नुकसान पहुँचा सकते हैं। ट्रेनिंग से उबरने के लिए पर्याप्त भोजन ज़रूरी है। संतुलित तरीका अपनाएँ, और योजना के लिए डॉक्टर या पंजीकृत आहार विशेषज्ञ से बात करें।',
  },
};

// ── User data slice (the personalization contract) ────────────────────────
export interface CoachChatLiftSummary {
  name: string;
  bestE1rmKg: number;
  slopeKgPerWeek: number | null;
  exposures: number;
}

export interface CoachChatWorkoutSummary {
  date: string;
  name: string;
  lifts: string[];
}

export interface CoachChatPrSummary {
  exercise: string;
  oneRepMax: number;
  date: string;
}

export interface CoachChatUserData {
  userName: string | null;
  bodyweightKg: number | null;
  unit: 'kg' | 'lbs';
  goal: string | null;
  experience: string | null;
  daysPerWeek: number | null;
  /** Pre-rendered athlete-model facts (the model's own words, with numbers). */
  athleteFacts: string[];
  lifts: CoachChatLiftSummary[];
  painEpisodes: Array<{ exerciseName: string; date: string }>;
  flaggedFamilies: string[];
  activeBlock: {
    name: string;
    focus: string;
    startMonday: string;
    weekIndex: number;
    weekCount: number;
    status: string;
  } | null;
  adoptedPlanNames: string[];
  recentWorkouts: CoachChatWorkoutSummary[];
  prs: CoachChatPrSummary[];
  readiness: { score: number; band: string } | null;
  perMuscle: Array<{ muscle: string; band: string }>;
  weeklyReviews: Array<{
    weekMonday: string;
    focusHeadline: string;
    sessionsCompleted: number;
    sessionsPlanned: number;
  }>;
  mealsToday: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    items: number;
  } | null;
  macroGoals: { calories: number; proteinG: number } | null;
  bodyMetricsLatest: {
    date: string;
    weightKg: number | null;
    waistIn: number | null;
  } | null;
  checkinToday: {
    sleep: number | null;
    soreness: number | null;
    energy: number | null;
  } | null;
}

export interface CoachChatContext {
  /** Full context text sent to the model. */
  contextText: string;
  /** False when the user has no training history yet (cold start). */
  hasData: boolean;
  /** Data categories that are absent — drives the "what to log first" hint. */
  missingAreas: string[];
  /** Short citation lines, echoed back to the client for "Based on" display. */
  evidence: string[];
}

function fmtKg(v: number, unit: 'kg' | 'lbs'): string {
  return unit === 'lbs' ? `${Math.round(v * 2.20462)} lbs` : `${Math.round(v)} kg`;
}

/**
 * Assembles the grounded context from ONE user's data. Pure and
 * deterministic: the same data always yields the same text, and an empty
 * user yields a context that contains NO invented numbers, names, or
 * history — only the explicit no-history marker.
 */
export function buildCoachChatContext(data: CoachChatUserData): CoachChatContext {
  const evidence: string[] = [];
  const sections: string[] = [];

  const userLine = [
    `Name: ${data.userName ?? 'not set'}`,
    `Bodyweight: ${data.bodyweightKg != null ? fmtKg(data.bodyweightKg, data.unit) : 'not logged'}`,
    `Goal: ${data.goal ?? 'not set'}`,
    `Experience: ${data.experience ?? 'not set'}`,
    `Days/week: ${data.daysPerWeek ?? 'not set'}`,
  ].join(' | ');
  sections.push(`USER: ${userLine}`);

  if (data.athleteFacts.length > 0) {
    sections.push(`WHAT YOUR COACH HAS LEARNED (from your logged data):\n- ${data.athleteFacts.join('\n- ')}`);
    for (const f of data.athleteFacts.slice(0, 3)) evidence.push(f);
  }

  if (data.lifts.length > 0) {
    const lines = data.lifts.slice(0, 8).map((l) => {
      const slope =
        l.slopeKgPerWeek != null
          ? `, trending ${l.slopeKgPerWeek >= 0 ? '+' : ''}${l.slopeKgPerWeek.toFixed(1)} kg/week`
          : '';
      return `${l.name}: best estimated 1RM ${fmtKg(l.bestE1rmKg, data.unit)} (${l.exposures} sessions${slope})`;
    });
    sections.push(`LIFTS (your logged numbers, not estimates of potential):\n- ${lines.join('\n- ')}`);
    const top = data.lifts[0];
    if (top) evidence.push(`${top.name} best estimated 1RM ${fmtKg(top.bestE1rmKg, data.unit)} (your logged lifts)`);
  }

  if (data.activeBlock) {
    const b = data.activeBlock;
    sections.push(
      `CURRENT COACH BLOCK: "${b.name}" (focus: ${b.focus}, started ${b.startMonday}, week ${b.weekIndex} of ${b.weekCount}, status: ${b.status})`
    );
    evidence.push(`Current block "${b.name}", week ${b.weekIndex} of ${b.weekCount}`);
  }

  if (data.adoptedPlanNames.length > 0) {
    sections.push(`ADOPTED PLANS: ${data.adoptedPlanNames.join(', ')}`);
  }

  if (data.recentWorkouts.length > 0) {
    const lines = data.recentWorkouts.slice(0, 5).map((w) => {
      const lifts = w.lifts.length > 0 ? ` — ${w.lifts.join(', ')}` : '';
      return `${w.date}: ${w.name}${lifts}`;
    });
    sections.push(`RECENT WORKOUTS (most recent first):\n- ${lines.join('\n- ')}`);
    const last = data.recentWorkouts[0];
    if (last) evidence.push(`Last workout: ${last.name} on ${last.date}`);
  }

  if (data.prs.length > 0) {
    const lines = data.prs.slice(0, 5).map((p) => `${p.exercise}: ${fmtKg(p.oneRepMax, data.unit)} on ${p.date}`);
    sections.push(`PERSONAL RECORDS:\n- ${lines.join('\n- ')}`);
    const top = data.prs[0];
    if (top) evidence.push(`Recent PR: ${top.exercise} ${fmtKg(top.oneRepMax, data.unit)} on ${top.date}`);
  }

  if (data.readiness) {
    sections.push(`READINESS TODAY: score ${data.readiness.score}, band ${data.readiness.band}`);
    evidence.push(`Readiness today: ${data.readiness.band} (${data.readiness.score})`);
  }
  const lowMuscles = data.perMuscle.filter((m) => m.band === 'low' || m.band === 'caution');
  if (lowMuscles.length > 0) {
    sections.push(`MUSCLES NEEDING CAUTION TODAY: ${lowMuscles.map((m) => `${m.muscle} (${m.band})`).join(', ')}`);
    evidence.push(`Muscles needing caution: ${lowMuscles.map((m) => m.muscle).join(', ')}`);
  }

  if (data.weeklyReviews.length > 0) {
    const lines = data.weeklyReviews.slice(0, 2).map(
      (r) => `Week of ${r.weekMonday}: focus "${r.focusHeadline}" — ${r.sessionsCompleted} of ${r.sessionsPlanned} sessions`
    );
    sections.push(`WEEKLY REVIEWS:\n- ${lines.join('\n- ')}`);
    const latest = data.weeklyReviews[0];
    if (latest) evidence.push(`Latest review (week of ${latest.weekMonday}): ${latest.focusHeadline}`);
  }

  if (data.mealsToday && data.macroGoals) {
    sections.push(
      `NUTRITION TODAY: ${Math.round(data.mealsToday.calories)} kcal, ${Math.round(data.mealsToday.proteinG)} g protein ` +
        `across ${data.mealsToday.items} logged items (target: ${Math.round(data.macroGoals.calories)} kcal, ${Math.round(data.macroGoals.proteinG)} g protein)`
    );
    evidence.push(
      `Today's food so far: ${Math.round(data.mealsToday.calories)} kcal, ${Math.round(data.mealsToday.proteinG)} g protein`
    );
  } else if (data.mealsToday) {
    sections.push(
      `NUTRITION TODAY: ${Math.round(data.mealsToday.calories)} kcal, ${Math.round(data.mealsToday.proteinG)} g protein across ${data.mealsToday.items} logged items (no macro target set)`
    );
  }

  if (data.bodyMetricsLatest) {
    const m = data.bodyMetricsLatest;
    const parts = [`${m.date}`];
    if (m.weightKg != null) parts.push(`weight ${fmtKg(m.weightKg, data.unit)}`);
    if (m.waistIn != null) parts.push(`waist ${m.waistIn} in`);
    sections.push(`LATEST BODY MEASUREMENT: ${parts.join(', ')}`);
    if (m.weightKg != null) evidence.push(`Latest weigh-in: ${fmtKg(m.weightKg, data.unit)} on ${m.date}`);
  }

  if (data.checkinToday && (data.checkinToday.sleep != null || data.checkinToday.soreness != null || data.checkinToday.energy != null)) {
    const c = data.checkinToday;
    sections.push(
      `TODAY'S CHECK-IN: sleep ${c.sleep ?? '—'}/5, soreness ${c.soreness ?? '—'}/5, energy ${c.energy ?? '—'}/5`
    );
  }

  if (data.painEpisodes.length > 0) {
    const lines = data.painEpisodes.slice(0, 3).map((p) => `${p.exerciseName || 'whole session'} on ${p.date}`);
    sections.push(`PAIN EPISODES ON RECORD (respect these — do not program the flagged lifts):\n- ${lines.join('\n- ')}`);
    if (data.flaggedFamilies.length > 0) {
      sections.push(`FLAGGED MOVEMENT FAMILIES (excluded from new plans): ${data.flaggedFamilies.join(', ')}`);
    }
  }

  // History = anything the coach has actually observed. A bare profile with
  // a goal but no logged training is still a cold start: there is nothing
  // personal to ground an answer in yet.
  const hasData =
    data.recentWorkouts.length > 0 ||
    data.prs.length > 0 ||
    data.activeBlock != null ||
    data.athleteFacts.length > 0 ||
    data.lifts.length > 0 ||
    data.weeklyReviews.length > 0;

  const missingAreas: string[] = [];
  if (data.recentWorkouts.length === 0) missingAreas.push('workouts');
  if (data.prs.length === 0) missingAreas.push('personal records');
  if (data.activeBlock == null) missingAreas.push('coach block');
  if (data.weeklyReviews.length === 0) missingAreas.push('weekly reviews');
  if (data.mealsToday == null) missingAreas.push("today's meals");
  if (data.bodyMetricsLatest == null) missingAreas.push('body measurements');

  if (!hasData) {
    sections.push(
      'NO USER HISTORY YET: this user has not logged workouts, personal records, a coach block, or weekly reviews. There is nothing personal to base an answer on.'
    );
  }

  return { contextText: sections.join('\n\n'), hasData, missingAreas, evidence };
}

/** System prompt: the honesty doctrine, enforced on every reply. */
export function buildCoachChatSystemPrompt(opts: {
  language: 'en' | 'hi';
  hasData: boolean;
}): string {
  const langLine =
    opts.language === 'hi'
      ? 'Reply in Hindi (Devanagari). Keep the reply in Hindi even when exercise and food names stay in English.'
      : 'Reply in English.';
  const coldStart = opts.hasData
    ? ''
    : '\n\nCOLD START: the context says this user has no training history yet. Say so honestly in your first sentence — never pretend to know their lifts, plans, or progress. Then suggest the smallest first step: log a first workout, or tell you their goal and weekly schedule.';
  return [
    'You are ASCEND\u2019s coach. You answer ONLY from the individual user\u2019s data in the context below.',
    'RULES — never break these:',
    '1. Every training or nutrition suggestion must cite a specific data point from the context (a lift, a block, a workout date, a review, a meal total). Name the data you relied on.',
    '2. If the context does not contain the data needed, say plainly that you do not have that history yet and say what to log first. NEVER invent personal records, plans, weights, dates, or history. NEVER state a number that is not in the context.',
    `3. Keep replies short: at most about ${COACH_CHAT_MAX_REPLY_WORDS} words.`,
    '4. You are a coach, not a doctor. Never diagnose injury, illness, or pain, and never claim medical accuracy.',
    '5. Never suggest extreme restriction, purging, starving, or any disordered-eating behavior. If asked, encourage a balanced approach and professional guidance.',
    '6. Week starts Monday. Be encouraging and specific, never generic.',
    langLine,
    coldStart,
  ].join('\n');
}

/** Server-side hard cap on reply length: truncate, never serve unbounded text. */
export function truncateReply(reply: string): string {
  if (reply.length <= COACH_CHAT_MAX_REPLY_CHARS) return reply;
  return `${reply.slice(0, COACH_CHAT_MAX_REPLY_CHARS - 1).trimEnd()}…`;
}

export interface CoachChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Sanitize conversation history: cap turns and per-message length. */
export function sanitizeHistory(history: unknown): CoachChatHistoryTurn[] {
  if (!Array.isArray(history)) return [];
  const turns: CoachChatHistoryTurn[] = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { role?: unknown; content?: unknown };
    if (rec.role !== 'user' && rec.role !== 'assistant') continue;
    if (typeof rec.content !== 'string') continue;
    turns.push({ role: rec.role, content: rec.content.slice(0, COACH_CHAT_MAX_MESSAGE_CHARS) });
    if (turns.length >= COACH_CHAT_MAX_HISTORY_TURNS) break;
  }
  return turns;
}

/** Render history for the model prompt (oldest first). */
export function formatHistoryForPrompt(turns: CoachChatHistoryTurn[]): string {
  if (turns.length === 0) return 'No earlier messages in this conversation.';
  return turns.map((t) => `${t.role === 'user' ? 'User' : 'Coach'}: ${t.content}`).join('\n');
}
