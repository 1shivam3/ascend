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
  Droplet,
  Camera,
  Edit2,
  Settings2,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import { MealEntry, FoodItem, MacroGoals, FavoriteFood } from '@/lib/types';
import ThemeToggle from '@/components/ui/ThemeToggle';
import BarcodeScannerModal from '@/components/BarcodeScannerModal';
import ScanMealModal from '@/components/ScanMealModal';
import HydrationModal from '@/components/HydrationModal';
import CreatineModal from '@/components/CreatineModal';
import { calculateHydrationTarget } from '@/lib/habits';
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
  const toggleFavoriteFood    = useStore((state) => state.toggleFavoriteFood);
  const updateFavoriteFood    = useStore((state) => state.updateFavoriteFood);
  const deleteFavoriteFood    = useStore((state) => state.deleteFavoriteFood);
  const clearAllFavoriteFoods = useStore((state) => state.clearAllFavoriteFoods);
  const toast              = useToast();

  // Habit store state
  const waterLogs          = useStore((state) => state.waterLogs || {});
  const creatineLogs       = useStore((state) => state.creatineLogs || {});
  const logWater           = useStore((state) => state.logWater);
  const toggleCreatine     = useStore((state) => state.toggleCreatine);
  const hydrationConfig    = useStore((state) => state.hydrationConfig);
  const creatineConfig     = useStore((state) => state.creatineConfig);

  // ── Modal visibility ──────────────────────────────────────────────────────
  const [isModalOpen,          setIsModalOpen]          = useState(false);
  const [isScanModalOpen,      setIsScanModalOpen]      = useState(false);
  const [isGoalsModalOpen,     setIsGoalsModalOpen]     = useState(false);
  const [isBarcodeModalOpen,   setIsBarcodeModalOpen]   = useState(false);
  const [isHydrationModalOpen, setIsHydrationModalOpen] = useState(false);
  const [isCreatineModalOpen,  setIsCreatineModalOpen]  = useState(false);
  const [isManagePinnedOpen,   setIsManagePinnedOpen]   = useState(false);
  const [isEditPinnedOpen,     setIsEditPinnedOpen]     = useState(false);
  const [editingPinnedFood,    setEditingPinnedFood]    = useState<FavoriteFood | null>(null);
  const [isNewPinned,          setIsNewPinned]          = useState(false);
  const [confirmClearAll,      setConfirmClearAll]      = useState(false);
  const [expandedMeals,        setExpandedMeals]        = useState<Set<string>>(new Set());
  const [showAllStaples,       setShowAllStaples]       = useState(false);

  // ── Pinned food edit / add form ───────────────────────────────────────────
  const [pinnedName,     setPinnedName]     = useState('');
  const [pinnedQuantity, setPinnedQuantity] = useState('');
  const [pinnedUnit,     setPinnedUnit]     = useState('g');
  const [pinnedCalories, setPinnedCalories] = useState('');
  const [pinnedProtein,  setPinnedProtein]  = useState('');
  const [pinnedCarbs,    setPinnedCarbs]    = useState('');
  const [pinnedFat,      setPinnedFat]      = useState('');

  // ── Goals form ────────────────────────────────────────────────────────────
  const [goalCalories, setGoalCalories] = useState('');
  const [goalProtein,  setGoalProtein]  = useState('');
  const [goalCarbs,    setGoalCarbs]    = useState('');
  const [goalFat,      setGoalFat]      = useState('');

  // ── Meal log form ─────────────────────────────────────────────────────────
  const [mealName, setMealName] = useState('');
  const [foods,    setFoods]    = useState<FoodItem[]>([]);

  // ── Natural language meal logging ──────────────────────────────────────────
  const [naturalQuery, setNaturalQuery] = useState('');
  const [isNaturalParsing, setIsNaturalParsing] = useState(false);

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

  // ── Pinned Food Management Handlers ───────────────────────────────────────

  const openEditPinned = (fav: FavoriteFood) => {
    setEditingPinnedFood(fav);
    setIsNewPinned(false);
    setPinnedName(fav.name);
    setPinnedQuantity(fav.defaultQuantity ? String(fav.defaultQuantity) : '');
    setPinnedUnit(fav.unit || 'g');
    setPinnedCalories(String(fav.calories || 0));
    setPinnedProtein(String(fav.proteinG || 0));
    setPinnedCarbs(fav.carbsG !== undefined ? String(fav.carbsG) : '');
    setPinnedFat(fav.fatG !== undefined ? String(fav.fatG) : '');
    setIsEditPinnedOpen(true);
  };

  const openAddPinned = () => {
    setEditingPinnedFood(null);
    setIsNewPinned(true);
    setPinnedName('');
    setPinnedQuantity('100');
    setPinnedUnit('g');
    setPinnedCalories('');
    setPinnedProtein('');
    setPinnedCarbs('');
    setPinnedFat('');
    setIsEditPinnedOpen(true);
  };

  const handleAutoEstimatePinned = () => {
    if (!pinnedName.trim()) {
      toast.error('Please enter a food name first.', 'Missing Name');
      return;
    }
    const qty = pinnedQuantity ? parseFloat(pinnedQuantity) : undefined;
    const est = estimateMacros(pinnedName.trim(), qty, pinnedUnit);
    setPinnedCalories(String(est.calories));
    setPinnedProtein(String(est.proteinG));
    setPinnedCarbs(String(est.carbsG));
    setPinnedFat(String(est.fatG));
    toast.info(`Calculated: ~${est.calories} kcal, ~${est.proteinG}g protein.`, 'Macros Calculated');
  };

  const handleSavePinnedFood = () => {
    const name = pinnedName.trim();
    if (!name) {
      toast.error('Please enter a food name.', 'Missing Name');
      return;
    }
    const qty = pinnedQuantity ? parseFloat(pinnedQuantity) : undefined;
    const cal = parseFloat(pinnedCalories) || 0;
    const prot = parseFloat(pinnedProtein) || 0;
    const carb = parseFloat(pinnedCarbs) || 0;
    const fat = parseFloat(pinnedFat) || 0;

    if (editingPinnedFood && !isNewPinned) {
      updateFavoriteFood(editingPinnedFood.id, {
        name,
        defaultQuantity: qty,
        unit: pinnedUnit,
        calories: cal,
        proteinG: prot,
        carbsG: carb,
        fatG: fat,
      });
      toast.success(`Updated "${name}" in pinned foods!`, 'Food Updated');
    } else {
      toggleFavoriteFood({
        name,
        quantity: qty,
        unit: pinnedUnit,
        calories: cal,
        proteinG: prot,
        carbsG: carb,
        fatG: fat,
      });
      toast.success(`Pinned "${name}" to favorites!`, 'Food Pinned');
    }
    setIsEditPinnedOpen(false);
  };

  const handleDeletePinned = (id: string, name: string) => {
    deleteFavoriteFood(id);
    toast.info(`Removed "${name}" from pinned foods.`, 'Food Unpinned');
  };

  const handleClearAllPinned = () => {
    clearAllFavoriteFoods();
    setConfirmClearAll(false);
    setIsManagePinnedOpen(false);
    toast.info('All pinned foods have been removed.', 'Pinned Foods Cleared');
  };

  const handleAddFoodFromHistory = (food: FoodItem) => {
    if (isModalOpen) {
      setFoods((prev) => [...prev, food]);
      toast.success(`Added ${food.name} to current meal!`);
    } else {
      setMealName('Quick Meal');
      setFoods([food]);
      setIsModalOpen(true);
      toast.info(`Started meal with ${food.name}. Tap Save when done!`);
    }
  };

  const handlePinAllFrequent = () => {
    if (frequentFoodsFromHistory.length === 0) return;
    let count = 0;
    frequentFoodsFromHistory.forEach(({ food }) => {
      toggleFavoriteFood(food);
      count++;
    });
    toast.success(`Pinned ${count} frequent foods to your favorites!`, 'Foods Pinned');
  };

  const handleLogFrequentMeal = (meal: MealEntry) => {
    const today = new Date().toISOString().split('T')[0];
    const newMeal: MealEntry = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
      date: today,
      name: meal.name,
      foods: meal.foods.map((f) => ({ ...f })),
    };
    addMeal(newMeal);
    const mMacros = calculateMealMacros(meal.foods);
    toast.success(`Logged ${meal.name} (~${Math.round(mMacros.calories)} kcal)!`, 'Meal Added');
  };

  const handlePinMealFoods = (meal: MealEntry) => {
    let count = 0;
    meal.foods.forEach((f) => {
      if (!isItemFavorited(f.name)) {
        toggleFavoriteFood(f);
        count++;
      }
    });
    if (count > 0) {
      toast.success(`Pinned ${count} food${count > 1 ? 's' : ''} from ${meal.name}!`, 'Foods Pinned');
    } else {
      toast.info('All foods in this meal are already pinned.');
    }
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

  const handleNaturalLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = naturalQuery.trim();
    if (!q || isNaturalParsing) return;

    setIsNaturalParsing(true);
    try {
      const res = await fetch('/api/ai/parse-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();
      if (data && Array.isArray(data.foods) && data.foods.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const newMeal: MealEntry = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
          date: today,
          name: data.mealName || 'Quick Meal',
          foods: data.foods,
        };

        addMeal(newMeal);
        setNaturalQuery('');
        toast.success(
          `Logged ${data.foods.length} items (~${data.totalCalories || 0} kcal, ${data.totalProteinG || 0}g P)!`,
          'Meal Logged'
        );
      } else {
        toast.error('Could not parse foods from text. Please try again.', 'Parse Failed');
      }
    } catch (err) {
      console.error('Natural log error:', err);
      toast.error('Could not log meal. Please check connection.', 'Error');
    } finally {
      setIsNaturalParsing(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const todayDate   = new Date().toISOString().split('T')[0];
  const todayMeals  = meals.filter((m) => m.date === todayDate);
  const todayMacros = calculateMealMacros(todayMeals.flatMap((m) => m.foods));
  const proteinTargetG = macroGoals?.proteinG || (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140);
  const proteinRemaining = Math.max(0, proteinTargetG - todayMacros.proteinG);

  const dynamicCloseoutSuggestions = useMemo(() => {
    const candidates = favoriteFoods.filter((f) => (f.proteinG || 0) >= 6);

    if (candidates.length === 0) {
      return [
        {
          tag: '⚡ FASTEST (1 MIN PREP)',
          tagCls: 'bg-accent/10 text-accent',
          name: 'Whey Protein Shake',
          description: '1 scoop whey protein + 250ml milk or water',
          calories: 200,
          proteinG: 30,
          carbsG: 14,
          foods: [
            { name: 'Whey Protein', quantity: 30, unit: 'g', calories: 120, proteinG: 24, carbsG: 2, fatG: 1.5 },
            { name: 'Milk', quantity: 250, unit: 'ml', calories: 80, proteinG: 6, carbsG: 12, fatG: 2 },
          ],
        },
        {
          tag: '🍽️ HIGH PROTEIN STAPLE',
          tagCls: 'bg-[#22C55E]/10 text-[#22C55E]',
          name: 'Soya Chunks Bowl',
          description: '50g boiled soya chunks with spices',
          calories: 172,
          proteinG: 26,
          carbsG: 16,
          foods: [
            { name: 'Soya Chunks', quantity: 50, unit: 'g', calories: 172, proteinG: 26, carbsG: 16, fatG: 0.3 },
          ],
        },
      ];
    }

    const sorted = [...candidates].sort((a, b) => (b.proteinG || 0) - (a.proteinG || 0)).slice(0, 2);

    return sorted.map((cand, idx) => {
      const isFirst = idx === 0;
      return {
        tag: isFirst ? '⚡ PINNED HIGH PROTEIN' : '🍽️ WHOLE FOOD STAPLE',
        tagCls: isFirst ? 'bg-accent/10 text-accent' : 'bg-[#22C55E]/10 text-[#22C55E]',
        name: cand.name,
        description: `${cand.defaultQuantity || 100}${cand.unit || 'g'} ${cand.name}`,
        calories: Math.round(cand.calories),
        proteinG: Math.round(cand.proteinG),
        carbsG: Math.round(cand.carbsG),
        foods: [
          {
            name: cand.name,
            quantity: cand.defaultQuantity || 100,
            unit: cand.unit || 'g',
            calories: cand.calories,
            proteinG: cand.proteinG,
            carbsG: cand.carbsG,
            fatG: cand.fatG,
          },
        ],
      };
    });
  }, [favoriteFoods]);

  const waterToday = waterLogs[todayDate] || 0;
  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });
  const waterRemaining = Math.max(0, waterTargetMl - waterToday);
  const creatineToday = creatineLogs[todayDate];
  const creatineTaken = !!creatineToday?.taken;

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

  // ── Unified, strictly deduplicated Staples & Frequent Foods ───────────────
  const unifiedStaples = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{
      id: string;
      name: string;
      quantity?: number;
      unit: string;
      calories: number;
      proteinG: number;
      carbsG?: number;
      fatG?: number;
      isPinned: boolean;
      count?: number;
      rawFood: FoodItem;
    }> = [];

    const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Pinned favorites first
    favoriteFoods.forEach((fav) => {
      const k = normKey(fav.name);
      if (!seen.has(k) && k.length > 0) {
        seen.add(k);
        result.push({
          id: fav.id,
          name: fav.name,
          quantity: fav.defaultQuantity,
          unit: fav.unit || 'g',
          calories: fav.calories,
          proteinG: fav.proteinG,
          carbsG: fav.carbsG,
          fatG: fav.fatG,
          isPinned: true,
          rawFood: {
            name: fav.name,
            quantity: fav.defaultQuantity,
            unit: fav.unit || 'g',
            calories: fav.calories,
            proteinG: fav.proteinG,
            carbsG: fav.carbsG,
            fatG: fav.fatG,
          },
        });
      }
    });

    // 2. Count foods from meal history
    const historyCounts: Record<string, { count: number; latest: FoodItem }> = {};
    meals.forEach((m) => {
      m.foods.forEach((f) => {
        const k = normKey(f.name);
        if (!k) return;
        if (!historyCounts[k]) {
          historyCounts[k] = { count: 0, latest: f };
        }
        historyCounts[k].count += 1;
        historyCounts[k].latest = f;
      });
    });

    // 3. Add foods eaten >= 2 times that aren't already pinned
    Object.entries(historyCounts)
      .filter(([k, d]) => d.count >= 2 && !seen.has(k))
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([k, d]) => {
        seen.add(k);
        result.push({
          id: `freq_${k}`,
          name: d.latest.name,
          quantity: d.latest.quantity,
          unit: d.latest.unit || 'g',
          calories: d.latest.calories,
          proteinG: d.latest.proteinG,
          carbsG: d.latest.carbsG,
          fatG: d.latest.fatG,
          isPinned: false,
          count: d.count,
          rawFood: d.latest,
        });
      });

    return result;
  }, [favoriteFoods, meals]);

  const frequentFoodsFromHistory = useMemo(() => {
    return unifiedStaples.filter((s) => !s.isPinned && s.count && s.count >= 2).map((s) => ({
      food: s.rawFood,
      count: s.count || 2,
    }));
  }, [unifiedStaples]);

  const frequentMealsFromHistory = useMemo(() => {
    const counts: Record<string, { count: number; meal: MealEntry }> = {};
    meals.forEach((m) => {
      const name = m.name.toLowerCase().trim();
      if (!name || name === 'quick meal' || name === 'scanned meal') return;
      if (!counts[name]) {
        counts[name] = { count: 0, meal: m };
      }
      counts[name].count += 1;
    });
    return Object.values(counts)
      .filter((d) => d.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [meals]);

  const recentUniqueMeals = useMemo(() => {
    const seen = new Set<string>();
    const list: MealEntry[] = [];
    const sorted = [...meals].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const m of sorted) {
      const key = `${m.name.toLowerCase().trim()}_${m.foods.map(f => f.name).sort().join(',')}`;
      if (!seen.has(key) && m.foods.length > 0) {
        seen.add(key);
        list.push(m);
        if (list.length >= 6) break;
      }
    }
    return list;
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={() => {
              if (foods.length === 0) handleAddFood();
              setIsModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Log Food</span>
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

        {/* All 4 Macro Progress Boxes */}
        <div className="grid grid-cols-2 gap-3">
          {/* Calories Box */}
          <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
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

          {/* Protein Box (Key strength metric) */}
          <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-[#22C55E] tracking-wider block flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              PROTEIN (KEY)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-[#22C55E] font-sans">
                {Math.round(todayMacros.proteinG)}g
              </span>
              {macroGoals && (
                <span className="text-xs text-text-muted font-medium">/ {macroGoals.proteinG}g</span>
              )}
            </div>
            {macroGoals && (
              <div className="level-bar h-1.5 mt-1">
                <div
                  className="level-bar-fill bg-[#22C55E]"
                  style={{ width: `${Math.min(100, Math.round((todayMacros.proteinG / macroGoals.proteinG) * 100))}%` }}
                />
              </div>
            )}
          </div>

          {/* Carbs Box */}
          <div className="p-3 rounded-xl bg-bg-secondary/50 border border-border/60 space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#38BDF8] tracking-wider block flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
              CARBS
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-text-primary font-sans">
                {Math.round(todayMacros.carbsG)}g
              </span>
              {macroGoals?.carbsG && (
                <span className="text-xs text-text-muted font-medium">/ {macroGoals.carbsG}g</span>
              )}
            </div>
            {macroGoals?.carbsG && (
              <div className="level-bar h-1 mt-1">
                <div
                  className="level-bar-fill bg-[#38BDF8]"
                  style={{ width: `${Math.min(100, Math.round((todayMacros.carbsG / macroGoals.carbsG) * 100))}%` }}
                />
              </div>
            )}
          </div>

          {/* Fat Box */}
          <div className="p-3 rounded-xl bg-bg-secondary/50 border border-border/60 space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#F5B301] tracking-wider block flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5B301]" />
              FAT
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-text-primary font-sans">
                {Math.round(todayMacros.fatG)}g
              </span>
              {macroGoals?.fatG && (
                <span className="text-xs text-text-muted font-medium">/ {macroGoals.fatG}g</span>
              )}
            </div>
            {macroGoals?.fatG && (
              <div className="level-bar h-1 mt-1">
                <div
                  className="level-bar-fill bg-[#F5B301]"
                  style={{ width: `${Math.min(100, Math.round((todayMacros.fatG / macroGoals.fatG) * 100))}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Primary Action: Dominant Scan Meal & Secondary Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => setIsScanModalOpen(true)}
            className="w-full btn-primary py-3 px-4 rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-md shadow-accent/25 hover:brightness-105 active:scale-[0.98] transition-all text-center"
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              <Camera className="w-4 h-4" />
              <span>SCAN MEAL</span>
            </div>
            <span className="text-2xs text-white/80 font-normal">
              Estimate calories &amp; macros from a photo
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (foods.length === 0) handleAddFood();
                setIsModalOpen(true);
              }}
              className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>Log Food</span>
            </button>
            <button
              type="button"
              onClick={() => setIsBarcodeModalOpen(true)}
              className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              title="Scan Food Barcode (Open Food Facts)"
            >
              <BarcodeIcon className="w-3.5 h-3.5 text-accent" />
              <span>Barcode</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── NATURAL-LANGUAGE QUICK FOOD LOGGING (AI & IFCT Calibrated) ── */}
      <section className="card p-4 bg-gradient-to-r from-accent/10 via-bg-card to-accent/5 border border-accent/30 space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h3 className="section-title text-[10px] mb-0 font-sans text-accent">
              NATURAL FOOD LOGGING
            </h3>
          </div>
          <span className="text-3xs font-mono text-text-muted">Gemini &amp; Indian IFCT Calibrated</span>
        </div>

        <form onSubmit={handleNaturalLogSubmit} className="space-y-2">
          <div className="relative">
            <input
              type="text"
              placeholder='Type e.g. "2 roti, 1 bowl dal, 100g paneer"'
              value={naturalQuery}
              onChange={(e) => setNaturalQuery(e.target.value)}
              disabled={isNaturalParsing}
              className="w-full bg-[#1B2030] border border-border/80 rounded-xl py-2.5 pl-3 pr-24 text-xs font-sans text-text-primary outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!naturalQuery.trim() || isNaturalParsing}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-lg bg-accent text-white font-bold text-xs flex items-center gap-1 disabled:opacity-40 hover:brightness-105 active:scale-95 transition-all shadow-xs"
            >
              {isNaturalParsing ? (
                <span className="text-3xs animate-pulse">Parsing...</span>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Log</span>
                </>
              )}
            </button>
          </div>
          <p className="text-3xs text-text-muted leading-tight">
            Type your meal naturally. Indian foods (roti, dal, paneer, sattu, eggs, whey) are calibrated accurately without complex tapping.
          </p>
        </form>
      </section>

      {/* ── WHAT SHOULD I EAT NEXT? (Protein Close-out Suggestions) ── */}
      {proteinRemaining > 10 && (
        <section className="card p-4 bg-gradient-to-br from-bg-card via-bg-card to-emerald-500/5 border border-emerald-500/30 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="section-title text-[10px] mb-0 text-emerald-500 font-sans">
                WHAT SHOULD I EAT NEXT?
              </h3>
            </div>
            <span className="text-2xs font-mono font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              {Math.round(proteinRemaining)}g protein left
            </span>
          </div>

          <p className="text-xs text-text-secondary">
            Quick high-protein suggestions to hit your daily target:
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dynamicCloseoutSuggestions.map((sug, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 flex flex-col justify-between hover:border-emerald-500/40 transition-colors space-y-2"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-3xs font-mono uppercase font-bold px-1.5 py-0.5 rounded ${sug.tagCls}`}>
                        {sug.tag}
                      </span>
                      <span className="text-xs font-bold text-[#22C55E] font-mono">+{sug.proteinG}g P</span>
                    </div>
                    <h4 className="text-xs font-bold text-text-primary">{sug.name}</h4>
                    <p className="text-3xs text-text-muted mt-0.5">{sug.description}</p>
                    <p className="text-3xs text-text-secondary mt-1 font-mono">
                      ~{sug.calories} kcal • {sug.proteinG}g protein • {sug.carbsG}g carbs
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newMeal: MealEntry = {
                        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
                        date: todayDate,
                        name: sug.name,
                        foods: sug.foods,
                      };
                      addMeal(newMeal);
                      toast.success(`Logged ${sug.name} (+${sug.proteinG}g protein)!`, 'Protein Logged');
                    }}
                    className="btn-primary py-1.5 text-2xs font-semibold w-full flex items-center justify-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Log 1-Tap</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Daily Hydration & Supplements Habit Strip (Unified System) ── */}
      <section className="card p-3.5 bg-bg-card border border-border space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="section-title text-[10px] mb-0 font-sans">DAILY HYDRATION &amp; SUPPLEMENTS</span>
          <button
            type="button"
            onClick={() => setIsHydrationModalOpen(true)}
            className="text-[11px] font-semibold text-accent hover:underline"
          >
            Adjust Target
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Water widget */}
          <div
            onClick={() => setIsHydrationModalOpen(true)}
            className="p-3 rounded-xl bg-bg-secondary/70 border border-border/70 hover:border-sky-500/40 cursor-pointer transition-all space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-sky-600 uppercase flex items-center gap-1">
                <Droplet className="w-3.5 h-3.5 fill-sky-500/20 stroke-sky-500" />
                WATER
              </span>
              <span className="text-[10px] text-text-muted font-medium">
                {waterRemaining === 0 ? '✓ Hit' : `${(waterRemaining / 1000).toFixed(1)}L left`}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-text-primary font-sans">
                {(waterToday / 1000).toFixed(1)}
              </span>
              <span className="text-xs text-text-muted font-medium">
                / {(waterTargetMl / 1000).toFixed(1)} L
              </span>
            </div>
            <div className="flex gap-1 pt-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  logWater(250, todayDate);
                  toast.success('+250 ml logged!', 'Hydration');
                }}
                className="flex-1 py-1 rounded-lg bg-bg-card border border-border text-[10px] font-bold text-text-primary hover:border-sky-500 active:scale-95 transition-colors"
              >
                +250ml
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  logWater(500, todayDate);
                  toast.success('+500 ml logged!', 'Hydration');
                }}
                className="flex-1 py-1 rounded-lg bg-bg-card border border-border text-[10px] font-bold text-text-primary hover:border-sky-500 active:scale-95 transition-colors"
              >
                +500ml
              </button>
            </div>
          </div>

          {/* Creatine widget */}
          <div
            onClick={() => setIsCreatineModalOpen(true)}
            className="p-3 rounded-xl bg-bg-secondary/70 border border-border/70 hover:border-amber-500/40 cursor-pointer transition-all space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 fill-amber-500/20 stroke-amber-500" />
                CREATINE
              </span>
              <span className="text-[10px] text-text-muted font-medium">
                {creatineTaken ? '✓ Taken' : 'Pending'}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-sans ${creatineTaken ? 'text-emerald-600' : 'text-text-primary'}`}>
                {creatineTaken ? `${creatineConfig?.dailyTargetG || 5}g` : 'Not Taken'}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCreatine(todayDate);
                if (!creatineTaken) {
                  toast.success(`${creatineConfig?.dailyTargetG || 5}g creatine logged!`, 'Creatine');
                } else {
                  toast.info('Creatine marked as not taken', 'Creatine');
                }
              }}
              className={`w-full py-1 rounded-lg border text-[10px] font-bold transition-all active:scale-95 ${
                creatineTaken
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                  : 'bg-bg-card border-border text-text-primary hover:border-amber-500'
              }`}
            >
              {creatineTaken ? '✓ Taken Today' : '+ Log Creatine'}
            </button>
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

      {/* ── Feature: Staples & Frequent Foods (Unified, Zero Duplication) ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-accent fill-accent" />
            <h2 className="section-title text-[11px] mb-0 font-sans">STAPLES &amp; FREQUENT FOODS</h2>
            {unifiedStaples.length > 0 && (
              <span className="text-2xs bg-accent/15 text-accent font-bold px-1.5 py-0.5 rounded-md font-mono">
                {unifiedStaples.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openAddPinned}
              className="text-2xs font-semibold text-accent hover:underline flex items-center gap-1"
              title="Add a custom pinned food"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
            <button
              type="button"
              onClick={() => setIsManagePinnedOpen(true)}
              className="text-2xs font-semibold text-text-secondary hover:text-text-primary flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg-card border border-border hover:border-accent/40 transition-colors"
              title="Manage and edit pinned foods"
            >
              <Settings2 className="w-3 h-3 text-accent" />
              <span>Manage</span>
            </button>
          </div>
        </div>

        {/* Clean responsive grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(showAllStaples ? unifiedStaples : unifiedStaples.slice(0, 4)).map((staple) => {
            const favMatch = staple.isPinned ? favoriteFoods.find((f) => f.id === staple.id) : undefined;
            return (
              <div
                key={staple.id}
                onClick={() => handleAddFoodFromHistory(staple.rawFood)}
                className="p-2.5 rounded-xl bg-bg-card border border-border hover:border-accent/60 transition-all text-left group active:scale-[0.99] shadow-xs cursor-pointer relative flex flex-col justify-between"
                title={`Tap to log ${staple.name} in 1 tap`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-text-primary group-hover:text-accent truncate">
                        {staple.name}
                      </span>
                      {staple.count && staple.count >= 2 && !staple.isPinned && (
                        <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-accent/15 text-accent shrink-0">
                          {staple.count}×
                        </span>
                      )}
                      {staple.isPinned && (
                        <span className="text-[9px] font-mono font-medium px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 shrink-0">
                          STAPLE
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    {favMatch ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditPinned(favMatch)}
                          className="p-1 text-text-muted hover:text-accent rounded hover:bg-bg-secondary transition-colors"
                          title={`Edit ${staple.name}`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePinned(favMatch.id, favMatch.name)}
                          className="p-1 text-text-muted hover:text-danger rounded hover:bg-danger/10 transition-colors"
                          title={`Unpin ${staple.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(staple.rawFood)}
                        className="p-1 text-text-muted hover:text-accent rounded hover:bg-bg-secondary transition-colors"
                        title="Pin this food to your staples"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/40">
                  <div className="flex items-center gap-1 text-2xs text-text-muted truncate">
                    <span>{staple.quantity ? `${staple.quantity} ${staple.unit}` : staple.unit}</span>
                    <span>•</span>
                    <span className="text-accent font-semibold">~{Math.round(staple.calories)} kcal</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">~{Math.round(staple.proteinG)}g P</span>
                  </div>
                  <span className="text-[10px] font-medium text-accent flex items-center gap-0.5 shrink-0 ml-1">
                    <Plus className="w-2.5 h-2.5" /> Log
                  </span>
                </div>
              </div>
            );
          })}

          {unifiedStaples.length === 0 && (
            <div className="col-span-1 sm:col-span-2 p-3.5 rounded-xl bg-bg-secondary/40 border border-dashed border-border text-center space-y-1.5">
              <p className="text-xs text-text-secondary font-medium">No pinned staples or frequent foods yet.</p>
              <p className="text-2xs text-text-muted">
                Log meals or tap &quot;Add&quot; above to pin your daily staples (e.g. Roti, Dal, Paneer, Whey) for 1-tap quick logging.
              </p>
              <button
                type="button"
                onClick={openAddPinned}
                className="btn-secondary py-1 px-3 text-xs mx-auto flex items-center gap-1 mt-1"
              >
                <Plus className="w-3 h-3 text-accent" />
                <span>Add Pinned Food</span>
              </button>
            </div>
          )}
        </div>

        {/* See all / Show less toggle */}
        {unifiedStaples.length > 4 && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setShowAllStaples((prev) => !prev)}
              className="text-2xs font-semibold text-text-muted hover:text-accent flex items-center gap-1 px-3 py-1 rounded-full bg-bg-secondary/60 border border-border/80 transition-colors"
            >
              <span>{showAllStaples ? 'Show less' : `See all ${unifiedStaples.length} foods`}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showAllStaples ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
      </section>

        {/* ── Recent Meals (1-Tap Repeat) ── */}
        {recentUniqueMeals.length > 0 && (
          <section className="pt-1.5 space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider font-mono block">
                RECENT MEALS (1-TAP REPEAT)
              </span>
              <span className="text-2xs text-text-muted">
                {recentUniqueMeals.length} recent
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {recentUniqueMeals.map((meal) => {
                const mMacros = calculateMealMacros(meal.foods);
                const mealDate = new Date(meal.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                });
                return (
                  <div
                    key={meal.id}
                    className="flex-shrink-0 p-2.5 rounded-xl bg-bg-card border border-border min-w-[210px] max-w-[260px] space-y-1.5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-text-primary truncate">{meal.name}</span>
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted shrink-0">
                          {mealDate}
                        </span>
                      </div>
                      <div className="text-2xs text-text-muted truncate mt-0.5" title={meal.foods.map((f) => f.name).join(', ')}>
                        {meal.foods.map((f) => f.name).join(', ')}
                      </div>
                      <div className="text-2xs text-text-muted mt-1">
                        {meal.foods.length} items • <span className="text-accent font-semibold">~{Math.round(mMacros.calories)} kcal</span> • <span className="text-emerald-600 font-semibold">~{Math.round(mMacros.proteinG)}g P</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleLogFrequentMeal(meal)}
                        className="btn-primary flex-1 py-1 text-2xs font-semibold flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Repeat Today</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePinMealFoods(meal)}
                        className="p-1 rounded-lg border border-border text-accent hover:border-accent hover:bg-accent/10 transition-colors"
                        title="Pin all foods from this meal"
                      >
                        <Star className="w-3 h-3 fill-accent/20" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
                              <div className="mt-1 flex justify-between items-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const today = new Date().toISOString().split('T')[0];
                                    const repeatedMeal: MealEntry = {
                                      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
                                      date: today,
                                      name: meal.name,
                                      foods: meal.foods.map((f) => ({ ...f })),
                                    };
                                    addMeal(repeatedMeal);
                                    toast.success(`Repeated "${meal.name}" for Today!`, 'Meal Logged');
                                  }}
                                  className="text-accent hover:underline text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/10 transition-colors font-medium"
                                >
                                  <Copy className="w-3.5 h-3.5" /> Repeat Meal
                                </button>

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

      {/* ══════════════════ PHOTO AI SCAN MEAL MODAL ══════════════════ */}
      <ScanMealModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
      />

      {/* ══════════════════ BARCODE SCANNER MODAL ══════════════════ */}
      <BarcodeScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        onAddFood={handleAddScannedFood}
      />

      {/* Hydration Target Modal */}
      <HydrationModal
        isOpen={isHydrationModalOpen}
        onClose={() => setIsHydrationModalOpen(false)}
      />

      {/* Creatine Tracker Modal */}
      <CreatineModal
        isOpen={isCreatineModalOpen}
        onClose={() => setIsCreatineModalOpen(false)}
      />

      {/* ══════════════════ MANAGE PINNED FOODS MODAL ══════════════════ */}
      {isManagePinnedOpen && (
        <div className="modal-overlay" onClick={() => setIsManagePinnedOpen(false)}>
          <div
            className="modal-content max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-accent fill-accent" />
                <h2 className="text-base font-bold text-text-primary">Manage Pinned Foods</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsManagePinnedOpen(false)}
                className="text-text-muted hover:text-text-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-2xs text-text-muted">
              Edit portion sizes, adjust calories/macros, or remove pinned items. Pinned foods appear on your nutrition dashboard for 1-tap logging.
            </p>

            {/* List of Pinned Foods */}
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {favoriteFoods.map((fav) => (
                <div
                  key={fav.id}
                  className="p-3 rounded-xl bg-bg-card border border-border flex items-center justify-between gap-2 shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-text-primary truncate">{fav.name}</p>
                    <p className="text-2xs text-text-muted mt-0.5">
                      {fav.defaultQuantity ? `${fav.defaultQuantity} ${fav.unit}` : fav.unit} •{' '}
                      <span className="text-accent font-semibold">~{fav.calories} kcal</span> •{' '}
                      <span className="text-emerald-600 font-semibold">~{fav.proteinG}g P</span>
                      {fav.carbsG ? ` • ~${fav.carbsG}g C` : ''}
                      {fav.fatG ? ` • ~${fav.fatG}g F` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditPinned(fav)}
                      className="p-1.5 rounded-lg bg-bg-secondary text-text-secondary hover:text-accent hover:border-accent/40 border border-border transition-colors"
                      title="Edit food details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePinned(fav.id, fav.name)}
                      className="p-1.5 rounded-lg bg-bg-secondary text-text-muted hover:text-danger hover:border-danger/40 border border-border transition-colors"
                      title="Remove food"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {favoriteFoods.length === 0 && (
                <div className="p-4 rounded-xl bg-bg-secondary/40 border border-dashed border-border text-center text-xs text-text-muted">
                  No pinned foods. Tap &quot;Add Custom Food&quot; below to create your first pinned food!
                </div>
              )}
            </div>

            {/* Clear All Confirmation Block */}
            {confirmClearAll ? (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-danger">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Remove all {favoriteFoods.length} pinned foods?</span>
                </div>
                <p className="text-2xs text-text-muted">
                  This will remove all items from your pinned foods list. This action cannot be undone.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="btn-secondary flex-1 py-1.5 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllPinned}
                    className="btn-danger flex-1 py-1.5 text-xs font-bold"
                  >
                    Yes, Clear All
                  </button>
                </div>
              </div>
            ) : null}

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-border">
              {favoriteFoods.length > 0 && !confirmClearAll && (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="text-xs font-semibold text-danger hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove All</span>
                </button>
              )}
              <button
                type="button"
                onClick={openAddPinned}
                className="btn-primary ml-auto py-2 px-3 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Food</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ EDIT / ADD PINNED FOOD MODAL ══════════════════ */}
      {isEditPinnedOpen && (
        <div className="modal-overlay" onClick={() => setIsEditPinnedOpen(false)}>
          <div
            className="modal-content max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-text-primary">
                  {isNewPinned ? 'Add Pinned Food' : `Edit "${editingPinnedFood?.name}"`}
                </h2>
                <p className="text-2xs text-text-muted mt-0.5">
                  Set default portion &amp; nutritional values
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPinnedOpen(false)}
                className="text-text-muted hover:text-text-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                  Food Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chicken Breast, Whole Eggs, Oats"
                  value={pinnedName}
                  onChange={(e) => setPinnedName(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary text-sm focus:border-accent outline-none font-medium"
                />
              </div>

              {/* Default Quantity & Unit */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    Default Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 150"
                    value={pinnedQuantity}
                    onChange={(e) => setPinnedQuantity(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary text-sm focus:border-accent outline-none"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    Unit
                  </label>
                  <select
                    value={pinnedUnit}
                    onChange={(e) => setPinnedUnit(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary text-sm focus:border-accent outline-none"
                  >
                    {UNIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Auto Calculate Button */}
              <button
                type="button"
                onClick={handleAutoEstimatePinned}
                className="w-full py-1.5 px-3 rounded-lg bg-bg-secondary border border-border hover:border-accent/40 text-xs font-semibold text-accent flex items-center justify-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>⚡ Auto-Calculate Macros from Name</span>
              </button>

              {/* Macros Breakdown */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    Calories (kcal)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 250"
                    value={pinnedCalories}
                    onChange={(e) => setPinnedCalories(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-accent font-bold text-sm focus:border-accent outline-none"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-emerald-600 uppercase block mb-1">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 30"
                    value={pinnedProtein}
                    onChange={(e) => setPinnedProtein(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-emerald-600 font-bold text-sm focus:border-accent outline-none"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 15"
                    value={pinnedCarbs}
                    onChange={(e) => setPinnedCarbs(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary text-sm focus:border-accent outline-none"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5"
                    value={pinnedFat}
                    onChange={(e) => setPinnedFat(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary text-sm focus:border-accent outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex gap-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsEditPinnedOpen(false)}
                className="btn-secondary py-2 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePinnedFood}
                className="btn-primary flex-1 py-2 text-xs font-bold uppercase tracking-wider"
              >
                {isNewPinned ? 'Pin Food' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
