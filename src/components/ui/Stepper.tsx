'use client';

import React from 'react';
import { Minus, Plus } from 'lucide-react';

export interface StepperProps {
  label: string;
  value: number | string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  sublabel?: string;
  onChange: (val: number) => void;
  quickIncrements?: number[];
  className?: string;
}

export function Stepper({
  label,
  value,
  unit,
  step = 1,
  min = 0,
  max = 999,
  sublabel,
  onChange,
  quickIncrements,
  className = '',
}: StepperProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;

  const handleDecrement = (delta: number) => {
    const next = Math.max(min, Math.round((numericValue - delta) * 100) / 100);
    onChange(next);
  };

  const handleIncrement = (delta: number) => {
    const next = Math.min(max, Math.round((numericValue + delta) * 100) / 100);
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(0);
      return;
    }
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
    }
  };

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      {/* Label & Context */}
      <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-text-muted mb-1.5">
        {label} {unit && <span className="text-text-secondary">({unit})</span>}
      </span>

      {/* Main Stepper Controls */}
      <div className="flex items-center justify-center gap-2 w-full max-w-[200px]">
        {/* Decrement Button */}
        <button
          type="button"
          onClick={() => handleDecrement(step)}
          disabled={numericValue <= min}
          aria-label={`Decrease ${label}`}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-bg-secondary hover:bg-bg-tertiary active:scale-90 disabled:opacity-30 disabled:pointer-events-none text-text-primary border border-border/80 flex items-center justify-center transition-all cursor-pointer shrink-0"
        >
          <Minus className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Central Numeric Display / Editable Input */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-[70px]">
          <input
            type="text"
            inputMode="decimal"
            value={value === 0 && sublabel ? '' : value}
            placeholder={sublabel || '0'}
            onChange={handleInputChange}
            onFocus={(e) => e.target.select()}
            className="w-full text-center font-mono font-black text-2xl sm:text-3xl text-text-primary bg-transparent outline-none border-b border-border/60 focus:border-accent py-0.5 tracking-tight tabular-nums transition-colors"
          />
          {sublabel && (
            <span className="text-[10px] text-accent font-semibold mt-0.5 truncate max-w-[90px]">
              {sublabel}
            </span>
          )}
        </div>

        {/* Increment Button */}
        <button
          type="button"
          onClick={() => handleIncrement(step)}
          disabled={numericValue >= max}
          aria-label={`Increase ${label}`}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-bg-secondary hover:bg-bg-tertiary active:scale-90 disabled:opacity-30 disabled:pointer-events-none text-text-primary border border-border/80 flex items-center justify-center transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* Optional Quick Increment Chips */}
      {quickIncrements && quickIncrements.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          {quickIncrements.map((inc) => (
            <button
              key={inc}
              type="button"
              onClick={() => handleIncrement(inc)}
              className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-bg-secondary hover:bg-bg-tertiary text-text-secondary hover:text-accent border border-border/60 active:scale-95 transition-all"
            >
              +{inc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Stepper;
