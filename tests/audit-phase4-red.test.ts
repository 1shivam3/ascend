/**
 * Audit Phase 4, Task 4.6 (P3-2) — red is reserved for errors and
 * destructive actions.
 *
 * Moved OFF red (none of these is an error):
 *  - Plan-vs-Actual "skipped" count and WorkoutPage SKIPPED badge +
 *    skipped-row tint: a neutral stat → warning token.
 *  - FeedbackModal's selected "bug" chip: a feedback CATEGORY, not
 *    an error state → accent tokens.
 *  - LogPastWorkoutModal's reports-pain flag: a caution marker →
 *    warning token (its delete hovers stay red — destructive).
 *  - VoiceWorkoutLogger's recording button: an active state →
 *    accent (the mic-DENIED icons stay rose — that IS an error).
 *  - ActiveWorkoutScreen's RPE "hard" (9.5) selector: the top of an
 *    intensity ramp (easy=green, good=accent) → warning token.
 * Kept red, pinned below so a future sweep doesn't "fix" them:
 * coach chat error texts, sync error banner, scan error box,
 * delete/reset surfaces, policy safety card, discard confirm.
 * The full remaining-red inventory with justifications lives in the
 * Phase 4 report.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('Phase 4.6 — non-error reds moved', () => {
  it('skipped counts/badges use the warning token', () => {
    const pva = read('src/components/PlanVsActualReview.tsx');
    expect(pva).not.toContain('text-rose-400');
    expect(pva).toContain('text-warning block mt-0.5');
    const wp = read('src/components/WorkoutPage.tsx');
    expect(wp).not.toContain('rose');
    expect(wp).toContain('bg-warning/20 text-warning');
    expect(wp).toContain('bg-warning/5 border-warning/20');
  });

  it('the feedback bug category is accent when selected, not red', () => {
    const fb = read('src/components/FeedbackModal.tsx');
    expect(fb).not.toContain('border-red-500');
    expect(fb).toContain('bg-accent/15 border-accent text-accent-text');
  });

  it('the reports-pain flag is warning; delete hovers stay red', () => {
    const lp = read('src/components/LogPastWorkoutModal.tsx');
    expect(lp).toContain("ex.reportsPain ? 'text-warning bg-warning/10'");
    expect(lp).toContain('hover:text-red-400'); // exercise/set delete — destructive
  });

  it('recording is accent; only the mic-denied error icons stay rose', () => {
    const vw = read('src/components/VoiceWorkoutLoggerModal.tsx');
    expect(vw).toContain('bg-accent text-accent-on shadow-lg shadow-accent/40');
    expect(vw).not.toContain('bg-rose-500');
    const roseLines = vw.split('\n').filter((l) => l.includes('text-rose-400'));
    expect(roseLines).toHaveLength(2);
    for (const l of roseLines) expect(l).toContain('MicOff');
  });

  it('RPE hard is warning, completing the green/accent/warning ramp', () => {
    const aw = read('src/components/ActiveWorkoutScreen.tsx');
    expect(aw).toContain("? 'bg-warning/20 border-warning text-warning'");
    expect(aw).toContain('bg-warning/15 text-warning');
    expect(aw).not.toContain('hover:border-danger/60');
  });
});

describe('Phase 4.6 — error/destructive reds kept', () => {
  it('error surfaces stay red', () => {
    expect(read('src/components/CoachChatSection.tsx')).toContain("text-red-500");
    expect(read('src/components/SyncErrorBanner.tsx')).toContain('bg-red-600');
    expect(read('src/components/ScanMealModal.tsx')).toContain('bg-red-500/10');
    expect(read('src/components/HistoryForkScreen.tsx')).toContain('text-red-500');
  });

  it('destructive surfaces stay red/rose', () => {
    expect(read('src/components/SettingsView.tsx')).toContain('text-rose-400');
    expect(read('src/components/DataVaultModal.tsx')).toContain('bg-rose-500/10');
    expect(read('src/components/PolicyDecisionCard.tsx')).toContain('bg-rose-500/10');
    expect(read('src/components/ActiveWorkoutScreen.tsx')).toContain('bg-danger/15 text-danger');
  });
});
