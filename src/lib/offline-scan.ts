/**
 * Offline (on-device) food scan — Android app only.
 *
 * A bundled INT8 TFLite classifier (v1: 15 Indian dishes) runs entirely
 * on the phone via the local OfflineScanPlugin: no network, no photo
 * leaves the device. The web layer only ever sees the top-3 labels +
 * softmax scores; draft building reuses the exact MealAnalysisResult
 * shape the server-AI scan produces, so the review UI, household
 * units and the ghee/oil prompt work unchanged.
 *
 * Model contract (verified against the trained artifact):
 *   input  [1, 256, 256, 3] UINT8 raw NHWC pixels (normalization is
 *          folded into the model — the plugin feeds raw bytes)
 *   output [1, 15] UINT8 logits → dequantize → softmax → top-3
 * The plugin owns all of that; this file owns the label semantics.
 *
 * Bundling is INTERIM: the .tflite + labels.txt live in
 * android/app/src/main/assets/models/. The documented later step is
 * Play Asset Delivery so model updates don't ride app releases.
 *
 * Label honesty: the map below is EXACT (FOOD_DB key lookup, never
 * fuzzy search — fuzzy is how 'paneer' used to become palak paneer).
 * 13 of 15 labels resolve exactly. Two do not exist in the food DB at
 * all ('kathi roll', 'kofta'); they are marked null here, never
 * auto-drafted, and only if the user explicitly picks one from the
 * choices list is a draft built with the app's standard estimator
 * (the same fallback a manually typed food gets) and flagged in its
 * notes. Adding real DB entries for them is a data task, not a
 * mapping trick.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { MealAnalysisResult, ScannedFoodItem } from './types';
import { FOOD_DB, estimateMacros } from './macros';
import { recalculateMealResult } from './ai-scan-meal';
import { isNativeApp } from './app-settings';

// ── Plugin contract ──────────────────────────────────────────────────

export interface OfflineCandidate {
  /** Model label (lowercase, e.g. 'pav bhaji'). */
  label: string;
  /** Softmax probability 0..1. */
  score: number;
}

interface OfflineScanPlugin {
  available(): Promise<{ available: boolean; labels: number }>;
  classify(options: { data: string }): Promise<{ results: OfflineCandidate[] }>;
}

const OfflineScan = registerPlugin<OfflineScanPlugin>('OfflineScan');

// ── Model labels + DB mapping ────────────────────────────────────────

/** The v1 model's classes, alphabetical — mirrors assets labels.txt. */
export const MODEL_LABELS = [
  'biryani',
  'chole bhature',
  'dabeli',
  'dal',
  'dhokla',
  'dosa',
  'jalebi',
  'kathi roll',
  'kofta',
  'naan',
  'pakora',
  'paneer',
  'pani puri',
  'pav bhaji',
  'vada pav',
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
 * Label → food DB entry. Default grams come from the app's own data:
 * household units (biryani plate 250 g, dal katori 150 g, dosa/naan
 * piece) and the piece-weight table (chole bhature plate 350 g,
 * dabeli 120 g, pav bhaji plate 300 g, vada pav 150 g), or a standard
 * serving where the DB has per-piece weights (dhokla 4 pc ≈ 120 g,
 * jalebi 5 pc ≈ 100 g, pani puri 6 pc ≈ 120 g, pakora plate 100 g).
 */
export const OFFLINE_LABEL_MAP: Record<string, OfflineLabelMapping | null> = {
  biryani: { dbKey: 'biryani', displayName: 'Biryani', defaultGrams: 250 },
  'chole bhature': { dbKey: 'chole bhature', displayName: 'Chole Bhature', defaultGrams: 350 },
  dabeli: { dbKey: 'dabeli', displayName: 'Dabeli', defaultGrams: 120 },
  // Exact 'dal' — the generic cooked dal entry with its own household
  // meta. NOT dal tadka / dal fry / dal makhani: the photo can't tell
  // the tadka, and the ghee prompt in review is where that gets fixed.
  dal: { dbKey: 'dal', displayName: 'Dal', defaultGrams: 150 },
  dhokla: { dbKey: 'dhokla', displayName: 'Dhokla', defaultGrams: 120 },
  dosa: { dbKey: 'dosa', displayName: 'Dosa', defaultGrams: 80 },
  jalebi: { dbKey: 'jalebi', displayName: 'Jalebi', defaultGrams: 100 },
  // No 'kathi roll' entry exists in the food DB — unresolved (below).
  'kathi roll': null,
  // No plain 'kofta' entry either (only the richer 'malai kofta') —
  // mapping the generic class onto it silently would overstate most
  // home kofta curries, so this stays unresolved too.
  kofta: null,
  naan: { dbKey: 'naan', displayName: 'Naan', defaultGrams: 90 },
  pakora: { dbKey: 'pakora', displayName: 'Pakora', defaultGrams: 100 },
  // Exact 'paneer' (the ingredient entry) — NOT palak paneer or any
  // other paneer dish via substring matching.
  paneer: { dbKey: 'paneer', displayName: 'Paneer', defaultGrams: 100 },
  'pani puri': { dbKey: 'pani puri', displayName: 'Pani Puri', defaultGrams: 120 },
  'pav bhaji': { dbKey: 'pav bhaji', displayName: 'Pav Bhaji', defaultGrams: 300 },
  'vada pav': { dbKey: 'vada pav', displayName: 'Vada Pav', defaultGrams: 150 },
};

/** Labels with no honest DB resolution (see map comments). */
export const OFFLINE_UNRESOLVED_LABELS: string[] = MODEL_LABELS.filter(
  (label) => OFFLINE_LABEL_MAP[label] === null
);

/** Standard servings for the estimator fallback of unresolved labels
 *  (one kathi roll ≈ 200 g; one katori of kofta curry ≈ 150 g). */
const UNRESOLVED_DEFAULT_GRAMS: Record<string, number> = {
  'kathi roll': 200,
  kofta: 150,
};

/** Below this top-1 score the model is guessing — never auto-draft. */
export const OFFLINE_AUTO_DRAFT_THRESHOLD = 0.35;

// ── Availability ─────────────────────────────────────────────────────

let availabilityPromise: Promise<boolean> | null = null;

/**
 * True only inside the Android app with the model loadable. Web/PWA
 * always false. Cached — the answer can't change within a session.
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

/**
 * Classify a meal photo on-device. Accepts the compressed JPEG Blob
 * the scanner already holds (least invasive — the modal never builds
 * data URLs), or a base64 / data-URL string. Returns top-3 candidates
 * sorted by score. Throws on any failure; callers fall back to the
 * server flow / choices UI.
 */
export async function classifyPhoto(source: Blob | string): Promise<OfflineCandidate[]> {
  if (!isNativeApp()) {
    throw new Error('Offline scan is only available in the Android app.');
  }
  let data: string;
  if (typeof source === 'string') {
    const comma = source.indexOf(',');
    data = source.startsWith('data:') && comma > 0 ? source.slice(comma + 1) : source;
  } else {
    data = bytesToBase64(new Uint8Array(await source.arrayBuffer()));
  }
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

/** Build the review item for one candidate. */
export function buildItemForCandidate(candidate: OfflineCandidate): ScannedFoodItem {
  const mapping = OFFLINE_LABEL_MAP[candidate.label];
  const tier = confidenceTierForScore(candidate.score);
  if (mapping) {
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
    };
  }
  // Unresolved label — only reachable when the user explicitly picked
  // this dish in the choices list. Same estimator fallback a manually
  // typed food gets, and the note says so on the draft itself.
  const grams = UNRESOLVED_DEFAULT_GRAMS[candidate.label] ?? 150;
  const est = estimateMacros(candidate.label, grams, 'g');
  return {
    name: displayNameForLabel(candidate.label),
    quantity: `${grams}g`,
    estimatedGrams: grams,
    calories: est.calories,
    proteinG: est.proteinG,
    carbsG: est.carbsG,
    fatG: est.fatG,
    confidence: tier,
    notes: 'Not in the offline dish list yet — values estimated from the closest database entry. Please check them.',
  };
}

/**
 * Build a full scan draft (same shape as the server-AI result) from
 * the candidates, drafting `chosenLabel` (default: the top-1).
 */
export function buildOfflineDraft(
  candidates: OfflineCandidate[],
  chosenLabel?: string
): MealAnalysisResult | null {
  if (!candidates || candidates.length === 0) return null;
  const chosen =
    candidates.find((c) => c.label === chosenLabel) ?? candidates[0];
  const item = buildItemForCandidate(chosen);
  const base: MealAnalysisResult = {
    mealName: item.name,
    items: [item],
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    hiddenIngredients: [],
    confidence: confidenceTierForScore(chosen.score),
    coachingNote:
      'Recognized offline on this device — no internet was used. Check the portion before saving.',
    timestamp: new Date().toISOString(),
    imageUrl: undefined,
  };
  return recalculateMealResult(base, [item]);
}

/** The remaining candidates to offer as "Did you mean…?" alternatives. */
export function alternativesFor(
  candidates: OfflineCandidate[],
  currentLabel: string
): OfflineCandidate[] {
  return candidates.filter((c) => c.label !== currentLabel);
}
