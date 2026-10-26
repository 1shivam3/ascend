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

/** Movable Today sections, in canonical order (workout card excluded). */
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
  'quote',
] as const;

/** Pre-quote section order (the default order before quote became a section). */
const LEGACY_TODAY_ORDER: readonly string[] = [
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
];

/**
 * Default section order for a user who has never reordered, per density.
 * Simple follows the owner's minimal default list: workout card (pinned),
 * nutrition, quick actions, hydration, today's habits, quote last; the
 * remaining sections follow hidden. Detailed keeps the pre-change layout
 * with quote right after coach (where it used to render inside the coach
 * block), so Detailed's visible order is unchanged.
 */
export const SIMPLE_DEFAULT_ORDER: readonly string[] = [
  'nutrition-strip',
  'quick-actions',
  'hydration',
  'habit-matrix',
  'quote',
  'coach',
  'readiness',
  'level',
  'steps',
  'challenge',
  'weekly-review-detail',
];

export const DETAILED_DEFAULT_ORDER: readonly string[] = [
  'nutrition-strip',
  'coach',
  'quote',
  'habit-matrix',
  'quick-actions',
  'hydration',
  'readiness',
  'level',
  'steps',
  'challenge',
  'weekly-review-detail',
];

export type TodaySectionId = (typeof TODAY_SECTION_IDS)[number];

/** Sections shown by default per density (before any user choice). */
export const DENSITY_DEFAULT_VISIBLE: Record<Density, Record<string, boolean>> = {
  simple: {
    'nutrition-strip': true,
    coach: false,
    'habit-matrix': true,
    'quick-actions': true,
    hydration: true,
    readiness: false,
    level: false,
    steps: false,
    challenge: false,
    'weekly-review-detail': false,
    quote: true,
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
    quote: true,
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

/** Resolve a stored layout + density into the ordered, visible section list.
 *
 * Order rule: a layout the user has never reordered (stored order empty,
 * the legacy pre-quote sequence, or the canonical sequence — i.e. exactly
 * what a fresh install stores) resolves to the density's default order, so
 * Simple defaults to the owner's minimal list and Detailed keeps its old
 * layout. Any other stored order is the user's own and is kept verbatim.
 * Visibility is unchanged: an explicit show/hide always beats the density
 * default; only 'unset' sections resolve via the density default.
 */
export function resolveTodayLayout(layout: TodayLayout, density: Density): ResolvedTodaySection[] {
  const clean = sanitizeTodayLayout(layout);
  const defaults = DENSITY_DEFAULT_VISIBLE[density];
  const rawOrder: string[] = [];
  const raw = (layout as unknown as { order?: unknown } | null)?.order;
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === 'string' && isTodaySectionId(id) && !rawOrder.includes(id)) rawOrder.push(id);
    }
  }
  const canonical = [...TODAY_SECTION_IDS];
  const isPristine =
    rawOrder.length === 0 ||
    rawOrder.join(',') === LEGACY_TODAY_ORDER.join(',') ||
    rawOrder.join(',') === canonical.join(',');
  const order = isPristine
    ? [...(density === 'simple' ? SIMPLE_DEFAULT_ORDER : DETAILED_DEFAULT_ORDER)]
    : clean.order;
  return order.map((id) => {
    const v = clean.visible[id];
    return { id: id as TodaySectionId, shown: v === 'unset' || v === undefined ? defaults[id] : v };
  });
}
