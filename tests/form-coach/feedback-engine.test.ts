import { describe, it, expect, beforeEach } from 'vitest';
import { FormFeedbackEngine, FeedbackRule } from '@/features/form-coach/services/analysis/FormFeedbackEngine';

describe('FormFeedbackEngine', () => {
  let engine: FormFeedbackEngine;

  const mockCriticalRule: FeedbackRule = {
    id: 'test-critical',
    exerciseId: 'squat',
    title: 'Critical Cue',
    message: 'Ankles out of frame',
    priority: 'critical',
    cooldownMs: 2000,
    evaluate: (ctx) => !ctx.anklesVisible,
  };

  const mockMediumRule: FeedbackRule = {
    id: 'test-medium',
    exerciseId: 'squat',
    title: 'Medium Cue',
    message: 'Good depth achieved',
    priority: 'medium',
    cooldownMs: 3000,
    evaluate: (ctx) => ctx.phase === 'bottom',
  };

  beforeEach(() => {
    engine = new FormFeedbackEngine([mockCriticalRule, mockMediumRule]);
  });

  it('triggers critical cues when conditions match', () => {
    const cue = engine.evaluate({
      exerciseId: 'squat',
      phase: 'standing',
      currentKneeAngleDeg: 165,
      minKneeAngleDeg: 165,
      torsoInclinationDeg: 5,
      trackingConfidence: 0.8,
      feetVisible: false,
      anklesVisible: false, // matches critical
      sideViewDetected: true,
      depthTargetDeg: 90,
      currentRepNumber: 0,
      timestampMs: 1000,
    });

    expect(cue).not.toBeNull();
    expect(cue?.id).toBe('test-critical');
    expect(cue?.priority).toBe('critical');
  });

  it('respects rule cooldowns and prevents message flickering', () => {
    // 1st trigger
    const cue1 = engine.evaluate({
      exerciseId: 'squat',
      phase: 'bottom',
      currentKneeAngleDeg: 85,
      minKneeAngleDeg: 85,
      torsoInclinationDeg: 25,
      trackingConfidence: 0.9,
      feetVisible: true,
      anklesVisible: true,
      sideViewDetected: true,
      depthTargetDeg: 90,
      currentRepNumber: 1,
      timestampMs: 1000,
    });
    expect(cue1?.id).toBe('test-medium');

    // Attempt trigger within cooldown (500ms later, cooldown is 3000ms)
    // Same rule should NOT re-trigger
    engine.evaluate({
      exerciseId: 'squat',
      phase: 'bottom',
      currentKneeAngleDeg: 85,
      minKneeAngleDeg: 85,
      torsoInclinationDeg: 25,
      trackingConfidence: 0.9,
      feetVisible: true,
      anklesVisible: true,
      sideViewDetected: true,
      depthTargetDeg: 90,
      currentRepNumber: 1,
      timestampMs: 1500,
    });

    // Aggregated observations count should be 1, not 2
    const observations = engine.getAggregatedObservations();
    expect(observations.find((o) => o.id === 'test-medium')?.count).toBe(1);
  });
});
