/**
 * Hindi display names for FOOD_DB keys — CURATED ONLY (Round 4, SIM-P1-05).
 *
 * SOURCE: this repo's own curated Devanagari word map,
 * DEVANAGARI_WORD_MAP in src/lib/devanagari.ts (built for QA4-029 so a
 * Hindi-first user typing दाल finds "dal"). The map is Devanagari ->
 * Latin; this module is its inversion: a FOOD_DB key maps to a
 * Devanagari name ONLY when the key is exactly one of the map's Latin
 * forms. No new transliteration was invented here, so every entry below
 * is a word the repo already curates — the same trust level as the
 * search map itself.
 *
 * COVERAGE: 65 / 617 FOOD_DB keys (10.5%). Everything else renders with
 * the English key as today — never a guessed name.
 *
 * EXCLUDED, deliberately:
 * - 'paneer butter masala' -> the map's phrase join produced
 *   'पनीरबटरमसाला' (missing spaces), a mechanical artifact, not a
 *   curated spelling. Dropped, not hand-fixed.
 * - 10 ambiguous Latin forms (one Latin form under two Devanagari
 *   words) resolved to the standard/common form, each documented here:
 *   chicken -> चिकन (the food word; मुर्गा is the live bird),
 *   egg -> अंडा (singular, matches the key),
 *   rice -> चावल (generic standard; भात is regional cooked-rice),
 *   chana -> चना (singular), sabzi -> सब्ज़ी (nukta form, standard),
 *   pakora -> पकौड़ा (standard ड़ form),
 *   cucumber -> खीरा (ककड़ी is a distinct variety, not the generic),
 *   onion -> प्याज़ (nukta form, standard),
 *   cauliflower -> गोभी (standard aspirated form),
 *   coffee -> कॉफ़ी (nukta form, standard).
 *
 * WHAT THIS IS NOT: this does not close the IFCT translation question.
 * IFCT 2017 (ICMR-NIN) was investigated as the verified source for the
 * remaining ~550 keys: it does publish Hindi common names (H. prefix,
 * Latin script, 435/542 foods), and a scripted IFCT mapping was
 * generated (113 matches) — but a quality audit rejected it for
 * display: mechanical Latin->Devanagari rendering from IFCT's
 * ambiguous Romanization produces wrong words (spinach -> पलक
 * 'eyelid' for पालक, potato -> अलु for आलू, carrot -> गजर for गाजर,
 * rajma -> रज्मह for राजमा, egg -> अंदा for अंडा), variety matching
 * misfires (generic mango -> raw-mango name, paneer -> chenna), and
 * even IFCT's own Latin names contain quirks. Round-trip through the
 * repo transliterator verifies invertibility, NOT correctness. The
 * IFCT mapping therefore stays out of the app (generator kept in
 * goal hidden_files for the record); the remaining food names need
 * per-item curation by a Hindi speaker, or a Devanagari-native source
 * — recorded as the open P1-05 remainder, not faked.
 *
 * Display-only: keys, matching, totals and history still use the
 * English FOOD_DB key everywhere, exactly like EXERCISE_NAME_HI.
 */

export const FOOD_HINDI_SOURCE =
  "Repo-curated DEVANAGARI_WORD_MAP (src/lib/devanagari.ts, QA4-029), inverted; 65/617 FOOD_DB keys";

/** Devanagari display name for a FOOD_DB key, or undefined when unmapped. */
export const FOOD_NAME_HI: Record<string, string> = {
  milk: 'दूध',
  doodh: 'दूध',
  paneer: 'पनीर',
  yogurt: 'दही',
  curd: 'दही',
  dahi: 'दही',
  oats: 'ओट्स',
  bread: 'ब्रेड',
  roti: 'रोटी',
  naan: 'नान',
  dal: 'दाल',
  rajma: 'राजमा',
  chole: 'छोले',
  sattu: 'सत्तू',
  soya: 'सोया',
  potato: 'आलू',
  corn: 'मकई',
  poha: 'पोहा',
  upma: 'उपमा',
  idli: 'इडली',
  dosa: 'डोसा',
  paratha: 'पराठा',
  biryani: 'बिरयानी',
  khichdi: 'खिचड़ी',
  sambar: 'सांभर',
  chawal: 'चावल',
  anda: 'अंडा',
  samosa: 'समोसा',
  chai: 'चाय',
  lassi: 'लस्सी',
  buttermilk: 'छाछ',
  banana: 'केला',
  apple: 'सेब',
  orange: 'संतरा',
  mango: 'आम',
  spinach: 'पालक',
  carrot: 'गाजर',
  tomato: 'टमाटर',
  peas: 'मटर',
  butter: 'मक्खन',
  ghee: 'घी',
  jalebi: 'जलेबी',
  kheer: 'खीर',
  uttapam: 'उत्तपम',
  thepla: 'थेपला',
  dhokla: 'ढोकला',
  papaya: 'पपीता',
  pomegranate: 'अनार',
  dalia: 'दलिया',
  besan: 'बेसन',
  suji: 'सूजी',
  maida: 'मैदा',
  brinjal: 'बैंगन',
  sugar: 'चीनी',
  puri: 'पूरी',
  // Ambiguous Latin forms, resolved to the standard form (see header).
  chicken: 'चिकन',
  egg: 'अंडा',
  rice: 'चावल',
  chana: 'चना',
  sabzi: 'सब्ज़ी',
  pakora: 'पकौड़ा',
  cucumber: 'खीरा',
  onion: 'प्याज़',
  cauliflower: 'गोभी',
  coffee: 'कॉफ़ी',
};

/** Resolve a food name to its curated Hindi display name, if one exists. */
export function getFoodHindiName(name: string): string | undefined {
  if (!name) return undefined;
  return FOOD_NAME_HI[name.toLowerCase().trim()];
}
