'use client';

import React from 'react';

/**
 * Phase 4 (Task 4.1) — the ONE Switch component.
 *
 * Every toggle in the app renders through this component (Settings,
 * Reminder Center, workout detail "gym packed", plan intensity mode,
 * and any future switch). One style, token-derived:
 *   on  — track is the active accent (bg-accent), white knob.
 *   off — track is the neutral tertiary surface token (bg-bg-tertiary)
 *         with a hairline border; never a per-screen colour.
 * The 44×24 visual track keeps a 44×44 hit area via .tap-44 (the
 * neighbour-gap rule for .tap-44 applies: keep ≥12px between adjacent
 * targets). Accessible by construction: role="switch" + aria-checked
 * + a required ariaLabel.
 */
export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

export default function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  className = '',
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`tap-44 w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer relative ${
        checked ? 'bg-accent' : 'bg-bg-tertiary border border-border'
      } ${disabled ? 'opacity-50 cursor-default' : ''} ${className}`}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
