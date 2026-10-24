import { describe, expect, it } from 'vitest';
import {
  angleAt,
  gateFrame,
  LIFT_CONFIGS,
  RepCounter,
  UNCLEAR_COPY,
  type FormFrame,
  type LiftId,
  type PoseLandmark,
} from '@/lib/form-check';

/**
 * Hand-built landmark sets — no camera needed. Coordinates were chosen
 * so the module's own angle math lands on known sides of each
 * threshold; the expected angles were verified numerically before
 * these tests were written (see comments per preset).
 *
 * Layout per preset: shoulder / hip / knee / ankle / elbow / wrist.
 * Left side = exact coords, right side = x + 0.02 (a side view: the far
 * side nearly overlaps the near side, so the side-view gate passes).
 * Visibility defaults to 1 (fully trusted) unless overridden.
 */

type Joints = {
  shoulder: [number, number];
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
  elbow: [number, number];
  wrist: [number, number];
};

const LM_IDX = {
  shoulder: 11,
  elbow: 13,
  wrist: 15,
  hip: 23,
  knee: 25,
  ankle: 27,
} as const;

function landmarks(j: Joints, vis = 1, rightDx = 0.02): PoseLandmark[] {
  const out: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));
  (Object.keys(j) as (keyof Joints)[]).forEach((key) => {
    const [x, y] = j[key];
    const left = LM_IDX[key];
    out[left] = { x, y, visibility: vis };
    out[left + 1] = { x: x + rightDx, y, visibility: vis };
  });
  return out;
}

function frame(j: Joints, t: number, vis = 1, rightDx = 0.02): FormFrame {
  return { landmarks: landmarks(j, vis, rightDx), timestampMs: t };
}

/** n frames of one preset, 500 ms apart, starting at t0. */
function run(j: Joints, n: number, t0: number, step = 500, vis = 1, rightDx = 0.02): FormFrame[] {
  return Array.from({ length: n }, (_, i) => frame(j, t0 + i * step, vis, rightDx));
}

// ── Squat: knee 180 standing / 95 deep / 113 shallow / 139 partial ──
const SQUAT_TOP: Joints = {
  shoulder: [0.5, 0.2], hip: [0.5, 0.5], knee: [0.5, 0.8], ankle: [0.5, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
const SQUAT_DEEP: Joints = {
  shoulder: [0.45, 0.2], hip: [0.4, 0.5], knee: [0.6, 0.8], ankle: [0.35, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
const SQUAT_SHALLOW: Joints = {
  shoulder: [0.5, 0.25], hip: [0.45, 0.55], knee: [0.65, 0.75], ankle: [0.55, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
const SQUAT_PARTIAL: Joints = {
  shoulder: [0.5, 0.25], hip: [0.5, 0.5], knee: [0.62, 0.8], ankle: [0.55, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
// Torso lean 50° at the bottom (knee 98): flags 'torso-lean'.
const SQUAT_LEAN: Joints = {
  shoulder: [0.75, 0.3], hip: [0.45, 0.55], knee: [0.6, 0.8], ankle: [0.35, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};

// ── Bench: elbow 180 top / 78 deep / 104 shallow / 157 drift-mid ──
const BENCH_TOP: Joints = {
  shoulder: [0.3, 0.5], hip: [0.55, 0.55], knee: [0.7, 0.6], ankle: [0.7, 0.8],
  elbow: [0.3, 0.25], wrist: [0.3, 0.05],
};
const BENCH_DEEP: Joints = {
  shoulder: [0.3, 0.5], hip: [0.55, 0.55], knee: [0.7, 0.6], ankle: [0.7, 0.8],
  elbow: [0.48, 0.42], wrist: [0.38, 0.28],
};
const BENCH_SHALLOW: Joints = {
  shoulder: [0.3, 0.5], hip: [0.55, 0.55], knee: [0.7, 0.6], ankle: [0.7, 0.8],
  elbow: [0.5, 0.45], wrist: [0.5, 0.2],
};
// Elbow 157 near lockout, wrist 0.8 torso-lengths off the shoulder line.
const BENCH_DRIFT: Joints = {
  shoulder: [0.3, 0.5], hip: [0.55, 0.55], knee: [0.7, 0.6], ankle: [0.7, 0.8],
  elbow: [0.35, 0.3], wrist: [0.5, 0.1],
};

// ── Deadlift: hip 180 standing / 88 bottom (knee 148) / 140 hips-first mid ──
const DL_TOP: Joints = {
  shoulder: [0.5, 0.2], hip: [0.5, 0.5], knee: [0.5, 0.8], ankle: [0.5, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
const DL_BOTTOM: Joints = {
  shoulder: [0.85, 0.45], hip: [0.5, 0.55], knee: [0.6, 0.85], ankle: [0.55, 1.05],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
const DL_MID_HIPS_FIRST: Joints = {
  shoulder: [0.6, 0.25], hip: [0.5, 0.45], knee: [0.58, 0.78], ankle: [0.55, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
// Same set-up but legs nearly straight (knee 172): 'straight-leg-start'.
const DL_STRAIGHT_BOTTOM: Joints = {
  shoulder: [0.85, 0.45], hip: [0.5, 0.55], knee: [0.6, 0.85], ankle: [0.7, 1.05],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};

// ── Overhead press: elbow 180 lockout / 90 rack (lean 31°) ──
const OHP_TOP: Joints = {
  shoulder: [0.5, 0.4], hip: [0.5, 0.55], knee: [0.5, 0.8], ankle: [0.5, 1.0],
  elbow: [0.5, 0.2], wrist: [0.5, 0.05],
};
const OHP_RACK_LEAN: Joints = {
  shoulder: [0.65, 0.25], hip: [0.5, 0.5], knee: [0.5, 0.8], ankle: [0.5, 1.0],
  elbow: [0.8, 0.4], wrist: [0.65, 0.55],
};

// ── Barbell row: elbow 180 hang / 72 pull (hinge 119) / 86 pull stood up ──
const ROW_HANG: Joints = {
  shoulder: [0.8, 0.35], hip: [0.55, 0.55], knee: [0.6, 0.85], ankle: [0.6, 1.0],
  elbow: [0.8, 0.6], wrist: [0.8, 0.85],
};
const ROW_PULL: Joints = {
  shoulder: [0.8, 0.35], hip: [0.55, 0.55], knee: [0.6, 0.85], ankle: [0.6, 1.0],
  elbow: [0.95, 0.5], wrist: [0.75, 0.6],
};
const ROW_PULL_STOOD: Joints = {
  shoulder: [0.5, 0.2], hip: [0.5, 0.5], knee: [0.5, 0.8], ankle: [0.5, 1.0],
  elbow: [0.65, 0.45], wrist: [0.45, 0.55],
};

/** Full-rep frame list: top×2, bottom×2, top×4 (confirm + hysteresis). */
function fullRep(top: Joints, bottom: Joints, t0 = 0): FormFrame[] {
  return [...run(top, 2, t0), ...run(bottom, 2, t0 + 1000), ...run(top, 4, t0 + 2000)];
}

function feed(lift: LiftId, frames: FormFrame[]): RepCounter {
  const c = new RepCounter(lift);
  for (const f of frames) c.processFrame(f);
  return c;
}

describe('angle math', () => {
  const b: PoseLandmark = { x: 0, y: 0 };
  it('computes 90°, 180° and 45° from known geometries', () => {
    expect(angleAt({ x: 1, y: 0 }, b, { x: 0, y: 1 })).toBeCloseTo(90, 5);
    expect(angleAt({ x: 1, y: 0 }, b, { x: -1, y: 0 })).toBeCloseTo(180, 5);
    const s = Math.SQRT1_2;
    expect(angleAt({ x: 1, y: 0 }, b, { x: s, y: s })).toBeCloseTo(45, 5);
  });
});

describe('squat rep state machine', () => {
  it('counts a full rep exactly once', () => {
    const c = feed('squat', fullRep(SQUAT_TOP, SQUAT_DEEP));
    expect(c.repCount).toBe(1);
    expect(c.reps[0].depthGood).toBe(true); // min knee 95 ≤ 100
  });

  it('does not count a partial rep that never reaches the bottom', () => {
    const frames = [
      ...run(SQUAT_TOP, 2, 0),
      ...run(SQUAT_PARTIAL, 2, 1000), // knee 139: between bottom 120 and top 160
      ...run(SQUAT_TOP, 4, 2000),
    ];
    expect(feed('squat', frames).repCount).toBe(0);
  });

  it('does not count a rep that bottoms out but never returns to the top', () => {
    const frames = [...run(SQUAT_TOP, 2, 0), ...run(SQUAT_DEEP, 4, 1000)];
    expect(feed('squat', frames).repCount).toBe(0);
  });

  it('hysteresis: a single jitter frame below the bottom threshold counts nothing', () => {
    const frames = [
      ...run(SQUAT_TOP, 2, 0),
      ...run(SQUAT_DEEP, 1, 1000), // 1 frame only — needs 2 to confirm
      ...run(SQUAT_TOP, 2, 1500),
      ...fullRep(SQUAT_TOP, SQUAT_DEEP, 2500),
    ];
    expect(feed('squat', frames).repCount).toBe(1);
  });

  it('counts two consecutive full reps', () => {
    const frames = [...fullRep(SQUAT_TOP, SQUAT_DEEP, 0), ...fullRep(SQUAT_TOP, SQUAT_DEEP, 4000)];
    expect(feed('squat', frames).repCount).toBe(2);
  });
});

describe('uncertainty gating', () => {
  it('low-visibility frames produce the unclear state and count nothing', () => {
    const c = new RepCounter('squat');
    const r = c.processFrame(frame(SQUAT_TOP, 0, 0.2));
    expect(r.status).toBe('unclear');
    expect(r.unclearReason).toBe('low-visibility');
    expect(r.liveCue).toBe(UNCLEAR_COPY);
    expect(r.repCount).toBe(0);
    expect(r.angles).toBeNull();
  });

  it('a missing required landmark reads as occlusion', () => {
    const f = frame(SQUAT_TOP, 0);
    f.landmarks[25] = { x: Number.NaN, y: Number.NaN, visibility: 1 };
    const r = new RepCounter('squat').processFrame(f);
    expect(r.status).toBe('unclear');
    expect(r.unclearReason).toBe('occlusion');
  });

  it('a front view (wide shoulders) reads as a camera-angle problem', () => {
    const r = new RepCounter('squat').processFrame(frame(SQUAT_TOP, 0, 1, 0.3));
    expect(r.status).toBe('unclear');
    expect(r.unclearReason).toBe('camera-angle');
    expect(r.liveCue).toBe(UNCLEAR_COPY);
  });

  it('the gate itself accepts a clear side-view frame', () => {
    expect(gateFrame('squat', landmarks(SQUAT_TOP))).toBeNull();
  });

  it('a rep touched by ANY unclear frame is tainted and never counted', () => {
    const frames = [
      ...run(SQUAT_TOP, 2, 0),
      ...run(SQUAT_DEEP, 2, 1000), // bottom confirmed
      frame(SQUAT_DEEP, 2000, 0.1), // one unclear frame mid-rep
      ...run(SQUAT_TOP, 4, 2500),
    ];
    expect(feed('squat', frames).repCount).toBe(0);
  });

  it('five unclear frames in a row discard the partial rep and wait for the top', () => {
    const c = new RepCounter('squat');
    for (const f of [
      ...run(SQUAT_TOP, 2, 0),
      ...run(SQUAT_DEEP, 2, 1000),
      ...run(SQUAT_DEEP, 5, 2000, 500, 0.1),
    ]) {
      c.processFrame(f);
    }
    expect(c.phase).toBe('awaiting-top');
    expect(c.repCount).toBe(0);
    // Re-acquire the top, then a full rep counts again.
    for (const f of [...run(SQUAT_TOP, 2, 4500), ...fullRep(SQUAT_TOP, SQUAT_DEEP, 5500)]) {
      c.processFrame(f);
    }
    expect(c.repCount).toBe(1);
  });
});

describe('liveCueCode (i18n mapping input for the section)', () => {
  it('unclear frames carry code "unclear" alongside the unclear copy', () => {
    const r = new RepCounter('squat').processFrame(frame(SQUAT_TOP, 0, 0.2));
    expect(r.status).toBe('unclear');
    expect(r.liveCue).toBe(UNCLEAR_COPY);
    expect(r.liveCueCode).toBe('unclear');
  });

  it('a clear top frame carries no cue and no code', () => {
    const r = new RepCounter('squat').processFrame(frame(SQUAT_TOP, 0));
    expect(r.status).toBe('clear');
    expect(r.liveCue).toBeNull();
    expect(r.liveCueCode).toBeNull();
  });

  it('a torso-lean bottom frame carries the flag code matching its cue text', () => {
    const c = new RepCounter('squat');
    let last = c.processFrame(frame(SQUAT_TOP, 0));
    for (const f of [...run(SQUAT_TOP, 1, 500), ...run(SQUAT_LEAN, 2, 1000)]) {
      last = c.processFrame(f);
    }
    expect(last.phase).toBe('bottom');
    expect(last.liveCue).toBe('Chest up — your torso is tipping forward.');
    expect(last.liveCueCode).toBe('torso-lean');
  });
});

describe('per-lift cue selection', () => {
  it('squat: shallow rep counts but is flagged shallow', () => {
    const c = feed('squat', fullRep(SQUAT_TOP, SQUAT_SHALLOW));
    expect(c.repCount).toBe(1);
    expect(c.reps[0].depthGood).toBe(false); // min knee 113 > 100
    expect(c.reps[0].flags).toContain('shallow');
  });

  it('squat: torso lean at the bottom flags torso-lean', () => {
    const c = feed('squat', fullRep(SQUAT_TOP, SQUAT_LEAN));
    expect(c.repCount).toBe(1);
    expect(c.reps[0].flags).toContain('torso-lean');
  });

  it('bench: deep rep is depth-good; shallow rep is flagged', () => {
    expect(feed('bench', fullRep(BENCH_TOP, BENCH_DEEP)).reps[0].depthGood).toBe(true);
    const shallow = feed('bench', fullRep(BENCH_TOP, BENCH_SHALLOW));
    expect(shallow.reps[0].depthGood).toBe(false);
    expect(shallow.reps[0].flags).toContain('shallow');
  });

  it('bench: wrist drift near lockout flags wrist-drift', () => {
    const frames = [
      ...run(BENCH_TOP, 2, 0),
      ...run(BENCH_DEEP, 2, 1000),
      ...run(BENCH_DRIFT, 5, 2000),
    ];
    const c = feed('bench', frames);
    expect(c.repCount).toBe(1);
    expect(c.reps[0].flags).toContain('wrist-drift');
  });

  it('deadlift: hips rising before the legs flags hips-first', () => {
    const frames = [
      ...run(DL_TOP, 2, 0),
      ...run(DL_BOTTOM, 2, 1000),
      ...run(DL_MID_HIPS_FIRST, 2, 2000), // → ascending, hips-first fires
      ...run(DL_TOP, 2, 3000), // → top, rep completes
    ];
    const c = feed('deadlift', frames);
    expect(c.repCount).toBe(1);
    expect(c.reps[0].flags).toContain('hips-first');
  });

  it('deadlift: a normal set-up does not flag, a straight-leg set-up does', () => {
    const normal = feed('deadlift', fullRep(DL_TOP, DL_BOTTOM));
    expect(normal.reps[0].flags).not.toContain('straight-leg-start');
    const straight = feed('deadlift', fullRep(DL_TOP, DL_STRAIGHT_BOTTOM));
    expect(straight.reps[0].flags).toContain('straight-leg-start');
  });

  it('overhead press: leaning back at the rack flags lean-back', () => {
    const c = feed('overhead-press', fullRep(OHP_TOP, OHP_RACK_LEAN));
    expect(c.repCount).toBe(1);
    expect(c.reps[0].flags).toContain('lean-back');
  });

  it('barbell row: a held hinge is clean, standing up flags hinge-lost', () => {
    const clean = feed('barbell-row', fullRep(ROW_HANG, ROW_PULL));
    expect(clean.repCount).toBe(1);
    expect(clean.reps[0].flags).not.toContain('hinge-lost');
    const stood = feed('barbell-row', fullRep(ROW_HANG, ROW_PULL_STOOD));
    expect(stood.reps[0].flags).toContain('hinge-lost');
  });

  it('every lift config documents its thresholds', () => {
    for (const id of ['squat', 'bench', 'deadlift', 'overhead-press', 'barbell-row'] as LiftId[]) {
      const cfg = LIFT_CONFIGS[id];
      expect(cfg.topThreshold).toBeGreaterThan(cfg.bottomThreshold);
      expect(cfg.bottomThreshold).toBeGreaterThanOrEqual(cfg.depthTarget);
      expect(cfg.requiredLandmarks.length).toBeGreaterThanOrEqual(6);
      expect(cfg.cameraHint.length).toBeGreaterThan(0);
      expect(cfg.angleNotes.length).toBeGreaterThan(0);
    }
  });
});

describe('post-set summary', () => {
  it('aggregates reps, depth consistency, tempo and issue counts', () => {
    const frames = [...fullRep(SQUAT_TOP, SQUAT_DEEP, 0), ...fullRep(SQUAT_TOP, SQUAT_SHALLOW, 4000)];
    const c = feed('squat', frames);
    const s = c.endSet('completed', 8000);
    expect(s.repCount).toBe(2);
    expect(s.depthGoodCount).toBe(1);
    expect(s.depthConsistencyPct).toBe(50);
    // Each rep: bottom confirmed at frame 3, top confirmed at frame 7 → 2.0 s.
    expect(s.medianTempoSec).toBe(2);
    expect(s.meanTempoSec).toBe(2);
    expect(s.issues.find((i) => i.code === 'shallow')?.count).toBe(1);
    expect(s.stoppedForPain).toBe(false);
    expect(s.painMessage).toBe('');
  });

  it('an empty set summarizes honestly (0 reps, 0% depth, null tempo)', () => {
    const s = new RepCounter('squat').endSet('completed', 1000);
    expect(s.repCount).toBe(0);
    expect(s.depthConsistencyPct).toBe(0);
    expect(s.medianTempoSec).toBeNull();
    expect(s.issues).toEqual([]);
  });
});

describe('pain-stop', () => {
  it('ends the set immediately, refers out, and ignores later frames', () => {
    const c = new RepCounter('squat');
    for (const f of run(SQUAT_TOP, 2, 0)) c.processFrame(f);
    const s = c.requestPainStop(1500);
    expect(s.endReason).toBe('pain-stop');
    expect(s.stoppedForPain).toBe(true);
    expect(s.painMessage).toContain('physiotherapist');
    // The refer-out names the limit honestly ("cannot diagnose pain").
    // Later frames are ignored: a full rep after the stop counts nothing.
    for (const f of fullRep(SQUAT_TOP, SQUAT_DEEP, 2000)) c.processFrame(f);
    expect(c.repCount).toBe(0);
    expect(c.buildSummary().repCount).toBe(0);
  });

  it('pain copy never suggests continuing or explains the pain away', () => {
    const s = new RepCounter('squat').requestPainStop(0);
    // "whether it is safe to continue" is the disclaimer, not advice:
    // assert on the advice phrasings, and that the limit is named.
    expect(s.painMessage).not.toMatch(/keep going|push through|normal soreness|you can continue/i);
    expect(s.painMessage).toMatch(/cannot diagnose pain/i);
  });
});
