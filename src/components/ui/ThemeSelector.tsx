'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { THEME_PRESETS, AccentPreset, applyAccentTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';
import { Check, RotateCcw, Sliders, Palette, Sparkles } from 'lucide-react';

interface ThemeSelectorProps {
  onThemeChanged?: () => void;
}

export default function ThemeSelector({ onThemeChanged }: ThemeSelectorProps) {
  const { theme, uiPreferences, setUiPreferences } = useStore();
  const { t } = useTranslation();
  const [customHex, setCustomHex] = useState(uiPreferences?.customAccentHex || '#E44427');
  const [showCustomInput, setShowCustomInput] = useState(uiPreferences?.accentPreset === 'custom');

  const activePreset = uiPreferences?.accentPreset || 'vermilion';
  const isDark = theme === 'dark';

  const handleSelectPreset = (preset: AccentPreset) => {
    if (preset === 'custom') {
      setShowCustomInput(true);
      setUiPreferences({ accentPreset: 'custom', customAccentHex: customHex });
      applyAccentTheme('custom', customHex, isDark);
    } else {
      setShowCustomInput(false);
      setUiPreferences({ accentPreset: preset, customAccentHex: undefined });
      applyAccentTheme(preset, undefined, isDark);
    }
    if (onThemeChanged) onThemeChanged();
  };

  const handleCustomHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomHex(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      setUiPreferences({ accentPreset: 'custom', customAccentHex: val });
      applyAccentTheme('custom', val, isDark);
    }
  };

  const handleResetToDefault = () => {
    setShowCustomInput(false);
    setUiPreferences({
      accentPreset: 'vermilion',
      customAccentHex: undefined,
      densityMode: 'simple',
    });
    applyAccentTheme('vermilion', undefined, isDark);
    if (onThemeChanged) onThemeChanged();
  };

  const currentDensity = uiPreferences?.densityMode || 'simple';

  return (
    <div className="space-y-6">
      {/* 1. Curated Accent Theme Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-accent" />
            <h4 className="text-sm font-bold text-text-primary">Accent Theme</h4>
          </div>
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
            title="Reset to default ASCEND Vermilion theme"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Default</span>
          </button>
        </div>

        <p className="text-xs text-text-secondary">
          ASCEND Vermilion is the authentic signature accent. You may select an alternate athletic palette below:
        </p>

        <div
          role="radiogroup"
          aria-label="Accent Color Presets"
          className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1"
        >
          {Object.values(THEME_PRESETS).map((preset) => {
            const isSelected = activePreset === preset.id && !showCustomInput;
            const values = isDark ? preset.dark : preset.light;

            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelectPreset(preset.id)}
                className={`relative p-3 rounded-xl border text-left transition-all min-h-[58px] flex flex-col justify-between ${
                  isSelected
                    ? 'border-accent bg-accent/10 shadow-xs'
                    : 'border-border/70 bg-bg-card hover:border-border hover:bg-bg-secondary/40'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className="w-4 h-4 rounded-full border border-black/15 shadow-xs flex items-center justify-center"
                    style={{ backgroundColor: values.hex }}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                  </span>
                  {preset.id === 'vermilion' && (
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-accent px-1.5 py-0.5 rounded bg-accent/15">
                      Default
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-semibold text-text-primary truncate">
                    {preset.name}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {preset.tagline}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Color Selector */}
        <div className="pt-2">
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-bg-card">
            <input
              type="color"
              value={customHex}
              onChange={handleCustomHexChange}
              className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
              aria-label="Select custom accent color"
            />
            <div className="flex-1">
              <label className="text-xs font-semibold text-text-primary block">
                Custom Accent Color
              </label>
              <span className="text-[11px] text-text-muted font-mono uppercase">
                {customHex}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSelectPreset('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activePreset === 'custom'
                  ? 'bg-accent text-white shadow-xs'
                  : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
              }`}
            >
              {activePreset === 'custom' ? 'Active' : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Information Density Mode (Simple vs Detailed) */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-accent" />
          <h4 className="text-sm font-bold text-text-primary">Information Density</h4>
        </div>
        <p className="text-xs text-text-secondary">
          Control how much data and analytics are displayed on your daily dashboard and workout flows:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Simple Mode */}
          <button
            type="button"
            onClick={() => setUiPreferences({ densityMode: 'simple' })}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              currentDensity === 'simple'
                ? 'border-accent bg-accent/10 shadow-xs'
                : 'border-border/70 bg-bg-card hover:border-border hover:bg-bg-secondary/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Sparkles className={`w-4 h-4 ${currentDensity === 'simple' ? 'text-accent' : 'text-text-muted'}`} />
                <span className="text-xs font-bold text-text-primary">Simple Mode</span>
              </div>
              {currentDensity === 'simple' && (
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              )}
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Clean, focused daily workout and nutrition summary. Ideal for beginners and fast training sessions without clutter.
            </p>
          </button>

          {/* Detailed Mode */}
          <button
            type="button"
            onClick={() => setUiPreferences({ densityMode: 'detailed' })}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              currentDensity === 'detailed'
                ? 'border-accent bg-accent/10 shadow-xs'
                : 'border-border/70 bg-bg-card hover:border-border hover:bg-bg-secondary/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Sliders className={`w-4 h-4 ${currentDensity === 'detailed' ? 'text-accent' : 'text-text-muted'}`} />
                <span className="text-xs font-bold text-text-primary">Detailed Mode</span>
              </div>
              {currentDensity === 'detailed' && (
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              )}
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Comprehensive analytics, periodization coach insights, fatigue indicators, and instant access to PR leaderboards.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
