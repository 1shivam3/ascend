import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  gateFrame,
  RepCounter,
  unclearDetail,
  type FormFrame,
  type PoseLandmark,
} from '@/lib/form-check';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';
import { translate } from '@/lib/i18n';

/**
 * Gate-behavior verification for the form-check framing fix.
 *
 * The user filmed with his FULL BODY in frame and still got no
 * analysis. These synthetic landmark sets establish, against
 * unchanged code, exactly which gate state each realistic framing
 * produces — so a messaging-only fix is never mistaken for a gate
 * fix, and vice versa.
 *
 * Conventions (mirroring tests/form-check.test.ts): left side exact,
 * right side = left x + rightDx (a side view: the far side nearly
 * overlaps the near side). Visibility defaults to 1 unless overridden.
 */

const LM = {
  shoulder: 11,
  elbow: 13,
  wrist: 15,
  hip: 23,
  knee: 25,
  ankle: 27,
} as const;

type Joint = keyof typeof LM;

function baseLandmarks(): PoseLandmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
}

/** Side-view pose: left exact, right offset by rightDx, all vis 1. */
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

/** Fully explicit left/right coordinates (for front views). */
function explicitLandmarks(
  points: Partial<Record<number, { x: number; y: number; visibility?: number }>>
): PoseLandmark[] {
  const out = baseLandmarks();
  for (const [idx, pt] of Object.entries(points)) {
    if (!pt) continue;
    out[Number(idx)] = { x: pt.x, y: pt.y, visibility: pt.visibility ?? 1 };
  }
  return out;
}

function frame(landmarks: PoseLandmark[], t = 0): FormFrame {
  return { landmarks, timestampMs: t };
}

/** Standing side view, squat top position (knee ~180°, all visible). */
const STANDING_SIDE: Partial<Record<Joint, [number, number]>> = {
  shoulder: [0.45, 0.25],
  hip: [0.45, 0.55],
  knee: [0.45, 0.75],
  ankle: [0.45, 0.95],
};

describe('gate behavior: realistic framings', () => {
  it('full-body SIDE view is clear (angle computable, reps possible)', () => {
    const marks = sideLandmarks(STANDING_SIDE);
    expect(gateFrame('squat', marks)).toBeNull();
    const counter = new RepCounter('squat');
    const result = counter.processFrame(frame(marks));
    expect(result.status).toBe('clear');
    expect(result.angles).not.toBeNull();
    expect(result.angles!.knee).not.toBeNull();
  });

  it('full-body FRONT view trips the camera-angle gate (never analyzable)', () => {
    const marks = explicitLandmarks({
      11: { x: 0.35, y: 0.25 },
      12: { x: 0.65, y: 0.25 },
      23: { x: 0.42, y: 0.55 },
      24: { x: 0.58, y: 0.55 },
      25: { x: 0.42, y: 0.75 },
      26: { x: 0.58, y: 0.75 },
      27: { x: 0.42, y: 0.95 },
      28: { x: 0.58, y: 0.95 },
    });
    expect(gateFrame('squat', marks)).toBe('camera-angle');
    const counter = new RepCounter('squat');
    const result = counter.processFrame(frame(marks));
    expect(result.status).toBe('unclear');
    expect(result.unclearReason).toBe('camera-angle');
    expect(result.angles).toBeNull();
  });

  it('a near-side view (far side offset 0.12, ratio 0.40) still passes the gate', () => {
    const marks = sideLandmarks(STANDING_SIDE, { rightDx: 0.12 });
    expect(gateFrame('squat', marks)).toBeNull();
  });

  it('a 45-degree-ish view (far side offset 0.17, ratio 0.57) trips the gate', () => {
    const marks = sideLandmarks(STANDING_SIDE, { rightDx: 0.17 });
    expect(gateFrame('squat', marks)).toBe('camera-angle');
  });

  it('knees/ankles at low visibility fail as low-visibility (close-up case)', () => {
    const marks = sideLandmarks(STANDING_SIDE);
    // Knees + ankles unreadable (out of frame / dim), rest fine.
    for (const idx of [25, 26, 27, 28]) marks[idx] = { ...marks[idx], visibility: 0.2 };
    expect(gateFrame('squat', marks)).toBe('low-visibility');
  });

  it('knees/ankles non-finite fail as occlusion', () => {
    const marks = sideLandmarks(STANDING_SIDE);
    for (const idx of [25, 26, 27, 28]) marks[idx] = { x: NaN, y: NaN, visibility: 1 };
    expect(gateFrame('squat', marks)).toBe('occlusion');
  });

  it('far-side visibility 0.4 fails as low-visibility even when the near side is perfect', () => {
    // Probe for the second suspect: a true side view where MediaPipe
    // reports the occluded far side below the 0.5 floor. Current
    // behavior is unclear — documented here, not changed on speculation.
    const marks = sideLandmarks(STANDING_SIDE, { farVis: 0.4 });
    expect(gateFrame('squat', marks)).toBe('low-visibility');
  });

  it('bench side view is clear; a missing wrist fails as low-visibility', () => {
    const benchSide = sideLandmarks({
      shoulder: [0.45, 0.35],
      elbow: [0.45, 0.55],
      wrist: [0.45, 0.75],
      hip: [0.45, 0.55],
    });
    expect(gateFrame('bench', benchSide)).toBeNull();
    const noWrist = sideLandmarks({
      shoulder: [0.45, 0.35],
      elbow: [0.45, 0.55],
      wrist: [0.45, 0.75],
      hip: [0.45, 0.55],
    });
    for (const idx of [15, 16]) noWrist[idx] = { ...noWrist[idx], visibility: 0.2 };
    expect(gateFrame('bench', noWrist)).toBe('low-visibility');
  });
});

describe('unclear detail: the box names what is missing', () => {
  it('clear frame → null detail, no unclear box data', () => {
    const marks = sideLandmarks(STANDING_SIDE);
    expect(unclearDetail('squat', marks)).toBeNull();
    const result = new RepCounter('squat').processFrame(frame(marks));
    expect(result.status).toBe('clear');
    expect(result.unclearDetail).toBeNull();
  });

  it('knees/ankles at low visibility → named low-visibility joints', () => {
    const marks = sideLandmarks(STANDING_SIDE);
    for (const idx of [25, 26, 27, 28]) marks[idx] = { ...marks[idx], visibility: 0.2 };
    expect(unclearDetail('squat', marks)).toEqual({
      reason: 'low-visibility',
      outOfFrame: [],
      lowVisibility: ['knees', 'ankles'],
    });
    const result = new RepCounter('squat').processFrame(frame(marks));
    expect(result.unclearDetail?.lowVisibility).toEqual(['knees', 'ankles']);
  });

  it('knees/ankles non-finite → named out-of-frame joints', () => {
    const marks = sideLandmarks(STANDING_SIDE);
    for (const idx of [25, 26, 27, 28]) marks[idx] = { x: NaN, y: NaN, visibility: 1 };
    expect(unclearDetail('squat', marks)).toEqual({
      reason: 'occlusion',
      outOfFrame: ['knees', 'ankles'],
      lowVisibility: [],
    });
  });

  it('front view → camera-angle with NO joints named (angle, not joints, is the problem)', () => {
    const marks = explicitLandmarks({
      11: { x: 0.35, y: 0.25 },
      12: { x: 0.65, y: 0.25 },
      23: { x: 0.42, y: 0.55 },
      24: { x: 0.58, y: 0.55 },
      25: { x: 0.42, y: 0.75 },
      26: { x: 0.58, y: 0.75 },
      27: { x: 0.42, y: 0.95 },
      28: { x: 0.58, y: 0.95 },
    });
    expect(unclearDetail('squat', marks)).toEqual({
      reason: 'camera-angle',
      outOfFrame: [],
      lowVisibility: [],
    });
  });

  it('one-sided failure collapses to a single joint group (left knee only → knees)', () => {
    const marks = sideLandmarks(STANDING_SIDE);
    marks[25] = { ...marks[25], visibility: 0.2 };
    expect(unclearDetail('squat', marks)?.lowVisibility).toEqual(['knees']);
  });

  it('bench wrist failure → wrists only', () => {
    const marks = sideLandmarks({
      shoulder: [0.45, 0.35],
      elbow: [0.45, 0.55],
      wrist: [0.45, 0.75],
      hip: [0.45, 0.55],
    });
    for (const idx of [15, 16]) marks[idx] = { ...marks[idx], visibility: 0.2 };
    expect(unclearDetail('bench', marks)?.lowVisibility).toEqual(['wrists']);
  });
});

describe('form-check section: video sizing, overlay, guidance wiring', () => {
  const sectionSrc = readFileSync(
    join(process.cwd(), 'src/components/FormCheckSection.tsx'),
    'utf8'
  );

  it('video preview is tall, not 16:9, and capped to the viewport', () => {
    const videoClass = sectionSrc.match(/<video[\s\S]*?className="([^"]*)"/)?.[1] ?? '';
    expect(videoClass).toContain('aspect-[9/16]');
    expect(videoClass).toContain('max-h-[62vh]');
    expect(videoClass).not.toContain('aspect-video');
    expect(videoClass).toContain('w-full');
  });

  it('framing-guide overlay is present on the video', () => {
    expect(sectionSrc).toContain('framing-guide');
  });

  it('unclear box renders the specific guidance, wired to live frame detail', () => {
    expect(sectionSrc).toContain('unclearDetail: frameResult.unclearDetail');
    expect(sectionSrc).toContain('formcheck.unclearTurnSideways');
    expect(sectionSrc).toContain('formcheck.missingJoints');
    expect(sectionSrc).toContain('formcheck.lowVisibilityJoints');
  });

  it('new guidance keys exist in en and hi with real copy (parity)', () => {
    const keys = [
      'formcheck.jointShoulders',
      'formcheck.jointElbows',
      'formcheck.jointWrists',
      'formcheck.jointHips',
      'formcheck.jointKnees',
      'formcheck.jointAnkles',
      'formcheck.missingJoints',
      'formcheck.lowVisibilityJoints',
      'formcheck.unclearTurnSideways',
    ] as const;
    for (const key of keys) {
      expect((en as Record<string, string>)[key]?.length).toBeGreaterThan(0);
      expect((hi as Record<string, string>)[key]?.length).toBeGreaterThan(0);
      expect(translate('hi', key)).not.toBe(key);
    }
    expect(
      translate('en', 'formcheck.missingJoints', { joints: 'knees, ankles' })
    ).toContain('knees, ankles');
    expect(translate('en', 'formcheck.unclearTurnSideways')).toContain('sideways');
  });
});
