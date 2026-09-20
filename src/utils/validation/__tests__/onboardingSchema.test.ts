import { describe, it, expect } from 'vitest';
import {
  ageSchema,
  heightCmSchema,
  weightKgSchema,
  goalSchema,
  experienceSchema,
  frequencySchema,
  durationSchema,
  equipmentSchema,
  locationSchema,
  usernameSchema,
  onboardingSchema,
  validateField,
  cmToFtIn,
  ftInToCm,
  kgToLbs,
  lbsToKg,
} from '../onboardingSchema';

describe('Onboarding Zod Validation & Conversion Invariants', () => {
  describe('Age Validation', () => {
    it('accepts valid athlete age between 13 and 100', () => {
      expect(validateField(ageSchema, 24).isValid).toBe(true);
      expect(validateField(ageSchema, 13).isValid).toBe(true);
      expect(validateField(ageSchema, 100).isValid).toBe(true);
    });

    it('rejects age below 13 with specific message', () => {
      const res = validateField(ageSchema, 12);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Age must be at least 13 years');
    });

    it('rejects age above 100', () => {
      const res = validateField(ageSchema, 105);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Age must be 100 years or less');
    });

    it('rejects non-integer or negative ages', () => {
      expect(validateField(ageSchema, 25.5).isValid).toBe(false);
      expect(validateField(ageSchema, -5).isValid).toBe(false);
    });
  });

  describe('Height Validation', () => {
    it('accepts valid height between 100 cm and 250 cm', () => {
      expect(validateField(heightCmSchema, 178).isValid).toBe(true);
      expect(validateField(heightCmSchema, 100).isValid).toBe(true);
      expect(validateField(heightCmSchema, 250).isValid).toBe(true);
    });

    it('rejects height below 100 cm', () => {
      const res = validateField(heightCmSchema, 95);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Height must be at least 100 cm');
    });

    it('rejects height above 250 cm', () => {
      const res = validateField(heightCmSchema, 255);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Height must be 250 cm');
    });
  });

  describe('Weight Validation', () => {
    it('accepts valid weight between 30 kg and 350 kg', () => {
      expect(validateField(weightKgSchema, 82.5).isValid).toBe(true);
      expect(validateField(weightKgSchema, 30).isValid).toBe(true);
      expect(validateField(weightKgSchema, 350).isValid).toBe(true);
    });

    it('rejects weight below 30 kg', () => {
      const res = validateField(weightKgSchema, 25);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Weight must be at least 30 kg');
    });

    it('rejects weight above 350 kg', () => {
      const res = validateField(weightKgSchema, 360);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Weight must be 350 kg');
    });
  });

  describe('Training Frequency & Duration Validation', () => {
    it('accepts training frequency between 2 and 6 days', () => {
      expect(validateField(frequencySchema, 3).isValid).toBe(true);
      expect(validateField(frequencySchema, 5).isValid).toBe(true);
    });

    it('rejects training frequency < 2 days or > 6 days', () => {
      expect(validateField(frequencySchema, 1).isValid).toBe(false);
      expect(validateField(frequencySchema, 7).isValid).toBe(false);
    });

    it('accepts session duration between 20 and 180 minutes', () => {
      expect(validateField(durationSchema, 60).isValid).toBe(true);
      expect(validateField(durationSchema, 45).isValid).toBe(true);
    });

    it('rejects duration outside allowable range', () => {
      expect(validateField(durationSchema, 15).isValid).toBe(false);
      expect(validateField(durationSchema, 200).isValid).toBe(false);
    });
  });

  describe('Equipment & Selection Validation', () => {
    it('requires at least 1 equipment type', () => {
      expect(validateField(equipmentSchema, []).isValid).toBe(false);
      expect(validateField(equipmentSchema, ['BARBELL']).isValid).toBe(true);
    });

    it('validates athletic goal and experience tiers', () => {
      expect(validateField(goalSchema, 'BUILD_STRENGTH').isValid).toBe(true);
      expect(validateField(goalSchema, 'INVALID_GOAL').isValid).toBe(false);

      expect(validateField(experienceSchema, 'INTERMEDIATE').isValid).toBe(true);
      expect(validateField(experienceSchema, 'INVALID_TIER').isValid).toBe(false);
    });

    it('validates training location', () => {
      expect(validateField(locationSchema, 'COMMERCIAL_GYM').isValid).toBe(true);
      expect(validateField(locationSchema, 'MARS_ORBIT').isValid).toBe(false);
    });
  });

  describe('Username & Call-Sign Validation', () => {
    it('accepts alphanumeric and underscore usernames between 3 and 20 chars', () => {
      expect(validateField(usernameSchema, 'titan_99').isValid).toBe(true);
      expect(validateField(usernameSchema, 'Ares').isValid).toBe(true);
    });

    it('rejects usernames with spaces or special characters', () => {
      expect(validateField(usernameSchema, 'titan 99').isValid).toBe(false);
      expect(validateField(usernameSchema, 'ares!@#').isValid).toBe(false);
    });

    it('rejects usernames too short or too long', () => {
      expect(validateField(usernameSchema, 'ab').isValid).toBe(false);
      expect(validateField(usernameSchema, 'a_very_long_username_exceeding_twenty').isValid).toBe(false);
    });
  });

  describe('Unit Conversions', () => {
    it('converts cm to feet and inches accurately', () => {
      const { feet, inches } = cmToFtIn(180); // ~5 ft 11 in
      expect(feet).toBe(5);
      expect(inches).toBe(11);
    });

    it('converts feet and inches back to cm', () => {
      expect(ftInToCm(5, 11)).toBe(180);
      expect(ftInToCm(6, 0)).toBe(183);
    });

    it('converts kg to lbs and back', () => {
      const lbs = kgToLbs(80);
      expect(lbs).toBeCloseTo(176.4, 1);
      const kg = lbsToKg(lbs);
      expect(kg).toBeCloseTo(80, 0);
    });
  });

  describe('Complete Master Onboarding Schema', () => {
    it('accepts a fully configured tactical athlete profile', () => {
      const validData = {
        goal: 'BUILD_STRENGTH',
        age: 27,
        heightCm: 182,
        weightKg: 85,
        experience: 'ADVANCED',
        daysPerWeek: 4,
        sessionDurationMinutes: 75,
        equipment: ['BARBELL', 'DUMBBELL', 'CABLE'],
        trainingLocation: 'COMMERCIAL_GYM',
        preferredExerciseIds: ['barbell-bench-press', 'barbell-back-squat'],
        excludedExerciseIds: [],
        limitations: ['NONE'],
        username: 'Vanguard_Prime',
        avatarUrl: '⚔️',
      };

      const result = onboardingSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
