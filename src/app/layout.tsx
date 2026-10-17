import type { Metadata, Viewport } from 'next';
import { Inter, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { NavigationProvider } from '@/lib/navigation';
import TelemetryProvider from '@/components/TelemetryProvider';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'optional' });
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: 'ASCEND: Workout and Food Log',
    template: '%s | ASCEND',
  },
  description:
    'Log your workouts, see what to lift next, and track protein with Indian foods. Works offline. AI features need a connection.',
  keywords: [
    'gym tracker',
    'workout log',
    'training logbook',
    'progressive overload',
    'macro tracker',
    'indian foods protein',
    'strength standards',
    '1RM calculator',
    'offline fitness webapp',
    'PWA fitness app',
  ],
  authors: [{ name: 'Shivam Kumar' }],
  creator: 'Shivam Kumar',
  publisher: 'ASCEND',
  manifest: '/manifest.json',
  metadataBase: new URL('https://ascendtonext.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://ascendtonext.vercel.app',
    siteName: 'ASCEND',
    title: 'ASCEND: Workout and Food Log',
    description:
      'Log your workouts, see what to lift next, and track protein with Indian foods. Works offline. AI features need a connection.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ASCEND: Workout and Food Log',
    description:
      'Log your workouts, see what to lift next, and track protein with Indian foods. Works offline.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ASCEND',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  verification: {
    google: 'DOQWeBS380XVv0mtya1LH8zKaVyjKrSuR_hE6bTVw9M',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // Prevent gesture/pinch zoom on iOS WebKit
                if (typeof document !== 'undefined') {
                  document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
                  document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
                  document.addEventListener('gestureend', function(e) { e.preventDefault(); });
                }

                var theme = null;
                var hasCustom = false;
                var customFlag = localStorage.getItem('ascend_has_custom_theme');
                var standaloneTheme = localStorage.getItem('ascend_theme');
                if (customFlag === 'true' && (standaloneTheme === 'dark' || standaloneTheme === 'light')) {
                  theme = standaloneTheme;
                  hasCustom = true;
                } else if (customFlag === 'false') {
                  hasCustom = false;
                } else {
                  var stored = localStorage.getItem('ascend_store');
                  if (stored) {
                    var parsed = JSON.parse(stored);
                    var s = parsed.state || parsed;
                    if (s && s.hasCustomTheme) {
                      theme = s.theme;
                      hasCustom = true;
                    }
                  }
                }
                if (!hasCustom && window.matchMedia) {
                  theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                if (theme === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                  document.documentElement.setAttribute('data-theme', 'light');
                } else if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${barlowCondensed.variable} ${inter.className} font-sans`}>
        {/* Skip to main content for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-stone-950 focus:font-bold focus:rounded-lg focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>

        {/* Environment-driven & consent-gated telemetry */}
        <TelemetryProvider />

        <ToastProvider>
          <NavigationProvider>{children}</NavigationProvider>
        </ToastProvider>

        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
