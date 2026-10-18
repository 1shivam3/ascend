import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';

// Initialize global window and localStorage for node environment before importing components
if (typeof (global as any).window === 'undefined') {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k in store) delete store[k];
    },
  };

  (global as any).window = {
    location: {
      href: 'http://localhost/',
      pathname: '/',
      search: '',
      hash: '',
    },
    navigator: {
      onLine: true,
    },
    localStorage: mockLocalStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  (global as any).localStorage = mockLocalStorage;
}

import ErrorState from '@/components/ErrorState';
import LoadingState from '@/components/LoadingState';
import OfflineState from '@/components/OfflineState';
import { ToastProvider } from '@/components/ui/Toast';
import { redactSecrets } from '@/lib/server-security';

// Helper to render components wrapped in ToastProvider
function renderWithToast(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(ToastProvider, null, ui)
  );
}

describe('Screen 25 — Error State (ErrorState.tsx)', () => {
  it('renders standard error state with locked design tokens and default copy', () => {
    const html = renderWithToast(
      React.createElement(ErrorState, {
        reset: () => {},
      })
    );

    expect(html).toContain('Something went wrong');
    expect(html).toContain('An unexpected error occurred while loading this view');
    expect(html).toContain('Retry');
    expect(html).toContain('Return to Dashboard');
    expect(html).toContain('Clear temporary cache &amp; force restart');
  });

  it('renders custom title and error message when supplied', () => {
    const html = renderWithToast(
      React.createElement(ErrorState, {
        title: 'Workout Sync Interrupted',
        message: 'Could not reach server endpoint. Your local sets are safe.',
      })
    );

    expect(html).toContain('Workout Sync Interrupted');
    expect(html).toContain('Could not reach server endpoint. Your local sets are safe.');
  });

  it('sanitizes technical error diagnostics using redactSecrets', () => {
    const rawSensitiveError = new Error(
      'Database connection failed at postgres://user:secretpassword123@db.supabase.co with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
    );

    const html = renderWithToast(
      React.createElement(ErrorState, {
        error: rawSensitiveError,
      })
    );

    // Should not leak raw credentials
    expect(html).not.toContain('secretpassword123');
    expect(html).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    // Should contain technical diagnostics disclosure toggle
    expect(html).toContain('Technical Diagnostics');
  });

  it('supports inline non-fullscreen rendering for embedded tab error boundaries', () => {
    const html = renderWithToast(
      React.createElement(ErrorState, {
        fullScreen: false,
      })
    );

    expect(html).not.toContain('min-h-[100dvh]');
    expect(html).toContain('Something went wrong');
  });
});

describe('Screen 26 — Loading State (LoadingState.tsx)', () => {
  it('renders centered animated loading presentation with locked palette', () => {
    const html = renderToStaticMarkup(React.createElement(LoadingState));

    expect(html).toContain('Loading...');
    expect(html).toContain('Please wait while we load your data.');
    expect(html).toContain('animate-spin');
    expect(html).toContain('bg-sage');
  });

  it('renders custom label and description when supplied', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingState, {
        label: 'Preparing Barbell Session',
        description: 'Calculating warm-up plates and 1RM thresholds...',
      })
    );

    expect(html).toContain('Preparing Barbell Session');
    expect(html).toContain('Calculating warm-up plates and 1RM thresholds...');
  });

  it('supports inline rendering for dynamic route fallback', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingState, {
        fullScreen: false,
        label: 'Loading analytics &amp; PRs...',
      })
    );

    expect(html).not.toContain('min-h-[100dvh]');
    expect(html).toContain('Loading analytics');
  });
});

describe('Screen 27 — Offline State (OfflineState.tsx)', () => {
  it('renders offline gym mode presentation with assurance checklist', () => {
    const html = renderWithToast(
      React.createElement(OfflineState, {
        onContinueOffline: () => {},
      })
    );

    expect(html).toContain('You&#x27;re Offline');
    expect(html).toContain('Offline Gym Mode Active');
    expect(html).toContain('Local Logging Active');
    expect(html).toContain('Full Gym Engine');
    expect(html).toContain('Automatic Cloud Sync');
    expect(html).toContain('Check Connection');
    expect(html).toContain('Continue in Gym Mode');
  });

  it('supports embedded modal rendering without full-page wrap', () => {
    const html = renderWithToast(
      React.createElement(OfflineState, {
        fullScreen: false,
      })
    );

    expect(html).not.toContain('min-h-[100dvh]');
    expect(html).toContain('Offline Gym Mode Active');
  });
});

describe('System Boundaries & Integration Integrity', () => {
  it('verifies src/app/error.tsx exists and retains production-readiness security tokens', () => {
    const errorFilePath = path.join(process.cwd(), 'src', 'app', 'error.tsx');
    expect(fs.existsSync(errorFilePath)).toBe(true);

    const content = fs.readFileSync(errorFilePath, 'utf-8');
    expect(content).toContain('GlobalErrorBoundary');
    expect(content).toContain('redactSecrets');
    expect(content).toContain('reset()');
    expect(content).toContain("window.location.href = '/'");
    expect(content).toContain('ErrorState');
  });

  it('verifies src/app/loading.tsx exists and renders LoadingState', () => {
    const loadingFilePath = path.join(process.cwd(), 'src', 'app', 'loading.tsx');
    expect(fs.existsSync(loadingFilePath)).toBe(true);

    const content = fs.readFileSync(loadingFilePath, 'utf-8');
    expect(content).toContain('LoadingState');
  });

  it('verifies src/app/page.tsx integrates ErrorState, LoadingState, and OfflineState', () => {
    const pageFilePath = path.join(process.cwd(), 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pageFilePath, 'utf-8');

    expect(content).toContain("import LoadingState from '@/components/LoadingState'");
    expect(content).toContain("import ErrorState from '@/components/ErrorState'");
    expect(content).toContain("import OfflineState from '@/components/OfflineState'");
    expect(content).toContain("forcedState === 'error'");
    expect(content).toContain("forcedState === 'loading'");
    expect(content).toContain("forcedState === 'offline'");
    expect(content).toContain('showOfflineModal');
  });
});
