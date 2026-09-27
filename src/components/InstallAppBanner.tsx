'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Share2, Check, ArrowRight } from 'lucide-react';

export default function InstallAppBanner() {
  const [isStandalone, setIsStandalone] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if already running as standalone PWA
      const isPWA =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(isPWA);

      // Check iOS
      const ua = window.navigator.userAgent.toLowerCase();
      const isApple = /iphone|ipad|ipod/.test(ua);
      setIsIOS(isApple);

      // Check session dismissal
      const dismissed = sessionStorage.getItem('ascend_install_dismissed');
      if (dismissed === 'true') {
        setIsDismissed(true);
      }

      // Capture beforeinstallprompt
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    }
  }, []);

  if (isStandalone || isDismissed) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsStandalone(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowInstructions(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('ascend_install_dismissed', 'true');
    }
  };

  return (
    <>
      {/* Top Banner / Popup */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-accent/20 via-accent/10 to-bg-secondary border border-accent/40 p-3 shadow-md animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent text-bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
              <Smartphone className="w-4 h-4 font-bold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-text-primary tracking-tight truncate">
                  Install ASCEND WebApp
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-accent/20 text-accent font-bold">
                  FAST
                </span>
              </div>
              <p className="text-2xs text-text-muted font-mono truncate">
                Full-screen mode & offline logging on your home screen
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-lg bg-accent text-bg-primary text-xs font-bold font-mono hover:brightness-110 active:scale-95 transition-all shadow-sm flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Instructional Modal for iOS or manual install */}
      {showInstructions && (
        <div className="modal-overlay" onClick={() => setShowInstructions(false)}>
          <div
            className="modal-content p-5 space-y-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-base text-text-primary">Install ASCEND</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary font-mono">
              {isIOS ? (
                <>
                  <p className="text-text-primary font-semibold">
                    To install on iPhone or iPad:
                  </p>
                  <ol className="space-y-2 list-decimal list-inside pl-1 text-[11px] leading-relaxed">
                    <li>
                      Tap the <strong className="text-accent">Share</strong> button in Safari (box with arrow pointing up <Share2 className="w-3 h-3 inline text-accent" />).
                    </li>
                    <li>
                      Scroll down and tap <strong className="text-accent">&quot;Add to Home Screen&quot;</strong>.
                    </li>
                    <li>
                      Tap <strong className="text-accent">&quot;Add&quot;</strong> in the top-right corner.
                    </li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="text-text-primary font-semibold">
                    To install on Android or Desktop:
                  </p>
                  <ol className="space-y-2 list-decimal list-inside pl-1 text-[11px] leading-relaxed">
                    <li>
                      Open your browser menu (the <strong className="text-accent">three dots ⋮</strong> in the top right).
                    </li>
                    <li>
                      Select <strong className="text-accent">&quot;Install App&quot;</strong> or <strong className="text-accent">&quot;Add to Home screen&quot;</strong>.
                    </li>
                    <li>Confirm installation to add ASCEND to your app launcher.</li>
                  </ol>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="btn-primary w-full py-2 text-xs font-bold"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
