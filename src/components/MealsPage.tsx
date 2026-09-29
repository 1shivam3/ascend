"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { estimateMacros, calculateMealMacros, getFoodSuggestions } from '@/lib/macros';
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Utensils,
  ArrowLeft,
  Target,
  Sparkles,
  Edit3,
  Search,
  ChevronRight,
  Barcode as BarcodeIcon,
  Star,
  Copy,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Flame,
} from 'lucide-react';
import { MealEntry, FoodItem, MacroGoals, FavoriteFood } from '@/lib/types';
import ThemeToggle from '@/components/ui/ThemeToggle';
import BarcodeScannerModal from '@/components/BarcodeScannerModal';
import { useToast } from '@/components/ui/Toast';

// ─── Constants ───────────────────────────────────────────────────────────────

const MEAL_TEMPLATES = ['Breakfast', 'Lunch', 'Dinner', 'Pre-Workout', 'Post-Workout'] as const;

const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'g',        label: 'g (grams)' },
  { value: 'ml',       label: 'ml' },
  { value: 'oz',       label: 'oz' },
  { value: 'piece',    label: 'piece' },
  { value: 'pieces',   label: 'pieces' },
  { value: 'scoop',    label: 'scoop' },
  { value: 'tbsp',     label: 'tbsp' },
  { value: 'tsp',      label: 'tsp' },
  { value: 'cup',      label: 'cup' },
  { value: 'bowl',     label: 'bowl' },
  { value: 'serving',  label: 'serving' },
  { value: 'slice',    label: 'slice' },
  { value: 'handful',  label: 'handful' },
];

const EMPTY_FOOD = (): FoodItem => ({
  name: '',
  quantity: undefined,
  unit: 'g',
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface MealsPageProps {
  onNavigate?: (tab: 'home' | 'prs' | 'workout' | 'meals') => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MealsPage({ onNavigate }: MealsPageProps = {}) {
  const profile            = useStore((state) => state.profile);
  const meals              = useStore((state) => state.meals);
  const macroGoals         = useStore((state) => state.macroGoals);
  const favoriteFoods      = useStore((state) => state.favoriteFoods || []);
  const addMeal            = useStore((state) => state.addMeal);
  const deleteMeal         = useStore((state) => state.deleteMeal);
  const setMacroGoals      = useStore((state) => state.setMacroGoals);
  const copyMealsFromDate  = useStore((state) => state.copyMealsFromDate);
  const toggleFavoriteFood = useStore((state) => state.toggleFavoriteFood);
  const deleteFavoriteFood = useStore((state) => state.deleteFavoriteFood);
  const toast              = useToast();

  // ── Modal visibility ──────────────────────────────────────────────────────
  const [isModalOpen,        setIsModalOpen]        = useState(false);
  const [isGoalsModalOpen,   setIsGoalsModalOpen]   = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [expandedMeals,      setExpandedMeals]      = useState<Set<string>>(new Set());

  // ── Goals form ────────────────────────────────────────────────────────────
  const [goalCalories, setGoalCalories] = useState('');
  const [goalProtein,  setGoalProtein]  = useState('');
  const [goalCarbs,    setGoalCarbs]    = useState('');
  const [goalFat,      setGoalFat]      = useState('');

  // ── Meal log form ─────────────────────────────────────────────────────────
  const [mealName, setMealName] = useState('');
  const [foods,    setFoods]    = useState<FoodItem[]>([]);

  // ── Autocomplete state ────────────────────────────────────────────────────
  const [foodSuggestions,        setFoodSuggestions]        = useState<Record<number, string[]>>({});
  const [activeSuggestionIndex,   setActiveSuggestionIndex]   = useState<Record<number, number>>({});
  const [showSuggestions,         setShowSuggestions]         = useState<Record<number, boolean>>({});

  const suggestionRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── Click-outside: close all dropdowns ────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      let shouldClose = true;
      for (const ref of Object.values(suggestionRefs.current)) {
        if (ref && ref.contains(target)) {
          shouldClose = false;
          break;
        }
      }
      if (shouldClose) {
        setShowSuggestions({});
        setFoodSuggestions({});
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    setExpandedMeals((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddFood = () => {
    setFoods((prev) => [...prev, EMPTY_FOOD()]);
  };

  const handleRemoveFood = (index: number) => {
    setFoods((prev) => prev.filter((_, i) => i !== index));
    setFoodSuggestions((prev) => { const n = { ...prev }; delete n[index]; return n; });
    setShowSuggestions((prev) => { const n = { ...prev }; delete n[index]; return n; });
    setActiveSuggestionIndex((prev) => { const n = { ...prev }; delete n[index]; return n; });
  };

  /**
   * Central handler for all food field changes.
   */
  const handleFoodChange = useCallback((index: number, field: keyof FoodItem, value: any) => {
    setFoods((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      if (field === 'name') {
        const name = (value as string).trim();
        if (name.length >= 1) {
          const suggestions = getFoodSuggestions(name);
          setFoodSuggestions((s) => ({ ...s, [index]: suggestions }));
          setShowSuggestions((s) => ({ ...s, [index]: suggestions.length > 0 }));
        } else {
          setFoodSuggestions((s) => ({ ...s, [index]: [] }));
          setShowSuggestions((s) => ({ ...s, [index]: false }));
        }

        if (name.length > 1 && next[index].quantity !== undefined && (next[index].quantity as number) > 0) {
          const est = estimateMacros(name, next[index].quantity, next[index].unit);
          next[index] = {
            ...next[index],
            calories: est.calories,
            proteinG: est.proteinG,
            carbsG:   est.carbsG,
            fatG:     est.fatG,
          };
        }
      }

      if (field === 'quantity') {
        const qty = Number(value);
        if (next[index].name.trim().length > 1) {
          const est = estimateMacros(next[index].name, qty > 0 ? qty : undefined, next[index].unit);
          next[index] = {
            ...next[index],
            calories: est.calories,
            proteinG: est.proteinG,
            carbsG:   est.carbsG,
            fatG:     est.fatG,
          };
        }
      }

      if (field === 'unit') {
        const unit = value as string;
        if (next[index].name.trim().length > 1 && next[index].quantity !== undefined && (next[index].quantity as number) > 0) {
          const est = estimateMacros(next[index].name, next[index].quantity, unit);
          next[index] = {
            ...next[index],
            calories: est.calories,
            proteinG: est.proteinG,
            carbsG:   est.carbsG,
            fatG:     est.fatG,
          };
        }
      }

      return next;
    });
  }, []);

  const handleSelectSuggestion = (index: number, suggestion: string) => {
    const currentQty  = foods[index]?.quantity;
    const currentUnit = foods[index]?.unit || 'g';
    const est = estimateMacros(suggestion, currentQty, currentUnit);

    setFoods((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        name:     suggestion,
        calories: est.calories,
        proteinG: est.proteinG,
        carbsG:   est.carbsG,
        fatG:     est.fatG,
      };
      return next;
    });

    setShowSuggestions((s) => ({ ...s, [index]: false }));
    setFoodSuggestions((s) => ({ ...s, [index]: [] }));
  };

  /**
   * Handle food scanned via barcode
   */
  const handleAddScannedFood = (scannedItem: FoodItem) => {
    if (isModalOpen) {
      // Append to currently editing meal
      setFoods((prev) => [...prev, scannedItem]);
    } else {
      // Open modal with this food
      setMealName('Scanned Meal');
      setFoods([scannedItem]);
      setIsModalOpen(true);
    }
    toast.success(`Added ${scannedItem.name} (${scannedItem.calories} kcal) to meal!`, 'Scanned Food Added');
  };

  /**
   * 1-Tap Add Favorite Food into current meal
   */
  const handleAddFavoriteToMeal = (fav: FavoriteFood) => {
    const item: FoodItem = {
      name: fav.name,
      quantity: fav.defaultQuantity,
      unit: fav.unit || 'g',
      calories: fav.calories,
      proteinG: fav.proteinG,
      carbsG: fav.carbsG,
      fatG: fav.fatG,
    };

    if (isModalOpen) {
      setFoods((prev) => [...prev, item]);
      toast.success(`Added ${fav.name} to meal!`, 'Favorite Added');
    } else {
      setMealName('Quick Meal');
      setFoods([item]);
      setIsModalOpen(true);
      toast.info(`Started meal with ${fav.name}. Tap Save when done!`, 'Meal Created');
    }
  };

  /**
   * Toggle favorite food status
   */
  const handleToggleFavorite = (food: FoodItem) => {
    if (!food.name.trim()) return;
    const added = toggleFavoriteFood(food);
    if (added) {
      toast.success(`Pinned ${food.name} to Frequent Favorites!`, 'Favorite Saved');
    } else {
      toast.info(`Unpinned ${food.name} from Favorites.`, 'Favorite Removed');
    }
  };

  const isItemFavorited = (name: string): boolean => {
    const n = name.toLowerCase().trim();
    return favoriteFoods.some((f) => f.name.toLowerCase().trim() === n);
  };

  const handleSaveMeal = () => {
    const validFoods = foods.filter((f) => f.name.trim());
    if (!mealName.trim()) {
      toast.error('Please enter a meal name (e.g. Breakfast, Post-Workout).', 'Missing Name');
      return;
    }
    if (validFoods.length === 0) {
      toast.error('Please add at least one food item with a name.', 'No Food Items');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newMeal: MealEntry = {
      id: crypto.randomUUID(),
      date: today,
      name: mealName.trim(),
      foods: validFoods,
    };

    const mealMacros = calculateMealMacros(validFoods);

    addMeal(newMeal);
    toast.success(
      `Added ${mealName.trim()} (~${Math.round(mealMacros.calories)} kcal, ~${Math.round(mealMacros.proteinG)}g protein)!`,
      'Meal Logged'
    );
    setIsModalOpen(false);
    setMealName('');
    setFoods([]);
  };

  const handleOpenGoalsModal = () => {
    if (macroGoals) {
      setGoalCalories(macroGoals.calories ? String(macroGoals.calories) : '');
      setGoalProtein(macroGoals.proteinG ? String(macroGoals.proteinG) : '');
      setGoalCarbs(macroGoals.carbsG ? String(macroGoals.carbsG) : '');
      setGoalFat(macroGoals.fatG ? String(macroGoals.fatG) : '');
    } else {
      const bw   = profile?.bodyweightKg || 75;
      const cal  = Math.round(bw * 32);
      const prot = Math.round(bw * 2);
      const fat  = Math.round(bw * 0.9);
      const carb = Math.max(0, Math.round((cal - prot * 4 - fat * 9) / 4));
      setGoalCalories(String(cal));
      setGoalProtein(String(prot));
      setGoalCarbs(String(carb));
      setGoalFat(String(fat));
    }
    setIsGoalsModalOpen(true);
  };

  const handleAutoCalculateGoals = () => {
    const bw   = profile?.bodyweightKg || 75;
    const cal  = Math.round(bw * 32);
    const prot = Math.round(bw * 2);
    const fat  = Math.round(bw * 0.9);
    const carb = Math.max(0, Math.round((cal - prot * 4 - fat * 9) / 4));
    setGoalCalories(String(cal));
    setGoalProtein(String(prot));
    setGoalCarbs(String(carb));
    setGoalFat(String(fat));
    toast.info(`Targets calibrated for ${bw}kg bodyweight (2g/kg protein).`, 'Targets Calculated');
  };

  const handleSaveGoals = () => {
    const cal  = parseFloat(goalCalories);
    const prot = parseFloat(goalProtein);
    const carb = parseFloat(goalCarbs);
    const fat  = parseFloat(goalFat);

    if (isNaN(cal) || cal <= 0 || isNaN(prot) || prot <= 0) {
      toast.error('Please enter valid target calories and protein.', 'Invalid Targets');
      return;
    }

    const newGoals: MacroGoals = {
      calories:  Math.round(cal),
      proteinG:  Math.round(prot),
      carbsG:    !isNaN(carb) && carb > 0 ? Math.round(carb) : undefined,
      fatG:      !isNaN(fat)  && fat  > 0 ? Math.round(fat)  : undefined,
    };

    setMacroGoals(newGoals);
    toast.success(`Daily goals set: ${newGoals.calories} kcal & ${newGoals.proteinG}g protein.`, 'Goals Saved');
    setIsGoalsModalOpen(false);
  };

  const handleClearGoals = () => {
    setMacroGoals(null);
    toast.info('Daily macro targets cleared.', 'Targets Reset');
    setIsGoalsModalOpen(false);
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const todayDate   = new Date().toISOString().split('T')[0];
  const todayMeals  = meals.filter((m) => m.date === todayDate);
  const todayMacros = calculateMealMacros(todayMeals.flatMap((m) => m.foods));

  // Yesterday's meals for Quick Copy feature
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().split('T')[0];
  const yesterdayMeals = meals.filter((m) => m.date === yesterdayDate);
  const yesterdayMacros = calculateMealMacros(yesterdayMeals.flatMap((m) => m.foods));

  const handleCopyYesterday = () => {
    if (yesterdayMeals.length === 0) return;
    const copiedCount = copyMealsFromDate(yesterdayDate, todayDate);
    toast.success(
      `🎉 Copied ${copiedCount} meal${copiedCount > 1 ? 's' : ''} from yesterday (~${Math.round(yesterdayMacros.calories)} kcal)!`,
      'Yesterday Meals Copied'
    );
  };

  const handleCopySpecificDay = (sourceDate: string) => {
    const copiedCount = copyMealsFromDate(sourceDate, todayDate);
    toast.success(
      `Copied ${copiedCount} meal${copiedCount > 1 ? 's' : ''} from ${sourceDate} to Today!`,
      'Meals Copied'
    );
  };

  const groupedMeals = useMemo(() => {
    const groups: Record<string, MealEntry[]> = {};
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 14);

    meals.forEach((meal) => {
      const mealDate = new Date(meal.date);
      if (mealDate >= weekAgo) {
        if (!groups[meal.date]) groups[meal.date] = [];
        groups[meal.date].push(meal);
      }
    });

    return Object.entries(groups)
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [meals]);

  const currentMealMacros = calculateMealMacros(foods);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="page animate-fade-in space-y-5">
      {/* ── Header ── */}
      <header className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2.5">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="w-8 h-8 rounded-lg bg-bg-card border border-border flex items-center justify-center text-accent hover:border-accent transition-colors active:scale-95"
              title="Return to Home Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">Meals &amp; Macros</h1>
            <p className="text-2xs text-text-muted font-mono">Track nutrition &amp; fuel your strength</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Barcode Scanner Button */}
          <button
            type="button"
            onClick={() => setIsBarcodeModalOpen(true)}
            className="p-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center gap-1"
            title="Scan Food Barcode (Open Food Facts)"
          >
            <BarcodeIcon className="w-4 h-4 text-accent" />
            <span className="hidden sm:inline text-xs font-mono font-semibold">Scan</span>
          </button>
          <ThemeToggle />
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={() => {
              if (foods.length === 0) handleAddFood();
              setIsModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Log Meal</span>
            <span className="sm:hidden">Log</span>
          </button>
        </div>
      </header>

      {/* ── Today's Nutrition & Goals (Item 16: Emphasize Calories & Protein) ── */}
      <section className="card p-4 sm:p-5 bg-bg-card border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title text-[11px] mb-0 font-sans">TODAY&apos;S NUTRITION</h2>
            <p className="text-2xs text-text-muted mt-0.5">Strength &amp; macro targets</p>
          </div>
          <button
            type="button"
            onClick={handleOpenGoalsModal}
            className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
          >
            <Target className="w-3.5 h-3.5" />
            <span>{macroGoals ? 'Edit Targets' : 'Set Targets'}</span>
          </button>
        </div>

        {/* Primary Emphasis: Calories & Protein (Item 16) */}
        <div className="grid grid-cols-2 gap-3">
          {/* Calories Box */}
          <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
              CALORIES
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-accent font-sans">
                {Math.round(todayMacros.calories)}
              </span>
              {macroGoals && (
                <span className="text-xs text-text-muted font-medium">/ {macroGoals.calories} kcal</span>
              )}
            </div>
            {macroGoals && (
              <div className="level-bar h-1.5 mt-1">
                <div
                  className="level-bar-fill bg-accent"
                  style={{ width: `${Math.min(100, Math.round((todayMacros.calories / macroGoals.calories) * 100))}%` }}
                />
              </div>
            )}
          </div>

          {/* Protein Box (High strength emphasis) */}
          <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider block flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              PROTEIN (KEY)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-600 font-sans">
                {Math.round(todayMacros.proteinG)}g
              </span>
              {macroGoals && (
                <span className="text-xs text-text-muted font-medium">/ {macroGoals.proteinG}g</span>
              )}
            </div>
            {macroGoals && (
              <div className="level-bar h-1.5 mt-1">
                <div
                  className="level-bar-fill bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.round((todayMacros.proteinG / macroGoals.proteinG) * 100))}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Secondary Info: Carbs & Fat */}
        <div className="flex items-center justify-around py-2 px-3 rounded-xl bg-bg-secondary/40 border border-border/50 text-xs text-text-secondary">
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted font-medium">Carbs:</span>
            <strong className="text-text-primary">{Math.round(todayMacros.carbsG)}g</strong>
            {macroGoals?.carbsG && (
              <span className="text-2xs text-text-muted">/ {macroGoals.carbsG}g</span>
            )}
          </div>
          <span className="text-border">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted font-medium">Fat:</span>
            <strong className="text-text-primary">{Math.round(todayMacros.fatG)}g</strong>
            {macroGoals?.fatG && (
              <span className="text-2xs text-text-muted">/ {macroGoals.fatG}g</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Feature: Copy Yesterday's Meals (High Consistency) ── */}
      {yesterdayMeals.length > 0 && todayMeals.length === 0 && (
        <section className="card p-3.5 bg-gradient-to-r from-bg-card via-bg-elevated/40 to-bg-card border border-accent/35 flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent flex-shrink-0">
              <Copy className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-text-primary block font-sans">
                REPEAT YESTERDAY&apos;S DIET
              </span>
              <span className="text-[11px] text-text-muted font-sans">
                {yesterdayMeals.length} meals • ~{Math.round(yesterdayMacros.calories)} kcal • ~{Math.round(yesterdayMacros.proteinG)}g protein
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyYesterday}
            className="btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy All</span>
          </button>
        </section>
      )}

      {/* ── Feature: Frequent & Pinned Foods (Item 17: Clean 2-column grid) ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-accent fill-accent" />
            <h2 className="section-title text-[11px] mb-0 font-sans">FREQUENT &amp; PINNED FOODS</h2>
          </div>
          <span className="text-2xs text-text-muted font-sans">{favoriteFoods.length} Pinned</span>
        </div>

        {/* Clean 2-column grid to prevent awkwardly clipped cards (Item 17) */}
        <div className="grid grid-cols-2 gap-2">
          {favoriteFoods.map((fav) => (
            <button
              key={fav.id}
              type="button"
              onClick={() => handleAddFavoriteToMeal(fav)}
              className="p-2.5 rounded-xl bg-bg-card border border-border hover:border-accent/60 transition-all text-left group active:scale-[0.98] shadow-xs"
              title={`Tap to log ${fav.name} in 1 tap`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-text-primary group-hover:text-accent truncate">
                  {fav.name}
                </span>
                <Star className="w-3 h-3 text-accent fill-accent shrink-0 ml-1" />
              </div>
              <div className="flex items-center gap-1.5 text-2xs text-text-muted mt-1">
                <span>{fav.defaultQuantity ? `${fav.defaultQuantity} ${fav.unit}` : fav.unit}</span>
                <span>•</span>
                <span className="text-accent font-semibold">~{fav.calories} kcal</span>
                <span>•</span>
                <span className="text-emerald-600 font-semibold">~{fav.proteinG}g P</span>
              </div>
            </button>
          ))}
          {favoriteFoods.length === 0 && (
            <div className="col-span-2 p-3 rounded-xl bg-bg-secondary/40 border border-dashed border-border text-xs text-text-muted text-center">
              Star (⭐) foods in your meals to pin them here for 1-tap quick logging.
            </div>
          )}
        </div>
      </section>

      {/* ── Meal History (Item 18: Clean action empty state) ── */}
      <section className="space-y-2.5">
        <div className="flex justify-between items-center px-0.5">
          <h2 className="section-title text-[11px] mb-0 font-sans">MEAL HISTORY</h2>
          <span className="text-xs text-text-muted">{meals.length} logged</span>
        </div>

        {groupedMeals.length === 0 ? (
          /* Item 18: Clean empty state without bloated feature list */
          <div className="card text-center py-8 px-4 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent mx-auto">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">No meals logged</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Log your first meal to start tracking calories and protein.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (foods.length === 0) handleAddFood();
                setIsModalOpen(true);
              }}
              className="btn-primary mx-auto text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>LOG MEAL</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groupedMeals.map(([date, dayMeals]) => {
              const isToday = date === todayDate;
              return (
                <div key={date}>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider font-mono">
                      {isToday
                        ? 'Today'
                        : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </h3>
                    {!isToday && (
                      <button
                        type="button"
                        onClick={() => handleCopySpecificDay(date)}
                        className="text-2xs font-mono text-accent hover:underline flex items-center gap-1 font-semibold"
                        title="Copy all meals from this day to Today"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy to Today</span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {dayMeals.map((meal) => {
                      const isExpanded = expandedMeals.has(meal.id);
                      const macros = calculateMealMacros(meal.foods);
                      return (
                        <div key={meal.id} className="card">
                          <div
                            className="flex justify-between items-center cursor-pointer"
                            onClick={() => toggleExpand(meal.id)}
                          >
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <h4 className="font-semibold text-text-primary text-sm">{meal.name}</h4>
                                <span className="font-bold text-accent text-sm font-mono">
                                  ~{Math.round(macros.calories)} kcal
                                </span>
                              </div>
                              <div className="flex gap-3 text-xs text-text-secondary font-mono">
                                <span className="text-info">~{Math.round(macros.proteinG)}g P</span>
                                <span>•</span>
                                <span className="text-warning">~{Math.round(macros.carbsG)}g C</span>
                                <span>•</span>
                                <span className="text-danger">~{Math.round(macros.fatG)}g F</span>
                              </div>
                            </div>
                            <div className="ml-3 flex items-center text-text-muted">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3.5 flex flex-col gap-2 border-t border-border pt-3">
                              {meal.foods.map((food, i) => (
                                <div key={i} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-bg-elevated/50">
                                  <div className="text-text-primary flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleFavorite(food);
                                      }}
                                      className="text-text-muted hover:text-accent p-0.5"
                                      title={isItemFavorited(food.name) ? 'Unpin favorite' : 'Pin to favorites'}
                                    >
                                      <Star
                                        className={`w-3.5 h-3.5 ${
                                          isItemFavorited(food.name) ? 'text-accent fill-accent' : 'text-text-muted'
                                        }`}
                                      />
                                    </button>
                                    <span className="font-medium">{food.name}</span>{' '}
                                    <span className="text-text-muted">({food.quantity ? `${food.quantity} ${food.unit}` : food.unit})</span>
                                  </div>
                                  <div className="text-text-secondary font-mono">
                                    <span className="text-accent">~{Math.round(food.calories)} kcal</span>
                                    <span className="text-text-muted ml-2">P:~{Math.round(food.proteinG)}g</span>
                                  </div>
                                </div>
                              ))}
                              <div className="mt-1 flex justify-end">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteMeal(meal.id);
                                    toast.info(`Deleted ${meal.name} entry.`, 'Meal Removed');
                                  }}
                                  className="text-danger hover:text-danger/80 text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-danger/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete Meal
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════════════ LOG MEAL MODAL ══════════════════ */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-bold text-text-primary">Log Meal</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsBarcodeModalOpen(true)}
                  className="px-2 py-1 rounded bg-bg-elevated border border-border text-xs font-mono text-accent hover:border-accent flex items-center gap-1"
                  title="Scan Food Barcode"
                >
                  <BarcodeIcon className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
                <button onClick={() => setIsModalOpen(false)} className="text-text-secondary hover:text-text-primary p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">

              {/* ── Meal Name + Quick Templates ── */}
              <div>
                <label className="section-title mb-1.5 block">Meal Name</label>

                {/* Quick-log template buttons */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {MEAL_TEMPLATES.map((template) => (
                    <button
                      key={template}
                      type="button"
                      onClick={() => setMealName(template)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border transition-colors ${
                        mealName === template
                          ? 'bg-accent text-white border-accent'
                          : 'bg-bg-elevated border-border text-text-secondary hover:border-accent/60 hover:text-accent'
                      }`}
                    >
                      {template}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="e.g. Breakfast, Lunch, Post-Workout Shake"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary text-sm focus:border-accent outline-none"
                />
              </div>

              {/* ── Quick Add Favorites Inside Modal ── */}
              {favoriteFoods.length > 0 && (
                <div>
                  <label className="text-2xs font-mono text-text-muted uppercase block mb-1">
                    Quick-Add Favorites (1-Tap)
                  </label>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none font-mono">
                    {favoriteFoods.map((fav) => (
                      <button
                        key={fav.id}
                        type="button"
                        onClick={() => handleAddFavoriteToMeal(fav)}
                        className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-bg-elevated border border-border text-2xs text-text-secondary hover:text-accent hover:border-accent/60 flex items-center gap-1 transition-colors"
                      >
                        <Star className="w-3 h-3 text-accent fill-accent" />
                        <span>{fav.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Foods Section ── */}
              <div>
                <div className="flex justify-between items-center mb-2.5">
                  <label className="section-title">Foods</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsBarcodeModalOpen(true)}
                      className="text-accent text-xs font-semibold flex items-center gap-1 hover:brightness-110 font-mono"
                    >
                      <BarcodeIcon className="w-3.5 h-3.5" /> Scan Barcode
                    </button>
                    <button
                      type="button"
                      onClick={handleAddFood}
                      className="text-accent text-xs font-semibold flex items-center gap-1 hover:brightness-110"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Food
                    </button>
                  </div>
                </div>

                {foods.length === 0 ? (
                  <div className="border border-dashed border-border/80 rounded-xl p-5 text-center bg-bg-elevated/20">
                    <Utensils className="w-6 h-6 text-text-muted mx-auto mb-1.5 opacity-40" />
                    <p className="text-xs text-text-secondary font-medium">No foods added to this meal yet.</p>
                    <p className="text-[11px] text-text-muted font-mono mt-0.5">
                      Tap &quot;Add Food&quot;, select from Favorites above, or scan a barcode.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddFood}
                      className="mt-3 btn-ghost text-xs py-1 px-3 mx-auto flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Food Item
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {foods.map((food, i) => {
                      const isQtySet = food.quantity !== undefined && (food.quantity as number) > 0;
                      const hasName  = food.name.trim().length >= 2;
                      const suggestions = foodSuggestions[i] || [];
                      const isDropdownOpen = showSuggestions[i] && suggestions.length > 0;
                      const favorited = isItemFavorited(food.name);

                      return (
                        <div
                          key={i}
                          className="border border-border rounded-xl p-3 bg-bg-elevated/40 relative space-y-2"
                        >
                          {/* Row header: label + favorite star + delete */}
                          <div className="flex items-center justify-between">
                            <span className="text-2xs font-mono text-accent font-semibold">
                              FOOD {i + 1}
                            </span>
                            <div className="flex items-center gap-1">
                              {hasName && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleFavorite(food)}
                                  className="text-text-muted hover:text-accent p-0.5"
                                  title={favorited ? 'Unpin favorite' : 'Pin to favorites'}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      favorited ? 'text-accent fill-accent' : 'text-text-muted'
                                    }`}
                                  />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveFood(i)}
                                className="text-text-muted hover:text-danger p-0.5 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Food Name input with live autocomplete */}
                          <div
                            className="relative"
                            ref={(el) => { suggestionRefs.current[i] = el; }}
                          >
                            <input
                              type="text"
                              placeholder="Food name (e.g. Chicken breast, Eggs, Rice, Whey)"
                              value={food.name}
                              onChange={(e) => handleFoodChange(i, 'name', e.target.value)}
                              className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary text-sm focus:border-accent outline-none"
                            />

                            {/* Dropdown suggestions list */}
                            {isDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                                {suggestions.map((sugg) => (
                                  <button
                                    key={sugg}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectSuggestion(i, sugg);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-bg-elevated hover:text-accent flex items-center justify-between border-b border-border/40 last:border-b-0 font-medium"
                                  >
                                    <span>{sugg}</span>
                                    <ChevronRight className="w-3 h-3 text-text-muted" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Quantity & Unit Row */}
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder="Qty (enter amount)"
                              value={food.quantity ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                handleFoodChange(i, 'quantity', v === '' ? undefined : Number(v));
                              }}
                              className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent placeholder:text-text-muted"
                            />

                            <select
                              value={food.unit || 'g'}
                              onChange={(e) => handleFoodChange(i, 'unit', e.target.value)}
                              className="bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent min-w-[90px]"
                            >
                              {UNIT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Macro breakdown indicators / manual override */}
                          {hasName && (
                            <div className="bg-bg-primary/70 p-2 rounded-lg border border-border/80 space-y-1.5">
                              {/* Quantity guidance banner if quantity is missing */}
                              {!isQtySet ? (
                                <p className="text-[11px] text-text-muted font-mono italic">
                                  Enter quantity above to calculate macros automatically.
                                </p>
                              ) : (
                                <div className="flex items-center justify-between text-2xs font-mono text-text-muted pb-0.5 border-b border-border/40">
                                  <span className="flex items-center gap-1 text-accent font-semibold">
                                    <Sparkles className="w-3 h-3" />
                                    ~{Math.round(food.calories)} kcal
                                  </span>
                                  <span>
                                    P:~{food.proteinG}g • C:~{food.carbsG}g • F:~{food.fatG}g
                                  </span>
                                </div>
                              )}

                              {/* Editable macro input fields */}
                              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                                <div>
                                  <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                    {isQtySet ? '~CAL' : 'CAL'}
                                  </span>
                                  <input
                                    type="number"
                                    value={food.calories || ''}
                                    placeholder="0"
                                    onChange={(e) => handleFoodChange(i, 'calories', Number(e.target.value))}
                                    className="w-full bg-transparent text-accent text-xs font-mono font-semibold p-0 border-none outline-none"
                                  />
                                </div>
                                <div>
                                  <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                    {isQtySet ? '~PRO' : 'PRO'}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={food.proteinG || ''}
                                    placeholder="0"
                                    onChange={(e) => handleFoodChange(i, 'proteinG', Number(e.target.value))}
                                    className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                                  />
                                </div>
                                <div>
                                  <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                    {isQtySet ? '~CARB' : 'CARB'}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={food.carbsG || ''}
                                    placeholder="0"
                                    onChange={(e) => handleFoodChange(i, 'carbsG', Number(e.target.value))}
                                    className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                                  />
                                </div>
                                <div>
                                  <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                    {isQtySet ? '~FAT' : 'FAT'}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={food.fatG || ''}
                                    placeholder="0"
                                    onChange={(e) => handleFoodChange(i, 'fatG', Number(e.target.value))}
                                    className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer with Meal Totals + Actions */}
            <div className="p-4 border-t border-border bg-bg-card">
              <div className="flex justify-between text-xs mb-1.5 font-mono">
                <span className="text-text-muted">MEAL TOTAL</span>
                <span className="font-bold text-accent">~{Math.round(currentMealMacros.calories)} kcal</span>
              </div>
              <div className="flex justify-between text-xs text-text-secondary mb-4 font-mono">
                <span>~{Math.round(currentMealMacros.proteinG)}g P</span>
                <span>•</span>
                <span>~{Math.round(currentMealMacros.carbsG)}g C</span>
                <span>•</span>
                <span>~{Math.round(currentMealMacros.fatG)}g F</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-ghost flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveMeal}
                  disabled={!mealName.trim() || foods.length === 0 || !foods.some((f) => f.name.trim())}
                  className="btn-primary flex-1 disabled:opacity-40 text-xs"
                >
                  Save Meal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ DAILY MACRO TARGETS MODAL ══════════════════ */}
      {isGoalsModalOpen && (
        <div className="modal-overlay" onClick={() => setIsGoalsModalOpen(false)}>
          <div
            className="modal-content p-5 space-y-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-text-primary leading-tight">
                    Daily Macro Targets
                  </h3>
                  <p className="text-2xs text-text-muted font-mono">Caloric &amp; protein pacing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGoalsModalOpen(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Auto-Calculate Banner */}
            <div className="p-3 rounded-lg bg-bg-secondary border border-border/70 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  Auto-Calculate
                </p>
                <p className="text-[11px] text-text-muted font-mono">
                  Based on {profile?.bodyweightKg || 75}kg bodyweight
                </p>
              </div>
              <button
                type="button"
                onClick={handleAutoCalculateGoals}
                className="px-2.5 py-1 rounded bg-bg-elevated border border-border text-xs font-mono text-accent hover:border-accent/60 transition-colors"
              >
                Apply
              </button>
            </div>

            {/* Input Fields */}
            <div className="space-y-3 font-mono">
              <div>
                <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                  Daily Calorie Target (kcal)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 2500"
                  value={goalCalories}
                  onChange={(e) => setGoalCalories(e.target.value)}
                  className="w-full text-base font-bold text-text-primary"
                />
              </div>

              <div>
                <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                  Protein Target (grams)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 160"
                  value={goalProtein}
                  onChange={(e) => setGoalProtein(e.target.value)}
                  className="w-full text-base font-bold text-text-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    Carbs (g, optional)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 260"
                    value={goalCarbs}
                    onChange={(e) => setGoalCarbs(e.target.value)}
                    className="w-full text-sm font-bold text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    Fat (g, optional)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 70"
                    value={goalFat}
                    onChange={(e) => setGoalFat(e.target.value)}
                    className="w-full text-sm font-bold text-text-primary"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              {macroGoals && (
                <button
                  type="button"
                  onClick={handleClearGoals}
                  className="btn-danger py-2 px-3 text-xs font-mono"
                  title="Remove daily targets"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveGoals}
                className="btn-primary flex-1 py-2 text-xs font-bold font-mono uppercase"
              >
                Save Targets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ BARCODE SCANNER MODAL ══════════════════ */}
      <BarcodeScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        onAddFood={handleAddScannedFood}
      />
    </div>
  );
}
