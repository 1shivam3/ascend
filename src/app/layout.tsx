import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'ASCEND | Elite Powerlifting & Strength Tracker',
    template: '%s | ASCEND',
  },
  description:
    'Calibrate your true strength levels, track 1RM personal records, compute official DOTS powerlifting scores, log workouts, and monitor bodyweight ratios with 100% offline privacy.',
  keywords: [
    'powerlifting tracker',
    'strength standards',
    '1RM calculator',
    'DOTS calculator',
    'workout log',
    'personal records',
    'bench press',
    'deadlift',
    'squat',
    'gym tracker',
    'offline fitness webapp',
    'PWA powerlifting',
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
    title: 'ASCEND | Elite Powerlifting & Strength Tracker',
    description:
      'Track PRs, evaluate pound-for-pound strength standards, calculate DOTS scores, and log workouts with full offline device privacy.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ASCEND | Elite Powerlifting & Strength Tracker',
    description:
      'Track PRs, evaluate strength levels, and log workouts with 100% offline privacy.',
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
      <body className={inter.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
