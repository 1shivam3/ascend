export type MuscleGroup = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
export type EquipmentType = 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Smith Machine';

export interface ExerciseItem {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: EquipmentType;
  isBodyweight?: boolean;
  defaultReps?: number;
  defaultWeightKg?: number;
}

export const EXERCISE_LIBRARY: ExerciseItem[] = [
  // ── CHEST ─────────────────────────────────────────────────────────────
  { id: 'bench_press', name: 'Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 60 },
  { id: 'incline_bench', name: 'Incline Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 50 },
  { id: 'decline_bench', name: 'Decline Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 55 },
  { id: 'close_grip_bench', name: 'Close-Grip Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 50 },
  { id: 'db_press', name: 'Dumbbell Bench Press', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 22 },
  { id: 'incline_db_press', name: 'Incline Dumbbell Press', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 20 },
  { id: 'decline_db_press', name: 'Decline Dumbbell Press', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 20 },
  { id: 'db_fly', name: 'Dumbbell Chest Fly', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 12 },
  { id: 'incline_db_fly', name: 'Incline Dumbbell Fly', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 10 },
  { id: 'chest_press_machine', name: 'Machine Chest Press', muscle: 'Chest', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 45 },
  { id: 'incline_chest_machine', name: 'Incline Machine Chest Press', muscle: 'Chest', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 40 },
  { id: 'pec_deck', name: 'Pec Deck / Chest Fly Machine', muscle: 'Chest', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 35 },
  { id: 'cable_crossover_high', name: 'Cable Crossover (High to Low)', muscle: 'Chest', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 15 },
  { id: 'cable_crossover_low', name: 'Cable Crossover (Low to High)', muscle: 'Chest', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 12 },
  { id: 'cable_chest_press', name: 'Standing Cable Chest Press', muscle: 'Chest', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 20 },
  { id: 'push_ups', name: 'Push-ups', muscle: 'Chest', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 },
  { id: 'chest_dips', name: 'Chest Dips', muscle: 'Chest', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 10, defaultWeightKg: 0 },
  { id: 'smith_bench', name: 'Smith Machine Bench Press', muscle: 'Chest', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 50 },
  { id: 'smith_incline_bench', name: 'Smith Machine Incline Press', muscle: 'Chest', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 45 },

  // ── BACK ──────────────────────────────────────────────────────────────
  { id: 'deadlift', name: 'Conventional Deadlift', muscle: 'Back', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 100 },
  { id: 'sumo_deadlift', name: 'Sumo Deadlift', muscle: 'Back', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 100 },
  { id: 'barbell_row', name: 'Barbell Bent-Over Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 60 },
  { id: 'pendlay_row', name: 'Pendlay Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 60 },
  { id: 't_bar_row', name: 'T-Bar Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 45 },
  { id: 'romanian_deadlift', name: 'Romanian Deadlift (RDL)', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 80 },
  { id: 'pull_ups', name: 'Pull-ups', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 8, defaultWeightKg: 0 },
  { id: 'chin_ups', name: 'Chin-ups', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 8, defaultWeightKg: 0 },
  { id: 'inverted_row', name: 'Inverted Bodyweight Row', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 },
  { id: 'lat_pulldown', name: 'Lat Pulldown', muscle: 'Back', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 50 },
  { id: 'close_grip_pulldown', name: 'Close-Grip Lat Pulldown', muscle: 'Back', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 50 },
  { id: 'seated_cable_row', name: 'Seated Cable Row', muscle: 'Back', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 50 },
  { id: 'single_arm_cable_row', name: 'Single-Arm Cable Row', muscle: 'Back', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 20 },
  { id: 'straight_arm_pulldown', name: 'Straight-Arm Cable Pulldown (Lat Prayer)', muscle: 'Back', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 25 },
  { id: 'db_row', name: 'Single-Arm Dumbbell Row', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 24 },
  { id: 'db_chest_supported_row', name: 'Chest-Supported Dumbbell Row', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 18 },
  { id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 22 },
  { id: 'chest_supported_machine_row', name: 'Chest-Supported Machine Row', muscle: 'Back', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 40 },
  { id: 'hyperextension', name: 'Back Hyperextension', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 },
  { id: 'barbell_shrug', name: 'Barbell Shrug', muscle: 'Back', equipment: 'Barbell', defaultReps: 12, defaultWeightKg: 70 },
  { id: 'db_shrug', name: 'Dumbbell Shrug', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 26 },

  // ── LEGS ──────────────────────────────────────────────────────────────
  { id: 'squat', name: 'Barbell Back Squat', muscle: 'Legs', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 80 },
  { id: 'front_squat', name: 'Barbell Front Squat', muscle: 'Legs', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 60 },
  { id: 'leg_press', name: 'Leg Press', muscle: 'Legs', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 140 },
  { id: 'hack_squat_machine', name: 'Hack Squat Machine', muscle: 'Legs', equipment: 'Machine', defaultReps: 8, defaultWeightKg: 70 },
  { id: 'leg_extension', name: 'Leg Extension', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 45 },
  { id: 'lying_leg_curl', name: 'Lying Leg Curl', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 40 },
  { id: 'seated_leg_curl', name: 'Seated Leg Curl', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 45 },
  { id: 'barbell_hip_thrust', name: 'Barbell Hip Thrust', muscle: 'Legs', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 90 },
  { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', muscle: 'Legs', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 14 },
  { id: 'goblet_squat', name: 'Goblet Squat', muscle: 'Legs', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 20 },
  { id: 'db_walking_lunge', name: 'Dumbbell Walking Lunge', muscle: 'Legs', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 14 },
  { id: 'standing_calf_raise', name: 'Standing Calf Raise', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 50 },
  { id: 'seated_calf_raise', name: 'Seated Calf Raise', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 35 },
  { id: 'abductor_machine', name: 'Hip Abductor Machine', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 45 },
  { id: 'adductor_machine', name: 'Hip Adductor Machine', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 45 },
  { id: 'bodyweight_squats', name: 'Bodyweight Squats', muscle: 'Legs', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 20, defaultWeightKg: 0 },
  { id: 'smith_squat', name: 'Smith Machine Squat', muscle: 'Legs', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 60 },

  // ── SHOULDERS ─────────────────────────────────────────────────────────
  { id: 'overhead_press', name: 'Overhead Press (Barbell OHP)', muscle: 'Shoulders', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 40 },
  { id: 'push_press', name: 'Barbell Push Press', muscle: 'Shoulders', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 50 },
  { id: 'db_shoulder_press', name: 'Seated Dumbbell Shoulder Press', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 18 },
  { id: 'arnold_press', name: 'Arnold Press', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 16 },
  { id: 'db_lateral_raise', name: 'Dumbbell Lateral Raise', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 15, defaultWeightKg: 8 },
  { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', muscle: 'Shoulders', equipment: 'Cable', defaultReps: 15, defaultWeightKg: 7 },
  { id: 'machine_lateral_raise', name: 'Machine Lateral Raise', muscle: 'Shoulders', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 25 },
  { id: 'face_pull', name: 'Cable Face Pull', muscle: 'Shoulders', equipment: 'Cable', defaultReps: 15, defaultWeightKg: 25 },
  { id: 'rear_delt_fly', name: 'Dumbbell Rear Delt Fly', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 15, defaultWeightKg: 8 },
  { id: 'rear_delt_machine', name: 'Rear Delt Pec Deck Machine', muscle: 'Shoulders', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 30 },
  { id: 'front_raise', name: 'Dumbbell Front Raise', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 10 },
  { id: 'upright_row', name: 'Barbell / Cable Upright Row', muscle: 'Shoulders', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 35 },
  { id: 'smith_ohp', name: 'Smith Machine Shoulder Press', muscle: 'Shoulders', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 40 },

  // ── ARMS ──────────────────────────────────────────────────────────────
  { id: 'barbell_curl', name: 'Barbell Bicep Curl', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 30 },
  { id: 'ez_bar_curl', name: 'EZ-Bar Bicep Curl', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 27 },
  { id: 'db_curl', name: 'Dumbbell Bicep Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 14 },
  { id: 'incline_db_curl', name: 'Incline Dumbbell Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 12 },
  { id: 'hammer_curl', name: 'Dumbbell Hammer Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 14 },
  { id: 'preacher_curl', name: 'Preacher Curl (EZ Bar)', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 25 },
  { id: 'cable_bicep_curl', name: 'Cable Bicep Curl', muscle: 'Arms', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 25 },
  { id: 'concentration_curl', name: 'Concentration Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 10 },
  { id: 'tricep_pushdown_rope', name: 'Tricep Rope Pushdown', muscle: 'Arms', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 25 },
  { id: 'tricep_pushdown_bar', name: 'Straight-Bar Cable Pushdown', muscle: 'Arms', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 30 },
  { id: 'skull_crushers', name: 'Skull Crushers (Lying EZ-Bar Extension)', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 25 },
  { id: 'overhead_db_tricep', name: 'Overhead Dumbbell Tricep Extension', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 20 },
  { id: 'overhead_cable_tricep', name: 'Overhead Cable Tricep Extension', muscle: 'Arms', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 22 },
  { id: 'tricep_dips', name: 'Tricep Dips (Bench / Parallel Bars)', muscle: 'Arms', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 },
  { id: 'diamond_pushups', name: 'Diamond Push-ups', muscle: 'Arms', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 },
  { id: 'wrist_curl', name: 'Barbell Wrist Curl', muscle: 'Arms', equipment: 'Barbell', defaultReps: 15, defaultWeightKg: 20 },

  // ── CORE ──────────────────────────────────────────────────────────────
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 },
  { id: 'hanging_knee_raise', name: 'Hanging Knee Raise', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 },
  { id: 'captain_chair_raise', name: "Captain's Chair Knee/Leg Raise", muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 },
  { id: 'cable_crunch', name: 'Kneeling Cable Crunch', muscle: 'Core', equipment: 'Cable', defaultReps: 15, defaultWeightKg: 35 },
  { id: 'cable_woodchopper', name: 'Cable Woodchopper', muscle: 'Core', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 20 },
  { id: 'ab_wheel_rollout', name: 'Ab Wheel Rollout', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 10, defaultWeightKg: 0 },
  { id: 'plank', name: 'Front Plank (Seconds)', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 45, defaultWeightKg: 0 },
  { id: 'side_plank', name: 'Side Plank (Seconds)', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 30, defaultWeightKg: 0 },
  { id: 'russian_twist', name: 'Russian Twist (Reps per side)', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 20, defaultWeightKg: 0 },
  { id: 'decline_crunch', name: 'Decline Bench Crunch', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 },
  { id: 'machine_crunch', name: 'Abdominal Crunch Machine', muscle: 'Core', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 35 },
];

export const MUSCLE_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export const EQUIPMENT_TYPES: EquipmentType[] = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Smith Machine'];

/**
 * Filter exercises by muscle, equipment, and search query.
 */
export function searchExercises(
  query = '',
  selectedMuscle?: MuscleGroup | 'All',
  selectedEquipment?: EquipmentType | 'All'
): ExerciseItem[] {
  const cleanQ = query.toLowerCase().trim();

  return EXERCISE_LIBRARY.filter((ex) => {
    if (selectedMuscle && selectedMuscle !== 'All' && ex.muscle !== selectedMuscle) {
      return false;
    }
    if (selectedEquipment && selectedEquipment !== 'All' && ex.equipment !== selectedEquipment) {
      return false;
    }
    if (cleanQ) {
      const matchName = ex.name.toLowerCase().includes(cleanQ);
      const matchMuscle = ex.muscle.toLowerCase().includes(cleanQ);
      const matchEquip = ex.equipment.toLowerCase().includes(cleanQ);
      return matchName || matchMuscle || matchEquip;
    }
    return true;
  });
}

/**
 * Returns complete list of exercise names.
 */
export function getAllExerciseNames(): string[] {
  return EXERCISE_LIBRARY.map((e) => e.name);
}

/**
 * Resolves any exercise name (including custom or partial names) to its target MuscleGroup.
 */
export function getExerciseMuscle(name: string): MuscleGroup {
  if (!name || typeof name !== 'string') return 'Chest';
  const clean = name.toLowerCase().trim();
  const direct = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (direct) return direct.muscle;

  const partial = EXERCISE_LIBRARY.find(
    (e) => clean.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(clean)
  );
  if (partial) return partial.muscle;

  // Keyword heuristic matching
  if (clean.includes('bench') || clean.includes('chest') || clean.includes('fly') || clean.includes('pec') || clean.includes('push-up') || clean.includes('pushup')) return 'Chest';
  if (clean.includes('pull') || clean.includes('row') || clean.includes('lat') || clean.includes('deadlift') || clean.includes('chin') || clean.includes('shrug')) return 'Back';
  if (clean.includes('squat') || clean.includes('leg') || clean.includes('lunge') || clean.includes('calf') || clean.includes('calves') || clean.includes('quad') || clean.includes('hamstring') || clean.includes('rdl')) return 'Legs';
  if (clean.includes('press') || clean.includes('overhead') || clean.includes('shoulder') || clean.includes('lateral raise') || clean.includes('delt') || clean.includes('ohp')) return 'Shoulders';
  if (clean.includes('curl') || clean.includes('tricep') || clean.includes('bicep') || clean.includes('skull') || clean.includes('dip') || clean.includes('arm')) return 'Arms';
  if (clean.includes('abs') || clean.includes('crunch') || clean.includes('plank') || clean.includes('core') || clean.includes('twist')) return 'Core';

  return 'Chest';
}
