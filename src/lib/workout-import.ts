import { WorkoutEntry, WorkoutExercise, WorkoutSet, PersonalRecord } from './types';
import { calculateOneRepMax } from './strength-standards';

/**
 * Universal CSV Workout Importer for Strong, Hevy, FitNotes, and generic workout logs.
 */
export interface ImportWorkoutResult {
  workoutsImported: number;
  exercisesFound: number;
  totalSets: number;
  newPRsCount: number;
  workouts: WorkoutEntry[];
  newPRs: PersonalRecord[];
}

export function parseWorkoutCSV(csvText: string): ImportWorkoutResult {
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

  if (dateIdx === -1 || exerciseIdx === -1) {
    throw new Error('CSV must contain "Date" and "Exercise" columns. Standard exports from Strong, Hevy, or FitNotes are supported.');
  }

  // Group by date -> exercise
  const workoutsMap: Record<string, Record<string, WorkoutSet[]>> = {};

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Handle comma inside quotes or standard split
    const parts = rawLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^["']|["']$/g, '').trim());
    if (parts.length <= Math.max(dateIdx, exerciseIdx)) continue;

    const rawDate = parts[dateIdx];
    const exercise = parts[exerciseIdx];
    if (!rawDate || !exercise) continue;

    // Normalize date to YYYY-MM-DD
    let normalizedDate = '';
    const parsedDate = new Date(rawDate);
    if (!isNaN(parsedDate.getTime())) {
      normalizedDate = parsedDate.toISOString().split('T')[0];
    } else {
      // Try parsing YYYY-MM-DD or DD/MM/YYYY
      const dateParts = rawDate.split(/[-/]/);
      if (dateParts.length === 3) {
        if (dateParts[0].length === 4) {
          normalizedDate = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        } else {
          normalizedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }
      }
    }

    if (!normalizedDate) continue;

    const weightVal = weightIdx !== -1 && parts[weightIdx] ? parseFloat(parts[weightIdx].replace(/[^0-9.]/g, '')) : 0;
    const repsVal = repsIdx !== -1 && parts[repsIdx] ? parseInt(parts[repsIdx].replace(/[^0-9]/g, ''), 10) : 0;

    const weight = isNaN(weightVal) ? 0 : weightVal;
    const reps = isNaN(repsVal) ? 0 : repsVal;

    if (!workoutsMap[normalizedDate]) {
      workoutsMap[normalizedDate] = {};
    }
    if (!workoutsMap[normalizedDate][exercise]) {
      workoutsMap[normalizedDate][exercise] = [];
    }

    workoutsMap[normalizedDate][exercise].push({
      weight,
      reps: reps > 0 ? reps : 1,
      unit: 'kg',
    });
  }

  const workouts: WorkoutEntry[] = [];
  const exerciseNamesSet = new Set<string>();
  let totalSets = 0;

  // Convert map to WorkoutEntry[]
  for (const [dateStr, exMap] of Object.entries(workoutsMap)) {
    const exercisesList: WorkoutExercise[] = [];
    for (const [name, sets] of Object.entries(exMap)) {
      exerciseNamesSet.add(name);
      totalSets += sets.length;
      exercisesList.push({ name, sets });
    }
    workouts.push({
      id: `imported_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date: dateStr,
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
        if (s.weight > 0 && s.reps > 0) {
          const e1rm = calculateOneRepMax(s.weight, s.reps);
          const current = prMap[ex.name];
          if (!current || e1rm > current.e1RM) {
            prMap[ex.name] = { weight: s.weight, reps: s.reps, e1RM: e1rm, date: w.date };
          }
        }
      }
    }
  }

  const newPRs: PersonalRecord[] = Object.entries(prMap).map(([exercise, data]) => ({
    id: `pr_imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
    workouts,
    newPRs,
  };
}
