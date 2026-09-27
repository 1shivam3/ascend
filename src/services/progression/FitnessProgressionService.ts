import { PROGRESSION_CONFIG, RankTier, RankDefinition } from '../../config/progression.config';
import { CharacterAttributes } from '../../types/domain.types';
import {
  UnifiedProgressionStatus,
  NextMilestoneRequirements,
  DimensionalProgress,
  DimensionHighlight,
} from '../../types/progression.types';
import { getRankForLevel } from '../../constants/ranks';
import { XpEngine } from './XpEngine';
import { ReliableDataEngine } from './ReliableDataEngine';

export interface UnifiedProgressionInput {
  totalXp: number;
  attributes: CharacterAttributes;
  verifiedSessionsCount: number;
  maxRelativeCompoundRatio?: number;
  athleteBodyweightKg?: number;
}

export class FitnessProgressionService {
  private static readonly RANK_TIER_ORDER: RankTier[] = [
    'E',
    'D',
    'C',
    'B',
    'A',
    'S',
    'SS',
    'SSS',
  ];

  /**
   * Evaluates the complete unified progression status of an athlete.
   * Unifies global XP, character level, 4-dimensional fitness scores,
   * data verification status, and anti-grind ascension gates.
   */
  static evaluateUnifiedProgression(input: UnifiedProgressionInput): UnifiedProgressionStatus {
    const levelInfo = XpEngine.getLevelInfo(input.totalXp);
    const nominalRankInfo = getRankForLevel(levelInfo.level);

    const attributes: CharacterAttributes = {
      strength: Math.max(10, Math.round(input.attributes?.strength || 10)),
      endurance: Math.max(10, Math.round(input.attributes?.endurance || 10)),
      mobility: Math.max(10, Math.round(input.attributes?.mobility || 10)),
      consistency: Math.max(10, Math.round(input.attributes?.consistency || 10)),
      agility: Math.max(10, Math.round(input.attributes?.agility || input.attributes?.mobility || 10)),
      stamina: Math.max(10, Math.round(input.attributes?.stamina || input.attributes?.endurance || 10)),
      discipline: Math.max(10, Math.round(input.attributes?.discipline || input.attributes?.consistency || 10)),
      vitality: Math.max(10, Math.round(input.attributes?.vitality || 10)),
    };

    const relativeRatio = input.maxRelativeCompoundRatio || 0.6;
    const verification = ReliableDataEngine.getVerificationStatus(input.verifiedSessionsCount);

    // Anti-Grind Evaluation: Walk up rank tiers from E to nominalRank to verify physical performance
    const nominalIndex = this.RANK_TIER_ORDER.indexOf(nominalRankInfo.tier);
    let highestQualifiedIndex = 0;
    const blockedReasons: string[] = [];

    for (let i = 0; i <= nominalIndex; i++) {
      const tier = this.RANK_TIER_ORDER[i];
      const rankDef = PROGRESSION_CONFIG.ranks[tier];
      const req = rankDef.minRequirements;

      const strengthMet = attributes.strength >= req.strength;
      const enduranceMet = attributes.endurance >= req.endurance;
      const currentMobility = attributes.mobility ?? 10;
      const mobilityMet = currentMobility >= req.mobility;
      const consistencyMet = attributes.consistency >= req.consistency;
      const relStrengthMet = !req.minRelativeStrength || relativeRatio >= req.minRelativeStrength;

      const allMet = strengthMet && enduranceMet && mobilityMet && consistencyMet && relStrengthMet;

      if (allMet) {
        highestQualifiedIndex = i;
      } else {
        // Collect reasons why higher rank was held back
        const missing: string[] = [];
        if (!strengthMet) missing.push(`Strength (${attributes.strength}/${req.strength})`);
        if (!enduranceMet) missing.push(`Endurance (${attributes.endurance}/${req.endurance})`);
        if (!mobilityMet) missing.push(`Mobility (${currentMobility}/${req.mobility})`);
        if (!consistencyMet) missing.push(`Consistency (${attributes.consistency}/${req.consistency})`);
        if (!relStrengthMet && req.minRelativeStrength) {
          missing.push(`Relative Strength (${relativeRatio.toFixed(2)}x / ${req.minRelativeStrength}x BW)`);
        }

        blockedReasons.push(
          `${rankDef.title} requires: ${missing.join(', ')}`
        );
        break;
      }
    }

    const effectiveTier = this.RANK_TIER_ORDER[highestQualifiedIndex];
    const effectiveRank = PROGRESSION_CONFIG.ranks[effectiveTier];
    const ascensionBlocked = highestQualifiedIndex < nominalIndex;

    // Strengths and Areas for Improvement Analysis
    const { topStrength, areaForImprovement } = this.analyzeStrengthsAndWeaknesses(
      attributes,
      blockedReasons
    );

    // Next Rank Milestone Roadmap
    const nextMilestone = this.getNextMilestoneRequirements(
      levelInfo.level,
      effectiveTier,
      attributes,
      relativeRatio
    );

    return {
      currentLevel: levelInfo.level,
      currentLevelXp: levelInfo.currentLevelXp,
      xpRequiredForNextLevel: levelInfo.xpRequiredForNextLevel,
      progressPercent: levelInfo.progressPercent,
      nominalRank: nominalRankInfo.definition,
      effectiveRank,
      rankDivision: nominalRankInfo.division,
      confirmationStatus: verification.status,
      verifiedSessionsCount: verification.verifiedSessionsCount,
      sessionsNeededForConfirmation: verification.sessionsRemaining,
      ascensionBlocked,
      blockedReasons,
      attributes,
      topStrength,
      areaForImprovement,
      nextMilestone,
      maxRelativeCompoundRatio: relativeRatio,
    };
  }

  /**
   * Generates actionable feedback identifying the athlete's primary pillar
   * of strength and their lowest constraint holding back progression.
   */
  static analyzeStrengthsAndWeaknesses(
    attributes: CharacterAttributes,
    blockedReasons: string[]
  ): { topStrength: DimensionHighlight; areaForImprovement: DimensionHighlight } {
    const scores = [
      { dim: 'strength', score: attributes.strength ?? 10, label: 'Strength' },
      { dim: 'endurance', score: attributes.endurance ?? 10, label: 'Endurance' },
      { dim: 'mobility', score: attributes.mobility ?? 10, label: 'Mobility' },
      { dim: 'consistency', score: attributes.consistency ?? 10, label: 'Consistency' },
    ];

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];
    const lowest = scores[scores.length - 1];

    const strengthRecommendations: Record<string, string> = {
      strength: 'Heavy compound loads & high relative force output are your elite attributes.',
      endurance: 'High work capacity, volume tolerance, and rapid intra-set recovery.',
      mobility: 'Superb range of motion, movement control, and resilient joint mobility.',
      consistency: 'Iron discipline with consistent schedule execution and unbroken habit momentum.',
    };

    const improvementActions: Record<string, string> = {
      strength: 'Incorporate 1 heavy compound protocol (squat, bench, or deadlift at RPE 8+) to lift relative strength.',
      endurance: 'Increase session rep density or add 1 metabolic conditioning circuit to build work capacity.',
      mobility: 'Add 1 dedicated 15-minute mobility or active recovery session per week to unlock higher rank tiers.',
      consistency: 'Maintain a minimum of 3 workouts per week to build foundational training streak momentum.',
    };

    const topStrength: DimensionHighlight = {
      dimension: top.dim,
      title: `${top.label} Anchor (${top.score}/100)`,
      score: top.score,
      description: strengthRecommendations[top.dim],
      actionRecommendation: 'Continue building on this physiological foundation.',
    };

    const areaForImprovement: DimensionHighlight = {
      dimension: lowest.dim,
      title: `${lowest.label} Focus (${lowest.score}/100)`,
      score: lowest.score,
      description: blockedReasons.length > 0
        ? blockedReasons[0]
        : `Your ${lowest.label.toLowerCase()} is your primary bottleneck for athletic ascension.`,
      actionRecommendation: improvementActions[lowest.dim],
    };

    return { topStrength, areaForImprovement };
  }

  /**
   * Computes exact requirements to achieve the next Rank Tier in the ladder.
   */
  static getNextMilestoneRequirements(
    currentLevel: number,
    currentRankTier: RankTier,
    attributes: CharacterAttributes,
    currentRelativeRatio: number = 0.6
  ): NextMilestoneRequirements {
    const currentIndex = this.RANK_TIER_ORDER.indexOf(currentRankTier);
    const nextIndex = Math.min(this.RANK_TIER_ORDER.length - 1, currentIndex + 1);
    const nextTier = this.RANK_TIER_ORDER[nextIndex];
    const nextRankDef = PROGRESSION_CONFIG.ranks[nextTier];
    const req = nextRankDef.minRequirements;

    const levelRequired = nextRankDef.minLevel;
    const levelPercent = Math.min(100, Math.round((currentLevel / Math.max(1, levelRequired)) * 100));

    const dimensions: DimensionalProgress[] = [
      {
        dimension: 'strength',
        label: 'Strength Score',
        score: attributes.strength,
        target: req.strength,
        satisfied: attributes.strength >= req.strength,
        unit: 'pts',
        description: 'Heavy compound loads & Wilks relative metric',
      },
      {
        dimension: 'endurance',
        label: 'Endurance Score',
        score: attributes.endurance,
        target: req.endurance,
        satisfied: attributes.endurance >= req.endurance,
        unit: 'pts',
        description: 'Rep volume capacity & session density',
      },
      {
        dimension: 'mobility',
        label: 'Mobility Score',
        score: attributes.mobility ?? 10,
        target: req.mobility,
        satisfied: (attributes.mobility ?? 10) >= req.mobility,
        unit: 'pts',
        description: 'Mobility protocols & active recovery',
      },
      {
        dimension: 'consistency',
        label: 'Consistency Score',
        score: attributes.consistency,
        target: req.consistency,
        satisfied: attributes.consistency >= req.consistency,
        unit: 'pts',
        description: 'Weekly schedule adherence & streak',
      },
    ];

    const relRequired = req.minRelativeStrength || 1.0;
    const relPercent = Math.min(100, Math.round((currentRelativeRatio / relRequired) * 100));

    const unsatisfied = dimensions.filter(d => !d.satisfied);
    let summaryMessage = `On track for ${nextRankDef.title}. Reach Level ${levelRequired}.`;

    if (currentLevel >= levelRequired && unsatisfied.length > 0) {
      summaryMessage = `Level requirement satisfied! Elevate ${unsatisfied.map(d => d.label).join(' & ')} to claim ${nextRankDef.title}.`;
    } else if (currentLevel < levelRequired && unsatisfied.length > 0) {
      summaryMessage = `Reach Level ${levelRequired} and elevate ${unsatisfied[0].label} to ${unsatisfied[0].target} pts to ascend.`;
    }

    return {
      nextRankTier: nextTier,
      nextRankTitle: nextRankDef.title,
      levelProgress: {
        current: currentLevel,
        required: levelRequired,
        percent: levelPercent,
      },
      relativeStrengthProgress: {
        current: currentRelativeRatio,
        required: relRequired,
        percent: relPercent,
      },
      dimensions,
      summaryMessage,
    };
  }
}
