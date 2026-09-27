import { ImageSourcePropType } from 'react-native';

export type CharacterViewMode = 'FRONT' | 'BACK';

export interface CharacterEvolutionStage {
  id: string;
  name: string;
  title: string;
  minLevel: number;
  unlockedRanks: string[];
  description: string;
  frontAsset: ImageSourcePropType;
  backAsset: ImageSourcePropType;
}

export interface CharacterAssetBundle {
  stageId: string;
  stageName: string;
  stageTitle: string;
  front: ImageSourcePropType;
  back: ImageSourcePropType;
  level: number;
  rankTier: string;
}

/**
 * Static registry of ASCEND 2D Character Evolution stages.
 * Assets are bundled locally and mapped dynamically based on athlete level & rank.
 */
function safeRequireAsset(loader: () => ImageSourcePropType, fallbackId: number = 1): ImageSourcePropType {
  if (typeof process !== 'undefined' && (process.env.VITEST || process.env.NODE_ENV === 'test')) {
    return fallbackId as unknown as ImageSourcePropType;
  }
  try {
    return loader();
  } catch {
    return fallbackId as unknown as ImageSourcePropType;
  }
}

const BASE_FRONT = safeRequireAsset(() => require('../../../assets/character/base/front.png'), 1);
const BASE_BACK = safeRequireAsset(() => require('../../../assets/character/base/back.png'), 2);
const STAGE1_FRONT = safeRequireAsset(() => require('../../../assets/character/evolution/stage-01/front.png'), 3);
const STAGE1_BACK = safeRequireAsset(() => require('../../../assets/character/evolution/stage-01/back.png'), 4);
const STAGE2_FRONT = safeRequireAsset(() => require('../../../assets/character/evolution/stage-02/front.png'), 5);
const STAGE2_BACK = safeRequireAsset(() => require('../../../assets/character/evolution/stage-02/back.png'), 6);

export const CHARACTER_STAGES: CharacterEvolutionStage[] = [
  {
    id: 'stage-base',
    name: 'Initiate Operative',
    title: 'Base Kinetic Form',
    minLevel: 1,
    unlockedRanks: ['E', 'D'],
    description: 'Disciplined baseline physical form. Grounded stances and foundational kinetic conditioning.',
    frontAsset: BASE_FRONT,
    backAsset: BASE_BACK,
  },
  {
    id: 'stage-01',
    name: 'Ascended Striker',
    title: 'Focused Kinetic Form',
    minLevel: 15,
    unlockedRanks: ['C', 'B'],
    description: 'Enhanced neuromuscular density. Marked with discipline crests and honed kinetic speed.',
    frontAsset: STAGE1_FRONT,
    backAsset: STAGE1_BACK,
  },
  {
    id: 'stage-02',
    name: 'Apex Vanguard',
    title: 'Transcendence Form',
    minLevel: 40,
    unlockedRanks: ['A', 'S', 'SS', 'SSS'],
    description: 'Peak biological conditioning. Sovereign kinetic flow and mastered neuromuscular recruitment.',
    frontAsset: STAGE2_FRONT,
    backAsset: STAGE2_BACK,
  },
];

export class CharacterAssetService {
  /**
   * Resolves the active character bundle based on global level and rank tier.
   * Guaranteed to never throw and always returns a valid bundle.
   */
  static getActiveCharacter(level: number = 1, rankTier: string = 'E'): CharacterAssetBundle {
    const normalizedTier = (rankTier || 'E').toUpperCase();
    const cleanLevel = Math.max(1, Math.floor(level || 1));

    // High tier takes precedence
    if (['SSS', 'SS', 'S', 'A'].includes(normalizedTier) || cleanLevel >= 40) {
      const stage = CHARACTER_STAGES[2];
      return {
        stageId: stage.id,
        stageName: stage.name,
        stageTitle: stage.title,
        front: stage.frontAsset,
        back: stage.backAsset,
        level: cleanLevel,
        rankTier: normalizedTier,
      };
    }

    if (['B', 'C'].includes(normalizedTier) || cleanLevel >= 15) {
      const stage = CHARACTER_STAGES[1];
      return {
        stageId: stage.id,
        stageName: stage.name,
        stageTitle: stage.title,
        front: stage.frontAsset,
        back: stage.backAsset,
        level: cleanLevel,
        rankTier: normalizedTier,
      };
    }

    const stage = CHARACTER_STAGES[0];
    return {
      stageId: stage.id,
      stageName: stage.name,
      stageTitle: stage.title,
      front: stage.frontAsset,
      back: stage.backAsset,
      level: cleanLevel,
      rankTier: normalizedTier,
    };
  }

  /**
   * Retrieves all available evolution stages for customizer inspection.
   */
  static getAllStages(): CharacterEvolutionStage[] {
    return CHARACTER_STAGES;
  }
}
