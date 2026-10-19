'use client';

import React, { useEffect } from 'react';

interface SplashScreenProps {
  onContinue?: () => void;
  isHydrating?: boolean;
}

export default function SplashScreen({ onContinue, isHydrating = false }: SplashScreenProps) {
  useEffect(() => {
    if (isHydrating || !onContinue) return;
    if (typeof window !== 'undefined' && window.location.search.includes('no_auto_advance=true')) {
      return;
    }
    // Auto-advance after 1.8 seconds if user does not tap
    const timer = setTimeout(() => {
      onContinue();
    }, 1800);
    return () => clearTimeout(timer);
  }, [isHydrating, onContinue]);

  return (
    <div
      onClick={!isHydrating && onContinue ? onContinue : undefined}
      className={`relative min-h-screen w-full bg-[#171916] text-[#F3F0E7] flex flex-col items-center justify-between p-8 select-none overflow-hidden transition-opacity duration-500 ${
        !isHydrating && onContinue ? 'cursor-pointer' : ''
      }`}
      role="banner"
      aria-label="ASCEND Fitness Application"
    >
      {/* Background Photograph with Vignette & Fallback */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/splash-athlete.jpg"
          alt=""
          role="presentation"
          className="w-full h-full object-cover object-center"
          loading="eager"
        />
        {/* Cinematic gradient overlay matching reference darkness and contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#171916]/80 via-[#171916]/40 to-[#171916]/85" />
      </div>

      {/* Top spacer */}
      <div className="relative z-10 w-full flex justify-end pt-4" aria-hidden="true" />

      {/* Center Branding Hero (Screen 1 Reference Lock) */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-3 animate-fade-in my-auto">
        {/* Wordmark */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-[0.25em] text-white uppercase font-sans drop-shadow-md">
          ASCEND
        </h1>

        {/* Tagline matching reference */}
        <p className="text-xs sm:text-sm font-medium tracking-widest text-[#F3F0E7]/80 uppercase drop-shadow">
          Train. Fuel. Progress. Repeat.
        </p>
      </div>

      {/* Bottom Indicator */}
      <div className="relative z-10 pb-8 flex flex-col items-center text-center">
        {isHydrating ? (
          <div className="flex items-center gap-2 text-xs text-[#858076] font-mono animate-pulse">
            <span className="w-2 h-2 rounded-full bg-[#E44427] animate-ping mr-1" />
            <span>INITIALIZING...</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContinue?.();
            }}
            className="text-xs tracking-wider text-[#F3F0E7]/70 hover:text-white uppercase font-medium transition-colors cursor-pointer py-2 px-4 rounded-full border border-white/10 hover:border-white/30 backdrop-blur-xs bg-black/20"
          >
            Tap to continue
          </button>
        )}
      </div>
    </div>
  );
}
