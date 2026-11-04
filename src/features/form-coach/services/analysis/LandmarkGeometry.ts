/**
 * ASCEND Form Coach — Landmark Geometry & Trigonometric Computations
 *
 * Provides aspect-ratio corrected 2D vector angles, segment inclinations,
 * Euclidean distances, velocities, and landmark confidence screening.
 */

import { NormalizedLandmark } from '../../models/pose.types';

export const MIN_LANDMARK_VISIBILITY = 0.5;
export const MIN_LANDMARK_PRESENCE = 0.5;

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Checks if a landmark has sufficient visibility and presence confidence.
 */
export function isLandmarkReliable(
  landmark: NormalizedLandmark | null | undefined,
  minVisibility = MIN_LANDMARK_VISIBILITY,
  minPresence = MIN_LANDMARK_PRESENCE
): boolean {
  if (!landmark) return false;
  if (typeof landmark.x !== 'number' || isNaN(landmark.x)) return false;
  if (typeof landmark.y !== 'number' || isNaN(landmark.y)) return false;

  const vis = landmark.visibility ?? 1.0;
  const pres = landmark.presence ?? 1.0;

  return vis >= minVisibility && pres >= minPresence;
}

/**
 * Normalizes a landmark's 2D position by correcting for the video aspect ratio.
 * In normalized coordinates (0..1, 0..1), distance dx is stretched if width != height.
 * Multiplying x by aspectRatio (width / height) yields isotropic Euclidean coordinates.
 */
export function toIsotropicPoint(
  landmark: NormalizedLandmark,
  aspectRatio = 1.0
): Point2D {
  return {
    x: landmark.x * aspectRatio,
    y: landmark.y,
  };
}

/**
 * Calculates the interior angle (in degrees, 0 to 180) formed at vertex B
 * by rays BA and BC: angle(ABC) at point B.
 *
 * @param a First endpoint (e.g., Hip)
 * @param b Vertex landmark (e.g., Knee)
 * @param c Second endpoint (e.g., Ankle)
 * @param aspectRatio Image width / height (defaults to 1.0 if square)
 * @returns Angle in degrees [0, 180], or null if any landmark is unreliable
 */
export function calculateJointAngle(
  a: NormalizedLandmark | null | undefined,
  b: NormalizedLandmark | null | undefined,
  c: NormalizedLandmark | null | undefined,
  aspectRatio = 1.0,
  minVisibility = MIN_LANDMARK_VISIBILITY
): number | null {
  if (!isLandmarkReliable(a, minVisibility) ||
      !isLandmarkReliable(b, minVisibility) ||
      !isLandmarkReliable(c, minVisibility)) {
    return null;
  }

  // Safe non-null assertion after isLandmarkReliable checks
  const pA = toIsotropicPoint(a!, aspectRatio);
  const pB = toIsotropicPoint(b!, aspectRatio);
  const pC = toIsotropicPoint(c!, aspectRatio);

  // Vector BA and Vector BC
  const vBA: Point2D = { x: pA.x - pB.x, y: pA.y - pB.y };
  const vBC: Point2D = { x: pC.x - pB.x, y: pC.y - pB.y };

  const magBA = Math.hypot(vBA.x, vBA.y);
  const magBC = Math.hypot(vBC.x, vBC.y);

  if (magBA < 1e-6 || magBC < 1e-6) {
    return null;
  }

  // Dot product
  const dot = vBA.x * vBC.x + vBA.y * vBC.y;
  const cosAngle = Math.max(-1.0, Math.min(1.0, dot / (magBA * magBC)));

  const angleRad = Math.acos(cosAngle);
  return (angleRad * 180.0) / Math.PI;
}

/**
 * Calculates the inclination angle (in degrees, 0 to 90) of a body segment relative to the vertical axis.
 * Example: Torso inclination between Hip and Shoulder.
 * 0° = perfectly vertical (upright)
 * 90° = horizontal (parallel to floor)
 */
export function calculateSegmentInclination(
  top: NormalizedLandmark | null | undefined,
  bottom: NormalizedLandmark | null | undefined,
  aspectRatio = 1.0,
  minVisibility = MIN_LANDMARK_VISIBILITY
): number | null {
  if (!isLandmarkReliable(top, minVisibility) || !isLandmarkReliable(bottom, minVisibility)) {
    return null;
  }

  const pTop = toIsotropicPoint(top!, aspectRatio);
  const pBottom = toIsotropicPoint(bottom!, aspectRatio);

  const dx = Math.abs(pTop.x - pBottom.x);
  const dy = Math.abs(pTop.y - pBottom.y);

  if (dy < 1e-6 && dx < 1e-6) {
    return 0;
  }

  // Angle with vertical axis
  const angleRad = Math.atan2(dx, dy);
  return (angleRad * 180.0) / Math.PI;
}

/**
 * Calculates isotropic Euclidean distance between two landmarks.
 */
export function calculateDistance(
  a: NormalizedLandmark | null | undefined,
  b: NormalizedLandmark | null | undefined,
  aspectRatio = 1.0,
  minVisibility = MIN_LANDMARK_VISIBILITY
): number | null {
  if (!isLandmarkReliable(a, minVisibility) || !isLandmarkReliable(b, minVisibility)) {
    return null;
  }

  const pA = toIsotropicPoint(a!, aspectRatio);
  const pB = toIsotropicPoint(b!, aspectRatio);

  return Math.hypot(pA.x - pB.x, pA.y - pB.y);
}

/**
 * Calculates velocity (rate of change per second).
 */
export function calculateVelocity(
  currentVal: number,
  previousVal: number,
  dtSeconds: number
): number {
  if (dtSeconds <= 1e-4) return 0;
  return (currentVal - previousVal) / dtSeconds;
}
