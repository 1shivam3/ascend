'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  Dumbbell,
  UtensilsCrossed,
  Droplet,
  Scale,
  Sparkles,
  Trophy,
  Check,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import MeetAttemptPlannerModal from '@/components/MeetAttemptPlannerModal';
import { MealEntry } from '@/lib/types';

interface QuickActionSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export default function QuickActionSheetModal({
  isOpen,
  onClose,
  onNavigate,
}: QuickActionSheetModalProps) {
  const { logWater, addMeal } = useStore();
  const toast = useToast();

  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isMeetModalOpen, setIsMeetModalOpen] = useState(false);
  const [quickFoodQuery, setQuickFoodQuery] = useState('');
  const [isParsingFood, setIsParsingFood] = useState(false);

  if (!isOpen) return null;

  const handleWaterPreset = (ml: number) => {
    logWater(ml);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    toast.success(`Logged +${ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`} hydration!`, 'Water Logged');
    onClose();
  };

  const handleQuickFoodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickFoodQuery.trim();
    if (!q || isParsingFood) return;

    setIsParsingFood(true);
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
        setQuickFoodQuery('');
        toast.success(
          `Logged ${data.foods.length} items (~${data.totalCalories || 0} kcal, ${data.totalProteinG || 0}g P)!`,
          'Meal Logged'
        );
        onClose();
      } else {
        toast.error('Could not parse foods from text.', 'Parse Failed');
      }
    } catch {
      toast.error('Could not log meal. Please check connection.', 'Error');
    } finally {
      setIsParsingFood(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                <Plus className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-text-primary text-sm tracking-tight font-sans">
                Quick Actions
              </h3>
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* 1. Quick Natural Language Food Logger */}
            <div className="p-3.5 rounded-2xl bg-bg-secondary border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-accent flex items-center gap-1 font-sans">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Natural food log</span>
                </span>
                <span className="text-[11px] text-text-secondary font-medium font-sans">AI &amp; IFCT</span>
              </div>
              <form onSubmit={handleQuickFoodSubmit} className="relative">
                <input
                  type="text"
                  placeholder='e.g. "2 roti, 1 bowl dal, 100g paneer"'
                  value={quickFoodQuery}
                  onChange={(e) => setQuickFoodQuery(e.target.value)}
                  disabled={isParsingFood}
                  className="w-full bg-bg-card border border-border rounded-xl py-2 pl-2.5 pr-20 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!quickFoodQuery.trim() || isParsingFood}
                  className="absolute right-1 top-1 bottom-1 px-2.5 rounded-lg bg-accent text-white font-bold text-xs flex items-center gap-1 disabled:opacity-40 hover:brightness-105 active:scale-95 transition-all shadow-xs"
                >
                  {isParsingFood ? (
                    <span className="animate-pulse">Parsing...</span>
                  ) : (
                    <>
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>Log</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* 2. Quick Water Presets (250, 500, 750, 1000ml) */}
            <div className="p-3.5 rounded-2xl bg-bg-secondary border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-500 flex items-center gap-1 font-sans">
                  <Droplet className="w-3.5 h-3.5 fill-sky-500/20" />
                  <span>Add hydration</span>
                </span>
                <span className="text-[11px] text-text-secondary font-medium font-sans">1-Tap Bottle Presets</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { ml: 250, label: '+250ml' },
                  { ml: 500, label: '+500ml' },
                  { ml: 750, label: '+750ml' },
                  { ml: 1000, label: '+1L' },
                ].map((item) => (
                  <button
                    key={item.ml}
                    type="button"
                    onClick={() => handleWaterPreset(item.ml)}
                    className="py-2 rounded-xl bg-bg-card hover:bg-sky-500/10 border border-border hover:border-sky-500/40 text-text-primary hover:text-sky-500 font-bold text-xs tabular-nums transition-all active:scale-90 text-center"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Primary Destination Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onNavigate('workout');
                  onClose();
                }}
                className="p-3 rounded-xl bg-bg-card hover:bg-bg-secondary border border-border hover:border-accent/50 text-left transition-all active:scale-95 group shadow-xs"
              >
                <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                  <Dumbbell className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-text-primary block">Start Workout</span>
                <span className="text-[11px] text-text-secondary leading-tight mt-0.5 block">Launch gym session</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigate('meals');
                  onClose();
                }}
                className="p-3 rounded-xl bg-bg-card hover:bg-bg-secondary border border-border hover:border-emerald-500/50 text-left transition-all active:scale-95 group shadow-xs"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                  <UtensilsCrossed className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-text-primary block">Log Nutrition</span>
                <span className="text-[11px] text-text-secondary leading-tight mt-0.5 block">Full meal &amp; macros</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsWeightModalOpen(true);
                }}
                className="p-3 rounded-xl bg-bg-card hover:bg-bg-secondary border border-border hover:border-purple-400/50 text-left transition-all active:scale-95 group shadow-xs"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                  <Scale className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-text-primary block">Log Weight</span>
                <span className="text-[11px] text-text-secondary leading-tight mt-0.5 block">Track body mass</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMeetModalOpen(true);
                }}
                className="p-3 rounded-xl bg-bg-card hover:bg-bg-secondary border border-border hover:border-amber-400/50 text-left transition-all active:scale-95 group shadow-xs"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                  <Trophy className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-text-primary block">Meet Planner</span>
                <span className="text-[11px] text-text-secondary leading-tight mt-0.5 block">90% • 95% • 100%</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <BodyMetricsModal isOpen={isWeightModalOpen} onClose={() => setIsWeightModalOpen(false)} />
      <MeetAttemptPlannerModal isOpen={isMeetModalOpen} onClose={() => setIsMeetModalOpen(false)} />
    </>
  );
}
