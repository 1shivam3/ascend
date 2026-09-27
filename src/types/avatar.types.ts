import { BodyRegionId } from '../components/avatar/types';

export type FramePresentation =
  | 'MASCULINE_VANGUARD'
  | 'FEMININE_STRIKER'
  | 'HEAVY_TITAN'
  | 'CYBER_CHASSIS';

export type ArmorStyle =
  | 'TACTICAL_NANOWEAVE'
  | 'HEAVY_EXO_PLATING'
  | 'STEALTH_SUIT'
  | 'CYBER_SAMURAI';

export type ChassisTint =
  | 'STEALTH_MATTE'
  | 'CYBER_CYAN'
  | 'TITANIUM_FROST'
  | 'VANGUARD_CRIMSON'
  | 'OBSIDIAN_GOLD'
  | 'EMERALD_TECH';

export type AccentGlow =
  | 'CYAN_PULSE'
  | 'EMERALD_OVERDRIVE'
  | 'AMBER_CORE'
  | 'CRIMSON_THREAT'
  | 'AMETHYST_PSIONIC'
  | 'PURE_WHITE';

export type HeadStyle =
  | 'TACTICAL_VISOR'
  | 'CYBER_HELMET'
  | 'CRESTED_GUARD'
  | 'SLEEK_HOOD';

export interface OptionalMeasurements {
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  thighsCm?: number;
}

export interface AvatarConfig {
  frame: FramePresentation;
  armorStyle: ArmorStyle;
  chassisTint: ChassisTint;
  accentGlow: AccentGlow;
  headStyle: HeadStyle;
  measurements?: OptionalMeasurements;
  viewModePreference?: '3D' | '2D';
  updatedAt?: string;
}

export interface BodyProportions {
  heightScale: number;
  shoulderWidthScale: number;
  chestDepthScale: number;
  chestWidthScale: number;
  waistWidthScale: number;
  hipsWidthScale: number;
  armThicknessScale: number;
  legThicknessScale: number;
}

// 3D Mathematical Mesh Types
export type Point3D = [number, number, number]; // [x, y, z]
export type Point2D = [number, number]; // [x, y]

export type FaceColorType =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'glow'
  | 'visor'
  | 'joint'
  | 'trim';

export interface Face3D {
  id: string;
  indices: number[]; // 3 (triangle) or 4 (quad) vertex indices
  regionId: BodyRegionId;
  colorType: FaceColorType;
}

export interface Mesh3D {
  vertices: Point3D[];
  faces: Face3D[];
}

export interface ProjectedFace {
  id: string;
  points: Point2D[];
  regionId: BodyRegionId;
  avgDepth: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  normalZ: number;
  lightFactor: number;
}
