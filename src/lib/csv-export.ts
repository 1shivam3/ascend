/**
 * CSV export — one combined, spreadsheet-friendly file.
 *
 * ONE file with three sections (workouts / meals / body metrics),
 * because a single download is the only flow that works reliably in
 * both browsers and the Android WebView (sequential multi-downloads
 * get blocked). Section marker and documentation lines start with
 * '#'; delete them in your spreadsheet if you want pure tables.
 *
 * Data is exported AS LOGGED: set weights keep the unit they were
 * logged in (see the unit column) — an export must never silently
 * rewrite the user's numbers.
 */
import type { BodyMetricEntry, MealEntry, WorkoutEntry } from './types';
import { isSetCompleted } from './types';

/**
 * RFC 4180 field escaping, plus spreadsheet formula-injection
 * neutralization (QA4-008): a cell whose first character — after optional
 * leading whitespace — is one of `= + - @` (or that starts with a tab/CR,
 * which some spreadsheet apps strip before evaluating) would be executed
 * as a formula when the export is opened. Prefixing a single quote makes
 * spreadsheet apps treat the cell as literal text.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Only string cells can carry a formula payload — a JS number is emitted
  // as a plain numeric literal (e.g. a negative value) and stays untouched.
  if (typeof value === 'string' && (/^[\t\r]/.test(s) || /^\s*[=+@-]/.test(s))) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(values: Array<string | number | null | undefined>): string {
  return values.map(csvField).join(',');
}

export function workoutsToCsv(workouts: WorkoutEntry[]): string {
  const lines: string[] = [
    '# Columns: date (YYYY-MM-DD), workout, exercise, set (1-based within the exercise),',
    '# reps, weight (in the unit column), unit, rpe, completed (yes/no), warmup (yes/no)',
    row(['date', 'workout', 'exercise', 'set', 'reps', 'weight', 'unit', 'rpe', 'completed', 'warmup']),
  ];
  const sorted = [...(workouts || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      (ex.sets || []).forEach((s, idx) => {
        lines.push(
          row([
            (w.date || '').split('T')[0],
            w.name || '',
            ex.name,
            idx + 1,
            s.reps ?? '',
            typeof s.weight === 'number' ? s.weight : '',
            s.unit || '',
            typeof s.rpe === 'number' ? s.rpe : '',
            isSetCompleted(s) ? 'yes' : 'no',
            s.isWarmup ? 'yes' : 'no',
          ])
        );
      });
    }
  }
  return lines.join('\n');
}

export function mealsToCsv(meals: MealEntry[]): string {
  const lines: string[] = [
    '# Columns: date (YYYY-MM-DD), meal, food, quantity, unit, calories (kcal),',
    '# protein_g, carbs_g, fat_g, sugar_g (blank = not tracked for that food)',
    row(['date', 'meal', 'food', 'quantity', 'unit', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'sugar_g']),
  ];
  const sorted = [...(meals || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const m of sorted) {
    for (const f of m.foods || []) {
      lines.push(
        row([
          (m.date || '').split('T')[0],
          m.name || '',
          f.name,
          typeof f.quantity === 'number' ? f.quantity : '',
          f.unit || '',
          f.calories ?? '',
          f.proteinG ?? '',
          f.carbsG ?? '',
          f.fatG ?? '',
          typeof f.sugarG === 'number' ? f.sugarG : '',
        ])
      );
    }
  }
  return lines.join('\n');
}

export function bodyMetricsToCsv(metrics: BodyMetricEntry[]): string {
  const lines: string[] = [
    '# Columns: date (YYYY-MM-DD), weight_kg, height_cm, body_fat_pct,',
    '# chest_in, waist_in, hips_in (inches, as logged), source (manual / health-connect), notes',
    row(['date', 'weight_kg', 'height_cm', 'body_fat_pct', 'chest_in', 'waist_in', 'hips_in', 'source', 'notes']),
  ];
  const sorted = [...(metrics || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const m of sorted) {
    lines.push(
      row([
        m.date,
        m.weightKg ?? '',
        m.heightCm ?? '',
        m.bodyFatPct ?? '',
        m.chestIn ?? '',
        m.waistIn ?? '',
        m.hipsIn ?? '',
        m.source || 'manual',
        m.notes || '',
      ])
    );
  }
  return lines.join('\n');
}

export interface CsvExportData {
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  bodyMetrics: BodyMetricEntry[];
}

export function buildCombinedCsvExport(data: CsvExportData, generatedAt: Date = new Date()): string {
  return [
    '# ASCEND DATA EXPORT',
    `# Generated: ${generatedAt.toISOString()}`,
    '# One file, three sections. Lines starting with # are documentation —',
    '# remove them in your spreadsheet app if you want pure tables.',
    '',
    '# ===== WORKOUTS =====',
    workoutsToCsv(data.workouts),
    '',
    '# ===== MEALS =====',
    mealsToCsv(data.meals),
    '',
    '# ===== BODY METRICS =====',
    bodyMetricsToCsv(data.bodyMetrics),
    '',
  ].join('\n');
}
