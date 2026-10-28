/**
 * Offline (on-device) food scan — Android app only.
 *
 * Two bundled models run entirely on the phone via the local
 * OfflineScanPlugin: no network, no photo leaves the device.
 *   1. Detector v1 (NanoDet-Plus, 5 container classes) finds
 *      containers in the photo; each crop is then classified by
 *   2. Classifier v11 (619 classes, INT8).
 * The web layer only ever sees boxes + top-3 labels + scores; draft
 * building reuses the exact MealAnalysisResult shape the server-AI
 * scan produces, so the review UI, household units and the ghee/oil
 * prompt work unchanged.
 *
 * Model contracts (verified against the trained artifacts):
 *   classifier input  [1, 224, 224, 3] UINT8 raw NHWC pixels
 *            (scale 1.0 / zero-point 0 — the plugin feeds raw bytes)
 *   classifier output [1, 619] UINT8 logits → dequantize (scale
 *            0.0785653, zero-point 190) → softmax → top-3
 *   detector input  [1, 416, 416, 3] FLOAT32 NHWC, BGR, stretched
 *            resize, (pixel - mean) / std with mean [103.53, 116.28,
 *            123.675], std [57.375, 57.12, 58.395] (val pipeline in
 *            ascend-ml/detector_v1_model/config_det_v1.yml)
 *   detector output [1, 3598, 37] float32 RAW head output — decode +
 *            NMS happen in the plugin (see OfflineScanPlugin.java);
 *            the DECODE/NMS helpers below are pure-TypeScript mirrors
 *            of that Java logic, exported so unit tests pin the
 *            contract (anchor layout, DFL math, NMS semantics).
 *            The production path is the plugin, not these helpers.
 *
 * Bundling is INTERIM: the models + labels live in
 * android/app/src/main/assets/models/. The documented later step is
 * Play Asset Delivery so model updates don't ride app releases.
 *
 * Label honesty: the map below is EXACT (FOOD_DB key lookup, never
 * fuzzy search — fuzzy is how 'paneer' used to become palak paneer).
 * 200 of 619 labels resolve exactly. The other 419 have no honest DB
 * entry and are marked null here: they NEVER auto-draft (and never
 * draft at all — no estimator fallback with made-up macros). They
 * route to the choices step, where the label is shown with no
 * nutrition and the honest fallback is the cloud scan
 * ("Use AI scan instead"). Adding real DB entries for them is a data
 * task, not a mapping trick.
 */
import { registerPlugin } from '@capacitor/core';
import type { MealAnalysisResult, ScannedFoodItem } from './types';
import { FOOD_DB } from './macros';
import { recalculateMealResult } from './ai-scan-meal';
import { isNativeApp } from './app-settings';

// ── Plugin contract ──────────────────────────────────────────────────

export interface OfflineCandidate {
  /** Model label (lowercase, e.g. 'pav bhaji'). */
  label: string;
  /** Softmax probability 0..1. */
  score: number;
}

/** One detector hit: box fractions are of the original photo. */
export interface OfflineDetection {
  box: { x1: number; y1: number; x2: number; y2: number };
  /** Container class, e.g. 'bowl_katori'. */
  container: string;
  /** Detector sigmoid score 0..1. */
  containerScore: number;
  /** v11 top-3 for the crop. */
  candidates: OfflineCandidate[];
}

interface OfflineScanPlugin {
  available(): Promise<{
    available: boolean;
    labels: number;
    detectorLabels?: number;
    detector?: boolean;
  }>;
  classify(options: { data: string }): Promise<{ results: OfflineCandidate[] }>;
  detectAndClassify(options: {
    data: string;
  }): Promise<{ detections: OfflineDetection[] }>;
}

const OfflineScan = registerPlugin<OfflineScanPlugin>('OfflineScan');

// ── Model labels + DB mapping ────────────────────────────────────────

/** The v11 model's classes — mirrors assets labels.txt (generated). */
export const MODEL_LABELS = [
  'adhirasam',
  'adobo',
  'almond jelly',
  'aloo gobi',
  'aloo masala',
  'aloo methi',
  'aloo mutter',
  'aloo paratha',
  'aloo shimla mirch',
  'aloo tikki',
  'ambrosia',
  'amritsari kulcha',
  'anarsa',
  'anda curry',
  'appam',
  'apple pie',
  'apple turnover',
  'applesauce',
  'applesauce cake',
  'ariselu',
  'avial',
  'ayam bakar',
  'ayam goreng',
  'baati',
  'babi guling',
  'baby back ribs',
  'bacon and eggs',
  'bagel',
  'bak kut teh',
  'baked alaska',
  'baked salmon',
  'baklava',
  'ball shaped bun with pork',
  'balushahi',
  'banana chips',
  'bandar laddu',
  'barbecued red pork in sauce with rice',
  'barbecued spareribs',
  'basundi',
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
  'besan laddu',
  'bhatura',
  'bhindi masala',
  'bibimbap',
  'biryani',
  'blancmange',
  'blt sandwich',
  'boiled chicken and vegetables',
  'boiled egg',
  'boiled fish',
  'boned, sliced hainan style chicken with marinated rice',
  'boondi',
  'boondi laddu',
  'boston cream pie',
  'braised pork meat ball with napa cabbage',
  'bread pudding',
  'breakfast burrito',
  'brisket',
  'broiled eel bowl',
  'brownie',
  'bruschetta',
  'bubble and squeak',
  'bubur ayam',
  'buffalo wings',
  'burger',
  'burrito',
  'butter chicken',
  'butter naan',
  'cabbage roll',
  'caesar salad',
  'cannelloni',
  'cannoli',
  'caprese salad',
  'carbonnade flamande',
  'carrot cake',
  'casserole',
  'ceviche',
  'chaas',
  'chai',
  'chak hao kheer',
  'cham cham',
  'champon',
  'chana masala',
  'chapati',
  'charcoal boiled pork neck',
  'chawanmushi',
  'cheese plate',
  'cheesecake',
  'chhena kheeri',
  'chicken cordon bleu',
  'chicken curry',
  'chicken cutlet',
  'chicken kiev',
  'chicken marengo',
  'chicken nugget',
  'chicken pizza',
  'chicken provencale',
  'chicken quesadilla',
  'chicken rezala',
  'chicken rice',
  'chicken rice curry with coconut',
  'chicken tikka',
  'chicken tikka masala',
  'chicken wings',
  'chiffon cake',
  'chikki',
  'chili',
  'chilled noodle',
  'chinese pumpkin pie',
  'chinese soup',
  'chip butty',
  'chivda',
  'chocolate cake',
  'chocolate mousse',
  'chole bhature',
  'chop suey',
  'chow mein',
  'churma',
  'churros',
  'clam chowder',
  'clams',
  'clear soup',
  'club sandwich',
  'cockles',
  'coconut cake',
  'coconut chutney',
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
  'croissant',
  'croque madame',
  'croquette',
  'cruller',
  'crumb cake',
  'crumpet',
  'cupcake',
  'curd rice',
  'curry puff',
  'custard',
  'custard tart',
  'cutlet curry',
  'dabeli',
  'dak galbi',
  'dal',
  'dal baati churma',
  'dal khichdi',
  'dal makhani',
  'dal puri',
  'dal tadka',
  'deep fried chicken wing',
  'deviled eggs',
  'dharwad pedha',
  'dhokla',
  'dipping noodles',
  'dish consisting of stir fried potato, eggplant and green pepper',
  'dolmas',
  'donut',
  'doodhpak',
  'dosa',
  'double ka meetha',
  'dried fish',
  'dry curry',
  'dum aloo',
  'dumplings',
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
  'falooda',
  'farfalle',
  'fettuccine',
  'filet mignon',
  'fine white noodles',
  'fish and chips',
  'fish ball soup',
  'fish curry',
  'fish stick',
  'flan',
  'foie gras',
  'fondue',
  'french bread',
  'french fries',
  'french onion soup',
  'french toast',
  'fried calamari',
  'fried chicken',
  'fried egg',
  'fried fish',
  'fried mussel pancakes',
  'fried noodle',
  'fried pork in scoop',
  'fried rice',
  'fried shrimp',
  'frittata',
  'fritter',
  'frozen yogurt',
  'fruitcake',
  'gajar ka halwa',
  'galantine',
  'ganmodoki',
  'garlic bread',
  'garlic naan',
  'gavvalu',
  'ghevar',
  'ginger pork saute',
  'gingerbread',
  'glutinous oil rice',
  'glutinous rice balls',
  'gnocchi',
  'goya chanpuru',
  'gratin',
  'greek salad',
  'green chutney',
  'green curry',
  'green salad',
  'grilled cheese sandwich',
  'grilled eggplant',
  'grilled pacific saury',
  'grilled salmon',
  'grilled sandwich',
  'guacamole',
  'gujhia',
  'gulab jamun',
  'gulai',
  'gyoza',
  'gyro',
  'haggis',
  'ham and eggs',
  'ham cutlet',
  'ham sandwich',
  'hambarg steak',
  'hara bhara kabab',
  'haupia',
  'hot and sour soup',
  'hot and sour, fish and vegetable ragout',
  'hot dog',
  'hot pot',
  'hue beef rice vermicelli soup',
  'huevos rancheros',
  'hummus',
  'ice cream',
  'idiyappam',
  'idli',
  'imarti',
  'inarizushi',
  'jalebi',
  'jambalaya',
  'japanese tofu and vegetable chowder',
  'jerky',
  'jjigae',
  'kachori',
  'kadai paneer',
  'kadhi',
  'kajjikaya',
  'kaju katli',
  'kakinada khaja',
  'kalakand',
  'kamameshi',
  'karela bharta',
  'kathi roll',
  'kaya toast',
  'kebab',
  'kedgeree',
  'khakhra',
  'khao soi',
  'kheer',
  'kinpira style sauteed burdock',
  'knish',
  'kofta',
  'kulfi',
  'kung pao chicken',
  'kushikatsu',
  'laksa',
  'lamb kebabs',
  'lasagna',
  'lassi',
  'laulau',
  'ledikeni',
  'lemon fig jelly',
  'lightly roasted fish',
  'limpet',
  'linguine',
  'litti chokha',
  'lobster',
  'lobster bisque',
  'lobster roll sandwich',
  'lobster thermidor',
  'loco moco',
  'lumpia',
  'lutefisk',
  'lyangcha',
  'maach jhol',
  'macaron',
  'macaroni and cheese',
  'macaroni salad',
  'makki di roti sarson da saag',
  'malasada',
  'malpua',
  'mango pudding',
  'manicotti',
  'marble cake',
  'margherita pizza',
  'masala dosa',
  'masala papad',
  'matzo ball',
  'meat loaf',
  'meatball',
  'medu vada',
  'mie ayam',
  'mie goreng',
  'minced meat cutlet',
  'minced pork rice',
  'minestrone',
  'misal pav',
  'miso soup',
  'missi roti',
  'misti doi',
  'mixed rice',
  'modak',
  'momos',
  'moo goo gai pan',
  'moon cake',
  'moong dal halwa',
  'mostaccioli',
  'moussaka',
  'mozuku',
  'muffin',
  'murukku',
  'mushroom risotto',
  'mussel',
  'mutton curry',
  'mysore pak',
  'naan',
  'nachos',
  'namero',
  'nanbanzuke',
  'nasi campur',
  'nasi goreng',
  'nasi padang',
  'nasi uduk',
  'natto',
  'navratan korma',
  'neer dosa',
  'noodles with fish curry',
  'oatmeal',
  'oden',
  'okinawa soba',
  'okonomiyaki',
  'olan',
  'omelette',
  'omurice',
  'onion rings',
  'orzo',
  'oshiruko',
  'osso buco',
  'oxtail soup',
  'oyakodon',
  'oyster omelette',
  'oysters',
  'pad thai',
  'paella',
  'pakora',
  'palak paneer',
  'pancakes',
  'paneer',
  'paneer butter masala',
  'paneer masala',
  'paneer pizza',
  'pani puri',
  'paniyaram',
  'panna cotta',
  'papdi chaat',
  'parfait',
  'pate',
  'patrode',
  'pav bhaji',
  'pavlova',
  'peach melba',
  'peking duck',
  'penne',
  'pepper steak',
  'pepperoni pizza',
  'phirni',
  'pho',
  'pilaf',
  'pirogi',
  'pithe',
  'pizza',
  'pizza toast',
  'poached egg',
  'poha',
  'poi',
  'pongal',
  'poornalu',
  'pootharekulu',
  'popcorn',
  'pork belly',
  'pork chop',
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
  'puri bhaji',
  'puttu',
  'qubani ka meetha',
  'rabri',
  'raisin bread',
  'raita',
  'rajma chawal',
  'rajma curry',
  'ramen',
  'rare cheesecake',
  'rasgulla',
  'rasmalai',
  'rava dosa',
  'ravioli',
  'red velvet cake',
  'reuben',
  'rice',
  'rice ball',
  'rice crispy pork',
  'rice gratin',
  'rice gruel',
  'rice vermicelli',
  'rice with roast duck',
  'rigatoni',
  'risotto',
  'rissole',
  'roast chicken',
  'roast duck',
  'rock cake',
  'roll bread',
  'roulade',
  'rugulah',
  'sabudana khichdi',
  'sabudana vada',
  'salisbury steak',
  'salmon meuniere',
  'salt and pepper fried shrimp with shell',
  'sambar',
  'samosa',
  'samul',
  'sandesh',
  'sandwich',
  'sashimi',
  'sashimi bowl',
  'sauerbraten',
  'sauerkraut',
  'sausage',
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
  'seekh kebab',
  'set dosa',
  'sev puri',
  'shahi paneer',
  'shankarpali',
  'sheer korma',
  'sheera',
  'shirred egg',
  'shrikhand',
  'shrimp and grits',
  'shrimp patties',
  'shrimp with chill source',
  'simmered pork',
  'sirloin cutlet',
  'sloppy joe',
  'small steamed savory rice pancake',
  'soan papdi',
  'soba noodle',
  'sohan halwa',
  'solkadhi',
  'souffle',
  'sour prawn soup',
  'spaghetti',
  'spaghetti bolognese',
  'spaghetti carbonara',
  'spam musubi',
  'spicy chicken salad',
  'spicy chili flavored tofu',
  'sponge cake',
  'spring roll',
  'steak',
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
  'sushi',
  'sushi bowl',
  'sutar feni',
  'sweet and sour pork',
  'syllabub',
  'tacos',
  'tagliatelle',
  'taiyaki',
  'takoyaki',
  'tamale',
  'tamale pie',
  'tandoori chicken',
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
  'thoran',
  'three cup chicken',
  'thukpa',
  'tiramisu',
  'toad in the hole',
  'toast',
  'tomato chutney',
  'torte',
  'tortellini',
  'tortilla',
  'tostada',
  'trunip pudding',
  'tuna tartare',
  'twice cooked pork',
  'udon noodle',
  'unni appam',
  'upma',
  'upside down cake',
  'uttapam',
  'vada pav',
  'veal cordon bleu',
  'vegetable tempura',
  'vermicelli',
  'vermicelli noodles with snails',
  'victoria sandwich',
  'vol au vent',
  'waffles',
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
] as const;

export interface OfflineLabelMapping {
  /** Exact key into FOOD_DB (per-100g macros). Never fuzzy. */
  dbKey: string;
  /** Display name written onto the draft item. */
  displayName: string;
  /** Standard serving the draft starts at; the user edits in review. */
  defaultGrams: number;
}

/**
 * Label → food DB entry. Default grams: the documented household /
 * piece-weight servings for the original 15 dishes (biryani plate
 * 250 g, dal katori 150 g, dosa piece 80 g, … — carried over from
 * the v1 map), otherwise a plain 100 g (the DB is per-100g, and the
 * user adjusts in review). No per-dish serving was invented for the
 * 600+ new classes: 100 g is the honest neutral default.
 *
 * Unresolved labels (null) — the full list, generated:
 *  - adobo
 *  - almond jelly
 *  - ambrosia
 *  - apple pie
 *  - apple turnover
 *  - applesauce
 *  - applesauce cake
 *  - ayam bakar
 *  - ayam goreng
 *  - babi guling
 *  - baby back ribs
 *  - bacon and eggs
 *  - bak kut teh
 *  - baked alaska
 *  - baked salmon
 *  - baklava
 *  - ball shaped bun with pork
 *  - barbecued red pork in sauce with rice
 *  - barbecued spareribs
 *  - bean curd family style
 *  - beef bourguignon
 *  - beef bowl
 *  - beef carpaccio
 *  - beef curry
 *  - beef in oyster sauce
 *  - beef noodle
 *  - beef noodle soup
 *  - beef stroganoff
 *  - beef tartare
 *  - beef wellington
 *  - beet salad
 *  - beignet
 *  - blancmange
 *  - blt sandwich
 *  - boiled chicken and vegetables
 *  - boiled egg
 *  - boiled fish
 *  - boned, sliced hainan style chicken with marinated rice
 *  - boston cream pie
 *  - braised pork meat ball with napa cabbage
 *  - bread pudding
 *  - breakfast burrito
 *  - brisket
 *  - broiled eel bowl
 *  - bruschetta
 *  - bubble and squeak
 *  - bubur ayam
 *  - buffalo wings
 *  - cabbage roll
 *  - cannelloni
 *  - cannoli
 *  - caprese salad
 *  - carbonnade flamande
 *  - carrot cake
 *  - casserole
 *  - ceviche
 *  - cham cham
 *  - champon
 *  - charcoal boiled pork neck
 *  - chawanmushi
 *  - cheese plate
 *  - chicken cordon bleu
 *  - chicken cutlet
 *  - chicken kiev
 *  - chicken marengo
 *  - chicken nugget
 *  - chicken pizza
 *  - chicken provencale
 *  - chicken quesadilla
 *  - chicken rice
 *  - chicken rice curry with coconut
 *  - chiffon cake
 *  - chili
 *  - chilled noodle
 *  - chinese pumpkin pie
 *  - chinese soup
 *  - chip butty
 *  - chocolate cake
 *  - chocolate mousse
 *  - chop suey
 *  - chow mein
 *  - churros
 *  - clam chowder
 *  - clams
 *  - clear soup
 *  - cockles
 *  - coconut cake
 *  - coconut milk flavored crepes with shrimp and beef
 *  - coconut milk soup
 *  - coffee cake
 *  - cold tofu
 *  - compote
 *  - confit
 *  - coq au vin
 *  - coquilles saint jacques
 *  - cottage pie
 *  - couscous
 *  - crab
 *  - crab cakes
 *  - crayfish
 *  - cream puff
 *  - creme brulee
 *  - crepe
 *  - crispy noodles
 *  - croque madame
 *  - croquette
 *  - cruller
 *  - crumb cake
 *  - crumpet
 *  - curry puff
 *  - custard
 *  - custard tart
 *  - cutlet curry
 *  - dak galbi
 *  - dal khichdi
 *  - deep fried chicken wing
 *  - deviled eggs
 *  - dipping noodles
 *  - dish consisting of stir fried potato, eggplant and green pepper
 *  - dolmas
 *  - donut
 *  - dried fish
 *  - dry curry
 *  - eccles cake
 *  - edamame
 *  - eels on rice
 *  - egg roll
 *  - eggplant with garlic sauce
 *  - eggs benedict
 *  - eight treasure rice
 *  - enchilada
 *  - entrecote
 *  - escargots
 *  - falafel
 *  - farfalle
 *  - fettuccine
 *  - filet mignon
 *  - fine white noodles
 *  - fish ball soup
 *  - fish stick
 *  - flan
 *  - foie gras
 *  - fondue
 *  - french bread
 *  - french onion soup
 *  - french toast
 *  - fried calamari
 *  - fried egg
 *  - fried fish
 *  - fried mussel pancakes
 *  - fried noodle
 *  - fried pork in scoop
 *  - fried shrimp
 *  - frittata
 *  - fritter
 *  - frozen yogurt
 *  - fruitcake
 *  - gajar ka halwa
 *  - galantine
 *  - ganmodoki
 *  - ginger pork saute
 *  - gingerbread
 *  - glutinous oil rice
 *  - glutinous rice balls
 *  - gnocchi
 *  - goya chanpuru
 *  - gratin
 *  - green curry
 *  - green salad
 *  - grilled cheese sandwich
 *  - grilled eggplant
 *  - grilled pacific saury
 *  - grilled salmon
 *  - guacamole
 *  - gulai
 *  - gyoza
 *  - gyro
 *  - haggis
 *  - ham and eggs
 *  - ham cutlet
 *  - ham sandwich
 *  - hambarg steak
 *  - haupia
 *  - hot and sour, fish and vegetable ragout
 *  - hot pot
 *  - hue beef rice vermicelli soup
 *  - huevos rancheros
 *  - ice cream
 *  - inarizushi
 *  - jambalaya
 *  - japanese tofu and vegetable chowder
 *  - jerky
 *  - jjigae
 *  - kamameshi
 *  - kaya toast
 *  - kebab
 *  - kedgeree
 *  - khao soi
 *  - kinpira style sauteed burdock
 *  - knish
 *  - kung pao chicken
 *  - kushikatsu
 *  - laksa
 *  - lamb kebabs
 *  - laulau
 *  - lemon fig jelly
 *  - lightly roasted fish
 *  - limpet
 *  - linguine
 *  - lobster
 *  - lobster bisque
 *  - lobster roll sandwich
 *  - lobster thermidor
 *  - loco moco
 *  - lumpia
 *  - lutefisk
 *  - macaron
 *  - macaroni and cheese
 *  - macaroni salad
 *  - malasada
 *  - mango pudding
 *  - manicotti
 *  - marble cake
 *  - matzo ball
 *  - meat loaf
 *  - meatball
 *  - mie ayam
 *  - mie goreng
 *  - minced meat cutlet
 *  - minced pork rice
 *  - minestrone
 *  - mixed rice
 *  - moo goo gai pan
 *  - moon cake
 *  - mostaccioli
 *  - moussaka
 *  - mozuku
 *  - mushroom risotto
 *  - mussel
 *  - namero
 *  - nanbanzuke
 *  - nasi campur
 *  - nasi goreng
 *  - nasi padang
 *  - nasi uduk
 *  - natto
 *  - noodles with fish curry
 *  - oden
 *  - okinawa soba
 *  - okonomiyaki
 *  - omurice
 *  - orzo
 *  - oshiruko
 *  - osso buco
 *  - oxtail soup
 *  - oyakodon
 *  - oyster omelette
 *  - oysters
 *  - paella
 *  - paneer pizza
 *  - panna cotta
 *  - parfait
 *  - pate
 *  - pavlova
 *  - peach melba
 *  - peking duck
 *  - penne
 *  - pepper steak
 *  - pilaf
 *  - pirogi
 *  - pizza toast
 *  - poached egg
 *  - poi
 *  - pork belly
 *  - pork cutlet
 *  - pork cutlet on rice
 *  - pork fillet cutlet
 *  - pork loin cutlet
 *  - pork miso soup
 *  - pork satay
 *  - pork sticky noodles
 *  - pork with lemon
 *  - porridge
 *  - pot au feu
 *  - potage
 *  - potato salad
 *  - potpie
 *  - pound cake
 *  - poutine
 *  - prime rib
 *  - profiterole
 *  - pulled pork sandwich
 *  - raisin bread
 *  - rajma curry
 *  - rare cheesecake
 *  - ravioli
 *  - red velvet cake
 *  - reuben
 *  - rice ball
 *  - rice crispy pork
 *  - rice gratin
 *  - rice gruel
 *  - rice vermicelli
 *  - rice with roast duck
 *  - rigatoni
 *  - rissole
 *  - roast chicken
 *  - roast duck
 *  - rock cake
 *  - roll bread
 *  - roulade
 *  - rugulah
 *  - salisbury steak
 *  - salmon meuniere
 *  - salt and pepper fried shrimp with shell
 *  - samul
 *  - sandwich
 *  - sashimi
 *  - sashimi bowl
 *  - sauerbraten
 *  - sauerkraut
 *  - sausage roll
 *  - sauteed spinach
 *  - sauteed vegetables
 *  - savarin
 *  - scallop
 *  - scampi
 *  - schnitzel
 *  - scone
 *  - scotch egg
 *  - scrambled eggs
 *  - scrapple
 *  - seasoned beef with potatoes
 *  - seaweed salad
 *  - shankarpali
 *  - sheer korma
 *  - sheera
 *  - shirred egg
 *  - shrimp and grits
 *  - shrimp patties
 *  - shrimp with chill source
 *  - simmered pork
 *  - sirloin cutlet
 *  - sloppy joe
 *  - small steamed savory rice pancake
 *  - soba noodle
 *  - souffle
 *  - sour prawn soup
 *  - spaghetti carbonara
 *  - spam musubi
 *  - spicy chicken salad
 *  - spicy chili flavored tofu
 *  - sponge cake
 *  - spring roll
 *  - steamed meat dumpling
 *  - steamed rice roll
 *  - steamed spareribs
 *  - stew
 *  - stewed pork leg
 *  - stinky tofu
 *  - stir fried beef and peppers
 *  - stir fried mixed vegetables
 *  - strawberry shortcake
 *  - streusel
 *  - strudel
 *  - stuffed cabbage
 *  - stuffed peppers
 *  - stuffed tomato
 *  - succotash
 *  - sukiyaki
 *  - sushi bowl
 *  - sweet and sour pork
 *  - syllabub
 *  - tagliatelle
 *  - taiyaki
 *  - takoyaki
 *  - tamale
 *  - tamale pie
 *  - tanmen
 *  - tapenade
 *  - tempura
 *  - tempura bowl
 *  - tempura udon
 *  - tenderloin
 *  - tenshin noodle
 *  - teriyaki grilled fish
 *  - terrine
 *  - tetrazzini
 *  - thai papaya salad
 *  - thali
 *  - thinly sliced raw horsemeat
 *  - three cup chicken
 *  - tiramisu
 *  - toad in the hole
 *  - torte
 *  - tortellini
 *  - tostada
 *  - trunip pudding
 *  - tuna tartare
 *  - twice cooked pork
 *  - udon noodle
 *  - upside down cake
 *  - veal cordon bleu
 *  - vegetable tempura
 *  - vermicelli
 *  - vermicelli noodles with snails
 *  - victoria sandwich
 *  - vol au vent
 *  - welsh rarebit
 *  - winter melon soup
 *  - wonton
 *  - wonton soup
 *  - xiao long bao
 *  - yakitori
 *  - yellow curry
 *  - yudofu
 *  - zha jiang mian
 *  - ziti
 *  - zoni
 */
export const OFFLINE_LABEL_MAP: Record<string, OfflineLabelMapping | null> = {
  'adhirasam': { dbKey: 'adhirasam', displayName: 'Adhirasam', defaultGrams: 100 },
  'adobo': null, // no FOOD_DB entry — unresolved, never drafts
  'almond jelly': null, // no FOOD_DB entry — unresolved, never drafts
  'aloo gobi': { dbKey: 'aloo gobi', displayName: 'Aloo Gobi', defaultGrams: 100 },
  'aloo masala': { dbKey: 'aloo masala', displayName: 'Aloo Masala', defaultGrams: 100 },
  'aloo methi': { dbKey: 'aloo methi', displayName: 'Aloo Methi', defaultGrams: 100 },
  'aloo mutter': { dbKey: 'aloo mutter', displayName: 'Aloo Mutter', defaultGrams: 100 },
  'aloo paratha': { dbKey: 'aloo paratha', displayName: 'Aloo Paratha', defaultGrams: 100 },
  'aloo shimla mirch': { dbKey: 'aloo shimla mirch', displayName: 'Aloo Shimla Mirch', defaultGrams: 100 },
  'aloo tikki': { dbKey: 'aloo tikki', displayName: 'Aloo Tikki', defaultGrams: 100 },
  'ambrosia': null, // no FOOD_DB entry — unresolved, never drafts
  'amritsari kulcha': { dbKey: 'amritsari kulcha', displayName: 'Amritsari Kulcha', defaultGrams: 100 },
  'anarsa': { dbKey: 'anarsa', displayName: 'Anarsa', defaultGrams: 100 },
  'anda curry': { dbKey: 'anda curry', displayName: 'Anda Curry', defaultGrams: 100 },
  'appam': { dbKey: 'appam', displayName: 'Appam', defaultGrams: 100 },
  'apple pie': null, // no FOOD_DB entry — unresolved, never drafts
  'apple turnover': null, // no FOOD_DB entry — unresolved, never drafts
  'applesauce': null, // no FOOD_DB entry — unresolved, never drafts
  'applesauce cake': null, // no FOOD_DB entry — unresolved, never drafts
  'ariselu': { dbKey: 'ariselu', displayName: 'Ariselu', defaultGrams: 100 },
  'avial': { dbKey: 'avial', displayName: 'Avial', defaultGrams: 100 },
  'ayam bakar': null, // no FOOD_DB entry — unresolved, never drafts
  'ayam goreng': null, // no FOOD_DB entry — unresolved, never drafts
  'baati': { dbKey: 'baati', displayName: 'Baati', defaultGrams: 100 },
  'babi guling': null, // no FOOD_DB entry — unresolved, never drafts
  'baby back ribs': null, // no FOOD_DB entry — unresolved, never drafts
  'bacon and eggs': null, // no FOOD_DB entry — unresolved, never drafts
  'bagel': { dbKey: 'bagel', displayName: 'Bagel', defaultGrams: 100 },
  'bak kut teh': null, // no FOOD_DB entry — unresolved, never drafts
  'baked alaska': null, // no FOOD_DB entry — unresolved, never drafts
  'baked salmon': null, // no FOOD_DB entry — unresolved, never drafts
  'baklava': null, // no FOOD_DB entry — unresolved, never drafts
  'ball shaped bun with pork': null, // no FOOD_DB entry — unresolved, never drafts
  'balushahi': { dbKey: 'balushahi', displayName: 'Balushahi', defaultGrams: 100 },
  'banana chips': { dbKey: 'banana chips', displayName: 'Banana Chips', defaultGrams: 100 },
  'bandar laddu': { dbKey: 'bandar laddu', displayName: 'Bandar Laddu', defaultGrams: 100 },
  'barbecued red pork in sauce with rice': null, // no FOOD_DB entry — unresolved, never drafts
  'barbecued spareribs': null, // no FOOD_DB entry — unresolved, never drafts
  'basundi': { dbKey: 'basundi', displayName: 'Basundi', defaultGrams: 100 },
  'bean curd family style': null, // no FOOD_DB entry — unresolved, never drafts
  'beef bourguignon': null, // no FOOD_DB entry — unresolved, never drafts
  'beef bowl': null, // no FOOD_DB entry — unresolved, never drafts
  'beef carpaccio': null, // no FOOD_DB entry — unresolved, never drafts
  'beef curry': null, // no FOOD_DB entry — unresolved, never drafts
  'beef in oyster sauce': null, // no FOOD_DB entry — unresolved, never drafts
  'beef noodle': null, // no FOOD_DB entry — unresolved, never drafts
  'beef noodle soup': null, // no FOOD_DB entry — unresolved, never drafts
  'beef stroganoff': null, // no FOOD_DB entry — unresolved, never drafts
  'beef tartare': null, // no FOOD_DB entry — unresolved, never drafts
  'beef wellington': null, // no FOOD_DB entry — unresolved, never drafts
  'beet salad': null, // no FOOD_DB entry — unresolved, never drafts
  'beignet': null, // no FOOD_DB entry — unresolved, never drafts
  'besan laddu': { dbKey: 'besan laddu', displayName: 'Besan Laddu', defaultGrams: 100 },
  'bhatura': { dbKey: 'bhatura', displayName: 'Bhatura', defaultGrams: 100 },
  'bhindi masala': { dbKey: 'bhindi masala', displayName: 'Bhindi Masala', defaultGrams: 100 },
  'bibimbap': { dbKey: 'bibimbap', displayName: 'Bibimbap', defaultGrams: 100 },
  'biryani': { dbKey: 'biryani', displayName: 'Biryani', defaultGrams: 250 },
  'blancmange': null, // no FOOD_DB entry — unresolved, never drafts
  'blt sandwich': null, // no FOOD_DB entry — unresolved, never drafts
  'boiled chicken and vegetables': null, // no FOOD_DB entry — unresolved, never drafts
  'boiled egg': null, // no FOOD_DB entry — unresolved, never drafts
  'boiled fish': null, // no FOOD_DB entry — unresolved, never drafts
  'boned, sliced hainan style chicken with marinated rice': null, // no FOOD_DB entry — unresolved, never drafts
  'boondi': { dbKey: 'boondi', displayName: 'Boondi', defaultGrams: 100 },
  'boondi laddu': { dbKey: 'boondi laddu', displayName: 'Boondi Laddu', defaultGrams: 100 },
  'boston cream pie': null, // no FOOD_DB entry — unresolved, never drafts
  'braised pork meat ball with napa cabbage': null, // no FOOD_DB entry — unresolved, never drafts
  'bread pudding': null, // no FOOD_DB entry — unresolved, never drafts
  'breakfast burrito': null, // no FOOD_DB entry — unresolved, never drafts
  'brisket': null, // no FOOD_DB entry — unresolved, never drafts
  'broiled eel bowl': null, // no FOOD_DB entry — unresolved, never drafts
  'brownie': { dbKey: 'brownie', displayName: 'Brownie', defaultGrams: 100 },
  'bruschetta': null, // no FOOD_DB entry — unresolved, never drafts
  'bubble and squeak': null, // no FOOD_DB entry — unresolved, never drafts
  'bubur ayam': null, // no FOOD_DB entry — unresolved, never drafts
  'buffalo wings': null, // no FOOD_DB entry — unresolved, never drafts
  'burger': { dbKey: 'burger', displayName: 'Burger', defaultGrams: 100 },
  'burrito': { dbKey: 'burrito', displayName: 'Burrito', defaultGrams: 100 },
  'butter chicken': { dbKey: 'butter chicken', displayName: 'Butter Chicken', defaultGrams: 100 },
  'butter naan': { dbKey: 'butter naan', displayName: 'Butter Naan', defaultGrams: 100 },
  'cabbage roll': null, // no FOOD_DB entry — unresolved, never drafts
  'caesar salad': { dbKey: 'caesar salad', displayName: 'Caesar Salad', defaultGrams: 100 },
  'cannelloni': null, // no FOOD_DB entry — unresolved, never drafts
  'cannoli': null, // no FOOD_DB entry — unresolved, never drafts
  'caprese salad': null, // no FOOD_DB entry — unresolved, never drafts
  'carbonnade flamande': null, // no FOOD_DB entry — unresolved, never drafts
  'carrot cake': null, // no FOOD_DB entry — unresolved, never drafts
  'casserole': null, // no FOOD_DB entry — unresolved, never drafts
  'ceviche': null, // no FOOD_DB entry — unresolved, never drafts
  'chaas': { dbKey: 'chaas', displayName: 'Chaas', defaultGrams: 100 },
  'chai': { dbKey: 'chai', displayName: 'Chai', defaultGrams: 100 },
  'chak hao kheer': { dbKey: 'chak hao kheer', displayName: 'Chak Hao Kheer', defaultGrams: 100 },
  'cham cham': null, // no FOOD_DB entry — unresolved, never drafts
  'champon': null, // no FOOD_DB entry — unresolved, never drafts
  'chana masala': { dbKey: 'chana masala', displayName: 'Chana Masala', defaultGrams: 100 },
  'chapati': { dbKey: 'chapati', displayName: 'Chapati', defaultGrams: 100 },
  'charcoal boiled pork neck': null, // no FOOD_DB entry — unresolved, never drafts
  'chawanmushi': null, // no FOOD_DB entry — unresolved, never drafts
  'cheese plate': null, // no FOOD_DB entry — unresolved, never drafts
  'cheesecake': { dbKey: 'cheesecake', displayName: 'Cheesecake', defaultGrams: 100 },
  'chhena kheeri': { dbKey: 'chhena kheeri', displayName: 'Chhena Kheeri', defaultGrams: 100 },
  'chicken cordon bleu': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken curry': { dbKey: 'chicken curry', displayName: 'Chicken Curry', defaultGrams: 100 },
  'chicken cutlet': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken kiev': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken marengo': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken nugget': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken pizza': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken provencale': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken quesadilla': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken rezala': { dbKey: 'chicken rezala', displayName: 'Chicken Rezala', defaultGrams: 100 },
  'chicken rice': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken rice curry with coconut': null, // no FOOD_DB entry — unresolved, never drafts
  'chicken tikka': { dbKey: 'chicken tikka', displayName: 'Chicken Tikka', defaultGrams: 100 },
  'chicken tikka masala': { dbKey: 'chicken tikka masala', displayName: 'Chicken Tikka Masala', defaultGrams: 100 },
  'chicken wings': { dbKey: 'chicken wings', displayName: 'Chicken Wings', defaultGrams: 100 },
  'chiffon cake': null, // no FOOD_DB entry — unresolved, never drafts
  'chikki': { dbKey: 'chikki', displayName: 'Chikki', defaultGrams: 100 },
  'chili': null, // no FOOD_DB entry — unresolved, never drafts
  'chilled noodle': null, // no FOOD_DB entry — unresolved, never drafts
  'chinese pumpkin pie': null, // no FOOD_DB entry — unresolved, never drafts
  'chinese soup': null, // no FOOD_DB entry — unresolved, never drafts
  'chip butty': null, // no FOOD_DB entry — unresolved, never drafts
  'chivda': { dbKey: 'chivda', displayName: 'Chivda', defaultGrams: 100 },
  'chocolate cake': null, // no FOOD_DB entry — unresolved, never drafts
  'chocolate mousse': null, // no FOOD_DB entry — unresolved, never drafts
  'chole bhature': { dbKey: 'chole bhature', displayName: 'Chole Bhature', defaultGrams: 350 },
  'chop suey': null, // no FOOD_DB entry — unresolved, never drafts
  'chow mein': null, // no FOOD_DB entry — unresolved, never drafts
  'churma': { dbKey: 'churma', displayName: 'Churma', defaultGrams: 100 },
  'churros': null, // no FOOD_DB entry — unresolved, never drafts
  'clam chowder': null, // no FOOD_DB entry — unresolved, never drafts
  'clams': null, // no FOOD_DB entry — unresolved, never drafts
  'clear soup': null, // no FOOD_DB entry — unresolved, never drafts
  'club sandwich': { dbKey: 'club sandwich', displayName: 'Club Sandwich', defaultGrams: 100 },
  'cockles': null, // no FOOD_DB entry — unresolved, never drafts
  'coconut cake': null, // no FOOD_DB entry — unresolved, never drafts
  'coconut chutney': { dbKey: 'coconut chutney', displayName: 'Coconut Chutney', defaultGrams: 100 },
  'coconut milk flavored crepes with shrimp and beef': null, // no FOOD_DB entry — unresolved, never drafts
  'coconut milk soup': null, // no FOOD_DB entry — unresolved, never drafts
  'coffee cake': null, // no FOOD_DB entry — unresolved, never drafts
  'cold tofu': null, // no FOOD_DB entry — unresolved, never drafts
  'compote': null, // no FOOD_DB entry — unresolved, never drafts
  'confit': null, // no FOOD_DB entry — unresolved, never drafts
  'coq au vin': null, // no FOOD_DB entry — unresolved, never drafts
  'coquilles saint jacques': null, // no FOOD_DB entry — unresolved, never drafts
  'cottage pie': null, // no FOOD_DB entry — unresolved, never drafts
  'couscous': null, // no FOOD_DB entry — unresolved, never drafts
  'crab': null, // no FOOD_DB entry — unresolved, never drafts
  'crab cakes': null, // no FOOD_DB entry — unresolved, never drafts
  'crayfish': null, // no FOOD_DB entry — unresolved, never drafts
  'cream puff': null, // no FOOD_DB entry — unresolved, never drafts
  'creme brulee': null, // no FOOD_DB entry — unresolved, never drafts
  'crepe': null, // no FOOD_DB entry — unresolved, never drafts
  'crispy noodles': null, // no FOOD_DB entry — unresolved, never drafts
  'croissant': { dbKey: 'croissant', displayName: 'Croissant', defaultGrams: 100 },
  'croque madame': null, // no FOOD_DB entry — unresolved, never drafts
  'croquette': null, // no FOOD_DB entry — unresolved, never drafts
  'cruller': null, // no FOOD_DB entry — unresolved, never drafts
  'crumb cake': null, // no FOOD_DB entry — unresolved, never drafts
  'crumpet': null, // no FOOD_DB entry — unresolved, never drafts
  'cupcake': { dbKey: 'cupcake', displayName: 'Cupcake', defaultGrams: 100 },
  'curd rice': { dbKey: 'curd rice', displayName: 'Curd Rice', defaultGrams: 100 },
  'curry puff': null, // no FOOD_DB entry — unresolved, never drafts
  'custard': null, // no FOOD_DB entry — unresolved, never drafts
  'custard tart': null, // no FOOD_DB entry — unresolved, never drafts
  'cutlet curry': null, // no FOOD_DB entry — unresolved, never drafts
  'dabeli': { dbKey: 'dabeli', displayName: 'Dabeli', defaultGrams: 120 },
  'dak galbi': null, // no FOOD_DB entry — unresolved, never drafts
  'dal': { dbKey: 'dal', displayName: 'Dal', defaultGrams: 150 },
  'dal baati churma': { dbKey: 'dal baati churma', displayName: 'Dal Baati Churma', defaultGrams: 100 },
  'dal khichdi': null, // no FOOD_DB entry — unresolved, never drafts
  'dal makhani': { dbKey: 'dal makhani', displayName: 'Dal Makhani', defaultGrams: 100 },
  'dal puri': { dbKey: 'dal puri', displayName: 'Dal Puri', defaultGrams: 100 },
  'dal tadka': { dbKey: 'dal tadka', displayName: 'Dal Tadka', defaultGrams: 100 },
  'deep fried chicken wing': null, // no FOOD_DB entry — unresolved, never drafts
  'deviled eggs': null, // no FOOD_DB entry — unresolved, never drafts
  'dharwad pedha': { dbKey: 'dharwad pedha', displayName: 'Dharwad Pedha', defaultGrams: 100 },
  'dhokla': { dbKey: 'dhokla', displayName: 'Dhokla', defaultGrams: 120 },
  'dipping noodles': null, // no FOOD_DB entry — unresolved, never drafts
  'dish consisting of stir fried potato, eggplant and green pepper': null, // no FOOD_DB entry — unresolved, never drafts
  'dolmas': null, // no FOOD_DB entry — unresolved, never drafts
  'donut': null, // no FOOD_DB entry — unresolved, never drafts
  'doodhpak': { dbKey: 'doodhpak', displayName: 'Doodhpak', defaultGrams: 100 },
  'dosa': { dbKey: 'dosa', displayName: 'Dosa', defaultGrams: 80 },
  'double ka meetha': { dbKey: 'double ka meetha', displayName: 'Double Ka Meetha', defaultGrams: 100 },
  'dried fish': null, // no FOOD_DB entry — unresolved, never drafts
  'dry curry': null, // no FOOD_DB entry — unresolved, never drafts
  'dum aloo': { dbKey: 'dum aloo', displayName: 'Dum Aloo', defaultGrams: 100 },
  'dumplings': { dbKey: 'dumplings', displayName: 'Dumplings', defaultGrams: 100 },
  'eccles cake': null, // no FOOD_DB entry — unresolved, never drafts
  'edamame': null, // no FOOD_DB entry — unresolved, never drafts
  'eels on rice': null, // no FOOD_DB entry — unresolved, never drafts
  'egg roll': null, // no FOOD_DB entry — unresolved, never drafts
  'eggplant with garlic sauce': null, // no FOOD_DB entry — unresolved, never drafts
  'eggs benedict': null, // no FOOD_DB entry — unresolved, never drafts
  'eight treasure rice': null, // no FOOD_DB entry — unresolved, never drafts
  'enchilada': null, // no FOOD_DB entry — unresolved, never drafts
  'entrecote': null, // no FOOD_DB entry — unresolved, never drafts
  'escargots': null, // no FOOD_DB entry — unresolved, never drafts
  'falafel': null, // no FOOD_DB entry — unresolved, never drafts
  'falooda': { dbKey: 'falooda', displayName: 'Falooda', defaultGrams: 100 },
  'farfalle': null, // no FOOD_DB entry — unresolved, never drafts
  'fettuccine': null, // no FOOD_DB entry — unresolved, never drafts
  'filet mignon': null, // no FOOD_DB entry — unresolved, never drafts
  'fine white noodles': null, // no FOOD_DB entry — unresolved, never drafts
  'fish and chips': { dbKey: 'fish and chips', displayName: 'Fish And Chips', defaultGrams: 100 },
  'fish ball soup': null, // no FOOD_DB entry — unresolved, never drafts
  'fish curry': { dbKey: 'fish curry', displayName: 'Fish Curry', defaultGrams: 100 },
  'fish stick': null, // no FOOD_DB entry — unresolved, never drafts
  'flan': null, // no FOOD_DB entry — unresolved, never drafts
  'foie gras': null, // no FOOD_DB entry — unresolved, never drafts
  'fondue': null, // no FOOD_DB entry — unresolved, never drafts
  'french bread': null, // no FOOD_DB entry — unresolved, never drafts
  'french fries': { dbKey: 'french fries', displayName: 'French Fries', defaultGrams: 100 },
  'french onion soup': null, // no FOOD_DB entry — unresolved, never drafts
  'french toast': null, // no FOOD_DB entry — unresolved, never drafts
  'fried calamari': null, // no FOOD_DB entry — unresolved, never drafts
  'fried chicken': { dbKey: 'fried chicken', displayName: 'Fried Chicken', defaultGrams: 100 },
  'fried egg': null, // no FOOD_DB entry — unresolved, never drafts
  'fried fish': null, // no FOOD_DB entry — unresolved, never drafts
  'fried mussel pancakes': null, // no FOOD_DB entry — unresolved, never drafts
  'fried noodle': null, // no FOOD_DB entry — unresolved, never drafts
  'fried pork in scoop': null, // no FOOD_DB entry — unresolved, never drafts
  'fried rice': { dbKey: 'fried rice', displayName: 'Fried Rice', defaultGrams: 100 },
  'fried shrimp': null, // no FOOD_DB entry — unresolved, never drafts
  'frittata': null, // no FOOD_DB entry — unresolved, never drafts
  'fritter': null, // no FOOD_DB entry — unresolved, never drafts
  'frozen yogurt': null, // no FOOD_DB entry — unresolved, never drafts
  'fruitcake': null, // no FOOD_DB entry — unresolved, never drafts
  'gajar ka halwa': null, // no FOOD_DB entry — unresolved, never drafts
  'galantine': null, // no FOOD_DB entry — unresolved, never drafts
  'ganmodoki': null, // no FOOD_DB entry — unresolved, never drafts
  'garlic bread': { dbKey: 'garlic bread', displayName: 'Garlic Bread', defaultGrams: 100 },
  'garlic naan': { dbKey: 'garlic naan', displayName: 'Garlic Naan', defaultGrams: 100 },
  'gavvalu': { dbKey: 'gavvalu', displayName: 'Gavvalu', defaultGrams: 100 },
  'ghevar': { dbKey: 'ghevar', displayName: 'Ghevar', defaultGrams: 100 },
  'ginger pork saute': null, // no FOOD_DB entry — unresolved, never drafts
  'gingerbread': null, // no FOOD_DB entry — unresolved, never drafts
  'glutinous oil rice': null, // no FOOD_DB entry — unresolved, never drafts
  'glutinous rice balls': null, // no FOOD_DB entry — unresolved, never drafts
  'gnocchi': null, // no FOOD_DB entry — unresolved, never drafts
  'goya chanpuru': null, // no FOOD_DB entry — unresolved, never drafts
  'gratin': null, // no FOOD_DB entry — unresolved, never drafts
  'greek salad': { dbKey: 'greek salad', displayName: 'Greek Salad', defaultGrams: 100 },
  'green chutney': { dbKey: 'green chutney', displayName: 'Green Chutney', defaultGrams: 100 },
  'green curry': null, // no FOOD_DB entry — unresolved, never drafts
  'green salad': null, // no FOOD_DB entry — unresolved, never drafts
  'grilled cheese sandwich': null, // no FOOD_DB entry — unresolved, never drafts
  'grilled eggplant': null, // no FOOD_DB entry — unresolved, never drafts
  'grilled pacific saury': null, // no FOOD_DB entry — unresolved, never drafts
  'grilled salmon': null, // no FOOD_DB entry — unresolved, never drafts
  'grilled sandwich': { dbKey: 'grilled sandwich', displayName: 'Grilled Sandwich', defaultGrams: 100 },
  'guacamole': null, // no FOOD_DB entry — unresolved, never drafts
  'gujhia': { dbKey: 'gujhia', displayName: 'Gujhia', defaultGrams: 100 },
  'gulab jamun': { dbKey: 'gulab jamun', displayName: 'Gulab Jamun', defaultGrams: 100 },
  'gulai': null, // no FOOD_DB entry — unresolved, never drafts
  'gyoza': null, // no FOOD_DB entry — unresolved, never drafts
  'gyro': null, // no FOOD_DB entry — unresolved, never drafts
  'haggis': null, // no FOOD_DB entry — unresolved, never drafts
  'ham and eggs': null, // no FOOD_DB entry — unresolved, never drafts
  'ham cutlet': null, // no FOOD_DB entry — unresolved, never drafts
  'ham sandwich': null, // no FOOD_DB entry — unresolved, never drafts
  'hambarg steak': null, // no FOOD_DB entry — unresolved, never drafts
  'hara bhara kabab': { dbKey: 'hara bhara kabab', displayName: 'Hara Bhara Kabab', defaultGrams: 100 },
  'haupia': null, // no FOOD_DB entry — unresolved, never drafts
  'hot and sour soup': { dbKey: 'hot and sour soup', displayName: 'Hot And Sour Soup', defaultGrams: 100 },
  'hot and sour, fish and vegetable ragout': null, // no FOOD_DB entry — unresolved, never drafts
  'hot dog': { dbKey: 'hot dog', displayName: 'Hot Dog', defaultGrams: 100 },
  'hot pot': null, // no FOOD_DB entry — unresolved, never drafts
  'hue beef rice vermicelli soup': null, // no FOOD_DB entry — unresolved, never drafts
  'huevos rancheros': null, // no FOOD_DB entry — unresolved, never drafts
  'hummus': { dbKey: 'hummus', displayName: 'Hummus', defaultGrams: 100 },
  'ice cream': null, // no FOOD_DB entry — unresolved, never drafts
  'idiyappam': { dbKey: 'idiyappam', displayName: 'Idiyappam', defaultGrams: 100 },
  'idli': { dbKey: 'idli', displayName: 'Idli', defaultGrams: 100 },
  'imarti': { dbKey: 'imarti', displayName: 'Imarti', defaultGrams: 100 },
  'inarizushi': null, // no FOOD_DB entry — unresolved, never drafts
  'jalebi': { dbKey: 'jalebi', displayName: 'Jalebi', defaultGrams: 100 },
  'jambalaya': null, // no FOOD_DB entry — unresolved, never drafts
  'japanese tofu and vegetable chowder': null, // no FOOD_DB entry — unresolved, never drafts
  'jerky': null, // no FOOD_DB entry — unresolved, never drafts
  'jjigae': null, // no FOOD_DB entry — unresolved, never drafts
  'kachori': { dbKey: 'kachori', displayName: 'Kachori', defaultGrams: 100 },
  'kadai paneer': { dbKey: 'kadai paneer', displayName: 'Kadai Paneer', defaultGrams: 100 },
  'kadhi': { dbKey: 'kadhi', displayName: 'Kadhi', defaultGrams: 100 },
  'kajjikaya': { dbKey: 'kajjikaya', displayName: 'Kajjikaya', defaultGrams: 100 },
  'kaju katli': { dbKey: 'kaju katli', displayName: 'Kaju Katli', defaultGrams: 100 },
  'kakinada khaja': { dbKey: 'kakinada khaja', displayName: 'Kakinada Khaja', defaultGrams: 100 },
  'kalakand': { dbKey: 'kalakand', displayName: 'Kalakand', defaultGrams: 100 },
  'kamameshi': null, // no FOOD_DB entry — unresolved, never drafts
  'karela bharta': { dbKey: 'karela bharta', displayName: 'Karela Bharta', defaultGrams: 100 },
  'kathi roll': { dbKey: 'kathi roll', displayName: 'Kathi Roll', defaultGrams: 100 },
  'kaya toast': null, // no FOOD_DB entry — unresolved, never drafts
  'kebab': null, // no FOOD_DB entry — unresolved, never drafts
  'kedgeree': null, // no FOOD_DB entry — unresolved, never drafts
  'khakhra': { dbKey: 'khakhra', displayName: 'Khakhra', defaultGrams: 100 },
  'khao soi': null, // no FOOD_DB entry — unresolved, never drafts
  'kheer': { dbKey: 'kheer', displayName: 'Kheer', defaultGrams: 100 },
  'kinpira style sauteed burdock': null, // no FOOD_DB entry — unresolved, never drafts
  'knish': null, // no FOOD_DB entry — unresolved, never drafts
  'kofta': { dbKey: 'kofta', displayName: 'Kofta', defaultGrams: 100 },
  'kulfi': { dbKey: 'kulfi', displayName: 'Kulfi', defaultGrams: 100 },
  'kung pao chicken': null, // no FOOD_DB entry — unresolved, never drafts
  'kushikatsu': null, // no FOOD_DB entry — unresolved, never drafts
  'laksa': null, // no FOOD_DB entry — unresolved, never drafts
  'lamb kebabs': null, // no FOOD_DB entry — unresolved, never drafts
  'lasagna': { dbKey: 'lasagna', displayName: 'Lasagna', defaultGrams: 100 },
  'lassi': { dbKey: 'lassi', displayName: 'Lassi', defaultGrams: 100 },
  'laulau': null, // no FOOD_DB entry — unresolved, never drafts
  'ledikeni': { dbKey: 'ledikeni', displayName: 'Ledikeni', defaultGrams: 100 },
  'lemon fig jelly': null, // no FOOD_DB entry — unresolved, never drafts
  'lightly roasted fish': null, // no FOOD_DB entry — unresolved, never drafts
  'limpet': null, // no FOOD_DB entry — unresolved, never drafts
  'linguine': null, // no FOOD_DB entry — unresolved, never drafts
  'litti chokha': { dbKey: 'litti chokha', displayName: 'Litti Chokha', defaultGrams: 100 },
  'lobster': null, // no FOOD_DB entry — unresolved, never drafts
  'lobster bisque': null, // no FOOD_DB entry — unresolved, never drafts
  'lobster roll sandwich': null, // no FOOD_DB entry — unresolved, never drafts
  'lobster thermidor': null, // no FOOD_DB entry — unresolved, never drafts
  'loco moco': null, // no FOOD_DB entry — unresolved, never drafts
  'lumpia': null, // no FOOD_DB entry — unresolved, never drafts
  'lutefisk': null, // no FOOD_DB entry — unresolved, never drafts
  'lyangcha': { dbKey: 'lyangcha', displayName: 'Lyangcha', defaultGrams: 100 },
  'maach jhol': { dbKey: 'maach jhol', displayName: 'Maach Jhol', defaultGrams: 100 },
  'macaron': null, // no FOOD_DB entry — unresolved, never drafts
  'macaroni and cheese': null, // no FOOD_DB entry — unresolved, never drafts
  'macaroni salad': null, // no FOOD_DB entry — unresolved, never drafts
  'makki di roti sarson da saag': { dbKey: 'makki di roti sarson da saag', displayName: 'Makki Di Roti Sarson Da Saag', defaultGrams: 100 },
  'malasada': null, // no FOOD_DB entry — unresolved, never drafts
  'malpua': { dbKey: 'malpua', displayName: 'Malpua', defaultGrams: 100 },
  'mango pudding': null, // no FOOD_DB entry — unresolved, never drafts
  'manicotti': null, // no FOOD_DB entry — unresolved, never drafts
  'marble cake': null, // no FOOD_DB entry — unresolved, never drafts
  'margherita pizza': { dbKey: 'margherita pizza', displayName: 'Margherita Pizza', defaultGrams: 100 },
  'masala dosa': { dbKey: 'masala dosa', displayName: 'Masala Dosa', defaultGrams: 100 },
  'masala papad': { dbKey: 'masala papad', displayName: 'Masala Papad', defaultGrams: 100 },
  'matzo ball': null, // no FOOD_DB entry — unresolved, never drafts
  'meat loaf': null, // no FOOD_DB entry — unresolved, never drafts
  'meatball': null, // no FOOD_DB entry — unresolved, never drafts
  'medu vada': { dbKey: 'medu vada', displayName: 'Medu Vada', defaultGrams: 100 },
  'mie ayam': null, // no FOOD_DB entry — unresolved, never drafts
  'mie goreng': null, // no FOOD_DB entry — unresolved, never drafts
  'minced meat cutlet': null, // no FOOD_DB entry — unresolved, never drafts
  'minced pork rice': null, // no FOOD_DB entry — unresolved, never drafts
  'minestrone': null, // no FOOD_DB entry — unresolved, never drafts
  'misal pav': { dbKey: 'misal pav', displayName: 'Misal Pav', defaultGrams: 100 },
  'miso soup': { dbKey: 'miso soup', displayName: 'Miso Soup', defaultGrams: 100 },
  'missi roti': { dbKey: 'missi roti', displayName: 'Missi Roti', defaultGrams: 100 },
  'misti doi': { dbKey: 'misti doi', displayName: 'Misti Doi', defaultGrams: 100 },
  'mixed rice': null, // no FOOD_DB entry — unresolved, never drafts
  'modak': { dbKey: 'modak', displayName: 'Modak', defaultGrams: 100 },
  'momos': { dbKey: 'momos', displayName: 'Momos', defaultGrams: 100 },
  'moo goo gai pan': null, // no FOOD_DB entry — unresolved, never drafts
  'moon cake': null, // no FOOD_DB entry — unresolved, never drafts
  'moong dal halwa': { dbKey: 'moong dal halwa', displayName: 'Moong Dal Halwa', defaultGrams: 100 },
  'mostaccioli': null, // no FOOD_DB entry — unresolved, never drafts
  'moussaka': null, // no FOOD_DB entry — unresolved, never drafts
  'mozuku': null, // no FOOD_DB entry — unresolved, never drafts
  'muffin': { dbKey: 'muffin', displayName: 'Muffin', defaultGrams: 100 },
  'murukku': { dbKey: 'murukku', displayName: 'Murukku', defaultGrams: 100 },
  'mushroom risotto': null, // no FOOD_DB entry — unresolved, never drafts
  'mussel': null, // no FOOD_DB entry — unresolved, never drafts
  'mutton curry': { dbKey: 'mutton curry', displayName: 'Mutton Curry', defaultGrams: 100 },
  'mysore pak': { dbKey: 'mysore pak', displayName: 'Mysore Pak', defaultGrams: 100 },
  'naan': { dbKey: 'naan', displayName: 'Naan', defaultGrams: 90 },
  'nachos': { dbKey: 'nachos', displayName: 'Nachos', defaultGrams: 100 },
  'namero': null, // no FOOD_DB entry — unresolved, never drafts
  'nanbanzuke': null, // no FOOD_DB entry — unresolved, never drafts
  'nasi campur': null, // no FOOD_DB entry — unresolved, never drafts
  'nasi goreng': null, // no FOOD_DB entry — unresolved, never drafts
  'nasi padang': null, // no FOOD_DB entry — unresolved, never drafts
  'nasi uduk': null, // no FOOD_DB entry — unresolved, never drafts
  'natto': null, // no FOOD_DB entry — unresolved, never drafts
  'navratan korma': { dbKey: 'navratan korma', displayName: 'Navratan Korma', defaultGrams: 100 },
  'neer dosa': { dbKey: 'neer dosa', displayName: 'Neer Dosa', defaultGrams: 100 },
  'noodles with fish curry': null, // no FOOD_DB entry — unresolved, never drafts
  'oatmeal': { dbKey: 'oatmeal', displayName: 'Oatmeal', defaultGrams: 100 },
  'oden': null, // no FOOD_DB entry — unresolved, never drafts
  'okinawa soba': null, // no FOOD_DB entry — unresolved, never drafts
  'okonomiyaki': null, // no FOOD_DB entry — unresolved, never drafts
  'olan': { dbKey: 'olan', displayName: 'Olan', defaultGrams: 100 },
  'omelette': { dbKey: 'omelette', displayName: 'Omelette', defaultGrams: 100 },
  'omurice': null, // no FOOD_DB entry — unresolved, never drafts
  'onion rings': { dbKey: 'onion rings', displayName: 'Onion Rings', defaultGrams: 100 },
  'orzo': null, // no FOOD_DB entry — unresolved, never drafts
  'oshiruko': null, // no FOOD_DB entry — unresolved, never drafts
  'osso buco': null, // no FOOD_DB entry — unresolved, never drafts
  'oxtail soup': null, // no FOOD_DB entry — unresolved, never drafts
  'oyakodon': null, // no FOOD_DB entry — unresolved, never drafts
  'oyster omelette': null, // no FOOD_DB entry — unresolved, never drafts
  'oysters': null, // no FOOD_DB entry — unresolved, never drafts
  'pad thai': { dbKey: 'pad thai', displayName: 'Pad Thai', defaultGrams: 100 },
  'paella': null, // no FOOD_DB entry — unresolved, never drafts
  'pakora': { dbKey: 'pakora', displayName: 'Pakora', defaultGrams: 100 },
  'palak paneer': { dbKey: 'palak paneer', displayName: 'Palak Paneer', defaultGrams: 100 },
  'pancakes': { dbKey: 'pancakes', displayName: 'Pancakes', defaultGrams: 100 },
  'paneer': { dbKey: 'paneer', displayName: 'Paneer', defaultGrams: 100 },
  'paneer butter masala': { dbKey: 'paneer butter masala', displayName: 'Paneer Butter Masala', defaultGrams: 100 },
  'paneer masala': { dbKey: 'paneer masala', displayName: 'Paneer Masala', defaultGrams: 100 },
  'paneer pizza': null, // no FOOD_DB entry — unresolved, never drafts
  'pani puri': { dbKey: 'pani puri', displayName: 'Pani Puri', defaultGrams: 120 },
  'paniyaram': { dbKey: 'paniyaram', displayName: 'Paniyaram', defaultGrams: 100 },
  'panna cotta': null, // no FOOD_DB entry — unresolved, never drafts
  'papdi chaat': { dbKey: 'papdi chaat', displayName: 'Papdi Chaat', defaultGrams: 100 },
  'parfait': null, // no FOOD_DB entry — unresolved, never drafts
  'pate': null, // no FOOD_DB entry — unresolved, never drafts
  'patrode': { dbKey: 'patrode', displayName: 'Patrode', defaultGrams: 100 },
  'pav bhaji': { dbKey: 'pav bhaji', displayName: 'Pav Bhaji', defaultGrams: 300 },
  'pavlova': null, // no FOOD_DB entry — unresolved, never drafts
  'peach melba': null, // no FOOD_DB entry — unresolved, never drafts
  'peking duck': null, // no FOOD_DB entry — unresolved, never drafts
  'penne': null, // no FOOD_DB entry — unresolved, never drafts
  'pepper steak': null, // no FOOD_DB entry — unresolved, never drafts
  'pepperoni pizza': { dbKey: 'pepperoni pizza', displayName: 'Pepperoni Pizza', defaultGrams: 100 },
  'phirni': { dbKey: 'phirni', displayName: 'Phirni', defaultGrams: 100 },
  'pho': { dbKey: 'pho', displayName: 'Pho', defaultGrams: 100 },
  'pilaf': null, // no FOOD_DB entry — unresolved, never drafts
  'pirogi': null, // no FOOD_DB entry — unresolved, never drafts
  'pithe': { dbKey: 'pithe', displayName: 'Pithe', defaultGrams: 100 },
  'pizza': { dbKey: 'pizza', displayName: 'Pizza', defaultGrams: 100 },
  'pizza toast': null, // no FOOD_DB entry — unresolved, never drafts
  'poached egg': null, // no FOOD_DB entry — unresolved, never drafts
  'poha': { dbKey: 'poha', displayName: 'Poha', defaultGrams: 100 },
  'poi': null, // no FOOD_DB entry — unresolved, never drafts
  'pongal': { dbKey: 'pongal', displayName: 'Pongal', defaultGrams: 100 },
  'poornalu': { dbKey: 'poornalu', displayName: 'Poornalu', defaultGrams: 100 },
  'pootharekulu': { dbKey: 'pootharekulu', displayName: 'Pootharekulu', defaultGrams: 100 },
  'popcorn': { dbKey: 'popcorn', displayName: 'Popcorn', defaultGrams: 100 },
  'pork belly': null, // no FOOD_DB entry — unresolved, never drafts
  'pork chop': { dbKey: 'pork chop', displayName: 'Pork Chop', defaultGrams: 100 },
  'pork cutlet': null, // no FOOD_DB entry — unresolved, never drafts
  'pork cutlet on rice': null, // no FOOD_DB entry — unresolved, never drafts
  'pork fillet cutlet': null, // no FOOD_DB entry — unresolved, never drafts
  'pork loin cutlet': null, // no FOOD_DB entry — unresolved, never drafts
  'pork miso soup': null, // no FOOD_DB entry — unresolved, never drafts
  'pork satay': null, // no FOOD_DB entry — unresolved, never drafts
  'pork sticky noodles': null, // no FOOD_DB entry — unresolved, never drafts
  'pork with lemon': null, // no FOOD_DB entry — unresolved, never drafts
  'porridge': null, // no FOOD_DB entry — unresolved, never drafts
  'pot au feu': null, // no FOOD_DB entry — unresolved, never drafts
  'potage': null, // no FOOD_DB entry — unresolved, never drafts
  'potato salad': null, // no FOOD_DB entry — unresolved, never drafts
  'potpie': null, // no FOOD_DB entry — unresolved, never drafts
  'pound cake': null, // no FOOD_DB entry — unresolved, never drafts
  'poutine': null, // no FOOD_DB entry — unresolved, never drafts
  'prime rib': null, // no FOOD_DB entry — unresolved, never drafts
  'profiterole': null, // no FOOD_DB entry — unresolved, never drafts
  'pulled pork sandwich': null, // no FOOD_DB entry — unresolved, never drafts
  'puri bhaji': { dbKey: 'puri bhaji', displayName: 'Puri Bhaji', defaultGrams: 100 },
  'puttu': { dbKey: 'puttu', displayName: 'Puttu', defaultGrams: 100 },
  'qubani ka meetha': { dbKey: 'qubani ka meetha', displayName: 'Qubani Ka Meetha', defaultGrams: 100 },
  'rabri': { dbKey: 'rabri', displayName: 'Rabri', defaultGrams: 100 },
  'raisin bread': null, // no FOOD_DB entry — unresolved, never drafts
  'raita': { dbKey: 'raita', displayName: 'Raita', defaultGrams: 100 },
  'rajma chawal': { dbKey: 'rajma chawal', displayName: 'Rajma Chawal', defaultGrams: 100 },
  'rajma curry': null, // no FOOD_DB entry — unresolved, never drafts
  'ramen': { dbKey: 'ramen', displayName: 'Ramen', defaultGrams: 100 },
  'rare cheesecake': null, // no FOOD_DB entry — unresolved, never drafts
  'rasgulla': { dbKey: 'rasgulla', displayName: 'Rasgulla', defaultGrams: 100 },
  'rasmalai': { dbKey: 'rasmalai', displayName: 'Rasmalai', defaultGrams: 100 },
  'rava dosa': { dbKey: 'rava dosa', displayName: 'Rava Dosa', defaultGrams: 100 },
  'ravioli': null, // no FOOD_DB entry — unresolved, never drafts
  'red velvet cake': null, // no FOOD_DB entry — unresolved, never drafts
  'reuben': null, // no FOOD_DB entry — unresolved, never drafts
  'rice': { dbKey: 'rice', displayName: 'Rice', defaultGrams: 100 },
  'rice ball': null, // no FOOD_DB entry — unresolved, never drafts
  'rice crispy pork': null, // no FOOD_DB entry — unresolved, never drafts
  'rice gratin': null, // no FOOD_DB entry — unresolved, never drafts
  'rice gruel': null, // no FOOD_DB entry — unresolved, never drafts
  'rice vermicelli': null, // no FOOD_DB entry — unresolved, never drafts
  'rice with roast duck': null, // no FOOD_DB entry — unresolved, never drafts
  'rigatoni': null, // no FOOD_DB entry — unresolved, never drafts
  'risotto': { dbKey: 'risotto', displayName: 'Risotto', defaultGrams: 100 },
  'rissole': null, // no FOOD_DB entry — unresolved, never drafts
  'roast chicken': null, // no FOOD_DB entry — unresolved, never drafts
  'roast duck': null, // no FOOD_DB entry — unresolved, never drafts
  'rock cake': null, // no FOOD_DB entry — unresolved, never drafts
  'roll bread': null, // no FOOD_DB entry — unresolved, never drafts
  'roulade': null, // no FOOD_DB entry — unresolved, never drafts
  'rugulah': null, // no FOOD_DB entry — unresolved, never drafts
  'sabudana khichdi': { dbKey: 'sabudana khichdi', displayName: 'Sabudana Khichdi', defaultGrams: 100 },
  'sabudana vada': { dbKey: 'sabudana vada', displayName: 'Sabudana Vada', defaultGrams: 100 },
  'salisbury steak': null, // no FOOD_DB entry — unresolved, never drafts
  'salmon meuniere': null, // no FOOD_DB entry — unresolved, never drafts
  'salt and pepper fried shrimp with shell': null, // no FOOD_DB entry — unresolved, never drafts
  'sambar': { dbKey: 'sambar', displayName: 'Sambar', defaultGrams: 100 },
  'samosa': { dbKey: 'samosa', displayName: 'Samosa', defaultGrams: 100 },
  'samul': null, // no FOOD_DB entry — unresolved, never drafts
  'sandesh': { dbKey: 'sandesh', displayName: 'Sandesh', defaultGrams: 100 },
  'sandwich': null, // no FOOD_DB entry — unresolved, never drafts
  'sashimi': null, // no FOOD_DB entry — unresolved, never drafts
  'sashimi bowl': null, // no FOOD_DB entry — unresolved, never drafts
  'sauerbraten': null, // no FOOD_DB entry — unresolved, never drafts
  'sauerkraut': null, // no FOOD_DB entry — unresolved, never drafts
  'sausage': { dbKey: 'sausage', displayName: 'Sausage', defaultGrams: 100 },
  'sausage roll': null, // no FOOD_DB entry — unresolved, never drafts
  'sauteed spinach': null, // no FOOD_DB entry — unresolved, never drafts
  'sauteed vegetables': null, // no FOOD_DB entry — unresolved, never drafts
  'savarin': null, // no FOOD_DB entry — unresolved, never drafts
  'scallop': null, // no FOOD_DB entry — unresolved, never drafts
  'scampi': null, // no FOOD_DB entry — unresolved, never drafts
  'schnitzel': null, // no FOOD_DB entry — unresolved, never drafts
  'scone': null, // no FOOD_DB entry — unresolved, never drafts
  'scotch egg': null, // no FOOD_DB entry — unresolved, never drafts
  'scrambled eggs': null, // no FOOD_DB entry — unresolved, never drafts
  'scrapple': null, // no FOOD_DB entry — unresolved, never drafts
  'seasoned beef with potatoes': null, // no FOOD_DB entry — unresolved, never drafts
  'seaweed salad': null, // no FOOD_DB entry — unresolved, never drafts
  'seekh kebab': { dbKey: 'seekh kebab', displayName: 'Seekh Kebab', defaultGrams: 100 },
  'set dosa': { dbKey: 'set dosa', displayName: 'Set Dosa', defaultGrams: 100 },
  'sev puri': { dbKey: 'sev puri', displayName: 'Sev Puri', defaultGrams: 100 },
  'shahi paneer': { dbKey: 'shahi paneer', displayName: 'Shahi Paneer', defaultGrams: 100 },
  'shankarpali': null, // no FOOD_DB entry — unresolved, never drafts
  'sheer korma': null, // no FOOD_DB entry — unresolved, never drafts
  'sheera': null, // no FOOD_DB entry — unresolved, never drafts
  'shirred egg': null, // no FOOD_DB entry — unresolved, never drafts
  'shrikhand': { dbKey: 'shrikhand', displayName: 'Shrikhand', defaultGrams: 100 },
  'shrimp and grits': null, // no FOOD_DB entry — unresolved, never drafts
  'shrimp patties': null, // no FOOD_DB entry — unresolved, never drafts
  'shrimp with chill source': null, // no FOOD_DB entry — unresolved, never drafts
  'simmered pork': null, // no FOOD_DB entry — unresolved, never drafts
  'sirloin cutlet': null, // no FOOD_DB entry — unresolved, never drafts
  'sloppy joe': null, // no FOOD_DB entry — unresolved, never drafts
  'small steamed savory rice pancake': null, // no FOOD_DB entry — unresolved, never drafts
  'soan papdi': { dbKey: 'soan papdi', displayName: 'Soan Papdi', defaultGrams: 100 },
  'soba noodle': null, // no FOOD_DB entry — unresolved, never drafts
  'sohan halwa': { dbKey: 'sohan halwa', displayName: 'Sohan Halwa', defaultGrams: 100 },
  'solkadhi': { dbKey: 'solkadhi', displayName: 'Solkadhi', defaultGrams: 100 },
  'souffle': null, // no FOOD_DB entry — unresolved, never drafts
  'sour prawn soup': null, // no FOOD_DB entry — unresolved, never drafts
  'spaghetti': { dbKey: 'spaghetti', displayName: 'Spaghetti', defaultGrams: 100 },
  'spaghetti bolognese': { dbKey: 'spaghetti bolognese', displayName: 'Spaghetti Bolognese', defaultGrams: 100 },
  'spaghetti carbonara': null, // no FOOD_DB entry — unresolved, never drafts
  'spam musubi': null, // no FOOD_DB entry — unresolved, never drafts
  'spicy chicken salad': null, // no FOOD_DB entry — unresolved, never drafts
  'spicy chili flavored tofu': null, // no FOOD_DB entry — unresolved, never drafts
  'sponge cake': null, // no FOOD_DB entry — unresolved, never drafts
  'spring roll': null, // no FOOD_DB entry — unresolved, never drafts
  'steak': { dbKey: 'steak', displayName: 'Steak', defaultGrams: 100 },
  'steamed meat dumpling': null, // no FOOD_DB entry — unresolved, never drafts
  'steamed rice roll': null, // no FOOD_DB entry — unresolved, never drafts
  'steamed spareribs': null, // no FOOD_DB entry — unresolved, never drafts
  'stew': null, // no FOOD_DB entry — unresolved, never drafts
  'stewed pork leg': null, // no FOOD_DB entry — unresolved, never drafts
  'stinky tofu': null, // no FOOD_DB entry — unresolved, never drafts
  'stir fried beef and peppers': null, // no FOOD_DB entry — unresolved, never drafts
  'stir fried mixed vegetables': null, // no FOOD_DB entry — unresolved, never drafts
  'strawberry shortcake': null, // no FOOD_DB entry — unresolved, never drafts
  'streusel': null, // no FOOD_DB entry — unresolved, never drafts
  'strudel': null, // no FOOD_DB entry — unresolved, never drafts
  'stuffed cabbage': null, // no FOOD_DB entry — unresolved, never drafts
  'stuffed peppers': null, // no FOOD_DB entry — unresolved, never drafts
  'stuffed tomato': null, // no FOOD_DB entry — unresolved, never drafts
  'succotash': null, // no FOOD_DB entry — unresolved, never drafts
  'sukiyaki': null, // no FOOD_DB entry — unresolved, never drafts
  'sushi': { dbKey: 'sushi', displayName: 'Sushi', defaultGrams: 100 },
  'sushi bowl': null, // no FOOD_DB entry — unresolved, never drafts
  'sutar feni': { dbKey: 'sutar feni', displayName: 'Sutar Feni', defaultGrams: 100 },
  'sweet and sour pork': null, // no FOOD_DB entry — unresolved, never drafts
  'syllabub': null, // no FOOD_DB entry — unresolved, never drafts
  'tacos': { dbKey: 'tacos', displayName: 'Tacos', defaultGrams: 100 },
  'tagliatelle': null, // no FOOD_DB entry — unresolved, never drafts
  'taiyaki': null, // no FOOD_DB entry — unresolved, never drafts
  'takoyaki': null, // no FOOD_DB entry — unresolved, never drafts
  'tamale': null, // no FOOD_DB entry — unresolved, never drafts
  'tamale pie': null, // no FOOD_DB entry — unresolved, never drafts
  'tandoori chicken': { dbKey: 'tandoori chicken', displayName: 'Tandoori Chicken', defaultGrams: 100 },
  'tanmen': null, // no FOOD_DB entry — unresolved, never drafts
  'tapenade': null, // no FOOD_DB entry — unresolved, never drafts
  'tempura': null, // no FOOD_DB entry — unresolved, never drafts
  'tempura bowl': null, // no FOOD_DB entry — unresolved, never drafts
  'tempura udon': null, // no FOOD_DB entry — unresolved, never drafts
  'tenderloin': null, // no FOOD_DB entry — unresolved, never drafts
  'tenshin noodle': null, // no FOOD_DB entry — unresolved, never drafts
  'teriyaki grilled fish': null, // no FOOD_DB entry — unresolved, never drafts
  'terrine': null, // no FOOD_DB entry — unresolved, never drafts
  'tetrazzini': null, // no FOOD_DB entry — unresolved, never drafts
  'thai papaya salad': null, // no FOOD_DB entry — unresolved, never drafts
  'thali': null, // no FOOD_DB entry — unresolved, never drafts
  'thinly sliced raw horsemeat': null, // no FOOD_DB entry — unresolved, never drafts
  'thoran': { dbKey: 'thoran', displayName: 'Thoran', defaultGrams: 100 },
  'three cup chicken': null, // no FOOD_DB entry — unresolved, never drafts
  'thukpa': { dbKey: 'thukpa', displayName: 'Thukpa', defaultGrams: 100 },
  'tiramisu': null, // no FOOD_DB entry — unresolved, never drafts
  'toad in the hole': null, // no FOOD_DB entry — unresolved, never drafts
  'toast': { dbKey: 'toast', displayName: 'Toast', defaultGrams: 100 },
  'tomato chutney': { dbKey: 'tomato chutney', displayName: 'Tomato Chutney', defaultGrams: 100 },
  'torte': null, // no FOOD_DB entry — unresolved, never drafts
  'tortellini': null, // no FOOD_DB entry — unresolved, never drafts
  'tortilla': { dbKey: 'tortilla', displayName: 'Tortilla', defaultGrams: 100 },
  'tostada': null, // no FOOD_DB entry — unresolved, never drafts
  'trunip pudding': null, // no FOOD_DB entry — unresolved, never drafts
  'tuna tartare': null, // no FOOD_DB entry — unresolved, never drafts
  'twice cooked pork': null, // no FOOD_DB entry — unresolved, never drafts
  'udon noodle': null, // no FOOD_DB entry — unresolved, never drafts
  'unni appam': { dbKey: 'unni appam', displayName: 'Unni Appam', defaultGrams: 100 },
  'upma': { dbKey: 'upma', displayName: 'Upma', defaultGrams: 100 },
  'upside down cake': null, // no FOOD_DB entry — unresolved, never drafts
  'uttapam': { dbKey: 'uttapam', displayName: 'Uttapam', defaultGrams: 100 },
  'vada pav': { dbKey: 'vada pav', displayName: 'Vada Pav', defaultGrams: 150 },
  'veal cordon bleu': null, // no FOOD_DB entry — unresolved, never drafts
  'vegetable tempura': null, // no FOOD_DB entry — unresolved, never drafts
  'vermicelli': null, // no FOOD_DB entry — unresolved, never drafts
  'vermicelli noodles with snails': null, // no FOOD_DB entry — unresolved, never drafts
  'victoria sandwich': null, // no FOOD_DB entry — unresolved, never drafts
  'vol au vent': null, // no FOOD_DB entry — unresolved, never drafts
  'waffles': { dbKey: 'waffles', displayName: 'Waffles', defaultGrams: 100 },
  'welsh rarebit': null, // no FOOD_DB entry — unresolved, never drafts
  'winter melon soup': null, // no FOOD_DB entry — unresolved, never drafts
  'wonton': null, // no FOOD_DB entry — unresolved, never drafts
  'wonton soup': null, // no FOOD_DB entry — unresolved, never drafts
  'xiao long bao': null, // no FOOD_DB entry — unresolved, never drafts
  'yakitori': null, // no FOOD_DB entry — unresolved, never drafts
  'yellow curry': null, // no FOOD_DB entry — unresolved, never drafts
  'yudofu': null, // no FOOD_DB entry — unresolved, never drafts
  'zha jiang mian': null, // no FOOD_DB entry — unresolved, never drafts
  'ziti': null, // no FOOD_DB entry — unresolved, never drafts
  'zoni': null, // no FOOD_DB entry — unresolved, never drafts
};

/** Labels with no honest DB resolution (see map comments). */
export const OFFLINE_UNRESOLVED_LABELS: string[] = MODEL_LABELS.filter(
  (label) => OFFLINE_LABEL_MAP[label] === null
);

/** Below this top-1 score the model is guessing — never auto-draft. */
export const OFFLINE_AUTO_DRAFT_THRESHOLD = 0.35;

// ── Classifier / detector contract constants (unit-tested) ──────────

/** v11 classifier input: 224x224 UINT8 NHWC, raw 0–255 pixels. */
export const OFFLINE_CLASSIFIER_INPUT_SIZE = 224;
/** v11 INT8 output quantization (logits → dequantize → softmax). */
export const OFFLINE_CLASSIFIER_OUTPUT_SCALE = 0.07856530696153641;
export const OFFLINE_CLASSIFIER_OUTPUT_ZERO_POINT = 190;
/** Detector input size (stretched 416x416, BGR, normalized). */
export const OFFLINE_DETECTOR_INPUT_SIZE = 416;
export const OFFLINE_DETECTOR_STRIDES = [8, 16, 32, 64] as const;
export const OFFLINE_DETECTOR_NUM_CLASSES = 5;
export const OFFLINE_DETECTOR_REG_MAX = 7;
/** Bench score filter for detector boxes. */
export const OFFLINE_DETECTOR_SCORE_THRESHOLD = 0.3;
/** App-side per-class NMS IoU threshold. */
export const OFFLINE_DETECTOR_NMS_IOU = 0.5;

/**
 * Dequantize UINT8 logits then softmax — the exact math the Java
 * plugin applies to the v11 output. Exported so tests pin it.
 */
export function dequantizeAndSoftmax(
  quantized: number[],
  scale: number,
  zeroPoint: number
): number[] {
  const logits = quantized.map((q) => (q - zeroPoint) * scale);
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum > 0 ? exps.map((e) => e / sum) : exps;
}

// ── Detector decode + NMS (pure-TS contract mirrors) ─────────────────

export interface RawDetection {
  /** Box in original-photo pixel coordinates. */
  box: { x1: number; y1: number; x2: number; y2: number };
  classIndex: number;
  score: number;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function detectionIoU(
  a: RawDetection['box'],
  b: RawDetection['box']
): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = ix2 - ix1;
  const ih = iy2 - iy1;
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}

/**
 * Decode a raw [3598][37] detector head into boxes (original-photo
 * pixels), then per-class greedy NMS. Mirrors
 * OfflineScanPlugin.decodeDetections: anchors are grid centres
 * (col+0.5)*stride, (row+0.5)*stride, row-major within each stride
 * level; class score = sigmoid of the first 5 channels; each side's
 * box distance = softmax-expected bin index x stride (DFL,
 * reg_max 7); boxes clamped to the 416 frame, then scaled to the
 * original photo (stretched resize, so x and y scale independently).
 */
export function decodeDetectorOutput(
  head: number[][],
  origWidth: number,
  origHeight: number
): RawDetection[] {
  const all: RawDetection[] = [];
  let anchor = 0;
  for (const stride of OFFLINE_DETECTOR_STRIDES) {
    const feat = OFFLINE_DETECTOR_INPUT_SIZE / stride;
    for (let row = 0; row < feat; row++) {
      for (let col = 0; col < feat; col++) {
        if (anchor >= head.length) break;
        const ch = head[anchor++];
        let bestClass = -1;
        let bestScore = 0;
        for (let c = 0; c < OFFLINE_DETECTOR_NUM_CLASSES; c++) {
          const s = sigmoid(ch[c]);
          if (s > bestScore) {
            bestScore = s;
            bestClass = c;
          }
        }
        if (bestClass < 0 || bestScore < OFFLINE_DETECTOR_SCORE_THRESHOLD) continue;
        const cx = (col + 0.5) * stride;
        const cy = (row + 0.5) * stride;
        const dist: number[] = [];
        for (let side = 0; side < 4; side++) {
          const base = OFFLINE_DETECTOR_NUM_CLASSES + side * (OFFLINE_DETECTOR_REG_MAX + 1);
          const bins = ch.slice(base, base + OFFLINE_DETECTOR_REG_MAX + 1);
          const m = Math.max(...bins);
          const exps = bins.map((v) => Math.exp(v - m));
          const sum = exps.reduce((a, b) => a + b, 0);
          const expected =
            sum > 0
              ? exps.reduce((acc, e, b) => acc + e * b, 0) / sum
              : 0;
          dist.push(expected * stride);
        }
        const x1 = Math.max(0, cx - dist[0]) * (origWidth / OFFLINE_DETECTOR_INPUT_SIZE);
        const y1 = Math.max(0, cy - dist[1]) * (origHeight / OFFLINE_DETECTOR_INPUT_SIZE);
        const x2 =
          Math.min(OFFLINE_DETECTOR_INPUT_SIZE, cx + dist[2]) *
          (origWidth / OFFLINE_DETECTOR_INPUT_SIZE);
        const y2 =
          Math.min(OFFLINE_DETECTOR_INPUT_SIZE, cy + dist[3]) *
          (origHeight / OFFLINE_DETECTOR_INPUT_SIZE);
        if (x2 <= x1 || y2 <= y1) continue;
        all.push({ box: { x1, y1, x2, y2 }, classIndex: bestClass, score: bestScore });
      }
    }
  }
  return applyNms(all);
}

/** Per-class greedy NMS, highest score first. */
export function applyNms(detections: RawDetection[]): RawDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: RawDetection[] = [];
  for (const cand of sorted) {
    const suppressed = kept.some(
      (k) =>
        k.classIndex === cand.classIndex &&
        detectionIoU(k.box, cand.box) > OFFLINE_DETECTOR_NMS_IOU
    );
    if (!suppressed) kept.push(cand);
  }
  return kept;
}

// ── Availability ─────────────────────────────────────────────────────

let availabilityPromise: Promise<boolean> | null = null;

/**
 * True only inside the Android app with both models loadable.
 * Web/PWA always false. Cached — the answer can't change within a
 * session.
 */
export function isOfflineScanAvailable(): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(false);
  if (!availabilityPromise) {
    availabilityPromise = (async () => {
      try {
        const res = await OfflineScan.available();
        return res?.available === true;
      } catch {
        return false;
      }
    })();
  }
  return availabilityPromise;
}

/** Pure gate the modal uses (unit-testable): all three must hold. */
export function shouldUseOfflineScan(input: {
  isNative: boolean;
  prefEnabled: boolean;
  modelAvailable: boolean;
}): boolean {
  return input.isNative && input.prefEnabled && input.modelAvailable;
}

// ── Classification ───────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function imageDataFrom(source: Blob | string): Promise<string> {
  if (typeof source === 'string') {
    const comma = source.indexOf(',');
    return Promise.resolve(
      source.startsWith('data:') && comma > 0 ? source.slice(comma + 1) : source
    );
  }
  return source.arrayBuffer().then((buf) => bytesToBase64(new Uint8Array(buf)));
}

/**
 * Classify a meal photo on-device (whole photo, no detector).
 * Accepts the compressed JPEG Blob the scanner already holds, or a
 * base64 / data-URL string. Returns top-3 candidates sorted by
 * score. Throws on any failure; callers fall back to the server flow
 * / choices UI.
 */
export async function classifyPhoto(source: Blob | string): Promise<OfflineCandidate[]> {
  if (!isNativeApp()) {
    throw new Error('Offline scan is only available in the Android app.');
  }
  const data = await imageDataFrom(source);
  if (!data) throw new Error('Offline scan: empty image data.');
  const res = await OfflineScan.classify({ data });
  const results = (res?.results || [])
    .filter((r) => r && typeof r.label === 'string' && typeof r.score === 'number')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (results.length === 0) {
    throw new Error('Offline scan returned no results.');
  }
  return results;
}

/**
 * Detector-first scan: containers → crops → v11 top-3 per crop.
 * Returns the plugin's detections as-is (candidates already sorted).
 * Throws on any failure; callers fall back to classifyPhoto().
 * An empty detections array means "no container found", not an
 * error — the caller then falls back to the whole-photo classify.
 */
export async function detectPhoto(source: Blob | string): Promise<OfflineDetection[]> {
  if (!isNativeApp()) {
    throw new Error('Offline scan is only available in the Android app.');
  }
  const data = await imageDataFrom(source);
  if (!data) throw new Error('Offline scan: empty image data.');
  const res = await OfflineScan.detectAndClassify({ data });
  const detections = (res?.detections || []).filter(
    (d) =>
      d &&
      d.box &&
      Array.isArray(d.candidates) &&
      typeof d.container === 'string' &&
      typeof d.containerScore === 'number'
  );
  return detections.map((d) => ({
    ...d,
    candidates: [...d.candidates]
      .filter((c) => c && typeof c.label === 'string' && typeof c.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
  }));
}

// ── Draft building (pure — unit-tested) ──────────────────────────────

export function isResolvedLabel(label: string): boolean {
  return OFFLINE_LABEL_MAP[label] != null;
}

export function displayNameForLabel(label: string): string {
  const mapping = OFFLINE_LABEL_MAP[label];
  if (mapping) return mapping.displayName;
  return label.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function confidenceTierForScore(
  score: number
): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= OFFLINE_AUTO_DRAFT_THRESHOLD) return 'medium';
  return 'low';
}

/**
 * Routing decision after a classification:
 *  - 'draft'   → top-1 is confident AND resolves to a real DB entry.
 *  - 'choices' → anything else (unsure, or a dish we can't honestly
 *                price yet) — the user picks; nothing is auto-logged.
 */
export function routeOfflineResult(
  candidates: OfflineCandidate[]
): 'draft' | 'choices' {
  const top = candidates[0];
  if (!top) return 'choices';
  if (top.score < OFFLINE_AUTO_DRAFT_THRESHOLD) return 'choices';
  if (!isResolvedLabel(top.label)) return 'choices';
  return 'draft';
}

/**
 * Build the review item for one candidate. Returns null for an
 * unresolved label: unmapped dishes NEVER draft — not with real
 * macros (there are none) and not with estimator guesses. Callers
 * keep the user on the choices step, where the cloud scan is the
 * honest fallback.
 */
export function buildItemForCandidate(
  candidate: OfflineCandidate,
  detection?: Pick<OfflineDetection, 'box' | 'container'>
): ScannedFoodItem | null {
  const mapping = OFFLINE_LABEL_MAP[candidate.label];
  if (!mapping) return null;
  const tier = confidenceTierForScore(candidate.score);
  const entry = FOOD_DB[mapping.dbKey];
  const mult = mapping.defaultGrams / 100;
  return {
    name: mapping.displayName,
    quantity: `${mapping.defaultGrams}g`,
    estimatedGrams: mapping.defaultGrams,
    calories: Math.round(entry.calories * mult),
    proteinG: Number((entry.proteinG * mult).toFixed(1)),
    carbsG: Number((entry.carbsG * mult).toFixed(1)),
    fatG: Number((entry.fatG * mult).toFixed(1)),
    confidence: tier,
    detectionBox: detection?.box,
    container: detection?.container,
  };
}

function baseDraft(items: ScannedFoodItem[], mealName: string, confidence: 'high' | 'medium' | 'low'): MealAnalysisResult {
  const base: MealAnalysisResult = {
    mealName,
    items,
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    hiddenIngredients: [],
    confidence,
    coachingNote:
      'Recognized offline on this device — no internet was used. Check the portions before saving.',
    timestamp: new Date().toISOString(),
    imageUrl: undefined,
  };
  return recalculateMealResult(base, items);
}

/**
 * Build a full scan draft (same shape as the server-AI result) from
 * the candidates, drafting `chosenLabel` (default: the top-1).
 * Returns null when there are no candidates or the chosen label is
 * unresolved (unmapped dishes never draft — see above).
 */
export function buildOfflineDraft(
  candidates: OfflineCandidate[],
  chosenLabel?: string
): MealAnalysisResult | null {
  if (!candidates || candidates.length === 0) return null;
  const chosen =
    candidates.find((c) => c.label === chosenLabel) ?? candidates[0];
  const item = buildItemForCandidate(chosen);
  if (!item) return null;
  return baseDraft([item], item.name, confidenceTierForScore(chosen.score));
}

/**
 * Multi-item draft from detector output: one item per detection
 * whose top-1 candidate is confident (>= threshold) AND resolves to
 * a real DB entry. Detections that are unsure or unmapped contribute
 * NO item — never a fabricated one. Returns null when no detection
 * qualifies. The draft reuses the existing review flow (household
 * units + ghee prompt unchanged).
 */
export function buildDraftFromDetections(
  detections: OfflineDetection[]
): MealAnalysisResult | null {
  if (!detections || detections.length === 0) return null;
  const items: ScannedFoodItem[] = [];
  let bestScore = 0;
  for (const det of detections) {
    const top = det.candidates[0];
    if (!top) continue;
    if (top.score < OFFLINE_AUTO_DRAFT_THRESHOLD) continue;
    const item = buildItemForCandidate(top, det);
    if (!item) continue;
    items.push(item);
    if (top.score > bestScore) bestScore = top.score;
  }
  if (items.length === 0) return null;
  return baseDraft(
    items,
    items.map((i) => i.name).join(' + '),
    confidenceTierForScore(bestScore)
  );
}

/** The remaining candidates to offer as "Did you mean…?" alternatives. */
export function alternativesFor(
  candidates: OfflineCandidate[],
  currentLabel: string
): OfflineCandidate[] {
  return candidates.filter((c) => c.label !== currentLabel);
}
