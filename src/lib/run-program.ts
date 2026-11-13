/**
 * Run programming — an 8-week Couch-to-5K-style program.
 *
 * The progression follows the widely published Couch to 5K pattern
 * (popularized by Cool Running and the NHS Couch to 5K plan): three runs
 * per week, run/walk intervals that lengthen the run segments and shrink
 * the walks, a first continuous 20-minute run in week 5, and a build to
 * 30 continuous minutes by week 8. The classic plan runs 9 weeks; this
 * version folds the last two build weeks into one graduation week.
 *
 * Design rules (same as the rest of ASCEND):
 * - Opt-in only: nothing here touches the user's plans until they enroll.
 * - Progress is derived from logged runs (WorkoutEntry kind 'run'), never
 *   from a separate counter that could drift from history.
 * - Sessions are sequential — the "next run" is simply the first session
 *   not yet logged since enrollment. Missed days never punish; the plan
 *   waits where you left it.
 */
import type { WorkoutEntry } from './types';

export const RUN_PROGRAM_WEEKS = 8;
export const WARMUP_SECONDS = 300;
export const COOLDOWN_SECONDS = 300;

/** Sanity ceiling for a user-entered run distance (an ultra is ~100 km;
 *  500 leaves generous headroom while catching unit slips like metres). */
export const MAX_RUN_DISTANCE_KM = 500;

/**
 * The one distance rule, shared by the completion save
 * (buildRunWorkoutEntry) and the history edit path
 * (sanitizeWorkoutUpdate): a finite number in (0, MAX_RUN_DISTANCE_KM],
 * rounded to 2 decimals. Anything else normalizes to undefined
 * ("no distance recorded").
 */
export function normalizeRunDistanceKm(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_RUN_DISTANCE_KM) return undefined;
  return Math.round(n * 100) / 100;
}

export interface RunSegment {
  kind: 'run' | 'walk';
  seconds: number;
}

export interface RunSession {
  /** 'c25k-w3d2' — week 3, run 2. */
  id: string;
  week: number;
  /** 1..3 within the week. */
  day: number;
  /** Interval body between warm-up and cool-down, in order. */
  segments: RunSegment[];
}

export type IntervalPhaseKind = 'warmup' | 'run' | 'walk' | 'cooldown';

export interface IntervalPhase {
  kind: IntervalPhaseKind;
  seconds: number;
}

const seg = (kind: 'run' | 'walk', seconds: number): RunSegment => ({ kind, seconds });

/** n alternating run/walk pairs, expanded — intervals must interleave. */
const pair = (run: number, walk: number, reps: number): RunSegment[] => {
  const out: RunSegment[] = [];
  for (let i = 0; i < reps; i++) out.push(seg('run', run), seg('walk', walk));
  return out;
};

function buildSessions(): RunSession[] {
  // Weekly tables (interval body only; warm-up/cool-down wrap every run).
  // Weeks 1–4: all three runs identical. Weeks 5–6: runs differ, with the
  // long continuous run last. Weeks 7–8: continuous builds.
  const weeks: RunSegment[][][] = [
    // Week 1 — 8 × (1:00 run / 1:30 walk) = 8 min running
    [pair(60, 90, 8), pair(60, 90, 8), pair(60, 90, 8)],
    // Week 2 — 6 × (1:30 run / 2:00 walk) = 9 min running
    [pair(90, 120, 6), pair(90, 120, 6), pair(90, 120, 6)],
    // Week 3 — 2 × (1:30 run / 1:30 walk / 3:00 run / 3:00 walk) = 9 min
    [
      [seg('run', 90), seg('walk', 90), seg('run', 180), seg('walk', 180), seg('run', 90), seg('walk', 90), seg('run', 180), seg('walk', 180)],
      [seg('run', 90), seg('walk', 90), seg('run', 180), seg('walk', 180), seg('run', 90), seg('walk', 90), seg('run', 180), seg('walk', 180)],
      [seg('run', 90), seg('walk', 90), seg('run', 180), seg('walk', 180), seg('run', 90), seg('walk', 90), seg('run', 180), seg('walk', 180)],
    ],
    // Week 4 — 3:00 run / 1:30 walk / 5:00 run / 2:30 walk / 3:00 / 1:30 / 5:00 = 16 min
    [
      [seg('run', 180), seg('walk', 90), seg('run', 300), seg('walk', 150), seg('run', 180), seg('walk', 90), seg('run', 300)],
      [seg('run', 180), seg('walk', 90), seg('run', 300), seg('walk', 150), seg('run', 180), seg('walk', 90), seg('run', 300)],
      [seg('run', 180), seg('walk', 90), seg('run', 300), seg('walk', 150), seg('run', 180), seg('walk', 90), seg('run', 300)],
    ],
    // Week 5 — 5/3/5/3/5 (15 min) · 8/5/8 (16 min) · 20 min continuous
    [
      [seg('run', 300), seg('walk', 180), seg('run', 300), seg('walk', 180), seg('run', 300)],
      [seg('run', 480), seg('walk', 300), seg('run', 480)],
      [seg('run', 1200)],
    ],
    // Week 6 — 5/3/8/3/5 (18 min) · 10/3/10 (20 min) · 25 min continuous
    [
      [seg('run', 300), seg('walk', 180), seg('run', 480), seg('walk', 180), seg('run', 300)],
      [seg('run', 600), seg('walk', 180), seg('run', 600)],
      [seg('run', 1500)],
    ],
    // Week 7 — 25 min continuous × 3
    [[seg('run', 1500)], [seg('run', 1500)], [seg('run', 1500)]],
    // Week 8 — 30 min continuous × 3 (graduation)
    [[seg('run', 1800)], [seg('run', 1800)], [seg('run', 1800)]],
  ];

  const sessions: RunSession[] = [];
  weeks.forEach((days, wi) => {
    days.forEach((segments, di) => {
      sessions.push({
        id: `c25k-w${wi + 1}d${di + 1}`,
        week: wi + 1,
        day: di + 1,
        segments,
      });
    });
  });
  return sessions;
}

export const RUN_SESSIONS: RunSession[] = buildSessions();

export function getRunSession(id: string): RunSession | undefined {
  return RUN_SESSIONS.find((s) => s.id === id);
}

/** Expand a session into the flat phase list the player runs through. */
export function buildIntervalSchedule(session: RunSession): IntervalPhase[] {
  return [
    { kind: 'warmup', seconds: WARMUP_SECONDS },
    ...session.segments.map((s) => ({ kind: s.kind, seconds: s.seconds })),
    { kind: 'cooldown', seconds: COOLDOWN_SECONDS },
  ];
}

export function sessionRunSeconds(session: RunSession): number {
  return session.segments.reduce(
    (sum, s) => sum + (s.kind === 'run' ? s.seconds : 0),
    0,
  );
}

/** Longest single continuous run bout in the session, in seconds. */
export function sessionLongestRunSeconds(session: RunSession): number {
  return session.segments.reduce(
    (max, s) => (s.kind === 'run' ? Math.max(max, s.seconds) : max),
    0,
  );
}

export function sessionTotalSeconds(session: RunSession): number {
  const body = session.segments.reduce((sum, s) => sum + s.seconds, 0);
  return body + WARMUP_SECONDS + COOLDOWN_SECONDS;
}

/** Total running seconds prescribed in a week (all 3 sessions). */
export function weekRunSeconds(week: number): number {
  return RUN_SESSIONS.filter((s) => s.week === week).reduce(
    (sum, s) => sum + sessionRunSeconds(s),
    0,
  );
}

function describeBlock(segments: RunSegment[]): string {
  if (segments.length === 2 && segments[0].kind === 'run' && segments[1].kind === 'walk') {
    return `${fmtDur(segments[0].seconds)} run / ${fmtDur(segments[1].seconds)} walk`;
  }
  return segments.map((s) => `${fmtDur(s.seconds)} ${s.kind}`).join(' · ');
}

/** Short human summary of a session's interval pattern. */
export function describeSession(session: RunSession): string {
  const segments = session.segments;
  if (segments.length === 1 && segments[0].kind === 'run') {
    return `${Math.round(segments[0].seconds / 60)} min continuous run`;
  }
  // Whole list is a repetition of a shorter block? Say "block × n".
  for (let blockLen = 1; blockLen <= segments.length / 2; blockLen++) {
    if (segments.length % blockLen !== 0) continue;
    const block = segments.slice(0, blockLen);
    const isRepeat = segments.every(
      (s, i) => s.kind === block[i % blockLen].kind && s.seconds === block[i % blockLen].seconds,
    );
    if (isRepeat) return `${segments.length / blockLen} × ${describeBlock(block)}`;
  }
  return describeBlock(segments);
}

function fmtDur(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.round(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ── Program state ────────────────────────────────────────────────────────────

export interface RunProgramState {
  /** YYYY-MM-DD the user enrolled (or re-enrolled). Runs before this date
   *  belong to a previous attempt and don't count toward progress. */
  enrolledDate: string;
  /**
   * §22: identity of THIS enrollment attempt. Every run logged
   * while enrolled is stamped with it (WorkoutEntry.runEnrollmentId),
   * so progress attribution survives date edits and re-enrollment
   * keeps prior attempts' runs intact-but-not-counted instead of
   * erasing them. Optional in the type: states persisted before
   * §22 lack it — sanitizeRunProgramState fills the deterministic
   * legacy id below, and progress resolves it the same way.
   */
  enrollmentId?: string;
}

/** §22: the stable id for pre-§22 enrollments (derived from the
 *  enrolled date so every device resolves the same id). */
export function legacyEnrollmentId(enrolledDate: string): string {
  return `enr-legacy-${enrolledDate}`;
}

/** §22: the effective enrollment id for any state shape. */
export function resolveEnrollmentId(state: RunProgramState): string {
  return state.enrollmentId ?? legacyEnrollmentId(state.enrolledDate);
}

export function sanitizeRunProgramState(raw: unknown): RunProgramState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const date = (raw as { enrolledDate?: unknown }).enrolledDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const id = (raw as { enrollmentId?: unknown }).enrollmentId;
  return {
    enrolledDate: date,
    enrollmentId:
      typeof id === 'string' && id.length > 0 ? id : legacyEnrollmentId(date),
  };
}

// ── Progress derived from logged runs ────────────────────────────────────────

/**
 * §22: the completion threshold. A run counts toward its session
 * only when at least this fraction of the session's intervals
 * were finished (intervals completed naturally — skipping a phase
 * earns no credit, see the player). Ending a run early still LOGS
 * the run (it counts as a training day for streaks/habits and
 * stays in history, noted as partial) — it just doesn't complete
 * the program session, which stays next-up.
 */
export const RUN_COMPLETION_THRESHOLD = 0.8;

/**
 * §22: does this entry COMPLETE its session? Entries recorded by
 * the §22 player carry structured interval counts and are judged
 * by the threshold. Legacy entries (counts only in the notes
 * text) are taken as completed — re-judging history from a prose
 * note would be fiction.
 */
export function isRunEntryComplete(entry: WorkoutEntry): boolean {
  const total = entry.runIntervalsTotal;
  const done = entry.runIntervalsCompleted;
  if (typeof total !== 'number' || typeof done !== 'number' || total <= 0) {
    return true;
  }
  return done / total >= RUN_COMPLETION_THRESHOLD;
}

/**
 * §22: does this entry count toward the CURRENT enrollment?
 * Stamped entries answer by enrollment identity (immune to date
 * edits); unstamped legacy entries answer by the enrolled date.
 */
export function doesRunEntryCount(
  entry: WorkoutEntry,
  state: RunProgramState | null,
): boolean {
  if (!state || entry.kind !== 'run' || !entry.runSessionId) return false;
  if (!isRunEntryComplete(entry)) return false;
  if (entry.runEnrollmentId) {
    return entry.runEnrollmentId === resolveEnrollmentId(state);
  }
  return entry.date >= state.enrolledDate;
}

export interface RunProgramProgress {
  completedCount: number;
  totalCount: number;
  /** The first not-yet-logged session, or null when the program is done. */
  nextSession: RunSession | null;
  /** Week of the next session (8 when complete). */
  currentWeek: number;
  complete: boolean;
  /** §22: the session ids counted complete under this enrollment. */
  completedSessionIds: Set<string>;
}

export function getCompletedRunSessionIds(
  workouts: WorkoutEntry[],
  state: RunProgramState | null,
): Set<string> {
  const ids = new Set<string>();
  // §22: no enrollment → nothing counts, and the program can
  // never read "complete" off stray logged runs.
  if (!state) return ids;
  for (const w of workouts) {
    if (doesRunEntryCount(w, state)) ids.add(w.runSessionId!);
  }
  return ids;
}

export function getRunProgramProgress(
  workouts: WorkoutEntry[],
  state: RunProgramState | null,
): RunProgramProgress {
  const done = getCompletedRunSessionIds(workouts, state);
  const next = RUN_SESSIONS.find((s) => !done.has(s.id)) ?? null;
  return {
    completedCount: RUN_SESSIONS.filter((s) => done.has(s.id)).length,
    totalCount: RUN_SESSIONS.length,
    nextSession: next,
    currentWeek: next ? next.week : RUN_PROGRAM_WEEKS,
    // §22: completion requires an enrollment — with none, the
    // program is simply not started, never "complete".
    complete: state !== null && next === null,
    completedSessionIds: done,
  };
}

/**
 * §22: would deleting this entry un-complete a program session?
 * True only when the entry counts AND no other counted entry
 * covers the same session — the history delete confirm warns in
 * exactly that case.
 */
export function wouldUncompleteRunSession(
  entry: WorkoutEntry,
  workouts: WorkoutEntry[],
  state: RunProgramState | null,
): boolean {
  if (!doesRunEntryCount(entry, state)) return false;
  return !workouts.some(
    (w) => w.id !== entry.id && w.runSessionId === entry.runSessionId && doesRunEntryCount(w, state),
  );
}

// ── Logging ──────────────────────────────────────────────────────────────────

/**
 * Build the history entry for a finished run session. An entry with
 * kind 'run' counts toward streaks (see streak-freeze dayIsActive) and
 * the habit matrix via the normal workout plumbing — no sets are faked:
 * a run has no sets, and the interval summary lives in the exercise notes.
 */
export function buildRunWorkoutEntry(input: {
  id: string;
  session: RunSession;
  date: string;
  durationSeconds: number;
  intervalsCompleted: number;
  intervalsTotal: number;
  distanceKm?: number;
  /** §22: the enrollment this run belongs to (stamped so progress
   *  attribution survives re-enrollment and date edits). */
  enrollmentId?: string;
}): WorkoutEntry {
  const { session } = input;
  const durationSeconds = Math.max(0, Math.round(input.durationSeconds));
  const partial =
    input.intervalsTotal > 0 && input.intervalsCompleted < input.intervalsTotal
      ? ` · ${input.intervalsCompleted} of ${input.intervalsTotal} intervals finished`
      : '';
  const distanceKm = normalizeRunDistanceKm(input.distanceKm);
  return {
    id: input.id,
    date: input.date,
    name: `Couch to 5K — Week ${session.week}, Run ${session.day}`,
    kind: 'run',
    runSessionId: session.id,
    // §22: structured interval counts (the completion threshold
    // judges these — the notes text stays the human summary) and
    // the enrollment stamp.
    runIntervalsCompleted: Math.max(0, Math.round(input.intervalsCompleted)),
    runIntervalsTotal: Math.max(0, Math.round(input.intervalsTotal)),
    ...(input.enrollmentId ? { runEnrollmentId: input.enrollmentId } : {}),
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    durationMinutes: Math.round(durationSeconds / 60),
    durationSeconds,
    exercises: [
      {
        name: 'Running',
        sets: [],
        notes: `${describeSession(session)}${partial}`,
      },
    ],
  };
}
