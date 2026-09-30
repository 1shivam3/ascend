import assert from 'assert';
import {
  getLastExercisePerformance,
  getProgressionRecommendation,
  getQuickSubstitutes,
  compressWorkout,
  parseVoiceWorkout
} from '../src/lib/workout-engine';
import { WorkoutEntry } from '../src/lib/types';

console.log('Running Workout Engine Tests...');

const mockWorkouts: WorkoutEntry[] = [
  {
    id: 'w1',
    date: '2026-09-28',
    exercises: [
      {
        name: 'Bench Press',
        sets: [
          { weight: 70, reps: 8, unit: 'kg' },
          { weight: 70, reps: 8, unit: 'kg' },
          { weight: 70, reps: 7, unit: 'kg' }
        ]
      },
      {
        name: 'Incline Dumbbell Press',
        sets: [{ weight: 26, reps: 10, unit: 'kg' }]
      }
    ]
  },
  {
    id: 'w2',
    date: '2026-09-24',
    exercises: [
      {
        name: 'Bench Press',
        sets: [
          { weight: 70, reps: 7, unit: 'kg' },
          { weight: 70, reps: 7, unit: 'kg' },
          { weight: 70, reps: 6, unit: 'kg' }
        ]
      }
    ]
  }
];

// Test 1: getLastExercisePerformance
const lastBench = getLastExercisePerformance('Bench Press', mockWorkouts);
assert(lastBench !== null, 'Should find last bench performance');
assert.strictEqual(lastBench.summary, '70kg × 8, 70kg × 8, 70kg × 7');
console.log('✓ Last Time summary:', lastBench.summary);

// Test 2: getProgressionRecommendation
const prog = getProgressionRecommendation('Bench Press', mockWorkouts);
assert(prog !== null, 'Should return progression recommendation');
console.log('✓ Progression target:', prog.targetSummary, 'Rationale:', prog.rationale);

// Test 3: Voice parsing
const voiceResult = parseVoiceWorkout('Bench 70 for 8 8 7', ['Bench Press', 'Squat']);
assert(voiceResult !== null, 'Voice parser should parse');
assert.strictEqual(voiceResult.exerciseName, 'Bench Press');
assert.strictEqual(voiceResult.sets.length, 3);
assert.strictEqual(voiceResult.sets[0].weight, 70);
assert.strictEqual(voiceResult.sets[0].reps, 8);
assert.strictEqual(voiceResult.sets[2].reps, 7);
console.log('✓ Voice parsed:', voiceResult.exerciseName, voiceResult.sets);

// Test 4: Quick substitutes
const subs = getQuickSubstitutes('Leg Extension');
assert(subs.length >= 2, 'Should provide at least 2 substitutes for Leg Extension');
console.log('✓ Substitutes for Leg Extension:', subs.map(s => s.name).join(', '));

// Test 5: Compression
const compressed = compressWorkout(
  [
    { name: 'Bench Press', sets: [{ weight: 70, reps: 8, unit: 'kg' }, { weight: 70, reps: 8, unit: 'kg' }, { weight: 70, reps: 8, unit: 'kg' }, { weight: 70, reps: 8, unit: 'kg' }] },
    { name: 'Incline Dumbbell Press', sets: [{ weight: 26, reps: 10, unit: 'kg' }] },
    { name: 'Cable Fly', sets: [{ weight: 15, reps: 12, unit: 'kg' }] },
    { name: 'Tricep Pushdown', sets: [{ weight: 25, reps: 12, unit: 'kg' }] },
    { name: 'Overhead Tricep Extension', sets: [{ weight: 20, reps: 12, unit: 'kg' }] },
    { name: 'Lateral Raises', sets: [{ weight: 10, reps: 15, unit: 'kg' }] }
  ],
  30
);
assert.strictEqual(compressed.length, 3, '30m should trim to 3 exercises');
console.log('✓ Compressed 30m workout length:', compressed.length);

console.log('ALL WORKOUT ENGINE TESTS PASSED!');
