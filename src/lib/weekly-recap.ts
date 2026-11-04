import type { PersonalRecord } from './types';

/**
 * Certification F8 — weekly share-card PR selection, kept pure so it
 * is testable without rendering the canvas card.
 *
 * The card's PR figures diverged from the PR store (functional round
 * 1b-2, finding F8): it announced "3 NEW PRS" and highlighted the
 * session-1 baseline sets while the store held 6 records, including a
 * newer all-time Bench PR. Two causes:
 *
 *  1. Baselines were filtered on the `isBaseline` flag only, but the
 *     finish flow never sets that flag — first-session records are
 *     marked by their notes ('Baseline established from first
 *     session'). The PR page's own rule checks BOTH (PRsPage), and
 *     the finish flow does not count a first-exposure baseline as a
 *     new PR. The card now uses the same rule.
 *  2. The displayed count was the length of a list already truncated
 *     to 3 highlight rows, so the headline number was capped at 3 no
 *     matter how many records the week actually held.
 *
 * Selection:
 *  - Candidates: records dated inside the week (local day keys,
 *    Mon–Sun strings) that are not baselines.
 *  - Count: every candidate record — the same records the app itself
 *    counts as new PRs.
 *  - Highlights: the best record per exercise (highest estimated
 *    1RM; ties go to the later date), strongest first, at most 3 —
 *    so a superseding all-time PR replaces the older set it beat
 *    instead of the card celebrating the superseded one.
 */

export function isBaselinePR(pr: PersonalRecord): boolean {
  return !!pr.isBaseline || (pr.notes?.includes('Baseline') ?? false);
}

export interface WeeklyRecapPRSelection {
  /** All new (non-baseline) PR records dated inside the week. */
  count: number;
  /** Best record per exercise, strongest first, max 3. */
  highlights: PersonalRecord[];
}

export function selectWeeklyRecapPRs(
  prs: PersonalRecord[],
  weekStartStr: string,
  weekEndStr: string
): WeeklyRecapPRSelection {
  const inWeek = (prs || []).filter((p) => {
    const dStr = (p.date || '').split('T')[0];
    return dStr >= weekStartStr && dStr <= weekEndStr && !isBaselinePR(p);
  });

  const bestByExercise = new Map<string, PersonalRecord>();
  for (const pr of inWeek) {
    const key = pr.exercise.toLowerCase();
    const current = bestByExercise.get(key);
    if (
      !current ||
      pr.oneRepMax > current.oneRepMax ||
      (pr.oneRepMax === current.oneRepMax && (pr.date || '') > (current.date || ''))
    ) {
      bestByExercise.set(key, pr);
    }
  }

  const highlights = [...bestByExercise.values()]
    .sort((a, b) => b.oneRepMax - a.oneRepMax)
    .slice(0, 3);

  return { count: inWeek.length, highlights };
}
