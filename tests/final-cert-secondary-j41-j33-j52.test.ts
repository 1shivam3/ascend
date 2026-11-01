/**
 * Final-cert secondary items — all three had unambiguous sites + root
 * causes, so all three are fixed:
 *
 * J4.1: the Progress Personal Records list tile showed an estimated
 *       1RM as a bare number while the charts label it "est.". The
 *       tile now renders the same estimatedShort badge whenever
 *       computeCoreLifts flags the value as an estimate (multi-rep PR
 *       or workout-derived); a performed 1-rep PR gets no badge.
 * J3.3: protein-remaining differed Fuel (80 g) vs Today (79 g) for the
 *       same state. Home fed getProteinGapSuggestion the
 *       DISPLAY-ROUNDED logged protein (126 − 47 = 79); Fuel passes
 *       the raw value and the helper rounds the gap (126 − 46.5 → 80).
 *       Home now passes the unrounded proteinExact.
 * J5.2: after reverting from a custom accent to a preset, the
 *       custom-accent field kept showing the old hex in-session —
 *       draftHex is local state initialized once and was never synced
 *       on preset selection / theme reset. Both paths now clear it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeCoreLifts } from '../src/lib/core-lifts';
import { getProteinGapSuggestion } from '../src/lib/nutrition-coach';
import type { PersonalRecord } from '../src/lib/types';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

function pr(exercise: string, oneRepMax: number, reps: number): PersonalRecord {
  return {
    id: 'pr-x',
    exercise,
    weightKg: oneRepMax,
    weightLbs: Math.round(oneRepMax * 2.20462),
    reps,
    oneRepMax,
    date: '2026-10-20',
  } as PersonalRecord;
}

describe('final-cert J4.1: est. provenance for the PR list tile', () => {
  it('a workout-derived / multi-rep value is an estimate; a performed single is not', () => {
    const multi = computeCoreLifts([pr('Bench Press', 31, 12)], []);
    expect(multi.find((l) => l.name === 'Bench Press')!.isEstimate).toBe(true);
    const single = computeCoreLifts([pr('Bench Press', 100, 1)], []);
    expect(single.find((l) => l.name === 'Bench Press')!.isEstimate).toBe(false);
  });

  it('the tile renders the estimatedShort badge only for estimates', () => {
    const src = read('src/components/ProgressPage.tsx');
    expect(src).toContain('{lift.isEstimate && (');
    expect(src).toContain("t('common.estimatedShort')");
  });
});

describe('final-cert J3.3: one protein-gap rounding path', () => {
  const input = { diet: 'non_vegetarian' as const, proteinTargetG: 126, hour: 18 };

  it('raw logged protein (the Fuel path) → gap 80 for 46.5 g logged', () => {
    const s = getProteinGapSuggestion({ ...input, proteinLoggedG: 46.5 });
    expect(s?.gapG).toBe(80);
  });

  it('the old Home path (pre-rounded 47) produced 79 — the divergence being fixed', () => {
    const s = getProteinGapSuggestion({ ...input, proteinLoggedG: 47 });
    expect(s?.gapG).toBe(79);
  });

  it('Home now feeds the suggestion the unrounded proteinExact', () => {
    const src = read('src/components/HomePage.tsx');
    expect(src).toContain('proteinExact: macros.proteinG');
    expect(src).toContain('proteinLoggedG: fuelStats.proteinExact');
    expect(src).not.toContain('proteinLoggedG: fuelStats.protein,');
  });
});

describe('final-cert J5.2: custom-accent draft syncs on revert', () => {
  it('preset selection and theme reset both clear draftHex', () => {
    const src = read('src/components/SettingsView.tsx');
    const presetIdx = src.indexOf('const handleSelectPreset');
    const resetIdx = src.indexOf('const handleResetTheme');
    expect(src.slice(presetIdx, presetIdx + 500)).toContain("setDraftHex('')");
    expect(src.slice(resetIdx, resetIdx + 600)).toContain("setDraftHex('')");
  });
});
