import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * QA-hardening R8: both-workout-views verification.
 *
 * Verified already-correct (pinned here + the PR #114 suites, which
 * run in the full gate): prefill order, dash-for-unset, tap-to-type,
 * the once-per-exercise "Log without weight?" prompt, no target
 * from 0 (tests/audit-phase1-zero-weight.test.ts).
 *
 * Real gap found and fixed: Finish had up to THREE simultaneously
 * visible entries (header + in-flow CTA + completion prompt), and
 * the in-flow ones were primary emerald even mid-workout. Now the
 * header Finish is the ONLY entry: secondary while sets remain,
 * promoted (emerald primary) when all sets are done, and the
 * in-flow Next/Finish slots render no Finish button at all (the
 * Playwright drive found the intermediate design's in-flow Finish
 * could sit below the fold at 320x568 — a promoted Finish the user
 * cannot see is worse than none).
 */

const aw = fs.readFileSync(
  path.join(process.cwd(), 'src/components/ActiveWorkoutScreen.tsx'),
  'utf8'
);
const toast = fs.readFileSync(
  path.join(process.cwd(), 'src/components/ui/Toast.tsx'),
  'utf8'
);

describe('R8: one Finish entry, promoted only when all sets are done', () => {
  it('derives allSetsDone from the session state', () => {
    expect(aw).toContain('const allSetsDone =');
    expect(aw).toContain("ex.sets.every((set) => isActiveSetCompleted(set) || set.status === 'skipped')");
  });

  it('the header Finish is always rendered and promotes when all sets are done', () => {
    expect(aw).toMatch(/allSetsDone\s*\?\s*'px-2\.5 py-1\.5 min-h-\[44px\] rounded-lg bg-emerald-500/);
    // No conditional wrapper hides it.
    expect(aw).not.toContain('inFlowFinishVisible');
  });

  it('no in-flow slot renders a Finish button', () => {
    // The only setIsFinishModalOpen(true) call sites left: the header
    // button, the ⋯ menu item (inside a closed menu — not on screen),
    // handleProceedNextSet (programmatic advance from the Set
    // Complete overlay, not a rendered entry), and the Set Complete
    // overlay's own muted 'End Workout' text link (tertiary, inside a
    // transient overlay).
    const sites = aw.match(/setIsFinishModalOpen\(true\)/g) ?? [];
    expect(sites.length).toBe(4);
    expect(aw).not.toContain('workout.finishWorkoutCaps');
  });
});

describe('R8: touch targets and always-visible set actions', () => {
  it('Advanced Complete Set toggle is 44x44 (w-11 h-11)', () => {
    expect(aw).toContain('w-11 h-11 sm:w-11 sm:h-11 rounded-full');
  });

  it('Beginner Skip/Complete live in a fixed bottom bar with safe-area padding', () => {
    expect(aw).toContain("workoutMode === 'beginner' && !showEffortPrompt && currentExercise");
    expect(aw).toContain("paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0px))'");
    expect(aw).toContain('handleCompleteActiveSet(activeSetIdx)');
  });

  it('Advanced rows carry min-height 44 inputs and per-row Skip/Complete', () => {
    expect(aw).toContain('rounded-xl px-1.5 sm:px-2 py-1.5 min-h-[44px]');
    expect(aw).toContain('handleToggleSetComplete(sIdx)');
    expect(aw).toContain('handleSkipSet(sIdx)');
  });
});

describe('R8: toasts sit above the bottom bar + safe area', () => {
  it('toast stack bottom offset is 6rem plus the safe-area inset', () => {
    expect(toast).toContain("bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))'");
    expect(toast).toContain('z-[100]');
  });
});
