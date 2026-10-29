import { describe, it, expect } from 'vitest';
import { FOOD_DB } from '../src/lib/macros';
import {
  MODEL_LABELS,
  OFFLINE_LABEL_MAP,
  OFFLINE_UNRESOLVED_LABELS,
  OFFLINE_AUTO_DRAFT_THRESHOLD,
  OFFLINE_CLASSIFIER_INPUT_SIZE,
  OFFLINE_CLASSIFIER_OUTPUT_SCALE,
  OFFLINE_CLASSIFIER_OUTPUT_ZERO_POINT,
  OFFLINE_DETECTOR_SCORE_THRESHOLD,
  isResolvedLabel,
  isOfflineScanAvailable,
  shouldUseOfflineScan,
  routeOfflineResult,
  buildItemForCandidate,
  buildOfflineDraft,
  buildDraftFromDetections,
  alternativesFor,
  confidenceTierForScore,
  displayNameForLabel,
  dequantizeAndSoftmax,
  decodeDetectorOutput,
  applyNms,
  type OfflineCandidate,
  type OfflineDetection,
  type RawDetection,
} from '../src/lib/offline-scan';

const cand = (label: string, score: number): OfflineCandidate => ({ label, score });

const det = (
  label: string,
  score: number,
  box = { x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4 },
  container = 'bowl_katori'
): OfflineDetection => ({
  box,
  container,
  containerScore: 0.9,
  candidates: [cand(label, score)],
});

/** The full unresolved set, generated from the v11 label list. */
const EXPECTED_UNRESOLVED: string[] = [
  'adobo',
  'almond jelly',
  'ambrosia',
  'apple pie',
  'apple turnover',
  'applesauce',
  'applesauce cake',
  'ayam bakar',
  'ayam goreng',
  'babi guling',
  'baby back ribs',
  'bacon and eggs',
  'bak kut teh',
  'baked alaska',
  'baked salmon',
  'baklava',
  'ball shaped bun with pork',
  'barbecued red pork in sauce with rice',
  'barbecued spareribs',
  'bean curd family style',
  'beef bourguignon',
  'beef bowl',
  'beef carpaccio',
  'beef curry',
  'beef in oyster sauce',
  'beef noodle',
  'beef noodle soup',
  'beef stroganoff',
  'beef tartare',
  'beef wellington',
  'beet salad',
  'beignet',
  'blancmange',
  'blt sandwich',
  'boiled chicken and vegetables',
  'boiled egg',
  'boiled fish',
  'boned, sliced hainan style chicken with marinated rice',
  'boston cream pie',
  'braised pork meat ball with napa cabbage',
  'bread pudding',
  'breakfast burrito',
  'brisket',
  'broiled eel bowl',
  'bruschetta',
  'bubble and squeak',
  'bubur ayam',
  'buffalo wings',
  'cabbage roll',
  'cannelloni',
  'cannoli',
  'caprese salad',
  'carbonnade flamande',
  'carrot cake',
  'casserole',
  'ceviche',
  'cham cham',
  'champon',
  'charcoal boiled pork neck',
  'chawanmushi',
  'cheese plate',
  'chicken cordon bleu',
  'chicken cutlet',
  'chicken kiev',
  'chicken marengo',
  'chicken nugget',
  'chicken pizza',
  'chicken provencale',
  'chicken quesadilla',
  'chicken rice',
  'chicken rice curry with coconut',
  'chiffon cake',
  'chili',
  'chilled noodle',
  'chinese pumpkin pie',
  'chinese soup',
  'chip butty',
  'chocolate cake',
  'chocolate mousse',
  'chop suey',
  'chow mein',
  'churros',
  'clam chowder',
  'clams',
  'clear soup',
  'cockles',
  'coconut cake',
  'coconut milk flavored crepes with shrimp and beef',
  'coconut milk soup',
  'coffee cake',
  'cold tofu',
  'compote',
  'confit',
  'coq au vin',
  'coquilles saint jacques',
  'cottage pie',
  'couscous',
  'crab',
  'crab cakes',
  'crayfish',
  'cream puff',
  'creme brulee',
  'crepe',
  'crispy noodles',
  'croque madame',
  'croquette',
  'cruller',
  'crumb cake',
  'crumpet',
  'curry puff',
  'custard',
  'custard tart',
  'cutlet curry',
  'dak galbi',
  'dal khichdi',
  'deep fried chicken wing',
  'deviled eggs',
  'dipping noodles',
  'dish consisting of stir fried potato, eggplant and green pepper',
  'dolmas',
  'donut',
  'dried fish',
  'dry curry',
  'eccles cake',
  'edamame',
  'eels on rice',
  'egg roll',
  'eggplant with garlic sauce',
  'eggs benedict',
  'eight treasure rice',
  'enchilada',
  'entrecote',
  'escargots',
  'falafel',
  'farfalle',
  'fettuccine',
  'filet mignon',
  'fine white noodles',
  'fish ball soup',
  'fish stick',
  'flan',
  'foie gras',
  'fondue',
  'french bread',
  'french onion soup',
  'french toast',
  'fried calamari',
  'fried egg',
  'fried fish',
  'fried mussel pancakes',
  'fried noodle',
  'fried pork in scoop',
  'fried shrimp',
  'frittata',
  'fritter',
  'frozen yogurt',
  'fruitcake',
  'gajar ka halwa',
  'galantine',
  'ganmodoki',
  'ginger pork saute',
  'gingerbread',
  'glutinous oil rice',
  'glutinous rice balls',
  'gnocchi',
  'goya chanpuru',
  'gratin',
  'green curry',
  'green salad',
  'grilled cheese sandwich',
  'grilled eggplant',
  'grilled pacific saury',
  'grilled salmon',
  'guacamole',
  'gulai',
  'gyoza',
  'gyro',
  'haggis',
  'ham and eggs',
  'ham cutlet',
  'ham sandwich',
  'hambarg steak',
  'haupia',
  'hot and sour, fish and vegetable ragout',
  'hot pot',
  'hue beef rice vermicelli soup',
  'huevos rancheros',
  'ice cream',
  'inarizushi',
  'jambalaya',
  'japanese tofu and vegetable chowder',
  'jerky',
  'jjigae',
  'kamameshi',
  'kaya toast',
  'kebab',
  'kedgeree',
  'khao soi',
  'kinpira style sauteed burdock',
  'knish',
  'kung pao chicken',
  'kushikatsu',
  'laksa',
  'lamb kebabs',
  'laulau',
  'lemon fig jelly',
  'lightly roasted fish',
  'limpet',
  'linguine',
  'lobster',
  'lobster bisque',
  'lobster roll sandwich',
  'lobster thermidor',
  'loco moco',
  'lumpia',
  'lutefisk',
  'macaron',
  'macaroni and cheese',
  'macaroni salad',
  'malasada',
  'mango pudding',
  'manicotti',
  'marble cake',
  'matzo ball',
  'meat loaf',
  'meatball',
  'mie ayam',
  'mie goreng',
  'minced meat cutlet',
  'minced pork rice',
  'minestrone',
  'mixed rice',
  'moo goo gai pan',
  'moon cake',
  'mostaccioli',
  'moussaka',
  'mozuku',
  'mushroom risotto',
  'mussel',
  'namero',
  'nanbanzuke',
  'nasi campur',
  'nasi goreng',
  'nasi padang',
  'nasi uduk',
  'natto',
  'noodles with fish curry',
  'oden',
  'okinawa soba',
  'okonomiyaki',
  'omurice',
  'orzo',
  'oshiruko',
  'osso buco',
  'oxtail soup',
  'oyakodon',
  'oyster omelette',
  'oysters',
  'paella',
  'paneer pizza',
  'panna cotta',
  'parfait',
  'pate',
  'pavlova',
  'peach melba',
  'peking duck',
  'penne',
  'pepper steak',
  'pilaf',
  'pirogi',
  'pizza toast',
  'poached egg',
  'poi',
  'pork belly',
  'pork cutlet',
  'pork cutlet on rice',
  'pork fillet cutlet',
  'pork loin cutlet',
  'pork miso soup',
  'pork satay',
  'pork sticky noodles',
  'pork with lemon',
  'porridge',
  'pot au feu',
  'potage',
  'potato salad',
  'potpie',
  'pound cake',
  'poutine',
  'prime rib',
  'profiterole',
  'pulled pork sandwich',
  'raisin bread',
  'rajma curry',
  'rare cheesecake',
  'ravioli',
  'red velvet cake',
  'reuben',
  'rice ball',
  'rice crispy pork',
  'rice gratin',
  'rice gruel',
  'rice vermicelli',
  'rice with roast duck',
  'rigatoni',
  'rissole',
  'roast chicken',
  'roast duck',
  'rock cake',
  'roll bread',
  'roulade',
  'rugulah',
  'salisbury steak',
  'salmon meuniere',
  'salt and pepper fried shrimp with shell',
  'samul',
  'sandwich',
  'sashimi',
  'sashimi bowl',
  'sauerbraten',
  'sauerkraut',
  'sausage roll',
  'sauteed spinach',
  'sauteed vegetables',
  'savarin',
  'scallop',
  'scampi',
  'schnitzel',
  'scone',
  'scotch egg',
  'scrambled eggs',
  'scrapple',
  'seasoned beef with potatoes',
  'seaweed salad',
  'shankarpali',
  'sheer korma',
  'sheera',
  'shirred egg',
  'shrimp and grits',
  'shrimp patties',
  'shrimp with chill source',
  'simmered pork',
  'sirloin cutlet',
  'sloppy joe',
  'small steamed savory rice pancake',
  'soba noodle',
  'souffle',
  'sour prawn soup',
  'spaghetti carbonara',
  'spam musubi',
  'spicy chicken salad',
  'spicy chili flavored tofu',
  'sponge cake',
  'spring roll',
  'steamed meat dumpling',
  'steamed rice roll',
  'steamed spareribs',
  'stew',
  'stewed pork leg',
  'stinky tofu',
  'stir fried beef and peppers',
  'stir fried mixed vegetables',
  'strawberry shortcake',
  'streusel',
  'strudel',
  'stuffed cabbage',
  'stuffed peppers',
  'stuffed tomato',
  'succotash',
  'sukiyaki',
  'sushi bowl',
  'sweet and sour pork',
  'syllabub',
  'tagliatelle',
  'taiyaki',
  'takoyaki',
  'tamale',
  'tamale pie',
  'tanmen',
  'tapenade',
  'tempura',
  'tempura bowl',
  'tempura udon',
  'tenderloin',
  'tenshin noodle',
  'teriyaki grilled fish',
  'terrine',
  'tetrazzini',
  'thai papaya salad',
  'thali',
  'thinly sliced raw horsemeat',
  'three cup chicken',
  'tiramisu',
  'toad in the hole',
  'torte',
  'tortellini',
  'tostada',
  'trunip pudding',
  'tuna tartare',
  'twice cooked pork',
  'udon noodle',
  'upside down cake',
  'veal cordon bleu',
  'vegetable tempura',
  'vermicelli',
  'vermicelli noodles with snails',
  'victoria sandwich',
  'vol au vent',
  'welsh rarebit',
  'winter melon soup',
  'wonton',
  'wonton soup',
  'xiao long bao',
  'yakitori',
  'yellow curry',
  'yudofu',
  'zha jiang mian',
  'ziti',
  'zoni',
];

describe('offline scan — label map completeness', () => {
  it('covers every model label exactly once (v11: 619 classes)', () => {
    expect(Object.keys(OFFLINE_LABEL_MAP).sort()).toEqual([...MODEL_LABELS].sort());
    expect(MODEL_LABELS).toHaveLength(619);
    expect(new Set(MODEL_LABELS).size).toBe(619);
  });

  it('every resolved label points at a real FOOD_DB entry with sane macros', () => {
    let resolved = 0;
    for (const label of MODEL_LABELS) {
      const mapping = OFFLINE_LABEL_MAP[label];
      if (!mapping) continue;
      resolved++;
      const entry = FOOD_DB[mapping.dbKey];
      expect(entry, `${label} → ${mapping.dbKey}`).toBeDefined();
      expect(entry.calories).toBeGreaterThan(0);
      expect(Number.isFinite(entry.proteinG)).toBe(true);
      expect(Number.isFinite(entry.carbsG)).toBe(true);
      expect(Number.isFinite(entry.fatG)).toBe(true);
      expect(mapping.defaultGrams).toBeGreaterThan(0);
    }
    expect(resolved).toBe(200);
  });

  it('the unresolved set is exactly the 419 labels with no FOOD_DB entry', () => {
    expect([...OFFLINE_UNRESOLVED_LABELS].sort()).toEqual([...EXPECTED_UNRESOLVED].sort());
    expect(OFFLINE_UNRESOLVED_LABELS).toHaveLength(419);
    for (const label of EXPECTED_UNRESOLVED) {
      expect(FOOD_DB[label], label).toBeUndefined();
      expect(isResolvedLabel(label)).toBe(false);
    }
  });

  it('known fuzzy traps stay exact: dal is dal, paneer is paneer', () => {
    // Substring/fuzzy matching used to send 'dal' to a tadka variant and
    // 'paneer' to palak paneer. The offline map must never do that.
    expect(OFFLINE_LABEL_MAP['dal']?.dbKey).toBe('dal');
    expect(OFFLINE_LABEL_MAP['paneer']?.dbKey).toBe('paneer');
  });

  it('the old v1 unresolved dishes now resolve honestly (DB gained entries)', () => {
    // 'kathi roll' and 'kofta' were unmapped in the v1 map; the food
    // DB has since gained real entries for both, so they now map
    // exactly instead of staying null.
    expect(OFFLINE_LABEL_MAP['kathi roll']?.dbKey).toBe('kathi roll');
    expect(OFFLINE_LABEL_MAP['kofta']?.dbKey).toBe('kofta');
    expect(isResolvedLabel('kathi roll')).toBe(true);
    expect(isResolvedLabel('kofta')).toBe(true);
  });
});

describe('offline scan — classifier contract', () => {
  it('v11 input is 224x224 UINT8 with the verified output quantization', () => {
    expect(OFFLINE_CLASSIFIER_INPUT_SIZE).toBe(224);
    expect(OFFLINE_CLASSIFIER_OUTPUT_SCALE).toBeCloseTo(0.0785653, 7);
    expect(OFFLINE_CLASSIFIER_OUTPUT_ZERO_POINT).toBe(190);
  });

  it('dequantize + softmax: equal logits give equal probabilities summing to 1', () => {
    const probs = dequantizeAndSoftmax([190, 190, 190], OFFLINE_CLASSIFIER_OUTPUT_SCALE, OFFLINE_CLASSIFIER_OUTPUT_ZERO_POINT);
    expect(probs).toHaveLength(3);
    probs.forEach((p) => expect(p).toBeCloseTo(1 / 3, 6));
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('dequantize + softmax: a higher quantized logit wins', () => {
    const probs = dequantizeAndSoftmax([200, 190], OFFLINE_CLASSIFIER_OUTPUT_SCALE, OFFLINE_CLASSIFIER_OUTPUT_ZERO_POINT);
    expect(probs[0]).toBeGreaterThan(probs[1]);
    expect(probs[0]).toBeGreaterThan(0.5);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe('offline scan — detector decode + NMS', () => {
  // Synthetic raw head: every anchor suppressed (class logits -10)
  // except one stride-8 anchor (row 5, col 5 → centre 44,44) with
  // class 4 (whole_dish) at sigmoid ≈ 0.9 and DFL one-hots
  // l=2, t=1, r=3, b=2 → box (28, 36, 68, 60) in 416 space.
  function syntheticHead(): number[][] {
    const head: number[][] = Array.from({ length: 3598 }, () => new Array(37).fill(-10));
    const idx = 5 * 52 + 5;
    const row = head[idx];
    row[4] = Math.log(9); // sigmoid ≈ 0.9
    const dist = [2, 1, 3, 2];
    for (let side = 0; side < 4; side++) {
      row[5 + side * 8 + dist[side]] = 10;
    }
    return head;
  }

  it('a constructed peak decodes to the expected box', () => {
    const dets = decodeDetectorOutput(syntheticHead(), 416, 416);
    expect(dets).toHaveLength(1);
    expect(dets[0].classIndex).toBe(4);
    expect(dets[0].score).toBeCloseTo(0.9, 2);
    expect(dets[0].box.x1).toBeCloseTo(28, 0);
    expect(dets[0].box.y1).toBeCloseTo(36, 0);
    expect(dets[0].box.x2).toBeCloseTo(68, 0);
    expect(dets[0].box.y2).toBeCloseTo(60, 0);
  });

  it('boxes scale to the original photo (stretched resize)', () => {
    const dets = decodeDetectorOutput(syntheticHead(), 832, 416);
    expect(dets).toHaveLength(1);
    expect(dets[0].box.x1).toBeCloseTo(56, 0);
    expect(dets[0].box.x2).toBeCloseTo(136, 0);
    expect(dets[0].box.y1).toBeCloseTo(36, 0);
  });

  it('anchors below the score threshold produce nothing', () => {
    const head: number[][] = Array.from({ length: 3598 }, () => new Array(37).fill(-10));
    expect(decodeDetectorOutput(head, 416, 416)).toHaveLength(0);
    expect(OFFLINE_DETECTOR_SCORE_THRESHOLD).toBe(0.3);
  });

  it('NMS suppresses same-class duplicates but keeps other classes', () => {
    const box = { x1: 10, y1: 10, x2: 110, y2: 110 };
    const overlap = { x1: 20, y1: 20, x2: 120, y2: 120 };
    const far = { x1: 200, y1: 200, x2: 300, y2: 300 };
    const dets: RawDetection[] = [
      { box, classIndex: 0, score: 0.9 },
      { box: overlap, classIndex: 0, score: 0.8 },
      { box: overlap, classIndex: 1, score: 0.7 },
      { box: far, classIndex: 0, score: 0.6 },
    ];
    const kept = applyNms(dets);
    expect(kept.map((d) => d.score)).toEqual([0.9, 0.7, 0.6]);
  });
});

describe('offline scan — draft building', () => {
  it('builds a draft from the exact DB entry at the standard serving', () => {
    const draft = buildOfflineDraft([cand('biryani', 0.92)]);
    expect(draft).not.toBeNull();
    const item = draft!.items[0];
    expect(item.name).toBe('Biryani');
    expect(item.estimatedGrams).toBe(250);
    const per100 = FOOD_DB['biryani'];
    expect(item.calories).toBe(Math.round(per100.calories * 2.5));
    expect(item.proteinG).toBe(Number((per100.proteinG * 2.5).toFixed(1)));
    // Totals are the recalculated sums, same shape as the server result.
    expect(draft!.totalCalories).toBe(item.calories);
    expect(draft!.totalProtein).toBe(item.proteinG);
    expect(draft!.mealName).toBe('Biryani');
    expect(draft!.confidence).toBe('high');
  });

  it('dal drafts as generic dal (1 katori), never a tadka variant', () => {
    const item = buildItemForCandidate(cand('dal', 0.8));
    expect(item).not.toBeNull();
    expect(item!.name).toBe('Dal');
    expect(item!.estimatedGrams).toBe(150);
    expect(item!.calories).toBe(Math.round(FOOD_DB['dal'].calories * 1.5));
  });

  it('an unresolved label NEVER drafts — no estimator fallback, no made-up macros', () => {
    // Rule change from the v1 map: the old estimator fallback (draft
    // via closest entry, flagged) is gone. Unmapped labels return
    // null here and route to choices, where the cloud scan is the
    // honest fallback.
    expect(buildItemForCandidate(cand('ziti', 0.66))).toBeNull();
    expect(buildOfflineDraft([cand('ziti', 0.66)])).toBeNull();
    expect(buildOfflineDraft([cand('dosa', 0.9), cand('ziti', 0.95)], 'ziti')).toBeNull();
  });

  it('honours an explicit choice over the top-1', () => {
    const draft = buildOfflineDraft(
      [cand('dosa', 0.5), cand('dhokla', 0.44)],
      'dhokla'
    );
    expect(draft!.items[0].name).toBe('Dhokla');
  });

  it('empty candidates produce no draft', () => {
    expect(buildOfflineDraft([])).toBeNull();
  });

  it('alternatives exclude the currently drafted label', () => {
    const all = [cand('dosa', 0.9), cand('dhokla', 0.4), cand('dal', 0.2)];
    expect(alternativesFor(all, 'dosa').map((c) => c.label)).toEqual(['dhokla', 'dal']);
  });

  it('confidence tiers follow the thresholds', () => {
    expect(confidenceTierForScore(0.9)).toBe('high');
    expect(confidenceTierForScore(0.5)).toBe('medium');
    expect(confidenceTierForScore(0.2)).toBe('low');
    expect(displayNameForLabel('pav bhaji')).toBe('Pav Bhaji');
  });
});

describe('offline scan — multi-item drafts from detections', () => {
  it('one item per qualifying detection, each with its own label and box', () => {
    const draft = buildDraftFromDetections([
      det('biryani', 0.9, { x1: 0.05, y1: 0.05, x2: 0.5, y2: 0.5 }, 'whole_dish'),
      det('dal', 0.8, { x1: 0.55, y1: 0.1, x2: 0.95, y2: 0.45 }, 'bowl_katori'),
    ]);
    expect(draft).not.toBeNull();
    expect(draft!.items).toHaveLength(2);
    expect(draft!.items[0].name).toBe('Biryani');
    expect(draft!.items[0].detectionBox).toEqual({ x1: 0.05, y1: 0.05, x2: 0.5, y2: 0.5 });
    expect(draft!.items[0].container).toBe('whole_dish');
    expect(draft!.items[1].name).toBe('Dal');
    expect(draft!.items[1].detectionBox).toEqual({ x1: 0.55, y1: 0.1, x2: 0.95, y2: 0.45 });
    expect(draft!.mealName).toBe('Biryani + Dal');
    expect(draft!.totalCalories).toBe(draft!.items[0].calories + draft!.items[1].calories);
  });

  it('unsure and unmapped detections contribute no item, never a fabricated one', () => {
    const draft = buildDraftFromDetections([
      det('biryani', 0.9),
      det('dal', 0.2), // below threshold
      det('ziti', 0.95), // unmapped
    ]);
    expect(draft).not.toBeNull();
    expect(draft!.items).toHaveLength(1);
    expect(draft!.items[0].name).toBe('Biryani');
  });

  it('no qualifying detection means no draft', () => {
    expect(buildDraftFromDetections([])).toBeNull();
    expect(buildDraftFromDetections([det('ziti', 0.95)])).toBeNull();
    expect(buildDraftFromDetections([det('dal', 0.1)])).toBeNull();
    expect(buildDraftFromDetections([{ box: { x1: 0, y1: 0, x2: 1, y2: 1 }, container: 'whole_dish', containerScore: 0.9, candidates: [] }])).toBeNull();
  });
});

describe('offline scan — routing', () => {
  it('confident + resolved top-1 auto-drafts', () => {
    expect(routeOfflineResult([cand('dosa', 0.9)])).toBe('draft');
    expect(routeOfflineResult([cand('dosa', OFFLINE_AUTO_DRAFT_THRESHOLD)])).toBe('draft');
  });

  it('below the threshold goes to choices', () => {
    expect(routeOfflineResult([cand('dosa', 0.34)])).toBe('choices');
    expect(routeOfflineResult([cand('dosa', 0.1)])).toBe('choices');
    expect(routeOfflineResult([])).toBe('choices');
  });

  it('a confident but unresolved top-1 still goes to choices (never auto-drafts)', () => {
    expect(routeOfflineResult([cand('ziti', 0.95)])).toBe('choices');
    expect(routeOfflineResult([cand('tiramisu', 0.99)])).toBe('choices');
  });
});

describe('offline scan — availability gate', () => {
  it('requires native + preference on + model available', () => {
    expect(shouldUseOfflineScan({ isNative: true, prefEnabled: true, modelAvailable: true })).toBe(true);
    expect(shouldUseOfflineScan({ isNative: false, prefEnabled: true, modelAvailable: true })).toBe(false);
    expect(shouldUseOfflineScan({ isNative: true, prefEnabled: false, modelAvailable: true })).toBe(false);
    expect(shouldUseOfflineScan({ isNative: true, prefEnabled: true, modelAvailable: false })).toBe(false);
  });

  it('web / non-native environments never report availability', async () => {
    // The test env is not a Capacitor native platform, so this must
    // resolve false without ever touching the plugin.
    await expect(isOfflineScanAvailable()).resolves.toBe(false);
  });
});
