'use client';

import React, { useState } from 'react';
import {
  X,
  Droplet,
  Plus,
  RotateCcw,
  Sliders,
  Check,
  Flame,
  Sun,
  Dumbbell,
  Clock,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  toLocalDateString,
  calculateHydrationTarget,
  formatWaterLiters,
  getDayType,
} from '@/lib/habits';

interface HydrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HydrationModal({ isOpen, onClose }: HydrationModalProps) {
  const toast = useToast();
  const todayStr = toLocalDateString(new Date());

  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const waterBatches = useStore((state) => (state.waterBatches || {})[todayStr] || []);
  const hydrationConfig = useStore((state) => state.hydrationConfig);
  const dayTypeOverrides = useStore((state) => state.dayTypeOverrides || {});

  const logWater = useStore((state) => state.logWater);
  const resetWater = useStore((state) => state.resetWater);
  const setHydrationConfig = useStore((state) => state.setHydrationConfig);

  const currentDayType = getDayType(todayStr, workouts, dayTypeOverrides);

  // Form states for target adjustment
  const [showConfig, setShowConfig] = useState(false);
  const [customMl, setCustomMl] = useState(
    hydrationConfig?.isCustomTarget ? String(hydrationConfig.dailyTargetMl) : ''
  );
  const [isCustom, setIsCustom] = useState(!!hydrationConfig?.isCustomTarget);
  const [isHotEnvironment, setIsHotEnvironment] = useState(
    (hydrationConfig?.climateAdjustmentMl || 0) > 0
  );
  const [manualLogAmount, setManualLogAmount] = useState('');

  if (!isOpen) return null;

  const currentWaterMl = waterLogs[todayStr] || 0;

  const currentTargetMl = calculateHydrationTarget({
    bodyweightKg: profile?.bodyweightKg || 75,
    isTrainingDay: currentDayType === 'training',
    climateHeat: isHotEnvironment,
    customTargetMl: isCustom && Number(customMl) > 0 ? Number(customMl) : undefined,
    isCustomTarget: isCustom,
  });

  const remainingMl = Math.max(0, currentTargetMl - currentWaterMl);
  const pct = Math.min(100, Math.round((currentWaterMl / currentTargetMl) * 100));

  const handleQuickAdd = (amt: number) => {
    logWater(amt, todayStr);
    toast.success(`+${amt} ml logged!`, 'Hydration Updated');
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(manualLogAmount, 10);
    if (isNaN(amt) || amt <= 0) return;
    logWater(amt, todayStr);
    setManualLogAmount('');
    toast.success(`+${amt} ml logged!`, 'Hydration Updated');
  };

  const handleReset = () => {
    if (confirm('Reset today’s logged water to 0 ml?')) {
      resetWater(todayStr);
      toast.info('Today’s water reset to 0 ml', 'Hydration Reset');
    }
  };

  const handleSaveConfig = () => {
    const customNum = parseInt(customMl, 10);
    setHydrationConfig({
      dailyTargetMl: isCustom && !isNaN(customNum) && customNum > 0 ? customNum : currentTargetMl,
      isCustomTarget: isCustom,
      climateAdjustmentMl: isHotEnvironment ? 300 : 0,
    });
    setShowConfig(false);
    toast.success('Hydration target saved!', 'Preferences Updated');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-sky-500">
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <Droplet className="w-5 h-5 fill-sky-500/20 stroke-sky-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary leading-tight">
                Hydration Target
              </h2>
              <p className="text-xs text-text-muted">Daily fluid &amp; recovery baseline</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target & Current Progress Display */}
        <div className="card p-4 bg-gradient-to-br from-bg-card to-sky-500/5 border border-sky-500/20 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="section-title text-[10px] text-sky-600 block mb-0">
              TODAY&apos;S HYDRATION TARGET
            </span>
            <span className="text-xs font-semibold text-text-muted">
              {currentDayType === 'training' ? 'Training Day (+500ml)' : 'Rest Day'}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-text-primary font-sans">
                {formatWaterLiters(currentWaterMl)}
              </span>
              <span className="text-sm font-bold text-text-muted">
                / {formatWaterLiters(currentTargetMl)}
              </span>
            </div>
            <span className="text-xs font-bold text-sky-600 bg-sky-500/10 px-2 py-0.5 rounded-full">
              {remainingMl === 0 ? 'Target Hit! ✓' : `${formatWaterLiters(remainingMl)} remaining`}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="h-3 w-full bg-bg-secondary rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-sky-400 to-sky-600 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-text-muted font-mono font-medium">
              <span>0.0 L</span>
              <span>{pct}% saturated</span>
              <span>{formatWaterLiters(currentTargetMl)}</span>
            </div>
          </div>
        </div>

        {/* 1-Tap Quick Log Strip */}
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block px-1">
            QUICK 1-TAP LOG
          </span>
          <div className="grid grid-cols-4 gap-2">
            {[250, 500, 750, 1000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handleQuickAdd(amt)}
                className="py-2.5 px-2 rounded-xl bg-bg-secondary hover:bg-sky-500/10 hover:border-sky-500/30 border border-transparent font-bold text-text-primary transition-all active:scale-95 text-center group"
              >
                <span className="text-xs group-hover:text-sky-600 block leading-tight">
                  +{amt}
                </span>
                <span className="text-[10px] text-text-muted font-normal">ml</span>
              </button>
            ))}
          </div>
        </div>

        {/* Manual Amount Input */}
        <form onSubmit={handleManualAdd} className="flex gap-2">
          <input
            type="number"
            min="10"
            max="3000"
            step="10"
            placeholder="Custom ml (e.g. 350)"
            value={manualLogAmount}
            onChange={(e) => setManualLogAmount(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-bg-secondary border border-border text-xs text-text-primary focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!manualLogAmount}
            className="btn-secondary px-3 py-2 text-xs font-bold disabled:opacity-50"
          >
            Add Water
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Reset Today's Water"
            className="p-2 rounded-xl border border-border text-text-muted hover:text-red-500 hover:border-red-500/30 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </form>

        {/* Target Estimator Settings Accordion */}
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="w-full flex items-center justify-between text-xs font-semibold text-text-secondary hover:text-text-primary py-1"
          >
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>Target Estimator Inputs</span>
            </div>
            <span className="text-[11px] text-accent font-medium">
              {showConfig ? 'Hide' : 'Customize Target'}
            </span>
          </button>

          {showConfig && (
            <div className="mt-3 p-3 rounded-xl bg-bg-secondary space-y-3 text-xs animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-text-primary block">Hot Environment / Heat</span>
                  <span className="text-[11px] text-text-muted">+300 ml for heavy sweating</span>
                </div>
                <input
                  type="checkbox"
                  checked={isHotEnvironment}
                  onChange={(e) => setIsHotEnvironment(e.target.checked)}
                  className="rounded border-border text-accent focus:ring-accent w-4 h-4"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-text-primary block">Manual Custom Target</span>
                  <span className="text-[11px] text-text-muted">Override automatic estimation</span>
                </div>
                <input
                  type="checkbox"
                  checked={isCustom}
                  onChange={(e) => setIsCustom(e.target.checked)}
                  className="rounded border-border text-accent focus:ring-accent w-4 h-4"
                />
              </div>

              {isCustom && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-text-secondary block">
                    Daily Target (ml)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max="8000"
                    step="100"
                    value={customMl}
                    onChange={(e) => setCustomMl(e.target.value)}
                    placeholder="2700"
                    className="w-full px-3 py-1.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveConfig}
                className="btn-primary w-full py-2 text-xs font-bold mt-1"
              >
                Save Target Preferences
              </button>
            </div>
          )}
        </div>

        {/* Today's Log Batches */}
        {waterBatches.length > 0 && (
          <div className="border-t border-border pt-3 space-y-2">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
              TODAY&apos;S LOG ENTRIES ({waterBatches.length})
            </span>
            <div className="max-h-28 overflow-y-auto space-y-1 text-xs pr-1">
              {waterBatches.map((b) => {
                let timeStr = 'Logged';
                try {
                  timeStr = new Date(b.timestamp).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                } catch {}
                return (
                  <div
                    key={b.id}
                    className="flex justify-between items-center py-1 px-2 rounded-lg bg-bg-secondary text-text-primary"
                  >
                    <span className="text-text-muted flex items-center gap-1 text-[11px]">
                      <Clock className="w-3 h-3" />
                      {timeStr}
                    </span>
                    <span className="font-bold text-sky-600">+{b.amountMl} ml</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
