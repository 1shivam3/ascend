import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  EXERCISE_DEMO_MANIFEST,
  getDemoForExercise,
} from '../src/lib/exercise-media';
import ExerciseDemo, { DEMO_IDS_WITH_ARTWORK } from '../src/components/ExerciseDemo';
import { EXERCISE_LIBRARY } from '../src/lib/exercise-library';

describe('exercise demo manifest', () => {
  it('covers ~24 exercises, each with a recorded source and license', () => {
    expect(EXERCISE_DEMO_MANIFEST.length).toBeGreaterThanOrEqual(24);
    for (const entry of EXERCISE_DEMO_MANIFEST) {
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.license.length).toBeGreaterThan(0);
      expect(entry.format).toBe('animated-svg');
      expect(entry.exerciseNames.length).toBeGreaterThan(0);
    }
  });

  it('every manifest entry has artwork, and every artwork is in the manifest', () => {
    const manifestIds = new Set(EXERCISE_DEMO_MANIFEST.map((e) => e.demoId));
    for (const id of manifestIds) expect(DEMO_IDS_WITH_ARTWORK).toContain(id);
    for (const id of DEMO_IDS_WITH_ARTWORK) expect(manifestIds.has(id)).toBe(true);
    expect(DEMO_IDS_WITH_ARTWORK.length).toBe(manifestIds.size);
  });

  it('every canonical library name for a covered demo resolves to it', () => {
    for (const entry of EXERCISE_DEMO_MANIFEST) {
      for (const alias of entry.exerciseNames) {
        const found = getDemoForExercise(alias);
        expect(found?.demoId, `alias "${alias}"`).toBe(entry.demoId);
      }
    }
  });
});

describe('getDemoForExercise matching', () => {
  it('resolves the core lifts by their library names', () => {
    expect(getDemoForExercise('Barbell Back Squat')?.demoId).toBe('squat');
    expect(getDemoForExercise('Barbell Bench Press')?.demoId).toBe('bench-press');
    expect(getDemoForExercise('Conventional Deadlift')?.demoId).toBe('deadlift');
    expect(getDemoForExercise('Overhead Press (Barbell OHP)')?.demoId).toBe('overhead-press');
    expect(getDemoForExercise('Barbell Bent-Over Row')?.demoId).toBe('barbell-row');
    expect(getDemoForExercise('Push-ups')?.demoId).toBe('push-up');
    expect(getDemoForExercise('Pull-ups')?.demoId).toBe('pull-up');
  });

  it('does not let generic entries swallow specific exercises', () => {
    // RDL is a hinge of its own — not the deadlift demo.
    expect(getDemoForExercise('Romanian Deadlift (RDL)')?.demoId).toBe('romanian-deadlift');
    expect(getDemoForExercise('Dumbbell Romanian Deadlift')?.demoId).toBe('romanian-deadlift');
    // Leg Curl is not a bicep curl; Wrist Curl gets nothing.
    expect(getDemoForExercise('Lying Leg Curl')?.demoId).toBe('leg-curl');
    expect(getDemoForExercise('Seated Leg Curl')?.demoId).toBe('leg-curl');
    expect(getDemoForExercise('Barbell Wrist Curl')).toBeNull();
    // Goblet and split squats keep their own demos.
    expect(getDemoForExercise('Goblet Squat')?.demoId).toBe('goblet-squat');
    expect(getDemoForExercise('Bulgarian Split Squat')?.demoId).toBe('split-squat');
    // Incline dumbbell work is a press, not a curl/fly mix-up.
    expect(getDemoForExercise('Incline Dumbbell Press')?.demoId).toBe('db-bench-press');
    expect(getDemoForExercise('Incline Dumbbell Curl')?.demoId).toBe('curl');
  });

  it('returns null — no placeholder — for exercises without a demo', () => {
    expect(getDemoForExercise('Cable Woodchopper')).toBeNull();
    expect(getDemoForExercise('Sled Push')).toBeNull();
    expect(getDemoForExercise('Some Custom Move The User Typed')).toBeNull();
    expect(getDemoForExercise('')).toBeNull();
  });

  it('covers the big compounds that exist in the exercise library', () => {
    const names = new Set(EXERCISE_LIBRARY.map((e) => e.name));
    for (const must of [
      'Barbell Back Squat',
      'Barbell Bench Press',
      'Conventional Deadlift',
      'Pull-ups',
      'Lat Pulldown',
      'Leg Press',
    ]) {
      expect(names.has(must)).toBe(true);
      expect(getDemoForExercise(must)).not.toBeNull();
    }
  });
});

describe('ExerciseDemo rendering', () => {
  it('renders an animated SVG for a covered exercise', () => {
    const html = renderToStaticMarkup(React.createElement(ExerciseDemo, { name: 'Barbell Back Squat' }));
    expect(html).toContain('<svg');
    expect(html).toContain('animateTransform');
    expect(html).toContain('Animated demonstration: Barbell Back Squat');
  });

  it('renders nothing for an exercise without a demo', () => {
    const html = renderToStaticMarkup(React.createElement(ExerciseDemo, { name: 'Cable Woodchopper' }));
    expect(html).toBe('');
  });
});
