import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  RepCounter,
  buildVisibilityDiagnostic,
  type FormFrame,
  type PoseLandmark,
} from '@/lib/form-check';
import { POSE_MODEL_VARIANT, emptyLandmarks } from '@/lib/pose-engine';

/**
 * Diagnostic visibility readout: the user STILL gets the all-four-groups
 * unclear box on a sideways squat after the side-gating fix, the full-model
 * switch, and an incognito re-test — so model choice is ruled out and the
 * next step is evidence, not another blind fix. These tests pin the
 * readout's data mapping: the displayed numbers must be the EXACT
 * values the gate consumes (the gate has no per-group aggregate — each
 * group is one landmark per side, trusted iff finite + visibility >= 0.5),
 * the toggle must default off, and enabling the readout must not change
 * any gate or counter outcome (it is display-only).
 *
 * Conventions mirror the side-gating tests: left side exact, right side
 * = left x + 0.02 (a side view: the far side nearly overlaps the near
 * side). The gate is symmetric — it trusts whichever side is complete.
 */

const LM = { shoulder: 11, hip: 23, knee: 25, ankle: 27 } as const;
type Joint = keyof typeof LM;

function baseLandmarks(): PoseLandmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
}

function sideLandmarks(
  joints: Partial<Record<Joint, [number, number]>>,
  opts: { rightDx?: number; nearVis?: number; farVis?: number } = {}
): PoseLandmark[] {
  const { rightDx = 0.02, nearVis = 1, farVis = 1 } = opts;
  const out = baseLandmarks();
  (Object.keys(joints) as Joint[]).forEach((key) => {
    const [x, y] = joints[key]!;
    const left = LM[key];
    out[left] = { x, y, visibility: nearVis };
    out[left + 1] = { x: x + rightDx, y, visibility: farVis };
  });
  return out;
}

function frame(landmarks: PoseLandmark[], t = 0): FormFrame {
  return { landmarks, timestampMs: t };
}

/** Standing side view, squat top (knee 180°). */
const STANDING: Partial<Record<Joint, [number, number]>> = {
  shoulder: [0.45, 0.25],
  hip: [0.45, 0.55],
  knee: [0.45, 0.75],
  ankle: [0.45, 0.95],
};

/** Deep squat side view (knee 90°: hip level with knee, ankle below). */
const DEEP: Partial<Record<Joint, [number, number]>> = {
  shoulder: [0.3, 0.45],
  hip: [0.3, 0.75],
  knee: [0.5, 0.75],
  ankle: [0.5, 0.95],
};

function rowOf(diag: ReturnType<typeof buildVisibilityDiagnostic>, group: string) {
  return diag.groups.find((g) => g.group === group)!;
}

describe('diagnostic readout data mapping', () => {
  it('near-perfect + far-dim deep squat: displayed values equal the gate inputs, left trusted, verdict clear', () => {
    const marks = sideLandmarks(DEEP, { nearVis: 0.9, farVis: 0.3 });
    const result = new RepCounter('squat').processFrame(frame(marks));
    expect(result.status).toBe('clear');
    const diag = buildVisibilityDiagnostic('squat', marks, result, false);
    expect(diag.groups.map((g) => g.group)).toEqual([
      'shoulders',
      'hips',
      'knees',
      'ankles',
    ]);
    for (const group of ['shoulders', 'hips', 'knees', 'ankles']) {
      const row = rowOf(diag, group);
      expect(row.left).toBe(0.9);
      expect(row.right).toBe(0.3);
      expect(row.leftTrusted).toBe(true);
      expect(row.rightTrusted).toBe(false);
    }
    expect(diag.leftTrustedCount).toBe(4);
    expect(diag.rightTrustedCount).toBe(0);
    expect(diag.trustedSides).toEqual(['left']);
    expect(diag.betterSide).toBe('left');
    expect(diag.verdict).toBe('clear');
    expect(diag.unclearReason).toBeNull();
    expect(diag.primaryAngleDeg).toBe(90);
    expect(diag.repCount).toBe(0);
  });

  it('all-dim frame: every value shown dim, no trusted side, verdict unclear low-visibility', () => {
    const marks = sideLandmarks(STANDING, { nearVis: 0.35, farVis: 0.35 });
    const result = new RepCounter('squat').processFrame(frame(marks));
    expect(result.status).toBe('unclear');
    const diag = buildVisibilityDiagnostic('squat', marks, result, false);
    for (const row of diag.groups) {
      expect(row.left).toBe(0.35);
      expect(row.right).toBe(0.35);
      expect(row.leftTrusted).toBe(false);
      expect(row.rightTrusted).toBe(false);
    }
    expect(diag.leftTrustedCount).toBe(0);
    expect(diag.rightTrustedCount).toBe(0);
    expect(diag.trustedSides).toEqual([]);
    expect(diag.betterSide).toBe('left'); // tie → left
    expect(diag.verdict).toBe('unclear');
    expect(diag.unclearReason).toBe('low-visibility');
    expect(diag.primaryAngleDeg).toBeNull(); // unclear frames carry no angles
  });

  it('no-person frame: verdict no-person, all values 0 (not a visibility failure)', () => {
    const marks = emptyLandmarks();
    const result = new RepCounter('squat').processFrame(frame(marks));
    const diag = buildVisibilityDiagnostic('squat', marks, result, true);
    expect(diag.verdict).toBe('no-person');
    expect(diag.unclearReason).toBeNull();
    for (const row of diag.groups) {
      expect(row.left).toBe(0);
      expect(row.right).toBe(0);
    }
  });

  it('front view with bright joints: verdict unclear camera-angle, values bright — angle vs visibility distinguished', () => {
    const marks = baseLandmarks();
    // Wide shoulders vs torso length → side-view ratio gate trips.
    marks[11] = { x: 0.35, y: 0.25, visibility: 0.95 };
    marks[12] = { x: 0.65, y: 0.25, visibility: 0.95 };
    marks[23] = { x: 0.4, y: 0.55, visibility: 0.95 };
    marks[24] = { x: 0.6, y: 0.55, visibility: 0.95 };
    marks[25] = { x: 0.4, y: 0.75, visibility: 0.95 };
    marks[26] = { x: 0.6, y: 0.75, visibility: 0.95 };
    marks[27] = { x: 0.4, y: 0.95, visibility: 0.95 };
    marks[28] = { x: 0.6, y: 0.95, visibility: 0.95 };
    const result = new RepCounter('squat').processFrame(frame(marks));
    expect(result.status).toBe('unclear');
    expect(result.unclearReason).toBe('camera-angle');
    const diag = buildVisibilityDiagnostic('squat', marks, result, false);
    expect(diag.verdict).toBe('unclear');
    expect(diag.unclearReason).toBe('camera-angle');
    for (const row of diag.groups) {
      expect(row.left).toBe(0.95);
      expect(row.right).toBe(0.95);
      expect(row.leftTrusted).toBe(true);
      expect(row.rightTrusted).toBe(true);
    }
    expect(diag.trustedSides).toEqual(['left', 'right']);
  });

  it('missing/undefined visibility renders as null and untrusted, never as a guessed number', () => {
    // Undefined left-knee visibility: row shows null; the complete right
    // side still clears the frame, so the mapping is testable on a clear frame.
    const marks = sideLandmarks(STANDING, { nearVis: 0.9, farVis: 0.9 });
    marks[25] = { x: 0.45, y: 0.75, visibility: undefined };
    const result = new RepCounter('squat').processFrame(frame(marks));
    expect(result.status).toBe('clear');
    const knees = rowOf(buildVisibilityDiagnostic('squat', marks, result, false), 'knees');
    expect(knees.left).toBeNull();
    expect(knees.leftTrusted).toBe(false);
    expect(knees.right).toBe(0.9);
    expect(knees.rightTrusted).toBe(true);

    // Non-finite better-side landmark → occlusion reason, null value.
    const occluded = sideLandmarks(STANDING, { nearVis: 0.9, farVis: 0.9 });
    occluded[27] = { x: NaN, y: NaN, visibility: 1 };
    occluded[28] = { x: 0.47, y: 0.95, visibility: 0.3 };
    const occludedResult = new RepCounter('squat').processFrame(frame(occluded));
    expect(occludedResult.unclearReason).toBe('occlusion');
    const ankles = rowOf(
      buildVisibilityDiagnostic('squat', occluded, occludedResult, false),
      'ankles'
    );
    expect(ankles.left).toBeNull();
    expect(ankles.leftTrusted).toBe(false);
    expect(ankles.right).toBe(0.3);
  });

  it('the readout is display-only: building it changes no counter outcome and mutates nothing', () => {
    const marks = sideLandmarks(DEEP, { nearVis: 0.9, farVis: 0.3 });
    const before = JSON.stringify(marks);
    const counterA = new RepCounter('squat');
    const counterB = new RepCounter('squat');
    const resultA = counterA.processFrame(frame(marks));
    const resultB = counterB.processFrame(frame(marks));
    // The only difference between the two runs: A builds diagnostics.
    buildVisibilityDiagnostic('squat', marks, resultA, false);
    const summaryA = counterA.endSet('completed', 100);
    const summaryB = counterB.endSet('completed', 100);
    expect(JSON.stringify(resultA)).toBe(JSON.stringify(resultB));
    expect(JSON.stringify(summaryA)).toBe(JSON.stringify(summaryB));
    expect(JSON.stringify(marks)).toBe(before);
  });

  it('the readout reports the model actually loaded (full)', () => {
    expect(POSE_MODEL_VARIANT).toBe('full');
  });
});

describe('diagnostic toggle section contract (static-rendering harness)', () => {
  it('toggle defaults off, diagnostic computation is gated on the toggle and throttled', () => {
    const sectionSrc = readFileSync(
      join(process.cwd(), 'src/components/FormCheckSection.tsx'),
      'utf8'
    );
    expect(sectionSrc).toContain(
      'const [showDebug, setShowDebug] = useState(false)'
    );
    expect(sectionSrc).toContain('showDebugRef.current');
    expect(sectionSrc).toContain('buildVisibilityDiagnostic');
    expect(sectionSrc).toContain('formcheck.debugToggle');
    // Throttled display refresh (~4/s) so the readout cannot jank detection.
    expect(sectionSrc).toContain('>= 250');
    // Toggling off and ending the set clear the snapshot.
    expect(sectionSrc).toContain('setDiag(null)');
  });
});
