/**
 * Subject selection (deep audit, 2026-11-05).
 *
 * Reproduces the owner's front-view failure at unit level: the pose model
 * returned the SPOTTER (standing still, closer to the camera) and the app
 * analyzed him — knee ~171°, 0 reps — while the lifter squatted behind
 * him. The tracker must converge on the person whose hips actually travel
 * (the lifter), stick to him, and never flicker.
 */
import { describe, it, expect } from 'vitest';
import { PoseSubjectTracker } from '../../src/features/form-coach/services/pose/PoseSubjectTracker';
import type { NormalizedLandmark } from '../../src/features/form-coach/models/pose.types';

function person(hipX: number, hipY: number): NormalizedLandmark[] {
  const pose: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: hipX,
    y: hipY,
    z: 0,
    visibility: 0.99,
  }));
  pose[23] = { x: hipX - 0.03, y: hipY, z: 0, visibility: 0.99 };
  pose[24] = { x: hipX + 0.03, y: hipY, z: 0, visibility: 0.99 };
  return pose;
}

function hipXOf(pose: NormalizedLandmark[]): number {
  return (pose[23].x + pose[24].x) / 2;
}

const SPOTTER_X = 0.68;
const LIFTER_X = 0.42;

describe('PoseSubjectTracker', () => {
  it('passes a single detected person straight through', () => {
    const tracker = new PoseSubjectTracker();
    for (let i = 0; i < 5; i++) {
      const sel = tracker.select([person(LIFTER_X, 0.4 + i * 0.01)]);
      expect(sel).not.toBeNull();
      expect(hipXOf(sel!.landmarks)).toBeCloseTo(LIFTER_X, 5);
      expect(sel!.subjectSwitched).toBe(false);
    }
  });

  it('returns null when nothing is detected', () => {
    const tracker = new PoseSubjectTracker();
    expect(tracker.select([])).toBeNull();
  });

  it('converges on the squatting lifter, not the standing spotter, and sticks', () => {
    const tracker = new PoseSubjectTracker();
    let switches = 0;
    let lastSel: ReturnType<PoseSubjectTracker['select']> = null;
    // 40 frames: spotter sways in place; lifter performs ~2 slow reps
    // (hip Y travels 0.40 -> 0.60 -> 0.40).
    for (let f = 0; f < 40; f++) {
      const spotter = person(SPOTTER_X, 0.45 + 0.004 * Math.sin(f / 3));
      const phase = (f % 20) / 20;
      const lifterY = 0.4 + 0.2 * Math.sin(phase * Math.PI);
      const lifter = person(LIFTER_X, lifterY);
      // Candidate order alternates, as MediaPipe's ordering is not stable.
      const candidates = f % 2 === 0 ? [spotter, lifter] : [lifter, spotter];
      lastSel = tracker.select(candidates);
      if (lastSel?.subjectSwitched) switches++;
      if (f >= 30) {
        expect(lastSel).not.toBeNull();
        expect(hipXOf(lastSel!.landmarks)).toBeCloseTo(LIFTER_X, 5);
      }
    }
    expect(switches).toBe(1); // exactly one flip: spotter -> lifter
  });

  it('does not switch between two people who are both standing still', () => {
    const tracker = new PoseSubjectTracker();
    let switches = 0;
    for (let f = 0; f < 20; f++) {
      const sel = tracker.select([
        person(SPOTTER_X, 0.45),
        person(LIFTER_X, 0.42),
      ]);
      if (sel?.subjectSwitched) switches++;
    }
    expect(switches).toBe(0);
  });

  it('returns null (not the bystander) when the subject is occluded for a frame', () => {
    const tracker = new PoseSubjectTracker();
    // Lock onto the lifter with a few descending frames.
    for (let f = 0; f < 10; f++) {
      tracker.select([person(SPOTTER_X, 0.45), person(LIFTER_X, 0.4 + f * 0.02)]);
    }
    // Lifter hidden behind the spotter for one frame.
    const occluded = tracker.select([person(SPOTTER_X, 0.45)]);
    expect(occluded).toBeNull();
    // Lifter back: same subject, no switch penalty.
    const back = tracker.select([person(SPOTTER_X, 0.45), person(LIFTER_X, 0.58)]);
    expect(back).not.toBeNull();
    expect(hipXOf(back!.landmarks)).toBeCloseTo(LIFTER_X, 5);
    expect(back!.subjectSwitched).toBe(false);
  });

  it('reset() forgets tracks and selection', () => {
    const tracker = new PoseSubjectTracker();
    for (let f = 0; f < 10; f++) {
      tracker.select([person(SPOTTER_X, 0.45), person(LIFTER_X, 0.4 + f * 0.02)]);
    }
    tracker.reset();
    const sel = tracker.select([person(SPOTTER_X, 0.45)]);
    expect(sel).not.toBeNull();
    expect(hipXOf(sel!.landmarks)).toBeCloseTo(SPOTTER_X, 5);
    expect(sel!.subjectSwitched).toBe(false);
  });
});
