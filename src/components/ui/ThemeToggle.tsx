'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useStore();
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-secondary border border-border text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all active:scale-95 cursor-pointer shadow-xs"
      title={t('ui.switchMode', { mode: theme === 'dark' ? t('ui.light') : t('ui.dark') })}
      aria-label={t('ui.toggleTheme')}
    >
      {theme === 'dark' ? (
        <>
          <Moon size={14} className="text-accent" />
          <span>{t('ui.dark')}</span>
        </>
      ) : (
        <>
          <Sun size={14} className="text-amber-500" />
          <span>{t('ui.light')}</span>
        </>
      )}
    </button>
  );
}
