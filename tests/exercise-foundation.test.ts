import { describe, it, expect } from 'vitest';
import {
  EXERCISE_ALIASES,
  EXERCISE_LIBRARY,
  EXERCISE_META,
  EXERCISE_SUBSTITUTIONS,
  MUSCLE_GROUPS,
  findLibraryExercise,
  getExerciseById,
  getExerciseSecondaryMuscles,
  getLibrarySubstitutes,
  type JointArea,
  type MovementFamily,
} from '../src/lib/exercise-library';
import {
  adaptSplitForEquipment,
  getFilteredSubstitutes,
  getMovementFamily,
  getQuickSubstitutes,
  isPlaceholderSubstitute,
} from '../src/lib/workout-engine';
import type { PlannedWorkout } from '../src/lib/types';

// PR-A2 — exercise data foundation. The coach's selection, swaps, and
// injury logic now reason over DATA; these tests are the contract that
// keeps the data honest: total backfill, valid substitutions, and no
// placeholder or dangling name on any path.

const FAMILIES: MovementFamily[] = [
  'hinge',
  'squat',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'core',
  'other',
];
const JOINTS: JointArea[] = ['lower_back', 'knee', 'shoulder', 'hip', 'ankle', 'neck', 'wrist', 'elbow'];
const LIBRARY_NAMES = new Set(EXERCISE_LIBRARY.map((e) => e.name));

describe('exercise foundation — schema backfill is total', () => {
  it('library still has exactly 104 exercises with unique ids and names', () => {
    expect(EXERCISE_LIBRARY.length).toBe(104);
    expect(new Set(EXERCISE_LIBRARY.map((e) => e.id)).size).toBe(104);
    expect(new Set(EXERCISE_LIBRARY.map((e) => e.name)).size).toBe(104);
  });

  it('every exercise carries all five coach fields with valid values', () => {
    for (const e of EXERCISE_LIBRARY) {
      expect(FAMILIES, e.id).toContain(e.movementPattern);
      expect(['beginner', 'intermediate', 'advanced'], e.id).toContain(e.difficulty);
      expect(Array.isArray(e.secondaryMuscles), e.id).toBe(true);
      for (const s of e.secondaryMuscles) {
        expect(MUSCLE_GROUPS, e.id).toContain(s);
        expect(s, e.id).not.toBe(e.muscle); // a muscle is never its own secondary
      }
      expect(Array.isArray(e.jointCautions), e.id).toBe(true);
      for (const j of e.jointCautions) expect(JOINTS, e.id).toContain(j);
      expect(typeof e.unilateral, e.id).toBe('boolean');
    }
  });

  it('EXERCISE_META has no orphan keys and covers every id', () => {
    const ids = new Set(EXERCISE_LIBRARY.map((e) => e.id));
    for (const key of Object.keys(EXERCISE_META)) expect(ids, key).toContain(key);
    for (const id of ids) expect(EXERCISE_META[id], id).toBeDefined();
  });

  it('known unilateral lifts are flagged; bilateral staples are not', () => {
    expect(getExerciseById('db_row')!.unilateral).toBe(true);
    expect(getExerciseById('single_arm_cable_row')!.unilateral).toBe(true);
    expect(getExerciseById('bulgarian_split_squat')!.unilateral).toBe(true);
    expect(getExerciseById('bench_press')!.unilateral).toBe(false);
    expect(getExerciseById('squat')!.unilateral).toBe(false);
  });
});

describe('exercise foundation — movement pattern is data', () => {
  it('getMovementFamily returns the declared pattern for every library exercise', () => {
    for (const e of EXERCISE_LIBRARY) {
      expect(getMovementFamily(e.name), e.name).toBe(e.movementPattern);
    }
  });

  it('deliberate fixes over the old regex classification', () => {
    // Regex filed the rear-delt fly as a PUSH (matches "fly") — it is a pull.
    expect(getMovementFamily('Dumbbell Rear Delt Fly')).toBe('horizontal_pull');
    // Regex filed shrugs as a carry — they are neither carry nor pull.
    expect(getMovementFamily('Barbell Shrug')).toBe('other');
    // Regex was right here and the data agrees.
    expect(getMovementFamily('Leg Extension')).toBe('squat');
    expect(getMovementFamily('Conventional Deadlift')).toBe('hinge');
  });

  it('non-library names still resolve through the regex fallback', () => {
    expect(getMovementFamily('Zercher Squat')).toBe('squat');
    expect(getMovementFamily('Mystery Movement')).toBe('other');
  });
});

describe('exercise foundation — substitutions are id-keyed and valid', () => {
  it('every curated key and target is a real exercise id', () => {
    const keys = Object.keys(EXERCISE_SUBSTITUTIONS);
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const key of keys) {
      expect(getExerciseById(key), key).toBeDefined();
      for (const sub of EXERCISE_SUBSTITUTIONS[key]) {
        expect(getExerciseById(sub.targetId), `${key} -> ${sub.targetId}`).toBeDefined();
        expect(sub.targetId).not.toBe(key);
        expect(sub.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('curated and derived substitutes share the pattern, the muscle, or a declared overlap', () => {
    // A valid substitute trains the same pattern, or the same primary
    // muscle (bench <-> dips is standard coaching practice), or a muscle
    // the source trains secondarily (the library's only carry -> shrugs).
    // Safety does not rest on this rule: the pain path separately bans
    // the painful family outright (getFilteredSubstitutes).
    for (const item of EXERCISE_LIBRARY) {
      for (const { target } of getLibrarySubstitutes(item)) {
        const ok =
          target.movementPattern === item.movementPattern ||
          target.muscle === item.muscle ||
          item.secondaryMuscles.includes(target.muscle);
        expect(ok, `${item.id} -> ${target.id}`).toBe(true);
      }
    }
  });

  it('every library exercise has at least one substitute', () => {
    for (const item of EXERCISE_LIBRARY) {
      expect(getLibrarySubstitutes(item).length, item.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('getQuickSubstitutes only ever returns real library exercise names', () => {
    for (const item of EXERCISE_LIBRARY) {
      const subs = getQuickSubstitutes(item.name);
      expect(subs.length, item.name).toBeGreaterThanOrEqual(1);
      for (const s of subs) {
        expect(LIBRARY_NAMES, `${item.name} -> ${s.name}`).toContain(s.name);
        expect(isPlaceholderSubstitute(s.name)).toBe(false);
      }
    }
  });

  it('the filtered (pain/swap) path is placeholder-free for every library exercise', () => {
    for (const item of EXERCISE_LIBRARY) {
      const subs = getFilteredSubstitutes(item.name, { avoidSameFamilyAs: item.name });
      for (const s of subs) {
        expect(LIBRARY_NAMES, `${item.name} -> ${s.name}`).toContain(s.name);
        expect(isPlaceholderSubstitute(s.name)).toBe(false);
        // Pain swaps must leave the painful family entirely.
        if (item.movementPattern !== 'other') {
          expect(getMovementFamily(s.name), `${item.name} -> ${s.name}`).not.toBe(item.movementPattern);
        }
      }
    }
  });

  it('loose names resolve to the same real substitutes', () => {
    const subs = getQuickSubstitutes('Bench Press');
    expect(subs.length).toBeGreaterThanOrEqual(2);
    for (const s of subs) expect(LIBRARY_NAMES).toContain(s.name);
    expect(getQuickSubstitutes('Unknown Lift')).toEqual([]);
    expect(getQuickSubstitutes('')).toEqual([]);
  });
});

describe('exercise foundation — secondary muscles and instructions', () => {
  it('secondary muscles come from data for library exercises', () => {
    expect(getExerciseSecondaryMuscles('Conventional Deadlift')).toEqual(
      expect.arrayContaining(['Legs', 'Core'])
    );
    expect(getExerciseSecondaryMuscles('Barbell Bench Press')).toEqual(['Arms', 'Shoulders']);
    expect(getExerciseSecondaryMuscles('Pull-ups')).toEqual(
      expect.arrayContaining(['Arms', 'Shoulders'])
    );
  });

  it('main compound lifts carry real howTo instructions', () => {
    const compounds = [
      'squat',
      'front_squat',
      'deadlift',
      'sumo_deadlift',
      'romanian_deadlift',
      'bench_press',
      'incline_bench',
      'overhead_press',
      'barbell_row',
      'pendlay_row',
      'pull_ups',
      'leg_press',
      'barbell_hip_thrust',
    ];
    for (const id of compounds) {
      const item = getExerciseById(id)!;
      expect(item.howTo, id).toBeDefined();
      expect(item.howTo!.length, id).toBeGreaterThanOrEqual(3);
      for (const step of item.howTo!) expect(step.length, id).toBeGreaterThan(20);
    }
    // The 7 conditioning entries that always had instructions keep them.
    expect(getExerciseById('kettlebell_swings')!.howTo!.length).toBeGreaterThanOrEqual(3);
  });

  it('findLibraryExercise: exact, partial, and honest misses', () => {
    expect(findLibraryExercise('Barbell Bench Press')!.id).toBe('bench_press');
    expect(findLibraryExercise('bench press')!.id).toBe('bench_press');
    expect(findLibraryExercise('Totally Made Up Lift')).toBeUndefined();
  });
});

// ── Adversarial regressions (post-review fixes) ─────────────────────────────
// The data table was sound; NAME RESOLUTION was the weak link. These pin:
// the shoulder-ban bypass (Pike Push-ups), template names that resolved
// nowhere or to the wrong row, bare-word over-resolution, and the
// antagonist/compound leakage in the derived substitute pool.

describe('exercise foundation — name resolution (adversarial)', () => {
  it('every alias points at a real exercise', () => {
    for (const [alias, id] of Object.entries(EXERCISE_ALIASES)) {
      expect(getExerciseById(id), alias).toBeDefined();
    }
  });

  it('canonical template names resolve to the right exercise', () => {
    expect(findLibraryExercise('Barbell Row')!.id).toBe('barbell_row');
    expect(findLibraryExercise('Dumbbell Curl')!.id).toBe('db_curl');
    expect(findLibraryExercise('Tricep Pushdown')!.id).toBe('tricep_pushdown_rope');
    expect(findLibraryExercise('Incline Bench')!.id).toBe('incline_bench');
    expect(findLibraryExercise('Close Grip Bench')!.id).toBe('close_grip_bench');
    expect(findLibraryExercise('Seated Row')!.id).toBe('seated_cable_row');
    expect(findLibraryExercise('Cable Fly')!.id).toBe('cable_crossover_high');
  });

  it('the swap UI is non-empty again for template staples', () => {
    expect(getFilteredSubstitutes('Barbell Row').length).toBeGreaterThanOrEqual(1);
    expect(getFilteredSubstitutes('Tricep Pushdown').length).toBeGreaterThanOrEqual(1);
    // The curated db_curl row is reachable from the name templates emit.
    const curlSubs = getQuickSubstitutes('Dumbbell Curl').map((s) => s.name);
    expect(curlSubs).toContain('Incline Dumbbell Curl');
    expect(curlSubs).not.toContain('Barbell Wrist Curl');
  });

  it('logged variants with equipment/tempo qualifiers still resolve', () => {
    expect(findLibraryExercise('Trap Bar Deadlift')!.id).toBe('deadlift');
    expect(findLibraryExercise('Bench Press (Paused)')!.id).toBe('bench_press');
    expect(findLibraryExercise('Zercher Squat')!.id).toBe('squat');
    expect(findLibraryExercise('Deficit Deadlift')!.id).toBe('deadlift');
  });

  it('movement-changing variants are NOT swallowed by the plain entry', () => {
    expect(findLibraryExercise('Pike Push-ups')).toBeUndefined();
    expect(findLibraryExercise('Handstand Push-ups')).toBeUndefined();
    expect(getMovementFamily('Pike Push-ups')).toBe('vertical_push');
    expect(getMovementFamily('Handstand Push-ups')).toBe('vertical_push');
  });

  it('bare generic words stay unresolved instead of guessing', () => {
    for (const bare of ['Curl', 'Extension', 'Press', 'Raise', 'Row', 'Fly']) {
      expect(findLibraryExercise(bare), bare).toBeUndefined();
    }
  });

  it('B-1 end-to-end: the shoulder ban holds for pike/handstand pressing', () => {
    const mk = (name: string): PlannedWorkout[] => [
      {
        id: 'p1',
        name: 'Day',
        createdAt: '2026-01-01',
        exercises: [{ name, targetSets: 3, targetReps: 8, targetWeight: 40 }],
      },
    ];
    const opts = { limitations: ['shoulder injury'] };

    const pike = adaptSplitForEquipment(mk('Pike Push-ups'), 'full_gym', 'kg', 'intermediate', [], opts);
    for (const ex of pike[0].exercises) {
      expect(ex.name).not.toBe('Pike Push-ups');
      expect(getMovementFamily(ex.name)).not.toBe('vertical_push');
    }

    const ohp = adaptSplitForEquipment(
      mk('Overhead Press (Barbell OHP)'),
      'full_gym',
      'kg',
      'intermediate',
      [],
      opts
    );
    for (const ex of ohp[0].exercises) {
      expect(ex.name).not.toBe('Pike Push-ups');
      expect(getMovementFamily(ex.name)).not.toBe('vertical_push');
    }
  });

  it('rowing is a pulling pattern (deliberate), so its pain and swaps behave like one', () => {
    expect(getMovementFamily('Rowing Machine Intervals')).toBe('horizontal_pull');
  });
});

describe('exercise foundation — derived pool discipline (adversarial)', () => {
  it('isolation sources never derive compound substitutes', () => {
    const calf = getExerciseById('standing_calf_raise')!;
    for (const { target } of getLibrarySubstitutes(calf)) {
      expect(['other', 'core', 'carry']).toContain(target.movementPattern);
    }
    const lateral = getExerciseById('db_lateral_raise')!;
    const lateralNames = getLibrarySubstitutes(lateral).map((s) => s.target.name);
    expect(lateralNames).not.toContain('Barbell Push Press');
    expect(lateralNames).not.toContain('Barbell / Cable Upright Row');
  });

  it('arm flexion and extension never substitute each other', () => {
    const skull = getExerciseById('skull_crushers')!;
    for (const { target } of getLibrarySubstitutes(skull)) {
      expect(target.name).not.toMatch(/curl/i);
    }
    const curl = getExerciseById('db_curl')!;
    for (const { target } of getLibrarySubstitutes(curl)) {
      expect(target.name).not.toMatch(/pushdown|extension|crusher/i);
    }
  });

  it('derived lists mix equipment so downstream filters cannot starve', () => {
    // Incline curl is dumbbell work; its derived list must include a
    // dumbbell option or home-equipment filtering empties it.
    const incline = getExerciseById('incline_db_curl')!;
    const subs = getLibrarySubstitutes(incline);
    expect(subs.some((s) => s.target.equipment === 'Dumbbell')).toBe(true);
  });
});
