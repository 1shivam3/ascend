'use client';

import { Check } from 'lucide-react';
import type { AccentVariant } from '@/lib/accent-themes';
import { useTranslation } from '@/lib/i18n';

/**
 * UX redesign Stage 6 — accent picker, presentational only (see
 * personalization-spec §1.4). Props carry preset definitions, selection,
 * custom hex, and callbacks only: no contrast math, no store writes, no
 * persistence logic inside this component. Contrast data arrives as the
 * audit-supplied `previewNote` string; the component renders it.
 *
 * Preset picks apply immediately (parent commits on select). Custom hex
 * only restyles the whole app on Apply — the preview panel below shows the
 * derived variant for the CURRENT appearance mode only.
 */

export interface ThemePickerSwatch {
  id: string;
  name: string;
  /** Swatch colour for the current appearance mode, resolved by the parent. */
  swatch: string;
}

export interface ThemePickerProps {
  swatches: ThemePickerSwatch[];
  selectedId: string;
  customHex: string;
  customError: string | null;
  /** Derived variant for the draft hex (current mode), or null when the draft is empty/invalid. */
  preview: AccentVariant | null;
  /** Localized corrected-shade note, shown BEFORE Apply, or null. */
  previewNote: string | null;
  onSelectPreset: (id: string) => void;
  onCustomHexChange: (hex: string) => void;
  onApplyCustom: () => void;
  onCancelCustom: () => void;
  onReset: () => void;
}

export default function ThemePicker({
  swatches,
  selectedId,
  customHex,
  customError,
  preview,
  previewNote,
  onSelectPreset,
  onCustomHexChange,
  onApplyCustom,
  onCancelCustom,
  onReset,
}: ThemePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Preset swatch grid: name labels under every swatch — never colour alone. */}
      <div className="grid grid-cols-3 gap-3" role="group" aria-label={t('settings.accentTheme')}>
        {swatches.map((swatch) => {
          const selected = selectedId === swatch.id;
          return (
            <button
              key={swatch.id}
              type="button"
              aria-label={swatch.name}
              aria-pressed={selected}
              onClick={() => onSelectPreset(swatch.id)}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform group-active:scale-95 ${
                  selected ? 'ring-2 ring-offset-2 ring-accent ring-offset-bg-card' : 'ring-1 ring-border'
                }`}
                style={{ backgroundColor: swatch.swatch }}
              >
                {selected && (
                  <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow">
                    <Check className="w-4 h-4 text-black" />
                  </span>
                )}
              </span>
              <span className={`text-2xs font-bold ${selected ? 'text-text-primary' : 'text-text-muted'}`}>
                {swatch.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom accent: hex input + preview panel (current mode only). */}
      <div className="space-y-2 pt-1 border-t border-border/60">
        <p className="text-xs font-bold text-text-primary pt-3">{t('settings.customAccent')}</p>
        <p className="text-2xs text-text-muted leading-relaxed">{t('settings.customAccentHint')}</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customHex}
            onChange={(e) => onCustomHexChange(e.target.value)}
            placeholder="#2563EB"
            aria-label={t('settings.customAccent')}
            className="flex-1 min-w-0 rounded-xl border border-border bg-bg-secondary px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="button"
            onClick={onApplyCustom}
            disabled={!preview}
            className="px-4 py-2.5 rounded-xl bg-accent text-accent-on text-xs font-bold disabled:opacity-50 cursor-pointer"
          >
            {t('settings.applyTheme')}
          </button>
          <button
            type="button"
            onClick={onCancelCustom}
            className="px-3 py-2.5 rounded-xl bg-bg-secondary border border-border text-xs font-bold text-text-secondary cursor-pointer"
          >
            {t('settings.cancelTheme')}
          </button>
        </div>
        {customError && <p className="text-2xs font-bold text-danger">{customError}</p>}
        {preview && (
          <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="px-4 py-2.5 rounded-xl text-xs font-bold"
                style={{ backgroundColor: preview.accent, color: preview.on }}
              >
                {t('settings.previewPrimary')}
              </span>
              <span
                className="px-4 py-2.5 rounded-xl text-xs font-bold border-2"
                style={{ borderColor: preview.accent, color: preview.text }}
              >
                {t('settings.previewSecondary')}
              </span>
              <span
                className="px-3 py-1.5 rounded-full text-2xs font-bold"
                style={{ backgroundColor: preview.subtle, color: preview.text }}
              >
                {t('settings.previewSelected')}
              </span>
              <button
                type="button"
                aria-label={t('settings.previewFocus')}
                className="px-3 py-1.5 rounded-xl text-2xs font-bold bg-bg-card border border-border focus:outline-none"
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${preview.accent}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                {t('settings.previewFocus')}
              </button>
            </div>
            <p className="text-sm" style={{ color: preview.text }}>
              {t('settings.previewText')}
            </p>
            {previewNote && <p className="text-2xs font-bold text-text-secondary">{previewNote}</p>}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="text-xs font-semibold text-accent-text hover:underline cursor-pointer"
      >
        {t('settings.resetTheme')}
      </button>
    </div>
  );
}
