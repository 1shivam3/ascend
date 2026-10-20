import { describe, it, expect } from 'vitest';
import {
  csvField,
  workoutsToCsv,
  mealsToCsv,
  bodyMetricsToCsv,
  buildCombinedCsvExport,
} from '../src/lib/csv-export';
import type { BodyMetricEntry, MealEntry, WorkoutEntry } from '../src/lib/types';

describe('csvField escaping (RFC 4180)', () => {
  it('quotes fields containing commas, quotes or newlines', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(42)).toBe('42');
    expect(csvField(0)).toBe('0');
  });
});

const workouts: WorkoutEntry[] = [
  {
    id: 'w1',
    date: '2026-10-19',
    name: 'Push, Day "A"',
    exercises: [
      {
        name: 'Barbell Bench Press',
        sets: [
          { reps: 5, weight: 80, unit: 'kg', rpe: 8, completed: true },
          { reps: 12, weight: 20, unit: 'kg', completed: true, isWarmup: true },
          { reps: 0, weight: 85, unit: 'kg', completed: false, status: 'skipped' },
        ],
      },
    ],
  },
];

describe('workoutsToCsv', () => {
  it('emits a documented header and one row per set', () => {
    const csv = workoutsToCsv(workouts);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('# Columns:');
    expect(lines[2]).toBe('date,workout,exercise,set,reps,weight,unit,rpe,completed,warmup');
    expect(lines).toHaveLength(6); // 2 doc lines + header + 3 sets
    expect(lines[3]).toContain('2026-10-19');
    expect(lines[3]).toContain('"Push, Day ""A"""');
    expect(lines[3]).toContain('Barbell Bench Press,1,5,80,kg,8,yes,no');
    expect(lines[4]).toContain(',yes,yes'); // warmup flagged
    expect(lines[5]).toContain(',no,no'); // skipped set not completed
  });

  it('handles empty history (header only)', () => {
    expect(workoutsToCsv([]).split('\n')).toHaveLength(3);
  });
});

describe('mealsToCsv', () => {
  const meals: MealEntry[] = [
    {
      id: 'm1',
      date: '2026-10-19',
      name: 'Lunch',
      foods: [
        { name: 'Dal, tadka', calories: 320, proteinG: 12, carbsG: 40, fatG: 11, quantity: 2, unit: 'katori' },
        { name: 'Whey', calories: 120, proteinG: 24, carbsG: 3, fatG: 1, sugarG: 2 },
      ],
    },
  ];

  it('emits one row per food with macros; sugar blank when unknown', () => {
    const lines = mealsToCsv(meals).split('\n');
    expect(lines[2]).toBe('date,meal,food,quantity,unit,calories,protein_g,carbs_g,fat_g,sugar_g');
    expect(lines[3]).toContain('"Dal, tadka",2,katori,320,12,40,11,');
    expect(lines[3].endsWith(',')).toBe(true); // sugar unknown → blank, not 0
    expect(lines[4]).toContain('Whey,,,120,24,3,1,2');
  });
});

describe('bodyMetricsToCsv', () => {
  it('includes the source tag, defaulting to manual', () => {
    const metrics: BodyMetricEntry[] = [
      { id: 'a', date: '2026-10-18', weightKg: 81, source: 'health-connect' },
      { id: 'b', date: '2026-10-19', weightKg: 80.5, waistIn: 34 },
    ];
    const lines = bodyMetricsToCsv(metrics).split('\n');
    // 2 doc lines + header, then rows sorted ascending by date
    expect(lines[3]).toContain('health-connect');
    expect(lines[4]).toContain('80.5');
    expect(lines[4]).toContain('manual');
  });
});

describe('buildCombinedCsvExport', () => {
  it('contains all three documented sections', () => {
    const out = buildCombinedCsvExport(
      { workouts, meals: [], bodyMetrics: [] },
      new Date('2026-10-20T10:00:00.000Z')
    );
    expect(out).toContain('# ASCEND DATA EXPORT');
    expect(out).toContain('# Generated: 2026-10-20T10:00:00.000Z');
    expect(out).toContain('# ===== WORKOUTS =====');
    expect(out).toContain('# ===== MEALS =====');
    expect(out).toContain('# ===== BODY METRICS =====');
  });
});
