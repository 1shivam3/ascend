'use client';

/**
 * AiNoticeBanner — Task 1.2 first-use AI disclosure.
 *
 * Renders the per-feature notice (lib/ai-notices.ts) until the user
 * dismisses it once; the dismissal is stored locally and the banner
 * never returns for that feature. Purely informational: it renders
 * inline above the feature and never gates or delays it, online or
 * offline.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  aiNoticeMessageKey,
  hasSeenAiNotice,
  markAiNoticeSeen,
  type AiFeature,
} from '@/lib/ai-notices';

export default function AiNoticeBanner({ feature }: { feature: AiFeature }) {
  const { t } = useTranslation();
  // Start hidden and reveal after mount if unseen — localStorage is
  // client-only, and this avoids any SSR/hydration mismatch.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasSeenAiNotice(feature));
  }, [feature]);

  if (!visible) return null;

  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-accent/10 border border-accent/30 text-xs text-text-secondary leading-relaxed">
      <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
      <p className="flex-1">{t(aiNoticeMessageKey(feature))}</p>
      <button
        type="button"
        onClick={() => {
          markAiNoticeSeen(feature);
          setVisible(false);
        }}
        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-bg-secondary border border-border text-2xs font-bold text-text-primary cursor-pointer"
      >
        <X className="w-3 h-3" />
        {t('aiNotice.dismiss')}
      </button>
    </div>
  );
}
