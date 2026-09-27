import { describe, it, expect } from 'vitest';
import { AvatarMorphEngine } from '../AvatarMorphEngine';
import { FramePresentation, ChassisTint, AccentGlow } from '../../../types/avatar.types';

describe('AvatarMorphEngine', () => {
  describe('calculateProportions', () => {
    it('returns valid bounded proportions for standard baseline operative', () => {
      const proportions = AvatarMorphEngine.calculateProportions({
        heightCm: 175,
        weightKg: 75,
        experience: 'INTERMEDIATE',
        goal: 'GET_STRONGER',
        frame: 'MASCULINE_VANGUARD',
      });

      expect(proportions.heightScale).toBeGreaterThanOrEqual(0.85);
      expect(proportions.heightScale).toBeLessThanOrEqual(1.2);
      expect(proportions.shoulderWidthScale).toBeGreaterThanOrEqual(0.75);
      expect(proportions.shoulderWidthScale).toBeLessThanOrEqual(1.35);
      expect(proportions.chestDepthScale).toBeGreaterThanOrEqual(0.75);
      expect(proportions.chestDepthScale).toBeLessThanOrEqual(1.35);
      expect(proportions.waistWidthScale).toBeGreaterThanOrEqual(0.75);
      expect(proportions.waistWidthScale).toBeLessThanOrEqual(1.35);
      expect(proportions.armThicknessScale).toBeGreaterThanOrEqual(0.75);
      expect(proportions.armThicknessScale).toBeLessThanOrEqual(1.35);
      expect(proportions.legThicknessScale).toBeGreaterThanOrEqual(0.75);
      expect(proportions.legThicknessScale).toBeLessThanOrEqual(1.35);
    });

    it('adjusts frame presentation distinctly for FEMININE_STRIKER vs HEAVY_TITAN', () => {
      const striker = AvatarMorphEngine.calculateProportions({
        heightCm: 168,
        weightKg: 62,
        frame: 'FEMININE_STRIKER',
        goal: 'ATHLETIC_PERFORMANCE',
      });

      const titan = AvatarMorphEngine.calculateProportions({
        heightCm: 185,
        weightKg: 105,
        frame: 'HEAVY_TITAN',
        goal: 'GET_STRONGER',
      });

      // Striker should have narrower shoulders and waist than Titan
      expect(striker.shoulderWidthScale).toBeLessThan(titan.shoulderWidthScale);
      expect(striker.waistWidthScale).toBeLessThan(titan.waistWidthScale);
      expect(striker.armThicknessScale).toBeLessThan(titan.armThicknessScale);
      expect(striker.legThicknessScale).toBeLessThan(titan.legThicknessScale);
    });

    it('applies goal modifiers for BUILD_MUSCLE vs LOSE_WEIGHT', () => {
      const muscle = AvatarMorphEngine.calculateProportions({
        heightCm: 175,
        weightKg: 75,
        goal: 'BUILD_MUSCLE',
      });

      const fatLoss = AvatarMorphEngine.calculateProportions({
        heightCm: 175,
        weightKg: 75,
        goal: 'LOSE_WEIGHT',
      });

      expect(muscle.armThicknessScale).toBeGreaterThan(fatLoss.armThicknessScale);
      expect(muscle.chestWidthScale).toBeGreaterThan(fatLoss.chestWidthScale);
      expect(fatLoss.waistWidthScale).toBeLessThan(muscle.waistWidthScale);
    });

    it('refines proportions with optional body measurements', () => {
      const base = AvatarMorphEngine.calculateProportions({
        heightCm: 178,
        weightKg: 80,
      });

      const customMeasurements = AvatarMorphEngine.calculateProportions({
        heightCm: 178,
        weightKg: 80,
        measurements: {
          chestCm: 120, // Distinctly above standard
          waistCm: 76,  // Narrower than 82cm standard
          armsCm: 42,   // Larger than 36cm standard
        },
      });

      expect(customMeasurements.chestWidthScale).toBeGreaterThan(base.chestWidthScale);
      expect(customMeasurements.waistWidthScale).toBeLessThan(base.waistWidthScale);
      expect(customMeasurements.armThicknessScale).toBeGreaterThan(base.armThicknessScale);
    });

    it('enforces safety clamping on extreme inputs to prevent mesh distortion', () => {
      // Extremely low inputs
      const extremeLow = AvatarMorphEngine.calculateProportions({
        heightCm: 100,
        weightKg: 20,
      });

      expect(extremeLow.heightScale).toBeGreaterThanOrEqual(0.85);
      expect(extremeLow.shoulderWidthScale).toBeGreaterThanOrEqual(0.75);
      expect(extremeLow.waistWidthScale).toBeGreaterThanOrEqual(0.75);

      // Extremely high inputs
      const extremeHigh = AvatarMorphEngine.calculateProportions({
        heightCm: 260,
        weightKg: 300,
      });

      expect(extremeHigh.heightScale).toBeLessThanOrEqual(1.2);
      expect(extremeHigh.shoulderWidthScale).toBeLessThanOrEqual(1.35);
      expect(extremeHigh.chestDepthScale).toBeLessThanOrEqual(1.35);
      expect(extremeHigh.waistWidthScale).toBeLessThanOrEqual(1.35);
    });
  });

  describe('getDefaultAvatarConfig', () => {
    it('returns complete default config with expected tactical fallbacks', () => {
      const config = AvatarMorphEngine.getDefaultAvatarConfig();

      expect(config.frame).toBe('MASCULINE_VANGUARD');
      expect(config.armorStyle).toBe('TACTICAL_NANOWEAVE');
      expect(config.chassisTint).toBe('STEALTH_MATTE');
      expect(config.accentGlow).toBe('CYAN_PULSE');
      expect(config.headStyle).toBe('TACTICAL_VISOR');
      expect(config.viewModePreference).toBe('3D');
      expect(config.updatedAt).toBeDefined();
    });

    it('merges partial overrides correctly', () => {
      const config = AvatarMorphEngine.getDefaultAvatarConfig({
        frame: 'CYBER_CHASSIS',
        accentGlow: 'EMERALD_OVERDRIVE',
        viewModePreference: '2D',
      });

      expect(config.frame).toBe('CYBER_CHASSIS');
      expect(config.accentGlow).toBe('EMERALD_OVERDRIVE');
      expect(config.viewModePreference).toBe('2D');
      expect(config.chassisTint).toBe('STEALTH_MATTE');
    });
  });

  describe('getColorPalette', () => {
    it('maps accent glow and chassis tint to correct hex colors', () => {
      const cyanPalette = AvatarMorphEngine.getColorPalette('STEALTH_MATTE', 'CYAN_PULSE', true);
      expect(cyanPalette.glow).toBe('#00E5FF');
      expect(cyanPalette.visor).toBe('#00E5FF');
      expect(cyanPalette.primaryPlate).toBe('#1E2638');

      const emeraldPalette = AvatarMorphEngine.getColorPalette('EMERALD_TECH', 'EMERALD_OVERDRIVE', true);
      expect(emeraldPalette.glow).toBe('#10B981');
      expect(emeraldPalette.primaryPlate).toBe('#122D22');

      const crimsonPalette = AvatarMorphEngine.getColorPalette('VANGUARD_CRIMSON', 'CRIMSON_THREAT', false);
      expect(crimsonPalette.glow).toBe('#EF4444');
      expect(crimsonPalette.primaryPlate).toBe('#991B1B');
    });
  });
});
