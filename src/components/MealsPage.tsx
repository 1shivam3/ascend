"use client";

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { estimateMacros, calculateMealMacros } from '@/lib/macros';
import { Plus, X, ChevronDown, ChevronUp, Trash2, Utensils } from 'lucide-react';
import { MealEntry, FoodItem } from '@/lib/types';

export default function MealsPage() {
  const meals = useStore((state) => state.meals);
  const addMeal = useStore((state) => state.addMeal);
  const deleteMeal = useStore((state) => state.deleteMeal);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());
  
  // Form State
  const [mealName, setMealName] = useState('');
  const [foods, setFoods] = useState<FoodItem[]>([]);
  
  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedMeals);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedMeals(newExpanded);
  };
  
  const handleAddFood = () => {
    setFoods([...foods, { name: '', quantity: 100, unit: 'g', calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }]);
  };
  
  const handleRemoveFood = (index: number) => {
    setFoods(foods.filter((_, i) => i !== index));
  };
  
  const handleFoodChange = (index: number, field: keyof FoodItem, value: any) => {
    const newFoods = [...foods];
    newFoods[index] = { ...newFoods[index], [field]: value };
    
    // Auto estimate if name, quantity or unit changes
    if (field === 'name' || field === 'quantity' || field === 'unit') {
      if (newFoods[index].name.trim().length > 1) {
        const estimated = estimateMacros(newFoods[index].name, newFoods[index].quantity, newFoods[index].unit);
        newFoods[index] = { ...newFoods[index], ...estimated };
      }
    }
    
    setFoods(newFoods);
  };
  
  const handleSaveMeal = () => {
    const validFoods = foods.filter(f => f.name.trim());
    if (!mealName.trim() || validFoods.length === 0) return;
    
    const today = new Date().toISOString().split('T')[0];
    const newMeal: MealEntry = {
      id: crypto.randomUUID(),
      date: today,
      name: mealName.trim(),
      foods: validFoods
    };
    
    addMeal(newMeal);
    setIsModalOpen(false);
    setMealName('');
    setFoods([]);
  };
  
  const todayDate = new Date().toISOString().split('T')[0];
  const todayMeals = meals.filter(m => m.date === todayDate);
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
  
  return (
    <div className="page animate-fade-in">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Meals & Macros</h1>
          <p className="text-xs text-text-muted mt-0.5">Track nutrition & fuel your strength</p>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={() => {
          if (foods.length === 0) handleAddFood();
          setIsModalOpen(true);
        }}>
          <Plus className="w-4 h-4" />
          Log Meal
        </button>
      </header>

      {/* Today's Summary */}
      <section className="mb-6">
        <h2 className="section-title mb-2.5">TODAY&apos;S TOTALS</h2>
        <div className="card grid grid-cols-4 gap-2 text-center py-4 bg-bg-card border border-border">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-accent font-mono">{Math.round(todayMacros.calories)}</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">CALORIES</span>
          </div>
          <div className="flex flex-col border-l border-border">
            <span className="text-lg font-bold text-text-primary font-mono">{Math.round(todayMacros.proteinG)}g</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">PROTEIN</span>
          </div>
          <div className="flex flex-col border-l border-border">
            <span className="text-lg font-bold text-text-primary font-mono">{Math.round(todayMacros.carbsG)}g</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">CARBS</span>
          </div>
          <div className="flex flex-col border-l border-border">
            <span className="text-lg font-bold text-text-primary font-mono">{Math.round(todayMacros.fatG)}g</span>
            <span className="text-2xs uppercase text-text-muted font-semibold tracking-wider mt-0.5">FAT</span>
          </div>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="section-title">MEAL HISTORY</h2>
          <span className="text-xs text-text-muted">{meals.length} logged</span>
        </div>

        {groupedMeals.length === 0 ? (
          <div className="card text-center py-12">
            <Utensils className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-text-secondary text-sm">No meals logged yet.</p>
            <p className="text-xs text-text-muted mt-1">Tap &quot;Log Meal&quot; to write what you eat and see instant macros.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groupedMeals.map(([date, dayMeals]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider font-mono">
                  {date === todayDate ? 'Today' : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
                              <span className="font-bold text-accent text-sm font-mono">{Math.round(macros.calories)} kcal</span>
                            </div>
                            <div className="flex gap-3 text-xs text-text-secondary font-mono">
                              <span className="text-info">{Math.round(macros.proteinG)}g P</span>
                              <span>•</span>
                              <span className="text-warning">{Math.round(macros.carbsG)}g C</span>
                              <span>•</span>
                              <span className="text-danger">{Math.round(macros.fatG)}g F</span>
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
                                  <span className="text-accent">{Math.round(food.calories)} kcal</span>
                                  <span className="text-text-muted ml-2">P:{Math.round(food.proteinG)}g</span>
                                </div>
                              </div>
                            ))}
                            <div className="mt-1 flex justify-end">
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteMeal(meal.id); }}
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

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-bold text-text-primary">Log Meal</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-text-secondary hover:text-text-primary p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <div>
                <label className="section-title mb-1.5 block">Meal Name</label>
                <input
                  type="text"
                  placeholder="e.g. Breakfast, Lunch, Post-Workout Shake"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary text-sm focus:border-accent outline-none"
                />
              </div>
              
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
                
                <div className="flex flex-col gap-3">
                  {foods.map((food, i) => (
                    <div key={i} className="border border-border rounded-xl p-3 bg-bg-elevated/40 relative">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xs font-mono text-accent font-semibold">FOOD {i + 1}</span>
                        <button 
                          onClick={() => handleRemoveFood(i)}
                          className="text-text-muted hover:text-danger p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      <input
                        type="text"
                        placeholder="Food name (e.g. Chicken breast, Eggs, Rice, Banana)"
                        value={food.name}
                        onChange={(e) => handleFoodChange(i, 'name', e.target.value)}
                        className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary text-sm mb-2 focus:border-accent outline-none"
                      />
                      
                      <div className="flex gap-2 mb-2.5">
                        <input
                          type="number"
                          placeholder="Quantity"
                          value={food.quantity || ''}
                          onChange={(e) => handleFoodChange(i, 'quantity', Number(e.target.value))}
                          className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                        />
                        <select
                          value={food.unit}
                          onChange={(e) => handleFoodChange(i, 'unit', e.target.value)}
                          className="bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                        >
                          <option value="g">grams (g)</option>
                          <option value="ml">ml</option>
                          <option value="piece">piece</option>
                          <option value="scoop">scoop</option>
                          <option value="slice">slice</option>
                          <option value="tbsp">tbsp</option>
                          <option value="oz">oz</option>
                        </select>
                      </div>
                      
                      {/* Macro Breakdown Inputs (Editable) */}
                      <div className="grid grid-cols-4 gap-1.5 bg-bg-primary/70 p-2 rounded-lg border border-border">
                        <div>
                          <span className="text-2xs text-text-muted block mb-0.5 font-mono">CAL</span>
                          <input
                            type="number"
                            value={food.calories || 0}
                            onChange={(e) => handleFoodChange(i, 'calories', Number(e.target.value))}
                            className="w-full bg-transparent text-accent text-xs font-mono font-semibold p-0 border-none outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-2xs text-text-muted block mb-0.5 font-mono">PRO</span>
                          <input
                            type="number"
                            step="0.1"
                            value={food.proteinG || 0}
                            onChange={(e) => handleFoodChange(i, 'proteinG', Number(e.target.value))}
                            className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-2xs text-text-muted block mb-0.5 font-mono">CARB</span>
                          <input
                            type="number"
                            step="0.1"
                            value={food.carbsG || 0}
                            onChange={(e) => handleFoodChange(i, 'carbsG', Number(e.target.value))}
                            className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-2xs text-text-muted block mb-0.5 font-mono">FAT</span>
                          <input
                            type="number"
                            step="0.1"
                            value={food.fatG || 0}
                            onChange={(e) => handleFoodChange(i, 'fatG', Number(e.target.value))}
                            className="w-full bg-transparent text-text-primary text-xs font-mono font-semibold p-0 border-none outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-border bg-bg-card">
              <div className="flex justify-between text-xs mb-3 font-mono">
                <span className="text-text-muted">MEAL TOTAL</span>
                <span className="font-bold text-accent">{Math.round(currentMealMacros.calories)} kcal</span>
              </div>
              <div className="flex justify-between text-xs text-text-secondary mb-4 font-mono">
                <span>{Math.round(currentMealMacros.proteinG)}g P</span>
                <span>•</span>
                <span>{Math.round(currentMealMacros.carbsG)}g C</span>
                <span>•</span>
                <span>{Math.round(currentMealMacros.fatG)}g F</span>
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
    </div>
  );
}
