/**
 * Indian food alias / normalization table (UI/UX audit P0-4).
 *
 * One canonical item per food, however the name arrives — a vision
 * model, the user's typing, or search. The motivating bug: a scan
 * returned "Cooked Pigeon Peas (Chana)" and the app displayed and
 * matched it as chana. Pigeon pea is toor/arhar dal; chana is
 * chickpea. They are different foods with different values, and the
 * parenthetical gloss the model invented was simply wrong.
 *
 * Rules:
 *  - Aliases only fill gaps: a name that is itself a food-DB key
 *    ('phulka', 'chana dal', 'chickpeas') always resolves to its own
 *    entry first (see findBestMatch in macros.ts) — phulka keeps its
 *    own lighter 30 g piece weight, 'chana dal' (split Bengal gram)
 *    is NOT chickpea and is never aliased to it.
 *  - Matching is whole-name after normalization (lowercase, drop
 *    parenthetical glosses, drop one leading preparation word like
 *    "cooked"/"boiled"), so "Chicken Curry" can never be swallowed
 *    by a shorter alias.
 */

export const FOOD_NAME_ALIASES: Record<string, string> = {
  // Pigeon pea = toor / arhar — never chana.
  'pigeon pea': 'toor dal',
  'pigeon peas': 'toor dal',
  'red gram': 'toor dal',
  arhar: 'toor dal',
  'arhar dal': 'toor dal',
  toor: 'toor dal',
  'tuvar dal': 'toor dal',

  // Chana = chickpea (kabuli chana). 'chana dal' deliberately absent:
  // it is split Bengal gram, a different DB entry.
  chickpea: 'chana',
  chickpeas: 'chana',
  garbanzo: 'chana',
  'garbanzo bean': 'chana',
  'garbanzo beans': 'chana',
  'kabuli chana': 'chana',
  'white chana': 'chana',

  // Generic dal names land on the plain cooked-dal entry. Specific
  // dals (moong, masoor, urad, toor, chana dal, makhani, tadka — and
  // 'yellow dal', a first-class entry with toor-dal values) are DB
  // keys of their own and resolve before this table is consulted.
  'dal curry': 'dal',
  lentils: 'dal',
  'cooked lentils': 'dal',
  'lentil curry': 'dal',

  // Roti family — same flatbread, regional names. 'chapati' and
  // 'phulka' are DB keys too (identical per-100g values); they are
  // listed here so name identity (duplicate detection, display
  // canonicalization) treats the family as one food. Per-name piece
  // weights are looked up by the original name first in
  // estimateMacros, so a phulka still weighs 30 g, not 40 g.
  chapati: 'roti',
  chapathi: 'roti',
  phulka: 'roti',
};

const PREP_PREFIXES = new Set(['cooked', 'boiled', 'steamed', 'raw']);

/**
 * Normalize a food name for alias lookup: lowercase, drop
 * parenthetical glosses ("(Chana)"), unify separators, and drop one
 * leading preparation word ("Cooked Pigeon Peas" → "pigeon peas").
 */
export function normalizeFoodLookupName(name: string): string {
  let n = (name || '').toLowerCase().trim();
  n = n.replace(/\([^)]*\)/g, ' ');
  n = n.replace(/[/,]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = n.split(' ');
  if (words.length > 1 && PREP_PREFIXES.has(words[0])) {
    words.shift();
    n = words.join(' ').trim();
  }
  return n;
}

/** Canonical DB key for an alias name, or null when not an alias. */
export function resolveFoodAlias(name: string): string | null {
  const n = normalizeFoodLookupName(name);
  return FOOD_NAME_ALIASES[n] ?? null;
}

/**
 * Identity key for a food name: the alias target when one applies,
 * else the normalized name. Used where foods must be compared for
 * sameness (e.g. duplicate detection in scan results) without
 * needing a DB entry to exist.
 */
export function foodIdentityKey(name: string): string {
  return resolveFoodAlias(name) ?? normalizeFoodLookupName(name);
}

export const CANONICAL_DISPLAY_NAMES: Record<string, string> = {
  'toor dal': 'Toor Dal (Pigeon Pea)',
  chana: 'Chickpeas (Chana)',
  dal: 'Dal',
  roti: 'Roti / Chapati',
};

/**
 * For model-supplied names: when the name is an alias, return the
 * honest canonical display name ("Cooked Pigeon Peas (Chana)" →
 * "Toor Dal (Pigeon Pea)"). Returns null when the name should be
 * kept exactly as supplied.
 */
export function canonicalDisplayName(name: string): string | null {
  const key = resolveFoodAlias(name);
  if (!key) return null;
  return CANONICAL_DISPLAY_NAMES[key] ?? null;
}
