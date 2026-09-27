'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { X, Scale, Ruler, History, Trash2, Plus, Calendar, CheckCircle2 } from 'lucide-react';
import { BodyMetricEntry } from '@/lib/types';

interface BodyMetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BodyMetricsModal({ isOpen, onClose }: BodyMetricsModalProps) {
  const profile = useStore((state) => state.profile);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const updateBodyMetrics = useStore((state) => state.updateBodyMetrics);
  const deleteBodyMetric = useStore((state) => state.deleteBodyMetric);

  const preferredUnit = profile?.unit || 'kg';
  const currentWeightKg = profile?.bodyweightKg || 75;
  const currentHeightCm = profile?.heightCm || 175;

  const [weightInput, setWeightInput] = useState<string>('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(preferredUnit);
  const [heightMode, setHeightMode] = useState<'cm' | 'ft'>('cm');
  const [heightCmInput, setHeightCmInput] = useState<string>('');
  const [heightFeetInput, setHeightFeetInput] = useState<string>('');
  const [heightInchesInput, setHeightInchesInput] = useState<string>('');
  const [dateInput, setDateInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const displayWeight =
        unit === 'lbs'
          ? (currentWeightKg * 2.20462).toFixed(1)
          : currentWeightKg.toFixed(1);
      setWeightInput(displayWeight);

      if (currentHeightCm) {
        setHeightCmInput(Math.round(currentHeightCm).toString());
        const totalInches = currentHeightCm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        setHeightFeetInput(feet.toString());
        setHeightInchesInput(inches.toString());
      } else {
        setHeightCmInput('175');
        setHeightFeetInput('5');
        setHeightInchesInput('9');
      }

      setDateInput(new Date().toISOString().split('T')[0]);
      setNotesInput('');
      setSuccessMsg('');
    }
  }, [isOpen, currentWeightKg, currentHeightCm, unit]);

  if (!isOpen) return null;

  const handleUnitToggle = (newUnit: 'kg' | 'lbs') => {
    if (newUnit === unit) return;
    const currentVal = parseFloat(weightInput);
    if (!isNaN(currentVal) && currentVal > 0) {
      if (newUnit === 'lbs') {
        setWeightInput((currentVal * 2.20462).toFixed(1));
      } else {
        setWeightInput((currentVal / 2.20462).toFixed(1));
      }
    }
    setUnit(newUnit);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedWeight = parseFloat(weightInput);
    if (isNaN(parsedWeight) || parsedWeight <= 0) return;

    const finalWeightKg = unit === 'lbs' ? parsedWeight * 0.453592 : parsedWeight;

    let finalHeightCm: number | undefined;
    if (heightMode === 'cm') {
      const cm = parseFloat(heightCmInput);
      if (!isNaN(cm) && cm > 50 && cm < 300) finalHeightCm = cm;
    } else {
      const feet = parseFloat(heightFeetInput) || 0;
      const inches = parseFloat(heightInchesInput) || 0;
      const totalInches = feet * 12 + inches;
      if (totalInches > 20 && totalInches < 120) {
        finalHeightCm = totalInches * 2.54;
      }
    }

    updateBodyMetrics(finalWeightKg, finalHeightCm);
    setSuccessMsg('Body metrics saved successfully!');
    setTimeout(() => {
      setSuccessMsg('');
      onClose();
    }, 1000);
  };

  // Sort history newest first
  const sortedMetrics = [...bodyMetrics].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-5 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-text-primary leading-tight">
                Update Bodyweight & Height
              </h2>
              <p className="text-2xs text-text-muted font-mono">Calibrate Strength Standard Ratios</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* Weight Field */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="section-title text-2xs font-mono uppercase text-text-muted">
                BODYWEIGHT
              </label>
              <div className="flex rounded-md bg-bg-secondary p-0.5 border border-border/80">
                <button
                  type="button"
                  onClick={() => handleUnitToggle('kg')}
                  className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all ${
                    unit === 'kg'
                      ? 'bg-accent text-bg-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  KG
                </button>
                <button
                  type="button"
                  onClick={() => handleUnitToggle('lbs')}
                  className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all ${
                    unit === 'lbs'
                      ? 'bg-accent text-bg-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  LBS
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="20"
                max="500"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder={unit === 'kg' ? '75.0' : '165.0'}
                className="w-full text-lg font-mono font-bold pl-3 pr-12 py-2.5"
                required
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted uppercase">
                {unit}
              </span>
            </div>
          </div>

          {/* Height Field */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="section-title text-2xs font-mono uppercase text-text-muted flex items-center gap-1">
                <Ruler className="w-3 h-3 text-accent" />
                HEIGHT
              </label>
              <div className="flex rounded-md bg-bg-secondary p-0.5 border border-border/80">
                <button
                  type="button"
                  onClick={() => setHeightMode('cm')}
                  className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all ${
                    heightMode === 'cm'
                      ? 'bg-accent text-bg-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  CM
                </button>
                <button
                  type="button"
                  onClick={() => setHeightMode('ft')}
                  className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all ${
                    heightMode === 'ft'
                      ? 'bg-accent text-bg-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  FT / IN
                </button>
              </div>
            </div>

            {heightMode === 'cm' ? (
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="60"
                  max="260"
                  value={heightCmInput}
                  onChange={(e) => setHeightCmInput(e.target.value)}
                  placeholder="175"
                  className="w-full text-base font-mono font-bold pl-3 pr-12 py-2"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted">
                  cm
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="2"
                    max="8"
                    value={heightFeetInput}
                    onChange={(e) => setHeightFeetInput(e.target.value)}
                    placeholder="5"
                    className="w-full text-base font-mono font-bold pl-3 pr-10 py-2"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted">
                    ft
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="11"
                    value={heightInchesInput}
                    onChange={(e) => setHeightInchesInput(e.target.value)}
                    placeholder="9"
                    className="w-full text-base font-mono font-bold pl-3 pr-10 py-2"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted">
                    in
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Date Field */}
          <div>
            <label className="section-title text-2xs font-mono uppercase text-text-muted block mb-1">
              ENTRY DATE
            </label>
            <div className="relative">
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full text-sm font-mono py-2 pl-3"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Save & Update Profile</span>
          </button>
        </form>

        {/* History Log Section */}
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-mono uppercase font-bold text-text-muted flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-accent" />
              WEIGHT & HEIGHT LOG HISTORY
            </span>
            <span className="text-2xs font-mono text-text-muted">
              {sortedMetrics.length} entries
            </span>
          </div>

          {sortedMetrics.length === 0 ? (
            <p className="text-2xs text-text-muted font-mono italic text-center py-3 bg-bg-secondary/40 rounded-xl">
              No historical entries recorded yet. Today&apos;s calibration will be logged.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {sortedMetrics.map((entry, idx) => {
                const prev = sortedMetrics[idx + 1];
                const diffKg = prev ? entry.weightKg - prev.weightKg : null;
                const displayWeight =
                  preferredUnit === 'lbs'
                    ? `${Math.round(entry.weightKg * 2.20462 * 10) / 10} lbs`
                    : `${entry.weightKg} kg`;

                const diffFormatted =
                  diffKg !== null
                    ? diffKg > 0
                      ? `+${preferredUnit === 'lbs' ? (diffKg * 2.20462).toFixed(1) : diffKg.toFixed(1)}`
                      : `${preferredUnit === 'lbs' ? (diffKg * 2.20462).toFixed(1) : diffKg.toFixed(1)}`
                    : null;

                return (
                  <div
                    key={entry.id}
                    className="p-2.5 rounded-lg bg-bg-secondary border border-border/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-text-primary text-sm">
                          {displayWeight}
                        </span>
                        {diffFormatted && (
                          <span
                            className={`text-2xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                              diffKg && diffKg > 0
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {diffFormatted} {preferredUnit}
                          </span>
                        )}
                        {entry.heightCm && (
                          <span className="text-2xs font-mono text-text-muted">
                            {Math.round(entry.heightCm)} cm
                          </span>
                        )}
                      </div>
                      <span className="text-2xs font-mono text-text-muted block mt-0.5">
                        {entry.date}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteBodyMetric(entry.id)}
                      className="p-1 text-text-muted hover:text-rose-400 transition-colors"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
