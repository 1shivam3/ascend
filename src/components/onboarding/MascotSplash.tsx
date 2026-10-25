'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import FlameMascot from './FlameMascot';

/**
 * MascotSplash — the onboarding intro, after the 60fps pin's
 * "splash screen transition: onboarding mascot animation".
 *
 * Full-screen accent splash with the big flame mascot, then it fades to
 * reveal the welcome screen (whose settled small mascot + staggered
 * content complete the "scales/slides into place" beat).
 *
 * Motion budget (total worst case ~1.07s, under the 1.2s cap):
 * splash 400ms + fade 300ms + welcome stagger (120ms delay + 250ms fade).
 * Uses ONLY the existing keyframes (scaleIn here; fadeIn/slideUp on the
 * welcome content) — no new keyframes, no library.
 * - ANY tap during the splash skips instantly to the fade-out.
 * - prefers-reduced-motion: no overlay, no timers — straight to welcome
 *   (the global reduced-motion rule is the backstop).
 * - The overlay blocks interaction while visible, so nothing beneath it
 *   can be tapped early; once it fades, onboarding inputs work normally.
 * - Intro only: this component mounts solely on the onboarding 'splash'
 *   screen. It never appears on app pages.
 */
interface MascotSplashProps {
  onDone: () => void;
}

export default function MascotSplash({ onDone }: MascotSplashProps) {
  const { t } = useTranslation();
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [fading, setFading] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFading(true);
  };

  useEffect(() => {
    if (reducedMotion) {
      onDoneRef.current();
      return;
    }
    const t = setTimeout(finish, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => onDoneRef.current(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fading]);

  if (reducedMotion) return null;

  return (
    <button
      type="button"
      aria-label={t('auth.tapContinue')}
      onClick={finish}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-accent cursor-pointer transition-opacity duration-300 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <span className="animate-scale-in" aria-hidden="true">
        <FlameMascot size={176} tone="dark" />
      </span>
    </button>
  );
}
