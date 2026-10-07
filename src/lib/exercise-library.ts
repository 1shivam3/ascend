export type ResistanceMuscleGroup = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
export type MuscleGroup = ResistanceMuscleGroup | 'Conditioning';
export type EquipmentType = 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Smith Machine' | 'Cardio';

export interface ExerciseItem {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: EquipmentType;
  isBodyweight?: boolean;
  defaultReps?: number;
  defaultWeightKg?: number;
  howTo?: string[];
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

  // ── CONDITIONING & CARDIO ──────────────────────────────────────────────
  {
    id: 'zone2_cycling',
    name: 'Zone 2 Stationary Cycling',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 20,
    defaultWeightKg: 0,
    howTo: [
      'Maintain steady cadence (80–90 RPM) with light-to-moderate resistance.',
      'Heart rate should stay in aerobic zone (120–135 bpm, conversational pace).',
      'Breathe through nose or maintain steady rhythm without gasping.',
    ],
  },
  {
    id: 'incline_treadmill_walk',
    name: 'Incline Treadmill Walk',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 15,
    defaultWeightKg: 0,
    howTo: [
      'Set treadmill to 10–12% incline at 4.5–5.0 km/h walking speed.',
      'Do not hold onto handrails; pump arms naturally to maximize caloric burn.',
      'Maintain upright posture with chest proud and hips engaged.',
    ],
  },
  {
    id: 'rowing_intervals',
    name: 'Rowing Machine Intervals',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 8,
    defaultWeightKg: 0,
    howTo: [
      'Drive powerfully through legs first, lean back slightly, then pull handle to sternum.',
      'Perform 1 minute hard sprint effort followed by 1 minute easy paddle recovery.',
      'Keep core braced and spine neutral throughout stroke.',
    ],
  },
  {
    id: 'jump_rope',
    name: 'Jump Rope Intervals',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 5,
    defaultWeightKg: 0,
    howTo: [
      'Bounce lightly on balls of feet, keeping knees softly bent.',
      'Rotate rope using wrists rather than whole arms.',
      'Maintain rhythmic breathing through short work intervals.',
    ],
  },
  {
    id: 'stair_climber',
    name: 'Stair Climber (Stepmill)',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 15,
    defaultWeightKg: 0,
    howTo: [
      'Step fully on each tread with flat foot; do not step only on toes.',
      'Avoid leaning heavily on handrails; keep weight centered over hips.',
      'Maintain consistent pace between level 5–8.',
    ],
  },
  {
    id: 'kettlebell_swings',
    name: 'Kettlebell Swings',
    muscle: 'Conditioning',
    equipment: 'Dumbbell',
    defaultReps: 20,
    defaultWeightKg: 16,
    howTo: [
      'Hinge hips backward with soft knees; do not squat down.',
      'Snap hips forward violently to project bell to chest height.',
      'Keep core locked and spine neutral at the top lock-out.',
    ],
  },
  {
    id: 'farmers_walk',
    name: "Farmer's Walk",
    muscle: 'Conditioning',
    equipment: 'Dumbbell',
    defaultReps: 4,
    defaultWeightKg: 24,
    howTo: [
      'Deadlift heavy dumbbells or trap bar with flat back.',
      'Walk forward with short, deliberate, controlled strides.',
      'Brace core, pull shoulders back and down, resist any torso sway.',
    ],
  },
];

export const MUSCLE_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Conditioning'];
export const RESISTANCE_MUSCLE_GROUPS: ResistanceMuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export const EQUIPMENT_TYPES: EquipmentType[] = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Smith Machine', 'Cardio'];

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

/**
 * Returns secondary muscle groups that receive partial (~0.5 set) stimulus from compound movements.
 */
export function getExerciseSecondaryMuscles(name: string): MuscleGroup[] {
  if (!name || typeof name !== 'string') return [];
  const clean = name.toLowerCase().trim();

  // Horizontal push: Chest compounds activate Triceps (Arms) & Anterior Deltoids (Shoulders)
  if (clean.includes('bench') || clean.includes('push-up') || clean.includes('pushup') || clean.includes('chest press') || clean.includes('fly')) {
    return ['Arms', 'Shoulders'];
  }

  // Vertical push: Overhead presses activate Triceps (Arms)
  if (clean.includes('overhead') || clean.includes('ohp') || clean.includes('military') || clean.includes('shoulder press')) {
    return ['Arms'];
  }

  // Pulling: Lat pulldown / pull-ups / rows activate Biceps (Arms)
  if (clean.includes('pull') || clean.includes('row') || clean.includes('chin') || clean.includes('lat')) {
    return ['Arms'];
  }

  // Dips: Chest / Triceps compound activates Shoulders
  if (clean.includes('dip')) {
    return ['Shoulders'];
  }

  // Heavy compound squats & deadlifts activate Core as stabilizers
  if (clean.includes('squat') || clean.includes('deadlift')) {
    return ['Core'];
  }

  return [];
}

/**
 * Returns beginner execution form cues (3 crisp bullet points) for any exercise.
 */
export function getExerciseFormCues(name: string): string[] {
  if (!name) return [];
  const clean = name.toLowerCase().trim();
  const direct = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (direct && direct.howTo && direct.howTo.length > 0) {
    return direct.howTo;
  }

  // Keyword-based fallback cues
  if (clean.includes('bench') || clean.includes('chest press')) {
    return [
      'Retract scapulae and pin shoulder blades back and down into the bench.',
      'Touch lower chest with control, elbows tucked at 45–60 degrees.',
      'Drive feet into the floor and press up to lockout without shrugging shoulders.',
    ];
  }
  if (clean.includes('squat') || clean.includes('leg press')) {
    return [
      'Brace 360-degree abdominal pressure before descending.',
      'Break at hips and knees simultaneously, driving knees out in line with toes.',
      'Reach full depth with flat feet, then drive floor away through midfoot.',
    ];
  }
  if (clean.includes('deadlift') || clean.includes('rdl')) {
    return [
      'Keep bar close to body over midfoot; brace lats and lock spine neutral.',
      'Hinge deeply at hips, loading hamstrings and glutes rather than rounding lower back.',
      'Drive hips forward to full lockout without leaning back excessively.',
    ];
  }
  if (clean.includes('overhead') || clean.includes('shoulder press') || clean.includes('ohp')) {
    return [
      'Squeeze glutes and brace core tightly to avoid arching lower back.',
      'Press bar or dumbbells vertically in a clean line directly overhead.',
      'Lock out with head moving slightly forward through the window at the top.',
    ];
  }
  if (clean.includes('row') || clean.includes('pulldown') || clean.includes('pull-up')) {
    return [
      'Initiate pull by depressing and retracting shoulder blades.',
      'Drive elbows down and back toward hip pockets.',
      'Pause for a split-second contraction, then resist the eccentric on the return.',
    ];
  }
  if (clean.includes('curl')) {
    return [
      'Pin elbows to sides of torso; avoid swinging shoulders or leaning back.',
      'Supinate wrists and squeeze biceps hard at peak contraction.',
      'Lower weight under control with a smooth 2-second negative.',
    ];
  }
  if (clean.includes('tricep') || clean.includes('pushdown')) {
    return [
      'Lock elbows in position at your sides; isolate forearm extension.',
      'Push down fully to lock out triceps with a strong contraction.',
      'Control the return until forearms are just past 90 degrees.',
    ];
  }
  if (clean.includes('cycle') || clean.includes('bike') || clean.includes('treadmill') || clean.includes('rowing') || clean.includes('jump rope')) {
    return [
      'Maintain steady rhythmic breathing and controlled exertion.',
      'Keep posture upright and core lightly braced throughout the duration.',
      'Monitor cadence and target heart rate zone for continuous conditioning.',
    ];
  }

  return [
    'Control the eccentric (lowering) phase for 2 seconds with clean tension.',
    'Maintain a neutral spine and brace your core throughout every repetition.',
    'Focus on smooth mind-muscle connection rather than swinging momentum.',
  ];
}

