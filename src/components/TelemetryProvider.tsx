'use client';

import React, { useState, useEffect } from 'react';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import {
  getTelemetryConsent,
  getGaMeasurementId,
  getClarityProjectId,
  getSentryLoaderUrl,
  TelemetryConsent,
  TELEMETRY_CONSENT_EVENT,
} from '@/lib/telemetry';
import TelemetryConsentBanner from './TelemetryConsentBanner';

export default function TelemetryProvider() {
  const [consent, setConsent] = useState<TelemetryConsent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setConsent(getTelemetryConsent());

    const handleConsentChange = (e: any) => {
      setConsent(e?.detail?.consent ?? getTelemetryConsent());
    };

    window.addEventListener(TELEMETRY_CONSENT_EVENT, handleConsentChange);
    return () => window.removeEventListener(TELEMETRY_CONSENT_EVENT, handleConsentChange);
  }, []);

  if (!mounted) return null;

  const isAccepted = consent === 'accepted';
  const gaId = getGaMeasurementId();
  const clarityId = getClarityProjectId();
  const sentryUrl = getSentryLoaderUrl();

  return (
    <>
      {/* ── Google Analytics 4 (Only activated upon verified consent) ──── */}
      {isAccepted && gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('consent', 'default', {
                'analytics_storage': 'granted',
                'ad_storage': 'denied'
              });
              gtag('config', '${gaId}', {
                page_path: window.location.pathname,
                anonymize_ip: true,
                send_page_view: true
              });
            `}
          </Script>
        </>
      )}

      {/* ── Microsoft Clarity (Only activated upon verified consent) ──── */}
      {isAccepted && clarityId && (
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${clarityId}");
          `}
        </Script>
      )}

      {/* ── Sentry Error Monitoring (Only activated upon verified consent) */}
      {isAccepted && sentryUrl && (
        <Script
          src={sentryUrl}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      )}

      {/* ── Vercel Analytics (Only activated upon verified consent) ──── */}
      {/* Same consent gate as GA/Sentry: ASCEND's privacy promise is that
          NO telemetry of any kind loads before the user opts in. Vercel
          Analytics is cookieless, but it stays behind the banner so the
          promise has no exceptions. Requires Web Analytics to be enabled
          in the Vercel project dashboard, otherwise it is a silent no-op. */}
      {isAccepted && <Analytics />}

      {/* Consent Gating UI Banner */}
      <TelemetryConsentBanner />
    </>
  );
}
