import { describe, it, expect } from 'vitest';
import {
  calculateWorkoutAdherence,
  compareSetAdherence,
} from '@/lib/workout-adherence';
import {
  formatRepComparison,
  formatLoadComparison,
  formatRpeComparison,
  getSetStatusBadge,
  formatSetCompletionSummary,
  formatSetCount,
} from '@/lib/workout-adherence-presentation';
import { WorkoutEntry, WorkoutSet } from '@/lib/types';

describe('Workout Adherence Presentation & Review Formatting (workout-adherence-presentation.ts)', () => {
  // ─── Case 1: Fully completed workout whose actual sets match every target ───
  describe('Case 1: Fully completed workout matching every target', () => {
    it('formats reps, load, and RPE with neutral 0 difference when targets are met exactly', () => {
      const workout: WorkoutEntry = {
        id: 'w-case-1',
        date: '2026-10-13T10:00:00Z',
        exercises: [
          {
            name: 'Barbell Back Squat',
            sets: [
              {
                prescribedWeight: 100,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
                weight: 100,
                reps: 8,
                unit: 'kg',
                rpe: 8,
                status: 'completed',
                completed: true,
              },
            ],
          },
        ],
      };

      const summary = calculateWorkoutAdherence(workout);
      expect(summary.hasPrescriptionData).toBe(true);
      expect(summary.totalPrescribedSets).toBe(1);
      expect(summary.completedPrescribedSets).toBe(1);
      expect(summary.setCompletionPercentage).toBe(100);

      const comp = summary.setComparisons[0];
      expect(formatRepComparison(comp)).toBe('8 planned → 8 actual (0 difference)');
      expect(formatLoadComparison(comp)).toBe('100 kg planned → 100 kg actual (0 difference)');
      expect(formatRpeComparison(comp)).toBe('@8 planned → @8 actual (0 difference)');

      const badge = getSetStatusBadge(comp);
      expect(badge.label).toBe('COMPLETED');
      expect(badge.variant).toBe('completed');

      const completionSummary = formatSetCompletionSummary(summary);
      expect(completionSummary.hasPrescription).toBe(true);
      expect(completionSummary.completionRateFormatted).toBe('100%');
      expect(completionSummary.detailText).toBe('1 of 1 prescribed set completed');
    });
  });

  // ─── Case 2: Workout containing completed, skipped, and unattempted sets ─────
  describe('Case 2: Workout containing completed, skipped, and unattempted sets', () => {
    it('preserves planned values without showing deltas for skipped and unattempted sets', () => {
      const workout: WorkoutEntry = {
        id: 'w-case-2',
        date: '2026-10-13T10:00:00Z',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              {
                prescribedWeight: 80,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
                weight: 80,
                reps: 8,
                unit: 'kg',
                rpe: 8,
                status: 'completed',
                completed: true,
              },
              {
                prescribedWeight: 80,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8.5,
                weight: 80,
                reps: 8,
                unit: 'kg',
                status: 'skipped',
                completed: false,
              },
              {
                prescribedWeight: 80,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 9,
                weight: 80,
                reps: 8,
                unit: 'kg',
                status: 'not_attempted',
                completed: false,
              },
            ],
          },
        ],
      };

      const summary = calculateWorkoutAdherence(workout);
      expect(summary.totalPrescribedSets).toBe(3);
      expect(summary.completedPrescribedSets).toBe(1);
      expect(summary.skippedPrescribedSets).toBe(1);
      expect(summary.notAttemptedPrescribedSets).toBe(1);
      expect(summary.setCompletionPercentage).toBe(33.3);

      const [completedSet, skippedSet, unattemptedSet] = summary.setComparisons;

      // Completed set shows deltas
      expect(formatRepComparison(completedSet)).toBe('8 planned → 8 actual (0 difference)');
      expect(getSetStatusBadge(completedSet).label).toBe('COMPLETED');

      // Skipped set shows planned target ONLY (never deltas!)
      expect(formatRepComparison(skippedSet)).toBe('8 planned');
      expect(formatLoadComparison(skippedSet)).toBe('80 kg planned');
      expect(formatRpeComparison(skippedSet)).toBe('@8.5 planned');
      expect(getSetStatusBadge(skippedSet).label).toBe('SKIPPED');
      expect(getSetStatusBadge(skippedSet).variant).toBe('skipped');

      // Not attempted set shows planned target ONLY (never deltas!)
      expect(formatRepComparison(unattemptedSet)).toBe('8 planned');
      expect(formatLoadComparison(unattemptedSet)).toBe('80 kg planned');
      expect(formatRpeComparison(unattemptedSet)).toBe('@9 planned');
      expect(getSetStatusBadge(unattemptedSet).label).toBe('NOT ATTEMPTED');
      expect(getSetStatusBadge(unattemptedSet).variant).toBe('not_attempted');
    });
  });

  // ─── Case 3: Completed set whose actual load differs from its prescription ──
  describe('Case 3: Completed set whose actual load differs from prescription', () => {
    it('formats positive and negative load deltas correctly with units', () => {
      // Over-target: 95 kg planned -> 100 kg actual (+5 kg)
      const overSet: WorkoutSet = {
        prescribedWeight: 95,
        prescribedReps: 8,
        prescribedUnit: 'kg',
        weight: 100,
        reps: 8,
        unit: 'kg',
        status: 'completed',
        completed: true,
      };
      const overComp = compareSetAdherence(overSet, 'Overhead Press', 0);
      expect(formatLoadComparison(overComp)).toBe('95 kg planned → 100 kg actual (+5 kg)');

      // Under-target: 100 kg planned -> 90 kg actual (-10 kg)
      const underSet: WorkoutSet = {
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg',
        weight: 90,
        reps: 8,
        unit: 'kg',
        status: 'completed',
        completed: true,
      };
      const underComp = compareSetAdherence(underSet, 'Overhead Press', 1);
      expect(formatLoadComparison(underComp)).toBe('100 kg planned → 90 kg actual (-10 kg)');

      // Reps and RPE deltas: 8 planned -> 10 actual (+2 reps), @8 planned -> @9 actual (+1 RPE)
      const repRpeSet: WorkoutSet = {
        prescribedReps: 8,
        prescribedWeight: 80,
        prescribedUnit: 'kg',
        prescribedRpe: 8,
        reps: 10,
        weight: 80,
        unit: 'kg',
        rpe: 9,
        status: 'completed',
        completed: true,
      };
      const repRpeComp = compareSetAdherence(repRpeSet, 'Deadlift', 2);
      expect(formatRepComparison(repRpeComp)).toBe('8 planned → 10 actual (+2 reps)');
      expect(formatRpeComparison(repRpeComp)).toBe('@8 planned → @9 actual (+1 RPE)');
    });

    it('respects engine cross-unit conversion between kg and lbs', () => {
      // Prescribed in lbs, actual performed in kg
      // 220.462 lbs (~100 kg) planned -> 105 kg actual (~231.49 lbs -> delta ~ +11.02 lbs)
      const crossUnitSet: WorkoutSet = {
        prescribedWeight: 220,
        prescribedUnit: 'lbs',
        prescribedReps: 5,
        weight: 105,
        unit: 'kg',
        reps: 5,
        status: 'completed',
        completed: true,
      };
      const comp = compareSetAdherence(crossUnitSet, 'Squat', 0);
      const formatted = formatLoadComparison(comp);
      expect(formatted).toContain('220 lbs planned → 105 kg actual');
      expect(formatted).toMatch(/\(\+[\d.]+ lbs\)/);
    });
  });

  // ─── Case 4: An extra completed set ─────────────────────────────────────────
  describe('Case 4: An extra completed set', () => {
    it('distinguishes extra sets from prescribed sets clearly with badges and labels', () => {
      const workout: WorkoutEntry = {
        id: 'w-case-4',
        date: '2026-10-13T10:00:00Z',
        exercises: [
          {
            name: 'Barbell Row',
            sets: [
              {
                prescribedWeight: 70,
                prescribedReps: 10,
                prescribedUnit: 'kg',
                weight: 70,
                reps: 10,
                unit: 'kg',
                status: 'completed',
                completed: true,
              },
              // Extra set added during session without prescription
              {
                weight: 75,
                reps: 8,
                unit: 'kg',
                rpe: 9,
                status: 'completed',
                completed: true,
              },
            ],
          },
        ],
      };

      const summary = calculateWorkoutAdherence(workout);
      expect(summary.totalPrescribedSets).toBe(1);
      expect(summary.completedPrescribedSets).toBe(1);
      expect(summary.extraCompletedSets).toBe(1);
      expect(summary.setCompletionPercentage).toBe(100);

      const extraComp = summary.setComparisons[1];
      expect(extraComp.isPrescribed).toBe(false);
      expect(extraComp.isCompleted).toBe(true);

      const badge = getSetStatusBadge(extraComp);
      expect(badge.label).toBe('EXTRA SET');
      expect(badge.variant).toBe('extra');

      expect(formatRepComparison(extraComp)).toBe('8 reps (extra)');
      expect(formatLoadComparison(extraComp)).toBe('75 kg (extra)');
      expect(formatRpeComparison(extraComp)).toBe('@9 actual (extra)');
    });
  });

  // ─── Case 5: A manually logged workout without prescription data ────────────
  describe('Case 5: Manually logged workout without prescription data', () => {
    it('does not display 0% completion and provides neutral unavailable feedback', () => {
      const workout: WorkoutEntry = {
        id: 'w-case-5',
        date: '2026-10-13T10:00:00Z',
        exercises: [
          {
            name: 'Incline Dumbbell Press',
            sets: [
              { weight: 30, reps: 10, unit: 'kg', completed: true },
              { weight: 30, reps: 10, unit: 'kg', completed: true },
              { weight: 32, reps: 8, unit: 'kg', completed: true },
            ],
          },
        ],
      };

      const summary = calculateWorkoutAdherence(workout);
      expect(summary.hasPrescriptionData).toBe(false);
      expect(summary.totalPrescribedSets).toBe(0);
      expect(summary.setCompletionRate).toBeNull();
      expect(summary.setCompletionPercentage).toBeNull();

      const completionSummary = formatSetCompletionSummary(summary);
      expect(completionSummary.hasPrescription).toBe(false);
      expect(completionSummary.completionRateFormatted).toBeNull();
      expect(completionSummary.completionRateFormatted).not.toBe('0%');
      expect(completionSummary.detailText).toBe('Manually logged session — no prescribed targets recorded');
    });
  });

  // ─── Case 6: Missing actual reps, load units, or RPE ────────────────────────
  describe('Case 6: Missing actual reps, load units, or RPE', () => {
    it('displays planned target and neutral missing indicator without coercing to zero', () => {
      // Set prescribed with reps, weight, RPE, but athlete completed without logging reps or weight
      const setWithMissingActuals: WorkoutSet = {
        prescribedWeight: 100,
        prescribedUnit: 'kg',
        prescribedReps: 5,
        prescribedRpe: 8,
        status: 'completed',
        completed: true,
      };

      const comp = compareSetAdherence(setWithMissingActuals, 'Deadlift', 0);
      expect(comp.repDelta).toBeNull();
      expect(comp.loadDelta).toBeNull();
      expect(comp.rpeDelta).toBeNull();

      expect(formatRepComparison(comp)).toBe('5 planned → — actual');
      expect(formatLoadComparison(comp)).toBe('100 kg planned → — actual');
      expect(formatRpeComparison(comp)).toBe('@8 planned → — actual');

      // Set prescribed with only RPE (partial prescription)
      const rpeOnlySet: WorkoutSet = {
        prescribedRpe: 8,
        rpe: 8.5,
        reps: 10,
        weight: 60,
        unit: 'kg',
        status: 'completed',
        completed: true,
      };
      const rpeOnlyComp = compareSetAdherence(rpeOnlySet, 'Pushups', 1);
      expect(formatRpeComparison(rpeOnlyComp)).toBe('@8 planned → @8.5 actual (+0.5 RPE)');
      // Reps was unprescribed, so load/rep comparisons reflect unprescribed status
      expect(formatRepComparison(rpeOnlyComp)).toBe('10 actual (unprescribed reps)');
      expect(formatLoadComparison(rpeOnlyComp)).toBe('60 kg actual (unprescribed load)');
    });
  });

  // ─── Case 7: Workout with zero completed sets ───────────────────────────────
  describe('Case 7: Workout with zero completed sets', () => {
    it('correctly calculates 0% completion rate when denominator is known, without showing deltas', () => {
      const workout: WorkoutEntry = {
        id: 'w-case-7',
        date: '2026-10-13T10:00:00Z',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [
              {
                prescribedWeight: 50,
                prescribedReps: 5,
                prescribedUnit: 'kg',
                status: 'not_attempted',
                completed: false,
              },
              {
                prescribedWeight: 50,
                prescribedReps: 5,
                prescribedUnit: 'kg',
                status: 'skipped',
                completed: false,
              },
            ],
          },
        ],
      };

      const summary = calculateWorkoutAdherence(workout);
      expect(summary.hasPrescriptionData).toBe(true);
      expect(summary.totalPrescribedSets).toBe(2);
      expect(summary.completedPrescribedSets).toBe(0);
      expect(summary.skippedPrescribedSets).toBe(1);
      expect(summary.notAttemptedPrescribedSets).toBe(1);
      expect(summary.setCompletionPercentage).toBe(0);

      const completionSummary = formatSetCompletionSummary(summary);
      expect(completionSummary.hasPrescription).toBe(true);
      expect(completionSummary.completionRateFormatted).toBe('0%');
      expect(completionSummary.detailText).toBe('0 of 2 prescribed sets completed');

      // Both sets show planned targets without deltas
      const [s1, s2] = summary.setComparisons;
      expect(formatRepComparison(s1)).toBe('5 planned');
      expect(formatLoadComparison(s1)).toBe('50 kg planned');
      expect(formatRepComparison(s2)).toBe('5 planned');
      expect(formatLoadComparison(s2)).toBe('50 kg planned');
    });
  });

  // ─── Case 8: A legacy workout with no explicit prescriptions ────────────────
  describe('Case 8: Legacy workout with no explicit prescriptions', () => {
    it('treats legacy sets as unprescribed without showing false 0% adherence', () => {
      const workout: WorkoutEntry = {
        id: 'legacy-w-1',
        date: '2024-01-01T12:00:00Z',
        exercises: [
          {
            name: 'Pull-up',
            sets: [
              { weight: 0, reps: 10, unit: 'kg', completed: true },
              { weight: 0, reps: 8, unit: 'kg', completed: true },
            ],
          },
        ],
      };

      const summary = calculateWorkoutAdherence(workout);
      expect(summary.hasPrescriptionData).toBe(false);
      expect(summary.totalPrescribedSets).toBe(0);
      expect(summary.setCompletionRate).toBeNull();
      expect(summary.setCompletionPercentage).toBeNull();
      expect(summary.extraCompletedSets).toBe(2);

      const completionSummary = formatSetCompletionSummary(summary);
      expect(completionSummary.hasPrescription).toBe(false);
      expect(completionSummary.completionRateFormatted).toBeNull();
      expect(completionSummary.completionRateFormatted).not.toBe('0%');
      expect(completionSummary.detailText).toBe('Manually logged session — no prescribed targets recorded');
    });
  });

  // ─── Additional Semantics: Bodyweight 0 kg & Warm-up set preservation ───────
  describe('Bodyweight (0 kg) and Warmup preservation', () => {
    it('handles explicit 0 kg prescribed load correctly', () => {
      const bwSet: WorkoutSet = {
        prescribedWeight: 0,
        prescribedUnit: 'kg',
        prescribedReps: 10,
        weight: 0,
        unit: 'kg',
        reps: 10,
        status: 'completed',
        completed: true,
      };
      const comp = compareSetAdherence(bwSet, 'Pull-ups', 0);
      expect(formatLoadComparison(comp)).toBe('0 kg planned → 0 kg actual (0 difference)');
    });

    it('preserves warmup set status without reclassification', () => {
      const warmupSet: WorkoutSet = {
        isWarmup: true,
        prescribedWeight: 40,
        prescribedUnit: 'kg',
        prescribedReps: 10,
        weight: 40,
        unit: 'kg',
        reps: 10,
        status: 'completed',
        completed: true,
      };
      const comp = compareSetAdherence(warmupSet, 'Bench Press', 0);
      expect(comp.isWarmup).toBe(true);
      expect(comp.isCompleted).toBe(true);
      expect(formatRepComparison(comp)).toBe('10 planned → 10 actual (0 difference)');
    });
  });

  // ─── Set Count Grammatical Pluralization ──────────────────────────────────
  describe('Grammatical Pluralization (formatSetCount)', () => {
    it('formats singular and plural labels correctly without producing "1 sets"', () => {
      expect(formatSetCount(0)).toBe('0 sets');
      expect(formatSetCount(1)).toBe('1 set');
      expect(formatSetCount(2)).toBe('2 sets');
      expect(formatSetCount(5)).toBe('5 sets');
    });

    it('formats completion summary detail text with proper singular/plural set word', () => {
      const singleSetSummary = {
        hasPrescriptionData: true,
        totalPrescribedSets: 1,
        completedPrescribedSets: 1,
        skippedPrescribedSets: 0,
        notAttemptedPrescribedSets: 0,
        extraCompletedSets: 0,
        setCompletionRate: 1,
        setCompletionPercentage: 100,
        exercises: [],
        setComparisons: [],
      };
      const formatted = formatSetCompletionSummary(singleSetSummary);
      expect(formatted.detailText).toBe('1 of 1 prescribed set completed');
    });
  });
});
