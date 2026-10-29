'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

/**
 * Re-audit UX-R5: the root layout hardcodes <html lang="en">, and only
 * the SPA root (src/app/page.tsx) corrects it after hydration — the
 * standalone legal routes (/privacy, /terms, /disclaimer,
 * /delete-account) never ran that effect, so for a Hindi-preference
 * user they kept lang="en" after hydration too. This component applies
 * the same correction, scoped to the legal pages that mount it: it
 * sets document lang from the stored locale on mount, re-applies when
 * zustand-persist finishes hydrating (the stored preference may land
 * after first paint), and follows live language changes via a store
 * subscription. The root layout's static lang and all other routes are
 * untouched. It renders nothing and has no user-visible strings.
 */
export default function LegalLangSync() {
  useEffect(() => {
    const apply = () => {
      document.documentElement.lang =
        useStore.getState().uiPreferences?.language === 'hi' ? 'hi' : 'en';
    };
    apply();
    const unsubFinish = useStore.persist.onFinishHydration(apply);
    const unsubStore = useStore.subscribe(apply);
    return () => {
      unsubFinish();
      unsubStore();
    };
  }, []);

  return null;
}
