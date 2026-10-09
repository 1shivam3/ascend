'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useStore } from '@/lib/store';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useStore();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-secondary border border-border text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all active:scale-95 cursor-pointer shadow-xs"
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <>
          <Moon size={14} className="text-accent" />
          <span>Dark</span>
        </>
      ) : (
        <>
          <Sun size={14} className="text-amber-500" />
          <span>Light</span>
        </>
      )}
    </button>
  );
}
