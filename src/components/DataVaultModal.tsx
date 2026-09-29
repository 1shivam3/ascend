'use client';

import React, { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
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
  FolderOpen,
  Key
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
  const macroGoals = useStore((state) => state.macroGoals);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts || []);
  const favoriteFoods = useStore((state) => state.favoriteFoods || []);
  const theme = useStore((state) => state.theme);
  const customGeminiKey = useStore((state) => state.customGeminiKey);
  const setCustomGeminiKey = useStore((state) => state.setCustomGeminiKey);
  const importAllData = useStore((state) => state.importAllData);
  const clearAllData = useStore((state) => state.clearAllData);

  const toast = useToast();

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFileAccessPrompt, setShowFileAccessPrompt] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(customGeminiKey || '');
  const [keySaved, setKeySaved] = useState(false);
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
      macroGoals,
      plannedWorkouts,
      favoriteFoods,
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

      toast.success(
        `Exported ${prs.length} PRs, ${workouts.length} workouts & body logs.`,
        'Backup Downloaded'
      );
      setMessage({
        text: `Exported ${prs.length} PRs, ${workouts.length} workouts & metrics successfully!`,
        type: 'success',
      });
      setTimeout(() => setMessage(null), 4000);
      return true;
    } catch {
      toast.error('Failed to generate or download backup file.', 'Export Error');
      setMessage({ text: 'Failed to export backup.', type: 'error' });
      return false;
    }
  };

  // Initiate file selection with explicit access request
  const handleRequestFileAccess = () => {
    setShowFileAccessPrompt(true);
  };

  const handleConfirmFileAccess = () => {
    setShowFileAccessPrompt(false);
    fileInputRef.current?.click();
  };

  // 1-Tap Data Restore from file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (< 20MB)
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size exceeds the 20MB limit for local backups.', 'File Too Large');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        const success = importAllData(parsed);
        if (success) {
          toast.success(
            'All personal records, workouts & body metrics restored successfully!',
            'Data Restored'
          );
          setMessage({
            text: 'Data restored successfully! All lifts, workouts & metrics updated.',
            type: 'success',
          });
        } else {
          toast.error(
            'The selected JSON file does not match the ASCEND backup structure.',
            'Invalid Structure'
          );
          setMessage({ text: 'Invalid backup file structure.', type: 'error' });
        }
      } catch {
        toast.error('Could not read or parse the JSON backup file.', 'Parse Failure');
        setMessage({ text: 'Could not parse backup JSON file.', type: 'error' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setMessage(null), 5000);
      }
    };
    reader.onerror = () => {
      toast.error('Device file access was denied or interrupted.', 'Access Denied');
    };
    reader.readAsText(file);
  };

  // Download backup then delete
  const handleDeleteWithBackup = () => {
    handleExportBackup();
    setTimeout(() => {
      clearAllData();
      setShowDeleteConfirm(false);
      toast.info('App reset complete. Your backup JSON was saved to your device.', 'Data Cleared');
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
    toast.error('All local records were purged from this device.', 'App Reset');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-4 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-text-primary leading-tight">Data Vault &amp; Backup</h2>
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

        {/* File Access Permission Prompt */}
        {showFileAccessPrompt ? (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 space-y-3 animate-fade-in font-mono">
            <div className="flex items-center gap-2 text-accent">
              <FolderOpen className="w-5 h-5 flex-shrink-0" />
              <h4 className="font-bold text-xs uppercase tracking-wider">
                Allow Device File Access
              </h4>
            </div>
            <p className="text-2xs text-text-secondary leading-relaxed">
              ASCEND requests access to select and read your <strong className="text-text-primary">.json backup file</strong> from your device storage.
            </p>
            <p className="text-[11px] text-text-muted bg-bg-secondary/70 p-2 rounded border border-border/60">
              🔒 <strong>Privacy Notice:</strong> Your backup file is parsed entirely client-side inside your browser and is NEVER transmitted over the internet.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmFileAccess}
                className="btn-primary flex-1 py-2 text-xs font-bold"
              >
                Allow &amp; Choose File
              </button>
              <button
                type="button"
                onClick={() => setShowFileAccessPrompt(false)}
                className="btn-secondary py-2 px-3 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : showDeleteConfirm ? (
          /* Delete Confirmation Safeguard Sheet */
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
                className="w-full py-2.5 px-3 rounded-lg bg-accent text-bg-primary font-bold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all shadow-sm font-mono"
              >
                <Download className="w-4 h-4" />
                <span>Download Backup &amp; Delete Data</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteWithoutBackup}
                className="w-full py-2 px-3 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all font-mono"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Without Backup</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors text-center font-mono"
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
                  onClick={handleRequestFileAccess}
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

            {/* Google Gemini AI Configuration */}
            <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-accent" />
                  <span className="text-2xs font-mono uppercase font-bold text-text-primary">
                    Google Gemini AI Key (Optional)
                  </span>
                </div>
                {customGeminiKey ? (
                  <span className="text-3xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-semibold">
                    Custom Key Active
                  </span>
                ) : (
                  <span className="text-3xs px-2 py-0.5 rounded-full bg-bg-elevated text-text-muted">
                    Default Cloud / Offline
                  </span>
                )}
              </div>

              <p className="text-2xs text-text-secondary leading-relaxed">
                ASCEND works completely offline with deterministic heuristics. When online, provide your own Gemini API key to use your personal quota.
              </p>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy... (leave blank for default)"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-bg-primary text-text-primary text-xs focus:outline-none focus:border-accent font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomGeminiKey(apiKeyInput);
                    setKeySaved(true);
                    toast.success(
                      apiKeyInput.trim() ? 'Personal Gemini key saved!' : 'Switched to default server AI.',
                      'AI Settings'
                    );
                    setTimeout(() => setKeySaved(false), 2000);
                  }}
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold"
                >
                  {keySaved ? 'Saved!' : 'Save'}
                </button>
              </div>
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
