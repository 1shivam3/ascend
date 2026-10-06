'use client';

import React from 'react';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string | number;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = true,
  className = '',
}: SegmentedControlProps<T>) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs min-h-[34px]',
    md: 'p-1 text-xs sm:text-sm min-h-[42px]',
  };

  return (
    <div
      role="tablist"
      className={`inline-flex rounded-xl bg-bg-secondary border border-border/80 ${sizeClasses[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(option.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 font-bold transition-all duration-150 rounded-lg select-none px-3 py-1 cursor-pointer ${
              isSelected
                ? 'bg-bg-card text-text-primary shadow-xs border border-border/60'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <span>{option.label}</span>
            {option.badge !== undefined && (
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                  isSelected ? 'bg-accent/15 text-accent' : 'bg-bg-tertiary text-text-muted'
                }`}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
