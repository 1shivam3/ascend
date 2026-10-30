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
  // Hindi (Devanagari) equivalents — the app is bilingual, and a safety
  // scan that only understands English leaves Hindi users unprotected
  // (re-audit SEC-R1/E2E-R2). दर्द = pain, चोट = injury, सूजन = swelling,
  // मोच = sprain. Starter set mirroring the English categories; flagged
  // for native-speaker expansion in the re-audit ledger.
  /दर्द/,
  /चोट/,
  /सूजन/,
  /मोच/,
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
  // Hindi: उल्टी = vomiting / purging (re-audit SEC-R1/E2E-R2).
  /उल्टी/,
];

export type CoachChatSafetyStop = 'pain' | 'restriction' | null;

/** Pure scan: returns the stop reason, or null when the message is safe to answer. */
export function detectSafetyStop(message: string): CoachChatSafetyStop {
  if (PAIN_PATTERNS.some((re) => re.test(message))) return 'pain';
  if (RESTRICTION_PATTERNS.some((re) => re.test(message))) return 'restriction';
  return null;
}

/**
 * Header of the ONLY section of the grounding context that carries the
 * user's own free text. Everything else in the context is app-generated
 * scaffolding and summaries — including the literal header "PAIN
 * EPISODES ON RECORD" and athlete-model facts that quote the user's
 * pain history ("Pain has come up on N days…").
 */
export const COACH_CHAT_NOTES_SECTION_HEADER =
  "NOTES FROM TODAY'S CHECK-IN (the user's own words):";

/**
 * Extract the user's check-in notes (their own words) from a built
 * context text; '' when the context carries no notes section.
 */
export function extractCheckinNotes(contextText: string): string {
  if (!contextText) return '';
  const section = contextText
    .split('\n\n')
    .find((s) => s.startsWith(COACH_CHAT_NOTES_SECTION_HEADER));
  if (!section) return '';
  return section
    .slice(COACH_CHAT_NOTES_SECTION_HEADER.length)
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Whole-request safety scan (re-audit SEC-R1/E2E-R2): the pre-provider
 * stop must cover the user's own words wherever they will be forwarded
 * to the model — the current message, the user's history turns, and the
 * check-in notes inside the grounding context. A stop found in any of
 * those channels returns the same refer-out; the current message wins
 * ties so the copy matches what the user just said.
 *
 * Audit-3 SEC2-2: the context channel is the check-in NOTES section
 * only — never the whole context text. The generated scaffolding
 * itself contains the scan's own trigger words (the section header
 * "PAIN EPISODES ON RECORD", athlete-model facts quoting pain
 * history), so scanning it permanently safety-stopped every message
 * from any user with a pain episode on record: exactly the users the
 * scan exists to protect could not use the chat at all. The user's
 * notes remain fully scanned (EN + HI), so a pain disclosure typed
 * into the check-in still stops the request before any provider call.
 */
export function findSafetyStop(input: {
  message: string;
  history?: CoachChatHistoryTurn[];
  contextText?: string;
}): CoachChatSafetyStop {
  const fromMessage = detectSafetyStop(input.message);
  if (fromMessage) return fromMessage;
  const userTurns = (input.history ?? [])
    .filter((t) => t.role === 'user')
    .map((t) => t.content)
    .join('\n');
  if (userTurns) {
    const fromHistory = detectSafetyStop(userTurns);
    if (fromHistory) return fromHistory;
  }
  if (input.contextText) {
    const notes = extractCheckinNotes(input.contextText);
    if (notes) return detectSafetyStop(notes);
  }
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

// ── Topic gate (re-audit E2E-R1: mechanical enforcement of the lock) ──────
/**
 * Decline copy for the mechanical topic gate, mirroring the wording the
 * model itself used under prompt rule 7 (live-verified at the PR #59
 * merge). The Hindi line is machine-written — flagged for the same
 * native-speaker review as the rest of the chat copy.
 */
export const COACH_CHAT_TOPIC_DECLINE: { en: string; hi: string } = {
  en: "I can only help with your training, nutrition, recovery, or sleep. Let's focus on your workout or fitness plan.",
  hi: 'मैं केवल आपकी ट्रेनिंग, पोषण, रिकवरी या नींद में मदद कर सकता हूँ। चलिए आपके वर्कआउट या फ़िटनेस योजना पर ध्यान देते हैं।',
};

/**
 * In-scope signal lexicon (English stems, prefix-matched): training
 * movements and muscles, nutrition, recovery/sleep, and the user's own
 * ASCEND data. Deliberately generous — the gate fires ONLY when a
 * message carries zero in-scope signal, so breadth here is what keeps
 * legitimate fitness questions (however phrased) away from the decline.
 */
const TOPIC_SIGNAL_EN =
  /\b(train|workout|exercis|lift|squat|bench|deadlift|press|curl|row|pull[- ]?up|push[- ]?up|lunge|plank|stretch|cardio|gym|muscle|chest|back|shoulder|bicep|tricep|glute|quad|hamstring|calf|calves|core|abs|protein|calorie|kcal|carb|diet|meal|food|nutrition|macro|creatine|supplement|whey|sleep|slept|rest|recover|sore|tired|fatigue|energy|nap|deload|plan|program|programme|block|schedule|streak|progress|goal|coach|ascend|app|weight|weigh|scale|reps?|sets?|record|session|hydration|water|run|running|jog|cycl|swim|yoga|walk|steps?|egg|chicken|rice|dal|roti|paneer|milk|oats?|banana|fish|soy|peanut|almond|vegetable|fruit|salad|bread|pasta|potato|hunger|hungry|eat|eating|breakfast|lunch|dinner|snack|body|fitness|health|strong|strength|muscle|form|technique|warm[- ]?up|cooldown|mobility|flexibility|endurance|stamina|heart rate|pr)\b/i;

/** Starter Hindi (Devanagari) signal set — substring-matched. */
const TOPIC_SIGNAL_HI: string[] = [
  'ट्रेनिंग', 'वर्कआउट', 'व्यायाम', 'कसरत', 'जिम', 'मांसपेशी', 'मांसपेशियाँ',
  'प्रोटीन', 'कैलोरी', 'खाना', 'भोजन', 'डाइट', 'पोषण', 'नींद', 'सोना', 'सोने',
  'आराम', 'रिकवरी', 'वजन', 'वज़न', 'शरीर', 'थकान', 'ऊर्जा', 'योजना', 'लक्ष्य',
  'कोच', 'ऐप', 'प्रगति', 'हफ़्ता', 'हफ्ता', 'पानी', 'अंडा', 'अंडे', 'चिकन',
  'चावल', 'दाल', 'रोटी', 'दूध', 'पनीर', 'केला', 'मछली', 'सोया', 'बादाम',
  'सब्ज़ी', 'सब्जी', 'फल', 'सेहत', 'ताकत', 'मज़बूत', 'मजबूत', 'छाती', 'कंधा',
  'कंधे', 'पीठ', 'टांग', 'बांह', 'पेट',
];

/** A number tied to a fitness unit counts as in-scope signal on its own. */
const TOPIC_UNIT_SIGNAL =
  /\d+(?:\.\d+)?\s?(kg|lbs?|km|cm|reps?|sets?|mins?|minutes|hours?|kcal|cal|g|%|x\b)/i;

/**
 * Deterministic topic gate (re-audit E2E-R1): is this message about
 * training, nutrition, recovery, sleep, or the user's own ASCEND data?
 * In-scope when ANY signal hits — a lexicon term (EN stem or HI
 * substring) or a number-with-unit. Continuation rule: with history
 * present, a short reply (< 6 words) is treated as an in-scope
 * follow-up ("yes", "and on Tuesdays?", "what about legs") rather than
 * a new topic. The route declines ONLY on zero signal.
 */
export function isCoachChatInScope(
  message: string,
  history: CoachChatHistoryTurn[] = [],
): boolean {
  const text = message.trim();
  if (!text) return false;
  if (history.length > 0 && text.split(/\s+/).length < 6) return true;
  if (TOPIC_SIGNAL_EN.test(text)) return true;
  if (TOPIC_SIGNAL_HI.some((term) => text.includes(term))) return true;
  if (TOPIC_UNIT_SIGNAL.test(text)) return true;
  return false;
}

// ── Reply caution enforcement (re-audit E2E-R1, prompt rule 8 by code) ────
export type CoachChatReplyRisk = 'near-max' | 'large-deficit' | 'volume-jump';

/**
 * Deterministic scan for the rule-8 risk categories the SEC-22 output
 * guardrails do NOT already hard-block: near-maximal load prescriptions
 * (≥90% of 1RM / RPE 9.5–10 / max attempts), large deficits (an explicit
 * ≥600 kcal deficit, a 1200–1499 kcal/day total prescription — sub-1200
 * directives are guardrail-blocked — or ≥1 kg / ≥2 lb loss per week),
 * and sharp volume jumps (doubling, ≥50% increases, ≥2× weekly
 * frequency). Conservative by design: borderline phrasing passes
 * unflagged rather than decorating ordinary advice with cautions.
 */
export function findReplyRisk(reply: string): CoachChatReplyRisk | null {
  // Near-maximal loads.
  if (
    /\b(9\d|100)\s?%\s?(of\s+)?(your\s+)?(1\s?rm|one[- ]rep max|max)\b/i.test(reply) ||
    /\brpe\s*(9\.5|10)\b/i.test(reply) ||
    /\b(test|attempt|go for|try)\s+(a\s+|your\s+)?(new\s+)?(1\s?rm|one[- ]rep max|max single)\b/i.test(reply) ||
    /\bmax(imum)?\s+(effort|single|attempt)\b/i.test(reply) ||
    // Hindi (audit-3 SEC2-3, machine-written): अधिकतम प्रयास = maximum
    // effort; एक रेप मैक्स / वन रेप मैक्स = one-rep max.
    /अधिकतम\s+(प्रयास|कोशिश)/.test(reply) ||
    /(एक|वन)\s*रेप\s*मैक्स/.test(reply)
  ) {
    return 'near-max';
  }
  // Large calorie deficits / aggressive loss rates.
  const deficitAfter = reply.match(/(\d{3,4})\s?(kcal|calories?|cal)\b[^.]{0,25}?\bdeficit\b/i);
  const deficitBefore = reply.match(/\bdeficit\b[^.]{0,25}?(\d{3,4})\s?(kcal|calories?|cal)\b/i);
  if (
    (deficitAfter && Number(deficitAfter[1]) >= 600) ||
    (deficitBefore && Number(deficitBefore[1]) >= 600)
  ) {
    return 'large-deficit';
  }
  // Hindi: घाटा / कमी = deficit (audit-3 SEC2-3, machine-written).
  const deficitAfterHi = reply.match(/(\d{3,4})\s?(?:kcal|कैलोरी|कैलरी)[^.]{0,25}?(घाटा|कमी)/);
  const deficitBeforeHi = reply.match(/(घाटा|कमी)[^.]{0,25}?(\d{3,4})\s?(?:kcal|कैलोरी|कैलरी)/);
  if (
    (deficitAfterHi && Number(deficitAfterHi[1]) >= 600) ||
    (deficitBeforeHi && Number(deficitBeforeHi[2]) >= 600)
  ) {
    return 'large-deficit';
  }
  const dailyTotal = reply.match(/(\d{4})\s?(kcal|calories?|cal)\b[^.]{0,15}?\b(a day|per day|daily|each day)\b/i);
  if (dailyTotal && Number(dailyTotal[1]) >= 1200 && Number(dailyTotal[1]) < 1500) {
    return 'large-deficit';
  }
  // Hindi daily total: "1400 कैलोरी प्रतिदिन / रोज़" (machine-written).
  const dailyTotalHi = reply.match(/(\d{4})\s?(?:kcal|कैलोरी|कैलरी)[^.]{0,15}?(प्रतिदिन|रोज़ाना|रोज़|प्रति\s*दिन|हर\s*दिन)/);
  if (dailyTotalHi && Number(dailyTotalHi[1]) >= 1200 && Number(dailyTotalHi[1]) < 1500) {
    return 'large-deficit';
  }
  // Hindi also puts the per-day phrase first: "प्रतिदिन 1400 कैलोरी".
  const dailyTotalHiRev = reply.match(/(प्रतिदिन|रोज़ाना|रोज़|प्रति\s*दिन|हर\s*दिन)[^.]{0,15}?(\d{4})\s?(?:kcal|कैलोरी|कैलरी)/);
  if (dailyTotalHiRev && Number(dailyTotalHiRev[2]) >= 1200 && Number(dailyTotalHiRev[2]) < 1500) {
    return 'large-deficit';
  }
  const lossRate = reply.match(
    /\blose\b[^.]{0,20}?(\d+(?:\.\d+)?)\s?(kg|lbs?|pounds?)\b[^.]{0,15}?\b(a|per|each|every)\s?(week|wk)\b/i,
  );
  if (lossRate) {
    const amount = Number(lossRate[1]);
    const isKg = /^kg$/i.test(lossRate[2]);
    if ((isKg && amount >= 1) || (!isKg && amount >= 2)) return 'large-deficit';
  }
  // Hindi loss rate: "1 किलो प्रति सप्ताह" (machine-written).
  const lossRateHi = reply.match(/(\d+(?:\.\d+)?)\s?(?:किलो|kg)[^.]{0,15}?(प्रति|हर)\s*(सप्ताह|हफ़्ता|हफ्ता)/i);
  if (lossRateHi && Number(lossRateHi[1]) >= 1) return 'large-deficit';
  // …and the week-first order: "हर सप्ताह 1 किलो".
  const lossRateHiRev = reply.match(/(प्रति|हर)\s*(सप्ताह|हफ़्ता|हफ्ता)[^.]{0,15}?(\d+(?:\.\d+)?)\s?(?:किलो|kg)/i);
  if (lossRateHiRev && Number(lossRateHiRev[3]) >= 1) return 'large-deficit';
  // Sharp volume jumps.
  if (
    /\bdouble\b[^.]{0,20}\b(volume|sets?|training|workouts?|frequency)\b/i.test(reply) ||
    /\btwice\b[^.]{0,15}\b(as (much|many)|the)\b[^.]{0,15}\b(volume|sets?|training)\b/i.test(reply) ||
    // Hindi: वॉल्यूम/सेट दोगुना = double the volume/sets (machine-written).
    /(वॉल्यूम|सेट|ट्रेनिंग)[^.]{0,20}दोगुना/.test(reply) ||
    /दोगुना[^.]{0,20}(वॉल्यूम|सेट|ट्रेनिंग)/.test(reply)
  ) {
    return 'volume-jump';
  }
  const pctJump = reply.match(/\b(\d+)\s?%\s?(more|increase)\b[^.]{0,20}\b(volume|sets?|training)\b/i);
  if (pctJump && Number(pctJump[1]) >= 50) return 'volume-jump';
  // Hindi % jump: "60% अधिक वॉल्यूम" (machine-written).
  const pctJumpHi = reply.match(/(\d+)\s?%\s?(अधिक|ज़्यादा|ज्यादा)[^.]{0,20}(वॉल्यूम|सेट|ट्रेनिंग)/);
  if (pctJumpHi && Number(pctJumpHi[1]) >= 50) return 'volume-jump';
  const freqJump = reply.match(/\bfrom\s+(\d+)\s*(?:to|→)\s*(\d+)\s*(days?|sessions?|workouts?)\b[^.]{0,10}?\b(a|per)\s?week\b/i);
  if (freqJump && Number(freqJump[2]) >= 2 * Number(freqJump[1])) return 'volume-jump';
  return null;
}

/** Caution lines, prepended verbatim when a risky reply lacks one. The
 * Hindi lines are machine-written — flagged for native-speaker review. */
export const COACH_CHAT_CAUTION: Record<CoachChatReplyRisk, { en: string; hi: string }> = {
  'near-max': {
    en: 'Caution: near-maximal loads carry injury risk — build up gradually and stop if your form breaks down.',
    hi: 'सावधानी: अधिकतम के करीब भार से चोट का जोखिम रहता है — धीरे-धीरे बढ़ाएं और फ़ॉर्म बिगड़ते ही रुक जाएं।',
  },
  'large-deficit': {
    en: 'Caution: a deficit this large can cost muscle, energy, and recovery — a smaller deficit is safer and easier to sustain.',
    hi: 'सावधानी: इतनी बड़ी कैलोरी कटौती से मांसपेशी, ऊर्जा और रिकवरी घट सकती है — छोटी कटौती अधिक सुरक्षित और टिकाऊ होती है।',
  },
  'volume-jump': {
    en: 'Caution: jumping training volume this fast raises injury risk — increase gradually so your body can adapt.',
    hi: 'सावधानी: ट्रेनिंग की मात्रा इतनी तेज़ी से बढ़ाने से चोट का जोखिम बढ़ता है — धीरे-धीरे बढ़ाएं ताकि शरीर ढल सके।',
  },
};

function hasCautionLine(reply: string): boolean {
  return /(^|\n)\s*(caution:|सावधानी:)/i.test(reply);
}

/**
 * Enforce prompt rule 8 mechanically: a reply matching a risk category
 * without a caution line gets the localized caution PREPENDED, naming
 * the risk with a safer alternative. A reply that already carries a
 * caution line (either language) is returned untouched.
 */
export function ensureReplyCaution(
  reply: string,
  language: 'en' | 'hi',
): { reply: string; risk: CoachChatReplyRisk | null } {
  const risk = findReplyRisk(reply);
  if (!risk || hasCautionLine(reply)) return { reply, risk: null };
  return { reply: `${COACH_CHAT_CAUTION[risk][language]}\n\n${reply}`, risk };
}

// ── Citation integrity (re-audit E2E-R1) ──────────────────────────────────
const CITATION_PHRASE_EN =
  '(?:based on your data|as per your (?:data|logs?)|from your (?:data|logs?)|according to your (?:data|logs?)|going by your (?:data|logs?))';
const CITATION_LINE_ONLY_EN = new RegExp(`^\\s*${CITATION_PHRASE_EN}\\s*[:\\-–—]?\\s*$`, 'i');
const CITATION_LINE_ONLY_HI = /^\s*आपके (?:डेटा|लॉग) के अनुसार\s*[:\-–—]?\s*$/;
const CITATION_LEAD_IN_EN = new RegExp(`^\\s*${CITATION_PHRASE_EN}\\s*[:\\-–—]\\s*`, 'i');

/**
 * Citations reach the user ONLY via the server-attached evidence array
 * (the client renders its own "Based on your data:" header from it).
 * A model that writes its own attribution line duplicates that header
 * and can imply sourcing the server never vouched for — strip lines
 * that consist solely of an attribution phrase, plus a leading
 * attribution prefix at the very start of the reply. Ordinary sentences
 * that merely mention the user's data mid-text are untouched.
 */
export function stripModelCitations(reply: string): string {
  const kept = reply
    .split('\n')
    .filter((line) => !CITATION_LINE_ONLY_EN.test(line) && !CITATION_LINE_ONLY_HI.test(line));
  const joined = kept.join('\n').replace(CITATION_LEAD_IN_EN, '');
  return joined.replace(/\n{3,}/g, '\n\n').trim();
}

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
  /**
   * Today's session, resolved by the SAME helper the Home screen uses
   * (getTodaySessionState in workout-engine) — the coach must never
   * disagree with what the app itself shows for today. Null when the
   * helper resolves nothing (no plan, no schedule).
   */
  todaySession: {
    state: 'planned' | 'completed' | 'in_progress' | 'rest';
    title: string;
    exercises: string[];
    date: string;
  } | null;
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
    /**
     * Free-text notes the user typed in today's guided check-in (master
     * UX-18: ManualCheckin.notes, keyed by check-in step). The user's own
     * words are part of their data slice — the coach may reference them
     * like any other check-in value. Optional: absent on older data.
     */
    notes?: string[];
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

  if (data.todaySession) {
    const ts = data.todaySession;
    const ex = ts.exercises.length > 0 ? ` — exercises: ${ts.exercises.join(', ')}` : '';
    if (ts.state === 'rest') {
      sections.push(`TODAY (${ts.date}): rest day — no workout is scheduled for today.`);
      evidence.push('Today is a scheduled rest day');
    } else if (ts.state === 'completed') {
      sections.push(`TODAY'S SESSION (${ts.date}): "${ts.title}" — already logged today${ex}.`);
      evidence.push(`Today's session "${ts.title}" already logged`);
    } else if (ts.state === 'in_progress') {
      sections.push(`TODAY'S SESSION (${ts.date}): "${ts.title}" — in progress right now${ex}.`);
      evidence.push(`Today's session "${ts.title}" in progress`);
    } else {
      sections.push(
        `TODAY'S SESSION (${ts.date}): "${ts.title}" — the workout planned for today from the user's schedule${ex}. When the user asks what they are training today, THIS is the answer.`
      );
      evidence.push(`Today's planned workout: ${ts.title}`);
    }
  }

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

  const checkinNotes = (data.checkinToday?.notes ?? [])
    .map((n) => n.trim().slice(0, 500))
    .filter((n) => n.length > 0)
    .slice(0, 6);
  if (checkinNotes.length > 0) {
    sections.push(`${COACH_CHAT_NOTES_SECTION_HEADER}\n- ${checkinNotes.join('\n- ')}`);
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
    '7. TOPIC LOCK: you discuss ONLY training, nutrition, recovery, sleep, and the user\u2019s ASCEND data. For anything else \u2014 politics, news, entertainment, homework, coding, general chat, or any other topic \u2014 politely decline in one short sentence and steer back to their training. Never answer an off-topic question, not even partially, and never explain this rule beyond the redirect.',
    '8. CAUTION WARNINGS: when a suggestion carries elevated risk \u2014 near-maximal loads or attempts, a large calorie deficit, a sharp jump in training volume or frequency, or training hard while run-down \u2014 attach one brief caution line to the reply, starting with "Caution:" (or "\u0938\u093e\u0935\u0927\u093e\u0928\u0940:" in Hindi replies), naming the risk and the safer alternative. Ordinary, low-risk suggestions need no caution line.',
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

/** Sanitize conversation history: cap turns and per-message length.
 * Keeps the MOST RECENT turns (re-audit SEC-R8/E2E-R4: the original loop
 * broke at the cap and kept the first turns, so long conversations lost
 * exactly the context that matters most). */
export function sanitizeHistory(history: unknown): CoachChatHistoryTurn[] {
  if (!Array.isArray(history)) return [];
  const turns: CoachChatHistoryTurn[] = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { role?: unknown; content?: unknown };
    if (rec.role !== 'user' && rec.role !== 'assistant') continue;
    if (typeof rec.content !== 'string') continue;
    turns.push({ role: rec.role, content: rec.content.slice(0, COACH_CHAT_MAX_MESSAGE_CHARS) });
  }
  return turns.slice(-COACH_CHAT_MAX_HISTORY_TURNS);
}

/** Render history for the model prompt (oldest first). */
export function formatHistoryForPrompt(turns: CoachChatHistoryTurn[]): string {
  if (turns.length === 0) return 'No earlier messages in this conversation.';
  return turns.map((t) => `${t.role === 'user' ? 'User' : 'Coach'}: ${t.content}`).join('\n');
}
