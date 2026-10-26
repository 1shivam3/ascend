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
            // renders, client interactivity dies). This repo has no
            // middleware and no nonce plumbing, so the correct follow-up
            // is a middleware nonce mechanism (Next 14.2 supports
            // nonces via middleware request headers), NOT deleting this
            // token. style-src 'unsafe-inline' stays for the same class
            // of reason (styled-jsx/Tailwind runtime styles).
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
