'use client';

import { useTranslation } from '@/lib/i18n';
import type { Language } from '@/lib/i18n/en';

const OPTIONS: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
];

/**
 * English / हिंदी segmented picker. Writes straight to the persisted
 * uiPreferences.language, so the whole app re-renders in the chosen
 * language the moment a chip is tapped. Used in Settings and on the
 * onboarding welcome screen (first screen, skippable — English is the
 * default and nothing forces a choice).
 *
 * variant 'theme' follows the app theme tokens (Settings); variant
 * 'light' matches the onboarding screens' fixed light palette.
 */
export default function LanguagePicker({
  variant = 'theme',
}: {
  variant?: 'theme' | 'light';
}) {
  const { language, setLanguage } = useTranslation();

  const container =
    variant === 'light'
      ? 'grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-stone-200'
      : 'grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border';
  const activeCls =
    variant === 'light'
      ? 'bg-stone-900 text-white shadow-xs'
      : 'bg-bg-card text-text-primary shadow-xs border border-border';
  const idleCls =
    variant === 'light'
      ? 'text-stone-500 hover:text-stone-900'
      : 'text-text-muted hover:text-text-primary';

  return (
    <div className={container} role="group" aria-label="Language / भाषा">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={language === opt.id}
          onClick={() => setLanguage(opt.id)}
          className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            language === opt.id ? activeCls : idleCls
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
