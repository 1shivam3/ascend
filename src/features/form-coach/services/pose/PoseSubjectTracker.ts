/**
 * ASCEND Form Coach — Subject selection (deep audit, 2026-11-05).
 *
 * Why this exists: the pipeline used to take MediaPipe's pose [0] and only
 * ever detected ONE person (numPoses 1). In the owner's front-view test
 * video the pose model locked onto the SPOTTER — standing still, closer to
 * the camera — and analyzed him: knee ~171°, 0 reps, while the actual
 * lifter squatted behind him unanalyzed.
 *
 * What this does: given every detected person each frame, keep identity
 * tracks (matched by hip-midpoint proximity), measure each track's hip
 * vertical range (max − min hip Y over the whole clip so far), and return
 * the track with the greatest range — the person actually performing reps.
 * A standing spotter's hips barely move; the lifter's travel far.
 *
 * Stickiness: once a subject is chosen, a challenger must exceed the
 * incumbent's range by SWITCH_MARGIN before the selection flips, so the
 * overlay/analyzer never flickers between two moving people. The caller
 * gets `subjectSwitched` so it can reset landmark smoothing on a flip —
 * smoothing across two different bodies would smear both.
 *
 * Deliberately simple: one signal (hip travel), greedy nearest matching,
 * no ML. It converges as soon as the lifter's first descent completes —
 * before that, pose [0] is returned so early frames behave like the old
 * pipeline.
 */

import type { NormalizedLandmark } from '../../models/pose.types';

export interface SubjectSelection {
  landmarks: NormalizedLandmark[];
  subjectSwitched: boolean;
}

interface Track {
  id: number;
  lastHip: { x: number; y: number } | null;
  minHipY: number;
  maxHipY: number;
  missedFrames: number;
  lastLandmarks: NormalizedLandmark[] | null;
}

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
/** Max hip-midpoint distance (normalized coords) to call two detections the same person. */
const MATCH_DISTANCE = 0.3;
/** Challenger must beat the incumbent's hip range by this much to take over. */
const SWITCH_MARGIN = 0.03;
/** Frames a track may go unseen before it is pruned. */
const STALE_FRAMES = 30;

function hipMidpoint(pose: NormalizedLandmark[]): { x: number; y: number } | null {
  const l = pose[LEFT_HIP];
  const r = pose[RIGHT_HIP];
  if (!l || !r) return null;
  return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
}

export class PoseSubjectTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private selectedId: number | null = null;

  reset(): void {
    this.tracks = [];
    this.selectedId = null;
  }

  /**
   * Feed one frame's candidate poses (possibly empty). Returns the current
   * subject's landmarks, or null when nothing usable was detected and no
   * subject exists yet.
   */
  select(candidates: NormalizedLandmark[][]): SubjectSelection | null {
    // 1. Match candidates to existing tracks by hip proximity.
    const unmatched = new Set(this.tracks.map((t) => t.id));
    const assignments: Array<{ track: Track; pose: NormalizedLandmark[] }> = [];

    for (const pose of candidates) {
      const hip = hipMidpoint(pose);
      if (!hip) continue;
      let best: Track | null = null;
      let bestDist = MATCH_DISTANCE;
      for (const track of this.tracks) {
        if (!unmatched.has(track.id) || !track.lastHip) continue;
        const d = Math.hypot(track.lastHip.x - hip.x, track.lastHip.y - hip.y);
        if (d < bestDist) {
          bestDist = d;
          best = track;
        }
      }
      if (best) {
        unmatched.delete(best.id);
        assignments.push({ track: best, pose });
      } else {
        const track: Track = {
          id: this.nextId++,
          lastHip: hip,
          minHipY: hip.y,
          maxHipY: hip.y,
          missedFrames: 0,
          lastLandmarks: pose,
        };
        this.tracks.push(track);
        assignments.push({ track, pose });
      }
    }

    // 2. Update matched tracks; age + prune unmatched ones.
    for (const { track, pose } of assignments) {
      const hip = hipMidpoint(pose);
      if (!hip) continue;
      track.lastHip = hip;
      track.minHipY = Math.min(track.minHipY, hip.y);
      track.maxHipY = Math.max(track.maxHipY, hip.y);
      track.missedFrames = 0;
      track.lastLandmarks = pose;
    }
    const assignedIds = new Set(assignments.map((a) => a.track.id));
    this.tracks = this.tracks.filter((t) => {
      if (assignedIds.has(t.id)) return true;
      t.missedFrames += 1;
      return t.missedFrames <= STALE_FRAMES;
    });

    // 3. Choose the subject: greatest hip vertical range, with hysteresis.
    const rangeOf = (t: Track) => t.maxHipY - t.minHipY;
    const incumbent = this.tracks.find((t) => t.id === this.selectedId) ?? null;
    let bestTrack: Track | null = null;
    for (const t of this.tracks) {
      if (!bestTrack || rangeOf(t) > rangeOf(bestTrack)) bestTrack = t;
    }

    let switched = false;
    if (bestTrack) {
      if (!incumbent) {
        this.selectedId = bestTrack.id; // first lock — not a switch
      } else if (
        bestTrack.id !== incumbent.id &&
        rangeOf(bestTrack) > rangeOf(incumbent) + SWITCH_MARGIN
      ) {
        this.selectedId = bestTrack.id;
        switched = true;
      }
    }

    const subject = this.tracks.find((t) => t.id === this.selectedId) ?? null;
    if (!subject || !subject.lastLandmarks) return null;
    // A frame where the subject was not among the candidates returns its
    // last seen landmarks ONLY if it was matched this frame; otherwise the
    // caller should see null (no detection) rather than a frozen pose.
    if (!assignedIds.has(subject.id)) return null;
    return { landmarks: subject.lastLandmarks, subjectSwitched: switched };
  }
}
