import { MealAnalysisResult, ScannedFoodItem } from './types';
import { getAiAuthHeaders } from './ai-client-auth';
import { estimateMacros } from './macros';
import { applyDatabaseMacros } from './scan-verification';
import {
  resizeAndCompressImage,
  MAX_IMAGE_DIMENSION,
  DEFAULT_IMAGE_QUALITY,
} from './image-processing';

export interface ScanMealOptions {
  file: File | Blob;
  userNotes?: string;
  hiddenIngredients?: string[];
  signal?: AbortSignal;
  /** Task 2.5: UI language from the caller. This module is shared
   *  with server code (the scan-meal route imports its offline
   *  estimators), so it cannot read the i18n store itself — client
   *  callers pass getCurrentLanguage(). */
  language?: string;
}

/**
 * Resizes and compresses image on the client to avoid uploading huge 10MB+ camera files.
 * Downsamples to max 1280px on the longest side and 75% JPEG quality (~80-150KB).
 * Returns compact Blob directly to avoid allocating base64 strings in JavaScript heap.
 */
export async function compressImageFile(
  file: File | Blob,
  maxWidth = MAX_IMAGE_DIMENSION,
  maxHeight = MAX_IMAGE_DIMENSION,
  quality = DEFAULT_IMAGE_QUALITY
): Promise<{ blob: Blob; mimeType: string }> {
  const maxDim = Math.max(maxWidth, maxHeight);
  const result = await resizeAndCompressImage(file, {
    maxDimension: maxDim,
    quality,
    format: 'image/jpeg',
  });

  return {
    blob: result.blob,
    mimeType: result.mimeType,
  };
}

/**
 * Sends compressed meal photo to Gemini AI for identification and macro breakdown.
 * Uses binary FormData streaming so large base64 strings are never created in client JS memory.
 * Does NOT swallow errors or fake foods if the image or request fails.
 */
export async function analyzeMealPhoto(options: ScanMealOptions): Promise<MealAnalysisResult> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline) {
    if (options.userNotes && options.userNotes.trim().length > 0) {
      return generateOfflineMealEstimate(options.userNotes, options.hiddenIngredients);
    }
    throw new Error(
      'You are currently offline. Connect to the internet to analyze photos with AI, or enter food manually.'
    );
  }

  // 1. Ensure file is downsampled (max 800px) and compressed to ~0.70 JPEG
  // Skip redundant re-compression if already a small compressed JPEG blob (< 300KB)
  let finalBlob: Blob = options.file;
  if (!(options.file instanceof Blob) || options.file.size > 300 * 1024 || (options.file.type && options.file.type !== 'image/jpeg')) {
    const { blob } = await resizeAndCompressImage(options.file, {
      maxDimension: MAX_IMAGE_DIMENSION,
      quality: DEFAULT_IMAGE_QUALITY,
      format: 'image/jpeg',
    });
    finalBlob = blob;
  }

  // 2. Stream as binary FormData to avoid allocating massive base64 strings in JS memory
  const formData = new FormData();
  formData.append('image', finalBlob, 'meal.jpg');
  if (options.userNotes) {
    formData.append('userNotes', options.userNotes);
  }
  if (options.hiddenIngredients && options.hiddenIngredients.length > 0) {
    formData.append('hiddenIngredients', JSON.stringify(options.hiddenIngredients));
  }
  // Task 2.5: the route localizes coachingNote/preparation from
  // this (food names stay English by app convention).
  formData.append('language', options.language === 'hi' ? 'hi' : 'en');
  const response = await fetch('/api/ai/scan-meal', {
    method: 'POST',
    // F-02 (audit): session token when signed in → higher per-account
    // daily AI quota; guests send nothing.
    headers: await getAiAuthHeaders(),
    body: formData,
    signal: options.signal,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const scanError: any = new Error(
      errData.message ||
        `Food scan failed (${response.status}). Please check your internet connection or try again later.`
    );
    scanError.code = errData.error || `HTTP_${response.status}`;
    scanError.status = response.status;
    throw scanError;
  }

  const data: MealAnalysisResult = await response.json();
  // REQUIREMENT 6 & 7: Never store image bytes/base64 in the meal analysis result
  return {
    ...data,
    imageUrl: undefined,
  };
}

/**
 * Re-computes item and meal totals after an edit or "Tell AI" refinement.
 */
export function recalculateMealResult(
  current: MealAnalysisResult,
  updatedItems: ScannedFoodItem[]
): MealAnalysisResult {
  // M1 (bug program Phase 3): EVERY recalculation re-resolves macros
  // from the verified food database — the old rule kept the model's
  // numbers whenever they were "valid", which is how a scan's
  // 136 kcal pineapple survived every edit. Items the user edited by
  // hand (macroSource 'user') keep the user's numbers.
  const verifiedItems = applyDatabaseMacros(updatedItems);

  const totalCalories = verifiedItems.reduce((acc, it) => acc + (it.calories || 0), 0);
  const totalProtein = Number(
    verifiedItems.reduce((acc, it) => acc + (it.proteinG || 0), 0).toFixed(1)
  );
  const totalCarbs = Number(
    verifiedItems.reduce((acc, it) => acc + (it.carbsG || 0), 0).toFixed(1)
  );
  const totalFat = Number(
    verifiedItems.reduce((acc, it) => acc + (it.fatG || 0), 0).toFixed(1)
  );

  return {
    ...current,
    items: verifiedItems,
    totalCalories: Math.round(totalCalories),
    totalProtein,
    totalCarbs,
    totalFat,
  };
}

/**
 * Offline heuristic fallback: generates a structured meal estimate using user hints or common plate heuristics.
 * Only outputs items explicitly referenced by user notes; NEVER invents fake food.
 */
export function generateOfflineMealEstimate(
  userNotes?: string,
  hiddenIngredients?: string[],
  imageUrl?: string
): MealAnalysisResult {
  const notesLower = (userNotes || '').toLowerCase();
  const items: ScannedFoodItem[] = [];

  // 1. Fitness Supplements in user notes
  if (notesLower.includes('creatine')) {
    items.push({
      name: 'Creatine Monohydrate',
      quantity: '1 scoop (5g)',
      estimatedGrams: 5,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      confidence: 'high',
      preparation: 'Micronized powder',
    });
  }

  if (notesLower.includes('whey') || notesLower.includes('protein powder')) {
    items.push({
      name: 'Whey Protein Powder',
      quantity: '1 scoop (30g)',
      estimatedGrams: 30,
      calories: 120,
      proteinG: 24,
      carbsG: 2.2,
      fatG: 1.5,
      confidence: 'high',
      preparation: 'Mixed with water',
    });
  }

  // 2. Common meals in user notes
  if (notesLower.includes('roti') || notesLower.includes('chapati')) {
    const qtyMatch = notesLower.match(/(\d+)\s*(roti|chapati)/);
    const count = qtyMatch ? parseInt(qtyMatch[1], 10) : 2;
    const est = estimateMacros('roti', count, 'piece');
    items.push({
      name: 'Roti / Chapati',
      quantity: `${count} pieces`,
      estimatedGrams: count * 40,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      confidence: 'medium',
      preparation: 'Dry roasted',
    });
  }

  if (notesLower.includes('rice')) {
    const gramMatch = notesLower.match(/(\d+)\s*g/);
    const grams = gramMatch ? parseInt(gramMatch[1], 10) : 180;
    const est = estimateMacros('rice', grams, 'g');
    items.push({
      name: 'Cooked Rice',
      quantity: `${grams}g`,
      estimatedGrams: grams,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      confidence: 'medium',
      preparation: 'Steamed',
    });
  }

  if (notesLower.includes('dal')) {
    const est = estimateMacros('dal', 180, 'g');
    items.push({
      name: 'Yellow Dal',
      quantity: '1 bowl (180g)',
      estimatedGrams: 180,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      confidence: 'medium',
      preparation: 'Tadka with light spices',
    });
  }

  if (notesLower.includes('paneer')) {
    const est = estimateMacros('paneer', 100, 'g');
    items.push({
      name: 'Paneer Curry',
      quantity: '1 serving (100g)',
      estimatedGrams: 100,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      confidence: 'medium',
    });
  }

  if (notesLower.includes('chicken')) {
    const est = estimateMacros('chicken breast', 150, 'g');
    items.push({
      name: 'Chicken Breast',
      quantity: '150g',
      estimatedGrams: 150,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      confidence: 'medium',
    });
  }

  if (notesLower.includes('egg')) {
    const est = estimateMacros('eggs', 2, 'piece');
    items.push({
      name: 'Eggs',
      quantity: '2 whole eggs',
      estimatedGrams: 120,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      confidence: 'medium',
    });
  }

  // Hidden ingredients (Ghee/Oil)
  if (
    hiddenIngredients?.some(
      (h) => h.toLowerCase().includes('oil') || h.toLowerCase().includes('ghee')
    )
  ) {
    const gheeEst = estimateMacros('ghee', 10, 'g');
    items.push({
      name: 'Added Ghee / Cooking Oil',
      quantity: '1 tbsp (~10g)',
      estimatedGrams: 10,
      calories: gheeEst.calories,
      proteinG: gheeEst.proteinG,
      carbsG: gheeEst.carbsG,
      fatG: gheeEst.fatG,
      confidence: 'high',
      notes: 'Reported by user as hidden ingredient',
    });
  }

  // If no notes matched, do NOT fabricate fake food. Return an empty result with a helpful note.
  if (items.length === 0) {
    return {
      mealName: userNotes ? `Meal (${userNotes.slice(0, 30)})` : 'No Food or Supplement Detected',
      items: [],
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      hiddenIngredients: hiddenIngredients || [],
      confidence: 'low',
      coachingNote:
        'No matching foods found in offline database. Add items manually or connect to internet for photo scanning.',
      timestamp: new Date().toISOString(),
      imageUrl: undefined,
    };
  }

  // M1: every item in this path was CONSTRUCTED from estimateMacros
  // (or the app's own supplement constants) — database values by
  // construction, stamped as such.
  const stampedItems = items.map((it) => ({
    ...it,
    verified: true,
    macroSource: 'database' as const,
  }));

  const totalCalories = Math.round(stampedItems.reduce((acc, it) => acc + it.calories, 0));
  const totalProtein = Number(stampedItems.reduce((acc, it) => acc + it.proteinG, 0).toFixed(1));
  const totalCarbs = Number(stampedItems.reduce((acc, it) => acc + it.carbsG, 0).toFixed(1));
  const totalFat = Number(stampedItems.reduce((acc, it) => acc + it.fatG, 0).toFixed(1));

  return {
    mealName: userNotes ? `Meal (${userNotes.slice(0, 25)})` : 'Custom Food Entry',
    items: stampedItems,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    hiddenIngredients: hiddenIngredients || [],
    confidence: 'medium',
    coachingNote:
      'Estimated nutrition from offline database matching your notes. Review and adjust portions before saving.',
    timestamp: new Date().toISOString(),
    imageUrl: undefined,
  };
}
