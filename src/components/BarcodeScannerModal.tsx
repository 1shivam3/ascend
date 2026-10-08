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
  ChevronRight,
  Utensils,
} from 'lucide-react';
import { FoodItem } from '@/lib/types';
import { fetchProductByBarcode, ScannedProduct, scannedProductToFoodItem } from '@/lib/openfoodfacts';
import { getFoodSuggestions, estimateMacros } from '@/lib/macros';
import { saveCustomBarcode } from '@/lib/storage';
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
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<any>(null);
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
  const [manualBrand, setManualBrand] = useState('');
  const [manualCalories, setManualCalories] = useState('120');
  const [manualProtein, setManualProtein] = useState('10');
  const [manualCarbs, setManualCarbs] = useState('15');
  const [manualFat, setManualFat] = useState('3');
  const [isNotFoundInDB, setIsNotFoundInDB] = useState(false);
  const [foodSuggestions, setFoodSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Play audio/haptic feedback ONCE upon successful scan
  const playScanFeedback = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([60]);
      }
    } catch {}
  }, []);

  // Hard stop camera and reader controls
  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {}
      controlsRef.current = null;
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

  // Handle scanned barcode lookup (ONE TIME scan trigger)
  const handleBarcodeFound = useCallback(async (code: string) => {
    const clean = code.trim().replace(/\D/g, '');
    if (!clean || clean.length < 5) {
      isProcessingRef.current = false;
      return;
    }

    // Single-scan lock: Stop immediately so camera does NOT scan again
    isProcessingRef.current = true;
    playScanFeedback();
    stopCamera();
    setIsLoadingProduct(true);
    setCameraError(null);
    setShowSuggestions(false);

    try {
      const product = await fetchProductByBarcode(clean);
      setIsLoadingProduct(false);

      if (product) {
        setScannedProduct(product);
        setIsNotFoundInDB(false);
        setManualName(product.name);
        setManualBrand(product.brand || '');
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
      } else {
        // Product not found in open DB: present clean editable card to ask user
        setIsNotFoundInDB(true);
        setManualName('');
        setManualBrand('');
        setManualCalories('120');
        setManualProtein('10');
        setManualCarbs('15');
        setManualFat('3');
        setServingMode('100g');
        setCustomQty(100);

        setScannedProduct({
          barcode: clean,
          name: '',
          per100g: { calories: 120, proteinG: 10, carbsG: 15, fatG: 3 },
        });
      }
    } catch {
      setIsLoadingProduct(false);
      setIsNotFoundInDB(true);
      setManualName('');
      setManualBrand('');
      setManualCalories('120');
      setManualProtein('10');
      setManualCarbs('15');
      setManualFat('3');
      setScannedProduct({
        barcode: clean,
        name: '',
        per100g: { calories: 120, proteinG: 10, carbsG: 15, fatG: 3 },
      });
    }
  }, [playScanFeedback, stopCamera]);


  // Start Camera with ZXing and capture scanner controls
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

      // Store controls for stopping exactly after first read
      const controls = await codeReader.decodeFromVideoElement(videoRef.current!, (result, err) => {
        if (result && !isProcessingRef.current) {
          const text = result.getText();
          if (text && text.trim().length >= 5) {
            isProcessingRef.current = true;
            if (controlsRef.current) {
              try {
                controlsRef.current.stop();
              } catch {}
            }
            handleBarcodeFound(text);
          }
        }
      });
      controlsRef.current = controls;
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

  const handleManualNameChange = (val: string) => {
    setManualName(val);
    if (val.trim().length >= 2) {
      const suggestions = getFoodSuggestions(val);
      setFoodSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);

      // Auto estimate if matched
      const est = estimateMacros(val, 100, 'g');
      if (est && est.calories > 0) {
        setManualCalories(String(est.calories));
        setManualProtein(String(est.proteinG));
        setManualCarbs(String(est.carbsG));
        setManualFat(String(est.fatG));
      }
    } else {
      setFoodSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (s: string) => {
    setManualName(s);
    setShowSuggestions(false);
    const est = estimateMacros(s, 100, 'g');
    if (est && est.calories > 0) {
      setManualCalories(String(est.calories));
      setManualProtein(String(est.proteinG));
      setManualCarbs(String(est.carbsG));
      setManualFat(String(est.fatG));
    }
  };

  const calPer100 = parseFloat(manualCalories) || 0;
  const proPer100 = parseFloat(manualProtein) || 0;
  const carbPer100 = parseFloat(manualCarbs) || 0;
  const fatPer100 = parseFloat(manualFat) || 0;
  const factor = customQty / 100;

  const currentFoodItem: FoodItem | null = scannedProduct
    ? isNotFoundInDB
      ? {
          name: manualBrand.trim()
            ? `${manualName.trim() || 'Scanned Food'} (${manualBrand.trim()})`
            : manualName.trim() || `Scanned Item (${scannedProduct.barcode})`,
          quantity: customQty,
          unit: 'g',
          calories: Math.round(calPer100 * factor),
          proteinG: Number((proPer100 * factor).toFixed(1)),
          carbsG: Number((carbPer100 * factor).toFixed(1)),
          fatG: Number((fatPer100 * factor).toFixed(1)),
        }
      : scannedProductToFoodItem(scannedProduct, servingMode, customQty)
    : null;

  // Explicit user confirmation to add food
  const handleConfirmAddToMeal = () => {
    if (!currentFoodItem) return;
    onAddFood(currentFoodItem);

    if (isNotFoundInDB && scannedProduct) {
      saveCustomBarcode({
        barcode: scannedProduct.barcode,
        name: manualName.trim() || currentFoodItem.name,
        brand: manualBrand.trim() || undefined,
        per100g: {
          calories: Math.round(calPer100),
          proteinG: Number(proPer100.toFixed(1)),
          carbsG: Number(carbPer100.toFixed(1)),
          fatG: Number(fatPer100.toFixed(1)),
        },
        servingSize: `${customQty}g`,
        servingQuantity: customQty,
        updatedAt: Date.now(),
      });
      toast.success(
        `Added "${currentFoodItem.name}" & saved barcode for future scans!`,
        'Barcode Remembered'
      );
    } else {
      toast.success(`Added "${currentFoodItem.name}" to today's meals!`, 'Meal Logged');
    }

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
    }

    onClose();
  };

  const handleScanAgain = () => {
    stopCamera();
    setScannedProduct(null);
    setIsNotFoundInDB(false);
    setManualBarcode('');
    setManualName('');
    setManualBrand('');
    setShowSuggestions(false);
    isProcessingRef.current = false;
    startCamera();
  };

  return (
    <div className="modal-overlay z-50" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full overflow-hidden p-0 bg-bg-card border border-border rounded-3xl shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border/70 flex items-center justify-between bg-bg-card/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 text-accent flex items-center justify-center">
              <BarcodeIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary leading-tight">Barcode Scanner</h2>
              <span className="text-2xs text-text-muted font-mono">Scan package to log food</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Camera Viewport (Active only when no product is captured yet) */}
          {!scannedProduct && !isLoadingProduct && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-border/80 flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />

                {/* Viewport Reticle Overlay */}
                {isScanning && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-64 h-32 border-2 border-accent rounded-xl overflow-hidden shadow-[0_0_24px_rgba(249,115,22,0.35)]">
                      <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-pulse" />
                      <span className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-accent" />
                      <span className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-accent" />
                      <span className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-accent" />
                      <span className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-accent" />
                    </div>
                    <span className="absolute bottom-3 text-center text-3xs font-mono font-semibold text-white/90 bg-black/70 px-3 py-1 rounded-full backdrop-blur-xs">
                      Align barcode inside frame • Scans once
                    </span>
                  </div>
                )}

                {/* Camera Error / Fallback display */}
                {cameraError && (
                  <div className="absolute inset-0 p-4 bg-bg-card/95 flex flex-col items-center justify-center text-center z-10 overflow-y-auto">
                    <AlertCircle className="w-7 h-7 text-amber-500 mb-1.5 shrink-0" />
                    <p className="text-xs text-text-primary font-medium">{cameraError}</p>
                    <p className="text-3xs text-text-muted mt-0.5 mb-3">
                      Enter the barcode number manually to lookup nutrition facts:
                    </p>
                    <div className="w-full max-w-xs space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="e.g. 8901491101907"
                          value={manualBarcode}
                          onChange={(e) => setManualBarcode(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleBarcodeFound(manualBarcode);
                          }}
                          className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-1.5 text-text-primary text-xs font-mono outline-none focus:border-accent text-center"
                        />
                        <button
                          type="button"
                          onClick={() => handleBarcodeFound(manualBarcode)}
                          disabled={!manualBarcode.trim()}
                          className="btn-primary px-3.5 py-1.5 text-xs font-mono disabled:opacity-40 flex items-center gap-1 shrink-0 rounded-xl cursor-pointer"
                        >
                          <Search className="w-3.5 h-3.5" /> Lookup
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="w-full py-2 rounded-xl bg-bg-secondary border border-border text-xs text-accent font-semibold flex items-center justify-center gap-1.5 hover:bg-bg-secondary/80 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Barcode Input Fallback */}
              {!cameraError && (
                <div className="p-3 rounded-2xl bg-bg-secondary/40 border border-border/70 space-y-2">
                  <span className="text-3xs font-mono text-text-muted uppercase font-semibold block">
                    Or Enter Barcode Manually
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 8901491101907"
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBarcodeFound(manualBarcode);
                      }}
                      className="w-full bg-bg-card border border-border rounded-xl px-3 py-1.5 text-text-primary text-xs font-mono outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => handleBarcodeFound(manualBarcode)}
                      disabled={!manualBarcode.trim()}
                      className="btn-primary px-3.5 py-1.5 text-xs font-mono disabled:opacity-40 flex items-center gap-1 shrink-0 rounded-xl cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" /> Lookup
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {isLoadingProduct && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-sm font-semibold text-text-primary">Searching nutrition database...</p>
              <p className="text-2xs text-text-muted font-mono">Verifying nutrition facts &amp; macros</p>
            </div>
          )}

          {/* Scanned Product Confirmation Card (ASK USER TO ADD TO TODAY'S MEALS) */}
          {scannedProduct && currentFoodItem && (
            <div className="space-y-4 animate-scale-in">
              <div className={`p-4 rounded-2xl bg-bg-secondary/50 border-2 space-y-3.5 shadow-sm ${
                isNotFoundInDB ? 'border-amber-500/40' : 'border-emerald-500/40'
              }`}>
                {/* Confirmation Prompt Header */}
                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isNotFoundInDB ? 'bg-amber-400' : 'bg-emerald-500'} animate-pulse`} />
                    <span className={`text-2xs font-mono font-bold uppercase tracking-wider ${
                      isNotFoundInDB ? 'text-amber-400' : 'text-emerald-500'
                    }`}>
                      {isNotFoundInDB ? 'NEW / CUSTOM BARCODE' : 'PRODUCT VERIFIED'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleScanAgain}
                    className="text-2xs font-mono text-text-muted hover:text-accent flex items-center gap-1 px-2 py-1 rounded-lg bg-bg-card border border-border cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Scan Another
                  </button>
                </div>

                {/* If Not in DB: Friendly Info and Search/Edit UI */}
                {isNotFoundInDB ? (
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-0.5">
                      <p className="font-semibold text-amber-300 flex items-center gap-1.5 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Package not in global database yet
                      </p>
                      <p className="text-3xs text-text-muted leading-relaxed">
                        Enter food name to auto-fill nutrition, or adjust macros below. ASCEND will remember this barcode for all future scans!
                      </p>
                    </div>

                    {/* Food Name input with autocomplete */}
                    <div className="relative">
                      <label className="text-2xs font-mono font-semibold text-text-muted uppercase block mb-1">
                        Food Name <span className="text-accent">*</span>
                      </label>
                      <input
                        type="text"
                        value={manualName}
                        onChange={(e) => handleManualNameChange(e.target.value)}
                        placeholder="e.g. Paneer, Peanut Butter, Oats, Chicken..."
                        className="w-full bg-bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary font-bold outline-none focus:border-accent"
                        autoFocus
                      />
                      {showSuggestions && foodSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden divide-y divide-border/40 max-h-48 overflow-y-auto">
                          {foodSuggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleSelectSuggestion(s)}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-secondary flex items-center justify-between cursor-pointer"
                            >
                              <span>{s}</span>
                              <span className="text-3xs font-mono text-accent">Auto-fill macros</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Brand input (optional) */}
                    <div>
                      <label className="text-2xs font-mono font-semibold text-text-muted uppercase block mb-1">
                        Brand (Optional)
                      </label>
                      <input
                        type="text"
                        value={manualBrand}
                        onChange={(e) => setManualBrand(e.target.value)}
                        placeholder="e.g. Amul, MuscleBlaze, Britannia, Local Dairy"
                        className="w-full bg-bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                      />
                    </div>

                    {/* Editable Macros per 100g */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-2xs font-mono font-semibold text-text-muted uppercase">
                          Nutrition per 100g
                        </label>
                        <span className="text-3xs font-mono text-accent">Editable</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="bg-bg-card p-1.5 rounded-xl border border-border text-center">
                          <span className="text-3xs font-mono text-text-muted block mb-0.5">Calories</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={manualCalories}
                            onChange={(e) => setManualCalories(e.target.value)}
                            className="w-full text-center font-mono font-bold text-xs text-accent bg-transparent outline-none tabular-nums p-0"
                          />
                        </div>
                        <div className="bg-bg-card p-1.5 rounded-xl border border-border text-center">
                          <span className="text-3xs font-mono text-text-muted block mb-0.5">Protein</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={manualProtein}
                            onChange={(e) => setManualProtein(e.target.value)}
                            className="w-full text-center font-mono font-bold text-xs text-emerald-500 bg-transparent outline-none tabular-nums p-0"
                          />
                        </div>
                        <div className="bg-bg-card p-1.5 rounded-xl border border-border text-center">
                          <span className="text-3xs font-mono text-text-muted block mb-0.5">Carbs</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={manualCarbs}
                            onChange={(e) => setManualCarbs(e.target.value)}
                            className="w-full text-center font-mono font-bold text-xs text-text-primary bg-transparent outline-none tabular-nums p-0"
                          />
                        </div>
                        <div className="bg-bg-card p-1.5 rounded-xl border border-border text-center">
                          <span className="text-3xs font-mono text-text-muted block mb-0.5">Fat</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={manualFat}
                            onChange={(e) => setManualFat(e.target.value)}
                            className="w-full text-center font-mono font-bold text-xs text-text-primary bg-transparent outline-none tabular-nums p-0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Verified Product Display */
                  <div>
                    {scannedProduct.brand && (
                      <span className="text-3xs font-mono text-accent font-bold tracking-wider uppercase block mb-0.5">
                        {scannedProduct.brand}
                      </span>
                    )}
                    <h3 className="text-base font-bold text-text-primary leading-snug">
                      {scannedProduct.name}
                    </h3>
                    <span className="text-3xs text-text-muted font-mono block mt-0.5">
                      Barcode: {scannedProduct.barcode}
                    </span>
                  </div>
                )}

                {/* Serving Mode Switcher if available for verified product */}
                {scannedProduct.perServing && !isNotFoundInDB && (
                  <div className="flex gap-2 pt-0.5 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setServingMode('serving');
                        setCustomQty(1);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-xl border text-center transition-colors cursor-pointer ${
                        servingMode === 'serving'
                          ? 'bg-accent/20 border-accent text-accent font-bold'
                          : 'bg-bg-card border-border text-text-muted hover:text-text-primary'
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
                      className={`flex-1 py-1.5 px-2 rounded-xl border text-center transition-colors cursor-pointer ${
                        servingMode === '100g'
                          ? 'bg-accent/20 border-accent text-accent font-bold'
                          : 'bg-bg-card border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      Per 100g
                    </button>
                  </div>
                )}

                {/* Portion Quantity Stepper */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-card border border-border/70">
                  <span className="text-xs font-semibold text-text-secondary">Your Portion:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step={servingMode === 'serving' && !isNotFoundInDB ? '1' : '10'}
                      value={customQty}
                      onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value) || 1))}
                      className="w-24 bg-bg-secondary border border-border rounded-lg py-1 px-2 text-center text-xs font-mono font-bold text-text-primary outline-none focus:border-accent tabular-nums"
                    />
                    <span className="text-xs font-mono text-text-muted">
                      {servingMode === 'serving' && !isNotFoundInDB ? 'serving(s)' : 'g'}
                    </span>
                  </div>
                </div>

                {/* Calculated Portion Macros Grid */}
                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  <div className="p-2 rounded-xl bg-bg-card border border-border/80">
                    <span className="text-xs font-bold text-accent block">
                      {currentFoodItem.calories}
                    </span>
                    <span className="text-3xs text-text-muted uppercase">CAL</span>
                  </div>
                  <div className="p-2 rounded-xl bg-bg-card border border-border/80">
                    <span className="text-xs font-bold text-emerald-500 block">
                      {currentFoodItem.proteinG}g
                    </span>
                    <span className="text-3xs text-text-muted uppercase">PRO</span>
                  </div>
                  <div className="p-2 rounded-xl bg-bg-card border border-border/80">
                    <span className="text-xs font-bold text-text-primary block">
                      {currentFoodItem.carbsG}g
                    </span>
                    <span className="text-3xs text-text-muted uppercase">CARB</span>
                  </div>
                  <div className="p-2 rounded-xl bg-bg-card border border-border/80">
                    <span className="text-xs font-bold text-text-primary block">
                      {currentFoodItem.fatG}g
                    </span>
                    <span className="text-3xs text-text-muted uppercase">FAT</span>
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

              {/* Question: Add to Today's Meals? */}
              <div className="p-3 rounded-2xl bg-accent/10 border border-accent/30 text-center space-y-1">
                <p className="text-xs font-bold text-text-primary">
                  Add <span className="text-accent">{currentFoodItem.name}</span> to today&apos;s meals?
                </p>
                <p className="text-2xs text-text-muted">
                  Adds ~{currentFoodItem.calories} kcal &amp; {currentFoodItem.proteinG}g protein to your daily macro fuel.
                </p>
              </div>

              {/* Action Buttons: Explicit User Confirmation */}
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleScanAgain}
                  className="btn-secondary flex-1 py-2.5 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Scan Another
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddToMeal}
                  className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-accent/20 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Add to Today&apos;s Meals</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
