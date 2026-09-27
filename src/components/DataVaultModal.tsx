'use client';

import React, { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import {
  X,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Shield,
  Trash2,
  HardDrive,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

interface DataVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DataVaultModal({ isOpen, onClose }: DataVaultModalProps) {
  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs);
  const workouts = useStore((state) => state.workouts);
  const meals = useStore((state) => state.meals);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const prTargets = useStore((state) => state.prTargets);
  const theme = useStore((state) => state.theme);
  const importAllData = useStore((state) => state.importAllData);
  const clearAllData = useStore((state) => state.clearAllData);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const generateBackupPayload = () => {
    return {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      profile,
      prs,
      workouts,
      meals,
      bodyMetrics,
      prTargets,
      theme,
      hasCompletedOnboarding: true,
    };
  };

  // 1-Tap Data Export
  const handleExportBackup = (): boolean => {
    try {
      const backupData = generateBackupPayload();
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

      // Save an emergency snapshot in localStorage in case user re-installs or clears main store
      if (typeof window !== 'undefined') {
        localStorage.setItem('ascend_emergency_snapshot', JSON.stringify(backupData));
      }

      setMessage({
        text: `Exported ${prs.length} PRs, ${workouts.length} workouts & metrics successfully!`,
        type: 'success',
      });
      setTimeout(() => setMessage(null), 4000);
      return true;
    } catch {
      setMessage({ text: 'Failed to export backup.', type: 'error' });
      return false;
    }
  };

  // 1-Tap Data Restore from file
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
            text: 'Data restored successfully! All lifts, workouts & metrics updated.',
            type: 'success',
          });
        } else {
          setMessage({ text: 'Invalid backup file structure.', type: 'error' });
        }
      } catch {
        setMessage({ text: 'Could not parse backup JSON file.', type: 'error' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setMessage(null), 5000);
      }
    };
    reader.readAsText(file);
  };

  // Download backup then delete
  const handleDeleteWithBackup = () => {
    handleExportBackup();
    setTimeout(() => {
      clearAllData();
      setShowDeleteConfirm(false);
      onClose();
    }, 500);
  };

  // Delete without backup
  const handleDeleteWithoutBackup = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ascend_emergency_snapshot');
    }
    clearAllData();
    setShowDeleteConfirm(false);
    onClose();
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
              <h2 className="font-bold text-base text-text-primary leading-tight">Data Vault & Backup</h2>
              <p className="text-2xs text-text-muted font-mono">100% Offline Local Storage</p>
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

        {/* Delete Confirmation Safeguard Sheet */}
        {showDeleteConfirm ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3 animate-fade-in">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h4 className="font-bold text-sm">Safeguard Your Progress Before Deleting</h4>
            </div>
            <p className="text-2xs text-text-secondary leading-relaxed font-mono">
              Deleting app data will clear your profile, PRs, workouts, and body metrics. Download your local backup file now so you can restore your data whenever you reinstall!
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleDeleteWithBackup}
                className="w-full py-2.5 px-3 rounded-lg bg-accent text-bg-primary font-bold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Download Backup &amp; Delete Data</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteWithoutBackup}
                className="w-full py-2 px-3 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Without Backup</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Backup & Restore Controls */}
            <div className="space-y-2">
              <span className="text-2xs font-mono uppercase text-text-muted font-bold block">
                LOCAL DATA BACKUP &amp; RESTORE
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-center transition-all active:scale-[0.98]"
                >
                  <Download className="w-5 h-5 text-accent" />
                  <span className="text-xs font-semibold text-text-primary">Download Backup</span>
                  <span className="text-[10px] text-text-muted font-mono">Save .JSON File</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-center transition-all active:scale-[0.98]"
                >
                  <Upload className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-semibold text-text-primary">Restore Backup</span>
                  <span className="text-[10px] text-text-muted font-mono">Upload .JSON File</span>
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
                {prs.length} PRs • {workouts.length} Workouts • {bodyMetrics.length} Body Weight logs
              </p>
            </div>

            {/* Privacy Guarantee */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-secondary/40 border border-border/40 text-2xs text-text-muted font-mono">
              <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Your data stays 100% on your device. Backups are saved directly to your phone files.</span>
            </div>

            {/* Reset / Delete Danger Area */}
            <div className="pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 px-3 rounded-lg border border-rose-500/30 text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete WebApp Data &amp; Reset</span>
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full text-center font-semibold text-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}
