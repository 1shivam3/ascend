'use client';

import React from 'react';

/**
 * Phase 4 (Task 4.1) — the ONE Chip component for selectable chips
 * (day selectors, body-part picks, filter chips).
 *
 * One selected style, both themes:
 *   selected   — accent-tinted surface (bg-accent-subtle) + accent text
 *                (text-accent-text) + accent hairline. The accent-text
 *                token is stepped per accent until it clears 4.5:1 on
 *                the subtle wash (see the chip note in
 *                src/lib/accent-themes.ts), so this pairing is AA for
 *                every preset and for corrected custom hexes, in light
 *                and dark alike.
 *   unselected — neutral surface (bg-bg-secondary) + the secondary
 *                text token + hairline border.
 * No one-off chip colours (the old lavender / purple / indigo selected
 * states are gone); non-selectable display badges keep their own
 * semantic tokens and are not Chips.
 */
export interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
  className?: string;
}

export default function Chip({ selected, onClick, children, ariaLabel, className = '' }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-2xs font-semibold border transition-all cursor-pointer ${
        selected
          ? 'bg-accent-subtle border-accent/50 text-accent-text font-bold'
          : 'bg-bg-secondary border-border text-text-secondary hover:text-text-primary'
      } ${className}`}
    >
      {children}
    </button>
  );
}
