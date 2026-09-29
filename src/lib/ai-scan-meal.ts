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
 * Downsamples to max 1200px width/height and ~80% JPEG quality (~200KB).
 */
export async function compressImageFile(
  file: File | Blob,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    // If running server-side (fallback)
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

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

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
          resolve({
            base64: e.target?.result as string,
            mimeType: file.type || 'image/jpeg',
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          base64: compressedDataUrl,
          mimeType: 'image/jpeg',
        });
      };
      img.onerror = () => {
        resolve({
          base64: e.target?.result as string,
          mimeType: file.type || 'image/jpeg',
        });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Sends compressed meal photo to Gemini AI for identification and macro breakdown.
 */
export async function analyzeMealPhoto(options: ScanMealOptions): Promise<MealAnalysisResult> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline) {
    return generateOfflineMealEstimate(options.userNotes, options.hiddenIngredients);
  }

  const { base64, mimeType } = await compressImageFile(options.file);

  try {
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
      throw new Error(errData.message || `API error ${response.status}`);
    }

    const data: MealAnalysisResult = await response.json();
    return {
      ...data,
      imageUrl: base64,
    };
  } catch (err: any) {
    console.warn('Online meal scan failed, using fallback heuristic:', err);
    // If the API call fails (quota or offline), provide graceful local estimate
    return generateOfflineMealEstimate(options.userNotes, options.hiddenIngredients, base64);
  }
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
      calories: item.calories > 0 && item.estimatedGrams === dbEst.quantity ? item.calories : dbEst.calories,
      proteinG: item.proteinG > 0 && item.estimatedGrams === dbEst.quantity ? item.proteinG : dbEst.proteinG,
      carbsG: item.carbsG > 0 && item.estimatedGrams === dbEst.quantity ? item.carbsG : dbEst.carbsG,
      fatG: item.fatG > 0 && item.estimatedGrams === dbEst.quantity ? item.fatG : dbEst.fatG,
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
 */
export function generateOfflineMealEstimate(
  userNotes?: string,
  hiddenIngredients?: string[],
  imageUrl?: string
): MealAnalysisResult {
  const notesLower = (userNotes || '').toLowerCase();
  const items: ScannedFoodItem[] = [];

  // Parse common items if mentioned in user notes
  if (notesLower.includes('roti') || notesLower.includes('chapati')) {
    const qtyMatch = notesLower.match(/(\d+)\s*(roti|chapati)/);
    const count = qtyMatch ? parseInt(qtyMatch[1], 10) : 2;
    const est = estimateMacros('roti', count, 'piece');
    items.push({
      name: 'Roti',
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

  // Default balanced meal if no notes matched
  if (items.length === 0) {
    const rotiEst = estimateMacros('roti', 2, 'piece');
    const dalEst = estimateMacros('dal', 180, 'g');
    const riceEst = estimateMacros('rice', 150, 'g');

    items.push(
      {
        name: 'Roti / Chapati',
        quantity: '2 pieces',
        estimatedGrams: 80,
        calories: rotiEst.calories,
        proteinG: rotiEst.proteinG,
        carbsG: rotiEst.carbsG,
        fatG: rotiEst.fatG,
        confidence: 'medium',
      },
      {
        name: 'Dal (Lentils)',
        quantity: '1 bowl (180g)',
        estimatedGrams: 180,
        calories: dalEst.calories,
        proteinG: dalEst.proteinG,
        carbsG: dalEst.carbsG,
        fatG: dalEst.fatG,
        confidence: 'medium',
      },
      {
        name: 'Cooked Rice',
        quantity: '1 cup (150g)',
        estimatedGrams: 150,
        calories: riceEst.calories,
        proteinG: riceEst.proteinG,
        carbsG: riceEst.carbsG,
        fatG: riceEst.fatG,
        confidence: 'medium',
      }
    );
  }

  // Hidden ingredients (Ghee/Oil)
  if (hiddenIngredients?.some((h) => h.toLowerCase().includes('oil') || h.toLowerCase().includes('ghee'))) {
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

  const totalCalories = Math.round(items.reduce((acc, it) => acc + it.calories, 0));
  const totalProtein = Number(items.reduce((acc, it) => acc + it.proteinG, 0).toFixed(1));
  const totalCarbs = Number(items.reduce((acc, it) => acc + it.carbsG, 0).toFixed(1));
  const totalFat = Number(items.reduce((acc, it) => acc + it.fatG, 0).toFixed(1));

  return {
    mealName: userNotes ? `Meal (${userNotes.slice(0, 20)}...)` : 'Balanced Nutrition Plate',
    items,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    hiddenIngredients: hiddenIngredients || [],
    confidence: 'medium',
    coachingNote: 'Estimated nutrition from local database. Review and adjust portions before saving.',
    timestamp: new Date().toISOString(),
    imageUrl,
  };
}
