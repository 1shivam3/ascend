'use client';

import React from 'react';

/**
 * UX redesign — segmented control (design-system §6). Promotes the
 * existing .segmented-control / .segmented-item globals to a component.
 * Used for Fuel segments, You Profile | Settings, and Progress sub-tabs
 * where a segmented (not tab-bar) control fits. Buttons with
 * aria-pressed; press feedback via the shared active:scale-[0.97].
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="segmented-control">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`segmented-item ${value === opt.value ? 'active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
