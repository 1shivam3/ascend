export type BodyRegionId =
  | 'head'
  | 'chest'
  | 'back'
  | 'left_shoulder'
  | 'right_shoulder'
  | 'left_arm'
  | 'right_arm'
  | 'core'
  | 'left_leg'
  | 'right_leg';

export interface BodyRegionInfo {
  id: BodyRegionId;
  name: string;
  muscleGroup: 'CHEST' | 'BACK' | 'SHOULDERS' | 'ARMS' | 'CORE' | 'LEGS';
  side?: 'front' | 'back' | 'both';
  relevantKeywords: string[];
}

export const BODY_REGIONS: Record<BodyRegionId, BodyRegionInfo> = {
  head: {
    id: 'head',
    name: 'HEAD / NECK',
    muscleGroup: 'CORE',
    side: 'both',
    relevantKeywords: ['neck', 'trap', 'shrug'],
  },
  chest: {
    id: 'chest',
    name: 'CHEST',
    muscleGroup: 'CHEST',
    side: 'front',
    relevantKeywords: ['bench', 'chest', 'push', 'fly', 'dip'],
  },
  back: {
    id: 'back',
    name: 'BACK / LATS',
    muscleGroup: 'BACK',
    side: 'back',
    relevantKeywords: ['pull', 'row', 'lat', 'deadlift', 'chin'],
  },
  left_shoulder: {
    id: 'left_shoulder',
    name: 'LEFT SHOULDER',
    muscleGroup: 'SHOULDERS',
    side: 'both',
    relevantKeywords: ['overhead', 'press', 'lateral', 'delt', 'shoulder'],
  },
  right_shoulder: {
    id: 'right_shoulder',
    name: 'RIGHT SHOULDER',
    muscleGroup: 'SHOULDERS',
    side: 'both',
    relevantKeywords: ['overhead', 'press', 'lateral', 'delt', 'shoulder'],
  },
  left_arm: {
    id: 'left_arm',
    name: 'LEFT ARM',
    muscleGroup: 'ARMS',
    side: 'both',
    relevantKeywords: ['curl', 'tricep', 'bicep', 'dip', 'extension'],
  },
  right_arm: {
    id: 'right_arm',
    name: 'RIGHT ARM',
    muscleGroup: 'ARMS',
    side: 'both',
    relevantKeywords: ['curl', 'tricep', 'bicep', 'dip', 'extension'],
  },
  core: {
    id: 'core',
    name: 'CORE & ABS',
    muscleGroup: 'CORE',
    side: 'front',
    relevantKeywords: ['plank', 'crunch', 'ab', 'core', 'twist'],
  },
  left_leg: {
    id: 'left_leg',
    name: 'LEFT LEG',
    muscleGroup: 'LEGS',
    side: 'both',
    relevantKeywords: ['squat', 'leg', 'lunge', 'quad', 'hamstring', 'calf'],
  },
  right_leg: {
    id: 'right_leg',
    name: 'RIGHT LEG',
    muscleGroup: 'LEGS',
    side: 'both',
    relevantKeywords: ['squat', 'leg', 'lunge', 'quad', 'hamstring', 'calf'],
  },
};
