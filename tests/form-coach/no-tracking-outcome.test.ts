import { describe, it, expect } from 'vitest';
import { resolveDetectionOutcome } from '@/features/form-coach/hooks/useFormCoach';

/**
 * D4: the end-of-analysis decision. "Never tracked" must route to the
 * explicit couldn't-track state (no summary saved, no empty report);
 * "tracked, but no valid reps" is an honest report.
 *
 * §30 (Phase 4): these cases ran against the legacy
 * resolveAnalysisOutcome; that function is deleted and the ONE
 * routing vocabulary is resolveDetectionOutcome. The tracking gate
 * is mode-independent, so the D4 cases map 1:1 (auto mode shown).
 */
describe('resolveDetectionOutcome (D4 tracking gate)', () => {
  const auto = { type: 'auto' as const };

  it('routes zero tracked frames to no-tracking, however long the stream', () => {
    expect(
      resolveDetectionOutcome({ stats: { framesProcessed: 0, framesTracked: 0 }, mode: auto, detection: 'unknown' }).kind,
    ).toBe('no-tracking');
    expect(
      resolveDetectionOutcome({ stats: { framesProcessed: 2, framesTracked: 0 }, mode: auto, detection: 'unknown' }).kind,
    ).toBe('no-tracking');
    expect(
      resolveDetectionOutcome({ stats: { framesProcessed: 300, framesTracked: 0 }, mode: auto, detection: 'unknown' }).kind,
    ).toBe('no-tracking');
  });

  it('routes a negligible tracked share of a long stream to no-tracking', () => {
    expect(
      resolveDetectionOutcome({ stats: { framesProcessed: 300, framesTracked: 3 }, mode: auto, detection: 'unknown' }).kind,
    ).toBe('no-tracking');
    expect(
      resolveDetectionOutcome({ stats: { framesProcessed: 227, framesTracked: 4 }, mode: auto, detection: 'unknown' }).kind,
    ).toBe('no-tracking');
  });

  it('routes genuinely tracked streams to the report, even with no valid reps', () => {
    // The owner's video: tracked on 214 of 227 frames.
    expect(
      resolveDetectionOutcome({ stats: { framesProcessed: 227, framesTracked: 214 }, mode: auto, detection: 'squat' }),
    ).toEqual({ kind: 'report', exerciseId: 'squat' });
    // Short clip, tracked throughout but no rep completed — with a
    // preset the report is the preset's, detection aside.
    expect(
      resolveDetectionOutcome({
        stats: { framesProcessed: 40, framesTracked: 40 },
        mode: { type: 'preset', exerciseId: 'squat' },
        detection: 'unknown',
      }),
    ).toEqual({ kind: 'report', exerciseId: 'squat' });
    // Sparse but real tracking on a short stream (above the 2% floor).
    expect(
      resolveDetectionOutcome({ stats: { framesProcessed: 100, framesTracked: 5 }, mode: auto, detection: 'squat' }).kind,
    ).toBe('report');
  });
});
