'use client';

import { useTranslation } from '@/lib/i18n';
import type { Language } from '@/lib/i18n/en';

/**
 * English / हिंदी segmented picker. Writes straight to the persisted
 * uiPreferences.language, so the whole app re-renders in the chosen
 * language the moment a chip is tapped. Used in Settings and on the
 * onboarding welcome screen (first screen, skippable — English is the
 * default and nothing forces a choice).
 *
 * variant 'theme' follows the app theme tokens (Settings); variant
 * 'light' matches the onboarding screens' fixed light palette.
 *
 * LIVE-P1-03: option labels come from i18n keys, so in Hindi mode the
 * picker itself localizes (English → अंग्रेज़ी) instead of leaking English.
 */
export default function LanguagePicker({
  variant = 'theme',
}: {
  variant?: 'theme' | 'light';
}) {
  const { t, language, setLanguage } = useTranslation();

  // LIVE-P1-03: labels via i18n (see module doc comment).
  const OPTIONS: { id: Language; label: string }[] = [
    { id: 'en', label: t('language.english') },
    { id: 'hi', label: t('language.hindi') },
  ];

  const container =
    variant === 'light'
      ? 'grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-[#E2DFD6]'
      : 'grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border';
  const activeCls =
    variant === 'light'
      ? 'bg-[#171916] text-white shadow-xs'
      : 'bg-bg-card text-text-primary shadow-xs border border-border';
  const idleCls =
    variant === 'light'
      ? 'text-[#5E615A] hover:text-[#171916]'
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
