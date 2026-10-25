/**
 * UX redesign Stage 10 — verification pins.
 *
 * Stage 10 found one filter-persistence gap (big-three lift selection
 * reset to Squat on every visit) and fixed it: the lift now persists in
 * the same local-only `ascend-progress-ranges` blob as the chart ranges.
 * These pins lock the fix and the audit results it closes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Stage 10 — filter persistence + single-source derivations', () => {
  it('big-three lift persists (local only, SSR-guarded, validated)', () => {
    const src = read('src/components/ProgressPage.tsx');
    expect(src).toContain("typeof window === 'undefined') return 'Squat';");
    expect(src).toContain("parsed.big3 === 'Bench Press' || parsed.big3 === 'Deadlift'");
    expect(src).toContain('big3: big3Lift');
    expect(src).toContain('[strengthTimeRange, bodyTimeRange, big3Lift]');
  });

  it('chart ranges persist per chart (local only)', () => {
    const src = read('src/components/ProgressPage.tsx');
    expect(src).toContain("readPersistedRange('strength', '3M')");
    expect(src).toContain("readPersistedRange('body', '3M')");
    expect(src).toContain("localStorage.setItem('ascend-progress-ranges'");
  });

  it('PRs come from one store source; e1RM and history from one function each', () => {
    const progress = read('src/components/ProgressPage.tsx');
    const prsPage = read('src/components/PRsPage.tsx');
    expect(progress).toContain('calculateOneRepMax');
    expect(progress).toContain('getExerciseHistorySessions');
    expect(prsPage).toContain('useStore');
    expect(progress).toContain('prs');
    // No second e1RM formula: the only 1RM calculator import is the shared one.
    expect(progress).not.toContain('brzycki');
    expect(progress).not.toContain('1.0278');
  });

  it("primary actions are never behind an expander (Today + Train + You)", () => {
    const home = read('src/components/HomePage.tsx');
    // The workout-card Start/Resume button is a direct full-width button.
    expect(home).toContain('handleStartWorkoutFromHome();');
    // The only CollapsibleDetails on Home are supplementary: card details,
    // why-lines, and (Simple) athlete facts — never the Start action.
    const labels = [...home.matchAll(/CollapsibleDetails label=\{t\('([^']+)'\)\}/g)].map((m) => m[1]);
    expect(labels.sort()).toEqual([
      'customize.athleteFacts',
      'home.details',
      'home.why',
      'home.why',
    ]);
    const settings = read('src/components/SettingsView.tsx');
    expect(settings).not.toContain('CollapsibleDetails');
  });
});
