/**
 * Overlay geometry (deep audit D5b, 2026-11-05).
 *
 * The owner's screenshot: a portrait phone video playing in the
 * landscape (aspect-video) player — the <video> renders it with
 * object-contain (pillarboxed), but the skeleton canvas was stretched
 * across the whole container with object-cover, so the skeleton drew
 * ~3x too tall, cropped, and shifted onto the black bars. These tests
 * pin the contain-fit math the canvas element is now positioned with.
 */
import { describe, it, expect } from 'vitest';
import { computeVideoContentRect } from '../../src/features/form-coach/components/PoseOverlay';

describe('computeVideoContentRect (object-contain math)', () => {
  it('pillarboxes a portrait video in a landscape container (the 343.mp4 case)', () => {
    // Player ~900x506 (max-w-lg, aspect-video); video 478x850 portrait.
    const rect = computeVideoContentRect(900, 506, 478, 850);
    expect(rect.height).toBeCloseTo(506, 1);
    expect(rect.width).toBeCloseTo((478 / 850) * 506, 1); // ~284.6
    expect(rect.left).toBeCloseTo((900 - rect.width) / 2, 1); // ~307.7
    expect(rect.top).toBeCloseTo(0, 1);
    // The skeleton of a person standing at the video's horizontal center
    // must land at the CONTAINER center — not 3x-scaled onto the bars.
    expect(rect.left + rect.width / 2).toBeCloseTo(450, 1);
  });

  it('letterboxes a landscape video in a landscape container of different ratio', () => {
    const rect = computeVideoContentRect(900, 506, 1920, 1080);
    expect(rect.width).toBeCloseTo(899.6, 0);
    expect(rect.height).toBeCloseTo(506, 1);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeCloseTo(0, 1);
  });

  it('letterboxes a wide video in a square container', () => {
    const rect = computeVideoContentRect(500, 500, 1920, 1080);
    expect(rect.width).toBeCloseTo(500, 1);
    expect(rect.height).toBeCloseTo((1080 / 1920) * 500, 1); // 281.25
    expect(rect.top).toBeCloseTo((500 - rect.height) / 2, 1);
    expect(rect.left).toBeCloseTo(0, 1);
  });

  it('exact fit when ratios match', () => {
    const rect = computeVideoContentRect(640, 360, 1280, 720);
    expect(rect).toEqual({ left: 0, top: 0, width: 640, height: 360 });
  });

  it('degenerate inputs fall back to the container box instead of NaN', () => {
    const rect = computeVideoContentRect(900, 506, 0, 0);
    expect(Number.isFinite(rect.width)).toBe(true);
    expect(rect.width).toBe(900);
    expect(rect.height).toBe(506);
  });
});
