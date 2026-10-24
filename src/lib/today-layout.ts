/**
 * UX redesign — Today section layout model (personalization-spec §2, §5.3).
 *
 * The workout card is pinned first by construction and never appears in
 * `order`. Every other Today section has a stable id; the Customize sheet
 * labels sections with EXACTLY the titles Today renders (the sheet
 * receives id+title pairs from HomePage, so this file never owns copy).
 *
 * Visibility is stored per section as shown/hidden/'unset'. 'unset'
 * resolves via the current density default — so an explicit user choice
 * always beats a density switch, and a density switch only changes the
 * default for sections the user has never touched.
 */

export type Density = 'simple' | 'detailed';

/** Movable Today sections, in default order (workout card excluded). */
export const TODAY_SECTION_IDS = [
  'nutrition-strip',
  'coach',
  'habit-matrix',
  'quick-actions',
  'hydration',
  'readiness',
  'level',
  'steps',
  'challenge',
  'weekly-review-detail',
] as const;

export type TodaySectionId = (typeof TODAY_SECTION_IDS)[number];

/** Sections shown by default per density (before any user choice). */
export const DENSITY_DEFAULT_VISIBLE: Record<Density, Record<string, boolean>> = {
  simple: {
    'nutrition-strip': true,
    coach: true,
    'habit-matrix': true,
    'quick-actions': true,
    hydration: true,
    readiness: false,
    level: false,
    steps: false,
    challenge: false,
    'weekly-review-detail': false,
  },
  detailed: {
    'nutrition-strip': true,
    coach: true,
    'habit-matrix': true,
    'quick-actions': true,
    hydration: true,
    readiness: true,
    level: true,
    steps: true,
    challenge: true,
    'weekly-review-detail': true,
  },
};

export interface TodayLayout {
  visible: Record<string, boolean | 'unset'>;
  order: string[];
}

export const DEFAULT_TODAY_LAYOUT: TodayLayout = {
  visible: {},
  order: [...TODAY_SECTION_IDS],
};

export function isTodaySectionId(id: string): id is TodaySectionId {
  return (TODAY_SECTION_IDS as readonly string[]).includes(id);
}

/**
 * Sanitize a stored layout (personalization-spec §5.4): malformed →
 * default; unknown ids dropped; known sections missing from `order`
 * appended in default order. Never throws on junk input.
 */
export function sanitizeTodayLayout(value: unknown): TodayLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { visible: {}, order: [...TODAY_SECTION_IDS] };
  }
  const raw = value as { visible?: unknown; order?: unknown };
  const visible: Record<string, boolean | 'unset'> = {};
  if (raw.visible && typeof raw.visible === 'object' && !Array.isArray(raw.visible)) {
    for (const [key, val] of Object.entries(raw.visible as Record<string, unknown>)) {
      if (isTodaySectionId(key) && (val === true || val === false || val === 'unset')) {
        visible[key] = val;
      }
    }
  }
  const order: string[] = [];
  if (Array.isArray(raw.order)) {
    for (const id of raw.order) {
      if (typeof id === 'string' && isTodaySectionId(id) && !order.includes(id)) {
        order.push(id);
      }
    }
  }
  for (const id of TODAY_SECTION_IDS) {
    if (!order.includes(id)) order.push(id);
  }
  return { visible, order };
}

export interface ResolvedTodaySection {
  id: TodaySectionId;
  shown: boolean;
}

/** Resolve a stored layout + density into the ordered, visible section list. */
export function resolveTodayLayout(layout: TodayLayout, density: Density): ResolvedTodaySection[] {
  const clean = sanitizeTodayLayout(layout);
  const defaults = DENSITY_DEFAULT_VISIBLE[density];
  return clean.order.map((id) => {
    const v = clean.visible[id];
    return { id: id as TodaySectionId, shown: v === 'unset' || v === undefined ? defaults[id] : v };
  });
}
