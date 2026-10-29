/**
 * Shared keyboard support for role="tab" groups (gauntlet A11Y-09).
 *
 * The tab-pattern segmented controls (Train Plans/Coach/History,
 * Progress views, Fuel Today/Meals/Macros) used role="tab" +
 * aria-selected but had no arrow-key handling, so keyboard users had
 * to Tab through every tab. Per the ARIA tabs pattern: Left/Right
 * (and Up/Down) move between tabs with wrap-around, Home/End jump to
 * the ends, focus follows selection, and selection activates
 * immediately (these groups switch views in place, like the existing
 * PolicyDecisionLedger handler this generalizes).
 *
 * Usage: put onKeyDown={tabListKeyDown(select)} on the tablist
 * container, where select receives the activated tab's index.
 */
import type React from 'react';

export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export function tabListKeyDown(selectIndex: (index: number) => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    );
    if (tabs.length === 0) return;
    const activeEl = (e.target as HTMLElement).closest?.(
      '[role="tab"]',
    ) as HTMLElement | null;
    const current = activeEl ? tabs.indexOf(activeEl) : -1;
    if (current === -1) return;
    const next = nextTabIndex(e.key, current, tabs.length);
    if (next === null) return;
    e.preventDefault();
    selectIndex(next);
    tabs[next]?.focus();
  };
}
