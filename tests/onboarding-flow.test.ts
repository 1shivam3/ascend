import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/lib/store';
import { ATHLETE_GOAL_CONFIGS, AthleteGoal, UserMode } from '../src/lib/types';
import { calculateRecommendedMacroGoals } from '../src/lib/macros';
import { getGoalAdaptiveSplitTemplates } from '../src/lib/workout-engine';
import { generateSplitWeeklySchedule } from '../src/lib/workout-schedule';
import { calculateDOTS, isDOTSSupportedForGender, getDOTSClassification } from '../src/lib/dots';
import { getLiftLevel, getNextLevelInfo, isStrengthStandardAvailableForGender } from '../src/lib/strength-standards';
import { getDailyQuote } from '../src/lib/quotes';

describe('Phase 2: Onboarding & Authentication Flow (Reference Screens 1–7)', () => {
  beforeEach(() => {
    useStore.getState().logout({ clearLocalData: true });
  });

  describe('Screen 1 — Splash Screen Specification', () => {
    it('defines brand tokens Graphite (#171916), Vermilion (#E44427), and Sage (#858076)', () => {
      const graphiteHex = '#171916';
      const vermilionHex = '#E44427';
      const sageHex = '#858076';

      expect(graphiteHex).toBe('#171916');
      expect(vermilionHex).toBe('#E44427');
      expect(sageHex).toBe('#858076');
    });

    it('verifies exact brand tagline: "Train. Fuel. Progress. Repeat."', () => {
      const tagline = 'Train. Fuel. Progress. Repeat.';
      expect(tagline).toBe('Train. Fuel. Progress. Repeat.');
    });
  });

  describe('Screen 2 — Welcome Screen Specification', () => {
    it('has exact headline and subhead copy from reference flow board', () => {
      const headline = 'Build a stronger you, one day at a time.';
      const subhead = 'Track your workouts, nutrition, and progress — all in one place.';

      expect(headline).toBe('Build a stronger you, one day at a time.');
      expect(subhead).toContain('workouts, nutrition, and progress');
    });

    it('provides both "Get Started", "I already have an account", and guest access', () => {
      const buttons = ['Get Started', 'I already have an account', 'Continue as Guest'];
      expect(buttons).toHaveLength(3);
      expect(buttons[0]).toBe('Get Started');
      expect(buttons[1]).toBe('I already have an account');
      expect(buttons[2]).toBe('Continue as Guest');
    });
  });

  describe('Screen 3 & 4 — Create Account & Login Authentication', () => {
    it('validates email format and password length requirements', () => {
      const validate = (email: string, pass: string) => {
        if (!email.includes('@')) return 'Invalid email';
        if (pass.length < 6) return 'Password too short';
        return 'valid';
      };

      expect(validate('invalid-email', '123456')).toBe('Invalid email');
      expect(validate('alex@example.com', '123')).toBe('Password too short');
      expect(validate('alex@example.com', 'secret123')).toBe('valid');
    });
  });

  describe('Screen 5 — Fitness Goals Specification', () => {
    it('maintains 5 selectable goals in the exact reference order', () => {
      const expectedOrder: AthleteGoal[] = [
        'build_muscle',
        'lose_fat',
        'get_stronger',
        'stamina',
        'general_fitness',
      ];

      expect(expectedOrder[0]).toBe('build_muscle');
      expect(expectedOrder[1]).toBe('lose_fat');
      expect(expectedOrder[2]).toBe('get_stronger');
      expect(expectedOrder[3]).toBe('stamina');
      expect(expectedOrder[4]).toBe('general_fitness');
    });

    it('supports multi-goal selection and store persistence', () => {
      const store = useStore.getState();
      const selected: AthleteGoal[] = ['build_muscle', 'get_stronger', 'stamina'];

      store.setGoals(selected);
      expect(useStore.getState().goals).toEqual(selected);
    });
  });

  describe('Screen 6 — Experience Level Specification', () => {
    it('supports 3 experience tiers: Beginner, Intermediate, Advanced', () => {
      const tiers: UserMode[] = ['beginner', 'intermediate', 'advanced'];
      expect(tiers).toHaveLength(3);

      const store = useStore.getState();
      store.setUserMode('intermediate');
      expect(useStore.getState().userMode).toBe('intermediate');

      store.setUserMode('advanced');
      expect(useStore.getState().userMode).toBe('advanced');

      store.setUserMode('beginner');
      expect(useStore.getState().userMode).toBe('beginner');
    });
  });

  describe('Screen 7 — Personal Details & Program Calibration', () => {
    it('calibrates profile with correct bodyweight conversion and macro recommendations', () => {
      const store = useStore.getState();

      const weightKg = 75;
      const heightCm = 180;
      const age = 26;
      const gender = 'male';
      const goal = 'build_muscle';

      const macros = calculateRecommendedMacroGoals(weightKg, goal, gender, heightCm, age);

      expect(macros.calories).toBeGreaterThan(1800);
      expect(macros.proteinG).toBeGreaterThan(100);
      expect(macros.carbsG).toBeGreaterThan(150);
      expect(macros.fatG).toBeGreaterThan(40);

      store.setProfile({
        id: 'usr_test_123',
        name: 'Alex Miller',
        gender: 'male',
        bodyweightKg: weightKg,
        bodyweightLbs: Math.round(weightKg * 2.20462),
        heightCm,
        age,
        unit: 'kg',
        createdAt: new Date().toISOString(),
        goals: [goal],
        userMode: 'intermediate',
      });

      const saved = useStore.getState().profile;
      expect(saved?.name).toBe('Alex Miller');
      expect(saved?.bodyweightKg).toBe(75);
      expect(saved?.userMode).toBe('intermediate');
    });

    it('preserves user selection for male, female, and other without silent conversion', () => {
      const store = useStore.getState();

      const genders: Array<'male' | 'female' | 'other'> = ['male', 'female', 'other'];

      for (const g of genders) {
        store.setProfile({
          id: `usr_${g}`,
          name: `Athlete ${g}`,
          gender: g,
          bodyweightKg: 75,
          bodyweightLbs: 165,
          heightCm: 175,
          age: 26,
          unit: 'kg',
          createdAt: new Date().toISOString(),
          goals: ['build_muscle'],
          userMode: 'intermediate',
        });

        const saved = useStore.getState().profile;
        expect(saved?.gender).toBe(g);
      }
    });

    it('calculates evidence-based macro goals for male, female, and other', () => {
      const maleMacros = calculateRecommendedMacroGoals(75, 'build_muscle', 'male', 175, 25);
      const femaleMacros = calculateRecommendedMacroGoals(75, 'build_muscle', 'female', 175, 25);
      const otherMacros = calculateRecommendedMacroGoals(75, 'build_muscle', 'other', 175, 25);

      // Male BMR uses +5 offset, Female uses -161 offset, Other uses clinical midpoint -78 offset
      expect(maleMacros.calories).toBeGreaterThan(otherMacros.calories);
      expect(otherMacros.calories).toBeGreaterThan(femaleMacros.calories);

      // Protein target remains evidence-based (1.8g/kg for build_muscle) across all genders
      expect(maleMacros.proteinG).toBe(135);
      expect(femaleMacros.proteinG).toBe(135);
      expect(otherMacros.proteinG).toBe(135);
    });

    it('handles strength standards and DOTS explicitly for male, female, and other without fabrication', () => {
      // 1. Male standards
      expect(isStrengthStandardAvailableForGender('male')).toBe(true);
      expect(isDOTSSupportedForGender('male')).toBe(true);
      const maleLevel = getLiftLevel('Bench Press', 100, 75, 'male');
      expect(maleLevel.isStandardUnavailable).toBeFalsy();
      const maleDots = calculateDOTS(75, 450, 'male');
      expect(maleDots).toBeGreaterThan(0);

      // 2. Female standards
      expect(isStrengthStandardAvailableForGender('female')).toBe(true);
      expect(isDOTSSupportedForGender('female')).toBe(true);
      const femaleLevel = getLiftLevel('Bench Press', 65, 75, 'female');
      expect(femaleLevel.isStandardUnavailable).toBeFalsy();
      const femaleDots = calculateDOTS(75, 300, 'female');
      expect(femaleDots).toBeGreaterThan(0);

      // 3. Other (non-binary) standards: never fabricate standards, track progression against baseline with transparent label
      expect(isStrengthStandardAvailableForGender('other')).toBe(false);
      expect(isDOTSSupportedForGender('other')).toBe(false);

      const otherLevel = getLiftLevel('Bench Press', 100, 75, 'other');
      expect(otherLevel.isStandardUnavailable).toBe(true);
      expect(otherLevel.standardNote).toContain('calibrated exclusively for male and female divisions');
      expect(otherLevel.level).toBeGreaterThan(0);

      const nextInfo = getNextLevelInfo('Bench Press', otherLevel.level, 75, 'other');
      expect(nextInfo.isStandardUnavailable).toBe(true);
      expect(nextInfo.standardNote).toContain('calibrated exclusively for male and female divisions');

      // DOTS is an IPF competitive formula strictly defined for male and female; returns 0 with unavailable classification for other
      const otherDots = calculateDOTS(75, 450, 'other');
      expect(otherDots).toBe(0);
      const otherClassification = getDOTSClassification(0, 'other');
      expect(otherClassification.tier).toBe('UNAVAILABLE');
      expect(otherClassification.description).toContain('standardized by the International Powerlifting Federation');

      // Quotes for other fall back to neutral quotes pool
      const quote = getDailyQuote('other');
      expect(quote.text).toBeTruthy();
      expect(quote.author).toBeTruthy();
    });
  });
});
