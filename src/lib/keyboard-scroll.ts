'use client';

import { useEffect, type RefObject } from 'react';

/**
 * B2 (bug program Phase 1) — keep the focused field visible when the
 * on-screen keyboard opens.
 *
 * The scan modal's inputs stayed hidden behind the keyboard on the
 * owner's phone (2026-11-19 recordings) while the Daily Macro
 * Targets modal worked. Difference: the working modal is a single
 * scroll container; the scan modal nests scrollers (overlay scroll
 * + inner max-height panels), and the browser's built-in
 * scroll-into-view on focus does not reliably thread nested
 * scrollers once the keyboard shrinks the visual viewport.
 *
 * This hook listens for focus moving to any text field inside the
 * container and, once the keyboard-open resize settles, scrolls the
 * field to the centre of the visible area — scrollIntoView scrolls
 * EVERY scrollable ancestor, which is exactly what nested scrollers
 * need. A visualViewport resize listener re-centres the focused
 * field if the viewport changes again while it has focus (keyboard
 * opening in two steps, suggestion bar appearing, rotation).
 */
export function useKeyboardScrollIntoView(
  containerRef: RefObject<HTMLElement | null>,
  active = true
) {
  useEffect(() => {
    const root = containerRef.current;
    if (!active || !root || typeof window === 'undefined') return;

    let timers: number[] = [];
    let focused: HTMLElement | null = null;

    const center = () => {
      if (focused && root.contains(focused)) {
        focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };

    const schedule = () => {
      // Centre at several settle points: the keyboard resize lands
      // ~300ms after focus on Android, and a second pass catches
      // late layout changes (suggestion bar, two-step keyboards).
      // Re-centring an already-centred field is a no-op.
      timers.forEach((t) => window.clearTimeout(t));
      timers = [350, 900].map((ms) => window.setTimeout(center, ms));
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      ) {
        focused = el;
        schedule();
      }
    };
    const onFocusOut = () => {
      focused = null;
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };

    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', schedule);
      window.removeEventListener('resize', schedule);
      timers.forEach((t) => window.clearTimeout(t));
    };
    // `active` is a required dep: modal containers mount closed
    // (ref is null) and open later — without it the listeners would
    // never attach.
  }, [containerRef, active]);
}
