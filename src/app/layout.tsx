import type { Metadata, Viewport } from 'next';
import { Inter, Barlow_Condensed } from 'next/font/google';
import './globals.css';
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
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <ToastProvider>
          <NavigationProvider>{children}</NavigationProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
