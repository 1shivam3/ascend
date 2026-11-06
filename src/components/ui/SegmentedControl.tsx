'use client';

import React from 'react';

/**
 * UX redesign — segmented control (design-system §6). Promotes the
 * existing .segmented-control / .segmented-item globals to a component.
 * Used for Fuel segments, You Profile | Settings, and Progress sub-tabs
 * where a segmented (not tab-bar) control fits. Buttons with
 * aria-pressed; press feedback via the shared active:scale-[0.97].
 *
 * Phase 4 (Task 4.1) — ONE segmented style. Selected-state style per
 * theme (same logic in both: a raised NEUTRAL pill on the sunken
 * track — the accent never fills a segment):
 *   light — surface pill: bg-card (white) + subtle shadow (shadow-xs).
 *   dark  — raised surface pill: bg-elevated + shadow (globals.css
 *           `.dark .segmented-item.active` override).
 * Tab-style sub-navigation (Train / Fuel / Progress tablists) keeps
 * its tablist semantics and arrow-key handling but renders through
 * the same .segmented-control / .segmented-item classes, so there is
 * exactly one visual segmented style in the app.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** Use instead of ariaLabel when a visible label element with this
   *  id already names the group (QA4-020 label association). */
  ariaLabelledBy?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  ariaLabelledBy,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="segmented-control"
    >
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
