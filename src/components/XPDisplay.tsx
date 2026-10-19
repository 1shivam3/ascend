'use client';

import { useStore } from '@/lib/store';
import { calculateLevel, xpToNextLevel } from '@/lib/xp-system';
import { Zap } from 'lucide-react';

/**
 * XP Level Display — shows current level and progress to next level.
 * Subtle, premium, non-intrusive. Placed in the home header.
 */
export default function XPDisplay() {
  const totalXP = useStore((state) => state.totalXP);

  const level = calculateLevel(totalXP);
  const { current, needed, progress } = xpToNextLevel(totalXP);

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
        <Zap className="w-4.5 h-4.5 text-white" fill="currentColor" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-black text-text-primary tracking-tight">
            Level {level}
          </span>
          <span className="text-3xs font-mono text-text-muted tabular-nums">
            {current}/{needed} XP
          </span>
        </div>
        <div className="h-1.5 mt-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
