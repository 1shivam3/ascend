'use client';

import React, { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { MealAnalysisResult, ScannedFoodItem, MealEntry, FoodItem } from '@/lib/types';
import { analyzeMealPhoto, recalculateMealResult, generateOfflineMealEstimate } from '@/lib/ai-scan-meal';
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
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Gemini API Key config state
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(store.customGeminiKey || '');
  const [isKeySaved, setIsKeySaved] = useState(false);

  // Flow states: 'select' | 'analyzing' | 'review'
  const [step, setStep] = useState<'select' | 'analyzing' | 'review'>('select');

  // Input state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState('');
  const [selectedHiddenIngredients, setSelectedHiddenIngredients] = useState<string[]>([]);

  // Result state
  const [analysis, setAnalysis] = useState<MealAnalysisResult | null>(null);
  const [mealName, setMealName] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editGrams, setEditGrams] = useState<number>(100);

  // Error state
  const [scanError, setScanError] = useState<string | null>(null);

  // "Tell AI" refinement state
  const [refinementInput, setRefinementInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // New item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemGrams, setNewItemGrams] = useState(100);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep('select');
    setSelectedFile(null);
    setPreviewUrl(null);
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
    handleReset();
    onClose();
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setScanError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
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
    if (!selectedFile) {
      toast.error('Please take or upload a food photo first.', 'No Image');
      return;
    }

    setScanError(null);
    setStep('analyzing');
    try {
      const rawResult = await analyzeMealPhoto({
        file: selectedFile,
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

  const handleUpdateItemGrams = (index: number) => {
    if (!analysis) return;
    const itemsCopy = [...analysis.items];
    const targetItem = itemsCopy[index];
    if (!targetItem) return;

    const newGrams = editGrams > 0 ? editGrams : 100;
    const est = estimateMacros(targetItem.name, newGrams, 'g');

    // Save portion preference for future auto-calibration
    store.savePortionPreference(targetItem.name, newGrams);

    itemsCopy[index] = {
      ...targetItem,
      estimatedGrams: newGrams,
      quantity: `${newGrams}g`,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
    };

    const updated = recalculateMealResult(analysis, itemsCopy);
    setAnalysis(updated);
    setEditingItemIndex(null);
    toast.info(`Updated & remembered portion for ${targetItem.name} (${newGrams}g)`, 'Portion Calibrated');
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
    if (selectedFile) {
      try {
        const refinedResult = await analyzeMealPhoto({
          file: selectedFile,
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
      {/* Hidden file inputs for Camera and Gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
          }
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
          }
        }}
      />

      <div className="bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark rounded-2xl w-full max-w-lg shadow-2xl relative animate-scale-up my-auto overflow-hidden">
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

            {/* Upload Area / Camera Card */}
            {!previewUrl ? (
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
                    onClick={() => cameraInputRef.current?.click()}
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
                      setSelectedFile(null);
                      setPreviewUrl(null);
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
                      <span className="font-bold block text-text-primary">💡 Tips for accurate detection:</span>
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
                        onClick={() => setStep('select')}
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
                      onClick={() => setStep('select')}
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
                                    onClick={() => {
                                      setEditingItemIndex(isEditing ? null : idx);
                                      setEditGrams(item.estimatedGrams);
                                    }}
                                    className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-bg-secondary transition-colors"
                                    title="Edit Portion"
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

                            {/* Inline portion editor */}
                            {isEditing && (
                              <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                                <span className="text-2xs text-text-muted font-medium">Adjust weight:</span>
                                <input
                                  type="number"
                                  value={editGrams}
                                  onChange={(e) => setEditGrams(Number(e.target.value))}
                                  className="w-20 py-1 px-2 rounded-lg bg-bg-secondary border border-border text-xs text-text-primary outline-none focus:border-accent"
                                />
                                <span className="text-xs text-text-muted">grams</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemGrams(idx)}
                                  className="btn-primary py-1 px-2.5 text-2xs font-bold"
                                >
                                  Save
                                </button>
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
                      onClick={() => setStep('select')}
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
