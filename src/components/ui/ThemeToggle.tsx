'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useStore } from '@/lib/store';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useStore();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun size={18} className="text-accent" />
      ) : (
        <Moon size={18} className="text-accent" />
      )}
    </button>
  );
}
