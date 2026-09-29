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
  Zap,
  AlertTriangle,
  Key,
  ShieldCheck,
  Wifi,
  WifiOff,
  CheckCircle2,
  X
} from 'lucide-react';

interface AICoachCardProps {
  onOpenSettings?: () => void;
}

export default function AICoachCard({ onOpenSettings }: AICoachCardProps) {
  const store = useStore();
  const todayStr = toLocalDateString(new Date());

  const cachedInsight = store.aiInsightsCache ? store.aiInsightsCache[todayStr] : undefined;

  const [insight, setInsight] = useState<AICoachInsight | undefined>(cachedInsight);
  const [loading, setLoading] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(store.customGeminiKey || '');
  const [keySavedAlert, setKeySavedAlert] = useState<boolean>(false);

  // Monitor online status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Sync with store cache
  useEffect(() => {
    if (store.aiInsightsCache && store.aiInsightsCache[todayStr]) {
      setInsight(store.aiInsightsCache[todayStr]);
    }
  }, [store.aiInsightsCache, todayStr]);

  // Initial load if not cached
  useEffect(() => {
    if (!insight && store._hasHydrated) {
      handleGenerate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store._hasHydrated]);

  const handleGenerate = async (forceRefresh = true) => {
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

  const handleSaveCustomKey = () => {
    store.setCustomGeminiKey(apiKeyInput);
    setKeySavedAlert(true);
    setTimeout(() => {
      setKeySavedAlert(false);
      setShowKeyModal(false);
    }, 1200);
  };

  const handleClearCustomKey = () => {
    store.setCustomGeminiKey('');
    setApiKeyInput('');
    setKeySavedAlert(true);
    setTimeout(() => {
      setKeySavedAlert(false);
      setShowKeyModal(false);
    }, 1000);
  };

  return (
    <>
      <div className="bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark rounded-2xl p-5 shadow-sm transition-all relative overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-accent/10 via-transparent to-transparent pointer-events-none rounded-tr-2xl" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-text-primary">
                  ASCEND AI Coach
                </h3>
                {insight?.source === 'gemini' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Gemini AI
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <Zap className="w-2.5 h-2.5" />
                    Offline Heuristics
                  </span>
                )}
              </div>
              <p className="text-2xs text-text-muted">
                {isOnline ? 'Online • Progressive Cloud AI' : 'Offline Mode • Instant On-Device Math'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setApiKeyInput(store.customGeminiKey || '');
                setShowKeyModal(true);
              }}
              title="Configure Personal Gemini API Key"
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              <Key className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleGenerate(true)}
              disabled={loading}
              title="Refresh Tactical Advice"
              className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-bg-secondary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-accent' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {loading && !insight ? (
          <div className="space-y-3 py-3 animate-pulse">
            <div className="h-4 bg-bg-secondary rounded w-3/4" />
            <div className="h-4 bg-bg-secondary rounded w-5/6" />
            <div className="h-4 bg-bg-secondary rounded w-2/3" />
          </div>
        ) : insight ? (
          <div className="space-y-3.5 relative z-10 text-sm">
            {/* Volume Trend */}
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 text-accent shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="text-2xs uppercase tracking-wider font-semibold text-text-muted block">
                  Volume & Overload
                </span>
                <p className="text-text-secondary leading-snug">
                  {insight.volumeTrend}
                </p>
              </div>
            </div>

            {/* Recovery Assessment */}
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 text-blue-500 dark:text-blue-400 shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <span className="text-2xs uppercase tracking-wider font-semibold text-text-muted block">
                  CNS & Muscular Recovery
                </span>
                <p className="text-text-secondary leading-snug">
                  {insight.recoveryStatus}
                </p>
              </div>
            </div>

            {/* Tactical Advice */}
            <div className="flex items-start gap-2.5 bg-bg-secondary/60 dark:bg-bg-secondary/40 p-3 rounded-xl border border-border-light/60 dark:border-border-dark/60">
              <div className="mt-0.5 text-accent shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-2xs uppercase tracking-wider font-semibold text-accent block mb-0.5">
                  Today&apos;s Tactical Directive
                </span>
                <p className="text-text-primary font-medium leading-snug">
                  {insight.tacticalAdvice}
                </p>
              </div>
            </div>

            {/* Fatigue / Safety Warning (if active) */}
            {insight.fatigueWarning && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <p className="leading-snug">{insight.fatigueWarning}</p>
              </div>
            )}

            {/* Footer Status & Trigger */}
            <div className="pt-2 flex items-center justify-between text-2xs text-text-muted border-t border-border-light/60 dark:border-border-dark/60">
              <span className="flex items-center gap-1">
                {isOnline ? (
                  <Wifi className="w-3 h-3 text-emerald-500" />
                ) : (
                  <WifiOff className="w-3 h-3 text-amber-500" />
                )}
                {insight.source === 'gemini'
                  ? 'Grounded via Google Gemini'
                  : 'Computed via Local Heuristics'}
              </span>

              <button
                onClick={() => handleGenerate(true)}
                disabled={loading}
                className="font-medium text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : 'Recalculate'}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-text-muted mb-3">
              No daily coaching analysis generated yet.
            </p>
            <button
              onClick={() => handleGenerate(true)}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors"
            >
              {loading ? 'Analyzing...' : 'Generate Today&apos;s Coaching'}
            </button>
          </div>
        )}
      </div>

      {/* Custom Gemini Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#161b22] border border-border-light dark:border-border-dark rounded-2xl w-full max-w-md p-6 shadow-xl relative animate-scale-up">
            <button
              onClick={() => setShowKeyModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
                <Key className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-text-primary">
                Gemini API Key Settings
              </h3>
            </div>

            <p className="text-xs text-text-muted mb-4 leading-relaxed">
              ASCEND operates seamlessly offline with local strength math. When online, it connects to Google Gemini for deep coaching. ASCEND includes a shared default key, but you can provide your personal API key to use your private quota.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-2xs font-semibold uppercase tracking-wider text-text-muted block mb-1.5">
                  Personal Gemini API Key
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-light dark:border-border-dark bg-bg-secondary text-text-primary text-xs focus:outline-none focus:border-accent"
                />
              </div>

              {keySavedAlert && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Key preferences saved successfully!
                </div>
              )}

              <p className="text-2xs text-text-muted">
                Keys are stored locally in your browser&apos;s encrypted storage and sent directly to the Gemini API endpoint.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              {store.customGeminiKey ? (
                <button
                  type="button"
                  onClick={handleClearCustomKey}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  Clear Key
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomKey}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-sm"
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
