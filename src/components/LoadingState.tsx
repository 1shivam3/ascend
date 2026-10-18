'use client';

import React from 'react';

export interface LoadingStateProps {
  label?: string;
  description?: string;
  fullScreen?: boolean;
}

/**
 * Screen 26 — Loading State
 * Minimal, centered loading presentation adhering to the locked design system.
 * Palette: Graphite (#171916), Chalk (#F3F0E7), Vermilion (#E44427), Sage (#858076).
 */
export default function LoadingState({
  label = 'Loading...',
  description = 'Please wait while we load your data.',
  fullScreen = true,
}: LoadingStateProps) {
  const content = (
    <div className="w-full max-w-sm mx-auto p-6 sm:p-8 space-y-6 text-center animate-fade-in select-none">
      {/* ── Screen 26: Centered Vermilion Spinner Indicator ────────────── */}
      <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
        {/* Subtle background pulse */}
        <div className="absolute inset-0 rounded-full bg-accent/10 animate-ping opacity-75" />
        {/* Animated track spinner */}
        <div className="w-12 h-12 rounded-full border-[3px] border-border border-t-accent animate-spin shadow-xs" />
        {/* Inner center dot in Sage */}
        <div className="absolute w-2 h-2 rounded-full bg-sage" />
      </div>

      {/* ── Typography ──────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold font-sans text-text-primary tracking-tight">
          {label}
        </h2>
        <p className="text-xs text-text-muted font-sans leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );

  if (!fullScreen) {
    return content;
  }

  return (
    <div className="min-h-[100dvh] w-full bg-bg-primary text-text-primary flex items-center justify-center p-4 sm:p-6">
      {content}
    </div>
  );
}
