'use client';

import { useEffect, useState } from 'react';
import { getLocalTodayStr } from './formatters';

/**
 * useToday — the current local date string (YYYY-MM-DD) that stays
 * correct while the app stays OPEN.
 *
 * Several screens memo'd `today` once at mount, so an app left open
 * overnight (very common: gym app opened at 23:00, workout logged after
 * midnight, PWA resumed next morning) kept treating yesterday as today
 * — streaks, today's workout, and habit grids all froze. This hook
 * recomputes at the next local midnight and whenever the tab becomes
 * visible / regains focus.
 */
export function useToday(): string {
  const [today, setToday] = useState<string>(() => getLocalTodayStr());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      setToday((prev) => {
        const next = getLocalTodayStr();
        return next === prev ? prev : next;
      });
      schedule();
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 5, 0); // 5s past midnight, local
      timer = setTimeout(refresh, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    };

    schedule();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return today;
}
