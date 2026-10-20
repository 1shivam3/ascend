/**
 * Friend challenges — small-group challenges exchanged by hand.
 *
 * HONEST DESIGN (read before "fixing" the lack of sync):
 * There is NO server table for challenges and Supabase is only reachable
 * through the tables that already exist, so this feature is deliberately
 * local-first with manual code exchange:
 *
 * - Creating a challenge produces a compact **challenge code** (metric,
 *   target, dates, creator name) that the user sends to friends through
 *   whatever channel they already use (WhatsApp, etc.).
 * - A friend pastes the code to join on THEIR device. From then on their
 *   app tracks their own progress locally from their own logs — the same
 *   "no extra logging" rule as monthly challenges.
 * - To compare, each person generates a **score code** (name + progress +
 *   date) and sends it back. Pasted score codes merge into a small local
 *   leaderboard. Scores update only when someone shares a fresh code —
 *   the UI says exactly that. Nothing pretends to be live.
 * - XP payout is local and idempotent via the XP ledger, same as monthly
 *   challenges. Friend-mode XP is honor-system by design: your device
 *   only ever sees your own logs, so it can only reward your own work.
 * - Opt-in only. No contacts access, no notifications, no nagging.
 */
import { isSetCompleted } from './types';
import type { WorkoutEntry, MealEntry } from './types';
import type { ChallengeMetric } from './challenges';

export interface FriendChallengeDef {
  /** Local id (also carried inside the challenge code). */
  id: string;
  title: string;
  metric: ChallengeMetric;
  target: number;
  /** Inclusive run window, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  creatorName: string;
  /** True when this device created the challenge. */
  createdByMe: boolean;
}

export interface FriendScoreEntry {
  name: string;
  progress: number;
  /** YYYY-MM-DD the score code was generated. */
  updatedDate: string;
}

export interface FriendChallengeRecord {
  def: FriendChallengeDef;
  /** Score entries keyed by normalized (trimmed, lowercased) name. */
  scores: Record<string, FriendScoreEntry>;
  /** My completion reward (XP) already granted for this challenge. */
  rewardGranted: boolean;
}

export interface FriendChallengesState {
  records: Record<string, FriendChallengeRecord>;
}

export function getInitialFriendChallengesState(): FriendChallengesState {
  return { records: {} };
}

export const FRIEND_CHALLENGE_METRICS: ChallengeMetric[] = [
  'workouts',
  'breakfasts',
  'meals',
  'prs',
  'streak_days',
  'water_days',
];

/** Creation presets offered in the UI (metric + sensible target). */
export const FRIEND_CHALLENGE_PRESETS: Array<{
  metric: ChallengeMetric;
  title: string;
  target: number;
}> = [
  { metric: 'workouts', title: 'Most Workouts Wins', target: 12 },
  { metric: 'meals', title: 'Meal Logging Race', target: 40 },
  { metric: 'breakfasts', title: 'Breakfast Club', target: 15 },
  { metric: 'prs', title: 'PR Hunt', target: 5 },
  { metric: 'water_days', title: 'Hydration Streak-Off', target: 20 },
  { metric: 'streak_days', title: 'Longest Streak Wins', target: 14 },
];

export const FRIEND_CHALLENGE_DURATIONS = [7, 14, 30] as const;

/** XP event id for a friend-challenge completion — idempotent via the ledger. */
export function friendChallengeXpEventId(id: string): string {
  return `friend-challenge:${id}`;
}

// ── Date helpers (YYYY-MM-DD, local calendar math) ──────────────────────────

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Whole days from a to b (b − a); negative when b is before a. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`);
  return Math.round(ms / 86400000);
}

export function friendChallengeStatus(
  def: FriendChallengeDef,
  todayStr: string,
): 'upcoming' | 'active' | 'expired' {
  if (todayStr < def.startDate) return 'upcoming';
  if (todayStr > def.endDate) return 'expired';
  return 'active';
}

export function friendChallengeDaysLeft(def: FriendChallengeDef, todayStr: string): number {
  return Math.max(0, daysBetween(todayStr, def.endDate));
}

// ── Code encoding (base64url JSON + FNV-1a checksum) ────────────────────────

function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toBase64Url(str: string): string {
  const b64 = btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(b64), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
}

function encodePayload(prefix: string, payload: Record<string, unknown>): string {
  const body = JSON.stringify(payload);
  return `${prefix}${toBase64Url(JSON.stringify({ ...payload, k: checksum(body) }))}`;
}

function decodePayload(
  code: string,
  prefix: string,
): Record<string, unknown> | null {
  try {
    const clean = code.trim();
    if (!clean.startsWith(prefix)) return null;
    const raw = clean.slice(prefix.length);
    if (raw.length === 0 || raw.length > 4096) return null;
    const parsed = JSON.parse(fromBase64Url(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (Object.prototype.hasOwnProperty.call(parsed, '__proto__')) return null;
    const { k, ...rest } = parsed as Record<string, unknown>;
    if (typeof k !== 'string' || checksum(JSON.stringify(rest)) !== k) return null;
    return rest;
  } catch {
    return null;
  }
}

/** Pull a challenge/score code out of pasted text (e.g. a WhatsApp message). */
export function extractCode(text: string, kind: 'challenge' | 'score'): string | null {
  const prefix = kind === 'challenge' ? 'fc1_' : 'fs1_';
  const match = text.match(new RegExp(`${prefix}[A-Za-z0-9_-]{8,}`));
  return match ? match[0] : null;
}

// ── Challenge codes ──────────────────────────────────────────────────────────

export function createFriendChallengeDef(input: {
  id: string;
  title: string;
  metric: ChallengeMetric;
  target: number;
  startDate: string;
  durationDays: number;
  creatorName: string;
  createdByMe: boolean;
}): FriendChallengeDef {
  const startDate = isValidDateStr(input.startDate) ? input.startDate : shiftDate(new Date().toISOString().slice(0, 10), 0);
  const duration = Math.min(92, Math.max(1, Math.floor(input.durationDays) || 7));
  return {
    id: String(input.id).slice(0, 64),
    title: String(input.title || 'Friend Challenge').slice(0, 60),
    metric: input.metric,
    target: Math.min(1000, Math.max(1, Math.floor(input.target) || 1)),
    startDate,
    endDate: shiftDate(startDate, duration - 1),
    creatorName: String(input.creatorName || 'A friend').slice(0, 40),
    createdByMe: input.createdByMe,
  };
}

export function encodeChallengeCode(def: FriendChallengeDef): string {
  return encodePayload('fc1_', {
    v: 1,
    id: def.id,
    t: def.title,
    m: def.metric,
    tg: def.target,
    s: def.startDate,
    e: def.endDate,
    by: def.creatorName,
  });
}

export function decodeChallengeCode(code: string): FriendChallengeDef | null {
  const p = decodePayload(code, 'fc1_');
  if (!p || p.v !== 1) return null;
  if (typeof p.id !== 'string' || p.id.length === 0 || p.id.length > 64) return null;
  if (!FRIEND_CHALLENGE_METRICS.includes(p.m as ChallengeMetric)) return null;
  if (!isValidDateStr(p.s) || !isValidDateStr(p.e)) return null;
  if ((p.e as string) < (p.s as string)) return null;
  if (daysBetween(p.s as string, p.e as string) > 92) return null;
  const target = typeof p.tg === 'number' ? Math.floor(p.tg) : NaN;
  if (!Number.isFinite(target) || target < 1 || target > 1000) return null;
  return {
    id: p.id,
    title: typeof p.t === 'string' && p.t.trim() ? p.t.slice(0, 60) : 'Friend Challenge',
    metric: p.m as ChallengeMetric,
    target,
    startDate: p.s as string,
    endDate: p.e as string,
    creatorName: typeof p.by === 'string' && p.by.trim() ? p.by.slice(0, 40) : 'A friend',
    createdByMe: false,
  };
}

// ── Score codes ──────────────────────────────────────────────────────────────

export interface FriendScorePayload {
  challengeId: string;
  name: string;
  progress: number;
  date: string;
}

export function encodeScoreCode(payload: FriendScorePayload): string {
  return encodePayload('fs1_', {
    v: 1,
    cid: payload.challengeId,
    n: payload.name,
    p: payload.progress,
    d: payload.date,
  });
}

export function decodeScoreCode(code: string): FriendScorePayload | null {
  const p = decodePayload(code, 'fs1_');
  if (!p || p.v !== 1) return null;
  if (typeof p.cid !== 'string' || p.cid.length === 0 || p.cid.length > 64) return null;
  if (typeof p.n !== 'string' || !p.n.trim()) return null;
  if (!isValidDateStr(p.d)) return null;
  const progress = typeof p.p === 'number' ? Math.floor(p.p) : NaN;
  if (!Number.isFinite(progress) || progress < 0 || progress > 100000) return null;
  return {
    challengeId: p.cid,
    name: p.n.slice(0, 40),
    progress,
    date: p.d,
  };
}

// ── Progress evaluation over the challenge window ────────────────────────────

export interface FriendActivityData {
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  prs: Array<{ date: string }>;
  currentStreak: number;
  waterDays?: string[];
}

const inWindow = (dateStr: string, def: FriendChallengeDef) =>
  dateStr >= def.startDate && dateStr <= def.endDate;

/**
 * My progress for a friend challenge, counted from my own logs inside the
 * challenge window only. Same counting rules as monthly challenges
 * (evaluateChallenge), with the month replaced by [startDate, endDate].
 */
export function evaluateFriendChallenge(
  def: FriendChallengeDef,
  data: FriendActivityData,
): { progress: number; target: number; pct: number; completed: boolean } {
  let progress = 0;
  switch (def.metric) {
    case 'workouts':
      progress = data.workouts.filter(
        (w) =>
          inWindow(w.date, def) &&
          w.exercises.some((ex) => ex.sets.some((s) => isSetCompleted(s))),
      ).length;
      break;
    case 'breakfasts':
      progress = data.meals.filter(
        (m) => inWindow(m.date, def) && m.foods.length > 0 && /breakfast/i.test(m.name),
      ).length;
      break;
    case 'meals':
      progress = data.meals.filter(
        (m) => inWindow(m.date, def) && m.foods.length > 0,
      ).length;
      break;
    case 'prs':
      progress = data.prs.filter((p) => inWindow(p.date, def)).length;
      break;
    case 'water_days':
      progress = (data.waterDays ?? []).filter((d) => inWindow(d, def)).length;
      break;
    case 'streak_days':
      // The current streak itself is the tracked thing (as in monthly play).
      progress = data.currentStreak;
      break;
  }
  const clamped = Math.min(progress, def.target);
  return {
    progress: clamped,
    target: def.target,
    pct: Math.min(100, Math.round((clamped / def.target) * 100)),
    completed: progress >= def.target,
  };
}

// ── State operations (pure — the store wraps these) ─────────────────────────

export function addFriendChallenge(
  state: FriendChallengesState,
  def: FriendChallengeDef,
): FriendChallengesState {
  if (state.records[def.id]) return state; // joining twice is a no-op
  return {
    records: {
      ...state.records,
      [def.id]: { def, scores: {}, rewardGranted: false },
    },
  };
}

export function removeFriendChallenge(
  state: FriendChallengesState,
  id: string,
): FriendChallengesState {
  if (!state.records[id]) return state;
  const records = { ...state.records };
  delete records[id];
  return { records };
}

export function markFriendRewardGranted(
  state: FriendChallengesState,
  id: string,
): FriendChallengesState {
  const rec = state.records[id];
  if (!rec || rec.rewardGranted) return state;
  return {
    records: { ...state.records, [id]: { ...rec, rewardGranted: true } },
  };
}

function scoreKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Merge an incoming score into a challenge's board. The newest code wins;
 * on the same day, the higher progress wins (a later same-day share should
 * never move someone backwards).
 */
export function mergeFriendScore(
  state: FriendChallengesState,
  challengeId: string,
  entry: FriendScoreEntry,
): FriendChallengesState {
  const rec = state.records[challengeId];
  if (!rec) return state;
  const key = scoreKey(entry.name);
  if (!key) return state;
  const existing = rec.scores[key];
  if (
    existing &&
    (existing.updatedDate > entry.updatedDate ||
      (existing.updatedDate === entry.updatedDate && existing.progress >= entry.progress))
  ) {
    return state;
  }
  return {
    records: {
      ...state.records,
      [challengeId]: {
        ...rec,
        scores: {
          ...rec.scores,
          [key]: {
            name: entry.name.slice(0, 40),
            progress: Math.max(0, Math.floor(entry.progress) || 0),
            updatedDate: entry.updatedDate,
          },
        },
      },
    },
  };
}

export interface LeaderboardRow {
  name: string;
  progress: number;
  target: number;
  pct: number;
  updatedDate: string;
  isMe: boolean;
  rank: number;
}

/**
 * Leaderboard for one challenge: stored friend scores + my live progress,
 * sorted by progress (desc), then freshest score, then name. My row always
 * reflects my current local progress, never a stale shared code of mine.
 */
export function buildLeaderboard(
  record: FriendChallengeRecord,
  myName: string,
  myProgress: number,
  todayStr: string,
): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  const myKey = scoreKey(myName);
  for (const entry of Object.values(record.scores)) {
    if (scoreKey(entry.name) === myKey) continue; // my live row replaces it
    rows.push({
      name: entry.name,
      progress: entry.progress,
      target: record.def.target,
      pct: Math.min(100, Math.round((entry.progress / record.def.target) * 100)),
      updatedDate: entry.updatedDate,
      isMe: false,
      rank: 0,
    });
  }
  rows.push({
    name: myName,
    progress: myProgress,
    target: record.def.target,
    pct: Math.min(100, Math.round((myProgress / record.def.target) * 100)),
    updatedDate: todayStr,
    isMe: true,
    rank: 0,
  });
  rows.sort(
    (a, b) =>
      b.progress - a.progress ||
      b.updatedDate.localeCompare(a.updatedDate) ||
      a.name.localeCompare(b.name),
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

/** Reward is due when I've completed, and haven't been paid for this one yet. */
export function friendRewardDue(
  record: FriendChallengeRecord,
  evaluation: { completed: boolean },
): boolean {
  return evaluation.completed && !record.rewardGranted;
}

// ── Share text ───────────────────────────────────────────────────────────────

export function metricLabel(metric: ChallengeMetric): string {
  switch (metric) {
    case 'workouts':
      return 'workouts';
    case 'breakfasts':
      return 'breakfasts logged';
    case 'meals':
      return 'meals logged';
    case 'prs':
      return 'personal records';
    case 'streak_days':
      return 'day streak';
    case 'water_days':
      return 'water days';
  }
}

export function formatFriendChallengeInvite(def: FriendChallengeDef, code: string): string {
  return (
    `ASCEND Friend Challenge: ${def.title}\n` +
    `${def.creatorName} challenges you: first to ${def.target} ${metricLabel(def.metric)} ` +
    `between ${def.startDate} and ${def.endDate}.\n\n` +
    `Open ASCEND, paste this code in Challenges → With Friends to join:\n${code}`
  );
}

export function formatFriendScoreShare(
  def: FriendChallengeDef,
  entry: FriendScoreEntry,
  code: string,
): string {
  return (
    `My ASCEND score for "${def.title}": ${entry.progress} of ${def.target} ${metricLabel(def.metric)} (as of ${entry.updatedDate}).\n\n` +
    `Paste this score code in the challenge to update the board:\n${code}`
  );
}

// ── Backup import sanitation ─────────────────────────────────────────────────

const MAX_FRIEND_CHALLENGES = 50;
const MAX_SCORES_PER_CHALLENGE = 50;

export function sanitizeFriendChallengesState(raw: unknown): FriendChallengesState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return getInitialFriendChallengesState();
  }
  const rawRecords = (raw as { records?: unknown }).records;
  if (!rawRecords || typeof rawRecords !== 'object' || Array.isArray(rawRecords)) {
    return getInitialFriendChallengesState();
  }
  const records: Record<string, FriendChallengeRecord> = {};
  for (const [id, value] of Object.entries(rawRecords).slice(0, MAX_FRIEND_CHALLENGES)) {
    if (!value || typeof value !== 'object') continue;
    const rec = value as Record<string, unknown>;
    const d = rec.def as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object') continue;
    if (typeof d.id !== 'string' || d.id !== id) continue;
    if (!FRIEND_CHALLENGE_METRICS.includes(d.metric as ChallengeMetric)) continue;
    if (!isValidDateStr(d.startDate) || !isValidDateStr(d.endDate)) continue;
    const target = typeof d.target === 'number' ? Math.floor(d.target) : NaN;
    if (!Number.isFinite(target) || target < 1 || target > 1000) continue;
    const scores: Record<string, FriendScoreEntry> = {};
    if (rec.scores && typeof rec.scores === 'object' && !Array.isArray(rec.scores)) {
      for (const [key, sv] of Object.entries(rec.scores).slice(0, MAX_SCORES_PER_CHALLENGE)) {
        if (!sv || typeof sv !== 'object') continue;
        const s = sv as Record<string, unknown>;
        if (typeof s.name !== 'string' || !isValidDateStr(s.updatedDate)) continue;
        const progress = typeof s.progress === 'number' ? Math.floor(s.progress) : NaN;
        if (!Number.isFinite(progress) || progress < 0) continue;
        scores[key] = {
          name: s.name.slice(0, 40),
          progress,
          updatedDate: s.updatedDate as string,
        };
      }
    }
    records[id] = {
      def: {
        id,
        title: typeof d.title === 'string' ? d.title.slice(0, 60) : 'Friend Challenge',
        metric: d.metric as ChallengeMetric,
        target,
        startDate: d.startDate as string,
        endDate: d.endDate as string,
        creatorName: typeof d.creatorName === 'string' ? d.creatorName.slice(0, 40) : 'A friend',
        createdByMe: d.createdByMe === true,
      },
      scores,
      rewardGranted: rec.rewardGranted === true,
    };
  }
  return { records };
}
