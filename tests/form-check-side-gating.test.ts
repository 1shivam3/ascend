import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  computeAngles,
  gateFrame,
  RepCounter,
  unclearDetail,
  type FormFrame,
  type PoseLandmark,
} from '@/lib/form-check';
import { emptyLandmarks, toPoseLandmarks } from '@/lib/pose-engine';

/**
 * Side-gating diagnosis: the user's phone screenshots show a squat in
 * TRUE SIDE VIEW, full body in frame, yet every frame reports all four
 * joint groups unclear and no rep is ever counted. Two mechanisms
 * were suspected:
 *
 * (A) FAR-SIDE OCCLUSION GATE: squat requires all 8 landmarks (both
 *     shoulders, hips, knees, ankles) at visibility >= 0.5. In a true
 *     side view MediaPipe reports the occluded far side below 0.5, so
 *     a correct side view can NEVER pass — and the old guidance
 *     collapsed left+right into one group, so a far-side-only failure
 *     rendered identically to "nothing is visible" (all four groups).
 * (B) NO-PERSON MASKING: when detection finds nobody, the section
 *     feeds emptyLandmarks() (all visibility 0), which the gate fails
 *     as low-visibility — the identical box as a real visibility
 *     failure, so "found nobody" can never be distinguished.
 *
 * These tests prove (A) against the OLD gate (they fail before the
 * fix) and pin the new behavior after it: a frame is clear when
 * EITHER side is fully visible, angles come from trusted sides only,
 * and unclear detail names the better side's failures, not a blend.
 * (B) is pinned at the counter level (unchanged) plus a section
 * source contract for the distinct no-person display.
 *
 * Conventions: left side exact, right side = left x + 0.02 (a side
 * view: the far side nearly overlaps the near side). The gate is
 * symmetric — it trusts whichever side is complete, so "near" here
 * just means the complete side, not a hardcoded left/right.
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

describe('mechanism (A): far-side occlusion must not block a true side view', () => {
  it('side view, far side occluded at 0.3, near side perfect → CLEAR with a knee angle', () => {
    const marks = sideLandmarks(STANDING, { farVis: 0.3 });
    expect(gateFrame('squat', marks)).toBeNull();
    const result = new RepCounter('squat').processFrame(frame(marks));
    expect(result.status).toBe('clear');
    expect(result.angles).not.toBeNull();
    expect(result.angles!.knee).not.toBeNull();
  });

  it('side view, far-side landmarks missing entirely → CLEAR (far side is don\'t-care)', () => {
    const marks = sideLandmarks(STANDING);
    for (const idx of [12, 24, 26, 28]) marks[idx] = { x: NaN, y: NaN, visibility: 1 };
    expect(gateFrame('squat', marks)).toBeNull();
  });

  it('one-sided missing landmark no longer blocks when the other side is complete', () => {
    const marks = sideLandmarks(STANDING);
    marks[25] = { x: NaN, y: NaN, visibility: 1 }; // left knee only
    expect(gateFrame('squat', marks)).toBeNull();
  });

  it('a full squat rep counts with an occluded far side', () => {
    const frames = [
      ...[0, 1].map((i) => frame(sideLandmarks(STANDING, { farVis: 0.3 }), i * 100)),
      ...[2, 3].map((i) => frame(sideLandmarks(DEEP, { farVis: 0.3 }), i * 100)),
      ...[4, 5, 6, 7].map((i) => frame(sideLandmarks(STANDING, { farVis: 0.3 }), i * 100)),
    ];
    const counter = new RepCounter('squat');
    for (const f of frames) counter.processFrame(f);
    expect(counter.repCount).toBe(1);
  });

  it('knee angle comes from the trusted side only, not the mean with an occluded side', () => {
    // Near (left): hip–knee–ankle = 90°. Far (right): 160° at vis 0.2.
    // A mean would read ~125°; the trusted side reads 90°.
    const marks = baseLandmarks();
    marks[11] = { x: 0.45, y: 0.25, visibility: 1 };
    marks[12] = { x: 0.47, y: 0.25, visibility: 1 };
    marks[23] = { x: 0.45, y: 0.55, visibility: 1 };
    marks[24] = { x: 0.47, y: 0.55, visibility: 0.2 };
    marks[25] = { x: 0.45, y: 0.75, visibility: 1 };
    marks[26] = { x: 0.47, y: 0.75, visibility: 0.2 };
    marks[27] = { x: 0.65, y: 0.75, visibility: 1 };
    marks[28] = { x: 0.538, y: 0.938, visibility: 0.2 };
    expect(gateFrame('squat', marks)).toBeNull();
    const angles = computeAngles(marks);
    expect(angles.knee).not.toBeNull();
    expect(Math.abs(angles.knee! - 90)).toBeLessThan(2);
  });

  it('better-side aggregation: split failures name only the better side', () => {
    // Left fails the knee, right fails the ankle — neither side is
    // complete. Old code blended both sides: knees + ankles. The
    // better side is left on ties, so only knees are named.
    const marks = sideLandmarks(STANDING);
    marks[25] = { ...marks[25], visibility: 0.2 };
    marks[28] = { ...marks[28], visibility: 0.2 };
    expect(unclearDetail('squat', marks)).toEqual({
      reason: 'low-visibility',
      outOfFrame: [],
      lowVisibility: ['knees'],
      side: 'left',
    });
  });

  it('better-side occlusion names only the better side', () => {
    // Left ankle out of frame; far side entirely low-visibility.
    // Better side is left (3 visible vs 0): occlusion, ankles only.
    const marks = sideLandmarks(STANDING, { farVis: 0.2 });
    marks[27] = { x: NaN, y: NaN, visibility: 1 };
    expect(unclearDetail('squat', marks)).toEqual({
      reason: 'occlusion',
      outOfFrame: ['ankles'],
      lowVisibility: [],
      side: 'left',
    });
  });
});

describe('controls: what must NOT change', () => {
  it('front view still trips the camera-angle gate', () => {
    const marks = baseLandmarks();
    const pts: Record<number, [number, number]> = {
      11: [0.35, 0.25], 12: [0.65, 0.25],
      23: [0.42, 0.55], 24: [0.58, 0.55],
      25: [0.42, 0.75], 26: [0.58, 0.75],
      27: [0.42, 0.95], 28: [0.58, 0.95],
    };
    for (const [idx, [x, y]] of Object.entries(pts)) {
      marks[Number(idx)] = { x, y, visibility: 1 };
    }
    expect(gateFrame('squat', marks)).toBe('camera-angle');
  });

  it('both sides low-visibility still blocked', () => {
    const marks = sideLandmarks(STANDING, { nearVis: 0.2, farVis: 0.2 });
    expect(gateFrame('squat', marks)).toBe('low-visibility');
  });

  it('full side view, all trusted → clear (unchanged)', () => {
    expect(gateFrame('squat', sideLandmarks(STANDING))).toBeNull();
  });
});

describe('mechanism (B): no-person input must not masquerade as low-visibility', () => {
  it('no detection → null landmarks (the section must not feed them as a visibility failure)', () => {
    expect(toPoseLandmarks({ landmarks: [] })).toBeNull();
    expect(toPoseLandmarks({})).toBeNull();
  });

  it('counter-level behavior for all-visibility-0 frames is unchanged (still unclear)', () => {
    const marks = emptyLandmarks();
    expect(gateFrame('squat', marks)).toBe('low-visibility');
    expect(unclearDetail('squat', marks)?.lowVisibility).toEqual([
      'shoulders',
      'hips',
      'knees',
      'ankles',
    ]);
  });

  it('section distinguishes no-person from low-visibility in its render path', () => {
    const sectionSrc = readFileSync(
      join(process.cwd(), 'src/components/FormCheckSection.tsx'),
      'utf8'
    );
    expect(sectionSrc).toContain('noPerson');
    expect(sectionSrc).toContain('formcheck.noPerson');
    expect(sectionSrc).toContain('formcheck.noPersonHint');
  });
});
