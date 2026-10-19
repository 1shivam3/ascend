'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';

export type TabId = 'home' | 'workout' | 'progress' | 'meals' | 'prs' | 'profile' | 'settings';
export type ProgressTabId = 'overview' | 'strength' | 'prs' | 'bodyweight' | 'training';

export interface BackHandler {
  id: string;
  fn: () => boolean | void;
  priority: number;
}

export interface NavigationContextValue {
  activeTab: TabId;
  progressInitialTab: ProgressTabId;
  canGoBack: boolean;
  historyStack: TabId[];
  navigate: (
    tab: TabId,
    options?: {
      replace?: boolean;
      clearHistory?: boolean;
      progressTab?: ProgressTabId;
    }
  ) => void;
  goBack: () => void;
  registerBackHandler: (handler: () => boolean | void, priority?: number) => () => void;
  setProgressInitialTab: React.Dispatch<React.SetStateAction<ProgressTabId>>;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export function buildTabUrl(tab: TabId, progressTab?: ProgressTabId): string {
  if (typeof window === 'undefined') return '/';
  try {
    const url = new URL(window.location.href);
    if (tab === 'home') {
      url.searchParams.delete('tab');
      url.searchParams.delete('sub');
    } else if (tab === 'prs') {
      url.searchParams.set('tab', 'prs');
      url.searchParams.delete('sub');
    } else {
      url.searchParams.set('tab', tab);
      if (tab === 'progress' && progressTab && progressTab !== 'overview') {
        url.searchParams.set('sub', progressTab);
      } else {
        url.searchParams.delete('sub');
      }
    }
    return url.pathname + (url.search ? url.search : '') + url.hash;
  } catch {
    return tab === 'home' ? '/' : `/?tab=${tab}`;
  }
}

export /** True only for a genuine fresh navigation (typed URL, link, deep-link open) —
 *  NOT for reloads or back/forward restores, which should land on Home. */
function isFreshNavigation(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    return !nav || nav.type === 'navigate';
  } catch {
    return true;
  }
}

export function getInitialNavigationState(): { tab: TabId; progressTab: ProgressTabId } {
  if (typeof window === 'undefined') {
    return { tab: 'home', progressTab: 'overview' };
  }

  try {
    // URL deep-links (?tab=...) are honored only on a fresh navigation.
    // Reloads / restored sessions always land on Home.
    if (isFreshNavigation()) {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const subParam = params.get('sub') as ProgressTabId | null;

      // 'today' is a supported deep-link alias for the home (Today) view.
      const resolvedTab = (tabParam === 'today' ? 'home' : tabParam) as TabId | null;
      if (resolvedTab && ['home', 'workout', 'progress', 'meals', 'prs', 'profile', 'settings'].includes(resolvedTab)) {
        if (resolvedTab === 'prs') {
          return { tab: 'progress', progressTab: 'prs' };
        }
        return {
          tab: resolvedTab,
          progressTab: subParam && ['overview', 'strength', 'prs', 'bodyweight', 'training'].includes(subParam)
            ? subParam
            : 'overview',
        };
      }
    }

    // Fresh app launch / reload always starts on the home tab. The
    // last-visited tab is never restored from storage or the URL —
    // reopening the app always lands on Home.
  } catch {}

  return { tab: 'home', progressTab: 'overview' };
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>(() => getInitialNavigationState().tab);
  const [progressInitialTab, setProgressInitialTab] = useState<ProgressTabId>(() => getInitialNavigationState().progressTab);
  const [historyStack, setHistoryStack] = useState<TabId[]>(() => {
    const initial = getInitialNavigationState();
    const stack: TabId[] = initial.tab === 'home' ? ['home'] : ['home', initial.tab];
    return stack;
  });
  const handlersRef = useRef<Map<string, { fn: () => boolean | void; priority: number }>>(new Map());
  const lastBackPressRef = useRef<number>(0);
  const isHandlingPopStateRef = useRef<boolean>(false);

  // Keep refs in sync for event listeners
  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;

  const historyStackRef = useRef<TabId[]>(historyStack);
  historyStackRef.current = historyStack;

  // Register custom back handler (modals, sheets, sub-views)
  const registerBackHandler = useCallback((fn: () => boolean | void, priority = 10) => {
    const id = Math.random().toString(36).substring(2, 9);
    handlersRef.current.set(id, { fn, priority });
    return () => {
      handlersRef.current.delete(id);
    };
  }, []);

  // Re-entrancy guard: a back handler must never re-trigger the handler chain
  // (e.g. SettingsView/ProfileView register `handleBack` -> `goBack`, which
  // would infinitely recurse and collapse via try/catch into a raw
  // window.history.back(), escaping the app). While handlers are running,
  // nested goBack() calls skip the chain and use the default stack behavior.
  const isRunningHandlersRef = useRef(false);

  // Run back handlers from highest priority to lowest
  const runBackHandlers = useCallback((): boolean => {
    if (isRunningHandlersRef.current) return false;
    isRunningHandlersRef.current = true;
    try {
      const sorted = Array.from(handlersRef.current.values()).sort((a, b) => b.priority - a.priority);
      for (const item of sorted) {
        try {
          const handled = item.fn();
          if (handled !== false) {
            return true; // Caught and handled (e.g. modal dismissed)
          }
        } catch (err) {
          console.error('Error executing back handler:', err);
        }
      }
      return false;
    } finally {
      isRunningHandlersRef.current = false;
    }
  }, []);

  // Navigate between tabs
  const navigate = useCallback(
    (
      tab: TabId,
      options?: {
        replace?: boolean;
        clearHistory?: boolean;
        progressTab?: ProgressTabId;
      }
    ) => {
      const targetTab = tab === 'prs' ? 'progress' : tab;
      const targetProgressTab = options?.progressTab || (tab === 'prs' ? 'prs' : undefined);

      if (targetProgressTab) {
        setProgressInitialTab(targetProgressTab);
      }

      const currentTab = activeTabRef.current;
      const currentStack = historyStackRef.current;

      // Avoid redundant navigations to exact same tab unless progressTab was specified
      if (targetTab === currentTab && !targetProgressTab && tab !== 'prs') {
        return;
      }

      const targetUrl = buildTabUrl(targetTab, targetProgressTab);

      // Persist to localStorage so mid-session state is written (read on launch
      // is intentionally disabled — fresh launches always land on Home).
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('ascend_active_tab', targetTab);
          if (targetProgressTab) {
            localStorage.setItem('ascend_progress_subtab', targetProgressTab);
          } else if (targetTab !== 'progress') {
            localStorage.removeItem('ascend_progress_subtab');
          }
        } catch {}
      }

      if (options?.clearHistory) {
        setHistoryStack([targetTab]);
        if (typeof window !== 'undefined') {
          try {
            window.history.replaceState({ tab: targetTab, stackDepth: 1 }, '', targetUrl);
          } catch {}
        }
        setActiveTab(targetTab);
        return;
      }

      // If navigating to 'home', reset stack to root ['home']
      if (targetTab === 'home') {
        setHistoryStack(['home']);
        if (typeof window !== 'undefined') {
          try {
            window.history.pushState({ tab: 'home', stackDepth: 1 }, '', targetUrl);
          } catch {}
        }
        setActiveTab('home');
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          if (options?.replace) {
            window.history.replaceState({ tab: targetTab, stackDepth: currentStack.length }, '', targetUrl);
          } else {
            window.history.pushState({ tab: targetTab, stackDepth: currentStack.length + 1 }, '', targetUrl);
          }
        } catch {}
      }

      if (options?.replace) {
        setHistoryStack((prev) => {
          const next = [...prev];
          next[next.length - 1] = targetTab;
          return next;
        });
      } else {
        setHistoryStack((prev) => {
          // If the targetTab is already the previous item in the stack, trim to it
          const existingIndex = prev.lastIndexOf(targetTab);
          if (existingIndex !== -1 && existingIndex === prev.length - 2) {
            return prev.slice(0, existingIndex + 1);
          }
          const next = [...prev, targetTab];
          // Cap stack at 30 entries to prevent memory overflow
          return next.length > 30 ? next.slice(-30) : next;
        });
      }

      setActiveTab(targetTab);
    },
    []
  );

  // In-app Go Back action
  const goBack = useCallback(() => {
    // 1. Run custom registered handlers (modals, sub-views, drawers)
    if (runBackHandlers()) {
      return;
    }

    // 2. Check if there is prior history in stack
    const currentStack = historyStackRef.current;
    if (currentStack.length > 1) {
      if (typeof window !== 'undefined') {
        window.history.back();
      } else {
        const nextStack = [...currentStack];
        nextStack.pop();
        const prevTab = nextStack[nextStack.length - 1] || 'home';
        setHistoryStack(nextStack);
        setActiveTab(prevTab);
      }
      return;
    }

    // 3. If stack has only 1 entry but we are not on home, return to home
    if (activeTabRef.current !== 'home') {
      navigate('home');
      return;
    }

    // 4. On root home with no history: Double-back exit check
    const now = Date.now();
    if (now - lastBackPressRef.current < 2000) {
      if (typeof window !== 'undefined') {
        window.history.back();
      }
    } else {
      lastBackPressRef.current = now;
      toast.info('Press back again to exit', 'ASCEND');
    }
  }, [runBackHandlers, navigate, toast]);

  // Synchronize with browser popstate events (Android back button, gesture, browser back)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initial = getInitialNavigationState();
    const initialUrl = buildTabUrl(initial.tab, initial.progressTab);

    setActiveTab(initial.tab);
    setProgressInitialTab(initial.progressTab);
    const initialStack: TabId[] = initial.tab === 'home' ? ['home'] : ['home', initial.tab];
    setHistoryStack(initialStack);
    historyStackRef.current = initialStack;
    activeTabRef.current = initial.tab;

    try {
      window.history.replaceState(
        { tab: initial.tab, root: initial.tab === 'home', stackDepth: initialStack.length },
        '',
        initialUrl
      );
      localStorage.setItem('ascend_active_tab', initial.tab);
      if (initial.progressTab && initial.progressTab !== 'overview') {
        localStorage.setItem('ascend_progress_subtab', initial.progressTab);
      }
    } catch {}

    const handlePopState = (event: PopStateEvent) => {
      if (isHandlingPopStateRef.current) return;
      isHandlingPopStateRef.current = true;

      try {
        // 1. Check if an active modal / sheet / subview consumes the back action
        if (runBackHandlers()) {
          // Re-push current state to compensate for the browser pop
          try {
            const currentUrl = buildTabUrl(activeTabRef.current);
            window.history.pushState(
              { tab: activeTabRef.current, stackDepth: historyStackRef.current.length },
              '',
              currentUrl
            );
          } catch {}
          return;
        }

        // 2. Check navigation stack
        const currentStack = historyStackRef.current;
        if (currentStack.length > 1) {
          const nextStack = [...currentStack];
          nextStack.pop();
          const prevTab = nextStack[nextStack.length - 1] || 'home';
          setHistoryStack(nextStack);
          setActiveTab(prevTab);

          const prevUrl = buildTabUrl(prevTab);
          try {
            window.history.replaceState({ tab: prevTab, stackDepth: nextStack.length }, '', prevUrl);
            localStorage.setItem('ascend_active_tab', prevTab);
          } catch {}
          return;
        }

        // 3. Stack length is 1: If not on home, go to home
        if (activeTabRef.current !== 'home') {
          setHistoryStack(['home']);
          setActiveTab('home');
          const homeUrl = buildTabUrl('home');
          try {
            window.history.replaceState({ tab: 'home', root: true, stackDepth: 1 }, '', homeUrl);
            localStorage.setItem('ascend_active_tab', 'home');
          } catch {}
          return;
        }

        // 4. At root Home with no history: Double-back to exit prompt
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          // Second press within 2000ms: ALLOW OS / BROWSER EXIT
          // Do not re-push state, allowing exit naturally
        } else {
          // First press: Intercept and prompt user
          lastBackPressRef.current = now;
          toast.info('Press back again to exit', 'ASCEND');
          try {
            window.history.pushState({ tab: 'home', root: true, stackDepth: 1 }, '', buildTabUrl('home'));
          } catch {}
        }
      } finally {
        isHandlingPopStateRef.current = false;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [runBackHandlers, toast]);

  // "Exited the app" behavior: when the page returns from being backgrounded
  // for a while (app switcher / screen off), land on Home. Short hops away
  // (checking a message mid-workout) keep the current tab.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    let hiddenAt = 0;
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) {
        hiddenAt = 0;
        if (activeTabRef.current !== 'home') {
          navigate('home', { clearHistory: true });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [navigate]);

  const canGoBack = activeTab !== 'home' || historyStack.length > 1;

  const value: NavigationContextValue = {
    activeTab,
    progressInitialTab,
    canGoBack,
    historyStack,
    navigate,
    goBack,
    registerBackHandler,
    setProgressInitialTab,
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useAppNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useAppNavigation must be used within a NavigationProvider');
  }
  return ctx;
}
