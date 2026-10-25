'use client';

import React from 'react';

/**
 * FlameMascot — the ASCEND flame character, as inline SVG.
 *
 * An SVG interpretation of the approved logo #2 (vermilion flame whose
 * negative space forms an A), with a simple friendly face (two eyes + a
 * smile) for the onboarding intro. Inline SVG keeps it crisp at every
 * size and animatable with transforms; no raster asset is involved.
 *
 * Tones (theme tokens only — the onboarding island contract forbids
 * hardcoded palette hexes, so the body uses currentColor + a token
 * text class; the face is constant white/black, not palette colors):
 * - 'dark': graphite body for the full-screen splash (vermilion bg).
 * - 'brand': accent body for the settled mascot on onboarding screens.
 * Decorative: always aria-hidden, no user-visible strings.
 */
interface FlameMascotProps {
  size?: number;
  tone?: 'dark' | 'brand';
  className?: string;
}

export default function FlameMascot({ size = 56, tone = 'brand', className }: FlameMascotProps) {
  const toneClass = tone === 'dark' ? 'text-brand-graphite' : 'text-accent';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      role="presentation"
      className={className ? `${toneClass} ${className}` : toneClass}
    >
      {/* Flame silhouette with an A-shaped cutout (even-odd rule). */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M100 12 C110 40 134 58 142 88 C148 110 140 126 148 144 C158 168 144 190 100 190 C56 190 42 168 52 144 C60 126 52 110 58 88 C66 58 90 40 100 12 Z M100 122 L130 172 L70 172 Z"
      />
      {/* Eyes */}
      <circle cx="80" cy="92" r="10" fill="white" />
      <circle cx="120" cy="92" r="10" fill="white" />
      <circle cx="80" cy="93" r="4.5" fill="black" />
      <circle cx="120" cy="93" r="4.5" fill="black" />
      {/* Smile */}
      <path
        d="M82 106 Q100 118 118 106"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
