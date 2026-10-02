import { PersonalRecord, Gender } from './types';

// DOTS Formula Coefficients (standardized bodyweight-normalized powerlifting comparison score)
// Note: Official IPF competitions use IPF GL Points; DOTS is widely used across federations as a bodyweight comparison metric.
const DOTS_MALE = {
  A: -307.75076,
  B: 24.0900756,
  C: -0.1918759221,
  D: 0.0007391293,
  E: -0.000001093,
};

const DOTS_FEMALE = {
  A: -57.96288,
  B: 13.6175032,
  C: -0.1126655495,
  D: 0.0005158568,
  E: -0.0000010706,
};

/**
 * Calculates DOTS powerlifting coefficient given bodyweight and Big 3 Total (in kg).
 * Provides a standardized bodyweight-normalized comparison across weight classes.
 */
export function calculateDOTS(
  bodyweightKg: number,
  totalKg: number,
  gender: Gender = 'male'
): number {
  if (!bodyweightKg || bodyweightKg <= 0 || !totalKg || totalKg <= 0) return 0;

  const c = gender === 'female' ? DOTS_FEMALE : DOTS_MALE;
  const bw = Math.max(35, Math.min(220, bodyweightKg));
  const denominator =
    c.A +
    c.B * bw +
    c.C * Math.pow(bw, 2) +
    c.D * Math.pow(bw, 3) +
    c.E * Math.pow(bw, 4);

  if (denominator <= 0) return 0;
  return Number(((totalKg / denominator) * 500).toFixed(1));
}

export interface DOTSClassification {
  tier: string;
  badge: string;
  description: string;
  percentile: string;
}

export function getDOTSClassification(dots: number): DOTSClassification {
  if (dots >= 560) {
    return {
      tier: 'WORLD CLASS',
      badge: 'S-TIER',
      description: 'International competitor standard. Top 0.1% strength elite.',
      percentile: 'Top 0.1%',
    };
  }
  if (dots >= 500) {
    return {
      tier: 'ELITE',
      badge: 'A-TIER',
      description: 'National podium caliber. Exceptionally rare pound-for-pound power.',
      percentile: 'Top 1%',
    };
  }
  if (dots >= 440) {
    return {
      tier: 'NATIONAL CLASS',
      badge: 'B-TIER',
      description: 'Competitive powerlifting meet qualifier. Advanced strength mastery.',
      percentile: 'Top 5%',
    };
  }
  if (dots >= 375) {
    return {
      tier: 'REGIONAL CLASS',
      badge: 'C-TIER',
      description: 'High-level gym strength. Formidable across all 3 compound lifts.',
      percentile: 'Top 15%',
    };
  }
  if (dots >= 300) {
    return {
      tier: 'INTERMEDIATE',
      badge: 'D-TIER',
      description: 'Solid foundational power. Consistent disciplined strength work.',
      percentile: 'Top 35%',
    };
  }
  return {
    tier: 'DEVELOPING',
    badge: 'BASE',
    description: 'Foundational phase. Building joint integrity and movement baseline.',
    percentile: 'Baseline',
  };
}

export interface BigThreeStats {
  benchMax: number;
  squatMax: number;
  deadliftMax: number;
  totalKg: number;
  missingLifts: string[];
  isComplete: boolean;
}

export function getBigThreeStats(prs: PersonalRecord[]): BigThreeStats {
  let benchMax = 0;
  let squatMax = 0;
  let deadliftMax = 0;

  for (const pr of prs) {
    const name = pr.exercise.toLowerCase();
    if (name.includes('bench') && !name.includes('incline') && !name.includes('close')) {
      if (pr.oneRepMax > benchMax) benchMax = pr.oneRepMax;
    } else if (name.includes('squat') && !name.includes('hack') && !name.includes('front')) {
      if (pr.oneRepMax > squatMax) squatMax = pr.oneRepMax;
    } else if (name.includes('deadlift') && !name.includes('romanian') && !name.includes('stiff')) {
      if (pr.oneRepMax > deadliftMax) deadliftMax = pr.oneRepMax;
    }
  }

  const missingLifts: string[] = [];
  if (benchMax === 0) missingLifts.push('Bench Press');
  if (squatMax === 0) missingLifts.push('Squat');
  if (deadliftMax === 0) missingLifts.push('Deadlift');

  const totalKg = Number((benchMax + squatMax + deadliftMax).toFixed(1));

  return {
    benchMax: Math.round(benchMax),
    squatMax: Math.round(squatMax),
    deadliftMax: Math.round(deadliftMax),
    totalKg,
    missingLifts,
    isComplete: missingLifts.length === 0,
  };
}
