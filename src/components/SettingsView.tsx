'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Download,
  Upload,
  RefreshCw,
  LogOut,
  Trash2,
  Lock,
  Moon,
  Sun,
  Laptop,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import { exportFullBackupJSON, importFullBackupJSON } from '@/lib/storage';
import { buildCombinedCsvExport } from '@/lib/csv-export';
import type { DietPreference } from '@/lib/types';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useAppNavigation } from '@/lib/navigation';
import { getTelemetryConsent, setTelemetryConsent, TelemetryConsent, TELEMETRY_CONSENT_EVENT } from '@/lib/telemetry';
import ConfirmationModal from '@/components/ConfirmationModal';
import AuthModal from '@/components/AuthModal';
import WeeklyScheduleModal from '@/components/WeeklyScheduleModal';
import LanguagePicker from '@/components/ui/LanguagePicker';
import PermissionHelp from '@/components/ui/PermissionHelp';
import { useTranslation } from '@/lib/i18n';
import {
  isHealthConnectAvailable,
  isHealthConnectSupported,
  openHealthConnectSettings,
  requestHealthAuthorization,
} from '@/lib/health-connect';
import { syncHealthConnectIfEnabled } from '@/lib/health-sync';
import { isNativeApp } from '@/lib/app-settings';

function SettingsToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer relative ${on ? 'bg-accent' : 'bg-border'}`}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export interface SettingsViewProps {
  onBack?: () => void;
  onNavigate?: (tab: 'home' | 'workout' | 'progress' | 'meals' | 'prs' | 'profile' | 'settings') => void;
  isModal?: boolean;
}

export default function SettingsView({ onBack, onNavigate, isModal = false }: SettingsViewProps) {
  const storeProfile = useStore((state) => state.profile);
  const profile = storeProfile ?? useStore.getState().profile;
  const setProfile = useStore((state) => state.setProfile);
  const userMode = useStore((state) => state.userMode) || 'beginner';
  const setUserMode = useStore((state) => state.setUserMode);
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const resetThemeToSystem = useStore((state) => state.resetThemeToSystem);
  const hasCustomTheme = useStore((state) => state.hasCustomTheme);
  const logout = useStore((state) => state.logout);
  const importAllData = useStore((state) => state.importAllData);
  const uiPreferences = useStore((state) => state.uiPreferences);
  const setUiPreferences = useStore((state) => state.setUiPreferences);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts);
  const toast = useToast();
  const { t } = useTranslation();

  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloud Sync
  const {
    status: syncStatus,
    lastSyncedAt,
    syncNow,
    user,
    signOut,
    deleteAccount,
  } = useSupabaseSync();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Health Connect (Android only — the whole block renders only where
  // the capability exists; web/PWA never sees dead UI).
  const healthSupported = isHealthConnectSupported();
  const healthConnectLastSyncedAt = useStore((state) => state.healthConnectLastSyncedAt);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'connecting' | 'denied' | 'unavailable'>('idle');

  const handleHealthConnectToggle = async () => {
    if (uiPreferences.healthConnectEnabled === true) {
      setUiPreferences({ healthConnectEnabled: false });
      setHealthStatus('idle');
      toast.info('Health Connect sync is off. Data already imported stays in your metrics.', 'Health Connect');
      return;
    }
    setHealthStatus('connecting');
    const available = await isHealthConnectAvailable();
    if (!available) {
      setHealthStatus('unavailable');
      return;
    }
    const auth = await requestHealthAuthorization();
    if (auth === 'granted') {
      setUiPreferences({ healthConnectEnabled: true });
      setHealthStatus('idle');
      const outcome = await syncHealthConnectIfEnabled();
      toast.success(
        outcome === 'synced'
          ? 'Health Connect is syncing steps, sleep and weight.'
          : 'Health Connect connected. Your latest data will appear shortly.',
        'Health Connect'
      );
    } else if (auth === 'denied') {
      // Same denied-permission pattern as everywhere else (Item 0):
      // purpose line + button into Health Connect's own settings.
      setHealthStatus('denied');
    } else {
      setHealthStatus('idle');
      toast.error('Could not connect to Health Connect on this device.', 'Health Connect');
    }
  };
  const [telemetryConsent, setTelemetryConsentState] = useState<TelemetryConsent>(null);

  useEffect(() => {
    setTelemetryConsentState(getTelemetryConsent());
    const handler = () => setTelemetryConsentState(getTelemetryConsent());
    window.addEventListener(TELEMETRY_CONSENT_EVENT, handler);
    return () => window.removeEventListener(TELEMETRY_CONSENT_EVENT, handler);
  }, []);

  // Back button handling
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else if (canGoBack) {
      goBack();
    } else if (onNavigate) {
      onNavigate('profile');
    }
  }, [onBack, canGoBack, goBack, onNavigate]);

  // Register a system-back handler only in modal mode (onBack provided), where
  // it safely closes the modal. In full-page mode the navigation stack already
  // handles back; registering handleBack here would recurse
  // (handleBack -> goBack -> runBackHandlers -> handleBack ...).
  useEffect(() => {
    if (!onBack) return;
    return registerBackHandler(() => {
      handleBack();
      return true;
    }, 50);
  }, [registerBackHandler, handleBack, onBack]);

  // Close the schedule modal on system back while it is open.
  useEffect(() => {
    if (isScheduleModalOpen) {
      return registerBackHandler(() => {
        setIsScheduleModalOpen(false);
        return true;
      }, 100);
    }
  }, [isScheduleModalOpen, registerBackHandler]);

  // Sync action
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncNow();
      toast.success('Sync completed successfully!', 'Cloud Synchronized');
    } catch {
      toast.error('Could not sync with cloud.', 'Sync Error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    try {
      const jsonStr = exportFullBackupJSON();
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
      toast.success('Downloaded full JSON backup! Keep it safe.', 'Backup Saved');
    } catch {
      toast.error('Failed to export backup.', 'Export Error');
    }
  };

  // Export CSV (workouts + meals + body metrics in one file, same
  // download mechanism as the JSON backup so it works in the WebView).
  const handleExportCsv = () => {
    try {
      const state = useStore.getState();
      const csv = buildCombinedCsvExport({
        workouts: state.workouts || [],
        meals: state.meals || [],
        bodyMetrics: state.bodyMetrics || [],
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `ascend_export_${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Downloaded CSV export — workouts, meals and body metrics.', 'CSV Exported');
    } catch {
      toast.error('Failed to export CSV.', 'Export Error');
    }
  };

  // Restore JSON Backup
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const success = importAllData(parsed);
        importFullBackupJSON(content);
        if (success) {
          toast.success('Restored all PRs, workouts, meals & settings successfully!', 'Data Restored');
        } else {
          toast.error('Invalid backup file structure.', 'Restore Failed');
        }
      } catch {
        toast.error('Could not parse backup file.', 'Parse Failure');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Sign out confirmation
  const handleExecuteSignOut = async () => {
    setShowLogoutConfirm(false);
    try {
      await signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    logout({ clearLocalData: false });
    toast.info('Signed out. Data preserved on this device.', 'Signed Out');
    if (onNavigate) onNavigate('home');
  };

  // Delete account confirmation
  const handleExecuteDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAccount();
      if (result.success) {
        setShowDeleteConfirm(false);
        toast.success('Account and data permanently deleted.', 'Account Eradicated');
        if (onNavigate) onNavigate('home');
      } else {
        toast.info(result.error || 'Local data purged.', 'Data Purged');
        setShowDeleteConfirm(false);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete account.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page animate-fade-in space-y-5 pb-24 max-w-md mx-auto px-5 pt-3">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 min-h-[44px] min-w-[44px] -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5 text-accent" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans text-text-primary tracking-tight">
            {t('settings.title')}
          </h1>
        </div>
      </header>

      {/* ── SECTION 1: ACCOUNT & CLOUD SYNC ─────────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          Account &amp; Security
        </span>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-bold text-text-primary font-sans block">
                {user?.email || profile?.name || 'Local Guest Athlete'}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    syncStatus === 'synced'
                      ? 'bg-sage'
                      : syncStatus === 'syncing'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-text-muted'
                  }`}
                />
                <span className="text-2xs font-mono text-text-muted">
                  {user
                    ? syncStatus === 'synced'
                      ? 'Cloud Synced'
                      : syncStatus === 'syncing'
                      ? 'Syncing...'
                      : 'Sync Idle'
                    : 'Local Device Only'}
                </span>
              </div>
            </div>

            {user ? (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="p-2.5 rounded-xl bg-bg-secondary hover:bg-bg-tertiary border border-border text-text-secondary hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                title="Sync Now"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-accent' : ''}`} />
                <span>Sync</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="py-1.5 px-3 rounded-xl bg-accent hover:bg-accent-dim text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>

          {user && (
            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <span className="text-xs text-text-muted">Cloud Account</span>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 2: APP PREFERENCES ───────────────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          App Preferences
        </span>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
          {/* Appearance / Theme */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">Appearance</span>
              <span className="text-2xs font-mono text-text-muted capitalize">
                {hasCustomTheme ? (theme === 'dark' ? 'Graphite Dark' : 'Chalk Light') : 'System Default'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  hasCustomTheme && theme === 'light'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Chalk</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  hasCustomTheme && theme === 'dark'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Graphite</span>
              </button>
              <button
                type="button"
                onClick={() => resetThemeToSystem()}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  !hasCustomTheme
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Unit Preference */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">Units of Measure</span>
              <span className="text-2xs font-mono text-text-muted uppercase">{profile?.unit || 'lbs'}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border">
              <button
                type="button"
                onClick={() => {
                  if (profile) setProfile({ ...profile, unit: 'lbs' });
                  toast.info('Units switched to Pounds & Inches', 'Units Updated');
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  profile?.unit === 'lbs'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                LBS / INCHES
              </button>
              <button
                type="button"
                onClick={() => {
                  if (profile) setProfile({ ...profile, unit: 'kg' });
                  toast.info('Units switched to Kilograms & Centimeters', 'Units Updated');
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  profile?.unit === 'kg'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                KG / CENTIMETERS
              </button>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2 pt-1">
            <div>
              <span className="text-xs font-bold text-text-primary block">{t('settings.language')}</span>
              <span className="text-3xs text-text-muted block mt-0.5">
                {t('settings.languageHint')}
              </span>
            </div>
            <LanguagePicker />
          </div>

          {/* Diet Preference */}
          <div className="space-y-2 pt-1">
            <div>
              <span className="text-xs font-bold text-text-primary block">{t('settings.dietPreference')}</span>
              <span className="text-3xs text-text-muted block mt-0.5">
                Used by the protein coach for suggestions that fit how you eat.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'vegetarian', label: 'Vegetarian' },
                  { id: 'eggitarian', label: 'Eggetarian' },
                  { id: 'non_vegetarian', label: 'Non-Vegetarian' },
                  { id: 'vegan', label: 'Vegan' },
                ] as { id: DietPreference; label: string }[]
              ).map((opt) => {
                const active = (profile?.dietPreference || 'non_vegetarian') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (!profile) return;
                      setProfile({ ...profile, dietPreference: opt.id });
                      toast.success(`Diet preference set to ${opt.label}.`, 'Preferences');
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-left ${
                      active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-bg-secondary text-text-primary hover:border-text-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Experience Mode */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">Athlete Experience</span>
              <span className="text-2xs font-mono text-text-muted capitalize">{userMode}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border">
              {(['beginner', 'intermediate', 'advanced'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setUserMode(m);
                    toast.info(`Experience mode calibrated to ${m}`, 'Mode Updated');
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                    userMode === m
                      ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2b: CUSTOMIZATION ──────────────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          {t('settings.customization')}
        </span>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
          {/* Weekly workout target */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.weeklyWorkoutTarget')}</span>
              <span className="text-2xs font-mono text-text-muted">
                {uiPreferences.weeklyTargetDays === null
                  ? 'AUTO'
                  : uiPreferences.weeklyTargetDays === 0
                  ? 'OFF'
                  : `${uiPreferences.weeklyTargetDays} DAYS`}
              </span>
            </div>
            <p className="text-3xs text-text-muted leading-relaxed">
              How many workouts per week Home counts toward. Auto follows your schedule; Off just counts — no target, no pressure.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Auto', value: null as number | null },
                { label: 'Off', value: 0 as number | null },
                { label: '2', value: 2 as number | null },
                { label: '3', value: 3 as number | null },
                { label: '4', value: 4 as number | null },
                { label: '5', value: 5 as number | null },
                { label: '6', value: 6 as number | null },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setUiPreferences({ weeklyTargetDays: opt.value })}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    uiPreferences.weeklyTargetDays === opt.value
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-muted border-border hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly schedule editor */}
          <div className="pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(true)}
              className="w-full flex items-center justify-between cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-text-primary">Weekly schedule</p>
                  <p className="text-3xs text-text-muted">Set any day to a plan or rest — or clear the week entirely</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Gamification toggle */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">{t('settings.gamification')}</p>
              <p className="text-3xs text-text-muted leading-relaxed">XP, levels, streaks and monthly challenges on Home</p>
            </div>
            <SettingsToggle
              label="Toggle gamification"
              on={uiPreferences.gamificationEnabled}
              onToggle={() => setUiPreferences({ gamificationEnabled: !uiPreferences.gamificationEnabled })}
            />
          </div>

          {/* Coach toggle */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">{t('settings.coach')}</p>
              <p className="text-3xs text-text-muted leading-relaxed">Check-in cards, calorie suggestions and the readiness score on Home, plus the post-workout Coach&apos;s Take</p>
            </div>
            <SettingsToggle
              label="Toggle coach"
              on={uiPreferences.coachEnabled}
              onToggle={() => setUiPreferences({ coachEnabled: !uiPreferences.coachEnabled })}
            />
          </div>

          {/* Habit matrix toggle */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">Habit matrix on Home</p>
              <p className="text-3xs text-text-muted leading-relaxed">The one-week Gym / Water / Creatine / Protein grid</p>
            </div>
            <SettingsToggle
              label="Toggle habit matrix on Home"
              on={uiPreferences.showHabitMatrix}
              onToggle={() => setUiPreferences({ showHabitMatrix: !uiPreferences.showHabitMatrix })}
            />
          </div>

          {/* Muscle volume toggle (Progress) */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">{t('progress.muscleVolume')}</p>
              <p className="text-3xs text-text-muted leading-relaxed">Per-muscle weekly sets and the recovery map on Progress</p>
            </div>
            <SettingsToggle
              label="Toggle muscle volume on Progress"
              on={uiPreferences.showMuscleVolume !== false}
              onToggle={() => setUiPreferences({ showMuscleVolume: uiPreferences.showMuscleVolume === false })}
            />
          </div>

          {/* Health Connect sync (Android only — absent elsewhere) */}
          {healthSupported && (
            <div className="pt-3 border-t border-border/60 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-text-primary">{t('health.title')}</p>
                  <p className="text-3xs text-text-muted leading-relaxed">{t('health.hint')}</p>
                </div>
                <SettingsToggle
                  label="Toggle Health Connect sync"
                  on={uiPreferences.healthConnectEnabled === true}
                  onToggle={handleHealthConnectToggle}
                />
              </div>
              {uiPreferences.healthConnectEnabled === true && (
                <p className="text-3xs text-text-muted">
                  {healthConnectLastSyncedAt
                    ? t('health.lastSynced', {
                        time: new Date(healthConnectLastSyncedAt).toLocaleString(),
                      })
                    : t('health.neverSynced')}
                </p>
              )}
              {healthStatus === 'connecting' && (
                <p className="text-3xs text-text-muted">Opening Health Connect…</p>
              )}
              {healthStatus === 'unavailable' && (
                <p className="text-3xs text-amber-300 leading-relaxed">{t('health.unavailable')}</p>
              )}
              {healthStatus === 'denied' && (
                <PermissionHelp
                  permission="health"
                  isNative
                  onOpenSettings={openHealthConnectSettings}
                  onRetry={handleHealthConnectToggle}
                />
              )}
            </div>
          )}

          {/* Offline food scan — native app only; the row simply does
              not exist on web/PWA. Off restores the server-AI flow. */}
          {isNativeApp() && (
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
              <div>
                <p className="text-xs font-bold text-text-primary">
                  {t('settings.offlineScan')}
                </p>
                <p className="text-3xs text-text-muted leading-relaxed">
                  {t('settings.offlineScanHint')}
                </p>
              </div>
              <SettingsToggle
                label="Toggle offline food scan"
                on={uiPreferences.offlineScan !== false}
                onToggle={() =>
                  setUiPreferences({ offlineScan: uiPreferences.offlineScan === false })
                }
              />
            </div>
          )}
        </div>
      </div>

      {isScheduleModalOpen && (
        <WeeklyScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          plannedWorkouts={plannedWorkouts}
        />
      )}

      {/* ── SECTION 3: DATA & PRIVACY ────────────────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          Data, Privacy &amp; Legal
        </span>
        <div className="card p-2 sm:p-3 bg-bg-card border border-border rounded-2xl shadow-xs divide-y divide-border/60">
          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportBackup}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Export JSON Backup</p>
                <p className="text-3xs text-text-muted">Download all workouts, PRs, and meals</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.exportCsv')}</p>
                <p className="text-3xs text-text-muted">{t('settings.exportCsvHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Import JSON */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
            aria-label="Import backup file"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Import Backup File</p>
                <p className="text-3xs text-text-muted">Restore data from an exported backup</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleRestoreFile}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

          {/* Privacy Policy */}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Privacy Policy</p>
                <p className="text-3xs text-text-muted">How your biometric data is protected</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          {/* Terms of Service */}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Terms of Service</p>
                <p className="text-3xs text-text-muted">ASCEND athletic platform usage terms</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          {/* Health & Safety Disclaimer */}
          <a
            href="/disclaimer"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Health &amp; Safety Disclaimer</p>
                <p className="text-3xs text-text-muted">Fitness guidance is not medical advice</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          {/* Account & Data Deletion portal (web-accessible, Play requirement) */}
          <a
            href="/delete-account"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Delete My Data (Web)</p>
                <p className="text-3xs text-text-muted">Request deletion without the app installed</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          <p className="px-3 pt-1 text-3xs text-text-muted leading-relaxed">
            ASCEND provides fitness tracking and general training guidance — it is not medical
            advice. Consult a qualified healthcare professional before starting a new exercise
            or nutrition program.
          </p>

          {/* Anonymous Telemetry */}
          <div className="w-full p-3 flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <p className="text-xs font-bold text-text-primary">Anonymous Diagnostics</p>
              <p className="text-3xs text-text-muted">Share non-identifying crash and error reports</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next: 'accepted' | 'declined' = telemetryConsent === 'accepted' ? 'declined' : 'accepted';
                setTelemetryConsent(next);
                setTelemetryConsentState(next);
                toast.info(
                  next === 'accepted' ? 'Diagnostics reporting enabled' : 'Diagnostics reporting disabled',
                  'Privacy Updated'
                );
              }}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                telemetryConsent === 'accepted' ? 'bg-accent' : 'bg-bg-secondary border border-border'
              }`}
              aria-label="Toggle Diagnostics"
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                  telemetryConsent === 'accepted' ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Delete Account (Danger Action) */}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-accent/10 rounded-xl transition-colors cursor-pointer text-left text-accent"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-accent">Delete Account</p>
                <p className="text-3xs text-text-muted">Permanently erase account and all local data</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-accent" />
          </button>
        </div>
      </div>

      {/* ── Screen 24: Confirmation Modals ──────────────────────────────────── */}
      {/* Sign Out Modal */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleExecuteSignOut}
        title="Sign Out of ASCEND?"
        message={
          user
            ? "Your account stays intact — your workout data, personal records, and meals remain safely preserved and synced."
            : "Signing out clears your profile from this device. Your sessions, PRs, meals, plans and targets stay saved on this device and return when you set up your profile again."
        }
        confirmText="Sign Out"
        cancelText="Cancel"
        variant="default"
        icon="logout"
      />

      {/* Delete Account Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleExecuteDeleteAccount}
        title="Delete Account Permanently?"
        message="This action cannot be undone. All your workout history, personal records, custom routines, and nutrition logs will be permanently eradicated from this device and our servers."
        confirmText="Delete Account"
        cancelText="Cancel"
        variant="danger"
        icon="trash"
        requireTypedConfirmation="DELETE"
        isLoading={isDeleting}
      />

      {/* Auth Modal for guest sign-in */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}
