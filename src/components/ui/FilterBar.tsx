'use client';

import React from 'react';

/**
 * UX redesign — chart filter standard (design-system §6). One labeled
 * native select per filter dimension (lift / range / metric). Defaults
 * shown in Simple; full controls in Detailed. Filter state lives with
 * the chart (persisted per chart); this component only renders.
 * Native selects keep the 16px mobile input size (no iOS auto-zoom).
 */
export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export interface FilterBarProps {
  filters: FilterDefinition[];
  ariaLabel?: string;
}

export default function FilterBar({ filters, ariaLabel }: FilterBarProps) {
  return (
    <div role="group" aria-label={ariaLabel ?? 'Chart filters'} className="flex flex-wrap items-end gap-3">
      {filters.map((filter) => (
        <label key={filter.key} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">{filter.label}</span>
          <select
            aria-label={filter.label}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="w-full"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
