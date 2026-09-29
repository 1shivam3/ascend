'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Check,
  Package,
  AlertTriangle,
  RotateCw,
  Clock,
  Sliders,
  Flame,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { toLocalDateString, getCreatineStats } from '@/lib/habits';

interface CreatineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreatineModal({ isOpen, onClose }: CreatineModalProps) {
  const toast = useToast();
  const todayStr = toLocalDateString(new Date());

  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const creatineConfig = useStore((state) => state.creatineConfig);
  const creatineSupply = useStore((state) => state.creatineSupply);

  const toggleCreatine = useStore((state) => state.toggleCreatine);
  const setCreatineConfig = useStore((state) => state.setCreatineConfig);
  const updateCreatineSupply = useStore((state) => state.updateCreatineSupply);
  const refillCreatineSupply = useStore((state) => state.refillCreatineSupply);

  const targetDoseG = creatineConfig?.dailyTargetG || 5;
  const stats = getCreatineStats(creatineLogs, new Date(), targetDoseG);

  // Supply calculation
  const containerSizeG = creatineSupply?.containerG || 500;
  const currentAmountG = creatineSupply?.currentAmountG ?? 450;
  const daysRemaining = Math.max(0, Math.floor(currentAmountG / Math.max(1, targetDoseG)));
  const isLowSupply = daysRemaining <= 10;

  // Settings form states
  const [showConfig, setShowConfig] = useState(false);
  const [doseInput, setDoseInput] = useState(String(targetDoseG));
  const [reminderTimeInput, setReminderTimeInput] = useState(creatineConfig?.reminderTime || '08:00');
  const [containerInput, setContainerInput] = useState(String(containerSizeG));
  const [currentAmountInput, setCurrentAmountInput] = useState(String(currentAmountG));

  if (!isOpen) return null;

  const handleToggle = () => {
    toggleCreatine(todayStr, targetDoseG);
    if (!stats.takenToday) {
      toast.success(`${targetDoseG}g creatine logged! Supply updated.`, 'Creatine Taken');
    } else {
      toast.info('Creatine marked as not taken for today.', 'Creatine Updated');
    }
  };

  const handleRefill = () => {
    refillCreatineSupply(containerSizeG);
    toast.success(`Container refilled to ${containerSizeG}g!`, 'Supply Restocked');
  };

  const handleSaveSettings = () => {
    const dose = parseFloat(doseInput);
    const container = parseFloat(containerInput);
    const amount = parseFloat(currentAmountInput);

    if (!isNaN(dose) && dose > 0) {
      setCreatineConfig({
        dailyTargetG: dose,
        reminderTime: reminderTimeInput,
      });
    }

    if (!isNaN(container) && !isNaN(amount)) {
      updateCreatineSupply({
        containerG: Math.max(50, container),
        currentAmountG: Math.max(0, amount),
      });
    }

    setShowConfig(false);
    toast.success('Creatine settings and supply updated!', 'Preferences Saved');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-amber-500">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 fill-amber-500/20 stroke-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary leading-tight">
                Creatine Tracker
              </h2>
              <p className="text-xs text-text-muted">Cellular phosphocreatine &amp; power output</p>
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

        {/* 1-Tap Intake Action Card */}
        <div className="card p-4 bg-gradient-to-br from-bg-card to-amber-500/5 border border-amber-500/25 space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-[10px] text-amber-600 block mb-0">
              TODAY&apos;S INTAKE
            </span>
            <span className="text-xs font-semibold text-text-muted">
              Target: {targetDoseG}g
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggle}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] ${
              stats.takenToday
                ? 'bg-emerald-500 text-white shadow-emerald-500/25 hover:bg-emerald-600'
                : 'btn-primary'
            }`}
          >
            {stats.takenToday ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{targetDoseG}G TAKEN TODAY ✓</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 fill-white stroke-white" />
                <span>MARK {targetDoseG}G TAKEN TODAY</span>
              </>
            )}
          </button>
        </div>

        {/* 30-Day Consistency & Saturation */}
        <div className="card p-4 bg-bg-card border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-[10px] block mb-0">
              CONSISTENCY (LAST 30 DAYS)
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
              <Flame className="w-3.5 h-3.5 fill-amber-500 stroke-amber-500" />
              {stats.currentStreak} Day Streak
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-text-primary font-sans">
                {stats.takenCount30}
              </span>
              <span className="text-sm font-semibold text-text-muted">/ 30 days</span>
            </div>
            <span className="text-xs font-bold text-text-primary">
              {stats.saturationLevel} Saturation
            </span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="h-2.5 w-full bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.consistencyPct}%` }}
              />
            </div>
            <p className="text-[11px] text-text-secondary leading-tight mt-1 font-medium">
              {stats.message}
            </p>
          </div>
        </div>

        {/* Creatine Supply Tracker (Item 7) */}
        <div className="card p-4 bg-bg-card border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Package className="w-4 h-4 text-accent" />
              <span className="section-title text-[10px] block mb-0">
                CREATINE SUPPLY TRACKER
              </span>
            </div>
            <button
              type="button"
              onClick={handleRefill}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
            >
              <RotateCw className="w-3 h-3" />
              <span>Refill</span>
            </button>
          </div>

          {/* Low Supply Warning Banner */}
          {isLowSupply && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>LOW SUPPLY:</strong> Approximately {daysRemaining} days remaining. Time to reorder!
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-bg-secondary text-center text-xs font-sans">
            <div>
              <span className="text-[10px] text-text-muted uppercase font-bold block">Container</span>
              <span className="font-bold text-text-primary text-sm">{containerSizeG}g</span>
            </div>
            <div className="border-l border-border">
              <span className="text-[10px] text-text-muted uppercase font-bold block">Remaining</span>
              <span className="font-bold text-text-primary text-sm">{currentAmountG}g</span>
            </div>
            <div className="border-l border-border">
              <span className="text-[10px] text-text-muted uppercase font-bold block">Est. Days</span>
              <span
                className={`font-bold text-sm ${
                  isLowSupply ? 'text-amber-500' : 'text-emerald-600'
                }`}
              >
                ~{daysRemaining}
              </span>
            </div>
          </div>
        </div>

        {/* Settings & Customization Accordion */}
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="w-full flex items-center justify-between text-xs font-semibold text-text-secondary hover:text-text-primary py-1"
          >
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>Configure Target &amp; Supply</span>
            </div>
            <span className="text-[11px] text-accent font-medium">
              {showConfig ? 'Hide' : 'Edit Settings'}
            </span>
          </button>

          {showConfig && (
            <div className="mt-3 p-3 rounded-xl bg-bg-secondary space-y-3 text-xs animate-fade-in">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                    Daily Dose (g)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="25"
                    step="0.5"
                    value={doseInput}
                    onChange={(e) => setDoseInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                    Reminder Time
                  </label>
                  <input
                    type="time"
                    value={reminderTimeInput}
                    onChange={(e) => setReminderTimeInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                    Container Tub Size (g)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="2000"
                    step="50"
                    value={containerInput}
                    onChange={(e) => setContainerInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                    Current Remaining (g)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2000"
                    step="1"
                    value={currentAmountInput}
                    onChange={(e) => setCurrentAmountInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-bg-card border border-border text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveSettings}
                className="btn-primary w-full py-2 text-xs font-bold mt-1"
              >
                Save Preferences
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
