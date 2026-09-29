import { MealAnalysisResult, ScannedFoodItem } from './types';
import { estimateMacros } from './macros';

export interface ScanMealOptions {
  file: File | Blob;
  userNotes?: string;
  hiddenIngredients?: string[];
  customApiKey?: string;
}

/**
 * Resizes and compresses image on the client to avoid uploading huge 10MB+ camera files.
 * Downsamples to max 1024px width/height and 75% JPEG quality (~80-150KB).
 */
export async function compressImageFile(
  file: File | Blob,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.75
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    // If running server-side or non-DOM environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          base64: reader.result as string,
          mimeType: file.type || 'image/jpeg',
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback if canvas context cannot be initialized
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            base64: reader.result as string,
            mimeType: file.type || 'image/jpeg',
          });
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({
        base64: compressedDataUrl,
        mimeType: 'image/jpeg',
      });
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      // Fallback to raw FileReader
      const reader = new FileReader();
      reader.onload = () =>
        resolve({
          base64: reader.result as string,
          mimeType: file.type || 'image/jpeg',
        });
      reader.onerror = () => reject(err);
      reader.readAsDataURL(file);
    };

    img.src = objectUrl;
  });
}

/**
 * Sends compressed meal photo to Gemini AI for identification and macro breakdown.
 * Does NOT swallow errors or fake foods if the image or request fails.
 */
export async function analyzeMealPhoto(options: ScanMealOptions): Promise<MealAnalysisResult> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline) {
    if (options.userNotes && options.userNotes.trim().length > 0) {
      return generateOfflineMealEstimate(options.userNotes, options.hiddenIngredients);
    }
    throw new Error(
      'You are currently offline. Connect to the internet to analyze photos with Gemini AI, or enter food manually.'
    );
  }

  const { base64, mimeType } = await compressImageFile(options.file);

  const response = await fetch('/api/ai/scan-meal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.customApiKey ? { 'x-gemini-api-key': options.customApiKey } : {}),
    },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType,
      userNotes: options.userNotes || '',
      hiddenIngredients: options.hiddenIngredients || [],
      customApiKey: options.customApiKey,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.message ||
        `Food scan failed (${response.status}). Please check your internet connection or Gemini API key.`
    );
  }

  const data: MealAnalysisResult = await response.json();
  return {
    ...data,
    imageUrl: base64,
  };
}

/**
 * Re-computes item and meal totals after an edit or "Tell AI" refinement.
 */
export function recalculateMealResult(
  current: MealAnalysisResult,
  updatedItems: ScannedFoodItem[]
): MealAnalysisResult {
  const verifiedItems = updatedItems.map((item) => {
    // If grams were adjusted, recalculate based on standard database
    const dbEst = estimateMacros(item.name, item.estimatedGrams || 100, 'g');
    return {
      ...item,
      calories:
        typeof item.calories === 'number' && !isNaN(item.calories)
          ? item.calories
          : dbEst.calories,
      proteinG:
        typeof item.proteinG === 'number' && !isNaN(item.proteinG)
          ? item.proteinG
          : dbEst.proteinG,
      carbsG:
        typeof item.carbsG === 'number' && !isNaN(item.carbsG) ? item.carbsG : dbEst.carbsG,
      fatG: typeof item.fatG === 'number' && !isNaN(item.fatG) ? item.fatG : dbEst.fatG,
    };
  });

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
        'No matching foods found in offline database. Add items manually or connect to internet for Gemini photo scanning.',
      timestamp: new Date().toISOString(),
      imageUrl,
    };
  }

  const totalCalories = Math.round(items.reduce((acc, it) => acc + it.calories, 0));
  const totalProtein = Number(items.reduce((acc, it) => acc + it.proteinG, 0).toFixed(1));
  const totalCarbs = Number(items.reduce((acc, it) => acc + it.carbsG, 0).toFixed(1));
  const totalFat = Number(items.reduce((acc, it) => acc + it.fatG, 0).toFixed(1));

  return {
    mealName: userNotes ? `Meal (${userNotes.slice(0, 25)})` : 'Custom Food Entry',
    items,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    hiddenIngredients: hiddenIngredients || [],
    confidence: 'medium',
    coachingNote:
      'Estimated nutrition from offline database matching your notes. Review and adjust portions before saving.',
    timestamp: new Date().toISOString(),
    imageUrl,
  };
}
