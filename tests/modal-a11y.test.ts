/**
 * QA4-003 — modal accessibility system tests.
 *
 * The repo has no jsdom/happy-dom installed (vitest runs in the `node`
 * environment; component tests elsewhere use renderToStaticMarkup), so
 * the hook is tested two ways:
 *  1. Its pure key/trap logic (`handleModalKeyDown`,
 *     `getFocusableElements`) against a minimal fake DOM.
 *  2. The hook itself, by mocking React's `useRef`/`useEffect` and a
 *     fake `document`, running the captured effect, and asserting the
 *     focus-move / trap / Escape / focus-restore behaviour end to end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mockState = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>,
}));

vi.mock('react', () => ({
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (fn: () => unknown) => {
    mockState.effects.push(fn);
  },
}));

import {
  useModalA11y,
  getFocusableElements,
  handleModalKeyDown,
  FOCUSABLE_SELECTOR,
} from '../src/lib/use-modal-a11y';

// ─── Fake DOM ────────────────────────────────────────────────────────────────

type FakeEl = {
  name: string;
  disabled?: boolean;
  focusCalls: number;
  focus: () => void;
};

let activeEl: unknown = null;

function fakeEl(name: string, disabled = false): FakeEl {
  const el: FakeEl = {
    name,
    disabled,
    focusCalls: 0,
    focus: () => {
      el.focusCalls += 1;
      activeEl = el;
    },
  };
  return el;
}

function fakeContainer(focusables: FakeEl[]) {
  const container = {
    name: 'container',
    focusCalls: 0,
    focus: () => {
      container.focusCalls += 1;
      activeEl = container;
    },
    querySelectorAll: (_selector: string) => focusables,
    contains: (el: unknown) =>
      el === container || (focusables as unknown[]).includes(el),
  };
  return container;
}

function keyEvent(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

// ─── Pure trap logic ─────────────────────────────────────────────────────────

describe('getFocusableElements', () => {
  it('returns focusable descendants in order and skips disabled ones', () => {
    const a = fakeEl('a');
    const b = fakeEl('b', true);
    const c = fakeEl('c');
    const container = fakeContainer([a, b, c]);
    expect(getFocusableElements(container as never)).toEqual([a, c]);
  });

  it('targets the standard focusable selector set', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('[tabIndex]');
  });

  it('returns [] for a null container', () => {
    expect(getFocusableElements(null)).toEqual([]);
  });
});

describe('handleModalKeyDown', () => {
  it('Escape calls onClose and consumes the event', () => {
    const onClose = vi.fn();
    const e = keyEvent('Escape');
    const handled = handleModalKeyDown(e, fakeContainer([]) as never, onClose);
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Escape is ignored when closeOnEscape is false', () => {
    const onClose = vi.fn();
    const handled = handleModalKeyDown(
      keyEvent('Escape'),
      fakeContainer([]) as never,
      onClose,
      { closeOnEscape: false },
    );
    expect(handled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tab on the last element wraps to the first', () => {
    const first = fakeEl('first');
    const last = fakeEl('last');
    const container = fakeContainer([first, last]);
    const e = keyEvent('Tab');
    const handled = handleModalKeyDown(e, container as never, vi.fn(), {
      activeElement: last,
    });
    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(first.focusCalls).toBe(1);
  });

  it('Shift+Tab on the first element wraps to the last', () => {
    const first = fakeEl('first');
    const last = fakeEl('last');
    const container = fakeContainer([first, last]);
    const e = keyEvent('Tab', true);
    const handled = handleModalKeyDown(e, container as never, vi.fn(), {
      activeElement: first,
    });
    expect(handled).toBe(true);
    expect(last.focusCalls).toBe(1);
  });

  it('Shift+Tab on the container itself wraps to the last element', () => {
    const first = fakeEl('first');
    const last = fakeEl('last');
    const container = fakeContainer([first, last]);
    const e = keyEvent('Tab', true);
    const handled = handleModalKeyDown(e, container as never, vi.fn(), {
      activeElement: container,
    });
    expect(handled).toBe(true);
    expect(last.focusCalls).toBe(1);
  });

  it('Tab in the middle is left to the browser (focus never escapes by itself)', () => {
    const first = fakeEl('first');
    const mid = fakeEl('mid');
    const last = fakeEl('last');
    const container = fakeContainer([first, mid, last]);
    const e = keyEvent('Tab');
    const handled = handleModalKeyDown(e, container as never, vi.fn(), {
      activeElement: mid,
    });
    expect(handled).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('Tab with no focusable elements focuses the container itself', () => {
    const container = fakeContainer([]);
    const e = keyEvent('Tab');
    const handled = handleModalKeyDown(e, container as never, vi.fn(), {
      activeElement: null,
    });
    expect(handled).toBe(true);
    expect(container.focusCalls).toBe(1);
  });

  it('Tab from outside the dialog pulls focus to the first element', () => {
    const first = fakeEl('first');
    const container = fakeContainer([first, fakeEl('last')]);
    const outside = fakeEl('outside');
    const e = keyEvent('Tab');
    const handled = handleModalKeyDown(e, container as never, vi.fn(), {
      activeElement: outside,
    });
    expect(handled).toBe(true);
    expect(first.focusCalls).toBe(1);
  });

  it('unrelated keys are not consumed', () => {
    const handled = handleModalKeyDown(
      keyEvent('Enter'),
      fakeContainer([fakeEl('a')]) as never,
      vi.fn(),
      { activeElement: null },
    );
    expect(handled).toBe(false);
  });
});

// ─── Hook behaviour (mocked React + fake document) ───────────────────────────

describe('useModalA11y hook', () => {
  let listeners: Map<string, (e: unknown) => void>;
  let trigger: FakeEl;
  let firstBtn: FakeEl;
  let lastBtn: FakeEl;
  let container: ReturnType<typeof fakeContainer>;

  beforeEach(() => {
    mockState.effects = [];
    listeners = new Map();
    trigger = fakeEl('trigger');
    firstBtn = fakeEl('first');
    lastBtn = fakeEl('last');
    container = fakeContainer([firstBtn, lastBtn]);
    activeEl = trigger;
    (globalThis as Record<string, unknown>).document = {
      activeElement: trigger,
      body: fakeEl('body'),
      addEventListener: (type: string, fn: (e: unknown) => void) =>
        listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
      contains: () => true,
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
  });

  function mount(isOpen: boolean, onClose = vi.fn()) {
    const ref = { current: container };
    const result = useModalA11y(ref as never, isOpen, onClose);
    // Run the captured effects in order: [onClose-ref sync, main effect].
    const cleanups = mockState.effects.map((fn) => fn());
    return { result, onClose, cleanup: cleanups[cleanups.length - 1] as () => void };
  }

  it('provides dialog props', () => {
    const { result } = mount(false);
    expect(result.dialogProps.role).toBe('dialog');
    expect(result.dialogProps['aria-modal']).toBe(true);
    expect(result.dialogProps.tabIndex).toBe(-1);
  });

  it('does nothing while closed', () => {
    mount(false);
    expect(firstBtn.focusCalls).toBe(0);
    expect(listeners.has('keydown')).toBe(false);
  });

  it('moves focus into the dialog on open (first focusable)', () => {
    mount(true);
    expect(firstBtn.focusCalls).toBe(1);
    expect(activeEl).toBe(firstBtn);
  });

  it('traps Tab: keydown on the last element cycles to the first', () => {
    mount(true);
    const handler = listeners.get('keydown')!;
    activeEl = lastBtn;
    // The hook's handler reads document.activeElement — keep it in sync.
    (globalThis as Record<string, unknown>).document = {
      ...(globalThis as Record<string, unknown>).document as object,
      activeElement: lastBtn,
    };
    handler(keyEvent('Tab'));
    expect(firstBtn.focusCalls).toBe(2); // initial move + wrap
  });

  it('traps Shift+Tab: keydown on the first element wraps to the last', () => {
    mount(true);
    const handler = listeners.get('keydown')!;
    (globalThis as Record<string, unknown>).document = {
      ...(globalThis as Record<string, unknown>).document as object,
      activeElement: firstBtn,
    };
    handler(keyEvent('Tab', true));
    expect(lastBtn.focusCalls).toBe(1);
  });

  it('Escape calls onClose', () => {
    const { onClose } = mount(true);
    listeners.get('keydown')!(keyEvent('Escape'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the trigger on close/unmount', () => {
    const { cleanup } = mount(true);
    expect(activeEl).toBe(firstBtn);
    cleanup();
    expect(trigger.focusCalls).toBe(1);
    expect(activeEl).toBe(trigger);
    expect(listeners.has('keydown')).toBe(false);
  });
});

// ─── Migration pin ───────────────────────────────────────────────────────────

const MIGRATED_FILES = [
  // Standalone modal/sheet components
  'src/components/AuthModal.tsx',
  'src/components/BarcodeScannerModal.tsx',
  'src/components/BodyMetricsModal.tsx',
  'src/components/ChallengesSheet.tsx',
  'src/components/ConfirmationModal.tsx',
  'src/components/ConstraintAdapterModal.tsx',
  'src/components/CreatineModal.tsx',
  'src/components/DataVaultModal.tsx',
  'src/components/EditProfileModal.tsx',
  'src/components/ExerciseLibraryModal.tsx',
  'src/components/ExerciseSelectorModal.tsx',
  'src/components/FeedbackModal.tsx',
  'src/components/GoalSelectorModal.tsx',
  'src/components/HydrationModal.tsx',
  'src/components/ImportProgramModal.tsx',
  'src/components/LevelSheet.tsx',
  'src/components/LogPastWorkoutModal.tsx',
  'src/components/MeetAttemptPlannerModal.tsx',
  'src/components/PlateCalculatorModal.tsx',
  'src/components/PostWorkoutTakeModal.tsx',
  'src/components/ReadinessSheet.tsx',
  'src/components/ReminderCenterModal.tsx',
  'src/components/ReportAIModal.tsx',
  'src/components/ScanMealModal.tsx',
  'src/components/ShareProgramModal.tsx',
  'src/components/SuggestedWorkoutModal.tsx',
  'src/components/VoiceWorkoutLoggerModal.tsx',
  'src/components/WeeklyRecapModal.tsx',
  'src/components/WeeklyScheduleModal.tsx',
  'src/components/onboarding/ForgotPasswordModal.tsx',
  // Inline dialogs inside page-level files
  'src/components/ActiveWorkoutScreen.tsx',
  'src/components/HomePage.tsx',
  'src/components/MealsPage.tsx',
  'src/components/PRsPage.tsx',
  'src/components/ProfileView.tsx',
  'src/components/ProgressPage.tsx',
  'src/components/PolicyDecisionCard.tsx',
  'src/components/WorkoutPage.tsx',
  'src/app/page.tsx',
];

describe('QA4-003 migration pin', () => {
  const root = path.resolve(__dirname, '..');

  it('every migrated modal file uses the shared hook', () => {
    for (const rel of MIGRATED_FILES) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src, rel).toContain('useModalA11y');
      expect(src, rel).toContain('use-modal-a11y');
    }
  });

  it('no file with a modal overlay is left outside the system', () => {
    const componentsDir = path.join(root, 'src/components');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name.endsWith('.tsx')) files.push(path.join(dir, entry.name));
      }
    };
    walk(componentsDir);
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return (
        (src.includes('modal-overlay') || src.includes('modal-overlay-centered')) &&
        !src.includes('useModalA11y')
      );
    });
    expect(offenders).toEqual([]);
  });

  it('globals.css carries an unlayered global :focus-visible rule using the accent token', () => {
    const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
    const idx = css.indexOf(':focus-visible {');
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeGreaterThan(css.indexOf('@tailwind utilities'));
    const rule = css.slice(idx, idx + 200);
    expect(rule).toContain('outline');
    expect(rule).toContain('var(--accent)');
    expect(rule).toContain('outline-offset');
  });

  it('the shared hook file implements trap, escape and restore', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/lib/use-modal-a11y.ts'),
      'utf8',
    );
    expect(src).toContain('Escape');
    expect(src).toContain('Tab');
    expect(src).toContain('previouslyFocused');
    expect(src).toContain('aria-modal');
  });
});
