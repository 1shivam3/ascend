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

/** True when the OS-level detector is available in this browser. */
export function supportsNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/** Pick the fastest available decode engine for this browser. */
export function selectScannerEngine(): ScannerEngine {
  return supportsNativeBarcodeDetector() ? 'native' : 'zxing';
}
