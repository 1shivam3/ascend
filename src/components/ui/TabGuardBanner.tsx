'use client';

import React, { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { getTabLeaderGuard } from '@/lib/tab-leader';
import { useTranslation } from '@/lib/i18n';

/**
 * QA4-010 — cross-tab guard banner.
 *
 * Renders ONLY in a follower tab (ASCEND is open in another tab and
 * this tab is not the leader). Non-blocking: the app stays fully
 * usable in memory, but this tab's persist writes + sync pushes are
 * suppressed so it cannot overwrite the other tab's data. "Use this
 * tab instead" takes over leadership (the other tab then becomes the
 * follower and shows this same banner).
 *
 * Single-tab use never renders anything.
 */
export default function TabGuardBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const guard = getTabLeaderGuard();
    if (!guard) return;
    const update = () => setShow(guard.shouldSuppressWrites());
    update();
    return guard.subscribe(update);
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[120] bg-amber-400 text-zinc-950 shadow-lg"
    >
      <div className="max-w-xl mx-auto flex items-center gap-2.5 px-3 py-2">
        <Copy className="w-4 h-4 shrink-0" />
        <p className="flex-1 text-2xs sm:text-xs font-semibold leading-snug">
          {t('tabGuard.message')}
        </p>
        <button
          type="button"
          onClick={() => getTabLeaderGuard()?.takeOver()}
          className="shrink-0 px-2.5 py-1.5 rounded-lg bg-zinc-950 text-amber-300 text-2xs sm:text-xs font-bold active:scale-95 transition-transform cursor-pointer"
        >
          {t('tabGuard.useThisTab')}
        </button>
      </div>
    </div>
  );
}
