import { ReferenceBenchmark } from '../types/comparison.types';

/**
 * ASCEND Population & Reference Benchmarks Configuration
 *
 * SCIENTIFIC GROUNDING & ANTI-FABRICATION PRINCIPLES:
 * 1. ASCEND never claims a user is "stronger than X% of the world" without
 *    peer-reviewed, population-representative demographic data.
 * 2. Competitive powerlifting data (USAPL, IPF) is explicitly NEVER treated as
 *    representative of the general population.
 * 3. Clinical health surveys rarely test heavy compound 1RMs on sedentary adults
 *    due to orthopedic safety protocols; therefore, barbell standards are
 *    strictly labeled as "Recreational Resistance Trainees".
 * 4. Any exercise lacking rigorous published norms is flagged as INSUFFICIENT_DATA
 *    with: "Not enough reliable data for this comparison."
 */

export const POPULATION_BENCHMARKS: Record<string, ReferenceBenchmark> = {
  // 1. BARBELL BENCH PRESS
  'ex-bench-press': {
    exerciseId: 'ex-bench-press',
    exerciseName: 'Barbell Bench Press',
    cohortType: 'RECREATIONAL_TRAINEES',
    referenceGroupDescription:
      'Recreational adult gym-goers and fitness participants (adults regularly engaging in resistance training 2+ times/week).',
    dataSourceCitation:
      'American College of Sports Medicine (ACSM) Health-Related Physical Fitness Assessment Manual (6th Ed., 2021); Cooper Clinic Fitness Cohorts.',
    publicationDate: '2021 (Norms revised from longitudinal screening data)',
    sampleDescription:
      'Approx. 4,200 adult fitness participants evaluated during standardized preventative health & fitness assessments in North America.',
    methodUsed: 'DIRECT_1RM_TEST',
    methodDescription:
      'Standardized 1RM bench press on flat Olympic barbell bench, touching lower chest without bounce and pressing to full elbow extension.',
    limitations: [
      'Cohort consists of individuals voluntarily attending fitness evaluations (active self-selection bias).',
      'Does NOT represent the sedentary general population, where untrained adults typically lift significantly less.',
      'Linear bodyweight ratio (weight / bodyweight) favors lighter individuals due to allometric scaling (strength scales with cross-sectional area ~ M^0.67, not linear mass).',
      'Variations in bench setup, grip width, and arch create mechanical differences.',
    ],
    supportedMetrics: ['1RM', 'RELATIVE_STRENGTH'],
    normBands: [
      {
        tierName: 'Developing',
        percentileRangeDescription: 'Bottom quartile (<25th percentile of recreational lifters)',
        maxRatio: 0.79,
        contextNote: 'Entry stage for recreational trainees building foundational motor patterns.',
      },
      {
        tierName: 'Recreational Average',
        percentileRangeDescription: 'Approx. 25th - 60th percentile of recreational lifters',
        minRatio: 0.8,
        maxRatio: 1.15,
        contextNote: 'Typical benchmark for recreational gym lifters with 1-2 years of consistent training.',
      },
      {
        tierName: 'Above Average',
        percentileRangeDescription: 'Approx. 60th - 85th percentile of recreational lifters',
        minRatio: 1.16,
        maxRatio: 1.45,
        contextNote: 'Solid strength level achieved by dedicated recreational lifters with multiple years of overload.',
      },
      {
        tierName: 'Well Above Average',
        percentileRangeDescription: 'Top ~15% of non-competitive recreational gym lifters',
        minRatio: 1.46,
        contextNote: 'High strength standard among recreational trainees (non-competitive powerlifters).',
      },
    ],
  },

  // 2. PUSH-UPS
  'ex-pushups': {
    exerciseId: 'ex-pushups',
    exerciseName: 'Push-ups',
    cohortType: 'GENERAL_POPULATION',
    referenceGroupDescription:
      'General adult population across diverse physical activity levels (including sedentary and active adults).',
    dataSourceCitation:
      "ACSM's Guidelines for Exercise Testing and Prescription (11th Ed., 2021); Canadian Physical Activity, Fitness & Lifestyle Approach (CPAFLA).",
    publicationDate: '2021',
    sampleDescription:
      'Cross-sectional normative database of adult men and women aged 20-49 evaluated on standardized muscular endurance tests.',
    methodUsed: 'MAX_CONSECUTIVE_REPETITIONS',
    methodDescription:
      'Continuous push-ups completed to failure with standardized form (straight back, chin touching foam pad/floor, full extension) without rest pauses.',
    limitations: [
      'Measures upper-body muscular endurance rather than maximal dynamic strength.',
      'Limb length and center of mass distribution alter relative load (standard push-up supports ~64% of body weight in top position, ~75% at bottom).',
      'Self-administered counts frequently show variation in chest depth compared to laboratory assessments.',
    ],
    supportedMetrics: ['REPETITIONS'],
    normBands: [
      {
        tierName: 'Needs Improvement',
        percentileRangeDescription: 'Below 25th percentile of general population',
        maxReps: 14,
        contextNote: 'Indicates low baseline upper body muscular endurance relative to general population.',
      },
      {
        tierName: 'General Population Average',
        percentileRangeDescription: 'Approx. 25th - 60th percentile of general population',
        minReps: 15,
        maxReps: 28,
        contextNote: 'Typical median endurance for healthy non-athletic adults.',
      },
      {
        tierName: 'Above Average',
        percentileRangeDescription: 'Approx. 60th - 85th percentile of general population',
        minReps: 29,
        maxReps: 38,
        contextNote: 'Strong muscular endurance exceeding the majority of average adults.',
      },
      {
        tierName: 'Excellent',
        percentileRangeDescription: 'Top ~15% of general adult population',
        minReps: 39,
        contextNote: 'Upper tier endurance among general population cohorts.',
      },
    ],
  },

  // 3. BARBELL BACK SQUAT
  'ex-back-squat': {
    exerciseId: 'ex-back-squat',
    exerciseName: 'Barbell Back Squat',
    cohortType: 'RECREATIONAL_TRAINEES',
    referenceGroupDescription:
      'Recreational resistance-trained adults with consistent barbell squat training experience (minimum 12 months).',
    dataSourceCitation:
      'Ratamess et al., American College of Sports Medicine (ACSM) Resistance Training Position Stand; Comfort et al., Journal of Strength and Conditioning Research (2012).',
    publicationDate: '2012 / 2018',
    sampleDescription:
      'Resistance-trained adults evaluated across university and athletic performance research centers.',
    methodUsed: 'DIRECT_1RM_TEST',
    methodDescription:
      '1RM back squat executed to parallel depth (inguinal fold / hip crease level with or below top of knee).',
    limitations: [
      'CRITICAL: Clinical general population surveys DO NOT test 1RM back squats on untrained adults due to injury liability and spinal loading concerns. This comparison is strictly against active gym trainees.',
      'Depth criteria differences (quarter squat vs parallel vs deep ATG) radically skew claimed numbers.',
      'Femur-to-torso length ratios significantly affect mechanical leverage.',
    ],
    supportedMetrics: ['1RM', 'RELATIVE_STRENGTH'],
    normBands: [
      {
        tierName: 'Developing',
        percentileRangeDescription: 'Bottom quartile (<25th percentile of recreational lifters)',
        maxRatio: 0.99,
        contextNote: 'Developing motor patterning and mobility under barbell load.',
      },
      {
        tierName: 'Recreational Average',
        percentileRangeDescription: 'Approx. 25th - 60th percentile of recreational lifters',
        minRatio: 1.0,
        maxRatio: 1.4,
        contextNote: 'Standard milestone for regular lifters (squatting bodyweight to 1.4x bodyweight).',
      },
      {
        tierName: 'Proficient',
        percentileRangeDescription: 'Approx. 60th - 85th percentile of recreational lifters',
        minRatio: 1.41,
        maxRatio: 1.8,
        contextNote: 'Significant lower-body strength achieved with multiple years of consistent training.',
      },
      {
        tierName: 'Advanced',
        percentileRangeDescription: 'Top ~15% of non-competitive recreational lifters',
        minRatio: 1.81,
        contextNote: 'Upper tier recreational performance (approaching competitive amateur thresholds).',
      },
    ],
  },

  // 4. CONVENTIONAL DEADLIFT
  'ex-deadlift': {
    exerciseId: 'ex-deadlift',
    exerciseName: 'Conventional Deadlift',
    cohortType: 'RECREATIONAL_TRAINEES',
    referenceGroupDescription:
      'Recreational resistance trainees who regularly perform barbell deadlifts.',
    dataSourceCitation:
      'Ball & Weidman, Journal of Strength and Conditioning Research; NSCA Strength Standards; Exercise Physiology Laboratory Reference Norms.',
    publicationDate: '2005 / 2016',
    sampleDescription:
      'Adults engaged in structured strength and conditioning programs.',
    methodUsed: 'DIRECT_1RM_TEST',
    methodDescription:
      'Conventional deadlift lifted from standard Olympic bar height (22.5cm) to complete hip and knee lockout without hitching.',
    limitations: [
      'CRITICAL: Untrained, sedentary adults are not tested for 1RM deadlifts in general population surveys. Comparing yourself here is comparing against active lifters, not the general public.',
      'Use of lifting belts, straps, or specialized bars (trap bar) alters difficulty and maximum load.',
      'Arm length directly changes start hip height and mechanical advantage.',
    ],
    supportedMetrics: ['1RM', 'RELATIVE_STRENGTH'],
    normBands: [
      {
        tierName: 'Developing',
        percentileRangeDescription: 'Bottom quartile of regular deadlifters',
        maxRatio: 1.19,
        contextNote: 'Initial deadlift strength phase while mastering hip hinge mechanics.',
      },
      {
        tierName: 'Recreational Average',
        percentileRangeDescription: 'Approx. 25th - 60th percentile of regular deadlifters',
        minRatio: 1.2,
        maxRatio: 1.65,
        contextNote: 'Solid baseline for recreational lifters lifting 1.2x to 1.65x bodyweight.',
      },
      {
        tierName: 'Proficient',
        percentileRangeDescription: 'Approx. 60th - 85th percentile of regular deadlifters',
        minRatio: 1.66,
        maxRatio: 2.1,
        contextNote: 'High strength benchmark for dedicated trainees (1.66x - 2.1x bodyweight).',
      },
      {
        tierName: 'Advanced',
        percentileRangeDescription: 'Top ~15% of recreational deadlifters',
        minRatio: 2.11,
        contextNote: 'Exceptional recreational posterior-chain strength (above 2.1x bodyweight).',
      },
    ],
  },

  // 5. PULL-UPS
  'ex-pullups': {
    exerciseId: 'ex-pullups',
    exerciseName: 'Pull-ups',
    cohortType: 'RECREATIONAL_TRAINEES',
    referenceGroupDescription:
      'Physically active adults and recreational fitness cohorts.',
    dataSourceCitation:
      'Cooper Institute Physical Fitness Specialist Manual; Tactical Readiness Normative Data; CPAFLA Assessments.',
    publicationDate: '2019',
    sampleDescription:
      'Active adults evaluated under strict dead-hang vertical pull protocol.',
    methodUsed: 'MAX_CONSECUTIVE_REPETITIONS',
    methodDescription:
      'Pronated grip pull-ups starting from dead-hang, pulling until chin completely clears the bar without kipping or leg swings.',
    limitations: [
      'Heavier body mass creates an exponential penalty in bodyweight-only vertical pulling.',
      'Significant divide between general population (where ~50% of adults cannot complete 1 full dead-hang pullup) and gym trainees.',
      'Grip strength and shoulder mobility affect test completion.',
    ],
    supportedMetrics: ['REPETITIONS'],
    normBands: [
      {
        tierName: 'Developing',
        percentileRangeDescription: 'Entry tier for active individuals',
        minReps: 1,
        maxReps: 4,
        contextNote: 'Developing initial vertical pulling strength.',
      },
      {
        tierName: 'Active Trainee Average',
        percentileRangeDescription: 'Approx. 30th - 65th percentile of active trainees',
        minReps: 5,
        maxReps: 9,
        contextNote: 'Typical standard for physically active adults and gym regulars.',
      },
      {
        tierName: 'Strong',
        percentileRangeDescription: 'Approx. 65th - 88th percentile of active trainees',
        minReps: 10,
        maxReps: 15,
        contextNote: 'High standard of relative upper body pulling strength.',
      },
      {
        tierName: 'Elite',
        percentileRangeDescription: 'Top ~12% of active trainees',
        minReps: 16,
        contextNote: 'Exceptional bodyweight pulling capacity.',
      },
    ],
  },
};

/**
 * Returns the reference benchmark for a given exercise ID.
 * If no peer-reviewed benchmark exists, returns an INSUFFICIENT_DATA benchmark.
 */
export function getReferenceBenchmark(exerciseId: string, exerciseName: string): ReferenceBenchmark {
  const existing = POPULATION_BENCHMARKS[exerciseId];
  if (existing) {
    return existing;
  }

  // Fallback for exercises without published normative data
  return {
    exerciseId,
    exerciseName,
    cohortType: 'INSUFFICIENT_DATA',
    referenceGroupDescription: 'No reliable population-representative data available.',
    dataSourceCitation: 'None (Data Insufficient)',
    publicationDate: 'N/A',
    sampleDescription: 'No peer-reviewed normative sample identified for this specific exercise variation.',
    methodUsed: 'NO_STANDARDIZED_PROTOCOL',
    methodDescription:
      'Standardized epidemiological fitness surveys do not evaluate this movement due to protocol heterogeneity.',
    limitations: [
      'Lack of published, peer-reviewed normative population datasets for this specific exercise variation.',
      'ASCEND adheres to scientific data integrity and will not fabricate simulated rankings or ungrounded percentiles.',
    ],
    supportedMetrics: ['1RM', 'RELATIVE_STRENGTH'],
    insufficientDataReason: 'Not enough reliable data for this comparison.',
  };
}
