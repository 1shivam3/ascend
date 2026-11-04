/**
 * ASCEND Form Coach — Landmark Smoothing & Jitter Reduction
 *
 * Implements an adaptive low-pass filter (One-Euro style) for 2D/3D normalized pose coordinates.
 * High smoothing when velocity is near zero (eliminates stationary joint tremor).
 * Low smoothing when velocity is high (preserves movement responsiveness and turnaround accuracy).
 */

import { NormalizedLandmark, PoseLandmarks } from '../../models/pose.types';

export interface SmoothingConfig {
  minCutoff: number; // Hz, lower values remove more stationary jitter (e.g. 1.0)
  beta: number; // Speed coefficient, higher values adapt faster to quick movement (e.g. 0.05)
  dCutoff: number; // Derivative cutoff frequency (e.g. 1.0)
}

const DEFAULT_CONFIG: SmoothingConfig = {
  minCutoff: 1.2,
  beta: 0.04,
  dCutoff: 1.0,
};

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  reset() {
    this.y = null;
    this.s = null;
  }

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = alpha * value + (1.0 - alpha) * this.s!;
    this.s = this.y;
    return this.y;
  }

  lastValue(): number | null {
    return this.y;
  }
}

class OneEuroPointFilter {
  private xFilter = new LowPassFilter();
  private yFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private dyFilter = new LowPassFilter();
  private lastTimeMs: number | null = null;

  constructor(private config: SmoothingConfig = DEFAULT_CONFIG) {}

  reset() {
    this.xFilter.reset();
    this.yFilter.reset();
    this.dxFilter.reset();
    this.dyFilter.reset();
    this.lastTimeMs = null;
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  filter(x: number, y: number, timestampMs: number): { x: number; y: number } {
    if (this.lastTimeMs === null) {
      this.lastTimeMs = timestampMs;
      return {
        x: this.xFilter.filter(x, 1.0),
        y: this.yFilter.filter(y, 1.0),
      };
    }

    const dtSeconds = Math.max((timestampMs - this.lastTimeMs) / 1000.0, 1e-4);
    this.lastTimeMs = timestampMs;
    const rate = 1.0 / dtSeconds;

    // Filter derivative (velocity)
    const lastX = this.xFilter.lastValue() ?? x;
    const lastY = this.yFilter.lastValue() ?? y;
    const dx = (x - lastX) * rate;
    const dy = (y - lastY) * rate;

    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.config.dCutoff));
    const edy = this.dyFilter.filter(dy, this.alpha(rate, this.config.dCutoff));
    const speed = Math.hypot(edx, edy);

    // Adaptive cutoff based on speed
    const cutoff = this.config.minCutoff + this.config.beta * speed;
    const a = this.alpha(rate, cutoff);

    return {
      x: this.xFilter.filter(x, a),
      y: this.yFilter.filter(y, a),
    };
  }
}

export class PoseLandmarksSmoother {
  private filters: Map<number, OneEuroPointFilter> = new Map();

  constructor(private config: SmoothingConfig = DEFAULT_CONFIG) {}

  reset() {
    this.filters.clear();
  }

  smooth(landmarks: PoseLandmarks, timestampMs: number): PoseLandmarks {
    return landmarks.map((lm, idx) => {
      let filter = this.filters.get(idx);
      if (!filter) {
        filter = new OneEuroPointFilter(this.config);
        this.filters.set(idx, filter);
      }

      const smoothed = filter.filter(lm.x, lm.y, timestampMs);

      return {
        ...lm,
        x: smoothed.x,
        y: smoothed.y,
      };
    });
  }
}
