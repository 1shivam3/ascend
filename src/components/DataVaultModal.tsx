'use client';

import React, { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { parseWorkoutCSV } from '@/lib/workout-import';
import { buildFullBackup, getCustomBarcodes } from '@/lib/storage';
import { useTranslation } from '@/lib/i18n';
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
  FileSpreadsheet,
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
  const importAllData = useStore((state) => state.importAllData);
  const clearAllData = useStore((state) => state.clearAllData);
  const addWorkout = useStore((state) => state.addWorkout);
  const addPR = useStore((state) => state.addPR);

  const { t } = useTranslation();
  const toast = useToast();

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFileAccessPrompt, setShowFileAccessPrompt] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // ONE canonical backup builder (storage.ts) — this modal used to hand-
  // roll an 11-field payload under the same filename, silently dropping
  // the schedule, training profile, UI prefs, hydration/creatine logs,
  // custom barcodes and every progress photo.
  const generateBackupPayload = () => {
    const state = useStore.getState();
    return buildFullBackup(state as unknown as Record<string, any>, {
      customBarcodes: getCustomBarcodes(),
      progressPhotos: state.progressPhotos || [],
    });
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
        t('vault.exportedToast', { prs: prs.length, workouts: workouts.length }),
        t('vault.backupDownloaded')
      );
      setMessage({
        text: t('vault.exportedMsg', { prs: prs.length, workouts: workouts.length }),
        type: 'success',
      });
      setTimeout(() => setMessage(null), 4000);
      return true;
    } catch {
      toast.error(t('vault.exportFailToast'), t('vault.exportError'));
      setMessage({ text: t('vault.exportFailMsg'), type: 'error' });
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
      toast.error(t('vault.tooLargeMsg'), t('vault.tooLargeTitle'));
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
          toast.success(t('vault.restoredToast'), t('vault.dataRestored'));
          setMessage({ text: t('vault.restoredMsg'), type: 'success' });
        } else {
          toast.error(t('vault.invalidToast'), t('vault.invalidTitle'));
          setMessage({ text: t('vault.invalidMsg'), type: 'error' });
        }
      } catch {
        toast.error(t('vault.parseToast'), t('vault.parseTitle'));
        setMessage({ text: t('vault.parseMsg'), type: 'error' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setMessage(null), 5000);
      }
    };
    reader.onerror = () => {
      toast.error(t('vault.accessToast'), t('vault.accessTitle'));
    };
    reader.readAsText(file);
  };

  // CSV Workout History Import (Strong, Hevy, FitNotes, Generic)
  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseWorkoutCSV(text, { fallbackUnit: profile?.unit || 'kg' });

        result.workouts.forEach((w) => {
          addWorkout(w);
        });

        result.newPRs.forEach((pr) => {
          addPR(pr);
        });

        toast.success(
          t('vault.csvToast', { workouts: result.workoutsImported, prs: result.newPRsCount }),
          t('vault.historyImported')
        );
        setMessage({
          text: t('vault.csvMsg', { workouts: result.workoutsImported, sets: result.totalSets, prs: result.newPRsCount }),
          type: 'success',
        });
      } catch (err: any) {
        toast.error(err?.message || t('vault.csvParseFail'), t('vault.csvFailTitle'));
        setMessage({ text: err?.message || t('vault.csvInvalid'), type: 'error' });
      } finally {
        if (csvFileInputRef.current) csvFileInputRef.current.value = '';
        setTimeout(() => setMessage(null), 5000);
      }
    };
    reader.onerror = () => {
      toast.error(t('vault.readInterrupted'), t('vault.importError'));
    };
    reader.readAsText(file);
  };

  // Download backup then delete
  const handleDeleteWithBackup = () => {
    handleExportBackup();
    setTimeout(() => {
      clearAllData();
      setShowDeleteConfirm(false);
      toast.info(t('vault.resetToast'), t('vault.dataCleared'));
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
    toast.error(t('vault.purgedToast'), t('vault.appReset'));
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
              <h2 className="font-bold text-base text-text-primary leading-tight">{t('vault.title')}</h2>
              <p className="text-2xs text-text-muted font-mono">{t('vault.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            aria-label={t('vault.closeAria')}
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
                {t('vault.allowAccess')}
              </h4>
            </div>
            <p className="text-2xs text-text-secondary leading-relaxed">
              {t('vault.accessBody')}
            </p>
            <p className="text-[11px] text-text-muted bg-bg-secondary/70 p-2 rounded border border-border/60 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-accent shrink-0" />
              <span><strong>{t('vault.privacyNotice')}</strong> {t('vault.privacyBody')}</span>
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmFileAccess}
                className="btn-primary flex-1 py-2 text-xs font-bold"
              >
                {t('vault.allowChoose')}
              </button>
              <button
                type="button"
                onClick={() => setShowFileAccessPrompt(false)}
                className="btn-secondary py-2 px-3 text-xs"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : showDeleteConfirm ? (
          /* Delete Confirmation Safeguard Sheet */
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3 animate-fade-in">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h4 className="font-bold text-sm">{t('vault.safeguardTitle')}</h4>
            </div>
            <p className="text-2xs text-text-secondary leading-relaxed font-mono">
              {t('vault.safeguardBody')}
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleDeleteWithBackup}
                className="w-full py-2.5 px-3 rounded-lg bg-accent text-bg-primary font-bold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all shadow-sm font-mono"
              >
                <Download className="w-4 h-4" />
                <span>{t('vault.downloadDelete')}</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteWithoutBackup}
                className="w-full py-2 px-3 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all font-mono"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('vault.deleteNoBackup')}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors text-center font-mono"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Backup & Restore Controls */}
            <div className="space-y-2">
              <span className="text-2xs font-mono uppercase text-text-muted font-bold block">
                {t('vault.sectionBackup')}
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-center transition-all active:scale-[0.98]"
                >
                  <Download className="w-5 h-5 text-accent" />
                  <span className="text-xs font-semibold text-text-primary">{t('vault.downloadBackup')}</span>
                  <span className="text-[10px] text-text-muted font-mono">{t('vault.saveJson')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRequestFileAccess}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-bg-secondary hover:bg-bg-elevated border border-border text-center transition-all active:scale-[0.98]"
                >
                  <Upload className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-semibold text-text-primary">{t('vault.restoreBackup')}</span>
                  <span className="text-[10px] text-text-muted font-mono">{t('vault.uploadJson')}</span>
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
                {t('vault.counts', { prs: prs.length, workouts: workouts.length, metrics: bodyMetrics.length })}
              </p>
            </div>

            {/* CSV Workout Importer (Strong / Hevy / FitNotes) */}
            <div className="space-y-2 p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span className="text-2xs font-mono uppercase font-bold text-text-primary">
                    {t('vault.csvTitle')}
                  </span>
                </div>
                <span className="text-3xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold font-mono">
                  Strong / Hevy / FitNotes
                </span>
              </div>
              <p className="text-2xs text-text-secondary leading-relaxed">
                {t('vault.csvDesc')}
              </p>
              <button
                type="button"
                onClick={() => csvFileInputRef.current?.click()}
                className="btn-secondary w-full py-2 px-3 text-xs font-semibold flex items-center justify-center gap-2 hover:border-emerald-500/40 hover:text-emerald-400"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('vault.uploadCsv')}</span>
              </button>
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleCSVFileChange}
                className="hidden"
              />
            </div>

            {/* Privacy Guarantee */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-secondary/40 border border-border/40 text-2xs text-text-muted font-mono">
              <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>{t('vault.privacyGuarantee')}</span>
            </div>

            {/* Reset / Delete Danger Area */}
            <div className="pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 px-3 rounded-lg border border-rose-500/30 text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('vault.deleteReset')}</span>
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full text-center font-semibold text-sm"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  );
}
