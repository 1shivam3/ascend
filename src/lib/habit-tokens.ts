/**
 * Audit Phase 4 (2026-11-06), Task 4.4 (P2-3) — ONE source for the
 * habit-matrix colours, shared by HomeMatrix and WeeklyHabitMatrix.
 *
 * Before this, both matrices carried their own hard-coded hex table
 * (workout #FF6A1A, water #38BDF8, creatine #F5B301, protein
 * #22C55E) and the workout orange matched no accent the user could
 * pick. Now:
 *  - workout fill = the user's accent token (--accent);
 *  - water / creatine / protein fills = the --habit-* tokens in
 *    globals.css (also backing the tailwind water/protein/creatine
 *    utilities, so tiles and icons elsewhere stay in step);
 *  - the done state is never colour alone: done cells render a Check
 *    glyph in HABIT_ON_FILL and name the state in their aria-label.
 *
 * Row LABEL text keeps the .matrix-row-label-* classes in globals.css
 * (per-theme shades audited ≥4.5:1 by Gauntlet A11Y-04 — the bright
 * fills themselves fail as text on the light theme).
 */
import type { MatrixHabitId } from '@/lib/home-matrix';

export type HabitId = MatrixHabitId;

/** Cell/dot fill per habit, as a CSS colour value. */
export const HABIT_FILL: Record<HabitId, string> = {
  workout: 'rgb(var(--accent))',
  water: 'rgb(var(--habit-water))',
  creatine: 'rgb(var(--habit-creatine))',
  protein: 'rgb(var(--habit-protein))',
};

/**
 * Graphite ink — the water/creatine/protein fills are bright in BOTH
 * themes, so the done glyph takes the ink colour (≥6.9:1 on all
 * three fills). The workout glyph takes --accent-on, the token
 * already paired with the accent fill at ≥4.5:1.
 */
const INK = '#171916';

export const HABIT_ON_FILL: Record<HabitId, string> = {
  workout: 'rgb(var(--accent-on))',
  water: INK,
  creatine: INK,
  protein: INK,
};

/** Row-label classes (globals.css, per-theme AA shades). */
export const HABIT_LABEL_CLASS: Record<HabitId, string> = {
  workout: 'matrix-row-label-workout',
  water: 'matrix-row-label-water',
  creatine: 'matrix-row-label-creatine',
  protein: 'matrix-row-label-protein',
};
