'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Camera,
  RefreshCw,
  Search,
  Check,
  AlertCircle,
  Sparkles,
  Star,
  Plus,
  Loader2,
  Barcode as BarcodeIcon,
  Maximize2
} from 'lucide-react';
import { FoodItem } from '@/lib/types';
import { fetchProductByBarcode, ScannedProduct, scannedProductToFoodItem } from '@/lib/openfoodfacts';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFood: (food: FoodItem) => void;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onAddFood,
}: BarcodeScannerModalProps) {
  const toast = useToast();
  const addFavoriteFood = useStore((state) => state.addFavoriteFood);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef<boolean>(false);

  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [servingMode, setServingMode] = useState<'100g' | 'serving'>('100g');
  const [customQty, setCustomQty] = useState<number>(100);
  const [isFavorite, setIsFavorite] = useState(false);

  // Manual fallback editable values if not found in DB
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('0');
  const [manualProtein, setManualProtein] = useState('0');
  const [manualCarbs, setManualCarbs] = useState('0');
  const [manualFat, setManualFat] = useState('0');
  const [isNotFoundInDB, setIsNotFoundInDB] = useState(false);

  // Play scanner success feedback
  const playScanFeedback = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 80]);
      }
    } catch {}
  }, []);

  const stopCamera = useCallback(() => {
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch {}
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  // Handle scanned barcode lookup
  const handleBarcodeFound = useCallback(async (code: string) => {
    const clean = code.trim().replace(/\D/g, '');
    if (!clean || clean.length < 5) {
      isProcessingRef.current = false;
      return;
    }

    // Guard against multiple simultaneous lookups
    isProcessingRef.current = true;
    playScanFeedback();
    stopCamera();
    setIsLoadingProduct(true);
    setCameraError(null);

    const product = await fetchProductByBarcode(clean);
    setIsLoadingProduct(false);

    if (product) {
      setScannedProduct(product);
      setIsNotFoundInDB(false);
      setManualName(product.name);
      setManualCalories(String(product.per100g.calories));
      setManualProtein(String(product.per100g.proteinG));
      setManualCarbs(String(product.per100g.carbsG));
      setManualFat(String(product.per100g.fatG));

      if (product.perServing) {
        setServingMode('serving');
        setCustomQty(1);
      } else {
        setServingMode('100g');
        setCustomQty(100);
      }
      toast.success(`Found ${product.name}!`, 'Product Verified');
    } else {
      // Product not found in DB - show single polite inline card, NO loop!
      setIsNotFoundInDB(true);
      setManualName(`Scanned Item (${clean})`);
      setManualCalories('100');
      setManualProtein('5');
      setManualCarbs('15');
      setManualFat('2');
      setServingMode('100g');
      setCustomQty(100);

      setScannedProduct({
        barcode: clean,
        name: `Scanned Item (${clean})`,
        per100g: { calories: 100, proteinG: 5, carbsG: 15, fatG: 2 },
      });
      toast.info(`Barcode ${clean} scanned. Enter label details below to save.`, 'Item Scanned');
    }
  }, [playScanFeedback, stopCamera, toast]);

  // Start Camera with ZXing
  const startCamera = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setCameraError(null);
    setScannedProduct(null);
    setIsNotFoundInDB(false);
    isProcessingRef.current = false;

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScanning(true);
      setHasCamera(true);

      const codeReader = new BrowserMultiFormatReader();
      readerRef.current = codeReader;

      codeReader.decodeFromVideoElement(videoRef.current!, (result, err) => {
        if (result && !isProcessingRef.current) {
          const text = result.getText();
          if (text && text.trim().length >= 5) {
            isProcessingRef.current = true;
            handleBarcodeFound(text);
          }
        }
      });
    } catch (err: any) {
      console.warn('Camera initialization error:', err);
      setHasCamera(false);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in browser settings, or enter barcode below.'
          : 'Unable to access camera. You can still type the barcode manually below.'
      );
    }
  }, [handleBarcodeFound]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setScannedProduct(null);
      setManualBarcode('');
      isProcessingRef.current = false;
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  const currentFoodItem: FoodItem | null = scannedProduct
    ? isNotFoundInDB
      ? {
          name: manualName.trim() || `Item ${scannedProduct.barcode}`,
          quantity: customQty,
          unit: 'g',
          calories: Math.round((parseFloat(manualCalories) || 0) * (customQty / 100)),
          proteinG: Number(((parseFloat(manualProtein) || 0) * (customQty / 100)).toFixed(1)),
          carbsG: Number(((parseFloat(manualCarbs) || 0) * (customQty / 100)).toFixed(1)),
          fatG: Number(((parseFloat(manualFat) || 0) * (customQty / 100)).toFixed(1)),
        }
      : scannedProductToFoodItem(scannedProduct, servingMode, customQty)
    : null;

  const handleAddAndClose = () => {
    if (!currentFoodItem) return;
    onAddFood(currentFoodItem);

    if (isFavorite && scannedProduct) {
      addFavoriteFood({
        name: currentFoodItem.name,
        defaultQuantity: currentFoodItem.quantity,
        unit: currentFoodItem.unit || 'g',
        calories: currentFoodItem.calories,
        proteinG: currentFoodItem.proteinG,
        carbsG: currentFoodItem.carbsG,
        fatG: currentFoodItem.fatG,
        barcode: scannedProduct.barcode,
      });
      toast.success(`Pinned ${currentFoodItem.name} to Frequent Favorites!`, 'Favorite Saved');
    }

    onClose();
  };

  const handleScanAgain = () => {
    setScannedProduct(null);
    setIsNotFoundInDB(false);
    setManualBarcode('');
    isProcessingRef.current = false;
    startCamera();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full overflow-hidden p-0 bg-bg-card border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-bg-elevated/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
              <BarcodeIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary leading-none">Barcode Scanner</h2>
              <span className="text-[10px] text-text-muted font-mono">Open Food Facts & Indian Groceries</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Camera Viewport */}
          {!scannedProduct && !isLoadingProduct && (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-border/70 flex items-center justify-center shadow-inner">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />

              {/* Viewport Reticle Overlay */}
              {isScanning && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-64 h-36 border-2 border-accent/70 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(255,107,31,0.3)]">
                    <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-pulse" />
                    <span className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-accent" />
                    <span className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-accent" />
                    <span className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-accent" />
                    <span className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-accent" />
                  </div>
                  <span className="absolute bottom-3 text-center text-2xs font-mono text-white/80 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-xs">
                    Align barcode inside frame
                  </span>
                </div>
              )}

              {/* Camera Error / Fallback display */}
              {cameraError && (
                <div className="absolute inset-0 p-4 bg-bg-card/95 flex flex-col items-center justify-center text-center">
                  <AlertCircle className="w-8 h-8 text-warning mb-2" />
                  <p className="text-xs text-text-primary font-medium">{cameraError}</p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-xs text-accent font-mono flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {isLoadingProduct && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-sm font-semibold text-text-primary">Searching nutrition database...</p>
              <p className="text-2xs text-text-muted font-mono">Verifying nutrition facts & macros</p>
            </div>
          )}

          {/* Scanned Product Card */}
          {scannedProduct && currentFoodItem && (
            <div className="space-y-3.5 animate-fade-in">
              <div className="p-3.5 rounded-xl bg-bg-elevated/70 border border-accent/40 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 mr-2">
                    {scannedProduct.brand && (
                      <span className="text-[10px] font-mono text-accent font-semibold tracking-wider uppercase block">
                        {scannedProduct.brand}
                      </span>
                    )}
                    {isNotFoundInDB ? (
                      <div className="space-y-1">
                        <span className="text-2xs text-amber-500 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Not in online DB — Enter package details:
                        </span>
                        <input
                          type="text"
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          placeholder="Food name (e.g. Protein Bar)"
                          className="w-full bg-bg-card border border-border rounded-lg px-2.5 py-1 text-xs text-text-primary font-bold outline-none focus:border-accent"
                        />
                      </div>
                    ) : (
                      <h3 className="text-base font-bold text-text-primary leading-tight">
                        {scannedProduct.name}
                      </h3>
                    )}
                    <span className="text-2xs text-text-muted font-mono block mt-0.5">
                      Barcode: {scannedProduct.barcode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleScanAgain}
                    className="text-xs font-mono text-text-muted hover:text-accent flex items-center gap-1 shrink-0 p-1.5 rounded-lg bg-bg-card border border-border"
                  >
                    <RefreshCw className="w-3 h-3" /> Scan Again
                  </button>
                </div>

                {/* If Not Found in DB: Editable per-100g fields */}
                {isNotFoundInDB && (
                  <div className="p-2.5 rounded-lg bg-bg-card border border-border space-y-1.5">
                    <span className="text-[10px] font-mono text-text-muted uppercase block">
                      Nutrition per 100g (from label):
                    </span>
                    <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
                      <div>
                        <span className="text-[9px] text-text-muted block">Calories</span>
                        <input
                          type="number"
                          value={manualCalories}
                          onChange={(e) => setManualCalories(e.target.value)}
                          className="w-full bg-bg-secondary border border-border rounded p-1 text-center font-bold text-accent outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-text-muted block">Protein (g)</span>
                        <input
                          type="number"
                          value={manualProtein}
                          onChange={(e) => setManualProtein(e.target.value)}
                          className="w-full bg-bg-secondary border border-border rounded p-1 text-center font-bold text-emerald-500 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-text-muted block">Carbs (g)</span>
                        <input
                          type="number"
                          value={manualCarbs}
                          onChange={(e) => setManualCarbs(e.target.value)}
                          className="w-full bg-bg-secondary border border-border rounded p-1 text-center font-bold text-text-primary outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-text-muted block">Fat (g)</span>
                        <input
                          type="number"
                          value={manualFat}
                          onChange={(e) => setManualFat(e.target.value)}
                          className="w-full bg-bg-secondary border border-border rounded p-1 text-center font-bold text-text-primary outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Serving Mode Switcher if available */}
                {scannedProduct.perServing && !isNotFoundInDB && (
                  <div className="flex gap-2 pt-1 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setServingMode('serving');
                        setCustomQty(1);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-center transition-colors ${
                        servingMode === 'serving'
                          ? 'bg-accent/20 border-accent text-accent font-bold'
                          : 'bg-bg-secondary border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      Per Serving {scannedProduct.servingSize ? `(${scannedProduct.servingSize})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setServingMode('100g');
                        setCustomQty(100);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-center transition-colors ${
                        servingMode === '100g'
                          ? 'bg-accent/20 border-accent text-accent font-bold'
                          : 'bg-bg-secondary border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      Per 100g
                    </button>
                  </div>
                )}

                {/* Quantity Input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs font-mono text-text-muted">Portion:</span>
                  <input
                    type="number"
                    min="0.1"
                    step={servingMode === 'serving' && !isNotFoundInDB ? '1' : '10'}
                    value={customQty}
                    onChange={(e) => setCustomQty(Math.max(0.1, Number(e.target.value)))}
                    className="w-24 bg-bg-card border border-border rounded-lg p-1.5 text-center text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
                  />
                  <span className="text-xs font-mono text-text-secondary">
                    {servingMode === 'serving' && !isNotFoundInDB ? 'serving(s)' : 'grams (g)'}
                  </span>
                </div>

                {/* Calculated Macros Grid */}
                <div className="grid grid-cols-4 gap-2 pt-1 text-center font-mono">
                  <div className="p-2 rounded-lg bg-bg-primary border border-border">
                    <span className="text-xs font-bold text-accent block">
                      {currentFoodItem.calories}
                    </span>
                    <span className="text-[10px] text-text-muted uppercase">CAL</span>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-primary border border-border">
                    <span className="text-xs font-bold text-emerald-500 block">
                      {currentFoodItem.proteinG}g
                    </span>
                    <span className="text-[10px] text-text-muted uppercase">PRO</span>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-primary border border-border">
                    <span className="text-xs font-bold text-text-primary block">
                      {currentFoodItem.carbsG}g
                    </span>
                    <span className="text-[10px] text-text-muted uppercase">CARB</span>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-primary border border-border">
                    <span className="text-xs font-bold text-text-primary block">
                      {currentFoodItem.fatG}g
                    </span>
                    <span className="text-[10px] text-text-muted uppercase">FAT</span>
                  </div>
                </div>

                {/* Pin to Favorites Checkbox */}
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isFavorite}
                    onChange={(e) => setIsFavorite(e.target.checked)}
                    className="accent-accent w-4 h-4 rounded"
                  />
                  <span className="text-xs text-text-secondary flex items-center gap-1 font-mono">
                    <Star className={`w-3.5 h-3.5 ${isFavorite ? 'text-accent fill-accent' : 'text-text-muted'}`} />
                    Pin to Frequent Favorites for 1-tap logging
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleScanAgain}
                  className="btn-ghost flex-1 text-xs"
                >
                  Scan Another
                </button>
                <button
                  type="button"
                  onClick={handleAddAndClose}
                  className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add to Meal
                </button>
              </div>
            </div>
          )}

          {/* Manual Barcode Input Fallback */}
          {!scannedProduct && !isLoadingProduct && (
            <div className="p-3 rounded-xl bg-bg-elevated/40 border border-border/80 space-y-2">
              <label className="text-2xs font-mono text-text-muted uppercase block">
                Or Enter Barcode Manually
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 8901491101907 (Quaker Oats)"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBarcodeFound(manualBarcode);
                  }}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-1.5 text-text-primary text-xs font-mono outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => handleBarcodeFound(manualBarcode)}
                  disabled={!manualBarcode.trim()}
                  className="btn-primary px-3 py-1.5 text-xs font-mono disabled:opacity-40 flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5" /> Lookup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
