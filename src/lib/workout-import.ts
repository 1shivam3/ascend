import { WorkoutEntry, WorkoutExercise, WorkoutSet, PersonalRecord, Unit } from './types';
import { calculateOneRepMax } from './strength-standards';
import { parseImportedDateString } from './formatters';

/**
 * Universal CSV Workout Importer for Strong, Hevy, FitNotes, and generic workout logs.
 */
export interface ImportWorkoutResult {
  workoutsImported: number;
  exercisesFound: number;
  totalSets: number;
  newPRsCount: number;
  /** Gauntlet DI-07: rows whose date had to be normalized. */
  datesNormalized: number;
  workouts: WorkoutEntry[];
  newPRs: PersonalRecord[];
}

export interface ParseWorkoutCSVOptions {
  /** Used when the CSV itself carries no unit signal. Default 'kg'. */
  fallbackUnit?: Unit;
}

/** Small deterministic content hash (djb2) — import IDs must be stable
 *  across re-imports of the same file so the store's idempotency guard
 *  can recognize a duplicate instead of stacking copies. */
function contentHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function setsSignature(sets: WorkoutSet[]): string {
  return sets
    .map((s) => `${s.weight ?? 0}x${s.reps}@${s.rpe ?? ''}${s.unit || ''}`)
    .join(',');
}

/** Parse a duration cell: "1:05:30", "45:00", "1h 5m", "75 min", "4500s", "90". */
function parseDurationMinutes(raw: string): number | undefined {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return undefined;
  const colon = v.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const a = parseInt(colon[1], 10);
    const b = parseInt(colon[2], 10);
    const c = colon[3] ? parseInt(colon[3], 10) : 0;
    return colon[3] ? a * 60 + b + Math.round(c / 60) : a + Math.round(b / 60);
  }
  const h = v.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = v.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const s = v.match(/(\d+(?:\.\d+)?)\s*s/);
  if (h || m || s) {
    return Math.round(
      (h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0) + (s ? parseFloat(s[1]) / 60 : 0)
    );
  }
  const num = parseFloat(v.replace(/[^0-9.]/g, ''));
  if (!isNaN(num) && num > 0) {
    // A bare number > 300 is far more likely seconds than minutes.
    return num > 300 ? Math.round(num / 60) : Math.round(num);
  }
  return undefined;
}

export function parseWorkoutCSV(csvText: string, options: ParseWorkoutCSVOptions = {}): ImportWorkoutResult {
  let datesNormalized = 0;
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV file is empty or missing headers.');
  }

  // Parse header
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(/,|;|\t/).map((h) => h.replace(/^["']|["']$/g, '').trim());

  // Find column indices
  const dateIdx = headers.findIndex((h) => h.includes('date'));
  const exerciseMatch = headers.findIndex((h) => h.includes('exercise') || h.includes('lift'));
  const exerciseIdx = exerciseMatch !== -1 ? exerciseMatch : headers.findIndex((h) => h === 'name' || (h.includes('name') && !h.includes('workout')));
  const weightIdx = headers.findIndex((h) => h.includes('weight') || h.includes('kg') || h.includes('lbs'));
  const repsIdx = headers.findIndex((h) => h.includes('rep'));
  // Strong exports a dedicated "Weight Unit" column; others embed the unit in
  // the header (e.g. "Weight (lbs)").
  const weightUnitIdx = headers.findIndex((h) => h.includes('weight unit') || h === 'unit');
  const rpeIdx = headers.findIndex((h) => h.includes('rpe'));
  const workoutNameIdx = headers.findIndex(
    (h) => h.includes('workout name') || h.includes('workout title') || h === 'workout'
  );
  const durationIdx = headers.findIndex((h) => h.includes('duration'));
  const headerUnit: Unit | null = headers.some((h) => h.includes('lbs') || h.includes('pound'))
    ? 'lbs'
    : headers.some((h) => h.includes('kg') || h.includes('kilo'))
      ? 'kg'
      : null;
  const fallbackUnit: Unit = options.fallbackUnit || 'kg';

  if (dateIdx === -1 || exerciseIdx === -1) {
    throw new Error('CSV must contain "Date" and "Exercise" columns. Standard exports from Strong, Hevy, or FitNotes are supported.');
  }

  // Group by SESSION -> exercise. A session is a date plus, when the CSV
  // carries them, the workout name or an AM/PM time bucket — grouping by
  // bare date used to merge a two-a-day lifter's sessions into one.
  interface ImportSession {
    date: string;
    name?: string;
    durationMinutes?: number;
    exercises: Record<string, WorkoutSet[]>;
  }
  const sessionsMap: Record<string, ImportSession> = {};

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Handle comma inside quotes or standard split
    const parts = rawLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^["']|["']$/g, '').trim());
    if (parts.length <= Math.max(dateIdx, exerciseIdx)) continue;

    const rawDate = parts[dateIdx];
    const rawExercise = parts[exerciseIdx];
    if (!rawDate || !rawExercise) continue;

    // Sanitize exercise against CSV formula injection and prototype pollution
    const exercise = rawExercise.replace(/^[\t\r=+\-@]+/, '').trim().slice(0, 100);
    if (!exercise || exercise === '__proto__' || exercise === 'constructor' || exercise === 'prototype') {
      continue;
    }

    // Normalize date to YYYY-MM-DD. Gauntlet DI-07: explicit parsing
    // only — the old `new Date(rawDate)` read the date as UTC (day
    // shift in positive-offset timezones), silently read ambiguous
    // slash dates as US format, and accepted future dates.
    // parseImportedDateString disambiguates slash dates by range,
    // takes the LOCAL day of ISO datetimes, and rejects non-calendar
    // and future dates; an unparseable date skips the row.
    const parsedDay = parseImportedDateString(rawDate);
    if (!parsedDay) {
      continue;
    }
    if (parsedDay !== rawDate.trim()) datesNormalized += 1;
    const normalizedDate = parsedDay;

    if (!normalizedDate || normalizedDate === '__proto__' || normalizedDate === 'constructor' || normalizedDate === 'prototype') {
      continue;
    }

    const weightVal = weightIdx !== -1 && parts[weightIdx] ? parseFloat(parts[weightIdx].replace(/[^0-9.]/g, '')) : 0;
    const repsVal = repsIdx !== -1 && parts[repsIdx] ? parseInt(parts[repsIdx].replace(/[^0-9]/g, ''), 10) : 0;
    const rpeVal = rpeIdx !== -1 && parts[rpeIdx] ? parseFloat(parts[rpeIdx].replace(/[^0-9.]/g, '')) : NaN;

    const weight = isNaN(weightVal) ? 0 : Math.min(1000, Math.max(0, weightVal));
    const reps = isNaN(repsVal) ? 1 : Math.min(500, Math.max(1, repsVal));

    // Per-row unit: dedicated unit column wins, then the header's unit, then
    // the caller's fallback (their profile unit). Never silently hardcode kg.
    let rowUnit: Unit = headerUnit || fallbackUnit;
    if (weightUnitIdx !== -1 && parts[weightUnitIdx]) {
      const u = parts[weightUnitIdx].toLowerCase();
      if (u.includes('lb') || u.includes('pound')) rowUnit = 'lbs';
      else if (u.includes('kg') || u.includes('kilo')) rowUnit = 'kg';
    }

    const workoutName =
      workoutNameIdx !== -1 && parts[workoutNameIdx]
        ? parts[workoutNameIdx].trim().slice(0, 100)
        : '';
    let timeBucket = '';
    if (!workoutName && /\d{1,2}:\d{2}/.test(rawDate)) {
      const parsedForTime = new Date(rawDate);
      if (!isNaN(parsedForTime.getTime())) {
        timeBucket = parsedForTime.getHours() < 12 ? 'am' : 'pm';
      }
    }
    const sessionKey = `${normalizedDate}|${workoutName.toLowerCase()}|${timeBucket}`;
    if (!Object.prototype.hasOwnProperty.call(sessionsMap, sessionKey)) {
      sessionsMap[sessionKey] = {
        date: normalizedDate,
        name: workoutName || undefined,
        exercises: Object.create(null),
      };
    }
    const session = sessionsMap[sessionKey];
    if (durationIdx !== -1 && parts[durationIdx]) {
      const mins = parseDurationMinutes(parts[durationIdx]);
      if (mins && mins > 0) {
        session.durationMinutes = Math.max(session.durationMinutes || 0, mins);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(session.exercises, exercise)) {
      session.exercises[exercise] = [];
    }

    const newSet: WorkoutSet = {
      weight,
      reps,
      unit: rowUnit,
      completed: true,
    };
    // Strong's per-set RPE column feeds the app's auto-regulation — don't drop it.
    if (!isNaN(rpeVal) && rpeVal >= 0 && rpeVal <= 10) {
      newSet.rpe = Math.round(rpeVal * 10) / 10;
    }

    session.exercises[exercise].push(newSet);
  }

  const workouts: WorkoutEntry[] = [];
  const exerciseNamesSet = new Set<string>();
  let totalSets = 0;

  // Convert sessions to WorkoutEntry[] with DETERMINISTIC ids: importing
  // the same file twice must produce the same ids so the store's
  // idempotency guard drops the duplicates.
  for (const [sessionKey, session] of Object.entries(sessionsMap)) {
    const exercisesList: WorkoutExercise[] = [];
    for (const [name, sets] of Object.entries(session.exercises)) {
      exerciseNamesSet.add(name);
      totalSets += sets.length;
      exercisesList.push({ name, sets });
    }
    const contentSig = exercisesList
      .map((e) => `${e.name}:${setsSignature(e.sets)}`)
      .join(';;');
    workouts.push({
      id: `imported_${session.date}_${contentHash(`${sessionKey}|${contentSig}`)}`,
      date: session.date,
      name: session.name,
      durationMinutes: session.durationMinutes,
      exercises: exercisesList,
    });
  }

  // Sort workouts newest first
  workouts.sort((a, b) => b.date.localeCompare(a.date));

  // Compute PRs from imported data
  const prMap: Record<string, { weight: number; reps: number; e1RM: number; date: string }> = {};

  for (const w of workouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (typeof s.weight === 'number' && s.weight > 0 && s.reps > 0) {
          // PersonalRecord is canonically kg — convert lbs sets first.
          const weightKg = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
          const e1rm = calculateOneRepMax(weightKg, s.reps);
          const current = prMap[ex.name];
          if (!current || e1rm > current.e1RM) {
            prMap[ex.name] = { weight: Math.round(weightKg * 10) / 10, reps: s.reps, e1RM: e1rm, date: w.date };
          }
        }
      }
    }
  }

  const newPRs: PersonalRecord[] = Object.entries(prMap).map(([exercise, data]) => ({
    id: `pr_imp_${contentHash(`${exercise}|${data.date}|${Math.round(data.e1RM * 10)}|${data.weight}|${data.reps}`)}`,
    exercise,
    weightKg: data.weight,
    weightLbs: Math.round(data.weight * 2.20462 * 10) / 10,
    reps: data.reps,
    oneRepMax: Math.round(data.e1RM * 10) / 10,
    date: data.date,
    notes: 'Imported from workout history CSV',
  }));

  return {
    workoutsImported: workouts.length,
    exercisesFound: exerciseNamesSet.size,
    totalSets,
    newPRsCount: newPRs.length,
    datesNormalized,
    workouts,
    newPRs,
  };
}
