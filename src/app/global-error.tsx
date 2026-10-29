'use client';

import React, { useEffect } from 'react';
import { redactSecrets } from '@/lib/server-security';
import ErrorState from '@/components/ErrorState';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root-layout error boundary (re-audit PERF-R3). Next requires
 * global-error to render its own <html>/<body>: it replaces the root
 * layout entirely when the layout itself fails — the one failure class
 * src/app/error.tsx cannot catch (previously that path fell through to
 * Next's unstyled framework error page with no ASCEND recovery actions).
 * Recovery behavior mirrors error.tsx.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log redacted error safely to console without leaking user credentials or tokens
    const safeMsg = redactSecrets(error?.message || 'Unknown runtime error');
    console.error('[ASCEND Production Recovery]', safeMsg, error?.digest ? `(digest: ${error.digest})` : '');
  }, [error]);

  const handleReturnHome = () => {
    if (typeof window !== 'undefined') {
      // Hard reload on purpose (same deliberate pattern as error.tsx,
      // whose instance of this warning is part of the accepted baseline):
      // the root layout itself failed, so client-side routing state
      // cannot be trusted to recover.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/';
    }
  };

  return (
    <html lang="en">
      <body>
        <ErrorState
          error={error}
          reset={() => reset()}
          onHome={handleReturnHome}
        />
      </body>
    </html>
  );
}
