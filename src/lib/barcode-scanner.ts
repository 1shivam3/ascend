/**
 * Barcode scanner engine selection.
 *
 * Native `BarcodeDetector` (Chromium / Android WebView) decodes EAN-13 at the
 * OS level and is dramatically faster and more reliable on phones than a
 * JavaScript decoder. Browsers without it (e.g. iOS Safari) fall back to
 * ZXing's `BrowserMultiFormatReader`.
 */

export type ScannerEngine = 'native' | 'zxing';

/** Retail barcode symbologies requested from the native detector. */
export type NativeBarcodeFormat =
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e'
  | 'code_128'
  | 'code_39'
  | 'itf';

export const NATIVE_BARCODE_FORMATS: NativeBarcodeFormat[] = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
];

/** Minimal Shape Detection API typing (absent from this project's TS DOM lib). */
export interface NativeDetectedBarcode {
  rawValue: string;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: NativeBarcodeFormat[] }) => {
      detect(source: ImageBitmapSource): Promise<NativeDetectedBarcode[]>;
    };
  }
}

/**
 * QA4-027: GTIN check-digit validation for the standard retail lengths
 * (EAN-8 = 8, UPC-A = 12, EAN-13 = 13). One unified rule covers all
 * three: reading from the rightmost digit (the check digit, weight 1),
 * weights alternate 1, 3, 1, 3… and the total must be ≡ 0 (mod 10).
 * Codes of any other length (or containing non-digits) cannot be
 * check-validated and return false here — callers should only invoke
 * this for 8/12/13-digit input.
 */
export function hasValidGtinCheckDigit(code: string): boolean {
  const clean = (code || '').replace(/\D/g, '');
  if (![8, 12, 13].includes(clean.length)) return false;
  let sum = 0;
  for (let i = 0; i < clean.length; i++) {
    const digit = clean.charCodeAt(clean.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

/** True when a manually typed code is a plausible, check-valid barcode. */
export function isValidManualBarcode(code: string): boolean {
  const clean = (code || '').replace(/\D/g, '');
  if (clean.length < 8 || clean.length > 14) return false;
  if ((code || '').replace(/[\d\s-]/g, '') !== '') return false;
  // Standard lengths carry a check digit — verify it. Other lengths
  // (e.g. EAN-14) have no client-verifiable rule; accept digits only.
  if ([8, 12, 13].includes(clean.length)) return hasValidGtinCheckDigit(clean);
  return true;
}

/**
 * QA4-027: per-100g macro sanity for user-entered custom barcodes.
 * Values are PER 100 g, so protein/carbs/fat can never exceed 100 g,
 * and calories have a physical ceiling (~900 kcal/100g for pure fat) —
 * capped at 1000 for headroom. Returns a user-facing error or null.
 */
export function validatePer100gMacros(m: {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): string | null {
  const fields: Array<[string, number, number]> = [
    ['Protein', m.proteinG, 100],
    ['Carbs', m.carbsG, 100],
    ['Fat', m.fatG, 100],
    ['Calories', m.calories, 1000],
  ];
  for (const [label, value, max] of fields) {
    if (!Number.isFinite(value) || value < 0 || value > max) {
      return `${label} must be between 0 and ${max}${label === 'Calories' ? ' kcal' : ' g'} per 100 g — check the product label and try again.`;
    }
  }
  if (m.proteinG + m.carbsG + m.fatG > 100) {
    return 'Protein + carbs + fat add up to more than 100 g per 100 g — check the product label and try again.';
  }
  return null;
}

/** True when the OS-level detector is available in this browser. */
export function supportsNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/** Pick the fastest available decode engine for this browser. */
export function selectScannerEngine(): ScannerEngine {
  return supportsNativeBarcodeDetector() ? 'native' : 'zxing';
}
