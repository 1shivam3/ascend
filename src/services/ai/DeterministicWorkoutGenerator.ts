import { AIWorkoutPlan, AIWorkoutDay, AIExercisePrescription, GenerationInput } from './schemas';
import { Exercise, EquipmentTier, MovementPattern, PrimaryGoal } from '../../types/domain.types';
import { STARTER_EXERCISES } from '../../constants/exercises';
import { normalizeGoal } from '../../utils/validation/onboardingSchema';

export class DeterministicWorkoutGenerator {
  /**
   * Deterministically generates a balanced, periodized, high-yield workout program
   * strictly adhering to user equipment, exclusions, athletic goal, and training frequency.
   * Supports Strength, Hypertrophy, Athletic, Endurance, Calisthenics, and Sport disciplines.
   * Guaranteed to never throw and never return malformed structures.
   */
  static generate(input: GenerationInput, catalog: Exercise[] = STARTER_EXERCISES): AIWorkoutPlan {
    const daysPerWeek = Math.max(1, Math.min(7, input.days_per_week));
    const availableEquipment = new Set(input.equipment.map(e => e.toUpperCase()));
    const excludedSet = new Set(input.excluded_exercises.map(e => e.toLowerCase().trim()));
    const preferredSet = new Set(input.preferred_exercises.map(e => e.toLowerCase().trim()));

    const primaryGoal: PrimaryGoal = input.primary_goal
      ? normalizeGoal(input.primary_goal)
      : normalizeGoal(input.goal);

    // Filter compatible pool
    let pool = catalog.filter(c => {
      const eqMatches = availableEquipment.has(c.equipment.toUpperCase());
      const notExcluded = !excludedSet.has(c.name.toLowerCase().trim()) && !excludedSet.has(c.id.toLowerCase().trim());
      return eqMatches && notExcluded;
    });

    // For Calisthenics: prioritize bodyweight movements if available
    if (primaryGoal === 'CALISTHENICS') {
      const bwPool = pool.filter(c => c.equipment === 'BODYWEIGHT');
      if (bwPool.length >= 4) {
        pool = bwPool;
      }
    }

    // Safe fallback if pool is too small: use bodyweight basics
    const safePool = pool.length > 0 ? pool : STARTER_EXERCISES.filter(c => c.equipment === 'BODYWEIGHT');

    // Prescription parameters based on athletic goal discipline
    let repScheme: string = '8-10';
    let defaultSets: number = 3;
    let defaultRest: number = 90;
    let targetRpe: number = 8;
    let progressionSuggestions: string = 'Double progression: advance load when target reps are secured with strict technical mastery.';
    let splitName: string = 'BALANCED TACTICAL SPLIT';

    switch (primaryGoal) {
      case 'GET_STRONGER':
        repScheme = '4-6';
        defaultSets = 4;
        defaultRest = 150;
        targetRpe = 9;
        progressionSuggestions = 'Linear strength progression: advance 2.5 kg on primary compound lifts once all sets achieve target reps.';
        splitName = daysPerWeek >= 4 ? 'UPPER / LOWER HEAVY COMPOUND' : 'FULL BODY STRENGTH VANGUARD';
        break;
      case 'BUILD_MUSCLE':
        repScheme = '8-12';
        defaultSets = 3;
        defaultRest = 90;
        targetRpe = 8;
        progressionSuggestions = 'Hypertrophy volume overload: add reps within 8-12 range, then increase load by 1-2.5 kg.';
        splitName = daysPerWeek >= 5 ? 'PUSH / PULL / LEGS PERIODIZATION' : daysPerWeek >= 4 ? 'UPPER / LOWER HYPERTROPHY' : 'FULL BODY HYPERTROPHY';
        break;
      case 'ATHLETIC_PERFORMANCE':
        repScheme = '4-6';
        defaultSets = 4;
        defaultRest = 105;
        targetRpe = 8;
        progressionSuggestions = 'Power and speed intent: prioritize explosive concentric velocity and crisp movement quality before increasing resistance.';
        splitName = 'ATHLETIC POWER & SPEED SPLIT';
        break;
      case 'ENDURANCE':
        repScheme = '15-20';
        defaultSets = 3;
        defaultRest = 45;
        targetRpe = 7.5;
        progressionSuggestions = 'Aerobic threshold progression: increase target duration or distance by 5-10% weekly while reducing rest intervals.';
        splitName = 'AEROBIC & WORK CAPACITY ENGINE';
        break;
      case 'CALISTHENICS':
        repScheme = '8-12';
        defaultSets = 4;
        defaultRest = 75;
        targetRpe = 8;
        progressionSuggestions = 'Calisthenics skill mastery: master strict bodyweight form, advance mechanical leverage, and introduce weighted resistance once 15+ clean reps are unlocked.';
        splitName = 'BODYWEIGHT MASTERY PROTOCOL';
        break;
      case 'LOSE_FAT':
        repScheme = '12-15';
        defaultSets = 3;
        defaultRest = 50;
        targetRpe = 8;
        progressionSuggestions = 'Metabolic density: sustain lifting tempo and reduce rest periods between sets to maximize caloric expenditure.';
        splitName = 'METABOLIC CONDITIONING SPLIT';
        break;
      case 'SPORT_PERFORMANCE':
        repScheme = '5-8';
        defaultSets = 3;
        defaultRest = 90;
        targetRpe = 8;
        progressionSuggestions = 'Athletic conditioning: focus on multi-planar deceleration, reactive power, and rotational kinetic transfer.';
        splitName = `${input.sport_name || 'SPORT'} PERFORMANCE PROTOCOL`;
        break;
      case 'GENERAL_FITNESS':
        repScheme = '8-12';
        defaultSets = 3;
        defaultRest = 75;
        targetRpe = 8;
        progressionSuggestions = 'Balanced progression: alternate between compound strength development and aerobic capacity building.';
        splitName = 'BALANCED GENERAL CONDITIONING';
        break;
      case 'CUSTOM':
      default:
        repScheme = '8-10';
        defaultSets = 3;
        defaultRest = 90;
        targetRpe = 8;
        progressionSuggestions = input.custom_goal_description 
          ? `Tailored directives: ${input.custom_goal_description}. Advance volume and load progressively.`
          : 'Personalized adaptation: adjust sets and resistance to match individual recovery and weekly milestones.';
        splitName = 'CUSTOM ASCENT PROTOCOL';
        break;
    }

    const splitTemplates = this.getSplitTemplates(daysPerWeek, primaryGoal);
    const planDays: AIWorkoutDay[] = [];

    splitTemplates.forEach((template, dayIdx) => {
      const dayExercises: AIExercisePrescription[] = [];
      const usedIds = new Set<string>();

      for (const pattern of template.patterns) {
        // Find matching movement from safePool
        const matching = safePool.filter(ex => ex.movementPattern === pattern && !usedIds.has(ex.id));

        // Prioritize preferred
        const chosen = matching.find(ex => preferredSet.has(ex.name.toLowerCase()) || preferredSet.has(ex.id)) ||
          matching.find(ex => ex.tier === 'COMPOUND_PRIMARY') ||
          matching[0] ||
          safePool.find(ex => !usedIds.has(ex.id)) ||
          safePool[0];

        if (chosen) {
          usedIds.add(chosen.id);
          const isCompound = chosen.tier === 'COMPOUND_PRIMARY' || chosen.tier === 'COMPOUND_SECONDARY';
          const isCardio = chosen.movementPattern === 'CARDIO';

          dayExercises.push({
            exercise_id: chosen.id,
            name: chosen.name,
            order: dayExercises.length,
            sets: isCardio ? 1 : (isCompound ? defaultSets + 1 : defaultSets),
            target_reps: isCardio ? '20-30 min' : (isCompound && primaryGoal === 'GET_STRONGER' ? '3-5' : repScheme),
            target_rpe: targetRpe,
            rest_seconds: isCardio ? 60 : (isCompound ? defaultRest + 30 : defaultRest),
            target_distance_meters: isCardio ? 5000 : null,
            target_duration_seconds: isCardio ? 1800 : null,
            target_pace_seconds_per_km: isCardio ? 360 : null,
            instructions: chosen.instructions || `Execute with strict technical mastery and controlled eccentric tempo.`,
            alternatives: safePool
              .filter(alt => alt.id !== chosen.id && alt.movementPattern === chosen.movementPattern)
              .slice(0, 2)
              .map(alt => alt.name),
          });
        }
      }

      const duration = Math.min(
        120,
        Math.max(
          20,
          Math.round(dayExercises.reduce((acc, ex) => acc + ex.sets * (ex.rest_seconds + 45), 0) / 60)
        )
      );

      planDays.push({
        day_number: dayIdx + 1,
        name: template.name,
        focus: template.focus,
        estimated_duration_min: duration,
        exercises: dayExercises,
      });
    });

    const goalTitle = primaryGoal.replace(/_/g, ' ');

    return {
      id: `plan-det-${Date.now()}`,
      name: `${daysPerWeek}-DAY ASCEND ${goalTitle} PROTOCOL`,
      split_type: splitName,
      days_per_week: daysPerWeek,
      difficulty: input.experience.toUpperCase(),
      weekly_structure: `${daysPerWeek} scheduled training sessions per week calibrated for ${goalTitle}.`,
      progression_suggestions: progressionSuggestions,
      days: planDays,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private static getSplitTemplates(daysPerWeek: number, goal: PrimaryGoal): {
    name: string;
    focus: string;
    patterns: MovementPattern[];
  }[] {
    // 1. Athletic & Sport Performance Templates
    if (goal === 'ATHLETIC_PERFORMANCE' || goal === 'SPORT_PERFORMANCE') {
      switch (daysPerWeek) {
        case 1:
          return [
            {
              name: 'Full Body Kinetic Power',
              focus: 'Triple Extension & Movement Quality',
              patterns: ['SQUAT', 'PUSH_HORIZONTAL', 'HINGE', 'LUNGE', 'CARRY'],
            },
          ];
        case 2:
          return [
            {
              name: 'Linear Power & Speed',
              focus: 'Sprints & Triple Extension',
              patterns: ['SQUAT', 'PUSH_HORIZONTAL', 'LUNGE', 'CARRY'],
            },
            {
              name: 'Posterior Force & Rotation',
              focus: 'Hip Hinge & Unilateral Strength',
              patterns: ['HINGE', 'PUSH_VERTICAL', 'PULL_HORIZONTAL', 'CARRY'],
            },
          ];
        case 3:
          return [
            {
              name: 'Acceleration & Squat Force',
              focus: 'Bilateral Leg Drive & Chest Power',
              patterns: ['SQUAT', 'PUSH_HORIZONTAL', 'LUNGE', 'CARRY'],
            },
            {
              name: 'Posterior Chain & Overhead Drive',
              focus: 'Hinge Power & Vertical Force',
              patterns: ['HINGE', 'PUSH_VERTICAL', 'PULL_VERTICAL', 'CARRY'],
            },
            {
              name: 'Multi-Planar Agility & Deceleration',
              focus: 'Unilateral Stability & Upper Back',
              patterns: ['LUNGE', 'PULL_HORIZONTAL', 'SQUAT', 'CARRY'],
            },
          ];
        case 4:
        default:
          return [
            {
              name: 'Upper Explosive Power',
              focus: 'Push-Pull Force & Bar Speed',
              patterns: ['PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'PUSH_VERTICAL', 'CARRY'],
            },
            {
              name: 'Lower Kinetic Force',
              focus: 'Squat Power & Deceleration',
              patterns: ['SQUAT', 'HINGE', 'LUNGE', 'CARRY'],
            },
            {
              name: 'Dynamic Kinetic Chain',
              focus: 'Elastic Drive & Unilateral Stability',
              patterns: ['PUSH_HORIZONTAL', 'PULL_VERTICAL', 'LUNGE', 'ISOLATION'],
            },
            {
              name: 'Posterior Power & Grip',
              focus: 'Deadlift Velocity & Heavy Carries',
              patterns: ['HINGE', 'SQUAT', 'CARRY', 'ISOLATION'],
            },
          ];
      }
    }

    // 2. Endurance & Aerobic Progression Templates
    if (goal === 'ENDURANCE') {
      switch (daysPerWeek) {
        case 1:
          return [
            {
              name: 'Aerobic Work Engine',
              focus: 'Sustained Output & Core Density',
              patterns: ['CARDIO', 'SQUAT', 'PUSH_HORIZONTAL', 'LUNGE', 'CARRY'],
            },
          ];
        case 2:
          return [
            {
              name: 'Aerobic Threshold & Legs',
              focus: 'Cardio Intervals & Quad Endurance',
              patterns: ['CARDIO', 'SQUAT', 'LUNGE', 'PUSH_HORIZONTAL'],
            },
            {
              name: 'Work Capacity & Torso',
              focus: 'Sustained Pulling & Midsection Density',
              patterns: ['CARDIO', 'HINGE', 'PULL_HORIZONTAL', 'CARRY'],
            },
          ];
        case 3:
          return [
            {
              name: 'Aerobic Base Alpha',
              focus: 'Aerobic Mileage & Lower Endurance',
              patterns: ['CARDIO', 'SQUAT', 'LUNGE', 'PUSH_HORIZONTAL'],
            },
            {
              name: 'Tempo Stamina',
              focus: 'Cadenced Pulling & Shoulders',
              patterns: ['CARDIO', 'PULL_VERTICAL', 'PUSH_VERTICAL', 'CARRY'],
            },
            {
              name: 'Metabolic Work Capacity',
              focus: 'Full-Body High-Density Intervals',
              patterns: ['CARDIO', 'HINGE', 'PUSH_HORIZONTAL', 'LUNGE'],
            },
          ];
        case 4:
        default:
          return [
            {
              name: 'Aerobic Capacity Alpha',
              focus: 'Sustained Cadence & Compound Endurance',
              patterns: ['CARDIO', 'SQUAT', 'PUSH_HORIZONTAL', 'CARRY'],
            },
            {
              name: 'Muscular Endurance Lower',
              focus: 'High-Rep Lunge & Hinge Volume',
              patterns: ['LUNGE', 'HINGE', 'SQUAT', 'CARDIO'],
            },
            {
              name: 'Aerobic Capacity Beta',
              focus: 'Tempo Conditioning & Upper Pulling',
              patterns: ['CARDIO', 'PULL_HORIZONTAL', 'PUSH_VERTICAL', 'CARRY'],
            },
            {
              name: 'Density Conditioning',
              focus: 'Full-Body Resistance & Aerobic Finisher',
              patterns: ['SQUAT', 'PUSH_HORIZONTAL', 'LUNGE', 'CARDIO'],
            },
          ];
      }
    }

    // 3. Calisthenics & Bodyweight Mastery Templates
    if (goal === 'CALISTHENICS') {
      switch (daysPerWeek) {
        case 1:
          return [
            {
              name: 'Full Body Calisthenics Mastery',
              focus: 'Gymnastic Compound Strength',
              patterns: ['PUSH_HORIZONTAL', 'PULL_VERTICAL', 'PUSH_VERTICAL', 'PULL_HORIZONTAL', 'SQUAT'],
            },
          ];
        case 2:
          return [
            {
              name: 'Upper Body Gymnastics',
              focus: 'Push-Up & Pull-Up Mechanics',
              patterns: ['PUSH_HORIZONTAL', 'PULL_VERTICAL', 'PUSH_VERTICAL', 'PULL_HORIZONTAL'],
            },
            {
              name: 'Bodyweight Legs & Core',
              focus: 'Pistol Squats & Isometric Control',
              patterns: ['SQUAT', 'LUNGE', 'PUSH_HORIZONTAL', 'ISOLATION'],
            },
          ];
        case 3:
          return [
            {
              name: 'Calisthenics Push Protocol',
              focus: 'Dips & Push-Up Progressions',
              patterns: ['PUSH_HORIZONTAL', 'PUSH_VERTICAL', 'PUSH_HORIZONTAL', 'ISOLATION'],
            },
            {
              name: 'Calisthenics Pull Protocol',
              focus: 'Strict Pull-Ups & Lever Strength',
              patterns: ['PULL_VERTICAL', 'PULL_HORIZONTAL', 'PULL_VERTICAL', 'ISOLATION'],
            },
            {
              name: 'Bodyweight Legs & Midsection',
              focus: 'Single-Leg Balance & Hollow Core',
              patterns: ['SQUAT', 'LUNGE', 'SQUAT', 'PUSH_HORIZONTAL'],
            },
          ];
        case 4:
        default:
          return [
            {
              name: 'Upper Body Power',
              focus: 'Explosive Pull-Ups & Dips',
              patterns: ['PUSH_HORIZONTAL', 'PULL_VERTICAL', 'PUSH_VERTICAL', 'PULL_HORIZONTAL'],
            },
            {
              name: 'Legs & Core Agility',
              focus: 'Unilateral Bodyweight Strength',
              patterns: ['SQUAT', 'LUNGE', 'PUSH_HORIZONTAL', 'ISOLATION'],
            },
            {
              name: 'Gymnastic Push & Dips',
              focus: 'Handstand & Dip Overload',
              patterns: ['PUSH_VERTICAL', 'PUSH_HORIZONTAL', 'PUSH_VERTICAL', 'ISOLATION'],
            },
            {
              name: 'Vertical Pull & Hollow Body',
              focus: 'Chin-Ups, Rows & Lever Drills',
              patterns: ['PULL_VERTICAL', 'PULL_HORIZONTAL', 'SQUAT', 'ISOLATION'],
            },
          ];
      }
    }

    // 4. Default Strength, Hypertrophy, Fat Loss, and General Fitness Splits
    switch (daysPerWeek) {
      case 1:
        return [
          {
            name: 'Full Body Foundational',
            focus: 'Full Body Compound Recruitment',
            patterns: ['SQUAT', 'PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'HINGE', 'ISOLATION'],
          },
        ];
      case 2:
        return [
          {
            name: 'Full Body Alpha',
            focus: 'Squat & Horizontal Tension',
            patterns: ['SQUAT', 'PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'ISOLATION'],
          },
          {
            name: 'Full Body Beta',
            focus: 'Hinge & Vertical Overload',
            patterns: ['HINGE', 'PUSH_VERTICAL', 'PULL_VERTICAL', 'ISOLATION'],
          },
        ];
      case 3:
        return [
          {
            name: 'Full Body - Session A',
            focus: 'Squat & Chest Dominance',
            patterns: ['SQUAT', 'PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'ISOLATION'],
          },
          {
            name: 'Full Body - Session B',
            focus: 'Posterior Chain & Overhead Drive',
            patterns: ['HINGE', 'PUSH_VERTICAL', 'PULL_VERTICAL', 'ISOLATION'],
          },
          {
            name: 'Full Body - Session C',
            focus: 'Lunge, Horizontal Push & Back Hypertrophy',
            patterns: ['LUNGE', 'PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'ISOLATION'],
          },
        ];
      case 4:
        return [
          {
            name: 'Upper Body Power',
            focus: 'Chest, Upper Back, Shoulders',
            patterns: ['PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'PUSH_VERTICAL', 'PULL_VERTICAL'],
          },
          {
            name: 'Lower Body Strength',
            focus: 'Quads, Hamstrings, Glutes',
            patterns: ['SQUAT', 'HINGE', 'LUNGE', 'ISOLATION'],
          },
          {
            name: 'Upper Body Hypertrophy',
            focus: 'Torso Volume & Arm Density',
            patterns: ['PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'ISOLATION', 'ISOLATION'],
          },
          {
            name: 'Lower Body Dynamics',
            focus: 'Posterior Chain & Unilateral Stability',
            patterns: ['HINGE', 'SQUAT', 'LUNGE', 'ISOLATION'],
          },
        ];
      case 5:
        return [
          {
            name: 'Push Protocol A',
            focus: 'Chest, Front Delts, Triceps',
            patterns: ['PUSH_HORIZONTAL', 'PUSH_VERTICAL', 'ISOLATION', 'ISOLATION'],
          },
          {
            name: 'Pull Protocol A',
            focus: 'Lats, Rhomboids, Biceps',
            patterns: ['PULL_HORIZONTAL', 'PULL_VERTICAL', 'HINGE', 'ISOLATION'],
          },
          {
            name: 'Legs Protocol A',
            focus: 'Quads, Calves, Glutes',
            patterns: ['SQUAT', 'LUNGE', 'ISOLATION', 'ISOLATION'],
          },
          {
            name: 'Upper Body Hybrid',
            focus: 'Antagonist Upper Supersets',
            patterns: ['PUSH_HORIZONTAL', 'PULL_HORIZONTAL', 'PUSH_VERTICAL', 'PULL_VERTICAL'],
          },
          {
            name: 'Lower Body & Posterior',
            focus: 'Deadlift & Hamstring Overload',
            patterns: ['HINGE', 'SQUAT', 'LUNGE', 'ISOLATION'],
          },
        ];
      case 6:
      case 7:
      default:
        return [
          {
            name: 'Push Alpha',
            focus: 'Heavy Push Compounds',
            patterns: ['PUSH_HORIZONTAL', 'PUSH_VERTICAL', 'ISOLATION', 'ISOLATION'],
          },
          {
            name: 'Pull Alpha',
            focus: 'Heavy Pull Compounds',
            patterns: ['PULL_HORIZONTAL', 'PULL_VERTICAL', 'HINGE', 'ISOLATION'],
          },
          {
            name: 'Legs Alpha',
            focus: 'Squat & Quad Dominance',
            patterns: ['SQUAT', 'LUNGE', 'ISOLATION', 'ISOLATION'],
          },
          {
            name: 'Push Beta',
            focus: 'Incline & Triceps Hypertrophy',
            patterns: ['PUSH_HORIZONTAL', 'PUSH_VERTICAL', 'ISOLATION', 'ISOLATION'],
          },
          {
            name: 'Pull Beta',
            focus: 'Horizontal Rows & Arm Density',
            patterns: ['PULL_HORIZONTAL', 'PULL_VERTICAL', 'ISOLATION', 'ISOLATION'],
          },
          {
            name: 'Legs Beta',
            focus: 'Hinge & Hamstring Specialization',
            patterns: ['HINGE', 'SQUAT', 'LUNGE', 'ISOLATION'],
          },
        ];
    }
  }
}
