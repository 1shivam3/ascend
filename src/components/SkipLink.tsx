'use client';

import { useTranslation } from '@/lib/i18n';

/**
 * Skip-to-content link (re-audit UX-R4). The root layout is a server
 * component whose hardcoded English label bypassed i18n; the link now
 * lives in this tiny client component so its label follows the app
 * language like every other surface. Markup and classes are unchanged
 * from the inline version it replaces.
 */
export default function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-on focus:font-bold focus:rounded-lg focus:shadow-lg focus:outline-none"
    >
      {t('app.skipToContent')}
    </a>
  );
}
