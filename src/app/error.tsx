'use client';

import React, { useEffect } from 'react';
import { redactSecrets } from '@/lib/server-security';
import ErrorState from '@/components/ErrorState';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Screen 25 — Global Error Boundary
 * Conforms to reference Screen 25 specification while maintaining fail-safe production error recovery.
 */
export default function GlobalErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log redacted error safely to console without leaking user credentials or tokens
    const safeMsg = redactSecrets(error?.message || 'Unknown runtime error');
    console.error('[ASCEND Production Recovery]', safeMsg, error?.digest ? `(digest: ${error.digest})` : '');
  }, [error]);

  const handleReturnHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <ErrorState
      error={error}
      reset={() => reset()}
      onHome={handleReturnHome}
    />
  );
}
