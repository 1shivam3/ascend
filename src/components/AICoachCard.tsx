'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { AICoachInsight } from '@/lib/types';
import { fetchOrGenerateAICoachInsight } from '@/lib/ai-coach';
import { toLocalDateString } from '@/lib/habits';
import {
  Sparkles,
  Bot,
  RefreshCw,
  TrendingUp,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Flag,
} from 'lucide-react';
import ReportAIModal from '@/components/ReportAIModal';

interface AICoachCardProps {
  onOpenSettings?: () => void;
  onNavigateWorkout?: () => void;
}

export default function AICoachCard({ onOpenSettings, onNavigateWorkout }: AICoachCardProps) {
  const store = useStore();
  const workouts = store.workouts || [];
  const todayStr = toLocalDateString(new Date());

  const cachedInsight = store.aiInsightsCache ? store.aiInsightsCache[todayStr] : undefined;

  const [insight, setInsight] = useState<AICoachInsight | undefined>(cachedInsight);
  const [loading, setLoading] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);

  // Sync with store cache
  useEffect(() => {
    if (store.aiInsightsCache && store.aiInsightsCache[todayStr]) {
      setInsight(store.aiInsightsCache[todayStr]);
    }
  }, [store.aiInsightsCache, todayStr]);

  // Initial load only if user has logged at least 1 workout
  useEffect(() => {
    if (!insight && store._hasHydrated && workouts.length >= 1) {
      handleGenerate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store._hasHydrated, workouts.length]);

  const handleGenerate = async (forceRefresh = true) => {
    if (workouts.length < 1) return;
    setLoading(true);
    try {
      const result = await fetchOrGenerateAICoachInsight(store, { forceRefresh });
      setInsight(result);
    } catch (err) {
      console.error('Failed to generate AI insight:', err);
    } finally {
      setLoading(false);
    }
  };

  // State 1: Brand-new account with 0 workouts logged
  if (workouts.length === 0) {
    return (
      <div className="card p-4 bg-bg-card border border-border shadow-xs space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-text-primary uppercase tracking-wider font-mono">
              ASCEND COACH
            </h3>
            <span className="text-2xs text-text-muted">Awaiting first session</span>
          </div>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Log 1 workout to unlock coaching. Once recorded, ASCEND analyzes your volume trends, recovery cadence, and progressive overload targets.
        </p>
      </div>
    );
  }

  // State 2: Active user with workout history
  return (
    <div className="card p-4 bg-bg-card border border-border shadow-xs space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-bold text-xs text-text-primary uppercase tracking-wider font-mono">
            COACH INSIGHT
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-2xs font-semibold text-accent hover:underline flex items-center gap-0.5"
          >
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={() => handleGenerate(true)}
            disabled={loading}
            className="p-1 rounded text-text-muted hover:text-accent disabled:opacity-50 transition-colors"
            title="Recalculate Insight"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !insight ? (
        <div className="space-y-1.5 py-1 animate-pulse">
          <div className="h-3.5 bg-bg-secondary rounded w-5/6" />
          <div className="h-3.5 bg-bg-secondary rounded w-2/3" />
        </div>
      ) : insight ? (
        <div className="space-y-2">
          {/* Collapsed 2-line summary */}
          <p className={`text-xs text-text-secondary leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
            {insight.tacticalAdvice || insight.recoveryStatus || insight.volumeTrend}
          </p>

          {/* Expanded detailed breakdown */}
          {isExpanded && (
            <div className="space-y-2.5 pt-2 border-t border-border/50 text-xs animate-fade-in">
              <div className="space-y-0.5">
                <span className="text-3xs uppercase font-bold text-text-muted font-mono block">
                  VOLUME &amp; OVERLOAD
                </span>
                <p className="text-text-primary text-2xs leading-relaxed">{insight.volumeTrend}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-3xs uppercase font-bold text-text-muted font-mono block">
                  RECOVERY STATUS
                </span>
                <p className="text-text-primary text-2xs leading-relaxed">{insight.recoveryStatus}</p>
              </div>

              {insight.fatigueWarning && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-2xs flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{insight.fatigueWarning}</span>
                </div>
              )}
            </div>
          )}

          {/* AI Disclosure & Reporting for Google Play compliance */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-3xs text-text-muted">
            <span className="font-mono">✨ AI Generated • Not medical advice</span>
            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              className="hover:text-danger flex items-center gap-1 transition-colors cursor-pointer"
              title="Report inaccurate or objectionable AI response"
            >
              <Flag className="w-2.5 h-2.5" />
              <span>Report</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="py-2 text-center">
          <button
            type="button"
            onClick={() => handleGenerate(true)}
            disabled={loading}
            className="text-xs text-accent font-semibold hover:underline"
          >
            {loading ? 'Analyzing...' : 'Generate Today’s Coaching'}
          </button>
        </div>
      )}

      {/* In-app AI Report Modal */}
      <ReportAIModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        aiContentSnippet={insight?.tacticalAdvice || insight?.volumeTrend || ''}
        sourceFeature="Home Coach Insight"
        onReported={() => setInsight(undefined)}
      />
    </div>
  );
}
