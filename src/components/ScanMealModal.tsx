'use client';

import React, { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { MealAnalysisResult, ScannedFoodItem, MealEntry, FoodItem } from '@/lib/types';
import { analyzeMealPhoto, recalculateMealResult } from '@/lib/ai-scan-meal';
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
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const toggleHiddenIngredient = (item: string) => {
    setSelectedHiddenIngredients((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const startAnalysis = async () => {
    if (!selectedFile) {
      toast.error('Please take or upload a food photo first.', 'No Image');
      return;
    }

    setStep('analyzing');
    try {
      const result = await analyzeMealPhoto({
        file: selectedFile,
        userNotes: userNotes.trim(),
        hiddenIngredients: selectedHiddenIngredients,
        customApiKey: store.customGeminiKey,
      });

      setAnalysis(result);
      setMealName(result.mealName || 'Scanned Meal');
      setStep('review');
    } catch (err: any) {
      console.error('Meal scan failed:', err);
      toast.error(err.message || 'Failed to analyze meal photo.', 'Analysis Failed');
      setStep('select');
    }
  };

  const handleUpdateItemGrams = (index: number) => {
    if (!analysis) return;
    const itemsCopy = [...analysis.items];
    const targetItem = itemsCopy[index];
    if (!targetItem) return;

    const newGrams = editGrams > 0 ? editGrams : 100;
    const est = estimateMacros(targetItem.name, newGrams, 'g');

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
    toast.info(`Updated ${targetItem.name} to ${newGrams}g`, 'Portion Adjusted');
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

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── STEP 1: SELECT / CAPTURE PHOTO ───────────────────────────────── */}
        {step === 'select' && (
          <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
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
        {step === 'review' && analysis && (
          <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Disclaimer pill */}
            <div className="py-1.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-2xs text-amber-600 dark:text-amber-400">
              <span className="font-semibold">
                AI Meal Estimate — Review portions before saving.
              </span>
              <span className="text-3xs uppercase font-mono font-bold bg-amber-500/20 px-1.5 py-0.5 rounded">
                {analysis.confidence} Confidence
              </span>
            </div>

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

            {/* Macro Summary Strip */}
            <div className="grid grid-cols-4 gap-2 py-3 px-3.5 rounded-xl bg-bg-secondary/70 border border-border text-center">
              <div>
                <span className="text-3xs uppercase font-bold text-text-muted block">Calories</span>
                <span className="font-black text-accent text-base sm:text-lg">
                  ~{analysis.totalCalories}
                </span>
                <span className="text-3xs text-text-muted block">kcal</span>
              </div>
              <div className="border-l border-border/80">
                <span className="text-3xs uppercase font-bold text-emerald-600 block">Protein</span>
                <span className="font-black text-emerald-600 text-base sm:text-lg">
                  ~{analysis.totalProtein}g
                </span>
                <span className="text-3xs text-text-muted block">key</span>
              </div>
              <div className="border-l border-border/80">
                <span className="text-3xs uppercase font-bold text-text-muted block">Carbs</span>
                <span className="font-bold text-text-primary text-base sm:text-lg">
                  ~{analysis.totalCarbs}g
                </span>
                <span className="text-3xs text-text-muted block">energy</span>
              </div>
              <div className="border-l border-border/80">
                <span className="text-3xs uppercase font-bold text-text-muted block">Fat</span>
                <span className="font-bold text-text-primary text-base sm:text-lg">
                  ~{analysis.totalFat}g
                </span>
                <span className="text-3xs text-text-muted block">essential</span>
              </div>
            </div>

            {/* Food items breakdown list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold uppercase tracking-wider text-text-muted">
                  Detected Food Items ({analysis.items.length})
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
                  const confidenceBadge =
                    item.confidence === 'high'
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : item.confidence === 'medium'
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : 'bg-slate-500/10 text-slate-500 border-slate-500/20';

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
                            <span
                              className={`text-3xs font-semibold px-1.5 py-0.5 rounded border capitalize ${confidenceBadge}`}
                            >
                              {item.confidence}
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
          </div>
        )}
      </div>
    </div>
  );
}
