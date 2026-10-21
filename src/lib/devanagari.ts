/**
 * Devanagari → Latin transliteration for food search (QA4-029).
 *
 * The food database is keyed in Latin script ("dal", "chawal", "roti"),
 * so a Hindi-first user typing दाल got zero matches and reasonably
 * concluded the food does not exist. This module converts a
 * Devanagari query into the Latin forms the database understands:
 *
 * 1. Whole-word mappings for staples come first — schwa deletion and
 *    conventional spellings (चावल → "chawal", not "chaaval") cannot be
 *    derived reliably letter-by-letter, so common foods are mapped
 *    explicitly, with alternate spellings / English names included.
 * 2. Everything else falls back to a character-level transliteration
 *    (consonant stems + vowel signs), normalised by collapsing long
 *    vowels (aa→a, ee→i, oo→u) and dropping a trailing inherent "a",
 *    which lands most remaining words on their usual Latin spelling
 *    (रोटी → roti, खिचड़ी fallback → khichdi-ish forms).
 *
 * Pure and dependency-free so both `macros.ts` (suggestions) and
 * `food-search.ts` (custom foods + DB) can share it.
 */

/** True when the text contains any Devanagari codepoint (U+0900–U+097F). */
export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Whole-word Devanagari → Latin equivalents for staple foods.
 * First entry is the canonical form; the rest are alternates the
 * database may use (English names, spelling variants).
 */
export const DEVANAGARI_WORD_MAP: Record<string, string[]> = {
  दाल: ['dal'],
  चावल: ['chawal', 'rice'],
  रोटी: ['roti'],
  पनीर: ['paneer'],
  आलू: ['aloo', 'potato'],
  दही: ['dahi', 'curd', 'yogurt'],
  दूध: ['doodh', 'milk'],
  अंडा: ['anda', 'egg'],
  अंडे: ['ande', 'egg'],
  चिकन: ['chicken'],
  मुर्गा: ['murga', 'chicken'],
  मछली: ['machli', 'fish'],
  सब्ज़ी: ['sabzi', 'sabji'],
  सब्जी: ['sabzi', 'sabji'],
  खिचड़ी: ['khichdi'],
  पराठा: ['paratha'],
  पूरी: ['puri', 'poori'],
  इडली: ['idli'],
  डोसा: ['dosa'],
  सांभर: ['sambar'],
  चना: ['chana'],
  चने: ['chane', 'chana'],
  राजमा: ['rajma'],
  छोले: ['chole'],
  पालक: ['palak', 'spinach'],
  गोबी: ['gobi', 'gobhi', 'cauliflower'],
  गोभी: ['gobhi', 'gobi', 'cauliflower'],
  भिंडी: ['bhindi'],
  बैंगन: ['baingan', 'brinjal'],
  टमाटर: ['tamatar', 'tomato'],
  प्याज़: ['pyaaz', 'onion'],
  प्याज: ['pyaaz', 'onion'],
  लहसुन: ['lehsun', 'garlic'],
  अदरक: ['adrak', 'ginger'],
  हल्दी: ['haldi', 'turmeric'],
  मिर्च: ['mirch', 'chilli'],
  नमक: ['namak', 'salt'],
  चीनी: ['cheeni', 'sugar'],
  आटा: ['aata', 'atta'],
  मैदा: ['maida'],
  बेसन: ['besan'],
  सूजी: ['sooji', 'suji', 'rava'],
  रवा: ['rava', 'sooji'],
  पोहा: ['poha'],
  उपमा: ['upma'],
  दलिया: ['dalia', 'daliya'],
  मक्खन: ['makkhan', 'butter'],
  घी: ['ghee'],
  तेल: ['tel', 'oil'],
  चाय: ['chai', 'tea'],
  कॉफ़ी: ['coffee'],
  कॉफी: ['coffee'],
  नान: ['naan'],
  भात: ['bhaat', 'rice'],
  पुलाव: ['pulao'],
  बिरयानी: ['biryani'],
  खीर: ['kheer'],
  हलवा: ['halwa'],
  लड्डू: ['laddu', 'ladoo'],
  जलेबी: ['jalebi'],
  समोसा: ['samosa'],
  पकौड़ा: ['pakora', 'pakoda'],
  पकौडा: ['pakoda', 'pakora'],
  वड़ा: ['vada'],
  वडा: ['vada'],
  उत्तपम: ['uttapam'],
  थेपला: ['thepla'],
  ढोकला: ['dhokla'],
  मूंग: ['moong'],
  मूँग: ['moong'],
  मसूर: ['masoor'],
  उड़द: ['urad'],
  उडद: ['urad'],
  अरहर: ['arhar', 'toor'],
  तूर: ['toor'],
  सोया: ['soya'],
  मटर: ['matar', 'peas'],
  गाजर: ['gajar', 'carrot'],
  लौकी: ['lauki'],
  करेला: ['karela'],
  केला: ['kela', 'banana'],
  सेब: ['seb', 'apple'],
  आम: ['aam', 'mango'],
  संतरा: ['santra', 'orange'],
  पपीता: ['papita', 'papaya'],
  अनार: ['anar', 'pomegranate'],
  खीरा: ['kheera', 'cucumber'],
  ककड़ी: ['kakdi', 'cucumber'],
  ओट्स: ['oats'],
  ब्रेड: ['bread'],
  मकई: ['makai', 'corn'],
  गेहूं: ['gehun', 'wheat'],
  गेहूँ: ['gehun', 'wheat'],
  ज्वार: ['jowar'],
  बाजरा: ['bajra'],
  रागी: ['ragi'],
  सत्तू: ['sattu'],
  छाछ: ['chhaachh', 'buttermilk'],
  लस्सी: ['lassi'],
  पनीरबटरमसाला: ['paneer butter masala'],
};

// Consonant stems (no inherent vowel — the vowel is supplied by the
// following vowel sign, or an inherent "a" is inserted by the parser
// when the consonant is followed by another bare consonant / space).
const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ng',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'ny',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh',
  ष: 'sh', स: 's', ह: 'h', ळ: 'l',
  // Nukta forms (ज़ = za, फ़ = fa, …) arrive either precomposed or as
  // base + U+093C; the combining mark is handled in the parser.
  ज़: 'z', फ़: 'f', क़: 'q', ख़: 'kh', ग़: 'g', ड़: 'd', ढ़: 'dh',
};

const INDEPENDENT_VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo',
  ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
  ऑ: 'o', ऍ: 'e',
};

// Dependent vowel signs (matras) keyed by codepoint.
const MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ॉ': 'o', 'ॅ': 'e',
};

const HALANT = '्';
const NUKTA = '़';
const ANUSVARA = 'ं';
const CHANDRABINDU = 'ँ';
const VISARGA = 'ः';

const DEVANAGARI_DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

/** Character-level transliteration of one Devanagari word (no word map). */
function transliterateWord(word: string): string {
  const chars = Array.from(word);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (DEVANAGARI_DIGITS[ch]) {
      out += DEVANAGARI_DIGITS[ch];
      continue;
    }
    if (INDEPENDENT_VOWELS[ch]) {
      out += INDEPENDENT_VOWELS[ch];
      continue;
    }
    const consonant = CONSONANTS[ch];
    if (consonant !== undefined) {
      out += consonant;
      const next = chars[i + 1];
      if (next === NUKTA) {
        // Nukta modifies the consonant (e.g. ड + ़ = ड़, "d" with a flap).
        // Common Hindi spellings drop the distinction (sabzi for सब्ज़ी),
        // and the stem above is already the un-nukta'd form, so skip it.
        i++;
        const afterNukta = chars[i + 1];
        if (afterNukta && MATRAS[afterNukta]) {
          out += MATRAS[afterNukta];
          i++;
        } else if (afterNukta !== HALANT) {
          out += 'a';
        }
        continue;
      }
      if (next && MATRAS[next]) {
        out += MATRAS[next];
        i++;
      } else if (next === HALANT) {
        i++; // conjunct: no vowel between the consonants
      } else if (next === ANUSVARA || next === CHANDRABINDU) {
        out += 'a';
        // anusvara/chandrabindu consumed by the generic branch below
      } else if (next !== undefined && next !== VISARGA) {
        out += 'a'; // inherent vowel before another sound / word end handled by caller
      }
      continue;
    }
    if (ch === ANUSVARA || ch === CHANDRABINDU) {
      out += 'n';
      continue;
    }
    if (ch === VISARGA) {
      out += 'h';
      continue;
    }
    if (ch === HALANT || MATRAS[ch]) {
      // Stray sign without a base consonant — drop it.
      continue;
    }
    out += ch; // Latin letters, spaces, punctuation pass through
  }
  return out;
}

/**
 * Normalise a raw transliteration toward the spelling the Latin-keyed
 * database uses: collapse long vowels (aa→a, ee→i, oo→u) and drop a
 * trailing inherent "a" (schwa deletion: "daala" → "dal").
 */
function normaliseLatin(raw: string): string {
  let s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  s = s.replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
  if (s.length > 2 && s.endsWith('a')) s = s.slice(0, -1);
  return s;
}

/**
 * Transliterate a Devanagari (or mixed) string to its canonical Latin
 * form. Whole-word staple mappings win; other words go through the
 * character transliterator + normaliser. Latin input passes through
 * (lowercased/trimmed) so callers can use this unconditionally.
 */
export function transliterateDevanagari(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!containsDevanagari(trimmed)) return trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).map((word) => {
    const mapped = DEVANAGARI_WORD_MAP[word];
    if (mapped) return mapped[0];
    return normaliseLatin(transliterateWord(word));
  });
  return words.join(' ');
}

/**
 * All Latin query variants worth searching for a (possibly
 * Devanagari) query: the query itself, each whole-word alternate
 * (combinations capped), and the canonical transliteration. Latin-only
 * queries return just themselves, so existing behaviour is unchanged.
 */
export function expandFoodQuery(query: string): string[] {
  if (!query || !query.trim()) return [];
  const trimmed = query.trim();
  if (!containsDevanagari(trimmed)) return [trimmed.toLowerCase()];

  const variants = new Set<string>();
  variants.add(transliterateDevanagari(trimmed));

  // Raw vs vowel-collapsed forms disagree on some words (दाल needs
  // aa→a to reach "dal"; पनीर needs its "ee" kept to reach "paneer"),
  // so search both: a hit on either variant is a hit.
  const rawJoined = trimmed
    .split(/\s+/)
    .map((w) => (DEVANAGARI_WORD_MAP[w] ? DEVANAGARI_WORD_MAP[w][0] : transliterateWord(w)))
    .join(' ')
    .toLowerCase();
  variants.add(rawJoined);
  variants.add(normaliseLatin(rawJoined));

  // Whole-word alternates: swap each mapped word for each of its
  // equivalents in turn (one swap at a time keeps the list small while
  // still finding e.g. चावल via both "chawal" and "rice").
  const words = trimmed.split(/\s+/);
  words.forEach((word, idx) => {
    const alts = DEVANAGARI_WORD_MAP[word];
    if (!alts) return;
    for (const alt of alts) {
      const swapped = words
        .map((w, j) => {
          if (j === idx) return alt;
          const m = DEVANAGARI_WORD_MAP[w];
          return m ? m[0] : normaliseLatin(transliterateWord(w));
        })
        .join(' ');
      variants.add(swapped);
    }
  });

  // Multi-word staples squashed together (पनीरबटरमसाला style input).
  const squashed = DEVANAGARI_WORD_MAP[trimmed.replace(/\s+/g, '')];
  if (squashed) squashed.forEach((s) => variants.add(s));

  return Array.from(variants).filter((v) => v.length > 0);
}
