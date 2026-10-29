'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { calculatePlates, BARBELL_PRESETS } from '@/lib/plate-calculator';
import { X, Dumbbell, Minus, Plus, RotateCcw, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface PlateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWeight?: number;
  initialUnit?: 'kg' | 'lbs';
  exerciseName?: string;
  bestSetWeight?: number;
  milestoneWeight?: number;
}

export default function PlateCalculatorModal({
  isOpen,
  onClose,
  initialWeight = 100,
  initialUnit = 'kg',
  exerciseName,
  bestSetWeight,
  milestoneWeight,
}: PlateCalculatorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const [unit, setUnit] = useState<'kg' | 'lbs'>(initialUnit);
  const [barWeight, setBarWeight] = useState<number>(initialUnit === 'kg' ? 20 : 45);
  const [targetWeight, setTargetWeight] = useState<number>(initialWeight || 100);
  const { t } = useTranslation();
  const [showWarmupRamp, setShowWarmupRamp] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setUnit(initialUnit);
      setBarWeight(initialUnit === 'kg' ? 20 : 45);
      setTargetWeight(initialWeight || (initialUnit === 'kg' ? 100 : 225));
    }
  }, [isOpen, initialWeight, initialUnit]);

  // Sync bar weight default when unit switches. Convert at 0.1 precision —
  // whole-number rounding made 100 kg come back as 99.8 kg after a
  // kg→lbs→kg round trip.
  const handleUnitChange = (nextUnit: 'kg' | 'lbs') => {
    setUnit(nextUnit);
    if (nextUnit === 'kg') {
      setBarWeight(20);
      setTargetWeight(Math.round(targetWeight * 0.453592 * 10) / 10 || 100);
    } else {
      setBarWeight(45);
      setTargetWeight(Math.round(targetWeight * 2.20462 * 10) / 10 || 225);
    }
  };

  const warmupSets = useMemo(() => {
    if (targetWeight <= barWeight) return [];
    const step = unit === 'kg' ? 2.5 : 5;
    const roundToStep = (wt: number) => Math.max(barWeight, Math.round(wt / step) * step);
    return [
      { label: t('plates.setEmpty'), weight: barWeight, reps: t('plates.reps10'), pct: t('plates.warmupPct') },
      { label: t('plates.setPct', { n: 2, pct: 50 }), weight: roundToStep(targetWeight * 0.5), reps: t('plates.reps5'), pct: '50%' },
      { label: t('plates.setPct', { n: 3, pct: 70 }), weight: roundToStep(targetWeight * 0.7), reps: t('plates.reps3'), pct: '70%' },
      { label: t('plates.setPct', { n: 4, pct: 85 }), weight: roundToStep(targetWeight * 0.85), reps: t('plates.reps12'), pct: '85%' },
      { label: t('plates.workSet'), weight: targetWeight, reps: t('plates.repsWork'), pct: '100%' },
    ];
  }, [targetWeight, barWeight, unit, t]);

  const calculation = useMemo(() => {
    return calculatePlates(targetWeight, barWeight, unit);
  }, [targetWeight, barWeight, unit]);

  if (!isOpen) return null;

  const stepWeight = (amount: number) => {
    setTargetWeight((prev) => Math.max(barWeight, Number((prev + amount).toFixed(1))));
  };

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-4 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Dumbbell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-text-primary leading-tight">
                {t('plates.title')}
              </h2>
              <p className="text-2xs text-text-muted font-mono">{t('plates.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
          aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Exercise Context & Presets (Working Set vs Milestone) */}
        {(exerciseName || bestSetWeight || milestoneWeight) && (
          <div className="p-2.5 rounded-lg bg-bg-secondary/70 border border-border/80 flex flex-col gap-1.5 font-mono text-xs">
            {exerciseName && (
              <span className="font-bold text-accent-text text-xs capitalize">
                {exerciseName}
              </span>
            )}
            <div className="flex gap-2">
              {bestSetWeight && (
                <button
                  type="button"
                  onClick={() => setTargetWeight(bestSetWeight)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border text-2xs transition-colors flex flex-col items-center justify-center ${
                    targetWeight === bestSetWeight
                      ? 'bg-accent/15 border-accent text-accent-text font-bold'
                      : 'bg-bg-elevated border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="text-[0.625rem] text-text-muted">{t('plates.bestSet')}</span>
                  <span className="font-bold">{bestSetWeight} {unit}</span>
                </button>
              )}
              {milestoneWeight && (
                <button
                  type="button"
                  onClick={() => setTargetWeight(milestoneWeight)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border text-2xs transition-colors flex flex-col items-center justify-center ${
                    targetWeight === milestoneWeight
                      ? 'bg-accent/15 border-accent text-accent-text font-bold'
                      : 'bg-bg-elevated border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="text-[0.625rem] text-text-muted">{t('plates.target1rm')}</span>
                  <span className="font-bold">{milestoneWeight} {unit}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bar & Target Weight Controls */}
        <div className="space-y-3">
          {/* Target Weight Input with Steppers */}
          <div className="space-y-1.5">
            <label className="text-2xs font-mono text-text-muted uppercase font-bold">
              {t('plates.targetWeight')} ({unit.toUpperCase()})
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepWeight(unit === 'kg' ? -5 : -10)}
                className="btn-secondary px-3 py-2 text-sm flex items-center justify-center font-mono"
                title={`-${unit === 'kg' ? '5' : '10'} ${unit}`}
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="relative flex-1">
                <input
                  type="number"
                  step={unit === 'kg' ? '1.25' : '2.5'}
                  min={barWeight}
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(Number(e.target.value) || 0)}
                  className="w-full text-center text-xl font-bold font-mono py-2 bg-bg-elevated border border-border rounded-lg text-text-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted">
                  {unit}
                </span>
              </div>

              <button
                type="button"
                onClick={() => stepWeight(unit === 'kg' ? 5 : 10)}
                className="btn-secondary px-3 py-2 text-sm flex items-center justify-center font-mono"
                title={`+${unit === 'kg' ? '5' : '10'} ${unit}`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Step Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none font-mono text-xs">
            {[unit === 'kg' ? 2.5 : 5, unit === 'kg' ? 5 : 10, unit === 'kg' ? 10 : 25].map(
              (step) => (
                <div key={step} className="flex gap-1 flex-1">
                  <button
                    type="button"
                    onClick={() => stepWeight(-step)}
                    className="flex-1 py-1 rounded bg-bg-secondary hover:bg-bg-elevated border border-border text-2xs text-text-secondary transition-colors"
                  >
                    -{step}
                  </button>
                  <button
                    type="button"
                    onClick={() => stepWeight(step)}
                    className="flex-1 py-1 rounded bg-bg-secondary hover:bg-bg-elevated border border-border text-2xs text-accent-text font-semibold transition-colors"
                  >
                    +{step}
                  </button>
                </div>
              )
            )}
          </div>

          {/* Barbell Weight Selection */}
          <div className="p-2.5 rounded-xl bg-bg-secondary border border-border text-xs font-mono space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-text-muted font-bold text-2xs uppercase">{t('plates.barbellType')}</span>
              <span className="text-accent-text text-2xs font-bold">{t('plates.barUnit', { weight: barWeight, unit })}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BARBELL_PRESETS.map((preset) => {
                const presetWeight = unit === 'kg' ? preset.weightKg : preset.weightLbs;
                const isSelected = barWeight === presetWeight;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setBarWeight(presetWeight)}
                    className={`px-2 py-1 rounded-lg text-2xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-accent text-bg-primary font-bold shadow-xs'
                        : 'bg-bg-card hover:bg-bg-elevated text-text-secondary border border-border/80'
                    }`}
                    title={preset.description}
                  >
                    {preset.shortName} ({presetWeight} {unit})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Visual Barbell Graphic (Single Side Sleeve Stack) */}
        <div className="p-4 rounded-xl bg-bg-elevated border border-border/80 space-y-2">
          <div className="flex justify-between items-center text-2xs font-mono text-text-muted">
            <span>{t('plates.perSide')} {calculation.weightPerSide} {unit}</span>
            <span>{t('plates.total')} {calculation.totalLoadedWeight} {unit}</span>
          </div>

          <div className="h-28 flex items-center justify-start bg-bg-secondary/70 rounded-lg px-4 border border-border/40 relative overflow-x-auto">
            {/* Barbell Inner Shaft */}
            <div className="w-12 h-4 bg-zinc-600 rounded-l flex-shrink-0 relative">
              <span className="absolute -top-4 left-1 text-[0.5625rem] font-mono text-text-muted">
                {t('plates.bar')}
              </span>
            </div>

            {/* Barbell Collar Ring */}
            <div className="w-3.5 h-14 bg-zinc-400 rounded-sm flex-shrink-0 shadow-sm" />

            {/* Loaded Plates Stack on Sleeve */}
            <div className="flex items-center gap-1 pl-1 relative min-h-[80px]">
              {/* Sleeve shaft running through center of plates */}
              <div className="absolute left-0 right-0 h-3 bg-zinc-500/80 -z-0" />

              {calculation.plates.length > 0 ? (
                calculation.plates.map((plate, pIdx) =>
                  Array.from({ length: plate.count }).map((_, cIdx) => (
                    <div
                      key={`${pIdx}-${cIdx}`}
                      style={{
                        backgroundColor: plate.color,
                        color: plate.textColor,
                        height: `${Math.max(34, plate.heightRatio * 76)}px`,
                        width: '20px',
                      }}
                      className="rounded-sm flex flex-col items-center justify-center text-[0.5625rem] font-mono font-black shadow-md flex-shrink-0 z-10 border border-black/20 select-none"
                      title={`${plate.weight} ${unit}`}
                    >
                      <span className="rotate-90 origin-center whitespace-nowrap">
                        {plate.weight}
                      </span>
                    </div>
                  ))
                )
              ) : (
                <span className="text-2xs font-mono text-text-muted pl-4 italic z-10">
                  {t('plates.emptyBar', { weight: barWeight, unit })}
                </span>
              )}
            </div>
          </div>

          {calculation.remainder > 0 && (
            <p className="text-2xs font-mono text-amber-500 text-center flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('plates.remainder', { amount: calculation.remainder, unit })}</span>
            </p>
          )}
        </div>

        {/* Detailed Plates List Table */}
        <div className="space-y-1.5">
          <span className="text-2xs font-mono uppercase text-text-muted font-bold block">
            {t('plates.breakdown')}
          </span>

          {calculation.plates.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
              {calculation.plates.map((plate) => (
                <div
                  key={plate.weight}
                  className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary border border-border text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 flex-shrink-0 shadow-xs"
                      style={{ backgroundColor: plate.color }}
                    />
                    <span className="font-bold text-text-primary">
                      {plate.weight} {unit}
                    </span>
                  </div>
                  <span className="text-accent font-bold">× {plate.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted text-center py-2 font-mono">
              {t('plates.loadAbove', { weight: barWeight, unit })}
            </p>
          )}
        </div>

        {/* Warm-up Ramp Sets Generator */}
        {warmupSets.length > 0 && (
          <div className="space-y-1.5 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono uppercase text-text-muted font-bold block">
                {t('plates.warmupTitle')}
              </span>
              <button
                type="button"
                onClick={() => setShowWarmupRamp(!showWarmupRamp)}
                className="text-2xs font-mono text-accent-text hover:underline"
              >
                {showWarmupRamp ? t('plates.hide') : t('plates.showRamp')}
              </button>
            </div>

            {showWarmupRamp && (
              <div className="space-y-1 animate-fade-in font-mono text-xs">
                {warmupSets.map((ws, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                      targetWeight === ws.weight
                        ? 'bg-accent/10 border-accent/60 text-accent font-bold'
                        : 'bg-bg-secondary border-border/70 text-text-secondary hover:bg-bg-elevated'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xs text-text-muted w-8">{ws.pct}</span>
                      <span className="font-bold text-text-primary">
                        {ws.weight} {unit}
                      </span>
                      <span className="text-text-muted text-2xs">({ws.reps})</span>
                    </div>

                    {targetWeight !== ws.weight ? (
                      <button
                        type="button"
                        onClick={() => setTargetWeight(ws.weight)}
                        className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-2xs text-text-primary hover:border-accent hover:text-accent-text transition-colors"
                      >
                        {t('plates.loadPlates')}
                      </button>
                    ) : (
                      <span className="text-2xs text-accent-text font-semibold px-2 py-0.5">
                        {t('plates.current')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full text-center font-semibold text-sm"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  );
}
