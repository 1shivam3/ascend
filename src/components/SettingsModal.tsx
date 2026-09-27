'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import {
  X,
  Download,
  Upload,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Shield,
  Trash2,
  Share2,
  RefreshCw,
  HardDrive
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs);
  const workouts = useStore((state) => state.workouts);
  const meals = useStore((state) => state.meals);
  const prTargets = useStore((state) => state.prTargets);
  const theme = useStore((state) => state.theme);
  const importAllData = useStore((state) => state.importAllData);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if running in standalone PWA mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isPWA =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(isPWA);

      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    }
  }, []);

  if (!isOpen) return null;

  // 1-Tap Data Export
  const handleExportBackup = () => {
    try {
      const backupData = {
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        profile,
        prs,
        workouts,
        meals,
        prTargets,
        theme,
        hasCompletedOnboarding: true,
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `ascend_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage({
        text: `Exported ${prs.length} PRs and ${workouts.length} workouts successfully!`,
        type: 'success',
      });
      setTimeout(() => setMessage(null), 4000);
    } catch {
      setMessage({ text: 'Failed to export backup.', type: 'error' });
    }
  };

  // 1-Tap Data Restore
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        const success = importAllData(parsed);
        if (success) {
          setMessage({
            text: 'Data restored successfully! All lifts, workouts & targets updated.',
            type: 'success',
          });
        } else {
          setMessage({ text: 'Invalid backup file structure.', type: 'error' });
        }
      } catch {
        setMessage({ text: 'Could not read backup JSON file.', type: 'error' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setMessage(null), 5000);
      }
    };
    reader.readAsText(file);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsStandalone(true);
      }
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-4 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-text-primary leading-tight">Settings & Data</h2>
              <p className="text-2xs text-text-muted font-mono">ASCEND v2.0 Local Vault</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-3 rounded-xl flex items-center gap-2 text-xs font-mono animate-fade-in ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* PWA Mobile App Card */}
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-border/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-mono font-bold uppercase text-text-muted flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-accent" />
              SMARTPHONE APP STATUS
            </span>
            {isStandalone ? (
              <span className="px-2 py-0.5 rounded text-2xs font-mono bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
                INSTALLED (PWA)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-2xs font-mono bg-accent/15 text-accent font-semibold border border-accent/30">
                BROWSER MODE
              </span>
            )}
          </div>

          {isStandalone ? (
            <p className="text-2xs text-text-secondary leading-relaxed">
              ASCEND is operating in standalone mobile app mode. You have full offline access and fast local loading.
            </p>
          ) : (
            <div className="space-y-2 text-2xs text-text-secondary">
              <p className="leading-relaxed">
                Install ASCEND on your smartphone to get a full-screen, native app experience with zero browser address bars:
              </p>
              <div className="p-2.5 rounded-lg bg-bg-card border border-border/60 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-start gap-1.5">
                  <span className="text-accent font-bold">iOS:</span>
                  <span>Tap Safari Share icon <Share2 className="w-3 h-3 inline text-accent" /> $\rightarrow$ Select <strong>&quot;Add to Home Screen&quot;</strong></span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-accent font-bold">Android:</span>
                  <span>Tap Chrome menu <strong className="text-text-primary">⋮</strong> $\rightarrow$ Select <strong>&quot;Install App&quot;</strong></span>
                </div>
              </div>

              {deferredPrompt && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Install ASCEND on Device</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 1-Tap Data Backup & Restore */}
        <div className="space-y-2">
          <span className="text-2xs font-mono uppercase text-text-muted font-bold block">
            LOCAL DATA BACKUP & RESTORE
          </span>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-center transition-all active:scale-[0.98]"
            >
              <Download className="w-5 h-5 text-accent" />
              <span className="text-xs font-semibold text-text-primary">Export Backup</span>
              <span className="text-[10px] text-text-muted font-mono">Download JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-center transition-all active:scale-[0.98]"
            >
              <Upload className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-semibold text-text-primary">Restore Backup</span>
              <span className="text-[10px] text-text-muted font-mono">Upload JSON</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          <p className="text-2xs text-text-muted text-center pt-1 font-mono">
            {prs.length} PRs • {workouts.length} Workouts • {meals.length} Meals recorded locally
          </p>
        </div>

        {/* Security & Privacy Notice */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-secondary/40 border border-border/40 text-2xs text-text-muted font-mono">
          <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span>Your fitness data is stored 100% locally on your device for absolute privacy.</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full text-center font-semibold text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
