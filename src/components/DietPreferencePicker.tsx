'use client';

import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { useTranslation, type StringKey } from '@/lib/i18n';
import type { DietPreference } from '@/lib/types';

/**
 * DietPreferencePicker — the diet preference control, shared by
 * Settings (§2 App Preferences) and the Fuel tab.
 *
 * UX discoverability: a food preference is a food decision, so it must
 * also live where the user thinks about food — not only in generic
 * Settings. Both surfaces write the same profile field, so they can
 * never disagree. The options, copy, and toast are identical to the
 * original Settings block this was extracted from.
 */
export default function DietPreferencePicker() {
  const profile = useStore((state) => state.profile);
  const setProfile = useStore((state) => state.setProfile);
  const toast = useToast();
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div>
        <span className="text-xs font-bold text-text-primary block">{t('settings.dietPreference')}</span>
        <span className="text-2xs text-text-muted block mt-0.5">
          {t('settings.dietHint')}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { id: 'vegetarian', labelKey: 'settings.dietVegetarian' },
            { id: 'eggitarian', labelKey: 'settings.dietEggetarian' },
            { id: 'non_vegetarian', labelKey: 'settings.dietNonVegetarian' },
            { id: 'vegan', labelKey: 'settings.dietVegan' },
          ] as { id: DietPreference; labelKey: StringKey }[]
        ).map((opt) => {
          const active = (profile?.dietPreference || 'non_vegetarian') === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                if (!profile) return;
                setProfile({ ...profile, dietPreference: opt.id });
                toast.success(t('settings.dietSetMsg', { label: t(opt.labelKey) }), t('settings.preferencesTitle'));
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-left ${
                active
                  ? 'border-accent bg-accent/10 text-accent-text'
                  : 'border-border bg-bg-secondary text-text-primary hover:border-text-muted'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
