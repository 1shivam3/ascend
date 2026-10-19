import { describe, it, expect, afterEach } from 'vitest';
import {
  selectScannerEngine,
  supportsNativeBarcodeDetector,
  NATIVE_BARCODE_FORMATS,
} from '../src/lib/barcode-scanner';

describe('barcode scanner engine selection', () => {
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('falls back to zxing when window is undefined (SSR / node)', () => {
    expect(supportsNativeBarcodeDetector()).toBe(false);
    expect(selectScannerEngine()).toBe('zxing');
  });

  it('uses the native fast path when BarcodeDetector is present', () => {
    (globalThis as any).window = { BarcodeDetector: function () {} };
    expect(supportsNativeBarcodeDetector()).toBe(true);
    expect(selectScannerEngine()).toBe('native');
  });

  it('falls back to zxing when window exists without BarcodeDetector (iOS Safari)', () => {
    (globalThis as any).window = {};
    expect(supportsNativeBarcodeDetector()).toBe(false);
    expect(selectScannerEngine()).toBe('zxing');
  });

  it('requests the retail barcode symbologies natively', () => {
    expect(NATIVE_BARCODE_FORMATS).toEqual(
      expect.arrayContaining(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'])
    );
    expect(NATIVE_BARCODE_FORMATS).toHaveLength(7);
  });
});
