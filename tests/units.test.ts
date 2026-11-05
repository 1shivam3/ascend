/**
 * Item-4 fix (2026-11-05): units consolidation + ProgressChart volume unit.
 *
 * lib/units.ts is now the single source of truth for kg ↔ lbs. The
 * canonical convention is MULTIPLY both ways (kg→lbs ×2.20462,
 * lbs→kg ×0.453592) — the form ~97 of the 101 migrated call sites
 * already used. Four sites divided by 2.20462 instead; these tests pin
 * that the unified lbsToKg stays within display precision (0.1) of the
 * old division across the whole working range, and that round-trips
 * kg→lbs→kg / lbs→kg→lbs never drift beyond that same 0.1 grid.
 *
 * ProgressChart: the volume series used to be built with a hardcoded
 * 'kg' session normalization while every label rendered profile.unit —
 * lbs users saw kg magnitudes labelled lbs. The chart now passes
 * userUnit through; the lifter-twin behavior test below pins what that
 * means numerically (a kg-logged session read as lbs carries lbs
 * magnitudes for volume, best weight and e1RM alike).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  KG_TO_LBS,
  LBS_TO_KG,
  convertWeight,
  kgToLbs,
  lbsToKg,
  normalizeWeightToKg,
} from '../src/lib/units';
import {
  LBS_TO_KG as ADHERENCE_LBS_TO_KG,
  KG_TO_LBS as ADHERENCE_KG_TO_LBS,
  convertWeight as adherenceConvertWeight,
  normalizeWeightToKg as adherenceNormalizeWeightToKg,
} from '../src/lib/workout-adherence';
import { getExerciseHistorySessions } from '../src/lib/lifter-twin';
import type { WorkoutEntry } from '../src/lib/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('units constants and converters', () => {
  it('exposes the canonical factors', () => {
    expect(KG_TO_LBS).toBe(2.20462);
    expect(LBS_TO_KG).toBe(0.453592);
    expect(kgToLbs(1)).toBe(2.20462);
    expect(lbsToKg(1)).toBe(0.453592);
  });

  it('multiply convention matches the legacy inline formulas exactly', () => {
    for (let kg = 0; kg <= 5000; kg += 7.3) {
      expect(kgToLbs(kg)).toBe(kg * 2.20462);
      expect(lbsToKg(kg)).toBe(kg * 0.453592);
    }
  });

  it('unified lbsToKg stays within display precision of the old divide-by-2.20462 sites', () => {
    // Across the app's real range (PR cap 500 kg ≈ 1102 lbs) the two
    // forms agree to ~0.001 kg — two orders below display rounding.
    for (let lbs = 0; lbs <= 1102; lbs += 3.7) {
      const oldForm = lbs / 2.20462;
      expect(Math.abs(lbsToKg(lbs) - oldForm)).toBeLessThan(0.002);
    }
    // Even at absurd loads the 1-dp rounded results never differ by
    // more than one grid step.
    for (let lbs = 0; lbs <= 11000; lbs += 3.7) {
      const oldForm = lbs / 2.20462;
      const a = Math.round(lbsToKg(lbs) * 10);
      const b = Math.round(oldForm * 10);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    }
  });

  it('round-trips within display precision across the working range', () => {
    for (let kg10 = 0; kg10 <= 5000; kg10 += 1) {
      const kg = kg10 / 10;
      const back = lbsToKg(kgToLbs(kg));
      expect(Math.abs(back - kg)).toBeLessThan(0.01);
    }
    for (let lbs10 = 0; lbs10 <= 11000; lbs10 += 1) {
      const lbs = lbs10 / 10;
      const back = kgToLbs(lbsToKg(lbs));
      expect(Math.abs(back - lbs)).toBeLessThan(0.05);
    }
  });

  it('convertWeight / normalizeWeightToKg semantics are unchanged', () => {
    expect(convertWeight(100, 'kg', 'kg')).toBe(100);
    expect(convertWeight(100, 'lbs', 'lbs')).toBe(100);
    expect(convertWeight(100, 'kg', 'lbs')).toBe(kgToLbs(100));
    expect(convertWeight(100, 'lbs', 'kg')).toBe(lbsToKg(100));
    expect(normalizeWeightToKg(100, 'kg')).toBe(100);
    expect(normalizeWeightToKg(100, 'lbs')).toBe(lbsToKg(100));
    expect(normalizeWeightToKg(-5, 'lbs')).toBe(0); // negative clamp (bodyweight guard)
  });

  it('workout-adherence re-exports the same canonical helpers', () => {
    expect(ADHERENCE_LBS_TO_KG).toBe(LBS_TO_KG);
    expect(ADHERENCE_KG_TO_LBS).toBe(KG_TO_LBS);
    expect(adherenceConvertWeight(80, 'kg', 'lbs')).toBe(convertWeight(80, 'kg', 'lbs'));
    expect(adherenceConvertWeight(176, 'lbs', 'kg')).toBe(convertWeight(176, 'lbs', 'kg'));
    expect(adherenceNormalizeWeightToKg(-1, 'kg')).toBe(normalizeWeightToKg(-1, 'kg'));
    expect(adherenceNormalizeWeightToKg(176, 'lbs')).toBe(normalizeWeightToKg(176, 'lbs'));
  });
});

describe('no inline conversion literals remain in src', () => {
  it('the raw factors appear only in lib/units.ts', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (/2\.20462|0\.453592/.test(text)) {
            hits.push(path.relative(process.cwd(), full));
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(hits).toEqual(['src/lib/units.ts']);
  });
});

describe('ProgressChart volume unit', () => {
  it('the chart normalizes sessions in the profile unit, not hardcoded kg', () => {
    const chart = read('src/components/ProgressChart.tsx');
    expect(chart).toContain('getExerciseHistorySessions(selectedExercise, workouts || [], userUnit, { exact: true })');
    expect(chart).not.toContain("'kg', { exact: true }");
  });

  it('lbs sessions carry lbs magnitudes for volume, best weight and e1RM', () => {
    const workouts: WorkoutEntry[] = [
      {
        id: 'w1',
        date: '2026-11-01T10:00:00.000Z',
        name: 'Bench day',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 100, reps: 5, unit: 'kg', status: 'completed' },
              { weight: 100, reps: 5, unit: 'kg', status: 'completed' },
            ],
          },
        ],
      } as unknown as WorkoutEntry,
    ];
    const kgSessions = getExerciseHistorySessions('Bench Press', workouts, 'kg', { exact: true });
    const lbsSessions = getExerciseHistorySessions('Bench Press', workouts, 'lbs', { exact: true });
    expect(kgSessions).toHaveLength(1);
    expect(lbsSessions).toHaveLength(1);
    expect(kgSessions[0].totalVolume).toBe(1000);
    // 100 kg at 1-dp = 220.5 lbs per set → volume 220.5 × 10 reps.
    expect(lbsSessions[0].totalVolume).toBeCloseTo(2205, 5);
    expect(lbsSessions[0].bestWeight).toBeCloseTo(220.5, 5);
    expect(lbsSessions[0].bestE1RM).toBeGreaterThan(kgSessions[0].bestE1RM);
  });
});
