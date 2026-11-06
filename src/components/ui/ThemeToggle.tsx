'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';

/**
 * Audit phase 4 (2026-11-06), Task 4.7 (P3-4): the Today header
 * theme control is an ICON-ONLY button whose icon names the TARGET
 * mode — Moon in light mode ("switch to dark"), Sun in dark mode —
 * instead of a text pill that labelled the CURRENT mode while doing
 * the opposite. The accessible label names the action via the
 * existing ui.switchMode string ("Switch to {mode} mode" /
 * "{mode} मोड पर जाएं"); no visible text remains.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useStore();
  const { t } = useTranslation();

  const targetMode = theme === 'dark' ? t('ui.light') : t('ui.dark');
  const actionLabel = t('ui.switchMode', { mode: targetMode });

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all active:scale-95 cursor-pointer shadow-xs"
      title={actionLabel}
      aria-label={actionLabel}
    >
      {theme === 'dark' ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  );
}
