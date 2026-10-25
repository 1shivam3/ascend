/**
 * UX redesign Stage 5 — goal-aware Progress spotlight resolution.
 *
 * The first card on the Progress overview follows the athlete's primary
 * goal unless the user pinned a different chart (pinnedProgressChart,
 * null = Auto). Pin wins over goal; an invalid pin falls back to the
 * goal default (same validation pattern as the Today layout sanitizer).
 *
 * Goal mapping: get_stronger -> e1RM trend, build_muscle -> volume by
 * muscle, lose_fat -> weight trend, stamina/general -> consistency
 * heatmap. There is no powerlifting goal value in the app's AthleteGoal
 * enum, so the big-three chart ships as a pin option only, never as a
 * goal default — no goal is invented to fill the slot.
 */
import type { AthleteGoal } from './types';

export type SpotlightChartId = 'e1rm' | 'volume' | 'weight' | 'consistency' | 'big3';

export const SPOTLIGHT_CHARTS: SpotlightChartId[] = ['e1rm', 'volume', 'weight', 'consistency', 'big3'];

export const SPOTLIGHT_CHART_NAME_KEYS: Record<SpotlightChartId, string> = {
  e1rm: 'progress.chartE1rm',
  volume: 'progress.chartVolume',
  weight: 'progress.chartWeight',
  consistency: 'progress.chartConsistency',
  big3: 'progress.chartBig3',
};

export function goalDefaultChart(goal: AthleteGoal | string | undefined | null): SpotlightChartId {
  switch (goal) {
    case 'get_stronger':
      return 'e1rm';
    case 'build_muscle':
      return 'volume';
    case 'lose_fat':
      return 'weight';
    case 'stamina':
    case 'general_fitness':
    default:
      return 'consistency';
  }
}

export function resolveSpotlightChart(
  goal: AthleteGoal | string | undefined | null,
  pinned: string | null | undefined,
): SpotlightChartId {
  if (pinned && (SPOTLIGHT_CHARTS as string[]).includes(pinned)) {
    return pinned as SpotlightChartId;
  }
  return goalDefaultChart(goal);
}
