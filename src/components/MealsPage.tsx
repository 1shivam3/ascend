"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { estimateMacros, calculateMealMacros, getFoodSuggestions } from '@/lib/macros';
import {
  Plus, X, ChevronDown, ChevronUp, Trash2, Utensils, ArrowLeft,
  Target, Sparkles, Edit3, Search, ChevronRight,
} from 'lucide-react';
import { MealEntry, FoodItem, MacroGoals } from '@/lib/types';
import ThemeToggle from '@/components/ui/ThemeToggle';
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
  const profile      = useStore((state) => state.profile);
  const meals        = useStore((state) => state.meals);
  const macroGoals   = useStore((state) => state.macroGoals);
  const addMeal      = useStore((state) => state.addMeal);
  const deleteMeal   = useStore((state) => state.deleteMeal);
  const setMacroGoals = useStore((state) => state.setMacroGoals);
  const toast        = useToast();

  // ── Modal visibility ──────────────────────────────────────────────────────
  const [isModalOpen,      setIsModalOpen]      = useState(false);
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [expandedMeals,    setExpandedMeals]    = useState<Set<string>>(new Set());

  // ── Goals form ────────────────────────────────────────────────────────────
  const [goalCalories, setGoalCalories] = useState('');
  const [goalProtein,  setGoalProtein]  = useState('');
  const [goalCarbs,    setGoalCarbs]    = useState('');
  const [goalFat,      setGoalFat]      = useState('');

  // ── Meal log form ─────────────────────────────────────────────────────────
  const [mealName, setMealName] = useState('');
  const [foods,    setFoods]    = useState<FoodItem[]>([]);

  // ── Autocomplete state ────────────────────────────────────────────────────
  // One suggestions list per food row, keyed by index
  const [foodSuggestions,      setFoodSuggestions]      = useState<Record<number, string[]>>({});
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<Record<number, number>>({});
  const [showSuggestions,       setShowSuggestions]       = useState<Record<number, boolean>>({});

  // Ref map for suggestion containers (click-outside detection)
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
    setExpandedMeals(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddFood = () => {
    setFoods(prev => [...prev, EMPTY_FOOD()]);
  };

  const handleRemoveFood = (index: number) => {
    setFoods(prev => prev.filter((_, i) => i !== index));
    setFoodSuggestions(prev  => { const n = { ...prev };  delete n[index]; return n; });
    setShowSuggestions(prev  => { const n = { ...prev };  delete n[index]; return n; });
    setActiveSuggestionIndex(prev => { const n = { ...prev }; delete n[index]; return n; });
  };

  /**
   * Central handler for all food field changes.
   * - When `name` changes: fetch suggestions; auto-estimate macros only if quantity is set.
   * - When `quantity` or `unit` changes: re-estimate immediately.
   * - For macro fields: just update the value (manual override).
   */
  const handleFoodChange = useCallback((index: number, field: keyof FoodItem, value: any) => {
    setFoods(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      if (field === 'name') {
        const name = (value as string).trim();
        // Show autocomplete
        if (name.length >= 1) {
          const suggestions = getFoodSuggestions(name);
          setFoodSuggestions(s => ({ ...s, [index]: suggestions }));
          setShowSuggestions(s => ({ ...s, [index]: suggestions.length > 0 }));
        } else {
          setFoodSuggestions(s => ({ ...s, [index]: [] }));
          setShowSuggestions(s => ({ ...s, [index]: false }));
        }

        // Auto-estimate only if quantity already has a value
        if (name.length > 1 && next[index].quantity !== undefined && (next[index].quantity as number) > 0) {
          const est = estimateMacros(name, next[index].quantity, next[index].unit);
          next[index] = { ...next[index], calories: est.calories, proteinG: est.proteinG, carbsG: est.carbsG, fatG: est.fatG };
        }
      } else if (field === 'quantity') {
        const qty = value === '' || value === null ? undefined : Number(value);
        next[index] = { ...next[index], quantity: qty };
        const name = next[index].name.trim();
        if (name.length > 1 && qty !== undefined && qty > 0) {
          const est = estimateMacros(name, qty, next[index].unit);
          next[index] = { ...next[index], calories: est.calories, proteinG: est.proteinG, carbsG: est.carbsG, fatG: est.fatG };
        }
      } else if (field === 'unit') {
        const name = next[index].name.trim();
        const qty  = next[index].quantity;
        if (name.length > 1 && qty !== undefined && qty > 0) {
          const est = estimateMacros(name, qty, value as string);
          next[index] = { ...next[index], calories: est.calories, proteinG: est.proteinG, carbsG: est.carbsG, fatG: est.fatG };
        }
      }

      return next;
    });
  }, []);

  /**
   * Select a suggestion from the autocomplete dropdown.
   */
  const handleSelectSuggestion = useCallback((foodIndex: number, suggestion: string) => {
    setFoods(prev => {
      const next = [...prev];
      next[foodIndex] = { ...next[foodIndex], name: suggestion };
      // Re-estimate if quantity set
      const qty = next[foodIndex].quantity;
      if (qty !== undefined && qty > 0) {
        const est = estimateMacros(suggestion, qty, next[foodIndex].unit);
        next[foodIndex] = { ...next[foodIndex], calories: est.calories, proteinG: est.proteinG, carbsG: est.carbsG, fatG: est.fatG };
      }
      return next;
    });
    setShowSuggestions(s => ({ ...s, [foodIndex]: false }));
    setFoodSuggestions(s => ({ ...s, [foodIndex]: [] }));
  }, []);

  // ── Save meal ─────────────────────────────────────────────────────────────

  const handleSaveMeal = () => {
    const validFoods = foods.filter(f => f.name.trim());
    if (!mealName.trim()) {
      toast.error('Please enter a meal name (e.g. Breakfast, Post-Workout).', 'Missing Name');
      return;
    }
    if (validFoods.length === 0) {
      toast.error('Please add at least one food item.', 'No Food Items');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newMeal: MealEntry = {
      id:    crypto.randomUUID(),
      date:  today,
      name:  mealName.trim(),
      foods: validFoods,
    };

    const mealMacros = calculateMealMacros(validFoods);

    addMeal(newMeal);
    toast.success(
      `Added ${mealName.trim()} (~${Math.round(mealMacros.calories)} kcal, ~${Math.round(mealMacros.proteinG)}g protein)!`,
      'Meal Logged',
    );
    setIsModalOpen(false);
    setMealName('');
    setFoods([]);
    setFoodSuggestions({});
    setShowSuggestions({});
  };

  // ── Goals modal ───────────────────────────────────────────────────────────

  const handleOpenGoalsModal = () => {
    if (macroGoals) {
      setGoalCalories(macroGoals.calories  ? String(macroGoals.calories)  : '');
      setGoalProtein(macroGoals.proteinG   ? String(macroGoals.proteinG)  : '');
      setGoalCarbs(macroGoals.carbsG       ? String(macroGoals.carbsG)    : '');
      setGoalFat(macroGoals.fatG           ? String(macroGoals.fatG)      : '');
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
  const todayMeals  = meals.filter(m => m.date === todayDate);
  const todayMacros = calculateMealMacros(todayMeals.flatMap(m => m.foods));

  const groupedMeals = useMemo(() => {
    const groups: Record<string, MealEntry[]> = {};
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 14);

    meals.forEach(meal => {
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
    <div className="page animate-fade-in">
      {/* ── Header ── */}
      <header className="flex justify-between items-center mb-6">
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
            <span className="hidden sm:inline">Log Meal</span>
            <span className="sm:hidden">Log</span>
          </button>
        </div>
      </header>

      {/* ── Today's Summary & Goals ── */}
      <section className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title mb-0">TODAY&apos;S TOTALS &amp; GOALS</h2>
          <button
            type="button"
            onClick={handleOpenGoalsModal}
            className="text-2xs font-mono text-accent hover:underline flex items-center gap-1 font-semibold"
          >
            <Target className="w-3.5 h-3.5" />
            <span>{macroGoals ? 'Edit Targets' : 'Set Targets'}</span>
          </button>
        </div>

        {/* 4-Stat Grid */}
        <div className="card grid grid-cols-4 gap-2 text-center py-4 bg-bg-card border border-border">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-accent font-mono">{Math.round(todayMacros.calories)}</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">CALORIES</span>
            {macroGoals && (
              <span className="text-[10px] font-mono text-text-muted mt-0.5">/ {macroGoals.calories}</span>
            )}
          </div>
          <div className="flex flex-col border-l border-border">
            <span className="text-lg font-bold text-text-primary font-mono">{Math.round(todayMacros.proteinG)}g</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">PROTEIN</span>
            {macroGoals && (
              <span className="text-[10px] font-mono text-text-muted mt-0.5">/ {macroGoals.proteinG}g</span>
            )}
          </div>
          <div className="flex flex-col border-l border-border">
            <span className="text-lg font-bold text-text-primary font-mono">{Math.round(todayMacros.carbsG)}g</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">CARBS</span>
            {macroGoals && macroGoals.carbsG ? (
              <span className="text-[10px] font-mono text-text-muted mt-0.5">/ {macroGoals.carbsG}g</span>
            ) : null}
          </div>
          <div className="flex flex-col border-l border-border">
            <span className="text-lg font-bold text-text-primary font-mono">{Math.round(todayMacros.fatG)}g</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">FAT</span>
            {macroGoals && macroGoals.fatG ? (
              <span className="text-[10px] font-mono text-text-muted mt-0.5">/ {macroGoals.fatG}g</span>
            ) : null}
          </div>
        </div>

        {/* Progress bars or set-targets prompt */}
        {macroGoals ? (
          <div className="card p-3.5 space-y-2.5 bg-bg-secondary/60 border border-border/80 text-xs font-mono">
            {/* Calories bar */}
            <div>
              <div className="flex justify-between items-center text-2xs mb-1">
                <span className="text-text-secondary flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                  Calories Progress
                </span>
                <span className="font-bold text-text-primary">
                  {Math.round(todayMacros.calories)} / {macroGoals.calories} kcal
                  ({Math.min(100, Math.round((todayMacros.calories / macroGoals.calories) * 100))}%)
                </span>
              </div>
              <div className="level-bar">
                <div
                  className="level-bar-fill bg-accent"
                  style={{ width: `${Math.min(100, Math.round((todayMacros.calories / macroGoals.calories) * 100))}%` }}
                />
              </div>
            </div>

            {/* Protein bar */}
            <div>
              <div className="flex justify-between items-center text-2xs mb-1">
                <span className="text-text-secondary flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  Protein Target
                </span>
                <span className="font-bold text-text-primary">
                  {Math.round(todayMacros.proteinG)} / {macroGoals.proteinG} g
                  ({Math.min(100, Math.round((todayMacros.proteinG / macroGoals.proteinG) * 100))}%)
                </span>
              </div>
              <div className="level-bar">
                <div
                  className="level-bar-fill bg-emerald-400"
                  style={{ width: `${Math.min(100, Math.round((todayMacros.proteinG / macroGoals.proteinG) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={handleOpenGoalsModal}
            className="p-3 rounded-xl bg-bg-secondary border border-dashed border-border/80 flex items-center justify-between cursor-pointer hover:border-accent/40 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent flex-shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">Set Daily Macro Targets</p>
                <p className="text-[11px] text-text-muted font-mono">Calibrate daily calories &amp; protein for cutting or bulking</p>
              </div>
            </div>
            <button type="button" className="text-xs font-mono font-semibold text-accent underline ml-2 flex-shrink-0">
              Configure
            </button>
          </div>
        )}
      </section>

      {/* ── Meal History ── */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="section-title">MEAL HISTORY</h2>
          <span className="text-xs text-text-muted">{meals.length} logged</span>
        </div>

        {groupedMeals.length === 0 ? (
          <div className="card text-center py-12 space-y-2">
            <Utensils className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-text-secondary text-sm font-semibold">No meals logged yet.</p>
            <p className="text-xs text-text-muted">Tap &quot;Log Meal&quot; to start tracking your nutrition.</p>
            <div className="mt-4 text-left max-w-xs mx-auto bg-bg-secondary/60 rounded-lg p-3 border border-border/60">
              <p className="text-2xs font-mono text-accent font-semibold mb-1.5 uppercase tracking-wider">Tips</p>
              <ul className="space-y-1 text-[11px] text-text-muted font-mono">
                <li>• Type a food name to get smart suggestions</li>
                <li>• Enter a quantity — macros estimate automatically</li>
                <li>• Override macros manually if needed</li>
                <li>• Use quick templates: Breakfast, Lunch, etc.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groupedMeals.map(([date, dayMeals]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider font-mono">
                  {date === todayDate
                    ? 'Today'
                    : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </h3>
                <div className="flex flex-col gap-2.5">
                  {dayMeals.map(meal => {
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
                                <div className="text-text-primary">
                                  <span className="font-medium">{food.name}</span>{' '}
                                  <span className="text-text-muted">({food.quantity} {food.unit})</span>
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
            ))}
          </div>
        )}
      </section>

      {/* ══════════════════ LOG MEAL MODAL ══════════════════ */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-bold text-text-primary">Log Meal</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-text-secondary hover:text-text-primary p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">

              {/* ── Meal Name + Quick Templates ── */}
              <div>
                <label className="section-title mb-1.5 block">Meal Name</label>

                {/* Quick-log template buttons */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {MEAL_TEMPLATES.map(template => (
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

              {/* ── Foods section ── */}
              <div>
                <div className="flex justify-between items-center mb-2.5">
                  <label className="section-title">Foods</label>
                  <button
                    onClick={handleAddFood}
                    className="text-accent text-xs font-semibold flex items-center gap-1 hover:brightness-110"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Food
                  </button>
                </div>

                {/* Empty state inside the foods area */}
                {foods.length === 0 && (
                  <div className="text-center py-6 rounded-xl border border-dashed border-border/70 bg-bg-secondary/40">
                    <Utensils className="w-6 h-6 text-text-muted mx-auto mb-1.5 opacity-50" />
                    <p className="text-xs text-text-muted font-mono">Tap &quot;Add Food&quot; to log your first item.</p>
                    <p className="text-[11px] text-text-muted mt-0.5 font-mono opacity-70">Enter a quantity to see estimated macros.</p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {foods.map((food, i) => {
                    const hasName     = food.name.trim().length >= 2;
                    const hasQuantity = food.quantity !== undefined && (food.quantity as number) > 0;
                    const showMacros  = hasName && hasQuantity;

                    return (
                      <div
                        key={i}
                        className="border border-border rounded-xl p-3 bg-bg-elevated/40 relative"
                      >
                        {/* Food row header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xs font-mono text-accent font-semibold">FOOD {i + 1}</span>
                          <button
                            onClick={() => handleRemoveFood(i)}
                            className="text-text-muted hover:text-danger p-0.5 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Food name input + autocomplete */}
                        <div
                          className="relative mb-2"
                          ref={el => { suggestionRefs.current[i] = el; }}
                        >
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                            <input
                              type="text"
                              placeholder="Food name (e.g. Chicken breast, Eggs, Rice)"
                              value={food.name}
                              onChange={(e) => handleFoodChange(i, 'name', e.target.value)}
                              onFocus={() => {
                                if (food.name.length >= 1) {
                                  const suggestions = getFoodSuggestions(food.name);
                                  if (suggestions.length > 0) {
                                    setFoodSuggestions(s => ({ ...s, [i]: suggestions }));
                                    setShowSuggestions(s => ({ ...s, [i]: true }));
                                  }
                                }
                              }}
                              className="w-full bg-bg-elevated border border-border rounded-lg pl-8 pr-2.5 py-2 text-text-primary text-sm focus:border-accent outline-none"
                            />
                          </div>

                          {/* Autocomplete dropdown */}
                          {showSuggestions[i] && foodSuggestions[i] && foodSuggestions[i].length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                              {foodSuggestions[i].map((suggestion, si) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // prevent blur before click
                                    handleSelectSuggestion(i, suggestion);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                                    activeSuggestionIndex[i] === si
                                      ? 'bg-accent/15 text-accent'
                                      : 'text-text-primary hover:bg-bg-elevated'
                                  }`}
                                >
                                  <span>{suggestion}</span>
                                  <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Quantity + Unit row */}
                        <div className="flex gap-2 mb-2.5">
                          <input
                            type="number"
                            placeholder="Qty"
                            min={0}
                            value={food.quantity ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              handleFoodChange(i, 'quantity', raw === '' ? undefined : raw);
                            }}
                            className="flex-1 min-w-0 bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                          />
                          <select
                            value={food.unit}
                            onChange={(e) => handleFoodChange(i, 'unit', e.target.value)}
                            className="bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                          >
                            {UNIT_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* ── Macro display area ── */}
                        {!hasName ? null : !hasQuantity ? (
                          /* Prompt: quantity missing */
                          <p className="text-[11px] text-text-muted font-mono italic mb-2">
                            Enter quantity to see macros
                          </p>
                        ) : null}

                        {/* Editable macro input fields (always shown once food name ≥2 chars) */}
                        {hasName && (
                          <div className="grid grid-cols-4 gap-1.5 bg-bg-primary/70 p-2 rounded-lg border border-border">
                            <div>
                              <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                {showMacros ? '~CAL' : 'CAL'}
                              </span>
                              <input
                                type="number"
                                value={showMacros ? food.calories : (food.calories || 0)}
                                onChange={(e) => handleFoodChange(i, 'calories', Number(e.target.value))}
                                className="w-full bg-transparent text-accent text-xs font-mono font-semibold p-0 border-none outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                {showMacros ? '~PRO' : 'PRO'}
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                value={showMacros ? food.proteinG : (food.proteinG || 0)}
                                onChange={(e) => handleFoodChange(i, 'proteinG', Number(e.target.value))}
                                className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                {showMacros ? '~CARB' : 'CARB'}
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                value={showMacros ? food.carbsG : (food.carbsG || 0)}
                                onChange={(e) => handleFoodChange(i, 'carbsG', Number(e.target.value))}
                                className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-2xs text-text-muted block mb-0.5 font-mono">
                                {showMacros ? '~FAT' : 'FAT'}
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                value={showMacros ? food.fatG : (food.fatG || 0)}
                                onChange={(e) => handleFoodChange(i, 'fatG', Number(e.target.value))}
                                className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {/* Inline macro summary badge (when estimated) */}
                        {showMacros && (
                          <p className="text-[11px] text-text-muted font-mono mt-1.5">
                            <span className="text-accent font-semibold">~{Math.round(food.calories)} kcal</span>
                            {' · '}
                            <span className="text-info">~{food.proteinG}g P</span>
                            {' · '}
                            <span className="text-warning">~{food.carbsG}g C</span>
                            {' · '}
                            <span className="text-danger">~{food.fatG}g F</span>
                            <span className="text-text-muted/60 ml-1">(est.)</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer: meal totals + save/cancel */}
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
                  onClick={() => setIsModalOpen(false)}
                  className="btn-ghost flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMeal}
                  disabled={!mealName.trim() || foods.length === 0 || !foods.some(f => f.name.trim())}
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
                  <h3 className="font-bold text-base text-text-primary leading-tight">Daily Macro Targets</h3>
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
    </div>
  );
}
