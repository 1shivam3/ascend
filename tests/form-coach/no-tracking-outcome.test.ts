import { describe, it, expect } from 'vitest';
import { resolveAnalysisOutcome } from '@/features/form-coach/hooks/useFormCoach';

/**
 * D4: the end-of-analysis decision. "Never tracked" must route to the
 * explicit couldn't-track state (no summary saved, no empty report);
 * "tracked, but no valid reps" is an honest report.
 */
describe('resolveAnalysisOutcome (D4)', () => {
  it('routes zero tracked frames to no-tracking, however long the stream', () => {
    expect(resolveAnalysisOutcome({ framesProcessed: 0, framesTracked: 0 })).toBe('no-tracking');
    expect(resolveAnalysisOutcome({ framesProcessed: 2, framesTracked: 0 })).toBe('no-tracking');
    expect(resolveAnalysisOutcome({ framesProcessed: 300, framesTracked: 0 })).toBe('no-tracking');
  });

  it('routes a negligible tracked share of a long stream to no-tracking', () => {
    expect(resolveAnalysisOutcome({ framesProcessed: 300, framesTracked: 3 })).toBe('no-tracking');
    expect(resolveAnalysisOutcome({ framesProcessed: 227, framesTracked: 4 })).toBe('no-tracking');
  });

  it('routes genuinely tracked streams to the report, even with no valid reps', () => {
    // The owner's video: tracked on 214 of 227 frames.
    expect(resolveAnalysisOutcome({ framesProcessed: 227, framesTracked: 214 })).toBe('report');
    // Short clip, tracked throughout but no rep completed.
    expect(resolveAnalysisOutcome({ framesProcessed: 40, framesTracked: 40 })).toBe('report');
    // Sparse but real tracking on a short stream (above the 2% floor).
    expect(resolveAnalysisOutcome({ framesProcessed: 100, framesTracked: 5 })).toBe('report');
  });
});
