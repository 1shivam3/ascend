'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { MealAnalysisResult, ScannedFoodItem, MealEntry, FoodItem } from '@/lib/types';
import { analyzeMealPhoto, recalculateMealResult, generateOfflineMealEstimate } from '@/lib/ai-scan-meal';
import { validateImageFile, resizeAndCompressImage, captureVideoFrame } from '@/lib/image-processing';
import { estimateMacros } from '@/lib/macros';
import { useToast } from '@/components/ui/Toast';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  CheckCircle2,
  Trash2,
  Edit2,
  RefreshCw,
  Plus,
  HelpCircle,
  AlertCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ArrowRight,
  Send,
  Zap,
  Key,
  Check,
} from 'lucide-react';

interface ScanMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMealSaved?: (meal: MealEntry) => void;
}

const HIDDEN_INGREDIENT_OPTIONS = [
  '+ Extra Ghee / Oil',
  '+ Butter / Cream',
  '+ Sugar / Sweet',
  '✓ Normal / Light Oil',
];

export default function ScanMealModal({ isOpen, onClose, onMealSaved }: ScanMealModalProps) {
  const store = useStore();
  const toast = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-app live camera state (bypasses Android OS camera intent to eliminate low-memory crash completely)
  const [isLiveCameraActive, setIsLiveCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCapturingFrame, setIsCapturingFrame] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Gemini API Key config state
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(store.customGeminiKey || '');
  const [isKeySaved, setIsKeySaved] = useState(false);

  // Flow states: 'select' | 'analyzing' | 'review'
  const [step, setStep] = useState<'select' | 'analyzing' | 'review'>('select');

  // Input state: only stores the compact resized/compressed Blob (~80-150KB), NEVER raw 20MB Camera File!
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const [userNotes, setUserNotes] = useState('');
  const [selectedHiddenIngredients, setSelectedHiddenIngredients] = useState<string[]>([]);

  // Result state
  const [analysis, setAnalysis] = useState<MealAnalysisResult | null>(null);
  const [mealName, setMealName] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editGrams, setEditGrams] = useState<number>(100);
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);

  // Error state
  const [scanError, setScanError] = useState<string | null>(null);

  // "Tell AI" refinement state
  const [refinementInput, setRefinementInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // New item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemGrams, setNewItemGrams] = useState(100);

  // Stop in-app camera stream and release camera hardware
  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLiveCameraActive(false);
    setIsCapturingFrame(false);
  }, []);

  // Start in-app camera viewfinder (bypasses Android camera app to prevent low memory crashes)
  const startLiveCamera = useCallback(
    async (facing: 'environment' | 'user' = 'environment') => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        // Fallback: trigger file picker without capture attribute
        fileInputRef.current?.click();
        return;
      }

      setScanError(null);
      setIsLiveCameraActive(true);
      setCameraFacingMode(facing);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('Camera stream error:', err);
        stopLiveCamera();
        if (err.name === 'NotAllowedError') {
          toast.info('Camera permission not granted. You can select a photo from your gallery.', 'Camera Notice');
        } else {
          toast.info('Direct camera stream unavailable. Please choose an image.', 'Camera Notice');
        }
        fileInputRef.current?.click();
      }
    },
    [stopLiveCamera, toast]
  );

  // Snaps frame from in-app video element directly into compressed 1280px Blob
  const handleSnapFrame = async () => {
    if (!videoRef.current || isCapturingFrame) return;

    setIsCapturingFrame(true);
    try {
      const { blob } = await captureVideoFrame(videoRef.current, {
        maxDimension: 1280,
        quality: 0.75,
        format: 'image/jpeg',
      });

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      const objectUrl = URL.createObjectURL(blob);
      previewUrlRef.current = objectUrl;

      // Stop camera hardware stream immediately
      stopLiveCamera();

      setPreviewUrl(objectUrl);
      setProcessedBlob(blob);
    } catch (err: any) {
      console.error('Frame capture failed:', err);
      toast.error('Could not capture frame from camera. Please choose an image.', 'Camera Notice');
      stopLiveCamera();
    } finally {
      setIsCapturingFrame(false);
    }
  };

  const handleFlipCamera = () => {
    const nextFacing = cameraFacingMode === 'environment' ? 'user' : 'environment';
    startLiveCamera(nextFacing);
  };

  // REQUIREMENT 8: Safely revoke object URLs and stop camera when clearing or unmounting
  const cleanupPreview = useCallback(() => {
    stopLiveCamera();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setProcessedBlob(null);
  }, [stopLiveCamera]);

  // Ensure object URLs and camera streams are released on unmount
  useEffect(() => {
    return () => {
      stopLiveCamera();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [stopLiveCamera]);

  if (!isOpen) return null;

  const handleReset = () => {
    stopLiveCamera();
    cleanupPreview();
    setStep('select');
    setUserNotes('');
    setSelectedHiddenIngredients([]);
    setAnalysis(null);
    setMealName('');
    setEditingItemIndex(null);
    setRefinementInput('');
    setShowAddItem(false);
    setScanError(null);
    setShowApiKeyInput(false);
  };

  const handleClose = () => {
    stopLiveCamera();
    handleReset();
    onClose();
  };

  const handleFileSelected = async (file: File) => {
    if (!file) return;

    setScanError(null);

    // REQUIREMENT 11: Maximum input size/resolution guard
    const validation = validateImageFile(file);
    if (!validation.valid) {
      const err = validation.error || 'Invalid image file.';
      setScanError(err);
      toast.error(err, 'Image Notice');
      return;
    }

    setIsProcessingImage(true);

    try {
      // REQUIREMENT 2 & 3: Immediately resize to max 1280px on longest side and compress to JPEG 0.75
      const { blob } = await resizeAndCompressImage(file, {
        maxDimension: 1280,
        quality: 0.75,
        format: 'image/jpeg',
      });

      // REQUIREMENT 8: Revoke any existing preview URL before allocating a new one
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      // REQUIREMENT 4 & 10: Create URL strictly for the small compressed blob (~80-150KB)
      const objectUrl = URL.createObjectURL(blob);
      previewUrlRef.current = objectUrl;

      // Update state with only the small compressed blob and object URL
      setPreviewUrl(objectUrl);
      setProcessedBlob(blob);
    } catch (err: any) {
      console.error('Image compression failed:', err);
      // REQUIREMENT 13: Handle low-memory/processing failure gracefully with user-friendly message
      const isMemError =
        err?.message?.toLowerCase().includes('memory') ||
        err?.name === 'QuotaExceededError' ||
        err?.message?.toLowerCase().includes('quota');

      const message = isMemError
        ? 'Unable to process photo due to low device memory. Try closing background apps, or estimate with the offline database below.'
        : err?.message || 'Failed to process camera image. Please try again.';

      setScanError(message);
      toast.error(message, 'Photo Notice');
      cleanupPreview();
    } finally {
      setIsProcessingImage(false);
    }
  };

  const toggleHiddenIngredient = (item: string) => {
    setSelectedHiddenIngredients((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    store.setCustomGeminiKey(trimmed);
    if (trimmed) {
      toast.success('Custom Gemini API key saved!', 'API Key Saved');
      setIsKeySaved(true);
      setTimeout(() => setIsKeySaved(false), 2000);
      setScanError(null);
    } else {
      toast.info('Custom Gemini API key cleared. Using server default.', 'Key Cleared');
      setScanError(null);
    }
  };

  const applyLearnedPortionPreferences = (result: MealAnalysisResult): MealAnalysisResult => {
    const preferences = store.userPortionPreferences || {};
    if (Object.keys(preferences).length === 0) return result;

    let hasChanges = false;
    const adjustedItems = result.items.map((item) => {
      const prefGrams = preferences[item.name.toLowerCase().trim()];
      if (prefGrams && prefGrams > 0 && prefGrams !== item.estimatedGrams) {
        hasChanges = true;
        const est = estimateMacros(item.name, prefGrams, 'g');
        return {
          ...item,
          estimatedGrams: prefGrams,
          quantity: `${prefGrams}g`,
          calories: est.calories,
          proteinG: est.proteinG,
          carbsG: est.carbsG,
          fatG: est.fatG,
        };
      }
      return item;
    });

    if (hasChanges) {
      return recalculateMealResult(result, adjustedItems);
    }
    return result;
  };

  const handleOfflineEstimate = () => {
    try {
      const rawResult = generateOfflineMealEstimate(
        userNotes.trim() || 'Standard balanced meal',
        selectedHiddenIngredients,
        previewUrl || undefined
      );
      const result = applyLearnedPortionPreferences(rawResult);
      setAnalysis(result);
      setMealName(result.mealName || 'Estimated Meal');
      setStep('review');
      toast.info('Estimated nutrition from offline food database.', 'Offline Estimate');
    } catch (err: any) {
      toast.error('Could not generate offline estimate.', 'Estimate Error');
    }
  };

  const startAnalysis = async () => {
    if (!processedBlob) {
      toast.error('Please take or upload a food photo first.', 'No Image');
      return;
    }

    setScanError(null);
    setStep('analyzing');
    try {
      const rawResult = await analyzeMealPhoto({
        file: processedBlob,
        userNotes: userNotes.trim(),
        hiddenIngredients: selectedHiddenIngredients,
        customApiKey: store.customGeminiKey,
      });

      const result = applyLearnedPortionPreferences(rawResult);
      setAnalysis(result);
      setMealName(result.mealName || 'Scanned Meal');
      setStep('review');
    } catch (err: any) {
      console.error('Meal scan failed:', err);
      const errorMsg =
        err?.message || 'Failed to analyze meal photo with Gemini. Please try again.';
      setScanError(errorMsg);
      toast.error(errorMsg, 'Analysis Notice');
      setStep('select');
      if (
        errorMsg.toLowerCase().includes('api key') ||
        errorMsg.toLowerCase().includes('key configured') ||
        errorMsg.toLowerCase().includes('no_api_key')
      ) {
        setShowApiKeyInput(true);
      }
    }
  };

  const openEditItem = (index: number) => {
    if (editingItemIndex === index) {
      setEditingItemIndex(null);
      return;
    }
    const targetItem = analysis?.items[index];
    if (!targetItem) return;

    setEditingItemIndex(index);
    setEditName(targetItem.name);
    setEditGrams(targetItem.estimatedGrams || 100);
    setEditCalories(targetItem.calories || 0);
    setEditProtein(targetItem.proteinG || 0);
    setEditCarbs(targetItem.carbsG || 0);
    setEditFat(targetItem.fatG || 0);
  };

  const handleEditGramsChange = (newGrams: number) => {
    setEditGrams(newGrams);
    if (!analysis || editingItemIndex === null) return;
    const targetItem = analysis.items[editingItemIndex];
    if (!targetItem) return;

    const oldGrams = targetItem.estimatedGrams > 0 ? targetItem.estimatedGrams : 100;
    if (newGrams > 0 && oldGrams > 0 && targetItem.calories > 0) {
      const ratio = newGrams / oldGrams;
      setEditCalories(Math.round(targetItem.calories * ratio));
      setEditProtein(Math.round(targetItem.proteinG * ratio * 10) / 10);
      setEditCarbs(Math.round(targetItem.carbsG * ratio * 10) / 10);
      setEditFat(Math.round(targetItem.fatG * ratio * 10) / 10);
    } else if (newGrams > 0) {
      const est = estimateMacros(editName || targetItem.name, newGrams, 'g');
      setEditCalories(est.calories);
      setEditProtein(est.proteinG);
      setEditCarbs(est.carbsG);
      setEditFat(est.fatG);
    }
  };

  const handleSaveItemEdit = (index: number) => {
    if (!analysis) return;
    const itemsCopy = [...analysis.items];
    const targetItem = itemsCopy[index];
    if (!targetItem) return;

    const finalName = editName.trim() || targetItem.name;
    const finalGrams = editGrams > 0 ? editGrams : 100;
    const finalCalories = Math.max(0, Math.round(Number(editCalories) || 0));
    const finalProtein = Math.max(0, Math.round((Number(editProtein) || 0) * 10) / 10);
    const finalCarbs = Math.max(0, Math.round((Number(editCarbs) || 0) * 10) / 10);
    const finalFat = Math.max(0, Math.round((Number(editFat) || 0) * 10) / 10);

    // Save portion preference for future auto-calibration
    store.savePortionPreference(finalName, finalGrams);

    itemsCopy[index] = {
      ...targetItem,
      name: finalName,
      estimatedGrams: finalGrams,
      quantity: `${finalGrams}g`,
      calories: finalCalories,
      proteinG: finalProtein,
      carbsG: finalCarbs,
      fatG: finalFat,
    };

    const updated = recalculateMealResult(analysis, itemsCopy);
    setAnalysis(updated);
    setEditingItemIndex(null);
    toast.success(`Updated "${finalName}" (${finalGrams}g, ${finalCalories} kcal)`, 'Item Updated');
  };

  const handleDeleteItem = (index: number) => {
    if (!analysis) return;
    const updatedItems = analysis.items.filter((_, i) => i !== index);
    if (updatedItems.length === 0) {
      toast.error('Meal must contain at least one food item.', 'Cannot Delete');
      return;
    }
    const updated = recalculateMealResult(analysis, updatedItems);
    setAnalysis(updated);
  };

  const handleAddNewItem = () => {
    if (!analysis || !newItemName.trim()) return;
    const grams = newItemGrams > 0 ? newItemGrams : 100;
    const est = estimateMacros(newItemName.trim(), grams, 'g');

    const newItem: ScannedFoodItem = {
      name: newItemName.trim(),
      quantity: `${grams}g`,
      estimatedGrams: grams,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      confidence: 'high',
    };

    const updated = recalculateMealResult(analysis, [...analysis.items, newItem]);
    setAnalysis(updated);
    setNewItemName('');
    setNewItemGrams(100);
    setShowAddItem(false);
    toast.success(`Added ${newItem.name} (${grams}g)`, 'Item Added');
  };

  // "Tell AI" refinement
  const handleRefineWithAI = async () => {
    if (!analysis || !refinementInput.trim()) return;
    setIsRefining(true);

    const inputLower = refinementInput.toLowerCase();
    const itemsCopy = [...analysis.items];

    // Check if input mentions specific grams or items
    let matched = false;
    itemsCopy.forEach((item, idx) => {
      if (inputLower.includes(item.name.toLowerCase().split(' ')[0])) {
        const gramMatch = inputLower.match(/(\d+)\s*g/);
        if (gramMatch) {
          const grams = parseInt(gramMatch[1], 10);
          const est = estimateMacros(item.name, grams, 'g');
          itemsCopy[idx] = {
            ...item,
            estimatedGrams: grams,
            quantity: `${grams}g`,
            calories: est.calories,
            proteinG: est.proteinG,
            carbsG: est.carbsG,
            fatG: est.fatG,
          };
          matched = true;
        }
      }
    });

    if (matched) {
      const updated = recalculateMealResult(analysis, itemsCopy);
      setAnalysis(updated);
      toast.success('Portions recalibrated based on your feedback.', 'AI Adjusted');
      setRefinementInput('');
      setIsRefining(false);
      return;
    }

    // If more complex or re-evaluating with photo, re-run analysis with feedback notes
    if (processedBlob) {
      try {
        const refinedResult = await analyzeMealPhoto({
          file: processedBlob,
          userNotes: `${userNotes ? userNotes + '. ' : ''}Correction from user: ${refinementInput.trim()}`,
          hiddenIngredients: selectedHiddenIngredients,
          customApiKey: store.customGeminiKey,
        });
        setAnalysis(refinedResult);
        toast.success('Meal re-analyzed with updated directives.', 'AI Refined');
        setRefinementInput('');
      } catch {
        toast.info('Could not connect to online AI; updated local estimate.', 'Offline Adjust');
      }
    }

    setIsRefining(false);
  };

  const handleSaveToNutrition = () => {
    if (!analysis || analysis.items.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const validFoods: FoodItem[] = analysis.items.map((it) => ({
      name: it.name,
      quantity: it.estimatedGrams,
      unit: 'g',
      calories: it.calories,
      proteinG: it.proteinG,
      carbsG: it.carbsG,
      fatG: it.fatG,
    }));

    const newMeal: MealEntry = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
      date: today,
      name: mealName.trim() || 'Scanned Meal',
      foods: validFoods,
    };

    store.addMeal(newMeal);

    // Calculate remaining protein for immediate feedback
    const todayMeals = store.meals.filter((m) => m.date === today);
    const existingProtein = todayMeals.flatMap((m) => m.foods).reduce((sum, f) => sum + (f.proteinG || 0), 0);
    const currentProteinTotal = Math.round(existingProtein + analysis.totalProtein);
    const targetProtein = store.macroGoals?.proteinG || Math.round((store.profile?.bodyweightKg || 75) * 2);
    const remainingProtein = Math.max(0, targetProtein - currentProteinTotal);

    toast.success(
      `Meal added: ~${analysis.totalCalories} kcal • ${analysis.totalProtein}g protein (${currentProteinTotal}/${targetProtein}g today)!`,
      'Meal Logged'
    );

    if (onMealSaved) {
      onMealSaved(newMeal);
    }

    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      {/* Hidden file input for Gallery / Fallback (no capture attribute to prevent OS camera low-memory kills) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear input value immediately so user can retry or select another photo cleanly
          e.target.value = '';
          if (!file) return;
          handleFileSelected(file);
        }}
      />

      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl relative animate-scale-in my-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-base sm:text-lg text-text-primary tracking-tight leading-tight">
                Scan Meal
              </h2>
              <p className="text-2xs text-text-muted font-sans mt-0.5">
                Photo &rarr; Instant AI Macro Breakdown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowApiKeyInput((prev) => !prev)}
              className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1 text-2xs font-mono ${
                store.customGeminiKey
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-border text-text-muted hover:text-text-primary hover:bg-bg-secondary'
              }`}
              title={store.customGeminiKey ? 'Custom Gemini API Key Active' : 'Configure Gemini API Key'}
            >
              <Key className="w-4 h-4 text-accent" />
              {store.customGeminiKey && (
                <span className="hidden sm:inline text-3xs font-bold text-emerald-400">KEY ACTIVE</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── STEP 1: SELECT / CAPTURE PHOTO ───────────────────────────────── */}
        {step === 'select' && (
          <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Inline Gemini API Key Setup Card */}
            {(showApiKeyInput ||
              (scanError &&
                (scanError.toLowerCase().includes('api key') ||
                  scanError.toLowerCase().includes('key configured') ||
                  scanError.toLowerCase().includes('no_api_key')))) && (
              <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
                    <Key className="w-3.5 h-3.5" />
                    <span>Gemini API Key Configuration</span>
                  </div>
                  {store.customGeminiKey ? (
                    <span className="text-3xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      ACTIVE KEY
                    </span>
                  ) : (
                    <span className="text-3xs font-mono font-bold bg-bg-card text-text-muted border border-border px-1.5 py-0.5 rounded">
                      DEFAULT (.env.local)
                    </span>
                  )}
                </div>

                <p className="text-2xs text-text-muted leading-relaxed">
                  Enter your Google Gemini API key to enable instant photo meal recognition. Your key is stored securely in your browser&apos;s local storage.
                </p>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste Gemini API key (e.g. AIzaSy...)"
                    className="flex-1 py-1.5 px-3 rounded-lg bg-bg-card border border-border text-xs text-text-primary focus:border-accent outline-none font-mono placeholder:text-text-muted"
                  />
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    className="btn-primary py-1.5 px-3 text-xs font-bold shrink-0 flex items-center gap-1"
                  >
                    {isKeySaved ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                    <span>{isKeySaved ? 'Saved' : 'Save Key'}</span>
                  </button>
                  {store.customGeminiKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setApiKeyInput('');
                        store.setCustomGeminiKey('');
                        toast.info('Custom API key removed.', 'Cleared');
                      }}
                      className="btn-secondary py-1.5 px-2.5 text-xs font-bold shrink-0 text-text-muted hover:text-red-400"
                      title="Clear key"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-3xs text-text-muted pt-0.5">
                  <span>Free key available at Google AI Studio</span>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline font-semibold hover:text-accent-hover"
                  >
                    Get Free Key &rarr;
                  </a>
                </div>
              </div>
            )}

            {scanError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-400 space-y-2 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <div className="space-y-1 flex-1">
                    <span className="font-bold block">Scan Notice</span>
                    <p className="text-2xs text-text-muted leading-relaxed">{scanError}</p>
                  </div>
                </div>

                {/* Quick actions for error recovery */}
                <div className="flex items-center gap-2 pt-1 border-t border-red-500/20">
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInput(true)}
                    className="text-2xs font-semibold text-accent underline flex items-center gap-1"
                  >
                    <Key className="w-3 h-3" />
                    <span>Enter Gemini Key</span>
                  </button>
                  <span className="text-border">•</span>
                  <button
                    type="button"
                    onClick={handleOfflineEstimate}
                    className="text-2xs font-semibold text-text-secondary hover:text-text-primary underline flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Estimate with Offline DB</span>
                  </button>
                </div>
              </div>
            )}

            {/* Upload Area / Live In-App Camera Viewfinder / Processing State */}
            {isLiveCameraActive ? (
              <div className="space-y-3 animate-fade-in">
                <div className="relative rounded-2xl overflow-hidden border border-border aspect-video bg-black flex items-center justify-center shadow-inner">
                  <video
                    ref={videoRef}
                    playsInline
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Framing viewfinder guide */}
                  <div className="absolute inset-4 rounded-xl border border-white/20 pointer-events-none flex items-center justify-center">
                    <div className="w-8 h-8 border-t-2 border-l-2 border-accent absolute top-0 left-0 rounded-tl" />
                    <div className="w-8 h-8 border-t-2 border-r-2 border-accent absolute top-0 right-0 rounded-tr" />
                    <div className="w-8 h-8 border-b-2 border-l-2 border-accent absolute bottom-0 left-0 rounded-bl" />
                    <div className="w-8 h-8 border-b-2 border-r-2 border-accent absolute bottom-0 right-0 rounded-br" />
                    <span className="text-3xs font-mono font-bold uppercase tracking-wider text-white/90 bg-black/60 px-2.5 py-0.5 rounded-full border border-white/10 shadow-xs">
                      Frame Meal Plate
                    </span>
                  </div>

                  {/* Top action controls: Flip Camera & Close Camera */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleFlipCamera}
                      className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow-sm"
                      title="Flip camera"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={stopLiveCamera}
                      className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow-sm"
                      title="Close camera"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Shutter Button & Choose File fallback */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSnapFrame}
                    disabled={isCapturingFrame}
                    className="btn-primary flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-accent/25"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isCapturingFrame ? 'Capturing...' : 'Snap Meal Photo'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopLiveCamera();
                      fileInputRef.current?.click();
                    }}
                    className="btn-secondary py-3 px-3.5 text-xs font-bold flex items-center justify-center gap-1.5"
                    title="Upload from files instead"
                  >
                    <Upload className="w-4 h-4 text-accent" />
                    <span className="hidden sm:inline">Choose File</span>
                  </button>
                </div>
              </div>
            ) : isProcessingImage ? (
              <div className="border border-border rounded-2xl p-8 text-center bg-bg-secondary/20 space-y-3 animate-fade-in">
                <RefreshCw className="w-7 h-7 mx-auto animate-spin text-accent" />
                <div className="space-y-1">
                  <h4 className="font-bold text-xs sm:text-sm text-text-primary">
                    Optimizing Photo...
                  </h4>
                  <p className="text-2xs text-text-muted">
                    Resizing &amp; compressing image to protect device memory.
                  </p>
                </div>
              </div>
            ) : !previewUrl ? (
              <div className="border-2 border-dashed border-border hover:border-accent/60 rounded-2xl p-6 text-center transition-colors bg-bg-secondary/20 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                  <Camera className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-text-primary">
                    Capture or Upload Your Meal
                  </h3>
                  <p className="text-xs text-text-muted mt-1 max-w-xs mx-auto">
                    Take a photo of your plate. Works seamlessly with Indian meals, rotis, dals, and fitness foods.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => startLiveCamera('environment')}
                    className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4 text-accent" />
                    <span>Upload Gallery</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-border aspect-video bg-black/40 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Meal preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      cleanupPreview();
                    }}
                    className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                    title="Change photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Scan + Describe / Context hints */}
                <div className="space-y-2">
                  <label className="text-2xs font-bold uppercase tracking-wider text-text-muted block">
                    Describe or Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="e.g. 3 rotis, 1 bowl dal, hostel dinner, less oil"
                    className="w-full py-2 px-3 rounded-xl bg-bg-secondary border border-border text-xs text-text-primary focus:border-accent outline-none placeholder:text-text-muted"
                  />
                </div>

                {/* "Anything I can't see?" pills */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-2xs font-bold uppercase tracking-wider text-text-muted block">
                    Anything I can&apos;t see?
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {HIDDEN_INGREDIENT_OPTIONS.map((opt) => {
                      const isSelected = selectedHiddenIngredients.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleHiddenIngredient(opt)}
                          className={`text-2xs font-semibold py-1 px-2.5 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-accent/15 border-accent text-accent'
                              : 'bg-bg-secondary border-border text-text-secondary hover:border-accent/40'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action CTA */}
                <button
                  type="button"
                  onClick={startAnalysis}
                  className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-accent/20 mt-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze Meal &amp; Calculate Macros</span>
                </button>

                <div className="flex items-center justify-center gap-2 pt-1 text-2xs text-text-muted">
                  <span>Prefer fast offline calculation?</span>
                  <button
                    type="button"
                    onClick={handleOfflineEstimate}
                    className="text-accent underline font-semibold hover:text-accent-hover flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Estimate with Offline DB</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: ANALYZING ANIMATION ──────────────────────────────────── */}
        {step === 'analyzing' && (
          <div className="p-8 sm:p-12 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent relative">
              <Sparkles className="w-8 h-8 animate-pulse" />
              <div className="absolute inset-0 rounded-2xl border-2 border-accent animate-ping opacity-25" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-black text-lg text-text-primary">
                Analyzing Food &amp; Portions...
              </h3>
              <p className="text-xs text-text-muted max-w-xs mx-auto">
                Gemini is identifying visible dishes, estimating gram weights, and calculating protein, carbs, and calories.
              </p>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-2xs text-text-secondary font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
              <span>Checking regional database &amp; ingredients</span>
            </div>
          </div>
        )}

        {/* ── STEP 3: REVIEW / "LOOKS RIGHT?" STEP ──────────────────────────── */}
        {step === 'review' && analysis && (() => {
          const isEmptyDetection = analysis.items.length === 0;
          const hasCreatine = analysis.items.some((item) =>
            item.name.toLowerCase().includes('creatine')
          );
          const todayStr = new Date().toISOString().split('T')[0];
          const isCreatineLoggedToday = !!store.creatineLogs?.[todayStr]?.taken;

          return (
            <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {isEmptyDetection ? (
                /* Empty / Non-food detection state */
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-black text-sm sm:text-base text-text-primary">
                        {analysis.mealName && !analysis.mealName.toLowerCase().includes('scanned')
                          ? analysis.mealName
                          : 'No Food or Supplement Detected'}
                      </h3>
                      <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
                        {analysis.coachingNote ||
                          "Gemini couldn't find any identifiable food, drink, or workout supplement in this image."}
                      </p>
                    </div>

                    <div className="text-2xs text-text-secondary bg-bg-secondary/60 p-3 rounded-xl border border-border text-left space-y-1.5">
                      <span className="font-bold text-text-primary flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-accent" />
                        <span>Tips for accurate detection:</span>
                      </span>
                      <ul className="list-disc list-inside space-y-1 text-text-muted">
                        <li>For supplements: ensure the brand and tub label (e.g. Creatine, Whey) are clearly visible and well-lit.</li>
                        <li>For home-cooked meals: frame the entire plate from a top-down angle.</li>
                        <li>You can also type a note in &quot;Describe or Note&quot; before scanning to guide the AI.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Manual entry fallback */}
                  {showAddItem ? (
                    <div className="p-3.5 rounded-xl border border-accent/30 bg-accent/5 space-y-2.5 animate-fade-in">
                      <span className="text-xs font-bold text-text-primary block">
                        Add Item Manually
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Creatine, Chicken, Rice"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="py-1.5 px-2.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary outline-none focus:border-accent"
                        />
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            placeholder="Grams"
                            value={newItemGrams || ''}
                            onChange={(e) => setNewItemGrams(Number(e.target.value))}
                            className="w-20 py-1.5 px-2 rounded-lg bg-bg-card border border-border text-xs text-text-primary outline-none focus:border-accent"
                          />
                          <span className="text-xs text-text-muted">g</span>
                          <button
                            type="button"
                            onClick={handleAddNewItem}
                            disabled={!newItemName.trim()}
                            className="btn-primary py-1.5 px-2.5 text-xs font-bold disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddItem(true)}
                        className="btn-secondary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Enter Item Manually</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          cleanupPreview();
                          setStep('select');
                        }}
                        className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Retake Photo</span>
                      </button>
                    </div>
                  )}

                  {/* Empty Detection Actions */}
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="btn-secondary py-2.5 text-xs font-semibold flex-1"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        cleanupPreview();
                        setStep('select');
                      }}
                      className="btn-primary py-2.5 text-xs font-bold flex-1 flex items-center justify-center gap-1.5"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Scan Another Photo</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Successful Detection Review State */
                <>
                  {/* MEAL ESTIMATE Summary Header */}
                  <div className="card p-4 bg-bg-card border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="section-title text-[11px] mb-0">MEAL ESTIMATE</span>
                      <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-bg-secondary text-text-muted border border-border">
                        Estimated
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 pt-0.5">
                      <span className="text-3xl font-black text-accent font-sans">
                        ~{analysis.totalCalories}
                      </span>
                      <span className="text-sm font-semibold text-text-muted">kcal</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary pt-0.5">
                      <span className="text-emerald-500 font-bold">{analysis.totalProtein}g Protein</span>
                      <span>•</span>
                      <span className="text-text-primary">{analysis.totalCarbs}g Carbs</span>
                      <span>•</span>
                      <span className="text-text-primary">{analysis.totalFat}g Fat</span>
                    </div>

                    <p className="text-2xs text-text-muted border-t border-border/60 pt-2 mt-1">
                      Nutrition is estimated from the image. Review portions before saving.
                    </p>
                  </div>

                  {/* Creatine Habit Quick-Action Card if detected */}
                  {hasCreatine && (
                    <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                            <Zap className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-bold text-xs text-text-primary">
                            Creatine Monohydrate Detected
                          </span>
                        </div>
                        {isCreatineLoggedToday ? (
                          <span className="text-3xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Logged Today
                          </span>
                        ) : (
                          <span className="text-3xs font-semibold px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-mono">
                            Daily Habit
                          </span>
                        )}
                      </div>
                      <p className="text-2xs text-text-muted leading-relaxed">
                        Creatine provides 0 kcal &amp; 0g protein, but resynthesizes muscular ATP for maximum power output and recovery.
                      </p>
                      {!isCreatineLoggedToday && (
                        <button
                          type="button"
                          onClick={() => {
                            store.toggleCreatine(todayStr, 5);
                            toast.success("Marked today's 5g Creatine taken!", 'Creatine Habit');
                          }}
                          className="w-full py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Daily Creatine Taken (5g)</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Editable Meal Name */}
                  <div>
                    <label className="text-2xs font-bold uppercase tracking-wider text-text-muted block mb-1">
                      Meal Name
                    </label>
                    <input
                      type="text"
                      value={mealName}
                      onChange={(e) => setMealName(e.target.value)}
                      className="w-full py-1.5 px-3 rounded-xl bg-bg-secondary border border-border text-sm font-bold text-text-primary focus:border-accent outline-none"
                    />
                  </div>

                  {/* Food items breakdown list */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-bold uppercase tracking-wider text-text-muted">
                        DETECTED FOODS ({analysis.items.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddItem(true)}
                        className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Item</span>
                      </button>
                    </div>

                    {/* Add item form modal inline */}
                    {showAddItem && (
                      <div className="p-3 rounded-xl border border-accent/30 bg-accent/5 space-y-2.5 animate-fade-in">
                        <span className="text-xs font-bold text-text-primary block">
                          Add Food Item
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Food name (e.g. Curd, Salad)"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            className="py-1.5 px-2.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary outline-none focus:border-accent"
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              placeholder="Grams"
                              value={newItemGrams || ''}
                              onChange={(e) => setNewItemGrams(Number(e.target.value))}
                              className="w-20 py-1.5 px-2 rounded-lg bg-bg-card border border-border text-xs text-text-primary outline-none focus:border-accent"
                            />
                            <span className="text-xs text-text-muted">g</span>
                            <button
                              type="button"
                              onClick={handleAddNewItem}
                              disabled={!newItemName.trim()}
                              className="btn-primary py-1.5 px-2.5 text-xs font-bold disabled:opacity-40"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {analysis.items.map((item, idx) => {
                        const isEditing = editingItemIndex === idx;

                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl border border-border bg-bg-card hover:border-border/80 transition-colors space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs sm:text-sm text-text-primary">
                                    {item.name}
                                  </span>
                                </div>
                                <span className="text-2xs text-text-secondary mt-0.5 block">
                                  {item.quantity} (~{item.estimatedGrams}g)
                                  {item.preparation ? ` • ${item.preparation}` : ''}
                                </span>
                              </div>

                              {/* Macros & Action Buttons */}
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <span className="font-bold text-xs text-accent block">
                                    ~{item.calories} kcal
                                  </span>
                                  <span className="text-3xs text-text-muted block">
                                    P: {item.proteinG}g • C: {item.carbsG}g • F: {item.fatG}g
                                  </span>
                                </div>

                                <div className="flex items-center gap-0.5 border-l border-border pl-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditItem(idx)}
                                    className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-bg-secondary transition-colors"
                                    title="Edit Portion or Macros"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(idx)}
                                    className="p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                    title="Remove Food"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Inline food & portion editor */}
                            {isEditing && (
                              <div className="pt-2 border-t border-border/60 space-y-2.5 animate-fade-in bg-bg-secondary/40 -mx-3 -mb-3 p-3 rounded-b-xl">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block">Food Name</label>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full py-1.5 px-2.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary outline-none focus:border-accent"
                                    placeholder="Food name (e.g. Chicken Biryani)"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Portion Weight (grams)</label>
                                    <span className="text-[10px] text-accent font-mono font-medium">Auto-scales macros</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleEditGramsChange(Math.max(10, editGrams - 25))}
                                      className="px-2 py-1 rounded bg-bg-card border border-border text-xs font-mono font-bold text-text-muted hover:text-text-primary cursor-pointer"
                                    >
                                      -25g
                                    </button>
                                    <input
                                      type="number"
                                      value={editGrams}
                                      onChange={(e) => handleEditGramsChange(Math.max(0, Number(e.target.value)))}
                                      className="w-24 py-1.5 px-2.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary outline-none focus:border-accent text-center font-mono font-bold"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleEditGramsChange(editGrams + 25)}
                                      className="px-2 py-1 rounded bg-bg-card border border-border text-xs font-mono font-bold text-text-muted hover:text-text-primary cursor-pointer"
                                    >
                                      +25g
                                    </button>
                                  </div>
                                </div>

                                {/* Direct Macro Adjustments */}
                                <div className="grid grid-cols-4 gap-1.5 pt-1">
                                  <div>
                                    <label className="text-[9px] font-mono uppercase text-text-muted block">Calories</label>
                                    <input
                                      type="number"
                                      value={editCalories}
                                      onChange={(e) => setEditCalories(Math.max(0, Number(e.target.value)))}
                                      className="w-full py-1 px-1.5 rounded bg-bg-card border border-border text-xs font-mono text-accent outline-none text-center font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-mono uppercase text-text-muted block">Protein (g)</label>
                                    <input
                                      type="number"
                                      value={editProtein}
                                      onChange={(e) => setEditProtein(Math.max(0, Number(e.target.value)))}
                                      className="w-full py-1 px-1.5 rounded bg-bg-card border border-border text-xs font-mono text-emerald-400 outline-none text-center font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-mono uppercase text-text-muted block">Carbs (g)</label>
                                    <input
                                      type="number"
                                      value={editCarbs}
                                      onChange={(e) => setEditCarbs(Math.max(0, Number(e.target.value)))}
                                      className="w-full py-1 px-1.5 rounded bg-bg-card border border-border text-xs font-mono text-sky-400 outline-none text-center font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-mono uppercase text-text-muted block">Fat (g)</label>
                                    <input
                                      type="number"
                                      value={editFat}
                                      onChange={(e) => setEditFat(Math.max(0, Number(e.target.value)))}
                                      className="w-full py-1 px-1.5 rounded bg-bg-card border border-border text-xs font-mono text-amber-400 outline-none text-center font-bold"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingItemIndex(null)}
                                    className="px-2.5 py-1 text-2xs text-text-muted hover:text-text-primary cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveItemEdit(idx)}
                                    className="btn-primary py-1 px-3 text-xs font-bold cursor-pointer"
                                  >
                                    Save Changes
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* "Tell AI" / Improve Estimate */}
                  <div className="p-3 rounded-xl bg-bg-secondary/40 border border-border space-y-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-accent" />
                      Tell AI / Improve Estimate
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={refinementInput}
                        onChange={(e) => setRefinementInput(e.target.value)}
                        placeholder="e.g. Rice was about 250g, or Paneer had low oil..."
                        className="flex-1 py-1.5 px-3 rounded-xl bg-bg-card border border-border text-xs text-text-primary focus:border-accent outline-none placeholder:text-text-muted"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleRefineWithAI();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleRefineWithAI}
                        disabled={!refinementInput.trim() || isRefining}
                        className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                      >
                        <Send className={`w-3 h-3 ${isRefining ? 'animate-spin' : ''}`} />
                        <span>Refine</span>
                      </button>
                    </div>
                  </div>

                  {/* Coaching Observation */}
                  {analysis.coachingNote && (
                    <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>{analysis.coachingNote}</span>
                    </div>
                  )}

                  {/* Bottom Actions */}
                  <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        cleanupPreview();
                        setStep('select');
                      }}
                      className="btn-secondary py-2.5 text-xs font-semibold order-2 sm:order-1"
                    >
                      Scan Another Photo
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveToNutrition}
                      className="btn-primary py-3 text-sm font-bold flex-1 flex items-center justify-center gap-2 shadow-md shadow-accent/25 order-1 sm:order-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Add to Today&apos;s Nutrition</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
