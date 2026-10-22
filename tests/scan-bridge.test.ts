import { describe, it, expect } from 'vitest';
import { FOOD_DB } from '../src/lib/macros';
import { INDIAN_FOOD_META } from '../src/lib/indian-foods';
import { FOOD_META } from '../src/lib/food-meta';
import { SCAN_BRIDGE, SCAN_TAXONOMY_VERSION, resolveScanLabel } from '../src/lib/scan-bridge';

/**
 * Classifier→DB bridge (P0-1). The bridge is DATA, never a runtime
 * string join: these tests pin total coverage of the v4.4 taxonomy
 * (622 labels), target validity, the Indian exact-match bar (≥95%),
 * and the audit's trap cases where fuzzy matching prices a dish as a
 * different food.
 */

const INDIAN_LABELS: string[] = [
  'adhirasam', 'aloo gobi', 'aloo masala', 'aloo methi',
  'aloo mutter', 'aloo paratha', 'aloo shimla mirch', 'aloo tikki',
  'amritsari kulcha', 'anarsa', 'anda curry', 'appam',
  'ariselu', 'avial', 'baati', 'balushahi',
  'banana chips', 'bandar laddu', 'barfi', 'basundi',
  'besan laddu', 'bhatura', 'bhindi masala', 'biryani',
  'boondi', 'boondi laddu', 'butter chicken', 'butter naan',
  'chaas', 'chai', 'chak hao kheer', 'cham cham',
  'chana masala', 'chapati', 'cheela', 'chhena kheeri',
  'chicken curry', 'chicken rezala', 'chicken tikka', 'chicken tikka masala',
  'chikki', 'chivda', 'chole bhature', 'churma',
  'coconut chutney', 'curd rice', 'dabeli', 'dal',
  'dal baati churma', 'dal khichdi', 'dal makhani', 'dal puri',
  'dal tadka', 'dharwad pedha', 'dhokla', 'doodhpak',
  'dosa', 'double ka meetha', 'dum aloo', 'falooda',
  'fish curry', 'gajar ka halwa', 'garlic naan', 'gavvalu',
  'ghevar', 'green chutney', 'grilled sandwich', 'gujhia',
  'gulab jamun', 'hara bhara kabab', 'idiyappam', 'idli',
  'imarti', 'jalebi', 'kachori', 'kadai paneer',
  'kadhi', 'kajjikaya', 'kaju katli', 'kakinada khaja',
  'kalakand', 'karela bharta', 'kathi roll', 'khakhra',
  'kheer', 'kofta', 'kulfi', 'lassi',
  'ledikeni', 'litti chokha', 'lyangcha', 'maach jhol',
  'makki di roti sarson da saag', 'malpua', 'masala dosa', 'masala papad',
  'medu vada', 'misal pav', 'missi roti', 'misti doi',
  'modak', 'momos', 'moong dal halwa', 'murukku',
  'mutton curry', 'mysore pak', 'naan', 'navratan korma',
  'neer dosa', 'olan', 'pakora', 'palak paneer',
  'paneer', 'paneer butter masala', 'paneer masala', 'pani puri',
  'paniyaram', 'papdi chaat', 'patrode', 'pav bhaji',
  'phirni', 'pithe', 'poha', 'pongal',
  'poornalu', 'pootharekulu', 'puri bhaji', 'puttu',
  'qubani ka meetha', 'rabri', 'raita', 'rajma chawal',
  'rajma curry', 'rasam', 'rasgulla', 'rasmalai',
  'rava dosa', 'sabudana khichdi', 'sabudana vada', 'sambar',
  'samosa', 'sandesh', 'seekh kebab', 'set dosa',
  'sev puri', 'shahi paneer', 'shankarpali', 'sheer korma',
  'sheera', 'shrikhand', 'soan papdi', 'sohan halwa',
  'solkadhi', 'sutar feni', 'tandoori chicken', 'thali',
  'thoran', 'thukpa', 'tomato chutney', 'unni appam',
  'upma', 'uttapam', 'vada pav',
];

/** The 55 Indian labels the audit found recognized-but-unpriceable. */
const AUDIT_UNBRIDGED_55: string[] = [
  'adhirasam', 'aloo masala', 'aloo methi', 'aloo mutter',
  'aloo shimla mirch', 'anarsa', 'anda curry', 'ariselu',
  'baati', 'bandar laddu', 'barfi', 'besan laddu',
  'boondi', 'boondi laddu', 'butter naan', 'chak hao kheer',
  'cheela', 'chhena kheeri', 'chicken rezala', 'chikki',
  'chivda', 'churma', 'dal puri', 'dharwad pedha',
  'doodhpak', 'double ka meetha', 'falooda', 'gavvalu',
  'ghevar', 'grilled sandwich', 'gujhia', 'hara bhara kabab',
  'kajjikaya', 'kakinada khaja', 'karela bharta', 'kathi roll',
  'kofta', 'ledikeni', 'lyangcha', 'maach jhol',
  'makki di roti sarson da saag', 'modak', 'momos', 'paniyaram',
  'patrode', 'pithe', 'poornalu', 'pootharekulu',
  'puri bhaji', 'qubani ka meetha', 'seekh kebab', 'sohan halwa',
  'sutar feni', 'thukpa', 'unni appam',
];

describe('scan bridge — coverage', () => {
  it('covers all 622 v4.4 taxonomy labels', () => {
    expect(SCAN_TAXONOMY_VERSION).toBe('v4.4');
    expect(Object.keys(SCAN_BRIDGE)).toHaveLength(622);
    for (const label of INDIAN_LABELS) {
      expect(SCAN_BRIDGE[label], `missing Indian label ${label}`).toBeDefined();
    }
  });

  it('every non-"none" target exists in FOOD_DB; "none" always has a null key', () => {
    const bad: string[] = [];
    for (const [label, e] of Object.entries(SCAN_BRIDGE)) {
      if (e.matchType === 'none') {
        if (e.dbKey !== null) bad.push(`${label}: none with a dbKey`);
      } else if (!e.dbKey || !(e.dbKey in FOOD_DB)) {
        bad.push(`${label}: target ${e.dbKey} not in FOOD_DB`);
      }
      if (!['exact', 'generic', 'none'].includes(e.matchType)) bad.push(`${label}: bad matchType`);
    }
    expect(bad).toEqual([]);
  });

  it('Indian exact-match coverage is at least 95% (target: 162/163)', () => {
    const exact = INDIAN_LABELS.filter((l) => SCAN_BRIDGE[l].matchType === 'exact');
    expect(exact.length / INDIAN_LABELS.length).toBeGreaterThanOrEqual(0.95);
    expect(exact.length).toBe(162);
    // The single non-exact Indian label is a deliberate generic.
    const nonExact = INDIAN_LABELS.filter((l) => SCAN_BRIDGE[l].matchType !== 'exact');
    expect(nonExact).toEqual(['dal khichdi']);
    expect(SCAN_BRIDGE['dal khichdi']).toEqual({ dbKey: 'moong dal khichdi', matchType: 'generic' });
  });

  it('world coverage: every label is exact, generic, or an explicit none', () => {
    const counts = { exact: 0, generic: 0, none: 0 };
    for (const e of Object.values(SCAN_BRIDGE)) counts[e.matchType]++;
    expect(counts).toEqual({ exact: 225, generic: 268, none: 129 });
  });
});

describe('scan bridge — the 55 audit dishes are now real, portioned DB entries', () => {
  it('all 55 resolve exact to a DB entry with household portions and v2 meta', () => {
    for (const label of AUDIT_UNBRIDGED_55) {
      const e = SCAN_BRIDGE[label];
      expect(e.matchType, label).toBe('exact');
      const key = e.dbKey!;
      expect(FOOD_DB[key], label).toBeDefined();
      expect(INDIAN_FOOD_META[key]?.units.length, `${label} portions`).toBeGreaterThan(0);
      expect(FOOD_META[key], `${label} v2 meta`).toBeDefined();
    }
  });
});

describe('scan bridge — trap cases (why fuzzy matching is banned)', () => {
  it('moong dal halwa is NOT priced as moong dal', () => {
    expect(resolveScanLabel('moong dal halwa')).toEqual({ dbKey: 'moong dal halwa', matchType: 'exact' });
  });
  it('paneer masala is NOT priced as paneer butter masala', () => {
    expect(resolveScanLabel('paneer masala')).toEqual({ dbKey: 'paneer masala', matchType: 'exact' });
  });
  it('chicken tikka masala is NOT priced as chicken tikka', () => {
    expect(resolveScanLabel('chicken tikka masala')).toEqual({ dbKey: 'chicken tikka masala', matchType: 'exact' });
  });
  it('fried rice is NOT priced as schezwan fried rice', () => {
    expect(resolveScanLabel('fried rice')).toEqual({ dbKey: 'fried rice', matchType: 'exact' });
  });
  it('coconut milk soup is NOT priced as the coconut milk ingredient', () => {
    expect(resolveScanLabel('coconut milk soup')).toEqual({ dbKey: null, matchType: 'none' });
  });
});

describe('scan bridge — generic targets are same-family sane (spots)', () => {
  it('specific shapes/dishes point at their family entry', () => {
    expect(resolveScanLabel('penne')).toEqual({ dbKey: 'pasta', matchType: 'generic' });
    expect(resolveScanLabel('gyoza')).toEqual({ dbKey: 'dumplings', matchType: 'generic' });
    expect(resolveScanLabel('takoyaki')).toEqual({ dbKey: 'paniyaram', matchType: 'generic' });
    expect(resolveScanLabel('nasi campur')).toEqual({ dbKey: 'veg thali', matchType: 'generic' });
    expect(resolveScanLabel('tempura')).toEqual({ dbKey: 'pakora', matchType: 'generic' });
    expect(resolveScanLabel('kedgeree')).toEqual({ dbKey: 'khichdi', matchType: 'generic' });
    expect(resolveScanLabel('gajar ka halwa')).toEqual({ dbKey: 'gajar halwa', matchType: 'exact' });
    expect(resolveScanLabel('thali')).toEqual({ dbKey: 'veg thali', matchType: 'exact' });
  });

  it('resolver is exact-label only: unknown labels fall back to none, never a guess', () => {
    expect(resolveScanLabel('some future dish')).toEqual({ dbKey: null, matchType: 'none' });
    expect(resolveScanLabel('')).toEqual({ dbKey: null, matchType: 'none' });
    expect(resolveScanLabel('  Momos ')).toEqual({ dbKey: 'momos', matchType: 'exact' });
  });
});
