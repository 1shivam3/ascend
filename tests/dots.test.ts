import { describe, it, expect } from 'vitest';
import { calculateDOTS, getDOTSClassification, getBigThreeStats } from '../src/lib/dots';
import { PersonalRecord } from '../src/lib/types';

describe('DOTS Powerlifting Metric (calculateDOTS)', () => {
  it('calculates standard DOTS score for an 80kg male with 500kg total', () => {
    // 500kg total at 80kg bodyweight produces ~335-345 DOTS
    const dots = calculateDOTS(80, 500, 'male');
    expect(dots).toBeGreaterThan(320);
    expect(dots).toBeLessThan(360);
  });

  it('calculates standard DOTS score for a 60kg female with 350kg total', () => {
    const dots = calculateDOTS(60, 350, 'female');
    expect(dots).toBeGreaterThan(340);
    expect(dots).toBeLessThan(400);
  });

  it('clamps bodyweight to safety bounds (min 35kg, max 220kg)', () => {
    // Bodyweight below 35 is clamped to 35
    const dotsLow = calculateDOTS(20, 300, 'male');
    const dotsClamped = calculateDOTS(35, 300, 'male');
    expect(dotsLow).toBe(dotsClamped);

    // Bodyweight above 220 is clamped to 220
    const dotsHigh = calculateDOTS(250, 600, 'male');
    const dotsMax = calculateDOTS(220, 600, 'male');
    expect(dotsHigh).toBe(dotsMax);
  });

  it('handles invalid inputs returning 0', () => {
    expect(calculateDOTS(0, 500, 'male')).toBe(0);
    expect(calculateDOTS(-80, 500, 'male')).toBe(0);
    expect(calculateDOTS(80, 0, 'male')).toBe(0);
    expect(calculateDOTS(80, -500, 'male')).toBe(0);
  });

  it('maps DOTS scores to correct classification tiers', () => {
    expect(getDOTSClassification(580).tier).toBe('WORLD CLASS');
    expect(getDOTSClassification(510).tier).toBe('ELITE');
    expect(getDOTSClassification(450).tier).toBe('NATIONAL CLASS');
    expect(getDOTSClassification(380).tier).toBe('REGIONAL CLASS');
    expect(getDOTSClassification(310).tier).toBe('INTERMEDIATE');
    expect(getDOTSClassification(250).tier).toBe('DEVELOPING');
  });

  it('extracts Big 3 Stats and detects missing lifts from PR array', () => {
    const prs: PersonalRecord[] = [
      { id: '1', exercise: 'Bench Press', weightKg: 100, weightLbs: 220, reps: 1, oneRepMax: 100, date: '2026-10-01' },
      { id: '2', exercise: 'Squat', weightKg: 140, weightLbs: 308, reps: 1, oneRepMax: 140, date: '2026-10-01' },
    ];

    const stats = getBigThreeStats(prs);
    expect(stats.benchMax).toBe(100);
    expect(stats.squatMax).toBe(140);
    expect(stats.deadliftMax).toBe(0);
    expect(stats.totalKg).toBe(240);
    expect(stats.isComplete).toBe(false);
    expect(stats.missingLifts).toContain('Deadlift');

    // Add deadlift to make it complete
    const completePrs: PersonalRecord[] = [
      ...prs,
      { id: '3', exercise: 'Deadlift', weightKg: 180, weightLbs: 396, reps: 1, oneRepMax: 180, date: '2026-10-01' },
    ];
    const completeStats = getBigThreeStats(completePrs);
    expect(completeStats.isComplete).toBe(true);
    expect(completeStats.totalKg).toBe(420);
    expect(completeStats.missingLifts.length).toBe(0);
  });
});
