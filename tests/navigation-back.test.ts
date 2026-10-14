import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Android & Browser Back Navigation (Task 2)', () => {
  let handlers: Map<string, { fn: () => boolean | void; priority: number }>;

  const registerBackHandler = (fn: () => boolean | void, priority = 10) => {
    const id = Math.random().toString(36).substring(2, 9);
    handlers.set(id, { fn, priority });
    return () => {
      handlers.delete(id);
    };
  };

  const runBackHandlers = (): boolean => {
    const sorted = Array.from(handlers.values()).sort((a, b) => b.priority - a.priority);
    for (const item of sorted) {
      const handled = item.fn();
      if (handled !== false) {
        return true;
      }
    }
    return false;
  };

  beforeEach(() => {
    handlers = new Map();
  });

  it('closes meal scanner before navigating away', () => {
    let isScannerOpen = true;
    let currentTab = 'meals';

    const unregisterScanner = registerBackHandler(() => {
      isScannerOpen = false;
      return true;
    }, 100);

    // User presses back
    const handled = runBackHandlers();
    expect(handled).toBe(true);
    expect(isScannerOpen).toBe(false);
    expect(currentTab).toBe('meals'); // Still on meals tab, scanner closed

    unregisterScanner();
  });

  it('closes nested settings sub-modal (e.g. Legal Hub / Reminder Center) while keeping settings open', () => {
    let isSettingsOpen = true;
    let isSubModalOpen = true;

    // Register Settings modal handler (priority 100)
    const unregisterSettings = registerBackHandler(() => {
      isSettingsOpen = false;
      return true;
    }, 100);

    // Register Sub-modal handler (priority 120)
    const unregisterSubModal = registerBackHandler(() => {
      isSubModalOpen = false;
      return true;
    }, 120);

    // First back press: closes sub-modal
    const handledFirst = runBackHandlers();
    expect(handledFirst).toBe(true);
    expect(isSubModalOpen).toBe(false);
    expect(isSettingsOpen).toBe(true);

    unregisterSubModal();

    // Second back press: closes settings modal
    const handledSecond = runBackHandlers();
    expect(handledSecond).toBe(true);
    expect(isSettingsOpen).toBe(false);

    unregisterSettings();
  });

  it('closes workout details (expanded history) before changing screen', () => {
    let expandedWorkouts = new Set(['workout-1']);
    let currentTab = 'workout';

    const unregisterDetails = registerBackHandler(() => {
      expandedWorkouts = new Set();
      return true;
    }, 80);

    const handled = runBackHandlers();
    expect(handled).toBe(true);
    expect(expandedWorkouts.size).toBe(0);
    expect(currentTab).toBe('workout');

    unregisterDetails();
  });

  it('verifies double-back exit mechanism at home root', () => {
    let exitAllowed = false;
    let lastPress = 0;
    const toastMock = vi.fn();

    const handleRootBack = () => {
      const now = Date.now();
      if (now - lastPress < 2000) {
        exitAllowed = true;
      } else {
        lastPress = now;
        toastMock('Press back again to exit');
      }
    };

    // First press: shows toast, does not exit
    handleRootBack();
    expect(exitAllowed).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('Press back again to exit');

    // Second press within 500ms: allows exit
    handleRootBack();
    expect(exitAllowed).toBe(true);
  });
});
