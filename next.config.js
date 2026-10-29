/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Reporting-Endpoints',
          value: 'csp="/api/csp-report"',
        },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            // SECURITY REVIEW 2026-10-26 (P2-4, deviation — read before
            // "fixing"): script-src 'unsafe-inline' is KEPT on purpose.
            // The app's own theme script already lives in
            // public/theme-init.js and is loaded via next/script, so no
            // app-authored inline script remains — but Next 14 App Router
            // itself emits inline <script> flight-data payloads
            // (self.__next_f.push) on every page. Verified 2026-10-26 by
            // serving the production build and counting: the home page
            // carries 8 inline <script> tags, 7 of them framework flight
            // data. Dropping 'unsafe-inline' without a nonce mechanism
            // would block those payloads and break hydration (SSR HTML
            // renders, client interactivity dies).
            //
            // GAUNTLET SEC-16 UPDATE (2026-10-29): the middleware nonce
            // mechanism WAS built and live-tested — and it does not
            // work for this app. The pages are statically generated
            // (build output: / and /delete-account are ○ static), so
            // their HTML is prerendered at build time and Next never
            // tags the inline scripts with the per-request nonce:
            // served home page carried the nonce in the CSP header but
            // on 0 of its 8 inline scripts, which the browser would
            // have blocked. Nonce CSP only works with per-request
            // dynamic rendering. Removing 'unsafe-inline' therefore
            // still waits on an explicit decision to force dynamic
            // rendering app-wide (SSR cost on every page) — until
            // then this token stays, compensated by the SEC-17 sink
            // scan (no dangerouslySetInnerHTML/eval anywhere in src)
            // and the violation reporting wired below.
            "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.google-analytics.com https://www.clarity.ms https://*.clarity.ms https://js.sentry-cdn.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://*.supabase.co https://images.openfoodfacts.org https://*.openfoodfacts.org https://lh3.googleusercontent.com https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms",
            "font-src 'self' data:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://world.openfoodfacts.org https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://*.ingest.us.sentry.io https://*.ingest.sentry.io",
            "media-src 'self' blob:",
            "worker-src 'self' blob:",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
            // Gauntlet SEC-17 (short-term): violation reporting.
            'report-uri /api/csp-report',
            'report-to csp',
          ].join('; '),
        },
      ],
    },
    {
      source: '/delete-account',
      headers: [
        {
          key: 'Referrer-Policy',
          value: 'no-referrer',
        },
        {
          key: 'Cache-Control',
          value: 'no-store, no-cache, must-revalidate, private',
        },
      ],
    },
    {
      source: '/api/auth/delete-account',
      headers: [
        {
          key: 'Referrer-Policy',
          value: 'no-referrer',
        },
        {
          key: 'Cache-Control',
          value: 'no-store, no-cache, must-revalidate, private',
        },
      ],
    },
    {
      source: '/sw.js',
      headers: [
        {
          key: 'Cache-Control',
          value: 'no-cache, no-store, must-revalidate',
        },
        {
          key: 'Content-Type',
          value: 'application/javascript; charset=utf-8',
        },
        {
          key: 'Service-Worker-Allowed',
          value: '/',
        },
      ],
    },
    {
      source: '/manifest.json',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=3600',
        },
        {
          key: 'Content-Type',
          value: 'application/manifest+json; charset=utf-8',
        },
      ],
    },
  ],
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

module.exports = nextConfig;
