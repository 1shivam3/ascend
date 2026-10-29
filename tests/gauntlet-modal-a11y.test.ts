import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveDialogLabelledBy } from '../src/lib/use-modal-a11y';

/**
 * Gauntlet A11Y-02 regression: dialogs rendered an unnamed role=dialog
 * (useModalA11y returned role + aria-modal but no accessible name).
 * The hook now derives aria-labelledby from the dialog's first heading
 * (imperatively on open — the id is only known after mount — plus
 * explicit label/labelledBy options in dialogProps).
 * Helper tests cover the derivation; the wiring test below covers the
 * hook applying it to the container and removing it on cleanup.
 */

const mockState = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>,
}));

vi.mock('react', () => ({
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (fn: () => unknown) => {
    mockState.effects.push(fn);
  },
}));

import { useModalA11y } from '../src/lib/use-modal-a11y';
const heading = (id: string | undefined, text: string | null) => {
  const h: { id?: string; textContent?: string | null } = { textContent: text };
  if (id !== undefined) h.id = id;
  return h;
};

const containerWith = (h: ReturnType<typeof heading> | null) => ({
  querySelector: (_sel: string) => h,
});

describe('gauntlet A11Y-02: resolveDialogLabelledBy', () => {
  it('returns the heading\'s existing id unchanged', () => {
    const h = heading('feedback-title', 'Feedback');
    expect(resolveDialogLabelledBy(containerWith(h))).toBe('feedback-title');
    expect(h.id).toBe('feedback-title');
  });

  it('assigns a generated id when the heading has none, idempotently', () => {
    const h = heading(undefined, 'Log workout');
    const first = resolveDialogLabelledBy(containerWith(h));
    expect(first).toMatch(/^modal-title-\d+$/);
    expect(h.id).toBe(first);
    expect(resolveDialogLabelledBy(containerWith(h))).toBe(first);
  });

  it('two untitled headings get distinct ids', () => {
    const a = heading(undefined, 'First dialog');
    const b = heading(undefined, 'Second dialog');
    const idA = resolveDialogLabelledBy(containerWith(a));
    const idB = resolveDialogLabelledBy(containerWith(b));
    expect(idA).not.toBe(idB);
  });

  it('returns null with no heading, an empty heading, or no container', () => {
    expect(resolveDialogLabelledBy(containerWith(null))).toBeNull();
    expect(resolveDialogLabelledBy(containerWith(heading(undefined, '   ')))).toBeNull();
    expect(resolveDialogLabelledBy(containerWith(heading(undefined, null)))).toBeNull();
    expect(resolveDialogLabelledBy(null)).toBeNull();
    expect(resolveDialogLabelledBy({} as never)).toBeNull();
  });
});

describe('gauntlet A11Y-02: hook applies the derived name', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockState.effects.length = 0;
  });

  it('sets aria-labelledby on open and removes it on cleanup', () => {
    const headingEl: { id?: string; textContent: string | null } = {
      textContent: 'Log workout',
    };
    const setAttrs: Array<[string, string]> = [];
    const removedAttrs: string[] = [];
    const container = {
      querySelectorAll: () => [],
      querySelector: () => headingEl,
      contains: () => false,
      focus: () => {},
      setAttribute: (name: string, value: string) => {
        setAttrs.push([name, value]);
      },
      removeAttribute: (name: string) => {
        removedAttrs.push(name);
      },
    };
    vi.stubGlobal('document', {
      activeElement: null,
      body: {},
      contains: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const ref = { current: container };
    const { dialogProps } = useModalA11y(ref as never, true, () => {});
    expect(dialogProps.role).toBe('dialog');
    // The open effect is the second captured effect (first: onClose ref).
    const cleanup = mockState.effects[1]() as unknown as (() => void) | void;
    expect(setAttrs).toHaveLength(1);
    expect(setAttrs[0][0]).toBe('aria-labelledby');
    expect(setAttrs[0][1]).toBe(headingEl.id);
    expect(setAttrs[0][1]).toMatch(/^modal-title-\d+$/);
    if (typeof cleanup === 'function') cleanup();
    expect(removedAttrs).toEqual(['aria-labelledby']);
  });

  it('explicit label/labelledBy options skip the derived name', () => {
    const headingEl: { id?: string; textContent: string | null } = {
      textContent: 'Titled dialog',
    };
    const setAttrs: Array<[string, string]> = [];
    const container = {
      querySelectorAll: () => [],
      querySelector: () => headingEl,
      contains: () => false,
      focus: () => {},
      setAttribute: (name: string, value: string) => {
        setAttrs.push([name, value]);
      },
      removeAttribute: () => {},
    };
    vi.stubGlobal('document', {
      activeElement: null,
      body: {},
      contains: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const { dialogProps } = useModalA11y({ current: container } as never, true, () => {}, {
      labelledBy: 'explicit-title',
    });
    mockState.effects[1]();
    expect(setAttrs).toHaveLength(0);
    expect(dialogProps['aria-labelledby']).toBe('explicit-title');
    expect(headingEl.id).toBeUndefined();
  });
});
