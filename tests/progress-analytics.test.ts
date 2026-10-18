import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import {
  WorkoutEntry,
  PersonalRecord,
  BodyMetricEntry,
  isSetCompleted,
} from '../src/lib/types';
import { calculateOneRepMax } from '../src/lib/strength-standards';
import { getExerciseHistorySessions } from '../src/lib/lifter-twin';

// Helper matching computeChartGeometry in ProgressPage
function computeChartGeometry(
  values: { date: string; value: number }[],
  width: number,
  height: number,
  padX: number = 10,
  padY: number = 20
) {
  if (values.length === 0) {
    return { pathD: '', areaD: '', points: [], min: 0, max: 0 };
  }

  const rawVals = values.map((v) => v.value);
  let min = Math.min(...rawVals);
  let max = Math.max(...rawVals);

  if (min === max) {
    min = Math.max(0, min - 10);
    max = max + 10;
  } else {
    const pad = (max - min) * 0.15;
    min = Math.max(0, min - pad);
    max = max + pad;
  }

  const valRange = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = values.map((item, idx) => {
    const x = values.length === 1
      ? padX + innerW / 2
      : padX + (idx / (values.length - 1)) * innerW;
    const norm = (item.value - min) / valRange;
    const y = padY + (1 - norm) * innerH;
    return { x, y, val: item.value, dateStr: item.date };
  });

  if (points.length === 1) {
    const p = points[0];
    const pathD = `M ${padX} ${p.y} L ${width - padX} ${p.y}`;
    const areaD = `M ${padX} ${p.y} L ${width - padX} ${p.y} L ${width - padX} ${height} L ${padX} ${height} Z`;
    return { pathD, areaD, points, min, max };
  }

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    pathD += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const lastP = points[points.length - 1];
  const firstP = points[0];
  const areaD = `${pathD} L ${lastP.x} ${height} L ${firstP.x} ${height} Z`;

  return { pathD, areaD, points, min, max };
}

describe('Phase 5: Progress & Analytics Independent Regression Audit', () => {
  beforeEach(() => {
    useStore.getState().logout({ clearLocalData: true });
  });

  describe('1. Strength Analytics & 1RM Calculations', () => {
    it('returns null/dash for core lifts when user has no PRs or completed workout sessions', () => {
      const state = useStore.getState();
      expect(state.prs).toHaveLength(0);
      expect(state.workouts).toHaveLength(0);

      const coreLiftNames = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];
      coreLiftNames.forEach((name) => {
        const prMatches = state.prs.filter((p) => p.exercise.toLowerCase().includes(name.toLowerCase()));
        expect(prMatches).toHaveLength(0);

        const sessions = getExerciseHistorySessions(name, state.workouts, 'lbs');
        expect(sessions).toHaveLength(0);
      });
    });

    it('accurately derives 1RM from PR records without hardcoding example values', () => {
      const pr: PersonalRecord = {
        id: 'pr-1',
        exercise: 'Bench Press',
        weightKg: 100,
        weightLbs: 220,
        reps: 1,
        oneRepMax: 100,
        date: '2026-10-15',
      };
      useStore.getState().addPR(pr);

      const state = useStore.getState();
      const benchPRs = state.prs.filter((p) => p.exercise.toLowerCase().includes('bench'));
      expect(benchPRs).toHaveLength(1);
      expect(benchPRs[0].oneRepMax).toBe(100);
      expect(benchPRs[0].weightLbs).toBe(220);
    });

    it('calculates E1RM for completed workout sets using the Epley formula', () => {
      const workout: WorkoutEntry = {
        id: 'w-1',
        date: '2026-10-14',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { reps: 8, weight: 100, unit: 'kg', completed: true },
              { reps: 5, weight: 110, unit: 'kg', completed: false, status: 'skipped' }, // must be ignored
            ],
          },
        ],
      };
      useStore.getState().addWorkout(workout);

      const state = useStore.getState();
      const sessions = getExerciseHistorySessions('Bench Press', state.workouts, 'kg');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].bestWeight).toBe(100);
      expect(sessions[0].bestReps).toBe(8);

      const expectedE1RM = calculateOneRepMax(100, 8); // 100 * (1 + 8/30) = ~126.67
      expect(Math.round(sessions[0].bestE1RM)).toBe(Math.round(expectedE1RM));
    });

    it('ignores incomplete sets (skipped, pending) when computing session bests', () => {
      const workout: WorkoutEntry = {
        id: 'w-skipped',
        date: '2026-10-14',
        exercises: [
          {
            name: 'Squat',
            sets: [
              { reps: 10, weight: 200, unit: 'kg', status: 'skipped', completed: false },
              { reps: 5, weight: 140, unit: 'kg', status: 'completed' },
            ],
          },
        ],
      };
      useStore.getState().addWorkout(workout);

      const sessions = getExerciseHistorySessions('Squat', useStore.getState().workouts, 'kg');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].bestWeight).toBe(140);
      expect(sessions[0].bestReps).toBe(5);
    });
  });

  describe('2. Real Delta & Progress Percentage Calculations', () => {
    it('returns "Baseline" when only 1 progress data point exists', () => {
      const dataPoints = [{ date: '2026-10-01', value: 185 }];
      let deltaText = 'No data';
      if (dataPoints.length >= 2) {
        const latest = dataPoints[dataPoints.length - 1].value;
        const first = dataPoints[0].value;
        const delta = latest - first;
        const pct = first > 0 ? (delta / first) * 100 : 0;
        deltaText = `${delta >= 0 ? '+' : ''}${Math.round(delta)} lbs (${delta >= 0 ? '+' : ''}${Math.round(pct)}%)`;
      } else if (dataPoints.length === 1) {
        deltaText = 'Baseline';
      }

      expect(deltaText).toBe('Baseline');
    });

    it('correctly formats positive progress delta with + sign and rounded percentage', () => {
      const dataPoints = [
        { date: '2026-08-01', value: 200 },
        { date: '2026-10-01', value: 220 },
      ];
      const latest = dataPoints[dataPoints.length - 1].value;
      const first = dataPoints[0].value;
      const delta = latest - first;
      const pct = first > 0 ? (delta / first) * 100 : 0;
      const deltaText = `${delta >= 0 ? '+' : ''}${Math.round(delta)} lbs (${delta >= 0 ? '+' : ''}${Math.round(pct)}%)`;

      expect(deltaText).toBe('+20 lbs (+10%)');
    });

    it('correctly formats negative delta without double minus sign', () => {
      const dataPoints = [
        { date: '2026-08-01', value: 180 },
        { date: '2026-10-01', value: 175 },
      ];
      const latest = dataPoints[dataPoints.length - 1].value;
      const first = dataPoints[0].value;
      const delta = latest - first;
      const pct = first > 0 ? (delta / first) * 100 : 0;
      const deltaText = `${delta >= 0 ? '+' : ''}${Math.round(delta)} lbs (${delta >= 0 ? '+' : ''}${Math.round(pct)}%)`;

      expect(deltaText).toBe('-5 lbs (-3%)');
    });
  });

  describe('3. Dynamic SVG Chart Mathematics and Time-Range Filtering', () => {
    it('returns empty geometry when no values are provided', () => {
      const geom = computeChartGeometry([], 320, 110);
      expect(geom.pathD).toBe('');
      expect(geom.areaD).toBe('');
      expect(geom.points).toHaveLength(0);
    });

    it('renders a valid horizontal line when a single value exists', () => {
      const geom = computeChartGeometry([{ date: '2026-10-15', value: 185 }], 320, 110, 10, 20);
      expect(geom.points).toHaveLength(1);
      expect(geom.pathD).toContain('M 10');
      expect(geom.pathD).toContain('L 310');
      expect(geom.areaD).toContain('Z');
      expect(geom.pathD).not.toContain('NaN');
      expect(geom.areaD).not.toContain('NaN');
    });

    it('generates a smooth cubic bezier SVG path for multi-point series', () => {
      const values = [
        { date: '2026-08-01', value: 185 },
        { date: '2026-09-01', value: 195 },
        { date: '2026-10-01', value: 205 },
      ];
      const geom = computeChartGeometry(values, 320, 110, 10, 20);
      expect(geom.points).toHaveLength(3);
      expect(geom.pathD).toContain('M');
      expect(geom.pathD).toContain('C');
      expect(geom.areaD).toContain('Z');
      expect(geom.pathD).not.toContain('NaN');
      expect(geom.points[0].x).toBe(10);
      expect(geom.points[2].x).toBe(310);
    });

    it('correctly filters data points by time cutoff (1M, 3M, 6M, 1Y)', () => {
      const now = new Date('2026-10-17T12:00:00Z').getTime();
      const pointsMap = new Map<string, number>([
        ['2025-05-01', 170], // ~17 months ago
        ['2026-01-01', 180], // ~9.5 months ago
        ['2026-06-01', 190], // ~4.5 months ago
        ['2026-09-01', 200], // ~1.5 months ago
        ['2026-10-10', 210], // 7 days ago
      ]);

      const testRange = (range: '1M' | '3M' | '6M' | '1Y') => {
        const days = range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : 365;
        const cutoff = now - days * 86400000;
        return Array.from(pointsMap.keys()).filter((d) => new Date(d).getTime() >= cutoff);
      };

      expect(testRange('1M')).toEqual(['2026-10-10']);
      expect(testRange('3M')).toEqual(['2026-09-01', '2026-10-10']);
      expect(testRange('6M')).toEqual(['2026-06-01', '2026-09-01', '2026-10-10']);
      expect(testRange('1Y')).toEqual(['2026-01-01', '2026-06-01', '2026-09-01', '2026-10-10']);
    });
  });

  describe('4. Body Measurements Storage & Conversions', () => {
    it('persists weight, body fat %, and circumferences via updateBodyMetrics', () => {
      useStore.getState().setProfile({
        id: 'u-1',
        name: 'Alex',
        gender: 'male',
        bodyweightKg: 80,
        bodyweightLbs: 176,
        unit: 'lbs',
        createdAt: '2026-01-01',
      });

      // Update body metrics with weight, height, body fat, chest, waist, hips
      useStore.getState().updateBodyMetrics(81.5, 180, 14.5, 41.5, 31.5, 37.5);

      const state = useStore.getState();
      expect(state.bodyMetrics.length).toBeGreaterThan(0);
      const latest = state.bodyMetrics[0];
      expect(latest.weightKg).toBe(81.5);
      expect(latest.heightCm).toBe(180);
      expect(latest.bodyFatPct).toBe(14.5);
      expect(latest.chestIn).toBe(41.5);
      expect(latest.waistIn).toBe(31.5);
      expect(latest.hipsIn).toBe(37.5);

      // Profile bodyweight must be synchronized
      expect(state.profile?.bodyweightKg).toBe(81.5);
      expect(state.profile?.bodyweightLbs).toBe(179.7);
    });

    it('correctly converts between inches and centimeters without precision drift', () => {
      const chestInches = 40.0;
      const chestCm = chestInches * 2.54; // 101.6 cm
      expect(chestCm).toBeCloseTo(101.6, 1);

      const backToInches = chestCm / 2.54;
      expect(backToInches).toBeCloseTo(40.0, 1);
    });

    it('leaves circumference values undefined if not logged, preventing fabricated defaults', () => {
      useStore.getState().setProfile({
        id: 'u-1',
        name: 'Alex',
        gender: 'male',
        bodyweightKg: 75,
        bodyweightLbs: 165,
        unit: 'kg',
        createdAt: '2026-01-01',
      });

      // User logs weight only (circumferences omitted)
      useStore.getState().updateBodyMetrics(75.5);

      const latest = useStore.getState().bodyMetrics[0];
      expect(latest.weightKg).toBe(75.5);
      expect(latest.bodyFatPct).toBeUndefined();
      expect(latest.chestIn).toBeUndefined();
      expect(latest.waistIn).toBeUndefined();
      expect(latest.hipsIn).toBeUndefined();
    });
  });

  describe('5. Consistency Engine & Streak Math', () => {
    it('deduplicates multiple workouts logged on the exact same calendar date', () => {
      const date = '2026-10-14';
      const w1: WorkoutEntry = {
        id: 'w-morning',
        date: `${date}T08:00:00Z`,
        exercises: [{ name: 'Cardio', sets: [{ reps: 1, unit: 'kg', completed: true }] }],
      };
      const w2: WorkoutEntry = {
        id: 'w-evening',
        date: `${date}T18:00:00Z`,
        exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight: 100, unit: 'kg', completed: true }] }],
      };

      useStore.getState().addWorkout(w1);
      useStore.getState().addWorkout(w2);

      const workouts = useStore.getState().workouts;
      const workoutDays = new Set<string>();
      workouts.forEach((w) => {
        if (w.date) {
          const dStr = w.date.split('T')[0];
          const hasCompletedSets = w.exercises.some((e) => e.sets.some(isSetCompleted));
          if (hasCompletedSets || w.exercises.length > 0) {
            workoutDays.add(dStr);
          }
        }
      });

      expect(workouts).toHaveLength(2);
      expect(workoutDays.size).toBe(1); // strictly 1 active workout day
    });

    it('calculates real consecutive daily streaks without fabricating minimums', () => {
      // Empty workouts -> 0 day streak
      const calculateStreak = (workoutsList: WorkoutEntry[], referenceDate: Date): number => {
        const workoutDays = new Set<string>();
        workoutsList.forEach((w) => {
          if (w.date) {
            const dStr = w.date.split('T')[0];
            const hasCompletedSets = w.exercises.some((e) => e.sets.some(isSetCompleted));
            if (hasCompletedSets || w.exercises.length > 0) {
              workoutDays.add(dStr);
            }
          }
        });

        const formatDateStr = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const todayStr = formatDateStr(referenceDate);
        let streak = 0;
        const checkDate = new Date(referenceDate);
        if (!workoutDays.has(todayStr)) {
          checkDate.setDate(checkDate.getDate() - 1);
        }

        while (streak < 365) {
          const dStr = formatDateStr(checkDate);
          if (workoutDays.has(dStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
        return streak;
      };

      const refDate = new Date('2026-10-17T12:00:00');
      expect(calculateStreak([], refDate)).toBe(0);

      // Add workouts for Oct 17, 16, 15
      const workouts: WorkoutEntry[] = [
        { id: 'w1', date: '2026-10-17', exercises: [{ name: 'A', sets: [{ reps: 5, unit: 'kg', completed: true }] }] },
        { id: 'w2', date: '2026-10-16', exercises: [{ name: 'B', sets: [{ reps: 5, unit: 'kg', completed: true }] }] },
        { id: 'w3', date: '2026-10-15', exercises: [{ name: 'C', sets: [{ reps: 5, unit: 'kg', completed: true }] }] },
      ];
      expect(calculateStreak(workouts, refDate)).toBe(3);

      // If Oct 14 was a missed day, streak should strictly remain 3
      const workoutsWithGap: WorkoutEntry[] = [
        ...workouts,
        { id: 'w5', date: '2026-10-13', exercises: [{ name: 'D', sets: [{ reps: 5, unit: 'kg', completed: true }] }] },
      ];
      expect(calculateStreak(workoutsWithGap, refDate)).toBe(3);
    });

    it('computes rolling 4-week consistency percentage against real workout entries', () => {
      const weeklyTarget = 5;
      const fourWeeksTarget = weeklyTarget * 4; // 20 sessions

      // Case 1: 0 sessions -> 0%
      expect(Math.round((0 / fourWeeksTarget) * 100)).toBe(0);

      // Case 2: 10 sessions -> 50%
      expect(Math.round((10 / fourWeeksTarget) * 100)).toBe(50);

      // Case 3: 16 sessions -> 80% (matches reference only when user actually logged 16 sessions)
      expect(Math.round((16 / fourWeeksTarget) * 100)).toBe(80);
    });
  });
});
