/**
 * QA-hardening Phase 3 — Check 2: Form Coach report truthfulness.
 *
 * Levels exercised (stated plainly, per the Phase 0 limitation):
 *  - ANALYZER level: the committed Phase 0 landmark fixtures
 *    (qa/fixtures/form-coach/*.json) are fed through the real
 *    DeadliftAnalyzer / SquatAnalyzer processFrame pipeline, and
 *    the resulting FormSessionSummary is asserted. The live app
 *    cannot be driven this way — landmarks come only from the
 *    MediaPipe worker on a user-picked video; there is no
 *    injection hook (qa/fixtures/form-coach/README.md).
 *  - STRING level: the summary modal's user-facing strings are
 *    resolved through translate() in English AND Hindi and checked
 *    for enum/snake_case leaks.
 *  - NOT exercised: the summary modal's rendered DOM (needs a
 *    completed in-app analysis) — marked NOT TESTED in the report.
 *
 * Contract (audit Phase 2 / P0-3):
 *  - every rep carries status valid / failed / unverified, and
 *    valid + failed + unverified == detected in the summary;
 *  - lockout is 'unverified' — with the reason "Could not verify
 *    lockout (feet out of frame)" — when foot landmarks are below
 *    the visibility threshold, and such reps are NEVER reported
 *    as "Incomplete Lockouts";
 *  - tempo is shown only when tempo × reps reconstructs the set
 *    duration (50%–110%); otherwise the summary's tempo is null
 *    and the modal shows "Tempo unavailable";
 *  - no raw enum values (phase/depth/status) render as copy.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DeadliftAnalyzer } from '@/features/form-coach/analyzers/DeadliftAnalyzer';
import { SquatAnalyzer } from '@/features/form-coach/analyzers/SquatAnalyzer';
import {
  getRepStatus,
  type FormSessionSummary,
} from '@/features/form-coach/models/form-session.types';
import type { NormalizedLandmark } from '@/features/form-coach/models/pose.types';
import { PoseLandmarkIndex } from '@/features/form-coach/models/pose.types';
import { translate } from '@/lib/i18n';

interface FixtureStream {
  aspectRatio: number;
  frames: { lm: NormalizedLandmark[]; t: number }[];
}

function loadStream(name: string): FixtureStream {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'qa/fixtures/form-coach', name), 'utf8'),
  ) as FixtureStream;
}

function expectAccounting(summary: FormSessionSummary) {
  const valid = summary.reps.filter((r) => getRepStatus(r) === 'valid').length;
  const failed = summary.reps.filter((r) => getRepStatus(r) === 'failed').length;
  const unverified = summary.reps.filter((r) => getRepStatus(r) === 'unverified').length;
  expect(valid + failed + unverified).toBe(summary.totalDetectedReps);
  expect(summary.totalValidReps).toBe(valid);
  expect(summary.totalUnverifiedReps).toBe(unverified);
  for (const rep of summary.reps) {
    expect(['valid', 'failed', 'unverified']).toContain(getRepStatus(rep));
  }
}

describe('Phase 3 check 2: committed fixture streams through the real analyzers', () => {
  it('deadlift-stream.json (3 reps): summary accounting reconciles', () => {
    const stream = loadStream('deadlift-stream.json');
    const a = new DeadliftAnalyzer();
    for (const f of stream.frames) a.processFrame(f.lm, f.t, stream.aspectRatio);
    const summary = a.finishSet();
    expect(summary.totalDetectedReps).toBe(3);
    expectAccounting(summary);
    // The synthetic stream is clean side-view form: pulls verify.
    expect(summary.totalUnverifiedReps).toBe(0);
  });

  it('squat-stream.json (3 reps): summary accounting reconciles', () => {
    const stream = loadStream('squat-stream.json');
    const a = new SquatAnalyzer();
    for (const f of stream.frames) a.processFrame(f.lm, f.t, stream.aspectRatio);
    const summary = a.finishSet();
    expect(summary.totalDetectedReps).toBe(3);
    expectAccounting(summary);
  });
});

// ── Deadlift FK frames (same construction as the audit-era test):
// knee = 180 - (s + u), hip = 180 - (u + v). `feetVis` drops the
// ankle/heel/foot-index landmarks below the reliability threshold.
function dlFrame(s: number, u: number, v: number, feetVis = 0.95): NormalizedLandmark[] {
  const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.95,
  }));
  const rad = (d: number) => (d * Math.PI) / 180;
  const A = { x: 0.55, y: 0.9 };
  const K = { x: A.x + 0.25 * Math.sin(rad(s)), y: A.y - 0.25 * Math.cos(rad(s)) };
  const H = { x: K.x - 0.25 * Math.sin(rad(u)), y: K.y - 0.25 * Math.cos(rad(u)) };
  const S = { x: H.x + 0.28 * Math.sin(rad(v)), y: H.y - 0.28 * Math.cos(rad(v)) };
  const put = (idx: number, p: { x: number; y: number }, vis = 0.95) => {
    lm[idx] = { x: p.x, y: p.y, z: 0, visibility: vis, presence: 0.95 };
  };
  put(PoseLandmarkIndex.LEFT_SHOULDER, S);
  put(PoseLandmarkIndex.LEFT_HIP, H);
  put(PoseLandmarkIndex.LEFT_KNEE, K);
  put(PoseLandmarkIndex.LEFT_ANKLE, A, feetVis);
  put(PoseLandmarkIndex.LEFT_HEEL, { x: A.x - 0.02, y: A.y + 0.01 }, feetVis);
  put(PoseLandmarkIndex.LEFT_FOOT_INDEX, { x: A.x + 0.05, y: A.y + 0.01 }, feetVis);
  put(PoseLandmarkIndex.LEFT_WRIST, { x: K.x + 0.04, y: H.y + 0.16 });
  const off = (p: { x: number; y: number }) => ({ x: p.x + 0.015, y: p.y });
  put(PoseLandmarkIndex.RIGHT_SHOULDER, off(S), 0.3);
  put(PoseLandmarkIndex.RIGHT_HIP, off(H), 0.3);
  put(PoseLandmarkIndex.RIGHT_KNEE, off(K), 0.3);
  put(PoseLandmarkIndex.RIGHT_ANKLE, off(A), 0.3);
  put(PoseLandmarkIndex.RIGHT_HEEL, { x: A.x + 0.015, y: A.y + 0.01 }, 0.3);
  put(PoseLandmarkIndex.RIGHT_FOOT_INDEX, { x: A.x + 0.06, y: A.y + 0.01 }, 0.3);
  put(PoseLandmarkIndex.RIGHT_WRIST, off(S), 0.3);
  return lm;
}

type Pose = [number, number, number];
const DL_STAND: Pose = [2, 4, 6];
const DL_BOTTOM: Pose = [10, 60, 55];
const DL_MID: Pose = [8, 40, 40];

function playDl(
  analyzer: DeadliftAnalyzer,
  keys: { pose: Pose; frames: number }[],
  opts: { feetVis?: number; clock?: { nowMs: number } } = {},
  startT = 0,
): number {
  let t = startT;
  let prev: Pose | null = null;
  for (const key of keys) {
    const from = prev ?? key.pose;
    for (let i = 0; i < key.frames; i++) {
      const f = key.frames === 1 ? 1 : i / (key.frames - 1 || 1);
      analyzer.processFrame(
        dlFrame(
          from[0] + (key.pose[0] - from[0]) * f,
          from[1] + (key.pose[1] - from[1]) * f,
          from[2] + (key.pose[2] - from[2]) * f,
          opts.feetVis ?? 0.95,
        ),
        t,
        1.0,
      );
      t += 100;
      if (opts.clock) opts.clock.nowMs += 100;
    }
    prev = key.pose;
  }
  return t;
}

function stallPulls(a: DeadliftAnalyzer, count: number, feetVis: number): void {
  let t = 0;
  for (let pull = 0; pull < count; pull++) {
    t = playDl(
      a,
      [
        { pose: DL_BOTTOM, frames: pull === 0 ? 4 : 2 },
        { pose: DL_MID, frames: 8 },
        { pose: DL_BOTTOM, frames: 8 },
      ],
      { feetVis },
      t,
    );
  }
}

describe('Phase 3 check 2: unverified lockout carries its reason, never a failure label', () => {
  it('feet out of frame: 2 stalled pulls are unverified with the feet-out-of-frame reason', () => {
    const a = new DeadliftAnalyzer();
    stallPulls(a, 2, 0.2);
    const summary = a.finishSet();
    expect(summary.totalDetectedReps).toBe(2);
    expect(summary.totalValidReps).toBe(0);
    expect(summary.totalUnverifiedReps).toBe(2);
    expectAccounting(summary);
    const obs = summary.observations.find((o) => o.id === 'rule-lockout-unverified');
    expect(obs).toBeDefined();
    expect(obs!.message).toBe(
      'Could not verify lockout (feet out of frame) on 2 reps.',
    );
    // Never mislabeled as failures:
    expect(summary.observations.map((o) => o.title)).not.toContain('Incomplete Lockouts');
    expect(summary.reps.every((r) => getRepStatus(r) === 'unverified')).toBe(true);
  });

  it('plural handling: exactly 1 unverified pull says "1 rep"', () => {
    const a = new DeadliftAnalyzer();
    stallPulls(a, 1, 0.2);
    const summary = a.finishSet();
    expect(summary.totalUnverifiedReps).toBe(1);
    const obs = summary.observations.find((o) => o.id === 'rule-lockout-unverified');
    expect(obs!.message).toBe(
      'Could not verify lockout (feet out of frame) on 1 rep.',
    );
  });

  it('feet visible: the same stalls are failures reported as Incomplete Lockouts', () => {
    const a = new DeadliftAnalyzer();
    stallPulls(a, 2, 0.95);
    const summary = a.finishSet();
    expect(summary.totalUnverifiedReps).toBe(0);
    expect(summary.observations.map((o) => o.title)).toContain('Incomplete Lockouts');
    expectAccounting(summary);
  });
});

describe('Phase 3 check 2: tempo at the summary level', () => {
  let nowMs = 1_000_000;
  beforeEach(() => {
    nowMs = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aligned clock: tempo is present and reconstructs the set duration', () => {
    const a = new DeadliftAnalyzer();
    a.reset();
    const clock = { nowMs };
    let t = 0;
    for (let repIdx = 0; repIdx < 3; repIdx++) {
      t = playDl(
        a,
        [
          { pose: DL_BOTTOM, frames: repIdx === 0 ? 4 : 2 },
          { pose: DL_STAND, frames: 10 },
          { pose: DL_STAND, frames: 2 },
          { pose: DL_BOTTOM, frames: 8 },
        ],
        { clock },
        t,
      );
    }
    void t;
    nowMs = clock.nowMs;
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(3);
    expect(summary.tempoSeconds).not.toBeNull();
    const reconstructed = summary.tempoSeconds! * summary.totalDetectedReps;
    expect(reconstructed).toBeGreaterThanOrEqual(0.5 * summary.durationSeconds);
    expect(reconstructed).toBeLessThanOrEqual(1.1 * summary.durationSeconds);
  });

  it('a set duration the rep windows cannot reconstruct hides the tempo (null)', () => {
    const a = new DeadliftAnalyzer();
    a.reset();
    const clock = { nowMs };
    let t = 0;
    for (let repIdx = 0; repIdx < 2; repIdx++) {
      t = playDl(
        a,
        [
          { pose: DL_BOTTOM, frames: repIdx === 0 ? 4 : 2 },
          { pose: DL_STAND, frames: 10 },
          { pose: DL_STAND, frames: 2 },
          { pose: DL_BOTTOM, frames: 8 },
        ],
        { clock },
        t,
      );
    }
    void t;
    // The lifter then rests 60 s before finishing — the rep windows
    // now cover a small share of the set, so tempo must hide.
    nowMs = clock.nowMs + 60_000;
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(2);
    expect(summary.tempoSeconds).toBeNull();
  });
});

describe('Phase 3 check 2: summary strings leak no enums, in either language', () => {
  const KEYS = [
    'formCoach.unverifiedOfDetected',
    'formCoach.detectedLine',
    'formCoach.tempoUnavailable',
    'formCoach.avgPerRep',
    'formCoach.phaseStanding',
    'formCoach.phaseDescending',
    'formCoach.phaseBottom',
    'formCoach.phaseAscending',
    'formCoach.phaseLockout',
    'formCoach.phaseRepCompleted',
    'formCoach.phaseTrackingLost',
  ] as const;

  it('every summary string resolves in en + hi with no snake_case or raw enum text', () => {
    for (const lang of ['en', 'hi'] as const) {
      for (const key of KEYS) {
        const out = translate(lang, key, { unverified: 2, detected: 5 });
        expect(out, `${lang}:${key}`).not.toBe(key);
        expect(out, `${lang}:${key}`).not.toMatch(/[a-z]+_[a-z]+/);
        expect(out, `${lang}:${key}`).not.toMatch(/tracking_lost|rep_completed/);
      }
    }
    expect(translate('en', 'formCoach.unverifiedOfDetected', { unverified: 2, detected: 5 })).toBe(
      '2 unverified of 5 detected',
    );
    expect(translate('en', 'formCoach.tempoUnavailable')).toBe('Tempo unavailable');
  });
});
