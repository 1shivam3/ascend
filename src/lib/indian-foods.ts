import type { FoodItem } from './types';

/**
 * Indian thali overlay for the food database — the "food moat".
 *
 * Two layers:
 *  1. INDIAN_FOOD_VALUES — curated per-100g macros for the classic
 *     confusables and thali staples, aligned to IFCT (Indian Food
 *     Composition Tables, NIN-ICMR) cooked values. These override/add to
 *     the base FOOD_DB in macros.ts. Every value is kept within ~5% of
 *     Atwater (4P + 4C + 9F) so the DB integrity test holds.
 *  2. INDIAN_FOOD_META — per-dish household portion units (katori, piece,
 *     plate — with gram equivalents), a visible recipe-assumption string,
 *     and how much ghee/oil (tsp, per standard serving) the DB values
 *     already include. Photo AI can't see absorbed ghee; the assumption
 *     plus the oil selector in the builder is the honest fix.
 */

export interface HouseholdUnitDef {
  /** Unit id stored on FoodItem.unit ('katori', 'piece', ...). */
  id: string;
  label: string;
  /** Gram equivalent of ONE unit of this food. */
  grams: number;
}

export interface IndianFoodMeta {
  /** Shown (muted) in search results and the meal builder. */
  assumption: string;
  /** tsp of ghee/oil already counted in the DB values, per standard
   *  serving (1 katori / 1 piece / 1 plate). The oil selector adjusts
   *  relative to this baseline. */
  assumedOilTsp: number;
  /** Whether the "Ghee/oil in this?" selector makes sense for the dish. */
  oilRelevant: boolean;
  region?: string;
  units: HouseholdUnitDef[];
}

const katori = (grams: number): HouseholdUnitDef => ({
  id: 'katori',
  label: `katori (~${grams}g)`,
  grams,
});
const bowl = (grams: number): HouseholdUnitDef => ({
  id: 'bowl',
  label: `bowl (~${grams}g)`,
  grams,
});
const plate = (grams: number): HouseholdUnitDef => ({
  id: 'plate',
  label: `plate (~${grams}g)`,
  grams,
});
const piece = (grams: number): HouseholdUnitDef => ({
  id: 'piece',
  label: 'piece',
  grams,
});
const glass = (grams: number): HouseholdUnitDef => ({
  id: 'glass',
  label: `glass (~${grams}g)`,
  grams,
});

const DAL_UNITS: HouseholdUnitDef[] = [katori(150), bowl(200)];
const SABZI_UNITS: HouseholdUnitDef[] = [katori(120), bowl(180)];
const RICE_UNITS: HouseholdUnitDef[] = [katori(150), plate(250), bowl(200)];
const SIDE_UNITS: HouseholdUnitDef[] = [katori(150), bowl(200)];

type V = Omit<FoodItem, 'name'>;

/** Curated per-100g values (cooked, ready to eat). */
export const INDIAN_FOOD_VALUES: Record<string, V> = {
  // ── Dals & lentil curries — the confusables, kept distinct ──────────
  'dal tadka': { calories: 128, proteinG: 7, carbsG: 17, fatG: 3.6 },
  'dal fry': { calories: 135, proteinG: 6.5, carbsG: 16, fatG: 5 },
  'dal makhani': { calories: 150, proteinG: 6, carbsG: 15, fatG: 7.5 },
  'panchmel dal': { calories: 125, proteinG: 6.8, carbsG: 17, fatG: 3.4 },
  'masoor dal': { calories: 115, proteinG: 7.5, carbsG: 17, fatG: 2 },
  'urad dal': { calories: 120, proteinG: 7, carbsG: 18, fatG: 2.4 },
  'chana dal': { calories: 130, proteinG: 7.5, carbsG: 19, fatG: 2.8 },
  'lobhia curry': { calories: 115, proteinG: 7, carbsG: 18, fatG: 1.8 },
  'sambar': { calories: 65, proteinG: 3, carbsG: 10, fatG: 1.5 },
  'rasam': { calories: 30, proteinG: 1.2, carbsG: 4.5, fatG: 0.8 },
  'kadhi': { calories: 75, proteinG: 3.2, carbsG: 6, fatG: 4.2 },

  // ── Rice dishes ─────────────────────────────────────────────────────
  'jeera rice': { calories: 138, proteinG: 2.8, carbsG: 26, fatG: 2.6 },
  'veg pulao': { calories: 130, proteinG: 3.2, carbsG: 24, fatG: 2.4 },
  'curd rice': { calories: 105, proteinG: 3.4, carbsG: 17, fatG: 2.6 },
  'lemon rice': { calories: 150, proteinG: 3, carbsG: 24, fatG: 4.8 },
  'tomato rice': { calories: 125, proteinG: 2.8, carbsG: 22, fatG: 3 },
  'tamarind rice': { calories: 165, proteinG: 3.4, carbsG: 25, fatG: 5.8 },
  'bisibelebath': { calories: 120, proteinG: 4, carbsG: 19, fatG: 3.2 },
  'ven pongal': { calories: 135, proteinG: 4.5, carbsG: 20, fatG: 4.2 },
  'moong dal khichdi': { calories: 115, proteinG: 5, carbsG: 19, fatG: 2.2 },
  // Sabudana khichdi silently fuzzy-matched moong khichdi before this
  // entry existed (protein claimed 6.8 g/katori vs ~3.8 real) — it is a
  // near-pure-starch vrat dish with peanuts, nothing like dal khichdi.
  'sabudana khichdi': { calories: 170, proteinG: 2.5, carbsG: 28, fatG: 5.5 },
  // Composite plate, blended per-100g of the standard composition in
  // the meta assumption (plate ≈ 650 g → ~700 kcal, ~22 g protein).
  'veg thali': { calories: 108, proteinG: 3.4, carbsG: 17, fatG: 3 },

  // ── Sabzis (dry vegetable curries) ──────────────────────────────────
  'baingan bharta': { calories: 85, proteinG: 1.8, carbsG: 8, fatG: 5.2 },
  'gajar matar': { calories: 80, proteinG: 2.4, carbsG: 11, fatG: 3 },
  'cabbage sabzi': { calories: 55, proteinG: 1.8, carbsG: 7, fatG: 2.2 },
  'lauki sabzi': { calories: 45, proteinG: 1.2, carbsG: 6, fatG: 1.8 },
  'karela sabzi': { calories: 60, proteinG: 1.8, carbsG: 7, fatG: 2.8 },
  'palak sabzi': { calories: 55, proteinG: 2.8, carbsG: 5, fatG: 2.8 },
  'sarson ka saag': { calories: 75, proteinG: 3.5, carbsG: 6, fatG: 4.2 },
  'moong sprouts': { calories: 105, proteinG: 7, carbsG: 15, fatG: 2 },
  'soya sabzi': { calories: 150, proteinG: 13, carbsG: 9, fatG: 6.5 },
  'veg kurma': { calories: 110, proteinG: 3, carbsG: 10, fatG: 6.5 },
  'avial': { calories: 95, proteinG: 2.2, carbsG: 9, fatG: 5.6 },
  'poriyal': { calories: 70, proteinG: 2, carbsG: 8, fatG: 3.4 },
  'kootu': { calories: 85, proteinG: 3.5, carbsG: 11, fatG: 3 },

  // ── Paneer dishes ───────────────────────────────────────────────────
  'matar paneer': { calories: 170, proteinG: 7.5, carbsG: 9, fatG: 11 },
  'kadai paneer': { calories: 185, proteinG: 9, carbsG: 7, fatG: 13.5 },
  'shahi paneer': { calories: 210, proteinG: 8, carbsG: 10, fatG: 15.5 },

  // ── Breads ──────────────────────────────────────────────────────────
  'tandoori roti': { calories: 265, proteinG: 8, carbsG: 52, fatG: 2.6 },
  'missi roti': { calories: 280, proteinG: 9, carbsG: 45, fatG: 7 },
  'makki di roti': { calories: 250, proteinG: 5.5, carbsG: 42, fatG: 6.5 },
  'thepla': { calories: 290, proteinG: 7, carbsG: 40, fatG: 11.5 },
  'bhatura': { calories: 330, proteinG: 7, carbsG: 46, fatG: 13 },
  'puri': { calories: 330, proteinG: 6.5, carbsG: 44, fatG: 14 },

  // ── South Indian tiffin ─────────────────────────────────────────────
  // The base DB carried idli's classic PER-PIECE macros (58 kcal, 2P/12C)
  // in the per-100g slot, so 3 idlis logged ~70 kcal instead of ~175.
  // Per-100g values below reproduce 58 kcal for one 40 g piece.
  'idli': { calories: 145, proteinG: 4.5, carbsG: 30, fatG: 0.7 },
  'appam': { calories: 120, proteinG: 2.2, carbsG: 24, fatG: 1.8 },
  'puttu': { calories: 235, proteinG: 4, carbsG: 45, fatG: 4.5 },
  'uttapam': { calories: 170, proteinG: 4.5, carbsG: 26, fatG: 5.4 },
  'pesarattu': { calories: 160, proteinG: 6, carbsG: 22, fatG: 5.4 },
  'rava dosa': { calories: 190, proteinG: 4, carbsG: 28, fatG: 7 },
  'set dosa': { calories: 165, proteinG: 4, carbsG: 25, fatG: 5.4 },

  // ── Sides, chutneys, papad ──────────────────────────────────────────
  'boondi raita': { calories: 95, proteinG: 3, carbsG: 8, fatG: 5.6 },
  'roasted papad': { calories: 300, proteinG: 12, carbsG: 56, fatG: 1.5 },
  'fried papad': { calories: 380, proteinG: 10, carbsG: 52, fatG: 14 },
  'pickle': { calories: 110, proteinG: 1.5, carbsG: 8, fatG: 8 },
  'green chutney': { calories: 45, proteinG: 1.8, carbsG: 5, fatG: 2 },
  'coconut chutney': { calories: 110, proteinG: 2, carbsG: 6, fatG: 8.6 },
  'tomato chutney': { calories: 60, proteinG: 1.5, carbsG: 8, fatG: 2.6 },
};

const M = (
  assumption: string,
  assumedOilTsp: number,
  units: HouseholdUnitDef[],
  opts: { region?: string; oilRelevant?: boolean } = {}
): IndianFoodMeta => ({
  assumption,
  assumedOilTsp,
  units,
  region: opts.region,
  oilRelevant: opts.oilRelevant ?? true,
});

/** Household units + recipe assumptions per dish. Keys are FOOD_DB keys. */
export const INDIAN_FOOD_META: Record<string, IndianFoodMeta> = {
  // ── Dals & lentil curries ──────────────────────────────────────────
  'dal': M('Plain cooked dal, light tadka. Add your tadka with the ghee selector if it was richer.', 1, DAL_UNITS, { region: 'Pan-India' }),
  'dal tadka': M('Assumes 1 tsp ghee tadka, medium onion-tomato base, arhar (toor) dal.', 1, DAL_UNITS, { region: 'North' }),
  'dal fry': M('Restaurant style: assumes 2 tsp ghee/oil tadka, onion-tomato masala base.', 2, DAL_UNITS, { region: 'North' }),
  'dal makhani': M('Assumes butter-cream finish (~2 tsp fat), slow-cooked black urad + rajma.', 2, DAL_UNITS, { region: 'North' }),
  'panchmel dal': M('Five-dal mix, assumes 1 tsp ghee tadka.', 1, DAL_UNITS, { region: 'West' }),
  'masoor dal': M('Thin red-lentil dal, assumes 1 tsp oil tadka.', 1, DAL_UNITS, { region: 'Pan-India' }),
  'urad dal': M('Assumes 1 tsp oil tadka, medium-thick consistency.', 1, DAL_UNITS, { region: 'North' }),
  'chana dal': M('Assumes 1 tsp oil tadka, chana dal cooked soft.', 1, DAL_UNITS, { region: 'North' }),
  'yellow dal': M('Assumes 1 tsp oil tadka, thin home-style dal.', 1, DAL_UNITS, { region: 'Pan-India' }),
  'toor dal': M('Assumes 1 tsp oil tadka, plain arhar dal.', 1, DAL_UNITS, { region: 'Pan-India' }),
  'moong dal': M('Light moong dal, assumes a small 1/2 tsp oil tadka.', 0.5, DAL_UNITS, { region: 'Pan-India' }),
  'lobhia curry': M('Black-eyed peas curry, assumes 1 tsp oil in the masala.', 1, DAL_UNITS, { region: 'North' }),
  'rajma': M('Assumes 1 tsp oil in the onion-tomato masala, home style.', 1, DAL_UNITS, { region: 'North' }),
  'chole': M('Assumes 1.5 tsp oil in the masala, chickpeas cooked soft.', 1.5, DAL_UNITS, { region: 'North' }),
  'chana masala': M('Assumes 1.5 tsp oil in the masala, chickpeas cooked soft.', 1.5, DAL_UNITS, { region: 'North' }),
  'sambar': M('Assumes 1 tsp oil tadka, toor dal with mixed vegetables, medium-thin.', 1, DAL_UNITS, { region: 'South' }),
  'rasam': M('Thin pepper-tamarind rasam, assumes a 1/2 tsp oil-ghee tadka.', 0.5, DAL_UNITS, { region: 'South' }),
  'kadhi': M('Besan-curd kadhi, assumes 1 tsp oil tadka, no pakodis. Add pakodis separately if yours had them.', 1, DAL_UNITS, { region: 'West' }),

  // ── Rice dishes ────────────────────────────────────────────────────
  'jeera rice': M('Assumes 1 tsp ghee for the jeera tadka, long-grain rice.', 1, RICE_UNITS, { region: 'North' }),
  'veg pulao': M('Assumes 1 tsp ghee/oil, mixed vegetables, whole spices.', 1, RICE_UNITS, { region: 'Pan-India' }),
  'curd rice': M('Assumes a 1/2 tsp oil tadka with curry leaves; curd + cooked rice.', 0.5, RICE_UNITS, { region: 'South' }),
  'lemon rice': M('Assumes 1.5 tsp oil with peanuts and chana dal tadka.', 1.5, RICE_UNITS, { region: 'South' }),
  'tomato rice': M('Assumes 1 tsp oil, tomato-onion base.', 1, RICE_UNITS, { region: 'South' }),
  'tamarind rice': M('Assumes 1.5 tsp sesame oil, peanuts, tamarind paste base.', 1.5, RICE_UNITS, { region: 'South' }),
  'bisibelebath': M('Assumes 1 tsp ghee finish, rice + toor dal + vegetables cooked together.', 1, RICE_UNITS, { region: 'South' }),
  'ven pongal': M('Assumes 1.5 tsp ghee, rice + moong dal, pepper-cumin tadka.', 1.5, RICE_UNITS, { region: 'South' }),
  'khichdi': M('Assumes 1 tsp ghee, rice + moong dal. Many homes add a spoon of ghee on top — count it with the selector.', 1, RICE_UNITS, { region: 'Pan-India' }),
  'moong dal khichdi': M('Light khichdi, assumes a 1/2 tsp ghee tadka.', 0.5, RICE_UNITS, { region: 'Pan-India' }),
  'sabudana khichdi': M('Assumes peanuts + a little potato, 1.5 tsp ghee/oil tadka per katori. A vrat staple — mostly starch, so protein stays low.', 1.5, [katori(150), plate(200)], { region: 'West' }),
  'veg thali': M('Standard veg thali: 2 roti, 1 katori dal, 1 katori sabzi, 1 katori rice, a little curd + 1 papad. Mess and restaurant thalis vary — swap in the parts if yours was different.', 2.5, [plate(650)], { region: 'Pan-India' }),
  'biryani': M('Assumes 1.5 tsp ghee/oil per serving, layered rice with masala.', 1.5, RICE_UNITS, { region: 'Pan-India' }),
  'chicken biryani': M('Assumes 1.5 tsp ghee/oil per serving, chicken pieces with bone-in average.', 1.5, RICE_UNITS, { region: 'Pan-India' }),
  'veg biryani': M('Assumes 1.5 tsp ghee/oil per serving, mixed vegetables.', 1.5, RICE_UNITS, { region: 'Pan-India' }),

  // ── Sabzis ─────────────────────────────────────────────────────────
  'aloo gobi': M('Assumes 1.5 tsp oil per katori, dry home-style sabzi.', 1.5, SABZI_UNITS, { region: 'North' }),
  'bhindi masala': M('Assumes 1.5 tsp oil per katori — bhindi soaks up oil as it fries.', 1.5, SABZI_UNITS, { region: 'Pan-India' }),
  'aloo sabji': M('Assumes 1.5 tsp oil per katori, dry potato sabzi.', 1.5, SABZI_UNITS, { region: 'Pan-India' }),
  'mixed sabji': M('Assumes 1.5 tsp oil per katori, mixed seasonal vegetables.', 1.5, SABZI_UNITS, { region: 'Pan-India' }),
  'sabzi': M('Assumes 1.5 tsp oil per katori, mixed seasonal vegetables.', 1.5, SABZI_UNITS, { region: 'Pan-India' }),
  'baingan bharta': M('Assumes 1.5 tsp oil, roasted brinjal mashed with onion-tomato.', 1.5, SABZI_UNITS, { region: 'North' }),
  'gajar matar': M('Assumes 1 tsp oil per katori, carrot + peas, lightly spiced.', 1, SABZI_UNITS, { region: 'North' }),
  'cabbage sabzi': M('Assumes 1 tsp oil per katori, shredded cabbage with tadka.', 1, SABZI_UNITS, { region: 'Pan-India' }),
  'lauki sabzi': M('Assumes 1 tsp oil per katori, bottle gourd, light masala.', 1, SABZI_UNITS, { region: 'Pan-India' }),
  'karela sabzi': M('Assumes 1.5 tsp oil per katori — karela is usually fried down with onion.', 1.5, SABZI_UNITS, { region: 'Pan-India' }),
  'palak sabzi': M('Assumes 1 tsp oil per katori, spinach cooked down with garlic.', 1, SABZI_UNITS, { region: 'Pan-India' }),
  'sarson ka saag': M('Assumes 1.5 tsp ghee/butter finish, slow-cooked mustard greens.', 1.5, SABZI_UNITS, { region: 'North' }),
  'moong sprouts': M('Sprouted moong, assumes a 1/2 tsp oil tadka or eaten plain-boiled.', 0.5, SABZI_UNITS, { region: 'Pan-India' }),
  'soya sabzi': M('Soya chunks curry, assumes 1.5 tsp oil in the masala.', 1.5, SABZI_UNITS, { region: 'Pan-India' }),
  'veg kurma': M('Coconut-based kurma, assumes 1 tsp oil; the coconut carries most of the fat.', 1, SABZI_UNITS, { region: 'South' }),
  'avial': M('Assumes 1 tsp coconut oil, mixed vegetables in coconut-curd gravy.', 1, SABZI_UNITS, { region: 'South' }),
  'poriyal': M('Assumes 1 tsp coconut oil tadka, dry stir-fried vegetable with coconut.', 1, SABZI_UNITS, { region: 'South' }),
  'kootu': M('Assumes 1 tsp oil tadka, vegetables cooked with moong dal and coconut.', 1, SABZI_UNITS, { region: 'South' }),

  // ── Paneer & curries ───────────────────────────────────────────────
  'paneer butter masala': M('Assumes 2 tsp butter/ghee + cream in a rich tomato gravy.', 2, DAL_UNITS, { region: 'North' }),
  'palak paneer': M('Assumes 1.5 tsp oil/ghee, spinach gravy, light cream optional.', 1.5, DAL_UNITS, { region: 'North' }),
  'paneer bhurji': M('Assumes 1.5 tsp oil/ghee, crumbled paneer with onion-tomato.', 1.5, SABZI_UNITS, { region: 'North' }),
  'paneer tikka': M('Assumes a 1/2 tsp oil brush, tandoor/grilled, hung-curd marinade.', 0.5, [piece(100)], { region: 'North' }),
  'matar paneer': M('Assumes 1.5 tsp oil in a medium tomato-onion gravy.', 1.5, DAL_UNITS, { region: 'North' }),
  'kadai paneer': M('Assumes 1.5 tsp oil, semi-dry with capsicum and onion petals.', 1.5, SABZI_UNITS, { region: 'North' }),
  'shahi paneer': M('Rich cashew-cream gravy, assumes 2 tsp ghee/butter.', 2, DAL_UNITS, { region: 'North' }),
  'butter chicken': M('Assumes 2 tsp butter + cream in the makhani gravy.', 2, DAL_UNITS, { region: 'North' }),
  'chicken curry': M('Home-style curry, assumes 1.5 tsp oil in the masala.', 1.5, DAL_UNITS, { region: 'Pan-India' }),
  'egg curry': M('Assumes 1.5 tsp oil in the masala, 2 eggs worth of curry per katori.', 1.5, DAL_UNITS, { region: 'Pan-India' }),
  'mutton curry': M('Assumes 1.5 tsp oil; mutton fat is counted in the meat values.', 1.5, DAL_UNITS, { region: 'Pan-India' }),
  'fish curry': M('Assumes 1.5 tsp oil, medium-thin curry.', 1.5, DAL_UNITS, { region: 'Pan-India' }),

  // ── Breads ─────────────────────────────────────────────────────────
  'roti': M('Dry-roasted on the tawa/flame, no ghee counted. Add ghee with the selector if yours was smeared.', 0, [piece(30)], { region: 'Pan-India' }),
  'chapati': M('Dry-roasted, no ghee counted. Add ghee with the selector if yours was smeared.', 0, [piece(30)], { region: 'Pan-India' }),
  'phulka': M('Puffed on the flame, no ghee counted.', 0, [piece(30)], { region: 'Pan-India' }),
  'tandoori roti': M('Clay-oven roti, no butter counted. Restaurant butter brush ≈ the 1 tsp step.', 0, [piece(40)], { region: 'North' }),
  'missi roti': M('Assumes 1 tsp oil/ghee worked into the besan-atta dough per roti.', 1, [piece(40)], { region: 'North' }),
  'makki di roti': M('Assumes 1 tsp ghee/butter served on top, maize flour roti.', 1, [piece(45)], { region: 'North' }),
  'naan': M('Assumes a light butter brush (~1 tsp) as served in most restaurants.', 1, [piece(90)], { region: 'North' }),
  'paratha': M('Assumes ~2 tsp oil/ghee per paratha, layered and shallow-fried.', 2, [piece(75)], { region: 'North' }),
  'plain paratha': M('Assumes ~2 tsp oil/ghee per paratha, layered and shallow-fried.', 2, [piece(75)], { region: 'North' }),
  'aloo paratha': M('Assumes ~2 tsp oil/ghee per paratha, spiced potato filling.', 2, [piece(110)], { region: 'North' }),
  'paneer paratha': M('Assumes ~2 tsp oil/ghee per paratha, paneer filling.', 2, [piece(120)], { region: 'North' }),
  'thepla': M('Assumes 1.5 tsp oil rolled into the methi dough per thepla.', 1.5, [piece(50)], { region: 'West' }),
  'bhatura': M('Deep-fried — the oil is in the bread itself; values assume a drained, home-size bhatura.', 2, [piece(60)], { region: 'North', oilRelevant: false }),
  'puri': M('Deep-fried — the oil is in the bread itself; values assume drained puris.', 2, [piece(25)], { region: 'Pan-India', oilRelevant: false }),

  // ── Tiffin & breakfast ─────────────────────────────────────────────
  'poha': M('Assumes 1 tsp oil with peanut-mustard tadka, flattened rice.', 1, [plate(150), katori(150)], { region: 'West' }),
  'upma': M('Assumes 1 tsp oil/ghee tadka, rava cooked soft.', 1, [plate(180), katori(150)], { region: 'South' }),
  'idli': M('Steamed — no oil in the idli itself. Coconut chutney/sambar counted separately.', 0, [piece(40)], { region: 'South', oilRelevant: false }),
  'dosa': M('Assumes 1 tsp oil spread on the tawa per dosa, crisp and thin.', 1, [piece(80)], { region: 'South' }),
  'masala dosa': M('Assumes 1 tsp oil on the tawa + spiced potato filling with its own tadka.', 1, [piece(130)], { region: 'South' }),
  'medu vada': M('Deep-fried — oil is in the vada itself; values assume drained vadas.', 2, [piece(50)], { region: 'South', oilRelevant: false }),
  'uttapam': M('Assumes 1 tsp oil on the tawa, thick dosa with onion-tomato topping.', 1, [piece(100)], { region: 'South' }),
  'pesarattu': M('Assumes 1 tsp oil on the tawa, whole moong dal dosa.', 1, [piece(90)], { region: 'South' }),
  'rava dosa': M('Assumes 1.5 tsp oil — rava dosas drink up tawa oil to go lacy and crisp.', 1.5, [piece(70)], { region: 'South' }),
  'set dosa': M('Assumes a 1/2 tsp oil brush, soft spongy dosa.', 0.5, [piece(60)], { region: 'South' }),
  'appam': M('Cooked in a covered appachatti with almost no oil.', 0, [piece(45)], { region: 'South', oilRelevant: false }),
  'puttu': M('Steamed rice flour + coconut — no oil.', 0, [piece(100)], { region: 'South', oilRelevant: false }),

  // ── Dairy, drinks, sides ───────────────────────────────────────────
  'curd': M('Plain set curd/dahi, whole milk. No tadka counted.', 0, SIDE_UNITS, { region: 'Pan-India', oilRelevant: false }),
  'dahi': M('Plain set curd/dahi, whole milk. No tadka counted.', 0, SIDE_UNITS, { region: 'Pan-India', oilRelevant: false }),
  'raita': M('Curd whisked with vegetables and dry spices, no tadka counted.', 0, SIDE_UNITS, { region: 'Pan-India', oilRelevant: false }),
  'boondi raita': M('Curd with soaked boondi; the boondi carries a little frying oil.', 0.5, SIDE_UNITS, { region: 'North', oilRelevant: false }),
  'lassi': M('Sweet lassi, whole-milk curd, malai topping not counted.', 0, [glass(250)], { region: 'North', oilRelevant: false }),
  'chaas': M('Thin salted buttermilk with a curry-leaf tadka in some homes (not counted).', 0, [glass(250)], { region: 'Pan-India', oilRelevant: false }),
  'roasted papad': M('Flame/oven roasted, no oil. One papad ≈ 15g.', 0, [piece(15)], { region: 'Pan-India', oilRelevant: false }),
  'fried papad': M('Deep-fried — oil is in the papad itself. One papad ≈ 15g.', 1.5, [piece(15)], { region: 'Pan-India', oilRelevant: false }),
  'masala papad': M('Roasted papad with onion-tomato topping, no extra oil counted.', 0, [piece(15)], { region: 'Pan-India', oilRelevant: false }),
  'pickle': M('Oil-preserved mango pickle; values include the oil clinging to the pieces.', 2, [{ id: 'tbsp', label: 'tbsp (~15g)', grams: 15 }], { region: 'Pan-India', oilRelevant: false }),
  'green chutney': M('Coriander-mint chutney, no oil tadka in most homes.', 0, [{ id: 'tbsp', label: 'tbsp (~15g)', grams: 15 }], { region: 'Pan-India', oilRelevant: false }),
  'coconut chutney': M('Assumes 1 tsp oil tadka for the whole batch (~1/4 tsp per tbsp served).', 0.25, [{ id: 'tbsp', label: 'tbsp (~15g)', grams: 15 }], { region: 'South' }),
  'tomato chutney': M('Assumes 1 tsp oil tadka for the whole batch.', 0.25, [{ id: 'tbsp', label: 'tbsp (~15g)', grams: 15 }], { region: 'South' }),
};

/** Exact or fuzzy resolution of a food name to its Indian meta. */
export function resolveIndianMeta(
  name: string
): { key: string; meta: IndianFoodMeta } | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (INDIAN_FOOD_META[n]) return { key: n, meta: INDIAN_FOOD_META[n] };

  let bestKey = '';
  let bestScore = 0;
  let bestReverse = false;
  for (const key of Object.keys(INDIAN_FOOD_META)) {
    if (n.includes(key)) {
      const score = key.length / n.length;
      if (score > bestScore) { bestScore = score; bestKey = key; bestReverse = false; }
    } else if (n.length >= 3 && key.includes(n)) {
      const score = n.length / key.length;
      if (score > bestScore) { bestScore = score; bestKey = key; bestReverse = true; }
    }
  }
  // The reverse direction (typed name is a substring of a dish key) is
  // dangerous for short generic ingredient names: "rice" matched curd
  // rice and "paneer" matched palak paneer, attaching the wrong recipe
  // assumption and a ghee prompt to plain ingredients (R3 finding).
  // Require a strong overlap there; "pongal" → ven pongal (0.6) still
  // resolves, "rice" (0.44) and "paneer" (0.5) no longer do.
  const threshold = bestReverse ? 0.6 : 0.25;
  if (bestKey && bestScore >= threshold) {
    return { key: bestKey, meta: INDIAN_FOOD_META[bestKey] };
  }
  return null;
}

/** Household units for a food (by DB key or display name). */
export function getHouseholdUnits(nameOrKey: string): HouseholdUnitDef[] {
  const resolved = resolveIndianMeta(nameOrKey);
  return resolved ? resolved.meta.units : [];
}

/** Gram equivalent of one household unit for this food, if defined. */
export function getHouseholdUnitGrams(
  nameOrKey: string,
  unitId: string
): number | undefined {
  const resolved = resolveIndianMeta(nameOrKey);
  if (!resolved) return undefined;
  const unit = resolved.meta.units.find((u) => u.id === unitId);
  return unit ? unit.grams : undefined;
}

/** True when the food is a curated Indian dish with assumption metadata. */
export function isIndianDish(nameOrKey: string): boolean {
  return resolveIndianMeta(nameOrKey) !== null;
}

/**
 * Convert a gram amount into a household-unit draft when it lands close
 * to a clean count (whole or half units) — e.g. a scanned 300g of dal
 * tadka becomes "2 katori". Used so photo-scan results arrive in the
 * units people actually think in. Returns null when no unit fits.
 */
export function householdDraftFor(
  name: string,
  grams: number
): { quantity: number; unit: string } | null {
  const resolved = resolveIndianMeta(name);
  if (!resolved || !(grams > 0)) return null;
  let best: { quantity: number; unit: string; err: number } | null = null;
  for (const unit of resolved.meta.units) {
    const qty = grams / unit.grams;
    const rounded = Math.round(qty * 2) / 2;
    if (rounded < 0.5 || rounded > 8) continue;
    const err = Math.abs(qty - rounded) / qty;
    if (err <= 0.15 && (!best || err < best.err)) {
      best = { quantity: rounded, unit: unit.id, err };
    }
  }
  return best ? { quantity: best.quantity, unit: best.unit } : null;
}
