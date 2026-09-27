import {
  AvatarConfig,
  BodyProportions,
  FramePresentation,
  OptionalMeasurements,
  ChassisTint,
  AccentGlow,
} from '../../types/avatar.types';

export interface MorphInput {
  heightCm?: number;
  weightKg?: number;
  experience?: string;
  goal?: string;
  frame?: FramePresentation;
  measurements?: OptionalMeasurements;
  strengthRatio?: number; // relative strength ratio, e.g. 1.25x BW
}

export interface ColorPalette {
  primaryPlate: string;
  secondarySuit: string;
  trim: string;
  joint: string;
  glow: string;
  glowFaint: string;
  visor: string;
}

export class AvatarMorphEngine {
  /**
   * Calculate deterministic body proportion scales from user inputs.
   * Guaranteed to return bounded values between 0.75 and 1.35.
   */
  static calculateProportions(input: MorphInput): BodyProportions {
    const heightCm = Math.max(120, Math.min(240, input.heightCm ?? 175));
    const weightKg = Math.max(35, Math.min(220, input.weightKg ?? 75));
    const frame = input.frame ?? 'MASCULINE_VANGUARD';
    const experience = (input.experience ?? 'INTERMEDIATE').toUpperCase();
    const goal = (input.goal ?? 'GET_STRONGER').toUpperCase();
    const measurements = input.measurements;

    // 1. BMI Calculation & Base Mass Factor
    const heightMeters = heightCm / 100;
    const bmi = weightKg / (heightMeters * heightMeters);
    // Baseline reference BMI is ~23.0
    const massFactor = Math.max(0.85, Math.min(1.25, bmi / 23.0));

    // 2. Height Scale (normalized to 175cm)
    const rawHeightScale = heightCm / 175;
    const heightScale = Math.max(0.88, Math.min(1.15, rawHeightScale));

    // 3. Base Proportions from Frame Presentation
    let shoulderWidth = 1.0;
    let chestDepth = 1.0;
    let chestWidth = 1.0;
    let waistWidth = 1.0;
    let hipsWidth = 1.0;
    let armThickness = 1.0;
    let legThickness = 1.0;

    switch (frame) {
      case 'FEMININE_STRIKER':
        shoulderWidth = 0.92;
        chestDepth = 0.96;
        chestWidth = 0.94;
        waistWidth = 0.86;
        hipsWidth = 1.08;
        armThickness = 0.92;
        legThickness = 0.98;
        break;

      case 'HEAVY_TITAN':
        shoulderWidth = 1.15;
        chestDepth = 1.18;
        chestWidth = 1.16;
        waistWidth = 1.10;
        hipsWidth = 1.05;
        armThickness = 1.16;
        legThickness = 1.18;
        break;

      case 'CYBER_CHASSIS':
        shoulderWidth = 1.08;
        chestDepth = 1.02;
        chestWidth = 1.05;
        waistWidth = 0.92;
        hipsWidth = 0.98;
        armThickness = 1.04;
        legThickness = 1.06;
        break;

      case 'MASCULINE_VANGUARD':
      default:
        shoulderWidth = 1.04;
        chestDepth = 1.04;
        chestWidth = 1.04;
        waistWidth = 0.96;
        hipsWidth = 0.98;
        armThickness = 1.02;
        legThickness = 1.02;
        break;
    }

    // 4. Modulate with Mass Factor
    waistWidth *= Math.pow(massFactor, 0.8);
    hipsWidth *= Math.pow(massFactor, 0.6);
    chestWidth *= Math.pow(massFactor, 0.5);
    chestDepth *= Math.pow(massFactor, 0.5);
    armThickness *= Math.pow(massFactor, 0.45);
    legThickness *= Math.pow(massFactor, 0.5);

    // 5. Goal Modifiers
    if (goal.includes('BUILD_MUSCLE') || goal.includes('HYPERTROPHY')) {
      shoulderWidth += 0.05;
      chestWidth += 0.05;
      chestDepth += 0.05;
      armThickness += 0.06;
      legThickness += 0.05;
    } else if (goal.includes('STRONGER') || goal.includes('POWERLIFTING')) {
      chestDepth += 0.07;
      chestWidth += 0.06;
      legThickness += 0.07;
      armThickness += 0.05;
      waistWidth += 0.03;
    } else if (goal.includes('LOSE_WEIGHT') || goal.includes('FAT_LOSS')) {
      waistWidth -= 0.05;
      hipsWidth -= 0.03;
    } else if (goal.includes('ATHLETIC') || goal.includes('PERFORMANCE')) {
      shoulderWidth += 0.04;
      waistWidth -= 0.03;
      legThickness += 0.03;
    } else if (goal.includes('ENDURANCE') || goal.includes('STAMINA')) {
      shoulderWidth -= 0.02;
      armThickness -= 0.03;
      waistWidth -= 0.04;
    }

    // 6. Experience & Strength Level Modifiers
    if (experience === 'ADVANCED' || experience === 'ELITE') {
      shoulderWidth += 0.04;
      chestWidth += 0.03;
      armThickness += 0.04;
      legThickness += 0.04;
    }

    if (input.strengthRatio && input.strengthRatio > 1.0) {
      const strengthBonus = Math.min(0.08, (input.strengthRatio - 1.0) * 0.1);
      shoulderWidth += strengthBonus;
      chestDepth += strengthBonus;
      armThickness += strengthBonus;
    }

    // 7. Optional Explicit Body Measurements (if provided by user)
    if (measurements) {
      if (measurements.chestCm && measurements.chestCm > 50) {
        const chestRatio = measurements.chestCm / 100.0;
        chestWidth = chestWidth * 0.4 + chestRatio * 0.6;
        chestDepth = chestDepth * 0.4 + chestRatio * 0.6;
      }
      if (measurements.waistCm && measurements.waistCm > 40) {
        const waistRatio = measurements.waistCm / 82.0;
        waistWidth = waistWidth * 0.4 + waistRatio * 0.6;
      }
      if (measurements.hipsCm && measurements.hipsCm > 50) {
        const hipsRatio = measurements.hipsCm / 96.0;
        hipsWidth = hipsWidth * 0.4 + hipsRatio * 0.6;
      }
      if (measurements.armsCm && measurements.armsCm > 20) {
        const armRatio = measurements.armsCm / 36.0;
        armThickness = armThickness * 0.4 + armRatio * 0.6;
      }
      if (measurements.thighsCm && measurements.thighsCm > 30) {
        const legRatio = measurements.thighsCm / 56.0;
        legThickness = legThickness * 0.4 + legRatio * 0.6;
      }
    }

    // 8. Strict Aesthetic and Geometry Clamping (0.75 - 1.35)
    return {
      heightScale: Number(this.clamp(heightScale, 0.85, 1.2).toFixed(3)),
      shoulderWidthScale: Number(this.clamp(shoulderWidth, 0.75, 1.35).toFixed(3)),
      chestDepthScale: Number(this.clamp(chestDepth, 0.75, 1.35).toFixed(3)),
      chestWidthScale: Number(this.clamp(chestWidth, 0.75, 1.35).toFixed(3)),
      waistWidthScale: Number(this.clamp(waistWidth, 0.75, 1.35).toFixed(3)),
      hipsWidthScale: Number(this.clamp(hipsWidth, 0.75, 1.35).toFixed(3)),
      armThicknessScale: Number(this.clamp(armThickness, 0.75, 1.35).toFixed(3)),
      legThicknessScale: Number(this.clamp(legThickness, 0.75, 1.35).toFixed(3)),
    };
  }

  /**
   * Return a default, coherent AvatarConfig for new or uncustomized profiles.
   */
  static getDefaultAvatarConfig(options?: Partial<AvatarConfig>): AvatarConfig {
    return {
      frame: options?.frame ?? 'MASCULINE_VANGUARD',
      armorStyle: options?.armorStyle ?? 'TACTICAL_NANOWEAVE',
      chassisTint: options?.chassisTint ?? 'STEALTH_MATTE',
      accentGlow: options?.accentGlow ?? 'CYAN_PULSE',
      headStyle: options?.headStyle ?? 'TACTICAL_VISOR',
      measurements: options?.measurements,
      viewModePreference: options?.viewModePreference ?? '3D',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Map Chassis Tint and Accent Glow to concrete tactical theme colors.
   */
  static getColorPalette(
    tint: ChassisTint = 'STEALTH_MATTE',
    glow: AccentGlow = 'CYAN_PULSE',
    isDark: boolean = true
  ): ColorPalette {
    // 1. Accent Glow & Visor Colors
    let glowHex = '#00E5FF'; // Default Cyan Pulse
    let glowFaint = 'rgba(0, 229, 255, 0.25)';

    switch (glow) {
      case 'EMERALD_OVERDRIVE':
        glowHex = '#10B981';
        glowFaint = 'rgba(16, 185, 129, 0.25)';
        break;
      case 'AMBER_CORE':
        glowHex = '#F59E0B';
        glowFaint = 'rgba(245, 158, 11, 0.25)';
        break;
      case 'CRIMSON_THREAT':
        glowHex = '#EF4444';
        glowFaint = 'rgba(239, 68, 68, 0.25)';
        break;
      case 'AMETHYST_PSIONIC':
        glowHex = '#A855F7';
        glowFaint = 'rgba(168, 85, 247, 0.25)';
        break;
      case 'PURE_WHITE':
        glowHex = '#F8FAFC';
        glowFaint = 'rgba(248, 250, 252, 0.25)';
        break;
      case 'CYAN_PULSE':
      default:
        glowHex = '#00E5FF';
        glowFaint = 'rgba(0, 229, 255, 0.25)';
        break;
    }

    // 2. Chassis Tint Plates
    let primaryPlate = isDark ? '#1E2638' : '#334155';
    let secondarySuit = isDark ? '#101522' : '#E2E8F0';
    let trim = isDark ? '#2D3748' : '#CBD5E1';
    let joint = isDark ? '#0A0E17' : '#94A3B8';

    switch (tint) {
      case 'CYBER_CYAN':
        primaryPlate = isDark ? '#132B3B' : '#0E7490';
        secondarySuit = isDark ? '#09151F' : '#CFFAFE';
        trim = isDark ? '#1E4760' : '#67E8F9';
        break;

      case 'TITANIUM_FROST':
        primaryPlate = isDark ? '#3E4756' : '#64748B';
        secondarySuit = isDark ? '#1F242D' : '#F1F5F9';
        trim = isDark ? '#5A667A' : '#94A3B8';
        break;

      case 'VANGUARD_CRIMSON':
        primaryPlate = isDark ? '#3D171C' : '#991B1B';
        secondarySuit = isDark ? '#200B0E' : '#FEE2E2';
        trim = isDark ? '#5C222B' : '#F87171';
        break;

      case 'OBSIDIAN_GOLD':
        primaryPlate = isDark ? '#28241B' : '#78350F';
        secondarySuit = isDark ? '#14120C' : '#FEF3C7';
        trim = isDark ? '#473D26' : '#FBBF24';
        break;

      case 'EMERALD_TECH':
        primaryPlate = isDark ? '#122D22' : '#065F46';
        secondarySuit = isDark ? '#091711' : '#D1FAE5';
        trim = isDark ? '#1C4534' : '#34D399';
        break;

      case 'STEALTH_MATTE':
      default:
        primaryPlate = isDark ? '#1E2638' : '#334155';
        secondarySuit = isDark ? '#101522' : '#E2E8F0';
        trim = isDark ? '#2D3748' : '#CBD5E1';
        break;
    }

    return {
      primaryPlate,
      secondarySuit,
      trim,
      joint,
      glow: glowHex,
      glowFaint,
      visor: glowHex,
    };
  }

  private static clamp(value: number, min: number, max: number): number {
    if (isNaN(value)) return (min + max) / 2;
    return Math.max(min, Math.min(max, value));
  }
}
