'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { AIWeeklyReview } from '@/lib/types';
import { fetchWeeklyReview } from '@/lib/ai-coach';
import {
  Calendar,
  X,
  Sparkles,
  TrendingUp,
  Droplet,
  Dumbbell,
  Target,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';

interface WeeklyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WeeklyReviewModal({ isOpen, onClose }: WeeklyReviewModalProps) {
  const store = useStore();
  const [review, setReview] = useState<AIWeeklyReview | null>(store.latestWeeklyReview || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!review) {
        handleGenerate(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleGenerate = async (forceRefresh = true) => {
    setLoading(true);
    try {
      const res = await fetchWeeklyReview(store, { forceRefresh });
      setReview(res);
    } catch (err) {
      console.error('Failed to get weekly review:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-scale-up space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-text-primary">
                Weekly AI Review
              </h3>
              <p className="text-2xs text-text-muted">
                Synthesizing training, strength &amp; habit data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleGenerate(true)}
              disabled={loading}
              title="Regenerate Weekly Review"
              className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-bg-secondary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-accent' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center space-y-2">
            <Sparkles className="w-6 h-6 animate-spin text-accent mx-auto" />
            <p className="text-xs text-text-muted font-medium">
              Analyzing weekly progressive overload and recovery...
            </p>
          </div>
        ) : review ? (
          <div className="space-y-3.5 text-xs">
            {/* Training Completion Badge */}
            <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border-light dark:border-border-dark flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-accent" />
                <span className="font-bold text-text-primary">Training Consistency</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-bold font-mono">
                {review.workoutsCompleted} / {review.plannedDaysPerWeek} sessions
              </span>
            </div>

            {/* Week Summary */}
            <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20 space-y-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-accent block">
                Executive Overview
              </span>
              <p className="text-text-primary leading-relaxed font-medium">
                {review.weekSummary}
              </p>
            </div>

            {/* Strength Progression */}
            <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border-light dark:border-border-dark space-y-1">
              <div className="flex items-center gap-1.5 text-2xs font-bold text-text-muted uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                <span>Strength Progression</span>
              </div>
              <p className="text-text-secondary leading-relaxed">
                {review.strengthHighlight}
              </p>
            </div>

            {/* Habit Connection (Water & Creatine) */}
            <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border-light dark:border-border-dark space-y-1">
              <div className="flex items-center gap-1.5 text-2xs font-bold text-text-muted uppercase tracking-wider">
                <Droplet className="w-3.5 h-3.5 text-sky-500" />
                <span>Habit &amp; Recovery Connection</span>
              </div>
              <p className="text-text-secondary leading-relaxed">
                {review.habitInsight}
              </p>
            </div>

            {/* Next Week Target */}
            <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border-light dark:border-border-dark space-y-1">
              <div className="flex items-center gap-1.5 text-2xs font-bold text-text-muted uppercase tracking-wider">
                <Target className="w-3.5 h-3.5 text-accent" />
                <span>Next Week Focus</span>
              </div>
              <p className="text-text-primary font-semibold leading-relaxed">
                {review.focusNextWeek}
              </p>
            </div>
          </div>
        ) : null}

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm"
        >
          Got It
        </button>
      </div>
    </div>
  );
}
