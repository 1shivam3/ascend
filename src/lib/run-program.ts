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

export const RUN_PROGRAM_ID = 'couch-to-5k';
export const RUN_PROGRAM_WEEKS = 8;
export const RUNS_PER_WEEK = 3;
export const WARMUP_SECONDS = 300;
export const COOLDOWN_SECONDS = 300;

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
}

export function sanitizeRunProgramState(raw: unknown): RunProgramState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const date = (raw as { enrolledDate?: unknown }).enrolledDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { enrolledDate: date };
}

// ── Progress derived from logged runs ────────────────────────────────────────

export interface RunProgramProgress {
  completedCount: number;
  totalCount: number;
  /** The first not-yet-logged session, or null when the program is done. */
  nextSession: RunSession | null;
  /** Week of the next session (8 when complete). */
  currentWeek: number;
  complete: boolean;
}

export function getCompletedRunSessionIds(
  workouts: WorkoutEntry[],
  enrolledDate?: string,
): Set<string> {
  const ids = new Set<string>();
  for (const w of workouts) {
    if (w.kind !== 'run' || !w.runSessionId) continue;
    if (enrolledDate && w.date < enrolledDate) continue;
    ids.add(w.runSessionId);
  }
  return ids;
}

export function getRunProgramProgress(
  workouts: WorkoutEntry[],
  state: RunProgramState | null,
): RunProgramProgress {
  const done = getCompletedRunSessionIds(workouts, state?.enrolledDate);
  const next = RUN_SESSIONS.find((s) => !done.has(s.id)) ?? null;
  return {
    completedCount: RUN_SESSIONS.filter((s) => done.has(s.id)).length,
    totalCount: RUN_SESSIONS.length,
    nextSession: next,
    currentWeek: next ? next.week : RUN_PROGRAM_WEEKS,
    complete: next === null,
  };
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
}): WorkoutEntry {
  const { session } = input;
  const durationSeconds = Math.max(0, Math.round(input.durationSeconds));
  const partial =
    input.intervalsTotal > 0 && input.intervalsCompleted < input.intervalsTotal
      ? ` · ${input.intervalsCompleted} of ${input.intervalsTotal} intervals finished`
      : '';
  return {
    id: input.id,
    date: input.date,
    name: `Couch to 5K — Week ${session.week}, Run ${session.day}`,
    kind: 'run',
    runSessionId: session.id,
    ...(typeof input.distanceKm === 'number' && input.distanceKm > 0
      ? { distanceKm: Math.round(input.distanceKm * 100) / 100 }
      : {}),
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
