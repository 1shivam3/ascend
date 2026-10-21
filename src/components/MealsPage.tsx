"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';
import {
  estimateMacros,
  calculateMealMacros,
  calculateRecommendedMacroGoals,
  calculateMaintenanceCalories,
  getMacroCalorieDrift,
  parseNaturalMealOffline,
  getAbsurdQuantityWarning,
  isJunkMealParse,
  scaleFoodByQuantity,
  getSafeMinCalories,
} from '@/lib/macros';
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
  ChevronLeft,
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
  Zap,
  Leaf,
  Calendar,
} from 'lucide-react';
import { MealEntry, FoodItem, MacroGoals, FavoriteFood, AthleteGoal, ATHLETE_GOAL_CONFIGS, DietPreference, OilLevelId, MealDayKind, DEFAULT_GOALS, resolvePrimaryGoal } from '@/lib/types';
import { resolveIndianMeta } from '@/lib/indian-foods';
import { OIL_LEVELS, defaultOilForFood, withOilLevel } from '@/lib/oil-adjust';
import { searchFoods, type FoodSearchResult } from '@/lib/food-search';
import {
  getProteinGapSuggestion,
  getWholeDayAdaptation,
  getDayKindTargets,
  isHintDismissed,
  dismissHint,
} from '@/lib/nutrition-coach';
import { CollapsibleDetails } from '@/components/ui/CollapsibleDetails';
import dynamic from 'next/dynamic';

// The barcode scanner (camera + ZXing glue) is one of the heaviest
// leaves in the meals chunk and is only needed when the user actually
// taps Scan — load it on demand instead of at tab open.
const BarcodeScannerModal = dynamic(() => import('@/components/BarcodeScannerModal'), {
  ssr: false,
});
import ScanMealModal from '@/components/ScanMealModal';
import HydrationModal from '@/components/HydrationModal';
import CreatineModal from '@/components/CreatineModal';
import { calculateHydrationTarget } from '@/lib/habits';
import { useToast } from '@/components/ui/Toast';

import { useAppNavigation } from '@/lib/navigation';
import { safeRandomId, getLocalTodayStr, formatLocalDate, round1, plural, formatWaterMl } from '@/lib/formatters';

// ─── Constants ───────────────────────────────────────────────────────────────

const MEAL_TEMPLATES = ['Breakfast', 'Lunch', 'Dinner', 'Pre-Workout', 'Post-Workout'] as const;

// Meal names are stored in English (data); their DISPLAY localizes via
// these keys when the stored name is one of the standard set. Custom
// names the user typed always show as-is.
const MEAL_NAME_KEYS: Record<string, StringKey> = {
  Breakfast: 'meals.breakfast',
  Lunch: 'meals.lunch',
  Dinner: 'meals.dinner',
  Snack: 'meals.snack',
  'Pre-Workout': 'meals.preWorkout',
  'Post-Workout': 'meals.postWorkout',
  'Late Meal': 'meals.lateMeal',
};

function getDefaultMealName(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 15) return 'Lunch';
  if (hour >= 15 && hour < 18) return 'Snack';
  if (hour >= 18 && hour < 22) return 'Dinner';
  return 'Late Meal';
}

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
  const { t } = useTranslation();
  const displayMealName = (name: string) => {
    const key = MEAL_NAME_KEYS[name];
    return key ? t(key) : name;
  };
  const profile            = useStore((state) => state.profile);
  const meals              = useStore((state) => state.meals);
  const macroGoals         = useStore((state) => state.macroGoals);
  const favoriteFoods      = useStore((state) => state.favoriteFoods || []);
  const addMeal            = useStore((state) => state.addMeal);
  const deleteMeal         = useStore((state) => state.deleteMeal);
  const deleteFoodFromMeal = useStore((state) => state.deleteFoodFromMeal);
  const setMacroGoals      = useStore((state) => state.setMacroGoals);
  const copyMealsFromDate  = useStore((state) => state.copyMealsFromDate);
  const uiPreferences      = useStore((state) => state.uiPreferences);
  const mealDayKinds       = useStore((state) => state.mealDayKinds || {});
  const setMealDayKind     = useStore((state) => state.setMealDayKind);
  const customFoods        = useStore((state) => state.customFoods || []);
  const addCustomFood      = useStore((state) => state.addCustomFood);
  const updateCustomFood   = useStore((state) => state.updateCustomFood);
  const deleteCustomFood   = useStore((state) => state.deleteCustomFood);
  const toggleFavoriteFood    = useStore((state) => state.toggleFavoriteFood);
  const updateFavoriteFood    = useStore((state) => state.updateFavoriteFood);
  const deleteFavoriteFood    = useStore((state) => state.deleteFavoriteFood);
  const clearAllFavoriteFoods = useStore((state) => state.clearAllFavoriteFoods);
  const toast              = useToast();
  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();

  // Habit store state
  const waterLogs          = useStore((state) => state.waterLogs || {});
  const creatineLogs       = useStore((state) => state.creatineLogs || {});
  const logWater           = useStore((state) => state.logWater);
  const resetWater         = useStore((state) => state.resetWater);
  const toggleCreatine     = useStore((state) => state.toggleCreatine);
  const hydrationConfig    = useStore((state) => state.hydrationConfig);
  const creatineConfig     = useStore((state) => state.creatineConfig);
  const creatineSupply     = useStore((state) => state.creatineSupply);
  const goals              = useStore((state) => state.goals && state.goals.length > 0 ? state.goals : DEFAULT_GOALS);

  // Athlete goal personalization — single source of truth via resolvePrimaryGoal
  const primaryGoal: AthleteGoal = resolvePrimaryGoal(
    profile?.goals && profile.goals.length > 0 ? profile.goals : goals
  );
  const goalConfig = ATHLETE_GOAL_CONFIGS[primaryGoal] || ATHLETE_GOAL_CONFIGS.build_muscle;
  const dietPreference: DietPreference = profile?.dietPreference || 'non_vegetarian';

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
  const [isRecentMealsOpen,     setIsRecentMealsOpen]     = useState(true);
  const [isMealHistoryOpen,     setIsMealHistoryOpen]     = useState(false);
  const [selectedHistoryDate,   setSelectedHistoryDate]   = useState<string | null>(null);
  const [expandedHistoryDays,   setExpandedHistoryDays]   = useState<Set<string>>(new Set());
  const [mealToDelete,          setMealToDelete]          = useState<{ id: string; name: string } | null>(null);

  // ── Progressive Disclosure UI States ──────────────────────────────────────
  const [showMacroDetails,      setShowMacroDetails]      = useState(false);
  const [isMoreToolsOpen,       setIsMoreToolsOpen]       = useState(false);
  const [isToolsMenuOpen,       setIsToolsMenuOpen]       = useState(false);
  const [isHabitsExpanded,      setIsHabitsExpanded]      = useState(false);
  const [isPacingExpanded,      setIsPacingExpanded]      = useState(false);
  const [fuelSubTab,            setFuelSubTab]            = useState<'today' | 'meals' | 'macros'>('today');

  // Sub-tab Back Handler: returning to today tab
  useEffect(() => {
    if (fuelSubTab !== 'today') {
      return registerBackHandler(() => {
        setFuelSubTab('today');
        return true;
      }, 40);
    }
  }, [fuelSubTab, registerBackHandler]);

  // ── Register Modal Back Handlers (Interconnected Navigation) ──────────────
  useEffect(() => {
    if (isToolsMenuOpen) {
      return registerBackHandler(() => { setIsToolsMenuOpen(false); return true; }, 100);
    }
  }, [isToolsMenuOpen, registerBackHandler]);

  useEffect(() => {
    if (isBarcodeModalOpen) {
      return registerBackHandler(() => { setIsBarcodeModalOpen(false); return true; }, 100);
    }
  }, [isBarcodeModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isScanModalOpen) {
      return registerBackHandler(() => { setIsScanModalOpen(false); return true; }, 100);
    }
  }, [isScanModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isModalOpen) {
      return registerBackHandler(() => { resetBuilderForm(); setIsModalOpen(false); return true; }, 100);
    }
  }, [isModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isGoalsModalOpen) {
      return registerBackHandler(() => { setIsGoalsModalOpen(false); return true; }, 100);
    }
  }, [isGoalsModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isHydrationModalOpen) {
      return registerBackHandler(() => { setIsHydrationModalOpen(false); return true; }, 100);
    }
  }, [isHydrationModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isCreatineModalOpen) {
      return registerBackHandler(() => { setIsCreatineModalOpen(false); return true; }, 100);
    }
  }, [isCreatineModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isManagePinnedOpen) {
      return registerBackHandler(() => { setIsManagePinnedOpen(false); return true; }, 100);
    }
  }, [isManagePinnedOpen, registerBackHandler]);

  useEffect(() => {
    if (isEditPinnedOpen) {
      return registerBackHandler(() => { setIsEditPinnedOpen(false); setEditingPinnedFood(null); return true; }, 100);
    }
  }, [isEditPinnedOpen, registerBackHandler]);

  useEffect(() => {
    if (selectedHistoryDate) {
      return registerBackHandler(() => { setSelectedHistoryDate(null); return true; }, 80);
    }
  }, [selectedHistoryDate, registerBackHandler]);

  useEffect(() => {
    if (mealToDelete) {
      return registerBackHandler(() => { setMealToDelete(null); return true; }, 100);
    }
  }, [mealToDelete, registerBackHandler]);

  useEffect(() => {
    if (confirmClearAll) {
      return registerBackHandler(() => { setConfirmClearAll(false); return true; }, 100);
    }
  }, [confirmClearAll, registerBackHandler]);

  useEffect(() => {
    if (isMealHistoryOpen) {
      return registerBackHandler(() => { setIsMealHistoryOpen(false); return true; }, 100);
    }
  }, [isMealHistoryOpen, registerBackHandler]);

  useEffect(() => {
    if (isMoreToolsOpen) {
      return registerBackHandler(() => { setIsMoreToolsOpen(false); return true; }, 100);
    }
  }, [isMoreToolsOpen, registerBackHandler]);

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

  // Builder draft is always discarded on cancel/close — deterministic, never stale.
  const resetBuilderForm = () => {
    setMealName('');
    setFoods([]);
  };

  // ── Natural language meal logging ──────────────────────────────────────────
  const [naturalQuery, setNaturalQuery] = useState('');
  const [isNaturalParsing, setIsNaturalParsing] = useState(false);

  // ── Autocomplete state ────────────────────────────────────────────────────
  const [foodSuggestions,        setFoodSuggestions]        = useState<Record<number, FoodSearchResult[]>>({});
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

  const toggleHistoryDay = (dateStr: string) => {
    setExpandedHistoryDays((prev) => {
      const next = new Set(prev);
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr);
      return next;
    });
  };

  const handleAddFood = () => {
    setFoods((prev) => [...prev, EMPTY_FOOD()]);
  };

  const handleRemoveFood = (index: number) => {
    setFoods((prev) => prev.filter((_, i) => i !== index));
    setFoodSuggestions({});
    setShowSuggestions({});
    setActiveSuggestionIndex({});
  };

  /** Ghee/oil selector: adjust this item's fat/calories relative to the
   *  amount the database already assumed for the dish. */
  const handleOilChange = (index: number, level: OilLevelId) => {
    setFoods((prev) => prev.map((f, i) => (i === index ? withOilLevel(f, level) : f)));
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
          const suggestions = searchFoods(name, useStore.getState().customFoods || []);
          setFoodSuggestions((s) => ({ ...s, [index]: suggestions }));
          setShowSuggestions((s) => ({ ...s, [index]: suggestions.length > 0 }));
        } else {
          setFoodSuggestions((s) => ({ ...s, [index]: [] }));
          setShowSuggestions((s) => ({ ...s, [index]: false }));
        }

        if (name.length > 1 && next[index].quantity !== undefined && (next[index].quantity as number) > 0) {
          const est = estimateMacros(name, next[index].quantity, next[index].unit);
          // New food identity → reset the ghee/oil state to this dish's
          // database assumption (undefined for non-Indian dishes).
          const oil = defaultOilForFood(name);
          next[index] = {
            ...next[index],
            calories: est.calories,
            proteinG: est.proteinG,
            carbsG:   est.carbsG,
            fatG:     est.fatG,
            isUnmatched: est.isUnmatched,
            customFoodId: undefined,
            oilAssumedTsp: oil?.assumedTsp,
            oilLevel: oil?.level,
          };
        }
      }

      if (field === 'quantity') {
        // Reject zero/negative quantities explicitly instead of silently blanking.
        if (typeof value === 'number' && !isNaN(value) && value <= 0) {
          toast.error('Quantity must be greater than 0.', 'Invalid Quantity');
          return prev;
        }
        const rawQty = typeof value === 'number' && !isNaN(value) && value > 0 ? value : undefined;
        if (next[index].name.trim().length > 1) {
          // prevItem must come from `prev` (pre-update): next[index] already
          // carries the NEW quantity, which made ratio = rawQty/prevQty = 1
          // and silently skipped scaling.
          const prevItem = prev[index];
          const prevQty = typeof prevItem.quantity === 'number' && prevItem.quantity > 0 ? prevItem.quantity : null;
          if (prevQty && prevItem.calories > 0 && rawQty) {
            // Proportional scaling preserves scanned or custom barcode macros!
            // scaleFoodByQuantity keeps the ratio math in one tested place.
            next[index] = scaleFoodByQuantity(prevItem, rawQty);
          } else if (prevItem.isUnmatched && (prevItem.calories > 0 || (prevItem.proteinG || 0) > 0)) {
            // User entered custom macros for an unmatched food; do not wipe them out!
            next[index] = {
              ...prevItem,
              quantity: rawQty,
            };
          } else {
            const est = estimateMacros(next[index].name, rawQty, next[index].unit);
            next[index] = {
              ...next[index],
              quantity: rawQty,
              calories: est.calories,
              proteinG: est.proteinG,
              carbsG:   est.carbsG,
              fatG:     est.fatG,
              isUnmatched: est.isUnmatched,
            };
          }
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
            isUnmatched: est.isUnmatched,
          };
        }
      }

      if (field === 'proteinG' || field === 'carbsG' || field === 'fatG') {
        const val = Math.max(0, Number(value) || 0);
        const p = field === 'proteinG' ? val : (Number(next[index].proteinG) || 0);
        const c = field === 'carbsG' ? val : (Number(next[index].carbsG) || 0);
        const f = field === 'fatG' ? val : (Number(next[index].fatG) || 0);
        next[index] = {
          ...next[index],
          [field]: val,
          calories: Math.round(4 * p + 4 * c + 9 * f),
          isUnmatched: false,
        };
      }

      if (field === 'calories') {
        next[index] = {
          ...next[index],
          calories: Math.max(0, Math.round(Number(value) || 0)),
          isUnmatched: false,
        };
      }

      return next;
    });
  }, []);

  const handleSelectSuggestion = (index: number, result: FoodSearchResult) => {
    // "My version" — the user's own saved food: fill the exact portion
    // snapshot they saved (quantity changes scale it proportionally).
    if (result.kind === 'custom' && result.customFood) {
      const cf = result.customFood;
      const oil = defaultOilForFood(cf.name);
      setFoods((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          name: cf.name,
          quantity: cf.defaultQuantity ?? 1,
          unit: cf.unit || 'g',
          calories: cf.calories,
          proteinG: cf.proteinG,
          carbsG: cf.carbsG,
          fatG: cf.fatG,
          isUnmatched: false,
          customFoodId: cf.id,
          oilAssumedTsp: oil?.assumedTsp,
          oilLevel: cf.oilLevel ?? oil?.level,
        };
        return next;
      });
      setShowSuggestions((s) => ({ ...s, [index]: false }));
      setFoodSuggestions((s) => ({ ...s, [index]: [] }));
      return;
    }

    const suggestion = result.name;
    let currentQty = foods[index]?.quantity;
    let currentUnit = foods[index]?.unit || 'g';
    if (!currentQty || currentQty <= 0) {
      currentQty = ['piece', 'pieces', 'scoop', 'slice', 'bowl', 'cup', 'serving', 'handful'].includes(currentUnit) ? 1 : 100;
    }
    // Indian dishes default to their household unit — "1 katori dal",
    // not "100 g dal" — when the user hasn't picked a unit themselves.
    const indianMeta = resolveIndianMeta(suggestion);
    if (indianMeta && currentUnit === 'g') {
      currentUnit = indianMeta.meta.units[0].id;
      currentQty = 1;
    }
    const est = estimateMacros(suggestion, currentQty, currentUnit);
    const oil = defaultOilForFood(suggestion);

    setFoods((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        name:     suggestion,
        quantity: currentQty,
        unit:     currentUnit,
        calories: est.calories,
        proteinG: est.proteinG,
        carbsG:   est.carbsG,
        fatG:     est.fatG,
        isUnmatched: est.isUnmatched,
        customFoodId: undefined,
        oilAssumedTsp: oil?.assumedTsp,
        oilLevel: oil?.level,
      };
      return next;
    });

    setShowSuggestions((s) => ({ ...s, [index]: false }));
    setFoodSuggestions((s) => ({ ...s, [index]: [] }));
  };

  /** Household recipe learning: save this row's exact portion + values
   *  as the user's own version of the food. */
  const handleSaveMyVersion = (index: number) => {
    const food = foods[index];
    if (!food || !food.name.trim()) return;
    const snapshot = {
      name: food.name.trim(),
      calories: food.calories || 0,
      proteinG: food.proteinG || 0,
      carbsG: food.carbsG || 0,
      fatG: food.fatG || 0,
      defaultQuantity: food.quantity,
      unit: food.unit || 'g',
      baseFoodKey: resolveIndianMeta(food.name)?.key,
      oilLevel: food.oilLevel,
    };
    if (food.customFoodId) {
      updateCustomFood(food.customFoodId, snapshot);
      toast.success(`Updated your version of ${snapshot.name}.`, 'My Version');
    } else {
      const created = addCustomFood(snapshot);
      setFoods((prev) =>
        prev.map((f, i) => (i === index ? { ...f, customFoodId: created.id } : f))
      );
      toast.success(`Saved "${snapshot.name}" as your version — it will top search results.`, 'My Version');
    }
  };

  const handleDeleteCustomSuggestion = (index: number, result: FoodSearchResult) => {
    if (!result.customFood) return;
    deleteCustomFood(result.customFood.id);
    setFoodSuggestions((s) => ({
      ...s,
      [index]: (s[index] || []).filter((r) => r.customFood?.id !== result.customFood!.id),
    }));
    toast.info(`Deleted your version of ${result.name}.`, 'My Version');
  };

  /**
   * Handle food scanned via barcode
   */
  const handleAddScannedFood = (scannedItem: FoodItem) => {
    if (isModalOpen) {
      // Append to currently editing meal
      setFoods((prev) => [...prev, scannedItem]);
      toast.success(`Added ${scannedItem.name} (${scannedItem.calories} kcal) to meal!`, 'Scanned Food Added');
    } else {
      // User confirmed in barcode modal: save directly to today's meals
      const newMeal: MealEntry = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
        date: todayDate,
        name: scannedItem.name,
        foods: [scannedItem],
      };
      addMeal(newMeal);
      toast.success(`Logged ${scannedItem.name} (${scannedItem.calories} kcal) to today's meals!`, 'Scanned Food Logged');
    }
  };

  /**
   * 1-Tap Add Favorite Food into current meal
   */
  const handleAddFavoriteToMeal = (fav: FavoriteFood) => {
    // Favorites don't persist ghee/oil state — re-attach the dish's DB
    // default so the oil prompt stays reachable from this path too.
    const oil = defaultOilForFood(fav.name);
    const item: FoodItem = {
      name: fav.name,
      quantity: fav.defaultQuantity,
      unit: fav.unit || 'g',
      calories: fav.calories,
      proteinG: fav.proteinG,
      carbsG: fav.carbsG,
      fatG: fav.fatG,
      oilAssumedTsp: oil?.assumedTsp,
      oilLevel: oil?.level,
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
    // Older/history items may predate ghee/oil state — attach the DB
    // default when missing so the prompt is reachable; items that carry
    // their own oil answer keep it untouched.
    const oil = food.oilAssumedTsp === undefined ? defaultOilForFood(food.name) : null;
    const item: FoodItem = oil
      ? { ...food, oilAssumedTsp: oil.assumedTsp, oilLevel: food.oilLevel ?? oil.level }
      : food;
    if (isModalOpen) {
      setFoods((prev) => [...prev, item]);
      toast.success(`Added ${item.name} to current meal!`);
    } else {
      setMealName('Quick Meal');
      setFoods([item]);
      setIsModalOpen(true);
      toast.info(`Started meal with ${item.name}. Tap Save when done!`);
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

  const handleLogFrequentMeal = (meal: MealEntry, multiplier: number = 1) => {
    const today = getLocalTodayStr();
    const scaledFoods = meal.foods.map((f) => {
      const q = f.quantity ? Math.round(f.quantity * multiplier * 10) / 10 : undefined;
      return {
        ...f,
        quantity: q,
        calories: Math.round(f.calories * multiplier),
        proteinG: Math.round((f.proteinG || 0) * multiplier * 10) / 10,
        carbsG: Math.round((f.carbsG || 0) * multiplier * 10) / 10,
        fatG: Math.round((f.fatG || 0) * multiplier * 10) / 10,
      };
    });
    const newMeal: MealEntry = {
      id: safeRandomId('meal'),
      date: today,
      name: multiplier !== 1 ? `${meal.name} (${multiplier}x)` : meal.name,
      foods: scaledFoods,
    };
    addMeal(newMeal);
    const mMacros = calculateMealMacros(scaledFoods);
    toast.success(`Logged ${newMeal.name} (~${Math.round(mMacros.calories)} kcal, ~${Math.round(mMacros.proteinG)}g P)!`, 'Meal Added');
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
    if (validFoods.length === 0) {
      toast.error('Please add at least one food item with a name.', 'No Food Items');
      return;
    }

    // Require an explicit meal name — the old time-based default ("Late Meal")
    // produced piles of indistinguishable duplicates.
    const finalMealName = mealName.trim();
    if (!finalMealName) {
      toast.error('Please give this meal a name (e.g. "Post-Workout Shake").', 'Meal Name Required');
      return;
    }

    const cleanedFoods: FoodItem[] = validFoods.map((f) => {
      const q = typeof f.quantity === 'number' && !isNaN(f.quantity) && f.quantity > 0 ? f.quantity : 1;
      const cal = Math.max(0, Math.round(Number(f.calories) || 0));
      const p = Math.max(0, Math.round((Number(f.proteinG) || 0) * 10) / 10);
      const c = Math.max(0, Math.round((Number(f.carbsG) || 0) * 10) / 10);
      const fat = Math.max(0, Math.round((Number(f.fatG) || 0) * 10) / 10);
      return {
        ...f,
        name: f.name.trim(),
        quantity: q,
        unit: f.unit || 'g',
        calories: cal,
        proteinG: p,
        carbsG: c,
        fatG: fat,
      };
    });

    const today = getLocalTodayStr();
    const newMeal: MealEntry = {
      id: safeRandomId('meal'),
      date: today,
      name: finalMealName,
      foods: cleanedFoods,
    };

    const absurdWarning = cleanedFoods.map(getAbsurdQuantityWarning).find((w) => w !== null);
    if (absurdWarning) {
      toast.error(absurdWarning, 'Unlikely Quantity');
      return;
    }

    // Save-time guard: an item with NO nutrition data at all (unmatched and
    // never given custom macros) would save as a silent 0-kcal hole in the
    // day. The inline banner warns, but saving must not go through quietly.
    const zeroDataItems = cleanedFoods.filter(
      (f) => f.calories === 0 && f.proteinG === 0 && f.carbsG === 0 && f.fatG === 0
    );
    if (zeroDataItems.length > 0) {
      toast.error(
        `${zeroDataItems.map((f) => `"${f.name}"`).join(', ')} has no nutrition values yet. Enter its calories/macros (tap the item) or remove it before saving.`,
        'Missing Nutrition Data'
      );
      return;
    }

    const mealMacros = calculateMealMacros(cleanedFoods);

    addMeal(newMeal);
    toast.success(
      `Added ${finalMealName} (~${Math.round(mealMacros.calories)} kcal, ~${Math.round(mealMacros.proteinG)}g protein)!`,
      'Meal Logged'
    );
    resetBuilderForm();
    setIsModalOpen(false);
  };

  const handleOpenGoalsModal = () => {
    if (macroGoals) {
      setGoalCalories(macroGoals.calories ? String(macroGoals.calories) : '');
      setGoalProtein(macroGoals.proteinG ? String(macroGoals.proteinG) : '');
      setGoalCarbs(macroGoals.carbsG ? String(macroGoals.carbsG) : '');
      setGoalFat(macroGoals.fatG ? String(macroGoals.fatG) : '');
    } else {
      const bw = profile?.bodyweightKg || 75;
      const rec = calculateRecommendedMacroGoals(
        bw,
        primaryGoal,
        profile?.gender || 'male',
        profile?.heightCm
      );
      setGoalCalories(String(rec.calories));
      setGoalProtein(String(rec.proteinG));
      setGoalCarbs(String(rec.carbsG || 0));
      setGoalFat(String(rec.fatG || 0));
    }
    setIsGoalsModalOpen(true);
  };

  const handleAutoCalculateGoals = () => {
    const bw = profile?.bodyweightKg || 75;
    const rec = calculateRecommendedMacroGoals(
      bw,
      primaryGoal,
      profile?.gender || 'male',
      profile?.heightCm
    );

    setGoalCalories(String(rec.calories));
    setGoalProtein(String(rec.proteinG));
    setGoalCarbs(String(rec.carbsG || 0));
    setGoalFat(String(rec.fatG || 0));

    toast.success(
      `Targets calibrated for ${bw}kg (${goalConfig.label}): ${rec.calories} kcal (${rec.proteinG}P / ${rec.carbsG}C / ${rec.fatG}F)`,
      'Goals Calibrated'
    );
  };

  const handleReconcileCarbs = () => {
    const cal = parseFloat(goalCalories) || 0;
    const prot = parseFloat(goalProtein) || 0;
    const fat = parseFloat(goalFat) || 0;
    if (cal <= 0) {
      toast.error('Please enter a daily calorie target first.', 'Calorie Target Required');
      return;
    }
    const carbsG = Math.max(0, Math.round((cal - prot * 4 - fat * 9) / 4));
    setGoalCarbs(String(carbsG));
    toast.success(`Carbs balanced to ${carbsG}g so macros total exactly ${cal} kcal.`, 'Carbs Reconciled');
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
    // Honest range validation — never silently ignore or rebalance absurd input.
    // The lower bound is the SAME safe floor the prescription and the coach
    // use (gendered, from macros.ts). It used to be 800 here — every safety
    // floor in the app was bypassable through this editor, and sub-floor
    // days were then praised as "Deficit Preserved".
    const safeFloor = getSafeMinCalories(profile?.gender || 'male');
    if (cal < safeFloor || cal > 10000) {
      toast.error(
        `Daily calories must be between ${safeFloor.toLocaleString()} and 10,000 kcal (you entered ${goalCalories}). Below ${safeFloor.toLocaleString()} kcal/day risks muscle, hormones and health — ASCEND won't set a target there.`,
        'Unsafe Target'
      );
      return;
    }
    if (prot < 10 || prot > 400) {
      toast.error(`Protein target must be between 10 and 400 g (you entered ${goalProtein} g). Very high intakes offer no benefit past ~2.2 g/kg.`, 'Unlikely Target');
      return;
    }
    if (!isNaN(fat) && (fat < 0 || fat > 300)) {
      toast.error('Fat target must be between 0 and 300 g.', 'Unlikely Target');
      return;
    }
    if (!isNaN(carb) && (carb < 0 || carb > 800)) {
      toast.error('Carb target must be between 0 and 800 g.', 'Unlikely Target');
      return;
    }

    const targetFat = !isNaN(fat) && fat > 0 ? Math.round(fat) : Math.round((cal * 0.25) / 9);
    // The typed calorie target is authoritative. Carbs are the filler macro:
    // if the numbers don't add up, carbs absorb the difference (disclosed below),
    // instead of silently overwriting the calorie target.
    const targetCarbs = Math.max(0, Math.round((cal - prot * 4 - targetFat * 9) / 4));
    const targetCalories = Math.round(cal);
    const carbsAdjusted = (!isNaN(carb) && carb > 0 && Math.abs(carb - targetCarbs) >= 5);

    const newGoals: MacroGoals = {
      calories:  targetCalories,
      proteinG:  Math.round(prot),
      fatG:      targetFat,
      carbsG:    targetCarbs,
      // Recompute maintenance from the athlete's stats so the
      // deficit/surplus explanation line survives manual edits.
      maintenanceCalories: calculateMaintenanceCalories(
        profile?.bodyweightKg || 75,
        profile?.gender || 'male',
        profile?.heightCm,
        profile?.age,
        useStore.getState().trainingProfile?.activityLevel || 'light'
      ),
      calorieDelta: 0, // set below
    };
    newGoals.calorieDelta = newGoals.calories - (newGoals.maintenanceCalories as number);

    setMacroGoals(newGoals);
    toast.success(
      `Daily goals set: ${newGoals.calories} kcal (${newGoals.proteinG}P / ${newGoals.carbsG}C / ${newGoals.fatG}F).` +
      (carbsAdjusted ? ` Carbs adjusted to fit your calorie target.` : ''),
      'Goals Saved'
    );
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

    // Reject unrecognizable input: never silently log a phantom 0-calorie meal.
    const isJunkParse = (foods: FoodItem[]) => isJunkMealParse(foods);
    const rejectJunk = () => {
      toast.error(
        `Couldn't recognize "${q.length > 40 ? q.slice(0, 40) + '…' : q}" as food. Try a food name like "2 rotis and dal", or use Add Manually.`,
        'Not Recognized'
      );
      setIsNaturalParsing(false);
    };
    // Warn when SOME items couldn't be matched: a mixed parse like
    // "2 rotis and 1 slice pizza" logs the pizza at 0 kcal, silently
    // understating the meal and flattering the deficit badge.
    const warnUnmatched = (foods: FoodItem[]) => {
      const unmatched = (foods || []).filter((f) => f.isUnmatched);
      if (unmatched.length > 0) {
        const names = unmatched.map((f) => `"${f.name}"`).join(', ');
        toast.info(
          `Couldn't identify ${names} — logged at 0 kcal, so totals may be understated. Add it manually for accurate numbers.`,
          'Some Foods Unmatched'
        );
      }
    };
    // Refuse implausible quantities (e.g. "100 rotis") instead of logging junk.
    const rejectAbsurd = (foods: FoodItem[]) => {
      const warning = foods.map(getAbsurdQuantityWarning).find((w) => w !== null);
      if (warning) {
        toast.error(warning, 'Unlikely Quantity');
        setIsNaturalParsing(false);
        return true;
      }
      return false;
    };

    setIsNaturalParsing(true);
    const today = getLocalTodayStr();
    try {
      const res = await fetch('/api/ai/parse-meal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: q,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      if (data && Array.isArray(data.foods) && data.foods.length > 0) {
        if (isJunkParse(data.foods)) {
          rejectJunk();
          return;
        }
        if (rejectAbsurd(data.foods)) {
          return;
        }
        const newMeal: MealEntry = {
          id: safeRandomId('meal'),
          date: today,
          name: data.mealName || 'Quick Meal',
          foods: data.foods,
        };

        addMeal(newMeal);
        setNaturalQuery('');
        const sourceBadge = data.source === 'gemini' || data.source === 'groq' || data.source === 'openrouter'
          ? 'Smart Macro Analysis'
          : 'Calibrated IFCT';
        warnUnmatched(data.foods);
        toast.success(
          `Logged ${data.foods.length} ${plural(data.foods.length, 'item')} (${sourceBadge}): ~${data.totalCalories || 0} kcal, ${data.totalProteinG || 0}g P!`,
          'Meal Logged'
        );
        return;
      }
      throw new Error('No foods returned from server');
    } catch (err) {
      // Offline fallback: Use client-side IFCT heuristic parser
      try {
        const offlineFoods = parseNaturalMealOffline(q);
        if (offlineFoods && offlineFoods.length > 0) {
          if (isJunkParse(offlineFoods)) {
            rejectJunk();
            return;
          }
          if (rejectAbsurd(offlineFoods)) {
            return;
          }
          const totals = calculateMealMacros(offlineFoods);
          const newMeal: MealEntry = {
            id: safeRandomId('meal'),
            date: today,
            name: 'Quick Meal (Offline)',
            foods: offlineFoods,
          };
          addMeal(newMeal);
          setNaturalQuery('');
          warnUnmatched(offlineFoods);
          toast.success(
            `Logged ${offlineFoods.length} ${plural(offlineFoods.length, 'item')} (Offline IFCT): ~${totals.calories} kcal, ${totals.proteinG}g P!`,
            'Meal Logged (Offline)'
          );
          return;
        }
      } catch (offlineErr) {
        console.error('Offline parse error in MealsPage:', offlineErr);
      }
      toast.error('Could not parse meal. Please check food text or connection.', 'Error');
    } finally {
      setIsNaturalParsing(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const todayDate   = getLocalTodayStr();
  const todayMeals  = meals.filter((m) => m.date === todayDate);
  const todayMacros = calculateMealMacros(todayMeals.flatMap((m) => m.foods));
  const proteinTargetG = macroGoals?.proteinG || (profile?.bodyweightKg ? Math.round(profile.bodyweightKg * 1.8) : 140);
  const proteinRemaining = Math.max(0, proteinTargetG - todayMacros.proteinG);

  // ── Fast/festival day pattern + nutrition coach ──────────────────────
  const dayKind = mealDayKinds[todayDate];
  const dayTargets = macroGoals ? getDayKindTargets(dayKind, macroGoals) : null;
  const displayGoals = macroGoals && dayTargets
    ? { ...macroGoals, calories: dayTargets.calories, proteinG: dayTargets.proteinG ?? macroGoals.proteinG }
    : macroGoals;
  const [, setHintTick] = useState(0);
  const currentHour = new Date().getHours();
  const proteinSuggestion = uiPreferences.coachEnabled && !isHintDismissed(todayDate, 'protein')
    ? getProteinGapSuggestion({
        diet: dietPreference,
        proteinLoggedG: todayMacros.proteinG,
        proteinTargetG: displayGoals?.proteinG || proteinTargetG,
        hour: currentHour,
      })
    : null;
  const dayAdaptation = uiPreferences.coachEnabled && !isHintDismissed(todayDate, 'adaptation')
    ? getWholeDayAdaptation({
        caloriesLogged: todayMacros.calories,
        calorieTarget: displayGoals?.calories || 0,
        hour: currentHour,
      })
    : null;
  const dismissProteinHint = () => { dismissHint(todayDate, 'protein'); setHintTick((t) => t + 1); };
  const dismissAdaptationHint = () => { dismissHint(todayDate, 'adaptation'); setHintTick((t) => t + 1); };

  // Calorie drift between sum of foods and Atwater formula
  const todayAtwaterDrift = useMemo(() => {
    return getMacroCalorieDrift(
      todayMacros.calories,
      todayMacros.proteinG,
      todayMacros.carbsG,
      todayMacros.fatG
    );
  }, [todayMacros]);

  // Goal pacing & surplus/deficit evaluation
  const goalNutritionStatus = useMemo(() => {
    if (!macroGoals) return null;
    const calDelta = Math.round(todayMacros.calories - macroGoals.calories);
    const protDelta = Math.round(todayMacros.proteinG - (macroGoals.proteinG || proteinTargetG));

    switch (primaryGoal) {
      case 'lose_fat': {
        const isDeficitKept = calDelta <= 0;
        // Legacy targets below the safe floor (set before the floor was
        // enforced in the editor) must never be praised as a kept deficit.
        if (macroGoals.calories < getSafeMinCalories(profile?.gender || 'male')) {
          return {
            isPositive: false,
            badgeText: 'Target Below Safe Minimum',
            subtext: `Your daily target is under the ${getSafeMinCalories(profile?.gender || 'male').toLocaleString()} kcal safety floor. Raise it via Edit Targets — eating this low risks muscle, hormones and health.`,
            protStatus: protDelta >= 0 ? 'Protein target met (anti-catabolic)' : `${Math.abs(protDelta)}g protein needed to spare lean mass`,
          };
        }
        return {
          isPositive: isDeficitKept,
          badgeText: isDeficitKept
            ? `Deficit Preserved (${Math.abs(calDelta)} kcal under ceiling)`
            : `Over Deficit Limit (+${calDelta} kcal)`,
          subtext: isDeficitKept
            ? 'Maintaining caloric deficit to oxidize fat stores while preserving lean tissue.'
            : 'Exceeded caloric limit for today. Prioritize lean protein and low-density foods.',
          protStatus: protDelta >= 0 ? 'Protein target met (anti-catabolic)' : `${Math.abs(protDelta)}g protein needed to spare lean mass`,
        };
      }
      case 'build_muscle': {
        const isSurplusMet = calDelta >= 0;
        return {
          isPositive: isSurplusMet,
          badgeText: isSurplusMet
            ? `Growth Surplus Reached (+${calDelta} kcal)`
            : `${Math.abs(calDelta)} kcal to reach lean surplus target`,
          subtext: isSurplusMet
            ? 'Lean surplus secured. Muscle protein synthesis and recovery are fully fueled.'
            : 'Consume remaining calories to ensure positive energy balance for muscle hypertrophy.',
          protStatus: protDelta >= 0 ? 'Protein synthesis optimized' : `${Math.abs(protDelta)}g protein needed to hit target`,
        };
      }
      case 'get_stronger': {
        const isFueled = calDelta >= -150;
        return {
          isPositive: isFueled,
          badgeText: isFueled
            ? 'Strength Energy Fueled'
            : `${Math.abs(calDelta)} kcal to fuel target`,
          subtext: 'Glycogen and ATP replenishment on target for heavy compound progression.',
          protStatus: protDelta >= 0 ? 'Structural repair protein met' : `${Math.abs(protDelta)}g protein remaining`,
        };
      }
      case 'stamina': {
        return {
          isPositive: Math.abs(calDelta) <= 200,
          badgeText: Math.abs(calDelta) <= 200
            ? 'Endurance Energy Balance'
            : `${calDelta > 0 ? `+${calDelta}` : calDelta} kcal vs maintenance`,
          subtext: 'Carbohydrate and hydration balance prioritized for sustained work capacity.',
          protStatus: protDelta >= 0 ? 'Recovery protein met' : `${Math.abs(protDelta)}g protein remaining`,
        };
      }
      case 'general_fitness':
      default: {
        return {
          isPositive: Math.abs(calDelta) <= 250,
          badgeText: Math.abs(calDelta) <= 250
            ? 'Balanced Energy Adherence'
            : `${calDelta > 0 ? `+${calDelta}` : calDelta} kcal vs target`,
          subtext: 'Healthy macro balance supporting overall wellness and joint longevity.',
          protStatus: protDelta >= 0 ? 'Daily protein met' : `${Math.abs(protDelta)}g protein remaining`,
        };
      }
    }
  }, [macroGoals, todayMacros, primaryGoal, proteinTargetG]);


  const waterToday = waterLogs[todayDate] || 0;
  const waterTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    customTargetMl: hydrationConfig?.dailyTargetMl,
    isCustomTarget: hydrationConfig?.isCustomTarget,
  });
  const waterRemaining = Math.max(0, waterTargetMl - waterToday);
  const creatineToday = creatineLogs[todayDate];
  const creatineTaken = !!creatineToday?.taken;
  // Creatine is an adult supplement in this app's guidance: never surface
  // the daily-dose row to minors, and respect the config's enabled flag.
  const showCreatine =
    creatineConfig?.enabled !== false &&
    !(typeof profile?.age === 'number' && profile.age < 18);
  const dailyCreatineTarget = creatineConfig?.dailyTargetG || 5;
  const creatineAmountG = creatineToday?.amountG || dailyCreatineTarget;

  // Yesterday's meals for Quick Copy feature
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = getLocalTodayStr(yesterday);
  const yesterdayMeals = meals.filter((m) => m.date === yesterdayDate);
  const yesterdayMacros = calculateMealMacros(yesterdayMeals.flatMap((m) => m.foods));

  const handleCopyYesterday = () => {
    if (yesterdayMeals.length === 0) return;
    const copiedCount = copyMealsFromDate(yesterdayDate, todayDate);
    toast.success(
      `Copied ${copiedCount} meal${copiedCount > 1 ? 's' : ''} from yesterday (~${Math.round(yesterdayMacros.calories)} kcal)!`,
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
        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              className="p-1.5 -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('prs.goBack')}
              title={t('prs.goBack')}
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          )}
          <div>
            <div className="text-[10px] font-mono font-bold tracking-widest text-[#FF6B1F] uppercase">{t('meals.eyebrow')}</div>
            <h1 className="display-title font-display uppercase tracking-tight text-2xl sm:text-3xl text-text-primary">{t('meals.title')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsToolsMenuOpen(true)}
            className="py-1.5 px-2.5 rounded-xl bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title={t('meals.optionsTitle')}
            aria-label={t('meals.optionsAria')}
          >
            <Sliders className="w-4 h-4 text-accent" />
            <span className="text-2xs font-bold text-text-primary font-mono hidden sm:inline">{t('meals.options')}</span>
          </button>
        </div>
      </header>

      {/* ── Segmented Control (Reference: Screen 18 in Image 1 & Image 3) ── */}
      <div role="tablist" aria-label={t('meals.navAria')} className="segmented-control">
        <button
          type="button"
          role="tab"
          aria-selected={fuelSubTab === 'today'}
          onClick={() => setFuelSubTab('today')}
          className={`segmented-item ${fuelSubTab === 'today' ? 'active' : ''}`}
        >
          {t('common.today')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={fuelSubTab === 'meals'}
          onClick={() => setFuelSubTab('meals')}
          className={`segmented-item ${fuelSubTab === 'meals' ? 'active' : ''}`}
        >
          {t('meals.tabMeals')} {todayMeals.length > 0 && `(${todayMeals.length})`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={fuelSubTab === 'macros'}
          onClick={() => setFuelSubTab('macros')}
          className={`segmented-item ${fuelSubTab === 'macros' ? 'active' : ''}`}
        >
          {t('meals.tabMacros')}
        </button>
      </div>

      {/* ── TAB 1: TODAY ── */}
      {fuelSubTab === 'today' && (
        <div className="space-y-4 animate-fade-in">
          {/* Calorie Donut & Macro Breakdown (Reference: Screen 18 & Screen 11) */}
          <section className="card p-5 sm:p-6 bg-bg-card border border-border/80 flex flex-col items-center justify-center space-y-4">
            <div className="w-full flex items-center justify-between">
              <span className="text-2xs font-bold uppercase tracking-wider text-text-muted">
                {t('meals.dailyIntake')}
              </span>
              <button
                type="button"
                onClick={handleOpenGoalsModal}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Target className="w-3.5 h-3.5" />
                <span>{macroGoals ? t('prs.editTarget') : t('meals.setTarget')}</span>
              </button>
            </div>

            {/* Circular Donut Ring */}
            <div className="relative inline-flex items-center justify-center">
              <svg width={130} height={130} className="transform -rotate-90">
                <circle
                  cx={65}
                  cy={65}
                  r={54}
                  stroke="rgb(var(--bg-secondary))"
                  strokeWidth={10}
                  fill="transparent"
                />
                <circle
                  cx={65}
                  cy={65}
                  r={54}
                  stroke="rgb(var(--accent))"
                  strokeWidth={10}
                  strokeDasharray={339.29}
                  strokeDashoffset={339.29 - (Math.min(100, Math.max(0, displayGoals ? (todayMacros.calories / displayGoals.calories) * 100 : (todayMacros.calories / 2400) * 100)) / 100) * 339.29}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-black tabular-nums text-text-primary leading-none">
                  {Math.round(todayMacros.calories).toLocaleString()}
                </span>
                <span className="text-2xs text-text-muted font-medium mt-1">
                  cal
                </span>
              </div>
            </div>
            <span className="text-2xs font-semibold text-text-muted tabular-nums">
              {t('meals.ofDailyTarget', { target: displayGoals?.calories || 2400 })}
            </span>

            {/* Fast / festival day pattern — per-date, targets are guidance */}
            <div className="w-full space-y-1.5">
              <div className="flex flex-wrap justify-center gap-1">
                {(
                  [
                    { kind: undefined, labelKey: 'meals.dayNormal' },
                    { kind: 'no_grain_fast', labelKey: 'meals.dayNoGrainFast' },
                    { kind: 'one_meal_fast', labelKey: 'meals.dayOneMealFast' },
                    { kind: 'festival_feast', labelKey: 'meals.dayFestival' },
                  ] as { kind: MealDayKind | undefined; labelKey: StringKey }[]
                ).map((opt) => {
                  const active = dayKind === opt.kind;
                  return (
                    <button
                      key={opt.labelKey}
                      type="button"
                      onClick={() => setMealDayKind(todayDate, opt.kind ?? null)}
                      className={`px-2 py-1 rounded-full text-3xs font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-accent text-white'
                          : 'bg-bg-secondary text-text-muted border border-border/60 hover:text-text-primary'
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  );
                })}
              </div>
              {dayTargets && (
                <p className="text-3xs text-text-muted text-center leading-relaxed px-2">
                  {dayTargets.note}
                </p>
              )}
            </div>
            {!dayKind && macroGoals?.maintenanceCalories !== undefined && macroGoals?.calorieDelta !== undefined && macroGoals.calorieDelta !== 0 && (
              <span className="text-3xs text-text-muted tabular-nums text-center leading-relaxed px-2">
                {macroGoals.calories.toLocaleString()} = {macroGoals.maintenanceCalories.toLocaleString()} {t('meals.maintenanceWord')}{' '}
                {macroGoals.calorieDelta < 0 ? '−' : '+'}{Math.abs(macroGoals.calorieDelta).toLocaleString()}{' '}
                {macroGoals.calorieDelta < 0 ? t('meals.deficitWord') : t('meals.surplusWord')}
                {macroGoals.calorieDelta < 0 && (
                  <> · ≈{(Math.abs(macroGoals.calorieDelta * 7) / 7000).toFixed(2)} {t('meals.perWeek')}</>
                )}
                <span className="block text-4xs opacity-80">
                  {macroGoals.calorieDelta < 0
                    ? t('meals.deficitNote', { floor: getSafeMinCalories(profile?.gender || 'male').toLocaleString() })
                    : t('meals.surplusNote')}
                </span>
              </span>
            )}

            {/* 3 Macro Cards in 3 Columns */}
            <div className="w-full grid grid-cols-3 gap-2 pt-2 border-t border-border/60">
              {/* Protein */}
              <div className="p-2.5 rounded-xl bg-bg-secondary/60 border border-border/50 text-center space-y-1">
                <span className="text-3xs uppercase font-bold text-accent tracking-wider block">{t('meals.protein')}</span>
                <span className="text-base font-extrabold text-text-primary tabular-nums block">
                  {Math.round(todayMacros.proteinG)}g
                </span>
                <span className="text-3xs text-text-muted block">
                  / {displayGoals?.proteinG || proteinTargetG}g
                </span>
              </div>

              {/* Carbs */}
              <div className="p-2.5 rounded-xl bg-bg-secondary/60 border border-border/50 text-center space-y-1">
                <span className="text-3xs uppercase font-bold text-text-secondary tracking-wider block">{t('meals.carbs')}</span>
                <span className="text-base font-extrabold text-text-primary tabular-nums block">
                  {Math.round(todayMacros.carbsG)}g
                </span>
                <span className="text-3xs text-text-muted block">
                  / {macroGoals?.carbsG || 220}g
                </span>
              </div>

              {/* Fat */}
              <div className="p-2.5 rounded-xl bg-bg-secondary/60 border border-border/50 text-center space-y-1">
                <span className="text-3xs uppercase font-bold text-text-muted tracking-wider block">{t('meals.fat')}</span>
                <span className="text-base font-extrabold text-text-primary tabular-nums block">
                  {Math.round(todayMacros.fatG)}g
                </span>
                <span className="text-3xs text-text-muted block">
                  / {macroGoals?.fatG || 70}g
                </span>
              </div>
            </div>

            {/* Sugar — shown only when at least one logged food carried
                label sugar data (barcode/packaged foods). Never shown as
                0: unknown is not zero, especially for diabetics. */}
            {typeof todayMacros.sugarG === 'number' && (
              <p className="w-full text-center text-3xs text-text-muted pt-1">
                {t('meals.sugarNote')}{' '}
                <span className="font-bold text-text-secondary">{Math.round(todayMacros.sugarG)}g</span>{' '}
                {t('meals.sugarNoteSuffix')}
              </p>
            )}
          </section>

          {/* Nutrition coach — quiet, dismissible suggestions (never guilt) */}
          {proteinSuggestion && (
            <section className="card p-4 bg-bg-card border border-border/80">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <Leaf className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-2xs font-bold uppercase tracking-wider text-text-muted block">
                    {t('meals.proteinCoach')}
                  </span>
                  <p className="text-xs text-text-secondary leading-relaxed mt-0.5">
                    {proteinSuggestion.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissProteinHint}
                  aria-label={t('meals.dismissProtein')}
                  className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </section>
          )}

          {dayAdaptation && (
            <section className="card p-4 bg-bg-card border border-border/80">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-2xs font-bold uppercase tracking-wider text-text-muted block">
                    {t('meals.lighterDinner')}
                  </span>
                  <p className="text-xs text-text-secondary leading-relaxed mt-0.5">
                    {t('meals.dinnerHint', { kcal: dayAdaptation.suggestedDinnerKcal.toLocaleString() })}
                  </p>
                  <CollapsibleDetails label={t('meals.why')} className="mt-0.5">
                    {dayAdaptation.reason}
                  </CollapsibleDetails>
                </div>
                <button
                  type="button"
                  onClick={dismissAdaptationHint}
                  aria-label={t('meals.dismissDinner')}
                  className="p-1 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </section>
          )}

          {/* Dual Scanner Action Tiles (Reference: Screen 19 "Add Food" in Image 1) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsScanModalOpen(true)}
              className="p-4 rounded-2xl bg-bg-card border border-border/80 hover:border-accent/50 flex flex-col items-center justify-center text-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 group"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-text-primary block">{t('meals.scanFood')}</span>
                <span className="text-3xs text-text-muted">{t('meals.takePhoto')}</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsBarcodeModalOpen(true)}
              className="p-4 rounded-2xl bg-bg-card border border-border/80 hover:border-accent/50 flex flex-col items-center justify-center text-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 group"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                <BarcodeIcon className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-text-primary block">{t('meals.scanBarcode')}</span>
                <span className="text-3xs text-text-muted">{t('meals.packagedProducts')}</span>
              </div>
            </button>
          </div>

          <section className="card p-4 sm:p-5 bg-bg-card border border-border space-y-4">

        {/* ── Primary Action Buttons: Scan Meal & Add Manually ── */}
        <div className="pt-2 border-t border-border/60 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setIsScanModalOpen(true)}
              className="btn-primary py-3 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-95 transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4 stroke-[2.5]" />
              <span>{t('meals.scanMeal')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (foods.length === 0) handleAddFood();
                setIsModalOpen(true);
              }}
              className="btn-secondary py-3 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border border-border hover:border-accent/40 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5] text-accent" />
              <span>{t('meals.addManually')}</span>
            </button>
          </div>

          {/* Natural Language Meal Logger Input */}
          <form onSubmit={handleNaturalLogSubmit} className="relative flex items-center">
            <input
              type="text"
              placeholder={t('meals.quickLogPlaceholder')}
              aria-label={t('meals.quickLogAria')}
              value={naturalQuery}
              onChange={(e) => setNaturalQuery(e.target.value)}
              disabled={isNaturalParsing}
              className="w-full bg-bg-secondary border border-border/80 rounded-xl py-2.5 pl-3.5 pr-20 text-xs sm:text-sm text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              <button
                type="submit"
                disabled={!naturalQuery.trim() || isNaturalParsing}
                aria-label={t('meals.logMealAria')}
                className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#FF6B1F] hover:bg-[#ff7d3b] text-stone-950 font-bold text-xs flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                {isNaturalParsing ? (
                  <span className="animate-pulse text-2xs">...</span>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('meals.log')}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Secondary Tools Dropdown ("More") */}
          <div className="flex items-center justify-between text-xs text-text-secondary px-1 pt-0.5">
            <span className="font-mono text-xs text-text-muted">Macro Lens • Voice / Text • Indian IFCT</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreToolsOpen(!isMoreToolsOpen)}
                className="py-1 px-1.5 min-h-[44px] text-text-muted hover:text-accent font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                aria-label={t('meals.moreOptions')}
              >
                <span>{t('meals.moreOptions')}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isMoreToolsOpen ? 'rotate-180' : ''}`} />
              </button>
              {isMoreToolsOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-48 rounded-xl bg-bg-card border border-border p-1.5 shadow-xl z-30 space-y-1 animate-scale-in">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreToolsOpen(false);
                      setIsBarcodeModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold text-text-primary hover:bg-bg-secondary text-left cursor-pointer"
                  >
                    <BarcodeIcon className="w-4 h-4 text-accent" />
                    <span>{t('meals.scanBarcode')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreToolsOpen(false);
                      handleCopyYesterday();
                    }}
                    disabled={yesterdayMeals.length === 0}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold text-text-primary hover:bg-bg-secondary text-left disabled:opacity-40 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-accent" />
                    <span>{t('meals.copyYesterday')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreToolsOpen(false);
                      setIsManagePinnedOpen(true);
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold text-text-primary hover:bg-bg-secondary text-left cursor-pointer"
                  >
                    <Star className="w-4 h-4 text-accent" />
                    <span>{t('meals.pinnedStaples')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreToolsOpen(false);
                      handleOpenGoalsModal();
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold text-text-primary hover:bg-bg-secondary text-left cursor-pointer"
                  >
                    <Target className="w-4 h-4 text-accent" />
                    <span>{t('meals.macroGoalsOption')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Daily Habits: Water & Creatine Only ── */}
      <section className="card p-3 bg-bg-card border border-border shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Water row */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-secondary/60 border border-border/70">
            <button
              type="button"
              className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-sky-400 rounded-lg p-1 transition-opacity hover:opacity-90"
              onClick={() => setIsHydrationModalOpen(true)}
              aria-label={t('meals.viewHydration')}
            >
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                <Droplet className="w-4 h-4" />
              </div>
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block font-mono">{t('meals.water')}</span>
                <span className="text-xs font-bold text-text-primary font-mono block">
                  {formatWaterMl(waterToday)} <span className="text-text-muted font-normal text-3xs">/ {formatWaterMl(waterTargetMl)}</span>
                </span>
              </div>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  logWater(250, todayDate);
                  toast.success(t('meals.waterLogged', { ml: 250 }), t('meals.hydration'));
                }}
                className="min-h-[44px] min-w-[54px] px-3 py-2 rounded-lg bg-bg-card border border-border text-xs font-mono font-bold text-text-primary hover:border-accent/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                aria-label={t('meals.logWater250')}
              >
                +250ml
              </button>
              <button
                type="button"
                onClick={() => {
                  logWater(500, todayDate);
                  toast.success(t('meals.waterLogged', { ml: 500 }), t('meals.hydration'));
                }}
                className="min-h-[44px] min-w-[54px] px-3 py-2 rounded-lg bg-bg-card border border-border text-xs font-mono font-bold text-text-primary hover:border-accent/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                aria-label={t('meals.logWater500')}
              >
                +500ml
              </button>
            </div>
          </div>

          {/* Creatine row */}
          {showCreatine && (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-bg-secondary/60 border border-border/70">
            <button
              type="button"
              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-purple-400 rounded-lg p-1 transition-opacity hover:opacity-90"
              onClick={() => setIsCreatineModalOpen(true)}
              aria-label={t('meals.viewCreatine')}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block font-mono truncate">{t('meals.creatine')}</span>
                <span className={`text-xs font-bold font-mono block truncate ${creatineTaken ? 'text-emerald-400' : 'text-text-primary'}`}>
                  {creatineTaken ? t('meals.creatineTakenToday', { grams: creatineAmountG }) : t('meals.creatineDailyTarget', { grams: dailyCreatineTarget })}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                toggleCreatine(todayDate, dailyCreatineTarget);
                if (!creatineTaken) {
                  toast.success(t('meals.creatineLogged', { grams: dailyCreatineTarget }), t('meals.creatine'));
                } else {
                  toast.info(t('meals.creatineNotTaken'), t('meals.creatine'));
                }
              }}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg border text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer shrink-0 flex items-center justify-center ${
                creatineTaken
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-bg-card border-border text-text-primary hover:border-accent/40'
              }`}
              aria-label={creatineTaken ? t('meals.markCreatineNotTaken') : t('meals.logCreatine', { grams: dailyCreatineTarget })}
            >
              {creatineTaken ? t('meals.taken') : t('meals.logCreatineShort', { grams: dailyCreatineTarget })}
            </button>
          </div>
          )}
        </div>
      </section>

      {/* ── 3. WHAT YOU ATE TODAY (Prominent & Clear at End of Page) ── */}
      <section className="card p-4 bg-bg-card border border-border shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-accent" />
            <h2 className="section-title text-xs mb-0 font-sans tracking-wider">
              {t('meals.whatYouAte', { count: todayMeals.length })}
            </h2>
          </div>
          <div className="text-2xs font-mono font-bold">
            <span className="text-accent">~{Math.round(todayMacros.calories)} kcal</span>
            <span className="text-text-muted mx-1">•</span>
            <span className="text-emerald-400">~{Math.round(todayMacros.proteinG)}g P</span>
          </div>
        </div>

        {todayMeals.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-bg-secondary/40 border border-dashed border-border/80 space-y-1.5">
            <p className="text-xs font-bold text-text-primary">{t('meals.noMealsToday')}</p>
            <p className="text-2xs text-text-muted max-w-xs mx-auto">
              {t('meals.noMealsTodayHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {todayMeals.map((meal) => {
              const mMacros = calculateMealMacros(meal.foods);
              const isExpanded = expandedMeals.has(meal.id);
              return (
                <div key={meal.id} className="p-3 rounded-xl bg-bg-secondary/60 border border-border/70 space-y-2">
                  <div
                    className="flex items-start justify-between cursor-pointer gap-2"
                    onClick={() => toggleExpand(meal.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-xs sm:text-sm text-text-primary truncate">
                          {displayMealName(meal.name)}
                        </h3>
                        <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                          ~{Math.round(mMacros.calories)} kcal
                        </span>
                        <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                          ~{Math.round(mMacros.proteinG)}g P
                        </span>
                      </div>
                      <p className="text-2xs text-text-muted truncate mt-1">
                        {meal.foods.map((f) => f.name).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMealToDelete({ id: meal.id, name: meal.name });
                        }}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        title={t('meals.deleteMeal')}
                        aria-label={t('meals.deleteMealNamed', { name: meal.name })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="p-1 text-text-muted">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Food Items Detail */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-border/50 space-y-1.5 animate-fade-in">
                      {meal.foods.map((food, idx) => (
                        <div key={idx} className="flex justify-between items-center text-2xs py-1 px-2 rounded-lg bg-bg-card border border-border/40">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-text-primary font-medium truncate">{food.name}</span>
                            <span className="text-text-muted text-3xs">
                              ({food.quantity ? `${food.quantity} ${food.unit}` : food.unit})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <div className="text-3xs font-mono text-text-muted shrink-0">
                              <span className="text-accent font-semibold">~{Math.round(food.calories)} kcal</span>
                              <span className="mx-1">•</span>
                              <span className="text-emerald-400 font-semibold">P: ~{Math.round(food.proteinG)}g</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteFoodFromMeal(meal.id, idx);
                                toast.info(t('meals.deletedFood', { name: food.name }));
                              }}
                              className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                              title={t('meals.deleteFoodItem')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {groupedMeals.filter(([d]) => d !== todayDate).length > 0 && (
          <div className="pt-2 text-center border-t border-border/50">
            <button
              type="button"
              onClick={() => setFuelSubTab('meals')}
              className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{t('meals.viewHistory', { count: groupedMeals.length, word: t(groupedMeals.length === 1 ? 'meals.dayOne' : 'meals.dayMany') })}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>
    </div>
  )}

  {/* ── TAB 2: MEALS HISTORY (Reference: Screen 14 in Board 2) ── */}
  {fuelSubTab === 'meals' && (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold text-text-primary">{t('meals.historyTitle')}</h2>
          <p className="text-2xs text-text-muted">{t('meals.historySubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsScanModalOpen(true)}
            className="py-1.5 px-3 rounded-xl bg-accent text-white text-xs font-bold hover:brightness-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{t('meals.scanMeal')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (foods.length === 0) handleAddFood();
              setIsModalOpen(true);
            }}
            className="py-1.5 px-3 rounded-xl bg-bg-card border border-border text-xs font-bold text-text-primary hover:border-accent/40 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span>{t('common.add')}</span>
          </button>
        </div>
      </div>

      {groupedMeals.length === 0 ? (
        <div className="card p-8 text-center space-y-3 bg-bg-card border border-border">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto">
            <Utensils className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">{t('meals.noMealsTitle')}</h3>
            <p className="text-2xs text-text-muted mt-1 max-w-xs mx-auto">
              {t('meals.noMealsHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsScanModalOpen(true)}
            className="btn-primary py-2.5 px-5 rounded-xl text-xs font-bold inline-flex items-center gap-2"
          >
            <Camera className="w-4 h-4" />
            <span>{t('meals.scanFirstMeal')}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedMeals.map(([date, dayMeals]) => {
            const dayMacros = calculateMealMacros(dayMeals.flatMap((m) => m.foods));
            const isToday = date === todayDate;
            const isYesterday = (() => {
              const y = new Date();
              y.setDate(y.getDate() - 1);
              return date === y.toISOString().slice(0, 10);
            })();

            return (
              <div key={date} className="card p-4 bg-bg-card border border-border/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-text-primary">
                        {isToday ? t('common.today') : isYesterday ? t('meals.yesterday') : new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </h3>
                      <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted">
                        {t(dayMeals.length === 1 ? 'meals.mealCountOne' : 'meals.mealCountMany', { count: dayMeals.length })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-text-primary tabular-nums block font-mono">
                      ~{Math.round(dayMacros.calories)} cal
                    </span>
                    <span className="text-3xs text-accent font-semibold block font-mono">
                      {Math.round(dayMacros.proteinG)}g P • {Math.round(dayMacros.carbsG)}g C • {Math.round(dayMacros.fatG)}g F
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {dayMeals.map((meal) => {
                    const mMacros = calculateMealMacros(meal.foods);
                    const isExpanded = expandedMeals.has(meal.id);

                    return (
                      <div key={meal.id} className="p-3 rounded-xl bg-bg-secondary/60 border border-border/60 space-y-2">
                        <div
                          className="flex items-start justify-between cursor-pointer gap-2"
                          onClick={() => toggleExpand(meal.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-xs text-text-primary truncate">
                                {displayMealName(meal.name)}
                              </h4>
                              <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                                ~{Math.round(mMacros.calories)} cal
                              </span>
                              <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                                ~{Math.round(mMacros.proteinG)}g P
                              </span>
                            </div>
                            <p className="text-2xs text-text-muted truncate mt-0.5">
                              {meal.foods.map((f) => f.name).join(", ")}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMealToDelete({ id: meal.id, name: meal.name });
                              }}
                              className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                              title={t('meals.deleteMealShort')}
                              aria-label={t('meals.deleteMealNamed', { name: meal.name })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className="p-1 text-text-muted">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="pt-2 border-t border-border/50 space-y-1.5 animate-fade-in">
                            {meal.foods.map((food, idx) => (
                              <div key={idx} className="flex justify-between items-center text-2xs py-1 px-2 rounded-lg bg-bg-card border border-border/40">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="text-text-primary font-medium truncate">{food.name}</span>
                                  <span className="text-text-muted text-3xs">
                                    ({food.quantity ? `${food.quantity} ${food.unit}` : food.unit})
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <div className="text-3xs font-mono text-text-muted shrink-0">
                                    <span className="text-accent font-semibold">~{Math.round(food.calories)} cal</span>
                                    <span className="mx-1">•</span>
                                    <span className="text-emerald-400 font-semibold">P: ~{Math.round(food.proteinG)}g</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteFoodFromMeal(meal.id, idx);
                                      toast.info(t('meals.deletedFood', { name: food.name }));
                                    }}
                                    className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                                    title={t('meals.deleteFoodItem')}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
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
    </div>
  )}

  {/* ── TAB 3: MACROS & TARGETS ── */}
  {fuelSubTab === 'macros' && (
    <div className="space-y-4 animate-fade-in">
      {/* Target Breakdown Card */}
      <section className="card p-5 bg-bg-card border border-border space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div>
            <h2 className="text-sm font-extrabold text-text-primary">{t('meals.macroGoalsTitle')}</h2>
            <p className="text-2xs text-text-muted">{t('meals.goalsSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={handleOpenGoalsModal}
            className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Target className="w-3.5 h-3.5" />
            <span>{t('meals.editTargets')}</span>
          </button>
        </div>

        {/* Big numbers row */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/50">
            <span className="text-3xs uppercase font-bold text-text-muted block">{t('meals.targetWord')}</span>
            <span className="text-lg font-black text-text-primary tabular-nums block font-mono">
              {macroGoals?.calories || 2400}
            </span>
            <span className="text-3xs text-text-muted">cal</span>
          </div>
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/50">
            <span className="text-3xs uppercase font-bold text-accent block">{t('meals.protein')}</span>
            <span className="text-lg font-black text-accent tabular-nums block font-mono">
              {macroGoals?.proteinG || proteinTargetG}g
            </span>
            <span className="text-3xs text-text-muted">
              {Math.round(((macroGoals?.proteinG || proteinTargetG) * 4 / (macroGoals?.calories || 2400)) * 100)}%
            </span>
          </div>
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/50">
            <span className="text-3xs uppercase font-bold text-text-secondary block">{t('meals.carbs')}</span>
            <span className="text-lg font-black text-text-primary tabular-nums block font-mono">
              {macroGoals?.carbsG || 220}g
            </span>
            <span className="text-3xs text-text-muted">
              {Math.round(((macroGoals?.carbsG || 220) * 4 / (macroGoals?.calories || 2400)) * 100)}%
            </span>
          </div>
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/50">
            <span className="text-3xs uppercase font-bold text-text-muted block">{t('meals.fat')}</span>
            <span className="text-lg font-black text-text-primary tabular-nums block font-mono">
              {macroGoals?.fatG || 70}g
            </span>
            <span className="text-3xs text-text-muted">
              {Math.round(((macroGoals?.fatG || 70) * 9 / (macroGoals?.calories || 2400)) * 100)}%
            </span>
          </div>
        </div>

        {/* Visual Macro Ratio Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-3xs text-text-muted font-mono">
            <span>{t('meals.macroSplit')}</span>
            <span>P {Math.round(((macroGoals?.proteinG || proteinTargetG) * 4 / (macroGoals?.calories || 2400)) * 100)}% • C {Math.round(((macroGoals?.carbsG || 220) * 4 / (macroGoals?.calories || 2400)) * 100)}% • F {Math.round(((macroGoals?.fatG || 70) * 9 / (macroGoals?.calories || 2400)) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-bg-secondary">
            <div
              style={{ width: `${Math.round(((macroGoals?.proteinG || proteinTargetG) * 4 / (macroGoals?.calories || 2400)) * 100)}%` }}
              className="bg-accent h-full"
              title={t('meals.protein')}
            />
            <div
              style={{ width: `${Math.round(((macroGoals?.carbsG || 220) * 4 / (macroGoals?.calories || 2400)) * 100)}%` }}
              className="bg-sky-400 h-full"
              title={t('meals.carbs')}
            />
            <div
              style={{ width: `${Math.round(((macroGoals?.fatG || 70) * 9 / (macroGoals?.calories || 2400)) * 100)}%` }}
              className="bg-amber-400 h-full"
              title={t('meals.fat')}
            />
          </div>
        </div>
      </section>

      {/* Today's Adherence Card */}
      <section className="card p-5 bg-bg-card border border-border space-y-3">
        <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider text-text-muted">
          {t('meals.adherenceTitle')}
        </h3>

        <div className="space-y-3">
          {/* Calorie Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-2xs font-mono">
              <span className="font-semibold text-text-primary">{t('meals.calories')}</span>
              <span className="text-text-muted">
                {Math.round(todayMacros.calories)} / {macroGoals?.calories || 2400} cal ({Math.round((todayMacros.calories / (macroGoals?.calories || 2400)) * 100)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, (todayMacros.calories / (macroGoals?.calories || 2400)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Protein Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-2xs font-mono">
              <span className="font-semibold text-accent">{t('meals.protein')}</span>
              <span className="text-text-muted">
                {Math.round(todayMacros.proteinG)}g / {macroGoals?.proteinG || proteinTargetG}g ({Math.round((todayMacros.proteinG / (macroGoals?.proteinG || proteinTargetG)) * 100)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, (todayMacros.proteinG / (macroGoals?.proteinG || proteinTargetG)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Carbs Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-2xs font-mono">
              <span className="font-semibold text-text-primary">{t('meals.carbohydrates')}</span>
              <span className="text-text-muted">
                {Math.round(todayMacros.carbsG)}g / {macroGoals?.carbsG || 220}g ({Math.round((todayMacros.carbsG / (macroGoals?.carbsG || 220)) * 100)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, (todayMacros.carbsG / (macroGoals?.carbsG || 220)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Fat Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-2xs font-mono">
              <span className="font-semibold text-text-primary">{t('meals.dietaryFat')}</span>
              <span className="text-text-muted">
                {Math.round(todayMacros.fatG)}g / {macroGoals?.fatG || 70}g ({Math.round((todayMacros.fatG / (macroGoals?.fatG || 70)) * 100)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, (todayMacros.fatG / (macroGoals?.fatG || 70)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )}

      {/* ══════════════════ LOG MEAL MODAL ══════════════════ */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="display-title font-display uppercase tracking-tight text-xl text-text-primary">{t('meals.logMealTitle')}</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsBarcodeModalOpen(true)}
                  className="px-2 py-1 rounded bg-bg-elevated border border-border text-xs font-mono text-accent hover:border-accent flex items-center gap-1"
                  title={t('meals.scanBarcodeTitle')}
                >
                  <BarcodeIcon className="w-3.5 h-3.5" />
                  <span>{t('home.scan')}</span>
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-text-secondary hover:text-text-primary p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">

              {/* ── Meal Name + Quick Templates ── */}
              <div>
                <label className="section-title mb-1.5 block">{t('meals.mealName')}</label>

                {/* Quick-log template buttons */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {MEAL_TEMPLATES.map((template) => (
                    <button
                      key={template}
                      type="button"
                      onClick={() => setMealName(template)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border transition-colors ${
                        mealName === template
                          ? 'bg-[#FF6B1F] text-stone-950 font-bold border-[#FF6B1F]'
                          : 'bg-bg-elevated border-border text-text-secondary hover:border-accent/60 hover:text-accent'
                      }`}
                    >
                      {displayMealName(template)}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder={`e.g. ${getDefaultMealName()}, Post-Workout Shake`}
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary text-sm focus:border-accent outline-none"
                />
              </div>

              {/* ── Quick Add Favorites Inside Modal ── */}
              {favoriteFoods.length > 0 && (
                <div>
                  <label className="text-2xs font-mono text-text-muted uppercase block mb-1">
                    {t('meals.quickAddFavorites')}
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
                  <label className="section-title">{t('meals.foods')}</label>
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
                      <Plus className="w-3.5 h-3.5" /> {t('meals.addFood')}
                    </button>
                  </div>
                </div>

                {foods.length === 0 ? (
                  <div className="border border-dashed border-border/80 rounded-xl p-5 text-center bg-bg-elevated/20">
                    <Utensils className="w-6 h-6 text-text-muted mx-auto mb-1.5 opacity-40" />
                    <p className="text-xs text-text-secondary font-medium">{t('meals.noFoodsInMeal')}</p>
                    <p className="text-[11px] text-text-muted font-mono mt-0.5">
                      {t('meals.addFoodHint')}
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
                      const indianMeta = resolveIndianMeta(food.name);
                      // Household units for this dish (katori/piece/plate)
                      // join the generic unit list in the selector.
                      const rowUnitOptions = [
                        ...UNIT_OPTIONS,
                        ...(indianMeta
                          ? indianMeta.meta.units
                              .filter((u) => !UNIT_OPTIONS.some((o) => o.value === u.id))
                              .map((u) => ({ value: u.id, label: u.label }))
                          : []),
                      ];

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
                                  title={favorited ? t('meals.unpinFavorite') : t('meals.pinFavorite')}
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
                              placeholder={t('meals.foodNamePlaceholder')}
                              value={food.name}
                              onChange={(e) => handleFoodChange(i, 'name', e.target.value)}
                              className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary text-sm focus:border-accent outline-none"
                            />

                            {/* Dropdown suggestions list */}
                            {isDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                                {suggestions.map((sugg) => (
                                  <div
                                    key={`${sugg.kind}:${sugg.name}`}
                                    className="w-full flex items-center border-b border-border/40 last:border-b-0"
                                  >
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelectSuggestion(i, sugg);
                                      }}
                                      className="flex-1 text-left px-3 py-2 text-xs text-text-primary hover:bg-bg-elevated hover:text-accent flex items-center justify-between font-medium"
                                    >
                                      <span className="flex items-center gap-2">
                                        {sugg.name}
                                        {sugg.kind === 'custom' && (
                                          <span className="text-3xs font-bold uppercase tracking-wide bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                                            {t('meals.myVersionBadge')}
                                          </span>
                                        )}
                                      </span>
                                      <ChevronRight className="w-3 h-3 text-text-muted" />
                                    </button>
                                    {sugg.kind === 'custom' && (
                                      <button
                                        type="button"
                                        aria-label={t('meals.deleteMyVersion', { name: sugg.name })}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleDeleteCustomSuggestion(i, sugg);
                                        }}
                                        className="px-2 py-2 text-text-muted hover:text-danger cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Quantity & Unit Row */}
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder={t('meals.qtyPlaceholder')}
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
                              {rowUnitOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Recipe assumption — what the DB values already
                              count for this dish (muted, honest). */}
                          {indianMeta && hasName && (
                            <p className="text-3xs text-text-muted leading-relaxed">
                              {indianMeta.meta.assumption}
                            </p>
                          )}

                          {/* Macro breakdown indicators / manual override */}
                          {hasName && (
                            <div className="bg-bg-primary/70 p-2 rounded-lg border border-border/80 space-y-1.5">
                              {/* Quantity guidance banner if quantity is missing */}
                              {!isQtySet ? (
                                <p className="text-[11px] text-text-muted font-mono italic">
                                  {t('meals.qtyHint')}
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  {food.isUnmatched && (
                                    <div className="flex items-center gap-1.5 text-2xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 font-mono">
                                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                                      <span>{t('meals.notInDb')}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-2xs font-mono text-text-muted pb-0.5 border-b border-border/40">
                                    <span className="flex items-center gap-1 text-accent font-semibold">
                                      <Sparkles className="w-3 h-3" />
                                      ~{Math.round(food.calories)} kcal
                                    </span>
                                    <span>
                                      P:~{food.proteinG}g • C:~{food.carbsG}g • F:~{food.fatG}g
                                    </span>
                                  </div>
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
                                    value={food.proteinG ? round1(food.proteinG) : ''}
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
                                    value={food.carbsG ? round1(food.carbsG) : ''}
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
                                    value={food.fatG ? round1(food.fatG) : ''}
                                    placeholder="0"
                                    onChange={(e) => handleFoodChange(i, 'fatG', Number(e.target.value))}
                                    className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                                  />
                                </div>
                              </div>

                              {/* Household recipe learning — save this
                                  exact portion/values as "my version". */}
                              {isQtySet && food.calories > 0 && (
                                <div className="flex justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveMyVersion(i)}
                                    className="text-2xs font-semibold text-accent hover:underline cursor-pointer"
                                  >
                                    {food.customFoodId ? 'Update my version' : 'Save as my version'}
                                  </button>
                                </div>
                              )}

                              {/* Ghee/oil honesty prompt — one tap, adjusts
                                  fat/calories against the DB assumption. */}
                              {food.oilAssumedTsp !== undefined && (
                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/40">
                                  <span className="text-2xs text-text-muted font-mono shrink-0">
                                    {t('meals.gheeOilHeading')}
                                  </span>
                                  <div className="flex gap-1">
                                    {OIL_LEVELS.map((level) => (
                                      <button
                                        key={level.id}
                                        type="button"
                                        onClick={() => handleOilChange(i, level.id)}
                                        className={`px-2 py-1 rounded-md text-2xs font-semibold transition-all cursor-pointer ${
                                          (food.oilLevel || 'none') === level.id
                                            ? 'bg-accent text-white'
                                            : 'bg-bg-elevated text-text-muted border border-border/60 hover:text-text-primary'
                                        }`}
                                      >
                                        {level.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
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
                <span className="text-text-muted">{t('meals.mealTotal')}</span>
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
                  onClick={() => { resetBuilderForm(); setIsModalOpen(false); }}
                  className="btn-ghost flex-1 text-xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveMeal}
                  disabled={foods.length === 0 || !foods.some((f) => f.name.trim())}
                  className="btn-primary flex-1 disabled:opacity-40 text-xs"
                >
                  {t('meals.saveMeal')}
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
                    {t('meals.dailyMacroTargets')}
                  </h3>
                  <p className="text-2xs text-text-muted font-mono">{t('meals.pacingSubtitle')}</p>
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
            <div className="p-3 rounded-lg bg-bg-secondary border border-border/70 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-text-primary flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    {t('meals.macroEngine')}
                  </p>
                  <p className="text-[11px] text-text-muted font-mono">
                    {t('meals.basedOnBw', { kg: profile?.bodyweightKg || 75 })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAutoCalculateGoals}
                  className="px-2.5 py-1 rounded bg-bg-elevated border border-border text-xs font-mono text-accent hover:border-accent/60 transition-colors font-bold cursor-pointer"
                >
                  {t('meals.apply')}
                </button>
              </div>
            </div>

            {/* Input Fields */}
            <div className="space-y-3 font-mono">
              <div>
                <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                  {t('meals.calorieTargetLabel')}
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
                  {t('meals.proteinTargetLabel')}
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
                    {t('meals.carbsOptionalLabel')}
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
                    {t('meals.fatOptionalLabel')}
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

              {/* Real-time Macro Math & Calorie Reconcile */}
              {(() => {
                const calVal = parseFloat(goalCalories) || 0;
                const protVal = parseFloat(goalProtein) || 0;
                const carbVal = parseFloat(goalCarbs) || 0;
                const fatVal = parseFloat(goalFat) || 0;
                const macroSum = Math.round(protVal * 4 + carbVal * 4 + fatVal * 9);
                const delta = calVal > 0 ? macroSum - calVal : 0;
                const showCheck = calVal > 0 && (protVal > 0 || carbVal > 0 || fatVal > 0);

                if (!showCheck) return null;

                return (
                  <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-text-muted">{t('meals.macroSum')} </span>
                      <span className="font-bold text-text-primary">{macroSum} kcal</span>
                      {Math.abs(delta) > 5 ? (
                        <span className={`ml-1.5 text-2xs font-semibold ${delta > 0 ? 'text-amber-400' : 'text-sky-400'}`}>
                          ({delta > 0 ? `+${delta}` : `${delta}`} kcal)
                        </span>
                      ) : (
                        <span className="ml-1.5 text-2xs font-semibold text-emerald-400">{t('meals.balanced')}</span>
                      )}
                    </div>
                    {Math.abs(delta) > 5 && calVal > 0 && (
                      <button
                        type="button"
                        onClick={handleReconcileCarbs}
                        className="px-2 py-0.5 rounded bg-accent/15 text-accent text-3xs font-bold hover:bg-accent/25 transition-colors"
                      >
                        {t('meals.autoBalanceCarbs')}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              {macroGoals && (
                <button
                  type="button"
                  onClick={handleClearGoals}
                  className="btn-danger py-2 px-3 text-xs font-mono"
                  title={t('meals.removeTargets')}
                >
                  {t('meals.clear')}
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveGoals}
                className="btn-primary flex-1 py-2 text-xs font-bold font-mono uppercase"
              >
                {t('meals.saveTargets')}
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
      {isBarcodeModalOpen && (
        <BarcodeScannerModal
          isOpen={isBarcodeModalOpen}
          onClose={() => setIsBarcodeModalOpen(false)}
          onAddFood={handleAddScannedFood}
        />
      )}

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
                <h2 className="text-base font-bold text-text-primary">{t('meals.managePinned')}</h2>
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
              {t('meals.managePinnedHint')}
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
                      title={t('meals.editFoodDetails')}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePinned(fav.id, fav.name)}
                      className="p-1.5 rounded-lg bg-bg-secondary text-text-muted hover:text-danger hover:border-danger/40 border border-border transition-colors"
                      title={t('meals.removeFood')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {favoriteFoods.length === 0 && (
                <div className="p-4 rounded-xl bg-bg-secondary/40 border border-dashed border-border text-center text-xs text-text-muted">
                  {t('meals.noPinnedFoods')}
                </div>
              )}
            </div>

            {/* Clear All Confirmation Block */}
            {confirmClearAll ? (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-danger">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{t('meals.removeAllPinned', { count: favoriteFoods.length })}</span>
                </div>
                <p className="text-2xs text-text-muted">
                  {t('meals.clearPinnedWarn')}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="btn-secondary flex-1 py-1.5 text-xs font-semibold"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllPinned}
                    className="btn-danger flex-1 py-1.5 text-xs font-bold"
                  >
                    {t('meals.yesClearAll')}
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
                  <span>{t('meals.removeAll')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={openAddPinned}
                className="btn-primary ml-auto py-2 px-3 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('meals.addCustomFood')}</span>
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
                  {isNewPinned ? t('meals.addPinnedFood') : t('meals.editPinnedFood', { name: editingPinnedFood?.name ?? '' })}
                </h2>
                <p className="text-2xs text-text-muted mt-0.5">
                  {t('meals.pinnedFormHint')}
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
                  {t('meals.foodNameLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('meals.foodNameExamplePlaceholder')}
                  value={pinnedName}
                  onChange={(e) => setPinnedName(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary text-sm focus:border-accent outline-none font-medium"
                />
              </div>

              {/* Default Quantity & Unit */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    {t('meals.defaultQuantity')}
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
                    {t('meals.unit')}
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
                <span>{t('meals.autoCalc')}</span>
              </button>

              {/* Macros Breakdown */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-2xs font-bold text-text-muted uppercase block mb-1">
                    {t('meals.caloriesKcal')}
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
                    {t('scan.proteinLabel')}
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
                    {t('scan.carbsLabel')}
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
                    {t('scan.fatLabel')}
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
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSavePinnedFood}
                className="btn-primary flex-1 py-2 text-xs font-bold uppercase tracking-wider"
              >
                {isNewPinned ? t('meals.pinFood') : t('scan.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nutrition Tools & Options Drawer / Sheet ── */}
      {isToolsMenuOpen && (
        <div
          className="modal-overlay z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setIsToolsMenuOpen(false)}
        >
          <div
            className="modal-content w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-text-primary text-base">{t('meals.optionsHeading')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  handleOpenGoalsModal();
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">{t('meals.toolsMacroTargets')}</h4>
                    <p className="text-2xs text-text-muted">
                      {macroGoals ? `${macroGoals.calories} kcal • ${macroGoals.proteinG}g P` : t('meals.toolsAutoCalc')}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsHydrationModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                    <Droplet className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">{t('meals.toolsHydration')}</h4>
                    <p className="text-2xs text-text-muted">
                      {t('meals.toolsHydrationHint', { target: formatWaterMl(waterTargetMl) })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsCreatineModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">{t('meals.toolsSupplements')}</h4>
                    <p className="text-2xs text-text-muted">
                      {t('meals.toolsSupplementsHint', { grams: dailyCreatineTarget })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsManagePinnedOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">{t('meals.toolsManagePinned')}</h4>
                    <p className="text-2xs text-text-muted">
                      {t('meals.toolsSavedItems', { count: favoriteFoods.length })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsMealHistoryOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-bg-card text-text-muted flex items-center justify-center shrink-0 border border-border">
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">{t('meals.toolsPastHistory')}</h4>
                    <p className="text-2xs text-text-muted">{t('meals.toolsPastHistoryHint')}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              {yesterdayMeals.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsToolsMenuOpen(false);
                    handleCopyYesterday();
                  }}
                  className="w-full p-3 rounded-xl bg-accent/10 hover:bg-accent/15 border border-accent/25 flex items-center justify-between transition-colors text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0">
                      <Copy className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">{t('meals.toolsCopyYesterday')}</h4>
                      <p className="text-2xs text-text-muted">
                        {t('meals.toolsCopyYesterdayHint', { count: yesterdayMeals.length, kcal: Math.round(yesterdayMacros.calories) })}
                      </p>
                    </div>
                  </div>
                  <span className="text-3xs font-mono font-bold text-accent px-2 py-0.5 rounded bg-accent/15">
                    {t('meals.oneTap')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Meal Deletion Confirmation Dialog ── */}
      {mealToDelete && (
        <div className="modal-overlay z-50" onClick={() => setMealToDelete(null)}>
          <div
            className="modal-content max-w-sm w-full p-5 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-meal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger/15 text-danger flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-meal-title" className="text-sm font-bold text-text-primary">
                  {t('meals.deleteMealTitle')}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('meals.deleteMealMsg', { name: mealToDelete.name })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMealToDelete(null)}
                className="btn-secondary flex-1 py-2.5 text-xs font-bold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteMeal(mealToDelete.id);
                  toast.info(t('meals.deletedFood', { name: mealToDelete.name }));
                  setMealToDelete(null);
                }}
                className="btn-danger flex-1 py-2.5 text-xs font-bold"
              >
                {t('meals.deleteMealButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
