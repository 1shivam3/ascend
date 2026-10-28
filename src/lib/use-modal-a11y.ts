'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared modal accessibility system (QA4-003).
 *
 * Attach in every modal/sheet: given a container ref, an open flag and a
 * close handler it
 *  - remembers the element focused before the modal opened,
 *  - moves focus into the dialog on open (first focusable, else container),
 *  - traps Tab / Shift+Tab cycling inside the container,
 *  - closes on Escape (unless `closeOnEscape: false`),
 *  - restores focus to the remembered element on close / unmount.
 *
 * Spread the returned `dialogProps` onto the container element:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const { dialogProps } = useModalA11y(ref, isOpen, onClose);
 *   <div ref={ref} {...dialogProps} className="modal-overlay">…
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabIndex]:not([tabIndex="-1"])';

type FocusableLike = {
  focus: () => void;
  hasAttribute?: (name: string) => boolean;
};

type ContainerLike = {
  querySelectorAll: (selector: string) => ArrayLike<FocusableLike>;
  focus?: () => void;
  contains?: (el: unknown) => boolean;
};

/** Focusable descendants of `container`, in DOM order. Pure / testable. */
export function getFocusableElements(
  container: ContainerLike | null | undefined,
): FocusableLike[] {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
  const out: FocusableLike[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i] as FocusableLike & { disabled?: boolean };
    if (!el || typeof el.focus !== 'function') continue;
    if ((el as { disabled?: boolean }).disabled) continue;
    out.push(el);
  }
  return out;
}

export type ModalKeyEvent = {
  key: string;
  shiftKey?: boolean;
  preventDefault: () => void;
  stopPropagation?: () => void;
};

/**
 * Handle one keydown for a modal. Returns true when the event was consumed.
 * Pure logic (the hook wires it to the document) so it can be unit-tested
 * without a DOM renderer: pass the current active element explicitly, or
 * let it fall back to `document.activeElement` when available.
 */
export function handleModalKeyDown(
  event: ModalKeyEvent,
  container: ContainerLike | null | undefined,
  onClose: () => void,
  options?: { closeOnEscape?: boolean; activeElement?: unknown },
): boolean {
  if (event.key === 'Escape') {
    if (options?.closeOnEscape === false) return false;
    event.preventDefault();
    event.stopPropagation?.();
    onClose();
    return true;
  }
  if (event.key !== 'Tab' || !container) return false;

  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    event.preventDefault();
    container.focus?.();
    return true;
  }

  const active =
    options && 'activeElement' in options
      ? options.activeElement
      : typeof document !== 'undefined'
        ? document.activeElement
        : null;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const activeIndex = focusables.indexOf(active as FocusableLike);

  if (event.shiftKey) {
    // Shift+Tab on the first element, on the container itself, or from
    // outside wraps to the last.
    if (active === (container as unknown) && activeIndex === -1) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (active === first || activeIndex === -1) {
      // Only intercept when focus is on the first element, or has escaped
      // the container entirely; otherwise let the browser move normally
      // unless focus is outside — then pulling it back is the trap's job.
      if (active === first || (container.contains && active && !container.contains(active))) {
        event.preventDefault();
        last.focus();
        return true;
      }
      if (activeIndex === -1 && !container.contains) {
        event.preventDefault();
        last.focus();
        return true;
      }
    }
    return false;
  }

  // Tab on the last element (or from outside) wraps to the first.
  if (active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  if (activeIndex === -1) {
    // Focus is outside the dialog (or on the container itself, which is
    // not in the focusable list) — pull the first Tab into the dialog,
    // but only when we know focus is not already on a focusable inside.
    // The container itself has tabIndex=-1, so Tab from it should go to
    // the first focusable naturally; intercepting here is still correct.
    if (container.contains && active && !container.contains(active)) {
      event.preventDefault();
      first.focus();
      return true;
    }
  }
  return false;
}

export interface UseModalA11yOptions {
  closeOnEscape?: boolean;
  /** Explicit accessible name; wins over any derived heading id. */
  label?: string;
  /** Explicit aria-labelledby id; wins over any derived heading id. */
  labelledBy?: string;
}

type HeadingLike = {
  id?: string;
  textContent?: string | null;
};

type HeadingContainerLike = {
  querySelector?: (selector: string) => HeadingLike | null;
};

let dialogTitleIdCounter = 0;

/**
 * Gauntlet A11Y-02: derive a dialog's accessible name from its first
 * heading. Most dialogs in this codebase render an h2 (some an h3)
 * title but never wired aria-labelledby, so ~30 dialogs were unnamed
 * for assistive tech. Pure / testable: given a container, return the
 * id to use for aria-labelledby — the heading's existing id, or a
 * generated `modal-title-N` id assigned to it (idempotent on repeat
 * calls). Returns null when there is no non-empty heading: such
 * dialogs stay unnamed and need an explicit `label`/`labelledBy`
 * option instead. The heuristic assumes the first heading is the
 * dialog title, which holds wherever titles precede section content.
 */
export function resolveDialogLabelledBy(
  container: HeadingContainerLike | null | undefined,
): string | null {
  if (!container || typeof container.querySelector !== 'function') return null;
  const heading = container.querySelector('h1, h2, h3');
  if (!heading || !heading.textContent?.trim()) return null;
  if (heading.id) return heading.id;
  dialogTitleIdCounter += 1;
  heading.id = `modal-title-${dialogTitleIdCounter}`;
  return heading.id;
}

/**
 * Stack of currently-open modals. Only the topmost modal handles
 * Tab/Escape: several modals in this app nest (e.g. the exercise
 * selector opens over the plan/log modals, child modals render as
 * siblings of their parent overlay), and without a stack every open
 * trap would answer the same keydown — Escape would close the whole
 * stack at once and parent traps would pull Tab focus out of a child
 * dialog sitting outside the parent's container element.
 */
const modalStack: object[] = [];

export function useModalA11y<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  isOpen: boolean,
  onClose: () => void,
  options?: UseModalA11yOptions,
) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const closeOnEscape = options?.closeOnEscape;
  // Gauntlet A11Y-02: heading-derived accessible name, applied
  // imperatively on open (see below). No useState: the hook's tests
  // mock React with useRef/useEffect only, and the name is a DOM
  // attribute, not render output — the effect is the right place.

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;

    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    // Gauntlet A11Y-02: track the imperatively-set name so cleanup can
    // remove exactly what this open added (never an explicit prop).
    let autoLabelledBy: string | null = null;

    const container = containerRef.current as unknown as
      | (T & ContainerLike)
      | null;
    if (container) {
      // Gauntlet A11Y-02: name the dialog from its first heading.
      // Imperative, not via dialogProps: the id is only known after
      // mount, and React props cannot carry it on the first render.
      // Explicit options (below) take precedence and need no help.
      // setAttribute is guarded for non-DOM test containers.
      if (!options?.label && !options?.labelledBy) {
        autoLabelledBy = resolveDialogLabelledBy(
          container as unknown as HeadingContainerLike,
        );
        const settable = container as unknown as {
          setAttribute?: (name: string, value: string) => void;
        };
        if (autoLabelledBy && typeof settable.setAttribute === 'function') {
          settable.setAttribute('aria-labelledby', autoLabelledBy);
        }
      }
      // If an element inside the dialog already has focus (e.g. an
      // `autoFocus` search/input field), leave it there — it is
      // already inside the trap.
      const active = document.activeElement as HTMLElement | null;
      const alreadyInside =
        active && active !== document.body && container.contains?.(active);
      if (!alreadyInside) {
        const focusables = getFocusableElements(container);
        const target = (focusables[0] as unknown as HTMLElement) ?? container;
        if (target && typeof target.focus === 'function') {
          target.focus();
        }
      }
    }

    const stackEntry = {};
    modalStack.push(stackEntry);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== stackEntry) return;
      handleModalKeyDown(
        e,
        containerRef.current as unknown as ContainerLike | null,
        () => onCloseRef.current(),
        { closeOnEscape },
      );
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      const idx = modalStack.indexOf(stackEntry);
      if (idx !== -1) modalStack.splice(idx, 1);
      document.removeEventListener('keydown', handleKeyDown, true);
      // Gauntlet A11Y-02: remove only the name this open set, from the
      // same container this effect opened (never re-read the ref).
      if (autoLabelledBy) {
        const settable = container as unknown as {
          removeAttribute?: (name: string) => void;
        } | null;
        if (typeof settable?.removeAttribute === 'function') {
          settable.removeAttribute('aria-labelledby');
        }
      }
      const prev = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (prev && typeof prev.focus === 'function') {
        // Only restore if the element is still in the document.
        try {
          if (!document.contains || document.contains(prev)) prev.focus();
        } catch {
          /* element detached — nothing to restore to */
        }
      }
    };
    // containerRef is stable; closeOnEscape is a primitive option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, closeOnEscape]);

  // Gauntlet A11Y-02: explicit label / labelledBy ride in dialogProps.
  // The heading-derived name is applied imperatively in the effect
  // (it is only known after mount). Dialogs with no heading and no
  // explicit option stay unnamed (documented residual, not faked).
  return {
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true as const,
      tabIndex: -1,
      ...(options?.label ? { 'aria-label': options.label } : {}),
      ...(options?.label || !options?.labelledBy
        ? {}
        : { 'aria-labelledby': options.labelledBy }),
    },
  };
}

export default useModalA11y;
