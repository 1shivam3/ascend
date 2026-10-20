/**
 * Exercise demo media manifest — exercise → animated demo mapping.
 *
 * Every item is ORIGINAL artwork drawn for ASCEND (see
 * docs/exercise-media.md for the license audit that rejected third-party
 * image sets: their rights could not be verified for commercial use).
 * The per-entry source/license fields are the record of that — if a
 * future entry ever uses external media, its real license belongs here,
 * per file, before it ships.
 *
 * Lookup rules: exact alias match first, then substring match in
 * manifest order (more specific entries are listed before generic ones
 * they could be swallowed by — Romanian Deadlift before Deadlift,
 * Leg Curl before Curl). Exercises with no entry return null and the UI
 * shows NO demo affordance at all — never a placeholder.
 */

export interface ExerciseDemoEntry {
  demoId: string;
  /** Normalized (lowercase) names/aliases this demo answers to. */
  exerciseNames: string[];
  /** Substrings that disqualify this entry (e.g. Curl must not claim Leg Curl). */
  excludeIfContains?: string[];
  source: string;
  license: string;
  format: 'animated-svg';
}

const ORIGINAL = {
  source: 'Original ASCEND artwork (hand-built animated SVG)',
  license: 'Original in-app artwork created for ASCEND — no third-party media, no external license terms',
  format: 'animated-svg' as const,
};

export const EXERCISE_DEMO_MANIFEST: ExerciseDemoEntry[] = [
  { demoId: 'romanian-deadlift', exerciseNames: ['romanian deadlift', 'dumbbell romanian deadlift', 'rdl'], ...ORIGINAL },
  { demoId: 'goblet-squat', exerciseNames: ['goblet squat'], ...ORIGINAL },
  { demoId: 'split-squat', exerciseNames: ['bulgarian split squat', 'split squat', 'dumbbell walking lunge', 'walking lunge', 'lunge'], ...ORIGINAL },
  { demoId: 'leg-curl', exerciseNames: ['lying leg curl', 'seated leg curl', 'leg curl'], ...ORIGINAL },
  { demoId: 'leg-extension', exerciseNames: ['leg extension'], ...ORIGINAL },
  { demoId: 'leg-press', exerciseNames: ['leg press', 'hack squat machine', 'hack squat'], ...ORIGINAL },
  { demoId: 'hip-thrust', exerciseNames: ['barbell hip thrust', 'hip thrust', 'glute bridge'], ...ORIGINAL },
  { demoId: 'lat-pulldown', exerciseNames: ['lat pulldown', 'close grip lat pulldown', 'close-grip lat pulldown'], ...ORIGINAL },
  { demoId: 'seated-row', exerciseNames: ['seated cable row', 'single-arm cable row', 'cable row'], ...ORIGINAL },
  { demoId: 'face-pull', exerciseNames: ['cable face pull', 'face pull'], ...ORIGINAL },
  { demoId: 'pushdown', exerciseNames: ['tricep rope pushdown', 'straight-bar cable pushdown', 'tricep pushdown', 'pushdown'], ...ORIGINAL },
  { demoId: 'pull-up', exerciseNames: ['pull-ups', 'pull-up', 'pull ups', 'chin-ups', 'chin-up', 'chin ups'], ...ORIGINAL },
  { demoId: 'dips', exerciseNames: ['chest dips', 'tricep dips', 'dips'], ...ORIGINAL },
  { demoId: 'push-up', exerciseNames: ['push-ups', 'push-up', 'push ups', 'pushups', 'diamond push-ups', 'diamond pushups'], ...ORIGINAL },
  { demoId: 'bench-press', exerciseNames: ['barbell bench press', 'incline barbell bench press', 'decline barbell bench press', 'close-grip bench press', 'close grip bench', 'smith machine bench press', 'bench press', 'incline bench'], ...ORIGINAL },
  { demoId: 'db-bench-press', exerciseNames: ['dumbbell bench press', 'incline dumbbell press', 'decline dumbbell press', 'dumbbell press'], ...ORIGINAL },
  { demoId: 'barbell-row', exerciseNames: ['barbell bent-over row', 'barbell row', 'pendlay row', 'bent-over row', 'bent over row'], ...ORIGINAL },
  { demoId: 'db-row', exerciseNames: ['single-arm dumbbell row', 'chest-supported dumbbell row', 'dumbbell row'], ...ORIGINAL },
  { demoId: 'overhead-press', exerciseNames: ['overhead press (barbell ohp)', 'overhead press', 'barbell push press', 'push press', 'seated dumbbell shoulder press', 'dumbbell shoulder press', 'shoulder press', 'arnold press', 'smith machine shoulder press', 'ohp'], ...ORIGINAL },
  { demoId: 'lateral-raise', exerciseNames: ['dumbbell lateral raise', 'cable lateral raise', 'machine lateral raise', 'lateral raise'], ...ORIGINAL },
  { demoId: 'curl', exerciseNames: ['barbell bicep curl', 'ez-bar bicep curl', 'dumbbell bicep curl', 'incline dumbbell curl', 'dumbbell hammer curl', 'hammer curl', 'preacher curl', 'cable bicep curl', 'concentration curl', 'bicep curl', 'curl'], excludeIfContains: ['leg', 'nordic', 'wrist'], ...ORIGINAL },
  { demoId: 'plank', exerciseNames: ['front plank (seconds)', 'front plank', 'plank'], ...ORIGINAL },
  { demoId: 'deadlift', exerciseNames: ['conventional deadlift', 'sumo deadlift', 'deadlift'], ...ORIGINAL },
  { demoId: 'squat', exerciseNames: ['barbell back squat', 'barbell front squat', 'front squat', 'smith machine squat', 'bodyweight squats', 'back squat', 'squat'], ...ORIGINAL },
];

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function entryMatches(entry: ExerciseDemoEntry, normalized: string): boolean {
  if (entry.excludeIfContains?.some((x) => normalized.includes(x))) return false;
  return entry.exerciseNames.some((alias) => {
    const a = normalizeExerciseName(alias);
    return normalized === a || normalized.includes(a) || (a.length >= 5 && a.includes(normalized));
  });
}

/**
 * The demo for an exercise name, or null when none exists. Callers must
 * treat null as "render no demo affordance" — never a placeholder.
 */
export function getDemoForExercise(name: string): ExerciseDemoEntry | null {
  if (!name || typeof name !== 'string') return null;
  const normalized = normalizeExerciseName(name);
  if (!normalized) return null;
  // Exact alias match wins over any substring match.
  for (const entry of EXERCISE_DEMO_MANIFEST) {
    if (entry.excludeIfContains?.some((x) => normalized.includes(x))) continue;
    if (entry.exerciseNames.some((alias) => normalizeExerciseName(alias) === normalized)) {
      return entry;
    }
  }
  for (const entry of EXERCISE_DEMO_MANIFEST) {
    if (entryMatches(entry, normalized)) return entry;
  }
  return null;
}
