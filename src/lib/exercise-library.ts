export type ResistanceMuscleGroup = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
export type MuscleGroup = ResistanceMuscleGroup | 'Conditioning';
export type EquipmentType = 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Smith Machine' | 'Cardio';

/**
 * Movement pattern as DATA (PR-A2). These are the same 9 families the
 * injury/pain machinery uses — they used to exist only as regexes over
 * exercise name strings in workout-engine.ts, which misclassified by
 * construction (rear-delt fly → push, shrugs → carry) and could not see
 * custom/imported names at all. workout-engine re-exports this type and
 * its getMovementFamily() now reads this data first, regex second.
 */
export type MovementFamily =
  | 'hinge'
  | 'squat'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'carry'
  | 'core'
  | 'other';

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** Joints an exercise meaningfully loads — caution data, never a diagnosis. */
export type JointArea =
  | 'lower_back'
  | 'knee'
  | 'shoulder'
  | 'hip'
  | 'ankle'
  | 'neck'
  | 'wrist'
  | 'elbow';

/** The coach-critical metadata every library exercise carries (PR-A2). */
export interface ExerciseMeta {
  secondaryMuscles: MuscleGroup[];
  movementPattern: MovementFamily;
  difficulty: ExerciseDifficulty;
  jointCautions: JointArea[];
  unilateral: boolean;
}

export interface ExerciseItem {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: EquipmentType;
  isBodyweight?: boolean;
  defaultReps?: number;
  defaultWeightKg?: number;
  howTo?: string[];
  // Coach metadata — optional on the general type (custom/user items may
  // lack it); guaranteed present on every EXERCISE_LIBRARY entry, which is
  // typed LibraryExercise and test-asserted for completeness.
  secondaryMuscles?: MuscleGroup[];
  movementPattern?: MovementFamily;
  difficulty?: ExerciseDifficulty;
  jointCautions?: JointArea[];
  unilateral?: boolean;
}

/** A library exercise: ExerciseItem with the coach metadata guaranteed. */
export type LibraryExercise = ExerciseItem & ExerciseMeta;

const EXERCISE_LIBRARY_RAW: ExerciseItem[] = [
  // ── CHEST ─────────────────────────────────────────────────────────────
  { id: 'bench_press', name: 'Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 60, howTo: ['Lie with eyes under the bar, shoulder blades pinched back and down into the bench, feet planted hard on the floor.', 'Unrack and lower the bar to mid-chest with elbows at roughly 45–60 degrees, forearms vertical.', 'Press up and slightly back to lockout; keep your backside on the bench for every rep.'] },
  { id: 'incline_bench', name: 'Incline Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 50, howTo: ['Set the bench to 30–45 degrees; pin shoulder blades into the pad and plant your feet.', 'Lower the bar to your upper chest, just below the collarbone, elbows at 45–60 degrees.', 'Press up to lockout without shrugging; keep the path smooth and controlled.'] },
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
  { id: 'deadlift', name: 'Conventional Deadlift', muscle: 'Back', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 100, howTo: ['Stand with the bar over mid-foot, shins close; grip just outside your legs and drop your hips until shins touch the bar.', 'Flatten your back, take the slack out of the bar, and brace your stomach hard — like you are about to be punched.', 'Push the floor away and stand tall by squeezing your backside; the bar drags up your legs. Lower by pushing hips back first.'] },
  { id: 'sumo_deadlift', name: 'Sumo Deadlift', muscle: 'Back', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 100, howTo: ['Take a wide stance with toes turned out about 45 degrees, shins vertical, grip inside your knees.', 'Chest tall and back flat, push your knees out in line with your toes as you take the slack out.', 'Drive the floor apart and stand tall; keep the bar glued to your legs the whole way.'] },
  { id: 'barbell_row', name: 'Barbell Bent-Over Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 60, howTo: ['Hinge to about 45 degrees with a flat back and soft knees; let the bar hang below your chest.', 'Row the bar to your lower ribs/upper stomach, driving elbows to the ceiling.', 'Lower under control to straight arms; your torso angle should not bounce between reps.'] },
  { id: 'pendlay_row', name: 'Pendlay Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 60, howTo: ['Set up hinged with your back parallel to the floor, bar resting on the floor under your chest.', 'Explode the bar into your lower ribs — every rep starts from a dead stop.', 'Return the bar fully to the floor and reset your brace before the next rep.'] },
  { id: 't_bar_row', name: 'T-Bar Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 45 },
  { id: 'romanian_deadlift', name: 'Romanian Deadlift (RDL)', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 80, howTo: ['Stand tall holding the bar at hip height, feet hip-width, knees soft.', 'Push your hips back like closing a door with your backside, bar sliding down your thighs, back flat.', 'Stop when you feel a deep stretch in the back of your thighs (usually just below the knees), then stand by squeezing your backside.'] },
  { id: 'pull_ups', name: 'Pull-ups', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 8, defaultWeightKg: 0, howTo: ['Grip the bar just outside shoulder width, palms away; hang with arms straight and shoulders engaged, not shrugged to your ears.', 'Pull your chest to the bar by driving elbows down to your ribs.', 'Lower slowly to a full hang — no swinging or kicking; if you cannot complete a rep yet, use slow negatives.'] },
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
  { id: 'squat', name: 'Barbell Back Squat', muscle: 'Legs', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 80, howTo: ['Bar resting on your upper back (not your neck), hands pulling it down into you; unrack and take two small steps back.', 'Big breath into your belly, brace, then bend hips and knees together, knees tracking out over your toes.', 'Descend until hips are at least level with knees, then drive up through mid-foot, chest and hips rising together.'] },
  { id: 'front_squat', name: 'Barbell Front Squat', muscle: 'Legs', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 60, howTo: ['Bar sits on the front of your shoulders, fingertips under it, elbows pointing forward and up.', 'Stay tall: ribs down, brace, and break at the knees and hips together.', 'Descend with your torso as upright as possible; drive up keeping elbows high so the bar never rolls.'] },
  { id: 'leg_press', name: 'Leg Press', muscle: 'Legs', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 140, howTo: ['Sit with your whole back and hips flat against the pads; feet hip-width on the plate, heels down.', 'Lower the plate until your knees reach about 90 degrees — stop before your lower back rounds off the pad.', 'Press through your whole foot without locking your knees hard at the top.'] },
  { id: 'hack_squat_machine', name: 'Hack Squat Machine', muscle: 'Legs', equipment: 'Machine', defaultReps: 8, defaultWeightKg: 70 },
  { id: 'leg_extension', name: 'Leg Extension', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 45 },
  { id: 'lying_leg_curl', name: 'Lying Leg Curl', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 40 },
  { id: 'seated_leg_curl', name: 'Seated Leg Curl', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 45 },
  { id: 'barbell_hip_thrust', name: 'Barbell Hip Thrust', muscle: 'Legs', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 90, howTo: ['Upper back braced against a bench, bar padded over your hip crease, feet flat and close enough that shins are vertical at the top.', 'Tuck your chin and brace; drive through your heels to lift your hips.', 'Finish level with your shoulders and knees, backside squeezed hard — do not arch your lower back to get higher.'] },
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
  { id: 'overhead_press', name: 'Overhead Press (Barbell OHP)', muscle: 'Shoulders', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 40, howTo: ['Grip just outside shoulders, forearms vertical, bar resting on the heel of your palms; squeeze your backside and brace your stomach so your lower back cannot arch.', 'Tuck your chin back slightly and press the bar in a straight line, directly over your mid-foot.', 'Finish with arms locked by your ears and give a small shrug at the top; lower to your upper chest under control.'] },
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

// ── Coach metadata backfill (PR-A2) ─────────────────────────────────────────
// Every library exercise carries the fields the coach reasons over. The
// raw entries above predate the schema, so the metadata lives in this
// table and is merged in below; tests assert 104/104 coverage, valid
// values, and no orphan keys — a new exercise without a row here fails CI.
const M = (
  movementPattern: MovementFamily,
  difficulty: ExerciseDifficulty,
  secondaryMuscles: MuscleGroup[],
  jointCautions: JointArea[],
  unilateral = false
): ExerciseMeta => ({ movementPattern, difficulty, secondaryMuscles, jointCautions, unilateral });

export const EXERCISE_META: Record<string, ExerciseMeta> = {
  // Chest
  bench_press: M('horizontal_push', 'intermediate', ['Arms', 'Shoulders'], ['shoulder', 'wrist']),
  incline_bench: M('horizontal_push', 'intermediate', ['Shoulders', 'Arms'], ['shoulder']),
  decline_bench: M('horizontal_push', 'intermediate', ['Arms'], ['shoulder']),
  close_grip_bench: M('horizontal_push', 'intermediate', ['Arms'], ['wrist', 'elbow']),
  db_press: M('horizontal_push', 'beginner', ['Arms', 'Shoulders'], ['shoulder']),
  incline_db_press: M('horizontal_push', 'beginner', ['Shoulders', 'Arms'], ['shoulder']),
  decline_db_press: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  db_fly: M('horizontal_push', 'beginner', ['Shoulders'], ['shoulder']),
  incline_db_fly: M('horizontal_push', 'beginner', ['Shoulders'], ['shoulder']),
  chest_press_machine: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  incline_chest_machine: M('horizontal_push', 'beginner', ['Arms', 'Shoulders'], ['shoulder']),
  pec_deck: M('horizontal_push', 'beginner', [], ['shoulder']),
  cable_crossover_high: M('horizontal_push', 'beginner', [], ['shoulder']),
  cable_crossover_low: M('horizontal_push', 'beginner', ['Shoulders'], ['shoulder']),
  cable_chest_press: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  push_ups: M('horizontal_push', 'beginner', ['Arms', 'Shoulders', 'Core'], ['wrist']),
  chest_dips: M('vertical_push', 'intermediate', ['Arms', 'Shoulders'], ['shoulder', 'elbow']),
  smith_bench: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  smith_incline_bench: M('horizontal_push', 'beginner', ['Arms', 'Shoulders'], ['shoulder']),
  // Back
  deadlift: M('hinge', 'advanced', ['Legs', 'Core'], ['lower_back', 'hip']),
  sumo_deadlift: M('hinge', 'intermediate', ['Legs', 'Core'], ['lower_back', 'hip']),
  barbell_row: M('horizontal_pull', 'intermediate', ['Arms', 'Shoulders'], ['lower_back']),
  pendlay_row: M('horizontal_pull', 'advanced', ['Arms'], ['lower_back']),
  t_bar_row: M('horizontal_pull', 'intermediate', ['Arms'], ['lower_back']),
  romanian_deadlift: M('hinge', 'intermediate', ['Legs', 'Core'], ['lower_back', 'hip']),
  pull_ups: M('vertical_pull', 'intermediate', ['Arms', 'Shoulders'], ['shoulder', 'elbow']),
  chin_ups: M('vertical_pull', 'intermediate', ['Arms'], ['shoulder', 'elbow']),
  inverted_row: M('horizontal_pull', 'beginner', ['Arms'], ['shoulder']),
  lat_pulldown: M('vertical_pull', 'beginner', ['Arms'], ['shoulder']),
  close_grip_pulldown: M('vertical_pull', 'beginner', ['Arms'], ['shoulder']),
  seated_cable_row: M('horizontal_pull', 'beginner', ['Arms', 'Shoulders'], ['lower_back']),
  single_arm_cable_row: M('horizontal_pull', 'beginner', ['Arms', 'Core'], ['lower_back'], true),
  straight_arm_pulldown: M('vertical_pull', 'beginner', [], ['shoulder']),
  db_row: M('horizontal_pull', 'beginner', ['Arms'], ['lower_back'], true),
  db_chest_supported_row: M('horizontal_pull', 'beginner', ['Arms'], []),
  db_rdl: M('hinge', 'beginner', ['Legs', 'Core'], ['lower_back', 'hip']),
  chest_supported_machine_row: M('horizontal_pull', 'beginner', ['Arms'], []),
  hyperextension: M('hinge', 'beginner', ['Legs'], ['lower_back']),
  barbell_shrug: M('other', 'beginner', ['Shoulders'], ['neck']),
  db_shrug: M('other', 'beginner', ['Shoulders'], ['neck']),
  // Legs
  squat: M('squat', 'intermediate', ['Core'], ['knee', 'lower_back', 'hip', 'ankle']),
  front_squat: M('squat', 'advanced', ['Core'], ['knee', 'wrist', 'hip']),
  leg_press: M('squat', 'beginner', [], ['knee', 'lower_back']),
  hack_squat_machine: M('squat', 'intermediate', [], ['knee']),
  leg_extension: M('squat', 'beginner', [], ['knee']),
  lying_leg_curl: M('other', 'beginner', [], ['knee']),
  seated_leg_curl: M('other', 'beginner', [], ['knee']),
  barbell_hip_thrust: M('hinge', 'intermediate', [], ['hip', 'lower_back']),
  bulgarian_split_squat: M('squat', 'intermediate', ['Core'], ['knee', 'ankle', 'hip'], true),
  goblet_squat: M('squat', 'beginner', ['Core'], ['knee']),
  db_walking_lunge: M('squat', 'intermediate', [], ['knee', 'ankle'], true),
  standing_calf_raise: M('other', 'beginner', [], ['ankle']),
  seated_calf_raise: M('other', 'beginner', [], ['ankle']),
  abductor_machine: M('other', 'beginner', [], ['hip']),
  adductor_machine: M('other', 'beginner', [], ['hip']),
  bodyweight_squats: M('squat', 'beginner', [], ['knee']),
  smith_squat: M('squat', 'beginner', [], ['knee', 'lower_back']),
  // Shoulders
  overhead_press: M('vertical_push', 'intermediate', ['Arms', 'Core'], ['shoulder', 'neck', 'lower_back']),
  push_press: M('vertical_push', 'advanced', ['Arms', 'Legs'], ['shoulder', 'knee']),
  db_shoulder_press: M('vertical_push', 'beginner', ['Arms'], ['shoulder']),
  arnold_press: M('vertical_push', 'intermediate', ['Arms'], ['shoulder']),
  db_lateral_raise: M('other', 'beginner', [], ['shoulder']),
  cable_lateral_raise: M('other', 'beginner', [], ['shoulder']),
  machine_lateral_raise: M('other', 'beginner', [], ['shoulder']),
  face_pull: M('horizontal_pull', 'beginner', ['Back'], ['shoulder']),
  rear_delt_fly: M('horizontal_pull', 'beginner', ['Back'], ['shoulder']),
  rear_delt_machine: M('horizontal_pull', 'beginner', ['Back'], ['shoulder']),
  front_raise: M('other', 'beginner', [], ['shoulder']),
  upright_row: M('horizontal_pull', 'intermediate', ['Arms', 'Back'], ['shoulder', 'wrist']),
  smith_ohp: M('vertical_push', 'beginner', ['Arms'], ['shoulder']),
  // Arms
  barbell_curl: M('other', 'beginner', [], ['elbow', 'wrist']),
  ez_bar_curl: M('other', 'beginner', [], ['elbow', 'wrist']),
  db_curl: M('other', 'beginner', [], ['elbow']),
  incline_db_curl: M('other', 'beginner', [], ['elbow', 'shoulder']),
  hammer_curl: M('other', 'beginner', [], ['elbow', 'wrist']),
  preacher_curl: M('other', 'beginner', [], ['elbow']),
  cable_bicep_curl: M('other', 'beginner', [], ['elbow']),
  concentration_curl: M('other', 'beginner', [], ['elbow'], true),
  tricep_pushdown_rope: M('other', 'beginner', [], ['elbow']),
  tricep_pushdown_bar: M('other', 'beginner', [], ['elbow']),
  skull_crushers: M('other', 'intermediate', [], ['elbow', 'shoulder']),
  overhead_db_tricep: M('other', 'beginner', [], ['elbow', 'shoulder']),
  overhead_cable_tricep: M('other', 'beginner', [], ['elbow', 'shoulder']),
  tricep_dips: M('vertical_push', 'intermediate', ['Chest', 'Shoulders'], ['shoulder', 'elbow']),
  diamond_pushups: M('horizontal_push', 'intermediate', ['Chest', 'Shoulders'], ['wrist', 'elbow']),
  wrist_curl: M('other', 'beginner', [], ['wrist']),
  // Core
  hanging_leg_raise: M('core', 'advanced', [], ['hip', 'shoulder']),
  hanging_knee_raise: M('core', 'intermediate', [], ['hip', 'shoulder']),
  captain_chair_raise: M('core', 'beginner', [], ['hip']),
  cable_crunch: M('core', 'beginner', [], ['lower_back']),
  cable_woodchopper: M('core', 'intermediate', [], ['lower_back']),
  ab_wheel_rollout: M('core', 'advanced', [], ['lower_back', 'shoulder']),
  plank: M('core', 'beginner', [], ['shoulder', 'wrist']),
  side_plank: M('core', 'beginner', [], ['shoulder']),
  russian_twist: M('core', 'beginner', [], ['lower_back']),
  decline_crunch: M('core', 'beginner', [], ['lower_back', 'hip']),
  machine_crunch: M('core', 'beginner', [], ['lower_back']),
  // Conditioning
  zone2_cycling: M('other', 'beginner', ['Legs'], ['knee']),
  incline_treadmill_walk: M('other', 'beginner', ['Legs'], ['ankle', 'knee']),
  rowing_intervals: M('horizontal_pull', 'beginner', ['Legs', 'Back'], ['lower_back', 'knee']),
  jump_rope: M('other', 'beginner', ['Legs'], ['ankle', 'knee']),
  stair_climber: M('other', 'beginner', ['Legs'], ['knee']),
  kettlebell_swings: M('hinge', 'intermediate', ['Legs', 'Back', 'Core'], ['lower_back', 'hip']),
  farmers_walk: M('carry', 'intermediate', ['Arms', 'Core', 'Back'], ['neck', 'lower_back']),
};

const EMPTY_META: ExerciseMeta = {
  secondaryMuscles: [],
  movementPattern: 'other',
  difficulty: 'beginner',
  jointCautions: [],
  unilateral: false,
};

export const EXERCISE_LIBRARY: LibraryExercise[] = EXERCISE_LIBRARY_RAW.map((e) => ({
  ...e,
  ...(EXERCISE_META[e.id] ?? EMPTY_META),
}));

export function getExerciseById(id: string): LibraryExercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id);
}

/**
 * Canonical loose names -> library id. Split templates, generated plans,
 * and user logs all emit shorthand ("Barbell Row", "Tricep Pushdown")
 * that substring rules cannot express — "Barbell Bent-Over Row" does not
 * contain "barbell row", and "Dumbbell Curl" is a substring of the WRONG
 * entry ("Incline Dumbbell Curl"). Aliases are data, asserted by tests.
 */
export const EXERCISE_ALIASES: Record<string, string> = {
  'bench press': 'bench_press',
  'incline bench': 'incline_bench',
  'incline bench press': 'incline_bench',
  'close grip bench': 'close_grip_bench',
  'close grip bench press': 'close_grip_bench',
  'competition bench press': 'bench_press',
  'paused bench press': 'bench_press',
  'squat': 'squat',
  'barbell squat': 'squat',
  'zercher squat': 'squat',
  'front squat': 'front_squat',
  'goblet squat': 'goblet_squat',
  'hack squat': 'hack_squat_machine',
  'deadlift': 'deadlift',
  'trap bar deadlift': 'deadlift',
  'deficit deadlift': 'deadlift',
  'sumo deadlift': 'sumo_deadlift',
  'romanian deadlift': 'romanian_deadlift',
  'rdl': 'romanian_deadlift',
  'stiff leg deadlift': 'romanian_deadlift',
  'barbell row': 'barbell_row',
  'bent over row': 'barbell_row',
  't bar row': 't_bar_row',
  'seated row': 'seated_cable_row',
  'cable row': 'seated_cable_row',
  'one arm dumbbell row': 'db_row',
  'single arm dumbbell row': 'db_row',
  'overhead press': 'overhead_press',
  'ohp': 'overhead_press',
  'shoulder press': 'overhead_press',
  'arnold press': 'arnold_press',
  'upright row': 'upright_row',
  'face pull': 'face_pull',
  'lat pulldown': 'lat_pulldown',
  'pull up': 'pull_ups',
  'pull ups': 'pull_ups',
  'chin up': 'chin_ups',
  'chin ups': 'chin_ups',
  'push up': 'push_ups',
  'push ups': 'push_ups',
  'dips': 'chest_dips',
  'leg press': 'leg_press',
  'leg extension': 'leg_extension',
  'leg curl': 'lying_leg_curl',
  'hamstring curl': 'lying_leg_curl',
  'calf raise': 'standing_calf_raise',
  'hip thrust': 'barbell_hip_thrust',
  'lateral raise': 'db_lateral_raise',
  'lateral raises': 'db_lateral_raise',
  'dumbbell curl': 'db_curl',
  'bicep curl': 'db_curl',
  'barbell curl': 'barbell_curl',
  'cable curl': 'cable_bicep_curl',
  'incline curl': 'incline_db_curl',
  'db row': 'db_row',
  'ez bar curl': 'ez_bar_curl',
  'hammer curl': 'hammer_curl',
  'tricep pushdown': 'tricep_pushdown_rope',
  'cable pushdown': 'tricep_pushdown_rope',
  'skull crushers': 'skull_crushers',
  'overhead tricep extension': 'overhead_db_tricep',
  'cable fly': 'cable_crossover_high',
  'chest fly': 'db_fly',
};

/** Lowercase, hyphens to spaces, parenthetical qualifiers stripped. */
function normalizeNameKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokens that may surround a library name in a logged variant without
 * changing the movement ("Trap Bar Deadlift" is still the deadlift).
 * Anything else — "pike", "handstand", "competition" — changes the
 * movement, and the name must NOT be swallowed by the plain entry: a
 * Pike Push-up is a vertical push, and resolving it to Push-ups
 * (horizontal) once defeated the shoulder-injury ban end-to-end.
 */
const BENIGN_VARIANT_TOKENS = new Set([
  'barbell', 'dumbbell', 'db', 'cable', 'machine', 'smith', 'ez', 'trap',
  'bar', 'kettlebell', 'kb', 'bodyweight', 'bw',
]);

/**
 * Resolve a (possibly loose) exercise name to a library entry, in strict
 * order: exact display name -> alias table -> library name containing
 * the query -> query containing a library name with only equipment
 * tokens to spare. Single-token names never partial-resolve ("Curl"
 * is a leg curl as easily as a bicep curl — ambiguity stays unresolved
 * and callers fall back to pattern heuristics). Returns undefined for
 * names the library doesn't know: "no data", never a guess.
 */
export function findLibraryExercise(name: string): LibraryExercise | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const clean = name.toLowerCase().trim();
  const direct = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (direct) return direct;

  const key = normalizeNameKey(name);
  const aliasId = EXERCISE_ALIASES[key];
  if (aliasId) return getExerciseById(aliasId);

  if (key.split(' ').length < 2) return undefined;

  const containing = EXERCISE_LIBRARY.find((e) => normalizeNameKey(e.name).includes(key));
  if (containing) return containing;

  for (const e of EXERCISE_LIBRARY) {
    const eKey = normalizeNameKey(e.name);
    if (eKey.length >= 4 && key.includes(eKey)) {
      const extras = key.replace(eKey, '').split(' ').filter(Boolean);
      if (extras.every((t) => BENIGN_VARIANT_TOKENS.has(t))) return e;
    }
  }
  return undefined;
}

// ── Substitutions: id-keyed, library-validated (PR-A2) ──────────────────────
// Replaces the old name-string table in workout-engine.ts (15 loose keys,
// 27/41 targets not real exercises, placeholder fallbacks). Keys and
// targets are exercise IDS; every target is test-asserted to exist, to
// differ from the source, and to share its movement pattern, its primary
// muscle, or a declared secondary-muscle overlap. Exercises without
// a curated row get pattern-derived substitutes from the same rule — the
// output is real library exercises only, on every path.
export interface ExerciseSubstitution {
  targetId: string;
  reason: string;
}

const S = (targetId: string, reason: string): ExerciseSubstitution => ({ targetId, reason });

export const EXERCISE_SUBSTITUTIONS: Record<string, ExerciseSubstitution[]> = {
  bench_press: [
    S('db_press', 'Better shoulder freedom & stabilizer engagement'),
    S('incline_bench', 'Upper chest emphasis with barbell power'),
    S('chest_press_machine', 'Controlled path when spotter/barbell unavailable'),
  ],
  db_press: [
    S('bench_press', 'Heavier overload potential'),
    S('incline_db_press', 'Upper chest focus'),
    S('chest_dips', 'High tricep and lower chest mass builder'),
  ],
  incline_db_press: [
    S('incline_bench', 'Direct barbell compound substitute'),
    S('cable_crossover_low', 'Continuous tension on upper chest'),
    S('incline_db_fly', 'Upper chest stretch under load'),
  ],
  push_ups: [
    S('db_press', 'Same push, loadable in small steps'),
    S('chest_press_machine', 'Guided path, easy to scale'),
    S('diamond_pushups', 'Harder bodyweight push, tricep emphasis'),
  ],
  chest_dips: [S('tricep_dips', 'Same bars, tricep emphasis'), S('db_shoulder_press', 'Vertical pressing strength')],
  squat: [
    S('leg_press', 'Heavy quad loading without spinal compression'),
    S('hack_squat_machine', 'Deep quad stretch with fixed back support'),
    S('goblet_squat', 'Great upright posture & hip mobility'),
  ],
  front_squat: [
    S('squat', 'Same pattern, more load potential'),
    S('goblet_squat', 'Upright torso without the rack position'),
    S('leg_press', 'Quad loading without the mobility demand'),
  ],
  leg_press: [
    S('hack_squat_machine', 'Same quad-dominant loading angle'),
    S('squat', 'Full systemic core & leg builder'),
    S('bulgarian_split_squat', 'Unilateral quad and glute focus'),
  ],
  leg_extension: [
    S('hack_squat_machine', 'Heavy quad focus when the extension machine is taken'),
    S('goblet_squat', 'Quad work with a free weight'),
    S('db_walking_lunge', 'Quad pump and active stabilizer work'),
  ],
  deadlift: [
    S('romanian_deadlift', 'Pure hamstring & glute tension without floor reset'),
    S('sumo_deadlift', 'Same hinge, more quad, often kinder on the back'),
    S('barbell_row', 'Posterior chain loading with back thickness focus'),
  ],
  romanian_deadlift: [
    S('db_rdl', 'Easier grip setup & natural hip hinge'),
    S('sumo_deadlift', 'Heavier hinge with less hamstring stretch demand'),
    S('hyperextension', 'Hinge pattern with far less load'),
  ],
  barbell_hip_thrust: [
    S('romanian_deadlift', 'Hinge strength through the same hip extension'),
    S('sumo_deadlift', 'Heavy glute loading from the floor'),
  ],
  overhead_press: [
    S('db_shoulder_press', 'Greater range of motion & wrist comfort'),
    S('arnold_press', 'Rotational delt recruitment'),
    S('smith_ohp', 'Fixed path when balance is the limiter'),
  ],
  db_shoulder_press: [
    S('overhead_press', 'Raw progressive overload strength builder'),
    S('smith_ohp', 'Stable path for pressing volume'),
    S('arnold_press', 'All three delt heads through rotation'),
  ],
  barbell_row: [
    S('chest_supported_machine_row', 'Zero lower back fatigue, pure upper back'),
    S('db_row', 'Huge stretch on lats with unilateral focus'),
    S('seated_cable_row', 'Constant cable tension through the entire stroke'),
  ],
  pull_ups: [
    S('lat_pulldown', 'Micro-adjustable weight for precise rep targets'),
    S('chin_ups', 'Higher bicep leverage, same vertical pull'),
    S('straight_arm_pulldown', 'Pure lat isolation without arm fatigue'),
  ],
  chin_ups: [S('pull_ups', 'Overhand grip shifts load to lats and forearms'), S('lat_pulldown', 'Scalable vertical pull')],
  lat_pulldown: [
    S('pull_ups', 'The gold standard vertical pulling movement'),
    S('close_grip_pulldown', 'Closer grip for lower lat sweep'),
    S('straight_arm_pulldown', 'Lat isolation without bicep fatigue'),
  ],
  db_curl: [
    S('incline_db_curl', 'Maximum stretch on the long head of biceps'),
    S('barbell_curl', 'Heavy bilateral bicep overload'),
    S('hammer_curl', 'Brachialis and forearm thickness'),
  ],
  tricep_pushdown_rope: [
    S('overhead_cable_tricep', 'Targets the long head in the stretched position'),
    S('skull_crushers', 'Heavy mass builder for the tricep belly'),
    S('tricep_dips', 'Compound tricep press with bodyweight'),
  ],
  lying_leg_curl: [S('seated_leg_curl', 'Same knee-flexion work, seated position')],
  seated_leg_curl: [S('lying_leg_curl', 'Same knee-flexion work, lying position')],
  farmers_walk: [
    S('db_shrug', 'Grip and trap load without the walk'),
    S('barbell_shrug', 'Heavier trap and grip loading'),
  ],
  hanging_leg_raise: [S('hanging_knee_raise', 'Bent-knee version — same raise, less hip-flexor demand'), S('captain_chair_raise', 'Supported back, easier to control')],
};

const PATTERN_LABEL: Record<MovementFamily, string> = {
  hinge: 'hip hinge',
  squat: 'squat pattern',
  horizontal_push: 'horizontal push',
  vertical_push: 'vertical push',
  horizontal_pull: 'horizontal pull',
  vertical_pull: 'vertical pull',
  carry: 'carry',
  core: 'core',
  other: 'movement',
};

/**
 * Substitutes for a library exercise: curated rows first; otherwise
 * derived by the same invariant the curated rows are tested against —
 * same movement pattern (or same primary muscle for 'other'-pattern
 * isolation work), preferring a different equipment type. Output is
 * ALWAYS real library exercises; there is no placeholder path.
 */
export function getLibrarySubstitutes(
  item: LibraryExercise
): { target: LibraryExercise; reason: string; curated: boolean }[] {
  const curated = (EXERCISE_SUBSTITUTIONS[item.id] || [])
    .map((s) => {
      const target = getExerciseById(s.targetId);
      return target ? { target, reason: s.reason, curated: true } : null;
    })
    .filter(Boolean) as { target: LibraryExercise; reason: string; curated: boolean }[];
  if (curated.length > 0) return curated;

  let pool = EXERCISE_LIBRARY.filter((t) => {
    if (t.id === item.id) return false;
    if (item.movementPattern !== 'other') return t.movementPattern === item.movementPattern;
    // 'other'-pattern isolation work: same muscle, and never a compound
    // from a real pattern family (a calf raise is not "substituted" by a
    // barbell squat just because both are Legs).
    if (t.muscle !== item.muscle) return false;
    if (!['other', 'core', 'carry'].includes(t.movementPattern)) return false;
    // Within Arms, flexion and extension are opposite actions — a curl
    // never substitutes a pushdown or vice versa.
    if (item.muscle === 'Arms') {
      const flexion = /curl/.test(item.name.toLowerCase());
      const extension = /pushdown|extension|crusher|kickback/.test(item.name.toLowerCase());
      const tName = t.name.toLowerCase();
      if (flexion && !/curl/.test(tName)) return false;
      if (extension && !/pushdown|extension|crusher|kickback/.test(tName)) return false;
    }
    return true;
  });
  if (pool.length === 0 && item.movementPattern !== 'other') {
    // Unique pattern (e.g. the library's only carry): fall back to
    // muscle overlap — targets whose primary muscle the source trains
    // secondarily, or that train the source's primary secondarily.
    pool = EXERCISE_LIBRARY.filter(
      (t) =>
        t.id !== item.id &&
        (item.secondaryMuscles.includes(t.muscle) || t.secondaryMuscles.includes(item.muscle))
    );
  }
  pool.sort((a, b) => {
    const eqA = a.equipment === item.equipment ? 1 : 0;
    const eqB = b.equipment === item.equipment ? 1 : 0;
    if (eqA !== eqB) return eqA - eqB;
    const muA = a.muscle === item.muscle ? 0 : 1;
    const muB = b.muscle === item.muscle ? 0 : 1;
    if (muA !== muB) return muA - muB;
    return a.name.localeCompare(b.name);
  });
  const reason =
    item.movementPattern !== 'other'
      ? `Same ${PATTERN_LABEL[item.movementPattern]} movement in the library`
      : `Same muscle group (${item.muscle}) alternative in the library`;
  const all = pool.map((target) => ({ target, reason, curated: false }));
  // Equipment diversity: downstream equipment filters must not starve
  // because every pick shares one equipment type — interleave the best
  // different-equipment and same-equipment candidates before capping.
  const diffEq = all.find((d) => d.target.equipment !== item.equipment);
  const sameEq = all.find((d) => d.target.equipment === item.equipment);
  const ordered: typeof all = [];
  for (const pick of [diffEq, sameEq, ...all]) {
    if (pick && !ordered.includes(pick)) ordered.push(pick);
  }
  return ordered.slice(0, 3);
}

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
 * User-declared muscles for custom exercises. Name-only keyword guessing
 * misfiles customs ("Nordic Curl" → Arms); when a user picks a muscle at
 * creation, that choice wins over every heuristic. The store hydrates
 * this registry from persisted state and updates it on each new custom.
 */
const customMuscleOverrides = new Map<string, MuscleGroup>();

export function registerCustomExerciseMuscle(name: string, muscle: MuscleGroup): void {
  if (name && muscle) customMuscleOverrides.set(name.trim().toLowerCase(), muscle);
}

export function registerCustomExerciseMuscles(
  map: Record<string, MuscleGroup> | undefined | null
): void {
  if (!map) return;
  for (const [name, muscle] of Object.entries(map)) {
    registerCustomExerciseMuscle(name, muscle);
  }
}

export function getCustomExerciseMuscle(name: string): MuscleGroup | undefined {
  return customMuscleOverrides.get((name || '').trim().toLowerCase());
}

/**
 * Resolves any exercise name (including custom or partial names) to its
 * target MuscleGroup, or null when NOTHING matches — no library entry, no
 * keyword signal. Callers that must not guess (learned statistics) use
 * this; display callers use getExerciseMuscle, which keeps the default.
 */
export function resolveExerciseMuscle(name: string): MuscleGroup | null {
  if (!name || typeof name !== 'string') return null;
  const clean = name.toLowerCase().trim();
  const override = customMuscleOverrides.get(clean);
  if (override) return override;
  const direct = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (direct) return direct.muscle;

  const partial = EXERCISE_LIBRARY.find(
    (e) => clean.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(clean)
  );
  if (partial) return partial.muscle;

  // Keyword heuristic matching. ORDER MATTERS — specific movement
  // identities are checked before generic words they contain:
  // Olympic lifts before 'press' ("Clean and Press" is a leg/hip power
  // movement, not a shoulder press), Nordic curls before 'curl' (they
  // are hamstring work, not arms), plyometrics before everything
  // (Box Jump / Sled Push used to fall through to 'Chest').
  if (clean.includes('clean') || clean.includes('snatch') || clean.includes('jerk') || clean.includes('thruster') || clean.includes('kettlebell')) return 'Legs';
  if (clean.includes('jump') || clean.includes('plyo') || clean.includes('sled') || clean.includes('sprint') || clean.includes('bound') || /(^|[\s-])hop/.test(clean)) return 'Legs';
  if (clean.includes('burpee') || clean.includes('battle rope') || clean.includes('farmer') || clean.includes('carry') || clean.includes('throw')) return 'Conditioning';
  // Cardio names: without these, "Running" fell through to the Chest
  // default — a runner's whole training was invisible and misfiled.
  if (/\b(running|jogging|cycling|swimming|rowing|elliptical|skipping|jump rope|spin bike)\b/.test(clean) || clean === 'run' || clean === 'jog' || clean === 'swim') return 'Conditioning';
  if (clean.includes('bench') || clean.includes('chest') || clean.includes('fly') || clean.includes('pec') || clean.includes('push-up') || clean.includes('pushup')) return 'Chest';
  if (clean.includes('pull') || clean.includes('row') || clean.includes('lat') || clean.includes('deadlift') || clean.includes('chin') || clean.includes('shrug')) return 'Back';
  if (clean.includes('squat') || clean.includes('leg') || clean.includes('lunge') || clean.includes('calf') || clean.includes('calves') || clean.includes('quad') || clean.includes('hamstring') || clean.includes('rdl') || clean.includes('nordic') || clean.includes('glute') || clean.includes('hip thrust') || clean.includes('bridge')) return 'Legs';
  if (clean.includes('press') || clean.includes('overhead') || clean.includes('shoulder') || clean.includes('lateral raise') || clean.includes('delt') || clean.includes('ohp')) return 'Shoulders';
  if (clean.includes('curl') || clean.includes('tricep') || clean.includes('bicep') || clean.includes('skull') || clean.includes('dip') || clean.includes('arm')) return 'Arms';
  if (clean.includes('abs') || clean.includes('crunch') || clean.includes('plank') || clean.includes('core') || clean.includes('twist')) return 'Core';

  return null;
}

export function getExerciseMuscle(name: string): MuscleGroup {
  return resolveExerciseMuscle(name) ?? 'Chest';
}

/**
 * Returns secondary muscle groups that receive partial (~0.5 set) stimulus from compound movements.
 * Data-first (PR-A2): a library exercise's declared secondaryMuscles win;
 * the keyword heuristics below remain only for custom/unknown names.
 */
export function getExerciseSecondaryMuscles(name: string): MuscleGroup[] {
  if (!name || typeof name !== 'string') return [];
  const item = findLibraryExercise(name);
  if (item) return [...item.secondaryMuscles];
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
      'Pull your shoulder blades back and down, and pin them into the bench.',
      'Touch lower chest with control, elbows tucked at 45–60 degrees.',
      'Drive feet into the floor and press up to lockout without shrugging shoulders.',
    ];
  }
  if (clean.includes('squat') || clean.includes('leg press')) {
    return [
      'Take a deep breath into your belly and tighten your stomach — like you are about to be punched — before you go down.',
      'Bend your hips and knees together, pushing your knees out in line with your toes.',
      'Reach full depth with flat feet, then drive floor away through midfoot.',
    ];
  }
  if (clean.includes('deadlift') || clean.includes('rdl')) {
    return [
      'Keep the bar close to your legs and your back flat — never rounded.',
      'Push your hips back like you are closing a door with your backside, feeling the stretch in the back of your thighs.',
      'Stand tall by squeezing your backside — do not lean back at the top.',
    ];
  }
  if (clean.includes('overhead') || clean.includes('shoulder press') || clean.includes('ohp')) {
    return [
      'Squeeze your backside and tighten your stomach so your lower back does not arch.',
      'Press bar or dumbbells vertically in a clean line directly overhead.',
      'Finish with the weight directly above your head, arms next to your ears.',
    ];
  }
  if (clean.includes('row') || clean.includes('pulldown') || clean.includes('pull-up')) {
    return [
      'Start every pull by squeezing your shoulder blades down and together.',
      'Drive elbows down and back toward hip pockets.',
      'Pause for a split second at the squeeze, then lower the weight back slowly.',
    ];
  }
  if (clean.includes('curl')) {
    return [
      'Pin elbows to sides of torso; avoid swinging shoulders or leaning back.',
      'Turn your palms upward as you curl, and squeeze your arm muscle hard at the top.',
      'Lower the weight slowly — take about 2 seconds on the way down.',
    ];
  }
  if (clean.includes('tricep') || clean.includes('pushdown')) {
    return [
      'Keep your elbows pinned at your sides — only your forearms move.',
      'Push down fully to lock out triceps with a strong contraction.',
      'Control the return until forearms are just past 90 degrees.',
    ];
  }
  if (clean.includes('cycle') || clean.includes('bike') || clean.includes('treadmill') || clean.includes('rowing') || clean.includes('jump rope')) {
    return [
      'Maintain steady rhythmic breathing and controlled exertion.',
      'Keep posture upright and core lightly braced throughout the duration.',
      'Keep a steady pace where you can still speak in short sentences.',
    ];
  }

  return [
    'Lower the weight slowly, taking about 2 seconds, staying in control the whole way.',
    'Keep your back flat and your stomach tight for every single rep.',
    'Feel the muscle you are training do the work — never swing the weight.',
  ];
}

