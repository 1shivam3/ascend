'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';

export type TabId = 'home' | 'workout' | 'progress' | 'meals' | 'prs';
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

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [progressInitialTab, setProgressInitialTab] = useState<ProgressTabId>('overview');
  const [historyStack, setHistoryStack] = useState<TabId[]>(['home']);
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

  // Run back handlers from highest priority to lowest
  const runBackHandlers = useCallback((): boolean => {
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

      if (options?.progressTab) {
        setProgressInitialTab(options.progressTab);
      } else if (tab === 'prs') {
        setProgressInitialTab('prs');
      }

      const currentTab = activeTabRef.current;
      const currentStack = historyStackRef.current;

      // Avoid redundant navigations to exact same tab unless progressTab was specified
      if (targetTab === currentTab && !options?.progressTab && tab !== 'prs') {
        return;
      }

      if (options?.clearHistory) {
        setHistoryStack([targetTab]);
        if (typeof window !== 'undefined') {
          try {
            window.history.replaceState({ tab: targetTab, stackDepth: 1 }, '');
          } catch {}
        }
        setActiveTab(targetTab);
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          if (options?.replace) {
            window.history.replaceState({ tab: targetTab, stackDepth: currentStack.length }, '');
          } else {
            window.history.pushState({ tab: targetTab, stackDepth: currentStack.length + 1 }, '');
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
        // Trigger browser back which triggers popstate handler
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
      // Second press within 2000ms: allow exit
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

    try {
      window.history.replaceState({ tab: 'home', root: true, stackDepth: 0 }, '');
      window.history.pushState({ tab: 'home', root: true, stackDepth: 1 }, '');
    } catch {}

    const handlePopState = (event: PopStateEvent) => {
      if (isHandlingPopStateRef.current) return;
      isHandlingPopStateRef.current = true;

      try {
        // 1. Check if an active modal / sheet / subview consumes the back action
        if (runBackHandlers()) {
          // Re-push current state to compensate for the browser pop
          try {
            window.history.pushState(
              { tab: activeTabRef.current, stackDepth: historyStackRef.current.length },
              ''
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
          return;
        }

        // 3. Stack length is 1: If not on home, go to home
        if (activeTabRef.current !== 'home') {
          setHistoryStack(['home']);
          setActiveTab('home');
          try {
            window.history.pushState({ tab: 'home', root: true, stackDepth: 1 }, '');
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
            window.history.pushState({ tab: 'home', root: true, stackDepth: 1 }, '');
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
