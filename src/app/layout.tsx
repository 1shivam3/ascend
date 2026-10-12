import type { Metadata, Viewport } from 'next';
import { Inter, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { ToastProvider } from '@/components/ui/Toast';
import { NavigationProvider } from '@/lib/navigation';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: {
    default: 'ASCEND | Evidence-Based Training & Nutrition System',
    template: '%s | ASCEND',
  },
  description:
    'Scientific workout logging, autoregulation (RPE/RIR), progressive overload, calibrated macro tracking, and 100% offline privacy for every gym-goer.',
  keywords: [
    'gym tracker',
    'workout log',
    'hypertrophy tracker',
    'progressive overload',
    'RPE RIR autoregulation',
    'macro tracker',
    'powerlifting tracker',
    'strength standards',
    '1RM calculator',
    'DOTS calculator',
    'offline fitness webapp',
    'PWA fitness app',
  ],
  authors: [{ name: 'Shivam Kumar' }],
  creator: 'Shivam Kumar',
  publisher: 'ASCEND Strength Systems',
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://ascend-alpha.vercel.app',
    siteName: 'ASCEND',
    title: 'ASCEND | Evidence-Based Training & Nutrition System',
    description:
      'Scientific workout logging, autoregulation (RPE/RIR), progressive overload, calibrated macro tracking, and 100% offline privacy for every gym-goer.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ASCEND | Evidence-Based Training & Nutrition System',
    description:
      'Scientific workout logging, autoregulation (RPE/RIR), progressive overload, and macro tracking with 100% offline privacy.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ASCEND',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  verification: {
    google: 'DOQWeBS380XVv0mtya1LH8zKaVyjKrSuR_hE6bTVw9M',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
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
                var stored = localStorage.getItem('ascend_store');
                var theme = null;
                var hasCustom = false;
                if (stored) {
                  var parsed = JSON.parse(stored);
                  var s = parsed.state || parsed;
                  if (s && s.hasCustomTheme) {
                    theme = s.theme;
                    hasCustom = true;
                  }
                }
                if (!hasCustom && window.matchMedia) {
                  theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                if (theme === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                } else if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                }
              } catch (e) {}

              if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(err) {
                    console.warn('[PWA] ServiceWorker registration notice:', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${barlowCondensed.variable} ${inter.className} font-sans`}>
        {/* Google Analytics 4 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-DV7VT2H5LP"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-DV7VT2H5LP', {
              page_path: window.location.pathname,
            });
          `}
        </Script>

        {/* Microsoft Clarity Session Replay */}
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "ywdt5rqnzv");
          `}
        </Script>

        {/* Sentry Crash & Error Tracking */}
        <Script
          src="https://js.sentry-cdn.com/5943361d29069b1cc12e20ca7d6e2f90.min.js"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />

        <ToastProvider>
          <NavigationProvider>{children}</NavigationProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
