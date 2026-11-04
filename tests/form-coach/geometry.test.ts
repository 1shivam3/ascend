import { describe, it, expect } from 'vitest';
import {
  calculateJointAngle,
  calculateSegmentInclination,
  calculateDistance,
  calculateVelocity,
  isLandmarkReliable,
} from '@/features/form-coach/services/analysis/LandmarkGeometry';
import { NormalizedLandmark } from '@/features/form-coach/models/pose.types';

describe('LandmarkGeometry', () => {
  it('correctly calculates 90-degree right angle', () => {
    // A=(1,0), B=(0,0), C=(0,1)
    const a: NormalizedLandmark = { x: 1, y: 0, z: 0, visibility: 0.9, presence: 0.9 };
    const b: NormalizedLandmark = { x: 0, y: 0, z: 0, visibility: 0.9, presence: 0.9 };
    const c: NormalizedLandmark = { x: 0, y: 1, z: 0, visibility: 0.9, presence: 0.9 };

    const angle = calculateJointAngle(a, b, c, 1.0);
    expect(angle).toBeCloseTo(90, 1);
  });

  it('correctly calculates 180-degree straight line angle', () => {
    // A=(0,-1), B=(0,0), C=(0,1)
    const a: NormalizedLandmark = { x: 0, y: -1, z: 0, visibility: 0.9, presence: 0.9 };
    const b: NormalizedLandmark = { x: 0, y: 0, z: 0, visibility: 0.9, presence: 0.9 };
    const c: NormalizedLandmark = { x: 0, y: 1, z: 0, visibility: 0.9, presence: 0.9 };

    const angle = calculateJointAngle(a, b, c, 1.0);
    expect(angle).toBeCloseTo(180, 1);
  });

  it('returns null when any landmark has visibility below threshold', () => {
    const a: NormalizedLandmark = { x: 1, y: 0, z: 0, visibility: 0.2, presence: 0.9 }; // Low visibility
    const b: NormalizedLandmark = { x: 0, y: 0, z: 0, visibility: 0.9, presence: 0.9 };
    const c: NormalizedLandmark = { x: 0, y: 1, z: 0, visibility: 0.9, presence: 0.9 };

    const angle = calculateJointAngle(a, b, c, 1.0, 0.5);
    expect(angle).toBeNull();
  });

  it('returns null when landmarks are missing or null', () => {
    const a: NormalizedLandmark = { x: 1, y: 0, z: 0, visibility: 0.9, presence: 0.9 };
    expect(calculateJointAngle(a, null, a, 1.0)).toBeNull();
  });

  it('calculates vertical segment inclination correctly', () => {
    // Top=(0,0), Bottom=(0,1) -> Vertical = 0 degrees
    const top: NormalizedLandmark = { x: 0.5, y: 0.2, z: 0, visibility: 0.9, presence: 0.9 };
    const bottom: NormalizedLandmark = { x: 0.5, y: 0.8, z: 0, visibility: 0.9, presence: 0.9 };

    const inclination = calculateSegmentInclination(top, bottom, 1.0);
    expect(inclination).toBeCloseTo(0, 1);
  });

  it('calculates 45-degree segment inclination', () => {
    // Top=(0,0), Bottom=(1,1) -> dx=1, dy=1 -> 45 degrees
    const top: NormalizedLandmark = { x: 0, y: 0, z: 0, visibility: 0.9, presence: 0.9 };
    const bottom: NormalizedLandmark = { x: 1, y: 1, z: 0, visibility: 0.9, presence: 0.9 };

    const inclination = calculateSegmentInclination(top, bottom, 1.0);
    expect(inclination).toBeCloseTo(45, 1);
  });

  it('calculates Euclidean distance with aspect ratio scaling', () => {
    const a: NormalizedLandmark = { x: 0, y: 0, z: 0, visibility: 0.9, presence: 0.9 };
    const b: NormalizedLandmark = { x: 0.3, y: 0.4, z: 0, visibility: 0.9, presence: 0.9 };

    // With aspectRatio = 1.0, 3-4-5 triangle -> 0.5
    const dist = calculateDistance(a, b, 1.0);
    expect(dist).toBeCloseTo(0.5, 3);
  });

  it('calculates velocity over time accurately', () => {
    // Distance change: 10 units in 0.5 seconds -> 20 units/s
    const vel = calculateVelocity(25, 15, 0.5);
    expect(vel).toBeCloseTo(20, 2);

    // Handles zero or negative dt safely
    expect(calculateVelocity(25, 15, 0)).toBe(0);
  });

  it('validates landmark reliability properly', () => {
    expect(isLandmarkReliable({ x: 0.5, y: 0.5, z: 0, visibility: 0.8, presence: 0.8 })).toBe(true);
    expect(isLandmarkReliable({ x: 0.5, y: 0.5, z: 0, visibility: 0.4, presence: 0.8 })).toBe(false);
    expect(isLandmarkReliable({ x: NaN, y: 0.5, z: 0, visibility: 0.9, presence: 0.9 })).toBe(false);
    expect(isLandmarkReliable(null)).toBe(false);
  });
});
